# Procurement Addendum — Praktikum IoT IRIS

Berdasarkan tabel perangkat pada `README.md`, berkas ini menghitung kebutuhan
komponen untuk **6 kelompok aktif** (baris 1–6 pada skema `GROUP_ID`). Modul 4
Part A memakai topologi banyak-Transmitter/satu-Receiver, sehingga jumlah
Cosmic pada modul itu tidak mengikuti pola "2 papan per kelompok" seperti
modul lainnya.

## Ringkasan per modul

| Modul | Papan per kelompok | Papan bersama | Jumlah kelompok | Total papan modul |
|---|---|---|---|---|
| 1 (BLE) | 2× ESP32 DevKit V1 | – | 6 | 12 ESP32 DevKit V1 |
| 2 (WebSocket) | 1× ESP32 DevKit V1 | 1× Orange Pi 4 PRO (dipakai bersama semua modul) | 6 | 6 ESP32 DevKit V1 |
| 3 (MQTT) | 2× Pico W (hanya Publisher yang memegang komponen) | – (broker di Orange Pi yang sama) | 6 | 12 Pico W |
| 4 Part A (Perburuan LoRa) | 1× Cosmic (Hunter) | 1× Cosmic (Beacon tersembunyi) | 6 | 7 Cosmic |
| 4 Part B (LoRaWAN) | 1× Cosmic (node) | 1× gateway Wio-WM1302 + Orange Pi (ChirpStack) | 6 | 6 Cosmic + 1 gateway |

> Modul 4 Part A dan Part B memakai board Cosmic yang sama fisiknya — cukup
> re-flash firmware berbeda saat berpindah bagian, jadi **tidak perlu Cosmic
> terpisah untuk tiap Part** selama sesi tidak berjalan bersamaan.

## Sensor & aktuator per kelompok

| Modul | Sensor (×kelompok) | Aktuator (×kelompok) |
|---|---|---|
| 1 | Potensiometer 10 kΩ | Servo SG90 |
| 2 | DHT22 | — (tidak ada; murni baca dan catat) |
| 3 | Potensiometer 10 kΩ | — (tidak ada; murni baca dan catat) |
| 4 Part A | — (tidak ada; yang diukur radionya sendiri) | — (tidak ada) |
| 4 Part B | HC-SR04 (di node) | — (tidak ada) |

> Modul 1 dan Modul 3 sengaja memakai sensor yang sama. Yang dibandingkan
> praktikan pada kedua modul itu adalah protokolnya (BLE versus MQTT), bukan
> sensornya, sehingga potensiometer harus dihitung **dua kali**.

Total untuk 6 kelompok:
- Potensiometer 10 kΩ: 12 (6 Modul 1 + 6 Modul 3)
- Servo SG90 (Modul 1): 6
- DHT22: 6
- HC-SR04: 6 (satu per node Modul 4 **Part B**; Part A tidak memakai sensor)

## Perangkat keras pendukung (wajib, per papan yang relevan)

- Pembagi tegangan 1 kΩ/2 kΩ: satu set per HC-SR04 → **6 set** (Modul 4 **Part B**). Modul 1, 2, 3 dan Modul 4 Part A tidak perlu karena tidak ada sinyal 5 V yang masuk ke GPIO.
- Kabel jumper male-female dan male-male secukupnya untuk pengawatan servo, potensiometer, dan DHT22.
- Potensiometer Modul 3 wajib dicatu dari 3V3(OUT) Pico W (pin fisik 36), bukan VBUS: masukan ADC-nya hanya tahan 3,3 V.
- Suplai 5 V (bukan 3V3) untuk tiap Servo SG90 — pastikan tersedia jalur VIN/5V di setiap board yang memegang servo (Modul 1: 6 papan Peripheral; Modul 4: 1 papan Receiver).

## Infrastruktur bersama (tidak dikalikan jumlah kelompok)

- 1× Orange Pi 4 PRO — menjalankan server WebSocket (Modul 2), broker Mosquitto (Modul 3), dan ChirpStack (Modul 4 Part B).
- 1× gateway Wio-WM1302 — untuk Modul 4 Part B.
- 1× Cosmic sebagai Beacon tersembunyi — untuk Modul 4 Part A.
- Orange Pi yang sama dijalankan sebagai **access point** `IRIS-HUNT` selama Part A (lihat `scripts/opi_ap_on.sh`), sehingga Part A dan Part B tidak dapat berjalan pada sesi yang sama.
- 1× PC yang menjalankan `scripts/send_time.ps1` untuk sinkronisasi jam Modul 1 (harus PC yang sama untuk kedua papan dalam satu sesi). Modul 4 Part A tidak memerlukannya: seluruh papannya menyelaraskan jam melalui NTP ke Orange Pi.

## Total papan per jenis (6 kelompok)

| Jenis papan | Jumlah |
|---|---|
| ESP32 DevKit V1 | 18 (12 Modul 1 + 6 Modul 2) |
| Raspberry Pi Pico W | 12 (Modul 3) |
| Cosmic LoRa Aurora V2 | 7 untuk Part A (6 Hunter + 1 Beacon), direuse jadi 6 node + gateway untuk Part B. **Tidak ada cadangan** pada angka ini. |
| Orange Pi 4 PRO | 1 (dipakai lintas Modul 2/3/4B) |
| Gateway Wio-WM1302 | 1 |

## Catatan cadangan

Menambah kelompok ke-7 atau ke-8 (baris yang sudah disediakan di README) tidak
memerlukan penyuntingan kode — cukup papan dan sensor/aktuator tambahan sesuai
tabel di atas per kelompok baru. Disarankan menyiapkan 1 unit cadangan per
jenis sensor rawan pengawatan (HC-SR04, servo, potensiometer) mengingat catatan
"Kesalahan perangkat keras yang paling sering muncul" pada README.
