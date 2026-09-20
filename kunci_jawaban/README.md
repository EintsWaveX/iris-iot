# Kunci Jawaban — Jurnal Praktikum IoT IRIS

Folder ini berisi versi **lengkap** dari seluruh berkas praktikum: semua bagian
rumpang `________` sudah terisi, sehingga setiap berkas dapat langsung di-upload
atau dijalankan tanpa penyuntingan.

Struktur folder mengikuti `kode_praktikum/`:

```
kunci_jawaban/
├── id/     6 berkas top-level + folder modul4/, komentar berbahasa Indonesia
└── en/     6 berkas top-level + folder modul4/, komentar berbahasa Inggris
```

> **Catatan untuk asisten:** jangan bagikan folder ini kepada praktikan. Berkas
> yang dipakai praktikan adalah yang berada di `kode_praktikum/{id,en}/`, dan
> jurnal `.typ` menampilkan berkas dari folder tersebut — bukan dari folder ini.

## Perangkat tiap modul

Tiap modul memakai satu sensor, dan pengiriman dipicu oleh sensor itu — bukan
oleh tombol. Push Button dan LED sudah tidak dipakai lagi pada modul mana pun.

Sejak revisi ini, **Modul 2 dan Modul 3 tidak lagi memakai aktuator**: keduanya
murni pembacaan dan pencatatan. Konsekuensinya, Modul 1 dan Modul 3
sama-sama memakai potensiometer 10 kΩ. Kesamaan itu disengaja dan bukan
kekeliruan: pada Modul 1 potensiometer menggerakkan servo melalui BLE,
sedangkan pada Modul 3 nilainya hanya dipublikasikan dan dicatat, sehingga yang
dibandingkan praktikan adalah *protokolnya*, bukan sensornya. Untuk pengadaan,
artinya potensiometer dibutuhkan dua kali lipat; lihat `procurement_addendum.md`.

| Modul | Transport | Sensor | Aktuator | Pemicu kirim |
|---|---|---|---|---|
| 1 | BLE (2× ESP32 DevKit V1) | Potensiometer 10 kΩ | Servo SG90 | Sudut bergeser ≥ `DEADBAND_DEG` |
| 2 | WebSocket (ESP32 ↔ Orange Pi 4 PRO) | DHT22 | — (tidak ada) | Berkala tiap 2 detik |
| 3 | MQTT (2× Pico W, broker pada Orange Pi 4 PRO) | Potensiometer 10 kΩ | — (tidak ada) | Posisi bergeser ≥ `deadband_pct` |
| 4 | Perburuan LoRa P2P (1 Beacon tersembunyi → 6 Hunter) | — (yang diukur radionya sendiri) | — (tidak ada) | Beacon memancar tiap 200 ms |

Modul 4 adalah **permainan Perburuan LoRa**: asisten menyembunyikan **satu**
papan Beacon yang memancar terus-menerus, dan tiap kelompok memburunya dengan
satu papan Hunter yang *hanya mendengarkan*.

Inti pedagogisnya: **hanya satu radio di ruangan yang pernah memancar**,
sehingga tabrakan paket mustahil terjadi dan pembagian jatah waktu tidak
diperlukan sama sekali — bukan karena masalahnya dipecahkan, melainkan karena
topologinya membuat masalah itu tidak pernah ada.

Modul ini juga memperlihatkan **seluruh tumpukan lapisan** lewat papan skor web
yang berjalan pada Orange Pi (`modul4/`): fisik (RSSI, SNR, SF, lebar pita),
data-link (nomor paket dan paket hilang), jaringan (alamat DHCP dan gerbangnya),
transport (WebSocket di atas TCP), dan aplikasi (peringkat dan pemenangnya).

## Pengukuran waktu: kedua sisi mencetak jam dinding nyata

Sejak revisi ini, *pengirim dan penerima sama-sama mencetak jam dinding yang
sebenarnya*, sehingga praktikan mengisi **dua** kolom waktu dan mengurangkannya
sendiri untuk memperoleh delay satu arah.

