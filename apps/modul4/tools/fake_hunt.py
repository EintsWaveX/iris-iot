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

The game modes (Module 4 redesign):

    --jalur         every hunter walks a noisy approach curve to its own
                    beacon, with two setbacks each, finishing at staggered
                    times -- the shape the sonar, trail, lanes and replay
                    were designed against
    --tempo 4       run the walk four times faster than real time
    --bot --token K also play the people: a demo roster for the running
                    session, one bot member per group that picks a role,
                    pings, sweeps once and claims at Membara, plus a bot
                    assistant that rules on claims (rejecting the first one
                    from group 3) and makes one announcement. Log in on a
                    phone as D0300 to join group 3 next to its bot.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import random
from datetime import datetime

from websockets.asyncio.client import connect

# Titik berangkat (meter) dan detik temu tiap kelompok untuk --jalur, pada
# tempo 1. Sama dengan simulasi prototipe, supaya yang disetujui di sana
# adalah yang terlihat di sini.
JALUR_AWAL = {1: 210.0, 2: 262.0, 3: 176.0, 4: 238.0, 5: 150.0}
JALUR_TEMU = {1: 905.0, 2: 1120.0, 3: 760.0, 4: 1190.0, 5: 1010.0}

DEMO_REGU = {
    1: ("Vela", ["Ayu Pratiwi", "Bima Saputra", "Citra Lestari", "Dimas Aditya"]),
    2: ("Lyra", ["Eka Wulandari", "Fajar Nugroho", "Gita Maharani", "Hendra Wijaya"]),
    3: ("Cygnus", ["Intan Permata", "Joko Santoso", "Kirana Dewi", "Lutfi Hakim"]),
    4: ("Orion", ["Maya Anggraini", "Naufal Rizky", "Oktavia Putri", "Pandu Wibowo"]),
    5: ("Carina", ["Qori Amalia", "Rafi Hidayat", "Salsa Nabila", "Tegar Firmansyah"]),
}
PERAN_BOT = ("pemandu", "pengintai", "operator")

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


class Jalur:
    """Jarak satu kelompok terhadap beacon-nya sendiri, detik demi detik.

    Interpolasi pada log jarak dari titik berangkat ke ~1 m, dua kemunduran
    (salah belok, tembok di jalan) dan jalan acak kecil, lalu berdiri di
    samping beacon sesudah detik temunya. Hanya waktu yang dipercepat oleh
    --tempo; bentuk kurvanya tetap.
    """

    def __init__(self, gid: int, tempo: float) -> None:
        self.gid = gid
        self.awal = JALUR_AWAL[gid]
        self.temu = JALUR_TEMU[gid] / tempo
        self.tempo = tempo
        rnd = random.Random(gid * 7919)
        self.kemunduran = [0.24 + 0.08 * rnd.random(), 0.48 + 0.1 * rnd.random()]
        self.acak = 0.0
        self.rnd = rnd

    def jarak(self, t: float) -> float:
        if t >= self.temu:
            return 1.2 + 0.4 * math.sin(t * 0.9 + self.gid)
        p = t / self.temu
        e = p ** 1.5
        lnd = math.log(self.awal) * (1 - e) + math.log(1.1) * e
        lebar = 50.0 / self.tempo
        for f in self.kemunduran:
            x = (t - f * self.temu) / lebar
            if -1 < x < 1:
                lnd += 0.6 * math.cos(x * math.pi / 2) ** 2
        self.acak = self.acak * 0.94 + (self.rnd.random() - 0.5) * 0.08
        lnd += self.acak * (1 - e * 0.8)
        return math.exp(lnd)


def rssi_ruang_bebas(metres: float) -> int:
    """RSSI pada n = 2.0 (bawaan server untuk lapangan terbuka), berderau."""
    base = -40 - 20 * math.log10(max(metres, 0.5))
    value = base + random.gauss(0, 2.5) + random.choice([0, 0, 0, 0, -6])
    return int(round(max(value, NOISE_FLOOR_DBM)))


