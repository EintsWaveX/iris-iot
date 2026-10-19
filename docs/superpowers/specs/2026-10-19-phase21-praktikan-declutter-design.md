# Phase 21: Praktikan declutter (design)

Asked 2026-10-18 19:21 WIB: "Praktikan UI (TOT, a real session, or just looking around) feels too crowded, especially the tab switches and info badges, and sometimes too much text in one go."

Sources:
- Screen tour and findings: `~/Downloads/design-review/rig/p22/{1440,390}` (before shots) and `scratchpad/tour/build.py` of session b9cb2fbc (findings f1 to f13 with Before, After, Why).
- Stage 0 mockup (structure only): `~/Downloads/design-review/mockups/phase21/`, screens `d21-module`, `d21-live`, `d21-dasbor`, `d21-modul`, `d21-home`, `d21-akun` in `app/screens-declutter21.js` and `app/declutter21.css`.

## Rulings

- The user agreed to all of f1 to f13 (2026-10-18 20:16 WIB). Their notes cover the desktop only; I derive the phone layout from each desktop decision.
- **The mockup is a reference only** (20:50 WIB): it gives the structure (what moves, merges, folds or goes, and in what order). Build every screen from the live components, keep their visual finish, and fix alignment and gaps to the live grid with the same taste as earlier phases.
- The three calls I made, confirmed 2026-10-19 05:12 WIB:
  1. JAM stays in the session row.
  2. Inside a running session the module header is dropped.
  3. Lanjut ke Kode stays as a button in the Persiapan lengkap box. The stepper's Next stays too, and the bottom pager goes.
- Home (signed out, `/`): only a frame for now: the title, plus Praktikum in the centre beside Lihat Modul. The real lab profile Home (divisions, history, photos) is designed in its own session.
- Dasbor (f5): reordered in this patch, built from the live components.

## Findings, as agreed

| # | After |
|---|---|
| f1 | One line stepper: numbered dots on a line (done, current, locked), each dot clickable, Prev and Next on the same row at the TOP. On a phone: "Langkah 5 dari 6 · Kode", the dots, two arrows. Icons only where they help (done check, lock). |
| f2 | One session row. SISA has the progress as its underline. JAM stays (ruling 1). "x dari 150 menit" goes. The module is named once. |
| f3 | Inside a session the module header goes (ruling 2). There are no other-module buttons. |
| f4 | Pills only for state (Belum Dibuka, Kosong, Selesai). Module and group show as plain text with the module colour dot. Tools show as plain text. |
| f5 | In a session, Dasbor shows Langkah Berikutnya first and widest, with Live beside it. TP becomes one slim row lower down. Bahan shows as three buttons. Kelompokmu is folded. |
| f6 | Kode: one quiet progress line (benar, salah, kosong, petunjuk). In the side column, Pin dan Skema folds to one row. |
| f7 | Live: the connect card shrinks to one row once connected. Simulasi shows only as the chip. One tab row. Segmented controls never wrap 2 + 1 on a phone. |
| f8 | Help on demand: a small tip or a fold. TP before its window opens shows the countdown and one line only. |
| f9 | Done: shipped a971420. |
| f10 | The same stepper in every mode. Only the number of steps changes. |
| f11 | One next action. With ruling 3: the box button plus the stepper's Next, no bottom pager. |
| f12 | Cards size to their content and rows align at the top. |
| f13 | One action per row (the row opens the summary). Umpan Balik shows only on the newest row. |

## Screen notes (user, 2026-10-18 20:16)

- **Nav:** for a signed-out visitor, Masuk becomes "Praktikum" with the door-open icon after it, in the centre of the navbar.
- **Beranda:**
  - Signed out, `/` becomes the Home frame (ruling above).
  - Today's signed-out Beranda content (thesis, Langit Lab, the four module lanes, the session path) merges into Modul.
  - Signed in, Beranda keeps today's view, and the Home frame shows again after signing out.
- **Modul:** one set of module cards. The card styling is adjusted ("we'll see how it goes").
- **Kode:**
  - The file tabs plus the Baris chips span exactly the editor's width, both when the editor is widened and when it isn't.
  - The Benar, Salah, Kosong and Petunjuk counts move somewhere quiet and must not look like tabs.
  - The widen toggle may move. The mockup puts it in the editor's foot.
- **Live, Tampilan Live (`/modules/N/live`) and Kelompok (`/groups/N`):** Serial Monitor, Alur and Bacaan become the kit's rainbow underline tabs.
- **Persiapan Alat:** "No need to fill in the entire card because of the leftover room" (f9, shipped).
- **Kode Sesi audit** for a right code from outside the session: shipped in a043331.

## Out of scope

The real lab profile Home, the Asisten screens (they only pick up the shared stepper), and anything outside the Praktikan screens.
