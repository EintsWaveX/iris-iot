<!-- Approved by the user on 2026-11-15 (plan mode). Phases ship as separate PRs; results are recorded under apps/web/perf/. -->

# IRIS web: full real-time + server performance upgrade (PC server)

## Context

Vercel and Neon are gone (15 Nov 2026). The site, API and Postgres run as one Node process on the lab PC behind Cloudflare. Many limits in the code were set to save Neon compute and Vercel requests, and no longer apply. Goal (user): everything that can live-update does so in real time; the server is as fast and solid as the hardware allows; built for **about 1,000 open pages at once**. The second, stronger PC is only a spec hint: keep the work server-agnostic (env config, no machine-specific paths) so it runs the same on the new box.

Decisions made with the user:

1. **Live hub moves into the PC server** (Postgres NOTIFY as the bus). The Cloudflare Worker stays only for Konsol (SSH/HDMI), TP files (R2), and as a fallback during rollout.
2. **Topics plus a very fast shared cache first, then push the data itself for the hottest views** (with per-role filtering). Not "push everything".
3. **Target load ~1,000 pages**, so multi-core and raised socket limits are in scope.

## What research found (from three read-only audits)

- Browser side is already mostly push: one `/siaran` socket per tab, topic names only, pages refetch on a topic. `usePoll` with topics has **no timer of its own**, so most "60 s/120 s" intervals are inert; the real backstop is `SAFETY_MS = 300 s` (`src/lib/siaran.ts:36`, set to save Vercel requests).
- True interval-only or non-live spots: `useRecQrRecent` (`lib/recruitment/client.ts:254`), `WebUpgrade.tsx` job status (3 s/20 s hand loop), hunt key ask (`LiveRoom.tsx:366`), judge polls (`LccPage.tsx:146` 1.5 s, `ProblemsTab.tsx:367` 2.5 s), no subscription on `Kandidat.tsx` detail and `BerkasReview.tsx`, `useCekJudge` snapshots, `latihan-client.ts`.
- Relay path today: PC → home uplink → Cloudflare Worker → one global Durable Object `/siaran` → browsers, HMAC per write, 1.5 s timeout, **no retry, no replay**; `/siaran` is unauthenticated and broadcasts topic names only. Rooms (`/aliran/sesi-N|pc`, `/ujian/rec-N`) carry data with role filters in pure functions (`src/lib/aliran.ts` `bolehTerima`/`saringNaik`, `room-relay.ts`) that can be reused as-is.
- Server: **one Node process, one core of the PC's many**, plain HTTP/1.1, boots via `tsx` (transpiles ~60k lines each start). The only socket path is `server/kuis.ts` (single `upgrade` listener that destroys any other path).
- Cost-era logic to delete: quiet hours `jamSepi` (`src/lib/sesi-mulai.ts`), agent beat intervals 60/600 s (`src/lib/server-lib.ts:56-68`, `api/agent/index.ts:370-388`), SeeLabs night skip (`src/lib/seelabs-baca.ts:150-160`), Worker minute cron (`apps/relay/wrangler.toml`), `s-maxage` headers that do nothing now, `kosong` relay skip map, `waitUntil` shims.
- Heavy spots: `currentSesi()` uncached on nearly every request; `handleLaporan` loads all `telemetri_log` rows and aggregates in JS (polled every 6 s); `argon2Sync` blocks the event loop on every candidate sign-in; heartbeat handler runs ~15-20 sequential awaits; per-NIM N+1 loops in the score-write path (`api/session/[aksi].ts:1080,1200`); missing indexes (`telemetri_log.dicatat_pada`, `denyut.pada`, audit `detail LIKE`, `rec_answer.question_id`); no Postgres tuning in repo; module-level `ruteKini` in `api/_lib/galat.ts` is unsafe on one concurrent process.
- Delivery: no HTML/API edge caching, Home loads 11 render-blocking stylesheets (232 KB) because chunk-merging was tuned for Vercel's request quota (`astro.config.mjs:41-95`), every island is `client:load`, no prefetch/modulepreload, compression happens at first request (lost on restart).
- Nothing measured yet: no baseline, no 1,000-socket test, no per-route timing.

## Approach (phases, each independently deployable; deploy outside class hours via the Upgrade button)

### Phase 0: Baseline and observability (first, so gains are provable)

- Per-route timing log (route, status, ms, query count, db ms) and a 50 ms slow threshold; extend `/api/sehat` with pool state (`statusKolam` in `src/lib/db.ts`), socket counts, event-loop lag (`server/jeda.ts`).
- `scripts/fanout.mjs`: N sockets (to 1,000) + a write driver, measures write → receipt p50/p95/p99 for `/siaran`, session rooms, exam rooms; stores baseline JSON in the repo.
- Document and enable `pg_stat_statements` and the 300 ms slow log in `deploy/DEPLOY.md`; capture top queries and seq-scan stats as the DB baseline. Web baseline: page weights, stylesheet counts, TTFB.

### Phase 1: Quick server wins