async def hunter_jalur(url: str, gid: int, beacon: Beacon, stop: asyncio.Event,
                       tempo: float) -> None:
    jalur = Jalur(gid, tempo)
    window: list[int] = []
    smoothed: float | None = None
    mulai = asyncio.get_event_loop().time()
    async with connect(url + "/hunter") as ws:
        print(f"hunter {gid} berjalan dari {jalur.awal:.0f} m, "
              f"temu sekitar detik {jalur.temu:.0f}")
        while not stop.is_set():
            await asyncio.sleep(BEACON_PERIOD)
            if not hasattr(beacon, "last") or random.random() < 0.03:
                continue
            t = asyncio.get_event_loop().time() - mulai
            raw = rssi_ruang_bebas(jalur.jarak(t))
            window.append(raw)
            del window[:-5]
            median = sorted(window)[len(window) // 2]
            smoothed = median if smoothed is None else 0.25 * median + 0.75 * smoothed
            seq, sent_at = beacon.last
            snr = 10.5 - (-40 - smoothed) / 7 + random.uniform(-1.2, 1.2)
            await ws.send(json.dumps({
                "grup": gid, "seq": seq, "rssi": raw, "halus": round(smoothed, 1),
                "snr": round(max(-12.0, min(12.0, snr)), 1),
                "tx": sent_at, "rx": timestamp(),
                "ip": f"192.168.4.{20 + gid}",
            }))


async def tanya(ws, aksi: str, timeout: float = 4.0) -> dict | None:
    """Kirim satu aksi lalu tunggu balasannya, lewati bingkai siaran."""
    async def cari():
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("tipe") in ("balas", "halo", "masuk") and \
                    (msg.get("aksi") == aksi or msg.get("tipe") == aksi):
                return msg
        return None
    try:
        return await asyncio.wait_for(cari(), timeout)
    except asyncio.TimeoutError:
        return None


async def siapkan_sesi(url: str, token: str) -> None:
    """Pastikan ada sesi berjalan yang berisi regu demo, lalu mulai bersih."""
    async with connect(url + "/live") as ws:
        await ws.send(json.dumps({"aksi": "halo", "token": token}))
        r = await tanya(ws, "halo")
        if not r or r.get("peran") != "asisten":
            raise SystemExit("token asisten ditolak; periksa --token")
        await ws.send(json.dumps({"aksi": "jadwal_baca"}))
        r = await tanya(ws, "jadwal_baca")
        jadwal = (r or {}).get("jadwal") or {}
        sid = jadwal.get("aktif") or 1
        regu = {
            str(g): {"nama": nama, "aktif": True, "anggota": [
                {"nim": f"D0{g}{i:02d}", "nama": orang}
                for i, orang in enumerate(anggota)]}
            for g, (nama, anggota) in DEMO_REGU.items()
        }
        await ws.send(json.dumps({"aksi": "jadwal_set", "sesi": sid, "regu": regu}))
        r = await tanya(ws, "jadwal_set")
        if not r or not r.get("ok"):
            raise SystemExit(f"jadwal demo ditolak: {(r or {}).get('alasan')}")
        await ws.send(json.dumps({"aksi": "sesi_mulai", "sesi": sid}))
        await tanya(ws, "sesi_mulai")
        print(f"sesi {sid} dimulai dengan regu demo (masuk sebagai D0300 untuk Cygnus)")


async def bot_anggota(url: str, gid: int, stop: asyncio.Event, tempo: float) -> None:
    """Satu anggota kelompok: peran, sinyal, sapuan sekali, klaim di Membara."""
    nim = f"D0{gid}01"
    rnd = random.Random(gid * 31)
    async with connect(url + "/live") as ws:
        await ws.send(json.dumps({"aksi": "halo", "nim": nim}))
        await tanya(ws, "halo")
        await ws.send(json.dumps({"aksi": "tim_peran",
                                  "peran": PERAN_BOT[gid % len(PERAN_BOT)]}))
        berikut_ping = 25 / tempo + rnd.random() * 40 / tempo
        sudah_sapu = False
        panggil_at = None
        klaim_at = -99.0
        mulai = asyncio.get_event_loop().time()
        async for raw in ws:
            if stop.is_set():
                return
            f = json.loads(raw)
            if f.get("tipe", "bingkai") != "bingkai":
                continue
            t = asyncio.get_event_loop().time() - mulai
            baris = next((g for g in f.get("grup", []) if g["grup"] == gid), None)
            if baris is None:
                continue
            if t >= berikut_ping and baris["status"] != "menang":
                kode = rnd.choice(["ke_sini", "naik", "tunggu", "naik"])
                await ws.send(json.dumps({"aksi": "ping", "kode": kode}))
                berikut_ping = t + (45 + rnd.random() * 60) / tempo
            if not sudah_sapu and baris.get("kemajuan", 0) > 0.3:
                sudah_sapu = True
                terkuat = rnd.randrange(8)
                dasar = baris["halus"] or -80.0
                arah = [round(dasar - 3 - 9 * (1 - math.cos(
                    (i - terkuat) * math.pi / 4)) / 2 + rnd.uniform(-1.5, 1.5), 1)
                    for i in range(8)]
                await ws.send(json.dumps({"aksi": "sapuan", "arah": arah,
                                          "mode": "manual"}))
            if gid == 4 and panggil_at is None and t > 300 / tempo:
                panggil_at = t
                await ws.send(json.dumps({"aksi": "panggil_asisten"}))
            if baris["heat"] == "membara" and baris["status"] in ("memburu", "ditolak") \
                    and baris.get("online") and t - klaim_at > 6:
                klaim_at = t
                await ws.send(json.dumps({"aksi": "klaim", "grup": gid}))


async def bot_asisten(url: str, token: str, stop: asyncio.Event, tempo: float) -> None:
    """Asisten tiruan: menilai klaim menurut urutan, sekali menolak Cygnus."""
    ditolak = set()
    sejak: dict[int, float] = {}
    tutup: dict[int, float] = {}
    mengumumkan = False
    async with connect(url + "/live") as ws:
        await ws.send(json.dumps({"aksi": "halo", "token": token}))
        await tanya(ws, "halo")
        mulai = asyncio.get_event_loop().time()
        async for raw in ws:
            if stop.is_set():
                return
            f = json.loads(raw)
            if f.get("tipe", "bingkai") != "bingkai":
                continue
            now = asyncio.get_event_loop().time()
            if not mengumumkan and now - mulai > 120 / tempo:
                mengumumkan = True
                await ws.send(json.dumps({
                    "aksi": "pengumuman",
                    "teks": "Foto beacon dengan jelas saat mengklaim."}))
            for klaim in f.get("antrian", []):
                g = klaim["grup"]
                sejak.setdefault(g, now)
                if now - sejak[g] < 8:
                    continue
                sejak.pop(g, None)
                if g == 3 and g not in ditolak:
                    ditolak.add(g)
                    await ws.send(json.dumps({
                        "aksi": "tolak", "grup": g,
                        "alasan": "Foto buram, beacon tidak terlihat."}))
                else:
                    await ws.send(json.dumps({"aksi": "konfirmasi", "grup": g}))
                break
            for g, lama in (f.get("panggil") or {}).items():
                if lama > 60 / tempo and now - tutup.get(int(g), 0) > 2:
                    tutup[int(g)] = now
                    await ws.send(json.dumps({"aksi": "panggil_selesai",
                                              "grup": int(g)}))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="ws://127.0.0.1:8080")
    parser.add_argument("--winner", type=int, default=3)
    parser.add_argument("--drop", type=int, default=5)
    parser.add_argument("--seconds", type=float, default=0.0)
    parser.add_argument("--arena", type=float, default=50.0, metavar="METER",
                        help="jari-jari arena yang disimulasikan (bawaan 50)")
    parser.add_argument("--jalur", action="store_true",
                        help="kelima hunter berjalan menuju beacon masing-masing")
    parser.add_argument("--tempo", type=float, default=1.0,
                        help="percepatan waktu untuk --jalur (bawaan 1)")
    parser.add_argument("--bot", action="store_true",
                        help="anggota dan asisten tiruan; butuh --token")
    parser.add_argument("--token", default=None,
                        help="token asisten server, untuk --bot")
    args = parser.parse_args()

    if args.bot and not args.token:
        parser.error("--bot butuh --token")
    if args.bot:
        await siapkan_sesi(args.url, args.token)

    stop = asyncio.Event()
    beacons = {gid: Beacon(gid) for gid in GROUPS}

    tasks = [asyncio.create_task(b.run(args.url, stop)) for b in beacons.values()]
    await asyncio.sleep(0.3)  # let each beacon publish a first seq

    for gid in GROUPS:
        if args.jalur:
            tasks.append(asyncio.create_task(hunter_jalur(
                args.url, gid, beacons[gid], stop, max(0.1, args.tempo))))
        else:
            tasks.append(asyncio.create_task(hunter(
                args.url, gid, beacons[gid], stop,
                drop_at=10.0 if gid == args.drop else None,
                closing_fast=(gid == args.winner),
                arena=args.arena,
            )))

    if args.bot:
        for gid in GROUPS:
            tasks.append(asyncio.create_task(
                bot_anggota(args.url, gid, stop, max(0.1, args.tempo))))
        tasks.append(asyncio.create_task(
            bot_asisten(args.url, args.token, stop, max(0.1, args.tempo))))

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
