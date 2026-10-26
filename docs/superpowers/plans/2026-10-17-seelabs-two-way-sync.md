# SeeLabs Two-Way Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The SeeLabs robot reads each connected Asisten's saved scores and Rekap BAP back into IRIS on a schedule, copies TP/TA changes in, and flags average, missing and pay differences where the Asisten and the Admins already look.

**Architecture:** A new read-only robot job `baca` on the PC agent returns what Lihat Nilai, Rincian and Rekap BAP show. The site queues it from the heartbeat on a practicum-hours rhythm, compares the result with the values IRIS last saved (a new baseline kept at each verified save), and writes copies, per-group read state, pay flags and unplaced rows. The existing SeeLabs strip, robot inbox and Bayar page show them.

**Tech Stack:** Python 3 stdlib agent (IRIS ASO `pc/agent`, unittest), Astro + React islands, Vercel functions, drizzle + Neon Postgres, vitest, Playwright rig.

**Spec:** `docs/superpowers/specs/2026-10-17-seelabs-two-way-sync-design.md` (approved 2026-10-17, Stage 0 done and recorded in it).

## Global Constraints

- **No commit, push or deploy** until the user says the whole set is ready (user, 2026-10-17). Each task ends with its tests green and the files left uncommitted; the "Stage" line lists the paths for the final commit. Never `git add -A`; never stage `apps/web/src/lib/db.ts` (rig patch) or `public/rig-test/`.
- Another session is building Phase 18 in the same iris-iot worktree. Touch only files this plan names; re-read a shared file (schema.ts, `api/agent/index.ts`, `drizzle/meta/_journal.json`) right before editing it.
- Migration: the next free number at execution time (0039 is Phase 18's). Rig DB only; prod gets it by hand after a pg_dump at deploy, never drizzle-kit migrate.
- The robot never calls a SeeLabs method that changes data in `baca`. Only page GETs and the filter properties `s_praktikum`, `s_modul`, `i_praktikum`.
- Read with each Asisten's own account only (seelabs_akses `aktif`); robot switch, approved key and `ditolak` rules as for every job. TOT sessions never take part.
- Bayar, unit_bayar, transfer and Phase 18 cuts are never written by this feature.
- Interval: 5 min from 06:30 until the last non-TOT session of the day ends; 60 min otherwise; one nightly pass (first beat from 22:00 WIB) over every module with a session this semester.
- Mean comparison uses the agent's tolerance 0.006 (`MEAN_TOLERANCE`); TP/TA compare after rounding SeeLabs half up to a whole number (nilai.skor is integer); a non-whole SeeLabs TP/TA is copied rounded and the history line carries the raw value.
- UI copy in ID, EN and ZH; no em or en dashes; title case buttons; sentence case hints; no icon beside a label; reuse kit parts and established button positions.
- Agent code in the user's style (English names, triple banners, aligned `=`, `[INFO]` tags); agent protocol becomes 8.
- Secret scan with `PYTHONUTF8=1`; no real student data in fakes (synthetic NIMs).

## Review Focus

1. A score edited in IRIS, then read before its re-send lands (60 s JEDA, or a retrying job): the group must be skipped, never overwritten with the old SeeLabs value. Test in Task 4 (`lewati` cases) and Task 6 (pending job / unsent edit).
2. A Praktikan with a regular session and a susulan of the same module: SeeLabs scores land on the susulan they sat in, and the regular session is not flagged hilang for them. Test in Task 4 (`tempatkan`) and Task 6.
3. A copy from SeeLabs must not queue a nilai job back to SeeLabs (echo loop). Test in Task 6.
4. A group lent through another account: the flag reaches the scorer and Periksa Sekarang reads the lender's account. Test in Task 7.
5. A `baca` job must never reach a PC on protocol 7 (old agent would fail it as unknown and mark the account). Test in Task 5.

---

## File Structure

IRIS ASO (agent):
- Modify `pc/agent/seelabs.py`: `read_input`, `parse_bap`, `job_read`, `baca` in `run_job`.
- Modify `pc/agent/agent.py`: `AGENT_PROTOCOL = 8`.
- Modify `pc/agent/tools/fake_seelabs.py`: Rekap BAP page, `world.bap`, a log of Livewire calls.
- Modify `pc/agent/tests/test_seelabs.py`: `TestRead`.

iris-iot (`apps/web`):
- Create `src/lib/seelabs-baca.ts`: pure rules (compare, place, interval, BAP compare). Browser safe.
- Create `src/lib/__tests__/seelabs-baca.test.ts`.
- Create `api/_lib/seelabs-baca.ts`: queueing, taking results in, BAP check, read-state queries.
- Create `api/_lib/__tests__/seelabs-baca.test.ts` (mocked db as in `lupa-nilai-catat.test.ts`).
- Create `drizzle/00NN_seelabs_baca.sql` + snapshot/journal via drizzle-kit generate on the rig.
- Modify `src/lib/schema.ts`: `seelabsEkspor.nilai`, `seelabsTugas.jenis` + "baca", tables `seelabsBaca`, `seelabsBapBeda`, `seelabsLepas`.
- Modify `src/lib/seelabs-robot.ts`: `JENIS_TUGAS` + "baca", `PROTOKOL_BACA = 8`, `KUNCI_ROBOT.baca`.
- Modify `api/_lib/seelabs-robot.ts`: `ambilTugas` gate, `terimaHasil` → `terimaBaca`, `tandaiTersimpan` stores the baseline, POST `periksa` / `kirim_ulang`, GET `?baca=`.
- Modify `api/agent/index.ts`: call `bacaBilaPerlu(db)` after `harianBilaPerlu`.
- Modify `api/_lib/bayar.ts`: Admin GET adds `bedaBap` and `lepas`.
- Modify `src/lib/audit-jenis.ts` + `src/components/reports/audit.ts`: `seelabs_baca` line; `nilai_set` with `sumber: "seelabs"` sentence.
- Modify screens: `src/components/console/seelabs/SeelabsStrip.tsx`, `RobotInbox.tsx`, `robotStrings.ts`, `robot.css`; `src/components/bayar/PayBoard.tsx`, `strings.ts`, `data.ts`; `src/components/grading/Grader.tsx` (TP note).
- Create `rig/p19_baca.mjs` (rig e2e).

---

### Task 1: Fake SeeLabs learns Rekap BAP and logs every call

**Files:**
- Modify: `pc/agent/tools/fake_seelabs.py`
- Test: `pc/agent/tests/test_seelabs.py`

**Interfaces:**
- Produces: `World.bap: dict[str, dict[int, list[tuple[str, str, str]]]]` (account → praktikum → rows `(hari_jaga, shift, tanggal)`, e.g. `("Selasa", "Shift 06.30 - 09.00", "20 Oktober 2026")`); `World.calls: list[tuple[str, str]]` (component name, method or `"set:<prop>"`) appended for every Livewire update; route `GET /asisten/laporan/bap` rendering component `praktikum.asisten.laporan.rekap-bap-asisten` with data `{i_praktikum: ""}`; setting `i_praktikum` renders the table head `No | Hari Jaga | Shift | Tanggal Kegiatan` and the rows, or the empty text "Tidak ada riwayat kehadiran / BAP untuk praktikum ini."

- [ ] **Step 1: Write the failing test** `TestFake.test_bap_page_lists_rows_and_logs_calls`: put two rows in `world.bap[NIM][237]`, sign in with a `seelabs.Browser`, GET the page, `update(component, {"i_praktikum": "237"})`; assert both `tanggal` strings are in the HTML and `("praktikum.asisten.laporan.rekap-bap-asisten", "set:i_praktikum")` is in `world.calls`.
- [ ] **Step 2: Run** `cd pc/agent && python -m unittest tests.test_seelabs -k bap` — expect FAIL (404 / attribute).
- [ ] **Step 3: Implement** `render_bap(world, account, data) -> str` and the route; log calls in `livewire()` (for `updates` keys and `calls` methods). Mirror the markup recorded in the spec's Stage 0 results (raw tags with line breaks inside, as the other renders do).
- [ ] **Step 4: Run** the whole agent suite `python -m unittest discover -s tests` — expect all pass.
- Stage: `pc/agent/tools/fake_seelabs.py pc/agent/tests/test_seelabs.py`

### Task 2: Agent job `baca`

**Files:**
- Modify: `pc/agent/seelabs.py`, `pc/agent/agent.py`
- Test: `pc/agent/tests/test_seelabs.py` (`class TestRead(SeelabsCase)`)

**Interfaces:**
- Consumes: Task 1's fake.
- Produces: job `{jenis: "baca", isi: {praktikum: [237, 238], modul: [1, 2], bap: true}}` → `bukti`:
  ```
  {"nilai": [{"praktikum": 237, "klp": 1, "modul": 2,
              "baris": [{"nim": "...", "presensi": true, "tp": 80.0, "ta": 75.5,
                         "praktikum": 83.25, "jurnal": 86.5}]}],
   "bap": [{"praktikum": 237, "hari": "Selasa", "shift": "Shift 06.30 - 09.00",
            "tanggal": "20 Oktober 2026"}] | null}
  ```
  `read_input(job_input) -> tuple[list[int], list[int], bool]`, `parse_bap(html) -> list[dict]`, `job_read(browser, job_input) -> dict`. `AGENT_PROTOCOL = 8`.

- [ ] **Step 1: Write the failing tests**
  - `test_reads_every_saved_group_with_values`: seed `world.scores[(NIM, 237, 2, 1)]` and `(NIM, 237, 2, 2)`; job `baca` modul [2]; assert `status == "selesai"`, two entries, NIM-keyed values equal the seeds.
  - `test_reads_only_this_accounts_saves`: seed a group under `"1101200002"`; assert it is absent.
  - `test_reads_bap_rows`: seed `world.bap`; assert `bukti["bap"]` equals the rows with `praktikum` added; with `bap: false` it is `None`.
  - `test_read_never_calls_a_changing_method`: after a full read, every entry in `world.calls` is a `set:s_praktikum`, `set:s_modul` or `set:i_praktikum`; `world.saves == 0`.
  - `test_bad_read_input_is_refused_before_any_login`: `modul: [15]` and `praktikum: [999]` → `gagal`, `bentuk_berubah`, `world.logins == 0`.
  - `test_empty_account_reads_empty`: no seeds → `{"nilai": [], "bap": []}`.
- [ ] **Step 2: Run** `python -m unittest tests.test_seelabs -k TestRead` — expect FAIL.
- [ ] **Step 3: Implement.** `job_read` reuses `saved_groups` and `open_rincian` once per (praktikum, module) list and group; maps Rincian rows to NIM through Lihat Nilai's row ids exactly as `verify` does; presensi as bool. Add `"baca": read_input` to `checks` and the branch in `run_job`. Bump `AGENT_PROTOCOL` to 8 and update the protocol line in the agent README section that lists protocols.
- [ ] **Step 4: Run** full agent suite + `shellcheck` unchanged scripts untouched — expect all pass (previously 201).
- Stage: `pc/agent/seelabs.py pc/agent/agent.py pc/agent/tests/test_seelabs.py` (+ README if touched)

### Task 3: Schema and migration

**Files:**
- Modify: `apps/web/src/lib/schema.ts`
- Create: `apps/web/drizzle/00NN_seelabs_baca.sql`, its snapshot and journal entry

**Interfaces:**
- Produces:
  - `seelabsEkspor.nilai: jsonb<Record<string, NilaiTersimpan>> | null`, where `NilaiTersimpan = { tp: number; ta: number; praktikum: number; jurnal: number; presensi: boolean }` (exported from `src/lib/seelabs-baca.ts`, Task 4).
  - `seelabsTugas.jenis` enum adds `"baca"` (TS-only enum, no DB constraint; confirm in the generated SQL).
  - `seelabsBaca` (`seelabs_baca`): `id serial`, `sesiId` (fk cascade), `kelompokNomor int`, `akunNim text`, `status text enum ["sama","beda","hilang","hanya_seelabs"]`, `seelabs jsonb<Record<string, NilaiTersimpan>>`, `dibacaPada timestamptz`, unique (sesiId, kelompokNomor).
  - `seelabsBapBeda` (`seelabs_bap_beda`): `id`, `akunNim`, `praktikum int`, `tanggal text` (ISO), `shift int` (1-4), `jenis text enum ["hanya_iris","hanya_seelabs"]`, `penilai text[]`, `dibacaPada`, unique (akunNim, praktikum, tanggal, shift).
  - `seelabsLepas` (`seelabs_lepas`): `id`, `akunNim`, `praktikum`, `klp int`, `modul int`, `nim text`, `nilai jsonb<NilaiTersimpan>`, `dibacaPada`, unique (akunNim, praktikum, modul, nim).
- [ ] **Step 1:** Add the columns/tables with short doc comments in the file's style.
- [ ] **Step 2: Run** `npx drizzle-kit generate` against the rig (`localhost:54329/iris_e2e`), then apply it to the rig DB. Expected: one new SQL file with 3 CREATE TABLE and 1 ALTER TABLE ADD COLUMN, nothing else.
- [ ] **Step 3: Run** `npx tsc --noEmit -p .` — only the known rig `db.ts` error.
- Stage: `apps/web/src/lib/schema.ts apps/web/drizzle/00NN_seelabs_baca.sql apps/web/drizzle/meta/00NN_snapshot.json apps/web/drizzle/meta/_journal.json` (journal: only our hunk; Phase 18's is theirs)

### Task 4: The pure rules

**Files:**
- Create: `apps/web/src/lib/seelabs-baca.ts`
- Test: `apps/web/src/lib/__tests__/seelabs-baca.test.ts`

**Interfaces:**
- Produces:
  - `type NilaiTersimpan` (Task 3).
  - `nilaiTersimpan(skor: Partial<Record<NilaiKomponen, number>>, absen: boolean): NilaiTersimpan` — TP, TA, mean D1..D4, mean L1..L2 (raw, not rounded), presensi = any D/L > 0.
  - `type Tindakan = "sama" | "salin_tp_ta" | "beda_rerata" | "beda_tanpa_dasar" | "lewati"`.
  - `bandingkan(p: { dasar: NilaiTersimpan | null; iris: NilaiTersimpan; seelabs: NilaiTersimpan; menunggu: boolean }): { tindakan: Tindakan; tp?: number; ta?: number }`. `dasar` is the last verified save; `iris` is used only when `dasar` is null. When TP/TA and a mean both differ, the result is `beda_rerata` carrying `tp`/`ta` (copy them and flag).
  - `type Tempat = { sesiId: number; kelompokNomor: number }`.
  - `tempatkan(calon: { sesiId: number; kelompokNomor: number; akun: string | null; tanggal: string; mulai: string }[], akunBaca: string): Tempat | null`.
  - `jedaBaca(p: { sekarang: Date; sesiHariIni: { mulai: string; akhir: string }[] }): number` (ms).
  - `waktunyaMalam(sekarang: Date, terakhirMalam: string | null): boolean` (first beat from 22:00 WIB, once a day).
  - `shiftDariSlot(slot: number): number`, `bacaShiftBap(teks: string): number | null` ("Shift 06.30 - 09.00" → 1 … "Shift 15.30 - 18.00" → 4), `bacaTanggalBap(teks: string): string | null` ("20 Oktober 2026" → "2026-10-20").
  - `bandingkanBap(iris: { tanggal: string; shift: number; penilai: string }[], bap: { tanggal: string; shift: number }[]): { tanggal: string; shift: number; jenis: "hanya_iris" | "hanya_seelabs"; penilai: string[] }[]`.
- [ ] **Step 1: Write the failing tests** (exact values):
  - `bandingkan` with dasar `{tp:80,ta:75,praktikum:83.25,jurnal:86.5,presensi:true}`:
    - seelabs equal (praktikum 83.25 vs 83.2549) → `sama`.
    - seelabs tp 85 → `{tindakan:"salin_tp_ta", tp:85, ta:75}`.
    - seelabs tp 85.5 → `tp: 86` (half up).
    - seelabs praktikum 80 → `{tindakan:"beda_rerata"}` (no tp/ta).
    - seelabs tp 85 and praktikum 80 → `{tindakan:"beda_rerata", tp:85, ta:75}`.
    - presensi false, all zero → `beda_rerata`.
    - `menunggu: true` and any difference → `lewati`; `menunggu: true` and equal → `sama`.
    - `dasar: null`, `seelabs` equal to `iris` → `sama`; `dasar: null`, tp differs → `{tindakan:"beda_tanpa_dasar"}` (no tp/ta: nothing is copied without a baseline).
  - `tempatkan`: two candidates (regular 2026-10-20 slot 1 akun "A", susulan 2026-10-23 akun "B"), reading as "B" → the susulan; reading as "C" → the later one; empty → null.
  - `jedaBaca`: 07:00 WIB with a session 06:30–09:00 → 300 000; 21:00 with the last ending 18:00 → 3 600 000; a day with none → 3 600 000.
  - `waktunyaMalam`: 22:05 with last `"2026-10-19"` on 10-20 → true; same day → false; 21:59 → false.
  - `bacaShiftBap` four shifts and an unknown → null; `bacaTanggalBap("20 Oktober 2026") === "2026-10-20"`, "Jumat, 23 Oktober 2026" also parses.
  - `bandingkanBap`: IRIS (10-20, 1, "A"), (10-20, 1, "B"), (10-21, 2, "A"); BAP (10-20, 1), (10-22, 3) → `[{10-21,2,"hanya_iris",["A"]}, {10-22,3,"hanya_seelabs",[]}]` (two IRIS units in one shift collapse to one).
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/seelabs-baca.test.ts` — FAIL.
- [ ] **Step 3: Implement** in the file style of `src/lib/seelabs-robot.ts`; month names table ID (Januari..Desember) for `bacaTanggalBap`.
- [ ] **Step 4: Run** the test — PASS.
- Stage: both files.

### Task 5: Queueing reads

**Files:**
- Create: `apps/web/api/_lib/seelabs-baca.ts`
- Modify: `apps/web/src/lib/seelabs-robot.ts`, `apps/web/api/_lib/seelabs-robot.ts` (`ambilTugas`), `apps/web/api/agent/index.ts`
- Test: `apps/web/api/_lib/__tests__/seelabs-baca.test.ts`

**Interfaces:**
- Consumes: Task 4 `jedaBaca`, `waktunyaMalam`; existing `antre`, `aturanRobot`, `aksesDari` (export the latter two from `api/_lib/seelabs-robot.ts` if not yet).
- Produces:
  - `PROTOKOL_BACA = 8`, `JENIS_TUGAS` adds `"baca"`, `KUNCI_ROBOT.baca = "seelabs_baca_jadwal"` (pengaturan value `{ terakhir: Record<nim, ISO>, malam: "YYYY-MM-DD" | null }`).
  - `modulAktif(db: Db, semua: boolean): Promise<number[]>` — modules with a non-TOT session in the last 7 days (or this semester when `semua`).
  - `antreBaca(db: Db, akunNim: string, oleh: string, opsi: { semua?: boolean }): Promise<number | null>` — one `baca` job, `isi {praktikum:[237,238], modul, bap:true}`; null when robot off / account not aktif / no modules.
  - `bacaBilaPerlu(db: Db): Promise<void>` — heartbeat hook.
- [ ] **Step 1: Write the failing tests:**
  - `bacaBilaPerlu` queues one job per aktif account whose `terakhir` is older than `jedaBaca`, none for a `ditolak` or `menunggu_uji` account, none when the switch is off.
  - Calling it twice in one beat queues nothing new (unique index / `terakhir`).
  - Nightly: at 22:05 queues with `semua` once, stores `malam`.
  - `ambilTugas` never hands a `baca` job to a server whose `infoSistem.protokol` is 7, still hands it `nilai`; hands both at 8.
- [ ] **Step 2: Run** `npx vitest run api/_lib/__tests__/seelabs-baca.test.ts` — FAIL.
- [ ] **Step 3: Implement**; in `ambilTugas` filter `jenis = 'baca'` out unless protocol ≥ `PROTOKOL_BACA`. Hook `await bacaBilaPerlu(db);` right after `harianBilaPerlu(db)` in `api/agent/index.ts`, with a one-line comment in that block's style.
- [ ] **Step 4: Run** the test and `npx vitest run` — all pass.
- Stage: the four files + test.

### Task 6: Taking a read in

**Files:**
- Modify: `apps/web/api/_lib/seelabs-baca.ts`, `apps/web/api/_lib/seelabs-robot.ts` (`terimaHasil`, `tandaiTersimpan`)
- Modify: `apps/web/src/lib/audit-jenis.ts`, `apps/web/src/components/reports/audit.ts`
- Test: `apps/web/api/_lib/__tests__/seelabs-baca.test.ts`

**Interfaces:**
- Consumes: Task 2's `bukti` shape, Task 3 tables, Task 4 `bandingkan`, `tempatkan`, `nilaiTersimpan`; existing `muatSeelabs`, `sidikPayload`, `writeAudit`, `siarkan`.
- Produces:
  - `tandaiTersimpan` also writes `seelabs_ekspor.nilai` from the job's `isi.baris` via `nilaiTersimpan`.
  - `terimaBaca(db: Db, t: SeelabsTugasRow, bukti: BuktiBaca): Promise<void>` called from `terimaHasil` when `t.jenis === "baca"` and status selesai (failures follow the existing path). Exports `type BuktiBaca`.
  - Per SeeLabs group: place each NIM (`tempatkan` over that NIM's non-TOT, non-batal sessions of the module via `sesi_anggota`), group by (sesiId, kelompokNomor). `menunggu` = a `nilai` job for that group in `antre`/`diambil`, or the group's current `sidikPayload` differs from its latest `seelabs_ekspor.payloadHash` while `nilai_kirim` exists (edit not yet sent).
  - `salin_tp_ta`: upsert nilai TP/TA (`diubahOleh: "seelabs"`), `writeAudit(akunNim, "nilai_set", { sesiId, nim, komponen, skor, sumber: "seelabs", sebelum, mentah })`, then insert a `seelabs_ekspor` row `cara: "baca"` with the new `sidikPayload` and `nilai` so no echo job is queued. (Add `"baca"` to the `cara` enum.)
  - Write `seelabs_baca` status: `sama` | `beda` (any `beda_*`) | `hanya_seelabs` (no `nilai_kirim` and the group had no IRIS scores before the copy) | `hilang` (the account's verified `seelabs_ekspor` for a group of this read's modules that the read did not list).
  - NIMs with no session: upsert `seelabs_lepas`. Rows for modules/KLPs with no session this semester: ignored.
  - One `writeAudit(akunNim, "seelabs_baca", { tugas, sama, beda, salin, lepas })` per job; `siarkan(["seelabs", "nilai"])` when anything changed.
  - Then `periksaBap` (Task 7) with `bukti.bap` when not null.
- [ ] **Step 1: Write the failing tests** (mocked db):
  - Copy: baseline tp 80, SeeLabs tp 85 → nilai TP 85, audit `sumber: "seelabs"` `sebelum: 80`, a `cara: "baca"` ekspor row, **no** new `nilai` job, status `sama` on the next identical read.
  - Pending: same, with a `nilai` job `antre` → nothing written, status unchanged.
  - Unsent edit: IRIS sidik ≠ last ekspor hash → skipped.
  - Mean: praktikum 80 vs 83.25 → status `beda`, `seelabs` holds 80, nilai untouched.
  - No baseline (ekspor `cara: "tangan"`, `nilai` null) and TP differs → `beda`, TP not copied.
  - SeeLabs-only group: no nilai_kirim, no IRIS scores → TP/TA copied, status `hanya_seelabs`, Praktikan-visible state unchanged (no nilai_kirim inserted).
  - Susulan: NIM in a regular and a susulan session, susulan sent through the reading account → written to the susulan; the regular session gets no `hilang`.
  - Unplaced NIM → one `seelabs_lepas` row.
  - Hilang: verified ekspor for KLP 3 modul 2 by this account, read lists modul 2 without KLP 3 → `hilang`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Audit: `"seelabs_baca"` in the seelabs list; sentence in 3 languages "Robot membaca SeeLabs {akun}: {n} sama, {m} beda"; `nilai_set` sentence gains "dari SeeLabs" when `sumber` is "seelabs".
- [ ] **Step 4: Run** the file and the whole suite — all pass.
- Stage: touched files + test.

### Task 7: Rekap BAP check, Periksa Sekarang, Kirim Ulang and the read-state API

**Files:**
- Modify: `apps/web/api/_lib/seelabs-baca.ts`, `apps/web/api/_lib/seelabs-robot.ts` (GET/POST), `apps/web/api/_lib/bayar.ts`
- Test: `apps/web/api/_lib/__tests__/seelabs-baca.test.ts`

**Interfaces:**
- Consumes: Task 4 `bandingkanBap`, `bacaShiftBap`, `bacaTanggalBap`, `shiftDariSlot`; `unit_bayar` (`nimAkunSeelabs`, `nimPenilai`, `sesiId` → `sesi.tanggal`, `sesi.slot`, `sesi.kelas`).
- Produces:
  - `periksaBap(db, akunNim, baris)` — compares per praktikum over the dates the BAP or IRIS cover this semester; replaces that account's `seelabs_bap_beda` rows.
  - `akunUntukPeriksa(db, nim): Promise<string[]>` — my own account plus every `seelabs_ekspor.akunNim` / `KelompokSeelabs.akun` of groups I scored in modules with a session in the last 7 days, aktif only.
  - POST `{ aksi: "periksa" }` → `antreBaca` for each of `akunUntukPeriksa(me)`; Pencipta/Admin with `{ aksi: "periksa", semua: true }` → every aktif account. Answer `{ ok, tugas: number[] }`.
  - POST `{ aksi: "kirim_ulang", sesiId, kelompok }` (scorer or admin) → `antreNilai` bypassing `sudah_tersimpan` (new param `paksa = true`).
  - GET `?baca=<sesiId>` → `{ kelompok: { nomor, status, dibacaPada, akunNim, seelabs, iris }[] }` where `iris` is `nilaiTersimpan` of current IRIS scores; visible to anyone who may see that session's scores.
  - GET (none) adds `bacaku: { beda: {sesiId, nomor, modul}[], bap: SeelabsBapBedaRow[] }` for my inbox: groups I scored (any account) plus BAP flags where I am the account holder or a `penilai`.
  - `handleBayarGet` (Admin view) adds `bedaBap: SeelabsBapBedaRow[]` and `lepas: SeelabsLepasRow[]`.
- [ ] **Step 1: Write the failing tests:**
  - BAP: IRIS units through "A" on 10-20 slot 1 (two groups) and 10-21 slot 2; BAP rows 10-20 shift 1 and 10-22 shift 3 → exactly two `seelabs_bap_beda` rows; a later read with matching rows clears them.
  - Lent: group scored by "S" saved through lender "L": `akunUntukPeriksa("S")` includes "L"; GET `bacaku` for "S" lists the group's `beda`, for "L" it does not (L sees it only in `?baca=` read only).
  - `kirim_ulang` by a non-scorer non-admin → 403; by the scorer → a nilai job even though the group is `terkirim`.
  - Bayar Admin GET carries `bedaBap` and `lepas`; a plain Asisten GET does not.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all — PASS.
- Stage: touched files + test.

### Task 8: Screens

**Files:**
- Modify: `apps/web/src/components/console/seelabs/SeelabsStrip.tsx`, `RobotInbox.tsx`, `robotStrings.ts`, `robot.css`
- Modify: `apps/web/src/components/bayar/PayBoard.tsx`, `strings.ts`, `data.ts`
- Modify: `apps/web/src/components/grading/Grader.tsx`, `apps/web/src/components/tp/tpStrings.ts`

**Interfaces:**
- Consumes: Task 7 GET/POST shapes.
- Produces (copy, ID / EN / ZH; adjust wording only to fit, never add dashes):
  - Strip state `beda`: title "Beda di SeeLabs" / "Different in SeeLabs" / "SeeLabs 中不同"; a per-Praktikan table Nama | IRIS | SeeLabs for Praktikum and Jurnal (and TP/TA when the state came from `beda_tanpa_dasar`); buttons in the established pair position, Cancel-left/main-right: **Ubah di IRIS** (scrolls/opens the group's scores) and **Kirim Ulang ke SeeLabs**.
  - State `hanya_seelabs`: "Hanya ada di SeeLabs" with hint "TP dan TA sudah disalin. Isi D1 sampai D4 serta L1 dan L2, lalu kirim."
  - State `hilang`: "Tidak ada di SeeLabs" with **Kirim Ulang ke SeeLabs**.
  - Under every strip: "Dicek {relative time}" and **Periksa Sekarang** (ghost text button with its small trailing icon).
  - RobotInbox: one row per `bacaku.beda` group ("Kelompok {n} beda di SeeLabs") and per BAP flag ("Rekap BAP {tanggal} Shift {s}: belum tercatat di SeeLabs" / "…: tidak ada di IRIS").
  - PayBoard (Admin): card "Selisih Rekap BAP" listing account, date, shift, kind, scorers; card "Nilai SeeLabs Tanpa Sesi" listing `lepas`; **Periksa Semua Sekarang**.
  - Grader TP: when the session TP came from SeeLabs (latest audit `sumber: "seelabs"` newer than the TP grading write), a hint "TP sesi ini disalin dari SeeLabs ({nilai})."
  - All panels refresh on the `seelabs` / `nilai` / `bayar` topics (usePollBersama with topics), no new timers.
- [ ] **Step 1:** Implement with kit parts (Pill, Dialog, existing strip layout); add ZH strings (zh-complete test must stay green).
- [ ] **Step 2: Run** `npx vitest run` (zh-complete, live-coverage) — PASS; `npx tsc --noEmit -p .` — only the rig `db.ts` error; Prettier check on touched files.
- Stage: touched files.

### Task 9: Rig end to end and sweeps

**Files:**
- Create: `apps/web/rig/p19_baca.mjs` (copy the harness of `rig/p14_robot.mjs`)

**Interfaces:**
- Consumes: everything above; the rig fake SeeLabs (`python pc/agent/tools/fake_seelabs.py` on 8791) and the rig agent path p14 already uses.
- [ ] **Step 1:** Script: TST sends a group (rig), the fake's world gets TP changed and a mean changed for another group; trigger Periksa Sekarang; assert in the browser: TP shows the new value in Penilaian, the other group's strip reads "Beda di SeeLabs" with both means, Home inbox has the row, Bayar Admin shows a seeded BAP mismatch; Kirim Ulang clears the flag after the next read.
- [ ] **Step 2: Run** at 360, 390, 430, 768, 820, 1024, 1280, 1680 — all checks pass, no element past the viewport (`rig/p14_wide.mjs`).
- [ ] **Step 3:** Click sweep (search, Tampilan, a dialog X) on /session, /grading, /account, /home, /bayar in ID, EN, ZH at 1280 and 390 — 0 issues.
- [ ] **Step 4:** Full checks: `npx vitest run`, agent `python -m unittest discover -s tests`, `PYTHONUTF8=1 python tools/check_secrets.py` (both repos as CI does), Prettier.
- [ ] **Step 5:** Hidden-data gate: confirm no `seelabs_baca`, `bedaBap`, `lepas` or `bacaku` field reaches a Praktikan or signed-out response (curl the session/robot/bayar GETs as a rig Praktikan and signed out).
- Stage: `apps/web/rig/p19_baca.mjs`. Then report to the user; **no commit/push/deploy** until they say the set is ready. At deploy: pg_dump, apply 00NN by hand, push IRIS ASO (signed PC bundle, Perbarui on the PC) before or with the web, merge origin/main into the branch first.
