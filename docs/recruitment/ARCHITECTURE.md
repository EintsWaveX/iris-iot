# IRIS Open Recruitment: Architecture

Status: 2026-10-23, written from the codebase as of `c5cfded` (branch `phase9-global-and-asisten`).
Product rules live in `PRD.md`; the exam engine detail lives in `EXAM-ENGINE.md` (prompt 08 writes it).
This file fixes the shape everything else builds on. Change it only through a prompt that says so, and note the change in its handoff.

## 1. Placement

| Layer | Where | Notes |
|---|---|---|
| Pages | `apps/web/src/pages/recruitment/` (`index.astro`, `panel.astro`, `test.astro`, `qr.astro`) + `en/`, `zh/` twins like the other pages | English routes, Indonesian copy. React islands only, no vanilla inline scripts. |
| Views | `apps/web/src/components/recruitment/` (one subfolder per area: `home-banner/`, `candidate/`, `panel/`, `calendar/`, `exam/`, `livecode/`, `reveal/`) | Strings in a `recruitmentStrings.ts` per area, in id/en/zh like `profilStrings.ts`. |
| Shared pure logic | `apps/web/src/lib/recruitment/` (`calendar.ts`, `gates.ts`, `scoring.ts`, `draw.ts`, `formats.ts`, `rights.ts`) | Browser safe, unit tested in `src/lib/__tests__/`. |
| API | `apps/web/api/recruitment/[aksi].ts` + helpers in `apps/web/api/_lib/recruitment-*.ts` | The same `aksi` dispatch as `api/tp/[aksi].ts`, wrapped in `denganSiaran`. |
| Schema | `apps/web/src/lib/schema.ts` (new section) + `apps/web/drizzle/0048_recruitment.sql`, with later slices adding 0049+ | Prod migrations are run by hand after a `pg_dump` (see `apps/web/MIGRATIONS.md`). |
| Relay | `apps/relay/src/` adds an exam room type | Next to Konsol and siaran. |
| PC agent | `Downloads/IRIS ASO/orangepi/agent/` adds a `compile` job kind | Follows the SeeLabs robot job pattern. |

**Naming:** tables and columns in English with a `rec_` prefix. TypeScript identifiers follow the surrounding file's style.

## 2. Data model (all rows carry `edition_id`)

```
rec_edition        id, year, title, status(draft|live|closed), created_by, created_at
rec_committee      edition_id, asisten_id, division(ketua|wakil|acara|akademik|logistik|admin|pdd),
                   is_koor, title (free text, e.g. "Sekretaris"), seated_by, seated_at
rec_event          id, edition_id, kind, title, starts_on, ends_on (WIB dates, inclusive),
                   day_start, day_end (WIB HH:MM, nullable), place, internal, gates (stage key|null),
                   color, sort, updated_by, updated_at
rec_event_log      event_id, who, before JSON, after JSON, at          (edits after a stage started)
rec_candidate      id, edition_id, nim, anggota_id (nullable), biodata JSON, status
                   (applied|revision|approved|withdrawn|out|accepted), current_stage, applied_at
rec_document       candidate_id, kind(cv|letter|vision|biodata|other), r2_key, size, uploaded_at, note
rec_stage_result   candidate_id, stage, proposal(lolos|gagal|null), proposed_by, note,
                   locked(bool), locked_by, locked_at, reveal_at, opened_at
rec_attendance     candidate_id, event_id, at, via(qr|manual), by
rec_slot           id, edition_id, stage, event_id, room, starts_at, ends_at, capacity
rec_slot_examiner  slot_id, asisten_id, role(master_pool|pengawas|examiner)
rec_slot_assignment slot_id, candidate_id, swap_request JSON
rec_rubric         id, edition_id, stage, rows JSON [{key,label,max,weight}]
rec_rubric_score   rubric_id, candidate_id, examiner_id, values JSON, note, at
rec_question       id, edition_id, part(logika|fitb|kodingan|mikro), lang(cpp|py|any),
                   format, body JSON, answer JSON, refs int[], status(draft|ready), version
rec_reference      id, edition_id, url, title, r2_key (sanitized html), fetched_at
rec_exam_room      id, edition_id, slot_id, master_id, state JSON (part, phase, timers), updated_at
rec_exam_seat      room_id, candidate_id, draw JSON, extra_ms, strikes JSON, connected_at
rec_answer         seat_id, question_id, value JSON, credit, final(bool), at
rec_livecode       seat_id, topic, protocol, spins JSON, code text, runs JSON (compile/flash), traffic_key
rec_tubes_topic    id, edition_id, title, brief
rec_tubes_checkin  candidate_id, event_id, note, photo_key, at
rec_submission     candidate_id, stage, kind, r2_key|url, at
```

**Identity:** a candidate is keyed by **NIM**. `anggota_id` links to this semester's roster for reading only, so roster rebuilds never orphan a candidacy.

## 3. Rights

- `apps/web/src/lib/recruitment/rights.ts` (pure) computes a recruitment rights map from the person (`Orang` from `src/lib/hak.ts`) and their `rec_committee` rows for the live edition. The table is in PRD section 4.
- `hakPenuh(o)` holders get everything. The Pencipta is excluded from being Master (but not from anything else).
- The API checks the map in `api/_lib/recruitment-rights.ts`. Pages only hide what the API already refuses.
- **Candidates:** every candidate read is filtered to `nim = session nim`. No endpoint returns another candidate's row to a Praktikan session.

## 4. Gates (calendar drives the flow)

