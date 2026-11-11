> **Where this lives.** This directory is `apps/modul4` in the `iris-iot`
> repository, moved here from `IRIS ASO/modul4/` with its git history
> preserved (see that stage's commit for how). Every path below is written
> relative to the PC's install root (`/home/orangepi/IRIS-ASO`), not
> relative to this repo checkout — `modul4/server.py` here means
> `/home/orangepi/IRIS-ASO/modul4/server.py` on the PC. The PC never clones
> either repo directly; it receives a generated bundle built by
> `IRIS ASO/pc/build_bundle.py`, which pulls this directory's built
> output straight from a local `iris-iot` checkout. See that script and
> `IRIS ASO/pc/README.md` for the actual deploy path.

# Perburuan LoRa IRIS — papan skor (Modul 4)

Papan skor web untuk permainan berburu beacon LoRa. Berjalan pada PC Server
dan dibuka dari internet di **https://hunt.irisiotlab.com** (lewat Cloudflare
Tunnel; lihat `apps/web/deploy/DEPLOY.md` bagian 2a). Ponsel memakai data
selulernya sendiri, jadi bisa dibawa berkeliling gedung; hotspot Wi-Fi tidak
lagi dibuat oleh PC, melainkan oleh **satu ponsel tiap kelompok**.

```
Beacon 1 ─┐  hotspot ponsel     ┌── papan skor (proyektor)
Hunter 1 ─┤  kelompok 1 (IRIS-G1)│── ponsel tiap kelompok (data seluler)
Beacon 2 ─┤                      ├── ponsel/laptop asisten
Hunter 2 ─┤  LoRa 920 MHz,       │
   ...    ├── 5 pasang ──────────┼─ internet ─→ Cloudflare Tunnel ─→ PC Server
Beacon 5 ─┤  (sync word + slot   │              https://hunt.irisiotlab.com
Hunter 5 ─┘   sendiri per pasangan)              (modul4.service, 127.0.0.1:8080)
```

Satu alamat untuk semua orang. Peran dibedakan di dalam halamannya, bukan
oleh alamat yang berbeda: praktikan memasukkan NIM-nya sekali, asisten
mengetikkan token satu kali, proyektor memakai `?stage=1`.

---

## 1. Jaringan: dua pilihan, dipilih lab di situs

Papan ini bisa berjalan di dua jaringan. Lab memilihnya di situs IRIS
(Server > Jaringan Modul 4); PC meneruskannya ke `modul4.service` lewat
`--jaringan` (atau variabel `HUNT_NET`). Server berperilaku sama di keduanya:
kode papan dan kunci kelompok tetap wajib. Mode itu hanya dikabarkan ke klien
(`jaringan` di tiap bingkai dan di `/ringkas.json`) supaya kata-katanya cocok.

| | `internet` | `iris_iot` |
|---|---|---|
| Wi-Fi papan | hotspot ponsel `IRIS-G<n>` | `IRIS_IOT`, dibuat PC |
| Papan skor | `https://hunt.irisiotlab.com` (tunnel) | `http://192.168.4.1:8080` |
| Alamat dengar server | `127.0.0.1` | `0.0.0.0` |
| Ponsel anggota | data seluler | menyambung ke `IRIS_IOT` |
| Jam papan | `time.cloudflare.com` | NTP dari PC (chrony) |
| Layar tetap menyala | Wake Lock | video cadangan (http tidak punya Wake Lock) |

Bagian di bawah menguraikan mode `internet`.

### Mode internet: hotspot ponsel tiap kelompok

Di mode ini PC bukan access point: ponsel harus bisa dibawa berburu di
lapangan, dan jangkauan Wi-Fi PC tidak menjangkau arena ratusan meter.

- Satu ponsel tiap kelompok menyalakan hotspot bernama **`IRIS-G<n>`** (n =
  nomor kelompok) dengan kata sandi yang tertulis di sketsa dan di langkah
  Perburuan situs. Nama dan sandinya ditampilkan di langkah itu.
- **Beacon dan Hunter** kelompok itu menyambung ke hotspot tersebut dan
  menjangkau `hunt.irisiotlab.com:443` lewat WebSocket aman (`wss://`).
- **Beacon dinyalakan dan disambungkan dulu selagi dekat ponsel itu**, baru
  disembunyikan. Di luar jangkauan hotspot, Wi-Fi-nya lepas; radio LoRa-nya
  tetap memancar, hanya laporan ke papan skor yang berhenti, dan paket yang
  hilang dihitung dari selisih nomor urut yang dilaporkan Hunter.
- Ponsel anggota lain **tidak** menyambung ke mana pun; cukup data seluler.
- Jam papan berasal dari `time.cloudflare.com` (SNTP), bukan lagi dari PC.
  Beacon dan Hunter satu kelompok memakai sumber dan hotspot yang sama, jadi
  selisih keduanya tetap sahih; ketelitiannya puluhan milidetik, tidak lagi
  di bawah satu milidetik seperti NTP lokal, dan jurnal menyebutnya.

