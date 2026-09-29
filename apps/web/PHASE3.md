# IRIS IoT practicum site — Phase 3: handoff

Tracks what is actually **built and verified** vs. **left to do** for Phase 3
(live sessions, master roster, journal slim-down), so a session can pick this
up without reloading the full plan into context. The approved plan — full
rationale, schema, failure-mode analysis — was meant to live at
`~/.claude/plans/rebuild-iris-aso-practicum-reflective-simon.md`, but that
same filename got reused and overwritten by the later Phase 4 (monorepo
move + cosmic redesign) planning pass, so the granular Strand C rationale
(Firebase rules, the RTDB schema, the auth-bridge token flow, the Pi
heartbeat protocol change) no longer exists anywhere — confirmed by
grepping every saved plan file on 2026-09-22. Steps 5-9 need that replanned
on Opus before Sonnet executes them; this file's condensed strand
description above is all that survived, and is not enough to build from.

Planning (Opus) is done and approved. Execution (Sonnet) is underway: Strand
A (journal slim-down, code slim-down, and the A4 defect pass), the full CI
gate (step 2), Strand B's schema + backfill + read-path switch (step 3), and
step 4's roster-paste/session-lifecycle rewire are done and verified as of
2026-09-22, steps 3 and 4 both against a real (throwaway local) Postgres
instance, not just typecheck/tests — see the verification notes under each
step below for exactly what was and wasn't exercised. Steps 5 onward (all of
Strand C, plus B's remaining Pi-sync and contract-migration steps) are still
ahead and blocked on the replan above.

---

## The three strands (settled — do not re-litigate)

- **A — Journal & code slim-down.** No database, no deployment. Ships and is
  provable on its own. Target: 7–8 PDF pages → 4–5; code files well under
  ~150 lines. Biggest levers: cut `around: 4→2` in `code-file`, delete the
  ~90%-blank "Saran dan Masukan" page, compress the cover off its own page.
  Answer widgets are replaced by one `#jawab()` helper, not deleted — it's
  the single source both the PDF and the web form render from.
- **B — Master roster.** One roster for the whole practicum, entered once,
  editable. `unique(anggota.nim)` replaces `unique(tanggal, nim)`, which is
  what makes "one roster, four modules" possible at all. Also fixes:
  `regu.aktif` gets a real writer, a real end-session path is added, and the
  Pi's separate `modul4/jadwal.json` roster rides the agent's existing
  heartbeat instead of being entered twice.
- **C — Live practicum session.** Neon stays the record; Firebase RTDB is a
  disposable live buffer, deleted at session end, so the two can't silently
  diverge forever. Students write straight to RTDB (zero Vercel cost per
  keystroke) via Firebase Auth custom tokens; a 10s checkpoint persists to
  Neon. Reuses `games/src/store.js`'s EventSource+reconcile+watchdog pattern
  verbatim rather than reinventing it.

Frontend moves to **Astro + React islands** (`@astrojs/react`), page by page,
starting with `dashboard.astro` — not a full Next.js rewrite. This also
retires the CSP inline-script-hash bug class for every page converted, since
React bundles to external `_astro/*.js`.

---

## Phase count — 9 steps across the 3 strands, 2 in progress

The plan's own step-by-step is the phase list. Strand A can ship independently
of B/C, which is why it's first.

