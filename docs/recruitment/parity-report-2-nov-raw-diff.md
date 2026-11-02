| Menu | Tested (mock/live) | Overlays (mock/live) | Only mock / only live | Different result |
|---|---|---|---|---|
| ringkasan | 41/47 | 10/10 | 7/15 | 2 |
| kandidat | 64/70 | 34/59 | 15/4 | 1 |
| cutting | 23/15 | 4/5 | 15/6 | 2 |
| plotting | 19/23 | 8/6 | 9/8 | 1 |
| tes | 19/6 | 12/0 | 15/2 | 3 |
| wawancara | 11/26 | 4/1 | 7/20 | 2 |
| mengajar | 15/17 | 7/0 | 9/9 | 2 |
| penerimaan | 40/23 | 5/3 | 26/12 | 1 |
| kalender | 70/70 | 1/25 | 4/2 | 1 |
| bank | 43/34 | 6/3 | 21/16 | 1 |
| panitia | 1/15 | 1/0 | 1/15 | 0 |

# Click comparison, mockup vs live

## ringkasan

Controls tested: mockup 41, live 47. Overlays opened (modal, sheet, drawer, popover): mockup 10, live 10.

**In the mockup, not in live (7):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- Susun kursi Panitia: 27 dari 27 terisi > button "Koordinator" -> inline
- Masuk Latihan > button "Sebagai Asisten" -> inline
- Masuk Latihan > button "Sebagai CaAs" -> inline
- Masuk Latihan > button "Atur Ulang" -> modal:Atur Ulang Latihan? (540x225)
- Masuk Latihan > button "Keluar" -> inline
- Masuk Latihan > button "Keluar Latihan" -> inline

**In live, not in the mockup (15):**
- Susun kursi Panitia: 2 terisi > span "DES Desta" -> none
- Susun kursi Panitia: 2 terisi > span "DVA Dev Satu" -> none
- Susun kursi Panitia: 2 terisi > span "DVB Dev Dua" -> none
- Susun kursi Panitia: 2 terisi > span "GRY Gery" -> none
- Susun kursi Panitia: 2 terisi > span "NAT Nathania Putri" -> none
- Susun kursi Panitia: 2 terisi > span "PCT Pencipta Uji" -> none
- Susun kursi Panitia: 2 terisi > span "TST Tes Satu" -> none
- Susun kursi Panitia: 2 terisi > span "UAR Uji Arm" -> none
- Susun kursi Panitia: 2 terisi > span "UAS Uji Aso" -> none
- Susun kursi Panitia: 2 terisi > span "UDV Uji Dev" -> none
- Susun kursi Panitia: 2 terisi > span "UKA Uji Kepala Arm" -> none
- Susun kursi Panitia: 2 terisi > span "UKP Uji Kepala" -> none
- Susun kursi Panitia: 2 terisi > span "UAD Uji Ads Koordinator" -> none
- Susun kursi Panitia: 2 terisi > button "Koordinator divisi" -> toast:Uji Ads bukan koordinator lagi. (460x58)
- Buka Kandidat > button "Berjalan 22" -> inline

**Same overlay, different size (3):**
- "Tambah Acara": mockup modal:Tambah Acara (680x839) | live modal:Tambah Acara (740x844)
- "Periksa Berikutnya": mockup drawer:Pemeriksaan (880x900) | live drawer:Muhammad Alif Syahputra P (1180x900)
- "Aurelia Wening Ayu 1103241233 · TK-48-01 · 2023 ": mockup drawer:Pemeriksaan (880x900) | live drawer:Wulan Anggraini (1180x900)

**Same control, different result (2):**
- "Masuk Latihan": mockup inline (+5 new controls) | live none
- "Download XLSX": mockup toast:Mengunduh pendaftar-oprec-2026.xlsx. (460x51) | live none

## kandidat

Controls tested: mockup 64, live 70. Overlays opened (modal, sheet, drawer, popover): mockup 34, live 59.

