# Applying a migration

Drizzle's own `db:migrate` script (`drizzle-kit migrate`) does not work
against this project's database. `src/lib/db.ts` uses
`drizzle-orm/neon-serverless`, which speaks Neon's proprietary WebSocket
protocol rather than plain Postgres wire protocol, and `drizzle-kit migrate`
hardcodes that same driver — it has no way to connect to a throwaway local
Postgres instance for testing, and no CI job runs it, so `drizzle/*.sql`
files are applied by hand with `psql`. This has been true since migration
0000; nothing about that changed in Stage 4, it was just never written down
until the presentasi/jawaban/sesi/asisten migration made it worth doing
before a fourth undocumented manual apply happened.

## Procedure

1. **Generate.** After editing `src/lib/schema.ts`, run:

   ```
   npm run db:generate
   ```

   This reads the schema and the existing `drizzle/meta/_journal.json`
   snapshot and writes the next `drizzle/000N_*.sql` file. It needs no live
   database connection — it only diffs against the local snapshot history.

2. **Read the generated SQL.** Drizzle's diff is usually right but is not
   guaranteed to be the migration you meant (a renamed column becomes a drop
   - add unless you answer its interactive prompt correctly, which silently
     loses data). Read the file before it goes anywhere near production.

3. **Test against a throwaway local Postgres first, always.** This project
   has a real local PostgreSQL 18 install (`Program Files\PostgreSQL\18`) as
   a Windows service, but that service is a shared, persistent instance —
   never point a migration test at it directly. Instead, initialise an
   isolated, disposable instance in a scratch directory:

   ```
   initdb -D <scratch>/pgdata-throwaway -U testuser -A trust --no-locale -E UTF8
   pg_ctl -D <scratch>/pgdata-throwaway -l <scratch>/pg.log -o "-p 54329" start
   createdb -h localhost -p 54329 -U testuser iris_test
   ```

   Apply every migration in order, including the new one, and confirm each
   one exits clean:

   ```
   for f in drizzle/0000_*.sql drizzle/0001_*.sql ...; do
     psql -h localhost -p 54329 -U testuser -d iris_test -v ON_ERROR_STOP=1 -f "$f"
   done
   ```

   To exercise real application code (not just raw SQL) against this
   instance, temporarily add an env-gated branch to `getDb()` in `db.ts`
   that routes to `drizzle-orm/node-postgres` (`npm install pg --no-save`,
   not a real dependency of this project) when `process.env.LOCAL_TEST_PG`
   is set, run whatever handler-level script proves the change, then revert
   `db.ts` and remove `pg` completely before committing — neither belongs in
   the repo. This is how Phase 3 steps 3/4 and Phase 5 Stage 4 were each
   verified; see their commit messages for the specific checks each one ran.

   When done, stop the throwaway instance and delete its data directory:

   ```
   pg_ctl -D <scratch>/pgdata-throwaway stop -m fast
   ```

4. **Apply to the real database.** Get the direct (non-pooled) Neon
   connection string — `vercel env pull apps/web/.env.local` writes it as
   `DATABASE_URL_UNPOOLED` (`DATABASE_URL` is the pooled one), or copy it
   from the Neon dashboard directly. Use the _direct_ connection for a
   migration, not a pgbouncer-pooled one; DDL under a connection pooler can
   behave unpredictably with prepared statements.

   `vercel env pull` only writes the file; it does not set anything in your
   shell. Load the value without printing it (PowerShell, from `apps/web`):

   ```
   $env:DIRECT_DATABASE_URL = ((Select-String -Path .env.local -Pattern '^DATABASE_URL_UNPOOLED=').Line -replace '^DATABASE_URL_UNPOOLED=', '').Trim('"')
   psql "$env:DIRECT_DATABASE_URL" -c "select 1"
   ```

   or in bash: `export DIRECT_DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')"`.
   If `psql` answers with a `localhost` / port 5432 error, the variable is
   empty and it fell back to a local server. Then:

   ```
   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/000N_name.sql
   ```

5. **There is no applied-migrations tracking table**, because that
   bookkeeping is `drizzle-kit migrate`'s job and this project doesn't use
   it. The only record of what has been applied to production is: this
   file's step 4 having been run, the corresponding git commit, and the
   database's actual current shape. Before applying a migration, confirm
   what's already there instead of trusting a number:

   ```
   psql "$DIRECT_DATABASE_URL" -c "\d asisten"   -- does password_hash exist yet?
   ```

## Migrations applied so far

