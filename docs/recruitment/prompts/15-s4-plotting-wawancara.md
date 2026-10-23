# 15 · S4 plotting engine, rubric engine, Wawancara

Run this file as **three sessions in a row**: 15a, then 15b, then 15c.

| Part | Model / effort | Needs |
|---|---|---|
| 15a mockup | Opus 5.5 high | 07 (done) |
| 15b build | Sonnet 5.5 high | 15a (signed off) |
| 15c review + ship | Opus 5.5 high | 15b (done) |

- **Deadline:** live by 30 Nov 2026 (Pleno Wawancara). Tests run 1 to 3 Des.
- **Owned paths:**
  - migration for `rec_slot`, `rec_slot_examiner`, `rec_slot_assignment`, `rec_rubric`, `rec_rubric_score` (if 11 or 12 already made some, extend them, don't duplicate)
  - `api/_lib/recruitment-plot.ts`, `recruitment-rubric.ts`
  - `components/recruitment/panel/plotting/`, `components/recruitment/rubric/`
- **Skills:**
  - 15a: `emil-design-eng`, `frontend-design`, `apple-design`, `artifact-design`
  - 15b: `superpowers:executing-plans`, `superpowers:test-driven-development`, `typescript-pro`
  - 15c: as in prompt 07

Read `_RULES.md`, PRD section 6 (Plotting, rubric sheets) and section 8, and `handoffs/07.md`, `11.md` and `12.md`. **Ask the user for the Wawancara rubric rows** at the start of 15a. Use SAMPLE rows until they answer.

## 15a: mockup (same engine and artifact)
- **Plotting board:** evenings × rooms × slots, examiners per slot, the Auto Isi result, drag to fix, conflict flags (an examiner double-booked, a candidate double-booked, a room over capacity).
- **The candidate's slot card** and the swap request dialog (until H-1).
- **Admin's swap queue.**
- **The phone rubric sheet** for an examiner: candidate header, rows with steppers or segmented scores, notes, submit, the next candidate in my slot.
- **The Penilaian view** with averages per examiner and the spread.

## 15b: build
1. **Auto Isi:** distribute candidates evenly over slots, honouring capacity. Keep existing manual placements, and keep it deterministic for the same input. Unit tested.
2. **Plotting UI:** drag and drop with `@dnd-kit`, live on `rec-plotting`.
3. **Swaps:** a candidate requests once until H-1; Admin approves or declines; the candidate gets a notice.
4. **Rubric engine:** generic per stage, reused by Live Coding grading (12), Wawancara, Presentasi Tubes and Mengajar. If 12 built a local one, fold it in here.
5. **Wawancara:** slots on the candidate's calendar (their own slot only), QR attendance per slot (06), and Susulan offered to absentees.
6. **The Cutting board** for Wawancara reads the rubric averages plus the Tes Tulis total for context.

## 15c: review + ship
Same as prompt 07, plus:
- a rubric sheet test on a real phone width
- examiners only see their own slot's candidates
- candidates only see their own slot
