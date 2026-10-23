# Recruitment sessions: status board

Each session updates only its own row: `ready` / `running (<date time WIB>, <session>)` / `done (<commits>)` / `done (signed off <date>)` / `blocked (<reason>)`.
A row is `ready` when every prompt in **Needs** is done. Mockups (01, 05, 08, 15a, 16a, 17a) count as done only once they are signed off by the user.

| # | Prompt | Model / effort | Needs | Due | Status |
|---|---|---|---|---|---|
| 01 | S1 mockup | Opus high | none | 23 Oct | done (signed off 2026-10-23 11:30, v2 https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz) |
| 02 | Foundation | Sonnet high | none | 24 Oct | done (1b6ab91, not pushed; handoffs/02.md) |
| 03 | S1 build | Sonnet high | 01 signed off, 02 | 25 Oct (editor and board by 27 Oct) | done (7daf998, not pushed; handoffs/03.md) |
| 04 | S1 review + ship | Opus high | 03 | 25 Oct | running (2026-10-23 15:05 WIB, iris-aso-24): review done (1451573, 5bd3413, f12f3df, not pushed), awaiting the user's go to ship |
| 05 | S2 mockup | Opus high | 01 signed off | 30 Oct | blocked (01) |
| 06 | S2 build | Sonnet high | 04, 05 signed off | 8 Nov | blocked (04, 05) |
| 07 | S2 review + ship | Opus high | 06 | 9 Nov | blocked (06) |
| 08 | Exam engine design + S3 mockup | Opus max | 02 | 1 Nov | blocked (02) |
| 09 | Bank + references | Sonnet high | 08 | 10 Nov | blocked (08) |
| 10 | Exam runner | Sonnet high | 08 | 10 Nov | blocked (08) |
| 11 | Master console + relay room | Sonnet high | 08 | 10 Nov | blocked (08) |
| 12 | Live Coding | Sonnet high | 08, 11 | 13 Nov | blocked (08, 11) |
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
- 2026-10-23 · 01 · Papan Panitia read-only view fills the width (the empty list column bug is fixed). Mockup v2 signed off; 03 starts.
