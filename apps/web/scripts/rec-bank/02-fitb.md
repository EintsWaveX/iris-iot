---
part: fitb
lang: c
format: fitb
title: Cari Nilai Terkecil
sample: true
status: ready
blanks:
  1: { accept: ["a[0]"], space: none }
  2: { accept: ["<"], space: none }
  3: { accept: ["min"] }
---
Lengkapi program yang mencari nilai terkecil di array. Baris terakhir mencetak `1`.

```c
#include <stdio.h>

int main(void) {
  int a[5] = {8, 3, 9, 1, 6};
  int min = __(1)__;
  for (int i = 1; i < 5; i++) {
    if (a[i] __(2)__ min) {
      min = a[i];
    }
  }
  printf("%d\n", __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Balik Isi Array
sample: true
status: ready
blanks:
  1: { accept: ["2"] }
  2: { accept: ["3-i", "3 - i"], space: none }
  3: { accept: ["3-i", "3 - i"], space: none }
---
Lengkapi program yang membalik isi array dengan menukar elemen dari ujung ke ujung. Baris terakhir mencetak `4 3 2 1`.

```c
#include <stdio.h>

int main(void) {
  int a[4] = {1, 2, 3, 4};
  for (int i = 0; i < __(1)__; i++) {
    int t = a[i];
    a[i] = a[__(2)__];
    a[__(3)__] = t;
  }
  for (int i = 0; i < 4; i++) {
    printf("%d ", a[i]);
  }
  printf("\n");
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Faktorial dengan Fungsi
sample: true
status: ready
blanks:
  1: { accept: ["1"] }
  2: { accept: ["*="], space: none }
  3: { accept: ["hasil"] }
---
Lengkapi fungsi yang menghitung faktorial. Baris terakhir mencetak `120`.

```c
#include <stdio.h>

int faktorial(int n) {
  int hasil = __(1)__;
  for (int i = 2; i <= n; i++) {
    hasil __(2)__ i;
  }
  return __(3)__;
}

int main(void) {
  printf("%d\n", faktorial(5));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Jumlah Digit
sample: true
status: ready
blanks:
  1: { accept: [">"], space: none }
  2: { accept: ["%"], space: none }
  3: { accept: ["/"], space: none }
---
Lengkapi program yang menjumlahkan semua digit dari sebuah bilangan. Baris terakhir mencetak `20`.

```c
#include <stdio.h>

int main(void) {
  int n = 2468;
  int jumlah = 0;
  while (n __(1)__ 0) {
    jumlah += n __(2)__ 10;
    n = n __(3)__ 10;
  }
  printf("%d\n", jumlah);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Cek Bilangan Prima
sample: true
status: ready
blanks:
  1: { accept: ["%"], space: none }
  2: { accept: ["0"] }
  3: { accept: ["1"] }
---
Lengkapi fungsi yang mengembalikan 1 kalau bilangannya prima dan 0 kalau bukan. Baris terakhir mencetak `1 0`.

```c
#include <stdio.h>

int prima(int n) {
  if (n < 2) return 0;
  for (int i = 2; i * i <= n; i++) {
    if (n __(1)__ i == 0) return __(2)__;
  }
  return __(3)__;
}

int main(void) {
  printf("%d %d\n", prima(13), prima(15));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: FPB dengan Euclid
sample: true
status: ready
blanks:
  1: { accept: ["0"] }
  2: { accept: ["%"], space: none }
  3: { accept: ["sisa"] }
---
Lengkapi fungsi yang mencari FPB (faktor persekutuan terbesar) dua bilangan. Baris terakhir mencetak `6`.

```c
#include <stdio.h>

int fpb(int a, int b) {
  while (b != __(1)__) {
    int sisa = a __(2)__ b;
    a = b;
    b = __(3)__;
  }
  return a;
}

int main(void) {
  printf("%d\n", fpb(48, 18));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Hitung Kemunculan
sample: true
status: ready
blanks:
  1: { accept: ["7"] }
  2: { accept: ["=="], space: none }
  3: { accept: ["hitung++", "++hitung", "hitung+=1", "hitung=hitung+1"], space: none }
---
Lengkapi program yang menghitung berapa kali angka `x` muncul di array. Baris terakhir mencetak `3`.

```c
#include <stdio.h>

int main(void) {
  int a[7] = {3, 5, 3, 8, 3, 5, 1};
  int x = 3;
  int hitung = 0;
  for (int i = 0; i < __(1)__; i++) {
    if (a[i] __(2)__ x) {
      __(3)__;
    }
  }
  printf("%d\n", hitung);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Salin Array
sample: true
status: ready
blanks:
  1: { accept: ["i"] }
  2: { accept: ["i"] }
  3: { accept: ["jumlah"] }
---
Lengkapi program yang menyalin isi array `a` ke array `b`, lalu mencetak jumlah isi `b`. Baris terakhir mencetak `15`.

```c
#include <stdio.h>

int main(void) {
  int a[4] = {7, 1, 5, 2};
  int b[4];
  for (int i = 0; i < 4; i++) {
    b[__(1)__] = a[__(2)__];
  }
  int jumlah = 0;
  for (int i = 0; i < 4; i++) {
    jumlah += b[i];
  }
  printf("%d\n", __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Array Dua Dimensi
sample: true
status: ready
blanks:
  1: { accept: ["2"] }
  2: { accept: ["3"] }
  3: { accept: ["i"] }
---
Lengkapi program yang menjumlahkan semua isi array 2 baris x 3 kolom. Baris terakhir mencetak `21`.

```c
#include <stdio.h>

int main(void) {
  int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
  int jumlah = 0;
  for (int i = 0; i < __(1)__; i++) {
    for (int j = 0; j < __(2)__; j++) {
      jumlah += m[__(3)__][j];
    }
  }
  printf("%d\n", jumlah);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Cetak Segitiga
sample: true
status: ready
blanks:
  1: { accept: ["1"] }
  2: { accept: ["i"] }
  3: { accept: ["printf"] }
---
Lengkapi program yang mencetak tiga baris bintang: 1 bintang, lalu 2, lalu 3.

```c
#include <stdio.h>

int main(void) {
  for (int i = __(1)__; i <= 3; i++) {
    for (int j = 1; j <= __(2)__; j++) {
      printf("*");
    }
    __(3)__("\n");
  }
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Genap atau Ganjil
sample: true
status: ready
blanks:
  1: { accept: ["%"], space: none }
  2: { accept: ["0"] }
  3: { accept: ["else"] }
---
Lengkapi program yang mencetak `genap` atau `ganjil`. Outputnya `ganjil` lalu `genap`.

```c
#include <stdio.h>

void cek(int n) {
  if (n __(1)__ 2 == __(2)__) {
    printf("genap\n");
  } __(3)__ {
    printf("ganjil\n");
  }
}

int main(void) {
  cek(7);
  cek(10);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Hitung Mundur
sample: true
status: ready
blanks:
  1: { accept: [">"], space: none }
  2: { accept: ["--"], space: none }
  3: { accept: ["0"] }
---
Lengkapi program yang menghitung mundur dari 5 sampai 1. Baris terakhir mencetak `5 4 3 2 1`.

```c
#include <stdio.h>

int main(void) {
  int n = 5;
  while (n __(1)__ 0) {
    printf("%d ", n);
    n__(2)__;
  }
  printf("\n");
  return __(3)__;
}
```

---
part: fitb
lang: c
format: fitb
title: Tukar Dua Nilai
sample: true
status: ready
blanks:
  1: { accept: ["x"] }
  2: { accept: ["y"] }
  3: { accept: ["t"] }
---
Lengkapi program yang menukar isi `x` dan `y`. Baris terakhir mencetak `9 4`.

```c
#include <stdio.h>

int main(void) {
  int x = 4;
  int y = 9;
  int t = __(1)__;
  x = __(2)__;
  y = __(3)__;
  printf("%d %d\n", x, y);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Rata-rata Array Desimal
sample: true
status: ready
blanks:
  1: { accept: ["jumlah"] }
  2: { accept: ["5"] }
  3: { accept: ["rata"] }
---
Lengkapi program yang menghitung rata-rata nilai dengan hasil desimal. Baris terakhir mencetak `78.0`.

```c
#include <stdio.h>

int main(void) {
  int a[5] = {70, 85, 90, 65, 80};
  int jumlah = 0;
  for (int i = 0; i < 5; i++) {
    jumlah += a[i];
  }
  float rata = (float)__(1)__ / __(2)__;
  printf("%.1f\n", __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Deret Fibonacci
sample: true
status: ready
blanks:
  1: { accept: ["b"] }
  2: { accept: ["c"] }
  3: { accept: ["0"] }
---
Lengkapi program yang mencetak 6 angka pertama deret Fibonacci. Baris terakhir mencetak `0 1 1 2 3 5`.

```c
#include <stdio.h>

int main(void) {
  int a = 0;
  int b = 1;
  for (int i = 0; i < 6; i++) {
    printf("%d ", a);
    int c = a + b;
    a = __(1)__;
    b = __(2)__;
  }
  printf("\n");
  return __(3)__;
}
```

---
part: fitb
lang: c
format: fitb
title: Cari Index di Array
sample: true
status: ready
blanks:
  1: { accept: ["i"] }
  2: { accept: ["-1"], space: none }
  3: { accept: ["5"] }
---
Lengkapi fungsi yang mengembalikan index sebuah angka di array, atau -1 kalau angkanya tidak ada. Baris terakhir mencetak `2 -1`.

```c
#include <stdio.h>

int cari(int a[], int n, int x) {
  for (int i = 0; i < n; i++) {
    if (a[i] == x) {
      return __(1)__;
    }
  }
  return __(2)__;
}

int main(void) {
  int a[5] = {4, 8, 15, 16, 23};
  printf("%d %d\n", cari(a, __(3)__, 15), cari(a, 5, 99));
  return 0;
}
```


---
part: fitb
lang: c
format: fitb
title: Jumlah Angka Genap
sample: true
status: ready
blanks:
  1: { accept: ["6"] }
  2: { accept: ["%"], space: none }
  3: { accept: ["i"] }
---
Lengkapi program yang menjumlahkan semua angka genap di array. Baris terakhir mencetak `12`.

```c
#include <stdio.h>

int main(void) {
  int a[6] = {2, 7, 4, 9, 6, 1};
  int jumlah = 0;
  for (int i = 0; i < __(1)__; i++) {
    if (a[i] __(2)__ 2 == 0) {
      jumlah += a[__(3)__];
    }
  }
  printf("%d\n", jumlah);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Pangkat dengan Loop
sample: true
status: ready
blanks:
  1: { accept: ["1"] }
  2: { accept: ["n"] }
  3: { accept: ["*="], space: none }
---
Lengkapi fungsi yang menghitung `x` pangkat `n` dengan perulangan. Baris terakhir mencetak `32`.

```c
#include <stdio.h>

int pangkat(int x, int n) {
  int hasil = __(1)__;
  for (int i = 0; i < __(2)__; i++) {
    hasil __(3)__ x;
  }
  return hasil;
}

int main(void) {
  printf("%d\n", pangkat(2, 5));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Pilih yang Lebih Besar
sample: true
status: ready
blanks:
  1: { accept: [">"], space: none }
  2: { accept: ["b"] }
  3: { accept: ["15"] }
---
Lengkapi fungsi yang mengembalikan angka yang lebih besar dari dua angka. Baris terakhir mencetak `9 15`.

```c
#include <stdio.h>

int maks(int a, int b) {
  if (a __(1)__ b) return a;
  return __(2)__;
}

int main(void) {
  printf("%d %d\n", maks(4, 9), maks(__(3)__, 3));
  return 0;
}
```


---
part: fitb
lang: c
format: fitb
title: Hitung Genap dan Ganjil
sample: true
status: ready
blanks:
  1: { accept: ["0"] }
  2: { accept: ["ganjil"] }
  3: { accept: ["ganjil"] }
---
Lengkapi program yang menghitung berapa angka genap dan berapa angka ganjil di array. Baris terakhir mencetak `3 4`.

```c
#include <stdio.h>

int main(void) {
  int a[7] = {4, 9, 2, 7, 6, 3, 5};
  int genap = 0;
  int ganjil = 0;
  for (int i = 0; i < 7; i++) {
    if (a[i] % 2 == __(1)__) {
      genap++;
    } else {
      __(2)__++;
    }
  }
  printf("%d %d\n", genap, __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Nilai Mutlak
sample: true
status: ready
blanks:
  1: { accept: ["<"], space: none }
  2: { accept: ["-"], space: none }
  3: { accept: ["x"] }
---
Lengkapi fungsi yang mengembalikan nilai mutlak sebuah angka. Baris terakhir mencetak `8 5`.

```c
#include <stdio.h>

int mutlak(int x) {
  if (x __(1)__ 0) {
    return __(2)__x;
  }
  return __(3)__;
}

int main(void) {
  printf("%d %d\n", mutlak(-8), mutlak(5));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Jumlah 1 sampai N
sample: true
status: ready
blanks:
  1: { accept: ["1"] }
  2: { accept: ["<="], space: none }
  3: { accept: ["i++", "++i", "i+=1", "i=i+1"], space: none }
---
Lengkapi program yang menjumlahkan semua angka dari 1 sampai `n` dengan `while`. Baris terakhir mencetak `55`.

```c
#include <stdio.h>

int main(void) {
  int n = 10;
  int jumlah = 0;
  int i = __(1)__;
  while (i __(2)__ n) {
    jumlah += i;
    __(3)__;
  }
  printf("%d\n", jumlah);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Terbesar dari Tiga Angka
sample: true
status: ready
blanks:
  1: { accept: [">"], space: none }
  2: { accept: ["b"] }
  3: { accept: ["c"] }
---
Lengkapi fungsi yang mengembalikan angka terbesar dari tiga angka. Baris terakhir mencetak `11`.

```c
#include <stdio.h>

int maks3(int a, int b, int c) {
  int m = a;
  if (b __(1)__ m) m = __(2)__;
  if (c > m) m = __(3)__;
  return m;
}

int main(void) {
  printf("%d\n", maks3(4, 11, 7));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Kelipatan Tiga
sample: true
status: ready
blanks:
  1: { accept: ["4"] }
  2: { accept: ["*"], space: none }
  3: { accept: ["0"] }
---
Lengkapi program yang mencetak empat angka kelipatan 3 yang pertama. Baris terakhir mencetak `3 6 9 12`.

```c
#include <stdio.h>

int main(void) {
  for (int i = 1; i <= __(1)__; i++) {
    printf("%d ", 3 __(2)__ i);
  }
  printf("\n");
  return __(3)__;
}
```

---
part: fitb
lang: c
format: fitb
title: Panjang String
sample: true
status: ready
blanks:
  1: { accept: ["!="], space: none }
  2: { accept: ["n++", "++n", "n+=1", "n=n+1"], space: none }
  3: { accept: ["n"] }
---
Lengkapi program yang menghitung panjang sebuah string tanpa `strlen`. Baris terakhir mencetak `8`.

```c
#include <stdio.h>

int main(void) {
  char s[] = "komputer";
  int n = 0;
  while (s[n] __(1)__ '\0') {
    __(2)__;
  }
  printf("%d\n", __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Huruf Besar ke Huruf Kecil
sample: true
status: ready
blanks:
  1: { accept: ["!="], space: none }
  2: { accept: ["'Z'"], space: none }
  3: { accept: ["'A'"], space: none }
---
Lengkapi program yang mengubah semua huruf besar di string jadi huruf kecil. Baris terakhir mencetak `iris`.

```c
#include <stdio.h>

int main(void) {
  char s[] = "IRIS";
  for (int i = 0; s[i] __(1)__ '\0'; i++) {
    if (s[i] >= 'A' && s[i] <= __(2)__) {
      s[i] = s[i] + ('a' - __(3)__);
    }
  }
  printf("%s\n", s);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Faktorial dengan Rekursi
sample: true
status: ready
blanks:
  1: { accept: ["<=", "=="], space: none }
  2: { accept: ["n-1", "n - 1"], space: none }
  3: { accept: ["5"] }
---
Lengkapi fungsi rekursif yang menghitung faktorial. Baris terakhir mencetak `120`.

```c
#include <stdio.h>

int fakt(int n) {
  if (n __(1)__ 1) return 1;
  return n * fakt(__(2)__);
}

int main(void) {
  printf("%d\n", fakt(__(3)__));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Deret Aritmatika
sample: true
status: ready
blanks:
  1: { accept: ["+="], space: none }
  2: { accept: ["5"] }
  3: { accept: ["0"] }
---
Lengkapi program yang mencetak lima suku deret yang naik 4 tiap suku. Baris terakhir mencetak `3 7 11 15 19`.

```c
#include <stdio.h>

int main(void) {
  int a = 3;
  for (int i = 0; i < __(2)__; i++) {
    printf("%d ", a);
    a __(1)__ 4;
  }
  printf("\n");
  return __(3)__;
}
```

---
part: fitb
lang: c
format: fitb
title: Jumlahkan Dua Array
sample: true
status: ready
blanks:
  1: { accept: ["i"] }
  2: { accept: ["+"], space: none }
  3: { accept: ["3"] }
---
Lengkapi program yang menjumlahkan dua array elemen demi elemen ke array `c`. Baris terakhir mencetak `11 44`.

```c
#include <stdio.h>

int main(void) {
  int a[4] = {1, 2, 3, 4};
  int b[4] = {10, 20, 30, 40};
  int c[4];
  for (int i = 0; i < 4; i++) {
    c[__(1)__] = a[i] __(2)__ b[i];
  }
  printf("%d %d\n", c[0], c[__(3)__]);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Terbesar di Array Dua Dimensi
sample: true
status: ready
blanks:
  1: { accept: ["3"] }
  2: { accept: [">"], space: none }
  3: { accept: ["i"] }
---
Lengkapi program yang mencari angka terbesar di array 2 baris x 3 kolom. Baris terakhir mencetak `9`.

```c
#include <stdio.h>

int main(void) {
  int m[2][3] = {{4, 9, 2}, {7, 1, 8}};
  int maks = m[0][0];
  for (int i = 0; i < 2; i++) {
    for (int j = 0; j < __(1)__; j++) {
      if (m[i][j] __(2)__ maks) {
        maks = m[__(3)__][j];
      }
    }
  }
  printf("%d\n", maks);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Celsius ke Fahrenheit
sample: true
status: ready
blanks:
  1: { accept: ["9", "9.0"] }
  2: { accept: ["32", "32.0"] }
  3: { accept: ["f"] }
---
Lengkapi program yang mengubah suhu Celsius ke Fahrenheit dengan rumus `C x 9 / 5 + 32`. Baris terakhir mencetak `77.0`.

```c
#include <stdio.h>

int main(void) {
  float c = 25.0;
  float f = c * __(1)__ / 5 + __(2)__;
  printf("%.1f\n", __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Fungsi Void
sample: true
status: ready
blanks:
  1: { accept: ["sapa"] }
  2: { accept: ["void"] }
  3: { accept: ["3"] }
---
Lengkapi program yang memanggil fungsi `sapa` untuk mencetak "Hai" beberapa kali. Baris terakhir mencetak `Hai Hai Hai`.

```c
#include <stdio.h>

__(2)__ sapa(int n) {
  for (int i = 0; i < n; i++) {
    printf("Hai ");
  }
  printf("\n");
}

int main(void) {
  __(1)__(__(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Tahun Kabisat
sample: true
status: ready
blanks:
  1: { accept: ["0"] }
  2: { accept: ["=="], space: none }
  3: { accept: ["0"] }
---
Lengkapi fungsi yang mengembalikan 1 kalau sebuah tahun kabisat dan 0 kalau bukan. Baris terakhir mencetak `1 0 1`.

```c
#include <stdio.h>

int kabisat(int t) {
  if (t % 400 == 0) return 1;
  if (t % 100 == 0) return __(1)__;
  if (t % 4 __(2)__ 0) return 1;
  return __(3)__;
}

int main(void) {
  printf("%d %d %d\n", kabisat(2000), kabisat(1900), kabisat(2024));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Tukar Ujung Array
sample: true
status: ready
blanks:
  1: { accept: ["4"] }
  2: { accept: ["4"] }
  3: { accept: ["5"] }
---
Lengkapi program yang menukar elemen pertama dan terakhir array. Baris terakhir mencetak `5 2 3 4 1`.

```c
#include <stdio.h>

int main(void) {
  int a[5] = {1, 2, 3, 4, 5};
  int t = a[0];
  a[0] = a[__(1)__];
  a[__(2)__] = t;
  for (int i = 0; i < __(3)__; i++) {
    printf("%d ", a[i]);
  }
  printf("\n");
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Total Belanja
sample: true
status: ready
blanks:
  1: { accept: ["*"], space: none }
  2: { accept: ["i"] }
  3: { accept: ["total"] }
---
Lengkapi program yang menghitung total belanja dari harga dan jumlah tiap barang. Baris terakhir mencetak `Total: 6800`.

```c
#include <stdio.h>

int main(void) {
  int harga[3] = {1200, 800, 500};
  int jumlah[3] = {2, 3, 4};
  int total = 0;
  for (int i = 0; i < 3; i++) {
    total += harga[i] __(1)__ jumlah[__(2)__];
  }
  printf("Total: %d\n", __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Cek Angka Ada di Array
sample: true
status: ready
blanks:
  1: { accept: ["1"] }
  2: { accept: ["0"] }
  3: { accept: ["5"] }
---
Lengkapi fungsi yang mengembalikan 1 kalau sebuah angka ada di array dan 0 kalau tidak ada. Baris terakhir mencetak `1 0`.

```c
#include <stdio.h>

int ada(int a[], int n, int x) {
  for (int i = 0; i < n; i++) {
    if (a[i] == x) {
      return __(1)__;
    }
  }
  return __(2)__;
}

int main(void) {
  int a[5] = {3, 7, 1, 9, 4};
  printf("%d %d\n", ada(a, 5, 7), ada(a, __(3)__, 10));
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Segitiga Terbalik
sample: true
status: ready
blanks:
  1: { accept: [">="], space: none }
  2: { accept: ["i"] }
  3: { accept: ["i--", "--i", "i-=1", "i=i-1"], space: none }
---
Lengkapi program yang mencetak tiga baris bintang: 3 bintang, lalu 2, lalu 1.

```c
#include <stdio.h>

int main(void) {
  for (int i = 3; i __(1)__ 1; __(3)__) {
    for (int j = 1; j <= __(2)__; j++) {
      printf("*");
    }
    printf("\n");
  }
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Detik ke Menit
sample: true
status: ready
blanks:
  1: { accept: ["/"], space: none }
  2: { accept: ["%"], space: none }
  3: { accept: ["sisa"] }
---
Lengkapi program yang memecah 275 detik jadi menit dan sisa detik. Baris terakhir mencetak `4 menit 35 detik`.

```c
#include <stdio.h>

int main(void) {
  int detik = 275;
  int menit = detik __(1)__ 60;
  int sisa = detik __(2)__ 60;
  printf("%d menit %d detik\n", menit, __(3)__);
  return 0;
}
```

---
part: fitb
lang: c
format: fitb
title: Kelipatan Tiga dengan Continue
sample: true
status: ready
blanks:
  1: { accept: ["!="], space: none }
  2: { accept: ["continue"] }
  3: { accept: ["s"] }
---
Lengkapi program yang menjumlahkan hanya angka kelipatan 3 dari 1 sampai 10. Baris terakhir mencetak `18`.

```c
#include <stdio.h>

int main(void) {
  int s = 0;
  for (int i = 1; i <= 10; i++) {
    if (i % 3 __(1)__ 0) {
      __(2)__;
    }
    s += i;
  }
  printf("%d\n", __(3)__);
  return 0;
}
```
