"""Ações de sistema (no Android dependiam de Device Owner; aqui o serviço é root)."""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def set_timezone(tz: str) -> bool:
    if not tz or not Path("/usr/share/zoneinfo", tz).is_file():
        return False
    try:
        current = os.path.realpath("/etc/localtime")
        if current.endswith("/" + tz):
            return True
        res = _run(["timedatectl", "set-timezone", tz])
        if res.returncode != 0:
            log.warning("timedatectl falhou: %s", res.stderr.strip())
            return False
        return True
    except (OSError, subprocess.SubprocessError) as err:
        log.warning("set_timezone(%s): %s", tz, err)
        return False


def reboot():
    _run(["systemctl", "reboot"])


def screenshot(dest: Path) -> bool:
    """Captura a saída Wayland (cage suporta wlr-screencopy) com grim."""
    env = os.environ.copy()
    try:
        res = subprocess.run(
            ["grim", "-t", "jpeg", "-q", "70", str(dest)],
            capture_output=True,
            text=True,
            timeout=20,
            env=env,
        )
    except (OSError, subprocess.SubprocessError) as err:
        log.warning("grim: %s", err)
        return False
    if res.returncode != 0:
        log.warning("grim falhou: %s", res.stderr.strip())
        return False
    return dest.is_file() and dest.stat().st_size > 0


def set_output_mode(mode: str) -> tuple[int, int] | None:
    """Troca o modo HDMI via wlr-output-management (cage). Ex.: "1280x720".

    Escolhe a maior taxa disponível ≤ 60 Hz para a resolução pedida.
    Retorna (w, h) aplicado, ou None se não foi possível.
    """
    mode = (mode or "").strip().lower()
    if not mode or "x" not in mode:
        return None
    try:
        res = _run(["wlr-randr"])
    except (OSError, subprocess.SubprocessError) as err:
        log.warning("wlr-randr: %s", err)
        return None
    if res.returncode != 0 or not res.stdout:
        log.warning("wlr-randr falhou: %s", res.stderr.strip())
        return None
    output = res.stdout.split()[0]
    rates = []
    for line in res.stdout.splitlines():
        line = line.strip()
        if line.startswith(f"{mode} px,"):
            try:
                rates.append(float(line.split(",")[1].split()[0]))
            except (IndexError, ValueError):
                continue
    if not rates:
        log.warning("Modo %s não suportado pelo monitor", mode)
        return None
    usable = [r for r in rates if r <= 60.01] or rates
    rate = max(usable)
    res = _run(["wlr-randr", "--output", output, "--mode", f"{mode}@{rate:.6f}"])
    if res.returncode != 0:
        log.warning("wlr-randr --mode falhou: %s", res.stderr.strip())
        return None
    w, h = mode.split("x")
    log.info("Saída %s em %s @ %.2f Hz", output, mode, rate)
    return int(w), int(h)
