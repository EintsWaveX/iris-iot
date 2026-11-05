---
part: logika
lang: c
format: single
title: Timer Tanpa Delay
sample: true
status: ready
---
Sebuah board mengirim data kalau jarak waktu dari kiriman terakhir sudah cukup. Waktu di array ini dalam milidetik. Berapa output program ini?

```c
#include <stdio.h>
#define SEND_INTERVAL 1000

int main(void) {
  unsigned long waktu[] = {0, 400, 1000, 1500, 2100, 3000, 3200};
  unsigned long previousSendTime = 0;
  int kirim = 0;
  for (int i = 0; i < 7; i++) {
    if (waktu[i] - previousSendTime >= SEND_INTERVAL) {
      previousSendTime = waktu[i];
      kirim++;
    }
  }
  printf("%d\n", kirim);
  return 0;
}
```

- [ ] 2
- [x] 3
- [ ] 4
- [ ] 7

---
part: logika
lang: c
format: single
title: Counter Kiriman
sample: true
status: ready
---
Counter ini naik setelah tiap pesan dicetak. Berapa output program ini?

```c
int counter = 3;
for (int i = 0; i < 3; i++) {
  printf("hello %d ", counter);
  counter++;
}
printf("| %d\n", counter);
```

- [x] `hello 3 hello 4 hello 5 | 6`
- [ ] `hello 4 hello 5 hello 6 | 6`
- [ ] `hello 3 hello 4 hello 5 | 5`
- [ ] `hello 3 hello 4 hello 5 hello 6 | 7`

---
part: logika
lang: c
format: single
title: Increment Sebelum Kirim
sample: true
status: ready
---
Berapa output program ini?

```c
int counter = 0;
int a = counter++;
int b = ++counter;
printf("%d %d %d\n", a, b, counter++);
```

- [ ] `0 1 2`
- [x] `0 2 2`
- [ ] `0 2 3`
- [ ] `1 2 3`

---
part: logika
lang: c
format: single
title: Event Tanpa Break
sample: true
status: ready
---
Sebuah event masuk ke `switch`. Berapa output program ini?

```c
int event = 1;
int kode = 0;
switch (event) {
  case 0:
    kode += 1;
  case 1:
    kode += 10;
  case 2:
    kode += 100;
    break;
  case 3:
    kode += 1000;
}
printf("%d\n", kode);
```

- [ ] 10
- [x] 110
- [ ] 111
- [ ] 1110

---
part: logika
lang: c
format: single
title: Event Tidak Dikenal
sample: true
status: ready
---
Empat event masuk satu per satu. Berapa output program ini?

```c
int event[] = {0, 2, 7, 1};
int terhubung = 0;
int error = 0;
for (int i = 0; i < 4; i++) {
  switch (event[i]) {
    case 0: terhubung++; break;
    case 1: terhubung--; break;
    case 2: error++; break;
    default: error += 10;
  }
}
printf("%d %d\n", terhubung, error);
```

- [ ] `1 11`
- [x] `0 11`
- [ ] `0 1`
- [ ] `1 1`

---
part: logika
lang: c
format: single
title: Coba Sambung Ulang
sample: true
status: ready
---
Board menunggu 500 ms setiap kali gagal tersambung. Berapa output program ini?

```c
int coba = 0;
int tunggu = 0;
int terhubung = 0;
while (!terhubung) {
  coba++;
  if (coba == 4) {
    terhubung = 1;
  } else {
    tunggu += 500;
  }
}
printf("%d %d\n", coba, tunggu);
```

- [ ] `4 2000`
- [ ] `3 1500`
- [x] `4 1500`
- [ ] `3 1000`

---
part: logika
lang: c
format: single
title: Isi Buffer Pesan
sample: true
status: ready
---
Pesan disimpan di array `message` yang muat 50 karakter. Berapa output program ini?

```c
#include <stdio.h>
#include <string.h>

int main(void) {
  char message[50];
  int counter = 12;
  snprintf(message, sizeof(message), "hello %d", counter);
  printf("%s %d\n", message, (int)strlen(message));
  return 0;
}
```

