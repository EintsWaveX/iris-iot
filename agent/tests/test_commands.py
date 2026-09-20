"""Unit tests for commands.py -- the whitelist and argv builder. The one
property every test here ultimately protects: no server-supplied string
ever becomes part of a shell command. Run with:
    python3 -m unittest discover agent/tests
"""
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import commands  # noqa: E402


class TestBuildArgv(unittest.TestCase):
    def test_layanan_mulai_known_service(self):
        argv = commands.build_argv("layanan.mulai", {"layanan": "mosquitto"}, "/repo")
        self.assertEqual(argv, ["sudo", "/usr/bin/systemctl", "start", "mosquitto.service"])

    def test_layanan_henti_known_service(self):
        argv = commands.build_argv("layanan.henti", {"layanan": "modul4"}, "/repo")
        self.assertEqual(argv, ["sudo", "/usr/bin/systemctl", "stop", "modul4.service"])

    def test_layanan_mulai_ulang_known_service(self):
        argv = commands.build_argv("layanan.mulai_ulang", {"layanan": "chirpstack"}, "/repo")
        self.assertEqual(argv, ["sudo", "/usr/bin/systemctl", "restart", "chirpstack.service"])

    def test_unknown_layanan_returns_none(self):
        # This is the load-bearing case: a caller that got past the cloud's
        # own validation (or a cloud deployment that drifted out of sync)
        # must still be refused here, not turned into a command against
        # whatever string was in the "layanan" field.
        self.assertIsNone(commands.build_argv("layanan.mulai", {"layanan": "sshd"}, "/repo"))
        self.assertIsNone(commands.build_argv("layanan.mulai", {"layanan": "; rm -rf /"}, "/repo"))
        self.assertIsNone(commands.build_argv("layanan.mulai", {}, "/repo"))

    def test_unknown_aksi_returns_none(self):
        self.assertIsNone(commands.build_argv("reboot.paksa", {}, "/repo"))
        self.assertIsNone(commands.build_argv("", {}, "/repo"))
        self.assertIsNone(commands.build_argv("layanan.mulai; ls", {}, "/repo"))

    def test_ap_toggle_uses_repo_root(self):
        argv_on = commands.build_argv("ap.nyala", {}, "/opt/iris")
        argv_off = commands.build_argv("ap.mati", {}, "/opt/iris")
        self.assertEqual(argv_on, ["sudo", "/opt/iris/scripts/opi_ap_on.sh"])
        self.assertEqual(argv_off, ["sudo", "/opt/iris/scripts/opi_ap_off.sh"])

    def test_jam_selaraskan(self):
        argv = commands.build_argv("jam.selaraskan", {}, "/repo")
        self.assertEqual(argv, ["sudo", "/usr/bin/systemctl", "restart", "systemd-timesyncd.service"])

    def test_no_argv_ever_contains_shell_metacharacters_from_input(self):
        # A broader sweep: no injected argumen value should ever survive
        # into a returned argv, for ANY aksi -- either the argv is None, or
        # every element of it is one of the fixed strings this module
        # itself defines.
        injections = ["mosquitto; rm -rf /", "$(reboot)", "`id`", "mosquitto && cat /etc/shadow"]
        for aksi in ("layanan.mulai", "layanan.henti", "layanan.mulai_ulang"):
            for payload in injections:
                argv = commands.build_argv(aksi, {"layanan": payload}, "/repo")
                self.assertIsNone(argv, f"{aksi} with payload {payload!r} should be refused, got {argv}")


class TestJalankan(unittest.TestCase):
    def test_unknown_action_fails_without_running_anything(self):
        hasil = commands.jalankan("tidak.dikenal", {}, "/repo")
        self.assertEqual(hasil.status, "gagal")
        self.assertIn("tidak dikenal", hasil.keluaran)

    def test_successful_command_reports_selesai(self):
        # /usr/bin/systemctl won't exist or won't be runnable without sudo
        # in a test environment, so this exercises the executor with a
        # harmless real binary swapped in via monkeypatching build_argv's
        # output indirectly: call jalankan on an aksi whose argv is
        # deterministic, then verify the *shape* of a real subprocess
        # invocation succeeds for a command we know is safe to actually run.
        import commands as _commands

        original = _commands.build_argv
        _commands.build_argv = lambda aksi, argumen, repo_root: ["python3", "-c", "print('ok')"]
        try:
            hasil = commands.jalankan("apa.saja", {}, "/repo")
        finally:
            _commands.build_argv = original
        self.assertEqual(hasil.status, "selesai")
        self.assertIn("ok", hasil.keluaran)

    def test_nonzero_exit_reports_gagal(self):
        import commands as _commands

        original = _commands.build_argv
        _commands.build_argv = lambda aksi, argumen, repo_root: [
            "python3",
            "-c",
            "import sys; sys.exit(1)",
        ]
        try:
            hasil = commands.jalankan("apa.saja", {}, "/repo")
        finally:
            _commands.build_argv = original
        self.assertEqual(hasil.status, "gagal")


if __name__ == "__main__":
    unittest.main()
