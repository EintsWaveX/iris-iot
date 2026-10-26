"""
PERBURUAN LoRa IRIS — papan skor (Modul 4)
Perangkat: PC Server, dijalankan sebagai access point "IRIS_IOT"

Satu proses melayani tiga hal sekaligus pada port yang sama:

    GET  /              halaman papan skor (berkas tunggal hasil build.py)
    GET  /roster.json   nama anggota kelompok sesi berjalan (TANPA NIM)
    GET  /jejak.json    jejak 1 Hz tiap kelompok + peristiwa, untuk tayangan ulang
    GET  /jejak.csv     jejak yang sama sebagai CSV, untuk diunduh asisten
    GET  /telemetri.json  baris per kelompok (mentah + RSSI halus, jarak, tren) untuk agent PC (loopback saja)
    GET  /ringkas.json  ringkasan perburuan per kelompok (status, anggota, peristiwa) untuk agent (loopback saja)
    GET  /foto/<berkas> foto klaim yang diunggah sebuah kelompok
    WS   /beacon        beacon melaporkan tiap nomor paket yang dipancarkan
    WS   /hunter        tiap hunter melaporkan RSSI paket yang tertangkap
    WS   /live          peramban, anggota kelompok, dan asisten

Server ini memakai paket `websockets` yang sama dengan Modul 2, sehingga
lingkungan virtual `~/venv-iris` yang sudah dibuat di sana cukup dipakai ulang:

    source ~/venv-iris/bin/activate
    python modul4/server.py

Keadaan perburuan seluruhnya disimpan di memori. Perburuan berikutnya cukup
dimulai ulang dengan tombol RESET pada papan skor, atau dengan menjalankan
ulang server ini.

Ada tepat dua kekecualian yang menyentuh cakram, dan keduanya dibatasi:

    modul4/jadwal.json    rencana satu hari: empat sesi praktikum, tiap sesi
                        berisi kelompok beserta NIM dan nama anggotanya.
                        SATU-SATUNYA berkas yang sengaja selamat dari
                        restart, supaya asisten cukup mengetik daftar sehari
                        sekali dan tidak kehilangannya bila server mati di
                        tengah sesi.
    modul4/uploads/       foto klaim. Dihapus pada empat titik: saat server
                        dinyalakan, saat RESET, saat sesi berganti, dan saat
                        server dimatikan dengan rapi.

Foto sengaja TIDAK selamat dari restart sedangkan jadwal selamat. Itu bukan
ketidakkonsistenan: seluruh keadaan klaim ada di memori, jadi foto yang
selamat hanya akan menjadi yatim yang menunjuk ke kelompok yang sudah tidak
ada lagi.

NIM adalah data pribadi dan diperlakukan sebagai rahasia server. Ia dipakai
untuk satu hal saja -- mencari kelompok seorang praktikan saat ia masuk --
dan tidak pernah ikut keluar lewat /roster.json maupun lewat bingkai 10 Hz.
Satu-satunya NIM yang pernah meninggalkan proses ini adalah NIM yang baru
saja diketik orangnya sendiri, dikembalikan kepada koneksi yang mengetiknya.

Catatan waktu: seluruh durasi di berkas ini memakai time.monotonic(), KECUALI
jadwal sesi, yang memakai time.time(). Monotonic tidak punya arti melintasi
restart, dan justru melintasi restart itulah gunanya berkas jadwal.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import pathlib
import re
import secrets
import shutil
import time
from datetime import datetime
from http import HTTPStatus
from urllib.parse import parse_qs, urlsplit

from websockets.asyncio.server import ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Response

HERE = pathlib.Path(__file__).resolve().parent
INDEX_PATH = HERE / "public" / "index.html"

HOST = "0.0.0.0"
PORT = 8080

# Papan skor digambar ulang pada laju tetap, terlepas dari seberapa sering
# hunter mengirim. Ingest dan render karena itu tidak saling menyeret.
BROADCAST_HZ = 10

# Sebuah hunter dianggap kehilangan sinyal bila sekian detik tidak ada paket
# beacon yang tertangkap olehnya, dan terputus bila soketnya tertutup.
SILENCE_SEC = 3.0

# Jari-jari arena: kira-kira sejauh mana hunter terjauh berangkat dari
# beacon. Seluruh tangga "panas/dingin" dan ambang pencalonan diturunkan dari
# angka ini, sehingga permainan yang sama berjalan baik di dalam satu ruangan
# maupun di lapangan terbuka selebar ratusan meter. Ubah lewat --arena.
ARENA_RADIUS_M = 300.0

# Batas jari-jari yang boleh diatur dari ruang kendali. Di bawah 10 m tangga
# panas sudah ditentukan lantainya saja; di atas 2000 m melewati MAX_RANGE_M.
ARENA_MIN_M = 10.0
ARENA_MAX_M = 2000.0

# Tangga panas, sebagai pecahan jari-jari arena. Lantai mutlaknya menjaga agar
# arena yang sangat kecil tidak menyusutkan "membara" menjadi setengah meter.
# Apa pun yang di luar anak tangga terakhir terbaca "dingin".
HEAT_LADDER = (
    ("membara", 0.02, 3.0),
    ("panas", 0.08, 8.0),
    ("hangat", 0.25, 20.0),
    ("sejuk", 0.60, 45.0),
)

# Daya pancar beacon, disalin dari BEACON_TX_POWER di dalam beacon.ino. Server
# tidak memakainya untuk berhitung; angka ini hanya ditampilkan pada lapisan
# fisik supaya papan skor dan sketsanya tidak bisa berbeda diam-diam.
BEACON_TX_DBM = 10

# ---------------------------------------------------------------------------
# Perkiraan jarak dari RSSI, memakai model log-distance path loss:
#
#     RSSI(d) = RSSI_1m - 10 * n * log10(d)   =>   d = 10^((RSSI_1m - RSSI)/(10n))
#
# Ini *perkiraan*, bukan pengukuran. Di dalam ruangan, pantulan dinding dan
# badan orang menggeser RSSI sampai belasan dB tanpa jaraknya berubah sedikit
# pun, sehingga angka meter di bawah selalu ditampilkan bersama rentang
# kemungkinannya. Tabel "RSSI versus jarak sebenarnya" pada jurnal ada justru
# untuk menguji seberapa jauh model ini meleset.
#
# RSSI_1m sebaiknya dikalibrasi di ruangan yang sebenarnya: pegang satu hunter
# tepat 1 meter dari beacon, lalu tekan tombol kalibrasi pada papan skor.
RSSI_AT_1M = -40.0

# Eksponen path loss. 2.0 = ruang bebas dan lapangan terbuka; 2.5-3.5 =
# ruangan dengan sekat dan perabot; makin besar berarti sinyal makin cepat
# melemah terhadap jarak.
#
# Menurunkan n MEMPERBESAR jarak yang dilaporkan untuk RSSI yang sama, dan
# tangga panas dinyatakan dalam jarak -- jadi n dan ARENA_RADIUS_M harus
# digeser bersama-sama. Pada -90 dBm: n=2.5 melaporkan 100 m, n=2.0
# melaporkan 316 m. Perburuan ini dimainkan di lapangan terbuka, sehingga
# 2.0 adalah tebakan awal yang benar; ubah lewat --n bila ternyata meleset.
PATH_LOSS_N = 2.0

# Ketidakpastian RSSI yang dipakai untuk melebarkan rentang jaraknya. Karena
# modelnya logaritmik, lebar rentang dalam meter tumbuh sebanding dengan
# jaraknya sendiri: +-6 dB berarti kali 1,7 ke dua arah, jadi "10 m" berarti
# 6-17 m sedangkan "800 m" berarti 460-1390 m. Itu bukan kerusakan, itu memang
# sebanyak itulah yang diketahui RSSI pada jarak sejauh itu.
RSSI_UNCERTAINTY_DB = 6.0

# Batas atas perkiraan jarak, semata-mata supaya satu paket aneh tidak
# melaporkan angka yang mustahil. Batas jangkauan yang sebenarnya ditentukan
# oleh daya pancar beacon dan tembok di antaranya, bukan oleh angka ini.
MAX_RANGE_M = 2000.0

# ---------------------------------------------------------------------------
# Identitas dan wewenang
#
# Sampai revisi ini papan skor sama sekali tidak punya gagasan "siapa yang
# sedang melihat". Siapa pun di hotspot dapat mengakhiri permainan. Sekarang
# ada tiga peran: tamu (hanya menonton), anggota (satu kelompok, boleh
# mengklaim untuk kelompoknya sendiri), dan asisten (memegang token).
# ---------------------------------------------------------------------------

# Abjad token tanpa huruf/angka yang mudah tertukar saat dibacakan di lapangan:
# tanpa 0/O, 1/I/L, 2/Z, 5/S, 8/B.
TOKEN_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679"
TOKEN_LEN = 6
MAX_GAGAL_TOKEN = 5      # percobaan token salah per koneksi sebelum ditutup

PERAN_TAMU = "tamu"
PERAN_ANGGOTA = "anggota"
PERAN_ASISTEN = "asisten"

# Perintah yang hanya boleh dijalankan asisten.
AKSI_ASISTEN = frozenset({
    "konfirmasi", "tolak", "kalibrasi", "reset",
    # jadwal_baca ikut di sini, bukan karena ia mengubah sesuatu, melainkan
    # karena ia MEMBACA sesuatu: rencana lengkap beserta NIM tiap praktikan.
    # Itu satu-satunya jalan keluar NIM selain balasan "masuk" kepada orang
    # yang baru saja mengetikkan NIM-nya sendiri.
    "jadwal_set", "jadwal_baca", "jadwal_hapus", "sesi_mulai", "sesi_akhiri",
    # Mission control: menutup panggilan sebuah kelompok, mengumumkan ke
    # semua ponsel, dan memutar hitung mundur di proyektor.
    "panggil_selesai", "pengumuman", "aba_aba",
    # Jari-jari arena dari ruang kendali, tanpa menyalakan ulang server.
    "arena",
})

# ---------------------------------------------------------------------------
# Permainan: peran, sinyal tim, sapuan, jejak
# ---------------------------------------------------------------------------

# Peran lunak di dalam satu kelompok. Tidak ada yang dikunci: setiap ponsel
# tetap melihat seluruh perburuan, peran hanya menentukan apa yang tampil
# paling atas. Huruf tunggalnya dipakai di bingkai 10 Hz supaya ringkas.
PERAN_TIM = {"pemandu": "p", "pengintai": "i", "operator": "o"}

# Empat sinyal teks siap pakai. Hanya sampai ke kelompok itu sendiri dan ke
# asisten, tidak pernah ke proyektor maupun kelompok lain.
PING_KODE = frozenset({"ke_sini", "naik", "tunggu", "cek_klaim"})
PING_JEDA_SEC = 3.0            # satu sinyal per koneksi per sekian detik
PING_RIWAYAT = 5               # sinyal terakhir yang disimpan per kelompok

MAX_PENGUMUMAN = 140

# Sapuan 8 arah: RSSI halus per arah. Di luar rentang ini bukan pembacaan
# SX1276 yang sah, dan sapuan dengan kurang dari 4 arah tidak berarti apa-apa.
SAPUAN_ARAH = 8
SAPUAN_MIN_TERISI = 4
SAPUAN_RSSI_MIN = -140.0
SAPUAN_RSSI_MAX = 0.0

# Jejak untuk tayangan ulang: satu cuplikan per detik per kelompok, cukup
# untuk satu sesi penuh (150 menit = 9000 detik).
JEJAK_CAP = 9000
JEJAK_PERISTIWA_CAP = 2000
JEJAK_KIND = frozenset({
    "zona", "klaim", "tolak", "ditemukan", "sapuan", "salip", "panggil",
})

# Titik jangkar kurva logaritmik yang sama dengan reach() di sense.js.
REACH_D0_M = 3.0

# jarak_awal adalah median jarak sepanjang sekian detik pertama sebuah
# kelompok melapor. Kemajuan dihitung terhadapnya, sehingga lima kelompok
# yang berangkat dari lima jarak berbeda tetap dapat dibandingkan secara adil.
AWAL_JENDELA_SEC = 10

# Urutan tangga panas sebagai angka, untuk peristiwa "masuk zona".
HEAT_LEVEL = {"hilang": 0, "dingin": 1, "sejuk": 2, "hangat": 3,
              "panas": 4, "membara": 5}

# Salip: urutan kemajuan (dihaluskan) dibandingkan tiap sekian detik, dan
# pasangan yang sama tidak diumumkan lagi sebelum jedanya lewat.
SALIP_TIAP_SEC = 20
SALIP_JEDA_SEC = 180
SALIP_SELISIH = 0.015

# ---------------------------------------------------------------------------
# Unggahan foto klaim
# ---------------------------------------------------------------------------

UPLOAD_DIR = HERE / "uploads"
MAX_FOTO_BYTES = 512 * 1024        # peramban sudah mengecilkan ke ~300 KB
MAX_FOTO_PER_GRUP = 8
MAX_FOTO_TOTAL = 200               # pagar keras: 200 x 512 KB = 100 MB
UNGGAH_BASI_SEC = 30.0             # header tanpa bingkai biner dianggap batal

MIME_FOTO = {"image/jpeg": ".jpg", "image/webp": ".webp"}
TIPE_FOTO = {".jpg": "image/jpeg", ".webp": "image/webp"}
# Beberapa bait pertama yang harus cocok, supaya berkas yang salah jenis
# tertolak sebelum ditulis.
SNIFF_FOTO = {".jpg": bytes.fromhex("ffd8ff"), ".webp": b"RIFF"}

# Nama berkas dibangkitkan server, jadi daftar putihnya boleh sangat ketat.
# Tidak ada titik selain pemisah ekstensi, tidak ada garis miring, tidak ada
# huruf besar -- sehingga "..", "." dan "%2e%2e" semuanya gagal.
FOTO_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}\.(?:jpg|webp)$")
RONDE_RE = re.compile(r"^\d{8}-\d{6}$")

# Batas ukuran bingkai WebSocket. Ini pagar protokol, bukan batas foto: batas
# foto yang sebenarnya MAX_FOTO_BYTES, ditegakkan di lapisan aplikasi supaya
# pesan galatnya terbaca manusia. Jangan dinaikkan -- nilainya berlaku untuk
# seluruh server, termasuk /hunter dan /beacon yang bingkainya ratusan bait.
WS_MAX_SIZE = 1 << 20

# ---------------------------------------------------------------------------
# Rencana satu hari: empat sesi praktikum
#
# Praktikum berjalan empat sesi sehari dengan praktikan yang berbeda-beda.
# Asisten mengetik keempatnya sekali di pagi hari; server yang memutuskan
# sesi mana yang sedang berjalan, dan membersihkan ronde sebelumnya saat
# giliran berpindah.
#
# Jam mulai bawaan berjarak tiga jam, sedangkan satu sesi dibatasi 150 menit.
# Dua aturan yang diminta -- "bersih 150 menit setelah mulai" dan "bersih 30
# menit sebelum sesi berikutnya" -- karenanya jatuh pada detik yang sama.
# akhir() di bawah memakai min() dari keduanya, sehingga keduanya tetap
# benar seandainya jam mulainya kelak dirapatkan.
# ---------------------------------------------------------------------------

JADWAL_PATH = HERE / "jadwal.json"
ROSTER_PATH = HERE / "roster.json"   # berkas v1; dibuang bila ditemukan
# Ditulis oleh agent PC (Stage 18) dari respons denyut jantungnya
# sendiri -- lihat pc/agent/agent.py dan apps/web/api/agent/index.ts's
# jadwalModul4Hari(). Bukan di bawah /home karena systemd unit agent
# memasang ProtectHome=true.
JADWAL_IMPOR_PATH_BAWAAN = pathlib.Path("/var/lib/iris-agent/bagi/jadwal-modul4.json")
JADWAL_IMPOR_PATH = JADWAL_IMPOR_PATH_BAWAAN  # dapat diganti lewat --jadwal-impor
JADWAL_IMPOR_MTIME: float | None = None
JADWAL_MULAI = ("06:30", "09:30", "12:30", "15:30")
SESI_DURASI_SEC = 150 * 60         # batas satu sesi praktikum
SESI_JEDA_SEC = 30 * 60            # bersih selambatnya sekian sebelum sesi berikut
SESI_SAPU_SEC = 10.0               # denyut pemeriksa pergantian sesi
JAM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

MAX_NAMA_LEN = 40
MAX_ANGGOTA = 12
MAX_GRUP_ID = 99

# NIM dibiarkan alfanumerik, bukan angka saja: kampus lain memakai huruf, dan
# gagal keras di sini akan tampak seperti "papan skornya rusak" di lapangan.
NIM_RE = re.compile(r"^[A-Za-z0-9]{4,20}$")
MAX_GAGAL_MASUK = 12               # percobaan NIM tak dikenal per koneksi

# ---------------------------------------------------------------------------
# Penghargaan
# ---------------------------------------------------------------------------

# Kelompok yang baru tersambung lima detik tidak boleh memenangkan "tautan
# terandal" dengan 0% kehilangan yang belum teruji. Pada jeda beacon 200 ms,
# 200 paket kira-kira 40 detik penerimaan.
MIN_PAKET_PENGHARGAAN = 200
JENDELA_PENDEKAT_SEC = 8.0         # jendela laju mendekat
JENDELA_PENDEKAT_MAX = 20.0        # di atas ini jendelanya melintasi putusnya sinyal
LAJU_MIN_DB_S = 0.3                # di bawah ini bukan mendekat, hanya derau

# Riwayat RSSI per kelompok. Pada 5 paket/detik, 160 cuplikan ~32 detik --
# cukup panjang untuk menampung jendela laju mendekat di atas dengan sisa.
HISTORY_CAP = 160


def timestamp() -> str:
    """Jam dinding PC dalam format HH:MM:SS:MS."""
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ronde_baru() -> str:
    """Penanda ronde untuk folder foto, mis. 20260919-141530."""
    return f"{datetime.now():%Y%m%d-%H%M%S}"


class Hunt:
    """Seluruh keadaan satu ronde perburuan."""

    def __init__(self) -> None:
        # Ketiganya adalah sifat ruangan, bukan sifat satu ronde, jadi
        # sengaja tidak disentuh oleh reset(): menekan "Sesi baru" di antara
        # dua ronde tidak boleh membuang kalibrasi 1 meter yang sudah diambil.
        self.arena_m = ARENA_RADIUS_M
        self.rssi_at_1m = RSSI_AT_1M
        self.path_loss_n = PATH_LOSS_N
        # Jam dinding (YYYY-MM-DD HH:MM) kalibrasi terakhir; None = bawaan.
        self.kalibrasi_pada: str | None = None
        self.reset()

    def reset(self) -> None:
        self.groups: dict[int, dict] = {}
        self.started_at: float | None = None
        # Once every group that has ever joined has found its own target
        # (see confirm()), the round is over and round_ended_at freezes
        # elapsed(). There is no single self.found_by any more -- five
        # independent pairs finish independently, at their own times.
        self.round_ended_at: float | None = None
        self.finish_seq = 0
        self.events: list[dict] = []
        self.rev = 0

        # Antrean klaim. Nomor urut naik terus sepanjang ronde, sehingga
        # asisten selalu meninjau menurut urutan pengajuan.
        self.klaim_seq = 0

        # Penghargaan dibekukan begitu pemenang disahkan. confirm() tidak
        # memegang baris yang sudah terurut, jadi ia hanya menaikkan bendera
        # dan snapshot() berikutnya yang membekukan.
        self.penghargaan_beku: dict | None = None
        self.bekukan = False

        # Satu ronde, satu folder foto.
        self.ronde = ronde_baru()

        # Permainan. Semuanya milik satu ronde, jadi "Ronde baru" dan
        # pergantian sesi membuang seluruhnya bersama foto-fotonya.
        self.pings: dict[int, list[dict]] = {}
        self.ping_seq = 0
        self.panggil: dict[int, float] = {}
        self.sapuan: dict[int, dict] = {}
        self.pengumuman: dict | None = None
        self.pengumuman_seq = 0
        self.jejak_peristiwa: list[dict] = []
        self.salip_ema: dict[int, float] = {}
        self.salip_urut: list[int] | None = None
        self.salip_akhir: dict[str, int] = {}
        self.cuplik_terakhir = -1

    # -- catatan peristiwa ------------------------------------------------

    def detik(self) -> int:
        """Detik sejak perburuan dimulai; 0 sebelum ada yang memancar."""
        return self.elapsed() if self.started_at is not None else 0

    def note(self, kind: str, group: int | None = None, **extra) -> None:
        """Satu baris untuk lajur notifikasi pada papan skor.

        "t" adalah detik perburuan, supaya tayangan ulang dapat menaruh
        peristiwa yang sama di sumbu waktunya sendiri. Jam dinding "at"
        tetap ada untuk toast dan untuk kunci penghapus duplikat di klien.
        """
        entry = {"kind": kind, "grup": group, "at": timestamp(),
                 "t": self.detik(), **extra}
        self.events.append(entry)
        del self.events[:-40]
        if kind in JEJAK_KIND:
            self.jejak_peristiwa.append(entry)
            del self.jejak_peristiwa[:-JEJAK_PERISTIWA_CAP]
        self.rev += 1

    # -- masukan dari perangkat -------------------------------------------

    def group_slot(self, gid: int) -> dict:
        slot = self.groups.get(gid)
        if slot is None:
            slot = {
                "grup": gid,
                "rssi": None,
                "halus": None,
                "snr": None,
                "best": None,
                "trend": 0.0,
                "seq": 0,
                "first_seq": None,
                "diterima": 0,
                "tx": None,
                "rx": None,
                "delay_ms": None,
                "ip": None,
                "connected": True,
                "last_packet": time.monotonic(),
                "connected_at": time.monotonic(),
                "history": [],

                # Keadaan klaim. "ditolak" diperlakukan persis seperti
                # "memburu" oleh penjaga klaim, sehingga tidak menambah aturan
                # apa pun -- gunanya hanya supaya antarmuka bisa menampilkan
                # alasan penolakan tanpa perlu bendera kedua.
                "status": "memburu",
                "klaim_ke": 0,
                "klaim_urut": None,
                "klaim_at": None,
                "klaim_foto": None,
                "klaim_jarak": None,
                "klaim_rssi": None,
                "tolak_alasan": None,
                "foto_riwayat": [],

                # Laju mendekat terbaik sepanjang ronde, dB/detik.
                "laju_terbaik": 0.0,
                # Delay terbaik (terpendek) sepanjang ronde, milidetik --
                # dipakai penghargaan "tautan_tercepat", lihat penghargaan().
                "delay_terbaik": None,

                # Sisi BEACON pasangan ini. Setiap kelompok memburu targetnya
                # SENDIRI, jadi beacon dan hunter sebuah pasangan berbagi satu
                # slot di sini alih-alih dua struktur paralel.
                "beacon_online": False,
                "beacon_seq": 0,
                "beacon_tx": None,
                "beacon_ip": None,
                "beacon_last": None,

                # Diisi saat confirm() mengesahkan kelompok ini menemukan
                # targetnya sendiri. finish_seq menaik terus sepanjang ronde,
                # jadi ia adalah urutan waktu temu yang dipakai penghargaan()
                # dan HUD -- tidak seperti RSSI, ini sah dibandingkan antar
                # kelompok karena tidak bergantung pada di mana target
                # masing-masing disembunyikan.
                "found_at": None,
                "finish_seq": None,
                "durasi": None,

                # Jejak 1 Hz untuk tayangan ulang: (detik, jarak_m,
                # kemajuan, tingkat panas). Lihat cuplik().
                "jejak": [],
                "awal": [],
                "awal_mulai": None,
                "jarak_awal": None,
                "heat_max": None,
            }
            self.groups[gid] = slot
            self.note("bergabung", gid)
        return slot

    def on_beacon(self, msg: dict, ip: str | None) -> None:
        gid = int(msg["grup"])
        slot = self.group_slot(gid)
        slot["beacon_online"] = True
        slot["beacon_seq"] = int(msg.get("seq", 0))
        slot["beacon_tx"] = msg.get("tx")
        slot["beacon_ip"] = ip
        slot["beacon_last"] = time.monotonic()

        if self.started_at is None:
            self.started_at = time.monotonic()
            self.note("mulai")
        self.rev += 1

    def on_hunter(self, msg: dict, ip: str | None) -> None:
        gid = int(msg["grup"])
        slot = self.group_slot(gid)

        # Hunter yang tersambung lebih dulu daripada beacon-nya (Wi-Fi beacon
        # sedang rewel) tetap memulai jam perburuan. Tanpa ini ronde itu
        # tidak punya jejak sama sekali, karena cuplik() menunggu started_at.
        if self.started_at is None:
            self.started_at = time.monotonic()
            self.note("mulai")

        was_silent = self._silent(slot)

        slot["seq"] = int(msg.get("seq", 0))
        if slot["first_seq"] is None:
            slot["first_seq"] = slot["seq"]
        slot["rssi"] = int(msg.get("rssi", 0))
        slot["halus"] = float(msg.get("halus", msg.get("rssi", 0)))
        slot["snr"] = float(msg.get("snr", 0))
        slot["tx"] = msg.get("tx")
        slot["rx"] = msg.get("rx")
        slot["ip"] = ip or msg.get("ip")
        slot["diterima"] += 1
        slot["last_packet"] = time.monotonic()
        slot["connected"] = True

        slot["delay_ms"] = self._delay_ms(msg.get("tx"), msg.get("rx"))
        if slot["delay_ms"] is not None:
            if slot["delay_terbaik"] is None or slot["delay_ms"] < slot["delay_terbaik"]:
                slot["delay_terbaik"] = slot["delay_ms"]

        if slot["best"] is None or slot["halus"] > slot["best"]:
            slot["best"] = slot["halus"]

        # Kecenderungan dihitung dari beda nilai halus terhadap satu detik
        # yang lalu: itulah yang dipakai pemain, bukan angka mutlaknya.
        history = slot["history"]
        history.append((time.monotonic(), slot["halus"]))
        del history[:-HISTORY_CAP]

        # Laju mendekat dipantau sebagai maksimum berjalan, bukan dihitung
        # ulang di akhir: riwayatnya terpotong, jadi sprint terbaik sebuah
        # kelompok bisa saja sudah keluar dari jendela saat ronde berakhir.
        slot["laju_terbaik"] = max(slot["laju_terbaik"], self._laju(history))
        slot["trend"] = self._trend(history)

        if was_silent:
            self.note("kembali", gid)
        self.rev += 1

    # -- turunan ----------------------------------------------------------

    @staticmethod
    def _delay_ms(tx: str | None, rx: str | None) -> int | None:
        """Selisih dua cap waktu HH:MM:SS:MS, dalam milidetik."""
        if not tx or not rx:
            return None
        try:
            def ms(stamp: str) -> int:
                h, m, s, milli = (int(part) for part in stamp.split(":"))
                return ((h * 60 + m) * 60 + s) * 1000 + milli

            delta = ms(rx) - ms(tx)
        except (ValueError, TypeError):
            return None

        # Perburuan melewati tengah malam tidak pernah terjadi, tetapi satu
        # baris ini membuat hasilnya tidak pernah menjadi angka raksasa.
        if delta < -43200000:
            delta += 86400000
        return delta

    @staticmethod
    def _trend(history: list[tuple[float, float]]) -> float:
        if len(history) < 2:
            return 0.0
        now = history[-1][0]
        past = [value for stamp, value in history if now - stamp >= 1.0]
        if not past:
            return 0.0
        return round(history[-1][1] - past[-1], 1)

    @staticmethod
    def _laju(history: list[tuple[float, float]]) -> float:
        """Perolehan dB per detik pada jendela ~8 detik terakhir.

        Bukan kecenderungan sesaat. Satu pantulan tanah yang saling meniadakan
        menggeser RSSI belasan dB dalam kurang dari sedetik tanpa siapa pun
        bergerak, sehingga metrik sesaat akan memberi penghargaan kepada
        kelompok yang kebetulan berdiri di tempat paling buruk. Jendela
        delapan detik merata-ratakan beberapa pudaran sekaligus, tetapi masih
        cukup pendek sehingga berjalan mendekat benar-benar mendominasi.

        Jendela yang lebih panjang dari JENDELA_PENDEKAT_MAX dibuang, supaya
        kelompok yang sinyalnya hilang lima belas detik lalu muncul kembali di
        sebelah beacon tidak menang dengan kemiringan yang tidak pernah
        mereka tempuh.
        """
        if len(history) < 2:
            return 0.0
        now, kini = history[-1]
        for stamp, value in history:
            span = now - stamp
            if JENDELA_PENDEKAT_SEC <= span <= JENDELA_PENDEKAT_MAX:
                return (kini - value) / span
        return 0.0

    @staticmethod
    def _silent(slot: dict) -> bool:
        return (time.monotonic() - slot["last_packet"]) > SILENCE_SEC

    def distance_m(self, rssi: float | None) -> float | None:
        """Jarak perkiraan dalam meter dari sebuah nilai RSSI."""
        if rssi is None:
            return None
        exponent = (self.rssi_at_1m - rssi) / (10.0 * self.path_loss_n)
        # Dibatasi hanya supaya satu paket aneh tidak melaporkan angka yang
        # mustahil; ini bukan batas jangkauan radionya.
        return round(clamp(10.0 ** exponent, 0.1, MAX_RANGE_M), 1)

    def distance_band(self, rssi: float | None) -> tuple[float | None, float | None]:
        """Rentang jarak yang masih masuk akal untuk RSSI sebesar itu."""
        if rssi is None:
            return None, None
        near = self.distance_m(rssi + RSSI_UNCERTAINTY_DB)
        far = self.distance_m(rssi - RSSI_UNCERTAINTY_DB)
        return near, far

    def calibrate(self, gid: int) -> None:
        """Menetapkan RSSI acuan 1 meter dari pembacaan sebuah hunter.

        Asisten memegang papan hunter itu tepat satu meter dari beacon, lalu
        menekan tombol kalibrasi. Sesudah ini seluruh perkiraan jarak memakai
        ruangan yang sebenarnya, bukan angka bawaan di dalam kode.
        """
        slot = self.groups.get(gid)
        if slot is None or slot["halus"] is None:
            return
        self.rssi_at_1m = round(slot["halus"], 1)
        self.kalibrasi_pada = datetime.now().strftime("%Y-%m-%d %H:%M")
        self.note("kalibrasi", gid, rssi=self.rssi_at_1m)

    def heat_radius(self, fraction: float, floor_m: float) -> float:
        """Jarak batas satu anak tangga panas, dalam meter."""
        return max(floor_m, fraction * self.arena_m)

    def heat(self, slot: dict) -> str:
        """Anak tangga panas sebuah kelompok.

        Tangganya dinyatakan dalam *jarak*, bukan dalam dBm tetap. Ambang dBm
        yang dipaku di dalam kode hanya masuk akal untuk satu ukuran ruangan:
        di gedung selebar setengah kilometer seluruh kelompok akan terbaca
        "dingin" sepanjang permainan, dan umpan baliknya mati. Karena
        ambangnya diturunkan dari jari-jari arena lewat model jarak yang sama,
        kalibrasi 1 meter ikut menggeser seluruh tangganya sekaligus.
        """
        if slot["halus"] is None or self._silent(slot):
            return "hilang"
        jarak = self.distance_m(slot["halus"])
        if jarak is None:
            return "hilang"
        for name, fraction, floor_m in HEAT_LADDER:
            if jarak <= self.heat_radius(fraction, floor_m):
                return name
        return "dingin"

    def progress(self, slot: dict) -> float:
        """Posisi batang jarak, 0..1, dikalibrasi terhadap ronde ini sendiri.

        Rentang RSSI sebuah ruangan tidak pernah sama dua kali, jadi skalanya
        diambil dari nilai terburuk dan terbaik yang benar-benar terlihat
        sepanjang ronde, bukan dari angka tetap di dalam kode.
        """
        if slot["halus"] is None:
            return 0.0

        seen = [g["halus"] for g in self.groups.values() if g["halus"] is not None]
        seen += [g["best"] for g in self.groups.values() if g["best"] is not None]
        if not seen:
            return 0.0

        low, high = min(seen), max(seen)
        if high - low < 12:  # Rentang terlalu sempit untuk dipercaya
            low, high = -100.0, -40.0

        # Disisakan 4% supaya kelompok terlemah tetap menampakkan batang
        # tipis, bukan batang kosong yang terbaca seperti papan rusak.
        span = (slot["halus"] - low) / (high - low)
        return round(0.04 + 0.96 * clamp(span, 0.0, 1.0), 3)

    # -- kemajuan dan jejak -----------------------------------------------

    def kemajuan(self, slot: dict) -> float:
        """Pecahan jarak SENDIRI yang sudah ditutup, 0..1.

        Satu-satunya angka kedekatan yang sah dibandingkan antar kelompok:
        setiap kelompok memburu beacon yang berbeda, jadi RSSI mentah atau
        jarak mentah tidak bisa diadu. Yang diadu adalah seberapa jauh
        masing-masing sudah berjalan dari titik berangkatnya sendiri,
        pada kurva logaritmik yang sama dengan reach() di sense.js, supaya
        tiga meter terakhir tidak hilang di ujung skala.
        """
        if slot["status"] == "menang":
            return 1.0
        awal = slot["jarak_awal"]
        jarak = self.distance_m(slot["halus"])
        if awal is None or jarak is None:
            return 0.0
        # Kelompok yang berangkat sudah di dekat beacon-nya tidak boleh
        # membagi dengan hampir nol. Acuannya paling sedikit dua kali
        # jari-jari "membara".
        acuan = max(awal, 2.0 * self.heat_radius(*HEAT_LADDER[0][1:]))
        skala = math.log(1.0 + acuan / REACH_D0_M)
        nilai = 1.0 - math.log(1.0 + jarak / REACH_D0_M) / skala
        return round(clamp(nilai, 0.0, 1.0), 4)

    def cuplik(self) -> None:
        """Satu cuplikan jejak per detik perburuan, dipanggil dari siaran.

        Juga tempat dua peristiwa permainan dihitung, karena keduanya butuh
        irama tetap yang sama: masuk zona yang lebih dekat, dan salip
        (urutan kemajuan yang dihaluskan berubah).
        """
        if self.started_at is None or self.round_ended_at is not None:
            return
        t = self.detik()
        if t == self.cuplik_terakhir:
            return
        self.cuplik_terakhir = t

        for gid, slot in self.groups.items():
            if slot["halus"] is None or self._silent(slot):
                continue
            jarak = self.distance_m(slot["halus"])
            heat = self.heat(slot)
            level = HEAT_LEVEL[heat]

            if slot["jarak_awal"] is None:
                if slot["awal_mulai"] is None:
                    slot["awal_mulai"] = t
                slot["awal"].append(jarak)
                if (t - slot["awal_mulai"] >= AWAL_JENDELA_SEC
                        and len(slot["awal"]) >= 3):
                    urut = sorted(slot["awal"])
                    slot["jarak_awal"] = urut[len(urut) // 2]
                    slot["awal"] = []
                    # Zona awal bukan pencapaian: kelompok yang berangkat
                    # di zona hangat tidak diumumkan "masuk zona hangat".
                    slot["heat_max"] = level

            kem = self.kemajuan(slot)
            slot["jejak"].append((t, jarak, kem, level))
            del slot["jejak"][:-JEJAK_CAP]

            if slot["heat_max"] is not None and level > slot["heat_max"]:
                slot["heat_max"] = level
                if level >= HEAT_LEVEL["hangat"] and slot["status"] != "menang":
                    self.note("zona", gid, heat=heat)

            if slot["jarak_awal"] is not None and slot["status"] != "menang":
                lama = self.salip_ema.get(gid)
                self.salip_ema[gid] = kem if lama is None else lama * 0.9 + kem * 0.1

        if t > 0 and t % SALIP_TIAP_SEC == 0:
            self._periksa_salip(t)

    def _periksa_salip(self, t: int) -> None:
        """Umumkan satu salip bila urutan kemajuan berubah sejak terakhir."""
        hidup = [gid for gid, slot in self.groups.items()
                 if slot["status"] != "menang" and gid in self.salip_ema]
        hidup.sort(key=lambda g: -self.salip_ema[g])
        lalu = self.salip_urut
        self.salip_urut = hidup
        if not lalu:
            return
        for i, gid in enumerate(hidup):
            sebelum = lalu.index(gid) if gid in lalu else -1
            if sebelum <= i:
                continue
            lawan = lalu[i] if i < len(lalu) else None
            if lawan is None or lawan not in hidup or hidup.index(lawan) <= i:
                break
            if self.salip_ema[gid] - self.salip_ema[lawan] <= SALIP_SELISIH:
                break
            kunci = f"{gid}>{lawan}"
            if t - self.salip_akhir.get(kunci, -SALIP_JEDA_SEC) < SALIP_JEDA_SEC:
                break
            self.salip_akhir[kunci] = t
            self.note("salip", gid, lawan=lawan)
            break

    def jejak(self, grup: int | None = None, sejak: int | None = None,
              detik: int | None = None, langkah: int = 1) -> dict:
        """Bentuk publik jejak untuk /jejak.json.

        Hanya nomor kelompok, jarak, kemajuan, tingkat panas dan waktu.
        Tidak ada NIM, dan tidak ada nama selain nama depan pada peristiwa
        sapuan, yang memang sudah publik lewat /roster.json.
        """
        kini = self.detik()
        batas_bawah = -1
        if sejak is not None:
            batas_bawah = max(batas_bawah, sejak)
        if detik is not None:
            batas_bawah = max(batas_bawah, kini - detik)
        langkah = max(1, langkah)

        keluar: dict[str, dict] = {}
        for gid, slot in sorted(self.groups.items()):
            if grup is not None and gid != grup:
                continue
            baris = [s for s in slot["jejak"] if s[0] > batas_bawah]
            if langkah > 1:
                # Cuplikan terakhir selalu ikut, supaya garisnya berakhir
                # tepat di "sekarang" berapa pun langkahnya.
                terakhir = baris[-1:] if baris else []
                baris = [s for s in baris if s[0] % langkah == 0]
                if terakhir and (not baris or baris[-1] is not terakhir[0]):
                    baris.append(terakhir[0])
            keluar[str(gid)] = {
                "jarak_awal": slot["jarak_awal"],
                "status": slot["status"],
                "durasi": slot["durasi"],
                "s": [[s[0], s[1], s[2], s[3]] for s in baris],
            }

        peristiwa = [
            {k: v for k, v in e.items() if k != "at"}
            for e in self.jejak_peristiwa
            if e["t"] > batas_bawah and (grup is None or e["grup"] == grup)
        ]
        return {
            "ronde": self.ronde,
            "berjalan": kini,
            "selesai": self.round_ended_at is not None,
            "arena_m": self.arena_m,
            "grup": keluar,
            "peristiwa": peristiwa,
        }

    # -- keputusan asisten -------------------------------------------------

    def nominee(self, slot: dict) -> bool:
        """Sudah cukup dekat untuk mengklaim TARGETNYA SENDIRI sekarang?

        Setiap kelompok memburu targetnya sendiri, jadi ini pertanyaan
        per-kelompok -- bukan "siapa yang paling dekat sejagat", yang tidak
        berarti apa-apa ketika kelima target disembunyikan di lima tempat
        yang berbeda.
        """
        if slot["status"] == "menang":
            return False
        if slot["halus"] is None or self._silent(slot):
            return False
        return self.heat(slot) == "membara"

    # -- daur hidup klaim --------------------------------------------------
    #
    #   memburu  --(dekat, kelompok sendiri)-->  menunggu
    #   menunggu --(asisten setuju)----------->  menang    [hanya satu]
    #   menunggu --(asisten tolak + alasan)--->  ditolak    -> boleh ulang
    #
    # Beberapa kelompok boleh berada di "menunggu" sekaligus; asisten
    # meninjau menurut urutan pengajuan.

    def claim_armed(self, gid: int) -> tuple[bool, str]:
        """Boleh mengklaim sekarang? -> (boleh, alasan bila tidak).

        Alasannya ditulis untuk dibaca langsung oleh praktikan, karena
        tombol klaim menampilkannya apa adanya. Tidak ada lagi gerbang
        "perburuan sudah selesai" secara global -- setiap kelompok memburu
        targetnya sendiri, jadi kelompok lain menang atau kalah tidak
        mengubah apa pun di sini; slot["status"] == "menang" di bawah sudah
        menutup jalan bagi kelompok yang sudah menang sendiri.
        """
        slot = self.groups.get(gid)
        if slot is None:
            return False, "kelompok belum mengirim data"
        if slot["status"] == "menunggu":
            return False, "klaim sedang ditinjau"
        if slot["status"] == "menang":
            return False, "sudah menang"
        if slot["halus"] is None or self._silent(slot):
            return False, "sinyal hilang"
        if self.heat(slot) != "membara":
            jarak = self.distance_m(slot["halus"])
            return False, f"belum cukup dekat (perkiraan {jarak} m)"
        return True, ""

    def claim(self, gid: int, foto: str | None) -> tuple[bool, str]:
        """Sebuah kelompok mengajukan bahwa merekalah yang memegang beacon."""
        boleh, alasan = self.claim_armed(gid)
        if not boleh:
            return False, alasan

        slot = self.groups[gid]
        self.klaim_seq += 1
        slot["status"] = "menunggu"
        slot["klaim_urut"] = self.klaim_seq
        slot["klaim_at"] = time.monotonic()
        slot["klaim_foto"] = foto
        slot["klaim_ke"] += 1
        slot["tolak_alasan"] = None
        # Jarak dibekukan pada saat klaim: kalau kelompoknya berjalan lagi
        # sambil menunggu, yang ditinjau asisten tetap keadaan saat mereka
        # menekan tombol.
        slot["klaim_jarak"] = self.distance_m(slot["halus"])
        slot["klaim_rssi"] = slot["halus"]
        self.note("klaim", gid, jarak=slot["klaim_jarak"], foto=bool(foto))
        return True, ""

    def reject(self, gid: int, alasan: str) -> tuple[bool, str]:
        """Asisten menolak sebuah klaim. Kelompok boleh mengklaim lagi."""
        slot = self.groups.get(gid)
        if slot is None:
            return False, "kelompok tidak dikenal"
        if slot["status"] != "menunggu":
            return False, "kelompok tidak sedang menunggu"

        slot["status"] = "ditolak"
        slot["tolak_alasan"] = (alasan or "").strip()[:120] or "tanpa alasan"
        slot["klaim_urut"] = None
        slot["klaim_at"] = None
        # Nama berkasnya tetap ada di foto_riwayat, supaya asisten masih bisa
        # membukanya kembali dan supaya penyapu tahu apa yang harus dihapus.
        slot["klaim_foto"] = None
        self.note("tolak", gid, alasan=slot["tolak_alasan"])
        return True, ""

    def confirm(self, gid: int, paksa: bool = False) -> tuple[bool, str]:
        """Asisten mengesahkan bahwa SEBUAH kelompok menemukan TARGETNYA
        SENDIRI.

        Ini tidak lagi mengakhiri perburuan untuk siapa pun selain kelompok
        itu sendiri: lima pasangan berburu lima target yang berbeda, jadi
        kelompok 3 menang tidak menutup klaim kelompok 1 yang masih
        menunggu. Ronde secara keseluruhan baru berakhir (lihat bekukan di
        bawah) begitu SETIAP kelompok yang pernah bergabung sudah menang.

        `paksa` melewati syarat "harus sudah mengajukan klaim". Itu ada
        supaya baterai habis atau izin kamera ditolak tidak sampai membuat
        permainan tidak bisa diselesaikan; antarmuka menaruhnya di balik
        tekan-lama.
        """
        slot = self.groups.get(gid)
        if slot is None:
            return False, "kelompok tidak dikenal"
        if slot["status"] == "menang":
            return False, "sudah menang"
        if slot["status"] != "menunggu" and not paksa:
            return False, "kelompok belum mengajukan klaim"

        self.finish_seq += 1
        slot["status"] = "menang"
        slot["klaim_urut"] = None
        slot["found_at"] = time.monotonic()
        slot["finish_seq"] = self.finish_seq
        slot["durasi"] = (
            int(slot["found_at"] - self.started_at) if self.started_at else 0
        )

        self.note("ditemukan", gid, durasi=slot["durasi"])

        if self.groups and all(g["status"] == "menang" for g in self.groups.values()):
            self.bekukan = True
            self.round_ended_at = time.monotonic()

        return True, ""

    def antrian(self) -> list[dict]:
        """Klaim yang menunggu tinjauan, menurut urutan pengajuan."""
        now = time.monotonic()
        rows = [
            {
                "grup": slot["grup"],
                "urut": slot["klaim_urut"],
                "sejak": int(now - slot["klaim_at"]) if slot["klaim_at"] else 0,
                "jarak_m": slot["klaim_jarak"],
                "rssi": slot["klaim_rssi"],
                "foto": slot["klaim_foto"],
                "foto_url": f"/foto/{slot['klaim_foto']}" if slot["klaim_foto"] else None,
                "klaim_ke": slot["klaim_ke"],
            }
            for slot in self.groups.values()
            if slot["status"] == "menunggu" and slot["klaim_urut"] is not None
        ]
        rows.sort(key=lambda r: r["urut"])
        return rows

    def elapsed(self) -> int:
        if self.started_at is None:
            return 0
        end = self.round_ended_at if self.round_ended_at is not None else time.monotonic()
        return int(end - self.started_at)

    # -- bingkai untuk peramban -------------------------------------------

    def snapshot(self) -> dict:
        now = time.monotonic()

        rows = []
        beacons_online = 0
        for slot in self.groups.values():
            silent = self._silent(slot)
            if slot["first_seq"] is None:
                expected = 0
            else:
                newest = max(slot["beacon_seq"], slot["seq"])
                expected = max(0, newest - slot["first_seq"] + 1)
            lost = max(0, expected - slot["diterima"])

            near, far = self.distance_band(slot["halus"])

            beacon_online = (
                slot["beacon_online"]
                and slot["beacon_last"] is not None
                and (now - slot["beacon_last"]) < SILENCE_SEC
            )
            if beacon_online:
                beacons_online += 1

            rows.append({
                "grup": slot["grup"],
                "rssi": slot["rssi"],
                "halus": None if slot["halus"] is None else round(slot["halus"], 1),
                "jarak_m": self.distance_m(slot["halus"]),
                "jarak_dekat": near,
                "jarak_jauh": far,
                "snr": slot["snr"],
                "best": None if slot["best"] is None else round(slot["best"], 1),
                "trend": slot["trend"],
                "heat": self.heat(slot),
                "progress": self.progress(slot),
                "seq": slot["seq"],
                "diterima": slot["diterima"],
                "hilang": lost,
                "rugi_persen": round(100.0 * lost / expected, 1) if expected else 0.0,
                "tx": slot["tx"],
                "rx": slot["rx"],
                "delay_ms": slot["delay_ms"],
                "ip": slot["ip"],
                "gateway": "192.168.4.1",
                "online": slot["connected"] and not silent,
                "uptime": int(now - slot["connected_at"]),
                "status": slot["status"],
                "klaim_ke": slot["klaim_ke"],
                "tolak_alasan": slot["tolak_alasan"],
                # Target dan pasangan sendiri, bukan keadaan sejagat: lihat
                # nominee() dan on_beacon().
                "calon": self.nominee(slot),
                "durasi": slot["durasi"],
                "kemajuan": self.kemajuan(slot),
                "jarak_awal": slot["jarak_awal"],
                "beacon": {
                    "online": beacon_online,
                    "seq": slot["beacon_seq"],
                    "tx": slot["beacon_tx"],
                    "ip": slot["beacon_ip"],
                },
            })

        # Yang sudah menemukan targetnya naik ke atas, terurut menurut waktu
        # temu (tercepat dulu) -- inilah satu-satunya perbandingan yang sah
        # antar kelompok, karena tidak bergantung pada di mana target
        # masing-masing disembunyikan. Sisanya, yang masih berburu, terurut
        # menurut nomor kelompok saja: RSSI/jarak SATU kelompok terhadap
        # targetnya sendiri tidak bisa dibandingkan dengan RSSI kelompok lain
        # terhadap target yang berbeda, jadi mengurutkannya berdasarkan itu
        # hanya akan berpura-pura ada makna yang tidak ada.
        def sort_key(row):
            slot = self.groups[row["grup"]]
            found = slot["status"] == "menang"
            return (0 if found else 1, slot["finish_seq"] or 0, row["grup"])

        rows.sort(key=sort_key)
        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank

        # Penghargaan memakai baris yang baru saja diurutkan, bukan menghitung
        # ulang: heat/jarak/rugi_persen semuanya sudah dibayar di atas.
        if self.penghargaan_beku is not None:
            hadiah = self.penghargaan_beku
        else:
            hadiah = self.penghargaan(rows)
            if self.bekukan:
                hadiah["beku"] = True
                self.penghargaan_beku = hadiah
                self.bekukan = False

        return {
            "tipe": "bingkai",
            "rev": self.rev,
            "jam": timestamp(),
            "berjalan": self.elapsed(),
            # Ringkasan seluruh kelima beacon untuk HUD -- keadaan tiap
            # pasangan sendiri-sendiri ada di baris grup masing-masing di
            # atas (row.beacon), bukan di sini.
            "beacon_ringkas": {
                "online": beacons_online,
                "total": len(self.groups),
            },
            "model": {
                "rssi_1m": self.rssi_at_1m,
                "diukur": self.kalibrasi_pada,
                "n": self.path_loss_n,
                "tak_pasti_db": RSSI_UNCERTAINTY_DB,
                "arena_m": self.arena_m,
            },
            "radio": {
                "freq": "920.0 MHz",
                "sf": 7,
                "bw": "250 kHz",
                # Tidak ada "sync" tunggal lagi di sini -- tiap pasangan
                # memakai kata sandi radionya sendiri (lihat
                # scripts/gen_modul4.py's SYNC_WORDS), sesuatu yang hanya
                # hidup di firmware, bukan sesuatu yang dilaporkan server
                # tahu.
                "daya": f"{BEACON_TX_DBM} dBm",
                "periode": "500 ms / 5 slot",
            },
            "grup": rows,
            "peristiwa": self.events[-12:],
            "ronde": self.ronde,
            "antrian": self.antrian(),
            "penghargaan": hadiah,
            # Daftar namanya sendiri TIDAK ikut di sini. Lima kelompok
            # berikut namanya sekitar setengah kilobait; pada 10 Hz itu
            # 5 KB/detik data yang berubah beberapa kali sejam. Klien
            # mengambil ulang /roster.json saat nomor revisinya berubah.
            "roster_rev": JADWAL["rev"],
            # Sesi yang sedang berjalan. Klien yang masuk pada sesi lain
            # melihat nomor ini berubah dan mengeluarkan dirinya sendiri --
            # tidak perlu ada pesan dorong khusus untuk pergantian sesi.
            "sesi": JADWAL["aktif"],
            "sesi_sisa": sesi_sisa(),
            # Panjang sesi ini dalam detik, untuk bilah "N dari M menit".
            "sesi_total": int(sesi_batas(JADWAL["aktif"])) if JADWAL["aktif"] else None,
            # Permainan. Kunci kelompok berupa string di keempatnya, sama
            # dengan /roster.json. tim memakai huruf per anggota, searah
            # dengan urutan nama di /roster.json, supaya bingkai 10 Hz tidak
            # membawa nama siapa pun: "p" pemandu, "i" pengintai, "o"
            # operator radio, "-" belum memilih; hadir "1" berarti ada
            # ponselnya yang sedang tersambung.
            "tim": tim_bingkai(),
            "panggil": {
                str(g): int(now - at) for g, at in sorted(self.panggil.items())
            },
            "sapuan": {str(g): s for g, s in sorted(self.sapuan.items())},
            "pengumuman": self.pengumuman,
        }

    # -- penghargaan --------------------------------------------------------

    def penghargaan(self, rows: list[dict]) -> dict:
        """Empat penghargaan, dihitung dari baris yang sudah terurut."""
        layak = [r for r in rows if r["diterima"] >= MIN_PAKET_PENGHARGAAN]

        # Podium: peringkat menurut waktu temu, tercepat dulu. Ini
        # menggantikan podium versi lama yang mengurutkan menurut kedekatan
        # RSSI -- sah ketika kelima kelompok berburu SATU beacon yang sama,
        # tidak lagi sah ketika masing-masing berburu targetnya sendiri di
        # tempat yang berbeda-beda; kelompok yang targetnya kebetulan
        # disembunyikan lebih dekat akan selalu menang perbandingan itu,
        # apa pun keterampilan berburunya. Waktu temu tidak punya cacat itu.
        selesai = [r for r in rows if self.groups[r["grup"]]["status"] == "menang"]
        selesai.sort(key=lambda r: self.groups[r["grup"]]["finish_seq"])

        podium = [
            {
                "grup": r["grup"], "posisi": i,
                "durasi": self.groups[r["grup"]]["durasi"],
                "foto_url": (
                    f"/foto/{self.groups[r['grup']]['klaim_foto']}"
                    if self.groups[r["grup"]]["klaim_foto"] else None
                ),
            }
            for i, r in enumerate(selesai[:3], start=1)
        ]

        def terbaik(pool, key, reverse=False):
            if not pool:
                return None
            return min(pool, key=key) if not reverse else max(pool, key=key)

        pendekat = terbaik(
            [r for r in layak
             if self.groups[r["grup"]]["laju_terbaik"] >= LAJU_MIN_DB_S],
            lambda r: self.groups[r["grup"]]["laju_terbaik"], reverse=True)

        # Delay median seluruh hop (papan -> hotspot -> server), bukan
        # kedekatan fisik: dua kelompok yang sama-sama jauh dari targetnya
        # bisa saja punya tautan yang jauh berbeda mutunya, dan sebaliknya.
        cepat = terbaik(
            [r for r in layak if self.groups[r["grup"]]["delay_terbaik"] is not None],
            lambda r: self.groups[r["grup"]]["delay_terbaik"])

        # Seri dipecahkan oleh jumlah paket: pada persentase yang sama,
        # kelompok yang menerima lebih banyak telah membuktikan lebih.
        andal = terbaik(layak, lambda r: (r["rugi_persen"], -r["diterima"]))

        return {
            "beku": False,
            "podium": podium,
            "pendekat_tercepat": None if pendekat is None else {
                "grup": pendekat["grup"],
                "nilai": round(self.groups[pendekat["grup"]]["laju_terbaik"], 2),
                "satuan": "dB/detik",
            },
            "tautan_tercepat": None if cepat is None else {
                "grup": cepat["grup"],
                "nilai": self.groups[cepat["grup"]]["delay_terbaik"],
                "satuan": "ms",
            },
            "tautan_terandal": None if andal is None else {
                "grup": andal["grup"], "nilai": andal["rugi_persen"],
                "satuan": "%", "diterima": andal["diterima"],
            },
        }


# --------------------------------------------------------------------------
# Keadaan tingkat modul
#
# JADWAL sengaja TIDAK disimpan di dalam Hunt. arena_m dan kawan-kawannya
# selamat dari reset() hanya karena reset() kebetulan tidak menyentuhnya --
# yang menjaganya cuma sebuah komentar. Rencana sehari pantas mendapat
# jaminan yang lebih kuat daripada itu, dan ia memang bukan keadaan satu
# ronde: ia hidup melintasi keempat sesi. Di luar Hunt, "RESET tidak boleh
# menghapus nama" menjadi benar secara struktur, bukan secara kebiasaan.
# --------------------------------------------------------------------------

HUNT = Hunt()

# Koneksi -> keterangan peran. Sebuah dict, bukan set: iterasi kuncinya
# tetap bekerja seperti semula, dan tidak ada peluang entri basi yang hidup
# lebih lama daripada koneksinya.
VIEWERS: dict[ServerConnection, dict] = {}

TOKEN: str = ""

# NIM -> peran lunak yang dipilih orangnya. Milik satu sesi, bukan satu
# ronde: "Ronde baru" di tengah sesi tidak membuat orang yang sama harus
# memilih ulang, tetapi pergantian sesi membuangnya bersama orangnya (lihat
# ronde_bersih). Kuncinya NIM supaya peran selamat dari ponsel yang
# menyambung ulang; NIM itu sendiri tidak pernah keluar dari proses ini.
PERAN: dict[str, str] = {}


def nama_depan(nama: str) -> str:
    """Nama depan saja, untuk sinyal tim dan sapuan."""
    bagian = (nama or "").split()
    return bagian[0] if bagian else ""


def tim_bingkai() -> dict:
    """Peran dan kehadiran tiap anggota, per kelompok sesi berjalan.

    Urutannya mengikuti daftar anggota di /roster.json, jadi klien cukup
    menyejajarkan huruf ke-i dengan nama ke-i. Tanpa nama, tanpa NIM.
    """
    hadir_nim: set[str] = set()
    for meta in VIEWERS.values():
        if meta.get("nim") and meta.get("grup") is not None:
            hadir_nim.add(meta["nim"])

    keluar = {}
    for gid, isi in regu_aktif().items():
        huruf = []
        hadir = []
        for anggota in isi.get("anggota", []):
            nim = anggota.get("nim", "")
            huruf.append(PERAN_TIM.get(PERAN.get(nim, ""), "-"))
            hadir.append("1" if nim in hadir_nim else "0")
        keluar[str(gid)] = {"peran": "".join(huruf), "hadir": "".join(hadir)}
    return keluar

# Rencana satu hari. "sesi" selalu berisi empat entri, urut menurut id.
# "aktif" adalah id sesi yang sedang berjalan, atau None di antara sesi.
JADWAL: dict = {
    "versi": 2,
    "rev": 0,
    "hari": None,
    "sesi": [],
    "aktif": None,
    "mulai_pada": None,
    # Sesi yang sudah selesai hari ini. Tanpa catatan ini, sebuah sesi yang
    # diakhiri lebih awal akan dinyalakan lagi oleh penjadwal pada denyut
    # berikutnya, karena jam dindingnya memang masih di dalam jendelanya.
    "selesai": [],
}


# -- token asisten ---------------------------------------------------------

def buat_token() -> str:
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(TOKEN_LEN))


def token_ok(candidate) -> bool:
    """Perbandingan waktu-tetap terhadap token asisten."""
    if not TOKEN or not isinstance(candidate, str) or not candidate:
        return False
    return secrets.compare_digest(candidate.strip().upper(), TOKEN)


# -- rencana hari dan sesi -------------------------------------------------

def hari_ini() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _menit(jam: str) -> int:
    """'09:30' -> 570. Dipakai untuk membandingkan jam dalam satu hari."""
    m = JAM_RE.match(jam)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else 0


def sesi_kosong(idx: int, jam: str) -> dict:
    # sumber: None sampai terisi sekali, lalu "web" (impor Stage 18) atau
    # "pc" (tempelan manual asisten) -- lihat jadwal_impor()'s docstring
    # untuk aturan siapa boleh menimpa siapa.
    return {"id": idx, "mulai": jam, "regu": {}, "sumber": None}


def jadwal_awal() -> None:
    """Empat sesi kosong pada jam bawaan."""
    JADWAL["sesi"] = [sesi_kosong(i + 1, jam)
                      for i, jam in enumerate(JADWAL_MULAI)]
    JADWAL["hari"] = hari_ini()
    JADWAL["aktif"] = None
    JADWAL["mulai_pada"] = None
    JADWAL["selesai"] = []
    JADWAL["berburu"] = None


def sesi_oleh_id(sid) -> dict | None:
    for entry in JADWAL["sesi"]:
        if entry["id"] == sid:
            return entry
    return None


def sesi_berjalan() -> dict | None:
    """Sesi yang sedang berjalan, atau None."""
    return sesi_oleh_id(JADWAL["aktif"]) if JADWAL["aktif"] else None


def sesi_batas(sid: int) -> float:
    """Berapa detik satu sesi boleh berjalan sejak dimulai.

    Dua aturan sekaligus: paling lama SESI_DURASI_SEC, dan selesai
    selambatnya SESI_JEDA_SEC sebelum sesi berikutnya dijadwalkan mulai.
    Pada jarak tiga jam keduanya jatuh bersamaan; min() yang membuat
    keduanya tetap benar bila jam mulainya kelak dirapatkan.
    """
    batas = float(SESI_DURASI_SEC)
    ini = sesi_oleh_id(sid)
    if ini is None:
        return batas
    berikut = sesi_oleh_id(sid + 1)
    if berikut is not None:
        jarak = (_menit(berikut["mulai"]) - _menit(ini["mulai"])) * 60
        if jarak > 0:
            batas = min(batas, float(jarak - SESI_JEDA_SEC))
    return max(60.0, batas)


def sesi_sisa() -> int | None:
    """Detik tersisa pada sesi berjalan, atau None."""
    mulai = JADWAL.get("mulai_pada")
    if not JADWAL["aktif"] or mulai is None:
        return None
    return max(0, int(sesi_batas(JADWAL["aktif"]) - (time.time() - mulai)))


def sesi_jatuh_tempo() -> bool:
    sisa = sesi_sisa()
    return sisa is not None and sisa <= 0


def sesi_terjadwal_sekarang() -> int | None:
    """Sesi mana yang seharusnya berjalan menurut jam dinding.

    Sebuah sesi dianggap terjadwal sejak jam mulainya sampai batasnya
    habis. Di luar itu tidak ada sesi -- jeda antar sesi memang kosong.
    """
    now = datetime.now()
    menit_kini = now.hour * 60 + now.minute
    for entry in JADWAL["sesi"]:
        awal = _menit(entry["mulai"])
        akhir = awal + sesi_batas(entry["id"]) / 60.0
        if awal <= menit_kini < akhir:
            return entry["id"]
    return None


def regu_aktif() -> dict:
    """Kelompok pada sesi yang sedang berjalan. Kosong bila tidak ada."""
    entry = sesi_berjalan()
    return entry["regu"] if entry else {}


def jadwal_publik() -> dict:
    """Bentuk yang boleh dilihat siapa pun.

    Hanya nama, tidak pernah NIM. Bukan karena NIM-nya dibuang di sini,
    melainkan karena tiap anggota disalin bidang demi bidang dan "nim"
    tidak termasuk yang disalin. Menambah bidang baru kelak tidak akan
    diam-diam ikut membocorkannya.
    """
    regu = {}
    for gid, entry in regu_aktif().items():
        regu[gid] = {
            "nama": entry.get("nama", ""),
            "aktif": entry.get("aktif", True),
            "anggota": [a.get("nama", "") for a in entry.get("anggota", [])],
        }
    return {
        "rev": JADWAL["rev"],
        "sesi": JADWAL["aktif"],
        "sisa": sesi_sisa(),
        "regu": regu,
    }


def jadwal_asisten() -> dict:
    """Rencana lengkap, NIM dan semuanya. Hanya untuk koneksi berwenang."""
    return {
        "rev": JADWAL["rev"],
        "hari": JADWAL["hari"],
        "aktif": JADWAL["aktif"],
        "sisa": sesi_sisa(),
        "selesai": JADWAL["selesai"],
        "sesi": JADWAL["sesi"],
    }


def _bersih(text, limit: int = MAX_NAMA_LEN) -> str:
    """Satu baris teks yang aman disimpan: tanpa aksara kendali, terpotong.

    Ini BUKAN pertahanan terhadap XSS. Nama masuk ke DOM pada papan skor dan
    proyektor; yang melindunginya adalah klien yang memakai textContent dan
    tidak pernah innerHTML.
    """
    if not isinstance(text, str):
        return ""
    return "".join(c for c in text if c.isprintable()).strip()[:limit]


def jadwal_simpan() -> None:
    """Tulis rencana ke cakram secara atomik."""
    payload = {
        "versi": 2,
        "rev": JADWAL["rev"],
        "hari": JADWAL["hari"],
        "sesi": JADWAL["sesi"],
        "aktif": JADWAL["aktif"],
        "mulai_pada": JADWAL["mulai_pada"],
        "selesai": JADWAL["selesai"],
        "berburu": JADWAL["berburu"],
    }
    tmp = JADWAL_PATH.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                       encoding="utf-8")
        os.replace(tmp, JADWAL_PATH)
    except OSError as err:
        print(f"[{timestamp()}] jadwal gagal disimpan: {err}")


def jadwal_muat() -> None:
    """Baca rencana dari cakram saat server dinyalakan."""
    # roster.json adalah berkas versi lama: satu daftar datar tanpa sesi dan
    # tanpa NIM. Isinya sudah pasti basi, jadi ia dibuang alih-alih diubah.
    if ROSTER_PATH.is_file():
        ROSTER_PATH.unlink(missing_ok=True)
        print(f"[{timestamp()}] roster.json versi lama dibuang")

    jadwal_awal()
    if not JADWAL_PATH.is_file():
        return
    try:
        data = json.loads(JADWAL_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"[{timestamp()}] jadwal tidak terbaca, diabaikan: {err}")
        return
    if not isinstance(data, dict) or data.get("versi") != 2:
        print(f"[{timestamp()}] jadwal versi asing, diabaikan")
        return

    # Rencana kemarin bukan rencana hari ini. Nama praktikan tidak boleh
    # menginap semalam di PC tanpa ada yang memintanya.
    if data.get("hari") != hari_ini():
        print(f"[{timestamp()}] jadwal tersimpan dari hari lain, dibuang")
        JADWAL_PATH.unlink(missing_ok=True)
        return

    tersimpan = data.get("sesi")
    if isinstance(tersimpan, list) and tersimpan:
        JADWAL["sesi"] = []
        for i, entry in enumerate(tersimpan[:len(JADWAL_MULAI)]):
            if not isinstance(entry, dict):
                continue
            jam = str(entry.get("mulai", ""))
            sumber = entry.get("sumber")
            JADWAL["sesi"].append({
                "id": i + 1,
                "mulai": jam if JAM_RE.match(jam) else JADWAL_MULAI[i],
                "regu": entry.get("regu") if isinstance(entry.get("regu"), dict) else {},
                "sumber": sumber if sumber in ("web", "pc") else None,
            })
        while len(JADWAL["sesi"]) < len(JADWAL_MULAI):
            n = len(JADWAL["sesi"])
            JADWAL["sesi"].append(sesi_kosong(n + 1, JADWAL_MULAI[n]))

    JADWAL["rev"] = int(data.get("rev", 0))
    JADWAL["aktif"] = data.get("aktif")
    JADWAL["mulai_pada"] = data.get("mulai_pada")
    tercatat = data.get("selesai")
    JADWAL["selesai"] = tercatat if isinstance(tercatat, list) else []
    berburu = data.get("berburu")
    JADWAL["berburu"] = berburu if isinstance(berburu, str) else None

    # Sesi yang batasnya sudah lewat selama server mati tidak dihidupkan lagi.
    if JADWAL["aktif"] and sesi_jatuh_tempo():
        if JADWAL["aktif"] not in JADWAL["selesai"]:
            JADWAL["selesai"].append(JADWAL["aktif"])
        JADWAL["aktif"] = None
        JADWAL["mulai_pada"] = None

    total = sum(len(e["regu"]) for e in JADWAL["sesi"])
    print(f"[{timestamp()}] jadwal dimuat: {total} kelompok di "
          f"{len(JADWAL['sesi'])} sesi, aktif={JADWAL['aktif']}")


def _anggota_bersih(raw) -> tuple[list[dict], str]:
    """Bersihkan satu daftar anggota. Mengembalikan (daftar, galat)."""
    if not isinstance(raw, list):
        return [], "daftar anggota tidak sah"
    keluar = []
    for item in raw[:MAX_ANGGOTA]:
        if not isinstance(item, dict):
            return [], "isian anggota tidak sah"
        nim = _bersih(item.get("nim", ""), 20).upper()
        nama = _bersih(item.get("nama", ""))
        if not nim and not nama:
            continue
        if not NIM_RE.match(nim):
            return [], f"NIM tidak sah: {nim or 'kosong'}"
        keluar.append({"nim": nim, "nama": nama})
    return keluar, ""


def _bangun_regu(entry: dict, patch: dict) -> tuple[dict | None, str]:
    """Validasi satu tempelan dan bangun dict regu-nya, termasuk pengecekan
    NIM ganda lintas sesi. Diekstrak dari jadwal_set() agar jadwal_impor()
    (Stage 18) tunduk pada aturan validasi yang persis sama, alih-alih
    menduplikasi logikanya dengan risiko keduanya diam-diam berbeda."""
    if not isinstance(patch, dict):
        return None, "isian sesi tidak sah"

    regu: dict = {}
    for key, value in patch.items():
        try:
            gid = int(key)
        except (TypeError, ValueError):
            return None, f"nomor kelompok tidak sah: {key}"
        if not 1 <= gid <= MAX_GRUP_ID:
            return None, f"nomor kelompok di luar jangkauan: {gid}"
        if not isinstance(value, dict):
            return None, f"isian kelompok {gid} tidak sah"

        anggota, galat = _anggota_bersih(value.get("anggota") or [])
        if galat:
            return None, f"kelompok {gid}: {galat}"

        regu[str(gid)] = {
            "nama": _bersih(value.get("nama", "")),
            # Papan mana yang menjadi beacon berubah tiap sesi, jadi kelompok
            # yang sedang bermain ditentukan asisten, bukan dipaku di kode.
            "aktif": bool(value.get("aktif", True)),
            "anggota": anggota,
        }

    # Satu orang tidak bisa berada di dua kelompok pada hari yang sama, dan
    # kalau itu terjadi pencarian NIM akan memilih salah satu tanpa bersuara.
    # Lebih baik menolak tempelannya daripada mengarahkan orang ke kelompok
    # yang salah tanpa ada yang tahu.
    terpakai: dict[str, str] = {}
    for lain in JADWAL["sesi"]:
        sumber_regu = regu if lain["id"] == entry["id"] else lain["regu"]
        for gid, isi in sumber_regu.items():
            for anggota in isi.get("anggota", []):
                kunci = anggota["nim"]
                tempat = f"sesi {lain['id']} kelompok {gid}"
                if kunci in terpakai:
                    return None, (f"NIM {kunci} muncul dua kali: "
                                   f"{terpakai[kunci]} dan {tempat}")
                terpakai[kunci] = tempat

    return regu, ""


def jadwal_set(sid, patch: dict) -> tuple[bool, str]:
    """Tulis ulang kelompok satu sesi.

    Berbeda dengan penyuntingan sebaris yang lama, satu sesi disimpan
    sekaligus: asisten menempelkan seluruh daftarnya, jadi tambal sebagian
    per kelompok tidak lagi ada gunanya dan hanya akan menyisakan kelompok
    hantu dari tempelan sebelumnya.
    """
    entry = sesi_oleh_id(sid if isinstance(sid, int) else -1)
    if entry is None:
        return False, f"sesi tidak dikenal: {sid}"

    regu, galat = _bangun_regu(entry, patch)
    if galat:
        return False, galat

    entry["regu"] = regu
    # Tempelan manual selalu menang atas impor web berikutnya -- lihat
    # jadwal_impor()'s docstring.
    entry["sumber"] = "pc"
    JADWAL["rev"] += 1
    JADWAL["hari"] = hari_ini()
    jadwal_simpan()
    HUNT.note("jadwal", None, sesi=entry["id"], regu=len(regu))
    return True, ""


def jadwal_impor(path: pathlib.Path) -> int | None:
    """Tarik jadwal Modul 4 hari ini dari berkas yang ditulis agent PC
    (Stage 18), diisi dari respons denyut jantungnya sendiri
    (jadwalModul4Hari() pada apps/web).

    Sesi yang membawa `berburu` (waktu asisten menekan Mulai Perburuan di
    web, 2026-10-09) harus berjalan sekarang, apa pun jam jendelanya: sesi
    susulan, TOT, atau sesi yang mulai terlambat tidak lagi menunggu jendela
    jam bawaan. Satu tekanan menyalakan satu ronde; tekanan yang sama yang
    datang lagi tiap denyut diabaikan, dan tercatat di jadwal.json supaya
    server yang dinyalakan ulang di tengah perburuan tidak menghapus
    rondenya. Mengembalikan nomor sesi yang harus dimulai, atau None.

    Sebuah sesi yang sumber-nya sudah "pc" -- pernah ditempel manual di
    PC sejak impor terakhir -- DILEWATI, bukan ditimpa: kotak tempel
    tetap menjadi cadangan luring yang berlaku penuh begitu asisten
    menyentuhnya, persis seperti sebelum Stage 18 ada. Sesi yang gagal
    validasi (mis. NIM ganda) dilewati dan dicatat ke konsol tanpa
    menggagalkan sesi lain dalam berkas yang sama -- satu baris rusak tidak
    boleh membuat keempat sesi gagal diimpor.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"[{timestamp()}] jadwal impor gagal dibaca: {err}")
        return None
    if not isinstance(data, dict) or not isinstance(data.get("sesi"), list):
        print(f"[{timestamp()}] jadwal impor: bentuk tidak dikenal, diabaikan")
        return None

    diterapkan = 0
    mulai_sekarang: int | None = None
    for slot in data["sesi"]:
        if not isinstance(slot, dict):
            continue
        sid = slot.get("id")
        entry = sesi_oleh_id(sid if isinstance(sid, int) else -1)
        if entry is None:
            continue
        berburu = slot.get("berburu")
        if isinstance(berburu, str) and berburu and berburu != JADWAL.get("berburu"):
            JADWAL["berburu"] = berburu
            mulai_sekarang = entry["id"]
        if entry.get("sumber") == "pc":
            continue

        patch = slot.get("regu") if isinstance(slot.get("regu"), dict) else {}
        regu, galat = _bangun_regu(entry, patch)
        if galat:
            print(f"[{timestamp()}] jadwal impor sesi {sid} ditolak: {galat}")
            continue

        entry["regu"] = regu
        entry["sumber"] = "web"
        diterapkan += 1

    if diterapkan:
        JADWAL["rev"] += 1
        JADWAL["hari"] = hari_ini()
        HUNT.note("jadwal-impor", None, sesi=diterapkan)
        print(f"[{timestamp()}] jadwal diimpor: {diterapkan} sesi dari {path}")
    if diterapkan or mulai_sekarang is not None:
        jadwal_simpan()
    return mulai_sekarang


