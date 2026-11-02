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
