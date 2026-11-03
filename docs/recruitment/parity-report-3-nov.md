# Mockup vs live, click pass of 3 Nov 2026

What ran: the click enumerator (`rig/parity/oc.mjs`) on all 11 menus, mockup and the rebuilt rig (main at PR #29 plus the rig-only `db.ts` hunk, migration 0062 applied to the rig), then `oc_diff.mjs`. 22 runs, 0 failures. Raw diff: `rig/parity/oc/report.md`.

**This is not a proof of an exact match.** The enumerator compares what each click opens (kind, title, size) and only for the controls it can reach from the state each side starts in. The mockup starts at later stages with full data; the rig starts wherever its seed left it. Most of the 490 diff lines are that gap, not a real difference. The pixel and markup pass (`pair.mjs` shots, 1440 and phone widths, dark and light) did **not** run in this pass: the rig died from low memory before it could start.

## Sorted

**State differences, not bugs** (the two sides were on different screens or data):
- Every menu: "Oprec Disembunyikan" popover. The rig has Oprec visible, so the control reads differently.
- Ringkasan, Kalender, Plotting: "Buka Kalender" and the calendar dialogs show up on one side only because the mockup's card starts collapsed.
- Wawancara, Mengajar: as the Ketua the live app shows no "Layar QR Shift Ini", "Buka Lembar", "Persiapan" or "Gantikan": the Ketua is not seated on a shift. These show for a seated examiner or a PJ (checked in the 2 Nov PJ run; the PJ's QR button is now scoped on the server, PR #28).
- Penerimaan: the rig sits on the Hasil screen (live saw 10 controls, the mockup 40 on Tinjau). Not comparable until the rig is reset to Tinjau.
- Plotting "Tolak" and "Setujui": the rig has no slot change requests.
- Tes Tulis: the rig has an evening that is running and a finished room; the mockup shows a room before it starts.
- Panitia: the mockup list is a static picture; live lists the real Asisten.

**Deliberate (you ruled, or a standing rule):**
- Small dialogs open compact (680, 740) where the mockup uses 1100 or 1180 (Slot dan Ruang, Soal Siap, C Judge, Titik Awal Cutting). Rule "compact small dialogs", 2 Nov.
- Tes Tulis readiness rows are dialogs live and drawers in the mockup, same reason.
- Bank Soal has more question formats live (Klik Baris Salah, Susun Baris, Pasangkan, Isi Celah, ...), so the format filter is taller (360 vs 320).
- Tampilan menu extras (Jam di navigasi, Suara); Tambah CaAs extras (prodi, MK IoT, Praktikum IoT).
- New since the mockup: Hitungan per Prodi, IPK, Potensi Cut, revision marks, per-file marks for the CaAs, the PJ's scoped QR button.
- Tubes: exempt (see `tubes-deferred.md`).

**Fixed in this pass:**
- Bank Soal: the icon button next to the tabs was labelled "Lainnya"; the mockup calls it "Impor dan Ekspor" (en "Import and Export", zh "导入和导出").

**Open, needs a decision or a seeded state:**
- Tes Tulis "Hapus ruang": the mockup deletes at once and shows a toast with Urungkan; live asks "Hapus TULT 0605?" first. A real undo would have to bring back a room with its seats and answers. Recommendation: keep the confirm (safer).
- Tes Tulis "Ubah ruang" opens a modal live; the mockup has no such control on that screen.
- Cutting: the mockup's per-stage "Usulkan dari ..." buttons carry different labels per stage (Keputusan Wawancara, Keputusan Presentasi, Keputusan Penguji); live keeps one label per tab in the stages I reached. Needs a look at each stage with seeded results.
- Kalender: the "Jumat, 13 November, Pilih Jadwal Tes Tulis" row opens an Ubah Acara dialog live; the mockup row only expands. Needs a look.
- Not reached on either side: Gantikan Pewawancara and Gantikan Penguji (540 px), Alasan popover, Hasil and Tutup screens, CaAs journey states, phone widths, light theme.

## To finish the exact-match claim
1. Free memory (close other apps), restart Postgres, the API and `serve_dist`.
2. Reset the rig to Tinjau for Penerimaan and seed Tes Tulis before start, Cutting results per stage and the CaAs journey (`seed_*.mjs`).
3. Run `pair.mjs` for all screens at 1440 and 390 in dark and light, read each pair, and run `audit9.mjs` for overflow.
4. Turn each remaining difference into "deliberate" or a fix.

## Part 2 (3 Nov, after the rig restart)

Ran on the rig rebuilt from main at PR #31: `pair.mjs` for 14 screens at 1440 (mockup and live side by side, dark theme), and `audit9.mjs` at 390 px for 14 deep states.

- **Overflow at 390 px:** none, in all 14 deep states.
- **Layout and structure:** the 14 pairs have the same structure. The differences left are state and data (dates, which stage is selected, who is seated, a live MQTT banner on the rig), not markup.
- **Fixed from the pairs:** Oprec dropdowns now read in Title Case (trigger and options) like the mockup (`Semua Kandidat`, `Semua Format`); the Tes Tulis Soal Siap row reads "51 soal tertulis dan 8 soal C siap, cukup untuk 24 kursi" from real counts; the Mulai Ujian button has no trailing arrow.
- **Checked and fine:** the Penerimaan audit log shows the raw action code in monospace, as the mockup does.
- **Not run:** light theme pairs, phone-width pairs (only overflow was checked at 390), the 320 px width, and the seeded states for Gantikan Pewawancara and the CaAs journey. The `daftar` and `home` pairs compare different screens and are not valid.

## Part 3 (3 Nov, light theme, phone, 320 px, PJ and journey states)

- **Light theme, 1440 px** (`pair2.mjs THEME=light`): 14 pairs, same structure as dark. Differences are data only.
- **Phone, 390 x 844, dark** (`pair2.mjs W=390`): 14 pairs. Live headers, chips, toolbars and the bottom nav match the mockup's phone layout. The mockup's own Plotting window card is cramped at 390 px (its title wraps one word per line); live is better there.
- **Overflow at 320 px**: none in the 14 deep states (390 px was clean too).
- **Outside PJ's QR screen (PR #28), end to end on the rig**: the rig's seeded PJ shifts had no calendar event attached, so `qrShift` was false. Real slots take the stage's Tes Wawancara or Tes Mengajar event on creation, so I attached event 12 to the two rig shifts. Result: `qrShift` true, "Layar QR Shift Ini" appears on both PJ shifts, `qr-token` for another event answers 403. `qr-events` is empty only because Tes Wawancara is not live at that moment.
- **Gantikan Pewawancara / Gantikan Penguji** now reached with the PJ identities: 540 x 270 modal (mockup 540 x 278), same title.
- **CaAs journey**, four seeded states (unopened envelope, opened pass, fail, reveal in the future): each renders its own card, journey line and counter as intended.
- **Not redone**: Penerimaan Tinjau, Kode and Konfirmasi (the rig is on the Hasil screen after its test run; those screens were matched on 2 Nov and no PR since touched them). Tubes stays parked.
- **Side effect to know**: the click enumerator clicks every Hapus on the rig, so the rig's Wawancara and Mengajar templates lost rows. Rig only.

## Part 4 (3 Nov)

- **Cutting, per-stage propose button (PR #35):** the mockup's "Usulkan dari Keputusan Wawancara / Presentasi / Penguji" was missing live. Added, using the existing bulk propose action (Lolos stays Lolos, cut becomes Gagal; Ragu-ragu, makeup and already-proposed rows are left for the Pleno). Checked on the rig: of 4 candidates with a verdict, 2 were proposed, 2 left alone, and the toast shows the mockup's wording.
- **Kalender "Pilih Jadwal" row:** the enumerator saw a modal live and an inline expand in the mockup, but the mockup's footnote says a click on a bar changes its content, so both open an editor. Not a difference.
- **Still open:** Tes Tulis "Hapus ruang" (confirm vs undo toast, your call), Penerimaan Tinjau, Kode and Konfirmasi not re-shot, Tubes parked, a full light-theme and phone pass of the seeded later stages beyond the screens listed above.

## Part 5 (3 Nov evening, rig rebuilt from main after PR #39)

Ran on a fresh build of the code that is on prod (rig API restarted, static site rebuilt). `pair.mjs` at 1440 dark, `pair2.mjs` at 1440 light and 390 phone dark, for the 12 panel and CaAs screens; the new QR screens were driven on the rig as Ketua.

- **Structure:** all 12 pairs have the same structure at 1440 (dark and light) and at 390. What differs is data and state: dates, who is seated, which stage is selected, Wawancara and Mengajar saying "Kamu belum dapat slot" for a Ketua with no slot, Penerimaan sitting on its Hasil screen, the CaAs card showing a finished journey where the mockup shows an unopened envelope. The Kandidat row's document dots are hidden by the mockup's own "late" rule once registration is closed.
- **Deliberate differences from the mockup (user's call):**
  - Kandidat toolbar: one Cutting button per stage with candidates, plus Penerimaan, next to Hitungan per Prodi, instead of one button on every row. Also extra chips (Berjalan, Tidak lolos). With the extra chips, "Periksa Berikutnya" wraps to its own row at 1440 (the mockup keeps it at the right of the chip row).
  - Home banner restyled (no stage names, no timeline).
  - QR wall: the Google Form option, the Atur QR gear, the last four scans from the responses sheet, and "Belum Mulai" for events within 3 days (Asisten only).
- **Fixed in this pass:** the "Belum Mulai" placeholder on the QR wall was a blank white square (the white QR box showed through); it is now a dashed, readable placeholder in both themes.
- **Checked on the rig, end to end:** the wall lists the not-yet-started Tes Tulis event as "Belum Mulai" with no token and no count; Atur QR opens, switches to Google Form, shows a live QR preview of the pasted link, saves, and the wall then shows the form QR with the "sheet can't be read" message for a made-up sheet; the setting was reset afterwards. The per-stage Cutting buttons render at 1440, 700 and 390.
- **Not done:** Penerimaan Tinjau, Kode and Konfirmasi (the rig stays on Hasil; the user asked for the rig to be left as it is), Tubes (parked), the CaAs-side envelope reveal and Pilih Jadwal states (they need reseeding), and a pass against real prod data (prod needs a signed-in session the agent does not use).
