"""Checks for the codes that change every session (server.py: AKAR, BENIH, putar_benih), run in CI.

The three Module 4 codes -- the assistant token, the board code in the students' link and each
group's board key -- used to come out of the PC's permanent token alone, so they looked the same
in every session and every TOT. Now they also depend on a random seed that is replaced when a
session ends. What these protect:

  - they really change (token, board code and every group key) at each session end, and the old
    ones stop working;
  - they do NOT change when a session starts or Mulai Perburuan runs it again, because students
    flash their boards before that button is pressed;
  - a restart in the middle of a session gives the very same codes;
  - the site emptying a session's roster counts as that session ending, and an unchanged or merely
    edited roster does not;
  - --tetap (CI and development) keeps the old fixed behaviour.

    python tools/uji_kode_sesi.py
"""
from __future__ import annotations

import asyncio
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
from contextlib import redirect_stdout

SERVER = pathlib.Path(__file__).resolve().parent.parent / "server.py"
LULUS: list[str] = []
GAGAL: list[str] = []


def cek(nama: str, syarat: bool, catatan: str = "") -> None:
    (LULUS if syarat else GAGAL).append(nama)
    tanda = "  ok  " if syarat else " GAGAL"
    print(f"[{tanda}] {nama}{('  -- ' + catatan) if catatan else ''}")


def muat_server(folder: pathlib.Path, akar: str = "MESIN1", tetap: bool = False):
    """A fresh copy of server.py that writes only inside `folder`, started like __main__ starts it."""
    spec = importlib.util.spec_from_file_location("server_kode", SERVER)
    srv = importlib.util.module_from_spec(spec)
    sys.modules["server_kode"] = srv
    spec.loader.exec_module(srv)
    srv.JADWAL_PATH = folder / "jadwal.json"
    srv.BENIH_PATH = folder / "benih.json"
    srv.UPLOAD_DIR = folder / "uploads"
    srv.UPLOAD_DIR.mkdir(exist_ok=True)
    srv.jadwal_awal()
    srv.IMPOR_ULANG = False
    srv.AKAR = akar
    srv.TETAP = tetap
    with redirect_stdout(io.StringIO()):
        srv.muat_benih()
    return srv


def semua(srv) -> dict:
    """Everything a student, an assistant or a board is told"""
    return {
        "token": srv.TOKEN,
        "kode": srv.kode_papan(),
        "kunci": {g: srv.kunci_grup(g) for g in range(1, srv.KUNCI_MAKS_GRUP + 1)},
    }


def diam(fn):
    """Runs fn with its console output swallowed"""
    with redirect_stdout(io.StringIO()):
        return fn()


def regu(*nim: str) -> dict:
    return {"1": {"nama": "Vela", "aktif": True,
                  "anggota": [{"nim": n, "nama": f"TOT {n}"} for n in nim]}}