| Modul | Cara jam diselaraskan | Ketelitian | Kolom round-trip |
|---|---|---|---|
| 1 | Jam PC lewat Serial, format `YYYY-MM-DD HH:MM:SS.mmm` | beberapa ms | ada (echo notify) |
| 2 | NTP pada keduanya (`configTime()` / systemd-timesyncd) | 10--50 ms | ada (ack server) |
| 3 | NTP pada kedua Pico W (`ntptime.settime()`) | 10--50 ms | tidak ada (satu arah) |
| 4 | NTP ke Orange Pi (`configTime()`), hotspot tanpa Internet | 10--50 ms | tidak ada (Hunter tidak pernah memancar) |

**Modul 1 wajib disinkronkan dari PC yang sama** (Modul 4 kini memakai NTP ke
Orange Pi, sehingga tidak lagi memerlukan langkah ini). Jalankan sekali saja
dengan dua COM port:

```powershell
.\scripts\send_time.ps1 -Port COM5,COM7
```

Skrip itu membaca jam Windows tepat sebelum menulis ke port, dan papan mencatat
`millis()` sesaat setelah barisnya terbaca, sehingga kedua papan mendarat pada
jam dinding yang sama dalam orde milidetik. Versi lama hanya mengirim detik
bulat, sehingga dua papan bisa berselisih hampir satu detik dan pengurangan
antar Serial Monitor tidak sahih; itulah sebabnya jurnal lama melarangnya.

Bila sebuah papan mencetak `"Tidak ada waktu PC diterima, timestamp memakai
waktu sejak boot."`, timestamp-nya *bukan* jam dinding. Kolom delay satu arah
pada baris itu harus dikosongkan dan hanya kolom round-trip yang boleh dinilai.

## Skema `GROUP_ID` — satu nomor untuk tiap kelompok

Seluruh modul kini aman dijalankan oleh banyak kelompok sekaligus. Polanya sama
di mana-mana: satu nomor kelompok menentukan seluruh nilai per-kelompok, dan
praktikan hanya perlu menghapus tanda `//` pada satu baris (atau mengubah satu
angka pada berkas Python). Tabel di bawah ini adalah acuan resmi yang dipakai
asisten saat membagikan nomor kelompok.

| Kelompok | Modul 1 — UUID _(4 karakter terakhir)_ | Modul 2 — `WS_PATH` | Modul 3 — topic | Modul 4 — folder program |
|---|---|---|---|---|
| 1 | `ce01` / `6501` | `/grup1` | `iris/grup1/pot` | `modul4/grup1/` |
| 2 | `ce02` / `6502` | `/grup2` | `iris/grup2/pot` | `modul4/grup2/` |
| 3 | `ce03` / `6503` | `/grup3` | `iris/grup3/pot` | `modul4/grup3/` |
| 4 | `ce04` / `6504` | `/grup4` | `iris/grup4/pot` | `modul4/grup4/` |
| 5 | `ce05` / `6505` | `/grup5` | `iris/grup5/pot` | `modul4/grup5/` |
| 6 | `ce06` / `6506` | `/grup6` | `iris/grup6/pot` | `modul4/grup6/` |
| 7 | `ce07` / `6507` | `/grup7` | `iris/grup7/pot` | `modul4/grup7/` |
| 8 | `ce08` / `6508` | `/grup8` | `iris/grup8/pot` | `modul4/grup8/` |

Enam kelompok yang dijalankan pada praktikum ini memakai baris 1 sampai 6; dua
baris sisanya disediakan agar tidak perlu menyunting berkas bila jumlah kelompok
bertambah.

Rincian tiap modul:

- **Modul 1** memuat delapan pasang `#define SERVICE_UUID` /
  `CHARACTERISTIC_UUID`, tujuh di antaranya dikomentari. Pasangan yang aktif
  harus sama pada Central dan Peripheral. Karena Central menyaring hasil
  pemindaian dengan `advertisedDevice.isAdvertisingService()`, sebuah kelompok
  secara fisik tidak akan pernah melihat papan kelompok lain.
- **Modul 2** memakai path WebSocket sebagai pembeda. Server menerima kedelapan
  path sekaligus lewat `ALLOWED_PATHS`, sehingga seluruh kelompok dapat
  tersambung ke satu Orange Pi yang sama.
