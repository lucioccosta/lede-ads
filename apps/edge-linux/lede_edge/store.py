"""Persistência local: device (token), manifesto offline e fila de PoP.

Equivalente a DeviceStore.kt, ManifestStore.kt e ProofOfPlayQueue.kt.
Toda escrita é atômica (tmp + fsync + rename) — box pode perder energia.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .api import EdgeApi


def atomic_write_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w") as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


class DeviceStore:
    """Token e identidade do device. Campos iguais ao SharedPreferences do Android."""

    FIELDS = ("device_token", "device_id", "device_name", "short_code", "cloud_timezone", "orientation")

    def __init__(self, state_dir: Path):
        self.path = state_dir / "device.json"
        self._lock = threading.Lock()
        self._data: dict[str, Any] = read_json(self.path, {}) or {}

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._data.get(key, default)

    def update(self, **values: Any):
        with self._lock:
            for k, v in values.items():
                if k not in self.FIELDS:
                    raise KeyError(k)
                if v is None:
                    self._data.pop(k, None)
                else:
                    self._data[k] = v
            atomic_write_json(self.path, self._data)

    def clear(self):
        with self._lock:
            self._data = {}
            self.path.unlink(missing_ok=True)

    @property
    def token(self) -> str | None:
        return self.get("device_token")

    @property
    def orientation(self) -> str:
        return self.get("orientation") or "landscape"


class ManifestStore:
    def __init__(self, state_dir: Path):
        self.path = state_dir / "manifest.json"

    def save(self, manifest: dict[str, Any]):
        atomic_write_json(self.path, manifest)

    def load(self) -> dict[str, Any] | None:
        return read_json(self.path)


class ProofOfPlayQueue:
    MAX_EVENTS = 500

    def __init__(self, state_dir: Path):
        self.path = state_dir / "pop_queue.json"
        self._lock = threading.Lock()

    def _load(self) -> list[dict[str, Any]]:
        data = read_json(self.path, [])
        return data if isinstance(data, list) else []

    def _save(self, events: list[dict[str, Any]]):
        if not events:
            self.path.unlink(missing_ok=True)
            return
        atomic_write_json(self.path, events)

    def enqueue_all(self, events: list[dict[str, Any]]):
        if not events:
            return
        with self._lock:
            self._save((self._load() + events)[-self.MAX_EVENTS :])

    def flush(self, api: EdgeApi, token: str):
        """Envia em ordem; para no primeiro erro (rede caiu) e mantém o resto."""
        with self._lock:
            pending = self._load()
        if not pending:
            return
        sent = 0
        for event in pending:
            try:
                api.proof_of_play(token, event)
            except Exception:
                break
            sent += 1
        with self._lock:
            # Eventos novos podem ter chegado durante o flush — preserva-os
            current = self._load()
            self._save(current[sent:])