| Parameter | Nilai |
|---|---|
| Nama hotspot | `IRIS-G1` sampai `IRIS-G5` |
| Papan skor | `https://hunt.irisiotlab.com` |
| Proyektor | `https://hunt.irisiotlab.com/?stage=1` (asisten masuk dengan token) |
| Soket papan | `wss://hunt.irisiotlab.com/beacon` dan `/hunter` |

Nilai-nilai ini juga tertulis di dalam `hunter.ino` dan `beacon.ino`. Kalau
salah satunya diubah, ubah pula templatnya di `scripts/gen_modul4.py` lalu
jalankan ulang generatornya — jangan menyunting berkas hasil bangkitan.

### Pagar karena papan ini terbuka di internet

Dulu papan hanya terjangkau dari hotspot tertutup. Sekarang tiga pagar
menggantikannya (`server.py`, diuji `tools/uji_protokol.py`):

- **Kode papan**: enam huruf yang diturunkan dari token asisten, sesi, dan
  tanggal (jadi berganti tiap sesi dan tiap hari, dan tetap sama bila server
  dinyalakan ulang). Kodenya ikut di tautan yang ditampilkan situs IRIS di
  langkah Perburuan (`#k=...`, di fragmen, jadi tidak pernah dikirim ke server
  atau tercatat). Tanpanya NIM tidak dicoba sama sekali dan `/roster.json`
  menjawab 403. Asisten yang memasukkan token menerima kodenya di jawaban
  `halo`, untuk proyektor.
- **Per alamat**: kegagalan (token, kode, NIM) dihitung per alamat peramban
  sebenarnya (`CF-Connecting-IP`, hanya dipercaya bila soketnya sendiri
  loopback). Lima belas kegagalan dalam sepuluh menit memblokir alamat itu.
  Sekitar empat puluh soket terbuka per alamat paling banyak.
- **Rute khusus agent** (`/ringkas.json`, `/telemetri.json`, yang membawa NIM)
  hanya dilayani untuk proses di PC ini. Karena tunnel menyambung dari
  `127.0.0.1`, server memeriksa header tunnel (`CF-Connecting-IP`, `CF-Ray`,
  `X-Forwarded-For`, ...) dan menolak yang datang lewat tunnel.

- **Kunci papan per kelompok**: tiap pesan Beacon dan Hunter membawa kunci
  delapan huruf (`"k"`) milik kelompoknya, diturunkan dari token, sesi,
  tanggal, dan nomor kelompok. Situs IRIS menampilkannya di langkah Perburuan
  (hanya kunci kelompok itu sendiri) dan kelompok menempelkannya ke `HUNT_KEY`
  di `hunter.ino` dan `beacon.ino` sebelum mengunggah. Pesan tanpa kunci yang
  benar dibuang; kunci satu kelompok tidak berlaku untuk kelompok lain, dan
  orang luar tidak bisa menyuntikkan RSSI palsu. Papan skor menunjukkan
  "Kunci papan kelompokmu salah" selagi papan sebuah kelompok masih
  mengirim kunci yang salah, dan soket yang terus salah (50 pesan) ditutup.
  Kunci berganti tiap sesi dan tiap hari, jadi sketsa harus diunggah ulang
  untuk sesi berikutnya. Kegagalan kunci tidak dihitung ke blokir per alamat,
  karena alamat itu adalah ponsel hotspot kelompok yang juga dipakai
  anggotanya membuka papan.

Sisa risiko yang diketahui: kelompok yang menyunting sketsanya sendiri tetap
bisa memalsukan pembacaan **kelompoknya sendiri** (kuncinya ada di tangan
mereka); kunci hanya menutup orang luar dan kelompok lain. Nomor kelompok
dibatasi 1 sampai 99 dan bidang teksnya dipotong.

## 2. Membangun dan menjalankan papan skor

Di PC papan skor berjalan sebagai `modul4.service` dan dikirim lewat
`IRIS ASO/pc/deploy.sh --modul 4`; perintah di bawah ini untuk
menjalankannya dengan tangan.

### Sumber berkas (klien Phase 9)

Kliennya Preact + htm (`src/vendor/`, tanpa CDN), dipindahkan dari mockup
Phase 9 dan memakai tiga bahasa (`?lang=id|en|zh`). Berkas hasil alat:

- `src/style/mockup.css`: `node tools/prune_css.mjs <mockups/phase9/app>`
- `src/icons.js`: `node tools/sync_icons.mjs <mockups/phase9/app/icons.js>`
- `src/i18n/zh.json`: `python tools/zh_sync.py --from <mockups/phase9/tools>`, lalu
  terjemahkan yang masih kurang; `build.py` menolak membangun bila ada kunci yang hilang.
- `src/fonts/noto-sans-sc-hunt-*.woff2`: `python tools/subset_cjk.py <NotoSansSC[wght].ttf>`
  (Google Fonts, OFL), wajib dijalankan ulang bila `zh.json` memakai aksara baru.


