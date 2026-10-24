# Wave 3 · shared notes (rewritten 2026-10-24 22:45 WIB by iris-iot-59)

Read this after `_RULES.md` and `WAVE2.md`; where they differ, this file wins. It lists the sessions to open, in order, with the model, effort and kickoff line for each. At most three sessions run at once, each a separate prompt session, with no subagents. Only one Playwright script runs at a time across all sessions, and each session checks that free RAM is at least 600 MB before a browser run (Claude Code killed runs at 200 to 500 MB free).

## Where things stand
- **Live (main `6ebaeeb`):** S1, wave 1 (the exam engine's pure modules, `checkValue`) and Sembunyikan Oprec. Sembunyikan Oprec was turned on at 19:09 WIB, so nothing shows outside the Panitia until someone presses Tampilkan Oprec. Prod schema is at 0048.
- **On the branch, not pushed:** S2 (06's commits `ef54863`, `50aed1c`, `77df46a` and `517c7e1`, migration 0049). Its verification is owed (`handoffs/06.md`).
- **Uncommitted:** W1's oprec accounts (migration 0050 `rec_account`, cookie `iris_oprec`). They touch 06's S2 files, and S1 can't take new applicants without them. Main and the branch have diverged by 11 commits each way, so every ship goes by cherry-pick from a worktree off origin/main.
- **Signed off:** 08c (S3 mockup), merged into the main mockup as v5 of https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz. Its last browser checks were deferred for memory, and W1 runs them. The six S3 proposals are accepted with W1's adjustments in EXAM-ENGINE 11.3, which wins over the mockup where they differ.
- **No recruitment session is running.** Every session below starts fresh.
- **Migrations:** 0049 belongs to 06, 0050 to W1, 0051 to 11 (every table of 09, 10 and 11), 0052 to 12 and 0053 to 13. Generate them in that order, never two at once.
- **W1 closes** after the accounts ship and the mockup checks. 07 and 14 are now their own sessions, not W1's.

## Order (three slots)
| When | Session | File | Model / effort | Deadline |
|---|---|---|---|---|
| now, slot A | W1 | `resume-W1.md` | Opus 5.5, high | accounts live before the user presses Tampilkan Oprec |
| now, slot B | 06 | `resume-06.md` | Sonnet 5.5, high | done well before 07's 9 Nov |
| now, slot C | 11 | `11-master-console.md` | Sonnet 5.5, high | 10 Nov |
| W1 done → slot A | 10 | `10-exam-runner.md` | Sonnet 5.5, high | 10 Nov |
| 06 done → slot B | 07 | `07-s2-review-ship.md` | Opus 5.5, high | **live by Mon 9 Nov** (Pilih Jadwal opens 11 Nov 19:00) |
| 07 done → slot B | 09 | `09-bank-and-references.md` | Sonnet 5.5, high | 10 Nov |
| 11 done | 12 | `12-live-coding.md` | Sonnet 5.5, high | 13 Nov |
| 10 and 06 done | 13 | `13-scoring-results.md` | Sonnet 5.5, medium | 13 Nov |
| 09 to 13 done | 14 | `14-s3-rehearsal-ship.md` | Opus 5.5, high | live by 16 Nov |

If 10 or 09 is falling behind 10 Nov, it may take the first free slot ahead of the order. Never run four sessions at once.

## Notes per session (they bind, on top of each prompt)
**06 and W1:** see their resume files. W1 commits the account hunks in 06's files, and 06 doesn't touch them.

**07 (S2 review and ship):**
- Review 06's four commits and W1's account hunks in the S2 files.
- Before running anything on prod, read `handoffs/W1.md` to see whether W1 already put 0049 on prod with the accounts. If W1 did, 07 ships only the S2 code. If not, 07 does `pg_dump`, applies 0049 by hand, then deploys.
- On prod, the Berkas desk's viewer must open a real file (on the rig it shows "Memuat berkas..." because R2 isn't there).
- 07 owns the merge or rebase of the branch onto main after its ship, so the cherry-picked twins drop out.

**11 (Master console):**
- **Day 1 is the schema:** the S3 section of `schema.ts` and `drizzle/0051_*` for every table EXAM-ENGINE 10.1 marks 0051, the five dispatch lines in `[aksi].ts`, and the S3 siaran topics. Generate 0051 only after W1 says 0050 is committed and final, since 0051's snapshot chains onto it. Until then, build `apps/relay/src/ujian.ts` and `lib/recruitment/room-relay.ts` with their tests.
- Once 0051 is committed, put its hash in your STATUS row and message 10 and 09 if they're running. They read the row if not.
- 11 owns the `rec_exam_seat.room_id` sync (handoffs/08c.md, item 5). Plotting's `slot-set move`, Auto Isi and any write that changes a `tes_tulis` assignment set it in the same transaction. These are 06's files and 06 will have ended, so list them under "Touched outside my paths".
- **Hotspots (9.6a):** rows can be owned by a seat, `cap` is computed from the seat's lent Wi-Fi boards, and the console groups boards by hotspot.
- **Re-roll call (11.3):** it takes a reason from a fixed list and never puts the Asisten's code on the seat's page.
- New tabs go in RecNav's `links` plus a `PanelTab` key.

**10 (exam runner):**
- No migration of its own: its tables come in 11's 0051. Start with the renderers in `components/recruitment/exam/render/` (09's preview imports them), the check-in and the timer (`jamServer()`, never `Date.now` for anything that gates). Write API code against the tables once 0051 is committed.
- The seat page's hotspot field (9.6a): the endpoint takes `{ ssid, pass }` and answers `{ ssid }` only. The password is sealed with `rahasia.ts` and never echoed back.
- Code fonts have ligatures off. Keyframes are `rec-s3-*` and classes `r3*`. Read the design calls in `handoffs/08c.md`.
- Use a fake Master until 11's room actions land.

