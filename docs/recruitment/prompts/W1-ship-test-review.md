# W1 · Wave 1 ship, prod test application, review

- **Model / effort:** Opus 5.5, high
- **Needs:** 04 (done). Runs in wave 2 beside 08c and 06 (`WAVE2.md`); 05 and 08 are done.
- **Owned paths:** none by default. It reviews and ships; fixes go into the owner's paths (tell that session first).
- **Skills:** `emil-design-eng`, `design:design-critique`, `code-review`, `security-review`, `superpowers:verification-before-completion`, `artifact-design` (for the merge)

Read `_RULES.md`, `WAVE1.md`, then `WAVE2.md` (it wins where they differ), and `handoffs/04.md`, `05.md` and `08.md`.

## 1. Before anything
- Claim the W1 row in STATUS.md with your session name.
- Check the rig answers (Postgres :54329, API :8790, Astro :4321, relay :8788). Restart only what is down, and say so to the other two sessions.

## 2. Review 08 (and 08c when it hands off)
- **05** is signed off (v4) and its session has ended. Look again only if something is broken; fix it in `mockups/recruitment/` yourself and note it in `handoffs/W1.md`.
- **08:** read `EXAM-ENGINE.md` against PRD section 7. Look for rules it invents that PRD does not settle (those go to the user), formulas that disagree with PRD 7.4, and holes in the room state machine (reconnects, a Master leaving, a reopen after Finish). Review the pure modules and their tests in `eb3078f` (`frac`, `formats`, `draw`, `scoring`, `room`): run them, and check the worked example matches the document. Its session has ended; fixes go in as your own commits, listed in `handoffs/W1.md`, and a change of meaning goes to the user first.
- **08c:** review the S3 mockup like 05's (the Emil lens at the seven widths and the short screen, motion against its spec, Low Detail and reduced motion, the copy rules). Send findings to 08c by SendMessage. After the user signs it off, merge 08c's S3 screens into the main mockup artifact (RCXL2f8vcpWhQHhorCeAPz) and republish it.

## 3. The wave 1 deploy (now, on the user's go)
1. Commit the uncommitted docs `WAVE2.md` lists, with explicit paths (never `db.ts` or `public/rig-test/`).
2. Gather the set: those docs, `eb3078f`, and `354aed9` only if the user says so (it was held back so as not to deploy during a live practicum session). `e2bfedf` is already live. The branch no longer fast-forwards (`e839229` reached main as `d508f03`), so cherry-pick the set onto origin/main in a temporary worktree. List it for the user.
3. In the worktree's `apps/web`: `npm run check`, `npm run lint`, `npx vitest run --maxWorkers=2`, `npm run build`, `node scripts/check_assets.mjs`, `node scripts/check_csp_hashes.mjs`, and the secret scan. Then serve the build (`npx astro preview --port 4330`) and run `rig/built_check.mjs`.
4. Leak audit for anything new a candidate or visitor can reach: `rec_leak.mjs` and `leak_api.mjs`.
5. Push the worktree's HEAD to main, never while a practicum session is running. Watch CI and Smoke, then run `rig/rec_live.mjs` against irisiotlab.com. If Home or any page breaks, roll back first (see `WAVE1.md`), then fix. Bring the branch level with main afterwards (rebase onto origin/main; the cherry-picked twins drop out).
6. **The deadline is Saturday 24 Oct 18:00 WIB**, so the prod test application below still happens before registration opens.

## 4. Prod test application (right after the deploy, before Sun 25 Oct 00:00 WIB)
Goal: prove the real upload path on production (ticket, browser PUT to the relay, R2, `periksaBerkas`, the document recorded, Admin opens it), which only ran on the rig so far. Plan it so that no visitor sees recruitment early:
- Prefer a path that does not open the daftar gate. A throwaway Praktikan row and a candidate row in status `revision` let `ticket` and `document` work while registration is closed.
- Use a NIM that cannot belong to a student. Write no password anywhere.
- Clean up afterwards: the candidate and document rows, the throwaway Praktikan, and the R2 objects. No real candidate exists before Sunday, so the edition prefix can be cleared; say so before you do it.
- **This writes production data. Show the user the exact steps (SQL and calls) and wait for their go before running any of it.** Take a `pg_dump` first.
- Record the outcome in `handoffs/W1.md`.

## 5. Seating the Ketua
The user arranges it (someone with hakPenuh opens Panel Panitia, then Panitia). When they do, it is the first live check of the panel with a real Asisten session; ask them for a screenshot or check it with them.

## 6. Hand over to wave 3
When 08c is signed off and merged and the deploy is verified, write `handoffs/W1.md`, keep the W1 row running, and give the user the kickoff lines for wave 3: 09, 10 and 11 (Sonnet 5.5 high), at most three sessions at once counting 06 and this one, so ask the user which two start first while 06 still runs. This session then reviews and ships what follows (07 for 06, then 14).

## Done when
The deploy is live and verified, the prod test application passed and was cleaned up, 08 is reviewed, 08c is signed off and merged into the main artifact, and the user has the wave 3 kickoffs.
