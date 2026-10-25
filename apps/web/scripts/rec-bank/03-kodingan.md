---
part: kodingan
lang: cpp
format: lines
title: Rata-rata bacaan analog
sample: true
status: ready
bugs: [8, 9]
---
Sketsa ini harus mencetak rata-rata 10 bacaan analog tiap detik. Klik baris yang salah.

```cpp
const int SENSOR = 34;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int jumlah;
  for (int i = 0; i <= 10; i++) {
    jumlah += analogRead(SENSOR);
  }
  Serial.println(jumlah / 10.0);
  delay(1000);
}
```

---
part: kodingan
lang: cpp
format: fix
title: Hitung tekan tombol
sample: true
status: ready
---
Sketsa ini harus menambah hitungan satu kali tiap tombol (INPUT_PULLUP) ditekan, dengan jeda 50 milidetik agar pantulan kontak tidak terhitung. Pilih isi yang benar untuk tiap baris yang ditandai.

```cpp
const int TOMBOL = 4;
int hitung = 0;
bool terakhir = HIGH;
unsigned long waktu = 0;

void setup() {
  Serial.begin(115200);
  pinMode(TOMBOL, INPUT);
}

void loop() {
  bool baca = digitalRead(TOMBOL);
  if (baca == LOW && terakhir == HIGH && millis() - waktu > 50) {
    hitung--;
    waktu = millis();
    Serial.println(hitung);
  }
  terakhir = baca;
}
```

### Baris 8
- [ ] `  pinMode(TOMBOL, INPUT);`
- [x] `  pinMode(TOMBOL, INPUT_PULLUP);`
- [ ] `  pinMode(TOMBOL, OUTPUT);`

### Baris 13
- [x] `  if (baca == LOW && terakhir == HIGH && millis() - waktu > 50) {`
- [ ] `  if (baca == LOW || terakhir == HIGH || millis() - waktu > 50) {`
- [ ] `  if (baca == HIGH && terakhir == LOW && millis() - waktu > 50) {`

### Baris 14
- [ ] `    hitung--;`
- [x] `    hitung++;`
- [ ] `    hitung = 1;`

---
part: kodingan
lang: cpp
format: lines
title: Servo menyapu bolak-balik
sample: true
status: ready
bugs: [12, 15]
---
Servo harus menyapu dari 0 ke 180 derajat lalu kembali, terus-menerus. Klik baris yang salah.

```cpp
#include <ESP32Servo.h>

Servo servo;
int sudut = 0;
int langkah = 5;

void setup() {
  servo.attach(18);
}

void loop() {
  servo.write(langkah);
  sudut += langkah;
  if (sudut >= 180 || sudut <= 0) {
    langkah = langkah;
  }
  delay(20);
}
```

---
part: kodingan
lang: py
format: lines
title: Rata-rata bacaan yang sah
sample: true
status: ready
bugs: [5, 9]
---
Fungsi ini harus merata-ratakan hanya bacaan yang sah, yaitu bukan `None` dan antara -40 dan 80. Klik baris yang salah.

```py
def rata_valid(bacaan):
    jumlah = 0
    n = 0
    for b in bacaan:
        if b is None or b < -40 and b > 80:
            continue
        jumlah += b
        n += 1
    return jumlah / len(bacaan)
```

---
part: kodingan
lang: py
format: fix
title: Baca pesan JSON
sample: true
status: ready
---
Program ini harus membuka pesan JSON dari sensor dan, bila statusnya baik, mencetak nama beserta suhu yang dinaikkan 0,5. Pilih isi yang benar untuk tiap baris yang ditandai.

```py
import json

pesan = '{"id": "lab-1", "suhu": 29.5, "ok": true}'
data = json.load(pesan)
if data["ok"] = True:
    print(data["id"], data["suhu"] + "0.5")
else:
    print("gagal")
```

### Baris 4
- [ ] `data = json.load(pesan)`
- [x] `data = json.loads(pesan)`
- [ ] `data = json.parse(pesan)`

### Baris 5
- [ ] `if data["ok"] = True:`
- [x] `if data["ok"] == True:`
- [ ] `if data["ok"] == "true":`

### Baris 6
- [ ] `    print(data["id"], data["suhu"] + "0.5")`
- [x] `    print(data["id"], data["suhu"] + 0.5)`
- [ ] `    print(data["id"], data.suhu + 0.5)`

---
part: kodingan
lang: py
format: lines
title: Deteksi lonjakan
sample: true
status: ready
bugs: [3, 5]
---
Fungsi ini harus mengembalikan nomor urut bacaan yang berubah lebih dari `batas` dibanding bacaan sebelumnya, naik maupun turun. Klik baris yang salah.

```py
def lonjakan(bacaan, batas):
    hasil = []
    for i in range(len(bacaan)):
        selisih = bacaan[i] - bacaan[i - 1]
        if selisih > batas:
            hasil.append(i)
    return hasil
```
