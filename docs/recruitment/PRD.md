# IRIS Open Recruitment (OPREC 2026): Product Requirements

Status: agreed with the user on 2026-10-23. Source deck: `OPREC-2026-deck.pdf` (this folder).
Companion: `ARCHITECTURE.md`. Exam engine detail: `EXAM-ENGINE.md` (written by prompt 08).

## 1. Why

IRIS is recruiting new Asisten for the first time, and the user wants the whole process inside the IRIS web, not in scattered forms and spreadsheets. The site needs to:

- run the timeline from a calendar
- take applications
- run the written and coding test
- plot interviews and teaching tests
- collect rubric scores
- turn each Cutting into a moment candidates remember: a party for Lolos, a kind "ouhhh" for Gagal

It reuses everything IRIS already has: the sign-in, the kit, the kosmik look, live updates, R2 uploads, Web Serial, the relay and the PC agent.

**Success:**
- Registration opens on 25 Oct with no form outside IRIS.
- Every stage up to Penerimaan runs in IRIS.
- Panitia never need a spreadsheet to know who is where.
- The Tes Tulis & Koding runs 17 to 20 Nov with automatic Phase 1 scoring.

**Anti-goals:**
- Practicum loses focus on Home.
- A Praktikan sees anyone else's candidacy, documents or scores.
- A candidate sees per-question points.
- The test can be escaped to the open web through the reference viewer.
- Any native browser widget.
- Dashes in UI copy.

## 2. People

| Who | Account | What they do |
|---|---|---|
| Visitor (signed out) | none | Sees the Home banner with the dates. |
| Praktikan | Praktikan | Can apply (Daftar) while Open runs. |
| Candidate (Caas) | Praktikan | Follows their journey, sees public events, uploads documents, sits tests, opens envelopes. |
| Panitia member | Asisten | Works in their division's tabs (see 4). |
| Koordinator | Asisten | A division head; same rights as their division plus the head badge. |
| Ketua | Asisten | Seats the Panitia, edits the calendar, locks Cutting, confirms Penerimaan. |
| Master (per test evening) | Asisten (pengawas that evening, never the Pencipta) | Runs the exam room. |
| Pengawas | Asisten | Watches the room, writes notes per candidate. |
| Pencipta / Admin tier / DEV | Asisten | Full rights (`hakPenuh`); Pencipta/Admin seat the Ketua. |

**Panitia 2026 (from the deck):**
- Ketua: REGA. Shinta: second in charge (exact role TBD).
- Acara: **Akbar**, Rui, Rido, Agung 1, Tirta, Bryan
- Akademik: **Raditya**, Imanuel, Rifky, Darma, Luqman
- Logistik: **Adrian**, Agung 2, Geraldi
- Admin: **Wildan**, Bustan, Mildess, Nanat, Marvel
- PDD: **Fathir**, Monica, Serly

Bold = Koordinator.

## 3. Timeline (seed calendar, editable)

All tests run 18.30 to 21.00 WIB at TULT unless noted. **Internal** events are hidden from candidates.

| Event | Kind | Dates | Internal | Gates |
|---|---|---|---|---|
| Open Recruitment | registration | 25 Oct to 31 Oct | no | Daftar on |
| Extend | registration | 1 Nov to 2 Nov | no | Daftar on |
| Pengecekan Berkas | review | 9 Nov to 10 Nov | yes | Berkas review |
| Pengumuman Berkas | announcement | 11 Nov | no | Berkas reveal |
| First Meet | meeting | 12 Nov 18.30 to 21.00, TULT | no | attendance QR |
| Pleno Tes Tulis | pleno | 16 Nov | yes | |
| Tes Tulis & Program | test | 17 Nov to 19 Nov | no (own evening only) | exam rooms |
| Susulan Tes Tulis | makeup | 20 Nov | no (only if offered) | exam room |
| Cutting Tes Tulis | cutting | 25 Nov to 26 Nov | yes | Cutting board |
| Pengumuman Tes Tulis | announcement | 27 Nov | no | reveal |
| Pleno Wawancara | pleno | 30 Nov | yes | |
| Tes Wawancara | interview | 1 Des to 3 Des | no (own slot only) | rubric sheets |
| Susulan Wawancara | makeup | 4 Des | no (if offered) | |
| Cutting Wawancara | cutting | 9 Des to 10 Des | yes | |
| Pengumuman Wawancara | announcement | 11 Des | no | reveal |
| Techmeet Tubes | meeting | 12 Des | no | topics published |
| Pengerjaan Tubes | work | 13 Des to 17 Des, 18.30 to 22.00, Lab IRIS | no | check-ins, attendance |
| Presentasi Tubes | presentation | 18 Des | no | rubric, submission closes |
| Cutting Tubes | cutting | 19 Des | yes | |
| Pengumuman Tubes | announcement | 20 Des | no | reveal |
| Pleno Mengajar | pleno | 21 Des | yes | |
| Tes Mengajar | teaching | 22 Des to 24 Des | no (own slot only) | rubric sheets |
| Susulan Mengajar | makeup | 26 Des | no (if offered) | |
| Cutting Mengajar | cutting | 4 Jan 2027 to 5 Jan 2027 | yes | |
| Pengumuman Mengajar | announcement | 6 Jan 2027 | no | reveal |
| Penerimaan Asisten Baru | acceptance | TBD | no | Jadikan Asisten |

