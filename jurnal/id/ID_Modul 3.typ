#import "/template/template.typ": journal-cover, code-box, code-file, template, answer-lines
#show: template

#journal-cover(
  module: 3,
  topic: "KONEKTIVITAS MQTT DENGAN MICROPYTHON, RASPBERRY PI PICO W, DAN ECLIPSE MOSQUITTO",
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

    [•], [Raspberry Pi Pico W]  , [(2x)],
    [•], [Orange Pi 4 PRO]      , [(1x, sebagai broker Mosquitto)],
    [•], [Potensiometer 10 kΩ]   , [(1x)],
    [•], [Breadboard]           , [(1x)],
    [•], [Kabel/Jumper]         , [(disesuaikan)],
  )
]

2. Buatlah rangkaian berikut menggunakan daftar alat dan komponen yang telah kalian siapkan! (POT: Potensiometer)

// Ubah nilai di bawah menjadi false selama berkas skematiknya belum tersedia.
// Selama masih false, Typst tidak pernah menyentuh berkas gambarnya, sehingga
// jurnal tetap dapat dikompilasi.
#let schematic-ready = false

#if schematic-ready {
  figure(image("/schematics/Module 3.png", height: 6cm))
} else {
  figure(
    box(
      width: 100%,
      height: 6cm,
      stroke: (paint: luma(160), thickness: 0.7pt, dash: "dashed"),
    )[
      #align(center + horizon)[
        #text(fill: luma(120))[Skema rangkaian Modul 3 (menyusul)]
      ]
    ]
  )
}

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 2, [*Publisher (Pico W)*]),
    table.cell(colspan: 2, [*Subscriber (Pico W)*]),
  ),
  [*Komponen*], [*Pin*],
    table.cell(colspan: 2, [*Komponen*]),

  [POT (VCC)]  , [3V3(OUT)],
    table.cell(colspan: 2, rowspan: 3, inset: 8pt)[
      Tanpa rangkaian tambahan.      Subscriber hanya mencatat nilai yang masuk, sehingga
      Pico W kedua cukup terhubung ke jaringan Wi-Fi
      yang sama dengan Publisher.
    ],
  [POT (OUT)]  , [GP26 (ADC0)],
  [POT (GND)]  , [GND],
)

#pad(left: 0.5cm)[
  _Catatan: masukan ADC Pico W hanya tahan sampai 3,3 V, sehingga kaki atas
  potensiometer harus dicatu dari 3V3(OUT) (pin fisik 36), bukan dari VBUS yang
  bertegangan 5 V. Kaki tengahnya (wiper) wajib mendarat pada salah satu pin
  ADC, yaitu GP26, GP27, atau GP28. Broker Eclipse Mosquitto berjalan pada
  Orange Pi 4 PRO dan tidak memerlukan rangkaian tambahan. Pastikan kedua Pico W
  dan Orange Pi terhubung pada jaringan Wi-Fi yang sama._
]

#pad(left: 0.5cm)[
  *Pembagian topic per kelompok.* Tiap kelompok memakai topic sendiri, sehingga
  potensiometer kelompok kalian hanya tercatat pada Subscriber kelompok kalian.
  Ubahlah `group_id` pada *kedua* program menjadi nomor kelompok kalian; topic
  dan `mqtt_client_id` akan menyesuaikan sendiri.
]

#table(
  columns: (auto, 1.3fr, 1fr, 1fr),
  align: (center + horizon),

  table.header(
    [*Kelompok*],
    [*Topic*],
    [*`mqtt_client_id`*\ _(Publisher)_],
    [*`mqtt_client_id`*\ _(Subscriber)_],
  ),
  [1], [`iris/grup1/pot`], [`grup1-pub`], [`grup1-sub`],
  [2], [`iris/grup2/pot`], [`grup2-pub`], [`grup2-sub`],
  [3], [`iris/grup3/pot`], [`grup3-pub`], [`grup3-sub`],
  [4], [`iris/grup4/pot`], [`grup4-pub`], [`grup4-sub`],
  [5], [`iris/grup5/pot`], [`grup5-pub`], [`grup5-sub`],
  [6], [`iris/grup6/pot`], [`grup6-pub`], [`grup6-sub`],
  [7], [`iris/grup7/pot`], [`grup7-pub`], [`grup7-sub`],
  [8], [`iris/grup8/pot`], [`grup8-pub`], [`grup8-sub`],
)

#pad(left: 0.5cm)[
  _Asisten dapat memantau seluruh kelompok sekaligus dari Orange Pi dengan
  berlangganan topic bertanda plus:_ `mosquitto_sub -h localhost -t 'iris/+/pot' -v`
]

3. Sebelum menjalankan program, siapkan terlebih dahulu broker Eclipse Mosquitto pada Orange Pi dengan urutan berikut. Centanglah setiap langkah yang telah kalian selesaikan!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Memasang paket: `sudo apt update` lalu `sudo apt install mosquitto mosquitto-clients`],
    [☐], [Mengaktifkan autostart: `sudo systemctl enable mosquitto.service`],
    [☐], [Mencatat alamat IP Orange Pi dengan `hostname -I`],
    [☐], [Menyunting `/etc/mosquitto/mosquitto.conf`, menambahkan `listener 1883` dan `allow_anonymous true`],
    [☐], [Memulai ulang service: `sudo systemctl restart mosquitto.service`],
    [☐], [Memasang pustaka `micropython-umqtt.simple` pada kedua Pico W melalui Thonny],
    [☐], [Mencatu potensiometer dari 3V3(OUT), bukan VBUS, dan menyambungkan wiper-nya ke GP26],
  )
]

