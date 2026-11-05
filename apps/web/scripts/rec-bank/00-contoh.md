---
part: fitb
lang: c
format: fitb
title: Jumlah Elemen Array
sample: true
status: ready
blanks:
  1: { accept: ["a[0]", "int"], space: none }
  2: { accept: ["n", "5"] }
  3: { accept: ["jumlah"] }
---
Lengkapi program yang menjumlahkan semua isi array. Baris terakhir mencetak `45`.

```c
#include <stdio.h>

int main(void) {
  int a[5] = {3, 6, 9, 12, 15};
  int n = sizeof(a) / sizeof(__(1)__);
  int jumlah = 0;
  for (int i = 0; i < __(2)__; i++) {
    jumlah += a[i];
  }
  printf("%d\n", __(3)__);
  return 0;
}
```

---
part: kodingan
lang: c
format: lines
title: Rata-rata Array
sample: true
status: ready
bugs: [4, 5]
---
Fungsi ini harus mengembalikan rata-rata bulat dari `n` angka di array. Klik baris yang salah.

```c
#include <stdio.h>

int rata(int a[], int n) {
  int jumlah;
  for (int i = 0; i <= n; i++) {
    jumlah += a[i];
  }
  return jumlah / n;
}
```

---
part: kodingan
lang: c
format: fix
title: Cetak Array Terbalik
sample: true
status: ready
---
Program ini harus mencetak isi array dari belakang ke depan (`6 9 2 8 5`). Pilih isi yang benar untuk tiap baris yang ditandai.

```c
#include <stdio.h>

int main(void) {
  int a[5] = {5, 8, 2, 9, 6};
  int n = sizeof(a);
  for (int i = 0; i < n; i++) {
    printf("%d ", i);
  }
  printf("\n");
  return 0;
}
```

### Baris 5
- [ ] `  int n = sizeof(a);`
- [x] `  int n = sizeof(a) / sizeof(a[0]);`
- [ ] `  int n = sizeof(a[0]);`

### Baris 6
- [ ] `  for (int i = 0; i < n; i++) {`
- [x] `  for (int i = n - 1; i >= 0; i--) {`
- [ ] `  for (int i = n; i >= 0; i--) {`

### Baris 7
- [ ] `    printf("%d ", i);`
- [x] `    printf("%d ", a[i]);`
- [ ] `    printf("%d ", a[n - i]);`
