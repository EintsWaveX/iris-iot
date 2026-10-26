---
part: logika
lang: cpp
format: single
title: Jumlah bilangan ganjil
sample: true
status: ready
---
Berapa angka yang tercetak di Serial Monitor?

```cpp
int nilai = 7;
int hasil = 0;
for (int i = 1; i <= nilai; i += 2) {
  hasil += i;
}
Serial.println(hasil);
```

- [ ] 12
- [x] 16
- [ ] 28
- [ ] 9

---
part: logika
lang: py
format: single
title: Suhu di atas 30
sample: true
status: ready
---
Apa keluaran program ini?

```py
suhu = [31, 28, 35, 29, 33]
panas = [t for t in suhu if t > 30]
print(len(panas), max(panas))
```

- [x] `3 35`
- [ ] `2 35`
- [ ] `3 33`
- [ ] `5 35`

---
part: logika
lang: cpp
format: multi
title: uint8_t meluap
sample: true
status: ready
---
Pilih semua pernyataan yang benar tentang potongan ini.

```cpp
uint8_t a = 200;
uint8_t b = 100;
uint8_t c = a + b;
int d = a + b;
```

- [x] `c` bernilai 44
- [x] `d` bernilai 300
- [ ] `c` bernilai 300
- [x] `a + b` dihitung sebagai `int` sebelum disimpan
- [ ] Kompilasi gagal karena tipe datanya beda

---
part: logika
lang: py
format: multi
title: setdefault pada dict
sample: true
status: ready
---
Setelah kode ini jalan, pernyataan mana saja yang benar?

```py
data = {"suhu": 30, "lembap": 70}
data["suhu"] += 2
data.setdefault("lembap", 0)
data.setdefault("cahaya", 512)
```

- [x] `data["suhu"]` bernilai 32
- [ ] `data["lembap"]` bernilai 0
- [x] `data` sekarang punya 3 kunci
- [x] `data["cahaya"]` bernilai 512
- [ ] `len(data)` bernilai 2

---
part: kodingan
lang: cpp
format: lines
title: LED dan tombol pull-up
sample: true
status: ready
bugs: [6, 11]
---
Sketsa ini harus menyalakan LED selama tombol (INPUT_PULLUP) ditekan. Klik baris yang salah.

```cpp
const int TOMBOL = 4;
const int LED = 2;

void setup() {
  pinMode(TOMBOL, INPUT_PULLUP);
  pinMode(LED, INPUT);
}

void loop() {
  int baca = digitalRead(TOMBOL);
  if (baca = LOW) {
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}
```

---
part: kodingan
lang: py
format: lines
title: Nilai tertinggi
sample: true
status: ready
bugs: [2, 4]
---
Fungsi ini harus mengembalikan bacaan tertinggi, termasuk saat semua bacaan negatif. Klik baris yang salah.

```py
def tertinggi(bacaan):
    maks = 0
    for i in range(len(bacaan)):
        if i > maks:
            maks = bacaan[i]
    return maks
```

---
part: kodingan
lang: cpp
format: fix
title: DHT ke JSON
sample: true
status: ready
---
Sketsa ini membaca suhu DHT11 tiap 2 detik lalu mengirimnya sebagai JSON. Pilih isi yang benar untuk tiap baris yang ditandai.

```cpp
#include <DHT.h>
DHT dht(15, DHT11);
unsigned long terakhir = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  if (millis() - terakhir < 2000) return;
  terakhir = millis();
  float t = dht.readTemperature();
  if (t == NAN) return;
  Serial.printf("{\"suhu\":%d}\n", t);
}
```

### Baris 6
- [ ] `  Serial.begin(115200);`
- [x] `  Serial.begin(115200); dht.begin();`
- [ ] `  dht.begin(115200);`

### Baris 10
- [x] `  if (millis() - terakhir < 2000) return;`
- [ ] `  if (millis() - terakhir > 2000) return;`
- [ ] `  if (millis() < 2000) return;`

### Baris 13
- [ ] `  if (t == NAN) return;`
- [x] `  if (isnan(t)) return;`
- [ ] `  if (t == 0) return;`

### Baris 14
- [ ] `  Serial.printf("{\"suhu\":%d}\n", t);`
- [x] `  Serial.printf("{\"suhu\":%.1f}\n", t);`
- [ ] `  Serial.printf("{\"suhu\":%s}\n", t);`