- **Modul 3** menurunkan topic *dan* `mqtt_client_id` dari satu variabel
  `group_id` di bagian atas kedua berkas; pada Subscriber, `group_id` itu justru
  menjadi salah satu bagian rumpang, sehingga praktikan harus sadar bahwa
  topiknya wajib sama dengan Publisher. Asisten dapat memantau seluruh kelompok
  sekaligus dari Orange Pi dengan `mosquitto_sub -h localhost -t 'iris/+/pot' -v`.
- **Modul 4** tidak lagi memerlukan penyuntingan apa pun oleh praktikan:
  tiap kelompok menyalin foldernya sendiri di bawah `kode_praktikum/{id,en}/modul4/`,
  yang sudah memuat `#define GROUP_ID` miliknya. Ketujuh folder itu dibangkitkan
  oleh `scripts/gen_modul4.py` dari satu pasang template, sehingga tidak mungkin
  saling menyimpang; `beacon.ino` identik di semua folder karena hanya satu
  beacon yang dinyalakan. Menyunting berkas hasil bangkitan adalah pekerjaan
  sia-sia — jalankan ulang generatornya.

## Format bagian rumpang

Setiap bagian rumpang ditulis sebagai garis bawah `________` dan diberi nomor
`(1)` sampai `(6)` pada komentar di sebelah kanannya, contohnya:

```cpp
BLECharacteristic::________  // (4) Properti pengirim data otomatis tanpa ACK
```

Nomor pada komentar itulah yang menjadi acuan tabel di bawah, bukan urutan baris.
Nomor selalu berurutan `(1)` sampai `(6)` mengikuti urutan barisnya di dalam
berkas, tanpa nomor ganda; kunci jawaban dihasilkan dengan mencocokkan nomor itu,
sehingga penyimpangan dari aturan tersebut membuat proses pembangkitan gagal.

Jurnal `.typ` **tidak** mencetak berkas secara utuh. Setiap `#code-box` memanggil
`code-file(..., excerpt: true)`, yang hanya menampilkan potongan di sekitar tiap
bagian rumpang beserta nomor baris aslinya. Praktikan tetap menerima berkas
`.ino`/`.py` yang lengkap. Konsekuensinya: komentar pada berkas sumber tidak boleh
menuliskan tanda rumpang `_` delapan kali secara harfiah, karena baris itu akan
ikut terbaca sebagai bagian rumpang.

---

## Kunci bagian rumpang

### Modul 1 — Konektivitas Bluetooth Low Energy (BLE)

| Berkas | No. | Jawaban | Alasan |
|---|---|---|---|
| `modul1_ble_central.ino` | (1) | `BLEScan.h` | Header yang menyediakan `BLEScan`, dipakai Central untuk memindai Peripheral. |
| | (2) | `analogRead` | Membaca tegangan wiper potensiometer sebagai angka 0–4095. |
| | (3) | `SERVO_MAX_ANGLE` | Batas atas pemetaan `map()`; nilai ADC penuh berarti 180 derajat. |
| | (4) | `BLEUUID(SERVICE_UUID)` | Service adalah wadah characteristic, sehingga harus ditemukan lebih dahulu. |
| | (5) | `notifyCallback` | Nama fungsi didaftarkan **tanpa** tanda kurung, sama seperti callback pada Modul 3. |
| | (6) | `angle` | Sudut hasil `readAngle()` itulah yang dikirim ke Peripheral. |
| `modul1_ble_peripheral.ino` | (1) | `BLEServer.h` | Header yang menyediakan `BLEServer` dan `BLEService`. |
| | (2) | `notify` | Memantulkan nilai characteristic ke Central sebagai echo. |
| | (3) | `angle` | Hasil `constrain(data.toInt(), 0, 180)`; nilai mentah tanpa `constrain()` dapat merusak servo. |
| | (4) | `PROPERTY_NOTIFY` | Tanpa properti ini Peripheral tidak dapat memantulkan data dan kolom Delay tidak terisi. |
| | (5) | `MyCharacteristicCallbacks` | Kelas callback yang meng-override `onWrite()` di atasnya. |
| | (6) | `SERVO_PIN` | GPIO16; `attach()` juga menerima lebar pulsa min/maks SG90. |

