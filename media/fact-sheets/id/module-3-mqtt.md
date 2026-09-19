# Fact Sheet — Modul 3: Konektivitas MQTT dengan MicroPython, Raspberry Pi Pico W, dan Eclipse Mosquitto

## Penjelasan singkat
MQTT adalah protokol komunikasi **publish-subscribe**: perangkat tidak mengirim data langsung ke perangkat lain, melainkan "mempublikasikan" pesan ke sebuah topik lewat **broker**, dan perangkat lain yang "berlangganan (subscribe)" topik tersebut akan menerima pesan itu. Modul ini memakai **Raspberry Pi Pico W** yang diprogram dengan **MicroPython**, terhubung ke broker **Eclipse Mosquitto** yang dijalankan secara lokal — menggantikan Adafruit IO yang dipakai tahun lalu.

## Tujuan (dari modul resmi)
1. Mengetahui protokol MQTT.
2. Memahami proses komunikasi protokol MQTT dengan broker lokal.
3. Memahami implementasi IoT menggunakan Python pada mikrokontroler Raspberry Pi Pico W.

## Alat yang dipakai
Raspberry Pi Pico W, Thonny (IDE MicroPython), server lokal (Raspberry Pi 3B) untuk broker Mosquitto.

## Fakta menarik untuk caption
- MQTT dirancang agar sangat ringan — cocok untuk perangkat dengan daya dan bandwidth terbatas, alasan utama kenapa protokol ini jadi favorit di dunia IoT.
- Pola publish-subscribe membuat satu sensor bisa "didengar" banyak aplikasi sekaligus tanpa sensor itu tahu siapa saja yang mendengarkan.
- Eclipse Mosquitto adalah broker open-source yang mendukung MQTT versi 3.1, 3.1.1, dan 5.0 — cukup ringan untuk dijalankan di single-board computer seperti Raspberry Pi.
- Raspberry Pi Pico W dijual dengan harga resmi hanya sekitar $6, tapi sudah dilengkapi WiFi dan Bluetooth 5.2.

## Sumber eksternal terverifikasi
- Broker resmi Eclipse Mosquitto: [mosquitto.org](https://mosquitto.org/)
- Spesifikasi resmi Raspberry Pi Pico W: [raspberrypi.com/products/raspberry-pi-pico](https://www.raspberrypi.com/products/raspberry-pi-pico/)