---
part: kodingan
lang: py
format: fix
title: Tiga bacaan per detik
sample: true
status: ready
---
Program ini harus mencetak tiga bacaan dengan jeda 1 detik. Pilih isi yang benar untuk tiap baris yang ditandai.

```py
import time

def baca_sensor():
    return 25.0

hitung = 0
while hitung < 3:
    nilai = baca_sensor()
    print("Bacaan", hitung, ":", nilai)
    time.sleep(1000)
    hitung =+ 1
```

### Baris 7
- [x] `while hitung < 3:`
- [ ] `while hitung <= 3:`
- [ ] `while hitung > 3:`

### Baris 10
- [ ] `    time.sleep(1000)`
- [x] `    time.sleep(1)`
- [ ] `    time.delay(1)`

### Baris 11
- [ ] `    hitung =+ 1`
- [x] `    hitung += 1`
- [ ] `    hitung + 1`

---
part: logika
lang: cpp
format: order
title: Kirim potensiometer
sample: true
status: ready
also: [[1, 5, 6, 7, 8, 9, 2, 3, 4]]
---
Susun baris berikut menjadi sketsa yang mengirim nilai potensiometer lewat Serial setiap 1 detik.

```cpp
const int POT = 34;
void setup() {
  Serial.begin(115200);
}
void loop() {
  int nilai = analogRead(POT);
  Serial.println(nilai);
  delay(1000);
}
```

---
part: logika
lang: py
format: order
title: Rata-rata bergerak
sample: true
status: ready
---
Susun fungsi yang menghitung rata-rata bergerak dari tiap tiga bacaan berurutan.

```py
def rata_bergerak(data):
    hasil = []
    for i in range(2, len(data)):
        jendela = data[i - 2:i + 1]
        hasil.append(sum(jendela) / 3)
    return hasil
```

---
part: mikro
lang: cpp
format: match
title: Gejala dan penyebab
sample: true
status: ready
---
Pasangkan tiap gejala pada rangkaian ESP32 dengan penyebab yang paling mungkin.

| Gejala | Penyebab |
|---|---|
| LED tidak pernah menyala walau kodenya benar | Kaki LED terbalik |
| Bacaan tombol naik turun sendiri saat tidak ditekan | Pin tombol mengambang tanpa pull-up atau pull-down |
| `analogRead` selalu 4095 | Pin analog tersambung langsung ke 3V3 |
| DHT selalu memberi NaN | Kabel data DHT masuk ke pin yang beda dengan di kode |
| ESP32 restart saat servo bergerak | Catu daya tidak cukup (brownout) |
|  | Baud rate Serial Monitor beda dengan `Serial.begin` |

---
part: logika
lang: py
format: match
title: Metode string
sample: true
status: ready
---
Pasangkan tiap ekspresi Python dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `"iris-iot".upper()` | `'IRIS-IOT'` |
| `"a,b,c".split(",")` | `['a', 'b', 'c']` |
| `" 25 ".strip()` | `'25'` |
| `"suhu".replace("u", "o")` | `'soho'` |
| `"3" * 3` | `'333'` |
|  | `9` |

---
part: fitb
lang: cpp
format: fitb
title: Kedip tanpa delay
sample: true
status: ready
blanks:
  1: { accept: ["OUTPUT"] }
  2: { accept: ["millis()"], space: none }
  3: { accept: ["LOW", "0"] }
---
Lengkapi sketsa yang mengedipkan LED tiap 500 ms tanpa `delay()`.

```cpp
const int LED = 2;
unsigned long terakhir = 0;
bool nyala = false;

void setup() {
  pinMode(LED, __(1)__);
}

void loop() {
  if (millis() - terakhir >= 500) {
    terakhir = __(2)__;
    nyala = !nyala;
    digitalWrite(LED, nyala ? HIGH : __(3)__);
  }
}
```

---
part: fitb
lang: py
format: fitb
title: Kemas dan buka JSON
sample: true
status: ready
blanks:
  1: { accept: ["dumps"] }
  2: { accept: ["loads"] }
  3: { accept: ["str"] }
---
Lengkapi program yang mengemas bacaan menjadi teks JSON lalu membukanya lagi. Baris terakhir mencetak `True`.

```py
import json

def kemas(suhu, lembap):
    data = {"suhu": suhu, "lembap": lembap}
    return json.__(1)__(data)

def buka(pesan):
    data = json.__(2)__(pesan)
    return data["suhu"]

print(buka(kemas(29.5, 61)))
print(type(kemas(1, 2)) is __(3)__)
```
