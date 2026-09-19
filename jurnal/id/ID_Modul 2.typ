#import "/template/template.typ": journal-cover, code-box, code-file, template, answer-lines
#show: template

#journal-cover(
  module: 2,
  topic: "KOMUNIKASI WEBSOCKET DENGAN SERVER LOKAL",
  lang: "id"
)

#pagebreak()

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Rangkaian dan Sistem

1. Siapkan komponen berikut:
#pad(left: 0.5cm)[
  #table(
    columns: (auto, auto, 1fr),
    stroke: none,

    [•], [ESP32 DevKit V1 (DOIT)], [(1x)],
    [•], [Orange Pi 4 PRO]       , [(1x, sebagai server lokal)],
    [•], [Sensor DHT22]          , [(1x)],
    [•], [Breadboard]            , [(1x)],
    [•], [Kabel/Jumper]          , [(disesuaikan)],
  )
]

2. Buatlah rangkaian berikut menggunakan daftar alat dan komponen yang telah kalian siapkan! (DHT: Sensor DHT22)

// Ubah nilai di bawah menjadi false selama berkas skematiknya belum tersedia.
// Selama masih false, Typst tidak pernah menyentuh berkas gambarnya, sehingga
// jurnal tetap dapat dikompilasi.
#let schematic-ready = false

#if schematic-ready {
  figure(image("/schematics/Module 2.png", height: 6cm))
} else {
  figure(
    box(
      width: 100%,
      height: 6cm,
      stroke: (paint: luma(160), thickness: 0.7pt, dash: "dashed"),
    )[
      #align(center + horizon)[
        #text(fill: luma(120))[Skema rangkaian Modul 2 (menyusul)]
      ]
    ]
  )
}

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 2, [*Client (ESP32 DevKit V1 (DOIT))*]),
    table.cell(colspan: 2, [*Server (Orange Pi 4 PRO)*]),
  ),
  [*Komponen*], [*Pin*],
    table.cell(colspan: 2, [*Komponen*]),

  [DHT (VCC)]  , [3V3],
    table.cell(colspan: 2, rowspan: 3, inset: 8pt)[
      Tanpa rangkaian tambahan.\
      Server WebSocket berjalan sepenuhnya sebagai perangkat lunak,
      sehingga Orange Pi cukup terhubung ke jaringan Wi-Fi
      yang sama dengan ESP32.
    ],
  [DHT (DATA)] , [GPIO16],
  [DHT (GND)]  , [GND],
)

#pad(left: 0.5cm)[
  _Catatan: DHT22 tidak boleh dibaca lebih cepat dari sekali tiap 2 detik;
  interval yang lebih rapat mengembalikan `NAN`. Modul ini tidak memakai
  aktuator apa pun: ESP32 hanya membaca dan mengirim, sedangkan Orange Pi hanya
  mencatat dan membalas dengan waktu terimanya sendiri._
]

#pad(left: 0.5cm)[
  *Pembagian path per kelompok.* Server membedakan papan tiap kelompok dari
  path-nya, sehingga beberapa kelompok dapat mengirim ke satu server yang sama
  tanpa saling mengganggu. Pakailah path milik kelompok kalian saja.
]

#table(
  columns: (auto, 1fr, auto, 1fr),
  align: (center + horizon),

  table.header([*Kelompok*], [*`WS_PATH`*], [*Kelompok*], [*`WS_PATH`*]),
  [1], [`/grup1`], [5], [`/grup5`],
  [2], [`/grup2`], [6], [`/grup6`],
  [3], [`/grup3`], [7], [`/grup7`],
  [4], [`/grup4`], [8], [`/grup8`],
)

3. Sebelum menjalankan program, siapkan lingkungan kerja kalian dengan urutan berikut. Centanglah setiap langkah yang telah kalian selesaikan!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Memasang pustaka `DHT sensor library` dan `Adafruit Unified Sensor` melalui Library Manager Arduino IDE],
    [☐], [Memasang pustaka `WebSockets` karya Markus Sattler melalui Library Manager Arduino IDE],
    [☐], [Menyiapkan lingkungan virtual `websockets` pada Orange Pi (lihat kotak di bawah)],
    [☐], [Mencatat alamat IP Orange Pi dengan `hostname -I`],
    [☐], [Memakai path milik kelompok kalian pada `WS_PATH` (lihat tabel di atas)],
    [☐], [Menyamakan nilai port dan path pada kedua berkas program],
  )
]

#pad(left: 0.5cm)[
  _Kebutuhan paket: modul `websockets.asyncio.server` baru tersedia pada
  `websockets` versi 13 ke atas, sedangkan paket bawaan sistemnya umumnya
  masih lebih lama._

  #v(0.2cm)
  ```bash
  python3 -m venv ~/venv-iris
  source ~/venv-iris/bin/activate
  pip install "websockets>=13"
  ```
]

4. Lengkapi kode program di bawah ini dengan mengisikan bagian-bagian yang rumpang. Selanjutnya (atau sambil melengkapi), ketiklah kembali bagian-bagian rumpang yang telah diisi pada aplikasi VS Code/Arduino IDE (untuk ESP32) dan editor teks pada Orange Pi (untuk server Python) yang telah disiapkan oleh asisten jaga kalian masing-masing!

