# Adendum Pengadaan — Praktikum IoT IRIS (Revisi Multi-Kelompok)

Dokumen ini mencatat apa yang berubah pada daftar pengadaan setelah keempat modul
praktikum dirancang ulang agar aman dijalankan oleh **enam kelompok sekaligus**.
Angka pada dokumen ini dihitung untuk 6 kelompok; berkas program dan tabel di
jurnal sudah disediakan sampai 8 kelompok agar tidak perlu disunting bila
jumlahnya bertambah.

> **Revisi lanjutan — LoRaWAN dikeluarkan dari Modul 4.** Modul 4 kini
> murni Perburuan LoRa peer-to-peer; tidak ada gateway, ChirpStack, maupun
> sensor HC-SR04 pada modul ini lagi. Gateway Wio-WM1302 yang sempat
> dipertimbangkan untuk modul ini kembali menjadi barang yang tidak
> diperlukan.

Dokumen ini **tidak** membatalkan daftar sebelumnya. Bacalah sebagai daftar
perubahan terhadap daftar itu.

> **Revisi lanjutan — Modul 4 menjadi permainan Perburuan LoRa.** Modul 4
> tidak lagi memakai sensor maupun aktuator: satu papan Beacon disembunyikan
> dan enam papan Hunter memburunya dengan mendengarkan kekuatan sinyal,
> sementara papan skor web berjalan pada Orange Pi. Servo SG90 untuk papan
> Receiver bersama karena itu **tidak lagi diperlukan**, begitu pula HC-SR04
> dan pembagi tegangannya. Modul 4 memakai **seluruh 7 papan Cosmic sekaligus
> tanpa cadangan**, sehingga satu papan rusak berarti satu kelompok kehilangan
> permainannya.
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
| Modul LoRa RA-01 SX1278 | 7 | Salah pita. RA-01 SX1278 adalah komponen 433 MHz dan secara fisik tidak dapat bekerja pada `920E6`, yaitu satu-satunya nilai yang diizinkan regulasi Indonesia (AS923-2, 920–923 MHz). Selain itu papan Cosmic LoRa Aurora V2 yang sudah ada di lab (6–7 unit, seluruhnya berfungsi) sudah menutup kebutuhan Modul 4 secara penuh. |
| Modul relay 1 kanal | 6 | Modul 2 tidak lagi memakai aktuator. ESP32 hanya membaca DHT22 dan mengirimkannya; Orange Pi hanya mencatat dan membalas dengan waktu terimanya. |
| Sensor PIR HC-SR501 | 6 | Modul 3 berganti sensor menjadi potensiometer. |
| Buzzer pasif | 6 | Modul 3 tidak lagi memakai aktuator; Subscriber hanya mencatat nilai yang masuk. |
| Gateway Wio-WM1302 (SPI, 868/915 MHz) | 1 | Modul 4 tidak lagi memakai LoRaWAN; modul ini murni peer-to-peer, sehingga gateway ini kembali menjadi barang yang tidak diperlukan. |
| Wio-WM1302 Raspberry Pi Hat | 1 | Papan pembawa gateway di atas; tidak diperlukan untuk alasan yang sama. |

## 2. Yang belum pernah dipesan dan wajib ditambahkan

Komponen berikut dipakai langsung oleh berkas program yang sudah ada, tetapi
tidak pernah muncul pada daftar pengadaan mana pun.

| Barang | Jumlah | Dipakai pada |
|---|---|---|
| Servo SG90 | 6 | Modul 1 saja (satu per kelompok). Turun dari 7 sejak papan Receiver bersama Modul 4 ditiadakan. |
| Antena LoRa 920 MHz SMA | 7 | Satu per papan Cosmic. Memancar tanpa antena merusak radio, dan itu berlaku pada Beacon maupun Hunter. |
| Papan Cosmic LoRa Aurora V2 cadangan | 1--2 | **Baru.** Modul 4 memakai ketujuh papan yang ada sekaligus (1 Beacon + 6 Hunter) tanpa sisa. Tanpa cadangan, satu papan rusak berarti satu kelompok tidak dapat bermain. |
| Potensiometer 10 kΩ | 12 | Modul 1 sisi Central (6) dan Modul 3 sisi Publisher (6). Angka ini naik dari 6 sejak Modul 3 berganti sensor. |
| Breadboard | secukupnya | Penambah stok. Modul 1 memerlukan dua per kelompok; Modul 2 dan Modul 3 masing-masing hanya satu, karena hanya satu papan tiap kelompok yang memegang komponen. |

## 3. Perubahan perangkat host

Seluruh berkas program dan jurnal sudah diperbarui dari **Raspberry Pi 3B** ke
**Orange Pi 4 PRO**. Papan inilah yang menjalankan:

- server WebSocket Python pada Modul 2,
- broker Eclipse Mosquitto pada Modul 3,
- papan skor web Modul 4.

Instruksi *virtual environment* tidak berubah, karena Orange Pi 4 PRO tetap
menjalankan userland Debian/Ubuntu dan syarat `websockets >= 13` tidak terpengaruh.

## 4. Pertanyaan terbuka yang perlu dipastikan sebelum pemesanan

1. **Apakah papan Cosmic LoRa Aurora V2 yang sudah ada sudah disertai antena?**
   Bila sudah, baris antena pada bagian 2 dapat dikurangi. Bila belum, angka 7
   adalah jumlah minimum dan tidak boleh dipangkas.
2. **Apakah stok ESP32 / ESP32-S3 dan Pico W benar-benar mencapai 12 unit
   masing-masing?** Modul 1 memerlukan dua ESP32 per kelompok dan Modul 3
   memerlukan dua Pico W per kelompok. Program Modul 1 sudah menyediakan tombol
   `#define BOARD_ESP32S3` sehingga stok ESP32 klasik dan ESP32-S3 boleh
   dicampur; yang perlu dipastikan hanyalah jumlah totalnya.