def jadwal_impor_jika_berubah(path: pathlib.Path) -> int | None:
    """Impor hanya ketika mtime berkas berubah sejak pemeriksaan terakhir --
    dipanggil tiap denyut penjaga_sesi(), sehingga tarikan baru dari web
    sampai dalam SESI_SAPU_SEC detik tanpa membaca ulang berkas yang sama
    berkali-kali per detik untuk apa-apa."""
    global JADWAL_IMPOR_MTIME
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    if mtime == JADWAL_IMPOR_MTIME:
        return None
    JADWAL_IMPOR_MTIME = mtime
    return jadwal_impor(path)


def jadwal_jam(jam_baru) -> tuple[bool, str]:
    """Ubah keempat jam mulai sekaligus."""
    if not isinstance(jam_baru, list) or len(jam_baru) != len(JADWAL["sesi"]):
        return False, "daftar jam tidak sah"
    for jam in jam_baru:
        if not isinstance(jam, str) or not JAM_RE.match(jam):
            return False, f"jam tidak sah: {jam}"
    for entry, jam in zip(JADWAL["sesi"], jam_baru):
        entry["mulai"] = jam
    JADWAL["rev"] += 1
    jadwal_simpan()
    return True, ""


def cari_nim(nim: str) -> dict | None:
    """Cari seorang praktikan di sesi yang sedang berjalan.

    Hanya sesi berjalan yang dicari. Praktikan sesi pagi yang membuka
    kembali halamannya pada sesi siang bukan peserta sesi itu, dan harus
    ditolak, bukan dimasukkan ke kelompok bernomor sama.
    """
    kunci = nim.strip().upper()
    for gid, isi in regu_aktif().items():
        if isi.get("aktif") is False:
            continue
        for anggota in isi.get("anggota", []):
            if anggota["nim"] == kunci:
                return {"grup": int(gid), "nama": anggota.get("nama", "")}
    return None


