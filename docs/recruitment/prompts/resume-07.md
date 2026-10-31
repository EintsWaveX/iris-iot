# Resume 07 · S2 review and ship, the motion checks, the report, the ship (fresh Opus 5.5 high session)

- **Model / effort:** Opus 5.5, high
- **State when written (2026-10-25 ~14:40 WIB):** paused on the user's word. The ship commit `4712a91` sits on the local branch `s2-ship` in the worktree `%LOCALAPPDATA%\Temp\s2-ship` (off origin/main `2fb3f9f`, not pushed). Static checks and the rig all pass (check, lint, 1586 tests, build 118 pages, assets, CSP, `rec_s2_api` 79, `rec_07_probe` 50, `rec_s2_flows` 42, reveal 19, banner 15, nav 29, pop2, pop4; `rec_leak` 269/1, the one fail is Astro's dev toolbar chunk, dev only). **No prod step started.** Read `handoffs/07.md` first: it holds the ship set, the findings and the resume commands.
- **Update 2026-10-25 18:30 WIB (second session iris-iot-94 hit the usage limit about 16:05):** what it did is not committed. In the `s2-ship` worktree: `QrWall.tsx` (the `data-still` dot fix for Low Detail), `RevealStage.tsx` (edits while chasing a deterministic 370 to 884 ms long frame during the flap swing, traced to a React scheduler pass; `useRecSlots` and `CandidatePage` refetches were ruled out as the cause) and `CandidatePage.tsx`. Read `git -C <worktree> diff` before anything: keep what is a fix, revert what was only instrumentation, then amend or add to the ship set. Rig scripts in `~/Downloads/design-review/rig/p07/`: `rec_07_motion.mjs` (supports `ONLY=` sections and a V8 CPU profile) and `rec_07_shots.mjs`; the screenshot sweep wrote 53 PNGs to `p07/out/` at 16:04 but nobody has looked at them yet. Rig is down (Postgres, API, Astro all stopped).
- **Oprec Google Form hotfix (2026-10-25 evening, session iris-iot-d8):** registration runs on the team's Google Form, and hakPenuh adds each CaA in the panel. The commit is `94279db` on branch `oprec-gform` (worktree `%LOCALAPPDATA%\Temp\oprec-gform`, off `2fb3f9f`), and it ships to main **before** S2, on the user's go, along with a relay redeploy. Rebase `s2-ship` onto it. Where it meets S2:
  - `types.ts`:
    - `DOC_REQUIRED` = biodata, cv, vision, khs, ksm, ktm. The new `DOC_OPTIONAL` = portofolio. `DOC_KINDS` appends ktm, khs, ksm, portofolio.
    - **`Biodata.address` and `Biodata.motivation` are now optional.** Give S2 a fallback wherever it reads them as plain strings.
    - New: `Biodata.prodi`, `mkIot`, `praktikumIot`; `RecError` `daftar_lewat_formulir`; `EditionResponse.canAdd`.
  - `[aksi].ts`: three new dispatch lines, `canAdd` in `handleEdisi`, and the refusal at the top of `handleDaftar`.
  - `panel/Kandidat.tsx`: the docs count is `DOC_REQUIRED.length`, plus Tambah CaA and `BerkasPanitia` for hakPenuh.
  - The Berkas desk should show seven tabs: the six required kinds, plus Portofolio when one is uploaded.
  - `candidateStrings.ts`: `docs.kind` has the new kinds.
  - `bannerStrings.ts`: the Praktikan wording is gone.
- **Deadline:** live by Mon 9 Nov (Pilih Jadwal opens 11 Nov 19:00 WIB). Highest priority of the three paused sessions.

Read `_RULES.md`, `WAVE3.md` (the 2026-10-25 evening update first), `handoffs/07.md` and `handoffs/W1.md`. Put your session name in the STATUS row (`running`). Then:

1. Check the worktree is intact (`git -C <worktree> log -1`, `git status`), and that `origin/main` has not moved past `2fb3f9f` (`git fetch`). If it moved, rebase `s2-ship` and rerun check and the S2 rig scripts.
2. Bring the rig back as in handoffs/07 "How to resume": Postgres :54329 (shared with 09 and 12), your own DB `iris_e2e07`, API :8791, Astro :4322. Each browser run goes behind `rig/p07/gate.sh`; one heavy run at a time.
3. The motion checks still owed (start with the long frame: is it real on a built page, not only on Astro dev? If only dev, note it and move on): frame-by-frame of the reveal against 05's specs (pause GSAP's global timeline and step it), interrupt mid-open (Escape near 400 ms: no stage left, body scroll back, reopen works), jitter at 360 with CPU throttling, Low Detail idle float and QR dots static.
4. Look at the screenshots already in `p07/out/`; take only what is missing at the 7 widths and 1280x600, id/en/zh, Low Detail, reduced motion, light; look at them (emil lens, design critique, accessibility).
5. Report to the user with the ship set and the three findings (QR grace 40 s vs 20 s, Low Detail lighter reveal per the ruling, Home banner under the hero). **Stop and wait for their go.**
6. On their go only: `pg_dump` prod, `git fetch` and an ancestor check, `git push origin s2-ship:main` with no practicum session running, watch CI and Smoke, run `rig/rec_prod_pick_events.sql` on prod, check irisiotlab.com (Oprec stays hidden; the user presses Tampilkan Oprec, not you), and open a real file in the Berkas viewer.
7. After the ship: merge `origin/main` into `phase9-global-and-asisten` from a worktree so the S2 squash and its twins line up. Drop `iris_e2e07`. Update `handoffs/07.md`, set the STATUS row `done`, tell the user that 14's route (cherry-pick off main) is the same.

Never commit `apps/web/src/lib/db.ts` (rig patch), `public/rig-test/`, `rig-07.mts` or `astro.p07.config.mjs`.
