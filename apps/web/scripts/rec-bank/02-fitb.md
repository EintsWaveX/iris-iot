---
part: fitb
lang: cpp
format: fitb
title: Kecerahan LED dari potensiometer
sample: true
status: ready
blanks:
  1: { accept: ["analogRead"] }
  2: { accept: ["map"] }
  3: { accept: ["ledcWrite"] }
---
Lengkapi sketsa yang mengatur kecerahan LED (PWM 8 bit) dari potensiometer 12 bit.

```cpp
const int POT = 34;
const int LED = 2;

void setup() {
  ledcAttach(LED, 5000, 8);
}

void loop() {
  int baca = __(1)__(POT);
  int duty = __(2)__(baca, 0, 4095, 0, 255);
  __(3)__(LED, duty);
  delay(20);
}
```

---
part: fitb
lang: cpp
format: fitb
title: Hitung tekan dengan interrupt
sample: true
status: ready
blanks:
  1: { accept: ["volatile"] }
  2: { accept: ["digitalPinToInterrupt"] }
  3: { accept: ["FALLING"] }
---
Lengkapi sketsa yang menghitung berapa kali tombol (INPUT_PULLUP) ditekan lewat interrupt.

```cpp
const int TOMBOL = 4;
__(1)__ int tekan = 0;

void IRAM_ATTR hitung() {
  tekan++;
}

void setup() {
  Serial.begin(115200);
  pinMode(TOMBOL, INPUT_PULLUP);
  attachInterrupt(__(2)__(TOMBOL), hitung, __(3)__);
}

void loop() {
  Serial.println(tekan);
  delay(500);
}
```

---
part: fitb
lang: cpp
format: fitb
title: Sambung Wi-Fi
sample: true
status: ready
blanks:
  1: { accept: ["begin"] }
  2: { accept: ["WL_CONNECTED"] }
  3: { accept: ["localIP"] }
---
Lengkapi sketsa yang menyambung ke Wi-Fi lalu mencetak alamat IP-nya.

```cpp
#include <WiFi.h>

const char* NAMA_WIFI = "iris-lab";
const char* KUNCI_WIFI = "contoh-kunci";

void setup() {
  Serial.begin(115200);
  WiFi.__(1)__(NAMA_WIFI, KUNCI_WIFI);
  while (WiFi.status() != __(2)__) {
    delay(500);
  }
  Serial.println(WiFi.__(3)__());
}

void loop() {}
```

---
part: fitb
lang: cpp
format: fitb
title: Baca kelembapan DHT
sample: true
status: ready
blanks:
  1: { accept: ["begin"] }
  2: { accept: ["readHumidity"] }
  3: { accept: ["isnan"] }
---
Lengkapi sketsa yang membaca kelembapan DHT11 tiap 2 detik dan melaporkan kegagalan baca.

```cpp
#include <DHT.h>
DHT dht(15, DHT11);

void setup() {
  Serial.begin(115200);
  dht.__(1)__();
}

void loop() {
  float h = dht.__(2)__();
  if (__(3)__(h)) {
    Serial.println("gagal baca");
  } else {
    Serial.println(h);
  }
  delay(2000);
}
```

---
part: fitb
lang: cpp
format: fitb
title: Perintah dari Serial
sample: true
status: ready
blanks:
  1: { accept: ["available"] }
  2: { accept: ["readStringUntil"] }
  3: { accept: ["toInt"] }
---
Lengkapi sketsa yang membaca satu baris angka dari Serial Monitor lalu mencetak dua kali lipatnya.

```cpp
String masuk;

void setup() {
  Serial.begin(115200);
}

void loop() {
  if (Serial.__(1)__() > 0) {
    masuk = Serial.__(2)__('\n');
    int nilai = masuk.__(3)__();
    Serial.println(nilai * 2);
  }
}
```

---
part: fitb
lang: cpp
format: fitb
title: Cari perangkat I2C
sample: true
status: ready
blanks:
  1: { accept: ["begin"] }
  2: { accept: ["beginTransmission"] }
  3: { accept: ["endTransmission"] }
---
Lengkapi sketsa yang memindai bus I2C dan mencetak alamat perangkat yang menjawab.

```cpp
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.__(1)__();
  for (byte alamat = 1; alamat < 127; alamat++) {
    Wire.__(2)__(alamat);
    if (Wire.__(3)__() == 0) {
      Serial.println(alamat, HEX);
    }
  }
}

void loop() {}
```