### Modul 2 — Komunikasi WebSocket dengan Server Lokal

| Berkas | No. | Jawaban | Alasan |
|---|---|---|---|
| `modul2_websocket_server.py` | (1) | `8765` | Port server; harus sama dengan `WS_PORT` pada ESP32. |
| | (2) | `{"/grup1", "/grup2"}` | Himpunan path yang diterima; tiap kelompok menambahkan path-nya sendiri di sini. |
| | (3) | `json.loads` | Pesan datang sebagai teks JSON dan harus diurai menjadi `dict` dahulu. |
| | (4) | `"hum"` | Kunci JSON kelembapan. Harus sama persis dengan kunci yang ditulis ESP32; salah ketik di sini memunculkan `KeyError`, bukan nilai yang salah. |
| | (5) | `send` | Mengirim balasan tanda terima (nomor urut + waktu terima) kembali ke client. |
| | (6) | `serve` | Fungsi penjalan server WebSocket dengan callback `handle_client`. |
| `modul2_websocket_esp32.ino` | (1) | `WebSocketsClient.h` | Pustaka arduinoWebSockets oleh Markus Sattler. |
| | (2) | `/grup1` | Harus termasuk salah satu `ALLOWED_PATHS` pada server Python. |
| | (3) | `readTemperature` | Pasangan `readHumidity()` yang sudah terisi tepat di atasnya; keduanya mengembalikan `NAN` bila sensor gagal dibaca. |
| | (4) | `webSocketEvent` | Nama fungsi callback yang didaftarkan ke `onEvent()`, **tanpa** tanda kurung. |
| | (5) | `loop` | `webSocket.loop()` wajib dipanggil berkala agar event diproses. |
| | (6) | `sendTXT` | Mengirim bingkai teks; `send()` bukan nama metode pada pustaka ini. |

### Modul 3 — Konektivitas MQTT

| Berkas | No. | Jawaban | Alasan |
|---|---|---|---|
| `modul3_mqtt_publish.py` | (1) | `STA_IF` | Pico W berperan sebagai station yang bergabung ke Access Point. |
| | (2) | `wifi_password` | Argumen kedua `wlan.connect()`. |
| | (3) | `1883` | Nilai `listener` pada `mosquitto.conf`. |
| | (4) | `read_u16` | Metode `ADC` yang mengembalikan 0–65535, bukan `read()` yang 0–4095 pada ESP32. |
| | (5) | `deadband_pct` | Ambang perubahan. Tanpa ini derau ADC beberapa satuan sudah memicu publish terus-menerus dan Shell banjir. |
| | (6) | `publish` | Mengirim pesan `"<no. sampel> <posisi>"` ke topik tujuan. |
| `modul3_mqtt_subscribe.py` | (1) | `MQTTClient` | Kelas client yang diimpor dari `umqtt.simple`. |
| | (2) | `group_id` | Topik Subscriber diturunkan dari nomor kelompok yang sama dengan Publisher; angka berbeda berarti tidak ada pesan yang pernah masuk. |
| | (3) | `timestamp` | Waktu terima dicatat sebagai baris pertama callback, sebelum `message.decode()`, agar penguraian payload tidak ikut terhitung sebagai delay. |
| | (4) | `mqtt_subscription_callback` | Fungsi callback didaftarkan **tanpa** tanda kurung. |
| | (5) | `subscribe` | Berlangganan topik setelah koneksi terbentuk. |
| | (6) | `check_msg` | Non-blocking, sehingga loop tetap sempat mengirim ping berkala; `wait_msg()` blocking selamanya. |

### Modul 4 — Komunikasi Long Range (LoRa P2P)

