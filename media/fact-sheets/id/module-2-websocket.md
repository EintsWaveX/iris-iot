# Fact Sheet — Modul 2: Komunikasi WebSocket dengan Server Lokal

## Penjelasan singkat
Sebelum bicara WebSocket, mahasiswa lebih dulu memahami HTTP — protokol "tanya-jawab" klasik di balik web (request dari klien, response dari server, lalu koneksi selesai). Masalahnya, HTTP kurang cocok untuk data real-time yang terus mengalir dari sensor. **WebSocket** menjawab itu: sekali koneksi terbuka, data bisa mengalir dua arah secara terus-menerus tanpa harus request ulang setiap saat. Tahun ini modul direvisi agar ESP32/ESP8266 terhubung ke **server lokal berbasis Raspberry Pi 3B** — bukan lagi ke Firebase/Kodular seperti tahun sebelumnya.

## Tujuan (dari modul resmi)
1. Mengetahui protokol HTTP (Hypertext Transfer Protocol).
2. Memahami komunikasi protokol HTTP.
3. Memahami penggunaan WebSocket dalam konteks sistem IoT.

## Alat yang dipakai
ESP32/ESP8266, server lokal (Raspberry Pi 3B), Arduino IDE/PlatformIO, sensor & aktuator (opsional).

## Fakta menarik untuk caption
- HTTP klasik memutus koneksi setiap kali selesai satu request — itu sebabnya dashboard IoT yang mengandalkan HTTP polling terasa "nge-lag" untuk data real-time.
- WebSocket menjaga satu koneksi tetap terbuka, sehingga microcontroller bisa mengirim data secepat sensor membaca — cocok untuk monitoring live.
- Dengan pindah ke server lokal, mahasiswa belajar membangun infrastruktur IoT-nya sendiri dari nol, bukan cuma memakai layanan cloud siap pakai.

## Sumber eksternal terverifikasi
- ESP32/ESP8266 sebagai perangkat klien (resmi Espressif): [espressif.com/en/products/socs/esp32](https://www.espressif.com/en/products/socs/esp32)
