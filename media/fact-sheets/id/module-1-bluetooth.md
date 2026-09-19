# Fact Sheet — Modul 1: Konektivitas Bluetooth

## Penjelasan singkat
Bluetooth adalah media komunikasi nirkabel jarak dekat yang menghubungkan dua perangkat langsung tanpa server pusat (peer-to-peer). Modul ini mengajarkan dua jalur: **Bluetooth Classic** (pola Master/Slave, mengirim data lewat "serial" seolah-olah kabel) dan **Bluetooth Low Energy/BLE** (pola Central/Peripheral, mengirim data lewat struktur GATT yang lebih hemat daya) — BLE adalah materi baru yang ditambahkan tahun ini.

## Tujuan (dari modul resmi)
1. Mengetahui teknologi Bluetooth.
2. Memahami proses komunikasi antarperangkat menggunakan Bluetooth.
3. Mengimplementasikan Bluetooth untuk sistem IoT.

## Alat yang dipakai
ESP32, Arduino IDE/PlatformIO, sensor & aktuator (opsional).

## Fakta menarik untuk caption
- Nama "Bluetooth" diambil dari julukan Raja Viking Harald "Bluetooth" Gormsson, yang menyatukan Denmark dan Norwegia pada abad ke-10 — nama ini dipilih sebagai simbol "menyatukan" berbagai perangkat lewat satu teknologi nirkabel. (Sumber resmi Bluetooth SIG di bawah.)
- Bluetooth pertama kali dikembangkan tim insinyur Ericsson pada 1990-an, dipimpin Jaap Haartsen.
- Bluetooth Low Energy (BLE) pertama kali diperkenalkan lewat Bluetooth 4.0 (2010) — dirancang khusus agar perangkat bisa bertahan lama dengan baterai kecil, cocok untuk sensor IoT.
- Bluetooth 6.0 (2024) memperkenalkan Channel Sounding, yang memungkinkan pencarian posisi antarperangkat hingga akurasi jarak sentimeter.

## Sumber eksternal terverifikasi
- Asal-usul nama Bluetooth (situs resmi Bluetooth SIG): [bluetooth.com/bluetooth-origin](https://www.bluetooth.com/bluetooth-origin/)
- Spesifikasi mikrokontroler yang dipakai (ESP32, resmi Espressif): [espressif.com/en/products/socs/esp32](https://www.espressif.com/en/products/socs/esp32)
