---
part: logika
lang: c
format: single
title: Perulangan Bersarang
sample: true
status: ready
---
Berapa output program ini?

```c
int hitung = 0;
for (int i = 0; i < 4; i++) {
  for (int j = i; j < 4; j++) {
    hitung++;
  }
}
printf("%d\n", hitung);
```

- [ ] 6
- [x] 10
- [ ] 12
- [ ] 16

---
part: logika
lang: c
format: single
title: Switch Tanpa Break
sample: true
status: ready
---
Berapa output program ini?

```c
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
printf("%d\n", skor);
```

- [ ] 2
- [ ] 3
- [x] 5
- [ ] 14

---
part: logika
lang: c
format: single
title: Pembagian dan Sisa
sample: true
status: ready
---
Apa output program ini?

```c
int a = 17;
int b = 5;
printf("%d %d\n", a / b, a % b);
```

- [x] `3 2`
- [ ] `3 3`
- [ ] `2 3`
- [ ] `3.4 2`

---
part: logika
lang: c
format: single
title: Increment Sebelum dan Sesudah
sample: true
status: ready
---
Apa output program ini?

```c
int x = 5;
int y = x++;
int z = ++x;
printf("%d %d %d\n", x, y, z);
```

- [x] `7 5 7`
- [ ] `7 6 7`
- [ ] `6 5 6`
- [ ] `7 5 6`

---
part: logika
lang: c
format: single
title: Short Circuit
sample: true
status: ready
---
Berapa output program ini?

```c
int a = 0;
int b = 0;
if (a == 0 || ++b > 0) {
  b += 10;
}
printf("%d\n", b);
```

- [ ] 0
- [ ] 1
- [x] 10
- [ ] 11

---
part: logika
lang: c
format: single
title: Array Setengah Terisi
sample: true
status: ready
---
Berapa output program ini?

```c
int a[5] = {4, 7};
int s = 0;
for (int i = 0; i < 5; i++) {
  s += a[i];
}
printf("%d\n", s);
```

- [ ] 4
- [ ] 7
- [x] 11
- [ ] 15

---
part: logika
lang: c
format: single
title: Cari Angka Terbesar
sample: true
status: ready
---
Apa output program ini?

```c
int a[6] = {3, -2, 9, 4, 9, 1};
int maks = a[0];
int idx = 0;
for (int i = 1; i < 6; i++) {
  if (a[i] > maks) {
    maks = a[i];
    idx = i;
  }
}
printf("%d %d\n", maks, idx);
```

- [x] `9 2`
- [ ] `9 4`
- [ ] `4 9`
- [ ] `9 5`

---
part: logika
lang: c
format: multi
title: Array dan Index
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah potongan ini dijalankan.

```c
int a[5] = {10, 20, 30};
int n = sizeof(a) / sizeof(a[0]);
int jumlah = 0;
for (int i = 0; i < n; i++) {
  jumlah += a[i];
}
```

- [x] `n` bernilai 5
- [x] `a[3]` bernilai 0
- [x] `jumlah` bernilai 60
- [ ] `n` bernilai 3
- [ ] `a[5]` adalah elemen terakhir yang sah

---
part: logika
lang: c
format: multi
title: Kondisi Logika
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah kode ini jalan. Di C, hasil perbandingan bernilai 1 (benar) atau 0 (salah).

```c
int a = 6;
int b = 3;
int p = (a > b) && (b > 5);
int q = (a > b) || (b > 5);
int r = !(a == 2 * b);
```

- [x] `p` bernilai 0
- [x] `q` bernilai 1
- [x] `r` bernilai 0
- [ ] `p` bernilai 1
- [ ] `r` bernilai 1

---
part: logika
lang: c
format: order
title: Faktorial
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10]]
---
Susun baris berikut jadi program yang mencetak faktorial dari 5.

```c
#include <stdio.h>
int main(void) {
  int n = 5;
  int hasil = 1;
  for (int i = 2; i <= n; i++) {
    hasil *= i;
  }
  printf("%d\n", hasil);
  return 0;
}
```

---
part: logika
lang: c
format: order
title: Cari Angka Terbesar di Array
sample: true
status: ready
---
Susun baris berikut jadi program yang mencetak angka terbesar di array.

```c
#include <stdio.h>
int main(void) {
  int a[5] = {4, 9, 2, 7, 5};
  int maks = a[0];
  for (int i = 1; i < 5; i++) {
    if (a[i] > maks) {
      maks = a[i];
    }
  }
  printf("%d\n", maks);
  return 0;
}
```

---
part: logika
lang: c
format: order
title: Hitung Bilangan Genap
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12]]
---
Susun baris berikut jadi program yang menghitung ada berapa bilangan genap di array.

```c
#include <stdio.h>
int main(void) {
  int a[6] = {2, 7, 4, 9, 6, 1};
  int genap = 0;
  for (int i = 0; i < 6; i++) {
    if (a[i] % 2 == 0) {
      genap++;
    }
  }
  printf("%d\n", genap);
  return 0;
}
```

---
part: logika
lang: c
format: match
title: Operator Bit
sample: true
status: ready
---
Pasangkan tiap ekspresi C dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `6 & 3` | `2` |
| `6 ^ 3` | `5` |
| `1 << 4` | `16` |
| `20 >> 2` | `5` |
| `~6` | `-7` |
|  | `0` |

---
part: logika
lang: c
format: match
title: Istilah dan Artinya
sample: true
status: ready
---
Pasangkan tiap istilah dengan artinya.

| Istilah | Arti |
|---|---|
| array | Kumpulan nilai bertipe sama yang disimpan berurutan |
| index | Nomor posisi sebuah elemen, dimulai dari 0 |
| loop | Kode yang diulang selama kondisinya benar |
| function | Potongan kode yang bisa dipanggil berkali-kali |
| compile | Mengubah kode C jadi program yang bisa dijalankan |
|  | Nilai yang dikembalikan `main` saat program selesai |
