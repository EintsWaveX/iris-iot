"""Unit tests for collectors.py -- real /proc and `ip neigh` shapes, no Pi
needed. Run with: python3 -m unittest discover agent/tests
"""
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import collectors  # noqa: E402


class TestCpuStat(unittest.TestCase):
    def test_parses_first_cpu_line(self):
        text = (
            "cpu  100 20 300 9000 50 5 15 0 0 0\n"
            "cpu0 50 10 150 4500 25 2 7 0 0 0\n"
        )
        busy, total = collectors.parse_cpu_stat(text)
        self.assertEqual(busy, 100 + 20 + 300 + 5 + 15 + 0)  # user+nice+system+irq+softirq+steal
        self.assertEqual(total, busy + 9000 + 50)  # + idle + iowait

    def test_raises_on_missing_cpu_line(self):
        with self.assertRaises(ValueError):
            collectors.parse_cpu_stat("intr 12345\nctxt 6789\n")

    def test_percent_from_two_samples(self):
        s1 = (1000, 10000)
        s2 = (1500, 11000)  # 500 busy over 1000 total delta
        self.assertEqual(collectors.cpu_percent(s1, s2), 50)

    def test_percent_none_when_no_time_passed(self):
        s = (1000, 10000)
        self.assertIsNone(collectors.cpu_percent(s, s))


class TestMeminfo(unittest.TestCase):
    def test_uses_available_not_free(self):
        text = "MemTotal:        4000000 kB\nMemFree:          200000 kB\nMemAvailable:    3000000 kB\n"
        # (4000000 - 3000000) / 4000000 = 25% used, NOT (4000000-200000)/4000000 = 95%
        self.assertEqual(collectors.parse_meminfo(text), 25)

    def test_none_when_fields_missing(self):
        self.assertIsNone(collectors.parse_meminfo("SomeOtherField: 5 kB\n"))


class TestArpNeigh(unittest.TestCase):
    def test_parses_reachable_entries(self):
        text = (
            "192.168.4.23 dev eth0 lladdr b8:27:eb:12:34:56 REACHABLE\n"
            "192.168.4.24 dev eth0 lladdr 24:6f:28:aa:bb:cc STALE\n"
            "192.168.4.25 dev eth0 lladdr 00:11:22:33:44:55 FAILED\n"
        )
        result = collectors.parse_arp_neigh(text)
        macs = {d["mac"] for d in result}
        self.assertEqual(macs, {"B8:27:EB:12:34:56", "24:6F:28:AA:BB:CC"})
        self.assertNotIn("00:11:22:33:44:55", macs)  # FAILED excluded

    def test_dedupes_keeping_latest_ip_for_mac(self):
        text = (
            "192.168.4.10 dev eth0 lladdr 24:6f:28:aa:bb:cc REACHABLE\n"
            "192.168.4.99 dev eth0 lladdr 24:6f:28:aa:bb:cc STALE\n"
        )
        result = collectors.parse_arp_neigh(text)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["ip"], "192.168.4.99")


class TestGuessDevice(unittest.TestCase):
    def test_known_espressif_oui(self):
        vendor, jenis = collectors.guess_device("24:6F:28:AA:BB:CC")
        self.assertEqual(vendor, "Espressif")
        self.assertEqual(jenis, "esp32")

    def test_unknown_oui_returns_none(self):
        vendor, jenis = collectors.guess_device("FF:FF:FF:00:00:00")
        self.assertIsNone(vendor)
        self.assertIsNone(jenis)

    def test_case_insensitive(self):
        vendor, _ = collectors.guess_device("24:6f:28:aa:bb:cc")
        self.assertEqual(vendor, "Espressif")


class TestDiskAndUptime(unittest.TestCase):
    def test_disk_percent(self):
        self.assertEqual(collectors.disk_percent(1000, 250), 25)

    def test_disk_percent_zero_total(self):
        self.assertIsNone(collectors.disk_percent(0, 0))

    def test_uptime_truncates_fraction(self):
        self.assertEqual(collectors.parse_uptime("12345.67 9999.99\n"), 12345)

    def test_uptime_malformed(self):
        self.assertIsNone(collectors.parse_uptime(""))
        self.assertIsNone(collectors.parse_uptime("not-a-number\n"))


class TestThermalZone(unittest.TestCase):
    def test_converts_millidegrees(self):
        self.assertEqual(collectors.parse_thermal_zone("48213\n"), 48)

    def test_rejects_sentinel_values(self):
        self.assertIsNone(collectors.parse_thermal_zone("-1\n"))
        self.assertIsNone(collectors.parse_thermal_zone("999999999\n"))

    def test_rejects_garbage(self):
        self.assertIsNone(collectors.parse_thermal_zone("not-a-number\n"))


class TestMosquittoClients(unittest.TestCase):
    def test_parses_bare_integer(self):
        self.assertEqual(collectors.parse_mosquitto_clients("3"), 3)

    def test_rejects_non_numeric(self):
        self.assertIsNone(collectors.parse_mosquitto_clients("not-a-number"))


if __name__ == "__main__":
    unittest.main()