- `argon2Sync` → async (`src/lib/auth.ts:99`); 1 s in-process cache for `currentSesi()` (`src/lib/sesi.ts`), invalidated on session start/end/extend.
- `handleLaporan` aggregation into SQL (`GROUP BY`, `percentile_cont`); remove per-NIM N+1 in `kelompokNilai`/audit writes; parallelize independent heartbeat checks.
- Migration `0067`: `telemetri_log(dicatat_pada)`, `denyut(pada)`, audit session column/index (replace `LIKE` scans at `api/_lib/laporan-data.ts:519,716`), `rec_answer(question_id)`, verify `anggota(nim)`. Applied by hand with `psql`.
- Fix `ruteKini` with `AsyncLocalStorage`; remove dead `s-maxage`; delete cost-era quiet-hours/interval logic; precompress `.br/.gz` in `deploy.sh`; faster boot (Node compile cache or bundling the API).
- Postgres tuning blocks (shared_buffers, effective_cache_size, work_mem, random_page_cost, autovacuum for `denyut`/`telemetri_log`) given to the user to run with sudo.

### Phase 2: In-process live hub (replaces the Worker fan-out)

- New `apps/web/server/hub/`: one `upgrade` dispatcher in `main.ts` (refactor `server/kuis.ts:400-440` to return "not mine" instead of destroying); same-origin `/siaran`, `/aliran/*`, `/ujian/*`.
- `/siaran`: anonymous topic hub; `aliran` and `ujian` rooms reuse `bolehTerima`/`saringNaik` and `room-relay.ts` pure functions, tickets verified in memory, app-level `"ping"→"pong"` kept, backpressure and inbound rate caps (pattern from `kuis.ts`).
- `publish()` replaces `kirimRelay` in `api/_lib/siaran.ts`, `aliran.ts`, `agent/index.ts`, `recruitment-room.ts`, `recruitment-lc-judge.ts`; keeps the optional Worker POST behind an env flag for rollback. No 1.5 s drop window.
- **Replay**: per-topic sequence number + ring buffer; a reconnecting tab asks "since seq N" instead of refetching everything.
- Move the lab-clock minute timer and the session auto-end/auto-start into an in-process timer that broadcasts `sesi` (removes lazy end-on-ask and the Worker→tunnel cron).
- Client: `alamatRelay` (`src/lib/siaran.ts:89-93`) goes same-origin with automatic fallback to the Worker URL; CSP unchanged. Graceful drain closes sockets 1001 (existing backoff handles it). Raise `LimitNOFILE` in `deploy/iris-web.service`.

### Phase 3: Multi-core

- Node `cluster` with a supervisor and N workers (tunable by env); stateless cookies already allow this. Workers share events over **Postgres LISTEN/NOTIFY** (publish → NOTIFY → each worker forwards to its local sockets; also invalidates caches).
- One leader (pg advisory lock) runs singleton jobs: lab clock, session timers, prunes, sweeps, and **the quiz game (state is in memory)**; other workers serve HTTP/sockets. Update `deploy.sh`, systemd unit, drain and `/api/sehat` aggregation.

**As built (phase 3, 15 Nov 2026), and where it differs from the lines above:**

- The bus is the **supervisor's IPC channel**, not Postgres NOTIFY. All workers are on one machine, the supervisor is the one process that outlives a deploy, and it already has to exist for rolling restarts, so it also _numbers_ the live stream (one order, one epoch kept across deploys, so replay survives a restart), keeps the room roster, decides tickets used once, and elects the leader. No payload limit, no extra database connection per worker, no dependency on the database to deliver a message. If a second machine ever shares the database, the bus interface (`server/klaster/pekerja.ts`) is the one place that gets a NOTIFY backend.
- The leader is **elected by the supervisor, not by a pg advisory lock**: the newest generation of ready workers leads, and a deploy hands the duties over in order (old leader puts them down and saves, then the new one starts), so there are never two. A sitting leader is not replaced by a worker of the same generation.
- **The quiz socket** stays on the leader: a follower passes the upgrade to the leader's own door on 127.0.0.1 (`server/klaster/teruskan.ts`, authenticated by a per-run secret), because the tunnel's connection can land on any worker.
- **The QR sheet watch** runs on the leader; a follower forwards a page's ask to it.
- A **rolling restart** (`SIGHUP` from `deploy.sh`, no sudo): a new worker is ready before an old one is told to drain, so the site never has fewer workers than it started with; a new worker that never gets ready stops the roll and leaves the old ones serving. The supervisor itself is replaced only when its own files changed.
- Left per worker on purpose: login-failure and upload-report rate limits (already "per instance" by design; they are N times looser), the module-code cache (10 s), the Google sheet read cache.
- Proven by `scripts/uji-klaster.mjs` (real supervisor, real workers: spread, one numbered stream with replay across workers, rooms and presence, tickets once, a roll under constant requests with zero failures, a killed leader) and by the unit tests in `server/__tests__/klaster-*.test.ts` and `hub-klaster.test.ts`.

### Phase 4: Make refetch nearly free

