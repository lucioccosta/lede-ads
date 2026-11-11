"""Configuração do Edge Linux.

Ordem de precedência: variáveis de ambiente > /etc/lede-edge/edge.conf > padrão.
O arquivo de config é do *sistema* (imagem), não do release — sobrevive à OTA.
"""

from __future__ import annotations

import configparser
import os
from dataclasses import dataclass
from pathlib import Path

from . import __version__

CONFIG_FILE = Path(os.environ.get("LEDE_EDGE_CONFIG", "/etc/lede-edge/edge.conf"))

DEFAULT_API = "https://api.lede.tv.br/api"


def _version_code(version: str) -> int:
    """0.5.16 → 516 (mesma ideia do versionCode Android, só para telemetria)."""
    core = version.split("-")[0]
    parts = [int(p) if p.isdigit() else 0 for p in core.split(".")[:3]]
    while len(parts) < 3:
        parts.append(0)
    return parts[0] * 10000 + parts[1] * 100 + parts[2]


@dataclass(frozen=True)
class Config:
    api_base_url: str
    flavor: str
    state_dir: Path
    install_root: Path
    version: str
    version_code: int
    output_mode: str = "1280x720"
    enrollment_key: str = ""

    @property
    def media_dir(self) -> Path:
        return self.state_dir / "media"

    @property
    def ota_dir(self) -> Path:
        return self.state_dir / "ota"


def load() -> Config:
    parser = configparser.ConfigParser()
    if CONFIG_FILE.exists():
        parser.read(CONFIG_FILE)
    section = parser["edge"] if parser.has_section("edge") else {}

    def pick(env: str, key: str, default: str) -> str:
        value = os.environ.get(env) or section.get(key) or default
        return value.strip()

    api = pick("LEDE_API_BASE_URL", "api_base_url", DEFAULT_API).rstrip("/")
    state_dir = Path(pick("LEDE_STATE_DIR", "state_dir", "/var/lib/lede-edge"))
    install_root = Path(pick("LEDE_INSTALL_ROOT", "install_root", "/opt/lede-edge"))
    flavor = pick("LEDE_FLAVOR", "flavor", "linux")
    # Mesma resolução do app Android no SB3000; vazio = modo preferido do monitor
    if "LEDE_OUTPUT_MODE" in os.environ:
        output_mode = os.environ["LEDE_OUTPUT_MODE"].strip()
    elif "output_mode" in section:
        output_mode = section["output_mode"].strip()  # vazio = preferido
    else:
        output_mode = "1280x720"

    state_dir.mkdir(parents=True, exist_ok=True)
    return Config(
        api_base_url=api,
        flavor=flavor,
        state_dir=state_dir,
        install_root=install_root,
        version=__version__,
        version_code=_version_code(__version__),
        output_mode=output_mode,
        enrollment_key=pick("LEDE_ENROLLMENT_KEY", "enrollment_key", ""),
    )