```bash
python modul4/build.py                    # menghasilkan modul4/public/index.html
source ~/venv-iris/bin/activate         # venv yang sama dengan Modul 2
python modul4/server.py --arena 300
```

### Ukuran arena

`--arena` adalah jari-jari ruang bermain dalam meter, dan hanya itu yang perlu
diubah ketika pindah tempat. Seluruh tangga panas-dingin diturunkan dari angka
ini, sehingga permainan yang sama berjalan baik di satu ruangan maupun di
gedung yang lebarnya ratusan meter. Pasangkan dengan `BEACON_TX_POWER` di
dalam `beacon.ino`:

| Tempat | `--arena` | `--n` | `BEACON_TX_POWER` | "Membara" kira-kira |
|---|---|---|---|---|
| Satu ruangan kelas | `30` | `2.5` | `2` | dalam 3 m |
| Satu lantai gedung | `150` | `2.5` | `10` | dalam 3 m |
| **Lapangan terbuka** | `300` (bawaan) | `2.0` (bawaan) | `10` (bawaan) | dalam 6 m |
| Lapangan sangat luas | `500` | `2.0` | `14` | dalam 10 m |

`--n` adalah eksponen path loss. Bawaannya **2,0** karena perburuan ini
dimainkan di lapangan terbuka di sekeliling gedung, yang mendekati ruang
bebas. Di dalam gedung bersekat naikkan ke 2,5-3,5. Menurunkan `n`
*memperbesar* jarak yang dilaporkan untuk RSSI yang sama, jadi `--n` dan
`--arena` selalu digeser bersama-sama.

Server menuliskan tangga panasnya saat dinyalakan, jadi arena yang salah setel
terlihat sebelum ronde dimulai, bukan sesudahnya.

### Jangkauan yang masuk akal

Pada SF7, lebar pita 250 kHz, dan daya 10 dBm, batas sensitivitas radionya
sekitar -120 dBm. Yang sampai ke sana bergantung sepenuhnya pada apa yang
menghalangi:

| Lingkungan | n | Jangkauan nyata |
|---|---|---|
| Lapangan terbuka, garis pandang | 2,0-2,5 | 1-3 km |
| Gedung besar, dinding sekat | 3,0 | ~800 m |
| Beton tebal, beberapa lantai | 3,5 | ~325 m |

Tidak ada ambang "terdeteksi" yang perlu disetel: hunter selalu dalam mode
terima, dan sebuah paket entah berhasil didemodulasi atau tidak ada sama
sekali. Karena itu ada tiga keadaan yang jelas — sunyi total (di luar
jangkauan), paket putus-putus dengan RSSI liar (tepat di tepi), lalu paket
rapat dengan RSSI yang mengikuti jarak (di dalam jangkauan). Peralihan dari
"tidak ada apa-apa" ke "ada sesuatu" itulah pendeteksi otomatisnya.

### Token asisten

Di PC, `modul4.service` membaca token tetap dari
`/var/lib/iris-modul4/token` (dibuat sekali oleh `opi_provision.sh`, mode 0600),
jadi token **tidak** berganti saat layanan dinyalakan ulang. Dijalankan dengan
tangan tanpa `--token`, server membangkitkan token enam huruf dan mencetaknya:

```
[13:02:52:686] +-----------------------------+
[13:02:52:686] |  TOKEN ASISTEN:  K J 7 R Q 4  |
[13:02:52:686] +-----------------------------+
```

Asisten membuka alamat yang sama dengan praktikan, mengetuk **Saya asisten** di kartu masuk NIM, lalu mengetikkan token itu. Tokennya tersimpan di
peramban asisten, jadi cukup sekali per perangkat.

Abjadnya sengaja tanpa huruf dan angka yang mudah tertukar saat dibacakan
(tanpa 0/O, 1/I/L, 2/Z, 5/S, 8/B), dan salah ketik lima kali menutup koneksi.
Pakai `--token KODE` untuk token tetap saat menjalankan server dengan tangan.

> Tanpa token, tidak ada yang bisa mengesahkan pemenang, menolak klaim,
> mengkalibrasi, memulai sesi baru, atau menyunting nama. Sebelum revisi ini
> **setiap ponsel di hotspot dapat melakukan semuanya.**

`modul4/server.py` memakai paket `websockets` yang sama dengan Modul 2, jadi
lingkungan virtual `~/venv-iris` cukup dipakai ulang. Tidak ada dependensi lain.

Satu proses melayani semuanya pada port 8080:

| Alamat | Dipakai oleh |
|---|---|
| `GET /` | peramban asisten dan proyektor |
| `WS /beacon` | papan Beacon |
| `WS /hunter` | keenam papan Hunter |
| `WS /live` | papan skor di peramban |

Buka `https://hunt.irisiotlab.com` untuk papan skor, dan
`https://hunt.irisiotlab.com/?stage=1` untuk mode proyektor.

