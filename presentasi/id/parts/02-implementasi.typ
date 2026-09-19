// #include does NOT propagate #import bindings in Typst — every file that
// uses theme helpers (slide, section-slide, note-box, ...) must re-import
// the theme itself, even though the parent deck already imported it.
#import "/presentasi/template/slides.typ": *

// ---------------------------------------------------------------------
// Bagian: Implementasi Kode — walkthrough kode Beacon dan Hunter pada
// permainan Perburuan LoRa (Modul 4 Part A), dibaca langsung dari
// kunci_jawaban/id/modul4/grup1/*.ino.
//
// Nomor baris pada code-src() dibaca langsung dari berkas kunci jawaban,
// jadi setiap kali scripts/gen_modul4.py diubah dan dijalankan ulang,
// rentang di bawah harus diperiksa ulang. Deck ini tidak membahas
// LoRaWAN/ANTARES.
// ---------------------------------------------------------------------

#let hunter = "/kunci_jawaban/id/modul4/grup1/hunter.ino"
#let beacon = "/kunci_jawaban/id/modul4/grup1/beacon.ino"

#section-slide[Implementasi — Perburuan LoRa]

// --- Topologi ------------------------------------------------------------

#slide(title: [Kenapa Tidak Ada Jatah Waktu Lagi])[
  Satu papan *Beacon* disembunyikan dan memancar terus-menerus. Enam papan
  *Hunter* hanya *mendengarkan*, lalu melaporkan kekuatan sinyalnya ke papan
  skor lewat Wi-Fi.

  #v(0.4em)
  Hanya *satu radio* di ruangan yang pernah memancar, sehingga tabrakan paket
  mustahil terjadi dan pembagian jatah detik per kelompok tidak lagi
  diperlukan sama sekali.

  #v(0.4em)
  #note-box[
    Pada *Part A* aturan jaringan kalian susun sendiri; pada *Part B* aturan
    itu sudah disediakan LoRaWAN.
  ]
]

// --- Beacon --------------------------------------------------------------

#slide(title: [Beacon — Parameter Radio])[
  #cards-row(
    captions: ([Frekuensi, SF, Lebar Pita, Sync Word], [Daya Pancar + Jeda]),
    code-src(beacon, from: 42, to: 45),
    {
      code-src(beacon, from: 51, to: 51)
      v(0.3em)
      code-src(beacon, from: 55, to: 55)
    },
  )
  #v(0.5em)
  #note-box[
    Daya disetel menurut *ukuran arena*. Pada 20 dBm seluruh gedung terbaca
    sama kuat dan beacon mustahil ditemukan; pada daya terlalu kecil kelompok
    terjauh tidak mendengar apa pun. Bawaan 10 dBm — ruangan 2, gedung 14.
  ]
]

#slide(title: [Beacon — `setup()` Radio])[
  #cards-row(
    captions: ([Aktivasi Radio + SPI], [Parameter Modem + Daya]),
    code-src(beacon, from: 105, to: 110),
    code-src(beacon, from: 117, to: 120),
  )
  #v(0.4em)
  #note-box[
    Keempat nilai radio harus *identik* dengan seluruh Hunter. Kalau satu
    saja berbeda, paketnya tidak error — paketnya hanya *hening*.
  ]
]

#slide(title: [Beacon — `loop()`: Memancar])[
  #cards-row(
    captions: ([Jeda 200 ms + Nomor Paket], [Susun & Pancarkan]),
    code-src(beacon, from: 141, to: 149),
    code-src(beacon, from: 151, to: 153),
  )
  #v(0.4em)
  #note-box[
    `beginPacket()` menyiapkan buffer dan `print()` mengisinya, tetapi
    *`endPacket()`*-lah yang benar-benar memancarkan paket ke udara. Tiap
    paket membawa *nomor urut* dan *waktu kirimnya*.
  ]
]

// --- Hunter --------------------------------------------------------------

#slide(title: [Hunter — Library & Pin Radio])[
  #cards-row(
    captions: ([Import Library], [Pin RFM95W]),
    code-src(hunter, from: 15, to: 20),
    code-src(hunter, from: 35, to: 41),
  )
  #v(0.5em)
  #note-box[
    GPIO *15, 0, 27, 32, 18, 19,* dan *23* sudah dipakai modul radio RFM95W.
    Hunter tidak memerlukan pembagi tegangan karena tidak ada sensor yang
    tersambung padanya.
  ]
]

#slide(title: [Hunter — Menghaluskan RSSI])[
  #cards-row(
    captions: ([Median dari 5 Pembacaan], [EWMA di Atasnya]),
    code-src(hunter, from: 78, to: 84),
    code-src(hunter, from: 98, to: 104),
  )
  #v(0.4em)
  #note-box[
    RSSI di dalam ruangan melonjak sampai *10 dB* karena pantulan dinding.
    Tanpa kedua tapis ini, batang jarak pada papan skor hanya berisi derau.
  ]
]

#slide(title: [Hunter — `loop()`: Menangkap & Melapor])[
  #cards-row(
    captions: ([Baca Paket + RSSI], [Laporkan lewat Wi-Fi]),
    code-src(hunter, from: 179, to: 187),
    {
      code-src(hunter, from: 195, to: 196)
      v(0.3em)
      code-src(hunter, from: 206, to: 206)
    },
  )
  #v(0.4em)
  #note-box[
    Radio Hunter *tidak pernah memancar*. Yang keluar dari papan ini hanya
    laporan Wi-Fi ke papan skor — itulah sebabnya keenam kelompok dapat
    berburu bersamaan tanpa saling mengganggu.
  ]
]

// --- Lapisan aplikasi -----------------------------------------------------

#slide(title: [Papan Skor — Lapisan Aplikasi])[
  Satu pembacaan RSSI menempuh lima lapisan sebelum menjadi angka di layar:

  #v(0.3em)
  #set text(size: 0.92em)
  / Fisik: gelombang 920 MHz, SF7, 250 kHz — RSSI dan SNR
  / Data-link: nomor paket LoRa, paket hilang, sync word
  / Jaringan: alamat IP dari DHCP Orange Pi, satu lompatan ke gerbangnya
  / Transport: satu koneksi WebSocket di atas TCP
  / Aplikasi: peringkat, panas-dingin, dan pemenangnya

  #v(0.4em)
  #note-box[
    Papan skor di `http://192.168.4.1:8080` menampilkan kelima lapisan itu
    dengan nilai yang sedang berjalan, per kelompok.
  ]
]

// --- Penutup ---------------------------------------------------------

#slide[
  #v(1fr)
  #align(center)[
    #text(size: 1.6em, weight: "bold")[</> Babai </>] \
    #text(size: 1.6em, weight: "bold")[\#IRIS]
  ]
  #v(1fr)
]
