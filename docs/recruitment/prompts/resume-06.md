# Resume 06 · S2 build, the verification still owed (fresh Sonnet 5.5 high session)

- **Model / effort:** Sonnet 5.5, high
- **State when written (2026-10-24 22:45 WIB, by iris-iot-59):** the earlier sessions (iris-aso-06, iris-iot-61) have ended. Commits `ef54863` (server, 0049), `50aed1c` (screens), `77df46a` (three fixes) and `517c7e1` (RecNav fold, `Roll`) are on the branch, not pushed. `handoffs/06.md` is written; its "Status of verification" lists what never ran. Free RAM is about 2.3 GB.
- **Not your hunks:** your files `recruitment-{attendance,cutting,slots}.ts`, `recruitment-s2-api.test.ts`, `BerkasReview.tsx`, `Hadir.tsx` and `RecNav.tsx` carry W1's uncommitted oprec account edits (0050, `iris_oprec`). W1 commits them. Don't commit, revert or reformat them. If W1 hasn't committed yet, do steps 1 and 2 and wait for W1's message before step 3.

Read `_RULES.md`, `WAVE3.md`, `handoffs/05.md`, `handoffs/06.md` and `06-s2-build.md`. Put your session name in your STATUS row. Then:

1. Run `npm run check` (it has not run since `517c7e1`), lint, Prettier, full vitest (`--maxWorkers=2`) and the secret scan. Fix anything in your paths.
2. Start the rig: Postgres :54329, API :8790, relay :8788, Astro :4321. Check whether W1 is using it first. Confirm 0049 and 0050 are on the rig DB.
3. With W1's accounts in, run `rig/rec_s2_api.mjs` (79) and `rig/rec_s2_flows.mjs` (42), which use `cookieFor` and the `iris_oprec` cookie. One Playwright script at a time, and check free RAM is at least 600 MB before each run.
4. What never ran: the RecNav fold at the 7 widths plus 1280×600, zh, Low Detail and reduced motion on the envelope reveal, the Suara setting in Tampilan, the Home banner's 7 day thank-you state, `pop2` and `pop4`, `rec_leak.mjs` and `leak_api.mjs` (a sealed envelope carries no result; nothing shows outside the Panitia while Sembunyikan Oprec is on), and `scripts/check_assets.mjs` on a real build.
5. Update `handoffs/06.md` (verification counts, new commits, open issues), set the row to `done (<commits>)` and tell the user that 07 can start. Do not deploy and do not merge origin/main into the branch. 07 ships by cherry-pick.
