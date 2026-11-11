"""Telemetria do heartbeat (equivalente a DeviceTelemetryCollector.kt)."""

from __future__ import annotations

import os
import socket
import time
from pathlib import Path
from typing import Any


def _cpu_times() -> tuple[int, int] | None:
    try:
        fields = Path("/proc/stat").read_text().splitlines()[0].split()[1:]
    except OSError:
        return None
    values = [int(v) for v in fields]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return idle, sum(values)


def cpu_usage_percent(sample_s: float = 0.5) -> float | None:
    a = _cpu_times()
    time.sleep(sample_s)
    b = _cpu_times()
    if not a or not b or b[1] == a[1]:
        return None
    busy = 1.0 - (b[0] - a[0]) / (b[1] - a[1])
    return round(max(0.0, min(100.0, busy * 100)), 1)


def _meminfo() -> tuple[int, int]:
    info: dict[str, int] = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, _, rest = line.partition(":")
            info[key] = int(rest.split()[0]) * 1024
    except OSError:
        pass
    return info.get("MemAvailable", 0), info.get("MemTotal", 0)


def _disk(path: str) -> tuple[int, int]:
    st = os.statvfs(path)
    return st.f_bavail * st.f_frsize, st.f_blocks * st.f_frsize


def _uptime_ms() -> int:
    try:
        return int(float(Path("/proc/uptime").read_text().split()[0]) * 1000)
    except OSError:
        return 0


def primary_ipv4() -> str | None:
    """IP de saída (não envia pacote — UDP connect só resolve a rota)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("1.1.1.1", 53))
            return s.getsockname()[0]
    except OSError:
        return None


def screen_size() -> tuple[int, int] | None:
    """Modo ativo do primeiro conector HDMI conectado (DRM sysfs)."""
    for conn in sorted(Path("/sys/class/drm").glob("card*-*")):
        try:
            if (conn / "status").read_text().strip() != "connected":
                continue
            mode = (conn / "modes").read_text().splitlines()[0]
        except (OSError, IndexError):
            continue
        w, _, h = mode.partition("x")
        try:
            return int(w), int(h.rstrip("ip"))
        except ValueError:
            continue
    return None


# Modo realmente aplicado (definido pelo __main__ após set_output_mode);
# o sysfs do DRM só informa o modo *preferido* do monitor.
CURRENT_SCREEN: tuple[int, int] | None = None


def collect(config, state_dir: Path) -> dict[str, Any]:
    free, total = _disk(str(state_dir))
    ram_avail, ram_total = _meminfo()
    payload: dict[str, Any] = {
        "appVersion": config.version,
        "appVersionCode": config.version_code,
        "appFlavor": config.flavor,
        "freeStorageBytes": free,
        "totalStorageBytes": total,
        "ramAvailBytes": ram_avail,
        "ramTotalBytes": ram_total,
        "uptimeMs": _uptime_ms(),
    }
    cpu = cpu_usage_percent()
    if cpu is not None:
        payload["cpuUsagePercent"] = cpu
    ip = primary_ipv4()
    if ip:
        payload["ipAddress"] = ip
    size = CURRENT_SCREEN or screen_size()
    if size:
        payload["screenWidth"], payload["screenHeight"] = size
    return payload