async def ronde_bersih() -> None:
    """Kembalikan perburuan ke nol dan buang seluruh foto.

    Rencana hari TIDAK ikut terhapus: itulah beda pergantian sesi dengan
    penghapusan rencana. Asisten mengetik daftarnya sekali di pagi hari.
    Peran lunak ikut dibuang, karena orangnya sudah berganti.
    """
    PERAN.clear()
    HUNT.reset()
    await sapu_unggahan(semua=True)


async def sesi_mulai(sid: int, alasan: str = "terjadwal") -> None:
    """Jalankan satu sesi: bersihkan ronde sebelumnya, lalu buka yang baru.

    Menjalankan ulang sesi yang tadi sudah ditutup adalah permintaan yang
    sah -- praktikum diulang, atau sesi sebelumnya ditutup karena salah
    pencet -- jadi tanda selesainya dicabut, bukan dipertahankan.
    """
    await ronde_bersih()
    JADWAL["aktif"] = sid
    JADWAL["mulai_pada"] = time.time()
    JADWAL["selesai"] = [x for x in JADWAL["selesai"] if x != sid]
    jadwal_simpan()
    HUNT.note("sesi-mulai", None, sesi=sid)
    print(f"[{timestamp()}] sesi {sid} dimulai ({alasan})")


async def sesi_akhiri(alasan: str = "selesai") -> None:
    """Tutup sesi berjalan dan bersihkan segala jejak rondenya."""
    sid = JADWAL["aktif"]
    if sid is not None and sid not in JADWAL["selesai"]:
        JADWAL["selesai"].append(sid)
    JADWAL["aktif"] = None
    JADWAL["mulai_pada"] = None
    jadwal_simpan()
    await ronde_bersih()
    HUNT.note("sesi-akhir", None, sesi=sid)
    print(f"[{timestamp()}] sesi {sid} diakhiri ({alasan}), ronde dibersihkan")