def berkas(folder: pathlib.Path, nim: list[str], berburu: str | None = None) -> pathlib.Path:
    p = folder / "jadwal-modul4.json"
    slot = {"id": 1, "regu": regu(*nim) if nim else {}}
    if berburu:
        slot["berburu"] = berburu
    p.write_text(json.dumps({"hari": "2026-11-14", "sesi": [slot]}), encoding="utf-8")
    return p


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        folder = pathlib.Path(tmp)

        # --- the shape of the codes
        srv = muat_server(folder)
        a = semua(srv)
        abjad = set(srv.TOKEN_ALPHABET)
        cek("token asisten: 6 huruf dari abjad token, bukan rahasia mesinnya",
            len(a["token"]) == 6 and set(a["token"]) <= abjad and a["token"] != "MESIN1")
        cek("kode papan: 6 huruf", len(a["kode"]) == 6 and set(a["kode"]) <= abjad)
        cek("kunci papan: 8 huruf, sepuluh kelompok sepuluh kunci berbeda",
            all(len(k) == 8 and set(k) <= abjad for k in a["kunci"].values())
            and len(set(a["kunci"].values())) == 10)
        cek("token, kode, dan kunci tidak saling sama",
            len({a["token"], a["kode"], *a["kunci"].values()}) == 12)
        cek("benih tersimpan di berkas", (folder / "benih.json").is_file())
        cek("token_ok menerima token sekarang (huruf kecil pun), menolak rahasia mesin",
            srv.token_ok(a["token"]) and srv.token_ok(a["token"].lower())
            and not srv.token_ok("MESIN1"))

        # --- restart in the middle of a session: the very same codes
        srv2 = muat_server(folder)
        cek("dinyalakan ulang: token, kode, dan semua kunci persis sama", semua(srv2) == a)
        cek("mesin lain dengan benih yang sama: semuanya berbeda",
            all(semua(muat_server(folder, akar="MESIN2"))[k] != a[k] for k in ("token", "kode")))

        # --- a session starting, or Mulai Perburuan running it again, changes nothing
        srv2.HUNT.reset()
        diam(lambda: asyncio.run(srv2.sesi_mulai(1, "terjadwal")))
        cek("sesi dimulai: semua kode tetap", semua(srv2) == a)
        diam(lambda: asyncio.run(srv2.sesi_mulai(1, "Mulai Perburuan dari web")))
        cek("Mulai Perburuan menjalankan sesi lagi: semua kode tetap", semua(srv2) == a)

        # --- the session ends: everything is new, the old ones are refused
        diam(lambda: asyncio.run(srv2.sesi_akhiri("batas waktu")))
        b = semua(srv2)
        cek("sesi berakhir: token berganti", b["token"] != a["token"])
        cek("sesi berakhir: kode papan berganti", b["kode"] != a["kode"])
        cek("sesi berakhir: kunci setiap kelompok berganti",
            all(b["kunci"][g] != a["kunci"][g] for g in a["kunci"]))
        cek("token lama ditolak, kunci kelompok 1 yang lama ditolak, kode lama ditolak",
            not srv2.token_ok(a["token"]) and not srv2.kunci_ok(1, a["kunci"][1])
            and not srv2.kode_ok(a["kode"]))
        cek("yang baru diterima", srv2.token_ok(b["token"]) and srv2.kunci_ok(1, b["kunci"][1])
            and srv2.kode_ok(b["kode"]))
        cek("sesudah restart, kode baru yang tetap berlaku", semua(muat_server(folder)) == b)

        # --- the site ending a session (its roster emptied) counts, a steady roster does not
        diam(lambda: srv2.jadwal_impor(berkas(folder, ["100000", "100001"])))
        c = semua(srv2)
        cek("daftar terisi pertama kali: kode tetap (tidak ada sesi yang berakhir)", c == b)
        diam(lambda: srv2.jadwal_impor(berkas(folder, ["100000", "100001"])))
        cek("daftar yang sama tiba lagi: kode tetap", semua(srv2) == c)
        diam(lambda: srv2.jadwal_impor(berkas(folder, ["100000", "100002"])))
        cek("anggota diganti di tengah sesi: kode tetap", semua(srv2) == c)
        diam(lambda: srv2.jadwal_impor(berkas(folder, [])))
        d = semua(srv2)
        cek("situs mengosongkan daftar (sesi TOT berakhir): semua kode berganti",
            d["token"] != c["token"] and d["kode"] != c["kode"]
            and all(d["kunci"][g] != c["kunci"][g] for g in c["kunci"]))
        diam(lambda: srv2.jadwal_impor(berkas(folder, [])))
        cek("daftar kosong yang sama tiba lagi: tidak berganti lagi", semua(srv2) == d)
        diam(lambda: srv2.jadwal_impor(berkas(folder, ["100000", "100001"])))
        cek("TOT berikutnya dengan orang yang sama mulai dengan kode yang tidak sama dengan TOT lalu",
            semua(srv2) == d and d["token"] != c["token"])

        # --- the plan thrown away
        diam(lambda: asyncio.run(srv2.jadwal_hapus()))
        e = semua(srv2)
        cek("jadwal dihapus: semua kode berganti",
            e["token"] != d["token"] and e["kode"] != d["kode"])
        cek("benih bertahan walau jadwal.json dihapus", (folder / "benih.json").is_file())

        # --- many rotations really are different, and unbiased enough to use every letter
        tokens = set()
        huruf = set()
        for _ in range(300):
            diam(lambda: srv2.putar_benih("uji"))
            tokens.add(srv2.TOKEN)
            huruf.update(srv2.TOKEN + srv2.kode_papan())
        cek("300 pergantian memberi sekitar 300 token berbeda", len(tokens) >= 295,
            f"{len(tokens)} berbeda")
        cek("semua 26 huruf abjad token pernah muncul", huruf == set(srv2.TOKEN_ALPHABET),
            f"{len(huruf)} huruf")

    # --- --tetap keeps the fixed behaviour CI and development rely on
    with tempfile.TemporaryDirectory() as tmp:
        folder = pathlib.Path(tmp)
        srv = muat_server(folder, akar="UJICI", tetap=True)
        t = semua(srv)
        cek("--tetap: token asisten adalah --token itu sendiri", srv.TOKEN == "UJICI")
        diam(lambda: asyncio.run(srv.sesi_mulai(1)))
        diam(lambda: asyncio.run(srv.sesi_akhiri()))
        diam(lambda: srv.putar_benih("uji"))
        cek("--tetap: tidak ada yang berganti, tidak ada berkas benih",
            semua(srv) == t and not (folder / "benih.json").exists())

    print(f"\n{len(LULUS)} lulus, {len(GAGAL)} gagal")
    for nama in GAGAL:
        print(f"  GAGAL: {nama}")
    return 1 if GAGAL else 0


if __name__ == "__main__":
    sys.exit(main())