- [ ] `hello 12 7`
- [x] `hello 12 8`
- [ ] `hello 12 9`
- [ ] `hello 12 50`

---
part: logika
lang: c
format: single
title: Pesan Terpotong
sample: true
status: ready
---
Kali ini array `message` cuma muat 8 byte, sudah termasuk karakter penutup `'\0'`. Berapa output program ini?

```c
#include <stdio.h>

int main(void) {
  char message[8];
  snprintf(message, sizeof(message), "hello %d", 12345);
  printf("%s\n", message);
  return 0;
}
```

- [ ] `hello 12345`
- [ ] `hello 12`
- [ ] `hello 123`
- [x] `hello 1`

---
part: logika
lang: c
format: single
title: Counter Static
sample: true
status: ready
---
Variabel `static` di dalam fungsi tidak mulai dari awal tiap dipanggil. Berapa output program ini?

```c
#include <stdio.h>

int hitung(void) {
  static int pesan = 0;
  pesan += 2;
  return pesan;
}

int main(void) {
  hitung();
  hitung();
  printf("%d\n", hitung());
  return 0;
}
```

- [ ] 2
- [ ] 3
- [ ] 4
- [x] 6

---
part: logika
lang: c
format: single
title: Ubah Lewat Pointer
sample: true
status: ready
---
Berapa output program ini?

```c
#include <stdio.h>

void tambah(int *p) {
  *p += 5;
}

void salin(int x) {
  x += 5;
}

int main(void) {
  int messageCounter = 10;
  tambah(&messageCounter);
  salin(messageCounter);
  tambah(&messageCounter);
  printf("%d\n", messageCounter);
  return 0;
}
```

- [ ] 10
- [ ] 15
- [x] 20
- [ ] 25

---
part: logika
lang: c
format: single
title: Counter Muat Satu Byte
sample: true
status: ready
---
Variabel `unsigned char` hanya muat 0 sampai 255. Berapa output program ini?

```c
unsigned char counter = 250;
for (int i = 0; i < 10; i++) {
  counter++;
}
printf("%d\n", counter);
```

- [ ] 10
- [ ] 255
- [ ] 260
- [x] 4

---
part: logika
lang: c
format: single
title: Menit dan Sisa Interval
sample: true
status: ready
---
Board mengirim data tiap `interval` milidetik. Berapa output program ini?

```c
int interval = 60000;
int sekarang = 150000;
printf("%d %d\n", sekarang / interval, sekarang % interval);
```

- [ ] `3 30000`
- [x] `2 30000`
- [ ] `2 90000`
- [ ] `2 3000`

---
part: logika
lang: c
format: single
title: Skala Sensor
sample: true
status: ready
---
Bacaan sensor 0 sampai 4095 diubah ke skala 0 sampai 100. Semua variabelnya `int`. Berapa output program ini?

```c
int adc = 1000;
int persen = adc * 100 / 4095;
printf("%d\n", persen);
```

- [ ] 0
- [ ] 4
- [x] 24
- [ ] 25

---
part: logika
lang: c
format: single
title: Suhu di Atas Batas
sample: true
status: ready
---
Jumlah elemen array dihitung dengan `sizeof`. Berapa output program ini?

```c
int suhu[] = {21, 25, 30, 28, 22, 26};
int n = sizeof(suhu) / sizeof(suhu[0]);
int panas = 0;
for (int i = 0; i < n; i++) {
  if (suhu[i] >= 26) {
    panas++;
  }
}
printf("%d %d\n", n, panas);
```

- [ ] `5 3`
- [ ] `6 2`
- [x] `6 3`
- [ ] `24 3`

---
part: logika
lang: c
format: multi
title: Kirim Kalau Terhubung
sample: true
status: ready
---
Operator `&&` dan `||` berhenti begitu hasilnya sudah pasti. Pilih semua pernyataan yang benar setelah kode ini jalan.

```c
int terhubung = 0;
int cek = 0;
int kirim = 0;
if (terhubung && ++cek > 0) {
  kirim = 1;
}
if (!terhubung || ++cek > 0) {
  kirim += 2;
}
```

