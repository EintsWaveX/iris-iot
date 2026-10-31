---
part: kodingan
lang: c
format: lines
title: Nilai Tertinggi
sample: true
status: ready
bugs: [2]
---
Fungsi ini harus mengembalikan nilai tertinggi di array, termasuk kalau semua angkanya negatif. Klik baris yang salah.

```c
int tertinggi(int a[], int n) {
  int maks = 0;
  for (int i = 0; i < n; i++) {
    if (a[i] > maks) maks = a[i];
  }
  return maks;
}
```

---
part: kodingan
lang: c
format: lines
title: Cari Index Pertama
sample: true
status: ready
bugs: [3, 7]
---
Fungsi ini harus mengembalikan index pertama dari `x` di array, atau -1 kalau `x` tidak ada. Klik baris yang salah.

```c
int cari(int a[], int n, int x) {
  for (int i = 0; i < n; i++) {
    if (a[i] = x) {
      return i;
    }
  }
  return 0;
}
```

---
part: kodingan
lang: c
format: lines
title: Hitung Bilangan Genap
sample: true
status: ready
bugs: [3, 4]
---
Fungsi ini harus menghitung ada berapa bilangan genap di array. Klik baris yang salah.

```c
int hitungGenap(int a[], int n) {
  int genap = 0;
  for (int i = 1; i < n; i++) {
    if (a[i] % 2 == 1) {
      genap++;
    }
  }
  return genap;
}
```

---
part: kodingan
lang: c
format: lines
title: Salin Array ke Array Lain
sample: true
status: ready
bugs: [2, 3]
---
Fungsi ini harus menyalin isi array `a` ke array `b`. Klik baris yang salah.

```c
void salin(int a[], int b[], int n) {
  for (int i = 0; i <= n; i++) {
    a[i] = b[i];
  }
}
```

---
part: kodingan
lang: c
format: lines
title: Balik Array di Tempat
sample: true
status: ready
bugs: [2, 4]
---
Fungsi ini harus membalik isi array di tempat, tanpa array tambahan. Klik baris yang salah.

```c
void balik(int a[], int n) {
  for (int i = 0; i < n; i++) {
    int t = a[i];
    a[i] = a[n - i];
    a[n - 1 - i] = t;
  }
}
```

---
part: kodingan
lang: c
format: lines
title: Jumlah Bilangan Positif
sample: true
status: ready
bugs: [6]
---
Fungsi ini harus menjumlahkan hanya angka yang lebih besar dari 0. Klik baris yang salah.

```c
int jumlahPositif(int a[], int n) {
  int jumlah = 0;
  for (int i = 0; i < n; i++) {
    if (a[i] > 0)
      jumlah += a[i];
      jumlah++;
  }
  return jumlah;
}
```

---
part: kodingan
lang: c
format: lines
title: Cetak Segitiga Angka
sample: true
status: ready
bugs: [5]
---
Program ini harus mencetak segitiga angka: `1`, lalu `12`, lalu `123`. Klik baris yang salah.

```c
#include <stdio.h>

int main(void) {
  for (int i = 1; i <= 3; i++) {
    for (int j = 1; j <= 3; j++) {
      printf("%d", j);
    }
    printf("\n");
  }
  return 0;
}
```

