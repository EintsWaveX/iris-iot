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
   connection string — `vercel env pull apps/web/.env.local` writes
   `DATABASE_URL`, or copy it from the Neon dashboard directly. Use the
   _direct_ connection for a migration, not a pgbouncer-pooled one; DDL
   under a connection pooler can behave unpredictably with prepared
   statements. Then:

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

| File                               | What it adds                                                                                                                  | Applied to production                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `0000_overrated_morlocks.sql`      | Phase 1 foundation (asisten, sesi, regu, praktikan, percobaan_masuk, audit)                                                   | Yes                                                                                                                                      |
| `0001_daily_zuras.sql`             | Phase 2 server/device registry (server, denyut, perangkat, perintah)                                                          | Yes                                                                                                                                      |
| `0002_roster_kelompok_anggota.sql` | Phase 3 master roster (kelompok, anggota, sesi_kelompok)                                                                      | **Yes — as of 2026-09-22, applied directly during Stage 4** (see note below)                                                             |
| `0003_violet_sentinels.sql`        | Phase 5 Stage 4: presentasi table, jawaban's benar/percobaan + nullable sesiId, sesi's slot/butuh_ap, asisten's password_hash | Yes — 2026-09-22                                                                                                                         |
| `0004_graceful_vampiro.sql`        | Phase 5 Stage 10: sesi's pengumuman/pengumuman_pada (the broadcast)                                                           | **No — verified against a throwaway Postgres only, not yet run against production. Apply with step 4 above before Stage 10 ships live.** |

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
