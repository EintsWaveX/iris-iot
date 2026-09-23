"""Drive modul4/server.py with five independent fake Beacon/Hunter pairs.

Lets the scoreboard be developed and checked without ten ESP32 boards on a
bench. Each pair is fully independent -- its own Beacon connection, its own
fake hunter walking a simulated distance from ITS OWN target -- matching the
real game, where five groups each hunt a different hidden board rather than
racing for one shared beacon. Each fake hunter's RSSI is derived from its own
distance with realistic multipath noise, so the median + EWMA filter in the
real sketch has something to actually smooth.

    python modul4/server.py             (in one terminal)
    python modul4/tools/fake_hunt.py    (in another)

Options worth knowing:

    --drop 5        make hunter 5 vanish after 10 s, to check "lost signal"
    --winner 3      make hunter 3 close in fast, to reach the nominate range
    --seconds 30    stop after 30 s instead of running until interrupted
    --arena 400     spread the hunters over a 400 m building instead of a room
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import random
from datetime import datetime

from websockets.asyncio.client import connect

BEACON_PERIOD = 0.2
GROUPS = (1, 2, 3, 4, 5)


def timestamp() -> str:
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


def rssi_at(metres: float) -> int:
    """Log-distance path loss with the multipath spikes a real room has.

    Bottoms out at the SX1276's own noise floor rather than falling forever,
    because that is what a hunter at the far end of a large building actually
    reports: a weak reading that stops getting weaker, and then silence.
    """
    base = -40 - 22 * math.log10(max(metres, 0.5))
    value = base + random.gauss(0, 3.5) + random.choice([0, 0, 0, -8])
    return int(round(max(value, NOISE_FLOOR_DBM)))


# Di bawah nilai ini paketnya tidak lagi terpecahkan dan hunter tidak pernah
# melaporkan apa pun.
NOISE_FLOOR_DBM = -123.0


class Beacon:
    def __init__(self, gid: int) -> None:
        self.gid = gid
        self.seq = 0

    async def run(self, url: str, stop: asyncio.Event) -> None:
        async with connect(url + "/beacon") as ws:
            print(f"beacon {self.gid} connected")
            while not stop.is_set():
                self.seq += 1
                sent_at = timestamp()
                await ws.send(json.dumps({
                    "grup": self.gid, "seq": self.seq, "tx": sent_at,
                }))
                self.last = (self.seq, sent_at)
                await asyncio.sleep(BEACON_PERIOD)


async def hunter(url: str, gid: int, beacon: Beacon, stop: asyncio.Event,
                 drop_at: float | None, closing_fast: bool,
                 arena: float) -> None:
    # Each group starts somewhere different and wanders; the "winner" walks
    # steadily toward the beacon so the nominate threshold is reached.
    # Everyone starts scattered across the arena. The pace, though, is a
    # walking pace and does NOT scale with it: a person crosses a big building
    # by walking for longer, not by moving faster, and a simulator that
    # cheats here would make a 400 m arena look findable in fifteen seconds.
    distance = random.uniform(0.12 * arena, 0.90 * arena)
    pace = 1.4 * BEACON_PERIOD          # ~1.4 m/s, a brisk indoor walk
    drift = random.uniform(-pace, pace)
    elapsed = 0.0

    window: list[int] = []
    smoothed: float | None = None

    async with connect(url + "/hunter") as ws:
        print(f"hunter {gid} connected at {distance:.0f} m")
        while not stop.is_set():
            await asyncio.sleep(BEACON_PERIOD)
            elapsed += BEACON_PERIOD

            if drop_at is not None and elapsed > drop_at:
                print(f"hunter {gid} dropping off the network")
                return

            if closing_fast:
                distance = max(1.0, distance - pace)
            else:
                drift += random.uniform(-0.25 * pace, 0.25 * pace)
                drift = max(-1.7 * pace, min(1.7 * pace, drift))
                distance = max(2.0, min(1.3 * arena, distance + drift))

            if not hasattr(beacon, "last"):
                continue
            seq, sent_at = beacon.last

            # Roughly 4% of packets never arrive, which gives the scoreboard's
            # loss column something real to count.
            if random.random() < 0.04:
                continue

            raw = rssi_at(distance)

            window.append(raw)
            del window[:-5]
            median = sorted(window)[len(window) // 2]
            smoothed = median if smoothed is None else 0.25 * median + 0.75 * smoothed

            await ws.send(json.dumps({
                "grup": gid,
                "seq": seq,
                "rssi": raw,
                "halus": round(smoothed, 1),
                "snr": round(random.uniform(4, 11), 1),
                "tx": sent_at,
                "rx": timestamp(),
                "ip": f"192.168.4.{10 + gid}",
            }))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="ws://127.0.0.1:8080")
    parser.add_argument("--winner", type=int, default=3)
    parser.add_argument("--drop", type=int, default=5)
    parser.add_argument("--seconds", type=float, default=0.0)
    parser.add_argument("--arena", type=float, default=50.0, metavar="METER",
                        help="jari-jari arena yang disimulasikan (bawaan 50)")
    args = parser.parse_args()

    stop = asyncio.Event()
    beacons = {gid: Beacon(gid) for gid in GROUPS}

    tasks = [asyncio.create_task(b.run(args.url, stop)) for b in beacons.values()]
    await asyncio.sleep(0.3)  # let each beacon publish a first seq

    for gid in GROUPS:
        tasks.append(asyncio.create_task(hunter(
            args.url, gid, beacons[gid], stop,
            drop_at=10.0 if gid == args.drop else None,
            closing_fast=(gid == args.winner),
            arena=args.arena,
        )))

    if args.seconds:
        await asyncio.sleep(args.seconds)
        stop.set()
        await asyncio.sleep(0.4)
        for task in tasks:
            task.cancel()
    else:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nfake hunt stopped")
