#!/usr/bin/env python3
"""IRIS IoT practicum site — Orange Pi agent (Phase 2).

Outbound-only: this process opens no listening port and needs no inbound
firewall rule. Every cycle it POSTs the Pi's health and whatever it just
discovered to POST /api/agen, and the response carries both the
outcome of that call (accepted or a bad key) AND anything queued for this
Pi to do -- one round trip does heartbeat, inventory, command delivery, and
result reporting, because there is no other way to reach a Pi that has no
open port at all.

Usage:
    python3 agent.py enroll --kode opi-lab-a --token <one-time-token> \\
        --server https://iris-praktikum-jurnal.vercel.app
        Exchanges the token for a long-lived agent key and writes config.json.
        Run once, by hand, right after registering the server on the dashboard.

    python3 agent.py run
        The heartbeat loop. What systemd's iris-agent.service actually runs.

Standard library only -- see collectors.py's docstring for why.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

import collectors
import commands

CONFIG_PATH = pathlib.Path(os.environ.get("IRIS_AGENT_CONFIG", "/etc/iris-agent/config.json"))
SPOOL_PATH = pathlib.Path(os.environ.get("IRIS_AGENT_SPOOL", "/var/lib/iris-agent/spool.json"))
REQUEST_TIMEOUT_SEC = 10
MAX_SPOOL_ENTRIES = 200  # bounds disk use if the Pi is offline for a long stretch


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"belum terdaftar: {CONFIG_PATH} tidak ada. Jalankan `agent.py enroll` dahulu.", file=sys.stderr)
        sys.exit(1)
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(config: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")
    CONFIG_PATH.chmod(0o600)  # contains the long-lived agent key


def post_json(url: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as resp:
        return json.loads(resp.read().decode("utf-8"))


def cmd_enroll(args: argparse.Namespace) -> None:
    url = f"{args.server.rstrip('/')}/api/agen"
    try:
        reply = post_json(url, {"kode": args.kode, "token": args.token})
    except (urllib.error.URLError, urllib.error.HTTPError) as err:
        print(f"gagal menghubungi server: {err}", file=sys.stderr)
        sys.exit(1)

    if not reply.get("ok"):
        print(f"pendaftaran ditolak: {reply.get('kode', 'tidak diketahui')}", file=sys.stderr)
        sys.exit(1)

    save_config(
        {
            "server": args.server.rstrip("/"),
            "serverId": reply["serverId"],
            "agenKunci": reply["agenKunci"],
            "repoRoot": args.repo_root,
        }
    )
    print(f"terdaftar. Konfigurasi ditulis ke {CONFIG_PATH}.")


# -- collection -------------------------------------------------------------


def _read(path: str) -> str | None:
    try:
        return pathlib.Path(path).read_text(encoding="utf-8")
    except OSError:
        return None


def _run(argv: list[str]) -> str | None:
    try:
        result = subprocess.run(argv, shell=False, capture_output=True, text=True, timeout=5)
        return result.stdout if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def kumpulkan_kesehatan(cpu_sample_prev: tuple[int, int] | None) -> tuple[dict, tuple[int, int] | None]:
    """Returns (health dict, this cycle's raw CPU sample for next time)."""
    stat_text = _read("/proc/stat")
    cpu_sample = collectors.parse_cpu_stat(stat_text) if stat_text else None
    cpu_pct = collectors.cpu_percent(cpu_sample_prev, cpu_sample) if cpu_sample_prev and cpu_sample else None

    mem_text = _read("/proc/meminfo")
    memori = collectors.parse_meminfo(mem_text) if mem_text else None

    uptime_text = _read("/proc/uptime")
    uptime_sec = collectors.parse_uptime(uptime_text) if uptime_text else None

    temp_text = _read("/sys/class/thermal/thermal_zone0/temp")
    suhu = collectors.parse_thermal_zone(temp_text) if temp_text else None

    disk = None
    try:
        usage = shutil.disk_usage("/")
        disk = collectors.disk_percent(usage.total, usage.used)
    except OSError:
        pass

    health = {
        "cpu": cpu_pct,
        "memori": memori,
        "disk": disk,
        "suhu": suhu,
        "uptimeSec": uptime_sec,
        "jamSelaras": _jam_selaras(),
        "modeJaringan": _mode_jaringan(),
        "layanan": _status_layanan(),
    }
    return health, cpu_sample


def _jam_selaras() -> bool:
    output = _run(["timedatectl", "show", "--property=NTPSynchronized", "--value"])
    return bool(output) and output.strip() == "yes"


def _mode_jaringan() -> str:
    # opi_ap_on.sh's hostapd runs in the background (`-B`) whenever the Pi
    # is standing in as its own access point -- its presence is a more
    # direct signal than trying to infer mode from interface state.
    output = _run(["pgrep", "-x", "hostapd"])
    return "ap-mandiri" if output else "ethernet-router"


def _status_layanan() -> dict[str, str]:
    layanan = {}
    for nama, unit in commands.LAYANAN_UNIT.items():
        output = _run(["systemctl", "is-active", unit])
        state = (output or "").strip()
        layanan[nama] = "aktif" if state == "active" else "berhenti" if state else "galat"
    return layanan


def kumpulkan_perangkat() -> list[dict]:
    neigh_text = _run(["ip", "neigh", "show"]) or ""
    ditemukan = collectors.parse_arp_neigh(neigh_text)
    hasil = []
    for entri in ditemukan:
        vendor, jenis = collectors.guess_device(entri["mac"])
        hasil.append(
            {"mac": entri["mac"], "ip": entri["ip"], "vendor": vendor, "jenis": jenis, "sumber": "arp"}
        )
    return hasil


# -- spool (offline buffering) ------------------------------------------------


def spool_load() -> list[dict]:
    if not SPOOL_PATH.exists():
        return []
    try:
        return json.loads(SPOOL_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def spool_save(entries: list[dict]) -> None:
    SPOOL_PATH.parent.mkdir(parents=True, exist_ok=True)
    SPOOL_PATH.write_text(json.dumps(entries[-MAX_SPOOL_ENTRIES:]), encoding="utf-8")


# -- main loop ----------------------------------------------------------------


def cmd_run(args: argparse.Namespace) -> None:
    config = load_config()
    repo_root = config.get("repoRoot", commands.REPO_ROOT)
    url = f"{config['server']}/api/agen"

    cpu_sample_prev: tuple[int, int] | None = None
    interval_sec = 15
    hasil_tertunda: list[dict] = spool_load()

    while True:
        health, cpu_sample_prev = kumpulkan_kesehatan(cpu_sample_prev)
        perangkat = kumpulkan_perangkat()

        body = {
            "serverId": config["serverId"],
            "agenKunci": config["agenKunci"],
            **health,
            "perangkat": perangkat,
            "hasilPerintah": hasil_tertunda,
        }

        try:
            reply = post_json(url, body)
        except (urllib.error.URLError, urllib.error.HTTPError) as err:
            print(f"denyut gagal: {err}", file=sys.stderr)
            spool_save(hasil_tertunda)  # keep unreported results for next attempt
            time.sleep(interval_sec)
            continue

        if not reply.get("ok"):
            print(f"denyut ditolak: {reply.get('kode', 'tidak diketahui')}", file=sys.stderr)
            time.sleep(interval_sec)
            continue

        hasil_tertunda = []  # this cycle's results were just accepted
        spool_save([])

        for perintah in reply.get("perintah", []):
            hasil = commands.jalankan(perintah["aksi"], perintah.get("argumen") or {}, repo_root)
            hasil_tertunda.append({"id": perintah["id"], "status": hasil.status, "keluaran": hasil.keluaran})

        interval_sec = reply.get("intervalDetik", 600)
        time.sleep(interval_sec)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="perintah", required=True)

    p_enroll = sub.add_parser("enroll", help="exchange a one-time token for a long-lived agent key")
    p_enroll.add_argument("--kode", required=True)
    p_enroll.add_argument("--token", required=True)
    p_enroll.add_argument("--server", required=True)
    p_enroll.add_argument("--repo-root", default=commands.REPO_ROOT)
    p_enroll.set_defaults(func=cmd_enroll)

    p_run = sub.add_parser("run", help="the heartbeat loop (what systemd runs)")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