| #   | Step                                                                                | Strand | Status                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Journal + code slim-down (A1–A4)                                                    | A      | ✅ Done — A1/A2/A3 fully done; A4's Module 1 stragglers resolved or judged not actionable (see below)                                                                                                                                                                                                                             |
| 2   | CI gate: compile all 8 journals + every sketch, assert page counts and blank counts | —      | ✅ Done — `journals` CI job runs both `check_journal_pages.py` and `check_sketches.py`; both confirmed green locally                                                                                                                                                                                                              |
| 3   | Schema + backfill + read-path switch (migrations 0002–0003)                         | B      | ✅ Done — verified against a real (throwaway local) Postgres, not just typecheck (see note below)                                                                                                                                                                                                                                 |
| 4   | Roster UI + start/end session (still on existing Astro page)                        | B      | ✅ Done — see "step 4" below                                                                                                                                                                                                                                                                                                      |
| 5   | Pi roster sync via agent heartbeat (B3)                                             | B      | ☐ Blocked — needs replanning (see header note)                                                                                                                                                                                                                                                                                    |
| 6   | React islands migration of the dashboard                                            | —      | ✅ Discharged by Phase 4 Stage 4 (Toast/Tabs/Modal converted; the rest of the CSP-hash motivation for this step no longer applies -- see step 4's note below)                                                                                                                                                                     |
| 7   | Firebase rules + auth bridge + live session (answers last)                          | C      | 🗑️ Retired — Strand C's whole Firebase RTDB approach was dropped (see the plan's own decision table); live data instead reaches the web via Stage 20's Pi-agent heartbeat writing straight to Neon (`telemetri_terkini`/`telemetri_log`), with groupmates' editors polling the existing draft endpoint instead of writing to RTDB |
| 8   | History view (Neon query once step 7 exists)                                        | C      | ✅ Done, by a different route — built as Phase 6 Stage P6.8's `/reports` page (session list, per-session report, module overview, audit viewer, CSV export), reading straight from Neon's `telemetri_log`/`percobaan_masuk` rather than depending on step 7's now-retired RTDB                                                    |
| 9   | Contract migration (0004): archive old tables, drop fallback                        | B      | ☐ Not started                                                                                                                                                                                                                                                                                                                     |

**Done so far, concretely:**

- `template/template.typ`: `#jawab(kode:, jenis:, lang:)` helper (prints a
  one-line pointer for "gambar"/"teks", nothing reserved on paper anymore);
  `schematic-figure()` hoists the duplicated ready/not-ready guard, defaulting
  `ready: true` since all 4 schematics are actually on disk (was the
  `schematic-ready = false` bug in all 8 journals); `journal-cover()`
  compressed from a full dedicated page into a page-1 header block;
  `code-file`'s default `around: 4 → 2`.
- All 8 `jurnal/{id,en}/*.typ`: dropped the forced cover pagebreak, replaced
  the 8cm drawing box and the free-text analysis answer with `#jawab()`
  calls, deleted the "Saran dan Masukan"/"Suggestions and Feedback" page
  (footer now sits inline via `v(1fr)`), tightened the longest `_Catatan_`/
  `_Note_` prose blocks. Verified: **all 8 compile clean at 4–5 pages**
  (baseline was 7–8), via `python scripts/check_journal_pages.py`.
- `.github/workflows/ci.yml`: new `journals` job, added to `deploy`'s `needs`.
- **A3, group identity:** Module 1's central/peripheral (id/en, `kode_praktikum`
  - `kunci_jawaban`, 8 files) collapsed the 28-line commented `#define` block
    of 8 UUID pairs into one `const int GROUP_ID` plus two `String` UUIDs
    derived from it (`BLEUUID`'s constructor accepts `String` directly, verified
    both by reading the installed ESP32 core's header and by a clean
    arduino-cli compile). The now-redundant 8-row UUID lookup table was deleted
    from `ID_Modul 1.typ`/`EN_Module 1.typ` (M1 dropped to **4 pages**), and the
    checklist/instruction text updated to say "change `GROUP_ID`" instead of
    "uncomment your pair."
- **A3, docblock trims:** every `kode_praktikum`/`kunci_jawaban` file for
  modules 1–3 (24 files) had its header cut from ~9–13 lines to 3–5, dropping
  the `Board:`/`Library:` lines (redundant with the `#include`s right below)
  and, in `modul2_websocket_server.py`, the venv/pip-install block that's
  already printed in the journal. `scripts/gen_modul4.py`'s 4 hunter/beacon
  templates got the same trim (11 → 7 lines) with the `HEADER_STUDENT`/
  `HEADER_KEY` answer-key relabel anchor text left untouched on purpose, then
  regenerated via `python scripts/gen_modul4.py` (56 files, generator's own
  audit() passed).
