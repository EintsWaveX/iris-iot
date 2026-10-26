# irisiotlab.com Part A (domain on Vercel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before Monday 2026-10-19 06:30 WIB, IRIS answers on `https://irisiotlab.com` (still hosted on Vercel), the relay on `konsol.irisiotlab.com`, and every page of the old `iris-praktikum-jurnal.vercel.app` forwards to the same path on the new address.

**Architecture:** Only addresses change. The Vercel project gets two custom domains (apex serves, www 308s to apex), Cloudflare DNS records stay "DNS only". A host-matched redirect in `vercel.json` sends old-host page requests to the new host, but never `/api/*`, so the PC agent, the relay cron and CI keep working on either host. The relay Worker gains a Workers custom domain; its `workers.dev` host stays up for clients that still use it.

**Tech Stack:** Astro 7 static + Vercel functions (`apps/web`), Cloudflare Worker with Durable Objects (`apps/relay`, wrangler 4), vitest, Vercel CLI 59, Python agent on the PC Server (IRIS ASO repo `pc/`).

**Spec:** `docs/superpowers/specs/2026-10-17-move-to-irisiotlab-design.md` (Part A = section 7, A0 to A4). Part B is outlined at the end and gets its own plan after Monday.

## Global Constraints

- Ship from `origin/main` (549f000) plus these changes only: no Phase 18, no TP points (ed65279), no SeeLabs read-back. Work in a worktree on branch `pindah-domain`.
- New addresses, exactly: site `https://irisiotlab.com`, www `https://www.irisiotlab.com` (308 to apex), relay `konsol.irisiotlab.com` (`wss://konsol.irisiotlab.com/siaran` for live updates).
- Old host `iris-praktikum-jurnal.vercel.app`: pages 308 to `https://irisiotlab.com/<same path and query>`; `/api/*` is never redirected.
- Old relay host `iris-konsol.iris-iot-relay.workers.dev` keeps working and stays in the CSP during Part A.
- Cloudflare records for the apex and www are DNS only (grey cloud).
- No credentials in either repo. Vercel env values pulled for inspection go to the session scratchpad only and are deleted after use.
- Prod DB untouched in Part A (no migrations).
- Never commit `apps/web/src/lib/db.ts` (rig patch) or `public/rig-test/`; in IRIS ASO stage named paths only.
- One deploy for the whole set (Tasks 2 to 5 ready first), during no running session. Practicum has not started, but check that no TOT or test session runs.
- UI copy rules hold if any copy is touched: Indonesian, no em or en dashes.

## Review Focus

1. The PC agent POSTs heartbeats to `<old host>/api/agen` until Task 7. Python's urllib does not follow a 308 on POST, so the expected behaviour is that old-host `/api/*` answers as before. Pinned by the `vercel.json` test in Task 2 and the curl check in Task 6.
2. An old deep link with a query string (an LMS module link, `/en/modules/3?tab=x`) should land on the same path and query on the new host. Pinned by the curl check in Task 6.
3. A browser tab opened before the switch keeps its live-update socket to the old relay host. That host must still connect and still pass the CSP. Pinned by the CSP assertion in Task 2 and the relay check in Task 5.
4. `www.irisiotlab.com/anything` should 308 to the apex with the path kept. Pinned in Task 4.
5. The relay's minute cron (`/api/tp/detak`) and the LMS proxy follow `IRIS_SITUS` and should reach the new host without auth or Origin failures. Pinned by the `wrangler tail` check in Task 6.

---

### Task 1: Leak audit gate (A0)

**Files:** none changed unless a leak is found (then STOP and report to the user; no fix without their word).

- [ ] **Step 1:** Start the rig API (`sh ~/Downloads/design-review/rig/restart-rig.sh`, Postgres on 54329) and the front end from a checkout of `origin/main` (`npx astro dev --config astro.real.config.mjs --port 4321`).
- [ ] **Step 2:** Regenerate the action list (`grep -ohE 'aksi === "[a-z0-9-]+"' apps/web/api/*/[aksi].ts`) and confirm `leak_api.mjs` covers every name. Run `leak_api.mjs`, `leak_pages.mjs`, `idor_probe.mjs` and `skema_probe.mjs` from `~/Downloads/design-review/rig/`. Expected: no Asisten-only data visible signed out or as a Praktikan.
- [ ] **Step 3:** Build to a scratch dir (`npx astro build --outDir <scratchpad>/leakbuild`) and run `scan_bundle.py` on it. Expected: only the known benign hits (numeric constants in pdf.worker/react/rfb, jose's PKCS8 header check, 1715 in noVNC's keysym table).
- [ ] **Step 4:** Record the result (commit, scripts, verdict) in the plan's execution notes. Gate: continue only on a clean result.