**Targets:** about 100 applicants; 80 to 100 through Berkas; 60 to 80 after Tes Tulis; 30 to 40 into Mengajar; 20 to 23 accepted.

**Calendar rules:**
- Only the Ketua and Acara edit.
- Events span one day up to many weeks and may carry a daily time window and a place.
- An event's start or end opens or closes the stage it gates. Gating is always computed from the calendar, never from a separate switch.
- Editing an event whose stage has already started asks for confirmation and is written to an audit log.

## 4. Rights by division (default; correct over time)

| Thing | Ketua | Acara | Akademik | Admin | Logistik | PDD | Other Panitia |
|---|---|---|---|---|---|---|---|
| Calendar edit | yes | yes | | | | | |
| Panitia board | yes | | | | | | |
| Candidate list (names, stage) | yes | yes | yes | yes | yes | yes | yes |
| Berkas (documents) | yes | | | yes | | | |
| Approve applications | yes | | | yes | | | |
| Question bank, raw answers | yes | | yes | | | | |
| Exam room Master / Pengawas | per evening plotting (Akademik assigns) | | | | | | |
| Plotting | yes | | yes (tests) | yes | | | |
| Rubric scoring | examiners assigned to the slot | | | | | | |
| Cutting: propose | yes | yes | yes | yes | yes | yes | |
| Cutting: lock | yes | | | | | | |
| Attendance QR + override | yes | yes | | yes | | | |
| Kit loans (Live Coding, Tubes) | yes | | | | yes | | |
| Jadikan Asisten | yes | | | | | | |

`hakPenuh` holders keep everything. A Praktikan only ever sees their own candidacy.

## 5. Candidate (Praktikan) experience

### 5.1 Home banner (role-aware, every role)
- **Placement and look:** below the practicum hero, about one card tall, never pushing practicum content off the first screen on desktop. It has an animated gradient edge, and the motion turns off at Low Detail and with reduced motion.

| Viewer | Banner shows |
|---|---|
| Visitor | "Open Recruitment Asisten IRIS" with the Open dates |
| Praktikan, not applied, Open running | A Daftar button and a countdown to close |
| Praktikan, Open not running | Nothing, or "segera" if the next edition is announced |
| Candidate | Current stage and next public event date; a sealed envelope chip when a reveal is waiting |
| Cut candidate | A thank-you line for 7 days after the reveal, then hidden |
| Panitia | A Panitia shortcut and today's recruitment events |
| Other Asisten | Today's recruitment events (read only) |

### 5.2 `/recruitment` (candidate)
Keep the page simple and put the richer things in dialogs, drawers and popovers.
- **Journey:** stages laid out as a constellation path (Berkas, First Meet, Tes Tulis, Wawancara, Tubes, Mengajar, Penerimaan). Each stage is marked done, current, locked or ended.
- **Next event card:** the date, time and place of the next public event, plus a countdown.
- **Calendar:** a month grid with spanning bars that shows public events plus the candidate's own slots. Tapping an event opens a popover.
- **Documents drawer:** what they uploaded and its status. Re-upload is allowed until the registration window closes.
- **Envelope inbox:** one sealed envelope per announced stage.
- **Tests:** the test entry button appears only during the candidate's own evening (`/recruitment/test`).
- **Withdraw:** Mundur sits behind a HoldButton with a confirm step.

