#!/usr/bin/env python3
"""IRIS IoT practicum site — Phase 2 protocol suite against a REAL deployed
API. Mirrors hunt/tools/uji_protokol.py's pattern (start a real server,
run the actual protocol against it, assert), with one structural
difference worth stating plainly: hunt's target is a throwaway LOCAL
process this tool starts itself, safe to run any number of times. This
tool's target is whatever --server points at -- typically the real
production deployment, backed by the real shared database -- so it is NOT
wired into CI the way hunt's suite is (CI's own web job runs against a
placeholder DATABASE_URL with no live database at all). This is a manual
verification tool, run by hand the same way Phase 1's live end-to-end
checks were: a real assistant login, a real server registration, a real
agent enrollment.

Self-cleaning: registers one disposable server (a random `uji-...` kode)
and deletes it via DELETE /api/server/:id at the end, success or failure,
so a run never leaves debris in the real database.

Usage:
    python3 agent/tools/uji_protokol.py --server https://iris-praktikum-jurnal.vercel.app \\
        --nim 101022300013

Password is computed as nim + "1715", the same non-secret scheme
web/src/lib/auth.ts documents -- there is nothing to hide passing it on a
command line here that isn't already true of every assistant's password.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import secrets
import sys
import urllib.error
import urllib.request

pass_ = 0
fail = 0


def check(name: str, condition: bool, detail: object = None) -> None:
    global pass_, fail
    if condition:
        pass_ += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name}", detail if detail is not None else "")


class Client:
    """A tiny cookie-aware JSON HTTP client -- stdlib only, matching the
    project's rule everywhere else. The cookie jar is what lets this act as
    one continuous assistant session across several POSTs, the same way a
    browser tab would."""

    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def post(self, path: str, body: dict) -> tuple[int, dict]:
        return self._request("POST", path, body)

    def get(self, path: str) -> tuple[int, dict]:
        return self._request("GET", path, None)

    def delete(self, path: str) -> tuple[int, dict]:
        return self._request("DELETE", path, None)

    def _request(self, method: str, path: str, body: dict | None) -> tuple[int, dict]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        try:
            with self.opener.open(req, timeout=15) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            try:
                return err.code, json.loads(err.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return err.code, {}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", required=True, help="e.g. https://iris-praktikum-jurnal.vercel.app")
    parser.add_argument("--nim", required=True, help="a real assistant NIM from data_asisten.typ")
    args = parser.parse_args()

    asisten = Client(args.server)
    server_id: int | None = None

    try:
        print("-- Assistant login --")
        status, reply = asisten.post("/api/auth/asisten", {"nim": args.nim, "password": args.nim + "1715"})
        check("login succeeds", reply.get("ok") is True, reply)
        if not reply.get("ok"):
            print("cannot continue without a session", file=sys.stderr)
            return 1

        print("\n-- Register a disposable server --")
        kode = "uji-" + secrets.token_hex(4)
        status, reply = asisten.post("/api/server", {"nama": "Uji protokol", "kode": kode})
        check("server registered", reply.get("ok") is True, reply)
        server_id = reply.get("id")
        token = reply.get("token")

        print("\n-- Enroll the agent (public route, no cookie) --")
        agen = Client(args.server)
        status, reply = agen.post("/api/agen", {"kode": kode, "token": token})
        check("enrollment succeeds", reply.get("ok") is True, reply)
        agen_kunci = reply.get("agenKunci")

        status, reply = agen.post("/api/agen", {"kode": kode, "token": token})
        check("reused token is refused", reply.get("ok") is False, reply)

        print("\n-- Heartbeat --")
        status, reply = agen.post(
            "/api/agen",
            {
                "serverId": server_id,
                "agenKunci": "salah-sekali",
                "cpu": 1,
                "memori": 1,
                "disk": 1,
                "jamSelaras": True,
            },
        )
        check("wrong agent key is refused", status == 401 and reply.get("ok") is False, (status, reply))

        status, reply = agen.post(
            "/api/agen",
            {
                "serverId": server_id,
                "agenKunci": agen_kunci,
                "cpu": 12,
                "memori": 34,
                "disk": 56,
                "suhu": 45,
                "uptimeSec": 3600,
                "jamSelaras": True,
                "modeJaringan": "ethernet-router",
                "layanan": {"mosquitto": "aktif"},
                "perangkat": [{"mac": "24:6F:28:AA:BB:CC", "ip": "192.168.4.50", "sumber": "arp"}],
                "hasilPerintah": [],
            },
        )
        check("heartbeat accepted", reply.get("ok") is True, reply)
        check("interval hint present", isinstance(reply.get("intervalDetik"), int), reply)
        check("no commands pending yet", reply.get("perintah") == [], reply)

        print("\n-- Queue a command as the assistant --")
        status, reply = asisten.post(
            "/api/tindakan",
            {"tipe": "kirim", "serverId": server_id, "aksi": "jam.selaraskan", "argumen": {}},
        )
        check("command queued", reply.get("ok") is True, reply)

        status, reply = asisten.post(
            "/api/tindakan",
            {"tipe": "kirim", "serverId": server_id, "aksi": "reboot.paksa", "argumen": {}},
        )
        check("unknown action is refused", reply.get("ok") is False, reply)

        print("\n-- Next heartbeat delivers the command --")
        status, reply = agen.post(
            "/api/agen",
            {"serverId": server_id, "agenKunci": agen_kunci, "cpu": 10, "jamSelaras": True, "perangkat": []},
        )
        perintah_list = reply.get("perintah", [])
        check("queued command delivered", any(p.get("aksi") == "jam.selaraskan" for p in perintah_list), reply)
        perintah_id = next((p["id"] for p in perintah_list if p.get("aksi") == "jam.selaraskan"), None)

        print("\n-- Report the result --")
        status, reply = agen.post(
            "/api/agen",
            {
                "serverId": server_id,
                "agenKunci": agen_kunci,
                "cpu": 10,
                "jamSelaras": True,
                "perangkat": [],
                "hasilPerintah": [{"id": perintah_id, "status": "selesai", "keluaran": "ok"}],
            },
        )
        check("result accepted", reply.get("ok") is True, reply)

        print("\n-- Assistant sees the outcome --")
        status, reply = asisten.get(f"/api/server/{server_id}")
        selesai = any(
            p["id"] == perintah_id and p["status"] == "selesai" for p in reply.get("perintah", [])
        )
        check("command history shows selesai", selesai, reply)
        check("device from the heartbeat appears", len(reply.get("perangkat", [])) >= 1, reply)

        print("\n-- Adopt the discovered device --")
        perangkat_id = reply["perangkat"][0]["id"]
        status, reply2 = asisten.post(
            "/api/tindakan", {"tipe": "adopsi", "id": perangkat_id, "nama": "Uji ESP32", "jenis": "esp32"}
        )
        check("adoption succeeds", reply2.get("ok") is True, reply2)

    finally:
        if server_id is not None:
            print("\n-- Cleanup --")
            status, reply = asisten.delete(f"/api/server/{server_id}")
            check("disposable server deleted", reply.get("ok") is True, reply)

    print(f"\n{pass_} lulus, {fail} gagal")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
