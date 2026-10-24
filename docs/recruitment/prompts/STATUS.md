# Recruitment sessions: status board

Each session updates only its own row: `ready` / `running (<date time WIB>, <session>)` / `done (<commits>)` / `done (signed off <date>)` / `blocked (<reason>)`.
A row is `ready` when every prompt in **Needs** is done. Mockups (01, 05, 08c, 15a, 16a, 17a) count as done only once they are signed off by the user.

| # | Prompt | Model / effort | Needs | Due | Status |
|---|---|---|---|---|---|
| 01 | S1 mockup | Opus high | none | 23 Oct | done (signed off 2026-10-23 11:30, v2 https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz) |
| 02 | Foundation | Sonnet high | none | 24 Oct | done (1b6ab91, not pushed; handoffs/02.md) |
| 03 | S1 build | Sonnet high | 01 signed off, 02 | 25 Oct (editor and board by 27 Oct) | done (7daf998, not pushed; handoffs/03.md) |
| 04 | S1 review + ship | Opus high | 03 | 25 Oct | done (live 2026-10-23 16:47 WIB, main c251ddc: 1451573, 5bd3413, f12f3df, e3c7f92, 6973763; 0048 on prod; relay deployed; handoffs/04.md) |
| W1 | Wave 1 ship, prod test application, review of 08 and 08c, then reviewer for what follows | Opus high | 04 | deploy 24 Oct 18:00 | running (2026-10-24 11:50 WIB, iris-aso-28) |
| 05 | S2 mockup | Opus high | 01 signed off | 30 Oct | done (signed off 2026-10-24 04:08, v4 https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz; handoffs/05.md) |
| 06 | S2 build | Sonnet high | 04, 05 signed off | 8 Nov | ready (wave 2) |
| 07 | S2 review + ship | Opus high | 06 | 9 Nov | blocked (06) |
| 08 | Exam engine design + pure modules | Opus max | 02 | 1 Nov | done (EXAM-ENGINE.md reviewed with the user 2026-10-24; eb3078f, not pushed; handoffs/08.md; Part C moved to 08c) |
| 08c | S3 mockup | Opus high | 08 | 26 Oct | ready (wave 2) |
| 09 | Bank + references | Sonnet high | 08, 08c signed off | 10 Nov | blocked (08c) |
| 10 | Exam runner | Sonnet high | 08, 08c signed off | 10 Nov | blocked (08c) |
| 11 | Master console + relay room | Sonnet high | 08, 08c signed off | 10 Nov | blocked (08c) |
| 12 | Live Coding | Sonnet high | 08, 08c signed off, 11 | 13 Nov | blocked (08c, 11) |
| 13 | Scoring + results | Sonnet medium | 10, 06 | 13 Nov | blocked (10, 06) |
| 14 | S3 rehearsal + ship | Opus high | 09, 10, 11, 12, 13 | 16 Nov | blocked |
| 15 | S4 plotting + Wawancara (a/b/c) | Opus / Sonnet / Opus high | 07 | 30 Nov | blocked (07) |
| 16 | S5 Tubes (a/b/c) | Opus / Sonnet / Opus high | 15 | 12 Des | blocked (15) |
| 17 | S6 Mengajar + Penerimaan (a/b/c) | Opus / Sonnet / Opus high | 15, 16 | 21 Des | blocked (15, 16) |

## User rulings log
Add one line per ruling given during any session (date, prompt, ruling). Copy lasting ones into the memory file `iris-recruitment-oprec-2026.md`.

