# Wave 3 · shared notes (rewritten 2026-10-24 22:45 WIB by iris-iot-59)

Read this after `_RULES.md` and `WAVE2.md`; where they differ, this file wins. It lists the sessions to open, in order, with the model, effort and kickoff line for each. At most three sessions run at once, each a separate prompt session, with no subagents. Only one Playwright script runs at a time across all sessions, and each session checks that free RAM is at least 600 MB before a browser run (Claude Code killed runs at 200 to 500 MB free).

## Update 2026-10-25 evening (all three in-flight sessions paused on the user's word; this section wins over everything below)
**State.** Done: 01-06, W1, 08, 08c, 10, 11. Paused, each with a handoff and a `resume-NN.md`: **07** (ship commit `4712a91` on the local branch `s2-ship`, rig all green, motion checks and the user's go owed, no prod step started), **09** (bank-io, snapshotter and bank API committed; seed bank 14 of 45, the Bank Soal tab and the rig verify not done), **12** (site side and PC agent committed; the API has never run on a database, the templates are uncompiled, the gateway Worker and the page do not exist). **13** is ready and untouched. **14** waits for 09, 12, 13. Prod is still at 0050 (main `2fb3f9f`), Sembunyikan Oprec is on, the branch is 39 commits ahead of origin and unpushed. 0051 and 0052 exist on the rig only.

**Slots (max three), in this order.**
| Slot | Session | Kickoff file | Model / effort | Deadline | Why this order |
|---|---|---|---|---|---|
| A | 07 | `resume-07.md` | Opus 5.5, high | live by 9 Nov | The only step that touches prod and the only date fixed by candidates (Pilih Jadwal 11 Nov 19:00). Mostly checking now, so light on RAM. |
| B | 09 | `resume-09.md` | Sonnet 5.5, high | 10 Nov | Smaller than 12, and 14 needs the bank to rehearse. Starts with the rig run. |
| C | 12 | `resume-12.md` | Sonnet 5.5, high | 13 Nov | The longest remaining piece (gateway Worker and the whole page). Start it now, not when 09 ends. |
| first free | 13 | `13-scoring-results.md` | Sonnet 5.5, medium | 13 Nov | Small. Takes the slot 07 frees. |
| last | 14 | `14-s3-rehearsal-ship.md` | Opus 5.5, high | live by 16 Nov | After 09, 12, 13. |

**Shared rig, so no collisions.** One Postgres on :54329. Each session works in its own database copy and API port: 07 `iris_e2e07` on :8791 (Astro :4322), 12 `iris_e2e12` on :8792, 09 `iris_e2e09` on :8793. One Playwright run at a time across all sessions, at least 600 MB free before each; nobody kills another session's processes. Any `npm install` prunes the rig-only `pg` packages (`npm install --no-save pg @types/pg` puts them back). `apps/web/src/lib/db.ts` carries an uncommitted RIG-ONLY patch and `public/rig-test/` is untracked: neither is ever committed. 09 and 12 both edit `src/lib/tp-r2.ts` and `apps/relay/src/tp.ts`: stage only your own hunks.

**What 14 inherits** (add to its rehearsal list): 0051 to 0053 by hand after a `pg_dump`; the relay redeploy (bank pictures, the exam image keys, the header check); the Worker secrets `REC_GATEWAY_SECRET` and `REC_PANTAU_PASS` and the `v3` Durable Object migration; the PC agent bundle at protocol 9 through the Updates card before the site hands out compile jobs; `iris-rec-provision.sh` on the PC; the bubblewrap sandbox and `systemd-run` cap on Linux (never run yet); hardware (ESP32 DevKit V1 and S3, flash at 921600, BLE, a phone hotspot); Firefox, Safari and a real phone for the check-in; 11's Phase 1 verify with real seats; `+N menit` at 360 px.

**Kickoff (what the user sends).** Each in its own new Claude Code session in the iris-iot folder, with the model and effort from the table:
> Run `docs/recruitment/prompts/resume-07.md`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE3.md` (the 2026-10-25 evening update first), and `handoffs/07.md`.

> Run `docs/recruitment/prompts/resume-09.md`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE3.md` (the 2026-10-25 evening update first), and `handoffs/09.md`.

> Run `docs/recruitment/prompts/resume-12.md`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE3.md` (the 2026-10-25 evening update first), and `handoffs/12.md`.

### Earlier the same day (superseded where it differs from the section above)
#### Update 2026-10-25 (iris-iot, after W1 and 11 closed)
**State.** W1, 06 and 11 are done, so their slots are free. 10 is the only session in flight: its runner and handoff exist but are uncommitted and its STATUS row still says `running`; whoever closes it commits with explicit paths, runs `npm run check` and sets the row. Prod is at **0050** (0049 without its seed, plus `rec_account`), main is `2fb3f9f`, Sembunyikan Oprec is on. The branch is 27 commits ahead of origin and unpushed. 0051 exists on the rig only; 11's rig-only `lib/db.ts` patch and `public/rig-test/` are never committed.

**Slots now (max three).**
| Slot | Session | File | Model / effort | Note |
|---|---|---|---|---|
| A | 10 (close) | already running | Sonnet 5.5, high | commit, `npm run check`, STATUS row. Not a new session if the old one is still alive. |
| B | 07 | `07-s2-review-ship.md` | Opus 5.5, high | **first priority**, live by Mon 9 Nov |
| C | 12 | `12-live-coding.md` | Sonnet 5.5, high | ready since 11 closed |
| next free | 09 | `09-bank-and-references.md` | Sonnet 5.5, high | needs 10's `exam/render/` committed first (it imports it); takes A when 10 closes |
| after 10 | 13 | `13-scoring-results.md` | Sonnet 5.5, medium | Needs 10 and 06; 0053 is its own |
| last | 14 | `14-s3-rehearsal-ship.md` | Opus 5.5, high | after 09, 10, 11, 12, 13 |

If 10 is closed before 07 and 12 start, open 09 in the third slot. 13 is small; it can take any slot that frees before 12 ends.

**Extra notes that bind (they come from what 06, W1 and 11 found).**
- **07:**
  - Prod already holds 0049 (no seed) and 0050; do not apply them again. Insert the three Pilih Jadwal events with S2 (the insert skips ones that exist).
  - Ship S2 only: `ef54863`, `50aed1c`, `77df46a`, `517c7e1`, `bab27f4`, by cherry-pick from a worktree off origin/main. The oprec twins (`27793fa`, `21938e3`, `2fb3f9f`) and `36f58b6` are already on main, so they drop out when the branch is merged afterwards. Check that no S2 file imports 11's `recruitment-room.ts` or touches `rec_exam_seat` (prod has no 0051).
  - Run what 06 could not: `rec_leak.mjs`, `leak_api.mjs`, `idor_probe.mjs`, `pop2.mjs`, `pop4.mjs`, and `rec_s2_api.mjs` (79) plus `rec_s2_flows.mjs` (42) on the final tree. The rig calendar was moved by 06 and 11 (First Meet sits on 24 Oct), so `rec_s1_flows.mjs` step 6 fails by data, not by code; reset the rig data or say so.
  - On prod, the Berkas desk viewer must open a real file. The Home banner sits under the hero (S1 layout, signed off): ask the user whether to raise it.
  - The user, not you, presses Tampilkan Oprec. Pilih Jadwal opens 11 Nov 19:00 WIB.
- **12:** read `handoffs/11.md` (`roomHooks` in `recruitment-room.ts` is where you plug in) and `handoffs/10.md` (`LiveCodeStandIn` in `exam/Screens.tsx` and the shared `HotspotCard`). 0052 is yours and nothing else touches it. The PC agent is in the other repo (`Downloads/IRIS ASO/orangepi/agent/`): commit there separately.
- **09:** the 501 from `GET ref?id=` is yours (10 built the drawer against it); the reader style needs your snapshot. Images load through your `GET media?key=`. `abbreviations.test.ts` fails on short unit words in UI strings (11's `ruangStrings.ts` had `mnt`/`min`); keep yours spelled out.
- **10's close:** the open items in `handoffs/10.md` (no Firefox or Safari check-in, no real phone, Live Coding stand-in) go into 14's rehearsal list. 11's Phase 1 verify with real seats is 14's too.
- **13:** unchanged, plus the Tes Tulis score column on 06's Cutting board is listed under "Touched outside my paths".

**Kickoff lines (the user sends one per new session, after setting the model and effort).**
> Run `docs/recruitment/prompts/07-s2-review-ship.md`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE2.md` and `WAVE3.md` (the 2026-10-25 update first), and `handoffs/W1.md` before anything touches prod.

> Run `docs/recruitment/prompts/12-live-coding.md`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE2.md` and `WAVE3.md` (the 2026-10-25 update first), and `handoffs/11.md`.

> Run `docs/recruitment/prompts/09-bank-and-references.md`. Read `docs/recruitment/prompts/_RULES.md`, `WAVE2.md` and `WAVE3.md` (the 2026-10-25 update first), and `handoffs/10.md` (the renderers).

## Where things stood on 2026-10-24 (older; the update above wins)
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
| now, slot C | 11 | `resume-11.md` (done 25 Oct 01:25) | Sonnet 5.5, high | 10 Nov |
| W1 done → slot A | 10 | `10-exam-runner.md` | Sonnet 5.5, high | 10 Nov |
| 06 done (25 Oct) → slot B | 07 | `07-s2-review-ship.md` | Opus 5.5, high | **live by Mon 9 Nov** (Pilih Jadwal opens 11 Nov 19:00) |
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
