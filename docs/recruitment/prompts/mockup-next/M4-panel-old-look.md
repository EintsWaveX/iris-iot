# M4 · Panitia screens still in the old look (R1)

Read `_CONTEXT.md` first. The panel shell, Plotting, Cutting, Bank and Malam Ujian are new. These are not. Redesign them in place (rule 12: replace, no second copy). Keep every feature (parity audit first).

## You own (edit)
`app/screens-rec1.js` (Home banner, Daftar, `Funnel`, `Todo`, `Today`, `Kandidat`, `CandSheet`, `KalenderTab`, `RecCal`, `EventDialog`, `PanitiaBoard`), `app/rec1.css`, and **new** `app/rec9.css` (add it to your hooks: a `<link>` in `index.html` and `local.html`). Read-only: the rest. Hooks for shared files go in your report.

## Audit result you start from (screens-rec1.js line numbers)
- **Ringkasan** (`PanelPage` :826): `Funnel` (:687) shows registration only with hard-coded numbers (52, 29, 17, 6, "target about 100") and nothing for Berkas, Tes, Wawancara, Tubes, Mengajar or Diterima. `Todo` (:695) has four static role strings about registration and the Bank. `Today` (:705) is stage-aware only through generic events; its deadline text is hard-coded to "Pendaftaran tutup". → Make Ringkasan **one job: "what is next"**, stage-aware, with a guided step per role; a Funnel across **all** stages (sample numbers per stage); a Todo per role per stage (Cutting, Plotting, Wawancara, Tubes, Mengajar, Penerimaan).
- **Kandidat** (:737, `rec-table`) and `CandSheet` (:714): a table with search, status filter and XLSX download. The non-Ketua sheet is a wide drawer, which breaks the surface rule. → Make Kandidat a **queue** with clear states; the sheet for non-Berkas roles becomes a **centered modal**. (The Berkas review queue for Ketua and Admin, `BerkasSheet` in `screens-rec2p.js`, stays a side drawer and is **not yours**.)
- **Kalender** (`KalenderTab` :757, `RecCal` :87, `EventDialog` :208): month and Agenda views, drag to move or resize, confirm for a started stage, editor and delete, internal events. The editor is already a centered dialog. → Restyle the grid with the Kalender area colour (`#5eead4`), remove the duplicate card title, keep every behaviour. Add the later-stage events if missing (see `_CONTEXT.md`; propose the Penerimaan event as a hook for `rec-data.js`).
- **Papan Panitia** (`PanitiaBoard` :778): drag Asisten into six columns, a coordinator star, a locked Ketua seat, undo. → Reskin with the panel's pink area colour, tighten the pool and the columns. Behaviour unchanged.
- **r1-home** (:354, banner `RecBanner` :318): the CaAs banner is hard-wired to `cur="berkas"` ("Berkasmu sedang diperiksa"). → Follow the real stage and the same "what to do now" card as the CaAs page. Copy the area colours.
- **r1-daftar** (`DaftarDialog` :510, `DaftarScreen` :556): the dialog is already a centered stepper. Registration now goes through the team's Google Form, and hakPenuh adds CaAs by hand. **Ask the user whether to retire `r1-daftar`**. Until they answer, only put the Fog or a neutral backdrop behind it.

## Rules
- One screen, one job. Guided steps. Laptop first. Primary action visible at 1280x600.
- Centered modals for heavy work; popovers only for small menus; side drawer only for the three named cases.
- Parity first: write the list of features of each old screen, then show where each one lives now.
- Every state reachable from the variant menus (the existing `r1Role`, `r1Tab`, `r1Sheet`, `r1Dlg`, `r1Seat`, `r1Viewer`, `r1Step`, `r1Berkas` keys keep working).
- Do not change behaviour of the screens owned by other prompts.

## Done
As in `_CONTEXT.md`, plus: before and after screenshots for each screen in dark and light at 1440x900, the parity list, and the open question about `r1-daftar`.