- `src/lib/recruitment/gates.ts` exports `gateOpen(events, stageKey, nowWib)`, along with `phaseOf(stage)` (before, open, review, cutting, announced) and `nextPublicEvent(events, candidate)`.
- Every write that depends on a window (Daftar, uploads, swaps, check-ins, submissions, reveal) calls the same function on the server. The client uses it for display only.
- **Reveal:** a stage result is visible to its candidate only when `locked` and `now ≥ reveal_at`, where `reveal_at` = the start of that stage's Pengumuman event, copied at lock time.

## 5. Live updates

- New topics go in `src/lib/siaran-topik.ts`: `rec-edition`, `rec-calendar`, `rec-candidates`, `rec-cutting`, `rec-plotting`, `rec-bank`, `rec-room:<id>`.
- Pages subscribe like the rest of the site (`src/lib/siaran.ts`). A message carries topic names only, never data.

## 6. Files (R2)

- Reuse the TP pattern: `src/lib/tp-r2.ts` (WebCrypto ticket signing, shared with the relay) and `api/_lib/tp-unggah.ts`.
- New key prefix `recruitment/<edition>/<nim>/<kind>/<uuid>.<ext>`. The browser PUTs straight to the relay with a signed ticket.
- Reads go through a 10-minute link after the API's own rights check.
- **Limits:** PDF up to 5 MB for documents; zip up to 25 MB and mp4 up to 100 MB for Tubes (to confirm against relay limits).

## 7. Exam room (S3; full protocol in EXAM-ENGINE.md)

- **Room state** is authoritative in Postgres (`rec_exam_room.state`). Every Master action is an API write that updates the state and broadcasts on the relay room `rec-room:<id>`. Seats compute their remaining time from the server clock offset (the same approach as the session timers in `src/lib/sesi-waktu.ts`).
- **Seats** send heartbeats and strike events to the API: the relay carries the fan-out, the API is the source of truth.
- **Answers** autosave per change (debounced) and finalize when a part ends.
- **Draw** is done server side at part start and stored in `rec_exam_seat.draw`.
- **Scoring** (`src/lib/recruitment/scoring.ts`) is a pure function over (questions, answers, draws). It is computed on read for provisional views and frozen into a snapshot when the Ketua or Akademik presses Finalkan after the Susulan room closes.

## 8. Live Coding (S3)

- **Editor:** CodeMirror 6 (new dependency), with templates per protocol.
- **Compile:** a new PC agent job kind `compile`:
  1. The API queues `{sketch, fqbn: esp32:esp32:esp32, libs}`.
  2. The agent runs arduino-cli in a temp dir with a time limit.
  3. It uploads the merged `.bin` and the log, then reports the result.
  - The pattern is the existing job queue (protocol version bump, `Worker.urgent()` treats compile as urgent).
  - Python tests sit beside `orangepi/agent/tests`.
- **Flash:** esptool-js (new dependency) in the browser over Web Serial. The serial monitor reuses `components/live/useSerialBoard.ts` and `src/lib/serial-lines.ts`.
- **The other end:**

| Protocol | Provided by IRIS |
|---|---|
| MQTT | The lab Mosquitto, with a per-seat topic prefix and per-seat credentials generated for the evening (never stored in code). |
| WebSocket | A relay room per seat. |
| HTTP | `api/recruitment/collect/<seat-token>`, which echoes and records. |
| BLE | A Web Bluetooth central panel in the page. |

- Every message is logged into `rec_livecode.traffic`.

## 9. Reference snapshots (S3)

- An API action fetches the URL server side and sanitizes it:
  - drop script, iframe, form, object and embed
  - strip `on*` attributes
  - rewrite every `a[href]` that leaves the page into inert text
  - keep `#anchors`
  - inline CSS where small
  - proxy images through R2
- The result is stored in R2. It is served from the IRIS origin inside a sandboxed iframe (`sandbox` without allow-scripts or allow-top-navigation) with a strict CSP.

## 10. Reused UI

- **Kit** (`src/components/ui/`): Dialog, Drawer, Popover, HoverCard, DateRangePicker, SegmentedControl, HoldButton, Confirm, DragLayer, ResizablePanes, ScrollArea, Dropdown, Controls (Checkbox, switches, wheel TimeField), PersonBadges, Pill, KodeTeks.
- **Code and blanks:** `src/lib/highlight.ts`, `src/lib/blanks.ts`.
- **Calendar:** the TP month grid model in `src/lib/tp-kalender.ts` and its view under `components/tp/`, extended with spanning bars.
- **Drag and drop:** `@dnd-kit/*` (already a dependency) for the Panitia board, plotting and order-the-lines.
- **Motion:** GSAP 3.15 (already a dependency). Confetti is GSAP particles or `canvas-confetti` (decided in prompt 05). Every animation honours Low Detail and reduced motion.
- **Promotion:** Jadikan Asisten reuses person creation in `api/_lib/tim.ts`.

## 11. Testing and rig

- **Unit:** vitest for `src/lib/recruitment/*` (gates, scoring, draw, formats credit) and API handlers (rights and leak cases). Run with `--maxWorkers=2`.
- **Agent:** pytest for the compile job.
- **Rig:** Postgres `iris_e2e` on :54329, rig API :8790, Astro :4321 (`astro.real.config.mjs`), relay `wrangler dev --port 8788`. Playwright through DMagis's playwright-core.
- **New rig scripts** go in `Downloads/design-review/rig/rec_*.mjs`: flows per role, the 7-width screenshots, a leak probe for candidates, and the exam dry run with simulated seats.
- **Before deploy:** `rig/pop2.mjs`, `rig/pop4.mjs`, `leak_api.mjs`, `leak_pages.mjs`, `idor_probe.mjs`, an astro build plus a bundle scan for roster NIMs, keys and secrets (`scan_bundle.py` from the 10-15 audit is gone; recreate it as `rig/rec_scan_bundle.py`), and `scripts/check_secrets.py` (with `PYTHONUTF8=1`).
