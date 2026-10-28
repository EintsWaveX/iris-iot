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
| B7 | Tes Tulis: Malam Ujian console, Bank Soal, check-in, runner | **Held** until the repatch design is agreed |

## Held: Tes Tulis repatch (user, 28 Oct 19:09)
Ruling (28 Oct 19:11): the Tes Tulis scheme stays as it is; only the IoT topics are dropped and Live Coding is C only. The lab PC is working fine (not down), so it can host the C judge.

Drop every IoT topic. Formal coding only. Live Coding is C only, written from scratch, LeetCode/Codeforces style, problems easy enough for weaker CaAs; the more problems solved, the higher the score. Open design questions are in the chat and get recorded here once answered.

Likely removals once agreed: protocol spin (BLE, HTTP/WebSocket, MQTT), ESP32 flashing, Web Serial and Bluetooth panels, the ws and mqtt gateways for the exam, the hotspot and device references, the IoT questions of the seed bank. The mockup screens `r3-putar`, `r3-lc`, `r3-soal`, `n7-malam` and `n7-bank` must be redrawn first (a new mockup version, then user sign-off).

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
| B3 CaAs page rebuilt (top envelope or next card, four tools, fogged journey) | next. The envelope hold already exists server side (`standing(..., {seen})`). Still to build: API-side fog of later stages in `calendar` and `envelopes` for a candidate, the new layout, phone 390 and the QR sign-in check | |
| B4 to B6 | not started | |
| B7 Tes Tulis repatch (IoT out, Live Coding in C) | held until the design is agreed | |

Known gaps: Ringkasan steps after First Meet are not date-aware (a step about an event that already ended still shows); `Daftar.tsx` (self sign-up, off while the Google Form is the way in) still uses the default document list and should go in the cleanup; the rig calendar has First Meet on 24 Oct, so rig screenshots show odd dates.