- [x] `cek` bernilai 0
- [x] `kirim` bernilai 2
- [ ] `cek` bernilai 1
- [ ] `kirim` bernilai 3
- [ ] `kirim` bernilai 1

---
part: logika
lang: c
format: multi
title: Batas Nilai Sensor
sample: true
status: ready
---
Pilih semua pernyataan yang benar setelah kode ini jalan.

```c
#define BATAS_ATAS 100
#define BATAS_BAWAH 10
int nilai = 140;
int hasil = nilai;
if (hasil > BATAS_ATAS) hasil = BATAS_ATAS;
if (hasil < BATAS_BAWAH) hasil = BATAS_BAWAH;
int lebar = BATAS_ATAS - BATAS_BAWAH;
```

- [x] `hasil` bernilai 100
- [x] `lebar` bernilai 90
- [ ] `hasil` bernilai 140
- [ ] `hasil` bernilai 10
- [ ] `BATAS_ATAS` adalah variabel `int` yang memakai memori

---
part: logika
lang: c
format: order
title: Hitung Huruf di Paket
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12]]
---
Susun baris berikut jadi program yang menghitung berapa kali huruf `l` muncul di paket `hello 12`. Baris terakhir mencetak `2`.

```c
#include <stdio.h>
int main(void) {
  char paket[] = "hello 12";
  int jumlah = 0;
  for (int i = 0; paket[i] != '\0'; i++) {
    if (paket[i] == 'l') {
      jumlah++;
    }
  }
  printf("%d\n", jumlah);
  return 0;
}
```

---
part: logika
lang: c
format: order
title: Urutan Loop Kirim
sample: true
status: ready
also: [[1, 2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13], [1, 2, 3, 4, 5, 6, 8, 7, 9, 10, 11, 12, 13]]
---
Susun baris berikut jadi program yang mengirim tiap 3 detik dan mencetak `kirim 0 kirim 1`. Counter naik setelah pesan dicetak.

```c
#include <stdio.h>
int main(void) {
  int counter = 0;
  int previous = 0;
  for (int t = 0; t <= 6; t++) {
    if (t - previous >= 3) {
      printf("kirim %d ", counter);
      previous = t;
      counter++;
    }
  }
  return 0;
}
```

---
part: logika
lang: c
format: match
title: Hitungan dari Modul
sample: true
status: ready
---
Semua angka di sini `int`. Pasangkan tiap ekspresi C dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `5000 / 1000 + 20` | `25` |
| `60000 / 1000` | `60` |
| `4095 / 100` | `40` |
| `2000 + 500 * 3` | `3500` |
| `20 * 12 / 5` | `48` |
|  | `100` |

---
part: logika
lang: c
format: match
title: Waktu dan Wrap
sample: true
status: ready
---
Semua angka di sini `int`. Pasangkan tiap ekspresi C dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `(250 + 10) % 256` | `4` |
| `150000 / 60000` | `2` |
| `(150000 % 60000) / 1000` | `30` |
| `7 / 2 * 2` | `6` |
| `1000 / 3` | `333` |
|  | `0` |

---
part: logika
lang: c
format: single
title: Diskon Sepatu
sample: true
status: ready
---
Sepasang sepatu harganya Rp240.000. Toko memberi diskon 25%. Berapa yang harus dibayar?

- [ ] Rp60.000
- [x] Rp180.000
- [ ] Rp215.000
- [ ] Rp225.000

---
part: logika
lang: c
format: single
title: Sewa Lapangan
sample: true
status: ready
---
Sewa lapangan futsal Rp100.000 untuk biaya tetap, ditambah Rp25.000 untuk setiap jam. Anggaran kelompok paling banyak Rp350.000. Berapa jam paling lama (jam utuh) lapangan itu bisa disewa?

- [ ] 8
- [ ] 9
- [x] 10
- [ ] 14

---
part: logika
lang: c
format: single
title: Isi Akuarium
sample: true
status: ready
---
Sebuah akuarium berbentuk balok berukuran 60 cm × 40 cm × 30 cm. Akuarium diisi air sampai tiga perempat penuh. Berapa liter air di dalamnya? (1 liter = 1.000 cm³)

