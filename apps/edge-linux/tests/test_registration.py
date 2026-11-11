"""Auto-registro do Edge: laço de registro/consulta com API falsa."""

from __future__ import annotations

import shutil
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from lede_edge import controller as ctrl_mod  # noqa: E402
from lede_edge import identity  # noqa: E402
from lede_edge.api import ApiError  # noqa: E402
from test_core import make_config  # noqa: E402


class FakeView:
    def __init__(self):
        self.events: list[tuple] = []

    def __getattr__(self, name):
        def record(*args):
            self.events.append((name, *args))
        return record


class FakeApi:
    def __init__(self, statuses):
        self.statuses = list(statuses)
        self.registered: list[dict] = []
        self.polls = 0

    def register(self, payload):
        self.registered.append(payload)
        return {"status": "pending", "code": "K7M2QX"}

    def register_status(self, hw, secret):
        self.polls += 1
        item = self.statuses.pop(0) if self.statuses else {"status": "pending"}
        if isinstance(item, Exception):
            raise item
        return item


APPROVED = {
    "status": "approved",
    "deviceId": "dev1",
    "deviceToken": "tok-123",
    "name": "Elevador A",
    "shortCode": "A3F2",
    "orientation": "portrait",
}


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        cfg = make_config(self.tmp)
        cfg.state_dir.mkdir(parents=True)
        self.ctrl = ctrl_mod.EdgeController(cfg, post=lambda fn: fn())
        self.view = FakeView()
        self.ctrl.attach(self.view)
        # Sem esperas reais nos testes
        self.patches = [
            mock.patch.object(ctrl_mod, "REGISTER_POLL_S", 0.01),
            mock.patch.object(ctrl_mod, "REGISTER_RETRY_MIN_S", 0.01),
            mock.patch.object(ctrl_mod, "REGISTER_RETRY_MAX_S", 0.04),
            mock.patch.object(ctrl_mod, "REJECTED_POLL_S", 0.01),
            mock.patch.object(identity, "hardware_id", return_value="sid-test0001"),
            mock.patch.object(self.ctrl, "start"),  # não sobe os laços reais
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp)

    def run_loop(self, api, timeout=3.0):
        self.ctrl.api = api
        self.ctrl._registering.acquire()
        t = threading.Thread(target=self.ctrl._registration_loop, daemon=True)
        t.start()
        t.join(timeout)
        return t

    def test_pending_then_approved_stores_token(self):
        api = FakeApi([{"status": "pending", "code": "K7M2QX"}, ApiError("offline"), APPROVED])
        t = self.run_loop(api)
        self.assertFalse(t.is_alive())
        self.assertEqual(self.ctrl.store.token, "tok-123")
        self.assertEqual(self.ctrl.store.get("short_code"), "A3F2")
        self.assertEqual(self.ctrl.store.orientation, "portrait")
        payload = api.registered[0]
        self.assertEqual(payload["hardwareId"], "sid-test0001")
        self.assertGreaterEqual(len(payload["secret"]), 32)
        self.assertEqual(payload["appFlavor"], "linux")
        shown = [e for e in self.view.events if e[0] == "show_registration"]
        self.assertIn(("show_registration", "pending", "K7M2QX", None), shown)
        self.assertTrue(any(e[1] == "offline" for e in shown))
        self.ctrl.start.assert_called_once()

    def test_secret_is_persistent(self):
        first = identity.registration_secret(self.ctrl.config.state_dir)
        self.assertEqual(identity.registration_secret(self.ctrl.config.state_dir), first)
        # re-parear (store.clear) não apaga o segredo
        self.ctrl.store.update(device_token="x")
        self.ctrl.store.clear()
        self.assertEqual(identity.registration_secret(self.ctrl.config.state_dir), first)

    def test_rejected_keeps_polling_and_shows_reason(self):
        api = FakeApi([{"status": "rejected", "reason": "Box desconhecido"}] * 3 + [APPROVED])
        t = self.run_loop(api)
        self.assertFalse(t.is_alive())
        rejected = [e for e in self.view.events if e[:2] == ("show_registration", "rejected")]
        self.assertTrue(rejected)
        self.assertEqual(rejected[0][3], "Box desconhecido")
        self.assertEqual(self.ctrl.store.token, "tok-123")

    def test_token_from_elsewhere_stops_registration(self):
        api = FakeApi([{"status": "pending"}] * 1000)
        self.ctrl.api = api
        self.ctrl._registering.acquire()
        t = threading.Thread(target=self.ctrl._registration_loop, daemon=True)
        t.start()
        time.sleep(0.1)
        self.ctrl.store.update(device_token="manual-token")  # token chegou por outro caminho
        t.join(2)
        self.assertFalse(t.is_alive())
        self.assertEqual(self.ctrl.store.token, "manual-token")
        # e o lock foi liberado (pode registrar de novo após re-parear)
        self.assertTrue(self.ctrl._registering.acquire(blocking=False))


    def test_offline_keeps_retrying_until_cloud_answers(self):
        # 6 falhas seguidas (sem rede, DNS, erro inesperado) e depois aprovado
        failures = [ApiError("Network unreachable")] * 3 + [ValueError("JSON quebrado")] * 3
        api = FakeApi(failures + [APPROVED])
        t = self.run_loop(api)
        self.assertFalse(t.is_alive())
        self.assertEqual(self.ctrl.store.token, "tok-123")
        offline = [e for e in self.view.events if e[:2] == ("show_registration", "offline")]
        self.assertGreaterEqual(len(offline), 6)

    def test_register_endpoint_down_is_retried(self):
        api = FakeApi([APPROVED])
        calls = {"n": 0}
        real = api.register

        def flaky(payload):
            calls["n"] += 1
            if calls["n"] < 4:
                raise ApiError("Connection refused")
            return real(payload)

        api.register = flaky
        t = self.run_loop(api)
        self.assertFalse(t.is_alive())
        self.assertEqual(calls["n"], 4)
        self.assertEqual(self.ctrl.store.token, "tok-123")


class IdentityTests(unittest.TestCase):
    def test_local_code_matches_cloud(self):
        # Pares reais: código devolvido pela API / exibido no Cloud
        self.assertEqual(identity.registration_code("sid-curltest0001"), "H2GGDK")
        self.assertEqual(
            identity.registration_code("sid-005cc0320848006c80130801d4226638"), "PTUAWJ"
        )

    def test_hardware_id_prefers_sid(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            sid = tmp / "nvmem"
            sid.write_bytes(bytes.fromhex("005cc0320848006c80130801d4226638") + b"\xff" * 16)
            with mock.patch.object(identity, "SID_PATH", sid):
                self.assertEqual(identity.hardware_id(), "sid-005cc0320848006c80130801d4226638")
            sid.write_bytes(b"\0" * 32)  # SID zerado → cai para os próximos
            with mock.patch.object(identity, "SID_PATH", sid), \
                 mock.patch.object(identity, "SERIAL_PATH", tmp / "nope"), \
                 mock.patch.object(identity, "primary_mac", return_value="02:00:f6:61:5a:20"):
                self.assertEqual(identity.hardware_id(), "mac-0200f6615a20")
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
