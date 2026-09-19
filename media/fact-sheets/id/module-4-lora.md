# Fact Sheet — Modul 4: Komunikasi Long Range (LoRa)

## Penjelasan singkat
LoRa (Long Range) adalah teknik modulasi radio yang memungkinkan pengiriman data kecil sejauh berkilometer dengan konsumsi daya sangat rendah — cocok untuk pertanian pintar, kota pintar, dan pemantauan lingkungan. LoRa sendiri bukan protokol jaringan; **LoRaWAN** adalah protokol jaringan yang dibangun di atasnya, mengatur bagaimana perangkat bergabung ke jaringan, mengautentikasi, dan mengirim data lewat gateway ke server. Modul ini benar-benar baru tahun ini: mahasiswa mempraktikkan LoRa peer-to-peer maupun LoRaWAN penuh lewat platform **ANTARES** milik Telkom Indonesia, menggunakan board kustom **Cosmic LoRa Aurora V2**.

## Tujuan (dari modul resmi)
1. Mengetahui teknologi modulasi Long Range (LoRa).
2. Memahami komunikasi menggunakan LoRa, terutama LoRaWAN.

## Alat yang dipakai
LoRa Module/Cosmic LoRa Aurora V2 (ESP32 + modul LoRa RFM95/SX1276), akun ANTARES, Arduino IDE/PlatformIO, sensor & aktuator (opsional).

## Fakta menarik untuk caption
- LoRaWAN memakai topologi **star-of-stars**: satu paket data bisa diterima banyak gateway sekaligus, lalu server yang memilih & menyaring paket duplikat — bukan topologi mesh yang butuh routing rumit.
- Untuk Indonesia, LoRaWAN memakai pita frekuensi regional **AS923-2, 920–923 MHz**.
- LoRaWAN punya 3 kelas perangkat: **Class A** (paling hemat daya, downlink menunggu uplink), **Class B** (jadwal beacon, downlink lebih terprediksi), dan **Class C** (penerima nyaris selalu terbuka, latensi terendah tapi paling boros daya).
- ANTARES adalah platform IoT horizontal milik PT Telkom Indonesia Tbk, mendukung LoRaWAN, NB-IoT, dan GPRS, serta sudah mendapat sertifikasi internasional dari oneM2M.

## Sumber eksternal terverifikasi
- Standar LoRaWAN resmi: [lora-alliance.org](https://lora-alliance.org/)
- Platform ANTARES (resmi, Telkom Indonesia): [antares.id](https://antares.id/)