- Per-(route, audience) in-memory response cache invalidated by topic version; ETag/304 for API JSON; random jitter on client refetch after a broadcast; keep the 300 ms coalescing window.
- Cap sizes of heavy reads (`LIMIT`, SQL aggregation) found in the audit; relax pool and timeouts to the box.

### Phase 5: Close every live-update gap, then relax client timers

- Add topics/watchers: QR scans from the Google Form sheet (server-side watcher publishes), web-upgrade job status (file watcher), hunt key, judge results (room messages instead of 1.5/2.5 s polls), `Kandidat` and `BerkasReview` subscribe to `reccandidates`, Cek Judge freshness from heartbeats, latihan.
- Client constants: `SAFETY_MS` 300 s → 60 s (or sequence-based resync), `FALLBACK_MS` 30 s → ~10 s, 20 s exam backup poll tightened; throttles (`JARAK_*` in `HadirNotice.tsx`, `TEL_JARAK`) reduced where the new cache makes them cheap.
- Push the data itself, with per-role filters and tests, for the hottest views only: `/api/session/now`, the live report, the grading grid, plus exam rooms (already data-push).

### Phase 6: Web delivery

- Cloudflare Cache Rules + purge on deploy for static HTML and the telemetry endpoint (dashboard steps by the user), Early Hints/`modulepreload`, Astro `prefetch`, `client:idle` for Toast/SegFit/TipLayer, undo the Vercel-era CSS/JS chunk merging so each page loads only its own CSS, drop duplicate `.woff`, tunnel `originRequest` tuning; CI: parallel `tsc`, cache `.astro` and tsbuildinfo, drop the duplicate `tsc -p tsconfig.json` after `astro check`.

### Phase 7: Prove it

- Re-run Phase 0 tools after each phase; final run at **1,000 sockets**; failure drills (kill a worker, restart during load, drop the tunnel); compare to baseline and write results into `DEPLOY.md`.

## Critical files

`apps/web/server/{main,app,kuis,jeda}.ts` (+ new `server/hub/`), `apps/web/api/_lib/{siaran,aliran,session,galat,laporan-data,kehadiran}.ts`, `apps/web/api/session/[aksi].ts`, `apps/web/api/agent/index.ts`, `apps/web/src/lib/{siaran,siaran-topik,aliran,aliran-ruang,hooks,sesi,sesi-mulai,server-lib,seelabs-baca,db,auth}.ts`, `apps/web/src/lib/recruitment/{client,room-client,seat-client,latihan-client}.ts`, `apps/relay/src/{index,ujian}.ts` (kept as fallback), `apps/web/deploy/{deploy.sh,iris-web.service,DEPLOY.md}`, `apps/web/astro.config.mjs`, `apps/web/drizzle/0067_*.sql`.
Reuse, do not rewrite: `bolehTerima`/`saringNaik`, `room-relay.ts` pure functions, `TOPIK`/`TOPIK_TULIS`, `usePoll`/`usePollBersama`/`useSiaran` APIs (unchanged signatures), `kuis.ts` socket safety patterns, `tunggu.ts` drain, `statusKolam`.

## Constraints and rules

- No secrets printed; sudo-only steps (Postgres config, systemd, `LimitNOFILE`) and Cloudflare dashboard rules are given to the user as pasteable blocks.
- Migrations applied by hand with `psql`, never `drizzle-kit migrate`. Never commit `db.ts` rig-only edits.
- Each phase ships as its own PR; read `gh pr checks` before merge; run `PYTHONUTF8=1 python scripts/check_secrets.py` after `git add`.
- Deploy outside class hours (practicum 06:30-21:00, Mon-Sat); the Upgrade button refuses during exams. Keep the Worker relay path as an env-flag rollback until Phase 7 passes.
- Work in worktrees; unlink `node_modules` junctions before removing a worktree.

## Verification

- Per phase: `npm run check`, `npx vitest run` (laptop-only failures in `reconstruction.test.ts` and a load-sensitive `beacon-bersama` are pre-existing), new unit tests for hub auth/filters/replay/backpressure and for every cache invalidation rule.
- Hub: `scripts/fanout.mjs` against a local server (rig) then the PC; assert p95 write→receipt stays low at 1,000 sockets, no dropped broadcasts (compare sequence numbers), reconnect resumes without a full refetch.
- Role safety: tests that a Praktikan never receives another group's or an Asisten-only payload through any pushed message.
- Multi-core: kill a worker under load; leader failover; quiz game survives deploy drain.
- Live checks after each deploy: `/api/sehat?db=1`, the daily Smoke workflow run by hand, browser check of live pages (two tabs: a change on one appears on the other within a second).
- DB: `EXPLAIN (ANALYZE, BUFFERS)` of the hot queries before/after; `pg_stat_statements` top 20 compared with the Phase 0 baseline.

## Open items

- Baseline numbers (Phase 0) will set concrete targets; none of the performance claims above have been measured yet.
- Agent PC source was not read: confirm it honors the server-sent `intervalDetik` before shortening beats.
- Before Phase 1, write the approved design into `docs/superpowers/specs/2026-11-15-realtime-server-upgrade-design.md`.
