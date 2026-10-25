# 18 · S3 review fixes (from the cloud review of 2026-10-26)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 09 to 13 done (they are). Works on `phase9-global-and-asisten` (pushed at 5a102ff or later). No deploy, no push unless the user says so.
- **Why:** a read-only cloud review of the S3 code found no answer-key leak and no SSRF hole, and 12 weaker defects. Two were confirmed by grep: `sinkronKursi` has no caller outside tests, and `lc-grade` has no freeze check. Fix the four below with a failing test first for each, then the rest only if time allows.

Read `_RULES.md`, `WAVE3.md`, `handoffs/10.md`, `11.md`, `12.md`, `13.md` and `EXAM-ENGINE.md` (the parts on rooms, seats, freeze). Put your session name in a STATUS row 18 (`running`).

## Fix, in this order

1. **Seat sync (`api/_lib/recruitment-room.ts:1394`, `sinkronKursi`).** Call it from every write that moves a candidate to another tes_tulis slot or clears the slot: Plotting's slot-set move, Auto Isi, a decided slot request, and anything else that writes a tes_tulis `rec_slot_assignment`. 11's handoff and the 08c ruling say 11 syncs `rec_exam_seat.room_id` on every tes_tulis assignment write. Test: check in a seat in room A, move the candidate to slot B, the seat follows (and is dropped, with its draw kept, if slot B has no room yet; read what `sinkronKursi` already does for null).
2. **Finalkan on a partial cohort (`recruitment-score.ts:226-247`, `score-table.ts:~123`).** Refuse (`halangan`) while any tes_tulis slot with candidates has no room, or a candidate in a tes_tulis slot has no seat. Test: evening 2 with candidates and no room blocks Finalkan.
3. **Freeze vs Live Coding grades (`recruitment-lc-grade.ts:230-263`).** `lc-grade` and `lc-grade-withdraw` refuse with `nilai_final` while frozen, and both write an audit line like the other score actions do. Also make the freeze check and the write atomic in `score.ts:352-380, 398-413` and `bank.ts:543` (one transaction that locks the freeze row or the edition row, whichever the code already uses for similar guards). Test: a void and a Finalkan racing cannot both succeed against a stale state.
4. **Rehearsal draws and delete (`recruitment-bank.ts:581-598`, `recruitment-seat.ts:456`).** `hapusSoal` must answer `sudah_tampil` when any `rec_answer` or draw row references the question, not only when `shownAt` is set. Test: a question drawn only in a rehearsal room returns `sudah_tampil`, not 500.

Then, only if the above is committed and green: the cut lock requiring a freeze and unfreeze refusing after a cut reveal (`recruitment-cutting.ts:340-379`, `score.ts:429-441`) is a design question, so do **not** change it, write it into `handoffs/18.md` for the user. Same for the small races (seat answer upsert after Kumpulkan, `aturRuang` hotspot merge without FOR UPDATE), the `rec_exam_room.slot_id` cascade, the `catat`/`pinjamKit` candidate check, upload `checkUrl`, and the `lc-ticket` role lookup: list them in the handoff with your view, fix only the ones that are one-line and obviously right.

## Rules
Commit after each fix with explicit paths; never stage `lib/db.ts`, `public/rig-test/`, `astro.rig*.config.mjs`, `rig*.mts`. `npm run check`, `npm run lint`, targeted vitest, then the full `npx vitest run --maxWorkers=2` at the end. Low RAM: no browser runs needed for this. Write `handoffs/18.md` (what you fixed with commits, what you left and why, real test numbers) and set the STATUS row `done`.