### Task 2: Web app addresses (A2, web part)

**Files:**
- Modify: `apps/web/src/lib/lab.ts:11` (`SITE_URL`)
- Modify: `apps/web/src/lib/siaran.ts:92` (default relay URL)
- Modify: `apps/web/vercel.json` (redirect + CSP)
- Modify: `apps/web/public/robots.txt:32`, `apps/web/scripts/rehearse.mjs:10,40,44`, `apps/web/scripts/brand_assets.py:36`
- Test: `apps/web/src/lib/__tests__/alamat-situs.test.ts` (new)

**Interfaces:**
- Produces: `SITE_URL === "https://irisiotlab.com"` (used by canonical/OG links, the sitemap and the LMS module links in `api/lms/[aksi].ts:1199`).

- [ ] **Step 1: Create the worktree.** `git worktree add ../iris-iot-pindah -b pindah-domain origin/main` and run `npm ci` there.
- [ ] **Step 2: Write the failing test** `alamat-situs.test.ts`:

```ts
import vercel from "../../../vercel.json";
import { SITE_URL } from "../lab";

const csp = () =>
  vercel.headers.flatMap((h) => h.headers).find((x) => x.key === "Content-Security-Policy" && x.value.includes("connect-src"))!.value;

it("the site lives on irisiotlab.com", () => {
  expect(SITE_URL).toBe("https://irisiotlab.com");
});
it("old host pages go to the same path on the new host, never /api", () => {
  const r = vercel.redirects.find((x) => x.has?.some((h) => h.type === "host"));
  expect(r).toMatchObject({
    source: "/((?!api/).*)",
    has: [{ type: "host", value: "iris-praktikum-jurnal.vercel.app" }],
    destination: "https://irisiotlab.com/$1",
    permanent: true,
  });
});
it("the CSP allows the new relay and still the old one", () => {
  expect(csp()).toContain("wss://konsol.irisiotlab.com");
  expect(csp()).toContain("wss://iris-konsol.iris-iot-relay.workers.dev");
});
```

Also add a case for the default live-update URL in `siaran.ts` (call its exported default-URL function with no override and expect `wss://konsol.irisiotlab.com/siaran`). If that function is not exported, test it through the module's existing export the way its current tests do.
- [ ] **Step 3: Run** `npx vitest run src/lib/__tests__/alamat-situs.test.ts`. Expected: FAIL on SITE_URL, the redirect and the CSP.
- [ ] **Step 4: Implement.** Set `SITE_URL`. Set the siaran default to `wss://konsol.irisiotlab.com/siaran`. Put the host redirect **first** in `vercel.json` `redirects`. Add `wss://konsol.irisiotlab.com` to `connect-src` next to the old relay host. Update the robots sitemap line, rehearse.mjs defaults (base `https://irisiotlab.com`, relay `wss://konsol.irisiotlab.com/siaran`) and brand_assets.py `SITE`. Leave `README.md`'s `vercel link --project` line alone (the project name is unchanged).
- [ ] **Step 5: Run** `npx vitest run` (whole suite), `npm run check`, `npm run lint`, `npx astro build`. Expected: all pass. The only known `check` noise is the `pg` types error. `git grep -n iris-praktikum-jurnal -- apps/web/src apps/web/api` returns nothing.
- [ ] **Step 6: Commit** the named paths: `web: IRIS moves to irisiotlab.com; old host pages forward there, /api stays`.

### Task 3: Relay on konsol.irisiotlab.com (A2, relay part)

**Files:**
- Modify: `apps/relay/wrangler.toml` (`IRIS_SITUS`, custom domain route, explicit `workers_dev = true`)

- [ ] **Step 1:** In `wrangler.toml`, set `IRIS_SITUS = "https://irisiotlab.com"`, add `workers_dev = true` and `routes = [{ pattern = "konsol.irisiotlab.com", custom_domain = true }]`. Update the header comment that says the secret is "in the web app's Vercel env" only if it becomes wrong (it does not in Part A).
- [ ] **Step 2:** Run the relay's tests (`npm test` in `apps/relay`). Expected: pass.
- [ ] **Step 3: Commit** `relay: answers on konsol.irisiotlab.com too, wakes the site at irisiotlab.com`. Do not deploy yet (Task 5).

