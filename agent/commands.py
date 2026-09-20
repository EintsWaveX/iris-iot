"""IRIS IoT practicum site — agent: the whitelisted command executor.

This is the riskiest file in the whole Phase 2 addition: it is what lets a
dashboard click cause a Pi to actually do something. The rule that makes
that acceptable is simple and never bent -- every action maps to a FIXED,
hardcoded argv list, run with subprocess and shell=False. There is no string
formatting a server-supplied value into a command line anywhere in this
file, because that is the one mistake that turns "restart a named service"
into "run whatever the caller wants."

AKSI mirrors web/src/lib/server-lib.ts's AKSI_PERINTAH list exactly, and is
checked again here even though the cloud side already validated it before
queuing the command -- an agent that trusted the network to have been the
only thing enforcing this rule would be one compromised or buggy API route
away from executing an arbitrary action.
"""
from __future__ import annotations

import subprocess

LAYANAN_UNIT = {
    "modul2-ws": "iris-modul2-ws.service",
    "mosquitto": "mosquitto.service",
    "modul4": "modul4.service",
}

REPO_ROOT = "/home/iris/IRIS-ASO"  # overridden by AGENT_REPO_ROOT in agent.py's config


def _systemctl(verb: str, unit: str) -> list[str]:
    return ["sudo", "/usr/bin/systemctl", verb, unit]


def build_argv(aksi: str, argumen: dict[str, str], repo_root: str) -> list[str] | None:
    """Returns the exact argv to run, or None if `aksi` (or an argument it
    depends on) is not recognised. Never raises -- an unrecognised action is
    a normal, expected outcome (the whitelist can only ever shrink relative
    to what a stale cloud deployment might queue), not an exceptional one."""
    if aksi in ("layanan.mulai", "layanan.henti", "layanan.mulai_ulang"):
        layanan = argumen.get("layanan", "")
        unit = LAYANAN_UNIT.get(layanan)
        if unit is None:
            return None
        verb = {"layanan.mulai": "start", "layanan.henti": "stop", "layanan.mulai_ulang": "restart"}[aksi]
        return _systemctl(verb, unit)

    if aksi == "ap.nyala":
        return ["sudo", f"{repo_root}/scripts/opi_ap_on.sh"]
    if aksi == "ap.mati":
        return ["sudo", f"{repo_root}/scripts/opi_ap_off.sh"]
    if aksi == "jam.selaraskan":
        return ["sudo", "/usr/bin/systemctl", "restart", "systemd-timesyncd.service"]

    return None


class HasilPerintah:
    def __init__(self, status: str, keluaran: str) -> None:
        self.status = status  # "selesai" | "gagal"
        self.keluaran = keluaran


def jalankan(aksi: str, argumen: dict[str, str], repo_root: str, timeout_sec: int = 30) -> HasilPerintah:
    """Runs one command to completion (or until timeout_sec) and reports the
    outcome. Never raises: every failure mode -- unknown action, missing
    binary, non-zero exit, timeout -- becomes a HasilPerintah the caller can
    report back on the next heartbeat, the same way a route handler here
    always returns a JSON body rather than letting an exception reach the
    HTTP layer."""
    argv = build_argv(aksi, argumen, repo_root)
    if argv is None:
        return HasilPerintah("gagal", f"aksi tidak dikenal: {aksi!r} {argumen!r}")

    try:
        result = subprocess.run(
            argv,
            shell=False,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired:
        return HasilPerintah("gagal", f"waktu habis setelah {timeout_sec} detik")
    except OSError as err:
        return HasilPerintah("gagal", f"tidak dapat menjalankan perintah: {err}")

    keluaran = (result.stdout + result.stderr).strip()[:2000]  # bounded: this lands in a text column
    if result.returncode != 0:
        return HasilPerintah("gagal", keluaran or f"keluar dengan kode {result.returncode}")
    return HasilPerintah("selesai", keluaran or "(tidak ada keluaran)")
