# Fact Sheet — Modul 4: Komunikasi Long Range (LoRa)

## Penjelasan singkat
LoRa (Long Range) adalah teknik modulasi radio yang memungkinkan pengiriman data kecil sejauh berkilometer dengan konsumsi daya sangat rendah — cocok untuk pertanian pintar, kota pintar, dan pemantauan lingkungan. Modul ini benar-benar baru tahun ini: mahasiswa mempraktikkan LoRa peer-to-peer menggunakan board kustom **Cosmic LoRa Aurora V2**, lalu langsung mengujinya lewat permainan perburuan langsung — satu papan Beacon tersembunyi memancar terus-menerus, dan tiap kelompok berlomba menemukannya hanya dari kekuatan sinyalnya.

## Tujuan (dari modul resmi)
1. Mengetahui teknologi modulasi Long Range (LoRa).
2. Memahami komunikasi peer-to-peer menggunakan LoRa, termasuk bagaimana kekuatan sinyal (RSSI) berhubungan dengan jarak.

## Alat yang dipakai
LoRa Module/Cosmic LoRa Aurora V2 (ESP32 + modul LoRa RFM95/SX1276), Arduino IDE/PlatformIO, antena 920 MHz per papan.

## Fakta menarik untuk caption
- Untuk Indonesia, jalur LoRa praktikum ini memakai pita frekuensi regional **AS923-2, 920–923 MHz**.
- Karena hanya satu radio di ruangan yang pernah memancar, tabrakan paket mustahil terjadi secara struktural — tidak perlu penjadwalan jatah waktu sama sekali.
- Kekuatan sinyal (RSSI) adalah penunjuk jarak yang kasar, bukan pasti: melemah mulus terhadap jarak, tetapi bisa melonjak beberapa dB hanya karena satu pantulan tembok — persis yang dirasakan mahasiswa langsung lewat permainan perburuannya.

## Sumber eksternal terverifikasi
- Latar belakang modulasi LoRa: [lora-alliance.org](https://lora-alliance.org/)
