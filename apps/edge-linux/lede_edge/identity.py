"""Identidade do box para o auto-registro.

``hardware_id`` precisa ser estável e único por aparelho, mesmo com a mesma
imagem de SD gravada em vários boxes — por isso NÃO usamos /etc/machine-id
(clonado junto com a imagem). Ordem de preferência:

1. SID do SoC Allwinner (``/sys/bus/nvmem/devices/sunxi-sid0``) — gravado no chip;
2. ``/proc/device-tree/serial-number``;
3. MAC da Ethernet onboard.

O segredo de registro é gerado uma vez e fica em ``registration.json`` no
state_dir (sobrevive a re-pareamento; só some se o estado for apagado).
"""

from __future__ import annotations

import hashlib
import secrets
import socket
from pathlib import Path

from .store import atomic_write_json, read_json

SID_PATH = Path("/sys/bus/nvmem/devices/sunxi-sid0/nvmem")
SERIAL_PATH = Path("/proc/device-tree/serial-number")
MODEL_PATH = Path("/proc/device-tree/model")


def _sid() -> str | None:
    try:
        raw = SID_PATH.read_bytes()[:16]
    except OSError:
        return None
    if not raw or not any(raw):
        return None
    return "sid-" + raw.hex()


def _serial() -> str | None:
    try:
        value = SERIAL_PATH.read_bytes().rstrip(b"\0").decode().strip()
    except (OSError, UnicodeDecodeError):
        return None
    return f"sn-{value}" if len(value) >= 8 else None


def primary_mac() -> str | None:
    for name in ("end0", "eth0"):
        try:
            mac = Path(f"/sys/class/net/{name}/address").read_text().strip()
        except OSError:
            continue
        if mac and mac != "00:00:00:00:00:00":
            return mac
    return None


def hardware_id() -> str:
    for candidate in (_sid(), _serial()):
        if candidate:
            return candidate
    mac = primary_mac()
    if mac:
        return "mac-" + mac.replace(":", "")
    # Último recurso: hostname (não deveria acontecer no SB3000)
    return "host-" + socket.gethostname()


def model() -> str | None:
    try:
        return MODEL_PATH.read_bytes().rstrip(b"\0").decode().strip() or None
    except (OSError, UnicodeDecodeError):
        return None


def registration_secret(state_dir: Path) -> str:
    path = state_dir / "registration.json"
    data = read_json(path, {}) or {}
    secret = data.get("secret")
    if not isinstance(secret, str) or len(secret) < 32:
        secret = secrets.token_hex(32)
        atomic_write_json(path, {"secret": secret})
    return secret


# Mesmo alfabeto/algoritmo de registrationCode() na API (device-registrations.service.ts):
# o box mostra o código na TV mesmo sem rede, e ele bate com o do Cloud.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def registration_code(hw_id: str) -> str:
    digest = hashlib.sha256(hw_id.encode()).digest()
    return "".join(CODE_ALPHABET[b % len(CODE_ALPHABET)] for b in digest[:6])
