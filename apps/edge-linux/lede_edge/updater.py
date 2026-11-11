"""OTA do Edge Linux (equivalente a ApkUpdateInstaller.kt).

Layout em disco::

    /opt/lede-edge/releases/0.6.0/   ← cada versão extraída (VERSION na raiz)
    /opt/lede-edge/current  → releases/0.6.0
    /opt/lede-edge/previous → releases/0.5.0
    /var/lib/lede-edge/ota/pending.json   {"from", "to"}  (+ ota/attempts do lançador)

Fluxo do comando ``update``:
  1. baixa ``lede-edge-sb3000-linux-vX.Y.Z.tar.zst`` (URL do Cloud);
  2. extrai em ``releases/X.Y.Z.tmp`` (filtro ``data`` — sem path traversal);
  3. confere VERSION == versionName do comando;
  4. troca ``current`` atomicamente e grava ``pending.json``;
  5. ACK ``done`` e encerra — o systemd reinicia já na versão nova.

O lançador (``/usr/lib/lede-edge/launch``, da imagem, fora da OTA) incrementa
``ota/attempts`` a cada start e volta para ``previous`` se a versão nova não
confirmar saúde em 3 tentativas. A confirmação é :func:`confirm_healthy`,
chamada após o primeiro heartbeat+sync bem-sucedidos.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

from .api import EdgeApi
from .config import Config
from .store import atomic_write_json, read_json

log = logging.getLogger(__name__)

KEEP_RELEASES = 3


class UpdateError(Exception):
    pass


def _version_core(raw: str) -> str:
    return raw.strip().lstrip("v").split("-")[0]


class Updater:
    def __init__(self, config: Config, api: EdgeApi):
        self.config = config
        self.api = api
        self.root = config.install_root
        self.releases = self.root / "releases"
        self.pending_file = config.ota_dir / "pending.json"

    # ---------- estado ----------

    def current_version(self) -> str:
        return self.config.version

    def is_target_version(self, version_name: str) -> bool:
        return bool(version_name) and _version_core(version_name) == _version_core(
            self.current_version()
        )

    def confirm_healthy(self):
        """Versão atual está saudável: limpa pending e poda releases antigos."""
        pending = read_json(self.pending_file)
        if pending and _version_core(pending.get("to", "")) == _version_core(
            self.current_version()
        ):
            log.info("OTA %s confirmada saudável", pending.get("to"))
            self.pending_file.unlink(missing_ok=True)
            (self.config.ota_dir / "attempts").unlink(missing_ok=True)
        self._prune()

    # ---------- instalação ----------

    def install(self, url: str, version_name: str, token: str | None) -> str:
        if not url:
            raise UpdateError("URL do pacote ausente")
        version = _version_core(version_name) if version_name else ""

        self.config.ota_dir.mkdir(parents=True, exist_ok=True)
        archive = self.config.ota_dir / "update.tar.zst"
        archive.unlink(missing_ok=True)
        log.info("Baixando OTA %s de %s", version or "?", url)
        self.api.download(url, archive, token=token, timeout=600)
        if archive.stat().st_size < 64:  # nem cabeçalho zstd; validação real é a extração
            raise UpdateError("Pacote inválido (vazio)")

        self.releases.mkdir(parents=True, exist_ok=True)
        staging = self.releases / f"{version or 'incoming'}.tmp"
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        try:
            self._extract(archive, staging)
            packaged = _version_core((staging / "VERSION").read_text())
        except Exception as err:
            shutil.rmtree(staging, ignore_errors=True)
            raise UpdateError(f"Falha ao extrair pacote: {err}") from err
        finally:
            archive.unlink(missing_ok=True)

        if version and packaged != version:
            shutil.rmtree(staging, ignore_errors=True)
            raise UpdateError(f"Pacote contém v{packaged}, esperado v{version}")
        if not (staging / "lede_edge" / "__main__.py").is_file():
            shutil.rmtree(staging, ignore_errors=True)
            raise UpdateError("Pacote sem lede_edge/__main__.py")

        # Bytecode pré-compilado: o launcher roda com PYTHONDONTWRITEBYTECODE
        import compileall

        compileall.compile_dir(str(staging / "lede_edge"), quiet=1)

        final = self.releases / packaged
        if final.exists():
            # Reinstalação da mesma versão (ex.: release corrompido) — troca
            shutil.rmtree(final)
        staging.rename(final)

        previous_target = self._resolve(self.root / "current")
        if previous_target and previous_target != final:
            self._swap_link(self.root / "previous", previous_target)
        self._swap_link(self.root / "current", final)
        # Contador de tentativas é do lançador (arquivo separado, texto puro)
        (self.config.ota_dir / "attempts").unlink(missing_ok=True)
        atomic_write_json(
            self.pending_file,
            {"from": self.current_version(), "to": packaged},
        )
        _sync_fs()
        log.info("OTA v%s instalada — reiniciando serviço", packaged)
        return packaged

    def _extract(self, archive: Path, dest: Path):
        try:
            with tarfile.open(archive, "r:zst") as tar:
                tar.extractall(dest, filter="data")
            return
        except (tarfile.CompressionError, tarfile.ReadError, ValueError) as err:
            log.info("tarfile sem zstd (%s) — usando tar do sistema", err)
        subprocess.run(
            ["tar", "--zstd", "-xf", str(archive), "-C", str(dest), "--no-same-owner"],
            check=True,
            capture_output=True,
        )
        # Mesma garantia do filter="data": nada fora de dest
        root = dest.resolve()
        for p in dest.rglob("*"):
            if p.is_symlink() and not p.resolve().is_relative_to(root):
                raise UpdateError(f"Symlink fora do pacote: {p}")

    @staticmethod
    def _resolve(link: Path) -> Path | None:
        try:
            return link.resolve(strict=True)
        except OSError:
            return None

    @staticmethod
    def _swap_link(link: Path, target: Path):
        tmp = link.with_name(link.name + ".new")
        tmp.unlink(missing_ok=True)
        tmp.symlink_to(os.path.relpath(target, link.parent))
        tmp.replace(link)  # rename(2) é atômico

    def _prune(self):
        if not self.releases.is_dir():
            return
        keep = {self._resolve(self.root / n) for n in ("current", "previous")}
        dirs = sorted(
            (d for d in self.releases.iterdir() if d.is_dir()),
            key=lambda d: d.stat().st_mtime,
            reverse=True,
        )
        for d in dirs:
            if d.name.endswith(".tmp"):
                shutil.rmtree(d, ignore_errors=True)
        kept = 0
        for d in dirs:
            if not d.exists():
                continue
            if d.resolve() in keep or kept < KEEP_RELEASES:
                kept += 1
                continue
            shutil.rmtree(d, ignore_errors=True)


def _sync_fs():
    try:
        os.sync()
    except AttributeError:
        pass