- [ ] 18 liter
- [ ] 36 liter
- [x] 54 liter
- [ ] 72 liter

---
part: logika
lang: c
format: single
title: Skala Peta
sample: true
status: ready
---
Sebuah peta berskala 1 : 200.000. Jarak dua kota di peta 7,5 cm. Berapa jarak sebenarnya?

- [ ] 1,5 km
- [ ] 7,5 km
- [x] 15 km
- [ ] 150 km

---
part: logika
lang: c
format: single
title: Untung Jual Buku
sample: true
status: ready
---
Bu Rani membeli 20 buku seharga Rp15.000 per buku. Semua buku dijual lagi dengan harga Rp18.000 per buku. Berapa total keuntungannya?

- [ ] Rp3.000
- [ ] Rp30.000
- [x] Rp60.000
- [ ] Rp360.000

---
part: logika
lang: c
format: single
title: Kursi Bioskop
sample: true
status: ready
---
Baris pertama sebuah bioskop punya 12 kursi. Tiap baris berikutnya punya 3 kursi lebih banyak dari baris di depannya. Berapa total kursi di 8 baris pertama?

- [ ] 33
- [ ] 168
- [x] 180
- [ ] 264

---
part: logika
lang: c
format: single
title: Harga Naik Lalu Turun
sample: true
status: ready
---
Harga sebuah barang Rp50.000. Harganya naik 10%, lalu turun 10% dari harga yang baru. Berapa harga akhirnya?

- [ ] Rp45.000
- [x] Rp49.500
- [ ] Rp50.000
- [ ] Rp55.000

---
part: logika
lang: c
format: single
title: Kelereng Bukan Biru
sample: true
status: ready
---
Di dalam sebuah kantong ada 5 kelereng merah, 3 kelereng biru, dan 2 kelereng hijau. Satu kelereng diambil secara acak. Berapa peluang yang terambil BUKAN kelereng biru?

- [ ] 3/10
- [ ] 1/2
- [x] 7/10
- [ ] 7/3

---
part: logika
lang: c
format: single
title: Dua Keran Bak Air
sample: true
status: ready
---
Keran A bisa mengisi sebuah bak sampai penuh dalam 6 jam. Keran B bisa mengisinya dalam 3 jam. Kalau kedua keran dibuka bersamaan dari bak kosong, berapa jam sampai bak penuh?

- [ ] 1,5 jam
- [x] 2 jam
- [ ] 3 jam
- [ ] 4,5 jam

---
part: logika
lang: c
format: single
title: Rata-rata Dua Kelas
sample: true
status: ready
---
Kelas A punya 12 siswa dengan nilai rata-rata 80. Kelas B punya 8 siswa dengan nilai rata-rata 90. Berapa nilai rata-rata kedua kelas kalau digabung?

- [x] 84
- [ ] 85
- [ ] 86
- [ ] 88

---
part: logika
lang: c
format: single
title: Pajak Bertingkat
sample: true
status: ready
---
Sebuah aturan pajak punya tiga lapis. Penghasilan sampai Rp5.000.000 tidak kena pajak. Bagian di atas Rp5.000.000 sampai Rp10.000.000 kena pajak 10%. Bagian di atas Rp10.000.000 kena pajak 20%. Berapa pajak untuk penghasilan Rp13.000.000?

- [ ] Rp500.000
- [x] Rp1.100.000
- [ ] Rp1.300.000
- [ ] Rp2.600.000

---
part: logika
lang: c
format: single
title: Pola Ubin
sample: true
status: ready
---
Sebuah pola dibuat dari ubin. Pola ke-1 memakai 4 ubin, pola ke-2 memakai 9 ubin, pola ke-3 memakai 16 ubin, dan pola ke-4 memakai 25 ubin. Kalau polanya terus sama, berapa ubin yang dipakai pola ke-10?

- [ ] 100
- [ ] 110
- [x] 121
- [ ] 144

---
part: logika
lang: c
format: single
title: Siswa Suka Pelajaran
sample: true
status: ready
---
Dari 40 siswa, 24 siswa suka Matematika dan 18 siswa suka Fisika. Ada 8 siswa yang suka keduanya. Berapa siswa yang tidak suka keduanya?