**In the mockup, not in live (15):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- Cutting Berkas > button "Berkas" -> none
- Cutting Berkas > button "Tes Tulis" -> inline
- Cutting Berkas > button "Wawancara" -> inline
- Cutting Berkas > button "Tubes" -> inline
- Cutting Berkas > button "Mengajar" -> inline
- Cutting Berkas > button "Atur titik awal dan sasaran" -> modal:Titik Awal Cutting · Berkas (1100x335)
- Cutting Berkas > button "Teratas N" -> none
- Cutting Berkas > button "Nilai Minimal" -> inline
- Cutting Berkas > button "Usulkan dari Status Berkas" -> toast:Diusulkan dari status berkas: yang Sesuai lolos, yang masih  (460x100)
- Cutting Berkas > button "Terapkan ke yang Belum Diusulkan" -> toast:Garis potong diterapkan: 60 lolos untuk yang belum diusulkan (460x76)
- Cutting Berkas > button "Ubah Teks Amplop" -> modal:Teks Amplop (1100x868)
- Cutting Berkas > button "Kunci Hasil TAHAN" -> inline
- Cutting Berkas > button "40 kandidat belum punya usulan. Lihat" -> inline
- Cutting Berkas > button "Saring" -> popover:Saring (230x252)

**In live, not in the mockup (4):**
- button "Berjalan 22" -> inline (+0 new controls)
- button "Nama Panjang Sekali Untuk Menguji Layar Kecil Bi" -> drawer:Nama Panjang Sekali Untuk Menguji Layar Kecil Bin Fulan Al F (1180x900)
- button "Penerimaan" -> inline (+13 new controls)
- button "Naila Zahira Firdaus W9100001 · TK-49-01 · 2025 " -> drawer:Naila Zahira Firdaus (1180x900)

**Same overlay, different size (2):**
- "Periksa Berikutnya": mockup drawer:Pemeriksaan (880x900) | live drawer:Muhammad Alif Syahputra P (1180x900)
- "Vincent Aldrich Gunawan 1103243425 · TK-49-01 · ": mockup drawer:Pemeriksaan (880x900) | live drawer:Oktavia Rahmadani (1180x900)

**Same control, different result (1):**
- "Download XLSX": mockup toast:Mengunduh pendaftar-oprec-2026.xlsx. (460x51) | live none

## cutting

Controls tested: mockup 23, live 15. Overlays opened (modal, sheet, drawer, popover): mockup 4, live 5.

**In the mockup, not in live (15):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Tes Tulis" -> none
- button "Wawancara" -> inline (+1 new controls)
- button "Tubes" -> inline (+1 new controls)
- button "Mengajar" -> inline (+1 new controls)
- button "Teratas N" -> inline (+0 new controls)
- button "Nilai Minimal" -> inline (+0 new controls)
- input:range "Garis potong" -> input
- button "Terapkan ke yang Belum Diusulkan" -> toast:Garis potong diterapkan: 30 lolos untuk yang belum diusulkan (460x76)
- input:text "Cari nama atau NIM" -> input
- button "Saring" -> popover:Saring (230x252)
- Berkas > button "Usulkan dari Status Berkas" -> toast:Diusulkan dari status berkas: yang Sesuai lolos, yang masih  (460x100)
- Wawancara > button "Usulkan dari Keputusan Wawancara" -> toast:Diusulkan dari keputusan pewawancara. Yang Ragu-ragu dan yan (460x125)
- Tubes > button "Usulkan dari Keputusan Presentasi" -> toast:Diusulkan dari keputusan pewawancara. Yang Ragu-ragu dan yan (460x125)
- Mengajar > button "Usulkan dari Keputusan Penguji" -> toast:Diusulkan dari keputusan pewawancara. Yang Ragu-ragu dan yan (460x125)

**In live, not in the mockup (6):**
- button "Usulkan dari Status Berkas" -> toast:Yang terverifikasi diusulkan Lolos, yang belum disetujui diu (460x74)
- button "72 kandidat belum punya usulan. Lihat" -> gone
- input:text "Cari kandidat" -> input
- button "Semua kandidat" -> popover:Semua kandidat Belum diusulkan Usul Lolos Usul Gagal (182x200) + popover:Semua kandidat Belum diusulkan Usul Lolos Usul Gagal (180x200)
- button "Tulis catatan" -> modal:Catatan untuk Fikri Simpan (320x233)
- Tampilkan 20 Lagi > button "Kunci Hasil TAHAN" -> none

**Same overlay, different size (2):**
- "Atur titik awal dan sasaran": mockup modal:Titik Awal Cutting · Tes Tulis (1100x493) | live modal:Atur Titik Awal (1360x868)
- "Ubah Teks Amplop": mockup modal:Teks Amplop (1100x868) | live modal:Ubah Teks Amplop (1360x837)

