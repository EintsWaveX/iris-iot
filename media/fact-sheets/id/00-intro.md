# Fact Sheet — Pengantar: IRIS Laboratory & Internet of Things

## Tentang IRIS Laboratory
IRIS (**I**oT **R**untime and **I**ntegration **S**ystem Laboratory) adalah laboratorium di bawah divisi **ASIC (Automation System and Intelligence Control)**, Program Studi S1 Teknik Elektro, Fakultas Teknik Elektro, Telkom University — berlokasi di P304, Gedung Deli. Setiap Semester Ganjil, IRIS menyusun dan menjalankan **Modul Praktikum Pemrograman Perangkat IoT** untuk mahasiswa Teknik Elektro.

Modul tahun 2026/2027 ini disusun oleh tim asisten IRIS dan direview langsung oleh Kepala Laboratorium (Dr. Junartho Halomoan, S.T., M.T.) dan Pembina Laboratorium (Istiqomah, S.T., M.Sc).

## Apa itu Internet of Things (IoT)?
IoT adalah konsep yang menghubungkan objek fisik, sensor, aktuator, perangkat komputasi, dan aplikasi melalui jaringan agar perangkat dapat mengumpulkan, bertukar, serta memanfaatkan data — baik secara lokal maupun lewat internet.

Arsitektur IoT yang dipakai dalam modul ini terdiri dari 3 lapisan:
1. **Physical/Perception Layer** — sensor untuk akuisisi data, aktuator untuk menjalankan tindakan.
2. **Network Layer** — menghubungkan perangkat lewat jaringan lokal, gateway, atau internet.
3. **Application Layer** — pemrosesan data, penyimpanan, analitik, dan antarmuka pengguna (dashboard, aplikasi).

## 4 Modul Praktikum Tahun Ini
Praktikum ini membawa mahasiswa dari komunikasi jarak sangat dekat sampai jarak sangat jauh:

| Modul | Topik | Highlight revisi 2026/2027 |
|---|---|---|
| 1 | Konektivitas Bluetooth | Penambahan materi **Bluetooth Low Energy (BLE)** |
| 2 | Komunikasi WebSocket dengan Server Lokal | Pindah dari Firebase/Kodular ke **server lokal HTTP + WebSocket** |
| 3 | Konektivitas MQTT | Broker pindah dari Adafruit IO ke **Eclipse Mosquitto lokal** |
| 4 | Komunikasi Long Range (LoRa) | Modul baru: permainan **Perburuan LoRa** langsung — melacak beacon tersembunyi hanya dari kekuatan sinyalnya |

## Fakta menarik untuk caption
- Praktikum ini mencakup rentang komunikasi nirkabel dari **~10 meter (Bluetooth)** sampai **berkilometer-kilometer (LoRa)** — semuanya dipelajari dalam satu semester.
- Tiga dari empat modul direvisi tahun ini agar mahasiswa langsung bekerja dengan infrastruktur lokal (server sendiri, broker sendiri) alih-alih bergantung penuh pada layanan pihak ketiga.

## Sumber eksternal terverifikasi
- Latar belakang modulasi LoRa: [LoRa Alliance](https://lora-alliance.org/)
- Spesifikasi resmi ESP32 (mikrokontroler utama praktikum): [Espressif — ESP32](https://www.espressif.com/en/products/socs/esp32)