async def jadwal_hapus() -> None:
    """Buang rencana sehari penuh beserta seluruh foto."""
    jadwal_awal()
    JADWAL["rev"] += 1
    JADWAL_PATH.unlink(missing_ok=True)
    await ronde_bersih()
    HUNT.note("jadwal-hapus")
    print(f"[{timestamp()}] jadwal dihapus, foto dibuang")

# -- foto ------------------------------------------------------------------

def ronde_dir() -> pathlib.Path:
    return UPLOAD_DIR / HUNT.ronde


async def sapu_unggahan(semua: bool = False) -> None:
    """Hapus foto: seluruh pohonnya, atau hanya ronde yang sedang berjalan.

    rmtree pada dua ratus berkas memakan puluhan milidetik di eMMC, dan
    anggaran satu denyut siaran hanya 100 ms -- jadi dijalankan di utas lain
    supaya papan skor tidak tersendat.
    """
    target = UPLOAD_DIR if semua else ronde_dir()
    try:
        await asyncio.to_thread(shutil.rmtree, target, ignore_errors=True)
        await asyncio.to_thread(UPLOAD_DIR.mkdir, parents=True, exist_ok=True)
    except OSError as err:
        print(f"[{timestamp()}] gagal membuang foto: {err}")


# --------------------------------------------------------------------------
# HTTP: halaman papan skor dilayani dari port yang sama dengan WebSocket-nya,
# sehingga hanya ada satu alamat yang perlu diketik di peramban.
# --------------------------------------------------------------------------