**Same control, different result (2):**
- "Berkas": mockup inline (+1 new controls) | live none
- "Lolos": mockup inline (+0 new controls) | live none

## plotting

Controls tested: mockup 19, live 23. Overlays opened (modal, sheet, drawer, popover): mockup 8, live 6.

**In the mockup, not in live (9):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Tahap" -> popover:Tahap (230x156)
- button "Tutup Sekarang TAHAN" -> none
- button "Ubah" -> modal:Ubah Ruang (540x435)
- Permintaan 3 > button "Tolak" -> modal:Tolak Permintaan? (540x418)
- Permintaan 3 > button "Setujui" -> toast:Putu dipindah ke TULT 0605, Selasa, 17 November 2026. Dia di (460x76)
- Permintaan 3 > button "Sudah diputuskan (2)" -> inline
- Papan > button "Download XLSX" -> toast:Mengunduh plotting-tes-tulis.xlsx. (460x51)
- Papan > button "Auto Isi (18)" -> toast:Auto Isi menempatkan 18 kandidat merata ke ruang yang masih  (460x100)

**In live, not in the mockup (8):**
- button "Tes Tulis dan Program" -> popover:Tes Tulis dan Program Tes Wawancara Tes Mengajar (229x154) + popover:Tes Tulis dan Program Tes Wawancara Tes Mengajar (227x154)
- button "Tutup Sekarang" -> toast:Pilih Jadwal ditutup sekarang. Auto Isi siap dijalankan. (460x58)
- Buka Kalender > button "Bulan" -> none
- Buka Kalender > button "Agenda" -> inline
- Buka Kalender > button "Tambah Acara" -> modal:Tambah Acara (740x844)
- Buka Kalender > button "Bulan sebelumnya" -> inline
- Buka Kalender > button "Bulan berikutnya" -> inline
- Buka Kalender > button "Senin, 9 November 2026" -> inline

**Same overlay, different size (0):**
- none

**Same control, different result (1):**
- "Buka Kalender": mockup none | live inline (+14 new controls)

## tes

Controls tested: mockup 19, live 6. Overlays opened (modal, sheet, drawer, popover): mockup 12, live 0.

**In the mockup, not in live (15):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Sel 17 Nov siap diatur" -> none
- button "Atur Ruang" -> drawer:Atur Ruang (880x900)
- button "Ubah ruang" -> none
- button "Hapus ruang" -> toast:TULT 0604 dihapus. Urungkan (460x64)
- button "Slot dan Ruang TULT 0604 · 18.30 sampai 21.00 · " -> drawer:Slot dan Ruang (1180x279)
- button "Soal Siap 51 soal tertulis dan 8 soal C siap, cu" -> drawer:Soal Siap (1180x279)
- button "Pengawas Malam Ini Belum ada Pengawas. Plot dua " -> drawer:Atur Ruang (880x900)
- button "C Judge Cek bahwa PC Lab bisa menilai program C " -> drawer:C Judge (1180x575)
- button "Mulai Ujian" -> modal:Mulai Walau Belum Siap? (540x223)
- button "Coba Dulu di Ruang Latihan" -> modal:Ruang Latihan (540x413)
- Rab 18 Nov belum ada ruang > button "Siapkan Ruang" -> modal:Siapkan Ruang (540x225)
- Kam 19 Nov belum ada ruang > button "Siapkan Ruang" -> modal:Siapkan Ruang (540x225)
- Jum 20 Nov belum ada ruang > button "Siapkan Ruang" -> modal:Siapkan Ruang (540x225)
- Latihan tanpa kandidat > button "Slot dan Ruang Ruang Latihan · 18.30 sampai 21.0" -> drawer:Slot dan Ruang (1180x279)

**In live, not in the mockup (2):**
- button "Sel 17 Nov belum ada ruang" -> none
- Latihan tanpa kandidat > button "Buat Ruang Latihan" -> inline

**Same overlay, different size (0):**
- none

**Same control, different result (3):**
- "Rab 18 Nov belum ada ruang": mockup inline (+1 new controls) | live none
- "Kam 19 Nov belum ada ruang": mockup inline (+1 new controls) | live none
- "Jum 20 Nov belum ada ruang": mockup inline (+1 new controls) | live none

## wawancara

Controls tested: mockup 11, live 26. Overlays opened (modal, sheet, drawer, popover): mockup 4, live 1.

