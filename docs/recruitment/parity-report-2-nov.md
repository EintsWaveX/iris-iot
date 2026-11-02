# Oprec live vs mockup: parity report (2 Nov 2026)

What this is: for every parent menu in the main navbar, the child nodes it opens (modals, side drawers, popovers, toasts), compared one on one with the mockup (`.b7pub/app/screens-rec*.js`, `rec*.css`), plus what was fixed in the same pass.

## How it was checked, and what it cannot see

- **Click enumeration.** `rig/parity/oc.mjs` opens one menu on the mockup (Playwright on the mockup file) and on the live rig (the real app, signed in as the Ketua), lists every visible control, clicks each one from a clean state and records what opens: kind (modal, sheet, drawer, popover, toast), title and size. When a click only changes the page (a tab), the controls it reveals are clicked too (one extra level). `oc_diff.mjs` compares the two runs; `oc/report.md` is the raw diff, `mkreport.mjs` made the inventory in the appendix.
- **Side-by-side shots** (`pair.mjs`, `real_pn.mjs`) for Ringkasan, Kalender, Cutting, Plotting, Tes Tulis, Bank Soal, Panitia and Penerimaan.
- **Limits, stated plainly.** The rig database sits at the registration stage, and the mockup defaults to later stages. So a menu whose children only exist later (Tes Tulis rooms, Mengajar slots, the Hasil and Tutup screens of Penerimaan, the CaAs journey) can only be compared where I seeded data (Wawancara, Mengajar, Penerimaan finalists). The click run compares the **kind, title and size** of what opens, not every word or pixel inside it. Dialog content was only read where a shot is named below. Nothing here has been compared on production (Oprec is hidden there and has no finalists).

## Result per parent menu

Status words: **Match** (kind, title and size agree and a shot agrees), **Fixed** (a difference was found and fixed in this pass, working tree only), **Open** (a known difference remains), **Not comparable** (the rig has no data for that state).