WS_PATHS = ("/hunter", "/beacon", "/live")


def process_request(connection: ServerConnection, request) -> Response | None:
    path = request.path.split("?")[0]
    if path in WS_PATHS:
        return None  # Lanjutkan sebagai koneksi WebSocket

    if path in ("/", "/index.html"):
        try:
            body = INDEX_PATH.read_bytes()
        except OSError:
            return connection.respond(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Papan skor belum dibangun. Jalankan: python modul4/build.py\n",
            )
        headers = Headers({
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": str(len(body)),
            "Cache-Control": "no-store",
        })
        return Response(HTTPStatus.OK, "OK", headers, body)

    if path == "/roster.json":
        # Sengaja tanpa token: papan proyektor menampilkan nama kelompok
        # tanpa pernah masuk sebagai siapa pun. Konsekuensinya nama praktikan
        # terbaca oleh siapa saja yang tersambung ke hotspot IRIS_IOT. Itu
        # keputusan yang diambil sadar untuk jaringan tertutup satu sesi, dan
        # itulah sebabnya daftarnya berganti tiap sesi.
        #
        # NIM tidak pernah ikut. jadwal_publik() menyalin tiap anggota bidang
        # demi bidang dan hanya mengambil namanya, jadi kebocoran di sini
        # membutuhkan perubahan sengaja, bukan kelalaian.
        body = json.dumps(jadwal_publik(), ensure_ascii=False).encode("utf-8")
        headers = Headers({
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(body)),
            "Cache-Control": "no-store",
        })
        return Response(HTTPStatus.OK, "OK", headers, body)

    if path in ("/jejak.json", "/jejak.csv"):
        return sajikan_jejak(connection, request.path, csv=path.endswith(".csv"))

    if path == "/telemetri.json":
        # Stage 20: baris mentah per kelompok (tx/rx/delay_ms/rssi/snr), untuk
        # agent PC sendiri meneruskannya ke situs web lewat denyut
        # jantungnya -- bukan untuk proyektor maupun ponsel di hotspot. Loopback
        # saja: menolak siapa pun selain 127.0.0.1 memastikan itu tetap begitu
        # meski port ini kebetulan tersambung dari luar PC (mis. lewat dongle
        # uplink Stage 19, yang membuat PC ini terjangkau dari Wi-Fi kampus).
        ip = peer_ip(connection)
        if ip not in ("127.0.0.1", "::1"):
            return connection.respond(
                HTTPStatus.FORBIDDEN, "Hanya diizinkan dari loopback (127.0.0.1).\n",
            )

        ringkas = [
            {
                "grup": baris["grup"],
                "seq": baris["seq"],
                "tx": baris["tx"],
                "rx": baris["rx"],
                "delay_ms": baris["delay_ms"],
                "rssi": baris["rssi"],
                "snr": baris["snr"],
                # Phase 9: kartu nilai Live dan tangkapan jurnal (tabel jarak).
                "halus": baris["halus"],
                "jarak_m": baris["jarak_m"],
                "trend": baris["trend"],
                "hilang": baris["hilang"],
            }
            for baris in HUNT.snapshot()["grup"]
        ]
        body = json.dumps(ringkas, ensure_ascii=False).encode("utf-8")
        headers = Headers({
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(body)),
            "Cache-Control": "no-store",
        })
        return Response(HTTPStatus.OK, "OK", headers, body)

    if path == "/ringkas.json":
        # Phase 9: langkah Perburuan di situs web. Agent meneruskannya lewat
        # denyut, dan situs menunjukkan tiap praktikan keadaan kelompoknya
        # sendiri. Loopback saja, sama seperti /telemetri.json, karena di
        # sini NIM ikut keluar.
        ip = peer_ip(connection)
        if ip not in ("127.0.0.1", "::1"):
            return connection.respond(
                HTTPStatus.FORBIDDEN, "Hanya diizinkan dari loopback (127.0.0.1).\n",
            )
        body = json.dumps(ringkasan_perburuan(), ensure_ascii=False).encode("utf-8")
        headers = Headers({
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(body)),
            "Cache-Control": "no-store",
        })
        return Response(HTTPStatus.OK, "OK", headers, body)

    if path.startswith("/foto/"):
        return sajikan_foto(connection, path)

    return connection.respond(HTTPStatus.NOT_FOUND, "Tidak ditemukan\n")


