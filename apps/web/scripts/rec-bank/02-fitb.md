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
