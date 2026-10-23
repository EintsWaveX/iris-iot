# 05 · S2 Stage 0 mockup (Berkas review, Cutting, envelope reveal, QR attendance)

- **Model / effort:** Opus 5.5, high
- **Needs:** 01 (signed off). It can run while 03 builds.
- **Owned paths:** `~/Downloads/design-review/mockups/recruitment/` (add S2 screens to the same engine and artifact)
- **Skills:**
  - `emil-design-eng`
  - `animate`
  - `find-animation-opportunities`
  - `apple-design`
  - `frontend-design`
  - `impeccable:impeccable`
  - `design:ux-copy`
  - `artifact-design`

Read `_RULES.md`, `PRD.md` sections 5.4, 5.5, 6 (Kandidat, Cutting, attendance) and 9, and `handoffs/01.md`.

## Screens
1. **Berkas review** (Admin/Ketua) in the Kandidat side sheet: PDF viewer (the kit's `PdfViewer`), notes, an optional score field (keep it, but mark it "TBD by the user"), and approve or revision.
2. **Cutting board** for each stage:
   - a candidate list with the scores so far and attendance
   - Lolos/Gagal proposal chips with notes
   - who proposed what
   - a threshold slider for bulk proposals (top N, or score ≥ X), with a live count of how many pass
   - the Ketua's lock (HoldButton), showing the reveal time from the Pengumuman event
   - the locked state, and unlocking before the reveal
3. **Envelope reveal** for the candidate. This is the centrepiece, so make it rich:
   - sealed (soft glow, idle float)
   - opening (drag the flap up or tap-and-hold, with progress)
   - **Lolos / Hooray:** the seal cracks, the card rises, a confetti burst in the kosmik palette, a gradient bloom, a chime (respecting the site's sound preference), the copy and the next event
   - **Gagal / Ouhhh:** a slow deflate, a dim with soft rain, kind copy, no scores
   - replay
   - the final Penerimaan celebration, bigger: the full-screen version
   - Low Detail and reduced-motion versions of each
   - Decide **GSAP-only particles vs `canvas-confetti`**, and write the decision with its reason in the notes.
4. **Envelope inbox** with several envelopes in different states.
5. **QR attendance:**
   - the projector view `/recruitment/qr`: full screen, a rotating QR, a live count, the event name
   - the candidate's scan result (a quick success check, or "bukan jadwalmu")
   - Admin's manual override list

## Deliver
- Republish the artifact.
- Write the motion specs (durations, easing, the order of steps) per animation in the notes, so 06 can implement them exactly.
- Write `handoffs/05.md`. After the user signs off, set STATUS.md to `done (signed off)` and add the rulings to the memory file.
