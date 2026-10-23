# 13 · Scoring, results and the Cutting feed

- **Model / effort:** Sonnet 5.5, medium
- **Needs:** 10 (done), 06 (done)
- **Owned paths:**
  - `api/_lib/recruitment-score.ts`
  - the score actions
  - `components/recruitment/panel/tes/penilaian/`
  - the Cutting board's score columns (coordinate with 06's owner if that session is open)
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `dataviz` (distribution charts)
  - `emil-design-eng`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `EXAM-ENGINE.md` section 4, PRD 7.4 and `handoffs/08.md` and `handoffs/10.md`.

## Build
1. **Provisional scores**, computed on read with `scoring.ts`: per seat and per part (Logika, FITB, Kodingan, Mikro, Debugging total), Phase 1 total, Live Coding average, test total out of 4000.
2. **Penilaian tab** (Panitia):
   - a table with sort and filter
   - per-question statistics for Akademik only: N, M, p, w, and the most-picked wrong option, to spot broken questions
   - an Akademik action to **void a question** (removes it from every seat's denominator), with an audit note
3. **Finalkan** (Akademik Koor or Ketua, after the Susulan room finishes): freeze the scores into a snapshot. Later changes need an unfreeze with a note.
4. **The Cutting board** for Tes Tulis reads these totals.
5. **Distribution charts:** a histogram per part and the total, following the `dataviz` skill.

## Tests
- The 08 worked example end to end through the API.
- Voiding a question.
- Finalkan freezes the scores.
- Candidates can never read any score action (leak).

## Verify
- Rig: 30 simulated seats with seeded answers, checked against hand-computed values for 3 of them (show the working in the handoff).
