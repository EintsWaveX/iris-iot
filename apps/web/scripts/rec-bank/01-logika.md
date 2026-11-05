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
title: Ekspresi dan Tipe
sample: true
status: ready
---
Pasangkan tiap ekspresi C dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `(int)3.9` | `3` |
| `-7 / 2` | `-3` |
| `-7 % 3` | `-1` |
| `5 / 2.0` | `2.5` |
| `10 / 4 * 2.0` | `4` |
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


---
part: logika
lang: c
format: single
title: Operator Ternary
sample: true
status: ready
---
Berapa output program ini?

```c
int a = 7;
int b = 12;
int m = (a > b) ? a : b;
printf("%d\n", m + 1);
```

- [ ] 8
- [ ] 12
- [x] 13
- [ ] 7

---
part: logika
lang: c
format: single
title: Loop dengan Break
sample: true
status: ready
---
Berapa output program ini?

```c
int s = 0;
for (int i = 1; i <= 10; i++) {
  if (i % 4 == 0) break;
  s += i;
}
printf("%d\n", s);
```

- [ ] 3
- [x] 6
- [ ] 10
- [ ] 15


---
part: logika
lang: c
format: single
title: Do-While Sekali Jalan
sample: true
status: ready
---
Apa output program ini?

```c
int n = 10;
int c = 0;
do {
  c++;
  n += 5;
} while (n < 10);
printf("%d %d\n", c, n);
```

- [x] `1 15`
- [ ] `0 10`
- [ ] `1 10`
- [ ] `2 15`

---
part: logika
lang: c
format: single
title: Continue di Dalam Loop
sample: true
status: ready
---
Berapa output program ini?

```c
int s = 0;
for (int i = 1; i <= 8; i++) {
  if (i % 3 == 0) continue;
  s += i;
}
printf("%d\n", s);
```

- [ ] 9
- [ ] 22
- [x] 27
- [ ] 36

---
part: logika
lang: c
format: single
title: Geser Huruf
sample: true
status: ready
---
Apa output program ini?

```c
char c = 'a';
c = c + 3;
printf("%c %d\n", c, c - 'a');
```

- [x] `d 3`
- [ ] `c 2`
- [ ] `d 100`
- [ ] `a 3`

---
part: logika
lang: c
format: single
title: Argumen Fungsi Hanya Salinan
sample: true
status: ready
---
Berapa output program ini?

```c
#include <stdio.h>

void tambah(int x) {
  x += 10;
}

int main(void) {
  int a = 5;
  tambah(a);
  printf("%d\n", a);
  return 0;
}
```

- [ ] 0
- [x] 5
- [ ] 10
- [ ] 15

---
part: logika
lang: c
format: single
title: Jumlah Beruntun Rekursif
sample: true
status: ready
---
Berapa output program ini?

```c
#include <stdio.h>

int f(int n) {
  if (n == 0) return 0;
  return n + f(n - 1);
}

int main(void) {
  printf("%d\n", f(4));
  return 0;
}
```

- [ ] 4
- [ ] 6
- [x] 10
- [ ] 24

---
part: logika
lang: c
format: single
title: Variabel Global dan Lokal
sample: true
status: ready
---
Berapa output program ini?

```c
#include <stdio.h>

int x = 3;

void ubah(void) {
  int x = 8;
  x++;
}

int main(void) {
  ubah();
  x += 2;
  printf("%d\n", x);
  return 0;
}
```

- [ ] 3
- [x] 5
- [ ] 10
- [ ] 11

---
part: logika
lang: c
format: single
title: Selisih Dua Baris Array
sample: true
status: ready
---
Berapa output program ini?

```c
int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
int s = 0;
for (int j = 0; j < 3; j++) {
  s += m[1][j] - m[0][j];
}
printf("%d\n", s);
```

- [ ] 6
- [x] 9
- [ ] 15
- [ ] 21

---
part: logika
lang: c
format: single
title: If Bersarang
sample: true
status: ready
---
Apa output program ini?

```c
int n = 15;
if (n % 3 == 0) {
  if (n % 5 == 0) printf("A");
  else printf("B");
} else {
  printf("C");
}
printf("D\n");
```

- [x] `AD`
- [ ] `BD`
- [ ] `A`
- [ ] `CD`

---
part: logika
lang: c
format: single
title: Dua Penunjuk Saling Mendekat
sample: true
status: ready
---
Apa output program ini?

```c
int i = 0;
int j = 10;
while (i < j) {
  i += 2;
  j -= 1;
}
printf("%d %d\n", i, j);
```

- [ ] `6 7`
- [ ] `6 6`
- [x] `8 6`
- [ ] `10 5`

---
part: logika
lang: c
format: single
title: Hitung Huruf dalam String
sample: true
status: ready
---
Berapa output program ini?

```c
char s[] = "banana";
int n = 0;
for (int i = 0; s[i] != '\0'; i++) {
  if (s[i] == 'a') n++;
}
printf("%d\n", n);
```

