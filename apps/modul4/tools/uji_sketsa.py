"""
Uji kontrak sketsa: format pesan di firmware melawan server yang sedang hidup.

Sketsa Hunter dan Beacon (repo IRIS ASO, disalin ke apps/web/src/content/
sketches oleh scripts/sync_sketches.py) dan server ini berada di dua repo yang
berbeda, dan satu-satunya hal yang menyatukannya adalah bentuk pesan JSON di
antara keduanya. Ketika bentuk itu menyimpang (medan diganti nama, tanda
kutip hilang, `"seq":%s` yang ternyata menghasilkan JSON rusak), papan tampak
tersambung di Serial Monitor tetapi tidak muncul di papan skor, atau
tersambung-putus sepanjang sesi. Uji ini mengambil string format langsung dari
sketsa, mengisinya dengan nilai contoh, lalu mengirimnya ke server.

    python modul4/server.py --token UJICOBA --tetap &
    python modul4/tools/uji_sketsa.py

Keluar dengan status bukan-nol bila ada satu saja yang gagal.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import re
import sys
import time
import urllib.request

from websockets.asyncio.client import connect

HERE = pathlib.Path(__file__).resolve().parent
SKETSA = HERE.parent.parent / "web" / "src" / "content" / "sketches" / "en"
GRUP = 10            # nomor kelompok yang tidak dipakai uji lain; kuncinya dilaporkan agent

LULUS: list[str] = []
GAGAL: list[str] = []


def cek(nama: str, syarat: bool, catatan: str = "") -> None:
    (LULUS if syarat else GAGAL).append(nama)
    print(f"[{'  ok  ' if syarat else ' GAGAL'}] {nama}{('  -- ' + catatan) if catatan else ''}")


# ---- membaca string format dari sketsa ------------------------------------

LITERAL = re.compile(r'\s*"((?:[^"\\]|\\.)*)"')


def tak_escape(teks: str) -> str:
    return (teks.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\"))


def format_snprintf(kode: str, penyangga: str) -> list[str]:
    """Format dari tiap `snprintf(<penyangga>, sizeof(<penyangga>), "..." "...", args)`."""
    hasil = []
    for m in re.finditer(r"snprintf\(\s*" + re.escape(penyangga) + r"\s*,\s*sizeof\(\s*"
                         + re.escape(penyangga) + r"\s*\)\s*,", kode):
        pos, potongan = m.end(), []
        while True:
            lit = LITERAL.match(kode, pos)
            if not lit:
                break
            potongan.append(lit.group(1))
            pos = lit.end()
        hasil.append(tak_escape("".join(potongan)))
    return hasil


def isi(fmt: str, kunci: str) -> str:
    """Isi tiap penentu format menurut nama medan JSON di depannya."""
    contoh = {
        "grup": GRUP, "k": kunci, "seq": "12", "rssi": -71, "halus": -69.4, "snr": 7.5,
        "tx": "10:00:00:100", "rx": "10:00:00:210", "ip": "192.168.43.7",
        "wifi": -58, "jam": "ntp", "naik": 125, "mem": 150000, "putus": 2, "t0": 12345,
    }

    def ganti(m: re.Match) -> str:
        nilai = contoh[m.group(1)]
        spesifikasi = m.group(2)
        if spesifikasi.endswith("f"):
            return spesifikasi % float(nilai)
        if spesifikasi.endswith("s"):
            return str(nilai)
        return str(int(nilai))

    return re.sub(r'"(\w+)":"?(%[-+0-9.]*l?[dsfu])', lambda m: m.group(0).replace(
        m.group(2), ganti(m)), fmt)


def kunci_server(url_http: str) -> str:
    with urllib.request.urlopen(f"{url_http}/ringkas.json") as resp:
        return json.loads(resp.read())["kunci"][str(GRUP)]


async def bingkai(url: str) -> dict:
    async with connect(url + "/live") as v:
        for _ in range(8):
            m = json.loads(await asyncio.wait_for(v.recv(), 3))
            if m.get("tipe", "bingkai") == "bingkai":
                return m
    return {}


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="ws://127.0.0.1:8080")
    ap.add_argument("--hunter", default=str(SKETSA / "modul4_hunter.ino"))
    ap.add_argument("--beacon", default=str(SKETSA / "modul4_beacon.ino"))
    args = ap.parse_args()
    http = args.url.replace("ws://", "http://", 1).replace("wss://", "https://", 1)

    hunter = pathlib.Path(args.hunter).read_text(encoding="utf-8")
    beacon = pathlib.Path(args.beacon).read_text(encoding="utf-8")
    kunci = kunci_server(http)

    # ---- format yang diambil dari sketsa ------------------------------------
    data_h = format_snprintf(hunter, "payload")
    status_h = [f for f in format_snprintf(hunter, "report") if '"status"' in f]
    minta_h = format_snprintf(hunter, "ask")
    lapor_b = [f for f in format_snprintf(beacon, "report") if '"status"' not in f]
    status_b = [f for f in format_snprintf(beacon, "report") if '"status"' in f]
    minta_b = format_snprintf(beacon, "ask")
    for nama, daftar in (("data hunter", data_h), ("status hunter", status_h),
                         ("permintaan waktu hunter", minta_h), ("laporan beacon", lapor_b),
                         ("status beacon", status_b), ("permintaan waktu beacon", minta_b)):
        cek(f"sketsa memuat format pesan: {nama}", len(daftar) == 1, f"{len(daftar)} ditemukan")
    if GAGAL:
        return 1

    pesan = {
        "data_h": isi(data_h[0], kunci), "status_h": isi(status_h[0], kunci),
        "minta_h": isi(minta_h[0], kunci), "lapor_b": isi(lapor_b[0], kunci),
        "status_b": isi(status_b[0], kunci), "minta_b": isi(minta_b[0], kunci),
    }
    for nama, teks in pesan.items():
        try:
            isi_json = json.loads(teks)
            cek(f"{nama} adalah JSON yang sah", isinstance(isi_json, dict), teks[:90])
        except ValueError as err:
            cek(f"{nama} adalah JSON yang sah", False, f"{err}: {teks[:90]}")
    if GAGAL:
        return 1
    cek("data hunter muat di penyangga 192 byte sketsa", len(pesan["data_h"]) < 192,
        f"{len(pesan['data_h'])} byte dengan nilai contoh")
    cek("status muat di penyangga 170 byte sketsa",
        len(pesan["status_h"]) < 170 and len(pesan["status_b"]) < 170,
        f"{len(pesan['status_h'])}/{len(pesan['status_b'])} byte")

    # ---- dikirim ke server sungguhan ----------------------------------------
    async with connect(args.url + "/hunter") as ws:
        await ws.send(pesan["data_h"])
        await ws.send(pesan["status_h"])
        await ws.send(pesan["minta_h"])
        balasan = json.loads(await asyncio.wait_for(ws.recv(), 3))
        cek("permintaan waktu dari sketsa dibalas server dengan t0 dan ts",
            balasan.get("tipe") == "waktu" and balasan.get("t0") == 12345
            and abs(balasan.get("ts", 0) - time.time() * 1000) < 5000, str(balasan))
        await asyncio.sleep(0.3)
        async with connect(args.url + "/beacon") as wb:
            await wb.send(pesan["lapor_b"])
            await wb.send(pesan["status_b"])
            await wb.send(pesan["minta_b"])
            balasan_b = json.loads(await asyncio.wait_for(wb.recv(), 3))
            await asyncio.sleep(0.3)
            f = await bingkai(args.url)
        cek("permintaan waktu beacon dari sketsa juga dibalas",
            balasan_b.get("tipe") == "waktu" and balasan_b.get("t0") == 12345, str(balasan_b))
        cek("soket hunter tetap terbuka sesudah semua pesan sketsa", ws.close_code is None,
            f"kode={ws.close_code}")

    baris = next((g for g in f.get("grup", []) if g.get("grup") == GRUP), None)
    cek("data hunter dari sketsa muncul sebagai baris kelompok dengan nilainya",
        baris is not None and baris.get("rssi") == -71 and baris.get("seq") == 12
        and baris.get("snr") == 7.5, str(baris and {k: baris.get(k) for k in ("rssi", "seq", "snr")}))
    cek("jeda dihitung dari cap waktu yang dibuat sketsa",
        baris is not None and baris.get("delay_ms") == 110, str(baris and baris.get("delay_ms")))
    cek("laporan beacon dari sketsa tercatat",
        baris is not None and (baris.get("beacon") or {}).get("seq") == 12,
        str(baris and baris.get("beacon")))
    papan = (f.get("papan") or {}).get(str(GRUP), {})
    cek("status hunter dari sketsa tercatat dengan semua nilainya",
        papan.get("hunter", {}).get("wifi") == -58 and papan["hunter"].get("jam") == "ntp"
        and papan["hunter"].get("naik") == 125 and papan["hunter"].get("mem") == 150000
        and papan["hunter"].get("putus") == 2, str(papan.get("hunter")))
    cek("status beacon dari sketsa tercatat dengan semua nilainya",
        papan.get("beacon", {}).get("wifi") == -58 and papan["beacon"].get("jam") == "ntp"
        and papan["beacon"].get("putus") == 2, str(papan.get("beacon")))

    print(f"\n{len(LULUS)} lulus, {len(GAGAL)} gagal")
    for nama in GAGAL:
        print(f"  gagal: {nama}")
    return 1 if GAGAL else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
