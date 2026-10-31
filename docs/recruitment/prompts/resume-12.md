# Resume 12 · Live Coding: check and commit the page, then the rest (fresh Sonnet 5.5 high session)

- **Model / effort:** Sonnet 5.5, high
- **State when written (2026-10-25 18:30 WIB, after the second session iris-iot-12b hit the usage limit about 15:57):**
  - **Committed:** site side and agent as before (web `7d52e6e`, `00b9fcd`, `9e6b6bb`, `23755b0`; agent repo `5d56ec3`, `7569728`, `ee0edf2`, `d8fa280`); `cb070f4` **the API rig run** (`rec_lc_api.mjs`, 147 checks on `iris_e2e12`, two bugs fixed: the claim CTE and `sameRubricRows`); `243e8d0` **the gateway Worker** (`RecRoom`, all routes, migration v3, `test-rec.mjs` 71 checks, Module 2 gateway test still passes). Old steps 1 and 3 are done.
  - **Templates (old step 2), done but the fix is NOT committed:** `rig/lc_compile_real.out` compiled all 8 (4 templates × esp32 and esp32s3) with the real arduino-cli; `ws` failed on both chips (`s.ino:31: binding reference of type 'String&' to 'const String'`). The fix is in `src/lib/recruitment/lc-templates.ts` (uncommitted), and `lc_compile_real2.out` shows `http:esp32`, `ws:esp32`, `ws:esp32s3` ok after it. Rerun `http:esp32s3` with the fixed templates if `lc-templates.ts` changed the http one too, then commit with the outputs quoted.
  - **The page (old step 4), written, NOT committed, never typechecked or linted:** `apps/web/src/components/recruitment/livecode/` (LiveCodePage, Workbench, BoardPane, SidePanels, Reel, CodeEditor, Draw, GradeTab, LcPoolTab, flash, icons, lcStrings, useBle, useExamSerial, useLc, useLcGateway), `src/lib/recruitment/lc-ui.ts` + `src/lib/__tests__/recruitment-lc-ui.test.ts` (18 pass), `src/components/recruitment/recruitment-s3-lc.css`, and these hunks in shared files: `package.json` + `package-lock.json` (CodeMirror 6 packages, `@lezer/highlight`, `esptool-js` 0.7.0, exact pins), `siaran-topik.ts` (`reclive`), `seat-client.ts` (`onOther`), `exam/TestPage.tsx`, `exam/Screens.tsx` (`LiveCodeStandIn` removed), `exam/lockdown/useLockdown.ts`, `panel/tes/ruang/TesTab.tsx` + `ruangStrings.ts` (the Nilai tab).
- **Not yours (09's, uncommitted in the same tree; never stage them):** `panel/tes/bank/`, `bank-draft.ts`, `bank-upload.ts`, `recruitment-s3-bank.css`, and 09's hunks in `RecNav.tsx`, `PanelPage.tsx`, `panel-tab.ts`, `recruitmentStrings.ts`, `types.ts`, `ui/Controls.tsx`. Never stage `lib/db.ts`, `public/rig-test/`, `astro.rig*.config.mjs`, `rig*.mts`.
- **Deadline:** 13 Nov.

Read `_RULES.md`, `WAVE3.md` (newest update first), `handoffs/12.md`, `handoffs/10.md` (`HotspotCard`) and `handoffs/08c.md`. Put your session name in the STATUS row. Then:

1. `npm run check` and eslint on your files; fix. `npx vitest run src/lib/__tests__/recruitment-lc*`.
2. **Commit in two pieces now**, explicit paths and `git add -p` for shared files: the template fix (with the compile results), then the page. A third cut-off must not lose them.
3. The bank's Live Coding tab (topic cards, templates, rubric rows) if `LcPoolTab.tsx` is not it already; check against the mockup r3-lc.
4. Rig scripts `rec_lc_*.mjs` against the page (`astro.rig12.config.mjs`, API :8792, `iris_e2e12`), a dry-run flash stub if no ESP32 is plugged in (say which), pop2/pop4, the seven widths, Low Detail and reduced motion. One Playwright run at a time, 600 MB free first.
5. `npm run check`, `npm run lint`, full `npx vitest run --maxWorkers=2`, prettier, secret scan.
6. Finish `handoffs/12.md` (the hardware list), set the STATUS row `done`, tell 14.

Commit after each step that changes code. Do not deploy; 14 ships 0051 to 0053, the relay, the Worker secrets (`REC_GATEWAY_SECRET`, `REC_PANTAU_PASS`) and the agent bundle.
