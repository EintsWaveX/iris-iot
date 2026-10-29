# Oprec web rebuild: build plan (28 Oct 2026)

Source of truth for the design: `prompts/handoffs/mockup-final.md` and the published mockup (https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz, Version 20). Decisions: `prompts/mockup-next/DECISIONS-28OCT.md`.

## Scope given by the user (28 Oct 2026, 19:07)
- Build the real oprec web from the early stages **up to and including the Tes Tulis**. Wawancara, Tubes, Mengajar and Penerimaan wait.
- Rebuild the screens from the mockups. Reuse the backend (`api/`, `src/lib/recruitment`, the schema) where it fits; do not port old screens.
- Phone width is mandatory only for the CaAs side, above all signing in from a QR code. Asisten use laptops and PCs.
- Everything that can reasonably be edited is editable (mockup-final.md section 7), with a default, an audit note and a role limit.
- Tubes team scoring is on hold. The Pleno override reason is optional. The not-accepted CaAs sees the gentle wording at Mengajar and a plain "no" at Penerimaan.
- **Tes Tulis gets a large repatch** (see "Held: Tes Tulis repatch"): no IoT topics, formal coding only, Live Coding in C only. That part waits for design decisions.

## What exists (shipped 26 Oct, old look)
About 39k lines of UI in `src/components/recruitment`, 12k lines in `src/lib/recruitment`, one API router `api/recruitment/[aksi].ts`, migrations 0048 to 0053 (applied on prod; no exam has run on prod yet).

## Slices, in order. Each ends with check, lint, vitest, a rig run and screenshots at 1280x720, 1440x900, 1680x1050, 1280x600 (CaAs slices also 390x844).
| Slice | What | Notes |
|---|---|---|
| B0 | Kit pieces the mockup relies on: underlined area-colour tabs, focus-trapping dialog, STC chip, closed-edition lock, `rec_setting` (key, jsonb, updated_by, updated_at) plus an audit table, a role check helper | Migration 0055 (local rig only until the user says go) |
| B1 | Panel shell and Ringkasan, Kalender (editor, write-through), Papan Panitia | Reads existing events and committee |
| B2 | Kandidat: stage filter and column, Tambah CaAs for Ketua and Admin, Atur Berkas (editable document list and size limit) | |
| B3 | CaAs page: fogged journey filtered in the API, envelope hold (result only on opening), pre-journey states, Berkasku, Jadwalku | Phone 390 mandatory |
| B4 | Berkas review queue (side drawer), First Meet attendance, QR wall (stage aware), CaAs sign-in from QR (`hadir`) | Phone 390 mandatory for the CaAs scan |
| B5 | Pilih Jadwal (CaAs), Plotting (Slot, Permintaan, Papan) for the Tes Tulis evenings | Windows, capacities, cutoff editable |
| B6 | Cutting for Berkas and Tes Tulis, Ubah Teks Amplop, Atur Titik Awal, envelope reveal | |
| B7 | Tes Tulis: Malam Ujian console, Bank Soal, check-in, runner (C Live Coding, judge on the lab PC) | **In progress**: design agreed 29 Oct, B7.0 mockup redrawn and waiting for sign-off; no app code until then |

## Held: Tes Tulis repatch (user, 28 Oct 19:09)
Ruling (28 Oct 19:11): the Tes Tulis scheme stays as it is; only the IoT topics are dropped and Live Coding is C only. The lab PC is working fine (not down), so it can host the C judge.

Drop every IoT topic. Formal coding only. Live Coding is C only, written from scratch, LeetCode/Codeforces style, problems easy enough for weaker CaAs; the more problems solved, the higher the score. Open design questions are in the chat and get recorded here once answered.