---

## 3. Menjalankan permainan

Lima kelompok, lima pasangan Beacon/Hunter, lima beacon tersembunyi. Tiap
kelompok memburu **beacon-nya sendiri**; pasangan-pasangan itu tidak saling
mendengar karena kata sinkron radionya berbeda.

1. Jalankan server (`modul4.service`, dinyalakan oleh Mulai Perburuan di
   situs). Catat tokennya.
2. Tiap kelompok menyalakan hotspot `IRIS-G<n>` di satu ponselnya, lalu
   mengunggah `beacon.ino` **dan** `hunter.ino` dari foldernya sendiri
   (`grupN/`). Tidak ada baris yang perlu disunting. Beacon disambungkan ke
   hotspot dulu, baru asisten **menyembunyikan** kelima beacon di sekitar
   gedung.
3. **Asisten mengisi jadwal sehari.** Buka `https://hunt.irisiotlab.com`, ketuk
   lambang di kiri atas tiga kali, masukkan token. Tab **Asisten** (mission
   control) terbuka sendiri. Buka **Jadwal dan kendali**, tempelkan daftar
   tiap sesi (lihat bagian 4), lalu **Mulai sesi ini**.
4. **Tiap praktikan membuka tautan dari situs IRIS** (langkah Perburuan; QR
   atau salin tautan, karena kode papan ikut di dalamnya) dan mengetikkan
   **NIM**-nya. Papan menampilkan kelompoknya sebagai rasi bintang beserta
   nama anggotanya untuk dipastikan, lalu tiga kartu singkat (tujuan, membaca
   sonar, mengklaim) dan pilihan **peran**.
5. **Kalibrasi acuan jarak.** Pegang satu papan Hunter tepat **1 meter** dari
   beacon-nya, pilih kelompok itu di **Jadwal dan kendali**, tekan
   **Kalibrasi 1 m**. Kalibrasi berlaku untuk semua kelompok dan bertahan
   melewati **Ronde baru** dan pergantian sesi, jadi cukup sekali per lokasi.
6. Proyektor membuka `https://hunt.irisiotlab.com/?stage=1` dan asisten
   masuk dengan token. Tombol
   **Hitung mundur di proyektor** memutar 3, 2, 1, Buru! di layar besar;
   memulai sesi memutarnya sendiri.
7. **Perburuan.** Layar **Buru** di tiap ponsel: sonar (cincin terang adalah
   jarak kelompok, bukan arahnya; warnanya naik dari Dingin ke Membara),
   angka jarak dengan rentang perkiraannya, jejak 90 detik, sinyal tim,
   balapan, dan angka tautan radio. Langit ikut berganti warna sesuai panas
   kelompok itu sendiri.
8. **Mengklaim.** Di zona **Membara**, tombol klaim menyala. Tahan 1,2 detik,
   ambil foto beacon (boleh tanpa foto), kirim. Ponsel menampilkan radar
   "sedang ditinjau".
9. **Asisten meninjau dari mission control.** Klaim masuk ke antrean di sisi
   kanan menurut urutan pengajuan, dengan foto (ketuk untuk memperbesar),
   jarak saat mengklaim, dan nama anggota. **Terima** meminta konfirmasi;
   **Tolak** membuka pilihan alasan (Foto buram, Bukan beacon kalian, Beacon
   tidak terlihat, atau alasan lain). Klaim yang ditolak mengembalikan
   kelompok itu ke perburuan tanpa penalti.
10. **Tiap kelompok selesai sendiri-sendiri.** Kelompok yang diterima
    melihat kartu kemenangannya, dan proyektor menayangkan kemenangan itu
    sekitar delapan detik, lengkap dengan seluruh jejak perburuannya.
    Kelompok lain terus berburu. Ronde baru benar-benar selesai begitu
    **semua** kelompok ditemukan: penghargaan membeku dan proyektor pindah ke
    podium. Tombol **P** di proyektor menampilkan atau menyembunyikan podium
    kapan saja.
11. **Ronde baru** (di **Jadwal dan kendali**) mengosongkan waktu temu,
    klaim, jejak, dan foto untuk ronde berikutnya di dalam sesi yang sama.
    Jadwal, peran tim, dan kalibrasi tetap tersimpan. Unduh **jejak CSV**
    atau **JSON** lebih dulu kalau datanya ingin disimpan.

Kalau papan sebuah kelompok mati di tengah perburuan padahal beacon-nya
sudah di tangan, pilih kelompok itu di **Jadwal dan kendali** lalu **tahan**
tombol *Tahan: sahkan tanpa klaim*. Tombol itu sengaja butuh tekan-lama.

### Peran, sinyal tim, dan sapuan

- **Peran** (Pemandu, Pengintai, Operator radio) hanya mengubah urutan layar
  Buru: Pemandu mendapat sonar paling atas, Pengintai tombol klaim, Operator
  angka tautan. Semua ponsel tetap melihat seluruh perburuan. Peran bisa
  diganti kapan saja dari tab **Tim**; mission control menandai peran yang
  kosong dengan warna kuning.