| Parent menu | Child nodes in the mockup | Status |
|---|---|---|
| **Navbar itself** | Oprec visibility popover, Tampilan menu, Akun menu, Lainnya | **Fixed**: the bar folded Mengajar and Penerimaan below 1680 px, the mockup folds only Bank Soal, Panitia and Kalender from 1440 to 1679 px (cap 9) and five tabs from 1100 to 1439 px (cap 7). Now the same rule and the same order in Lainnya. **Open**: the Tampilan menu has extra rows live (Jam di navigasi, Suara) that the mockup does not; not changed because an earlier session added them on purpose. |
| **Ringkasan** | visibility popover, Tambah Acara modal, review drawer, Atur Berkas, Tambah CaAs, Atur Ulang Latihan modal | **Match** on shots. **Fixed**: Tambah Acara was 740 px wide, the mockup is 680 px (it is 740 px only when editing, because of the Hapus button). **Open**: Download XLSX shows a toast in the mockup and nothing live; Mode Latihan inline states not compared. |
| **Kandidat** | review drawer, Minta Perbaikan, Atur Berkas, Tambah CaAs (3 steps), Lembar | **Match** on 59 live overlays against 34 in the mockup (live has more rows). **Fixed**: the review drawer was 1180 px wide, the mockup's side drawer is 880 px. **Open**: Catatan Panitia (needs a database column and your go), Tambah CaAs is taller live (792 vs 690 px) because it keeps the Google Form's extra fields on purpose. |
| **Cutting** | Titik Awal Cutting dialog (per stage), Teks Amplop dialog, Saring popover, Kunci Hasil hold | **Fixed**: both dialogs were 1360 px wide, the mockup is 1100 px; the envelope dialog title now reads "Teks Amplop". **Open**: the mockup has one start dialog per stage ("Titik Awal Cutting · Tes Tulis"), live has one dialog for all stages ("Atur Titik Awal"). **Not comparable**: the Tes Tulis, Wawancara, Tubes and Mengajar sub-stages (live only shows Berkas at registration). |
| **Plotting** | Tahap popover, Ubah Ruang and Tambah Ruang modals, Tolak Permintaan modal | **Match** (Tambah Ruang 540 px in both). **Open**: examiners are dragged from a pool into lanes inside each room card in the mockup, live has separate lane cards with a + picker; the Lihat jump in Periksa Papan. **Not comparable**: Tolak Permintaan (the rig has no requests). |
| **Tes Tulis** | Atur Ruang drawer, Slot dan Ruang drawer, Soal Siap drawer, C Judge drawer, Mulai Walau Belum Siap modal, Ruang Latihan modal, Siapkan Ruang modal | **Not comparable**: the rig has no exam room, so live opened none of the 12 child nodes. **Open**: on an evening with no room the mockup offers "Siapkan Ruang" (a modal), live only says rooms come from Plotting. Needs a seeded room and a second pass. |
| **Wawancara** | Lembar drawer, Gantikan Pewawancara modal, Layar QR modal | See the Wawancara and Mengajar note below. |
| **Tubes** | Lembar Presentasi drawer and the team screens | **Exempt** (your decision: teams only, no daily check-in). Not compared. |
| **Mengajar** | Gantikan Penguji modal, Lihat, Lengkapi and Buka Lembar drawers, Layar QR modal | See the note below. |
| **Penerimaan** | Urutkan popover, Alasan popover, Kode yang Sudah Dipakai modal, summary modal with hold, Hasil screen, Tutup screen, celebration | **Fixed (large)**: it was never a port of the mockup (own class names, own 677-line CSS). Tinjau, Kode and Konfirmasi now use the mockup's markup and its CSS (copied as `recruitment-r8m.css`): step cards, Target card with STC tag and the kit stepper, filter chips, the Terima / Tidak pill, score bars, sticky foot bar, rule card, used-codes dialog (1100 px, was 740), readiness list, summary. **Open**: the Alasan popover and the "Fikri tidak diterima" toast after Tidak, the Tubes score column, two Konfirmasi rows (changed by the Ketua, envelope wording), names beside each used code, and the whole **Hasil** screen (hero plus two columns, audit log, what comes next) and **Tutup** screen (clock ring, How the Edition Closes switches, locks, data kept). Those two need data the live API does not return yet. |
| **Lainnya: Kalender** | Tambah Acara modal, Ubah Acara modal, Agenda view | **Match** on shots (month grid, legend, Berikutnya). Tambah Acara width fixed (above). |
| **Lainnya: Bank Soal** | Impor and Ekspor popover, Saring format popover, editor with Bagian popover, Batalkan Soal modal, Perbaiki Kunci modal | **Match** on shots. **Fixed**: the search box had no magnifier; Impor and Ekspor was a nav-style list live, now the mockup's two full-width icon buttons in a 240 px popover. **Open**: the Tampil column says "sudah" live and "23 kursi" in the mockup; the editor modals (Batalkan Soal, Perbaiki Kunci) were not reached in the live click run. |
| **Lainnya: Panitia** | search, drag cards, star for coordinator | **Fixed**: the magnifier sat on top of the placeholder text. Board layout matches on shots. |

