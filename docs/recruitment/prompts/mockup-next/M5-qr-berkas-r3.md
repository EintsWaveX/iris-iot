# M5 · QR wall, Berkas, and the R3 candidate test screens

Read `_CONTEXT.md` first. These screens are only reskinned or still old. Redesign them in place. Keep every feature (parity audit first).

## You own (edit)
`app/screens-rec2p.js` (the QR parts only: `Projector` :649, `ScanResult` :684, `Override` :710, `OverrideHost` :825, `RecTodayExtra` :742, and the Berkas `BerkasSheet` :330), `app/screens-rec3.js`, `app/screens-rec3lc.js`, `app/rec2.css`, `app/rec3.css`. **Do not touch** `Board`, `Requests`, `SlotSetup`, `autofill` or `Plotting` in `screens-rec2p.js` (other prompts use them). Hooks for shared files go in your report.

## Audit result you start from
- **r2-qr** (registered rec2p:805): the full-screen projector is a legitimate full-screen exception, keep it. The manual attendance list is a wide drawer, which breaks the rule → a **centered modal**. Reuse `ScanResult` in the Fog look. Fold the QR entry points into one guided "Hari Ini" action (`RecTodayExtra`). QR is also used per interview shift and for the Tubes evenings, so make the wall **stage-aware** (the title, the slot and the roster come from a `cfg`; the interview Slotku already links to it).
- **r2-berkas** (rec2p:751, sheet :330): the shell is new (N7 header), the sheet is a wide **side drawer, which is allowed here** (Berkas review queue). Keep it. Remove or hide the inert "Nilai Berkas" block unless the PRD needs it (check; report). Add the Kandidat area colour.
- **r3-checkin** (rec3:540, `CheckIn` :455, `Lobby` :492): already one screen. Polish only.
- **r3-soal** (rec3:557, `Runner` :317, `RefDrawer` :403): References is a wide drawer → **centered modal**. The navigator rail is dense; make laptop-first, the phone strip secondary.
- **r3-keadaan** (rec3:593): a gallery of nine states. Check that the cover and time-up overlays are centered modals.
- **r3-putar** (rec3lc:333, `SpinScreen` :126): a long page with the brief and the phone hotspot → collapse into **steps**.
- **r3-lc** (rec3lc:350, `LcScreen` :281): three drawers (Tugasmu, Hotspot, References) → **centered modals**; four banner types and a three-tab side panel are heavy → simplify without removing a feature (priority banner, the rest behind a "details" modal).

## Rules
One screen one job, guided steps, laptop first, primary action visible at 1280x600, contrast in both themes, centered modals. The Malam Ujian seat and Room Setup side drawers are not yours.

## Done
As in `_CONTEXT.md`, plus: the S3 flow still passes (`click9.mjs` covers it), before and after screenshots, a parity list per screen, anything you could not verify.