---
part: kodingan
lang: c
format: fix
title: Hitung Kemunculan
sample: true
status: ready
---
Fungsi ini harus menghitung berapa kali `x` muncul di array (di `main`, hasilnya `4`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int hitung(int a[], int n, int x) {
  int c = 1;
  for (int i = 0; i < n; i++) {
    if (a[i] = x) c++;
  }
  return n;
}

int main(void) {
  int a[6] = {5, 1, 5, 5, 2, 5};
  printf("%d\n", hitung(a, 6, 5));
  return 0;
}
```

### Baris 4
- [ ] `  int c = 1;`
- [x] `  int c = 0;`
- [ ] `  int c = -1;`

### Baris 6
- [ ] `    if (a[i] = x) c++;`
- [x] `    if (a[i] == x) c++;`
- [ ] `    if (i == x) c++;`

### Baris 8
- [ ] `  return n;`
- [x] `  return c;`
- [ ] `  return x;`

---
part: kodingan
lang: c
format: fix
title: Jumlah Elemen Genap
sample: true
status: ready
---
Program ini harus menjumlahkan semua angka genap di array (hasilnya `22`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int main(void) {
  int a[6] = {4, 7, 10, 3, 8, 5};
  int jumlah = 1;
  for (int i = 0; i < 6; i++) {
    if (a[i] % 2 == 1) {
      jumlah = a[i];
    }
  }
  printf("%d\n", jumlah);
  return 0;
}
```

### Baris 5
- [ ] `  int jumlah = 1;`
- [x] `  int jumlah = 0;`
- [ ] `  int jumlah = a[0];`

### Baris 7
- [ ] `    if (a[i] % 2 == 1) {`
- [x] `    if (a[i] % 2 == 0) {`
- [ ] `    if (a[i] / 2 == 0) {`

### Baris 8
- [ ] `      jumlah = a[i];`
- [x] `      jumlah += a[i];`
- [ ] `      jumlah += i;`

---
part: kodingan
lang: c
format: fix
title: Cari Nilai Terkecil
sample: true
status: ready
---
Program ini harus mencetak nilai terkecil di array (`3`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int main(void) {
  int a[5] = {5, 8, 3, 9, 6};
  int min = 0;
  for (int i = 1; i < 5; i++) {
    if (a[i] > min) {
      min = i;
    }
  }
  printf("%d\n", min);
  return 0;
}
```

### Baris 5
- [ ] `  int min = 0;`
- [x] `  int min = a[0];`
- [ ] `  int min = -1;`

### Baris 7
- [ ] `    if (a[i] > min) {`
- [x] `    if (a[i] < min) {`
- [ ] `    if (a[i] != min) {`

### Baris 8
- [ ] `      min = i;`
- [x] `      min = a[i];`
- [ ] `      min += a[i];`

---
part: kodingan
lang: c
format: fix
title: Rata-rata Nilai Desimal
sample: true
status: ready
---
Program ini harus mencetak rata-rata empat nilai dengan satu angka di belakang koma (`76.5`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int main(void) {
  int a[4] = {80, 71, 90, 65};
  int jumlah = 0;
  for (int i = 1; i < 4; i++) {
    jumlah += a[i];
  }
  float rata = jumlah / 4;
  printf("%.0f\n", rata);
  return 0;
}
```

### Baris 6
- [ ] `  for (int i = 1; i < 4; i++) {`
- [x] `  for (int i = 0; i < 4; i++) {`
- [ ] `  for (int i = 0; i < 3; i++) {`

### Baris 9
- [ ] `  float rata = jumlah / 4;`
- [x] `  float rata = jumlah / 4.0;`
- [ ] `  float rata = jumlah / 3.0;`

### Baris 10
- [ ] `  printf("%.0f\n", rata);`
- [x] `  printf("%.1f\n", rata);`
- [ ] `  printf("%.2f\n", rata);`

---
part: kodingan
lang: c
format: fix
title: Jumlah Digit dengan While
sample: true
status: ready
---
Program ini harus menjumlahkan semua digit dari 1357 (hasilnya `16`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int main(void) {
  int n = 1357;
  int jumlah = 1;
  while (n >= 0) {
    jumlah += n / 10;
    n = n / 10;
  }
  printf("%d\n", jumlah);
  return 0;
}
```

### Baris 5
- [ ] `  int jumlah = 1;`
- [x] `  int jumlah = 0;`
- [ ] `  int jumlah = 10;`

### Baris 6
- [ ] `  while (n >= 0) {`
- [x] `  while (n > 0) {`
- [ ] `  while (n > 10) {`

### Baris 7
- [ ] `    jumlah += n / 10;`
- [x] `    jumlah += n % 10;`
- [ ] `    jumlah += n;`

---
part: kodingan
lang: c
format: fix
title: Cek Bilangan Prima
sample: true
status: ready
---
Fungsi ini harus mengembalikan 1 kalau bilangannya prima dan 0 kalau bukan (di `main`, hasilnya `0 1 0`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int prima(int n) {
  if (n < 2) return 1;
  for (int i = 2; i <= n; i++) {
    if (n % i == 1) return 0;
  }
  return 1;
}

int main(void) {
  printf("%d %d %d\n", prima(1), prima(7), prima(4));
  return 0;
}
```

### Baris 4
- [ ] `  if (n < 2) return 1;`
- [x] `  if (n < 2) return 0;`
- [ ] `  if (n < 1) return 0;`

### Baris 5
- [ ] `  for (int i = 2; i <= n; i++) {`
- [x] `  for (int i = 2; i < n; i++) {`
- [ ] `  for (int i = 3; i < n; i++) {`

### Baris 6
- [ ] `    if (n % i == 1) return 0;`
- [x] `    if (n % i == 0) return 0;`
- [ ] `    if (n / i == 0) return 0;`

---
part: kodingan
lang: c
format: fix
title: Urutkan Array Naik
sample: true
status: ready
---
Program ini harus mengurutkan array dari yang terkecil (hasilnya `1 4 7 9`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int main(void) {
  int a[4] = {9, 4, 7, 1};
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 2 - i; j++) {
      if (a[j] < a[j + 1]) {
        int t = a[j];
        a[j] = t;
        a[j + 1] = t;
      }
    }
  }
  for (int i = 0; i < 4; i++) printf("%d ", a[i]);
  printf("\n");
  return 0;
}
```

### Baris 6
- [ ] `    for (int j = 0; j < 2 - i; j++) {`
- [x] `    for (int j = 0; j < 3 - i; j++) {`
- [ ] `    for (int j = 0; j < 1; j++) {`

### Baris 7
- [ ] `      if (a[j] < a[j + 1]) {`
- [x] `      if (a[j] > a[j + 1]) {`
- [ ] `      if (a[j] != a[j + 1]) {`

### Baris 9
- [ ] `        a[j] = t;`
- [x] `        a[j] = a[j + 1];`
- [ ] `        a[j] = a[j + 1] + 1;`