- **Sinyal tim** (Ke sini, Sinyal naik, Tunggu, Cek klaim) hanya sampai ke
  ponsel satu kelompok dan ke asisten, tidak pernah ke proyektor. Jedanya
  tiga detik per ponsel.
- **Sapu 8 arah**: tubuh pemegang papan menghalangi sinyal dari belakang,
  jadi berputar di tempat menunjukkan arah terkuat. Papan merekam empat
  detik per arah (jam 12, 1.30, 3, dan seterusnya searah jarum jam), lalu
  hasilnya dikirim ke seluruh tim sebagai mawar arah.
- **Panggil asisten** di tab Tim membuat lajur kelompok itu berdenyut merah
  di mission control sampai asisten menekan **Selesai**.
- **Pengumuman** dari mission control (maksimal 140 huruf) tampil di semua
  ponsel dan di proyektor sampai dihapus.

### Detak jarak: berburu tanpa melihat layar

Di bawah sonar ada satu saklar, **Suara sonar**, dan ia **mati secara
bawaan**. Dinyalakan, ponsel berbunyi pada tiap sapuan sonar: makin dekat
beacon, makin rapat dan makin tinggi bunyinya.
Begitu kelompok masuk **HANGAT**, tiap detak ikut disertai getaran.

Ini bukan hiasan. Perburuan berlangsung di lapangan terbuka sambil berjalan,
dan angka yang hanya ada di layar adalah angka yang tidak ada yang baca.
Dengan detak, ponsel boleh tetap di tangan sementara mata melihat jalan.

Beberapa hal yang perlu diketahui asisten:

- Saklarnya **per ponsel**, tersimpan di ponsel itu, dan tidak memengaruhi
  siapa pun. Satu ruang berisi dua puluh ponsel yang berdetak bersamaan
  adalah keputusan kalian, bukan keputusan papan skor.
- Bunyi hanya boleh dimulai oleh sentuhan penggunanya sendiri — itu aturan
  perambannya, bukan pilihan kami. Karena itu ia berupa tombol.
- Getaran tidak ada pada iPhone mana pun. Bunyinya tetap jalan.
- Detaknya **berhenti** bila papan kelompok itu kehilangan sinyal, bila
  beacon sudah ditemukan, atau bila layarnya berpindah ke aplikasi lain.
  Diam berarti "tidak ada kabar", dan itu sendiri sebuah kabar.
- Lajunya dihitung dari **jarak kelompok itu sendiri** terhadap ukuran
  arena, bukan dari peringkat. Kelompok yang berdiri diam tidak akan
  mendengar detaknya berubah hanya karena kelompok lain bergerak.

### Layar yang tertidur di tengah perburuan

Di mode `internet` papan disajikan lewat `https://`, yang termasuk *secure
context*, jadi penahan layar (**Screen Wake Lock**) bekerja di peramban yang
mendukungnya. Di mode `iris_iot` papan memakai `http://`, tanpa Wake Lock; di
sana papan memutar video satu piksel tanpa suara dari kanvas (cara NoSleep)
begitu anggota mengetuk "Nyalakan suara". Peramban mana yang menghormatinya
belum teruji di ponsel sungguhan, jadi layar Tampilan menyebutnya cara
cadangan.
Untuk jaga-jaga (peramban lama, mode hemat daya), minta tiap kelompok menyetel
batas tidur layar ponselnya ke 5 menit atau "tidak pernah" sebelum sesi
dimulai.

### Kalau kamera atau baterai bermasalah

Klaim boleh dikirim tanpa foto — tombol *Kirim klaim* tetap bekerja meski
tidak ada gambar yang dipilih, dan antrean asisten akan menuliskan "tanpa
foto". Pipeline foto tidak boleh menjadi hal yang membuat permainan tidak
bisa diselesaikan.

---

## 4. Jadwal sehari, NIM, dan pergantian sesi

Praktikum berjalan **empat sesi sehari** dengan praktikan yang berbeda-beda.
Asisten mengetik keempatnya **sekali di pagi hari**; sesudah itu server yang
mengurus sisanya.

### Menempelkan daftar

Tiap sesi punya satu kotak tempel. Formatnya sengaja selonggar mungkin supaya
tempelan dari spreadsheet langsung terbaca:

```
#1 Kelompok Cakra
2311102001, Alya Rahmawati
2311102014	Bagus Prasetyo
2311102027;Citra Dewi Lestari

#2 Kelompok Bayu
2311102033 Dimas Aditya
```

- Baris berawalan `#` membuka sebuah kelompok. Nama regu di belakangnya
  opsional.
- Baris lain adalah satu anggota: **NIM**, lalu koma / titik koma / tab /
  spasi, lalu namanya.