#pad(left: 0.5cm)[
  _Catatan: `allow_anonymous true` hanya boleh dipakai pada jaringan praktikum yang
  terisolasi. Bila asisten kalian meminta broker dengan autentikasi, gunakan
  `sudo mosquitto_passwd -c /etc/mosquitto/passwd <USERNAME>` lalu isikan
  `mqtt_username` dan `mqtt_password` pada kedua berkas program._
]

4. Lengkapi kode program di bawah ini dengan mengisikan bagian-bagian yang rumpang. Selanjutnya (atau sambil melengkapi), ketiklah kembali bagian-bagian rumpang yang telah diisi pada aplikasi Thonny yang telah disiapkan oleh asisten jaga kalian masing-masing!

#pad(left: 0.5cm)[
  Bagian rumpang ditandai dengan garis bawah `________` dan diberi nomor `(1)`
  sampai `(6)` pada komentar di sebelah kanannya. Gantilah setiap garis bawah
  tersebut dengan kode yang benar sesuai petunjuk pada komentarnya.
  Perhatikan bahwa nilai *topic* pada Publisher dan Subscriber harus sama persis,
  sedangkan `mqtt_client_id` harus berbeda untuk setiap perangkat. Nilai
  `group_id` pada kedua berkaslah yang menentukan keduanya sekaligus.
]

#code-box(
  title: "Publisher Source Code — MQTT (MicroPython, Pico W)",
  code-file("/kode_praktikum/id/modul3_mqtt_publish.py", lang: "python", excerpt: true)
)

#code-box(
  title: "Subscriber Source Code — MQTT (MicroPython, Pico W)",
  code-file("/kode_praktikum/id/modul3_mqtt_subscribe.py", lang: "python", excerpt: true)
)

5. Catatlah konfigurasi yang kalian pakai pada tabel berikut ini! Perhatikan bahwa *topic* harus sama persis pada kedua perangkat, sedangkan `mqtt_client_id` justru harus berbeda; broker akan memutus koneksi salah satu client bila keduanya memakai ID yang sama.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Nilai yang dipakai*]),
  [Alamat broker (`mqtt_host` / `hostname -I`)]        , [],
  [Port broker (`listener` pada `mosquitto.conf`)]     , [],
  [Topic (`mqtt_publish_topic` = `mqtt_receive_topic`)], [],
  [`mqtt_client_id` Publisher]                         , [],
  [`mqtt_client_id` Subscriber]                        , [],
  [Pin potensiometer pada Pico W (`ADC`)]              , [],
  [Ambang perubahan (`deadband_pct`)]                  , [],
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

2.	Selanjutnya akan dilakukan percobaan respons waktu pengiriman pesan dari *Publisher* ke *Subscriber* melalui broker MQTT. Bukalah terlebih dahulu *DUA (2)* Shell/REPL Thonny untuk memantau keluaran *Publisher* dan *Subscriber*. Putarlah tuas potensiometer perlahan-lahan: setiap kali posisinya bergeser melewati `deadband_pct`, Shell Publisher mencetak *waktu publish* beserta nomor sampel dan posisinya, sementara Shell Subscriber mencetak *waktu terima* beserta nomor sampel dan posisi yang sama. Nomor sampel itulah yang dipakai untuk memasangkan baris pada kedua Shell. Catatlah:
   - *LIMA (5)* pasang data: waktu publish, nomor sampel, dan posisi dari Shell Publisher, beserta waktu terima dari Shell Subscriber
   Kedua waktu tersebut dicatat dalam format *HH:MM:SS:MS*. Hitunglah *delay satu arah* dengan mengurangkan waktu terima terhadap waktu publish.

#pad(left: 0.5cm)[
  _Catatan: kedua Pico W menyelaraskan jamnya melalui NTP (`ntptime.settime()`)
  segera setelah terhubung ke Wi-Fi, lalu mengunci satu titik acuan milidetik
  pada pergantian detik RTC. Karena itu waktu dari kedua Shell benar-benar dapat
  dikurangkan dan hasilnya merupakan delay satu arah melalui broker. Tanpa
  langkah penyelarasan ini, RTC Pico W menyala pada 1 Januari 2021 dan kedua
  papan tidak akan pernah sepakat soal waktu. Ketelitian NTP di atas Wi-Fi
  berkisar 10--50 ms. Modul ini tidak memiliki kolom round-trip karena MQTT di
  sini bersifat satu arah: Subscriber hanya mencatat dan tidak memantulkan apa
  pun kembali._
]

#table(
  columns: (0.78fr, 0.68fr, 0.86fr, 1.22fr, 1.22fr, 1.00fr),
  align: (center + horizon),

  table.header(
    [Percobaan\ ke-...],
    [No.\ sampel],
    [Posisi\ *\[%\]*],
    [Waktu publish\ _(Publisher)_\ *\[HH:MM:SS:MS\]*],
    [Waktu terima\ _(Subscriber)_\ *\[HH:MM:SS:MS\]*],
    [Delay satu arah\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],
  [2.], [],[],[],[],[],
  [3.], [],[],[],[],[],
  [4.], [],[],[],[],[],
  [5.], [],[],[],[],[],
  table.cell(colspan: 5, [*Rata-rata delay satu arah (ms)*]), []
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
