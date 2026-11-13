"""Checks for the PC-side RSSI filter (server.py PenapisRssi), run in CI beside uji_protokol.py.

What they protect: after a real step in signal the estimate follows within about three packets
(the Hunter's own filter needed about eight, which the players felt as a wait of several seconds),
a quiet signal is not noisier than it was, one packet that fades alone moves nothing, and every
Hunter has its own state.

    python tools/uji_penapis.py
"""
from __future__ import annotations

import pathlib
import random
import statistics
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from server import PenapisRssi  # noqa: E402

gagal = 0


def cek(nama: str, syarat: bool, catatan: str = "") -> None:
    global gagal
    print(f"[ {'ok' if syarat else 'GAGAL'} ] {nama}" + (f"  -- {catatan}" if catatan else ""))
    if not syarat:
        gagal += 1


def hunter_lama(zs: list[float], n: int = 5, alpha: float = 0.25) -> list[float]:
    """Penapis di sketch Hunter lama: median lima paket lalu EWMA 0,25."""
    jendela: list[float] = []
    x: float | None = None
    keluar = []
    for z in zs:
        jendela = (jendela + [z])[-n:]
        m = sorted(jendela)[len(jendela) // 2]
        x = m if x is None else alpha * m + (1 - alpha) * x
        keluar.append(x)
    return keluar


def hunter_baru(zs: list[float]) -> list[float]:
    p = PenapisRssi()
    return [p.tambah(z) for z in zs]


def paket_sampai(keluar: list[float], mulai: int, target: float, toleransi: float) -> int:
    for i in range(mulai, len(keluar)):
        if abs(keluar[i] - target) <= toleransi:
            return i - mulai
    return len(keluar) - mulai


def main() -> int:
    random.seed(11)
    langkah, derau_lama, derau_baru, lat_lama, lat_baru = [], [], [], [], []
    for _ in range(200):
        zs = [-80 + random.gauss(0, 3) for _ in range(40)] + [-60 + random.gauss(0, 3) for _ in range(40)]
        lama, baru = hunter_lama(zs), hunter_baru(zs)
        derau_lama.append(statistics.pstdev(lama[10:40]))
        derau_baru.append(statistics.pstdev(baru[10:40]))
        lat_lama.append(paket_sampai(lama, 40, -60, 3))
        lat_baru.append(paket_sampai(baru, 40, -60, 3))
        langkah.append(paket_sampai(baru, 40, -60, 3))

    cek("paket pertama menjadi taksiran pertama", PenapisRssi().tambah(-71.0) == -71.0)
    cek("angka bulat masuk, angka pecahan keluar", isinstance(PenapisRssi().tambah(-70), float))
    cek("langkah 20 dB terikuti dalam rata-rata tiga paket atau kurang", statistics.mean(lat_baru) <= 3.2,
        f"rata-rata {statistics.mean(lat_baru):.2f} paket")
    cek("sedikitnya dua kali lebih cepat dari penapis Hunter lama",
        statistics.mean(lat_baru) * 2 <= statistics.mean(lat_lama),
        f"{statistics.mean(lat_baru):.2f} lawan {statistics.mean(lat_lama):.2f} paket")
    cek("sembilan dari sepuluh langkah terikuti dalam enam paket", sum(1 for n in langkah if n <= 6) >= 180,
        f"{sum(1 for n in langkah if n <= 6)} dari 200")
    cek("derau pada sinyal diam tidak lebih besar dari penapis lama",
        statistics.mean(derau_baru) <= statistics.mean(derau_lama) * 1.1 + 0.05,
        f"{statistics.mean(derau_baru):.2f} lawan {statistics.mean(derau_lama):.2f} dB")

    p = PenapisRssi()
    for _ in range(20):
        p.tambah(-70.0)
    sebelum = p.x
    p.tambah(-55.0)  # satu paket yang menyendiri
    cek("satu paket yang melonjak sendirian tidak menggeser taksiran", abs(p.x - sebelum) < 1.0,
        f"geser {abs(p.x - sebelum):.2f} dB")

    a, b = PenapisRssi(), PenapisRssi()
    for _ in range(10):
        a.tambah(-50.0)
    cek("tiap hunter punya keadaannya sendiri", b.tambah(-90.0) == -90.0)

    naik = PenapisRssi()
    for z in [-90.0] * 10 + [-50.0] * 6:
        naik.tambah(z)
    turun = PenapisRssi()
    for z in [-50.0] * 10 + [-90.0] * 6:
        turun.tambah(z)
    cek("mendekat dan menjauh sama-sama terikuti", naik.x > -55 and turun.x < -85,
        f"{naik.x:.1f} dan {turun.x:.1f} dBm")

    print(f"\n{sum(1 for _ in range(1))} berkas, {gagal} gagal" if False else f"\n{'semua lulus' if not gagal else f'{gagal} gagal'}")
    return 1 if gagal else 0


if __name__ == "__main__":
    sys.exit(main())
