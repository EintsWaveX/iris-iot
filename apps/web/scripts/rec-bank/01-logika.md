---
part: logika
lang: cpp
format: single
title: Perulangan bersarang
sample: true
status: ready
---
Berapa angka yang tercetak di Serial Monitor?

```cpp
int hitung = 0;
for (int i = 0; i < 4; i++) {
  for (int j = i; j < 4; j++) {
    hitung++;
  }
}
Serial.println(hitung);
```

- [ ] 6
- [x] 10
- [ ] 12
- [ ] 16

---
part: logika
lang: cpp
format: single
title: Switch tanpa break
sample: true
status: ready
---
Berapa angka yang tercetak di Serial Monitor?

```cpp
int mode = 2;
int skor = 0;
switch (mode) {
  case 1:
    skor += 1;
  case 2:
    skor += 2;
  case 3:
    skor += 3;
    break;
  default:
    skor += 9;
}
Serial.println(skor);
```

- [ ] 2
- [ ] 3
- [x] 5
- [ ] 14

---
part: logika
lang: cpp
format: single
title: Variabel static
sample: true
status: ready
---
Berapa angka yang tercetak di Serial Monitor setelah `setup()` selesai?

```cpp
int tambah() {
  static int total = 0;
  total += 2;
  return total;
}

void setup() {
  Serial.begin(115200);
  tambah();
  tambah();
  Serial.println(tambah());
}

void loop() {}
```

- [ ] 0
- [ ] 2
- [ ] 4
- [x] 6

---
part: logika
lang: cpp
format: multi
title: Array setengah terisi
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah potongan ini dijalankan.

```cpp
int data[5] = {10, 20, 30};
int n = sizeof(data) / sizeof(data[0]);
int jumlah = 0;
for (int i = 0; i < n; i++) {
  jumlah += data[i];
}
```

- [x] `n` bernilai 5
- [x] `data[3]` bernilai 0
- [x] `jumlah` bernilai 60
- [ ] `n` bernilai 3
- [ ] `data[5]` adalah elemen terakhir yang sah

---
part: logika
lang: cpp
format: multi
title: Parameter referensi
sample: true
status: ready
---
Pilih semua pernyataan yang benar tentang kode ini.

```cpp
void tambah(int a, int &b) {
  a += 5;
  b += 5;
}

void setup() {
  int x = 1;
  int y = 1;
  tambah(x, y);
}
```

- [ ] `x` menjadi 6 setelah `tambah(x, y)`
- [x] `y` menjadi 6 setelah `tambah(x, y)`
- [x] `a` di dalam `tambah` adalah salinan dari `x`
- [x] `tambah(1, 2);` tidak bisa dikompilasi
- [ ] `b` di dalam `tambah` adalah salinan dari `y`

---
part: logika
lang: cpp
format: order
title: Tombol dengan pengalih
sample: true
status: ready
also: [[2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], [1, 2, 3, 4, 6, 5, 7, 8, 9, 10, 11, 12, 13, 14], [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]]
---
Susun baris berikut menjadi sketsa yang membalik keadaan LED setiap kali tombol (INPUT_PULLUP) ditekan.

```cpp
const int TOMBOL = 4;
const int LED = 2;
bool nyala = false;
void setup() {
  pinMode(TOMBOL, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
}
void loop() {
  if (digitalRead(TOMBOL) == LOW) {
    nyala = !nyala;
    digitalWrite(LED, nyala);
    delay(200);
  }
}
```

---
part: logika
lang: cpp
format: match
title: Operator dan hasilnya
sample: true
status: ready
---
Pasangkan tiap ekspresi C++ dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `7 / 2` | `3` |
| `10 % 4` | `2` |
| `7 / 2.0` | `3.5` |
| `1 << 3` | `8` |
| `5 & 3` | `1` |
|  | `0` |

---
part: logika
lang: py
format: single
title: Irisan list
sample: true
status: ready
---
Apa keluaran program ini?

```py
data = [10, 20, 30, 40, 50]
print(data[1:4][::-1], data[-2])
```

- [ ] `[20, 30, 40] 40`
- [x] `[40, 30, 20] 40`
- [ ] `[40, 30, 20] 50`
- [ ] `[30, 20, 10] 40`
