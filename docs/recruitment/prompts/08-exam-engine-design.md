# 08 · Exam engine design + S3 Stage 0 mockup

- **Model / effort:** Opus 5.5, **max**
- **Needs:** 02 (done). It can run while 03 to 07 proceed.
- **Deadline:** design signed off by 1 Nov 2026, so 09 to 13 have two weeks before the 16 Nov Pleno.
- **Owned paths:**
  - `docs/recruitment/EXAM-ENGINE.md` (new)
  - `apps/web/src/lib/recruitment/{formats,draw,scoring,room}.ts` (pure modules + their tests)
  - `~/Downloads/design-review/mockups/recruitment/` (S3 screens)
- **Skills:**
  - `superpowers:writing-plans`
  - `superpowers:test-driven-development`
  - `api-designer`
  - `typescript-pro`
  - `cpp-pro` + `python-pro` (only for sample questions)
  - `emil-design-eng`
  - `animate`
  - `frontend-design`
  - `apple-design`
  - `design:ux-copy`
  - `artifact-design`

Read `_RULES.md`, `PRD.md` section 7 (all of it) and `ARCHITECTURE.md` sections 7 to 9. The user is in Akademik and owns this area. Ask them before inventing any rule PRD section 7 doesn't settle.

## Part A: `EXAM-ENGINE.md` (the contract 09 to 13 build against)
1. **Question model:** one JSON schema per format (single, multi, click-lines, pick-fix, order-lines, match-pairs, fitb-typed). For each: body, answer, shuffle rules, the credit function, and the Markdown/YAML import syntax with a full example of every format in C++ and in PY.
2. **Parts config** per edition: time, shown and pool counts per language, the Debugging sub-parts with the 500/500 caps, the C++/PY ratio for FITB, the Live Coding default of 45 min, the 120 min budget.
3. **Draw:** the server-side algorithm (seeded by seat id + part, honouring language counts, with no repeats inside a seat), what is stored, and how reconnects and reopens reuse it.
4. **Scoring:** the exact formula from PRD 7.4, edge cases (0 seats shown, unanswered, partial order), provisional vs final, the Finalkan action, and rounding. Include a worked numeric example the tests reuse.
5. **Room state machine:** states (persiapan, lobby, part-running, part-paused, part-ended, livecode-spin, livecode-running, finished), every Master action and its guards (Start, Pause, Resume, Skip, Reopen previous, ±time room/seat, Finish, handover, re-roll a seat), how timers are computed from the server time with offsets, what each seat sees in each state.
6. **Relay protocol** for `rec-room:<id>`: message kinds Master → seats and seats → Master (heartbeat, progress, strike), the auth tickets (like the Konsol tickets), and fallbacks when the relay drops (the API is the truth; seats refetch).
7. **Soft lockdown:** which browser events count as strikes, the debounce, what the Master sees, and the "Kembali ke layar penuh" cover.
8. **Reference snapshotter:** the fetch and sanitize pipeline, the stored form, the serving headers (CSP, sandbox), and a test list of tricky pages (GitHub README, Arduino reference, ESP-IDF docs, docs.python.org).
9. **Live Coding:**
   - the spin data
   - the topic pool shape (topic list TBD by the user, provide 6 sample topics marked SAMPLE)
   - the protocol templates
   - the compile job protocol between the API and the PC agent (job, result, `.bin` transfer through R2, time limits, queue fairness for about 35 seats, the protocol version bump)
   - esptool-js flashing (merged bin offsets for ESP32)
   - the four "other end" services (MQTT per-seat credentials generated per evening and never stored in code, WS relay room, HTTP collector, Web Bluetooth central) and the traffic log format
   - the grader rubric shape (rows TBD by the user, provide a SAMPLE)
10. **Work split** for 09 to 13: the exact files each owns, the shared types file, and the order to merge in.

## Part B: pure modules (TDD)
`formats.ts` (credit functions per format), `draw.ts`, `scoring.ts`, `room.ts` (the reducer for the state machine + timer math). Fully unit tested, including the worked example from section 4. 09 to 13 import these and must not re-implement them.

## Part C: S3 Stage 0 mockup (same engine, same artifact)
Screens:
- **Candidate runner:** lobby, each of the six formats plus FITB, the reference drawer, the timer, the fullscreen cover, submitted, paused.
- **Master console:** seat grid with progress, strikes, connection and time left; video-style controls; the 120 min budget bar; handover; Pengawas view with notes.
- **Live Coding:** the two slot-machine spins (rich motion), editor + reference drawer, Compile/Flash with progress, serial monitor, the other-end panel for each protocol, grader rubric sheet.
- **Bank editor:** per-part list, format picker, candidate-view preview, pool counter, import/export.

Write motion specs for the spins and part transitions.

## Done
- `EXAM-ENGINE.md` reviewed with the user.
- The mockup signed off.
- The pure modules merged (commit on the branch, not deployed).
- `handoffs/08.md` and STATUS updated.
