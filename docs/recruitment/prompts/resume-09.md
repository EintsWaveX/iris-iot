# Resume 09 · the Bank Soal tab: check, commit, finish (fresh Sonnet 5.5 high session)

- **Model / effort:** Sonnet 5.5, high
- **State when written (2026-10-25 18:30 WIB, after the second session resume-09 hit the usage limit about 15:57):**
  - **Committed:** `6344351` bank-io, `d1ef178` snapshotter, `20176f8` bank API, `855a709` fixtures, `d9945d3` the stale-editor guard (`version` on question-save, `versi_lama`; rig `rec_bank_api.mjs` 82 checks on `iris_e2e09`), `36bd70a` **the full seed bank, 45 questions** (`scripts/rec-bank/01` to `04`, `scripts/rec-bank-verify.py` 163 checks, none failing; `seed-bank.ts` regenerated, `rec-bank-seed.ts --check` passes). Steps 1 and 2 of the old resume are done.
  - **Written, NOT committed, never fully checked (yours):** the Bank Soal tab `apps/web/src/components/recruitment/panel/tes/bank/*` (BankTab, BankList, BankEditor, BankImport, BankConfig, BankRefs, BankKeys, BankAttach, bankStrings, bankSample), `src/lib/recruitment/bank-draft.ts` + `src/lib/__tests__/recruitment-bank-draft.test.ts`, `src/lib/recruitment/bank-upload.ts`, `src/components/recruitment/recruitment-s3-bank.css`, and these hunks in shared files: `RecNav.tsx` (bank link), `PanelPage.tsx` (bank case), `lib/recruitment/panel-tab.ts` (`"bank"`), `recruitmentStrings.ts` (`bank` label), `lib/recruitment/types.ts` (the bank `RecError` codes, which fixed the 3 errors in `rig/tsc09.out`), `components/ui/Controls.tsx` (`Stepper disabled`).
  - **Rig evidence so far** (`~/Downloads/design-review/rig/`): `rec_bank_flows.mjs` ran once and left `rec_bank_crash.png` (15:37) and `dbg_bank_over.mjs` (an overflow debug); its pass count was never seen. `rec_bank_shots/` has 40 screenshots (config, fitb, fix, list, refs at the 8 sizes); nobody has looked at them. `rec_bank_pop.mjs`, `pop2_09.mjs`, `pop4_09.mjs` are written, not run. Rig is down.
- **Not yours (12's, uncommitted in the same tree; never stage them):** `package.json`, `package-lock.json`, `siaran-topik.ts`, `seat-client.ts`, `lc-templates.ts`, `exam/Screens.tsx`, `exam/TestPage.tsx`, `exam/lockdown/useLockdown.ts`, `panel/tes/ruang/TesTab.tsx`, `ruangStrings.ts`, `components/recruitment/livecode/`, `lc-ui.ts`, `recruitment-s3-lc.css`. Never stage `lib/db.ts`, `public/rig-test/`, `astro.rig*.config.mjs`, `rig*.mts`.
- **Deadline:** 10 Nov.

Read `_RULES.md`, `WAVE3.md` (newest update first), `handoffs/09.md` and `handoffs/08c.md` ("09 · the bank"). Put your session name in the STATUS row. Then:

1. `npx tsc --noEmit -p .` (or `npm run check`) and eslint on your files only; fix. Then `npx vitest run src/lib/__tests__/recruitment-bank*` .
2. **Commit the tab now**, with explicit paths (the list above, and `git add -p` for your hunks of the shared files), so a third cut-off loses nothing.
3. Rig (Postgres :54329, `iris_e2e09`, API :8793, `astro.rig09.config.mjs`): look at `rec_bank_crash.png` first and find what crashed; rerun `rec_bank_flows.mjs` to green; look at the 40 shots in `rec_bank_shots/` (overflow, cut columns, zh); run `rec_bank_pop.mjs`, `pop2_09.mjs`, `pop4_09.mjs`. One Playwright run at a time, 600 MB free first.
4. The snapshot run on the five reference pages (click every link inside each snapshot; neither the frame nor the page may leave its URL).
5. `npm run check`, `npm run lint`, full `npx vitest run --maxWorkers=2` once. Update `handoffs/09.md`, set the STATUS row `done`.

Commit after each step that changes code. Do not deploy.
