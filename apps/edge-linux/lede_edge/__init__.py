"""LEDE Edge para Linux (Arch Linux ARM no SD do SB3000).

Mesmo protocolo do Edge Android: pair, sync, heartbeat/comandos, PoP,
ticker, screenshot e OTA — com flavor ``linux`` (target ``sb3000-linux``).
"""

from pathlib import Path


def _read_version() -> str:
    # VERSION fica na raiz do release (/opt/lede-edge/releases/vX.Y.Z/VERSION)
    for candidate in (
        Path(__file__).resolve().parent.parent / "VERSION",
        Path(__file__).resolve().parent / "VERSION",
    ):
        try:
            return candidate.read_text().strip()
        except OSError:
            continue
    return "0.0.0-dev"


__version__ = _read_version()
