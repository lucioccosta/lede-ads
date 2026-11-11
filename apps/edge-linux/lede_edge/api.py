"""Cliente HTTP da API Edge (equivalente a EdgeApi.kt). Só stdlib."""

from __future__ import annotations

import json
import mimetypes
import secrets
import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import Config

TIMEOUT = 20


class DeviceUnauthorized(Exception):
    """API respondeu 401 — token inválido/re-pareado no Cloud."""


class ApiError(Exception):
    pass


@dataclass
class RemoteCommand:
    id: str
    type: str
    payload: dict[str, Any] | None = None


@dataclass
class HeartbeatResult:
    commands: list[RemoteCommand] = field(default_factory=list)
    timezone: str | None = None


class EdgeApi:
    def __init__(self, config: Config):
        self.base = config.api_base_url
        self.user_agent = f"LEDE-Edge-Linux/{config.version}"

    # ---------- baixo nível ----------

    def _request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        body: Any = None,
        raw: bytes | None = None,
        content_type: str | None = None,
        timeout: int = TIMEOUT,
    ) -> Any:
        url = path if path.startswith("http") else f"{self.base}{path}"
        data = raw
        headers = {"User-Agent": self.user_agent, "Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json; charset=utf-8"
        elif content_type:
            headers["Content-Type"] = content_type
        if token:
            headers["x-device-token"] = token

        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                text = res.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as err:
            text = err.read().decode("utf-8", "replace")
            if err.code == 401 and token:
                raise DeviceUnauthorized() from err
            raise ApiError(_error_message(text) or f"HTTP {err.code} em {path}") from err
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            raise ApiError(f"Falha de rede em {path}: {err}") from err

        if not text.strip():
            return None
        return json.loads(text)

    # ---------- endpoints ----------

    def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Auto-registro: o box se apresenta; a LEDE aceita/recusa no Cloud."""
        return self._request("POST", "/edge/register", body=payload) or {}

    def register_status(self, hardware_id: str, secret: str) -> dict[str, Any]:
        url = f"{self.base}/edge/register/status"
        req_headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/json",
            "x-hardware-id": hardware_id,
            "x-registration-secret": secret,
        }
        req = urllib.request.Request(url, headers=req_headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                text = res.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as err:
            text = err.read().decode("utf-8", "replace")
            raise ApiError(_error_message(text) or f"HTTP {err.code}") from err
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            raise ApiError(f"Falha de rede: {err}") from err
        return json.loads(text) if text.strip() else {}

    def sync(self, token: str) -> dict[str, Any]:
        return self._request("GET", "/edge/sync", token=token)

    def heartbeat(self, token: str, payload: dict[str, Any]) -> HeartbeatResult:
        obj = self._request("POST", "/edge/heartbeat", token=token, body=payload) or {}
        commands = [
            RemoteCommand(id=c["id"], type=c["type"], payload=c.get("payload"))
            for c in obj.get("commands") or []
        ]
        tz = (obj.get("timezone") or "").strip() or None
        return HeartbeatResult(commands=commands, timezone=tz)

    def ack_command(self, token: str, command_id: str, status: str, error: str | None = None):
        body: dict[str, Any] = {"status": status}
        if error:
            body["error"] = error[:500]
        self._request("POST", f"/edge/commands/{command_id}/ack", token=token, body=body)

    def proof_of_play(self, token: str, event: dict[str, Any]):
        self._request("POST", "/edge/proof-of-play", token=token, body=event)

    def ticker(self, token: str) -> dict[str, Any]:
        return self._request("GET", "/edge/ticker", token=token) or {}

    def upload_screenshot(self, token: str, file: Path):
        boundary = f"----lede{secrets.token_hex(12)}"
        mime = mimetypes.guess_type(file.name)[0] or "image/png"
        head = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{file.name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
        tail = f"\r\n--{boundary}--\r\n".encode()
        self._request(
            "POST",
            "/edge/screenshot-upload",
            token=token,
            raw=head + file.read_bytes() + tail,
            content_type=f"multipart/form-data; boundary={boundary}",
            timeout=60,
        )

    # ---------- download ----------

    def download(self, url: str, dest: Path, *, token: str | None = None, timeout: int = 180):
        """Baixa para ``dest.part`` e renomeia atomicamente."""
        tmp = dest.with_name(dest.name + ".part")
        headers = {"User-Agent": self.user_agent}
        if token:
            headers["x-device-token"] = token
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res, tmp.open("wb") as out:
                shutil.copyfileobj(res, out, length=256 * 1024)
        except urllib.error.HTTPError as err:
            tmp.unlink(missing_ok=True)
            raise ApiError(f"Download falhou (HTTP {err.code}) {url}") from err
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            tmp.unlink(missing_ok=True)
            raise ApiError(f"Download falhou {url}: {err}") from err
        tmp.replace(dest)


def _error_message(text: str) -> str | None:
    try:
        body = json.loads(text)
    except ValueError:
        return text.strip()[:300] or None
    msg = body.get("message") if isinstance(body, dict) else None
    if isinstance(msg, list):
        return ", ".join(map(str, msg))
    return str(msg) if msg else None
