# Resume 11 · Master console, the browser run and the close (fresh Sonnet 5.5 high session)

- **Model / effort:** Sonnet 5.5, high
- **State when written (2026-10-25 00:40 WIB, by iris-iot-cb):** the schema (0051), the relay room, the room API, `hotspot.ts`, `kejadian.ts` and the console are committed (`0ed3793`, `ba0f670`, `4629b28`, `fa6279d`, `9b6c5fe`), none pushed. Typecheck, ESLint and the zh check were clean at `9b6c5fe`. **The console has not been seen in a browser.** A few small fixes sit uncommitted in `Konsol.tsx`, `RuangSetup.tsx`, `TesTab.tsx` and `recruitment-s3-room.css`. `handoffs/11.md` is written.
- **Not prompt 11's:** the TP Perpanjangan change (`api/tp/[aksi].ts`, `grading/{Grader,PengaturanTab,PerpanjangDialog}.tsx`, `tp/tpStrings.ts`, `siaran-topik.ts`'s `tp:perpanjang-semua` line) is unrun and uncommitted. Leave it out of every oprec commit; ask the user whether they want it checked and committed separately. `lib/db.ts` (rig-only patch) and `public/rig-test/` are never committed.

Read `_RULES.md`, `WAVE3.md`, `handoffs/11.md`, `EXAM-ENGINE.md` sections 5, 6, 9.6a and 10, and `handoffs/08c.md`. Put your session name in the STATUS row. Then:

1. `git diff` on the four console files, check the fixes are sound, then run typecheck (`npm run check`), ESLint, Prettier and the 11 test files with `--maxWorkers=2`. Commit the fixes with explicit paths.
2. Start the rig (Postgres :54329, API :8790, relay :8788, Astro :4321; check first that no other session is using it). Confirm 0051 is applied. Check the relay answers on :8788 (`apps/relay/test/uji-ujian.mjs`).
3. Run `rec_room_api.mjs` (65), then `rec_room_flows.mjs`. One Playwright script at a time, and free RAM at least 600 MB before each run. Fix what the browser shows: Master claim and handover, the controls and their tooltips, Buka Ulang, Selesai Lebih Awal, the seat drawer, Pengaturan hotspots, Pinjaman Kit, the activity feed at 1280, 360 and 390 widths, zh, Low Detail and reduced motion.
4. Rerun `rec_s2_api.mjs` (79): your `room_id` sync touches 06's `recruitment-slots.ts`.
5. If 10 has landed its runner, do the prompt's Phase 1 verify (a Master and several seats, with pause, skip, reopen, +5 min to one seat and a handover mid-part). If not, use fake seats and say so.
6. Record the short video for the user. Update `handoffs/11.md` (counts, commits, open issues), set the STATUS row to `done (<commits>)` and tell the user that 12 can start (and that 10, 09 and 13 read the hooks listed under Contracts).
Do not deploy. 14 ships 0051 to 0053 by cherry-pick.
