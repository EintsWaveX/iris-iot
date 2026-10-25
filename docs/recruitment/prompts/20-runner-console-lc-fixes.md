# 20 · Fixes from the second cloud review (2026-10-26), runner, console, Live Coding

- **Model / effort:** Sonnet 5.5, high. Works on `phase9-global-and-asisten` (cut your own branch from it; open a draft PR against it). No deploy, no push to main. No rig or browser here: unit and API tests only (the repo's vitest setups), a failing test first for every fix.
- **Why:** the review (findings in the user's paste, summarised below) found no answer-key leak, and these defects, all from reading only. Re-read each cited code before changing it; if a finding does not hold, say so in `handoffs/20.md` and leave the code alone.

Read `_RULES.md`, `WAVE3.md`, `EXAM-ENGINE.md` (the parts on seats, strikes, rooms, Live Coding tickets), `handoffs/10.md`, `11.md`, `12.md`, `18.md`. Add a STATUS row 20 (`running`).

## Fix, in this order
1. **`sinkronKursi` moves a seat during a running part** (`api/_lib/recruitment-room.ts:1417-1428`; callers `recruitment-slots.ts:519, 692, 836`). This came in with prompt 18's seat sync. It must obey the same rule as `pindahKursi` (`ruang_berjalan`, around lines 1475-1487): never move a seat whose current room, or the target room, has a running part; leave it for `room-move`, and say so in the audit/response. Test: approve a slot request mid-evening, the seat stays.
2. **Kumpulkan loses in-flight answers** (`components/recruitment/exam/Runner.tsx:176-179`, `lib/recruitment/seat-answers.ts:138`). `flush()` skips questions whose save is in flight and returns early offline; `handIn` must wait for in-flight saves and re-send the newest value of every dirty question before Kumpulkan, and must not hand in while a dirty answer could not be sent (tell the candidate). Test the answer queue as a pure unit.
3. **A candidate can rewrite their own kejadian, including `ganda`** (`api/_lib/recruitment-seat.ts:719-733`, id format at line 633, `STRIKE_ID_RE` line 80). Server-made ids (`ganda-...`) must not be accepted from the client, and an existing kejadian may not be shortened or have its kinds reduced by a client upsert (extend only, e.g. `backAt` set once). Test via the handler.
4. **Practice rooms get expired gateway tokens** (`api/_lib/recruitment-lc-common.ts:164`). With no slot the expiry is 8 h after `room.createdAt`; base it on the room's own start/active window or issue-time instead. Test the expiry function.
5. **Grading list shows the oldest compile/flash** (`api/_lib/recruitment-lc-grade.ts:162-170`; `lc-agent.ts:320` stores runs oldest first). Show the latest, plus a count. Test.
6. **Extra time on an ended part reopens answers for every seat for 5 s** (`lib/recruitment/room.ts:378`). Low impact; fix only if one obviously right line, else list it.

## Not for you: write into `handoffs/20.md` with your view, do not change
- `ganda` is easy to avoid (a duplicated tab copies sessionStorage so the tab id repeats; a second reader device is never flagged; `masuk` never checks for another tab, EXAM-ENGINE:850 says it counts): a design choice for the user, with options (server-issued tab nonce at `masuk`, count on `GET test`).
- Gateway tokens and MQTT passwords travel in cleartext over the plain ws/http port 80 on shared phone hotspots, and every candidate holds the pengawas hotspot password in their own sketch (`lc-header.ts:59-61`, `ws/src/rec.ts:398`): a design limit of the agreed gateway; list the mitigations.
- Board evidence (`ble`, `lc-flash` ok) is self-reported; graders should know (`rec.ts:563`, `recruitment-lc-compile.ts:159`).
- The PC agent bundle was not reviewed (not in this repo).

## Rules
Commit after each fix with explicit paths; never stage `lib/db.ts`, `public/rig-test/`, `astro.rig*.config.mjs`, `rig*.mts`. `npm run check`, `npm run lint`, prettier on touched files, targeted vitest, then the full `npx vitest run --maxWorkers=2` (note: if `lib/db.ts` carries the rig-only `pg` import, 17 files fail to load; in a clean clone they don't). Write `handoffs/20.md` with real numbers and set the STATUS row `done`.