- Di bawah kotak ada hitungan langsung — `7 kelompok · 28 anggota · 0 galat` —
  dan tiap baris yang bermasalah disebutkan nomornya. Tombol **Simpan**
  menolak bekerja selama masih ada galat.
- **Satu NIM hanya boleh muncul sekali dalam sehari.** Kalau tidak, pencarian
  NIM akan memilih salah satu kelompok tanpa bersuara, dan seseorang akan
  berburu untuk kelompok yang salah tanpa ada yang tahu.

Menyimpan menulis ulang seluruh sesi itu, jadi menghapus satu baris dari
tempelan benar-benar menghapus orangnya.

### Jam dan pergantian

Jam mulai bawaan **06:30, 09:30, 12:30, 15:30**, dan satu sesi dibatasi
**150 menit**. Pada jarak tiga jam kedua aturan itu jatuh bersamaan: sesi
dibersihkan tepat **30 menit sebelum** sesi berikutnya dijadwalkan mulai.
Kalau jamnya kelak dirapatkan, yang berlaku tetap yang lebih cepat dari
keduanya.

Tiap jam mulai dapat disunting di panelnya. Tombol **Mulai sekarang** dan
**Akhiri sekarang** ada untuk praktikum yang meleset dari jadwal, dan
keputusan manual itu **tidak** dibatalkan lagi oleh jam: sesi yang dimulai
manual berjalan sampai batasnya habis atau sampai diakhiri manual.

Saat sesi berganti, yang dihapus adalah:

- perburuan, peringkat, riwayat RSSI;
- seluruh klaim dan foto klaim;
- penghargaan yang sudah dibekukan;
- **sesi login tiap ponsel** — semua ponsel kembali ke layar NIM, tanpa perlu
  disuruh dan tanpa perlu menyambung ulang.

Yang **tetap**: jadwal sehari penuh, ukuran arena, dan kalibrasi 1 meter.
Tombol **Hapus jadwal** membuang keempat sesi sekaligus, dan hanya itu yang
membuangnya sebelum hari berganti.

`--sesi-jam 07:00,10:00,13:00,16:00` mengubah jam mulainya dan
`--sesi-durasi MENIT` mengubah batasnya.

### NIM adalah data pribadi

NIM dipakai untuk satu hal saja: mencari kelompok seseorang saat ia masuk.

- NIM **tidak pernah** keluar lewat `GET /roster.json`, yang membutuhkan kode
  papan (`?k=`) dan hanya membawa nama.
- Satu-satunya NIM yang pernah meninggalkan server adalah NIM yang baru saja
  diketik orangnya sendiri, dikembalikan kepada koneksi yang mengetiknya.
- Daftar lengkap beserta NIM hanya terbaca lewat perintah `jadwal_baca`, yang
  **memerlukan token asisten**.
- Nama anggota (bukan NIM) hanya terbaca oleh yang membawa kode papan: ponsel
  yang membuka tautan dari situs IRIS, dan asisten yang sudah memasukkan token
  (untuk proyektor).
- Pencarian NIM butuh kode papan dan dibatasi per alamat peramban (bagian 1),
  jadi menebak seluruh angkatan dari luar tidak mungkin dan tidak murah. Tetap
  **bukan** otentikasi penuh, dan itu alasan jadwalnya tidak menginap semalam.

Rencana tersimpan di `modul4/jadwal.json`, satu-satunya berkas yang sengaja
selamat dari restart, supaya server yang mati di tengah sesi tidak memaksa
asisten mengetik ulang. Rencana dari **hari lain dibuang saat dimuat**.

### Foto klaim

Peramban mengecilkan foto ke sisi panjang 1280 px dan mutu 0,72 **sebelum**
mengirim, sehingga foto ponsel 4 MB menjadi sekitar 300 KB. Foto disimpan di
`modul4/uploads/<ronde>/` dan dihapus pada empat titik: saat server dinyalakan,
saat **Ronde baru**, saat sesi berganti, dan saat server dimatikan dengan
rapi.

Foto klaim yang masih ditinjau hanya tampil di antrean asisten. Foto kelompok
yang **menang** menjadi terbuka di tab Hasil. Foto sengaja tidak pernah
selamat dari restart: seluruh keadaan klaim ada di memori, jadi foto yang
selamat hanya akan menjadi yatim.

---

## 5. Menguji tanpa perangkat keras

Papan skor dapat dikembangkan dan diperiksa tanpa sepuluh papan ESP32:

```bash
python modul4/server.py                       # satu terminal
python modul4/tools/fake_hunt.py              # terminal lain
```

Skrip itu memalsukan kelima pasangan Beacon/Hunter independen sekaligus,
lengkap dengan derau multipath dan paket yang hilang. Beberapa pilihan yang
berguna:

```bash
python modul4/tools/fake_hunt.py --drop 5     # kelompok 5 hilang setelah 10 detik
python modul4/tools/fake_hunt.py --winner 3   # kelompok 3 mendekat sampai dicalonkan
python modul4/tools/fake_hunt.py --seconds 30 # berhenti sendiri setelah 30 detik
python modul4/tools/fake_hunt.py --arena 300  # sebar kelompok di lapangan 300 m
```

