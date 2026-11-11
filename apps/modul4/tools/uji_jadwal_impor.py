"""
Uji impor jadwal Modul 4 dari berkas yang ditulis agent PC (jadwal_impor()).

Tidak butuh server yang hidup: modul server.py dimuat langsung dan jadwalnya
disimpan ke folder sementara.

    python modul4/tools/uji_jadwal_impor.py

Yang diuji adalah kegagalan yang membuat NIM sesi TOT "tidak terdaftar": sesi
yang sedang berburu ditolak daftarnya karena sesi lain masih memegang NIM yang
sama, lalu tidak pernah dicoba lagi. Keluar dengan status bukan-nol bila ada
satu saja yang gagal.
"""

from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import sys
import tempfile
from contextlib import redirect_stdout

AKAR = pathlib.Path(__file__).resolve().parent.parent
LULUS: list[str] = []
GAGAL: list[str] = []


def cek(nama: str, syarat: bool, catatan: str = "") -> None:
    (LULUS if syarat else GAGAL).append(nama)
    tanda = "  ok  " if syarat else " GAGAL"
    print(f"[{tanda}] {nama}{('  -- ' + catatan) if catatan else ''}")


def muat_server(folder: pathlib.Path):
    spec = importlib.util.spec_from_file_location("server_uji", AKAR / "server.py")
    srv = importlib.util.module_from_spec(spec)
    sys.modules["server_uji"] = srv
    spec.loader.exec_module(srv)
    srv.JADWAL_PATH = folder / "jadwal.json"
    srv.jadwal_awal()
    srv.IMPOR_ULANG = False
    if hasattr(srv, "IMPOR_GALAT"):
        srv.IMPOR_GALAT.clear()
    return srv


def regu(*nim: str, grup: str = "1") -> dict:
    return {grup: {"nama": "Vela", "aktif": True,
                   "anggota": [{"nim": n, "nama": f"TOT {n}"} for n in nim]}}


def berkas(folder: pathlib.Path, sesi: list[dict]) -> pathlib.Path:
    p = folder / "jadwal-modul4.json"
    p.write_text(json.dumps({"hari": "2026-11-11", "sesi": sesi}), encoding="utf-8")
    return p


def nim_di(srv, sid: int) -> list[str]:
    return [a["nim"] for isi in srv.sesi_oleh_id(sid)["regu"].values() for a in isi["anggota"]]


