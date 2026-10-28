# M3 · S5 Tubes (mockup, R5)

Read `_CONTEXT.md` first. You build the **Tubes** stage: topics and briefs, daily check-ins, submission, the Presentasi, and the Cutting for Tubes. Based on `16-s5-tubes.md`.

## You own (create or edit)
`app/screens-rec5.js`, `app/rec5.css`, `app/rec5-data.js` (all new). Everything else is read-only. Hooks go in your report.

## BLOCKED on the user's answers. The main session asks these first and passes them in
1. **Assigned or spun topics?** (a spin at Techmeet, 12 Des, or Akademik assigns)
2. **Submission contents and size limits.** Default: a code zip (25 MB), a report PDF, a demo video as mp4 (100 MB) or a link.
3. **The Presentasi rubric rows.** Default: editable placeholders marked "Contoh", edited in a Template tab like `R4: Template Pertanyaan`.
4. **Teams or solo?** Default: solo.
If the user is not reachable, build with the defaults and mark every assumption in the screen `notes` and the report.

## Facts (PRD and Calendar)
- Candidates are those who passed Wawancara (Pengumuman Wawancara 11 Des 12:00).
- **Techmeet Tubes** 12 Des 18:30 to 21:00 Lab IRIS: topics are published. **Pengerjaan** 13 to 17 Des **18:30 to 22:00 Lab IRIS**: the gate is open only on a work evening. **Presentasi** 18 Des 18:30 to 21:00 Lab IRIS: the rubric applies; the submission **closes at its start**. **Cutting Tubes** 19 Des (internal). **Pengumuman Tubes** 20 Des 12:00 (envelope; hands off to Mengajar).
- **Check-in** each work evening: a note plus an optional photo (image only, 5 MB) while the gate is open. **Pengawas tick attendance** per evening (QR from the existing QR wall, or a manual tick with a reason). The Panitia feed shows each candidate's daily progress.
- **Submission:** closes at the Presentasi start. **Late is refused, but the Ketua can override with a note.**
- Rights: a candidate sees **only their own** topic and submission (no IDOR); Akademik edits topics; Pengawas tick attendance; any Panitia sees the feed; **any Panitia proposes in Cutting, only the Ketua locks**.
- Presentasi plotting slots reuse the R4 board (`N7.R4` pattern) **if** the user wants presentasi slots; otherwise one evening with a running order.
- Data (for the later build): `rec_tubes_topic(title, brief)`, `rec_tubes_checkin(note, photo_key)`, `rec_submission`.

## Build (group `q5` "R5 · Tubes")
**Panitia, one `Tubes` tab with four sections** (use the same compact tab-line style as Plotting; area colour and icon are a hook for `AREA`):
1. **Topik dan brief:** editor for Akademik (title, brief, who gets it), assignment or the spin at Techmeet (animate the spin if topics are spun), publish at Techmeet.
2. **Kehadiran dan check-in:** per work evening, attendance (QR or manual tick) and the daily progress feed with photos (a centered modal to view a photo).
3. **Pengumpulan:** the submission list per candidate with status (none, partial, complete, late, overridden), a **centered modal** for viewing a submission with video playback, and the **Ketua override with a required note**.
4. **Presentasi:** the rubric sheet for examiners through the **R4 sheet pattern** (`Sheet` in `screens-rec4b.js`: three steps, shared notes, private levels, never-dead send), Slotku-like "my candidates", Penilaian, and a Template tab for rubric rows.

**Candidate side**, exported for **M6** to embed in the CaAs page (`N7.R5.CaasTubes({ state })`): the topic card (before and after Techmeet), the **check-in form** (note, optional photo, gate open or closed, saved state), the **submission** card (three parts with progress, size and type limits, closes in a countdown, late-refused state, overridden state, submitted state), and the Presentasi slot card. Every state reachable from variants.

**Cutting Tubes**: export `N7.R5.wpool()` and the exact hook for the `Cutting` component in `screens-rec7c.js` (add a **Tubes** tab beside Wawancara; Cutting 19 Des, announcement 20 Des 12:00; show Presentasi average, submission completeness, check-in attendance, with earlier stage totals for context only). Follow the Wawancara branch of Cutting.

## Do not
Add side drawers (modals only). Hard-code rubric rows. Let a candidate see another's work. Touch the real app.

## Done
As in `_CONTEXT.md`, plus: screens `r5-tubes` (panel, sections as variants), `r5-caas` (candidate states), `r5-nilai`, `r5-template` in your flow test; the exports and hooks listed; the answers you were given.
