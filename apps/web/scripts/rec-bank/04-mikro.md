---
part: mikro
lang: any
format: single
title: Pembagi tegangan
sample: true
status: ready
---
Sensor mengeluarkan 3,3 V. Dua resistor dipasang seri: R1 = 10 kΩ dari sensor ke titik tengah, R2 = 20 kΩ dari titik tengah ke GND. Berapa tegangan di titik tengah, tempat pin ADC dihubungkan?

- [ ] 1,1 V
- [ ] 1,65 V
- [x] 2,2 V
- [ ] 2,75 V

---
part: mikro
lang: any
format: multi
title: I2C pada ESP32
sample: true
status: ready
---
ESP32 DevKit V1 memakai `Wire` dengan pin bawaan. Pilih semua pernyataan yang benar tentang I2C.

- [x] Pin bawaan SDA adalah GPIO21 dan SCL adalah GPIO22
- [x] Dua perangkat dengan alamat yang sama pada satu bus saling bentrok
- [x] Bus memerlukan resistor pull-up pada jalur SDA dan SCL
- [ ] I2C memakai pin MOSI dan MISO
- [ ] Setiap perangkat membutuhkan satu pin chip select sendiri

---
part: mikro
lang: cpp
format: fix
title: Kecerahan LED naik turun
sample: true
status: ready
---
LED di GPIO 2 harus menyala makin terang sampai penuh, lalu meredup, berulang. PWM 8 bit, jadi duty paling besar 255. Pilih isi yang benar untuk tiap baris yang ditandai.

```cpp
const int LED = 2;
int terang = 0;
int langkah = 5;

void setup() {
  ledcAttach(LED, 5000, 12);
}

void loop() {
  ledcWrite(LED, terang);
  terang += langkah;
  if (terang > 255 || terang < 0) langkah = -langkah;
  delay(10);
}
```

### Baris 6
- [ ] `  ledcSetup(0, 5000, 8);`
- [ ] `  ledcAttach(LED, 5000, 12);`
- [x] `  ledcAttach(LED, 5000, 8);`

### Baris 12
- [x] `  if (terang >= 255 || terang <= 0) langkah = -langkah;`
- [ ] `  if (terang > 255 || terang < 0) langkah = -langkah;`
- [ ] `  if (terang >= 255 && terang <= 0) langkah = -langkah;`

---
part: mikro
lang: cpp
format: lines
title: Pin yang salah pilih
sample: true
status: ready
bugs: [2, 3]
---
Sketsa ini untuk ESP32 DevKit V1. Dua pin dipakai untuk tugas yang tidak bisa dijalankannya. Klik baris yang salah.

```cpp
const int SENSOR_SUHU = 35;
const int LED_STATUS = 34;
const int RELAY = 6;
const int BUZZER = 25;

void setup() {
  pinMode(SENSOR_SUHU, INPUT);
  pinMode(LED_STATUS, OUTPUT);
  pinMode(RELAY, OUTPUT);
  pinMode(BUZZER, OUTPUT);
}

void loop() {}
```
