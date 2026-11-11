"""Cache de mídia por checksum (equivalente a MediaCache.kt).

Baixa todas as mídias do manifesto (2 em paralelo), reescreve as URLs para
``file://`` locais e apaga o que não é mais referenciado.
"""

from __future__ import annotations

import copy
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Iterator

from .api import EdgeApi

log = logging.getLogger(__name__)


def story_playlist(zone: dict[str, Any]) -> list[dict[str, Any]]:
    """Itens válidos da zona: playlist Stories ou mídia única."""
    items = [m for m in (zone.get("items") or []) if m and m.get("checksum")]
    if items:
        return items
    media = zone.get("media")
    return [media] if media and media.get("checksum") else []


def playlist_fingerprint(zone: dict[str, Any]) -> str:
    return "|".join(f"{m['checksum']}:{m.get('durationMs', 0)}" for m in story_playlist(zone))


def _iter_media(manifest: dict[str, Any]) -> Iterator[dict[str, Any]]:
    for scene in manifest.get("scenes") or []:
        for zone in scene.get("zones") or []:
            yield from story_playlist(zone)


class MediaCache:
    def __init__(self, media_dir: Path, api: EdgeApi):
        self.dir = media_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.api = api

    def _local_path(self, checksum: str) -> Path:
        return self.dir / checksum

    def _present(self, checksum: str) -> Path | None:
        p = self._local_path(checksum)
        return p if p.is_file() and p.stat().st_size > 0 else None

    def _ensure(self, media: dict[str, Any]):
        checksum = media["checksum"]
        if self._present(checksum):
            return
        try:
            self.api.download(media["url"], self._local_path(checksum))
        except Exception as err:  # mídia individual não derruba o sync
            log.warning("Falha ao baixar %s: %s", media.get("url"), err)

    def materialize(self, manifest: dict[str, Any]) -> dict[str, Any]:
        assets = {m["checksum"]: m for m in _iter_media(manifest)}
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(self._ensure, assets.values()))

        local = copy.deepcopy(manifest)

        def localize(m: dict[str, Any] | None) -> dict[str, Any] | None:
            if not m or not m.get("checksum"):
                return None
            path = self._present(m["checksum"])
            if not path:
                return None
            return {**m, "url": path.as_uri(), "path": str(path)}

        for scene in local.get("scenes") or []:
            for zone in scene.get("zones") or []:
                items = zone.get("items")
                if items is not None:
                    zone["items"] = [x for x in (localize(i) for i in items) if x]
                zone["media"] = localize(zone.get("media")) or (
                    zone["items"][0] if zone.get("items") else None
                )

        self._cleanup(set(assets))
        return local

    def _cleanup(self, keep: set[str]):
        for f in self.dir.iterdir():
            if not f.is_file():
                continue
            name = f.name.removesuffix(".part")
            if name not in keep:
                f.unlink(missing_ok=True)