| Berkas | No. | Jawaban | Alasan |
|---|---|---|---|
| `modul4/grup*/hunter.ino` | (1) | `LoRa.h` | Pustaka LoRa peer-to-peer oleh Sandeep Mistry. |
| | (2) | `WIFI_PASSWORD` | Argumen kedua `WiFi.begin()`; hotspot Orange Pi, bukan Wi-Fi kampus. |
| | (3) | `LORA_SPREADING_FACTOR` | SF7. Harus sama dengan beacon; berbeda satu tingkat saja membuat paketnya tidak terdengar. |
| | (4) | `LORA_SYNC_WORD` | Penanda pasangan, bukan alamat dan bukan pengamanan; harus sama dengan beacon. |
| | (5) | `packetRssi` | Kekuatan sinyal paket yang baru diterima, dalam dBm. Hanya dapat diukur di sisi penerima. |
| | (6) | `sendTXT` | Mengirim laporan JSON ke papan skor. `send()` bukan nama metode pada pustaka ini. |
| `modul4/grup*/beacon.ino` | (1) | `LoRa.h` | Sama dengan hunter. |
| | (2) | `NTP_SERVER` | Alamat Orange Pi itu sendiri (`192.168.4.1`). Hotspot tidak punya jalur ke Internet, jadi `pool.ntp.org` tidak akan pernah menjawab. |
| | (3) | `LORA_BANDWIDTH` | 250 kHz. Bersama SF7 inilah yang menekan waktu udara satu paket ke sekitar 20 ms. |
| | (4) | `BEACON_TX_POWER` | 10 dBm bawaan, **bukan** 20. Dayanya disetel menurut ukuran arena: 2 untuk satu ruangan, 10 untuk satu lantai gedung, 14 untuk gedung besar. |
| | (5) | `payload` | String `"<no. paket> <waktu kirim>"` yang disusun tepat di atasnya. |
| | (6) | `endPacket` | `beginPacket()` menyiapkan buffer, `endPacket()` yang benar-benar memancarkannya. |


---

## Nilai yang wajib cocok antar perangkat

Kesalahan paling sering terjadi bukan pada sintaksis, melainkan pada nilai yang
tidak cocok. Periksa bagian ini lebih dahulu saat praktikan melapor "programnya
jalan tapi tidak ada data yang masuk".

| Modul | Harus **sama** | Harus **berbeda** |
|---|---|---|
| 1 | `SERVICE_UUID` dan `CHARACTERISTIC_UUID` pada Central = pada Peripheral | `centralName` dan `peripheralName` |
| 2 | `WS_PORT` = `PORT`, `WS_PATH` ∈ `ALLOWED_PATHS` | `WS_PATH` tiap kelompok |
| 3 | `mqtt_publish_topic` = `mqtt_receive_topic`, alamat & port broker | `mqtt_client_id` tiap perangkat |
| 4 | `LORA_FREQUENCY`, `LORA_SPREADING_FACTOR`, `LORA_BANDWIDTH`, `LORA_SYNC_WORD` pada Beacon = pada seluruh Hunter | `GROUP_ID` tiap kelompok (sudah terisi di foldernya) |

## Kesalahan perangkat keras yang paling sering muncul

Sejak modul memakai sensor dan aktuator, sebagian besar laporan "tidak jalan"
berasal dari pengawatan, bukan dari kode.

- **Servo SG90 pada kabel 3V3.** Servo menarik arus kejut yang tidak sanggup
  dipasok regulator 3V3; papan akan restart berulang. Kabel merahnya harus dari
  VIN, dengan GND disatukan. Hanya Modul 1 yang masih memakai servo.
- **Papan Modul 4 dinyalakan tanpa antena.** Memancar tanpa antena
  merusak radio secara permanen, dan itu berlaku pada beacon maupun hunter.
- **Daya beacon tidak disesuaikan dengan arenanya.** Pada 20 dBm seluruh
  gedung terbaca sama kuat dan permainannya mustahil; pada 2 dBm di gedung
  besar kelompok terjauh tidak mendengar apa pun sejak awal. Setel
  `BEACON_TX_POWER` menurut ruangannya (2 / 10 / 14), dan jalankan servernya
  dengan `--arena <meter>` yang sepadan.
- **Papan skor kosong padahal hunter menyala.** Hampir selalu berarti papan itu
  belum bergabung ke hotspot `IRIS-IOT`, atau Orange Pi masih dalam mode
  client dan belum dijadikan access point (`scripts/opi_ap_on.sh`).
- **HC-SR04 tanpa pembagi tegangan.** Pin ECHO mengeluarkan 5 V dan dapat merusak
  GPIO ESP32. Pembagi 1 kΩ/2 kΩ wajib terpasang sebelum papan dinyalakan.
