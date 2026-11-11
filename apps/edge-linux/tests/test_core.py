"""Testes do núcleo (sem GTK/GStreamer): OTA, lançador/rollback, PoP, cache."""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
APP = HERE.parent
sys.path.insert(0, str(APP))

from lede_edge import config as config_mod  # noqa: E402
from lede_edge.api import ApiError  # noqa: E402
from lede_edge.media_cache import MediaCache, playlist_fingerprint, story_playlist  # noqa: E402
from lede_edge.store import DeviceStore, ProofOfPlayQueue  # noqa: E402
from lede_edge.updater import Updater, UpdateError  # noqa: E402

LAUNCH = APP / "packaging/system/usr/lib/lede-edge/launch"


def make_config(tmp: Path, version: str = "0.1.0") -> config_mod.Config:
    return config_mod.Config(
        api_base_url="http://mock/api",
        flavor="linux",
        state_dir=tmp / "state",
        install_root=tmp / "opt",
        version=version,
        version_code=config_mod._version_code(version),
    )


def build_package(dest: Path, version: str, *, extra: dict[str, bytes] | None = None,
                  version_file: str | None = None, with_main: bool = True) -> Path:
    """Gera um .tar.zst no formato do build-release.sh."""
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w") as tar:
        files = {"VERSION": (version_file or version).encode() + b"\n",
                 "lede_edge/__init__.py": b""}
        if with_main:
            files["lede_edge/__main__.py"] = b"print('ok')\n"
        files.update(extra or {})
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    tar_path = dest.with_suffix("")
    tar_path.write_bytes(raw.getvalue())
    subprocess.run(["zstd", "-q", "-f", str(tar_path), "-o", str(dest)], check=True)
    tar_path.unlink()
    return dest


class FakeDownloadApi:
    def __init__(self, files: dict[str, Path]):
        self.files = files
        self.calls: list[str] = []

    def download(self, url, dest, *, token=None, timeout=180):
        self.calls.append(url)
        src = self.files.get(url)
        if not src:
            raise ApiError(f"404 {url}")
        shutil.copyfile(src, dest)


@unittest.skipUnless(shutil.which("zstd"), "zstd não instalado")
class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg = make_config(self.tmp)
        self.cfg.state_dir.mkdir(parents=True)
        # Release atual 0.1.0 instalado
        rel = self.cfg.install_root / "releases" / "0.1.0"
        (rel / "lede_edge").mkdir(parents=True)
        (rel / "VERSION").write_text("0.1.0\n")
        (rel / "lede_edge" / "__main__.py").write_text("")
        (self.cfg.install_root / "current").symlink_to("releases/0.1.0")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_install_swaps_current_and_records_pending(self):
        pkg = build_package(self.tmp / "p.tar.zst", "0.2.0")
        api = FakeDownloadApi({"http://x/p": pkg})
        up = Updater(self.cfg, api)
        self.assertEqual(up.install("http://x/p", "0.2.0", "tok"), "0.2.0")
        root = self.cfg.install_root
        self.assertEqual(os.readlink(root / "current"), "releases/0.2.0")
        self.assertEqual(os.readlink(root / "previous"), "releases/0.1.0")
        pending = json.loads((self.cfg.ota_dir / "pending.json").read_text())
        self.assertEqual(pending, {"from": "0.1.0", "to": "0.2.0"})

    def test_version_mismatch_is_rejected_and_current_untouched(self):
        pkg = build_package(self.tmp / "p.tar.zst", "0.2.0", version_file="0.3.0")
        up = Updater(self.cfg, FakeDownloadApi({"u": pkg}))
        with self.assertRaises(UpdateError):
            up.install("u", "0.2.0", None)
        self.assertEqual(os.readlink(self.cfg.install_root / "current"), "releases/0.1.0")
        self.assertFalse((self.cfg.ota_dir / "pending.json").exists())

    def test_package_without_main_is_rejected(self):
        pkg = build_package(self.tmp / "p.tar.zst", "0.2.0", with_main=False)
        up = Updater(self.cfg, FakeDownloadApi({"u": pkg}))
        with self.assertRaises(UpdateError):
            up.install("u", "0.2.0", None)
        self.assertEqual(os.readlink(self.cfg.install_root / "current"), "releases/0.1.0")

    def test_path_traversal_is_blocked(self):
        pkg = build_package(self.tmp / "p.tar.zst", "0.2.0", extra={"../../evil.txt": b"x"})
        up = Updater(self.cfg, FakeDownloadApi({"u": pkg}))
        with self.assertRaises(UpdateError):
            up.install("u", "0.2.0", None)
        self.assertFalse((self.tmp / "evil.txt").exists())
        self.assertFalse((self.cfg.install_root / "evil.txt").exists())

    def test_already_on_target_version(self):
        up = Updater(self.cfg, FakeDownloadApi({}))
        self.assertTrue(up.is_target_version("0.1.0"))
        self.assertTrue(up.is_target_version("v0.1.0"))
        self.assertFalse(up.is_target_version("0.1.1"))

    def test_confirm_healthy_clears_pending(self):
        cfg2 = make_config(self.tmp, version="0.2.0")
        cfg2.ota_dir.mkdir(parents=True, exist_ok=True)
        (cfg2.ota_dir / "pending.json").write_text('{"from": "0.1.0", "to": "0.2.0"}')
        (cfg2.ota_dir / "attempts").write_text("2")
        Updater(cfg2, FakeDownloadApi({})).confirm_healthy()
        self.assertFalse((cfg2.ota_dir / "pending.json").exists())
        self.assertFalse((cfg2.ota_dir / "attempts").exists())