### Task 4: Domains on Vercel and Cloudflare DNS (A1)

Ops only. Nothing changes for visitors yet: the new host serves today's prod build.

- [ ] **Step 1:** `vercel domains add irisiotlab.com iris-praktikum-jurnal` and the same for `www.irisiotlab.com` (from `apps/web`, linked to the project). Read the records Vercel asks for (`vercel domains inspect irisiotlab.com`).
- [ ] **Step 2:** Make www redirect to the apex with 308 (project domain setting `redirect: "irisiotlab.com"`, `redirectStatusCode: 308`, through the Vercel dashboard or `vercel api`).
- [ ] **Step 3: User step.** The user adds the records in the Cloudflare dashboard for irisiotlab.com, apex and www, **DNS only**, exactly as Vercel listed them. Give them the values in one message. The wrangler login has no DNS scope.
- [ ] **Step 4: Verify.** `curl -sI https://irisiotlab.com/` → 200, `server: Vercel`, valid certificate. `curl -sI https://www.irisiotlab.com/en/modules/1` → 308, `location: https://irisiotlab.com/en/modules/1`. `vercel domains inspect` shows both as configured.

### Task 5: IRIS ASO side and the relay deploy (A2 rest, A3 first half)

**Files (IRIS ASO repo):**
- Modify: `.github/workflows/bundel.yml:51`, `pc/terbitkan_bundel.py:7`, `pc/agent/agent.py:12`, `pc/agent/tools/uji_protokol.py:10,76`, `pc/README.md:6,37,175,176,664,674`, `pc/CHECKLIST.md:89,96`
**Files (iris-iot):** `.github/workflows/bundel.yml:48`