Hunter berjalan dengan laju kaki manusia, sekitar 1,4 m/detik, dan laju itu
**tidak** ikut membesar bersama `--arena`. Orang menyeberangi lapangan yang
luas dengan berjalan lebih lama, bukan dengan bergerak lebih cepat, dan
simulator yang curang di sini akan membuat arena 300 m terlihat bisa
diselesaikan dalam lima belas detik.

Untuk melihat seluruh permainan tanpa satu orang pun di lapangan:

```bash
python modul4/server.py --token UJICOBA
python modul4/tools/fake_hunt.py --jalur --bot --token UJICOBA --tempo 3
```

`--jalur` membuat kelima hunter berjalan mendekati beacon masing-masing
dengan dua kemunduran di tengah jalan, `--bot` mengisi jadwal contoh dan
memainkan satu anggota per kelompok (memilih peran, mengirim sinyal, menyapu,
mengklaim di Membara) serta seorang asisten tiruan yang menolak klaim pertama
kelompok 3 dan menerima sisanya. Masuk di ponsel dengan NIM **D0300** untuk
bergabung dengan kelompok 3 di samping bot-nya, atau buka `?nim=D0300`.
`--tempo 3` menjalankan waktunya tiga kali lebih cepat.

### Menguji protokolnya

`fake_hunt.py` hanya memalsukan radio. Seluruh perintah dari peramban —
termasuk yang **harus ditolak** — diuji terpisah:

```bash
python modul4/server.py --token UJICOBA &
python modul4/tools/uji_protokol.py --token UJICOBA
```

Seratus dua puluh delapan pemeriksaan: tamu ditolak pada tiap perintah asisten,
anggota tidak bisa mengklaim untuk kelompok lain, klaim dari luar jangkauan
ditolak, foto yang ukurannya tidak cocok atau bukan gambar ditolak, lintas
jalur pada `/foto/` ditolak, `/roster.json` dan `/jejak.json` tidak
membocorkan NIM, peran tim, sinyal tim yang tidak menyeberang ke kelompok
lain, panggilan asisten, sapuan, pengumuman, kemajuan tiap kelompok, dan
bentuk `/jejak.json` serta `/jejak.csv`. Keluar dengan status bukan-nol bila
ada satu saja yang gagal. Jalankan ini setiap kali skema pesannya diubah.

---

## 6. Hal yang paling sering salah

- **Papan skor kosong padahal hunter menyala.** Papan itu belum bergabung ke
  hotspot `IRIS-G<n>` kelompoknya (nama atau sandi beda), atau hotspot
  ponselnya tidak punya data seluler, sehingga `hunt.irisiotlab.com` tidak
  terjangkau. Serial Monitor hunter akan menggantung pada titik-titik
  "Menyambung ke hotspot", atau berulang kali mencoba menyambung soket.
- **"Buka papan ini dari tautan di langkah Perburuan situs IRIS".** Ponsel itu
  membuka alamat tanpa kode papan. Kode ikut di tautan/QR dari situs, berganti
  tiap sesi dan tiap hari; buka ulang tautannya dari situs.
- **Satu alamat tiba-tiba ditolak ("terlalu banyak percobaan").** Lima belas
  kegagalan token/kode/NIM dalam sepuluh menit memblokir alamat itu selama
  sisa jendelanya. Pada jaringan seluler yang berbagi satu alamat, salah ketik
  banyak orang dapat menjumlah; tunggu sepuluh menit, atau nyalakan ulang
  `modul4.service` untuk mengosongkan hitungannya.
- **Semua kelompok terbaca "MEMBARA" sekaligus.** `BEACON_TX_POWER` terisi 20,
  bukan 2. Pada daya penuh gradien sinyalnya rata dan permainannya mustahil.
- **Beacon "Hening" pada HUD.** Papan Beacon kehilangan Wi-Fi atau mati; radio
  LoRa-nya mungkin masih memancar, tetapi papan skor tidak lagi dapat
  menghitung paket yang hilang.
- **Perkiraan meter jelas meleset.** Itu memang sifatnya, bukan kerusakan.
  Angka meter dihitung dari RSSI dengan model log-distance
  (`d = 10^((P_1m - RSSI) / (10n))`), dan modelnya mengandaikan sinyal
  melemah mulus terhadap jarak — andaian yang runtuh begitu ada tembok.
  Kalibrasi 1 m memperbaiki titik acuannya, tetapi tidak memperbaiki
  andaiannya; itulah sebabnya papan skor selalu menampilkan rentang, dan
  soal 3 pada jurnal memang meminta praktikan mengukur selisihnya sendiri.
  Untuk lapangan terbuka pakai `--n 2.0` (bawaan); untuk ruangan bersekat
  rapat naikkan mendekati 3,5. Ingat pula bahwa
  rentangnya melebar sebanding dengan jaraknya: "10 m" berarti 6--17 m,
  sedangkan "800 m" berarti 460--1390 m. Di atas 1 km papan skor beralih
  menulis kilometer.
