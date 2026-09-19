"""IRIS IoT practicum site — agent: system and network collectors.

Every function here is pure: text or file content in, structured data out.
No subprocess calls, no file I/O, live inside this module itself — the
caller (agent.py) reads /proc or runs `ip neigh` and hands the raw output
in. That is what makes these testable with a captured fixture and no Pi.

Standard library only, deliberately, matching hunt/server.py's own rule
(SETUP.md: "lingkungan virtual venv-iris cukup dipakai ulang, tidak ada
dependensi lain") -- an agent that needs `pip install psutil` before it can
even report whether the Pi is healthy is a worse agent than one that reads
/proc itself.
"""
from __future__ import annotations

import re

# -- CPU ----------------------------------------------------------------

# /proc/stat's first "cpu" line: user, nice, system, idle, iowait, irq,
# softirq, steal (guest/guest_nice trail on some kernels; ignored, they're
# already included in user/nice's totals per the kernel's own accounting).
_STAT_RE = re.compile(r"^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)")


def parse_cpu_stat(text: str) -> tuple[int, int]:
    """Returns (busy_ticks, total_ticks) from a /proc/stat read. CPU percent
    needs the DELTA between two samples -- a single /proc/stat read is a
    cumulative counter since boot, not a percentage -- so the caller keeps
    the previous sample and computes:

        busy_pct = 100 * (busy2 - busy1) / (total2 - total1)

    Raises ValueError on unparseable input, since a malformed input here
    means something is wrong with the kernel interface itself, not a
    recoverable data-shape question the caller should paper over.
    """
    match = _STAT_RE.search(text)
    if not match:
        raise ValueError("no 'cpu ' line found in /proc/stat output")
    user, nice, system, idle, iowait, irq, softirq, steal = (int(g) for g in match.groups())
    idle_all = idle + iowait
    busy = user + nice + system + irq + softirq + steal
    return busy, busy + idle_all


def cpu_percent(sample1: tuple[int, int], sample2: tuple[int, int]) -> int | None:
    """None when the two samples are identical (no time has passed, or the
    machine has been running for under a jiffy since the first read) --
    reporting 0% in that case would be indistinguishable from a genuinely
    idle CPU, which is a real and different fact worth keeping separate."""
    busy1, total1 = sample1
    busy2, total2 = sample2
    delta_total = total2 - total1
    if delta_total <= 0:
        return None
    return round(100 * (busy2 - busy1) / delta_total)


# -- memory ---------------------------------------------------------------

_MEMINFO_RE = re.compile(r"^(\w+):\s+(\d+)\s*kB", re.MULTILINE)


def parse_meminfo(text: str) -> int | None:
    """Percent of memory in use, computed from MemTotal/MemAvailable rather
    than MemTotal/MemFree -- MemFree alone counts the page cache as "used",
    which on a Pi that has been up for more than a few minutes makes a
    perfectly healthy machine look like it is about to run out of memory."""
    values = dict(_MEMINFO_RE.findall(text))
    total = values.get("MemTotal")
    available = values.get("MemAvailable")
    if not total or not available:
        return None
    total_kb, available_kb = int(total), int(available)
    if total_kb <= 0:
        return None
    return round(100 * (total_kb - available_kb) / total_kb)


# -- ARP / neighbour table --------------------------------------------------

# `ip neigh show` output, one line per entry, e.g.:
#   192.168.4.23 dev eth0 lladdr b8:27:eb:12:34:56 REACHABLE
_NEIGH_RE = re.compile(
    r"^(?P<ip>\d+\.\d+\.\d+\.\d+)\s+dev\s+\S+\s+lladdr\s+(?P<mac>[0-9a-fA-F:]{17})\s+(?P<state>\S+)",
    re.MULTILINE,
)
# States that mean "this MAC is not currently reachable" -- FAILED and
# INCOMPLETE both mean the kernel tried and got no answer; STALE/DELAY/PROBE
# are still-valid-until-proven-otherwise per the kernel's own ARP cache
# state machine, so they count as present.
_DEAD_STATES = frozenset({"FAILED", "INCOMPLETE"})


def parse_arp_neigh(text: str) -> list[dict[str, str]]:
    """[{mac, ip}, ...] for every neighbour the kernel currently believes is
    reachable. Deduplicated by MAC, keeping the last (most recent) entry --
    a device that changed IP mid-session (DHCP lease churn) should show its
    current address, not its first one."""
    by_mac: dict[str, str] = {}
    for match in _NEIGH_RE.finditer(text):
        if match["state"].upper() in _DEAD_STATES:
            continue
        by_mac[match["mac"].upper()] = match["ip"]
    return [{"mac": mac, "ip": ip} for mac, ip in by_mac.items()]


# -- vendor / device-type guess from MAC OUI --------------------------------

# Mirrors web/src/lib/server-lib.ts's tebakJenisPerangkat() -- same small,
# explicitly-non-authoritative table, kept in two languages because the
# agent (Python, on the Pi) and the adopt-flow validation (TypeScript, on
# Vercel) never share a process to import a single source from. Extend both
# together if this list grows.
_OUI_ESPRESSIF = frozenset(
    {"24:6F:28", "30:AE:A4", "3C:71:BF", "8C:AA:B5", "AC:67:B2", "EC:FA:BC", "A4:CF:12", "24:0A:C4"}
)


def guess_device(mac: str) -> tuple[str | None, str | None]:
    """(vendor, jenis) best-effort guess, or (None, None) if unknown."""
    oui = mac.upper()[:8]
    if oui in _OUI_ESPRESSIF:
        return "Espressif", "esp32"
    return None, None


# -- disk / uptime / temperature -------------------------------------------


def disk_percent(total_bytes: int, used_bytes: int) -> int | None:
    if total_bytes <= 0:
        return None
    return round(100 * used_bytes / total_bytes)


def parse_uptime(text: str) -> int | None:
    """/proc/uptime's first field, seconds since boot, as a whole number."""
    try:
        return int(float(text.strip().split()[0]))
    except (ValueError, IndexError):
        return None


def parse_thermal_zone(text: str) -> int | None:
    """/sys/class/thermal/thermal_zone0/temp reports millidegrees C as a
    bare integer string -- this just does the /1000 and guards against a
    zone that reports garbage. -1 is checked BEFORE the /1000 conversion:
    it is the Linux thermal driver's own "no reading available" sentinel,
    and dividing it by 1000 rounds to 0, which looks exactly like a
    perfectly healthy 0C reading rather than a missing one -- caught by
    this module's own test suite, not by inspection."""
    try:
        millidegrees = int(text.strip())
    except ValueError:
        return None
    if millidegrees == -1:
        return None
    celsius = round(millidegrees / 1000)
    if celsius < -20 or celsius > 150:
        return None
    return celsius


# -- Mosquitto $SYS ----------------------------------------------------------


def parse_mosquitto_clients(payload: str) -> int | None:
    """The payload of $SYS/broker/clients/connected is a bare integer as a
    string -- no JSON, no wrapping, straight from Mosquitto's own broker
    stats. Guards the same way parse_thermal_zone does: a non-numeric
    payload means something upstream changed shape, not that there are
    zero clients."""
    try:
        return int(payload.strip())
    except ValueError:
        return None
