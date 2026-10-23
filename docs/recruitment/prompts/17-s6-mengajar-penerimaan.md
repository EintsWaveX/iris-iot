# 17 · S6 Tes Mengajar, Penerimaan, Jadikan Asisten

Run this file as three sessions: 17a, then 17b, then 17c.

| Part | Model / effort | Needs |
|---|---|---|
| 17a mockup | Opus 5.5 high | 15 (15c done), 16 (16c done) |
| 17b build | Sonnet 5.5 high | 17a (signed off) |
| 17c review + ship | Opus 5.5 high | 17b (done) |

- **Deadline:** Mengajar live by 21 Des 2026 (the Pleno; tests 22 to 24 Des, Susulan 26 Des). Penerimaan by the Pengumuman of 6 Jan 2027.
- **Owned paths:**
  - `api/_lib/recruitment-accept.ts`
  - `components/recruitment/panel/penerimaan/`
  - the final celebration in `components/recruitment/reveal/`
  - Mengajar config (reusing 15's plotting and rubric)
- **Skills:**
  - as in prompt 15
  - `animate` + `find-animation-opportunities` (the final celebration is the biggest moment of the site)

Read `_RULES.md`, PRD sections 5.4 and 6 (Penerimaan), and `handoffs/15.md` and `handoffs/16.md`. Also read `api/_lib/tim.ts` (person creation, the 3-letter code rules, the DEV badge rule) and the memory `iris-asisten-also-praktikan` before designing promotion. **Ask the user** for the Mengajar rubric rows and the Penerimaan date at the start of 17a.

## Build (17b)
1. **Mengajar:** the plotting and rubric engines configured for the Mengajar stage, plus Susulan.
2. **Penerimaan:** the Ketua confirms the final list (a summary with all stage scores, behind HoldButton).
3. **Jadikan Asisten:**
   - create the Asisten records through `tim.ts` logic, with a proposed 3-letter code (unique, editable before confirm) and no division
   - status aktif; DEV only by the existing rule (none, since there is no division)
   - Praktikan history kept
   - idempotent (running it twice creates nobody twice)
   - an audit log entry
4. **Final celebration:** the full-screen version for the Panitia when they confirm, and the final envelope for each accepted candidate at the Penerimaan reveal.
5. **Close the edition:** read-only after Penerimaan. The retention clock starts (6 months), feeding the existing retention job.

## Review (17c)
Same as prompt 07, plus:
- promotion is tested on the rig: new Asisten can sign in by code, and they show in Tim without a division
- nothing leaks the candidates' documents to the new Asisten unless they are Panitia
