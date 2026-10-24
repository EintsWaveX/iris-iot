# 08c · S3 Stage 0 mockup (exam runner, Master console, Live Coding, bank editor)

- **Model / effort:** Opus 5.5, high
- **Needs:** 08 (done: `EXAM-ENGINE.md` reviewed with the user, pure modules `eb3078f`)
- **Deadline:** signed off by **Mon 26 Oct 2026**. 09, 10 and 11 wait on this sign-off, and the Pleno is 16 Nov.
- **Owned paths:** `~/Downloads/design-review/mockups/recruitment-s3/` and **its own artifact** (never the main one, RCXL2f8vcpWhQHhorCeAPz; W1 merges after sign-off)
- **Skills:**
  - `emil-design-eng`
  - `animate`
  - `find-animation-opportunities`
  - `apple-design`
  - `frontend-design`
  - `impeccable:impeccable`
  - `design:ux-copy`
  - `artifact-design`

This is Part C of prompt 08, split into its own session on 2026-10-24. Read `_RULES.md`, `WAVE2.md`, `EXAM-ENGINE.md` (all of it; sections 1, 5 to 7 and 9 drive the screens), PRD section 7, and `handoffs/01.md`, `05.md` and `08.md`.

## 0. Set up the folder
`mockups/recruitment-s3/` is a stale copy made at 03:09 on 24 Oct, before 05 added S2, and holds no S3 work. Delete it and copy `mockups/recruitment/` again (it now has S1 and S2, both signed off), so the S3 screens sit in the same engine. Add S3 as `app/screens-rec3.js` (candidate side), `app/screens-rec3p.js` (Panitia side), `app/rec3.css` and, if needed, `app/icons-rec3.js`, with picker ids `r3-*`. Leave `mockups/recruitment/` alone.

## Data
Build the mockup data from the real shapes, so 09 to 12 can lift it:
- Questions as `toView()` returns them (`View` in `apps/web/src/lib/recruitment/exam-types.ts`), from the 14 seed questions in EXAM-ENGINE 1.5.
- The room from `RoomState` and the views of `roomView()` (5.3), the timers from `clock`, `roomLeft` and `seatLeft`.
- The Live Coding topics, templates and rubric from EXAM-ENGINE 9.2, 9.3 and 9.8 (they ship as the defaults).

## Screens
1. **Candidate runner** (`/recruitment/test`):
   - the three check-in steps (fullscreen, connection check, name confirm), plus the Chromium check before Live Coding
   - the lobby (tonight's parts with their minutes, the rules, "Menunggu pengawas memulai")
   - one question screen per format: single, multi, click the lines, pick the fix, order the lines, match pairs, FITB (the IRIS blank look, several blanks on a line)
   - the navigator strip (answered, flagged), the timer, the reference drawer
   - the "Soal ini dibatalkan" placeholder for a voided question
   - Kumpulkan with its Confirm, the time-over screen, paused (blurred, inert, frozen timer), the fullscreen cover with **Kembali ke Layar Penuh**, the second tab warning, finished
2. **Master console:**
   - the seat grid: progress, strikes, connection, time left, seat extras, "Belum masuk"
   - video-style controls (Start, Pause, Resume, Skip, Reopen, ±time, Finish behind a HoldButton) with their guards as the disabled states and the reasons the API gives
   - the 120 min budget bar with real segments and the overrun warning ("Diperkirakan lewat 8 menit")
   - Master handover in the Konsol style: Jadi Master, Minta Jadi Master, Serahkan or Tolak, Ambil Alih for a stale Master
   - the Pengawas view (no controls) with notes per candidate
   - room setup: pengawas, rehearsal flag, and the **hotspot list** (owner, SSID, password, capacity) with "Butuh 5 hotspot, ada 3" (9.6a)
   - Persiapan: check-ins, kit loans with **one or two boards** per seat (DevKit V1 or S3)
3. **Live Coding:**
   - the two slot-machine spins (topic, then protocol) with rich motion; decoy cells, never the other real titles (9.1)
   - the brief, the protocol and the other end's details
   - the editor with **a tab per board** ("Papan 1", Tambah Papan for "Papan 2"), a chip picker per tab, the reference drawer
   - Compile with the queue position, the log with errors linked to lines; Flash with progress, the retry speeds, and **Ganti ke ESP32-S3** on a chip mismatch (9.3a)
   - the serial monitor per board
   - the other end panel for each protocol: WebSocket, HTTP, MQTT (topics under `rec/s<seat>/`), BLE (the Web Bluetooth central)
   - the traffic log
   - in the console: boards grouped by hotspot, a dropped phone as one red group, moving a board to another hotspot
   - the grader list (sheet counts per seat) and the rubric sheet (rows 0 to 4 as words, two sheets from two different people, edit or withdraw until Finalkan)
4. **Bank editor:**
   - the list per part with the pool counter ("12 dari 20 siap") and the "Bawaan" badge on seeds
   - the format picker and the editor for each format, with the candidate view preview beside it
   - the locked structure after a question was shown, the key fix with a note, Batalkan Soal
   - import with the dry run table, and export
   - the parts config editor (`DEFAULT_EXAM_CONFIG`, locks at the first real Start)
   - the Live Coding tab: topics and templates

Every screen at the seven widths and the short screen, in id, en and zh, Low Detail and reduced motion. Follow the UI rules in `_RULES.md`.

## Motion
Write motion specs (durations, easing, the order of steps, Low Detail and reduced motion) for:
- the topic spin and the protocol spin
- part transitions (Start, the lobby, the time-over screen)
- the fullscreen cover
- Compile and Flash progress

## Deliver
- Publish the S3 artifact and give the user the link.
- `handoffs/08c.md`: the screen ids, every design call 09 to 12 follow, the motion specs, and any change the mockup needs in `EXAM-ENGINE.md` (message the reviewer, W1, before you change the contract).
- After the user signs off: set STATUS.md to `done (signed off)`, log the rulings (STATUS.md and the memory file), and tell W1 by SendMessage so it can merge S3 into the main artifact and start wave 3 (09, 10, 11).
