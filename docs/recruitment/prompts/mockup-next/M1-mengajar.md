# M1 · S6 Tes Mengajar (mockup, R6)

Read `_CONTEXT.md` first. You build the **Tes Mengajar** stage of the mockup. Mostly reuse of R4 (Wawancara). Based on prompt `17-s6-mengajar-penerimaan.md` (Mengajar part only; Penerimaan is M2).

## You own (create or edit)
`app/screens-rec6.js`, `app/rec6.css`, `app/rec6-data.js` (all new). Read-only: everything else. Hooks for shared files go in your report.

## Ask the user first (the main session passes the answers into your prompt; if none, use the default and mark it "assumption")
1. Is the Mengajar sheet the same model as the interview (one shared sheet per pair or panel, private 1 to 5 level per parameter)? **Default: yes.**
2. How long does one candidate teach, and how many examiners sit per slot? **Default: 15 minutes of micro-teaching, a panel of 3, so a 2h30 evening holds about 8 candidates per examiner panel, in 2 rooms.** All editable.
3. The rubric rows. **Default: editable placeholders marked "Contoh"** (e.g. Penguasaan materi, Cara menjelaskan, Interaksi dengan Praktikan, Penggunaan waktu, Sikap). The Akademik edits them in a Template tab exactly like `R4: Template Pertanyaan` (`Params`).

## Facts (from the PRD and the Calendar)
- Candidates are those who passed Tubes (Pengumuman Tubes 20 Des 2026, 12:00).
- **Pilih Jadwal Mengajar:** 20 Des 19:00 to **21 Des 12:00**, first come first served, live seat counts, a confirm step, changes until H-1 23:59, one open request at a time, a requested seat is not held. Auto Isi places non-pickers.
- **Pleno Mengajar** 21 Des (internal). **Tes Mengajar 22 to 24 Des, 18:30 to 21:00, TULT.** A candidate sees only their own slot. **Susulan Mengajar Sat 26 Des 18:30 to 21:00.**
- **Cutting Mengajar 4 to 5 Jan 2027** (internal). **Pengumuman Mengajar 6 Jan 2027, 12:00.**
- Examiners see only their own slots; candidates never see who examines them. Examiners are any active Asisten.
- **Fix a conflict in the mockup:** `screens-rec7b.js` has a "Slot 3, 15.30" text and a `TIMES` entry "16.00 sampai 18.30"; the Calendar says 18:30 to 21:00. Use the Calendar. Report the exact lines to change as hooks.

## Build
1. **Plotting, Tahap = Mengajar.** The `Plot` tab in `screens-rec7b.js` already has the stage dropdown. Provide `N7.R6 = { rooms(), times, use(), SlotExtra, Requests, Board, cfgCaas }` exactly like `N7.R4` in `screens-rec4.js` (copy the pattern, do not edit R4): three evenings, two rooms, examiner rows with the conflict flags (examiner in two rooms, candidate double-booked, room over capacity, panel short), plus Susulan 26 Des. Reuse `R2P.Board`, `R2P.Requests` with a stage `cfg`.
2. **Candidate side.** `N7.R6.cfgCaas()` for `PickCard` / `PickDialog` / `ChangeDialog` (window text, deadlines, rules, example reason). It appears only when the journey is at Mengajar.
3. **Wawancara-style tab for Mengajar examiners:** Slotku (my slots, the candidate, who I sit with, QR attendance, preparation checklist), the **sheet** (reuse the R4 `Sheet` pattern: steps, never-dead Kirim, special cases such as late or absent with Susulan, edit and withdraw, offline draft), **Penilaian** (averages, spread, verdict, per examiner average), **Template** (rubric rows, minutes, who sees what). Make these screens `r6-plot`, `r6-slotku`, `r6-lembar`, `r6-nilai`, `r6-template` in a new group `q6` "R6 · Mengajar", with the same variant menus as R4 (every state reachable).
4. **Susulan flow** for absentees (offered a slot on 26 Des; plot them; candidate sees it).
5. **Cutting Mengajar**: export `N7.R6.wpool()` (candidate pool with average, verdict, gap, Tubes context) and the exact hook for the `Cutting` component in `screens-rec7c.js` (`DEF`, `ANN`, the tab list, the row and drawer branches) so the main session adds a **Mengajar** tab beside Wawancara. Dates: Cutting 4 to 5 Jan, announcement 6 Jan 2027 12:00. Follow the Wawancara branch.
6. A **tab for the panel** (`P9.REC2_TABS` entry, area colour in `AREA`) is a hook, like `wawancara`.

## Do not
Redesign R4. Hard-code the rubric. Add a drawer (use modals; side drawers only for the three named cases). Touch the real app.

## Done
As in `_CONTEXT.md`, plus: `r6-*` screens in your flow test (plot board, picker, sheet send, special case, Penilaian, template), and a list of hooks.