- **Potensiometer pada pin ADC2.** Selama radio BLE menyala hanya ADC1 yang dapat
  dibaca; GPIO34 adalah pilihan yang benar dan bersifat masukan saja.
- **DHT22 dibaca terlalu cepat.** Interval di bawah 2 detik mengembalikan `NAN`.
- **Potensiometer Modul 3 dicatu dari VBUS.** VBUS adalah 5 V, sedangkan masukan
  ADC Pico W hanya tahan 3,3 V. Kaki atasnya harus dari 3V3(OUT), pin fisik 36.
- **Wiper potensiometer bukan pada pin ADC.** Hanya GP26, GP27, dan GP28 yang
  memiliki ADC. Pada pin lain `ADC(n)` gagal saat dibuat, bukan saat dibaca,
  sehingga pesan errornya muncul jauh sebelum baris pembacaan.
- **Shell Publisher Modul 3 banjir tanpa tuas disentuh.** `deadband_pct` terisi
  0 atau 1; derau ADC beberapa satuan sudah cukup melewatinya.
- **Delay satu arah bernilai negatif atau ratusan milidetik.** Pada Modul 1 dan 4
  ini hampir selalu berarti kedua papan disinkronkan dari PC berbeda, atau salah
  satunya melewatkan jendela 10 detik `syncTimeFromSerial()`. Ulangi sinkronisasi
  keduanya dari satu PC sebelum menyalahkan kodenya.

---

## Poin yang diharapkan pada soal analisis

Soal *Analisis* bersifat terbuka, jadi bagian ini adalah rambu penilaian, bukan
jawaban tunggal.

**B.1 — Gambar alur komunikasi.** Diagram sebaiknya menampilkan peran tiap
perangkat, arah panah data, dan perantara bila ada:

- Modul 1: Central → Peripheral lewat *write*, lalu Peripheral → Central lewat
  *notify*; dua arah karena adanya pantulan (echo). Diagram yang menempatkan
  Peripheral sebagai pihak yang "mencari" berarti peran BLE masih tertukar:
  Peripheral hanya mengiklankan diri, Central-lah yang memindai dan menghubungi.
- Modul 2: Client ESP32 ↔ Server Orange Pi, satu koneksi TCP yang tetap
  terbuka. Diagram yang kuat menggambar **dua** panah pada satu garis koneksi
  yang sama — data naik, tanda terima turun — bukan dua koneksi terpisah.
  Itulah yang membuat kolom round-trip dapat diisi sama sekali.
- Modul 3: Publisher → **Broker** → Subscriber. Diagram tanpa broker di tengah
  berarti konsep pub/sub belum tertangkap. Panahnya hanya satu arah: tidak ada
  yang kembali dari Subscriber.
- Modul 4: satu Beacon → *banyak* Hunter sekaligus, satu arah, tanpa gateway
  maupun broker dan **tanpa satu pun panah balik lewat LoRa**. Diagram yang
  kuat memisahkan dua jalur yang berbeda: panah radio LoRa dari Beacon ke
  tiap Hunter, dan panah Wi-Fi dari tiap Hunter ke Orange Pi. Diagram yang
  menggambar panah LoRa dari Hunter kembali ke Beacon berarti sifat
  *receive-only* Hunter belum tertangkap — padahal justru itulah yang membuat
  keenam kelompok tidak saling bertabrakan.

**B.3 — Analisis dan korelasi dengan metodologi komunikasi.** Jawaban yang baik
mengaitkan angka yang mereka ukur dengan sifat protokolnya:

- Modul 1: delay kecil, tetapi bertingkat mengikuti *connection interval* BLE,
  sehingga sebarannya lebih terkuantisasi daripada aliran serial. Jawaban yang
  kuat menyebutkan bahwa BLE menukar throughput dengan konsumsi daya, dan bahwa
  datanya dibungkus sebagai characteristic pada sebuah service. Nilai tambah:
  menyadari bahwa `DEADBAND_DEG` adalah bentuk paling sederhana dari kompresi
  di sisi sumber — data hanya dikirim ketika benar-benar berubah.