- [ ] 4
- [x] 6
- [ ] 8
- [ ] 10

---
part: logika
lang: c
format: single
title: Mobil Dua Kecepatan
sample: true
status: ready
---
Sebuah mobil menempuh jarak 300 km. Pada 2 jam pertama kecepatannya 60 km/jam, sisanya 80 km/jam. Berapa total waktu perjalanannya?

- [ ] 4 jam
- [x] 4,25 jam
- [ ] 4,5 jam
- [ ] 5 jam

---
part: logika
lang: c
format: single
title: Berat Tiga Kotak
sample: true
status: ready
---
Sebuah kotak besar beratnya dua kali berat kotak kecil. Satu kotak kecil dan dua kotak besar kalau ditimbang bersama beratnya 25 kg. Berapa berat tiga kotak besar?

- [ ] 15 kg
- [ ] 20 kg
- [x] 30 kg
- [ ] 40 kg

---
part: logika
lang: c
format: single
title: Biaya Kirim Termurah
sample: true
status: ready
---
Sebuah paket beratnya 2,4 kg. Ada tiga layanan kirim. Kilat: Rp9.000 per kg, berat dibulatkan ke atas ke kg utuh. Reguler: Rp8.000 per kg, berat dibulatkan ke atas ke kg utuh. Hemat: Rp7.000 per kg, tapi dihitung minimal 3 kg. Berapa biaya paling murah?

- [ ] Rp16.800
- [x] Rp21.000
- [ ] Rp24.000
- [ ] Rp27.000

---
part: logika
lang: c
format: single
title: Cat Dinding
sample: true
status: ready
---
Sebuah ruangan berukuran 6 m × 4 m dengan tinggi 3 m. Keempat dindingnya dicat 2 lapis. Ada 1 pintu berukuran 1 m × 2 m dan 2 jendela berukuran 1,5 m × 1 m yang tidak dicat. Satu kaleng cat berisi 2,5 liter, dan 1 liter cat menutup 8 m² untuk satu lapis. Berapa kaleng yang minimal harus dibeli? (Kaleng tidak dijual eceran.)

- [ ] 5 kaleng
- [x] 6 kaleng
- [ ] 7 kaleng
- [ ] 11 kaleng

---
part: logika
lang: c
format: multi
title: Penjualan Es Teh
sample: true
status: ready
---
Penjualan es teh dalam seminggu kerja: Senin 40 gelas, Selasa 35 gelas, Rabu 50 gelas, Kamis 45 gelas, Jumat 60 gelas. Pilih semua pernyataan yang benar.

- [x] Rata-rata penjualan per hari adalah 46 gelas.
- [ ] Penjualan hari Jumat 50% lebih banyak daripada hari Selasa.
- [ ] Penjualan naik setiap hari dari Selasa sampai Jumat.
- [x] Total penjualan Senin sampai Rabu lebih banyak daripada total Kamis dan Jumat.
- [ ] Selisih penjualan terbesar antara dua hari berurutan adalah 20 gelas.

---
part: logika
lang: c
format: multi
title: Pola Barisan Naik Empat
sample: true
status: ready
---
Sebuah barisan dimulai dari 3, 7, 11, 15, dan seterusnya dengan pola yang sama. Pilih semua pernyataan yang benar.

- [x] Suku ke-10 bernilai 39.
- [x] Selisih dua suku berurutan selalu 4.
- [ ] Ada suku yang bernilai 50.
- [x] Semua suku adalah bilangan ganjil.
- [ ] Jumlah lima suku pertama adalah 60.

---
part: logika
lang: c
format: multi
title: Pasti Benar
sample: true
status: ready
---
Misalkan x dan y adalah bilangan bulat positif, x genap dan y ganjil. Pilih semua pernyataan yang pasti benar.

- [x] x + y selalu ganjil.
- [x] x × y selalu genap.
- [ ] x − y selalu positif.
- [x] x dibagi 2 selalu menghasilkan bilangan bulat.
- [ ] y × y selalu genap.
