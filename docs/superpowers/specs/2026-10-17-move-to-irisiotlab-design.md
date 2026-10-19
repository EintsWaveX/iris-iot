# Move IRIS web off Vercel onto irisiotlab.com (PC Server, laptop standby)

Date: 2026-10-17. Two parts: **Part A** (irisiotlab.com on the current Vercel setup) is live before practicum
starts Monday 2026-10-19 06:30 WIB. **Part B** (hosting moves to the PC behind the same address) follows once
proven, with no deadline of its own.

## Intent and why

IRIS becomes the lab's formal web address, handed out by the Laboran and the campus, so it must live on
**irisiotlab.com** (bought 2026-10-16 at Cloudflare Registrar, zone on Cloudflare nameservers), not on
`iris-praktikum-jurnal.vercel.app`. Vercel was only ever temporary. The user also wants headroom: no
free-tier ceiling that could trip when many Praktikan arrive at once (200 to 300 Praktikan a year, five
groups per session, four sessions a day). Everything moves under Cloudflare.

## Goals

1. irisiotlab.com serves the whole IRIS web (pages, handbook, API) from the **PC Server** (Fedora 44,
   KDE, on campus Wi-Fi, no inbound ports) through a **Cloudflare Tunnel**.
2. **Laptop standby** (the user's Windows laptop, this machine): when the PC is down, the user opens the
   laptop and starts "IRIS Cadangan"; within about a minute irisiotlab.com runs from the laptop. When the
   PC is healthy again, traffic goes back to the PC by itself and the laptop can be closed. Nobody changes a
   link, nobody is signed out, no work is lost.
3. When both machines are down, visitors get a short IRIS page if Cloudflare's free plan allows it,
   otherwise Cloudflare's own error page (no paid plan for now).
4. Uploaded files move from Vercel Blob to **Cloudflare R2**.
5. The Konsol/live-update relay Worker gets a name under the domain and points at the new site.
6. The old Vercel address keeps working as a redirect to irisiotlab.com (bookmarks, LMS links, QR codes).

## Non-goals

- No feature changes, no UI changes. Phase 18, the TP points change
  (ed65279) and the SeeLabs read-back are **not** part of this move. The move ships prod's current code
  (`origin/main`, 549f000) plus the move changes only.
- The database does not move: **Neon `iris-db-sin` stays** the one database for both machines.
- The Module 4 hotspot, the agent, Konsol screen and TP mirror on the PC are unchanged, apart from the site
  address they call.
- No paid Cloudflare Load Balancer.

## Anti-goals (would be a failure even if it "works")

- Praktikan or Asisten see an outage or are signed out on Monday because of the switch.
- Two machines serving at once in a way that splits or corrupts state.
- Any password, token or tunnel credential in the repo.
- Pages noticeably slower than on Vercel sin1.
- The old Vercel link dying before every place that prints it has the new address.

## Current state (facts from the repo, 2026-10-17)

- `apps/web`: Astro static build (no adapter) plus Vercel functions under `api/` (12 entry files, handlers
  typed `ApiRequest`/`ApiResponse` from `api/_lib/http.ts`). The local rig already runs these handlers in a
  plain Node server on :8790 (`~/Downloads/design-review/rig/restart-rig.sh`); that is prior art for the
  production server.
- `vercel.json` carries: region sin1, 4 redirects, 9 rewrites (old Indonesian API aliases), security
  headers incl. the CSP (with script hashes, `vercel.com` and `*.public.blob.vercel-storage.com` and the
  relay's `workers.dev` host), handbook cache headers, `includeFiles` for sketches/schematics/`data_asisten.typ`,
  `maxDuration: 60` for `api/lms`.
- Vercel-only APIs: `@vercel/blob` (`put`/`del`/client `upload` with `handleUpload`) in `api/presentasi`,
  `api/_lib/retensi.ts`, `api/_lib/dokumen.ts`, `SlidesEditor`, `SchematicEditor`, `reports/pickers`;
  `waitUntil` from `@vercel/functions` in `api/agent` and `api/tp`; `VERCEL_GIT_COMMIT_SHA`.
- TP PDFs are **not** in Blob: they are base64 in Neon (`tp_unggah.isi`). Blob holds slides, schematic
  images and report documents.
- Env used: `DATABASE_URL`, `SESSION_SECRET`, `DATA_KUNCI`, `KONSOL_RELAY_SECRET`, `KONSOL_RELAY_URL`,
  `LMS_KUNCI`, `LMS_LANGSUNG`, `LMS_POLA_KURSUS`, `LMS_URL`, `BUNDEL_TERBIT`, plus the Blob token.
- Hard-coded old host: `src/lib/lab.ts` `SITE_URL`, `src/lib/siaran.ts` relay `wss://iris-konsol.iris-iot-relay.workers.dev`,
  `apps/relay/wrangler.toml` `IRIS_SITUS`, `scripts/rehearse.mjs`, `scripts/brand_assets.py`. The relay's
  minute cron wakes `/api/tp/detak` on `IRIS_SITUS`. The PC agent's heartbeat calls the Vercel URL.
- GitHub workflows `smoke.yml` and `backup.yml` exist and may name the old host.

## Decided with the user

Cloudflare account check (2026-10-17): wrangler is signed in to the one account on the user's email
(`Nue.immanuel@gmail.com's Account`), which also holds the zone, so custom domains for the relay and R2 work.
The user may need to click through the dashboard for tunnel creation, R2 S3 keys and the DNS-only API token;
the plan lists those steps.


| Topic | Decision |
|---|---|
| Domain | irisiotlab.com, Cloudflare zone, everything under Cloudflare |
| Primary host | PC Server via Cloudflare Tunnel |
| Standby | User's laptop, started by hand when the lab calls; hands back to the PC automatically |
| Database | Stays on Neon (Singapore) |
| Files | Cloudflare R2 |
| Cost | Free Cloudflare tools; no $5 Load Balancer |
| Both down | Free only: custom error page if the free plan allows, else Cloudflare's own page |
| When | Part A before Monday 2026-10-19; Part B once proven |
| Gate | Asisten-data leak audit re-run before irisiotlab.com goes public |
| Secrets | Copy prod env from Vercel to a protected file on PC and laptop, never the repo |

## Design (my calls, marked; builder may refine)

### 1. One Node server for site and API (my call)

A small production server (`apps/web/server/`, Node, no framework or a minimal one) that:
- serves the built `dist/` (Astro static) with the same headers `vercel.json` sets today (CSP updated, see 5),
  long immutable caching for hashed `/_astro/*` and fonts so Cloudflare's edge serves them, not the PC;
- maps `/api/**` to the existing handler modules exactly as Vercel's file routing does (including
  `[aksi]`/`[id]` params) and keeps every redirect and rewrite from `vercel.json`;
- replaces `waitUntil` with a tracked background promise (the process stays alive), `VERCEL_GIT_COMMIT_SHA`
  with a build stamp, `includeFiles` with plain files on disk; no 60 s cap needed;
- uses a persistent `pg` pool to Neon (no per-request connect), since the PC is ~20 to 30 ms from Singapore
  versus ~1 ms on Vercel sin1. **Measure** the round trips of the hottest endpoints (session view, Dasbor,
  live session, sign-in) before cutover; if a page does many sequential queries and gets slower than today,
  batch them. This is the main performance risk.
- `vercel.json` stays valid for the redirect-only Vercel project (see 7); it is no longer the source of headers.

The same build runs on Fedora (systemd `iris-web.service`, own user, env file `/etc/iris-web/env`, root 600)
and on Windows (laptop; env file outside the repo, e.g. `%LOCALAPPDATA%\IRIS\iris-web.env`). Secrets are
identical on both, so a session cookie signed on one machine is valid on the other.

### 2. Tunnels and failover (my call: two tunnels + DNS flip, free)

- Tunnel `iris-pc` on the PC (cloudflared as a systemd service, Fedora package or the official RPM).
  Hostnames: `pc.irisiotlab.com` always points here (health probes and direct checks).
- Tunnel `iris-laptop` on the laptop (cloudflared on Windows). Hostname `laptop.irisiotlab.com`.
- `irisiotlab.com` and `www.irisiotlab.com` (www redirects to the apex) are proxied CNAMEs to **one** of the
  two tunnels at a time. Proxied record changes apply within seconds.
- A health endpoint `/api/sehat` answers which host it is and whether Neon answers.
- **Laptop "IRIS Cadangan"** (a small script/service the user starts, or autostart at login, user's pick in
  the plan): starts the local server and tunnel, probes `pc.irisiotlab.com/api/sehat`; after ~3 failures over
  ~1 minute it flips the apex/www CNAMEs to `iris-laptop`. While serving it keeps probing the PC; after ~2
  minutes of PC health it flips back to `iris-pc`.
- **The PC also enforces "PC first"**: on boot and in `iris-pulih`'s cycle, if the PC is healthy and the apex
  points elsewhere, and the laptop has not flipped in the last ~2 minutes, it flips back. So a laptop closed
  while serving cannot keep the site pointed at a dead machine once the PC is up.
- Both machines hold a Cloudflare API token limited to **DNS edit on the irisiotlab.com zone only**, stored
  outside the repo, never logged.
- Only one machine serves at a time; both share Neon and R2, so there is no state to hand back.

### 3. Both down: what visitors see (user: free for now)

No Worker in front of the site and no paid plan. If Cloudflare's free plan offers a custom page for
tunnel/origin errors (530/1033), use it with a short branded Indonesian page (site voice, no dashes, cosmic
look, `Retry-After` sense in the copy). If it does not, accept Cloudflare's own error page and note it for
the user. Workers Paid ($5) is the later upgrade path, decided by the user.

### 4. R2 replaces Vercel Blob

- Bucket `iris-berkas`, public read on a custom domain `berkas.irisiotlab.com` with unguessable keys (same
  model as today's public Blob URLs). Same key layout as today where possible.
- Uploads: the browser gets a short-lived presigned PUT URL from the same API routes that today issue Blob
  upload tokens (same permission checks, size and type limits); deletes and retention use the S3 API.
  R2 S3 keys live in the env file only.
- Copy every existing Blob object to R2, then rewrite the stored URLs in Neon (a hand-applied SQL after
  `pg_dump`, never `drizzle-kit migrate` on prod). Keep the Blob store until
  the move has run a full week.

### 5. Addresses and CSP

- `SITE_URL` → `https://irisiotlab.com`; relay to a Workers custom domain `konsol.irisiotlab.com`
  (`wss://konsol.irisiotlab.com/siaran`), `IRIS_SITUS` → `https://irisiotlab.com` (so the minute cron and the
  LMS proxy call the new site); scripts and CI workflows follow.
- CSP: drop `vercel.com` and the Blob host, add `https://berkas.irisiotlab.com` (connect/frame/img as today)
  and `wss://konsol.irisiotlab.com`. Script hashes unchanged unless inline scripts change.
- PC agent: heartbeat/base URL → `https://irisiotlab.com` through the normal signed update path.
- Anything already published elsewhere with the old address must be found and updated: LMS course sections
  written by Phase 16 Isi Kelas, handbook/journal/slide sources, QR codes, the IRIS ASO repo. Grep both repos
  and the LMS content IRIS wrote.

### 6. Deploying new versions (my call for now)

A deploy script on the laptop builds once, ships the build to the PC over SSH, restarts `iris-web`, and
smoke-tests `pc.irisiotlab.com`; the same build is kept on the laptop for standby. Pushing to main no longer
deploys by itself. A CI-signed web bundle through the PC's Updates card is a later improvement, not part of
this move.

### 7. Order of work

**Part A, today and tomorrow (the Monday safety net)**

A0. Leak audit (Asisten data hidden from Praktikan and signed-out visitors) re-run on prod's code. Gate.
A1. Add `irisiotlab.com` (apex) and `www` to the Vercel project; on Cloudflare these records are **DNS only**
    (grey cloud) pointing at Vercel, as Vercel asks. www redirects to the apex.
A2. Code, on a branch from `origin/main` (549f000), nothing else from unshipped work: `SITE_URL` and the
    other old-host strings to `https://irisiotlab.com`; relay on the Workers custom domain
    `konsol.irisiotlab.com` with `IRIS_SITUS` = `https://irisiotlab.com`; CSP gains `wss://konsol.irisiotlab.com`
    (old relay host kept until the PC agent and every client follow); `vercel.json` adds a host-matched
    redirect from `iris-praktikum-jurnal.vercel.app` to the same path on `irisiotlab.com` (308).
A3. Deploy to Vercel (one set), redeploy the relay, PC agent base URL to irisiotlab.com through the signed
    update path; smoke + `rehearse.mjs` against irisiotlab.com; the old URL redirects.
A4. Published old links (LMS sections IRIS wrote, IRIS ASO sources, QR codes) updated; the user tells the
    Laboran the address.

Everyone signs in once on the new address (my call, accepted: it happens over the weekend, nobody is
mid-session; per-browser preferences reset).

**Part B, after Monday (hosting to the PC, no address change)**

B1. Node server + tests; runs against the rig; parity check of every route, redirect, rewrite and header
    against Vercel.
B2. R2 bucket, upload path, copy and URL rewrite script (dry run first).
B3. PC: Node, service, env (prod secrets copied from Vercel with the user's approval of 2026-10-17, into the
    protected env file only), tunnel; `pc.irisiotlab.com` serves against prod Neon while Vercel still serves
    the public. **Speed gate (my call):** measured from Bandung (laptop on campus or home network), the
    median of the hot endpoints (sign-in, session view, Dasbor, live session poll, brief/telemetry) through
    `pc.irisiotlab.com` must be no worse than 1.2x the same calls on Vercel; endpoints that relied on
    Vercel's CDN `s-maxage` get an explicit Cloudflare cache rule or are made cheap. If the gate fails,
    the public stays on Vercel and the slow path is fixed first.
B4. Laptop: same build and secrets, tunnel, IRIS Cadangan; failover drill (stop PC service → laptop takes
    over → start PC → flips back) and the both-down drill.
B5. Cutover in a quiet window (no session running): R2 copy + URL rewrite, apex/www switch from Vercel
    (DNS only) to the `iris-pc` tunnel (proxied), CSP drops `vercel.com` and the Blob host, the Vercel
    project becomes redirect-only and is **unlinked from GitHub** so a push can no longer redeploy it
    (my call). Sessions survive because the cookie host stays irisiotlab.com and the secret is the same.
B6. Delete the Blob store and the Vercel project only on the user's word, not before a week of clean running.

Rollback: in Part A, remove the host redirect and the old URL serves again. In Part B, point the apex back
at Vercel (DNS only) and re-link the project; the database never moved.

## Constraints

- Practicum starts Monday 2026-10-19 06:30; Part A done and verified before then, Part B never mid-session.
- PC: campus Wi-Fi, no inbound ports, clock drift handled by `iris-pulih`, Fedora with SELinux and firewalld
  (local port bound to 127.0.0.1 only; cloudflared needs outbound only).
- Prod migrations by hand after `pg_dump`. Stage named paths only in IRIS ASO. Ship only when the whole set
  is ready. Copy rules: no em or en dashes in UI copy, Indonesian copy, English routes.
- Credentials (tunnel tokens, DNS token, R2 keys, Neon URL) never in the repo; run SSH/sudo myself without
  storing the password.

## Left to the builder

- Server implementation details (framework or none, static file serving, compression), port number.
- cloudflared install method on each OS; exact probe intervals within the stated bounds.
- R2 key layout details and the presign library.
- Restore page wording (Indonesian, site voice, no dashes) and look (site's cosmic style).
- Whether IRIS Cadangan autostarts at Windows login or is a desktop shortcut: ask the user in the plan review.