def impor(srv, p: pathlib.Path):
    keluar = io.StringIO()
    with redirect_stdout(keluar):
        hasil = srv.jadwal_impor(p)
    return hasil, keluar.getvalue()


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        folder = pathlib.Path(tmp)
        orang = ["100000", "100001", "100002"]

        # 1. sesi yang dibatalkan di situs tidak lagi disebut: isinya dilepas
        srv = muat_server(folder)
        impor(srv, berkas(folder, [{"id": 2, "mulai": "09:30", "regu": regu(*orang)}]))
        cek("sesi 2 terisi dari situs", nim_di(srv, 2) == orang, str(nim_di(srv, 2)))
        _, log = impor(srv, berkas(folder, [
            {"id": 4, "mulai": "15:30", "regu": regu(*orang), "berburu": "2026-11-11T14:53:13Z"}]))
        cek("sesi 4 menerima daftarnya walau sesi 2 pernah memegangnya", nim_di(srv, 4) == orang,
            log.strip() or str(nim_di(srv, 4)))
        cek("sesi 2 yang sudah tidak disebut dilepas", nim_di(srv, 2) == [], str(nim_di(srv, 2)))

        # 2. urutan nomor sesi tidak boleh menentukan: sesi 1 mengambil, sesi 3 melepas
        srv = muat_server(folder)
        impor(srv, berkas(folder, [{"id": 3, "mulai": "12:30", "regu": regu(*orang)}]))
        _, log = impor(srv, berkas(folder, [
            {"id": 1, "mulai": "06:30", "regu": regu(*orang)},
            {"id": 3, "mulai": "12:30", "regu": {}}]))
        cek("sesi bernomor lebih kecil menerima NIM yang dilepas sesi bernomor lebih besar",
            nim_di(srv, 1) == orang and nim_di(srv, 3) == [], log.strip() or str(nim_di(srv, 1)))

        # 3. dua sesi sama-sama meminta NIM yang sama: yang berburu menang, yang lain dicoba lagi
        srv = muat_server(folder)
        p = berkas(folder, [
            {"id": 1, "mulai": "06:30", "regu": regu(*orang)},
            {"id": 2, "mulai": "09:30", "regu": regu(*orang), "berburu": "2026-11-11T14:53:13Z"}])
        _, log = impor(srv, p)
        cek("sesi yang berburu memegang NIM-nya", nim_di(srv, 2) == orang and nim_di(srv, 1) == [],
            str((nim_di(srv, 1), nim_di(srv, 2))))
        cek("sesi yang kalah dicatat ke konsol", "sesi 1 ditolak" in log and "muncul dua kali" in log,
            log.strip())
        cek("bentrok membuat impor dicoba lagi walau berkasnya sama", srv.IMPOR_ULANG is True)
        _, log2 = impor(srv, p)
        cek("alasan yang sama tidak dicatat dua kali", log2.strip() == "", log2.strip())

        # 4. tempelan manual yang kosong tidak memblokir impor situs
        srv = muat_server(folder)
        srv.sesi_oleh_id(4)["sumber"] = "pc"
        impor(srv, berkas(folder, [{"id": 4, "mulai": "15:30", "regu": regu(*orang)}]))
        cek("tempelan manual yang kosong tidak memblokir daftar situs",
            nim_di(srv, 4) == orang and srv.sesi_oleh_id(4)["sumber"] == "web",
            str(srv.sesi_oleh_id(4)["sumber"]))

        # 5. tempelan manual yang berisi tetap dilindungi, dan NIM-nya tetap milik sesi itu
        srv = muat_server(folder)
        srv.sesi_oleh_id(3)["regu"] = regu("100000")
        srv.sesi_oleh_id(3)["sumber"] = "pc"
        _, log = impor(srv, berkas(folder, [
            {"id": 3, "mulai": "12:30", "regu": regu("200000")},
            {"id": 4, "mulai": "15:30", "regu": regu("100000", "100001")}]))
        cek("tempelan manual yang berisi tidak ditimpa", nim_di(srv, 3) == ["100000"], str(nim_di(srv, 3)))
        cek("NIM di tempelan manual tidak diambil sesi lain", nim_di(srv, 4) == [] and "ditolak" in log,
            log.strip())

        # 6. berkas yang sama diterapkan ulang tidak menggeser nomor revisi
        srv = muat_server(folder)
        p = berkas(folder, [{"id": 4, "mulai": "15:30", "regu": regu(*orang)}])
        impor(srv, p)
        rev = srv.JADWAL["rev"]
        impor(srv, p)
        cek("impor ulang berkas yang sama tidak mengubah revisi", srv.JADWAL["rev"] == rev,
            f"{rev} -> {srv.JADWAL['rev']}")

        # 7. NIM kembar di dalam satu sesi tetap ditolak
        srv = muat_server(folder)
        _, log = impor(srv, berkas(folder, [
            {"id": 4, "mulai": "15:30", "regu": {**regu("100000"), **regu("100000", grup="2")}}]))
        cek("NIM kembar di dua kelompok satu sesi ditolak", nim_di(srv, 4) == [] and "dua kali" in log,
            log.strip())

        # 8. tempelan manual (jadwal_set) memakai pengecekan lintas sesi seperti dulu
        srv = muat_server(folder)
        srv.sesi_oleh_id(1)["regu"] = regu("100000")
        ok, galat = srv.jadwal_set(2, regu("100000"))
        cek("jadwal_set tetap menolak NIM yang dipegang sesi lain", ok is False and "dua kali" in galat, galat)

        # 9. kunci papan per kelompok tetap: tidak bergantung pada sesi atau hari
        srv = muat_server(folder)
        srv.TOKEN = "UJICI"
        srv.JADWAL["aktif"] = None
        tanpa_sesi = {g: srv.kunci_grup(g) for g in range(1, 7)}
        srv.JADWAL["aktif"] = 2
        sesi_dua = {g: srv.kunci_grup(g) for g in range(1, 7)}
        srv.JADWAL["aktif"] = 4
        sesi_empat = {g: srv.kunci_grup(g) for g in range(1, 7)}
        cek("kunci kelompok sama di semua sesi (papan cukup diunggah sekali)",
            tanpa_sesi == sesi_dua == sesi_empat, str(sesi_empat[1]))
        cek("kunci tiap kelompok berbeda, delapan karakter",
            len(set(sesi_empat.values())) == 6 and all(len(k) == 8 for k in sesi_empat.values()),
            str(sorted(sesi_empat.values())[:2]))
        cek("kunci kelompok diterima dan kunci kelompok lain ditolak",
            srv.kunci_ok(1, sesi_empat[1].lower()) and not srv.kunci_ok(1, sesi_empat[2]),
            "huruf kecil diterima, kunci kelompok 2 ditolak untuk kelompok 1")
        srv.JADWAL["aktif"] = 2
        kode_dua = srv.kode_papan()
        srv.JADWAL["aktif"] = 4
        cek("kode papan tetap berganti tiap sesi", kode_dua != srv.kode_papan(), kode_dua)
        srv.TOKEN = "TOKEN-LAIN"
        cek("kunci berganti bila token PC diganti", srv.kunci_grup(1) != sesi_empat[1], srv.kunci_grup(1))

    print(f"\n{len(LULUS)} lulus, {len(GAGAL)} gagal")
    for nama in GAGAL:
        print(f"  gagal: {nama}")
    return 1 if GAGAL else 0


if __name__ == "__main__":
    sys.exit(main())
