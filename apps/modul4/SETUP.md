> **Where this lives.** This directory is `apps/modul4` in the `iris-iot`
> repository, moved here from `IRIS ASO/modul4/` with its git history
> preserved (see that stage's commit for how). Every path below is written
> relative to the Orange Pi's install root (`/home/orangepi/IRIS-ASO`), not
> relative to this repo checkout — `modul4/server.py` here means
> `/home/orangepi/IRIS-ASO/modul4/server.py` on the Pi. The Pi never clones
> either repo directly; it receives a generated bundle built by
> `IRIS ASO/orangepi/build_bundle.py`, which pulls this directory's built
> output straight from a local `iris-iot` checkout. See that script and
> `IRIS ASO/orangepi/README.md` for the actual deploy path.

# Perburuan LoRa IRIS — papan skor (Modul 4)

Papan skor web untuk permainan berburu beacon LoRa. Berjalan seluruhnya pada
Orange Pi 4 PRO; tidak memerlukan Internet, akun, maupun proses deploy.

```
Beacon 1 ─┐                             ┌── papan skor (proyektor)
Hunter 1 ─┤                             ├── ponsel tiap kelompok
Beacon 2 ─┤                             ├── ponsel/laptop asisten
Hunter 2 ─┤   LoRa 920 MHz, 5 pasang    │
   ...    ├── (sync word + slot ────────┼─ Wi-Fi ─→ Orange Pi 4 PRO
Beacon 5 ─┤    sendiri per pasangan)    │            (AP + DHCP + NTP + server)
Hunter 5 ─┘                             └            http://192.168.4.1:8080
```

Satu alamat untuk semua orang. Peran dibedakan di dalam halamannya, bukan
oleh alamat yang berbeda: praktikan memasukkan NIM-nya sekali, asisten
mengetikkan token satu kali, proyektor memakai `?stage=1`.

---

## 1. Menyalakan hotspot pada Orange Pi

Modul 2 dan Modul 3 menjalankan Orange Pi sebagai *client* Wi-Fi kampus.
Modul 4 memerlukannya sebagai *access point*. Satu antarmuka `wlan0` tidak
dapat menjadi keduanya sekaligus, kecuali sebuah **dongle Wi-Fi USB kedua**
terpasang sebagai uplink terpisah -- lihat `orangepi/README.md` bagian 7.0.
Dengan dongle, `wlan0` menjadi access point sementara dongle tetap
tersambung ke Wi-Fi kampus, dan perburuan tetap terjangkau situs web secara
langsung. Tanpa dongle, perilaku lama berlaku:

> **Tanpa dongle uplink, Modul 4 dan Modul 2/3 tidak dapat dijalankan pada
> sesi yang sama.** Jadwalkan keduanya terpisah, dan kembalikan mode Pi
> sesudahnya. `opi_ap_on.sh` mendeteksi dongle secara otomatis setiap kali
> dijalankan -- tidak ada yang perlu diubah pada perintah di bawah ini.

```bash
sudo ./scripts/opi_ap_on.sh     # menjadi access point IRIS-IOT
sudo ./scripts/opi_ap_off.sh    # kembali menjadi client Wi-Fi kampus
```

Nilai bawaannya:

| Parameter | Nilai |
|---|---|
| SSID | `IRIS-IOT` |
| Kata sandi | `iris2026` |
| Alamat Pi | `192.168.4.1` |
| Rentang DHCP | `192.168.4.10` – `192.168.4.60` |
| Server NTP | `192.168.4.1` (Pi itu sendiri) |
| Papan skor | `http://192.168.4.1:8080` |

Nilai-nilai ini juga tertulis di dalam `hunter.ino` dan `beacon.ino`. Kalau
salah satunya diubah, ubah pula templatnya di `scripts/gen_modul4.py` lalu
jalankan ulang generatornya — jangan menyunting berkas hasil bangkitan.

### Jam

Hotspot ini tidak memiliki jalur ke Internet, sehingga Pi menjadi sumber waktu
bagi seluruh papan. **Setel jam Pi sebelum mode AP dinyalakan**, selagi masih
ada Internet:

```bash
sudo systemctl restart chrony && chronyc tracking
```

Jam mutlak Pi boleh saja meleset beberapa detik. Yang penting Beacon dan Hunter
berangkat dari *satu* sumber waktu, sehingga selisih keduanya tetap sahih —
dan selisih itulah yang dicatat praktikan.

---

## 2. Membangun dan menjalankan papan skor

Di Orange Pi papan skor berjalan sebagai `modul4.service` dan dikirim lewat
`IRIS ASO/orangepi/deploy.sh --modul 4`; perintah di bawah ini untuk
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

Di Orange Pi, `modul4.service` membaca token tetap dari
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

Buka `http://192.168.4.1:8080` untuk papan skor, dan
`http://192.168.4.1:8080/?stage=1` untuk mode proyektor.

---

## 3. Menjalankan permainan

Lima kelompok, lima pasangan Beacon/Hunter, lima beacon tersembunyi. Tiap
kelompok memburu **beacon-nya sendiri**; pasangan-pasangan itu tidak saling
mendengar karena kata sinkron radionya berbeda.

1. Nyalakan hotspot, lalu jalankan server. Catat tokennya.
2. Tiap kelompok mengunggah `beacon.ino` **dan** `hunter.ino` dari foldernya
   sendiri (`grupN/`). Tidak ada baris yang perlu disunting. Asisten
   **menyembunyikan** kelima beacon di sekitar gedung.
3. **Asisten mengisi jadwal sehari.** Buka `http://192.168.4.1:8080`, ketuk
   lambang di kiri atas tiga kali, masukkan token. Tab **Asisten** (mission
   control) terbuka sendiri. Buka **Jadwal dan kendali**, tempelkan daftar
   tiap sesi (lihat bagian 4), lalu **Mulai sesi ini**.
4. **Tiap praktikan membuka alamat yang sama di ponselnya** dan mengetikkan
   **NIM**-nya. Papan menampilkan kelompoknya sebagai rasi bintang beserta
   nama anggotanya untuk dipastikan, lalu tiga kartu singkat (tujuan, membaca
   sonar, mengklaim) dan pilihan **peran**.
5. **Kalibrasi acuan jarak.** Pegang satu papan Hunter tepat **1 meter** dari
   beacon-nya, pilih kelompok itu di **Jadwal dan kendali**, tekan
   **Kalibrasi 1 m**. Kalibrasi berlaku untuk semua kelompok dan bertahan
   melewati **Ronde baru** dan pergantian sesi, jadi cukup sekali per lokasi.
6. Proyektor membuka `http://192.168.4.1:8080/?stage=1`. Tombol
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

Papan mencoba menahan layar tetap menyala lewat **Screen Wake Lock**, tetapi
peramban hanya mengizinkannya pada *secure context* — `https://` atau
`localhost`. Papan ini disajikan di `http://192.168.4.1:8080`, yang **bukan**
secure context, jadi pada hari praktikum penahan itu **tidak aktif**. Ia
gagal diam-diam: tidak ada galat, tidak ada yang rusak, layarnya hanya tidur
seperti biasa.

Sampai papan ini disajikan lewat HTTPS, yang bekerja adalah hal yang paling
sederhana:

> **Sebelum sesi dimulai, minta tiap kelompok menyetel batas tidur layar
> ponselnya ke 5 menit atau "tidak pernah".**

Satu kalimat di awal sesi, dan masalahnya hilang untuk 150 menit berikutnya.

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

- NIM **tidak pernah** keluar lewat `GET /roster.json`, yang memang tanpa
  token supaya proyektor dapat menampilkan nama kelompok. Rute itu hanya
  membawa nama.
- Satu-satunya NIM yang pernah meninggalkan server adalah NIM yang baru saja
  diketik orangnya sendiri, dikembalikan kepada koneksi yang mengetiknya.
- Daftar lengkap beserta NIM hanya terbaca lewat perintah `jadwal_baca`, yang
  **memerlukan token asisten**.
- Nama anggota (bukan NIM) tetap terbaca siapa pun di hotspot `IRIS-IOT`,
  seperti sebelumnya, karena proyektor membutuhkannya.
- Pencarian NIM dapat dicoba berulang oleh siapa pun di hotspot. Ada batas
  percobaan per koneksi supaya menebak seluruh angkatan tidak menjadi murah,
  tetapi ini **bukan** otentikasi — ini jaringan tertutup untuk satu hari
  praktikum, dan itulah alasan jadwalnya tidak menginap semalam.

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
  `IRIS-IOT`, atau Pi masih dalam mode client. Serial Monitor hunter akan
  menggantung pada titik-titik "Menyambung ke hotspot Orange Pi".
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
- **Kolom delay kosong.** Salah satu papan gagal menyelaraskan jam ke Pi.
  Periksa bahwa Pi benar-benar melayani NTP dan jamnya sudah disetel.
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
- **Layar ponsel tertidur di tengah perburuan.** Penahan layar hanya
  diizinkan pada `https://` atau `localhost`, sedangkan papan ini disajikan
  di `http://192.168.4.1:8080`. Setel batas tidur layar tiap ponsel ke 5
  menit sebelum sesi dimulai; lihat bagian 3.
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
  di Orange Pi.
- **Fonta terlihat berbeda dari `games/`.** Instrument Serif dan IBM Plex
  diambil dari Google Fonts, yang tidak dapat dijangkau dari hotspot tanpa
  Internet, sehingga halaman jatuh ke Georgia/system-ui/Consolas. Tata
  letaknya tidak berubah. Untuk memakai fonta aslinya, unduh berkas woff2-nya
  ke `modul4/src/vendor/` dan sisipkan sebagai `@font-face` data URI.
