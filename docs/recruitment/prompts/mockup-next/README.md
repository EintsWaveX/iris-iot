# mockup-next: finishing the whole oprec mockup

State when this was written: **mockup Version 16** (28 Oct 2026), S1 to S4 drawn and approved, backup in `Downloads/design-review/mockups/recruitment-v16`. What is left is S5 Tubes, S6 Mengajar, Penerimaan, the Panitia screens still in the old look, the later states of the CaAs page, and a final sweep. After that the user decides, and only then does the real build start.

## Files
| File | What |
|---|---|
| `_CONTEXT.md` | Shared brief: rules, decisions, code map, how to test, file ownership. **Every agent reads it first.** |
| `M1-mengajar.md` | S6 Tes Mengajar (new files `rec6`) |
| `M2-penerimaan.md` | Penerimaan, Jadikan Asisten, celebration, closing (new files `rec8`) |
| `M3-tubes.md` | S5 Tubes (new files `rec5`). **Blocked on four answers.** |
| `M4-panel-old-look.md` | Ringkasan, Kandidat, Kalender, Papan Panitia, Home, Daftar (`screens-rec1.js`) |
| `M5-qr-berkas-r3.md` | QR wall, Berkas, R3 candidate test screens |
| `M6-caas-journey-states.md` | CaAs page later stages. **Runs after M1, M2, M3.** |
| `M7-final-sweep.md` | Parity, states, phone, contrast, copy, docs. **Runs last.** |
| `tools/` | Playwright test scripts (sweep, parity clicks, flow templates) |

## Order
- **Wave A, in parallel:** M1, M2, M4, M5, and M3 once its four answers are in. They own different files, so they do not collide.
- **Integration (main session, not an agent):** collect each agent's "Hooks for the main session" and apply them in one pass: `main.js` (`ORDER`, `GROUP`), `shell.js` (`GROUPS` q5, q6, q8), `index.html` and `local.html` (script and CSS tags, in the right order), `screens-rec7.js` (`AREA` colours, `P9.REC2_TABS` entries), `screens-rec7b.js` (Plot stage branch for Mengajar), `screens-rec7c.js` (`Cutting` tabs for Tubes and Mengajar), `rec-data.js` (Penerimaan event). Then run `sweep8.mjs` and `click9.mjs`, look at the screenshots, and publish.
- **Wave B:** M6 (needs the exports of M1, M2, M3).
- **Wave C:** M7.
- The main session publishes after each wave (stage the changed files into a scratchpad `rec-pub/`, then publish with the full-spelling path, `url`, `root` and `files`). Subagents never publish.

## Questions for the user, ask them BEFORE launching
(Use AskUserQuestion; pass the answers into each agent's prompt.)
1. **Tubes:** assigned or spun topics; submission contents and size limits; the Presentasi rubric rows; teams or solo. (Defaults are in M3.)
2. **Mengajar:** is the sheet the same model as the interview; how long one candidate teaches and how many examiners per slot; the rubric rows. (Defaults in M1; rows stay editable.)
3. **Penerimaan:** the date; separate envelope or part of the Pengumuman Mengajar one. (Defaults in M2.)
4. **`r1-daftar`:** retire it (registration goes through the Google Form) or keep it. (M4.)
5. Whether Presentasi needs slots (the R4 board) or one running order. (M3.)

## Kickoff prompt for the main session (copy after compacting)
> We are finishing the oprec mockup. Read `docs/recruitment/prompts/mockup-next/README.md` and `_CONTEXT.md`, and the memory notes `oprec-mockup-s1-s3-approved`, `ui-simplicity-rules` and `caas-spelling`. The mockup is at `C:\Users\EintsWaveX\Downloads\design-review\mockups\recruitment` (Version 16, backup `recruitment-v16`), artifact https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz. First ask me the open questions in the README with AskUserQuestion. Then launch Wave A as subagents (one per prompt, using the Agent tool with the prompt text "Read `docs/recruitment/prompts/mockup-next/_CONTEXT.md` and then `<Mx file>` and do it. Answers from the user: ...") so M1, M2, M4, M5 (and M3 once answered) run in parallel. When they report, apply the hooks, run the sweep and the parity clicks, look at the screenshots, publish, and tell me what is left. Then Wave B (M6) and Wave C (M7). Never touch `apps/web`, never commit or push unless I ask, write "CaAs".

## Standing reminders
- The mockup only. No real app code until the user says all of S1 to S6 are decided.
- The user's design taste so far: one screen one job, huge centered modals over drawers (side drawer only for the Cutting candidate, the Berkas queue, the Malam seat and Room Setup), calm motion, everything editable by Akademik where the DOCX was only a reference. They want to be asked when something is ambiguous, and told plainly what was and was not verified.