| File                                           | What it adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Applied to production                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `0000_overrated_morlocks.sql`                  | Phase 1 foundation (asisten, sesi, regu, praktikan, percobaan_masuk, audit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Yes                                                                                                                    |
| `0001_daily_zuras.sql`                         | Phase 2 server/device registry (server, denyut, perangkat, perintah)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Yes                                                                                                                    |
| `0002_roster_kelompok_anggota.sql`             | Phase 3 master roster (kelompok, anggota, sesi_kelompok)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Yes — as of 2026-09-22, applied directly during Stage 4** (see note below)                                           |
| `0003_violet_sentinels.sql`                    | Phase 5 Stage 4: presentasi table, jawaban's benar/percobaan + nullable sesiId, sesi's slot/butuh_ap, asisten's password_hash                                                                                                                                                                                                                                                                                                                                                                                                                                      | Yes — 2026-09-22                                                                                                       |
| `0004_graceful_vampiro.sql`                    | Phase 5 Stage 10: sesi's pengumuman/pengumuman_pada (the broadcast)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes — 2026-09-23                                                                                                       |
| `0005_charming_starfox.sql`                    | Phase 5 Stage 20: telemetri_terkini (one row per server+modul+group) and telemetri_log (append-only, for /history)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Yes — 2026-09-23                                                                                                       |
| `0006_gorgeous_mulholland_black.sql`           | Phase 6, Stage P6.2: `pengaturan` (seeded `modul_terbuka=[1]`); `server`'s catatan/lokasi/agen_versi/info_sistem(_pada); `perangkat`'s kelompok_nomor/disembunyikan; `percobaan_masuk.sesi_id`; `telemetri_log`'s server_id/diukur_pada; `perintah.terkirim_pada`                                                                                                                                                                                                                                                                                                  | Yes — 2026-09-24                                                                                                       |
| `0007_amusing_the_watchers.sql`                | Stage 21 (1/2): creates `arsip_regu`/`arsip_praktikan`, the archived shape of the retired Phase 1 tables                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Yes — 2026-09-24                                                                                                       |
| `0008_yielding_paibok.sql`                     | Stage 21 (2/2): drops `regu`/`praktikan` (both confirmed empty; see the note below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes — 2026-09-24                                                                                                       |
| `0009_reflective_doctor_octopus.sql`           | Stage 12: `nilai` (one row per session/NIM/grading component: TP, TA, D1-D4, L1, L2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Yes — 2026-09-25                                                                                                       |
| `0010_phase8_penugasan_umpan_balik_jadwal.sql` | Phase 8: `jadwal` (week grid per semester), `sesi_asisten` (one assistant per group per session), `umpan_balik` (anonymous Asisten + Lab feedback); `sesi.kelas`; `sesi_kelompok.minta_bantuan_pada` (raise hand)                                                                                                                                                                                                                                                                                                                                                  | Yes — 2026-09-30                                                                                                       |
| `0011_phase8_skema.sql`                        | Phase 8: `skema` (per-module schematic uploads, at most one active per module via a partial unique index)                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Yes — 2026-09-30                                                                                                       |
| `0012_phase9_jabatan.sql`                      | Phase 9 Stage 2: `asisten`'s divisi/tier/badges/status/seelabs_akun/hak_override; `jabatan_pemegang` (one open holder per head role, partial unique index) and `serah_terima`; data: RGZ to REG and FAT to TIR (also in `jadwal`), NUE's name, divisions, the ten holders from the handbook, tiers, DEV and Pencipta badges                                                                                                                                                                                                                                        | No (Phase 9 ships in one deploy at the end; tested on a throwaway DB with the real roster)                             |
| `0013_phase9_roster.sql`                       | Phase 9 Stage 3: `sesi` durasi_menit (30 to 150)/jenis/jumlah_kelompok (1 to 10)/lanjutan_dari; `jadwal` jumlah_kelompok/anggota_per_kelompok/jendela_mulai_menit (5 to 30)/jendela_diatur_oleh; `kelompok.klp_seelabs`; `presentasi`/`skema` jenis (berkas or tautan); new `praktikan`, `roster_kelompok`, `roster_slot`, `roster_susulan`, `sesi_anggota`, `modul_brief`, `sesi_kejadian`, `seelabs_ekspor`; CHECK bounds; data: `pengaturan` jendela_mulai_default 15 and jendela_mulai_batas 5 to 30, today's `anggota` copied into `praktikan`                | No (Phase 9 ships in one deploy at the end; tested on a throwaway DB, and the whole chain 0000 to 0013 on a fresh one) |
| `0014_phase9_penugasan.sql`                    | Phase 9 Stage 4: `jadwal` status gains `kosong` with `warna_kosong` (oranye or merah), `libur_tanggal` (a holiday on one date) and `diubah_oleh`; new `penugasan_slot` (who covers, volunteers or helps a slot on one date, with diminta/diterima/ditolak) and `izin` (an Asisten excused on one date, `dicari` while looking for cover); CHECK constraints; data: the Ganjil 2026 sheet's empty slots as No Practicum (orange: Monday, Tuesday slot 4, Saturday slot 4; red: Tuesday slots 2 and 3, Wednesday slots 1 and 2), only where a slot has no assistants | No (Phase 9 ships in one deploy at the end; tested on a throwaway DB, and the whole chain 0000 to 0014 on a fresh one) |
| `0015_phase9_server.sql`                       | Phase 9 Stage 5: `server` gains `kondisi` (jsonb, the newest heartbeat `kondisi` block: load average, memory, swap and disk bytes, uplink traffic, clock offset), `kondisi_pada` and `riwayat_sejak` (History events before it are hidden after "Kosongkan log"; denyut rows stay)                                                                                                                                                                                                                                                                                 | No (Phase 9 ships in one deploy at the end; tested on a throwaway DB)                                                  |
| `0016_phase9_bayar_laporan.sql`                | Phase 9 Stage 6: payments `kas_tarif` (per semester, from a date, the starting 10% row), `kas_pengecualian` (per person and semester), `unit_bayar` (one scored group, with the class rate and the kas rate it was paid at), `transfer` (`kotor` from the Bendahara or `balik` to the Kas IRIS, per month), `sesi.bayar_sinkron_pada`; written reports `laporan`, `laporan_komentar`, `laporan_lampiran`                                                                                                                                                           | No (Phase 9 ships in one deploy at the end; tested on a throwaway DB)                                                  |
| `0017_phase9_telemetri_nilai.sql`              | Phase 9 Stage 7e: `telemetri_log` and `telemetri_terkini` gain `nilai` (jsonb: M2 `suhu`/`lembap`, M3 `posisi`, M4 `rssiHalus`/`jarak`/`tren`/`hilang`) and `snr` becomes `real` (the integer column dropped the Hunter's 7.5 dB)                                                                                                                                                                                                                                                                                                                                  | No (Phase 9 ships in one deploy at the end; tested on a throwaway DB)                                                  |

### Phase 8: 0010 and 0011 verified column by column

Applied by the user with `psql` on 2026-09-30. Afterwards the live
database was read back through `information_schema` and `pg_constraint`
and matched against both files: every column with its type, nullability
and default, the three unique constraints (`jadwal_slot_unik`,
`sesi_asisten_unik`, `umpan_balik_sesi_nim`), all five foreign keys,
`umpan_balik_asisten_idx`, and the partial `skema_aktif_per_modul` index.
The four new tables were empty at that point, and all 25 `asisten` rows
already carried a `kode`, which the schedule import matches against.

### Stage 12: grading, keyed against the real Seelabs form

The plan that first scoped this table guessed `I1`/`I2` as placeholder
component names before anyone had actually opened Seelabs' own "Input Nilai
Praktikum" form. This stage opened the real form live and corrected the set
to what it actually shows: `TP`, `TA`, `D1`-`D4`, `L1`, `L2`. `nilai` is one
row per `(sesi_id, nim, komponen)` rather than one wide row per student, so
the grading tab's autosave is a single upsert per field
(`unique(sesi_id, nim, komponen)`, via `onConflictDoUpdate`) instead of a
read-modify-write of a whole row.

### Stage 21: `regu`/`praktikan` retired, `scripts/backfill-roster.ts` deleted

Both tables were already confirmed empty in production by the 2026-09-22
note below, and every code path that ever read them (`resolvePraktikan()`,
`publicRoster()`, `jadwalModul4Hari()` in `src/lib/sesi.ts`) only did so as
a fallback for an environment where migration 0002's master roster
(`kelompok`/`anggota`) hadn't been backfilled yet — a state production has
never actually been in. Migrations 0007 and 0008 together archive both
tables as `arsip_regu`/`arsip_praktikan` (0007 creates the archive pair,
0008 drops the originals) instead of a single `ALTER TABLE ... RENAME TO`:
drizzle-kit's rename detection needs an interactive prompt to disambiguate
a rename from a drop-and-recreate, and this project's `db:generate` runs in
a non-TTY environment that can't answer one. Two migrations reach the same
end state, and since both tables are confirmed empty there is no data a
true rename would have preserved that this loses. Every fallback branch
that used to read `regu`/`praktikan` is also gone.
`scripts/backfill-roster.ts`, whose only job was populating
`kelompok`/`anggota` from those two tables, has no schema left to read from
and is deleted outright rather than left as dead code that would fail
confusingly if ever run.

Applied to production 2026-09-24, per this file's own step 5 rule of
checking what's already there before applying — the step given to the user
alongside `select (select count(*) from regu) regu, (select count(*) from praktikan) praktikan` —
consistent with the 2026-09-22 note below.

### 2026-09-22: migration 0002 had never actually reached production

PHASE3.md recorded Phase 3's schema step as done and "verified against a
real (throwaway local) Postgres" — true, but that verification never
implied 0002 had been applied to the _actual_ Neon database, and it hadn't
been. Production had only ever received 0000 and 0001; `kelompok`,
`anggota`, `sesi_kelompok` and `jawaban` did not exist. Since
`resolvePraktikan()` calls `masterRosterIsPopulated()` unconditionally
(`SELECT count(*) FROM anggota`), every student login attempt against real
production was throwing on the missing table and surfacing as
`galat_server` — a live-breaking bug, independent of anything in Stage 4,
caught only because Stage 4's own migration made it necessary to open a
real connection to production and check what was actually there first.

0002 was applied immediately before 0003, in order, and both were verified
against a throwaway local Postgres beforehand per the procedure above.
Both `anggota` and the legacy `praktikan` table were confirmed empty in
production before and after — no practicum has gone live on this database
yet, so there was nothing to lose and no backfill was needed. The lesson:
step 5 of this procedure ("confirm what's already there instead of trusting
a number") is not optional busywork; run it before every migration, even
one that looks purely additive.
