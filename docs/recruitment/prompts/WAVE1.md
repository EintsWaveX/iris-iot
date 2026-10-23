# Wave 1 · shared notes (2026-10-23 18:00 WIB)

Read this after `_RULES.md` and before your own prompt. Three sessions run at once in wave 1:

| Session | Prompt | Model / effort |
|---|---|---|
| W1 | `W1-ship-test-review.md`: deploy, the prod test application, reviewing 05 and 08 | Opus 5.5, high |
| 05 | `05-s2-mockup.md`: S2 Stage 0 mockup | Opus 5.5, high |
| 08 | `08-exam-engine-design.md`: exam engine design, pure modules, S3 mockup | Opus 5.5, max |

Put your session name in your STATUS.md row when you claim it, so the other two can find you with ListAgents and SendMessage. Talk to each other directly; the user should not have to relay anything.

## Where things stand
- **S1 is live** on irisiotlab.com since 2026-10-23 16:47 WIB (main `c251ddc`). Prod schema is at **0048**; the next free migration is **0049**. The relay was redeployed by hand. See `handoffs/04.md`.
- The branch `phase9-global-and-asisten` holds one undeployed commit: `e2bfedf` (Kembali ke Praktikum at the top of every recruitment page). origin/main is an ancestor of the branch, so a fast-forward deploy works.
- Registration opens **Sunday 25 Oct 00:00 WIB**. Until then nobody outside the Panitia sees recruitment (the visitor banner waits for the daftar gate). The Ketua is not seated yet; the user arranges it.

## Rulings from today that bind wave 1
- **At most three sessions at once.** The machine sits near 0.5 GB of free memory and the rig is shared. Run one Playwright script at a time, keep page counts small, and close browsers.
- **One deploy, only after all three wave 1 sessions have finished their work** (user, 18:02). No session pushes to main on its own. W1 does the deploy. 05 and 08 commit on the branch only (08's pure modules), staging paths explicitly.
- Every Pengumuman defaults to 12:00 WIB. Asisten on cuti sit on the Panitia like anyone else. Recruitment pages use their own navbar.

## The mockup folder is split
05 and 08 both list `~/Downloads/design-review/mockups/recruitment/` and the same artifact. Running in parallel, they would overwrite each other, so:
- **05 owns** `mockups/recruitment/` and the existing artifact https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz. It adds S2 as `app/screens-rec2.js` and `app/rec2.css` beside 01's `screens-rec1.js` and `rec1.css`, and keeps `rec-data.js` and the menu.
- **08 copies** the folder to `mockups/recruitment-s3/` before its first change, builds S3 there (`app/screens-rec3.js`, `app/rec3.css`), and publishes **its own artifact** for sign-off. After both are signed off, W1 merges S3 into the main artifact.
- Whoever needs a change in the other's folder asks by SendMessage.

## Lessons from 04 (apply them)
- **The rig runs `astro dev`, which never splits chunks.** A production build can still break. Before anything goes to main: `npm run build` in `apps/web`, then `node scripts/check_assets.mjs` (CI runs it too). Do not export from an island module (`AppNav.tsx` and friends) for another island; put shared pieces in their own file.
- After any deploy, load Home on irisiotlab.com in a real browser (`rig/rec_live.mjs`). Smoke passed while Home was blank.
- Rollback: from `apps/web`, `vercel rollback <previous prod url> --yes`. After a rollback Vercel stops auto-promoting, so check the next deployment on its own URL, then `vercel promote <url> --yes`.
- The rig scripts' test event is named "Techmeet Rig" (not "Techmeet Tubes", a real seed event).
- If rig Postgres (:54329) hangs, kill the postgres processes, delete `pgdata/postmaster.pid` and start it again (see `_RULES.md`). Restart the rig API after any `api/` change. Its process can be stopped by Claude Code under memory pressure.
- New rig scripts from 04: `rec_leak.mjs` (169 checks), `rec_401.mjs`, `rec_live.mjs` (the live site), `built_check.mjs` (a served build).

## Still waiting on the user
Document template source, the Penerimaan date, whether Berkas gets a score, the Live Coding topics and rubric, and the Wawancara, Mengajar and Presentasi rubrics. Ask only when your work needs the answer, and log every answer in STATUS.md and the memory file.
