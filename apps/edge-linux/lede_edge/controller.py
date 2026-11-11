"""Lógica do Edge independente de UI (equivalente aos Runnables da PlayerActivity).

Laços em threads (mesmos intervalos do Android):
  heartbeat 30 s · sync 60 s · ticker 60 s · screenshot 120 s

A UI implementa :class:`View` e recebe callbacks já na thread principal
(via ``post``, que a UI injeta — no GTK é ``GLib.idle_add``).
"""

from __future__ import annotations

import logging
import os
import socket
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Protocol

from . import identity, system, telemetry
from .api import ApiError, DeviceUnauthorized, EdgeApi, RemoteCommand
from .config import Config
from .media_cache import MediaCache
from .store import DeviceStore, ManifestStore, ProofOfPlayQueue
from .updater import Updater, UpdateError

log = logging.getLogger(__name__)

HEARTBEAT_S = 30
SYNC_S = 60
TICKER_S = 60
SCREENSHOT_S = 120
SCREENSHOT_FIRST_S = 15
REGISTER_POLL_S = 10        # consulta da decisão no Cloud
REGISTER_REFRESH_S = 300    # reenvia dados (IP, versão) enquanto pendente
REGISTER_RETRY_MIN_S = 5    # sem rede: backoff 5 s → 60 s, tentando para sempre
REGISTER_RETRY_MAX_S = 60
REJECTED_POLL_S = 60        # recusado: espera a LEDE excluir o registro

# Código de saída que o lançador/systemd tratam como "reinicie" (OTA aplicada)
EXIT_RESTART = 0


class View(Protocol):
    def show_pairing(self, code: str) -> None: ...
    def show_registration(self, status: str, code: str | None, message: str | None) -> None: ...
    def show_scenes(self, scenes: list[dict[str, Any]]) -> None: ...
    def show_idle(self, message: str) -> None: ...
    def show_ticker(self, payload: dict[str, Any] | None) -> None: ...
    def set_device_code(self, code: str | None) -> None: ...
    def set_orientation(self, orientation: str) -> None: ...
    def set_clock_timezone(self, tz: str) -> None: ...
    def toast(self, message: str) -> None: ...
    def quit(self, code: int) -> None: ...


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sd_notify(message: str):
    """systemd watchdog/status sem depender de python-systemd."""
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr.startswith("@"):
        addr = "\0" + addr[1:]
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as s:
            s.connect(addr)
            s.sendall(message.encode())
    except OSError:
        pass


