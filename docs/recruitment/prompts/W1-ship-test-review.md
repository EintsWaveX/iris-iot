# W1 · Wave 1 ship, prod test application, review

- **Model / effort:** Opus 5.5, high
- **Needs:** 04 (done). Runs beside 05 and 08.
- **Owned paths:** none by default. It reviews and ships; fixes go into the owner's paths (tell that session first).
- **Skills:** `emil-design-eng`, `design:design-critique`, `code-review`, `security-review`, `superpowers:verification-before-completion`, `artifact-design` (for the merge)

Read `_RULES.md`, `WAVE1.md` and `handoffs/04.md`.

## 1. Before anything
- Claim the W1 row in STATUS.md with your session name.
- Check the rig answers (Postgres :54329, API :8790, Astro :4321, relay :8788). Restart only what is down, and say so to the other two sessions.

## 2. Review 05 and 08 as they hand off
- **05 (S2 mockup):** the Emil lens on every screen at the seven widths and the short screen; the envelope reveal's motion against its spec; Low Detail and reduced motion; copy rules (Title Case, no dashes, Indonesian first, en and zh). Report findings to 05 by SendMessage and let 05 fix them.
- **08:** read `EXAM-ENGINE.md` against PRD section 7. Look for rules it invents that PRD does not settle (those go to the user), formulas that disagree with PRD 7.4, and holes in the room state machine (reconnects, a Master leaving, a reopen after Finish). Review the pure modules and their tests (`formats`, `draw`, `scoring`, `room`): run them, and check the worked example matches the document. Review the S3 mockup like 05's.
- After both are signed off by the user, merge 08's S3 screens into the main mockup artifact (RCXL2f8vcpWhQHhorCeAPz) and republish it.

## 3. The one deploy (only when W1, 05 and 08 are all done)
1. Gather the set: `e2bfedf` plus whatever 05 and 08 committed on the branch. List it for the user.
2. In `apps/web`: `npm run check`, `npm run lint`, `npx vitest run --maxWorkers=2`, `npm run build`, `node scripts/check_assets.mjs`, `node scripts/check_csp_hashes.mjs`, and the secret scan. Then serve the build (`npx astro preview --port 4330`) and run `rig/built_check.mjs`.
3. Leak audit for anything new a candidate or visitor can reach: `rec_leak.mjs` and `leak_api.mjs`.
4. Deploy with the fast-forward command in `_RULES.md`. Watch CI and Smoke, then run `rig/rec_live.mjs` against irisiotlab.com. If Home or any page breaks, roll back first (see `WAVE1.md`), then fix.
5. **The deadline is Saturday 24 Oct 18:00 WIB.** If 05 or 08 is not done by then, ask the user whether to deploy what is ready, so the prod test application below still happens before registration opens.

## 4. Prod test application (right after the deploy, before Sun 25 Oct 00:00 WIB)
Goal: prove the real upload path on production (ticket, browser PUT to the relay, R2, `periksaBerkas`, the document recorded, Admin opens it), which only ran on the rig so far. Plan it so that no visitor sees recruitment early:
- Prefer a path that does not open the daftar gate. A throwaway Praktikan row and a candidate row in status `revision` let `ticket` and `document` work while registration is closed.
- Use a NIM that cannot belong to a student. Write no password anywhere.
- Clean up afterwards: the candidate and document rows, the throwaway Praktikan, and the R2 objects. No real candidate exists before Sunday, so the edition prefix can be cleared; say so before you do it.
- **This writes production data. Show the user the exact steps (SQL and calls) and wait for their go before running any of it.** Take a `pg_dump` first.
- Record the outcome in `handoffs/W1.md`.

## 5. Seating the Ketua
The user arranges it (someone with hakPenuh opens Panel Panitia, then Panitia). When they do, it is the first live check of the panel with a real Asisten session; ask them for a screenshot or check it with them.

## 6. Hand over to wave 2
When 05 and 08 are signed off and the deploy is verified, write `handoffs/W1.md`, set the W1 row to done, and give the user the kickoff lines for wave 2 (at most three Sonnet builders at a time: 06, 10 and 11 first, then 09 and 13). This session then reviews and ships them (07 and 14).

## Done when
The deploy is live and verified, the prod test application passed and was cleaned up, 05 and 08 are reviewed and merged into one artifact, and the user has the wave 2 kickoffs.
