#import "/template/template.typ": journal-cover, code-box, code-file, template, answer-lines
#show: template

#journal-cover(
  module: 1,
  topic: "KONEKTIVITAS BLUETOOTH LOW ENERGY (BLE)",
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

    [•], [ESP32 DevKit V1 (DOIT)
           atau ESP32-S3]    , [(2x)],
    [•], [Potensiometer 10 kΩ]   , [(1x)],
    [•], [Servo SG90]            , [(1x)],
    [•], [Breadboard]            , [(2x)],
    [•], [Kabel/Jumper]          , [(disesuaikan)],
  )
]

2. Buatlah rangkaian berikut menggunakan daftar alat dan komponen yang telah kalian siapkan! (POT: Potensiometer, SRV: Servo)

// Ubah nilai di bawah menjadi false selama berkas skematiknya belum tersedia.
// Selama masih false, Typst tidak pernah menyentuh berkas gambarnya, sehingga
// jurnal tetap dapat dikompilasi.
#let schematic-ready = false

#if schematic-ready {
  figure(image("/schematics/Module 1.png", height: 6cm))
} else {
  figure(
    box(
      width: 100%,
      height: 6cm,
      stroke: (paint: luma(160), thickness: 0.7pt, dash: "dashed"),
    )[
      #align(center + horizon)[
        #text(fill: luma(120))[Skema rangkaian Modul 1 (menyusul)]
      ]
    ]
  )
}

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 2, [*Central \/ Client*]),
    table.cell(colspan: 2, [*Peripheral \/ Server*]),
  ),
  [*Komponen*]     , [*Pin*] , [*Komponen*]      , [*Pin*],
  [POT (kaki kiri)], [GND]   , [SRV (coklat)]    , [GND],
  [POT (wiper)]    , [GPIO34 \/ GPIO4], [SRV (merah)]     , [VIN (5V)],
  [POT (kaki kanan)], [3V3]  , [SRV (oranye)]    , [GPIO16]
)

#pad(left: 0.5cm)[
  _Catatan: GPIO34 adalah pin masukan saja dan termasuk ADC1, satu-satunya ADC
  yang masih dapat dibaca selama radio BLE menyala. Servo SG90 menarik arus
  kejut yang tidak sanggup dipasok regulator 3V3, sehingga kabel merahnya wajib
  diambil dari pin VIN (5 V) dengan GND yang disatukan. Papan ESP32-S3 tidak
  memiliki ADC pada GPIO34, sehingga pada papan itu potensiometernya pindah ke
  GPIO4 dengan mengaktifkan `#define BOARD_ESP32S3` pada program Central._
]

#pad(left: 0.5cm)[
  *Pembagian UUID per kelompok.* Setiap kelompok memakai satu pasang UUID
  sendiri. Pada *kedua* program, hapuslah tanda `//` di depan pasangan milik
  kelompok kalian saja dan biarkan pasangan lain tetap dikomentari. Bila dua
  kelompok memakai pasangan yang sama, Central salah satu kelompok dapat
  tersambung ke Peripheral kelompok lain.
]

#table(
  columns: (auto, 1fr, 1fr),
  align: (center + horizon),

  table.header(
    [*Kelompok*],
    [*`SERVICE_UUID`*\ _(4 karakter terakhir)_],
    [*`CHARACTERISTIC_UUID`*\ _(4 karakter terakhir)_],
  ),
  [1], [`ce01`], [`6501`],
  [2], [`ce02`], [`6502`],
  [3], [`ce03`], [`6503`],
  [4], [`ce04`], [`6504`],
  [5], [`ce05`], [`6505`],
  [6], [`ce06`], [`6506`],
  [7], [`ce07`], [`6507`],
  [8], [`ce08`], [`6508`],
)

3. Sebelum menjalankan program, siapkan lingkungan kerja kalian dengan urutan berikut. Centanglah setiap langkah yang telah kalian selesaikan!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Memasang pustaka `ESP32Servo` melalui Library Manager Arduino IDE],
    [☐], [Memilih board ESP32 Dev Module pada Arduino IDE untuk kedua papan],
    [☐], [Mengaktifkan pasangan UUID kelompok kalian pada *kedua* program (lihat tabel di atas)],
    [☐], [Menghapus tanda `//` pada `#define BOARD_ESP32S3` bila memakai papan ESP32-S3],
    [☐], [Menyambungkan kabel merah servo ke VIN, bukan ke 3V3],
    [☐], [Menyinkronkan jam *kedua* papan dari PC yang sama: `.\scripts\send_time.ps1 -Port COM_A,COM_B`],
  )
]