#pad(left: 0.5cm)[
  Bagian rumpang ditandai dengan garis bawah `________` dan diberi nomor `(1)`
  sampai `(6)` pada komentar di sebelah kanannya. Gantilah setiap garis bawah
  tersebut dengan kode yang benar sesuai petunjuk pada komentarnya.
  Perhatikan bahwa nilai *port* dan *path* pada server Python harus sama persis
  dengan nilai yang dipakai pada kode ESP32.
]

#code-box(
  title: "Server Source Code — WebSocket (Python, Orange Pi)",
  code-file("/kode_praktikum/id/modul2_websocket_server.py", lang: "python", excerpt: true)
)

#code-box(
  title: "Client Source Code — WebSocket (ESP32)",
  code-file("/kode_praktikum/id/modul2_websocket_esp32.ino", excerpt: true)
)

5. Catatlah konfigurasi yang kalian pakai pada tabel berikut ini! Ketiga nilai teratas harus sama persis antara berkas server Python dan berkas ESP32, jika tidak maka koneksi WebSocket tidak akan pernah terbentuk.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Nilai yang dipakai*]),
  [Alamat IP Orange Pi (`WS_HOST` / `hostname -I`)] , [],
  [Port server (`PORT` / `WS_PORT`)]                   , [],
  [Path WebSocket (`WS_PATH`)]                         , [],
  [Nama jaringan Wi-Fi (`WIFI_SSID`)]                  , [],
  [Pin data DHT22 pada ESP32 (`DHT_PIN`)]              , [],
  [Jeda pengambilan sampel (`SAMPLE_INTERVAL_MS`)]     , [],
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Analisis

1.	Gambarkanlah alur komunikasi yang diterapkan pada sistem yang telah kalian kerjakan!

#box(
  width: 100%,
  height: 8cm,
  stroke: 1pt + black,
)[]

2.	Selanjutnya akan dilakukan percobaan respons waktu pembacaan data yang dikirim melalui *Client (ESP32)* ke *Server (Orange Pi)*. Bukalah terlebih dahulu Serial Monitor pada ESP32 dan terminal server Python pada Orange Pi. Setiap 2 detik ESP32 mencetak *waktu kirim* beserta nomor urut dan pembacaan DHT22, sementara terminal Orange Pi mencetak *waktu terima* beserta nomor urut, suhu, dan kelembapan yang sama. Nomor urut itulah yang dipakai untuk memasangkan baris pada kedua tampilan. Balasan server tidak membawa perintah apa pun, hanya nomor urut dan waktu terima pada kolom `at`, sehingga kedua waktu tetap dapat dibaca ulang dari Serial Monitor ESP32 saja. Catatlah:
   - *LIMA (5)* pasang data: waktu kirim, suhu, dan kelembapan dari Serial Monitor ESP32, beserta waktu terima dari terminal Orange Pi
   Kedua waktu tersebut dicatat dalam format *HH:MM:SS:MS*. Hitunglah *delay satu arah* dengan mengurangkan waktu terima terhadap waktu kirim, lalu bandingkan dengan delay round-trip yang dicetak sendiri oleh ESP32.

#pad(left: 0.5cm)[
  _Catatan: ESP32 dan Orange Pi berada pada satu jaringan Wi-Fi, sehingga jam
  keduanya diselaraskan melalui NTP (`configTime()` pada ESP32, systemd-timesyncd
  pada Orange Pi). Karena itu waktu dari kedua tampilan benar-benar dapat
  dikurangkan dan hasilnya merupakan delay satu arah yang sesungguhnya.
  Ketelitian NTP di atas Wi-Fi berkisar 10--50 ms, jadi delay satu arah yang
  kalian hitung wajar bila tidak persis setengah dari delay round-trip._
]

#table(
  columns: (0.72fr, 0.62fr, 0.86fr, 1.14fr, 1.14fr, 0.90fr, 0.94fr),
  align: (center + horizon),

  table.header(
    [Percobaan\ ke-...],
    [Suhu\ *\[°C\]*],
    [Kelembapan\ *\[%\]*],
    [Waktu kirim\ _(ESP32)_\ *\[HH:MM:SS:MS\]*],
    [Waktu terima\ _(Orange Pi)_\ *\[HH:MM:SS:MS\]*],
    [Delay satu arah\ *\[ms\]*],
    [Delay round-trip\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],[],
  [2.], [],[],[],[],[],[],
  [3.], [],[],[],[],[],[],
  [4.], [],[],[],[],[],[],
  [5.], [],[],[],[],[],[],
  table.cell(colspan: 5, [*Rata-rata delay (ms)*]), [], []
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

3. Tuliskanlah *analisis* kalian pada sistem yang telah kalian eksperimentasikan sebelumnya pada bagian pengisian berikut ini!
(Berikan juga *hubungan/korelasinya* dengan menerapkan *metodologi komunikasi* yang sedang kalian pelajari pada modul ini; tidak harus penuh!)

#answer-lines(count: 6)

#pagebreak()

= Saran dan Masukan

1. Asisten
#answer-lines(count: 3)
2. Laboratorium
#answer-lines(count: 3)

#v(1fr)

#align(center + bottom)[
  #text(size: 14pt, weight: "bold")[</> Babai </>]\
  #text(size: 14pt, weight: "bold")[\#IRIS]
]