**In the mockup, not in live (7):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Layar QR Shift Ini" -> inline (+1 new controls)
- button "Buka Lembar Naila" -> drawer:Naila Zahira Firdaus (1240x876)
- button "Persiapan1/5" -> inline (+2 new controls)
- button "Gantikan Pewawancara" -> modal:Gantikan Pewawancara (540x278)
- Layar QR Shift Ini > button "Keluar dari layar QR (Esc)" -> modal:Absensi Wawancara · Shift 2 (1100x567)
- Persiapan1/5 > input:checkbox "on" -> none

**In live, not in the mockup (20):**
- Penilaian > button "Semua kandidat" -> popover:Semua kandidat Selisih besar (3) Ragu-ragu (2) Menunggu lemb (250x246) + popover:Semua kandidat Selisih besar (3) Ragu-ragu (2) Menunggu lemb (248x246)
- Penilaian > button "Rata-Rata" -> none
- Penilaian > button "Selisih" -> none
- Penilaian > button "Slot" -> none
- Penilaian > button "Download XLSX" -> none
- Penilaian > button "Rincian Naila" -> inline
- Penilaian > button "Rincian Citra" -> inline
- Penilaian > button "Rincian Bagas" -> inline
- Penilaian > button "Rincian Dimas" -> inline
- Template Pertanyaan > button "Download Template" -> none
- Template Pertanyaan > button "Tambah Pertanyaan" -> inline
- Template Pertanyaan > button "Tambah Parameter" -> inline
- Template Pertanyaan > button "Hapus" -> toast:Parameter dihapus dari template. Lembar yang sudah terkirim  (460x74)
- Template Pertanyaan > button "Bobot · Contoh kesimpulan" -> inline
- Template Pertanyaan > button "Kurangi" -> inline
- Template Pertanyaan > button "Tambah" -> inline
- Template Pertanyaan > button "Sembunyikan tingkat antar penguji" -> inline
- Template Pertanyaan > button "Naikkan" -> none
- Template Pertanyaan > button "Turunkan" -> inline
- Template Pertanyaan > button "Ubah" -> inline

**Same overlay, different size (0):**
- none

**Same control, different result (2):**
- "Penilaian": mockup none | live inline (+9 new controls)
- "Template Pertanyaan": mockup none | live inline (+14 new controls)

## mengajar

Controls tested: mockup 15, live 17. Overlays opened (modal, sheet, drawer, popover): mockup 7, live 0.

**In the mockup, not in live (9):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Layar QR Malam Ini" -> inline (+1 new controls)
- button "Gantikan Penguji" -> modal:Gantikan Penguji (540x278)
- button "Lihat" -> drawer:Naila Zahira Firdaus (1240x876)
- button "Lengkapi" -> drawer:Theo Anggraini (1240x876)
- button "Buka Lembar Maya" -> drawer:Maya Pradipta (1240x876)
- button "Persiapan1/5" -> inline (+2 new controls)
- Layar QR Malam Ini > button "Keluar dari layar QR (Esc)" -> modal:Absensi Tes Mengajar (1100x704)
- Persiapan1/5 > input:checkbox "on" -> none

**In live, not in the mockup (9):**
- Template > button "Download Template" -> none
- Template > button "Tetapkan Rubrik" -> toast:Rubrik ditetapkan. Tanda Contoh hilang dari lembar. (460x58)
- Template > button "Tambah Baris" -> inline
- Template > button "Tambah" -> inline
- Template > button "Naikkan" -> inline
- Template > button "Turunkan" -> inline
- Template > button "Hapus" -> toast:Parameter dihapus dari template. Lembar yang sudah terkirim  (460x74)
- Template > button "Bobot · Contoh kesimpulan" -> inline
- Template > button "Kurangi" -> inline

**Same overlay, different size (0):**
- none

**Same control, different result (2):**
- "Penilaian": mockup none | live inline (+0 new controls)
- "Template": mockup none | live inline (+14 new controls)

## penerimaan

Controls tested: mockup 40, live 23. Overlays opened (modal, sheet, drawer, popover): mockup 5, live 3.

