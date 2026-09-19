# Adendum Pengadaan — Praktikum IoT IRIS (Revisi Multi-Kelompok)

Dokumen ini mencatat apa yang berubah pada daftar pengadaan setelah keempat modul
praktikum dirancang ulang agar aman dijalankan oleh **enam kelompok sekaligus**,
dan setelah LoRaWAN dikembalikan ke Modul 4 sebagai *Part B*. Angka pada dokumen
ini dihitung untuk 6 kelompok; berkas program dan tabel di jurnal sudah
disediakan sampai 8 kelompok agar tidak perlu disunting bila jumlahnya bertambah.

Dokumen ini **tidak** membatalkan daftar sebelumnya. Bacalah sebagai daftar
perubahan terhadap daftar itu.

> **Revisi lanjutan — Modul 4 Part A menjadi permainan Perburuan LoRa.**
> Part A tidak lagi memakai sensor maupun aktuator: satu papan Beacon
> disembunyikan dan enam papan Hunter memburunya dengan mendengarkan kekuatan
> sinyal, sementara papan skor web berjalan pada Orange Pi. Servo SG90 untuk
> papan Receiver bersama karena itu **tidak lagi diperlukan**. HC-SR04 dan
> pembagi tegangannya tetap dipakai, tetapi kini hanya oleh Part B. Modul 4
> memakai **seluruh 7 papan Cosmic sekaligus tanpa cadangan**, sehingga satu
> papan rusak berarti satu kelompok kehilangan permainannya.
>
> **Revisi lanjutan — Modul 2 dan Modul 3 disederhanakan.** Kedua modul itu kini
> murni pembacaan dan pencatatan, tanpa aktuator sama sekali: Modul 2 hanya
> membaca DHT22 (suhu dan kelembapan) dan Modul 3 hanya membaca potensiometer.
> Modul relay, sensor PIR HC-SR501, dan buzzer pasif karena itu **tidak lagi
> diperlukan**, sedangkan kebutuhan potensiometer menjadi dua kali lipat karena
> Modul 1 dan Modul 3 sama-sama memakainya. Modul 1 dan Modul 4 tidak berubah.

---

## 1. Yang dibatalkan

| Barang | Jumlah pada daftar | Alasan pembatalan |
|---|---|---|
| Modul LoRa RA-01 SX1278 | 7 | Salah pita. RA-01 SX1278 adalah komponen 433 MHz dan secara fisik tidak dapat bekerja pada `920E6`, yaitu satu-satunya nilai yang diizinkan regulasi Indonesia (AS923-2, 920–923 MHz). Selain itu papan Cosmic LoRa Aurora V2 yang sudah ada di lab (6–7 unit, seluruhnya berfungsi) sudah menutup kebutuhan Modul 4 secara penuh, baik Part A maupun Part B. |
| Modul relay 1 kanal | 6 | Modul 2 tidak lagi memakai aktuator. ESP32 hanya membaca DHT22 dan mengirimkannya; Orange Pi hanya mencatat dan membalas dengan waktu terimanya. |
| Sensor PIR HC-SR501 | 6 | Modul 3 berganti sensor menjadi potensiometer. |
| Buzzer pasif | 6 | Modul 3 tidak lagi memakai aktuator; Subscriber hanya mencatat nilai yang masuk. |

## 2. Yang dipertahankan — dan kini benar-benar terpakai

| Barang | Jumlah | Keterangan |
|---|---|---|
| Gateway Wio-WM1302 (SPI, 868/915 MHz) | 1 | Sempat menjadi barang menganggur ketika Modul 4 dipangkas menjadi peer-to-peer saja. Dengan hadirnya *Part B*, gateway inilah pusat modulnya. |
| Wio-WM1302 Raspberry Pi Hat | 1 | Papan pembawa gateway. Lihat catatan risiko pada bagian 5. |

## 3. Yang belum pernah dipesan dan wajib ditambahkan