- **Seluruh kelompok terbaca "DINGIN" sepanjang permainan.** `--arena` disetel
  jauh lebih kecil daripada gedungnya yang sebenarnya, sehingga seluruh anak
  tangga panas jatuh di dalam beberapa meter pertama. Naikkan `--arena`, dan
  naikkan pula `BEACON_TX_POWER` bila kelompok terjauh memang tidak menerima
  apa pun.
- **Kolom delay kosong.** Salah satu papan gagal menyelaraskan jam ke PC.
  Di mode `iris_iot`, periksa bahwa PC benar-benar melayani NTP (chrony) dan
  jamnya sudah disetel; di mode `internet`, bahwa Wi-Fi hotspot ponselnya
  punya data dan menjangkau `time.cloudflare.com`.
- **Halaman menampilkan "Papan skor belum dibangun".** `modul4/build.py` belum
  dijalankan, sehingga `modul4/public/index.html` belum ada.
- **"NIM ini tidak terdaftar di sesi yang sedang berjalan".** Tiga sebab, dan
  layar NIM menyebutkan sesi mana yang berjalan supaya ketiganya mudah
  dibedakan: NIM-nya salah ketik; orangnya terdaftar di sesi lain hari itu;
  atau kelompoknya dihapus dari sesi ini karena papannya menjadi beacon.
  Periksa tempelan sesi itu di tab Asisten.
- **"Belum ada sesi yang berjalan".** Jam dinding sedang berada di jeda antar
  sesi, atau sesi terakhir sudah diakhiri. Tekan **Mulai sekarang** pada sesi
  yang dikehendaki.
- **Tombol "Kami menemukannya" tidak bisa ditekan.** Itu memang perilakunya:
  tombol terbuka sendiri hanya ketika keadaan kelompok itu MEMBARA. Baris di
  bawahnya menuliskan alasannya, lengkap dengan perkiraan jaraknya. Kalau
  seluruh kelompok tidak pernah sampai MEMBARA, `--arena` terlalu besar untuk
  lapangannya.
- **Detak jarak dinyalakan tetapi tidak ada bunyinya.** Peramban hanya
  mengizinkan bunyi dimulai oleh sentuhan; kalau saklarnya menyala karena
  diingat dari kunjungan sebelumnya, bunyinya baru muncul setelah layarnya
  disentuh sekali. Kalau tetap sunyi, periksa sakelar senyap ponselnya —
  pada iPhone sakelar itu membungkam halaman web juga. Getarannya tetap
  bekerja tanpa bunyi, dan sebaliknya.
- **Detak jarak diam sama sekali.** Papan kelompok itu sedang tidak
  mengirim, atau beacon-nya sudah ditemukan. Keduanya memang membuatnya
  diam; lihat baris keadaan di atas tombol klaim.
- **Layar ponsel tertidur di tengah perburuan.** Papan disajikan lewat
  `https://`, jadi penahan layar semestinya bekerja; peramban yang tidak
  mendukungnya tetap tidur. Setel batas tidur layar tiap ponsel ke 5 menit
  sebelum sesi dimulai; lihat bagian 3.
- **Asisten menekan Sahkan tetapi tidak terjadi apa-apa.** Tokennya sudah
  kedaluwarsa karena server dijalankan ulang, dan token berganti setiap kali.
  Tab Asisten akan mengunci diri sendiri; masukkan token yang baru.
- **Foto tidak terkirim.** Ukuran setelah dikecilkan masih di atas 512 KB
  (sangat jarang), atau ponselnya menolak izin kamera. Klaim tanpa foto tetap
  boleh dikirim dan tetap masuk antrean asisten.
- **Semua ponsel tiba-tiba kembali ke layar NIM.** Sesi berganti — entah
  karena batas 150 menitnya habis, entah karena jam sesi berikutnya tiba.
  Perburuan, klaim, dan foto ikut terhapus; jadwal sehari tidak. Kalau itu
  terjadi terlalu cepat, jalankan server dengan `--sesi-durasi` yang lebih
  panjang atau rapatkan jamnya lewat `--sesi-jam`.
- **Jadwal kosong padahal kemarin sudah diisi.** Rencana dari hari lain
  sengaja dibuang saat server dimuat: nama praktikan tidak menginap semalam
  di PC.
- **Fonta terlihat berbeda dari `games/`.** Instrument Serif dan IBM Plex
  diambil dari Google Fonts, yang tidak dapat dijangkau dari hotspot tanpa
  Internet, sehingga halaman jatuh ke Georgia/system-ui/Consolas. Tata
  letaknya tidak berubah. Untuk memakai fonta aslinya, unduh berkas woff2-nya
  ke `modul4/src/vendor/` dan sisipkan sebagai `@font-face` data URI.