- 2026-10-23 · planning · All decisions in PRD.md and ARCHITECTURE.md agreed.
- 2026-10-23 · 01 · Agung 1 is GMW (Acara) and Agung 2 is OCU (Logistik); Shinta (XIN) is Wakil Ketua; cuti Asisten are not special-cased for Panitia seats (MCU stays seated); every Pengumuman defaults to 12:00 WIB and the time stays adjustable at any time; document templates source not given yet.
- 2026-10-23 · 01 · While the recruitment window is open, recruitment pages use their own navbar and no practicum navbar (no Konsol, Persiapan, Penilaian, LMS, Jadwal, Lab); the practicum keeps its own navbar with no recruitment entry. Account menu in the recruitment shell has "Buka IRIS Praktikum"; the Home banner is the door in.
- 2026-10-23 · 04 · Before registration opens nothing shows outside the Panitia: the edition is live at deploy so the Panitia can prepare, but the visitor's Home banner waits for the daftar gate.
- 2026-10-23 · after 04 · Deploy once, only after all three wave 1 sessions (this one with the back button e2bfedf, 05, 08) have finished their work; no deploy in between.
- 2026-10-23 · W1 · Candidates choose their own shift (Tes Tulis evening, Wawancara, Mengajar slots) in the oprec web. Any change after picking is a request a Panitia Asisten with the Plotting right confirms, all inside IRIS. Panitia keep full control (window, capacity, moving anyone, over capacity), and the same rule holds for every stage with slots. The engine moves from S4 into S2 (05/06/07) because Pilih Jadwal Tes Tulis opens 11 Nov; Auto Isi only places those who did not pick. Defaults chosen by Opus: first come first served, one open request at a time, cutoff H-1, windows 11 to 14 Nov, 27 to 29 Nov, 20 to 21 Des.
- 2026-10-24 · 05 · S2 mockup signed off (v4). Tampilan gets Suara (Nyala by default) and the reveal's speaker button writes it; the chime plays only from the candidate's own gesture. Pilih Jadwal opens at 19.00 on the Pengumuman day (11 Nov, 27 Nov, 20 Des), not 12.00, so opening the envelope late never costs a seat (PRD 3 and 6 updated). The reveal keeps the lighter Low Detail version (LDM is the site default). Confirmed: first come first served, one open change request at a time, cutoff H-1 23:59, a requested seat is not held while waiting. Particles: canvas-confetti + GSAP.
- 2026-10-23 · 01 · Papan Panitia read-only view fills the width (the empty list column bug is fixed). Mockup v2 signed off; 03 starts.
- 2026-10-24 · 08 · Live Coding protocol spin has 3 outcomes: BLE, HTTP/WebSocket (the candidate uses either), MQTT.
- 2026-10-24 · 08 · Live Coding's other ends are reached over the Internet through irisiotlab.com; ESP32s only need Wi-Fi with Internet. WS and HTTP at the ws.irisiotlab.com gateway (plain, port 80). MQTT at `mqtt.irisiotlab.com`, a twin of the WS gateway (Worker + the PC bridge dialing out) carrying MQTT over WebSocket to the lab Mosquitto; raw TCP 1883 would need a public TCP host. BLE is a Web Bluetooth panel in the page.
- 2026-10-24 · 08 · Live Coding graders: that evening's plotted pengawas plus Akademik and the Ketua; each seat needs two sheets from two different people; graders pick seats from the list.
- 2026-10-24 · 08 · Live Coding lockdown: fullscreen and strikes stay on; paste works only for text copied inside the page; the Web Serial and Bluetooth device pickers do not count as leaving.
- 2026-10-24 · 08 · Checkbox and click-the-buggy-lines: the number of right picks is hidden; click-lines always lets the candidate pick several lines (the PRD formula gives a one-bug question 0 or 1).
- 2026-10-24 · 08 · Order the lines: order only, lines keep their indentation, no distractor lines.
- 2026-10-24 · 08 · Once a question has been shown to anyone: its text and answer key may change (a key fix rescores everyone, with a note), its structure (options, lines, blanks, slots, pairs) is locked, and a broken question is voided for everyone. New questions may still join the pool between evenings.
- 2026-10-24 · 08 · Finalkan and its unfreeze: the Ketua or anyone in Akademik (the bank right); no Koordinator exception (PRD 2).
- 2026-10-24 · 08 · Live Coding kit: each seat has one or two boards, ESP32 DevKit V1 and ESP32-S3 in any mix (two DevKits, two S3s, or one of each). The sensors and actuators per kit still come from Logistik.
- 2026-10-24 · 08 · Live Coding boards join phone hotspots brought into each room (mobile data), not the building Wi-Fi. Opus added: about one hotspot per 8 boards (phones take about 10 devices), 2.4 GHz and WPA2 on the phone, BLE boards need none (EXAM-ENGINE 9.6a).
- 2026-10-24 · 08 · Everything I wrote ships as the default and stays editable in the web: the seed bank (enough to start a room), the six topics, the templates, the rubric rows, the parts config. The `sample` flag is only a "Bawaan" badge; real rooms draw seeds too.
- 2026-10-24 · 08 · Cloudflare agreed; the exam's MQTT rides broker.irisiotlab.com (Module 3's host) instead of a new mqtt.irisiotlab.com. EXAM-ENGINE.md reviewed; Part B and the S3 mockup go ahead.
- 2026-10-24 · 08 · Back to separate prompt sessions, no subagents (`_RULES.md` rule 6 stands). 08's Part C becomes its own prompt, 08c (Opus high). Wave 2 = W1, 08c and 06 (`WAVE2.md`).
