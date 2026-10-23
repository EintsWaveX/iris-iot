# 16 · S5 Tubes (topics, check-ins, submission, Presentasi)

Run this file as three sessions: 16a, then 16b, then 16c.

| Part | Model / effort | Needs |
|---|---|---|
| 16a mockup | Opus 5.5 high | 15 (15c done) |
| 16b build | Sonnet 5.5 high | 16a (signed off) |
| 16c review + ship | Opus 5.5 high | 16b (done) |

- **Deadline:** live by 12 Des 2026 (Techmeet). Work runs 13 to 17 Des, 18.30 to 22.00 in Lab IRIS. Presentasi is 18 Des.
- **Owned paths:**
  - migration for `rec_tubes_topic`, `rec_tubes_checkin`, `rec_submission`
  - `api/_lib/recruitment-tubes.ts`
  - `components/recruitment/tubes/` and `components/recruitment/panel/tubes/`
- **Skills:** as in prompt 15, plus `animate` (a topic spin if the user wants topics spun).

Read `_RULES.md`, PRD sections 6 (Tubes) and 8, and `handoffs/15.md`. **Ask the user at the start of 16a:**
- assigned or spun topics
- the submission contents and size limits
- the Presentasi rubric rows
- whether candidates may work in teams (assume solo)

## Build (16b)
1. **Topics and briefs:** an editor for Akademik, assignment or a spin at Techmeet, and the topic card on the candidate page.
2. **Check-ins:** each work evening, the candidate posts a note and an optional photo (R2, an image only, 5 MB) while the gate is open. Pengawas tick attendance per evening (QR from 06, or a manual tick). The Panitia feed shows each candidate's daily progress.
3. **Submission:** a code zip, a report PDF and a demo video (file or link) to R2. It closes at the Presentasi start. Late is refused but can be overridden by the Ketua with a note.
4. **Presentasi rubric** through the rubric engine from 15. Plotting presentasi slots reuses 15 if needed.
5. **The Cutting board** for Tubes.

## Review (16c)
Same as prompt 07, plus: upload limits on the relay, the video playback in the side sheet, and candidates unable to read others' submissions (IDOR).