---
part: fitb
lang: cpp
format: fitb
title: Servo menyapu
sample: true
status: ready
blanks:
  1: { accept: ["attach"] }
  2: { accept: ["write"] }
  3: { accept: ["50"] }
---
Lengkapi sketsa yang menggerakkan servo di GPIO 18 dari 0 sampai 180 derajat, naik 10 derajat tiap 50 milidetik.

```cpp
#include <ESP32Servo.h>
Servo servo;

void setup() {
  servo.__(1)__(18);
}

void loop() {
  for (int sudut = 0; sudut <= 180; sudut += 10) {
    servo.__(2)__(sudut);
    delay(__(3)__);
  }
}
```

---
part: fitb
lang: cpp
format: fitb
title: Hitung boot di memori NVS
sample: true
status: ready
blanks:
  1: { accept: ["begin"] }
  2: { accept: ["getUInt"] }
  3: { accept: ["putUInt"] }
---
Lengkapi sketsa yang menyimpan jumlah boot ESP32 di memori NVS dan mencetaknya.

```cpp
#include <Preferences.h>
Preferences prefs;

void setup() {
  Serial.begin(115200);
  prefs.__(1)__("iris", false);
  unsigned int boot = prefs.__(2)__("boot", 0);
  boot++;
  prefs.__(3)__("boot", boot);
  Serial.println(boot);
  prefs.end();
}

void loop() {}
```

---
part: fitb
lang: cpp
format: fitb
title: Kirim JSON lewat HTTP
sample: true
status: ready
blanks:
  1: { accept: ["addHeader"] }
  2: { accept: ["POST"] }
  3: { accept: ["end"] }
---
Lengkapi fungsi yang mengirim teks JSON dengan HTTP POST dan mencetak kode jawabannya.

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

void kirim(const String& isi) {
  HTTPClient http;
  http.begin("http://contoh.example/data");
  http.__(1)__("Content-Type", "application/json");
  int kode = http.__(2)__(isi);
  Serial.println(kode);
  http.__(3)__();
}

void setup() {}
void loop() {}
```

---
part: fitb
lang: py
format: fitb
title: Rata-rata dan rentang
sample: true
status: ready
blanks:
  1: { accept: ["sum"] }
  2: { accept: ["len"] }
  3: { accept: ["min"] }
---
Lengkapi program yang menghitung rata-rata dan rentang (terbesar dikurangi terkecil) dari bacaan suhu. Baris terakhir mencetak `25.75 2.5`.

```py
bacaan = [24.5, 26.0, 25.5, 27.0]

rata = __(1)__(bacaan) / __(2)__(bacaan)
rentang = max(bacaan) - __(3)__(bacaan)
print(rata, rentang)
```

---
part: fitb
lang: py
format: fitb
title: Baca baris CSV
sample: true
status: ready
blanks:
  1: { accept: ["strip"] }
  2: { accept: ['","', "','"], space: none }
  3: { accept: ["float"] }
---
Lengkapi program yang memecah satu baris CSV menjadi nama dan suhu. Baris terakhir mencetak `lab-1 29.4`.

```py
baris = " lab-1, 28.4 ,61 \n"
bagian = baris.__(1)__().split(__(2)__)
nama = bagian[0].strip()
suhu = __(3)__(bagian[1])
print(nama, suhu + 1)
```

---
part: fitb
lang: py
format: fitb
title: Hitung kemunculan
sample: true
status: ready
blanks:
  1: { accept: ["get"] }
  2: { accept: ["sorted"] }
  3: { accept: ["sum"] }
---
Lengkapi program yang menghitung berapa kali tiap kejadian muncul, mengurutkannya dari yang paling sedikit, lalu mencetak totalnya.

```py
kejadian = ["on", "off", "on", "on", "off"]
cacah = {}
for k in kejadian:
    cacah[k] = cacah.__(1)__(k, 0) + 1
for nama, jumlah in __(2)__(cacah.items(), key=lambda x: x[1]):
    print(nama, jumlah)
print(__(3)__(cacah.values()))
```

---
part: fitb
lang: py
format: fitb
title: Pengecualian saat baca angka
sample: true
status: ready
blanks:
  1: { accept: ["try"] }
  2: { accept: ["except"] }
  3: { accept: ["ValueError"] }
---
Lengkapi fungsi yang mengubah teks menjadi bilangan bulat dan mengembalikan -1 bila teksnya bukan angka. Baris terakhir mencetak `42 -1`.

```py
def ke_angka(teks):
    __(1)__:
        return int(teks)
    __(2)__ __(3)__:
        return -1

print(ke_angka("42"), ke_angka("empat"))
```
