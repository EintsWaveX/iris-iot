#!/usr/bin/env python3
"""
The PM-style (Penalaran Matematika) Logika questions have no C to run, so their keys are
checked here instead: every question gets an entry in PM that recomputes the answer from the
numbers in its own stem, never from the key. scripts/rec-bank-verify.py compares that answer
with the options and with the key.

  python scripts/rec_bank_pm.py --selftest
"""
import re
import sys

PM = {}

# Indonesian numbers: dots group thousands (1.300.000), a comma is the decimal mark (2,25).
_NUM = re.compile(r"-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?")


def parse_num(text):
    """The one number in an option's text, or None when there is none, there are several
    (compare those as text), or a dot decimal makes it ambiguous."""
    found = list(_NUM.finditer(text.replace("`", "")))
    if len(found) != 1:
        return None
    m = found[0]
    if re.match(r"\.\d", text.replace("`", "")[m.end():]):
        return None
    return float(m.group().replace(".", "").replace(",", "."))


from fractions import Fraction as F  # noqa: E402
from math import ceil  # noqa: E402

# ---- single choice: the right answer, worked out from the stem's own numbers ----------------

PM["Diskon Sepatu"] = {"single": float(240000 * (100 - 25) // 100)}

# 100000 + 25000 * h <= 350000, whole hours
PM["Sewa Lapangan"] = {"single": float(max(h for h in range(100) if 100000 + 25000 * h <= 350000))}

# 60 x 40 x 30 cm, three quarters full, 1000 cm3 per liter
PM["Isi Akuarium"] = {"single": float(F(3, 4) * 60 * 40 * 30 / 1000)}

# 7,5 cm on a 1 : 200.000 map, in km (100.000 cm per km)
PM["Skala Peta"] = {"single": float(F(15, 2) * 200000 / 100000)}

PM["Untung Jual Buku"] = {"single": float((18000 - 15000) * 20)}

# rows of 12, 15, 18, ... for 8 rows
PM["Kursi Bioskop"] = {"single": float(sum(12 + 3 * i for i in range(8)))}

PM["Harga Naik Lalu Turun"] = {"single": float(F(50000) * F(110, 100) * F(90, 100))}

# 5 red + 2 green are not blue, out of 5 + 3 + 2
PM["Kelereng Bukan Biru"] = {"single": f"{5 + 2}/{5 + 3 + 2}"}

PM["Dua Keran Bak Air"] = {"single": float(1 / (F(1, 6) + F(1, 3)))}

PM["Rata-rata Dua Kelas"] = {"single": float(F(12 * 80 + 8 * 90, 12 + 8))}


def _pajak(penghasilan):
    # 0% up to 5.000.000, 10% on the part up to 10.000.000, 20% on the part above
    lapis = [(0, 5_000_000, 0), (5_000_000, 10_000_000, 10), (10_000_000, None, 20)]
    total = F(0)
    for bawah, atas, persen in lapis:
        ujung = penghasilan if atas is None else min(penghasilan, atas)
        if ujung > bawah:
            total += F(ujung - bawah) * persen / 100
    return float(total)


PM["Pajak Bertingkat"] = {"single": _pajak(13_000_000)}

# the pattern 4, 9, 16, 25 is (n + 1) squared; the check below proves it reproduces the stem
assert [(n + 1) ** 2 for n in range(1, 5)] == [4, 9, 16, 25]
PM["Pola Ubin"] = {"single": float((10 + 1) ** 2)}

PM["Siswa Suka Pelajaran"] = {"single": float(40 - (24 + 18 - 8))}

# 2 h at 60 km/h covers 120 km; the other 180 km at 80 km/h
PM["Mobil Dua Kecepatan"] = {"single": float(2 + F(300 - 2 * 60, 80))}

# kecil + 2 * besar = 25, besar = 2 * kecil; the answer is 3 * besar
PM["Berat Tiga Kotak"] = {"single": float(next(3 * (2 * k) for k in range(1, 100) if k + 2 * (2 * k) == 25))}

_kg = F(24, 10)
PM["Biaya Kirim Termurah"] = {
    "single": float(min(ceil(_kg) * 9000, ceil(_kg) * 8000, max(F(3), _kg) * 7000))
}

# walls of a 6 x 4 x 3 room, minus a door and two windows, two coats, 2,5 L x 8 m2 per can
_dinding = 2 * (6 + 4) * 3 - 1 * 2 - 2 * F(3, 2) * 1
PM["Cat Dinding"] = {"single": float(ceil(_dinding * 2 / (F(5, 2) * 8)))}

# ---- multi select: each statement's truth, computed -------------------------------------------

_jual = [40, 35, 50, 45, 60]
PM["Penjualan Es Teh"] = {
    "multi": {
        "Rata-rata penjualan per hari adalah 46 gelas.": F(sum(_jual), 5) == 46,
        "Penjualan hari Jumat 50% lebih banyak daripada hari Selasa.": F(_jual[4]) == _jual[1] * F(3, 2),
        "Penjualan naik setiap hari dari Selasa sampai Jumat.": all(_jual[i] < _jual[i + 1] for i in range(1, 4)),
        "Total penjualan Senin sampai Rabu lebih banyak daripada total Kamis dan Jumat.": sum(_jual[:3]) > sum(_jual[3:]),
        "Selisih penjualan terbesar antara dua hari berurutan adalah 20 gelas.": max(abs(a - b) for a, b in zip(_jual, _jual[1:])) == 20,
    }
}

_suku = [3 + 4 * i for i in range(60)]
PM["Pola Barisan Naik Empat"] = {
    "multi": {
        "Suku ke-10 bernilai 39.": _suku[9] == 39,
        "Selisih dua suku berurutan selalu 4.": all(b - a == 4 for a, b in zip(_suku, _suku[1:])),
        "Ada suku yang bernilai 50.": 50 in _suku,
        "Semua suku adalah bilangan ganjil.": all(s % 2 == 1 for s in _suku),
        "Jumlah lima suku pertama adalah 60.": sum(_suku[:5]) == 60,
    }
}

# x even, y odd, both positive: a statement is "pasti benar" when it holds for every such pair
_pasang = [(x, y) for x in range(2, 41, 2) for y in range(1, 41, 2)]
PM["Pasti Benar"] = {
    "multi": {
        "x + y selalu ganjil.": all((x + y) % 2 == 1 for x, y in _pasang),
        "x × y selalu genap.": all((x * y) % 2 == 0 for x, y in _pasang),
        "x − y selalu positif.": all(x - y > 0 for x, y in _pasang),
        "x dibagi 2 selalu menghasilkan bilangan bulat.": all(x % 2 == 0 for x, y in _pasang),
        "y × y selalu genap.": all((y * y) % 2 == 0 for x, y in _pasang),
    }
}


def selftest():
    assert parse_num("1,5") == 1.5
    assert parse_num("Rp1.300.000") == 1300000
    assert parse_num("25%") == 25
    assert parse_num("2,25 jam") == 2.25
    assert parse_num("-4") == -4
    assert parse_num("`312`") == 312
    assert parse_num("tidak ada") is None
    assert parse_num("1 jam 15 menit") is None  # two numbers: compare as text instead
    assert parse_num("2.5") is None  # a dot decimal is ambiguous here: write 2,5
    print("selftest ok")


if __name__ == "__main__" and "--selftest" in sys.argv:
    selftest()