def ringkasan_perburuan() -> dict:
    """Keadaan perburuan per kelompok untuk situs web (lewat agent).

    "sesi" bukan None berarti asisten sudah memulai sesi di ruang kendali,
    jadi langkah Perburuan terbuka. "mulai" berarti beacon sudah memancar,
    "selesai" berarti ronde sudah ditutup. Anggota membawa NIM supaya situs
    bisa mencocokkan praktikan yang masuk; karena itu rute ini loopback saja.
    """
    bingkai = HUNT.snapshot()
    hadir_nim: set[str] = set()
    for meta in VIEWERS.values():
        if meta.get("nim") and meta.get("grup") is not None:
            hadir_nim.add(meta["nim"])
    baris = {r["grup"]: r for r in bingkai["grup"]}
    grup = []
    for gid, isi in sorted(regu_aktif().items(), key=lambda kv: int(kv[0])):
        r = baris.get(int(gid), {})
        grup.append({
            "grup": int(gid),
            "status": r.get("status"),
            "heat": r.get("heat"),
            "rank": r.get("rank"),
            "durasi": r.get("durasi"),
            "klaim_ke": r.get("klaim_ke"),
            "anggota": [
                {
                    "nim": a.get("nim", ""),
                    "peran": PERAN.get(a.get("nim", "")) or None,
                    "hadir": a.get("nim", "") in hadir_nim,
                }
                for a in isi.get("anggota", [])
            ],
        })
    return {
        "versi": 1,
        "jam": bingkai["jam"],
        "sesi": JADWAL["aktif"],
        "mulai": HUNT.started_at is not None,
        "selesai": HUNT.round_ended_at is not None,
        "berjalan": bingkai["berjalan"],
        "grup": grup,
        "penghargaan": bingkai["penghargaan"],
        "peristiwa": [
            {k: v for k, v in e.items() if k in ("kind", "grup", "at", "t", "durasi", "heat", "alasan")}
            for e in HUNT.jejak_peristiwa[-60:]
        ],
    }


def _angka_kueri(kueri: dict, kunci: str, bawah: int, atas: int) -> int | None:
    """Satu bilangan bulat dari query string, atau None bila tidak ada/cacat."""
    nilai = kueri.get(kunci)
    if not nilai:
        return None
    try:
        return int(clamp(int(nilai[0]), bawah, atas))
    except (TypeError, ValueError):
        return None


def sajikan_jejak(connection: ServerConnection, raw_path: str,
                  csv: bool) -> Response:
    """Jejak ronde berjalan, tanpa token.

    Publik dengan sengaja, sama seperti /roster.json: proyektor dan setiap
    ponsel memutar tayangan ulang dari sini. Isinya hanya nomor kelompok,
    waktu, jarak dan kemajuan, jadi tidak ada yang perlu dilindungi.

        ?grup=3       satu kelompok saja
        ?detik=90     hanya 90 detik terakhir (jejak di layar Buru)
        ?sejak=412    hanya yang lebih baru dari detik 412 (pengambilan susulan)
        ?langkah=5    satu cuplikan tiap 5 detik (tayangan panjang di ponsel)
    """
    kueri = parse_qs(urlsplit(raw_path).query)
    data = HUNT.jejak(
        grup=_angka_kueri(kueri, "grup", 1, MAX_GRUP_ID),
        sejak=_angka_kueri(kueri, "sejak", -1, 10 ** 7),
        detik=_angka_kueri(kueri, "detik", 1, JEJAK_CAP),
        langkah=_angka_kueri(kueri, "langkah", 1, 600) or 1,
    )

    if csv:
        baris = ["grup,detik,jarak_m,kemajuan,panas"]
        nama_panas = {v: k for k, v in HEAT_LEVEL.items()}
        for gid, isi in data["grup"].items():
            for t, jarak, kem, level in isi["s"]:
                baris.append(f"{gid},{t},{jarak},{kem},{nama_panas.get(level, '')}")
        body = ("\n".join(baris) + "\n").encode("utf-8")
        headers = Headers({
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Length": str(len(body)),
            "Content-Disposition": f'attachment; filename="jejak-{HUNT.ronde}.csv"',
            "Cache-Control": "no-store",
        })
        return Response(HTTPStatus.OK, "OK", headers, body)

    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": str(len(body)),
        "Cache-Control": "no-store",
    })
    return Response(HTTPStatus.OK, "OK", headers, body)


def sajikan_foto(connection: ServerConnection, path: str) -> Response:
    """Layani satu foto klaim.

    Empat hal yang membuat ini aman tanpa perlu normalisasi jalur:

    1. Daftar putihnya berjangkar penuh dan tidak mengizinkan titik selain
       pemisah ekstensi, sehingga "..", "." dan "%2e%2e" semuanya gagal.
    2. Persentase TIDAK diterjemahkan. Setiap nama berkas yang kita buat
       sudah berada di abjad aman, jadi permintaan yang mengandung escape
       menurut definisi bukan berkas kita dan memang harus 404.
    3. Bagian foldernya tidak pernah berasal dari pengguna -- ia milik
       server, dan masih diperiksa lagi dengan regex.
    4. is_file() sebelum dibaca, sehingga tautan simbolik ke folder 404.
    """
    nama = path.rsplit("/", 1)[-1]
    if not FOTO_RE.fullmatch(nama) or not RONDE_RE.fullmatch(HUNT.ronde):
        return connection.respond(HTTPStatus.NOT_FOUND, "Tidak ditemukan\n")

    berkas = ronde_dir() / nama
    if not berkas.is_file():
        return connection.respond(HTTPStatus.NOT_FOUND, "Tidak ditemukan\n")

    try:
        body = berkas.read_bytes()
    except OSError:
        return connection.respond(HTTPStatus.NOT_FOUND, "Tidak ditemukan\n")

    headers = Headers({
        # Jenisnya diambil dari ekstensi berkas yang kita bangkitkan sendiri,
        # bukan dari mime yang diakui klien saat mengunggah.
        "Content-Type": TIPE_FOTO.get(berkas.suffix, "application/octet-stream"),
        "Content-Length": str(len(body)),
        # Nama berkas memuat akhiran acak dan tidak pernah dipakai ulang,
        # jadi cache agresif gratis dan menahan proyektor mengambil ulang.
        "Cache-Control": "public, max-age=3600, immutable",
    })
    return Response(HTTPStatus.OK, "OK", headers, body)


# --------------------------------------------------------------------------
# WebSocket
# --------------------------------------------------------------------------

def peer_ip(connection: ServerConnection) -> str | None:
    try:
        return connection.remote_address[0]
    except (AttributeError, IndexError, TypeError):
        return None


async def handle(connection: ServerConnection) -> None:
    path = connection.request.path.split("?")[0]
    ip = peer_ip(connection)

    if path == "/live":
        await handle_viewer(connection)
        return

    label = "beacon" if path == "/beacon" else "hunter"
    print(f"[{timestamp()}] {label} tersambung dari {ip}")

    owned: int | None = None  # Kelompok yang dilaporkan lewat soket ini

    try:
        async for raw in connection:
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue

            if path == "/beacon":
                if "grup" not in msg:
                    continue
                owned = int(msg["grup"])
                HUNT.on_beacon(msg, ip)
            elif "grup" in msg:
                owned = int(msg["grup"])
                HUNT.on_hunter(msg, ip)

    except ConnectionClosed:
        pass
    finally:
        print(f"[{timestamp()}] {label} terputus ({ip})")
        if owned is not None and owned in HUNT.groups:
            if path == "/beacon":
                HUNT.groups[owned]["beacon_online"] = False
                HUNT.note("beacon-hening", owned)
            else:
                HUNT.groups[owned]["connected"] = False
                HUNT.note("hilang", owned)
        HUNT.rev += 1


async def kirim(connection: ServerConnection, tipe: str, **fields) -> None:
    """Balasan langsung ke satu klien, di luar siaran 10 Hz.

    Siaran mengirim bingkai yang identik untuk semua orang, jadi balasan
    pribadi dibedakan oleh medan "tipe". Urutan antara balasan ini dan
    bingkai siaran berikutnya TIDAK dijamin -- keduanya ditulis dari tugas
    yang berbeda. Karena itu balasan bersifat pemberitahuan saja; yang
    menggerakkan tampilan tetap bingkai siaran.
    """
    try:
        await connection.send(json.dumps({"tipe": tipe, **fields}))
    except (ConnectionClosed, RuntimeError):
        pass


def _grup_valid(value) -> int | None:
    try:
        gid = int(value)
    except (TypeError, ValueError):
        return None
    return gid if 1 <= gid <= MAX_GRUP_ID else None


def boleh_unggah(meta: dict, gid: int) -> bool:
    """Hanya anggota kelompok itu sendiri (atau asisten) yang boleh."""
    if meta["peran"] == PERAN_ASISTEN:
        return True
    return meta["peran"] == PERAN_ANGGOTA and meta["grup"] == gid