**09 (bank and references):**
- Its tables are in 11's 0051, and `rec_exam_config` is 11's too.
- The preview reuses 10's `exam/render/` and doesn't fork it.
- The seed bank ships as the default with `sample = true`.
- The Live Coding topic pool editor is 12's, including `rec_lc_topic.icon` (11.3).

**12 (Live Coding):**
- 0052 is 12's, including `rec_lc_topic.icon`.
- The 11.3 calls are 12's: hidden peer sheets (a grader sees only who and when on the other sheets), the re-roll reason shown as "oleh pengawas", `typicalMs` per fqbn, and every lent board counted as Wi-Fi until the deal.
- Strikes are called kejadian in the UI.
- The exam's MQTT rides broker.irisiotlab.com.

**13 (scoring):**
- 0053 is 13's.
- Finalkan and its unfreeze are for the Ketua or anyone in Akademik (the bank right), with no Koordinator exception (ruling 2026-10-24). This overrides "Akademik Koor or Ketua" in `13-scoring-results.md`.
- The Tes Tulis score column on 06's Cutting board: 06 will have ended, so list it under "Touched outside my paths".

**14 (S3 rehearsal and ship):**
- Ships 0051 to 0053 by hand after a `pg_dump`, plus the PC agent bundle (its protocol bump must be live before the web hands out compile jobs).
- Same cherry-pick route as 07.
- 14 is now its own Opus session, not W1's.

## Rulings that bind wave 3
- Every ruling in STATUS.md's log, in particular: the phone hotspots (9.6a), the six S3 proposals (11.3), the `room` and Reopen rulings from W1's review of 08, the oprec accounts, and Sembunyikan Oprec.
- Nothing outside the Panitia sees recruitment before the user presses Tampilkan Oprec, whatever the calendar says.

## Kickoff (what the user sends)
Open a new Claude Code session in `C:\Users\EintsWaveX\Documents\WebApps\iris-iot`, set the model and effort from the table, then send:
> Run `docs/recruitment/prompts/<file>`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE2.md` and `WAVE3.md` first.
