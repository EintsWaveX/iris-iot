# Resume 07b · S2 ship: apply the user's rulings, recheck, then wait for the go (Opus 5.5, high)

- **Model / effort:** Opus 5.5, high
- **State (2026-10-26 01:35 WIB):** 07's steps 1 to 5 are done and the report went to the user. `s2-ship` (worktree `C:\Users\EintsWaveX\Documents\WebApps\iris-iot-s2ship`) holds the ship set on top of origin/main `2fb3f9f`: `94279db` hotfix, `03bb129`, `9c3f4b0` S2, `6d51f86`, `235bf7f`, `e976830`. Nothing is pushed, nothing touched prod. Read `handoffs/07.md` first.
- **The user's rulings on the three findings (2026-10-26):**
  1. **QR life: narrow it to 20 s** (the prompt-07 spec), not 40 s. If the 40 s is a deliberate clock-skew grace, keep only a small grace (a few seconds) and say what you chose.
  2. **Low Detail: keep the lighter reveal** (05's sign-off). No change.
  3. **Home banner: raise it above the hero.** Keep the Sembunyikan Oprec and the daftar-gate rules: before the gate it shows nothing.
- **Left from the report (small, fix if one-liners):** "Telekomunikasi" breaks mid-word in Tambah CaAs at 390 px; the top label on the Gagal screen is faint in light theme; the QR wall's code box touches the bottom edge at 1280x600.

Steps:
1. Apply rulings 1 and 3 and the small fixes as new commits on `s2-ship` (tests first where logic is involved: the QR window is logic).
2. Recheck what they touch: `check`, `lint`, the recruitment tests, build, the reveal and banner rig scripts, screenshots of the banner at the 7 widths and en/id/zh, light and dark, Low Detail and reduced motion. Install nothing in the main checkout; the main `apps/web/node_modules` was repaired on 2026-10-26, but use the worktree's own.
3. Update `handoffs/07.md` and the STATUS row (`paused`, waiting for the go). Then **stop and report**. Do not start step 6 (prod) without the user's explicit go.

Never commit `apps/web/src/lib/db.ts`, `public/rig-test/`, `rig-07.mts` or `astro.p07.config.mjs`.
