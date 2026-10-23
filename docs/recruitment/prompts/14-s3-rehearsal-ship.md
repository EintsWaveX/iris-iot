# 14 · S3 rehearsal, review, ship

- **Model / effort:** Opus 5.5, high
- **Needs:** 09, 10, 11, 12, 13 (all done)
- **Deadline:** live by 16 Nov 2026 (the Pleno). Tests run 17 to 19 Nov, Susulan 20 Nov.
- **Skills:**
  - `emil-design-eng`
  - `improve-animations`
  - `design:design-critique`
  - `design:accessibility-review`
  - `break-ui`
  - `code-review`
  - `security-review`
  - `engineering:testing-strategy`
  - `superpowers:verification-before-completion`

Read `_RULES.md` and every handoff from 08 to 13.

## Do
1. **Full dry run on the rig** (`rig/rec_s3_rehearsal.mjs`), using 30 seats in Playwright contexts, one Master and two Pengawas:
   - check-in
   - Logika: one seat leaves fullscreen 3 times, one seat reloads midway
   - FITB: references opened
   - Debugging: Pause for 2 min, then Skip
   - Reopen previous
   - +5 min to one seat
   - a Master handover
   - Live Coding: spins, a re-roll, a compile queue of 30, two graders
   - Finish
   - Scores against the hand-computed checks, then Finalkan.
   - Record a video of the Master console and of two seats for the user.
2. **Load:** the compile queue and the relay room with 35 seats, measuring the end-to-end time per compile. If one compile takes more than about 60 s at the queue's tail, report it before shipping.
3. **Review:** the Emil lens on every S3 screen, accessibility, animations, `break-ui`.
4. **Security:**
   - the snapshot sandbox (try every escape from inside a snapshot)
   - bank and answers hidden from candidates
   - MQTT credentials revoked at Finish
   - the collector rejects a stale seat token
   - leak audit and IDOR
5. **Ship on the user's go:** `pg_dump`, the S3 migrations by hand, the deploy, and the PC agent bundle through the Updates card (the agent's protocol bump must be live before the web hands out compile jobs). Check prod with a 2-seat room on 16 Nov before the Pleno.
6. Write a **Master's one-page guide** (`docs/recruitment/MASTER-GUIDE.md`, Indonesian) for the pengawas.
