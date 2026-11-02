# Kandidat sweep: flow, lenses and checklist (2 Nov 2026)

Goal: every screen and click under the Kandidat menu looks and behaves like the mockup (`.b7pub/app/screens-rec1.js`, `screens-rec2p.js`, `rec2.css`, `rec9.css`, `rec11.css`), and works from a laptop down to a phone. Rules: [[mockup-exact-sweep-rule]], [[ui-simplicity-rules]].

## The flow, as a Panitia walks it

1. **List** (status chips, search, count, Download XLSX, Atur Berkas, Tambah CaAs, groups, one row per CaAs, the Cutting link beside each row).
2. **Periksa Berikutnya** opens the first waiting CaAs in the review drawer.
3. **Review drawer** (Admin and Ketua): document tabs, PDF viewer with V1/V2, Pemeriksaan (Sesuai / Perbaiki per file), Akun Oprec check, Nilai Berkas, Biodata, Catatan Panitia, previous/next CaAs, Setujui, Minta Perbaikan, Batalkan Persetujuan.
4. **Minta Perbaikan** dialog: the files marked Perbaiki, quick reasons, the note, Kirim.
5. **Lembar** (other roles): name, class, stage and notes only.
6. **Tambah CaAs**: three steps (Akun dan Biodata, Berkas PDF, Kirim ke CaAs), then edit and delete from the review drawer.
7. **Atur Berkas**: the list of documents, required, typed, size limit, order, restore the default.
8. **Late stages**: the chips and rows speak about the road (Berjalan, Tidak lolos, Mundur) and link to the stage's Cutting tab.

## Lenses used to judge each screen

| Lens | What it catches | How |
|---|---|---|
| Mockup parity | a missing control, a different order, a different state | pair shots (`rig/parity/kand_m.mjs` against `kand_r.mjs`, `kand_w.mjs`), then read the mockup source for what the shot cannot show (hover, empty, error) |
| Worst-case data (break-ui) | a long name cut with "...", a one-word name, 0 and 500 rows, a missing class | seed a long and a short name in the rig, look at 1440, 1024, 768, 390 |
| Low screens | a column that vanishes, a button pushed out of its row, a dialog taller than the screen | container queries on the list, shots at 1440, 1280, 1024, 900, 768, 390 |
| Unstyled leftovers | a raw browser control where the kit has one | grep every `className` against the CSS that ships; the list below came from this |
| Contrast (both themes) | a state colour that fails on light | tokens only, then a look at the light theme |
| Click path | too many presses for the job | count presses from the list to Setujui for one CaAs |
| Motion | enter and leave of dialogs, the row press, reduced motion | reduced-motion on, then off |

## Found and fixed in this pass

- `className="textarea"` and `className="input"` had no CSS (the mockup's `.input`, `.textarea` were never ported), so Minta Perbaikan, the Cutting notes, the Plotting note, the Pilih Jadwal note and the Bank Soal editors drew the browser's own box. Now styled once in `styles/field.css`.
- Names were cut to one letter and "..." below about 1100 px, and vanished at phone width. Rows now wrap the full name and NIM line, and the list changes shape by the room it has (container query on `.rec9-kcon`): full, icon-only Cutting link, no document bar, then a card.
- Tool row (search, count, buttons) wraps cleanly on a phone.
- The mockup's blur behind every scrim, the dimming of a dialog or drawer that has another dialog on top, and the light-theme placeholder colour.
- Batalkan Persetujuan (the mockup's footer button on a verified CaAs) did not exist: new `withdraw` decision on `POST review` (only while the CaAs is still at the document check, audited), the button, three languages, an API test.
- The review drawer was wider than a phone: its one column grew to the width of the whole tab row, so the Perbaiki chips ran off the edge.
- Second pass, every view and click at 390x844, 768x1024, 1024x700, 1280x600 and 320x640 (`rig/parity/kand_all.mjs`, one audit line per step for anything past the screen edge, clipped text or a dialog taller than the screen):
  - the review drawer was `100vw` wide, so beside a classic scrollbar its left 10px ran off the screen (now `100%`);
  - a toast landed on the bottom buttons of a phone dialog (Selesai, Kirim, Setujui) and covered them: while a dialog or drawer is open on a phone the toast goes to the top;
  - the phone toolbar: "Periksa Berikutnya" is full width, Download XLSX and Atur Berkas share a line, Tambah CaAs takes its own;
  - the Lembar (roles without approval) had no Tutup button, as the mockup has.
- The review drawer's head (colour bar, dot), the fade at the foot of its body, tabs that hug their words, and the light-theme fix note tint.

## Not Kandidat, seen on the way

- At 320 px the Cutting tab's `n7-miniRail` runs past the screen edge.
- The rig cannot upload a PDF (the storage endpoint is faked only in the browser check), so the PDF viewer's toolbar was not seen on a phone with a real file.

## Still open

- **Catatan Panitia** (a note only Panitia see) is in the mockup's review drawer and Lembar and has no column in the database. It needs a migration (`rec_candidate.panitia_note`), so it waits for your go.
- Drawer width: the mockup's rule (`min(1180px, 94%)`) is copied, but its shot is narrower; check with a real PDF in the viewer.
- Berkas files for the 41 real CaAs: the Drive files return 403 for the Google account in Chrome.