- [ ] **Step 1:** Replace `https://iris-praktikum-jurnal.vercel.app` with `https://irisiotlab.com` in those lines, in both repos. These are docstrings, help text, docs and the bundle workflow's `--situs`. The agent's real address lives in `/etc/iris-agent/config.json` on the PC (Task 7).
- [ ] **Step 2:** Run the agent tests (`python -m pytest pc/agent -q`, or the suite CI runs). Expected: all 201 pass. In IRIS ASO, run the secret scan with `PYTHONUTF8=1`. Expected: clean.
- [ ] **Step 3: Commit** in IRIS ASO with named paths only: `pc: the site's address is irisiotlab.com`. In iris-iot, amend nothing; add `bundel.yml` to a commit `ci: bundles are published to irisiotlab.com`.
- [ ] **Step 4: Deploy the relay** from the worktree (`npx wrangler deploy` in `apps/relay`). If wrangler cannot create the custom domain (OAuth scope), the user adds it in the dashboard (Workers, iris-konsol, Domains, `konsol.irisiotlab.com`). The deploy is safe ahead of the site: the old site still uses the workers.dev host.
- [ ] **Step 5: Verify.** A WebSocket opens to `wss://konsol.irisiotlab.com/siaran` and to the old `workers.dev` host (`node -e` with `ws`, or `rehearse.mjs`'s relay check pointed at each). `npx wrangler tail iris-konsol` shows the minute cron calling `https://irisiotlab.com/api/tp/detak` with 200.
- [ ] **Step 6:** Set Vercel production env `KONSOL_RELAY_URL` to the same scheme and form as today, on the new host. Inspect the current value via `vercel env pull` into the scratchpad, then delete the file. This takes effect with Task 6's deploy.

### Task 6: Deploy and check (A3)

- [ ] **Step 1:** Confirm no session is running (Servers / Jadwal page, or the session API as Asisten).
- [ ] **Step 2:** `git fetch -q origin && git merge-base --is-ancestor origin/main pindah-domain && git push origin pindah-domain:main`. Vercel deploys production, then Smoke runs against irisiotlab.com.
- [ ] **Step 3: Verify, all must hold:**
  - `curl -sI "https://iris-praktikum-jurnal.vercel.app/en/modules/3?tab=x"` → 308, `location: https://irisiotlab.com/en/modules/3?tab=x`.
  - `curl -s -o /dev/null -w "%{http_code}" -X POST https://iris-praktikum-jurnal.vercel.app/api/agen` → not 3xx (401/400 as today).
  - `node apps/web/scripts/rehearse.mjs https://irisiotlab.com` passes (pages, headers, API, live updates over the new relay).
  - In a browser on irisiotlab.com: sign in as an Asisten, open Dasbor and a live page. The live-update socket goes to `konsol.irisiotlab.com` and there are no CSP errors in the console.
  - `wrangler tail`: the cron's `/api/tp/detak` calls answer 200; one LMS action through the relay (Ringkasan, Sinkron Sekarang) succeeds.
  - GitHub Actions: CI and Smoke green on the commit.
- [ ] **Step 4:** On the working branch `phase9-global-and-asisten`, run `git merge origin/main` so the next deploy carries this (expect the Reset Sandi and move commits; resolve nothing by hand without reading it). Remove the worktree.

### Task 7: PC agent on the new address (A3 second half)

- [ ] **Step 1:** SSH to the PC Server (run sudo myself with `sudo -S`, never store the password). Back up `/etc/iris-agent/config.json` and `/etc/iris-agent/konsol-relay`. Set `server` to `https://irisiotlab.com`, and the relay address in `konsol-relay` to the `konsol.irisiotlab.com` form (keep its format and its secret as they are). Keep both files at mode 600.
- [ ] **Step 2:** `sudo systemctl restart iris-agent`, then `journalctl -u iris-agent -n 30`. Expected: heartbeats `[INFO]` to `https://irisiotlab.com/api/agen`, no errors.
- [ ] **Step 3: Verify on the site.** The PC shows online on the Servers page. Konsol opens the PC Server Screen through the new relay. The TP mirror fetch still runs (agent log).

### Task 8: Published links (A4)

- [ ] **Step 1:** Grep the LMS content IRIS wrote. The Isi Kelas sections hold module links built from `SITE_URL` (`api/lms/[aksi].ts:1199`). Find the Isi Kelas action that rewrites a section's content, try it on one class, check the link on the LMS page, then run it for all 11 classes. If no action rewrites existing sections, list the sections for the user instead. Old links still work through the redirect.
- [ ] **Step 2:** Grep the IRIS ASO handbook/journal/slide sources and QR sources for the old host. Expected: none, since the handbook modules are final. If any appear, list them for the user and don't edit the final modules.
- [ ] **Step 3:** Tell the user Part A is live, with the checks that passed, and that they can now give the Laboran `https://irisiotlab.com`.

---

## Part B, brought up to date 2026-10-19 (for review; nothing built, nothing bought)

Part A status: Tasks 1 to 6 live since 2026-10-17. Task 7 is code in IRIS ASO (install.sh moves a server off the old site and relay addresses on its next Update, test_install_hosts.sh in CI); it reaches the PC through a signed bundle and Perbarui on Cek Siap. Until then Konsol on the PC refuses the new relay, since the agent pins `wss://iris-konsol.iris-iot-relay.workers.dev` and the site hands out `wss://konsol.irisiotlab.com`. Task 8 is code in iris-iot (Isi Kelas finds module links on the old host and Perbarui Tautan rewrites them in place, rig p22_tautan.mjs); the live rewrite of the 11 classes waits for the user's go.

### What shipped since 10-17 that Part B has to carry

- Phase 18 attendance: the lab clock's automatic starts at :25 ride the relay's minute beat (`POST /api/tp/detak` runs `jamLabBilaPerlu` first). A missed beat means a late start, so the PC must answer the beat every minute.
- Every-minute LMS and SeeLabs reads (f35bc75, ced42a1): the LMS read rides the same beat (`sinkronBilaPerlu(db, "relay", 50_000)`); SeeLabs reads are jobs for the PC agent (protocol 8), handed out on its heartbeat. Hosting the site on the same PC as the agent puts both on one machine: a PC outage stops the site and the robot together (the laptop standby covers the site only).
- Phase 20 roles and Phase 21 Praktikan screens: no new platform needs, but both must pass the leak audit again before cutover.
- `waitUntil` is now used in 4 places (api/agent once, api/tp three times, one of them new for Sambungkan and Sinkron Sekarang on 2026-10-19). On the Node server each becomes a tracked background promise; the process must not drop them on restart (drain on SIGTERM, up to 60 s).

### Every Vercel-only dependency today

| Dependency | Where | Part B replacement |
|---|---|---|
| Function routing (11 entry files: action, agent, auth/[aksi], lms/[aksi], modul/[aksi], presentasi/[aksi], server/index, server/[id], session/index, session/[aksi], tp/[aksi]) | `apps/web/api/` | Node server maps `/api/**` the same way (rig.mts on :8790 is the prior art) |
| `waitUntil` from `@vercel/functions` | api/agent, api/tp (x3) | tracked background promises, drained on shutdown |
| `@vercel/blob` (`put`, `del`, client `upload` + `handleUpload`) | api/presentasi, api/_lib/retensi.ts, SlidesEditor, SchematicEditor, reports/pickers | R2 with presigned PUT, S3 delete (B2) |
| `includeFiles` | modul/[aksi] and session (sketches, data_asisten.typ), presentasi (bundled/schematics) | plain files beside the server |
| `maxDuration: 60` | api/lms/[aksi] | none needed; keep a 60 s request timeout so a stuck LMS call cannot hang a worker |
| `regions: ["sin1"]` | vercel.json | none; the PC is in Bandung, Neon in Singapore (about 20 to 30 ms per query; this is the speed gate's main risk) |
| Redirects (5), rewrites (9), headers (2 rules: security headers + CSP on all, handbook cache) | vercel.json | same rules in the server, checked route by route against Vercel (B1 parity) |
| CDN caching (16 `Cache-Control` sites in api/, `s-maxage` ones served from Vercel's edge) | api/ | Cloudflare cache rules for those paths, or make them cheap |
| `VERCEL_GIT_COMMIT_SHA` | one read in api/ | a build stamp file written by the deploy script |
| Env vars | DATABASE_URL, SESSION_SECRET, DATA_KUNCI, KONSOL_RELAY_SECRET, KONSOL_RELAY_URL, LMS_KUNCI, LMS_LANGSUNG, LMS_POLA_KURSUS, LMS_URL, BUNDEL_TERBIT, BLOB_READ_WRITE_TOKEN | protected env file on PC and laptop (approved 10-17); Blob token replaced by R2 keys |
| Crons | none on Vercel; the relay's `* * * * *` trigger calls `${IRIS_SITUS}/api/tp/detak` | unchanged: IRIS_SITUS is already irisiotlab.com, so the beat follows the DNS to whichever machine serves |
| LMS through the relay | api/_lib/lms.ts `relayLms()`: the LMS's Cloudflare turns away Vercel addresses | keep the relay route (it works from anywhere). Optional later: `LMS_LANGSUNG=1` on the PC, if campus reaches the LMS directly, measured first |
| GitHub workflows | smoke.yml and backup.yml (target the site URL), bundel.yml (publishes to `/api/agen` with BUNDEL_TERBIT) | unchanged, they follow the address; deploy moves to the SSH script (B5 unlinks Vercel from GitHub) |
| Vercel deploy on push | GitHub integration | SSH deploy script from the laptop (spec section 6) |

### Steps (unchanged order, details added)

- B0: Leak audit re-run on current main (leak_api, idor_probe, leak_pages, built-bundle scan). Gate for B3.
- B1: Node server for `dist/` plus `api/` with route, redirect, rewrite and header parity, a `pg` pool, background-promise drain, build stamp, plain-file includes. Parity script compares every route, redirect, rewrite and header against Vercel.
- B2: R2 bucket `iris-berkas` on `berkas.irisiotlab.com`, presigned uploads, Blob copy and URL rewrite by hand (dry run first, pg_dump first).
- B3: PC service `iris-web` (own user, 127.0.0.1 only, SELinux and firewalld as the agent's setup does), env file, `iris-pc` tunnel on `pc.irisiotlab.com`; speed gate 1.2x Vercel on the hot endpoints, measured from Bandung.
- B4: Laptop build, `iris-laptop` tunnel, IRIS Cadangan with the DNS flip, PC-first in iris-pulih, failover and both-down drills. The minute beat must reach whichever machine serves: part of the drill.
- B5: Cutover in a quiet window (no session): R2 copy and URL rewrite, apex to the tunnel, CSP drops `vercel.com`, the Blob host and the workers.dev relay (after Task 7 reached the PC), Vercel redirect-only and unlinked from GitHub.
- B6: Delete Blob and the Vercel project after a clean week, on the user's word.

Open for the user: (1) IRIS Cadangan autostarts at Windows login or a desktop shortcut; (2) when Part B starts (no practicum session may run during B3 to B5 work on the PC); (3) whether the PC also running the site is acceptable given the robot and the hotspot share that machine.