Komponen berikut dipakai langsung oleh berkas program yang sudah ada, tetapi
tidak pernah muncul pada daftar pengadaan mana pun.

| Barang | Jumlah | Dipakai pada |
|---|---|---|
| Servo SG90 | 6 | Modul 1 saja (satu per kelompok). Turun dari 7 sejak papan Receiver bersama Modul 4 Part A ditiadakan. |
| Sensor ultrasonik HC-SR04 | 6 | Modul 4 **Part B saja** (satu per kelompok); Part A tidak memakai sensor |
| Resistor 1 kΩ | 10 | Pembagi tegangan jalur ECHO HC-SR04 (wajib; tanpa ini GPIO ESP32 rusak) |
| Resistor 2 kΩ | 10 | Pasangan pembagi tegangan di atas |
| Antena LoRa 920 MHz SMA | 7 | Satu per papan Cosmic. Memancar tanpa antena merusak radio, dan itu berlaku pada Beacon maupun Hunter. |
| Papan Cosmic LoRa Aurora V2 cadangan | 1--2 | **Baru.** Modul 4 Part A memakai ketujuh papan yang ada sekaligus (1 Beacon + 6 Hunter) tanpa sisa. Tanpa cadangan, satu papan rusak berarti satu kelompok tidak dapat bermain. |
| Potensiometer 10 kΩ | 12 | Modul 1 sisi Central (6) dan Modul 3 sisi Publisher (6). Angka ini naik dari 6 sejak Modul 3 berganti sensor. |
| Breadboard | secukupnya | Penambah stok. Modul 1 memerlukan dua per kelompok; Modul 2 dan Modul 3 masing-masing hanya satu, karena hanya satu papan tiap kelompok yang memegang komponen. |

## 4. Perubahan perangkat host

Seluruh berkas program dan jurnal sudah diperbarui dari **Raspberry Pi 3B** ke
**Orange Pi 4 PRO**. Papan inilah yang menjalankan:

- server WebSocket Python pada Modul 2,
- broker Eclipse Mosquitto pada Modul 3,
- ChirpStack dan program pemantau gateway pada Modul 4 Part B.

Instruksi *virtual environment* tidak berubah, karena Orange Pi 4 PRO tetap
menjalankan userland Debian/Ubuntu dan syarat `websockets >= 13` tidak terpengaruh.

## 5. Pertanyaan terbuka yang perlu dipastikan sebelum pemesanan

1. **Apakah papan Cosmic LoRa Aurora V2 yang sudah ada sudah disertai antena?**
   Bila sudah, baris antena pada bagian 3 dapat dikurangi. Bila belum, angka 7
   adalah jumlah minimum dan tidak boleh dipangkas.
2. **Apakah stok ESP32 / ESP32-S3 dan Pico W benar-benar mencapai 12 unit
   masing-masing?** Modul 1 memerlukan dua ESP32 per kelompok dan Modul 3
   memerlukan dua Pico W per kelompok. Program Modul 1 sudah menyediakan tombol
   `#define BOARD_ESP32S3` sehingga stok ESP32 klasik dan ESP32-S3 boleh
   dicampur; yang perlu dipastikan hanyalah jumlah totalnya.
3. **Apakah driver `sx1302_hal` milik Wio-WM1302 Pi Hat dapat mengikat ke header
   40 pin Orange Pi 4 PRO?** Papan itu dirancang sebagai HAT Raspberry Pi, dan
   inilah satu-satunya risiko perangkat keras pada Part B yang tidak dapat
   dipastikan dari meja. Bila ikatannya gagal, pilihannya ada dua: menjalankan
   gateway dari sebuah Raspberry Pi terpisah sementara ChirpStack tetap di Orange
   Pi, atau memakai gateway LoRaWAN varian USB/Ethernet. Sebaiknya diuji lebih
   dahulu sebelum jadwal praktikum ditetapkan.