- Modul 2: delay kecil sebab koneksi TCP sudah terbentuk sejak awal; inilah
  keunggulan WebSocket dibandingkan HTTP yang membuka koneksi baru tiap
  permintaan. Jawaban yang kuat menyadari bahwa koneksi itu *full-duplex*:
  tanda terima server pulang lewat socket yang sama, sehingga round-trip dapat
  diukur tanpa membuka koneksi kedua — hal yang tidak mungkin dilakukan HTTP
  tanpa permintaan baru. Nilai tambah: menyebut bahwa data berkala tiap 2 detik
  cocok dengan socket yang tetap terbuka, karena biaya pembentukan koneksi
  dibayar sekali saja, bukan 30 kali per menit.
- Modul 3: delay lebih besar daripada Modul 2 karena setiap pesan melewati broker
  (dua hop, bukan satu). Ini adalah harga yang dibayar untuk decoupling pub/sub.
  Jawaban yang kuat menyadari ketegangan yang sengaja dipasang pada modul ini:
  potensiometer adalah sumber sinyal *kontinu*, sedangkan pub/sub adalah pola
  *event-driven* yang menuntut kejadian diskret. `deadband_pct` itulah yang
  menjembataninya — ia mengubah putaran tuas yang mulus menjadi deretan
  kejadian, persis bentuk kompresi di sisi sumber yang juga muncul sebagai
  `DEADBAND_DEG` pada Modul 1. Deadband yang besar menghemat lalu lintas tetapi
  membuang kehalusan datanya; itulah pertukaran yang harus disebutkan.
  Perbandingan dengan Modul 2 menjadi bersih justru karena keduanya kini
  sama-sama hanya membaca dan mencatat: yang berbeda tinggal protokolnya.
- Modul 4: delay satu arah tetap lebih besar daripada Modul 2 dan 3
  karena LoRa menukar laju data dengan jangkauan; pada SF7 dengan lebar pita
  250 kHz satu paket memakan sekitar 20 milidetik di udara saja. Tiga hal yang
  dicari dari jawaban yang kuat:

  1. **Kenapa tidak ada jatah waktu lagi.** Satu penerima hanya dapat
     mendemodulasi satu kanal, sehingga dua paket yang bersamaan saling
     merusak, dan sync word tidak dapat menolong karena baru bekerja *setelah*
     demodulasi berhasil. Versi terdahulu memecahkannya dengan membagi jatah
     detik. Versi ini menghapus masalahnya sama sekali dengan membuat hanya
     satu radio yang memancar. Menghapus masalah lebih murah daripada
     memecahkannya — itulah inti pelajarannya.
  2. **RSSI bukan jarak.** Di dalam ruangan, pantulan dinding membuat RSSI
     melonjak sampai 10 dB antar paket berurutan, dan sebuah kelompok bisa
     terbaca "panas" dari seberang ruangan lewat pintu terbuka. Tabel jarak
     versus RSSI pada soal 3 seharusnya memperlihatkan hubungan yang *monoton
     tetapi tidak linier* dan sangat terganggu oleh penghalang. Jawaban yang
     menyimpulkan "RSSI berbanding lurus dengan jarak" mengabaikan datanya
     sendiri. Median + EWMA menekan deraunya, tetapi tidak mengubah RSSI
     menjadi alat ukur jarak.
  3. **Kenapa daya pancar disetel, bukan dibesarkan.** Pada 20 dBm gradien
     sinyalnya rata dan beacon mustahil ditemukan; tetapi pada daya yang
     terlalu kecil untuk arenanya, kelompok terjauh tidak mendengar apa pun
     dan permainannya mati dengan cara yang lain. Yang benar adalah
     memasangkan daya dengan ukuran ruangan. Ini contoh konkret bahwa "sinyal
     lebih kuat" tidak selalu berarti "sistem lebih baik", sekaligus bahwa
     "sekecil mungkin" juga bukan jawabannya.

  Nilai tambah: menyadari bahwa papan skor memperlihatkan seluruh lapisan
  sekaligus, dan bahwa RSSI (lapisan fisik) naik ke layar lewat Wi-Fi, IP, TCP,
  dan WebSocket — jalur yang sama sekali berbeda dari LoRa yang mengangkutnya
  di awal.