class EdgeController:
    def __init__(self, config: Config, post: Callable[[Callable[[], None]], None]):
        self.config = config
        self.post = post  # agenda callable na thread da UI
        self.api = EdgeApi(config)
        self.store = DeviceStore(config.state_dir)
        self.manifests = ManifestStore(config.state_dir)
        self.media = MediaCache(config.media_dir, self.api)
        self.pop_queue = ProofOfPlayQueue(config.state_dir)
        self.updater = Updater(config, self.api)
        self.view: View | None = None

        self._stop = threading.Event()
        self._sync_now = threading.Event()
        self._threads: list[threading.Thread] = []
        self._sync_lock = threading.Lock()
        self._ota_lock = threading.Lock()
        self._healthy = {"heartbeat": False, "sync": False}
        self._registering = threading.Lock()
        self._stop_registration = threading.Event()
        self.offline = False

    # ---------- ciclo de vida ----------

    def attach(self, view: View):
        self.view = view

    def start(self):
        """Chamado pela UI quando a janela está pronta."""
        if not self.store.token:
            code = identity.registration_code(identity.hardware_id())
            self._ui(lambda v: v.show_pairing(code))
            self._start_registration()
            return
        self._ui(lambda v: v.set_orientation(self.store.orientation))
        self._ui(lambda v: v.set_device_code(self.store.get("short_code")))
        tz = self.store.get("cloud_timezone")
        if tz:
            self._apply_timezone(tz)
        self._start_loops()

    def stop(self):
        self._stop.set()
        self._sync_now.set()

    def _start_loops(self):
        if self._threads:
            return
        self._stop.clear()
        for name, target in (
            ("heartbeat", self._heartbeat_loop),
            ("sync", self._sync_loop),
            ("ticker", self._ticker_loop),
            ("screenshot", self._screenshot_loop),
        ):
            t = threading.Thread(target=target, name=name, daemon=True)
            t.start()
            self._threads.append(t)

    def _ui(self, fn: Callable[[View], None]):
        view = self.view
        if view is not None:
            self.post(lambda: fn(view))

    def _sleep(self, seconds: float) -> bool:
        """Dorme; retorna True se deve encerrar."""
        return self._stop.wait(seconds)

    # ---------- auto-registro ----------

    def _start_registration(self):
        """Box sem token se registra sozinho e espera a aprovação no Cloud.

        Roda em paralelo com o pairing manual por código: o que vier primeiro
        grava o token e o laço termina.
        """
        if not self._registering.acquire(blocking=False):
            return  # já rodando
        threading.Thread(target=self._registration_loop, name="register", daemon=True).start()

    def _registration_payload(self, hw_id: str, secret: str) -> dict[str, Any]:
        size = telemetry.CURRENT_SCREEN or telemetry.screen_size()
        payload: dict[str, Any] = {
            "hardwareId": hw_id,
            "secret": secret,
            "hostname": socket.gethostname(),
            "model": identity.model(),
            "macAddress": identity.primary_mac(),
            "ipAddress": telemetry.primary_ipv4(),
            "appVersion": self.config.version,
            "appFlavor": self.config.flavor,
        }
        if self.config.enrollment_key:
            payload["enrollmentKey"] = self.config.enrollment_key
        if size:
            payload["screenWidth"], payload["screenHeight"] = size
        return {k: v for k, v in payload.items() if v is not None}

    def _registration_loop(self):
        try:
            self._registration_run()
        finally:
            self._registering.release()

    def _registration_run(self):
        """Tenta para sempre até o box ser aceito no Cloud.

        Sem rede, DNS fora, API caída ou resposta inesperada: nada encerra o
        laço — espera com backoff (5 s → 60 s) e tenta de novo. Volta ao ritmo
        normal assim que o Cloud responde.
        """
        hw_id: str | None = None
        secret: str | None = None
        last_register = 0.0
        status = "unknown"
        backoff = REGISTER_RETRY_MIN_S
        while not self.store.token and not self._stop_registration.is_set():
            try:
                if hw_id is None or secret is None:
                    hw_id = identity.hardware_id()
                    secret = identity.registration_secret(self.config.state_dir)
                if status == "unknown" or time.monotonic() - last_register > REGISTER_REFRESH_S:
                    res = self.api.register(self._registration_payload(hw_id, secret))
                    last_register = time.monotonic()
                    status = res.get("status", "pending")
                    self._ui(
                        lambda v, s=status, c=res.get("code"), r=res.get("reason"):
                        v.show_registration(s, c, r)
                    )
                res = self.api.register_status(hw_id, secret)
                status = res.get("status", "pending")
                if status == "approved":
                    self._apply_approval(res)
                    return
                self._ui(
                    lambda v, s=status, c=res.get("code"), r=res.get("reason"):
                    v.show_registration(s, c, r)
                )
                backoff = REGISTER_RETRY_MIN_S
                wait = REJECTED_POLL_S if status == "rejected" else REGISTER_POLL_S
            except Exception as err:  # noqa: BLE001 — offline nunca encerra o laço
                log.info("Registro: sem resposta do Cloud (%s) — nova tentativa em %ss", err, backoff)
                self._ui(lambda v, e=str(err): v.show_registration("offline", None, e))
                status = "unknown"  # reenvia o registro quando a rede voltar
                wait = backoff
                backoff = min(backoff * 2, REGISTER_RETRY_MAX_S)
            # Acorda cedo se o token chegar por outro caminho
            deadline = time.monotonic() + wait
            while (remaining := deadline - time.monotonic()) > 0:
                if self.store.token or self._stop_registration.is_set():
                    return
                time.sleep(min(0.5, remaining))

    def _apply_approval(self, res: dict[str, Any]):
        if self.store.token:
            return
        log.info("Registro aprovado no Cloud: %s (%s)", res.get("name"), res.get("shortCode"))
        self.store.update(
            device_token=res["deviceToken"],
            device_id=res["deviceId"],
            device_name=res.get("name"),
            short_code=res.get("shortCode") or None,
            orientation=res.get("orientation") or "landscape",
        )
        self._ui(lambda v: v.show_idle("Aprovado — sincronizando…"))
        self.start()
        self._sync_now.set()

    def unpair(self, reason: str):
        """Token inválido (401) ou gesto local de re-parear."""
        log.warning("Voltando ao pairing: %s", reason)
        self._stop.set()
        self._sync_now.set()
        self._threads = []
        # Orientação é a montagem física da TV — sobrevive ao re-pareamento
        orientation = self.store.orientation
        self.store.clear()
        self.store.update(orientation=orientation)
        code = identity.registration_code(identity.hardware_id())
        self._ui(lambda v: v.show_pairing(code))
        self._start_registration()

    # ---------- heartbeat / comandos ----------

    def _heartbeat_loop(self):
        while not self._stop.is_set():
            token = self.store.token
            if not token:
                return
            try:
                payload = telemetry.collect(self.config, self.config.state_dir)
                result = self.api.heartbeat(token, payload)
                sd_notify("WATCHDOG=1")
                self._mark_healthy("heartbeat")
                if result.timezone:
                    self._apply_timezone(result.timezone)
                self.pop_queue.flush(self.api, token)
                for cmd in result.commands:
                    self._handle_command(token, cmd)
            except DeviceUnauthorized:
                self.unpair("heartbeat 401")
                return
            except Exception as err:
                # Offline: o watchdog ainda precisa de sinal de vida do processo
                sd_notify("WATCHDOG=1")
                log.info("Heartbeat falhou: %s", err)
            if self._sleep(HEARTBEAT_S):
                return

    def _ack(self, token: str, cmd: RemoteCommand, status: str, error: str | None = None):
        try:
            self.api.ack_command(token, cmd.id, status, error)
        except Exception as err:
            log.warning("ACK %s (%s) falhou: %s", cmd.type, cmd.id, err)

    def _handle_command(self, token: str, cmd: RemoteCommand):
        log.info("Comando %s (%s)", cmd.type, cmd.id)
        if cmd.type == "resync":
            try:
                self.sync_once()
                self._ack(token, cmd, "done")
            except Exception as err:
                self._ack(token, cmd, "failed", str(err))
        elif cmd.type == "screenshot":
            ok = self.capture_screenshot(force=True)
            self._ack(token, cmd, "done" if ok else "failed", None if ok else "Captura falhou")
        elif cmd.type == "reboot":
            # ACK antes — senão o comando fica pending e o box entra em loop
            self._ack(token, cmd, "done")
            time.sleep(0.5)
            system.reboot()
        elif cmd.type == "update":
            self._handle_update(token, cmd)
        else:
            self._ack(token, cmd, "failed", "Tipo desconhecido")

    def _handle_update(self, token: str, cmd: RemoteCommand):
        payload = cmd.payload or {}
        url = (payload.get("apkUrl") or payload.get("artifactUrl") or "").strip()
        target = (payload.get("versionName") or "").strip()
        if not url:
            self._ack(token, cmd, "failed", "URL do pacote ausente")
            return
        if self.updater.is_target_version(target):
            log.info("Update ignorado — já em %s", self.config.version)
            self._ack(token, cmd, "done")
            return
        if not self._ota_lock.acquire(blocking=False):
            log.warning("OTA já em andamento — ignora %s", cmd.id)
            return
        try:
            self._ui(lambda v: v.toast(f"Baixando atualização {target}…"))
            installed = self.updater.install(url, target, token)
        except (UpdateError, ApiError, OSError) as err:
            log.error("OTA falhou: %s", err)
            self._ack(token, cmd, "failed", str(err))
            self._ota_lock.release()
            return
        self._ack(token, cmd, "done")
        log.info("Reiniciando na v%s", installed)
        self._ui(lambda v: v.quit(EXIT_RESTART))

    # ---------- sync ----------

    def _sync_loop(self):
        while not self._stop.is_set():
            try:
                self.sync_once()
            except DeviceUnauthorized:
                self.unpair("sync 401")
                return
            except Exception as err:
                log.warning("Sync: %s", err)
            self._sync_now.wait(SYNC_S)
            self._sync_now.clear()

    def sync_once(self):
        token = self.store.token
        if not token:
            return
        with self._sync_lock:
            try:
                manifest = self.api.sync(token)
            except DeviceUnauthorized:
                raise
            except Exception as err:
                self._fallback_offline(err)
                return

            if manifest.get("shortCode"):
                self.store.update(short_code=manifest["shortCode"])
                self._ui(lambda v: v.set_device_code(manifest["shortCode"]))
            if manifest.get("deviceName"):
                self.store.update(device_name=manifest["deviceName"])
            if manifest.get("orientation"):
                self.store.update(orientation=manifest["orientation"])
                self._ui(lambda v: v.set_orientation(manifest["orientation"]))
            if manifest.get("timezone"):
                self._apply_timezone(manifest["timezone"])

            self.manifests.save(manifest)
            local = self.media.materialize(manifest)
            self.offline = False
            self._mark_healthy("sync")
            try:
                self.pop_queue.flush(self.api, token)
            except Exception:
                pass
            self._publish(local.get("scenes") or [], "Sem cenas agendadas")

    def _fallback_offline(self, err: Exception):
        log.info("Sync falhou (%s) — usando manifesto em cache", err)
        cached = self.manifests.load()
        if not cached:
            self._ui(lambda v: v.show_idle(str(err) or "Offline / sync falhou"))
            return
        if cached.get("orientation"):
            self._ui(lambda v: v.set_orientation(cached["orientation"]))
        local = self.media.materialize(cached)
        self.offline = True
        self._publish(local.get("scenes") or [], "Offline — sem mídia em cache")

    def _publish(self, scenes: list[dict[str, Any]], empty_message: str):
        if scenes:
            self._ui(lambda v: v.show_scenes(scenes))
        else:
            self._ui(lambda v: v.show_idle(empty_message))

    # ---------- PoP ----------

    def record_play(
        self,
        scene_id: str,
        entries: list[tuple[str, str]],
        started_at: str,
        ended_at: str,
    ):
        """Chamado pela UI no advance de cena: (mediaId, checksum) visíveis."""
        token = self.store.token
        if not token or not entries:
            return
        events = [
            {
                "sceneId": scene_id,
                "mediaId": media_id,
                "startedAt": started_at,
                "endedAt": ended_at,
                "checksum": checksum,
            }
            for media_id, checksum in entries
        ]

        def run():
            failed = []
            for ev in events:
                try:
                    self.api.proof_of_play(token, ev)
                except Exception:
                    failed.append(ev)
            self.pop_queue.enqueue_all(failed)

        threading.Thread(target=run, name="pop", daemon=True).start()

    # ---------- ticker ----------

    def _ticker_loop(self):
        while not self._stop.is_set():
            token = self.store.token
            if not token:
                return
            try:
                payload = self.api.ticker(token)
                if payload.get("shortCode"):
                    self.store.update(short_code=payload["shortCode"])
                    self._ui(lambda v: v.set_device_code(payload["shortCode"]))
                empty = not payload.get("items") and not (payload.get("text") or "").strip()
                self._ui(lambda v: v.show_ticker(None if empty else payload))
            except DeviceUnauthorized:
                self.unpair("ticker 401")
                return
            except Exception as err:
                log.info("Ticker: %s", err)
            if self._sleep(TICKER_S):
                return

    # ---------- screenshot ----------

    def _screenshot_loop(self):
        if self._sleep(SCREENSHOT_FIRST_S):
            return
        while not self._stop.is_set():
            self.capture_screenshot()
            if self._sleep(SCREENSHOT_S):
                return

    def capture_screenshot(self, force: bool = False) -> bool:
        if not force and self.offline:
            return False
        token = self.store.token
        if not token:
            return False
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "screenshot.jpg"
            if not system.screenshot(path):
                return False
            try:
                self.api.upload_screenshot(token, path)
                return True
            except Exception as err:
                log.info("Upload screenshot: %s", err)
                return False

    # ---------- timezone / saúde ----------

    def _apply_timezone(self, tz: str):
        tz = tz.strip()
        if not tz:
            return
        if self.store.get("cloud_timezone") != tz:
            self.store.update(cloud_timezone=tz)
        self._ui(lambda v: v.set_clock_timezone(tz))
        system.set_timezone(tz)

    def _mark_healthy(self, what: str):
        if all(self._healthy.values()):
            return
        self._healthy[what] = True
        if all(self._healthy.values()):
            try:
                self.updater.confirm_healthy()
            except Exception as err:
                log.warning("confirm_healthy: %s", err)