**Wawancara and Mengajar note.** Both were ported earlier (PR #15, #16, #17) and passed their own click suites (23 of 23 and 18 of 18). In this pass the live side was enumerated with seeded evenings, as the Ketua (who sees only the Slotku empty state plus the Penilaian and Template tabs) and as a seated examiner (`*-ex.json`). Findings:

- **Fixed**: the sheets (Lembar Wawancara, Lembar Tes Mengajar) opened at 1360 px; the mockup's wide drawer is 1240 px. Added a `lembar` dialog size (1240 px) in the kit and used it for the sheet.
- **Kind of overlay is not a difference.** The mockup's drawers have been big centered modals since 28 Oct (a comment in `rec7.css`), so "drawer" in the mockup and "modal" live look the same. The one real side drawer is the candidate review drawer (880 px), now matched.
- **Open**: "Gantikan Pewawancara" / "Gantikan Penguji" (a 540 px modal) and "Layar QR Shift Ini" (an Absensi modal, 1100 px) were not on screen for either identity the live run used (the Ketua and one seated examiner). I did not try the PJ identity of the seeded shift, so I cannot say whether live has them. Needs one more pass.
- **Open**: the run could not click the Persiapan checklist rows one by one ("gone": its label lookup failed after the rows became kit checkboxes). The tick itself was not checked on screen.
- **Known from before** (not re-measured): examiner pool drag in Plotting, the Lihat jump, the panel title for an examiner without a seat.

## Fixed in this pass (uncommitted, nothing deployed)

1. Search boxes: Bank Soal icon, Panitia icon overlap (`recruitment.css`, `BankList.tsx`).
2. Five raw browser checkboxes now use the kit `Checkbox` (Persiapan lists in Wawancara and Mengajar, the lab toggle in the Lembar, two in Tubes).
3. Four mockup CSS rules that never reached the live app (`.n7-stagehead__act`, `.r3tl`, `.r3fitb .r3hl`).
4. Nav fold rule and order (`RecNav.tsx`).
5. Penerimaan Tinjau, Kode and Konfirmasi on the mockup's markup and CSS (`PenerimaanTab.tsx`, `recruitment-r8m.css`, `pnLook.ts`); hover rules gated behind a hover-capable pointer and no `transition: all`, as the repo's test requires.
6. Dialog and drawer sizes: Tambah Acara (md when adding), Cutting dialogs (form), Penerimaan dialogs (form), candidate review drawer (880 px).
7. Bank Soal Impor and Ekspor popover.
8. Sheet size: Lembar Wawancara and Lembar Tes Mengajar 1360 px to 1240 px (new `lembar` size in `Dialog`).

Checks run: typecheck clean, ESLint clean on the touched files, `src/lib` tests 1614 of 1614 after the CSS fix. The shots in the appendix section were taken on a rig build that includes items 1 to 6 except the Bank popover and the 880 px drawer, which were built but not shot.

## Still open, in the order I would take them

1. Penerimaan Hasil and Tutup screens (need the run log and the close settings in the API).
2. Tes Tulis: seed a room and compare the five child nodes (drawers and modals).
3. Cutting: the per-stage start dialog, and the later sub-stages with seeded scores.
4. Plotting: examiner pool and in-card lanes.
5. CaAs journey states (the amplop, the later stages) and phone widths and the light theme everywhere.
6. Catatan Panitia (needs a migration and your go).

## Appendix: child nodes seen by the click run

Mockup against live, per menu. Candidate rows and calendar days are collapsed into one line each. Sizes are width by height in px at a 1440 px window.

### Ringkasan

Clicked 41 controls in the mockup and 47 in the live rig. Overlays opened: 10 in the mockup, 10 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| 3 Siapkan Pengecekan Be… › Tambah Acara | modal:Tambah Acara (680x839) |
| Buka Kandidat › Periksa Berikutnya | drawer:Pemeriksaan (880x900) |
| Buka Kandidat › Atur Berkas | modal:Atur Berkas (1100x868) |
| Buka Kandidat › Tambah CaAs | modal:Tambah CaAs dari Google Form (1100x690) |
| Buka Kandidat › (any candidate row) | drawer:Pemeriksaan (880x900) |
| Masuk Latihan › Atur Ulang | modal:Atur Ulang Latihan? (540x225) |

**Live child nodes**

| Control | Opens |
|---|---|
| 3 Siapkan Pengecekan Be… › Tambah Acara | modal:Tambah Acara (740x844) |
| 3 Siapkan Pengecekan Be… › (a day in the month grid) | modal:Ubah Acara (740x750) |
| Buka Kandidat › Periksa Berikutnya | drawer:Muhammad Alif Syahputra P (1180x900) |
| Buka Kandidat › Atur Berkas | modal:Atur Berkas (1100x868) |
| Buka Kandidat › Tambah CaAs | modal:Tambah CaAs dari Google Form (1100x792) |
| Buka Kandidat › (any candidate row) | drawer:Muhammad Alif Syahputra P (1180x900) |

### Kandidat

Clicked 64 controls in the mockup and 70 in the live rig. Overlays opened: 34 in the mockup, 59 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Periksa Berikutnya | drawer:Pemeriksaan (880x900) |
| Atur Berkas | modal:Atur Berkas (1100x868) |
| Tambah CaAs | modal:Tambah CaAs dari Google Form (1100x690) |
| (any candidate row) | drawer:Pemeriksaan (880x900) |
| Cutting Berkas › Atur titik awal dan sasaran | modal:Titik Awal Cutting · Berkas (1100x335) |
| Cutting Berkas › Ubah Teks Amplop | modal:Teks Amplop (1100x868) |
| Cutting Berkas › Saring | popover:Saring (230x252) |

**Live child nodes**

| Control | Opens |
|---|---|
| Periksa Berikutnya | drawer:Muhammad Alif Syahputra P (1180x900) |
| Atur Berkas | modal:Atur Berkas (1100x868) |
| Tambah CaAs | modal:Tambah CaAs dari Google Form (1100x792) |
| (any candidate row) | drawer:Muhammad Alif Syahputra P (1180x900) |
| Nama Panjang Sekali Untuk Menguji… | drawer:Nama Panjang Sekali Untuk Menguji Layar Kecil Bin Fulan Al F (1180x900) |
| Naila Zahira Firdaus W9100001 · T… | drawer:Naila Zahira Firdaus (1180x900) |

### Cutting

Clicked 23 controls in the mockup and 15 in the live rig. Overlays opened: 4 in the mockup, 5 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Atur titik awal dan sasaran | modal:Titik Awal Cutting · Tes Tulis (1100x493) |
| Ubah Teks Amplop | modal:Teks Amplop (1100x868) |
| Saring | popover:Saring (230x252) |

**Live child nodes**

| Control | Opens |
|---|---|
| Ubah Teks Amplop | modal:Ubah Teks Amplop (1360x837) |
| Semua kandidat | popover:Semua kandidat Belum diusulkan Usul Lolos Usul Gagal (182x200) |
| Atur titik awal dan sasaran | modal:Atur Titik Awal (1360x868) |
| Tulis catatan | modal:Catatan untuk Oktavia Simpan (320x233) |

### Plotting

Clicked 19 controls in the mockup and 23 in the live rig. Overlays opened: 8 in the mockup, 6 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Tahap | popover:Tahap (230x156) |
| Ubah | modal:Ubah Ruang (540x435) |
| Tambah Ruang | modal:Tambah Ruang (540x435) |
| Permintaan 3 › Tolak | modal:Tolak Permintaan? (540x418) |

**Live child nodes**

| Control | Opens |
|---|---|
| Tes Tulis dan Program | popover:Tes Tulis dan Program Tes Wawancara Tes Mengajar (229x154) |
| Tambah Ruang | modal:Tambah Ruang (540x417) |
| Buka Kalender › Tambah Acara | modal:Tambah Acara (740x844) |
| Buka Kalender › (a day in the month grid) | modal:Ubah Acara (740x750) |

### Tes Tulis

Clicked 19 controls in the mockup and 6 in the live rig. Overlays opened: 12 in the mockup, 0 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Atur Ruang | drawer:Atur Ruang (880x900) |
| Slot dan Ruang TULT 0604 · 18.30 … | drawer:Slot dan Ruang (1180x279) |
| Soal Siap 51 soal tertulis dan 8 … | drawer:Soal Siap (1180x279) |
| Pengawas Malam Ini Belum ada Peng… | drawer:Atur Ruang (880x900) |
| C Judge Cek bahwa PC Lab bisa men… | drawer:C Judge (1180x575) |
| Mulai Ujian | modal:Mulai Walau Belum Siap? (540x223) |
| Coba Dulu di Ruang Latihan | modal:Ruang Latihan (540x413) |
| Rab 18 Nov belum ada ru… › Siapkan Ruang | modal:Siapkan Ruang (540x225) |
| Kam 19 Nov belum ada ru… › Siapkan Ruang | modal:Siapkan Ruang (540x225) |
| Jum 20 Nov belum ada ru… › Siapkan Ruang | modal:Siapkan Ruang (540x225) |
| Latihan tanpa kandidat › Slot dan Ruang Ruang Latihan · 18… | drawer:Slot dan Ruang (1180x279) |

**Live child nodes**

| Control | Opens |
|---|---|
| (none) | |

### Wawancara

Clicked 11 controls in the mockup and 26 in the live rig. Overlays opened: 4 in the mockup, 1 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Buka Lembar Naila | drawer:Naila Zahira Firdaus (1240x876) |
| Gantikan Pewawancara | modal:Gantikan Pewawancara (540x278) |
| Layar QR Shift Ini › Keluar dari layar QR (Esc) | modal:Absensi Wawancara · Shift 2 (1100x567) |

**Live child nodes**

| Control | Opens |
|---|---|
| Penilaian › Semua kandidat | popover:Semua kandidat Selisih besar (3) Ragu-ragu (2) Menunggu lemb (250x246) |

### Mengajar

Clicked 15 controls in the mockup and 25 in the live rig. Overlays opened: 7 in the mockup, 1 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Gantikan Penguji | modal:Gantikan Penguji (540x278) |
| Lihat | drawer:Naila Zahira Firdaus (1240x876) |
| Lengkapi | drawer:Theo Anggraini (1240x876) |
| Buka Lembar Maya | drawer:Maya Pradipta (1240x876) |
| Layar QR Malam Ini › Keluar dari layar QR (Esc) | modal:Absensi Tes Mengajar (1100x704) |

**Live child nodes**

| Control | Opens |
|---|---|
| Penilaian › Semua kandidat | popover:Semua kandidat Selisih besar (3) Ragu-ragu (1) Menunggu lemb (250x246) |

### Penerimaan

Clicked 40 controls in the mockup and 23 in the live rig. Overlays opened: 5 in the mockup, 3 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Urutkan | popover:Urutkan (200x108) |
| Alasan (hanya Panitia) | popover:Alasan (hanya Panitia) (183x204) |
| Kode 17 kode unik › Kode yang Sudah Dipakai (25) | modal:Kode yang Sudah Dipakai (1100x516) |

**Live child nodes**

| Control | Opens |
|---|---|
| Nilai Mengajar | popover:Nilai Mengajar Nilai Wawancara Nilai Tes Tulis Nama (169x200) |
| Tutup Edisi Sekarang | modal:Tutup edisi ini? (540x182) |
| Lanjut ke Kode › Kode yang Sudah Dipakai (14) | modal:Kode yang Sudah Dipakai (740x296) |

### Kalender (Lainnya)

Clicked 70 controls in the mockup and 70 in the live rig. Overlays opened: 1 in the mockup, 25 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |

**Live child nodes**

| Control | Opens |
|---|---|
| Tambah Acara | modal:Tambah Acara (740x844) |
| (a day in the month grid) | modal:Ubah Acara (740x750) |
| Agenda › Ubah | modal:Ubah Acara (740x750) |
| Bulan berikutnya › (a day in the month grid) | modal:Ubah Acara (740x820) |

### Bank Soal (Lainnya)

Clicked 43 controls in the mockup and 34 in the live rig. Overlays opened: 6 in the mockup, 3 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |
| Impor dan Ekspor | popover:Impor Ekspor (320x148) |
| Saring format | popover:Saring format (230x320) |
| Tambah Soal › Batalkan Soal | modal:Batalkan Soal Ini? (680x365) |
| Tambah Soal › Bagian | popover:Bagian (561x156) |
| Tambah Soal › Perbaiki Kunci | modal:Perbaiki Kunci (680x433) |

**Live child nodes**

| Control | Opens |
|---|---|
| Lainnya | modal:Impor Ekspor (352x130) |
| Semua format | popover:Semua format Pilihan Tunggal Kotak Centang Klik Baris Salah  (230x360) |
| Tambah Soal › Logika | popover:Logika Isi Celah (FITB) Code Tracing (552x154) |

### Panitia (Lainnya)

Clicked 1 controls in the mockup and 15 in the live rig. Overlays opened: 1 in the mockup, 0 live.

**Mockup child nodes**

| Control | Opens |
|---|---|
| Oprec Disembunyikan | popover:Oprec Disembunyikan Pengunjung, Praktikan dan pendaftar belu (432x194) |

**Live child nodes**

| Control | Opens |
|---|---|
| (none) | |