### 5.3 Daftar (application)
Shown only while a registration event is live.
- The candidate goes through a short stepper in a dialog: biodata, then uploads, then consent, then submit.
- **Biodata:** angkatan, kelas, phone, LINE ID, address in Bandung, motivation in one line.
- **Uploads:** CV, surat lamaran, visi misi. PDF only, 5 MB max each, sent to R2 straight from the browser.
- **Templates:** Admin provides the document templates as downloads.
- **Consent:** a Checkbox (not a switch) agreeing to the data use and the 6-month retention.
- **After submitting:** status is "Menunggu verifikasi". Admin can approve, or bounce it back with a note asking for a revision.

### 5.4 Envelope reveal
- **When it unlocks:** at the Pengumuman event's start, provided the Ketua has locked that stage's results.
- **Sealed state:** the envelope glows softly until opened. Opening is a drag or a tap-and-hold.
- **Lolos (Hooray):**
  - the seal cracks
  - the card rises
  - a confetti burst in the kosmik palette
  - a gradient bloom
  - a short chime (respects the site's sound preference)
  - the "Lolos ke tahap berikutnya" copy, with the next event
- **Gagal (Ouhhh):**
  - the card deflates slowly with a soft rain or dim effect
  - a kind thank-you with what they achieved
  - no scores shown
- **Replay:** either reveal can be played again from the inbox.
- **Final acceptance:** Penerimaan has a bigger celebration.

### 5.5 After Gagal
The journey freezes read-only up to the stage reached, and the envelope stays openable. No scores are shown.

## 6. Panitia experience: `/recruitment/panel`

Tabs: **Ringkasan, Kalender, Kandidat, Cutting, Plotting, Tes, Tubes, Panitia.** Each person sees only the tabs their rights allow.

- **Ringkasan:** a funnel (applicants, then each stage), today's events, a to-do list for my division (documents waiting, rubric sheets to fill, Cutting to propose), and the next deadline.
- **Kalender:**
  - Month and agenda views with spanning bars.
  - The editor (Ketua and Acara only) is a dialog with: title, kind, date range (DateRangePicker), daily time window (wheel TimeField), place, internal toggle, gated stage, and colour from the kind.
  - Events can be dragged to move them and edge-dragged to resize.
- **Kandidat:**
  - A table with search, filters by stage and status, and multi-select.
  - Each row opens a side sheet with biodata, documents (only if allowed), attendance, scores per stage (Panitia only) and notes.
  - Admin approves or bounces applications here.
- **Cutting:**
  - One board per stage, built from that stage's scores and attendance.
  - Any Panitia member can propose Lolos or Gagal per candidate, with a note. Bulk proposals use a threshold slider ("top N" or "score at least X").
  - The Ketua locks with a HoldButton. A locked stage shows when its reveal will go out.
  - A locked stage can be unlocked again only before its reveal time.
- **Plotting:**
  - Admin defines rooms × slots × examiners per evening, then presses Auto Isi to fill candidates evenly; the result can be fixed by drag and drop.
  - Candidates can request one swap until H-1; Admin approves or declines.
  - Akademik plots pengawas for each test evening.
  - The same engine serves Tes Tulis, Wawancara and Mengajar.
- **Tes:** Bank, Ruang, Penilaian. See section 7.
- **Tubes:** topics and briefs (assigned per candidate, or spun), a daily check-in feed, a pengawas attendance tick per evening, the submission list, and the Presentasi rubric.
- **Panitia:** a drag board with one column per division plus Ketua and Wakil. People are dragged in from the Asisten list, and each division gets a Koordinator star. Pencipta/Admin seat the Ketua; the Ketua seats everyone else.
- **Attendance QR (`/recruitment/qr`):** a full-screen projector view with a rotating QR (it changes every 20 s), the event name and a live count. Scanning it signs attendance for the signed-in candidate. Admin can override by hand.
- **Rubric sheets:** phone-friendly; examiners fill rows and notes for their assigned slot, and IRIS averages across examiners.
- **Penerimaan:**
  - The Ketua confirms the final list.
  - **Jadikan Asisten** creates the Asisten records with a proposed 3-letter code and no division, keeping their Praktikan history.
  - A big celebration plays for the Panitia, and each accepted candidate receives the final envelope.

## 7. Tes Tulis & Koding (Akademik)

### 7.1 Structure (defaults, editable per edition)

| Phase | Part | Time | Shown / pool | Content |
|---|---|---|---|---|
| 1 | Logika | 15 min | C++ 10/20, PY 5/10 | basic programming logic, light IoT flavour |
| 1 | FITB | 15 min | 15/30 total (C++/PY ratio set, default 10/5) | code snippets with typed blanks, embedded references |
| 1 | Debugging: Kodingan | 10 min | 10/20 total (C++ and PY) | code debugging |
| 1 | Debugging: Mikrokontroller | 20 min | 5/10 | full-system (wiring + code) debugging |
| 2 | Live Coding | default 45 min | 1 topic × 1 protocol | build a full system on an ESP32 kit |

- **Budget:** the default total is 120 min. It is a budget bar for the room, not a hard cap, and the Master sees overrun warnings.
- **Starts:** every part starts manually. When a part ends it auto-submits and the room waits in a lobby.

### 7.2 Answer formats (no free-text reasoning)
1. **Single choice**
2. **Checkbox** (more than one)
3. **Click the buggy line(s)** on numbered code
4. **Pick the fix per line** (dropdowns inside the code)
5. **Order the lines** (Parsons problem)
6. **Match pairs**

FITB blanks are **typed**, use the IRIS blank look (underscore run plus number), and are graded against accepted answers for each blank, with whitespace and case rules set per blank.

### 7.3 Draw
- There is one pool for 17, 18 and 19 Nov plus Susulan.
- Each seat draws its questions at random when a part starts, honouring the language split. Option order and match/order items are shuffled for each seat.
- The draw is stored, so a reconnect or a reopened part shows the same questions.

### 7.4 Scoring (Phase 1, automatic)
- For each question q:
  - N_q = the number of candidates **shown** q, across every evening and Susulan
  - M_q = how many of them were **fully** correct
  - `p_q = (M_q + 1) / (N_q + 2)`
  - `w_q = 2 − p_q` (between 1 and 2)
- **Credit per question, c_q from 0 to 1:**
  - Single, click-line (one bug): 0 or 1.
  - Checkbox, click-lines (several bugs): (right picks − wrong picks) ÷ number of right ones, floored at 0.
  - Pick-fix dropdowns, FITB blanks, match pairs: correct slots ÷ total slots.
  - Order the lines: 1 if the order is exact; otherwise the longest correct subsequence ÷ the number of lines, times 0.5 (my call; adjustable).
- **Part score = round(1000 × Σ c_q·w_q ÷ Σ_shown w_q).**
  - Logika, FITB: up to 1000 each.
  - Debugging: Kodingan and Mikrokontroller are each computed with a 500 cap, then added.
- **Phase 1 maximum = 3000.**
- **Visibility:** scores are provisional until the Susulan room closes, then final. Panitia see both; candidates never see per-question points.
- **Unanswered questions** count as shown with c = 0.
- **Excluded from N_q:** a seat that never started a part.

### 7.5 References
- Akademik attaches reference URLs to a part or a question (GitHub docs, Arduino, ESP-IDF, Python docs).
- IRIS snapshots each one: fetch, sanitize (scripts, forms and iframes stripped; external links made inert; in-page anchors kept; images inlined or proxied) and store it.
- Candidates read snapshots in a side drawer, with no navigation out.

### 7.6 Soft lockdown (candidates' own laptops)
- Fullscreen is required. If it is left, the test is covered with a "Kembali ke layar penuh" button.
- Strikes are logged and shown live to the Master: leaving fullscreen, the tab hiding, the window losing focus, paste attempts, devtools heuristics.
- Copy, cut, paste and the context menu are disabled inside the test.
- Nothing auto-fails; the Master decides.

### 7.7 Live Coding (Phase 2)
1. **Two spins per seat:** topic, then protocol (BLE, HTTP/WebSocket or MQTT Mosquitto), each with a slot-machine reveal. The Master can re-roll one seat. Topics come from a pool Akademik writes (the list is TBD); each must be solvable in about 30 min.
2. **Kit:** Logistik lends an ESP32 kit per seat, plugged into the candidate's laptop.
3. **Editor:** an IRIS code editor (CodeMirror 6) with templates per protocol and the reference drawer.
4. **Compile:** queues an arduino-cli job on the PC server (a new agent job kind). The .bin returns and the browser flashes it with esptool-js over Web Serial. The serial monitor works like Module 1's Live view.
5. **The other end:** IRIS provides it for each protocol:
   - MQTT: the lab Mosquitto with a topic prefix per seat
   - WebSocket: a relay room per seat
   - HTTP: a collector endpoint per seat
   - BLE: a Web Bluetooth central panel in the page
6. **Logs:** traffic is shown live to the candidate and graders, and every compile, flash and message is logged.
7. **Grading:** Akademik defines rubric rows (TBD). Two graders score each seat out of 1000 and IRIS averages them. **Test total = 4000.**

### 7.8 Control (Master console)
- **Pengawas:** Akademik plots pengawas per evening. On the night any of them presses **Jadi Master**; the rest are Pengawas. Handover works like Konsol. The Pencipta can never be Master.
- **Flow:** Persiapan (seats checked in, kits ready, fullscreen OK), then **Start**, then Logika, then FITB, then Debugging (Kodingan, then Mikrokontroller), then Live Coding, then **Finish**.
- **Video-style controls:**

| Control | What it does |
|---|---|
| Start | Begins the next part |
| Pause / Resume all | Freezes every timer and blurs seats with "Dijeda" |
| Skip | Ends the current part now and auto-submits |
| Reopen previous | Reopens the last part with the time it had left; answers are kept |
| ± time | +1/+5/−1 min for the room, or extra time for one seat |

- **Room view:** a seat grid with live state: progress, strikes, connection, the time each seat has left.
- **Pengawas notes:** written per seat, visible to all Panitia.

### 7.9 Bank authoring
- One editor per part, with a format picker and a preview exactly as the candidate sees it.
- A pool counter ("12 of 20 siap") per part and language.
- Import and export as a Markdown/YAML file.
- Visible only to Akademik and the Ketua.
- Publishing the bank is locked while any room of the edition is running.

## 8. Other stages
- **Seleksi Berkas:** Admin reviews documents in Kandidat and adds notes. Scores are optional (TBD). Cutting runs as usual.
- **Wawancara, Mengajar:** plotted slots, a rubric per stage (rows TBD), scored per examiner. Susulan is offered to absentees.
- **Tubes:** topics and briefs at Techmeet; check-ins on each work evening; final submission (code zip, report PDF, demo video link or file) to R2, closing at the Presentasi start; Presentasi rubric.

## 9. Copy, look, motion
- **Language and case:** Indonesian copy with en and zh like the rest of the site. Title Case for headers, tabs and buttons; sentence case for body text. No em or en dashes in UI copy.
- **Look:** the kosmik baseline. Reuse the kit's highlights; no home-made glows. Unique `@keyframes` names. No icons beside labels except ghost buttons.
- **Motion:** rich (gradients, the reveal, spins, the banner edge) but always honouring Low Detail and reduced motion. GSAP 3.15 is already in the app.
- **Layouts:** real desktop and mobile layouts, verified at 7 widths including short screens.

## 10. Data and privacy
- **Retention:** documents and answers are kept 6 months after Penerimaan, then purged (the existing retention job).
- **Leak audit:** run as a visitor and as a Praktikan before every slice ships. It covers API GETs, page HTML, client bundles and public files.

## 11. Delivery slices

| Slice | Live by | Contents |
|---|---|---|
| S1 | 25 Oct (Panitia board and calendar editor may follow by 27 Oct) | banner, `/recruitment`, Daftar + uploads, seeded calendar |
| S2 | 9 Nov | Berkas review, Cutting board + lock, envelope reveal, QR attendance |
| S3 | 16 Nov | bank editor, snapshots, exam runner, Master console, Live Coding, scoring, rehearsal |
| S4 | 30 Nov | plotting + swaps, rubric engine, Wawancara |
| S5 | 12 Des | Tubes |
| S6 | 21 Des | Mengajar, Penerimaan, Jadikan Asisten |

## 12. TBD (the user will provide)
- Shinta's role and any extra role names.
- What Logistik and PDD need in the web, if anything beyond kit loans and read access.
- The Live Coding topic pool and its rubric rows.
- Rubric rows for Wawancara, Mengajar and Presentasi.
- Whether Berkas gets a numeric score.
- The Penerimaan date.
- Whether announcements need a copy-text export for the LINE OA.