- **A3, shared clock-plumbing header:** confirmed how the flat
  central/peripheral (and publish/subscribe) pairs are actually handed to
  students — the journal itself says the lab assistant pre-sets-up the
  IDE/Thonny environment per group, and students only retype filled blanks
  into it (`ID_Modul 1.typ`/`ID_Modul 3.typ`, "ketiklah kembali..."); the
  existing convention for two programs sharing one folder is to comment out
  or `#if 0` whichever side isn't being flashed. That means a header living
  beside them causes no new conflict. `syncTimeFromSerial()`/
  `formatTimestamp()` (Module 1) moved out of `modul1_ble_central.ino` and
  `modul1_ble_peripheral.ino` into one `iris_waktu.h`, and
  `sync_time_reference()`/`timestamp()` (Module 3) moved out of
  `modul3_mqtt_publish.py`/`modul3_mqtt_subscribe.py` into one
  `iris_waktu.py`, both in `kode_praktikum/{id,en}/` and
  `kunci_jawaban/{id,en}/` (4 new files each; no blanks live in the moved
  code, so nothing graded shifted). `scripts/check_sketches.py` was updated
  to stage any sibling `.h` alongside a compiled `.ino`. **Confirmed clean**:
  10 sketches + 16 Python files (12 originals + the 4 new `iris_waktu.py`),
  all `ok`.

- **A4, the four Module 1 stragglers:**
  - _`BOARD_ESP32S3` leaking into the pin table:_ fixed. `ID_Modul 1.typ`'s
    pin table showed `GPIO34 \/ GPIO4` in one cell; `EN_Module 1.typ` already
    showed the clean `GPIO34` alone, relying on the Catatan/Note below for
    the S3 alternative (an ID/EN drift, not a template defect). ID brought in
    line with the existing EN convention.
  - _A per-group table straddling a page break:_ already resolved as a side
    effect of A3 — the only per-group table Module 1 had was the 8-row UUID
    lookup, deleted when `GROUP_ID` collapsed it to one derived value.
  - _The two longest listings:_ already resolved as a side effect of A1
    (`around: 4→2`) and A3 (GROUP_ID collapse, docblock trim, clock-header
    extraction cut `modul1_ble_central.ino` and `modul1_ble_peripheral.ino`
    by roughly 90 and 70 lines respectively). `modul1_ble_central.ino` (228
    lines) is still the single longest file in the project, but the printed
    excerpt is windowed around blanks (`around: 2`), not the full file, and
    the 8-journal page-count gate is green — the remaining length is real
    BLE central-role plumbing (scan/connect/notify callbacks with their error
    branches), not padding, so cutting it further would remove content
    students need to read, not boilerplate.
  - _Serial-clock-vs-NTP inconsistency:_ judged not actionable. Modules 2–4's
    boards join Wi-Fi anyway, so NTP is free; Module 1's central/peripheral
    are BLE-only and have no Wi-Fi credentials or connection code at all.
    Adding Wi-Fi there just to reach NTP would add real setup burden (SSID/
    password entry on two more boards) to remove a `send_time.ps1` step that
    already works and is already explained in the journal's Catatan with the
    same mechanism-then-validity-then-fallback structure Modules 2–4 use.
    That trade runs against Phase 3's own simplification goal, so the
    Serial-based sync stays as designed.

