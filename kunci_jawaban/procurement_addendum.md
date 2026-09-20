# Procurement Addendum — Praktikum IoT IRIS

Berdasarkan tabel perangkat pada `README.md`, berkas ini menghitung kebutuhan
komponen untuk **6 kelompok aktif** (baris 1–6 pada skema `GROUP_ID`). Modul 4
memakai topologi banyak-Transmitter/satu-Receiver, sehingga jumlah Cosmic pada
modul itu tidak mengikuti pola "2 papan per kelompok" seperti modul lainnya.

## Ringkasan per modul

| Modul | Papan per kelompok | Papan bersama | Jumlah kelompok | Total papan modul |
|---|---|---|---|---|
| 1 (BLE) | 2× ESP32 DevKit V1 | – | 6 | 12 ESP32 DevKit V1 |
| 2 (WebSocket) | 1× ESP32 DevKit V1 | 1× Orange Pi 4 PRO (dipakai bersama semua modul) | 6 | 6 ESP32 DevKit V1 |
| 3 (MQTT) | 2× Pico W (hanya Publisher yang memegang komponen) | – (broker di Orange Pi yang sama) | 6 | 12 Pico W |
| 4 (Perburuan LoRa) | 1× Cosmic (Hunter) | 1× Cosmic (Beacon tersembunyi) | 6 | 7 Cosmic |

## Sensor & aktuator per kelompok

| Modul | Sensor (×kelompok) | Aktuator (×kelompok) |
|---|---|---|
| 1 | Potensiometer 10 kΩ | Servo SG90 |
| 2 | DHT22 | — (tidak ada; murni baca dan catat) |
| 3 | Potensiometer 10 kΩ | — (tidak ada; murni baca dan catat) |
| 4 | — (tidak ada; yang diukur radionya sendiri) | — (tidak ada) |

> Modul 1 dan Modul 3 sengaja memakai sensor yang sama. Yang dibandingkan
> praktikan pada kedua modul itu adalah protokolnya (BLE versus MQTT), bukan
> sensornya, sehingga potensiometer harus dihitung **dua kali**.

Total untuk 6 kelompok:
- Potensiometer 10 kΩ: 12 (6 Modul 1 + 6 Modul 3)
- Servo SG90 (Modul 1): 6
- DHT22: 6

## Perangkat keras pendukung (wajib, per papan yang relevan)

- Kabel jumper male-female dan male-male secukupnya untuk pengawatan servo, potensiometer, dan DHT22.
- Potensiometer Modul 3 wajib dicatu dari 3V3(OUT) Pico W (pin fisik 36), bukan VBUS: masukan ADC-nya hanya tahan 3,3 V.
- Suplai 5 V (bukan 3V3) untuk tiap Servo SG90 — pastikan tersedia jalur VIN/5V di setiap board yang memegang servo (Modul 1: 6 papan Peripheral; Modul 4: 1 papan Receiver).

## Infrastruktur bersama (tidak dikalikan jumlah kelompok)

- 1× Orange Pi 4 PRO — menjalankan server WebSocket (Modul 2), broker Mosquitto (Modul 3), dan papan skor Modul 4.
- 1× Cosmic sebagai Beacon tersembunyi — untuk Modul 4.
- Orange Pi yang sama dijalankan sebagai **access point** `IRIS-IOT` selama Modul 4 (lihat `scripts/opi_ap_on.sh`).
- 1× PC yang menjalankan `scripts/send_time.ps1` untuk sinkronisasi jam Modul 1 (harus PC yang sama untuk kedua papan dalam satu sesi). Modul 4 tidak memerlukannya: seluruh papannya menyelaraskan jam melalui NTP ke Orange Pi.

## Total papan per jenis (6 kelompok)

| Jenis papan | Jumlah |
|---|---|
| ESP32 DevKit V1 | 18 (12 Modul 1 + 6 Modul 2) |
| Raspberry Pi Pico W | 12 (Modul 3) |
| Cosmic LoRa Aurora V2 | 7 (6 Hunter + 1 Beacon). **Tidak ada cadangan** pada angka ini. |
| Orange Pi 4 PRO | 1 (dipakai lintas Modul 2/3/4) |

## Catatan cadangan

Menambah kelompok ke-7 atau ke-8 (baris yang sudah disediakan di README) tidak
memerlukan penyuntingan kode — cukup papan dan sensor/aktuator tambahan sesuai
tabel di atas per kelompok baru. Disarankan menyiapkan 1 unit cadangan per
jenis sensor rawan pengawatan (HC-SR04, servo, potensiometer) mengingat catatan
"Kesalahan perangkat keras yang paling sering muncul" pada README.