**In the mockup, not in live (26):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "1 Tinjau 2 catatan belum dicek" -> none
- button "Kode 17 kode unik" -> inline (+6 new controls)
- button "3 Konfirmasi Belum siap" -> inline (+5 new controls)
- button "Kurangi" -> none
- button "Tambah" -> none
- input:text "Cari CaAs" -> input
- button "Urutkan" -> popover:Urutkan (200x108)
- button "Tidak" -> toast:Oktavia tidak diterima. Alasannya hanya terlihat Panitia. In (460x125)
- button "Tandai sudah dicek" -> inline (+4 new controls)
- button "Alasan (hanya Panitia)" -> popover:Alasan (hanya Panitia) (183x204)
- button "Periksa 2 Catatan" -> toast:Cek 2 catatan dulu. (460x51)
- Kode 17 kode unik > button "2 Kode 17 kode unik" -> none
- Kode 17 kode unik > button "Kode yang Sudah Dipakai (25)" -> modal:Kode yang Sudah Dipakai (1100x516)
- Kode 17 kode unik > button "Usulkan kode lain" -> inline
- Kode 17 kode unik > button "Kembali" -> inline
- Kode 17 kode unik > button "Lanjut ke Konfirmasi" -> inline
- 3 Konfirmasi Belum siap > button "Daftar sudah ditinjau 2 catatan belum dicek" -> inline
- 3 Konfirmasi Belum siap > button "Setiap kode unik 17 kode, tidak ada yang kembar" -> inline
- 3 Konfirmasi Belum siap > button "Target Asisten baru 17 diterima, 7 di bawah targ" -> inline
- 3 Konfirmasi Belum siap > button "Kembali" -> inline
- 3 Konfirmasi Belum siap > button "Lihat yang Belum" -> toast:Cek 2 catatan dulu. (460x51)
- Tandai sudah dicek > button "1 Tinjau 1 catatan belum dicek" -> none
- Tandai sudah dicek > button "Perlu Dicek 1" -> inline
- Tandai sudah dicek > button "Sudah dicek" -> inline
- Tandai sudah dicek > button "Periksa 1 Catatan" -> toast:Cek 1 catatan dulu. (460x51)

**In live, not in the mockup (12):**
- button "Kurangi target" -> none
- button "Tambah target" -> none
- input:text "Cari nama atau NIM" -> input
- button "Nilai Mengajar" -> popover:Nilai Mengajar Nilai Wawancara Nilai Tes Tulis Nama (169x200) + popover:Nilai Mengajar Nilai Wawancara Nilai Tes Tulis Nama (167x200)
- button "Lanjut ke Kode" -> inline (+5 new controls)
- button "Tutup Edisi Sekarang" -> modal:Tutup edisi ini? (540x182)
- Tidak diterima > button "Diterima 11" -> inline
- Tidak diterima > button "Tidak Diterima 1" -> inline
- Lanjut ke Kode > button "Kode yang Sudah Dipakai (14)" -> modal:Kode yang Sudah Dipakai (740x296)
- Lanjut ke Kode > button "Usulkan kode lain" -> inline
- Lanjut ke Kode > button "Kembali" -> inline
- Lanjut ke Kode > button "Lanjut ke Konfirmasi" -> inline

**Same overlay, different size (0):**
- none

**Same control, different result (1):**
- "Diterima 17": mockup inline (+0 new controls) | live none

## kalender

Controls tested: mockup 70, live 70. Overlays opened (modal, sheet, drawer, popover): mockup 1, live 25.

**In the mockup, not in live (4):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Open Recruitment · berjalan Minggu, 25 sampai Sa" -> inline (+1 new controls)
- button "Perpanjangan Pendaftaran Minggu, 1 sampai Senin," -> inline (+14 new controls)
- button "Pengecekan Berkas Senin, 9 sampai Selasa, 10 Nov" -> inline (+14 new controls)

**In live, not in the mockup (2):**
- button "Tambah Acara" -> modal:Tambah Acara (740x844)
- Agenda > button "Ubah" -> modal:Ubah Acara (740x750)

**Same overlay, different size (0):**
- none

**Same control, different result (1):**
- "Jumat, 13 November 2026, Pilih Jadwal Tes Tulis": mockup inline | live modal:Ubah Acara (740x786)

## bank

Controls tested: mockup 43, live 34. Overlays opened (modal, sheet, drawer, popover): mockup 6, live 3.