async def terima_foto(connection: ServerConnection, meta: dict,
                      data: bytes) -> None:
    """Bingkai biner: badan foto yang headernya sudah diumumkan."""
    unggah = meta.get("unggah")
    meta["unggah"] = None
    if unggah is None:
        await kirim(connection, "galat", alasan="tidak ada unggahan tertunda")
        return

    # Peramban tahu persis ukuran Blob-nya, jadi kesamaan mutlak adalah
    # pemeriksaan yang benar dan sekaligus menangkap kiriman yang terpotong.
    if len(data) != unggah["ukuran"]:
        await kirim(connection, "balas", aksi="foto", ok=False,
                    alasan="ukuran berkas tidak cocok")
        return

    ext = unggah["ext"]
    if not data.startswith(SNIFF_FOTO[ext]):
        await kirim(connection, "balas", aksi="foto", ok=False,
                    alasan="isi berkas bukan gambar")
        return

    gid = unggah["grup"]
    slot = HUNT.groups.get(gid)
    if slot is None:
        await kirim(connection, "balas", aksi="foto", ok=False,
                    alasan="kelompok belum mengirim data")
        return

    nama = f"g{gid:02d}-{slot['klaim_ke'] + 1:04d}-{secrets.token_hex(4)}{ext}"
    folder = ronde_dir()
    try:
        await asyncio.to_thread(folder.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread((folder / nama).write_bytes, data)
    except OSError as err:
        print(f"[{timestamp()}] foto gagal ditulis: {err}")
        await kirim(connection, "balas", aksi="foto", ok=False,
                    alasan="penyimpanan gagal")
        return

    slot["foto_riwayat"].append(nama)
    del slot["foto_riwayat"][:-MAX_FOTO_PER_GRUP]
    HUNT.rev += 1
    print(f"[{timestamp()}] foto kelompok {gid}: {nama} ({len(data)} bait)")
    await kirim(connection, "balas", aksi="foto", ok=True,
                berkas=nama, url=f"/foto/{nama}")


def _penerima_ping(gid: int) -> list[ServerConnection]:
    """Siapa yang boleh melihat sinyal kelompok ini: anggotanya dan asisten."""
    return [conn for conn, meta in VIEWERS.items()
            if meta["peran"] == PERAN_ASISTEN or meta.get("grup") == gid]


async def kirim_riwayat_ping(connection: ServerConnection, meta: dict) -> None:
    """Lima sinyal terakhir, supaya ponsel yang baru masuk tidak buta."""
    if meta["peran"] == PERAN_ASISTEN:
        daftar = [p for g in sorted(HUNT.pings) for p in HUNT.pings[g]]
        daftar.sort(key=lambda p: p["id"])
    elif meta.get("grup") is not None:
        daftar = list(HUNT.pings.get(meta["grup"], []))
    else:
        return
    await kirim(connection, "ping_riwayat", daftar=daftar)


async def kirim_ping(connection: ServerConnection, meta: dict, kode) -> None:
    """Satu sinyal tim, hanya ke kelompoknya sendiri dan ke asisten."""
    gid = meta.get("grup")
    if gid is None or not meta.get("nim"):
        await kirim(connection, "balas", aksi="ping", ok=False,
                    alasan="masuk dengan NIM dulu")
        return
    if kode not in PING_KODE:
        await kirim(connection, "balas", aksi="ping", ok=False,
                    alasan="sinyal tidak dikenal")
        return
    now = time.monotonic()
    if now - meta["ping_at"] < PING_JEDA_SEC:
        await kirim(connection, "balas", aksi="ping", ok=False,
                    alasan="tunggu sebentar", kode="terlalu_cepat")
        return
    meta["ping_at"] = now

    HUNT.ping_seq += 1
    ping = {
        "id": HUNT.ping_seq,
        "grup": gid,
        "kode": kode,
        "dari": nama_depan(meta["nama"]),
        # Nomor koneksi pengirim (bukan rahasia; sama dengan yang dicatat
        # log) supaya ponsel pengirim mengenali sinyalnya sendiri.
        "dari_id": meta["id"],
        "at": timestamp(),
        "t": HUNT.detik(),
    }
    riwayat = HUNT.pings.setdefault(gid, [])
    riwayat.append(ping)
    del riwayat[:-PING_RIWAYAT]

    payload = json.dumps({"tipe": "ping", **ping})
    targets = _penerima_ping(gid)
    await asyncio.gather(*(t.send(payload) for t in targets),
                         return_exceptions=True)
    await kirim(connection, "balas", aksi="ping", ok=True)


def simpan_sapuan(meta: dict, msg: dict) -> tuple[bool, str]:
    """Validasi dan simpan satu sapuan 8 arah dari anggota kelompok."""
    gid = meta.get("grup")
    if gid is None or not meta.get("nim"):
        return False, "masuk dengan NIM dulu"

    arah = msg.get("arah")
    if not isinstance(arah, list) or len(arah) != SAPUAN_ARAH:
        return False, f"sapuan butuh {SAPUAN_ARAH} arah"
    bersih: list[float | None] = []
    for nilai in arah:
        if nilai is None:
            bersih.append(None)
            continue
        if isinstance(nilai, bool) or not isinstance(nilai, (int, float)):
            return False, "nilai arah tidak sah"
        if not (SAPUAN_RSSI_MIN <= float(nilai) <= SAPUAN_RSSI_MAX):
            return False, "nilai arah di luar rentang RSSI"
        bersih.append(round(float(nilai), 1))
    if sum(1 for v in bersih if v is not None) < SAPUAN_MIN_TERISI:
        return False, f"paling sedikit {SAPUAN_MIN_TERISI} arah terekam"

    mode = msg.get("mode", "manual")
    if mode not in ("manual", "kompas"):
        return False, "mode sapuan tidak dikenal"
    awal = msg.get("awal_deg")
    if awal is not None:
        if isinstance(awal, bool) or not isinstance(awal, (int, float)) \
                or not 0 <= float(awal) < 360:
            return False, "arah awal tidak sah"
        awal = round(float(awal), 1)

    terisi = [(i, v) for i, v in enumerate(bersih) if v is not None]
    terkuat = max(terisi, key=lambda p: p[1])[0]
    oleh = nama_depan(meta["nama"])
    HUNT.sapuan[gid] = {
        "arah": bersih, "mode": mode, "awal_deg": awal,
        "terkuat": terkuat, "oleh": oleh, "t": HUNT.detik(),
        "at": timestamp(),
    }
    HUNT.note("sapuan", gid, dari=oleh, terkuat=terkuat)
    return True, ""


async def handle_viewer(connection: ServerConnection) -> None:
    meta = {
        "id": secrets.token_hex(4),   # untuk log, bukan rahasia
        "peran": PERAN_TAMU,
        "grup": None,
        "nim": None,
        "sesi": None,
        "ip": peer_ip(connection),
        "sejak": time.monotonic(),
        "gagal": 0,
        "gagal_masuk": 0,
        "unggah": None,
        "nama": "",
        "ping_at": 0.0,
    }
    VIEWERS[connection] = meta
    print(f"[{timestamp()}] papan skor dibuka ({meta['ip']})")

    try:
        await connection.send(json.dumps(HUNT.snapshot()))
        async for raw in connection:
            # Bingkai biner HARUS ditangani sebelum json.loads: memanggil
            # json.loads pada bait JPEG memunculkan UnicodeDecodeError, yang
            # merupakan turunan ValueError dan BUKAN JSONDecodeError -- ia
            # akan lolos dari except di bawah dan mematikan korutin ini.
            if isinstance(raw, (bytes, bytearray)):
                await terima_foto(connection, meta, bytes(raw))
                continue

            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
                continue
            if not isinstance(msg, dict):
                continue

            await layani_aksi(connection, meta, msg)

    except ConnectionClosed:
        pass
    finally:
        VIEWERS.pop(connection, None)


async def layani_aksi(connection: ServerConnection, meta: dict,
                      msg: dict) -> None:
    """Satu perintah dari peramban."""
    aksi = msg.get("aksi")

    # Token boleh dibawa per pesan maupun ditetapkan sekali lewat "halo".
    # Pesan yang membawa token sendiri menang; selebihnya peran koneksi yang
    # menentukan. Dengan begitu tab asisten tidak perlu mengirim ulang token
    # tiap tindakan, tetapi satu tindakan lepas dari tab lain tetap bisa.
    berwenang = meta["peran"] == PERAN_ASISTEN or token_ok(msg.get("token"))

    if aksi in AKSI_ASISTEN and not berwenang:
        meta["gagal"] += 1
        await kirim(connection, "balas", aksi=aksi, ok=False,
                    alasan="butuh token asisten")
        if meta["gagal"] >= MAX_GAGAL_TOKEN:
            await connection.close(1008, "terlalu banyak percobaan")
        return

    # Keanggotaan kelompok TIDAK lagi datang dari klien. Versi sebelumnya
    # mempercayai "grup" apa pun yang dikirim peramban, sehingga sebuah
    # ponsel dapat mengaku kelompok mana saja hanya dengan menyunting satu
    # medan. Sekarang satu-satunya jalan masuk adalah NIM yang dicocokkan ke
    # sesi yang sedang berjalan, dan hasilnya dihitung ulang di sini pada
    # tiap sambung ulang -- bukan diingat dari yang lalu.
    def terapkan_nim(nim_mentah) -> tuple[int | None, str, str]:
        if not isinstance(nim_mentah, str) or not NIM_RE.match(nim_mentah.strip()):
            return None, "NIM tidak sah", "nim_cacat"
        if JADWAL["aktif"] is None:
            return None, "belum ada sesi yang berjalan", "tak_ada_sesi"
        found = cari_nim(nim_mentah)
        if found is None:
            return None, "NIM tidak terdaftar di sesi ini", "tak_terdaftar"
        return found["grup"], "", ""

    if aksi == "masuk":
        # Pencarian ini memang dapat dicoba berulang oleh siapa pun di
        # hotspot. Batasnya ada supaya menebak seluruh angkatan tidak
        # menjadi hal yang murah, dan balasannya tidak pernah memuat lebih
        # dari catatan orang yang baru saja mengetikkan NIM-nya sendiri.
        if meta["gagal_masuk"] >= MAX_GAGAL_MASUK:
            await kirim(connection, "masuk", ok=False,
                        alasan="terlalu banyak percobaan",
                        kode="terlalu_sering")
            return
        nim = msg.get("nim")
        gid, alasan, kode = terapkan_nim(nim)
        if gid is None:
            meta["gagal_masuk"] += 1
            await kirim(connection, "masuk", ok=False, alasan=alasan, kode=kode)
            return

        orang = cari_nim(nim)
        meta["grup"] = gid
        meta["nim"] = nim.strip().upper()
        meta["nama"] = orang["nama"]
        meta["sesi"] = JADWAL["aktif"]
        if meta["peran"] != PERAN_ASISTEN:
            meta["peran"] = PERAN_ANGGOTA
        print(f"[{timestamp()}] masuk: kelompok {gid} ({meta['ip']})")
        await kirim(connection, "masuk", ok=True, grup=gid,
                    nama=orang["nama"], sesi=JADWAL["aktif"],
                    peran=meta["peran"], id=meta["id"],
                    peran_tim=PERAN.get(meta["nim"]))
        await kirim_riwayat_ping(connection, meta)
        return

    if aksi == "halo":
        punya_token = msg.get("token") is not None
        if punya_token and not token_ok(msg.get("token")):
            meta["gagal"] += 1
            await kirim(connection, "halo", ok=False, alasan="token salah",
                        peran=meta["peran"], grup=meta["grup"],
                        ronde=HUNT.ronde, sesi=JADWAL["aktif"],
                        roster_rev=JADWAL["rev"])
            if meta["gagal"] >= MAX_GAGAL_TOKEN:
                await connection.close(1008, "terlalu banyak percobaan")
            return

        alasan = ""
        kode = ""
        gid = None
        if msg.get("nim") is not None:
            gid, alasan, kode = terapkan_nim(msg.get("nim"))
        meta["grup"] = gid
        meta["nim"] = msg.get("nim", "").strip().upper() if gid is not None else None
        meta["sesi"] = JADWAL["aktif"] if gid is not None else None
        orang = cari_nim(meta["nim"]) if meta["nim"] else None
        meta["nama"] = orang["nama"] if orang else ""

        if punya_token:
            meta["peran"] = PERAN_ASISTEN
        elif gid is not None:
            meta["peran"] = PERAN_ANGGOTA
        else:
            meta["peran"] = PERAN_TAMU

        # ok=False dengan peran "tamu" adalah bagaimana sebuah ponsel dari
        # sesi sebelumnya diberi tahu untuk melupakan dirinya sendiri.
        await kirim(connection, "halo", ok=not alasan, alasan=alasan, kode=kode,
                    peran=meta["peran"], grup=meta["grup"], id=meta["id"],
                    ronde=HUNT.ronde, sesi=JADWAL["aktif"],
                    roster_rev=JADWAL["rev"],
                    nama=meta["nama"],
                    peran_tim=PERAN.get(meta["nim"]) if meta["nim"] else None)
        await kirim_riwayat_ping(connection, meta)
        return

    if aksi == "tim_peran":
        if meta["grup"] is None or not meta["nim"]:
            await kirim(connection, "balas", aksi="tim_peran", ok=False,
                        alasan="masuk dengan NIM dulu")
            return
        peran = msg.get("peran")
        if peran is not None and peran not in PERAN_TIM:
            await kirim(connection, "balas", aksi="tim_peran", ok=False,
                        alasan="peran tidak dikenal")
            return
        if peran is None:
            PERAN.pop(meta["nim"], None)
        else:
            PERAN[meta["nim"]] = peran
        HUNT.rev += 1
        await kirim(connection, "balas", aksi="tim_peran", ok=True, peran=peran)
        return

    if aksi == "ping":
        await kirim_ping(connection, meta, msg.get("kode"))
        return

    if aksi == "panggil_asisten":
        gid = meta["grup"]
        if gid is None:
            await kirim(connection, "balas", aksi="panggil_asisten", ok=False,
                        alasan="masuk dengan NIM dulu")
            return
        if msg.get("batal"):
            HUNT.panggil.pop(gid, None)
            HUNT.rev += 1
        elif gid not in HUNT.panggil:
            HUNT.panggil[gid] = time.monotonic()
            HUNT.note("panggil", gid, dari=nama_depan(meta["nama"]))
        await kirim(connection, "balas", aksi="panggil_asisten", ok=True,
                    aktif=gid in HUNT.panggil)
        return

    if aksi == "panggil_selesai":
        gid = _grup_valid(msg.get("grup"))
        if gid is None or gid not in HUNT.panggil:
            await kirim(connection, "balas", aksi="panggil_selesai", ok=False,
                        alasan="kelompok itu tidak sedang memanggil")
            return
        HUNT.panggil.pop(gid, None)
        HUNT.rev += 1
        await kirim(connection, "balas", aksi="panggil_selesai", ok=True, grup=gid)
        return

    if aksi == "sapuan":
        ok, alasan = simpan_sapuan(meta, msg)
        await kirim(connection, "balas", aksi="sapuan", ok=ok, alasan=alasan)
        return

    if aksi == "pengumuman":
        teks = msg.get("teks")
        if not isinstance(teks, str):
            teks = ""
        teks = "".join(c for c in teks if c.isprintable()).strip()
        if len(teks) > MAX_PENGUMUMAN:
            await kirim(connection, "balas", aksi="pengumuman", ok=False,
                        alasan=f"paling banyak {MAX_PENGUMUMAN} karakter")
            return
        if teks:
            HUNT.pengumuman_seq += 1
            HUNT.pengumuman = {"id": HUNT.pengumuman_seq, "teks": teks,
                               "at": timestamp(), "t": HUNT.detik()}
            HUNT.note("pengumuman")
        else:
            HUNT.pengumuman = None
            HUNT.rev += 1
        await kirim(connection, "balas", aksi="pengumuman", ok=True,
                    aktif=HUNT.pengumuman is not None)
        return

    if aksi == "aba_aba":
        HUNT.note("aba-aba")
        await kirim(connection, "balas", aksi="aba_aba", ok=True)
        return

    if aksi == "arena":
        # Mengubah jari-jari menggeser seluruh tangga panas seketika, persis
        # seperti --arena, tetapi tanpa menyalakan ulang server (dan karena
        # itu tanpa kehilangan ronde yang sedang berjalan).
        try:
            nilai = float(msg.get("arena_m"))
        except (TypeError, ValueError):
            nilai = float("nan")
        if not ARENA_MIN_M <= nilai <= ARENA_MAX_M:
            await kirim(connection, "balas", aksi="arena", ok=False,
                        alasan=f"jari-jari arena {ARENA_MIN_M:.0f} sampai "
                               f"{ARENA_MAX_M:.0f} m")
            return
        HUNT.arena_m = round(nilai, 1)
        HUNT.note("arena", arena_m=HUNT.arena_m)
        await kirim(connection, "balas", aksi="arena", ok=True,
                    arena_m=HUNT.arena_m)
        return

    if aksi == "foto_mulai":
        await mulai_unggah(connection, meta, msg)
        return

    if aksi == "klaim":
        gid = _grup_valid(msg.get("grup"))
        if gid is None:
            await kirim(connection, "balas", aksi="klaim", ok=False,
                        alasan="nomor kelompok tidak sah")
            return
        if not boleh_unggah(meta, gid):
            await kirim(connection, "balas", aksi="klaim", ok=False,
                        alasan="hanya kelompok itu sendiri yang boleh mengklaim")
            return
        ok, alasan = HUNT.claim(gid, msg.get("foto"))
        await kirim(connection, "balas", aksi="klaim", ok=ok, alasan=alasan,
                    urut=HUNT.groups[gid]["klaim_urut"] if ok else None)
        return

    if aksi == "konfirmasi":
        gid = _grup_valid(msg.get("grup"))
        if gid is None:
            await kirim(connection, "balas", aksi="konfirmasi", ok=False,
                        alasan="nomor kelompok tidak sah")
            return
        ok, alasan = HUNT.confirm(gid, paksa=bool(msg.get("paksa")))
        await kirim(connection, "balas", aksi="konfirmasi", ok=ok, alasan=alasan)
        return

    if aksi == "tolak":
        gid = _grup_valid(msg.get("grup"))
        if gid is None:
            await kirim(connection, "balas", aksi="tolak", ok=False,
                        alasan="nomor kelompok tidak sah")
            return
        ok, alasan = HUNT.reject(gid, str(msg.get("alasan", "")))
        await kirim(connection, "balas", aksi="tolak", ok=ok, alasan=alasan)
        return

    if aksi == "kalibrasi":
        gid = _grup_valid(msg.get("grup"))
        if gid is None:
            await kirim(connection, "balas", aksi="kalibrasi", ok=False,
                        alasan="nomor kelompok tidak sah")
            return
        HUNT.calibrate(gid)
        await kirim(connection, "balas", aksi="kalibrasi", ok=True)
        return

    if aksi == "reset":
        await sapu_unggahan(semua=False)
        HUNT.reset()
        HUNT.note("reset")
        await kirim(connection, "balas", aksi="reset", ok=True)
        return

    if aksi == "jadwal_set":
        ok, alasan = jadwal_set(msg.get("sesi"), msg.get("regu") or {})
        if ok and isinstance(msg.get("jam"), list):
            ok, alasan = jadwal_jam(msg.get("jam"))
        await kirim(connection, "balas", aksi="jadwal_set", ok=ok,
                    alasan=alasan, rev=JADWAL["rev"],
                    jadwal=jadwal_asisten() if ok else None)
        return

    if aksi == "jadwal_hapus":
        await jadwal_hapus()
        await kirim(connection, "balas", aksi="jadwal_hapus", ok=True,
                    rev=JADWAL["rev"], jadwal=jadwal_asisten())
        return

    if aksi == "jadwal_baca":
        # Satu-satunya jalan keluar NIM selain balasan "masuk", dan ia ada
        # di belakang token karena asisten memang harus melihat daftar yang
        # baru saja diketiknya.
        await kirim(connection, "balas", aksi="jadwal_baca", ok=True,
                    jadwal=jadwal_asisten())
        return

    if aksi == "sesi_mulai":
        sid = msg.get("sesi")
        if sesi_oleh_id(sid) is None:
            await kirim(connection, "balas", aksi="sesi_mulai", ok=False,
                        alasan="sesi tidak dikenal")
            return
        await sesi_mulai(int(sid), "manual")
        await kirim(connection, "balas", aksi="sesi_mulai", ok=True,
                    sesi=sid, jadwal=jadwal_asisten())
        return

    if aksi == "sesi_akhiri":
        if JADWAL["aktif"] is None:
            await kirim(connection, "balas", aksi="sesi_akhiri", ok=False,
                        alasan="tidak ada sesi yang berjalan")
            return
        await sesi_akhiri("manual")
        await kirim(connection, "balas", aksi="sesi_akhiri", ok=True,
                    jadwal=jadwal_asisten())
        return

    if aksi:
        await kirim(connection, "galat", alasan=f"perintah tidak dikenal: {aksi}")


async def mulai_unggah(connection: ServerConnection, meta: dict,
                       msg: dict) -> None:
    """Header foto. Menolak di sini menghemat 300 KB lewat Wi-Fi ramai."""
    def tolak(alasan: str):
        return kirim(connection, "balas", aksi="foto_mulai", ok=False,
                     alasan=alasan)

    gid = _grup_valid(msg.get("grup"))
    if gid is None:
        await tolak("nomor kelompok tidak sah")
        return
    if not boleh_unggah(meta, gid):
        await tolak("hanya anggota kelompok itu yang boleh mengunggah")
        return
    if meta["unggah"] is not None:
        await tolak("unggahan sebelumnya belum selesai")
        return

    mime = msg.get("mime")
    if mime not in MIME_FOTO:
        await tolak("format tidak didukung")
        return

    try:
        ukuran = int(msg.get("ukuran", 0))
    except (TypeError, ValueError):
        ukuran = 0
    if not 0 < ukuran <= MAX_FOTO_BYTES:
        await tolak("berkas terlalu besar")
        return

    slot = HUNT.groups.get(gid)
    if slot is not None and len(slot["foto_riwayat"]) >= MAX_FOTO_PER_GRUP:
        await tolak("batas foto kelompok tercapai")
        return

    try:
        total = sum(1 for _ in ronde_dir().glob("*")) if ronde_dir().is_dir() else 0
    except OSError:
        total = 0
    if total >= MAX_FOTO_TOTAL:
        await tolak("penyimpanan penuh")
        return

    # Penjaga yang sama dengan tombol klaim: menolak unggahan yang klaimnya
    # tidak mungkin diterima, sebelum bitnya menyeberang.
    boleh, alasan = HUNT.claim_armed(gid)
    if not boleh:
        await tolak(alasan)
        return

    meta["unggah"] = {"grup": gid, "ukuran": ukuran, "ext": MIME_FOTO[mime],
                      "at": time.monotonic()}
    await kirim(connection, "balas", aksi="foto_mulai", ok=True)


async def broadcast_loop() -> None:
    """Menggambar ulang pada laju tetap, bukan tiap paket masuk."""
    period = 1.0 / BROADCAST_HZ

    while True:
        await asyncio.sleep(period)
        # Jejak dicuplik SEBELUM pemeriksaan penonton: ronde tetap tercatat
        # utuh walau tidak ada satu tab pun yang terbuka, supaya tayangan
        # ulangnya tidak berlubang. cuplik() sendiri menjaga satu cuplikan
        # per detik perburuan.
        HUNT.cuplik()
        if not VIEWERS:
            continue

        frame = json.dumps(HUNT.snapshot())
        # Dikirim serentak, bukan satu per satu: sebelumnya satu penonton
        # dengan Wi-Fi lemah menahan denyut untuk semua orang, dan unggahan
        # foto membuat itu lebih mudah terjadi.
        targets = list(VIEWERS)
        hasil = await asyncio.gather(
            *(viewer.send(frame) for viewer in targets),
            return_exceptions=True,
        )
        for viewer, outcome in zip(targets, hasil):
            if isinstance(outcome, BaseException):
                VIEWERS.pop(viewer, None)


async def penjaga_sesi() -> None:
    """Denyut lambat: pergantian sesi, dan unggahan tertunda yang basi.

    Pergantian tidak cukup diperiksa saat ada yang membaca. Ia harus
    MENGHAPUS foto dari cakram, sedangkan pembaca alaminya adalah snapshot()
    -- dan siaran melewatkan denyutnya sama sekali ketika tidak ada penonton.
    Kalau tab terakhir ditutup pada menit ke-164, tidak ada lagi yang
    membaca, dan foto lima kelompok praktikan bernama akan tinggal di
    cakram sampai server dijalankan ulang.
    """
    while True:
        await asyncio.sleep(SESI_SAPU_SEC)

        mulai_web = jadwal_impor_jika_berubah(JADWAL_IMPOR_PATH)
        if mulai_web is not None:
            await sesi_mulai(mulai_web, "Mulai Perburuan dari web")

        # Urutannya penting: sesi yang jatuh tempo ditutup lebih dulu,
        # supaya sesi berikutnya yang kebetulan sudah waktunya mulai tidak
        # langsung dibersihkan lagi oleh penutupan yang tertunda.
        if sesi_jatuh_tempo():
            await sesi_akhiri("batas waktu")

        # Jam hanya menyalakan sesi ketika tidak ada yang sedang berjalan.
        # Sebelumnya syaratnya "berbeda dari yang aktif", yang berarti
        # asisten menekan "mulai sesi 2" di tengah jendela sesi 3 akan
        # dibatalkan penjadwal sepuluh detik kemudian -- override yang
        # tidak meng-override apa pun.
        terjadwal = sesi_terjadwal_sekarang()
        if (JADWAL["aktif"] is None and terjadwal is not None
                and terjadwal not in JADWAL["selesai"]):
            await sesi_mulai(terjadwal, "terjadwal")

        now = time.monotonic()
        for meta in list(VIEWERS.values()):
            unggah = meta.get("unggah")
            if unggah and now - unggah["at"] > UNGGAH_BASI_SEC:
                meta["unggah"] = None


def cetak_token() -> None:
    """Token hanya muncul di konsol PC, tempat operator berada."""
    isi = f"  TOKEN ASISTEN:  {' '.join(TOKEN)}  "
    garis = "-" * len(isi)
    print(f"[{timestamp()}] +{garis}+")
    print(f"[{timestamp()}] |{isi}|")
    print(f"[{timestamp()}] +{garis}+")


async def main(host: str, port: int) -> None:
    # Foto tidak pernah selamat dari restart: seluruh keadaan klaim ada di
    # memori, jadi memulai dengan cakram bersih meniadakan aritmetika umur
    # berkas sekaligus folder yatim sesudah server mati mendadak.
    await sapu_unggahan(semua=True)
    jadwal_muat()
    mulai_web = jadwal_impor_jika_berubah(JADWAL_IMPOR_PATH)
    if mulai_web is not None:
        await sesi_mulai(mulai_web, "Mulai Perburuan dari web")

    # Kalau server dinyalakan di tengah jam sebuah sesi, sesi itulah yang
    # berlaku. Tanpa ini asisten harus menekan "mulai" setiap kali PC
    # dinyalakan ulang di tengah praktikum.
    terjadwal = sesi_terjadwal_sekarang()
    if (JADWAL["aktif"] is None and terjadwal is not None
            and terjadwal not in JADWAL["selesai"]):
        await sesi_mulai(terjadwal, "terjadwal saat dinyalakan")

    async with serve(handle, host, port, process_request=process_request,
                     ping_interval=20, ping_timeout=20,
                     max_size=WS_MAX_SIZE):
        print(f"[{timestamp()}] Papan skor berjalan pada http://{host}:{port}")
        print(f"[{timestamp()}] Arena {HUNT.arena_m:.0f} m: "
              f"membara <= {HUNT.heat_radius(*HEAT_LADDER[0][1:]):.0f} m, "
              f"sejuk <= {HUNT.heat_radius(*HEAT_LADDER[3][1:]):.0f} m "
              f"(n = {HUNT.path_loss_n})")
        print(f"[{timestamp()}] Hunter -> ws://{host}:{port}/hunter")
        print(f"[{timestamp()}] Beacon -> ws://{host}:{port}/beacon")
        jam = " ".join(e["mulai"] for e in JADWAL["sesi"])
        print(f"[{timestamp()}] Sesi {jam} "
              f"(batas {SESI_DURASI_SEC // 60:.0f} menit, "
              f"aktif={JADWAL['aktif']})")
        cetak_token()
        await asyncio.gather(broadcast_loop(), penjaga_sesi())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Papan skor Perburuan LoRa IRIS")
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument(
        "--arena", type=float, default=ARENA_RADIUS_M, metavar="METER",
        help="jari-jari arena dalam meter; menggeser seluruh tangga panas "
             f"(bawaan {ARENA_RADIUS_M:.0f})")
    parser.add_argument(
        "--n", type=float, default=PATH_LOSS_N, dest="path_loss_n",
        help="eksponen path loss: 2.0 lapangan terbuka, 2.5-3.5 dalam "
             f"gedung bersekat (bawaan {PATH_LOSS_N})")
    parser.add_argument(
        "--rssi1m", type=float, default=RSSI_AT_1M, metavar="DBM",
        help="RSSI acuan pada jarak 1 meter; biasanya dikalibrasi dari papan "
             f"skor, bukan dari sini (bawaan {RSSI_AT_1M})")
    parser.add_argument(
        "--token", default=None, metavar="KODE",
        help="token asisten tetap; bila tidak diisi, sebuah token acak "
             "dibangkitkan dan dicetak saat server dinyalakan")
    parser.add_argument(
        "--sesi-durasi", type=float, default=SESI_DURASI_SEC / 60.0,
        metavar="MENIT", dest="sesi_durasi",
        help="berapa lama satu sesi berjalan sebelum rondenya dibersihkan "
             f"bersama seluruh foto (bawaan {SESI_DURASI_SEC // 60:.0f})")
    parser.add_argument(
        "--sesi-jam", default=None, metavar="JJ:MM,...", dest="sesi_jam",
        help="empat jam mulai sesi dipisah koma "
             f"(bawaan {','.join(JADWAL_MULAI)})")
    parser.add_argument(
        "--jadwal-impor", default=None, metavar="PATH", dest="jadwal_impor",
        help="berkas jadwal Modul 4 yang ditulis agent PC "
             f"(bawaan {JADWAL_IMPOR_PATH_BAWAAN})")
    args = parser.parse_args()

    if args.jadwal_impor:
        JADWAL_IMPOR_PATH = pathlib.Path(args.jadwal_impor)

    SESI_DURASI_SEC = max(60.0, args.sesi_durasi * 60.0)
    if args.sesi_jam:
        pilihan = [j.strip() for j in args.sesi_jam.split(",") if j.strip()]
        if len(pilihan) != len(JADWAL_MULAI) or not all(
                JAM_RE.match(j) for j in pilihan):
            parser.error(f"--sesi-jam butuh {len(JADWAL_MULAI)} jam JJ:MM")
        JADWAL_MULAI = tuple(pilihan)

    HUNT.arena_m = args.arena
    HUNT.path_loss_n = args.path_loss_n
    HUNT.rssi_at_1m = args.rssi1m
    TOKEN = (args.token or buat_token()).strip().upper()

    try:
        asyncio.run(main(args.host, args.port))
    except KeyboardInterrupt:
        print("\nPapan skor dihentikan.")
    finally:
        # Tidak meninggalkan jejak: foto praktikan tidak menginap di PC.
        shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