- **B, step 3 — schema + backfill + read-path switch:**
  - `src/lib/schema.ts`: added `kelompok` (nomor UNIQUE, nama, aktif),
    `anggota` (kelompokId → kelompok, nim UNIQUE — replaces Phase 1's
    `unique(tanggal, nim)` on `praktikan`), `sesi_kelompok` (sparse
    per-session override: absent row = active, UNIQUE(sesiId, kelompokId)),
    `jawaban` (sesiId + kelompokId + soalKode UNIQUE, `versi` for stale-write
    detection). `sesi` gained `mulaiPada`/`selesaiPada`/`durasiDetik` and a
    `"batal"` status; `sesi_slot_unik` changed from a plain UNIQUE to a
    **partial** unique index (`WHERE status <> 'batal'`) so a cancelled
    session's slot can be reused — generated via `npm run db:generate` as
    `drizzle/0002_roster_kelompok_anggota.sql`, hand-reviewed (drop-old/
    create-new happen in one migration transaction, so there's no window
    where a duplicate slot could sneak in).
  - `scripts/backfill-roster.ts`: reads every session's `regu`/`praktikan`
    oldest-first, refuses (prints every conflict, exits non-zero) if a NIM
    was ever recorded under two different group numbers on two different
    days rather than guessing, otherwise seeds `kelompok`/`anggota` from the
    single newest session that has a roster. Dry-run by default; `--apply`
    to write. Idempotent (`onConflictDoUpdate` on `kelompok.nomor` /
    `anggota.nim`).
  - `src/lib/sesi.ts`'s `resolvePraktikan()`: now reads
    `anggota → kelompok`, LEFT JOIN `sesi_kelompok` for the per-session
    override (`kelompok.aktif AND COALESCE(sesi_kelompok.aktif, true)`),
    with `sesiId` dropped from the lookup itself — this is what makes one
    roster paste visible to every module's session, not just the one it was
    entered under. Ships with a **row-count-gated fallback**: if `anggota`
    is empty (migration landed but the backfill hasn't run `--apply` yet),
    it transparently falls back to the old `praktikan`/`regu` join instead
    of locking every student out — checked fresh on every call, not cached
    or env-gated, so it self-heals the instant the backfill completes with
    no redeploy needed. The external `ResolvedPraktikan` shape (`reguId`,
    `reguNomor`, `reguNama`, ...) is unchanged on purpose, so every other
    consumer of a login result needs no changes yet — the field rename to
    match `kelompok` is deferred to migration 0004's contract cleanup
    (step 9), matching the plan's "no read-path changes in the same deploy
    as a schema change" discipline.
  - **Verified for real**, not just by typecheck: no `DATABASE_URL` for the
    actual Neon project is available in this sandbox, so rather than leave
    this asserted-but-unproven, a throwaway local Postgres 18 instance was
    initialised in a scratch directory (`initdb` + `pg_ctl`, isolated data
    dir and port, `trust` auth, torn down afterward — the existing
    `postgresql-x64-18` Windows service was never touched). Against it:
    - `drizzle/0000`, `0001`, `0002` applied via `psql` in order with zero
      errors (`drizzle-kit migrate` itself can't be used for this — it
      hardcodes the Neon-only websocket driver, which refuses to speak to a
      plain Postgres server at all).
    - The partial index: an active duplicate slot is still rejected
      (`sesi_slot_unik` violation), and cancelling a session frees its exact
      slot for a new one — confirmed by inserting, cancelling, and
      re-inserting the same `(tanggal, modul, mulai)`.
    - `scripts/backfill-roster.ts` against two seeded Phase 1 sessions:
      dry-run correctly picked the newest session and previewed the right
      groups/members; `--apply` wrote correct `kelompok`/`anggota` rows;
      re-running is a no-op via `onConflictDoUpdate`; adding a third session
      that reassigned one NIM to a different group number made both dry-run
      and `--apply` correctly refuse, print `grup 1 on 2026-09-14, grup 5 on
2026-09-22`, exit non-zero, and write nothing.
    - `resolvePraktikan()`, called directly against the same database: with
      `anggota` empty it correctly used the legacy `praktikan`/`regu` join
      (both a known and an unknown NIM resolved correctly); after the
      backfill it correctly switched to the master-roster join; a
      `sesi_kelompok` row with `aktif: false` correctly blocked only that
      group for that session while a sibling group still resolved; a
      master-level `kelompok.aktif = false` correctly blocked login too.
    - Testing this required `src/lib/db.ts` to briefly gain a
      `LOCAL_TEST_PG=1` branch (node-postgres instead of the Neon websocket
      driver) and a temporary `pg`/`@types/pg` devDependency; both were
      fully reverted afterward (`git diff src/lib/db.ts` is empty,
      `package.json`/`package-lock.json` untouched throughout since `npm
install --no-save` was used) — nothing test-only remains in the tree.
    - `npx tsc --noEmit`, `npm test` (20/20), and `npm run lint` all still
      clean after the revert.
    - **Also verified through an actual browser**, not just direct DB/script
      calls: `astro dev` (port 4321) plus a temporary `scripts/_dev-bridge.ts`
      (port 4322, deleted after use) that dispatches `/api/*` straight to the
      real Vercel-function handlers, since `astro dev` alone doesn't know the
      root `api/` directory exists. Via chrome-devtools MCP against that
      stack: typed Siti's NIM into the real `/masuk` form, clicked _Masuk_,
      and landed on `/dashboard` showing "Anda masuk sebagai Siti" /
      "KELOMPOK 2" — the actual `verifyPraktikanLogin` -> `resolvePraktikan`
      chain, the real session-cookie signing, and the real client-side
      redirect, all exercised together for the first time. _Keluar_ (logout)
      correctly returned to `/masuk`. Logging in as Budi (whose group is
      deactivated) correctly got `{"ok":false,"kode":"tidak_terdaftar"}` from
      the network tab. The dashboard's "MODUL 4 — Perburuan LoRa" card is
      static Phase 2 markup shown regardless of the actual session's module
      (confirmed by reading `dashboard.astro`) — not a bug surfaced by this
      test.
    - **Still open**: this was a fresh, empty schema, not a copy of the
      practicum's actual production data — the backfill's conflict scan is
      only as good as what real `regu`/`praktikan` history actually
      contains. Run it once for real against a scratch branch of the _actual_
      Neon database (`vercel env pull` a branch, not production) before
      relying on it for a live session.

- **B, step 4 — roster paste + session lifecycle rewired onto the master
  roster:**
  - `api/sesi/roster.ts`: rewritten from scratch. Previously still wrote to
    Phase 1's per-session `regu`/`praktikan` (step 3 built the read path
    onto `kelompok`/`anggota` but nothing had rewired the write path), so
    pasting a roster had zero effect on who could log in once the backfill
    ran. Now edits the master roster directly, no longer scoped to a
    session at all (`sesiId` dropped from the request). Replace semantics
    are asymmetric on purpose: **members** fully replace (a NIM missing
    from the new paste is deleted — safe, nothing else references
    `anggota.id`); **groups never auto-delete** (`kelompok.id` is
    referenced by `sesi_kelompok` and `jawaban` across every module's
    session, not just today's, so a group number vanishing from one paste
    must not cascade-delete that history). A group in the paste is
    upserted by `nomor`; a group absent from the paste is left untouched.
    Deleting a group for good is deliberately not wired to this endpoint.
  - `api/sesi/current.ts`: now reads `kelompok`/`anggota` (master roster)
    LEFT JOINed with `sesi_kelompok` for the running session's per-group
    override, and returns the roster unconditionally (not just while a
    session is running) since the roster no longer depends on one.
  - New `api/sesi/kelompok.ts`: upserts a `sesi_kelompok` row, i.e. sets
    one group's exclusion for the current session (Module 4's beacon
    group is the concrete case this exists for) without touching its
    master-roster membership.
  - New `api/sesi/akhiri.ts`: explicit end-session action, stamping real
    `selesaiPada`/`durasiDetik` and flipping status to `"selesai"`.
    Previously a session only ever left `"berjalan"` as a side effect of
    the next one starting; `api/sesi/index.ts`'s supersede path was
    updated to stamp the same real timestamps there too, for consistency,
    and to set `mulaiPada` on creation (previously never set at all).
  - `dashboard.astro`'s assistant view split in two: "Sesi hari ini" is
    now pure session lifecycle (start form, or running info + per-group
    toggle checkboxes + "Akhiri sesi"), and a new always-visible "Roster
    utama" section owns the paste box independently of session state.
  - **Verified for real**, the same way step 3 was: a throwaway local
    Postgres 18 instance (migrations 0000-0002 applied), exercising the
    actual handler modules (not hand-rolled SQL) via a temporary
    `LOCAL_TEST_PG` branch in `db.ts` — fully reverted after, `git diff`
    on it came back empty. 29 assertions: roster upsert/replace semantics,
    a group row surviving a re-paste that omits it, `resolvePraktikan`
    gating correctly through both the master roster and a `sesi_kelompok`
    exclusion, and session lifecycle timestamps on both the explicit-end
    and superseded-by-next-session paths. Also driven through a real
    browser (astro dev + a temporary dev-bridge dispatching `/api/*` to
    the real handlers, both deleted after use): logged in as a seeded
    assistant, pasted a roster, confirmed it survived a full page reload,
    toggled a group's per-session exclusion and confirmed that survived a
    reload too, and ended a session to see the real elapsed duration come
    back. No console errors.
  - **Not done in step 4, deliberately**: a UI to permanently deactivate
    a group (`kelompok.aktif`) — the per-session toggle
    (`sesi_kelompok.aktif`) covers the one case that's actually
    load-bearing today (Module 4's beacon exclusion); permanently
    retiring a group is rare enough to defer rather than build UI for
    speculatively. Also not done: a "batal" (cancel) action for a
    mis-created session — "end" and "cancel" are different verbs, and
    only "end" was in step 4's scope.

`scripts/check_sketches.py` compiles `kunci_jawaban/**/*.ino` (not
`kode_praktikum/**/*.ino` — those intentionally contain `________` blanks a
C++ compiler correctly rejects; see the script's docstring) plus `py_compile`
on both trees' `.py` files. Its first local run (all 34 sketches, one per
modul4 group) was killed by the host's memory-pressure reaper — the same
failure mode that hit the modul4 compile job earlier the same day. Fixed by
compiling only one representative modul4 group (`grup1`) instead of all 7
(gen_modul4.py's own generation-time audit() already guarantees the other 6
differ only by a substituted `GROUP_ID`) and sharing one persistent
`--build-path` across every compile so the ESP32 core object-compiles once
instead of once per sketch. **Confirmed clean**: 10 sketches + 16 `.py` files
(12 originals + the 4 `iris_waktu.py` added by A3's clock-header extraction),
all `ok`, 2026-09-21. (One caveat learned the hard way: never run two compiles
against that shared build-path concurrently — arduino-cli has no locking and
a concurrent second compile silently corrupts the first's intermediate
files. Always run this script alone.)

**On "since I added additional task here":** the live-session/master-roster
work was folded into what the plan calls Phase 3 alongside the slim-down —
they turned out entangled (paper-vs-web decides how much the journals can
shrink; master roster is a prerequisite for live per-group state). So this is
still one phase, now with 9 steps instead of the smaller slim-down-only scope
originally asked for. It does **not** touch the two items already flagged
pending from earlier in this project and tracked separately, outside this
plan:

- The `web/`+`agent/`+`games/`+`modul4/` merge into a single `iris-iot/` at
  `Documents/WebApps` (deferred, unstarted, orthogonal to Phase 3).
- Carrying `games/`'s cosmic styling/animations into the merged project
  (same status).

---

## Gotchas to read before starting (from the plan's Verification section)

- `code-file` in `template/template.typ` silently prints the **entire file**
  if it finds zero blank markers — a botched edit to a sketch's blanks fails
  loudly only if the CI page-count/blank-count gate (step 2) exists first.
- Firebase ID tokens expire after **1 hour**; a session runs **150 minutes**.
  Refresh must be tested across that boundary, not just assumed to work.
- `sesi_slot_unik` today makes a mis-created session's slot permanently
  unusable — migration 0002 must land the `batal` status + partial unique
  index before anyone relies on being able to cancel and recreate a slot.
- The backfill script must refuse (exit non-zero) rather than guess when a
  NIM appears under two different group numbers across existing sessions.

---

## Verification checklist (copied from the plan, check off as done)

- [x] `typst compile` all 8 journals clean; page count in the 4–5 target
- [x] `arduino-cli compile` every representative sketch; `py_compile` every practicum `.py` — 10 sketches + 16 `.py` files, all clean
- [ ] Every `________` blank still appears in the rendered excerpt post-edit
- [ ] Migration run against a scratch Neon branch loaded from real data
- [ ] One student resolves correctly in a session for each of modules 1–4
- [ ] A `sesi_kelompok` exclusion is actually refused at login
- [ ] An archived past session still reads back after the contract migration
- [ ] Two browsers, one group: edit in one, confirm live update in the other
- [ ] Watchdog recovers after killing one browser's network mid-session
- [ ] A session runs past the 1-hour token boundary and writes still succeed
- [ ] DevTools confirms no NIM ever appears in an RTDB frame
- [ ] History renders from Neon with Firebase deliberately blocked
- [ ] `web`, `games`, `agent`, `modul4` suites green; `check_csp_hashes.mjs` passing