**In the mockup, not in live (21):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)
- button "Impor dan Ekspor" -> popover:Impor Ekspor (320x148)
- button "Saring format" -> popover:Saring format (230x320)
- Live Coding 8 > button "Hitung Mundur MUDAH 400 poin · 8 test · dipakai " -> inline
- Live Coding 8 > button "Balik Array SEDANG 600 poin · 10 test · belum di" -> inline
- Live Coding 8 > button "Bilangan Prima SEDANG 600 poin · 10 test · dipak" -> inline
- Live Coding 8 > button "Palindrom SEDANG 600 poin · 10 test · belum dipa" -> inline
- Live Coding 8 > button "Tambah Soal Draf sampai lolos Cek dengan Referen" -> toast:Soal baru dibuat sebagai draf. (460x51)
- Live Coding 8 > button "Mudah" -> none
- Live Coding 8 > button "Sedang" -> none
- Live Coding 8 > button "Kurangi" -> none
- Live Coding 8 > button "Tambah" -> none
- Pengaturan > button "Simpan Pengaturan" -> toast:Pengaturan disimpan. (460x51)
- Tambah Soal > button "Batalkan Soal" -> modal:Batalkan Soal Ini? (680x365)
- Tambah Soal > button "Simpan" -> toast:Soal disimpan sebagai versi 4. (460x51)
- Tambah Soal > button "Bagian" -> popover:Bagian (561x156)
- Tambah Soal > button "Jawaban benar" -> none
- Tambah Soal > button "Perbaiki Kunci" -> modal:Perbaiki Kunci (680x433)
- Tambah Soal > button "Acak Ulang" -> none
- Tambah Soal > button "A 28" -> none
- Tambah Soal > button "B 16" -> none

**In live, not in the mockup (16):**
- button "Lainnya" -> modal:Impor Ekspor (352x130)
- button "Semua format" -> popover:Semua format Pilihan Tunggal Kotak Centang Klik Baris Salah  (230x360) + popover:Semua format Pilihan Tunggal Kotak Centang Klik Baris Salah  (228x384)
- Live Coding > button "Hitung Mundur" -> inline
- Live Coding > button "Balik Array" -> inline
- Live Coding > button "Bilangan Prima" -> inline
- Live Coding > button "Palindrom" -> inline
- Pengaturan > button "Pasang Soal Bawaan" -> toast:Semua soal bawaan sudah ada. (460x58)
- Tambah Soal > button "Logika" -> popover:Logika Isi Celah (FITB) Code Tracing (552x154) + popover:Logika Isi Celah (FITB) Code Tracing (550x154)
- Tambah Soal > button "Kotak Centang Beberapa benar, jumlahnya tidak di" -> none
- Tambah Soal > button "Klik Baris Salah Kode bernomor, klik baris yang " -> inline
- Tambah Soal > button "Pilih Perbaikan per Baris Dropdown di baris tert" -> inline
- Tambah Soal > button "Susun Baris Susun baris, indentasi tetap" -> inline
- Tambah Soal > button "Pasangkan Kiri ke kanan, sampai 2 pengecoh" -> inline
- Tambah Soal > button "Isi Celah Celah __(n)__ yang diketik" -> inline
- Tambah Soal > button "Jawaban benar: Opsi 1" -> none
- Tambah Soal > button "Hapus opsi" -> inline

**Same overlay, different size (0):**
- none

**Same control, different result (1):**
- "Tertinggi dan Terendah SEDANG 600 poin · 10 test": mockup none | live inline

## panitia

Controls tested: mockup 1, live 15. Overlays opened (modal, sheet, drawer, popover): mockup 1, live 0.

**In the mockup, not in live (1):**
- button "Oprec Disembunyikan" -> popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194)

**In live, not in the mockup (15):**
- input:text "Cari Asisten" -> input
- span "DES Desta" -> none
- span "DVA Dev Satu" -> none
- span "DVB Dev Dua" -> none
- span "GRY Gery" -> none
- span "NAT Nathania Putri" -> none
- span "PCT Pencipta Uji" -> none
- span "TST Tes Satu" -> none
- span "UAR Uji Arm" -> none
- span "UAS Uji Aso" -> none
- span "UDV Uji Dev" -> none
- span "UKA Uji Kepala Arm" -> none
- span "UKP Uji Kepala" -> none
- span "UAD Uji Ads" -> none
- button "Jadikan koordinator" -> toast:Uji Ads jadi koordinator Akademik. (460x58)

**Same overlay, different size (0):**
- none

**Same control, different result (0):**
- none