- [ ] 2
- [x] 3
- [ ] 4
- [ ] 6

---
part: logika
lang: c
format: multi
title: Loop Lompat Dua
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah potongan ini dijalankan.

```c
int a[4] = {2, 4, 6, 8};
int i = 0;
int s = 0;
while (i < 4) {
  s += a[i];
  i += 2;
}
```

- [x] `s` bernilai 8
- [x] `i` bernilai 4
- [x] Loop-nya berjalan 2 kali
- [ ] `s` bernilai 20
- [ ] `a[1]` ikut dijumlahkan

---
part: logika
lang: c
format: multi
title: String dan Index
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah potongan ini dijalankan. String di C selalu diakhiri karakter `'\0'`.

```c
char s[] = "iris";
int n = 0;
while (s[n] != '\0') {
  n++;
}
char c = s[1];
```

- [x] `n` bernilai 4
- [x] `c` bernilai `'r'`
- [x] `s[4]` adalah `'\0'`
- [ ] `n` bernilai 5
- [ ] `s[n]` adalah `'s'`

---
part: logika
lang: c
format: multi
title: Hasil Perbandingan
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah kode ini jalan. Di C, hasil perbandingan bernilai 1 (benar) atau 0 (salah).

```c
int a = 10;
int b = 4;
int p = a % b == 2;
int q = a / b == 2.5;
int r = (a > b) + (b > a);
int s = !(a - 10);
```

- [x] `p` bernilai 1
- [ ] `q` bernilai 1
- [x] `r` bernilai 1
- [ ] `s` bernilai 0
- [x] `s` bernilai 1

---
part: logika
lang: c
format: order
title: Jumlah Digit Sebuah Bilangan
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10, 11]]
---
Susun baris berikut jadi program yang mencetak jumlah semua digit dari `3045`.

```c
#include <stdio.h>
int main(void) {
  int n = 3045;
  int jumlah = 0;
  while (n > 0) {
    jumlah += n % 10;
    n /= 10;
  }
  printf("%d\n", jumlah);
  return 0;
}
```

---
part: logika
lang: c
format: order
title: Pangkat dengan Perulangan
sample: true
status: ready
---
Susun baris berikut jadi program yang mencetak 3 pangkat 4.

```c
#include <stdio.h>
int main(void) {
  int hasil = 1;
  for (int i = 0; i < 4; i++) {
    hasil *= 3;
  }
  printf("%d\n", hasil);
  return 0;
}
```

---
part: logika
lang: c
format: order
title: Rata-rata Bulat Array
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10]]
---
Susun baris berikut jadi program yang mencetak rata-rata bulat isi array.

```c
#include <stdio.h>
int main(void) {
  int a[4] = {6, 8, 10, 12};
  int jumlah = 0;
  for (int i = 0; i < 4; i++) {
    jumlah += a[i];
  }
  printf("%d\n", jumlah / 4);
  return 0;
}
```

---
part: logika
lang: c
format: order
title: Hitung Bilangan Positif
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12]]
---
Susun baris berikut jadi program yang menghitung ada berapa bilangan positif di array.

```c
#include <stdio.h>
int main(void) {
  int a[6] = {3, -1, 4, -5, 2, 0};
  int positif = 0;
  for (int i = 0; i < 6; i++) {
    if (a[i] > 0) {
      positif++;
    }
  }
  printf("%d\n", positif);
  return 0;
}
```

---
part: logika
lang: c
format: match
title: Urutan Operasi
sample: true
status: ready
---
Pasangkan tiap ekspresi C dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `2 + 3 * 4` | `14` |
| `(2 + 3) * 4` | `20` |
| `10 - 2 - 3` | `5` |
| `20 / 4 / 2` | `2` |
| `9 % 4 * 3` | `3` |
|  | `1` |

---
part: logika
lang: c
format: match
title: Istilah Fungsi
sample: true
status: ready
---
Pasangkan tiap istilah dengan artinya.

| Istilah | Arti |
|---|---|
| parameter | Variabel di tanda kurung yang menerima nilai saat fungsi dipanggil |
| return | Mengirim sebuah nilai balik dari fungsi ke pemanggilnya |
| void | Tipe fungsi yang tidak mengembalikan nilai |
| rekursi | Fungsi yang memanggil dirinya sendiri |
| prototype | Deklarasi fungsi yang ditulis sebelum isinya |
|  | Perulangan yang selalu jalan minimal satu kali |

---
part: logika
lang: c
format: match
title: Kode Format printf
sample: true
status: ready
---
Pasangkan tiap kode format `printf` dengan yang dicetaknya.

| Kode | Mencetak |
|---|---|
| `%d` | Bilangan bulat |
| `%f` | Bilangan desimal |
| `%c` | Satu karakter |
| `%s` | Teks (string) |
| `%%` | Tanda persen itu sendiri |
|  | Bilangan bulat panjang (long) |
