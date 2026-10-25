# Resume 07c · S2 ship to production (Opus 5.5, high). START ONLY ON THE USER'S WORD "go"

- **Model / effort:** Opus 5.5, high
- **State (2026-10-26 04:00 WIB):** 07 and 07b are done. The ship set is on the local branch `s2-ship` (worktree `C:\Users\EintsWaveX\Documents\WebApps\iris-iot-s2ship`), a fast-forward of origin/main `2fb3f9f`, not pushed: `94279db` hotfix, `03bb129`, `9c3f4b0` S2, `6d51f86`, `235bf7f`, `e976830`, then 07b's `829a1d6` (QR 25 s), `5c3f339` (Home banner above the hero), `6d17635` (small fixes), `e3d43e9` (banner height). All checks passed on it (see `handoffs/07.md`). Nothing has touched prod.
- **Gate:** the user says "go" for this run. Before the first prod step, also ask once that **no practicum session is running** and that Sembunyikan Oprec is **on** (it was left on). If either is not true, stop and say so.
- **Not run by 07b (do these before the push, they are read-only):** `leak_api`, `idor_probe`, the `rec_leak` bundle scan, `rec_s2_flows`, `rec_s2_nav`. Check free RAM first (600 MB); one heavy run at a time.

Read `_RULES.md`, `handoffs/07.md` ("How to resume" and step 6), `handoffs/W1.md` (how W1 shipped: dump, push, CI, Smoke) and `STATUS.md`. Put your session name in the 07 row (`running`). Then:

1. `git fetch`; origin/main must still be `2fb3f9f` (else rebase `s2-ship`, rerun `check` and the S2 rig scripts, and tell the user). Run the skipped read-only audits above on the final tree; any failure stops the ship.
2. `pg_dump` prod (custom format, to a dated file outside the repo; say where). Redeploy the relay from the worktree (the hotfix needs it for picture upload; follow `handoffs/W1.md`).
3. `git push origin s2-ship:main` (fast-forward only, ancestor check first). Watch CI and Smoke to green. If either is red, do not "fix forward" blindly: report, and roll back by the dump / `git revert` only on the user's word.
4. Run `rig/rec_prod_pick_events.sql` on prod (the three Pilih Jadwal events: 11 Nov, 27 Nov, 20 Dec at 19:00 WIB open).
5. Check irisiotlab.com: Oprec stays hidden (the user presses Tampilkan Oprec, never you); sign in as a throwaway only if W1's cleanup procedure applies, and clean up what you create; open a real file in the Berkas viewer.
6. After the ship: merge `origin/main` into `phase9-global-and-asisten` from a worktree so the S2 squash lines up; drop `iris_e2e07`; update `handoffs/07.md`; set the STATUS row `done` (and 15 to `ready`); tell the user, including that 14's route is cherry-pick off main.

Never commit `apps/web/src/lib/db.ts`, `public/rig-test/`, `rig-07.mts` or `astro.p07.config.mjs`. Any step that surprises you (an unexpected diff on main, a migration pending, a red check): stop and report.
