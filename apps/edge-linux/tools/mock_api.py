#!/usr/bin/env python3
"""API Edge simulada para testar o Edge Linux sem tocar na produção.

Uso: python3 mock_api.py --media-dir /root/spike --port 3999
     LEDE_API_BASE_URL=http://127.0.0.1:3999/api  (no edge.conf ou env)

- /api/edge/pair         qualquer código → token fixo
- /api/edge/sync         manifesto condo_split: zona condo (Stories) + ads (vídeo)
- /api/edge/heartbeat    devolve comandos de <media-dir>/commands.json (consumidos)
- /api/edge/commands/:id/ack, /proof-of-play, /screenshot-upload, /ticker
- /files/<nome>          serve arquivos do media-dir (mídias e pacotes OTA)
Tudo que chega é registrado em <media-dir>/mock.log (JSON por linha).
"""

import argparse
import hashlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TOKEN = "mock-device-token"
ARGS = None
LOCK = threading.Lock()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def media(name: str, kind: str, duration: int = 10000):
    path = ARGS.media_dir / name
    base = f"http://127.0.0.1:{ARGS.port}/files/{name}"
    return {
        "id": f"m-{name}",
        "type": kind,
        "url": base,
        "checksum": sha256(path),
        "durationMs": duration,
        "mimeType": "video/mp4" if kind == "video" else "image/png",
    }


def manifest():
    condo_items = [media(n, "image", 5000) for n in ARGS.condo_images]
    ads = [media(n, "video") for n in ARGS.ads_videos]
    scenes = []
    for i, ad in enumerate(ads):
        scenes.append(
            {
                "id": f"scene-ad-{i}",
                "name": f"Anúncio {i}",
                "durationMs": 10000,
                "layoutId": "layout-condo-split",
                "layout": {"width": 1920, "height": 1080},
                "zones": [
                    {
                        "id": "z-condo",
                        "key": "condo",
                        "label": "Condomínio",
                        "x": 0,
                        "y": 0,
                        "width": 640,
                        "height": 1044,
                        "media": condo_items[0] if condo_items else None,
                        "items": condo_items,
                    },
                    {
                        "id": f"z-ads-{i}",
                        "key": "ads",
                        "label": "Anúncio",
                        "x": 640,
                        "y": 0,
                        "width": 1280,
                        "height": 1044,
                        "media": ad,
                    },
                ],
            }
        )
    return {
        "version": str(int(time.time())),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "deviceId": "mock-device",
        "shortCode": "M0CK",
        "deviceName": "SB3000 Linux (mock)",
        "timezone": "America/Manaus",
        "orientation": ARGS.orientation,
        "scenes": scenes,
    }


TICKER = {
    "updatedAt": "",
    "text": "mock",
    "items": [
        {"key": "weather_mao", "label": "Manaus", "value": "31°C", "changePct": None, "icon": "☀"},
        {"key": "ibov", "label": "Ibovespa", "value": "152.340", "changePct": 0.84, "icon": "📈"},
        {"key": "ifix", "label": "IFIX", "value": "3.412", "changePct": -0.21, "icon": "🏘"},
        {"key": "usd", "label": "Dólar", "value": "R$ 5,31", "changePct": -0.42, "icon": "$"},
        {"key": "eur", "label": "Euro", "value": "R$ 6,12", "changePct": 0.10, "icon": "€"},
        {"key": "btc", "label": "BTC", "value": "R$ 612.450", "changePct": 2.31, "icon": "₿"},
    ],
    "shortCode": "M0CK",
    "deviceName": "SB3000 Linux (mock)",
}


def log_event(kind, payload):
    with LOCK, (ARGS.media_dir / "mock.log").open("a") as f:
        f.write(json.dumps({"t": time.time(), "kind": kind, "payload": payload}) + "\n")


def pop_commands():
    path = ARGS.media_dir / "commands.json"
    with LOCK:
        if not path.exists():
            return []
        try:
            cmds = json.loads(path.read_text())
        except ValueError:
            cmds = []
        path.unlink()
    return cmds


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _authed(self):
        if self.headers.get("x-device-token") != TOKEN:
            self._json(401, {"message": "Device não autorizado"})
            return False
        return True

    def do_GET(self):
        if self.path.startswith("/files/"):
            path = ARGS.media_dir / Path(self.path[len("/files/"):]).name
            if not path.is_file():
                return self._json(404, {"message": "not found"})
            self.send_response(200)
            self.send_header("Content-Length", str(path.stat().st_size))
            self.end_headers()
            with path.open("rb") as f:
                while chunk := f.read(1 << 16):
                    self.wfile.write(chunk)
            return
        if self.path == "/api/edge/sync":
            if self._authed():
                log_event("sync", None)
                self._json(200, manifest())
            return
        if self.path == "/api/edge/ticker":
            if self._authed():
                self._json(200, TICKER)
            return
        self._json(404, {"message": "not found"})

    def do_POST(self):
        body = self._body()
        if self.path == "/api/edge/pair":
            log_event("pair", json.loads(body or b"{}"))
            return self._json(
                201,
                {
                    "deviceId": "mock-device",
                    "deviceToken": TOKEN,
                    "name": "SB3000 Linux (mock)",
                    "shortCode": "M0CK",
                    "orientation": ARGS.orientation,
                },
            )
        if not self._authed():
            return
        if self.path == "/api/edge/heartbeat":
            hb = json.loads(body or b"{}")
            log_event("heartbeat", hb)
            return self._json(201, {"ok": True, "timezone": "America/Manaus", "commands": pop_commands()})
        if self.path.startswith("/api/edge/commands/"):
            log_event("ack", {"path": self.path, **json.loads(body or b"{}")})
            return self._json(201, {"ok": True})
        if self.path == "/api/edge/proof-of-play":
            log_event("pop", json.loads(body or b"{}"))
            return self._json(201, {"ok": True})
        if self.path == "/api/edge/screenshot-upload":
            (ARGS.media_dir / "last-screenshot.multipart").write_bytes(body)
            log_event("screenshot", {"bytes": len(body)})
            return self._json(201, {"ok": True})
        self._json(404, {"message": "not found"})


def main():
    global ARGS
    p = argparse.ArgumentParser()
    p.add_argument("--media-dir", type=Path, required=True)
    p.add_argument("--port", type=int, default=3999)
    p.add_argument("--orientation", default="landscape")
    p.add_argument("--condo-images", nargs="+", default=["condo1.png", "condo2.png"])
    p.add_argument("--ads-videos", nargs="+", default=["real1080.mp4", "test1080.mp4"])
    ARGS = p.parse_args()
    ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