Likely removals once agreed: protocol spin (BLE, HTTP/WebSocket, MQTT), ESP32 flashing, Web Serial and Bluetooth panels, the ws and mqtt gateways for the exam, the hotspot and device references, the IoT questions of the seed bank. The mockup screens `r3-putar`, `r3-lc`, `r3-soal`, `n7-malam` and `n7-bank` must be redrawn first (a new mockup version, then user sign-off).

## B7 design (agreed 29 Oct 2026)
Written part (logic, fill in, code tracing, all C, arrays the only data structure) plus Live Coding in C, both on the lab PC; the phone is only for sign-in. 15 + 15 + 15 + 60 minutes of a 120 minute budget, about 30 PCs, several nights with seats per room. Live Coding: pool of 8 C problems (4 easy, 4 medium), 5 drawn per CaAs (3 easy, 2 medium), stdin to stdout, hidden tests, partial credit per test, best submission per problem, no penalty, unlimited runs (a limit stays an optional setting). Score total stays 0 to 4000, weights editable by Akademik (default written 40, Live Coding 60). Written marking is automatic with Akademik override. Judge: extend the existing PC agent (`Downloads/IRIS ASO/pc/agent`, gcc under bubblewrap, same heartbeat and queue plumbing as `kompilasi.py`); old IoT tables stay dormant, new C tables only. Rule for every sign-in: an Asisten can sign a CaAs in by hand when the QR does not work (`handleHadirManual`, widen the role gate to the room's pengawas).

B7.0 (done 29 Oct): the five screens are redrawn in the mockup (`mockups/recruitment/app`, backup `mockups/recruitment-pre-b7`), checked with `docs/recruitment/prompts/mockup-next/tools/b7check.mjs` (25 screen states, 12 flows, no page errors, no IoT words), published as a new private artifact https://claude.ai/artifact/7tuDZpv2jNS99nnMSLyejo (the Version 20 artifact belongs to another account now). My own calls for the sign-off: the written section is C only (Python dropped), best submission per problem counts, the draw is 3 easy + 2 medium, the Akademik may change one problem's points with an optional reason, Perbaiki Tes rescoring after a problem was drawn.

**Sign-in rule (29 Oct 2026, decided by the user for simplicity):** every manual sign-in uses the one existing `handleHadirManual` (route `attend-manual`, optional reason, audit, undo). No second manual path is built for exam nights or the lab-PC check-in. B7.6 only widens who may call it (the room's pengawas, as well as the attendance right) and puts *Masukkan Manual* on the Malam Ujian seat drawer and the lab-PC check-in. Open point for B7.6: the handler is keyed on a recruitment event and refuses a day before the event starts, so confirm each exam night is an event (or give it one) before reusing it.

## Not in this build
Wawancara, Tubes, Mengajar, Penerimaan; the Latihan sandbox; Mandarin for the new strings (added last).

## Gates (unchanged)
Nothing is pushed or deployed without the user's go. Production migrations only after a `pg_dump` and the user's go. No credentials in code. Stage commits explicitly; keep `apps/web/src/lib/db.ts` and `apps/web/public/rig-test/` out.

## Progress (28 Oct 2026, branch `oprec-rebuild`, local only, nothing pushed)
| Slice | State | Commit |
|---|---|---|
| B0 editable settings (docs, envelope wording, Cutting start; roles, audit; no migration, uses `pengaturan`) | done, 9 tests, rig checked | f024ef55 |
| B1 Ringkasan (next step per division and stage from the calendar, funnel from real counts) | done, 9 tests, screenshots at 1280x720, 1440x900, 1680x1050, 1280x600 dark and light | 46987230 |
| B1 Kalender and Papan Panitia | exist and work in the old look; restyle pending | n/a |
| B2 Kandidat: stage column, filter and Cutting link; centered sheet; Tambah CaAs for the Ketua and Admin seats | done, rig checked (rec_b2.mjs) | 036d6cfe |
| B2 Atur Berkas (document list editable; server and every screen read it) | done, rig checked end to end (rec_b2b.mjs) | 6f08cae6 |
| B3 CaAs page rebuilt (top envelope or next card, four tools, fogged journey) | done, `9f21fee6`. Calendar fogged in the API (`lib/recruitment/fog.ts`, applies to visitors, Praktikan and CaAs; Panitia see all). Top card is the sealed envelope or Berikutnya; tools Jadwalku, Berkasku, Amplop, Mundur open centered dialogs (Berkasku was a side drawer); journey stars past the next stage are "???". Checked at 390, 1280x720, 1280x600 and the QR landing signed in and out (`rec_b3.mjs`). Not done: the QR sign-in return after signing in was only looked at, not driven end to end | `rec_b3.mjs` all ok |
| B4 Berkas queue, First Meet attendance, QR wall | done. The Berkas review queue stays a side drawer (allowed) and already reads the editable document list (B2b). Attendance (Hari Ini, Kehadiran) is now a centered dialog; the QR wall names the stage (`qr-events` sends `stage`). QR wall and attendance only cover First Meet and Tes Tulis here; the later stages come with their slices. Nilai Berkas kept as is (no decision to drop it). Checked with `rec_b4.mjs` | `rec_b4.mjs` all ok |
| B5 Pilih Jadwal and Plotting | done, no code needed beyond B3: the candidate picks through Jadwalku (a nudge on the page, the tool badge, centered dialogs, checked at 390), Plotting already has Slot, Permintaan and Papan with the stage switch and editable rooms, capacities and window, checked at 1280x720 and 1280x600 (`rec_b5.mjs`). The older `rec_s2_flows.mjs` was updated for the new dialogs and the six-document list; its sections 2 (tally) and 4 (QR wall under that run's state) still fail and need a look when B6 reworks Cutting. The stage label "Tes Tulis dan Program" stays: the scheme is kept and the Program part is the C Live Coding. | `rec_b5.mjs` all ok |
| B6 Cutting edit surfaces and envelope wording | done. Atur Titik Awal (Top N, minimum score, deck target range for Berkas and Tes Tulis) seeds the Cutting sliders and the deck target on the server; Ubah Teks Amplop (heading and the passed and not passed lines, per envelope, both languages, preview, reset) is read by the reveal through the candidate's `me` answer. Both Ketua and Akademik only, audited. The `words` and `cutting` shapes from B0 were reshaped (`minScore`, `targetMin`, `targetMax`; per-outcome wording). Fixed a B3 bug: the reveal opened under the Amplop dialog. Penerimaan wording and the later Cutting stages come later. Checked with `rec_b6.mjs` and `rec_b3.mjs` | `rec_b6.mjs` all ok |
| B6b cleanup of the "not built yet" list | done. Ringkasan steps are date-aware after First Meet and after the exam nights (`over`), Kalender (teal) and Papan Panitia (pink) take the page's area colour, the Kalender card lost its duplicate title, Papan's pool and columns are tighter, `Daftar.tsx` is deleted (a signed-in CaAs not yet added reads "the Panitia add applicants"), Atur Titik Awal covers Berkas, Tes Tulis, Tubes and Mengajar (the hard-coded deck targets are gone), Ubah Teks Amplop has a Penerimaan tab. The two failing `rec_s2_flows.mjs` sections were not app bugs: the rig's live relay on :8788 was not running. With it up the whole script passes (42 of 42). Server `apply` route left in place | `rec_b8.mjs` and `rec_s2_flows.mjs` all ok |
| B7 | held for the Tes Tulis repatch design | |
| B7 Tes Tulis repatch (IoT out, Live Coding in C) | held until the design is agreed | |

Known gaps: Ringkasan steps after First Meet are not date-aware (a step about an event that already ended still shows); `Daftar.tsx` (self sign-up, off while the Google Form is the way in) still uses the default document list and should go in the cleanup; the rig calendar has First Meet on 24 Oct, so rig screenshots show odd dates.
