"""
Uji protokol papan skor Perburuan LoRa IRIS.

Menjalankan seluruh perintah baru terhadap server yang sedang hidup, termasuk
yang HARUS ditolak. Sebelum revisi ini tidak ada satu pun perintah /live yang
teruji otomatis, sehingga perubahan skema hanya ketahuan di lapangan.

    python modul4/server.py --token UJICOBA &
    python modul4/tools/uji_protokol.py --token UJICOBA

Keluar dengan status bukan-nol bila ada satu saja yang gagal.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import sys
import urllib.request

from websockets.asyncio.client import connect

MAX_GAGAL_TOKEN = 5      # cermin nilai di server.py
MAX_GAGAL_MASUK = 12

LULUS: list[str] = []
GAGAL: list[str] = []


def cek(nama: str, syarat: bool, catatan: str = "") -> None:
    (LULUS if syarat else GAGAL).append(nama)
    tanda = "  ok  " if syarat else " GAGAL"
    print(f"[{tanda}] {nama}{('  -- ' + catatan) if catatan else ''}")


async def balas(ws, aksi: str, timeout: float = 3.0) -> dict | None:
    """Tunggu balasan langsung untuk satu aksi, abaikan bingkai siaran."""
    async def cari():
        async for raw in ws:
            if isinstance(raw, (bytes, bytearray)):
                continue
            msg = json.loads(raw)
            if msg.get("tipe") in ("balas", "halo", "masuk", "galat") and \
               (msg.get("aksi") == aksi
                    or msg.get("tipe") in ("halo", "masuk", "galat")):
                return msg
        return None
    try:
        return await asyncio.wait_for(cari(), timeout)
    except asyncio.TimeoutError:
        return None


async def bingkai(ws, timeout: float = 3.0) -> dict | None:
    """Bingkai siaran berikutnya."""
    async def cari():
        async for raw in ws:
            if isinstance(raw, (bytes, bytearray)):
                continue
            msg = json.loads(raw)
            if msg.get("tipe", "bingkai") == "bingkai":
                return msg
        return None
    try:
        return await asyncio.wait_for(cari(), timeout)
    except asyncio.TimeoutError:
        return None


def jpeg(nbytes: int = 4096) -> bytes:
    """JPEG sintetis: magic bytes yang benar, diisi sampai panjangnya pas."""
    head = bytes.fromhex("ffd8ff") + b"\xe0\x00\x10JFIF\x00"
    return head + bytes((i * 7) % 251 for i in range(nbytes - len(head)))


async def kirim_hunter(url: str, gid: int, rssi: float, seq: int) -> None:
    """Satu paket hunter, supaya kelompok itu punya slot dan jarak."""
    async with connect(url + "/hunter") as ws:
        for i in range(seq):
            await ws.send(json.dumps({
                "grup": gid, "seq": i + 1, "rssi": int(rssi), "halus": rssi,
                "snr": 8.0, "tx": "10:00:00:000", "rx": "10:00:00:012",
            }))
        await asyncio.sleep(0.15)


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="ws://127.0.0.1:8080")
    ap.add_argument("--http", default="http://127.0.0.1:8080")
    ap.add_argument("--token", required=True)
    args = ap.parse_args()
    T = args.token

    # Beacon harus hidup, kalau tidak started_at tidak pernah diisi. Kelompok
    # 1 dipakai sebagai satu-satunya pasangan yang diuji di sini -- lihat
    # bagian "penemuan per kelompok" di bawah untuk kenapa kelompok 2 tidak
    # perlu beacon-nya sendiri untuk membuktikan konfirmasinya ditolak.
    beacon = await connect(args.url + "/beacon")
    await beacon.send(json.dumps({"grup": 1, "seq": 1, "tx": "10:00:00:000"}))

    # Kelompok 1 sangat dekat (membara), kelompok 2 jauh.
    # RSSI_AT_1M -40, n=2.0 -> -50 dBm ~ 3.2 m, dalam membara (<= 6 m).
    await kirim_hunter(args.url, 1, -50.0, 5)
    await kirim_hunter(args.url, 2, -95.0, 5)

    # ---- asisten menyiapkan hari ---------------------------------------
    # Tidak ada yang bisa masuk sebelum ini: keanggotaan kelompok kini
    # berasal dari daftar NIM, bukan dari nomor yang dikirim peramban.
    async with connect(args.url + "/live") as siap:
        await siap.send(json.dumps({"aksi": "halo", "token": T}))
        await balas(siap, "halo")

        await siap.send(json.dumps({"aksi": "jadwal_set", "sesi": 1, "regu": {
            "1": {"nama": "Regu Cakra", "aktif": True, "anggota": [
                {"nim": "2311102001", "nama": "Ani"},
                {"nim": "2311102002", "nama": "Budi"}]},
            "2": {"nama": "Regu Bayu", "aktif": True, "anggota": [
                {"nim": "2311102010", "nama": "Cici"}]},
            "3": {"nama": "Regu Nala", "aktif": False, "anggota": [
                {"nim": "2311102020", "nama": "Dedi"}]},
        }}))
        r = await balas(siap, "jadwal_set")
        cek("jadwal sesi 1 tersimpan", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        # Sesi 2 memakai NIM yang sama: satu orang tidak boleh ada di dua
        # kelompok pada hari yang sama, dan pencarian NIM akan memilih salah
        # satu tanpa bersuara kalau ini lolos.
        await siap.send(json.dumps({"aksi": "jadwal_set", "sesi": 2, "regu": {
            "1": {"anggota": [{"nim": "2311102001", "nama": "Ani"}]},
        }}))
        r = await balas(siap, "jadwal_set")
        cek("NIM kembar antar sesi ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await siap.send(json.dumps({"aksi": "jadwal_set", "sesi": 1, "regu": {
            "1": {"anggota": [{"nim": "tidak-sah!", "nama": "X"}]},
        }}))
        r = await balas(siap, "jadwal_set")
        cek("NIM tidak sah ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await siap.send(json.dumps({"aksi": "jadwal_set", "sesi": 9, "regu": {}}))
        r = await balas(siap, "jadwal_set")
        cek("sesi asing ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await siap.send(json.dumps({"aksi": "sesi_mulai", "sesi": 1}))
        r = await balas(siap, "sesi_mulai")
        cek("sesi 1 dijalankan", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        await siap.send(json.dumps({"aksi": "jadwal_baca"}))
        r = await balas(siap, "jadwal_baca")
        cek("asisten melihat NIM",
            bool(r) and "2311102001" in json.dumps(r.get("jadwal", {})),
            "jadwal_baca membawa NIM")

    # sesi_mulai menghapus ronde, jadi hunter harus melapor ulang.
    await beacon.send(json.dumps({"grup": 1, "seq": 2, "tx": "10:00:01:000"}))
    await kirim_hunter(args.url, 1, -50.0, 5)
    await kirim_hunter(args.url, 2, -95.0, 5)

    # ---- tamu: tidak boleh apa-apa -------------------------------------
    # Satu koneksi per perintah. Menumpuknya pada satu koneksi akan memicu
    # penjaga MAX_GAGAL_TOKEN di tengah daftar, dan perintah sesudahnya
    # akan tampak "lulus" hanya karena soketnya sudah ditutup.
    for aksi, extra in [("konfirmasi", {"grup": 1}), ("tolak", {"grup": 1}),
                        ("kalibrasi", {"grup": 1}), ("reset", {}),
                        ("jadwal_set", {"sesi": 1, "regu": {}}),
                        ("jadwal_baca", {}),
                        ("jadwal_hapus", {}),
                        ("sesi_mulai", {"sesi": 2}),
                        ("sesi_akhiri", {})]:
        async with connect(args.url + "/live") as tamu:
            await tamu.send(json.dumps({"aksi": aksi, **extra}))
            r = await balas(tamu, aksi)
            cek(f"tamu ditolak: {aksi}",
                r is not None and r.get("ok") is False,
                (r or {}).get("alasan", "tidak ada balasan"))

    # Penjaga tebak-token: koneksi ditutup, bukan sekadar ditolak berulang.
    async with connect(args.url + "/live") as brute:
        tertutup = False
        try:
            for _ in range(MAX_GAGAL_TOKEN + 2):
                await brute.send(json.dumps({"aksi": "reset"}))
                await balas(brute, "reset", timeout=1.5)
        except Exception:                      # noqa: BLE001
            tertutup = True
        cek("percobaan token berulang menutup koneksi", tertutup,
            f"ditutup sebelum {MAX_GAGAL_TOKEN + 2} percobaan")

    # Penjaga tebak-NIM: sama, tetapi batasnya sendiri dan tidak menutup
    # koneksi -- seorang praktikan yang salah ketik tidak boleh terlempar.
    async with connect(args.url + "/live") as tebak:
        for i in range(MAX_GAGAL_MASUK + 1):
            await tebak.send(json.dumps({"aksi": "masuk",
                                         "nim": f"999900{i:04d}"}))
            r = await balas(tebak, "masuk")
        cek("tebakan NIM berlebih dihentikan",
            r is not None and r.get("ok") is False
            and "percobaan" in (r.get("alasan") or ""),
            (r or {}).get("alasan", ""))

    # ---- masuk dengan NIM ----------------------------------------------
    async with connect(args.url + "/live") as pintu:
        await pintu.send(json.dumps({"aksi": "masuk", "nim": "2311109999"}))
        r = await balas(pintu, "masuk")
        cek("NIM tak dikenal ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await pintu.send(json.dumps({"aksi": "masuk", "nim": "x!"}))
        r = await balas(pintu, "masuk")
        cek("NIM cacat ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        # Kelompok 3 ditandai tidak aktif: papannya menjadi beacon, jadi
        # anggotanya tidak punya perburuan untuk dimasuki.
        await pintu.send(json.dumps({"aksi": "masuk", "nim": "2311102020"}))
        r = await balas(pintu, "masuk")
        cek("NIM kelompok nonaktif ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await pintu.send(json.dumps({"aksi": "masuk", "nim": "2311102001"}))
        r = await balas(pintu, "masuk")
        cek("NIM dikenal memberi kelompok",
            r is not None and r.get("ok") is True and r.get("grup") == 1,
            str((r or {}).get("grup")))
        cek("masuk mengembalikan nama",
            (r or {}).get("nama") == "Ani", str((r or {}).get("nama")))

        await pintu.send(json.dumps({"aksi": "masuk", "nim": "2311102001".lower()}))
        r = await balas(pintu, "masuk")
        cek("NIM tidak peka huruf besar",
            r is not None and r.get("ok") is True, (r or {}).get("alasan", ""))

    # ---- halo tidak lagi bisa mengaku kelompok --------------------------
    async with connect(args.url + "/live") as palsu:
        await palsu.send(json.dumps({"aksi": "halo", "grup": 1}))
        r = await balas(palsu, "halo")
        cek("halo dengan grup saja tetap tamu",
            r is not None and r.get("peran") == "tamu"
            and r.get("grup") is None,
            str((r or {}).get("peran")))

        await palsu.send(json.dumps({"aksi": "klaim", "grup": 1}))
        r = await balas(palsu, "klaim")
        cek("tamu tak bisa mengklaim",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

    # ---- anggota kelompok 2 tidak boleh mengklaim untuk kelompok 1 ------
    async with connect(args.url + "/live") as dua:
        await dua.send(json.dumps({"aksi": "halo", "nim": "2311102010"}))
        r = await balas(dua, "halo")
        cek("halo anggota", r is not None and r.get("peran") == "anggota"
            and r.get("grup") == 2, str((r or {}).get("peran")))

        await dua.send(json.dumps({"aksi": "klaim", "grup": 1}))
        r = await balas(dua, "klaim")
        cek("anggota tak bisa klaim kelompok lain",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        # Kelompok 2 jauh, jadi klaim untuk dirinya sendiri pun ditolak.
        await dua.send(json.dumps({"aksi": "klaim", "grup": 2}))
        r = await balas(dua, "klaim")
        cek("klaim dari luar jangkauan ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

    # ---- anggota kelompok 1: unggah lalu klaim --------------------------
    berkas = None
    async with connect(args.url + "/live") as satu:
        await satu.send(json.dumps({"aksi": "halo", "nim": "2311102001"}))
        await balas(satu, "halo")

        blob = jpeg(4096)
        await satu.send(json.dumps({"aksi": "foto_mulai", "grup": 1,
                                    "ukuran": len(blob), "mime": "image/jpeg"}))
        r = await balas(satu, "foto_mulai")
        cek("foto_mulai diterima", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        await satu.send(blob)
        r = await balas(satu, "foto")
        cek("foto tersimpan", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))
        berkas = (r or {}).get("berkas")

        # Kasus buruk diuji SEBELUM klaim: sesudah klaim, claim_armed
        # menolak unggahan baru dengan benar ("klaim sedang ditinjau"),
        # sehingga tidak ada unggahan tertunda untuk diuji.
        await satu.send(json.dumps({"aksi": "foto_mulai", "grup": 1,
                                    "ukuran": 4096, "mime": "image/jpeg"}))
        await balas(satu, "foto_mulai")
        await satu.send(jpeg(2048))
        r = await balas(satu, "foto")
        cek("ukuran tidak cocok ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        palsu = b"X" * 4096
        await satu.send(json.dumps({"aksi": "foto_mulai", "grup": 1,
                                    "ukuran": len(palsu), "mime": "image/jpeg"}))
        await balas(satu, "foto_mulai")
        await satu.send(palsu)
        r = await balas(satu, "foto")
        cek("bukan gambar ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await satu.send(json.dumps({"aksi": "foto_mulai", "grup": 1,
                                    "ukuran": 9, "mime": "image/gif"}))
        r = await balas(satu, "foto_mulai")
        cek("mime asing ditolak", r is not None and r.get("ok") is False,
            (r or {}).get("alasan", ""))

        await satu.send(json.dumps({"aksi": "foto_mulai", "grup": 1,
                                    "ukuran": 900000, "mime": "image/jpeg"}))
        r = await balas(satu, "foto_mulai")
        cek("foto kebesaran ditolak", r is not None and r.get("ok") is False,
            (r or {}).get("alasan", ""))

        await satu.send(json.dumps({"aksi": "klaim", "grup": 1,
                                    "foto": berkas}))
        r = await balas(satu, "klaim")
        cek("klaim diterima", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        await satu.send(json.dumps({"aksi": "klaim", "grup": 1}))
        r = await balas(satu, "klaim")
        cek("klaim ganda ditolak", r is not None and r.get("ok") is False,
            (r or {}).get("alasan", ""))

    # ---- HTTP: foto dan lintas jalur ------------------------------------
    if berkas:
        with urllib.request.urlopen(f"{args.http}/foto/{berkas}") as resp:
            body = resp.read()
            cek("GET /foto mengembalikan gambar",
                resp.status == 200
                and resp.headers.get("Content-Type") == "image/jpeg"
                and body.startswith(bytes.fromhex("ffd8ff")),
                f"{resp.status} {len(body)} bait")

    for jahat in ["../server.py", "..%2Fserver.py", "../../etc/passwd",
                  "GRUP1.JPG", "a.php", "%2e%2e%2fserver.py"]:
        try:
            with urllib.request.urlopen(f"{args.http}/foto/{jahat}") as resp:
                ok = False
                catatan = f"status {resp.status}"
        except urllib.error.HTTPError as err:
            ok = err.code == 404
            catatan = f"404"
        except Exception as err:               # noqa: BLE001
            ok, catatan = True, type(err).__name__
        cek(f"lintas jalur ditolak: {jahat}", ok, catatan)

    # ---- asisten --------------------------------------------------------
    async with connect(args.url + "/live") as asisten:
        await asisten.send(json.dumps({"aksi": "halo", "token": "SALAH1"}))
        r = await balas(asisten, "halo")
        cek("token salah ditolak", r is not None and r.get("ok") is False,
            (r or {}).get("alasan", ""))

        await asisten.send(json.dumps({"aksi": "halo", "token": T}))
        r = await balas(asisten, "halo")
        cek("token benar diterima",
            r is not None and r.get("peran") == "asisten",
            str((r or {}).get("peran")))

        # Antrean harus memuat kelompok 1.
        f = await bingkai(asisten)
        antre = (f or {}).get("antrian", [])
        cek("antrean memuat klaim", len(antre) == 1 and antre[0]["grup"] == 1,
            json.dumps(antre))
        cek("antrean membawa url foto",
            bool(antre and antre[0].get("foto_url")),
            str(antre[0].get("foto_url") if antre else None))

        # /roster.json: yang paling penting di sini bukan apa yang ada,
        # melainkan apa yang TIDAK ada. NIM adalah data pribadi dan rutenya
        # sengaja tanpa token supaya proyektor dapat membacanya.
        with urllib.request.urlopen(f"{args.http}/roster.json") as resp:
            roster = json.loads(resp.read())
        mentah = json.dumps(roster)
        cek("GET /roster.json", roster.get("regu", {}).get("1", {}).get("nama")
            == "Regu Cakra", json.dumps(roster.get("regu", {}))[:80])
        cek("/roster.json tidak memuat NIM",
            "2311102001" not in mentah and "nim" not in mentah.lower(),
            mentah[:90])
        cek("/roster.json membawa nama anggota",
            roster["regu"]["1"]["anggota"] == ["Ani", "Budi"],
            json.dumps(roster["regu"]["1"]["anggota"]))
        cek("roster tidak membocorkan token",
            "token" not in mentah.lower(), "tidak ada medan token")
        cek("tanda aktif tersimpan",
            roster["regu"]["3"]["aktif"] is False, "kelompok 3 nonaktif")
        cek("/roster.json menyebut sesi berjalan",
            roster.get("sesi") == 1, str(roster.get("sesi")))

        # Tolak, lalu klaim ulang harus boleh.
        await asisten.send(json.dumps({"aksi": "tolak", "grup": 1,
                                       "alasan": "itu kotak sekring"}))
        r = await balas(asisten, "tolak")
        cek("tolak diterima", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        f = await bingkai(asisten)
        baris = [g for g in (f or {}).get("grup", []) if g["grup"] == 1]
        cek("status jadi ditolak dengan alasan",
            bool(baris) and baris[0]["status"] == "ditolak"
            and baris[0]["tolak_alasan"] == "itu kotak sekring",
            str(baris[0].get("tolak_alasan") if baris else None))
        cek("antrean kosong setelah ditolak",
            (f or {}).get("antrian") == [], str((f or {}).get("antrian")))

    async with connect(args.url + "/live") as satu:
        await satu.send(json.dumps({"aksi": "halo", "nim": "2311102001"}))
        await balas(satu, "halo")
        await satu.send(json.dumps({"aksi": "klaim", "grup": 1}))
        r = await balas(satu, "klaim")
        cek("boleh klaim ulang setelah ditolak",
            r is not None and r.get("ok") is True, (r or {}).get("alasan", ""))

    async with connect(args.url + "/live") as asisten:
        await asisten.send(json.dumps({"aksi": "halo", "token": T}))
        await balas(asisten, "halo")

        await asisten.send(json.dumps({"aksi": "konfirmasi", "grup": 99}))
        r = await balas(asisten, "konfirmasi")
        cek("konfirmasi kelompok asing ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        await asisten.send(json.dumps({"aksi": "konfirmasi", "grup": 1}))
        r = await balas(asisten, "konfirmasi")
        cek("konfirmasi diterima", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        # Kelompok 2 tidak pernah mengajukan klaim (klaimnya sendiri ditolak
        # lebih awal karena masih jauh), jadi konfirmasinya ditolak untuk
        # alasan itu -- BUKAN lagi karena "kelompok lain sudah menang":
        # kelima pasangan berburu targetnya sendiri-sendiri, jadi kelompok 1
        # menang tidak menutup jalan kelompok 2 sama sekali.
        await asisten.send(json.dumps({"aksi": "konfirmasi", "grup": 2}))
        r = await balas(asisten, "konfirmasi")
        cek("konfirmasi tanpa klaim ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        f = await bingkai(asisten)
        baris1 = [g for g in (f or {}).get("grup", []) if g["grup"] == 1]
        cek("kelompok 1 berstatus menang",
            bool(baris1) and baris1[0]["status"] == "menang",
            str(baris1[0].get("status") if baris1 else None))
        hadiah = (f or {}).get("penghargaan", {})
        cek("juara adalah kelompok 1",
            bool(hadiah.get("podium")) and hadiah["podium"][0]["grup"] == 1,
            json.dumps(hadiah.get("podium", []))[:70])
        # Belum semua kelompok yang bergabung (1 dan 2) sudah menang, jadi
        # ronde belum dibekukan -- lihat confirm()'s all(...) check.
        cek("penghargaan belum dibekukan (kelompok 2 belum menang)",
            hadiah.get("beku") is False,
            json.dumps(hadiah.get("podium", []))[:70])

    # ---- pergantian sesi -------------------------------------------------
    async with connect(args.url + "/live") as asisten:
        await asisten.send(json.dumps({"aksi": "halo", "token": T}))
        await balas(asisten, "halo")

        await asisten.send(json.dumps({"aksi": "sesi_mulai", "sesi": 2}))
        r = await balas(asisten, "sesi_mulai")
        cek("sesi 2 dijalankan", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        f = await bingkai(asisten)
        cek("bingkai menyebut sesi baru", (f or {}).get("sesi") == 2,
            str((f or {}).get("sesi")))
        cek("pergantian sesi menghapus seluruh kelompok (dan pemenangnya)",
            (f or {}).get("grup") == [], str((f or {}).get("grup")))

    # NIM sesi 1 tidak lagi berlaku: inilah yang mengeluarkan ponsel sesi
    # sebelumnya tanpa perlu pesan dorong apa pun.
    async with connect(args.url + "/live") as basi:
        await basi.send(json.dumps({"aksi": "halo", "nim": "2311102001"}))
        r = await balas(basi, "halo")
        cek("NIM sesi lalu dikeluarkan",
            r is not None and r.get("peran") == "tamu"
            and r.get("grup") is None, str((r or {}).get("alasan")))

    with urllib.request.urlopen(f"{args.http}/roster.json") as resp:
        roster = json.loads(resp.read())
    cek("roster ikut berganti sesi", roster.get("regu") == {},
        json.dumps(roster.get("regu"))[:60])

    if berkas:
        try:
            with urllib.request.urlopen(f"{args.http}/foto/{berkas}") as resp:
                ok, catatan = False, f"status {resp.status}"
        except urllib.error.HTTPError as err:
            ok, catatan = err.code == 404, "404"
        except Exception as err:               # noqa: BLE001
            ok, catatan = True, type(err).__name__
        cek("foto ronde lalu ikut terhapus", ok, catatan)

    async with connect(args.url + "/live") as asisten:
        await asisten.send(json.dumps({"aksi": "halo", "token": T}))
        await balas(asisten, "halo")
        await asisten.send(json.dumps({"aksi": "sesi_akhiri"}))
        r = await balas(asisten, "sesi_akhiri")
        cek("sesi ditutup", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        await asisten.send(json.dumps({"aksi": "sesi_akhiri"}))
        r = await balas(asisten, "sesi_akhiri")
        cek("menutup dua kali ditolak",
            r is not None and r.get("ok") is False, (r or {}).get("alasan", ""))

        # Jadwal harus selamat dari pergantian sesi: itulah gunanya asisten
        # mengetik empat sesi sekali di pagi hari.
        await asisten.send(json.dumps({"aksi": "jadwal_baca"}))
        r = await balas(asisten, "jadwal_baca")
        isi = json.dumps((r or {}).get("jadwal", {}))
        cek("jadwal selamat dari pergantian sesi", "2311102001" in isi,
            "NIM sesi 1 masih tersimpan")

        await asisten.send(json.dumps({"aksi": "jadwal_hapus"}))
        r = await balas(asisten, "jadwal_hapus")
        cek("jadwal dihapus", r is not None and r.get("ok") is True,
            (r or {}).get("alasan", ""))

        await asisten.send(json.dumps({"aksi": "jadwal_baca"}))
        r = await balas(asisten, "jadwal_baca")
        cek("jadwal benar-benar kosong",
            "2311102001" not in json.dumps((r or {}).get("jadwal", {})),
            "tidak ada NIM tersisa")

    await beacon.close()

    print(f"\n{len(LULUS)} lulus, {len(GAGAL)} gagal")
    for nama in GAGAL:
        print(f"  gagal: {nama}")
    return 1 if GAGAL else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