4. Lengkapi kode program di bawah ini dengan mengisikan bagian-bagian yang rumpang. Selanjutnya (atau sambil melengkapi), ketiklah kembali bagian-bagian rumpang yang telah diisi pada aplikasi VS Code/Arduino IDE yang telah disiapkan oleh asisten jaga kalian masing-masing!

#pad(left: 0.5cm)[
  Bagian rumpang ditandai dengan garis bawah `________` dan diberi nomor `(1)`
  sampai `(6)` pada komentar di sebelah kanannya. Gantilah setiap garis bawah
  tersebut dengan kode yang benar sesuai petunjuk pada komentarnya.
  Ingat bahwa UUID service dan UUID characteristic pada sisi Central harus sama
  persis dengan nilai pada sisi Peripheral.
]

#code-box(
  title: "Central/Client Source Code — Bluetooth Low Energy (ESP32)",
  code-file("/kode_praktikum/id/modul1_ble_central.ino", excerpt: true)
)

#code-box(
  title: "Peripheral/Server Source Code — Bluetooth Low Energy (ESP32)",
  code-file("/kode_praktikum/id/modul1_ble_peripheral.ino", excerpt: true)
)

5. Catatlah konfigurasi yang kalian pakai pada tabel berikut ini! Kedua UUID inilah yang harus sama persis antara sisi Central dan sisi Peripheral agar koneksi dapat terbentuk, karena BLE menyaring lawan bicaranya berdasarkan UUID service, bukan berdasarkan nama perangkat.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Nilai yang dipakai*]),
  [Nama perangkat Central (`centralName`)]           , [],
  [Nama perangkat Peripheral (`peripheralName`)]     , [],
  [Nomor kelompok dan pasangan UUID-nya]             , [],
  [`SERVICE_UUID` _(4 karakter pertama saja)_]       , [],
  [`CHARACTERISTIC_UUID` _(4 karakter pertama saja)_], [],
  [Pin potensiometer pada Central (`POT_PIN`)]       , [],
  [Pin servo pada Peripheral (`SERVO_PIN`)]          , [],
  [Ambang perubahan sudut (`DEADBAND_DEG`)]          , [],
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

2.	Selanjutnya akan dilakukan percobaan respons waktu pengiriman data dari *Central/Client* ke *Peripheral/Server*. Bukalah terlebih dahulu *DUA (2)* Serial Monitor untuk memantau kondisi keluaran dari *Central/Client* dan *Peripheral/Server*. Setiap kali potensiometer diputar cukup jauh, Serial Monitor Central mencetak *waktu kirim* beserta sudut yang dikirim, lalu mencetak delay *round-trip* begitu pantulan (echo) dari Peripheral diterima; sementara Serial Monitor Peripheral mencetak *waktu terima* beserta sudut servo yang diterapkan. Catatlah:
   - *LIMA (5)* pasang data: waktu kirim dan sudut dari Serial Monitor Central, beserta waktu terima dan sudut servo dari Serial Monitor Peripheral
   Kedua waktu tersebut dicatat dalam format *HH:MM:SS:MS*. Hitunglah *delay satu arah* dengan mengurangkan waktu terima terhadap waktu kirim, lalu bandingkan dengan delay round-trip yang dicetak sendiri oleh Central.

#pad(left: 0.5cm)[
  _Catatan: kedua papan tidak memiliki akses Internet, sehingga jamnya
  diselaraskan dari jam PC melalui Serial. Selama *kedua papan disinkronkan dari
  PC yang sama* (jalankan `send_time.ps1` dengan dua COM port sekaligus), jam
  keduanya sama sampai ke orde milidetik dan waktu dari dua Serial Monitor yang
  berbeda *boleh* dikurangkan. Ketelitian sinkronisasi lewat Serial berkisar
  beberapa milidetik. Bila kedua papan disinkronkan dari PC yang berbeda, atau
  salah satunya gagal menerima waktu PC (tampil pesan "waktu sejak boot"),
  kolom delay satu arah menjadi tidak sahih dan hanya kolom round-trip yang
  dapat dipakai._
]

#table(
  columns: (0.78fr, 0.82fr, 1.22fr, 1.22fr, 0.99fr, 0.99fr),
  align: (center + horizon),

  table.header(
    [Percobaan\ ke-...],
    [Sudut servo\ *\[derajat\]*],
    [Waktu kirim\ _(Central)_\ *\[HH:MM:SS:MS\]*],
    [Waktu terima\ _(Peripheral)_\ *\[HH:MM:SS:MS\]*],
    [Delay satu arah\ *\[ms\]*],
    [Delay round-trip\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],
  [2.], [],[],[],[],[],
  [3.], [],[],[],[],[],
  [4.], [],[],[],[],[],
  [5.], [],[],[],[],[],
  table.cell(colspan: 4, [*Rata-rata delay (ms)*]), [], []
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
