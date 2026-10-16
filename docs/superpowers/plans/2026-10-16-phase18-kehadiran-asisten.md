# Phase 18 Kehadiran Asisten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IRIS starts every slot itself at :25, Asisten check in with one press, Telat / Mangkir follow a fixed clock the slot's PJ can move, pay is cut by itself, unsent scores are followed until they are in SeeLabs, and a SeeLabs account carries at most two sessions a day.

**Architecture:** One pure rule module (`src/lib/hadir-mengajar.ts`) decides every status and amount; one server module (`api/_lib/hadir-mengajar.ts`) stores check-ins, PJ changes and clock shifts in new tables and serves them; a once-a-minute "jam lab" job rides the relay's existing signed `/api/tp/detak` call (plus the PC Server heartbeat as backup) to auto-start slots and record Lupa Input Nilai. Everything else is additions to the shipped screens.

**Tech Stack:** Astro + React islands, Vercel-style handlers (`apps/web/api`), Drizzle + Postgres (Neon), Vitest, Cloudflare relay cron (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-16-phase18-kehadiran-asisten-design.md` (read it with this plan). Mockup: `C:\Users\EintsWaveX\Downloads\design-review\mockups\phase18\local.html`.

## Global Constraints

- **Add only what the phase needs** (user, 2026-10-16): no renames, restyles or refactors of anything that doesn't need it. The one extraction allowed is the session start core (Task 4), and `index.ts` must behave exactly as before.
- All paths below are under `apps/web/` unless they say otherwise.
- The clock: auto-start = slot time minus 5 minutes (06:25, 09:25, 12:25, 15:25); **Friday (hari 5) slot 3 = 13:00**. Susulan = its own `mulai` minus 5. TOT: never judged, never auto-started.
- Check-in before base+60 s = `tepat`; minutes = floor((t − base)/60 s); 1..10 = `telat`; ≥ 11 = `mm` (Mangkir Mengajar) counted as 10 minutes; never checked in by session end = `mangkir`; Izin = `izin` (never cut).
- Cut: `perMenit` 2000, `maks` 10 minutes, stored in `pengaturan` key `potongan_telat` `{ perMenit, maks }`. `mm` with `hitungMangkir` (default true) and `mangkir`: that person's units for the session are zero, no extra cut. `mm` not counted: `maks × perMenit`.
- A session ends at 150 minutes or at the next slot's auto-start that day, whichever is first (only Friday slot 3 is affected: at most until 15:25).
- Lupa Input Nilai: a group is done when sent (`nilai_kirim`) **and** saved (`seelabs_ekspor.disimpan_pada`); deadline 23:59:59 WIB on `sesi.tanggal`; report only, no cut. Edits after a save re-save by themselves on any day (existing, no token).
- SeeLabs: one group per account per session (existing); **two sessions per account per day** (new).
- UI copy: Indonesian, English, Mandarin for every new string; standard title case for headers, tabs, buttons and menu items, sentence case for hints; **no em or en dashes**; full dates ("Kamis, 1 Oktober 2026"); no icon beside a label except a ghost text button's small trailing icon; kit components only (Dialog, Dropdown, Switch, Checkbox, Badge/Pill, Btn), never native browser widgets.
- Name clash: `src/lib/kehadiran.ts` and `api/_lib/kehadiran.ts` already mean online presence. Phase 18 uses `hadir-mengajar` everywhere.
- System actor for audit and events: `"otomatis"` (as `lms-otomatis.ts:65`).
- Every new API action must be mapped in `src/lib/siaran-topik.ts` `TOPIK_TULIS` (or listed as read-only in its test). New topic: `hadir`.
- Asisten data never reaches Praktikan or signed-out visitors: every new GET/POST is `requireRole(req, res, "asisten")`.
- Vitest with `--maxWorkers=2` on this PC. Never commit `src/lib/db.ts` (rig patch) or `public/rig-test/`. Stage named paths only.
- Never `drizzle-kit migrate` on prod: Migration 0038 is applied by hand (pg_dump first) at deploy time, which waits for the user's go.

## Review Focus

1. **Two triggers in the same minute** (relay cron and heartbeat): the slot starts once. Test: `mulaiOtomatis` called twice for the same slot and date gives one session and the second answers `sudah_ada` (Task 4).
2. **A cancelled or already finished slot at :25:** no new session. Test: a slot with a `batal` or `selesai` session that date is skipped by `slotPerluMulai` (Task 4).
3. **The PJ moves the clock after people checked in:** their statuses are worked out again from the new base. Test: `hitungHadir` with the same check-in and a later base turns `telat 4` into `tepat` (Task 2).
4. **Checking in with no slot today, or twice:** the first answers `tidak_dijadwalkan`, the second keeps the first time. Test in Task 3.
5. **Izin set after a check-in:** the person shows `izin`, the check-in time is kept, no cut. Test: `hitungHadir({ izin: true, hadir })` gives `izin` (Task 2) and `potonganHadir` gives 0 (Task 2).

---

### Task 1: Migration 0038 and schema

**Files:**
- Modify: `src/lib/schema.ts` (after `sesiAsisten`, and the `jadwal` table ~line 368)
- Create: `drizzle/0038_hadir_mengajar.sql` (+ `drizzle/meta/0038_snapshot.json`, `_journal.json` entry, generated)

**Interfaces:**
- Produces: tables `hadirMengajar`, `hadirJam`, `lupaNilai`; column `jadwal.pj`.

- [ ] **Step 1: Add to `schema.ts`**
  - `jadwal.pj: text("pj")` (an Asisten code, null = none).
  - `hadirMengajar` "hadir_mengajar": `id serial pk; kunci text notNull` ("j:<jadwalId>:<tanggal>" for a slot, "s:<sesiId>" for a Susulan); `tanggal text notNull; jadwalId integer → jadwal.id on delete set null; sesiId integer → sesi.id on delete cascade (null until the session exists); nim text notNull → asisten.nim cascade; diharapkan boolean notNull default false` (seated that date, so judged); `hadirPada timestamptz` (check-in); `ubahStatus text enum ["tepat","telat","mm","mangkir","izin"]` (PJ override, null = follow the clock); `ubahMenit integer; hitungMangkir boolean notNull default true; alasan text; ambilAlihDijawab boolean notNull default false; diubahOleh text; diubahPada timestamptz notNull defaultNow`. `unique("hadir_mengajar_satu").on(kunci, nim)`, indexes on `nim`, `tanggal`, `sesiId`.
  - `hadirJam` "hadir_jam" (a PJ's clock shift): `kunci text pk; baseMenit integer notNull` (minutes after 00:00 WIB); `dariMenit integer notNull; alasan text notNull; oleh text notNull; pada timestamptz notNull defaultNow`.
  - `lupaNilai` "lupa_nilai": `id serial pk; sesiId → sesi cascade notNull; kelompokNomor integer notNull; nim text notNull` (holder at the deadline); `kurang jsonb $type<("kirim"|"seelabs")[]> notNull; dicatatPada timestamptz notNull defaultNow; menyusulPada timestamptz`. `unique("lupa_nilai_satu").on(sesiId, kelompokNomor)`, index on `nim`.
  - Doc comment above each table in the file's style (what a row is, who writes it).
- [ ] **Step 2: Generate** `npm run db:generate` in `apps/web`, rename to `0038_hadir_mengajar.sql`, check the SQL creates exactly the three tables, the column and their FKs/indexes, and nothing else.
- [ ] **Step 3: Apply to the throwaway Postgres** (`MIGRATIONS.md:30-62`) and to the rig DB (`localhost:54329/iris_e2e`) with `psql -v ON_ERROR_STOP=1 --single-transaction -f` (strip `--> statement-breakpoint`). Expected: no error, `\d hadir_mengajar` shows the columns.
- [ ] **Step 4: Typecheck** `npx tsc -p tsconfig.api.json --noEmit`. Expected: only the known rig-only `src/lib/db.ts` `pg` error.
- [ ] **Step 5: Commit** `git add apps/web/src/lib/schema.ts apps/web/drizzle/0038_hadir_mengajar.sql apps/web/drizzle/meta/0038_snapshot.json apps/web/drizzle/meta/_journal.json` then commit "web: Phase 18 tables (hadir_mengajar, hadir_jam, lupa_nilai, jadwal.pj)".

### Task 2: The rule (pure)

**Files:**
- Create: `src/lib/hadir-mengajar.ts`
- Test: `src/lib/__tests__/hadir-mengajar.test.ts`

**Interfaces:**
- Produces:
  - `const TELAT_MAKS = 10`, `const POTONGAN_AWAL = { perMenit: 2000, maks: 10 }`, `type Potongan = { perMenit: number; maks: number }`, `bacaPotongan(v: unknown): Potongan`.
  - `type StatusHadir = "tepat" | "telat" | "mm" | "mangkir" | "izin"`; `type StatusLive = StatusHadir | "belum" | "berjalan" | "lewat" | "lepas"` (`lepas` = not expected, never judged).
  - `baseSlot(tanggal: string, slot: number): number` (minutes after 00:00; Friday slot 3 → 780, else `menitDariJam(SLOT_MULAI[slot]) - 5`).
  - `baseSusulan(mulai: string): number`.
  - `instanWib(tanggal: string, menit: number): Date`.
  - `hitungHadir(x: { hadir: Date | null; base: Date; izin: boolean; diharapkan: boolean; selesai: boolean; now: Date; ubah?: { status: StatusHadir; menit?: number | null } | null }): { status: StatusLive; menit: number | null }`.
  - `potonganHadir(h: { status: StatusLive; menit: number | null }, hitungMangkir: boolean, p: Potongan): { nolkanUnit: boolean; potong: number }`.
  - `akhirSesiMaks(tanggal: string, slot: number | null, mulaiPada: Date): number` (minutes of session allowed: min(150, next slot base − start), never below 30).

- [ ] **Step 1: Write the failing tests**, with these cases (base = `instanWib("2026-10-01", baseSlot("2026-10-01", 3))` = 12:25 WIB):
  - `baseSlot("2026-10-01", 3) === 745`, `baseSlot("2026-10-02", 3) === 780` (Friday), `baseSlot("2026-10-02", 4) === 925`, `baseSusulan("10:00") === 595`.
  - check-in 12:25:59 → `{tepat, null}`; 12:26:00 → `{telat, 1}`; 12:35:59 → `{telat, 10}`; 12:36:00 → `{mm, 10}`.
  - no check-in, now 12:25:30 → `belum`; now 12:31:40 → `{berjalan, 6}`; now 12:44 → `{lewat, 10}`; `selesai: true` → `mangkir`.
  - `izin: true` with a check-in → `izin`; `diharapkan: false` → `lepas` whatever the times.
  - same check-in 12:29:31, base moved to 12:45 → `tepat` (Review Focus 3).
  - `ubah: { status: "telat", menit: 3 }` wins over the clock → `{telat, 3}`.
  - `potonganHadir({telat,4}, true, POTONGAN_AWAL)` → `{nolkanUnit:false, potong:8000}`; `{mm,10}` counted → `{true,0}`; `{mm,10}` not counted → `{false,20000}`; `mangkir` → `{true,0}`; `izin`/`tepat`/`lepas` → `{false,0}`.
  - `akhirSesiMaks("2026-10-02", 3, instanWib("2026-10-02", 780)) === 145`; `akhirSesiMaks("2026-10-01", 3, instanWib("2026-10-01", 745)) === 150`; `akhirSesiMaks(x, null, ...) === 150`.
  - `bacaPotongan({perMenit: -1})` falls back to `POTONGAN_AWAL`; `{perMenit: 2500, maks: 15}` kept.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/hadir-mengajar.test.ts --maxWorkers=2`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module (browser safe: imports only `jadwal.ts`, `sesi-mulai.ts`, `jadwal-parser.ts`). File header comment states the rule in two sentences.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** "web: Phase 18 attendance rule (base clock, Telat, Mangkir, cuts)".

### Task 3: Server: check-in, PJ actions, statuses

**Files:**
- Create: `api/_lib/hadir-mengajar.ts`
- Modify: `api/session/[aksi].ts` (dispatch `hadirku`; extend `hadir` POST), `api/_lib/sesi-hadir.ts` (`handleHadirGet` adds statuses; `aksi:"asisten"` becomes the PJ's mark), `src/lib/siaran-topik.ts` (topic `hadir`, `session:hadirku`, new `session:hadir` actions), `src/lib/audit-jenis.ts` (new kinds under `tim`)
- Test: `api/_lib/__tests__/hadir-mengajar.test.ts`, `api/_lib/__tests__/siaran-topik.test.ts` (passes)

**Interfaces:**
- Consumes: Task 1 tables, Task 2 functions.
- Produces:
  - `kunciSlot(jadwalId: number, tanggal: string): string`, `kunciSusulan(sesiId: number): string`.
  - `slotHariIni(db, nim, now): Promise<SlotSaya[]>` where `SlotSaya = { kunci; tanggal; jadwalId: number | null; sesiId: number | null; slot: number | null; base: Date; diharapkan: boolean; izin: boolean; pj: string | null; sesi: { id; status } | null }` for today's slots (and Susulan) the person is seated in, holds a group in, or is PJ of.
  - `pastikanBaris(db, kunci, ctx: { tanggal; jadwalId?; sesiId? }, diharapkan: string[]): Promise<void>` (inserts missing expected rows, sets `sesiId` on the kunci's rows; never clears a check-in).
  - `masuk(db, nim, kunci): Promise<{ ok: true; hadirPada: string } | { ok: false; kode: "tidak_dijadwalkan" | "sudah" }>`.
  - `statusOrang(db, kunci, now): Promise<BarisHadir[]>` with `BarisHadir = { nim; kode; nama; diharapkan; izin; hadirPada: string | null; status: StatusLive; menit: number | null; potong: number; nolkanUnit: boolean; hitungMangkir: boolean; ubah: {status, menit, alasan, oleh} | null }`.
  - `bolehPj(orang, ctx: { pj: string | null; pembuat?: string | null }): boolean` (hakPenuh, or the slot's PJ code, or a Susulan's creator).
  - Routes: `GET /api/session/hadirku` → `{ slot: SlotSaya & { saya: BarisHadir; modul: number | null; bolehMulai: boolean } | null, nilai: NilaiSaya }` (NilaiSaya filled in Task 10, `null` until then); `POST /api/session/hadirku {aksi:"masuk"|"batal"}` (`batal` only within 15 s of the press); `POST /api/session/hadir` new `aksi`: `"status" {kunci, nim, status: StatusHadir | "ikut", menit?, hitungMangkir?, alasan}`, `"geser" {kunci, jam: "HH:MM" | null, alasan}` (works before the session exists, so a shift before :25 also moves the auto-start), `"aa" {kunci, nim, izin: boolean}` (answer the Ambil Alih prompt); `"asisten"` (Tandai Hadir) now needs `bolehPj` and stamps `hadirPada`.
  - `handleHadirGet` adds `hadir: { base: string; geser: {dari, alasan} | null; pj: string | null; bolehPj: boolean; baris: BarisHadir[]; ambilAlih: {nim, kelompok, oleh, pada}[] }`.

- [ ] **Step 1: Failing tests** (mock db like `api/__tests__/server-phase9.test.ts`): `masuk` for a person with no slot today → `tidak_dijadwalkan`; second `masuk` keeps the first `hadirPada` and answers `sudah` (Review Focus 4); `bolehPj` true for hakPenuh, true for `orang.kode === pj`, false for another Asisten; `aksi:"status"` with `alasan.length < 5` → `alasan_kosong`; a PJ changing their own row without hakPenuh → `tanpa_hak`; `geser` writes `hadir_jam` and a `sesi_kejadian` `"jam_geser"` row.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Expected people = `orangTanggal(kursi, tugas)` from `muatMinggu` for the slot date (penugasan-minggu.ts:82), izin from the `izin` table (status ≠ dibatalkan); a Susulan's expected people = holders in `sesi_asisten` at its start plus its creator. Status "izin" from the PJ writes an `izin` row (status `aktif`, `dibuatOleh` the PJ) for a slot. Every write: `writeAudit` (`hadir_masuk`, `hadir_batal`, `hadir_status`, `hadir_geser`, `hadir_izin`, `hadir_tandai`) and `siarkan(["hadir"])` via the route's topics. Ambil Alih prompt: `sesi_kejadian` `"pasangan"` rows whose `dari` is an expected person with no check-in, no izin and `ambilAlihDijawab = false`.
- [ ] **Step 4: Run** the tests and `npx vitest run api/_lib/__tests__/siaran-topik.test.ts --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** "web: Phase 18 check-in, PJ status, clock shift and Ambil Alih answers".

### Task 4: Session start core, auto-start, jam lab job

**Files:**
- Create: `api/_lib/mulai-sesi.ts` (core moved from `api/session/index.ts`), `api/_lib/jam-lab.ts`
- Modify: `api/session/index.ts` (calls the core; checks the starter in), `api/tp/[aksi].ts` (`handleDetak` runs `jamLab`), `api/_lib/tp.ts` (`tidurDetik` ≤ 60 between 05:50 and 00:15 WIB), `api/agent/index.ts` (heartbeat `waitUntil` runs `jamLabBilaPerlu`), `src/components/reports/data.ts` (`kalimatKejadian` "mulai" with `detail.otomatis`)
- Test: `api/_lib/__tests__/jam-lab.test.ts`, existing session-start tests still pass

**Interfaces:**
- Consumes: Task 2 `baseSlot`, `baseSusulan`, `akhirSesiMaks`; Task 3 `pastikanBaris`, `masuk`.
- Produces:
  - `mulaiSesi(db, m: MulaiInput, aktor: string): Promise<{ ok: true; created; demoted; disalin } | { ok: false; kode: string; extra?: object }>` with `MulaiInput = { jenis: "reguler" | "susulan" | "tot"; tanggal; mulai; modul; slot: number | null; draftId: number | null; kelasDiminta; durasiMenit: number; jumlahKelompok?: number; butuhAp: boolean; paksa: string; otomatis?: boolean }`. Holds lines 151-290 of today's handler minus the permission checks; with `otomatis` a soft lab failure starts anyway with `dipaksa = { alasan: "Dimulai otomatis", gagal }`.
  - `slotPerluMulai(x: { now: Date; tanggal; slots: { jadwalId; slot; status; libur: boolean }[]; sesiHariIni: { slot: number | null; status }[]; geser: Map<string, number> }): { jadwalId; slot }[]` (pure).
  - `mulaiOtomatis(db, now: Date): Promise<{ mulai: number[]; tolak: { jadwalId; kode }[] }>`.
  - `jamLab(db, now: Date): Promise<void>` = `mulaiOtomatis` + (Task 10) `catatLupaNilai`; `jamLabBilaPerlu(db)` throttled to once a minute through `pengaturan` key `jam_lab_terakhir`.

- [ ] **Step 1: Failing tests** for `slotPerluMulai`: at 12:25:10 slot 3 active → returned; at 12:24:50 → not; a slot with a session `berjalan`, `selesai` or `batal` that date → not (Review Focus 2); `libur` or `kosong` → not; a shifted base 12:45 at 12:30 → not, at 12:45 → yes; at 12:40 (late trigger) slot 3 still returned until its start window closes; Friday 12:25 slot 3 → not, 13:00 → yes. And `mulaiOtomatis` twice for one slot (mock db where the second insert raises `23505`) → one start, second result has no start (Review Focus 1).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Module for an auto-start: `modulTanggal` with `konteksModul(db, semester, true)`; null module → `tolak` `modul_tidak_diketahui`. Hard refusals (module closed, Mode TOT, holiday, no module) write audit `sesi_otomatis_tolak` and an alert the banner shows (Task 5 reads `GET hadirku`). Group count and roster as a manual start. `durasiMenit = akhirSesiMaks(...)` for auto and for a manual start's default. After any start: `pastikanBaris` for the slot's expected people and `masuk(starter)` if the starter is expected (spec: starting checks you in). Susulan drafts (status `terjadwal`) auto-start at `baseSusulan`. Event: `catatKejadian(id, "mulai", { otomatis: true, dipaksa }, "otomatis")`.
- [ ] **Step 4: Run** the new tests and the whole suite `npx vitest run --maxWorkers=2`. Expected: PASS (index.ts behaviour unchanged).
- [ ] **Step 5: Commit** "web: Phase 18 auto-start at :25 on the relay beat, session cap at the next slot".

### Task 5: Shell banner (reminder + check-in)

**Files:**
- Create: `src/components/shell/HadirNotice.tsx`, `src/components/shell/hadirStrings.ts`
- Modify: `src/components/shell/AppNav.tsx` (one line in `AlertRail`, before `LabAlert`), the shell CSS file AlertRail banners use

**Interfaces:**
- Consumes: `GET/POST /api/session/hadirku` (Task 3), existing `POST /api/session` start, `useSiaran(["hadir","sesi","jadwal"])`.
- Produces: `HadirNotice({ lang, me })` rendering one root `.banner` or null.

- [ ] **Step 1:** Build the banner as in mockup screen `k18-beranda`: states pra (countdown mm:ss to base, Mulai Sesi Sekarang + Saya Sudah di Ruang Praktikum), berjalan (ten cells, cut so far), lewat (danger), receipt after the press (status + pay line, Batalkan for 10 s), izin, Friday note; "Cara Dihitung" popover with the five rule rows. Copy from `screens-hadir18.js` (ID/EN), Mandarin from `app/i18n-zh18.js`. Motion: enter fade + 6px rise 220ms `cubic-bezier(0.23,1,0.32,1)`; no animation on the countdown, cells or amounts; reduced motion keeps the fade.
- [ ] **Step 2:** Rig check at 1440×900 and 390×844 with `/__rig/jam` set to 12:14, 12:28, 12:41 on a Thursday: each state shows, the press stamps, Batalkan works, no sideways scroll.
- [ ] **Step 3:** `npm run check`, `npm run lint`. Expected: clean (rig db.ts aside).
- [ ] **Step 4: Commit** "web: Phase 18 attendance banner on every Asisten page".

### Task 6: Yang Mengajar for the PJ

**Files:**
- Modify: `src/components/console/LivePrep.tsx` (panel lines ~200-284), `src/components/console/strings.ts` (`lp` block: id ~278, en ~861, zh ~1437), `src/components/console/console.css`
- Create: `src/components/console/HadirTrack.tsx`, `src/components/console/HadirDialogs.tsx` (Geser Jam Sesi, Ubah Status)

**Interfaces:**
- Consumes: `handleHadirGet` `hadir` block and `POST /api/session/hadir` actions (Task 3).

- [ ] **Step 1:** Per mockup `k18-mengajar`: `teachHint` becomes "Hadir dihitung dari tombol Saya Sudah di Ruang Praktikum, atau saat PJ menandainya." (en/zh to match); each row adds the status pill and pay line; the PJ chip and Geser Jam Sesi in the head; the track (zones, dots, moving now line, legend); Ubah (ghost, trailing caret) on each row for `bolehPj`, disabled on the PJ's own row unless hakPenuh; the Ambil Alih prompt (Tetap Dinilai Jam / Tandai Izin); Tandai Hadir only for `bolehPj`. Dialogs: Geser Jam Sesi (TimeField in 5-minute steps from base to base+60, reason ≥ 5, preview of the new times, FootAlt "Kembali ke HH:MM" when shifted) and Ubah Status (six radio cards in two columns, minutes stepper for Telat, Hitung sebagai Mangkir switch for Mangkir Mengajar, the pay line, reason ≥ 5).
- [ ] **Step 2:** Rig: a running Thursday slot 3 session with five expected Asisten; check each status, a shift, a change, the prompt, as PJ and as a plain Asisten; 1440 and 390.
- [ ] **Step 3:** check + lint clean. **Step 4: Commit** "web: Phase 18 Yang Mengajar statuses and PJ controls".

### Task 7: Jadwal slot drawer: PJ and the clock

**Files:**
- Modify: `src/components/schedule/SlotEditor.tsx` (`Draft` in `awal()` :80-109, `save()` :262-282, a field in fieldset 1 before :390, read-only clock facts), `api/_lib/penugasan-api.ts` (`ubahSlot` patch `pj`, :414-476), schedule strings file

**Interfaces:**
- Consumes: `jadwal.pj` (Task 1), `baseSlot` (Task 2).

- [ ] **Step 1: Failing test** in `api/_lib/__tests__/penugasan-api.test.ts` (or the nearest existing schedule test): `ubah.pj` must be one of the slot's `asisten` codes or null, else `format_salah`; saved and audited in `jadwal_ubah`.
- [ ] **Step 2:** Implement server, then UI: a Dropdown "Penanggung Jawab" from `pickOpts` limited to the slot's Asisten, the hint from mockup `k18-jadwal`, and four read-only facts (Mulai Otomatis, Telat, Mangkir Mengajar, Paling Lama Sampai) with the Friday note. Izin keeps using the existing izin seats (no new list).
- [ ] **Step 3:** test PASS, check + lint clean, rig look at 1440 and 390. **Step 4: Commit** "web: Phase 18 slot PJ and clock in the Jadwal drawer".

### Task 8: Pay: zero units, cut lines, rate setting

**Files:**
- Modify: `api/_lib/bayar.ts` (`sinkronUnit` :114, `sinkronYangBerubah` :156-162 adds `max(hadir_mengajar.diubah_pada)`, `handleBayarGet` returns `potongan`, POST `aksi:"potongan"`), `src/lib/bayar.ts` (`jumlahkan` :117, `sisaTransfer` :140 subtract cuts), `src/components/bayar/data.ts`, `Earnings.tsx`, `PayBoard.tsx`, `strings.ts`
- Test: `src/lib/__tests__/bayar.test.ts` (existing file, add cases)

**Interfaces:**
- Consumes: `statusOrang` (Task 3), `potonganHadir`, `bacaPotongan` (Task 2).
- Produces: `BayarData.potongan: { sesiId; tanggal; slot: number | null; nim; jumlah; menit: number | null; status: StatusHadir }[]`, `BayarData.tarifPotongan: Potongan`.

- [ ] **Step 1: Failing tests:** `jumlahkan(units, potongan)` subtracts cuts from `bersih` and `kotor`, never below 0 for a month; `sisaTransfer` owes the Bendahara's `kotor` line minus that person's cuts in the period.
- [ ] **Step 2:** Implement: `sinkronUnit` skips (deletes) a unit whose `nimPenilai` has `nolkanUnit` for that session; cut lines come from finished, non-TOT sessions; `aksi:"potongan"` (Tim right) writes `pengaturan potongan_telat`, audit `potongan_tarif`. UI: a "Potongan Telat" line per cut and a struck line per zeroed session in `EarningsCard` (reuse `.kasfig__cut` style); the two steppers in PayBoard's rates editor; PayBoard's transfer hint adds "N kelompok lewat akun pinjaman" from units whose `nimAkunSeelabs ≠ nimPenilai`.
- [ ] **Step 3:** tests PASS, check + lint. **Step 4: Commit** "web: Phase 18 automatic cuts in Bayar".

### Task 9: SeeLabs: two sessions per account per day

**Files:**
- Modify: `src/lib/seelabs.ts` (`akunKelompok` :190), `api/_lib/seelabs.ts` (`muatSeelabs`, `pemberiPinjam` :223, `aksi:"akun"` :321-345), `src/components/console/GroupInspector.tsx` (`LenderBanner` :922-978), seelabs strings
- Test: `src/lib/__tests__/seelabs.test.ts`

**Interfaces:**
- Produces:
  - `akunKelompok(pasangan, pinjam, penuh: ReadonlySet<string> = new Set())`: a holder in `penuh` gets a lender for their lowest group too.
  - `pemakaianAkunHari(db, tanggal: string, kecuali: number): Promise<Map<string, { sesiId; mulai }[]>>` (accounts used in other non-TOT, non-batal sessions that date: each holder's own lowest group, plus the latest `akun_seelabs` lender per group).
  - `SesiSeelabs.pemberiTolak: { nim: string; alasan: "pegang" | "dua_sesi" | "dipinjam" }[]` beside the unchanged `pemberi`.

- [ ] **Step 1: Failing tests:** `akunKelompok` with `penuh = {NUE}` and NUE holding groups 1 and 2 → both need a lender (null until picked); without `penuh` → group 1 is NUE's own (existing behaviour kept).
- [ ] **Step 2:** Implement: `penuh` = holders whose account carries two sessions that day starting earlier (by `mulai`, then id); lenders exclude holders here, accounts with two other sessions that day, and an account already lent to another group of this session; `aksi:"akun"`'s `tidak_perlu_pinjam` uses the capped `akunKelompok`. LenderBanner shows the excluded people dimmed with the reason (mockup "Pilih Akun SeeLabs" copy) and the banner line "Sesi ketigamu hari ini" when the reason is the cap.
- [ ] **Step 3:** tests PASS (old seelabs tests too), check + lint. **Step 4: Commit** "web: Phase 18 SeeLabs account carries at most two sessions a day".

### Task 10: Lupa Input Nilai

**Files:**
- Create: `src/lib/lupa-nilai.ts` (pure), `src/lib/__tests__/lupa-nilai.test.ts`
- Modify: `api/_lib/jam-lab.ts` (`catatLupaNilai`), `api/_lib/hadir-mengajar.ts` (`GET hadirku` `nilai`), `api/_lib/beranda.ts` (`belumSimpan`, `lupa`, `pjBelum`), `src/components/shell/HadirNotice.tsx` (score reminder state), `src/components/console/AsistenHome.tsx` (inbox rows), `src/components/console/EndFlow.tsx` (unsent groups in the checklist), `src/components/console/NilaiTable.tsx` (ended session: Alihkan Penilaian for the PJ, mounting the existing `ChangeAssistant`), `src/components/console/DayCard.tsx` (badge count), strings files

**Interfaces:**
- Produces:
  - `langkahKelompok(g: { lengkap: boolean; terkirim: boolean; tersimpan: boolean; robot: "antre" | "gagal" | null; butuhAkun: boolean }): { selesai: boolean; kurang: ("lengkap"|"akun"|"kirim"|"seelabs")[] }`.
  - `pengingatNilai(tanggal: string, now: Date): "akhir" | "malam" | "terakhir" | "robot" | "lewat"` (session end until 20:00, 20:00, 22:30, 23:00, after 23:59:59).
  - `catatLupaNilai(db, now): Promise<number>` (rows inserted; also stamps `menyusulPada` when a recorded group is now saved).

- [ ] **Step 1: Failing tests:** `pengingatNilai("2026-10-01", 2026-10-01T14:55+07)` → `akhir`, 20:00 → `malam`, 22:30 → `terakhir`, 23:00 → `robot`, `2026-10-02T00:00+07` → `lewat`; `langkahKelompok` for sent and saved → `selesai`; sent, robot failed → `kurang: ["seelabs"]`; a second group without a lender → `kurang` starts with `"akun"`.
- [ ] **Step 2:** Implement per spec "Everything around it": the banner's score state (count, deadline, primary action to the Konsol table or Pilih Akun or the existing robot token form in `RobotInbox`); EndFlow lists the caller's groups not yet sent (ending still allowed); Konsol inbox rows for "sent, not in SeeLabs" and "Lupa Input Nilai" with their deadline; the PJ sees the session's open groups (Konsol inbox section and the 22:30 banner); Alihkan Penilaian = existing `ChangeAssistant` with `alasan:"ubah"` on finished sessions for `bolehPj`; `catatLupaNilai` runs inside `jamLab` for sessions of the last 3 days.
- [ ] **Step 3:** tests PASS, check + lint, rig: end a session with one group unsent, move `/__rig/jam` to 20:00, 22:30, next day 00:01, then save it: each reminder, the record, "Diinput Menyusul". **Step 4: Commit** "web: Phase 18 Lupa Input Nilai, reminders to the end of the day".

### Task 11: Tidak Hadir keeps TP

**Files:**
- Modify: `api/session/[aksi].ts` (:1139-1159)
- Test: the existing nilai handler test file under `api/__tests__/` (add a case), or a new `api/__tests__/nilai-absen.test.ts`

- [ ] **Step 1: Failing test:** marking a member absent writes 0 for the seven non-TP parts, leaves an existing TP row untouched, and inserts TP 0 only when there is none (`onConflictDoNothing`); taking it back deletes zero rows except TP.
- [ ] **Step 2:** Implement (`NILAI_KOMPONEN.filter((k) => k !== "TP")`, plus the TP-if-missing insert). **Step 3:** test PASS. **Step 4: Commit** "web: Tidak Hadir keeps the member's TP".

### Task 12: Reports, Tim, Akun

**Files:**
- Modify: `api/_lib/laporan-data.ts` (`handleRekapGet` :581-609 adds `hadirAsisten`, `inputNilai`), `src/components/reports/SessionPage.tsx` (two cards after the group cards :304-325, Salin Teks Laporan), `src/components/reports/DataSemester.tsx` (Kehadiran Asisten table), `src/components/reports/data.ts` (`kalimatKejadian`: `jam_geser`, `hadir_status`), `src/components/reports/audit.ts` (phrases for every Task 3/8 audit kind, id/en/zh), `api/_lib/tim.ts` + `src/components/team/TeamPage.tsx` (Kehadiran Mengajar section between Slot :1037 and DrawerPay :1039, as ac51562 did), `src/components/account/AccountPage.tsx` (+css: "Kehadiranku" full-width card after `EarningsCard` :307), the strings files
- Test: `src/lib/__tests__/hadir-teks.test.ts` for `teksLaporanHadir(...)` in `src/lib/hadir-mengajar.ts`

- [ ] **Step 1: Failing test:** `teksLaporanHadir` builds the mockup's report sentence for the sample session (auto start, no shift, YEN tepat, ADD telat 4 with Rp8.000, REG Mangkir with the take over, MAP Izin, groups 4 and 5 Lupa Input Nilai put in late) and contains no "—" or "–".
- [ ] **Step 2:** Implement the data and the UI per mockup `k18-laporan`, `k18-tim`, `k18-bayar` (Akun part). **Step 3:** test PASS, check + lint, rig look. **Step 4: Commit** "web: Phase 18 attendance and score input in Laporan, Tim and Akun".

### Task 13: Whole check and deploy readiness

- [ ] **Step 1:** `npx vitest run --maxWorkers=2`, `npm run check`, `npm run lint`, `npm run format:check`, `PYTHONUTF8=1 python` secret scan as CI. Expected: all clean (rig db.ts aside).
- [ ] **Step 2:** Rig day run with `/__rig/jam`: Thursday 12:14 → 12:25 auto-start (relay-less: call `jamLab` through `POST /api/tp/detak` signed with the rig secret) → check-ins → shift → end → reminders → next day record. Friday slot 3 at 13:00.
- [ ] **Step 3:** `rig/pop2.mjs`, `rig/pop4.mjs`, `rig/leak_api.mjs` (add `hadirku`), `rig/leak_pages.mjs`, `rig/idor_probe.mjs`: no dead buttons, no Asisten data for a Praktikan or a signed-out visitor.
- [ ] **Step 4:** Report to the user and wait for the deploy go. Deploy = pg_dump prod, apply 0038 by hand, then `git push origin phase9-global-and-asisten:main`, then check Smoke and the first live :25.