class LauncherTests(unittest.TestCase):
    """Executa o launch real com um `cage` falso no PATH."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "opt"
        self.state = self.tmp / "state"
        for v in ("0.1.0", "0.2.0"):
            rel = self.root / "releases" / v
            (rel / "lede_edge").mkdir(parents=True)
            (rel / "VERSION").write_text(v)
            (rel / "lede_edge" / "__main__.py").write_text("")
        (self.root / "current").symlink_to("releases/0.2.0")
        (self.root / "previous").symlink_to("releases/0.1.0")
        (self.state / "ota").mkdir(parents=True)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        fake = self.bin / "cage"
        # Registra em qual release o "app" subiu
        fake.write_text('#!/bin/sh\necho "$PYTHONPATH" > "$LEDE_STATE_DIR/started"\nexit 0\n')
        fake.chmod(0o755)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_launch(self):
        env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "LEDE_INSTALL_ROOT": str(self.root),
            "LEDE_STATE_DIR": str(self.state),
            "XDG_RUNTIME_DIR": str(self.tmp / "run"),
        }
        res = subprocess.run(["bash", str(LAUNCH)], env=env, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        return (self.state / "started").read_text().strip()

    def test_starts_current_without_pending(self):
        self.assertTrue(self.run_launch().endswith("releases/0.2.0"))

    def test_rolls_back_after_three_unconfirmed_starts(self):
        (self.state / "ota" / "pending.json").write_text('{"from": "0.1.0", "to": "0.2.0"}')
        for _ in range(3):
            self.assertTrue(self.run_launch().endswith("releases/0.2.0"))
        # 4º start sem confirmação → rollback
        self.assertTrue(self.run_launch().endswith("releases/0.1.0"))
        self.assertEqual(os.readlink(self.root / "current"), "releases/0.1.0")
        self.assertFalse((self.state / "ota" / "pending.json").exists())
        self.assertTrue((self.state / "ota" / "last-rollback.json").exists())


class PopQueueTests(unittest.TestCase):
    def test_flush_stops_at_first_failure_and_keeps_rest(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            q = ProofOfPlayQueue(tmp)
            q.enqueue_all([{"n": i} for i in range(5)])
            api = mock.Mock()
            api.proof_of_play.side_effect = [None, None, ApiError("offline"), None, None]
            q.flush(api, "tok")
            self.assertEqual(q._load(), [{"n": 2}, {"n": 3}, {"n": 4}])
        finally:
            shutil.rmtree(tmp)

    def test_cap_at_max_events(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            q = ProofOfPlayQueue(tmp)
            q.enqueue_all([{"n": i} for i in range(ProofOfPlayQueue.MAX_EVENTS + 20)])
            events = q._load()
            self.assertEqual(len(events), ProofOfPlayQueue.MAX_EVENTS)
            self.assertEqual(events[0], {"n": 20})
        finally:
            shutil.rmtree(tmp)


class DeviceStoreTests(unittest.TestCase):
    def test_persists_and_clears(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            s = DeviceStore(tmp)
            s.update(device_token="t", short_code="A3F2")
            self.assertEqual(DeviceStore(tmp).token, "t")
            s.clear()
            self.assertIsNone(DeviceStore(tmp).token)
            self.assertEqual(DeviceStore(tmp).orientation, "landscape")
        finally:
            shutil.rmtree(tmp)


class MediaCacheTests(unittest.TestCase):
    def test_localizes_and_cleans(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            media_dir = tmp / "media"
            media_dir.mkdir()
            (media_dir / "stale").write_text("old")

            class Api:
                def download(self, url, dest, **_):
                    if "broken" in url:
                        raise ApiError("404")
                    dest.write_text(url)

            manifest = {"scenes": [{"id": "s", "zones": [
                {"key": "condo", "media": None, "items": [
                    {"id": "a", "checksum": "aaa", "url": "http://x/a", "durationMs": 5000},
                    {"id": "b", "checksum": "bbb", "url": "http://x/broken", "durationMs": 5000},
                ]},
                {"key": "ads", "media": {"id": "c", "checksum": "ccc", "url": "http://x/c"}},
            ]}]}
            local = MediaCache(media_dir, Api()).materialize(manifest)
            condo, ads = local["scenes"][0]["zones"]
            self.assertEqual([i["id"] for i in condo["items"]], ["a"])  # b falhou
            self.assertTrue(condo["media"]["url"].startswith("file://"))
            self.assertEqual(ads["media"]["path"], str(media_dir / "ccc"))
            self.assertFalse((media_dir / "stale").exists())
        finally:
            shutil.rmtree(tmp)

    def test_fingerprint(self):
        zone = {"items": [{"checksum": "a", "durationMs": 1}, {"checksum": "b", "durationMs": 2}]}
        self.assertEqual(playlist_fingerprint(zone), "a:1|b:2")
        self.assertEqual(story_playlist({"media": {"checksum": ""}}), [])


class ConfigTests(unittest.TestCase):
    def test_version_code(self):
        self.assertEqual(config_mod._version_code("0.5.16"), 516)
        self.assertEqual(config_mod._version_code("1.2.3-dev"), 10203)


if __name__ == "__main__":
    unittest.main()
