# Running IRIS web on the PC Server (Part B)

Status: **live.** `irisiotlab.com` has been served from this PC (one Node process, local Postgres, behind a
Cloudflare tunnel) since the cutover on 9 Nov 2026 02:12 WIB (section 6). A merge to `main` no longer updates
the site: run `deploy.sh` (section 4). Rolling back to Vercel and Neon is described in section 6.

What this replaces: Vercel hosting (Pro, $20/mo) and Neon (the database, about $17/mo). The database moves
onto this PC with the site, because a query to Neon from here costs 75 to 90 ms (see gate 3). What it keeps
for now: Vercel Blob (slides, schematics, photos), reached from the PC with its token. The relay Worker, R2
and the domain are already on Cloudflare.

## What runs

`server/main.ts` is one Node process that serves `dist/` (the built site) and the `api/` handlers,
applying `vercel.json`'s redirects, rewrites and headers itself (`server/rules.ts`), so the site answers
as it does on Vercel. It listens on `127.0.0.1:8787` only; `cloudflared` is the way in.
`GET /api/sehat` answers the host, the build and the number of background jobs (`?db=1` also checks
Neon, 503 when it does not answer).

Check any copy of the site against the live one (read-only): `node scripts/parity.mjs https://irisiotlab.com <url>`.
It compares every page, redirect, rewrite and header; the last run against the local server was 150 paths, 0 differences.

## 1. The PC (once)

```sh
# Node 24 (package.json wants 24.x; the PC has none and its dnf state file is unhappy, so use the
# official tarball, checked against nodejs.org's checksum). x86_64 Fedora 44.
cd /tmp && curl -fsSLO https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz
curl -fsSL https://nodejs.org/dist/v24.19.0/SHASUMS256.txt | grep node-v24.19.0-linux-x64.tar.xz | sha256sum -c -
sudo tar -xJf node-v24.19.0-linux-x64.tar.xz -C /opt && sudo ln -sfn /opt/node-v24.19.0-linux-x64 /opt/node24
/opt/node24/bin/node --version      # v24.19.0

# A user that owns the code and runs the server, with a read-only deploy key for GitHub.
sudo useradd --system --create-home --home-dir /var/lib/iris-web --shell /sbin/nologin iris-web
sudo install -d -o iris-web -g iris-web /opt/iris-web
sudo -u iris-web ssh-keygen -t ed25519 -N '' -C iris-web@pc -f /var/lib/iris-web/.ssh/id_ed25519
sudo -u iris-web sh -c 'ssh-keyscan github.com >> /var/lib/iris-web/.ssh/known_hosts'
sudo cat /var/lib/iris-web/.ssh/id_ed25519.pub
#   -> GitHub, EintsWaveX/iris-iot, Settings, Deploy keys, Add deploy key (leave "write access" off)
#   If the network blocks outbound port 22 ("ssh: connect to host github.com port 22: Connection refused"),
#   send GitHub traffic over port 443 instead (same deploy key). Run this before the clone, or any time later to fix a fetch.
sudo -u iris-web tee -a /var/lib/iris-web/.ssh/config >/dev/null <<'EOF'
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
EOF
sudo -u iris-web chmod 600 /var/lib/iris-web/.ssh/config
sudo -u iris-web ssh -T -p 443 -o StrictHostKeyChecking=accept-new git@ssh.github.com   # "Hi EintsWaveX/iris-iot!"
sudo -u iris-web git clone git@github.com:EintsWaveX/iris-iot.git /opt/iris-web

# The secrets file. Fill every value from Vercel's Production env (Settings, Environment Variables).
sudo install -d -m 750 -o root -g iris-web /etc/iris-web
sudo install -m 640 -o root -g iris-web /opt/iris-web/apps/web/deploy/iris-web.env.example /etc/iris-web/env
sudo $EDITOR /etc/iris-web/env

# The service, and the one command the deploy script may run as root.
sudo cp /opt/iris-web/apps/web/deploy/iris-web.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable iris-web
echo 'iris-web ALL=(root) NOPASSWD: /usr/bin/systemctl restart iris-web' | sudo tee /etc/sudoers.d/iris-web
sudo visudo -cf /etc/sudoers.d/iris-web

# Until the branch is merged, name it; the default (origin/main) has no server yet.
sudo -u iris-web /opt/iris-web/apps/web/deploy/deploy.sh origin/part-b-self-host
curl -s 'http://127.0.0.1:8787/api/sehat?db=1'
```

Until the branch is merged, clone it with `git clone -b part-b-self-host ...` and deploy with
`deploy.sh origin/part-b-self-host`. Run these on the PC itself, over SSH on the lab network or in a
terminal from the Konsol in the Server tab.

SELinux is enforcing on this PC. If the service will not start, `sudo ausearch -m avc -ts recent` shows what it denied.
Do this on a day with no practicum session; it does not touch the live site.

## 2. The tunnel (once)

`cloudflared` is not installed on the PC; one binary is enough. The login prints a link: open it in a
browser that is signed in to Cloudflare and pick `irisiotlab.com`.

```sh
sudo curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo chmod 755 /usr/local/bin/cloudflared && cloudflared --version
cloudflared tunnel login
```

Then, as one paste (it computes the tunnel id itself):

```sh
cloudflared tunnel create iris-pc
cloudflared tunnel route dns iris-pc pc.irisiotlab.com
ID=$(cloudflared tunnel list -o json | python3 -c 'import sys,json; print([t["id"] for t in json.load(sys.stdin) if t["name"]=="iris-pc"][0])')
sudo install -d /etc/cloudflared
sudo cp ~/.cloudflared/$ID.json /etc/cloudflared/
sudo tee /etc/cloudflared/config.yml >/dev/null <<EOF
tunnel: $ID
credentials-file: /etc/cloudflared/$ID.json
ingress:
  - hostname: irisiotlab.com
    service: http://127.0.0.1:8787
  - hostname: pc.irisiotlab.com
    service: http://127.0.0.1:8787
  - service: http_status:404
EOF
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Check from anywhere: `curl -s https://pc.irisiotlab.com/api/sehat` names the PC (`"host":"fedora"`).

## 2a. The Module 4 hunt scoreboard (hunt.irisiotlab.com)

Since 2026-11-10 the LoRa hunt runs on the internet instead of the PC's own hotspot: phones use their own
mobile data, and each group's phone makes the hotspot for its Beacon and Hunter. `modul4.service` listens on
`127.0.0.1:8080` only; the tunnel is the way in. Add one ingress entry **above** the catch-all and route DNS:

```sh
cloudflared tunnel route dns iris-pc hunt.irisiotlab.com
sudo sed -i '/- service: http_status:404/i\  - hostname: hunt.irisiotlab.com\n    service: http://127.0.0.1:8080' /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
```

Do this only after the PC runs the bundle with the join-code hardening (`/roster.json` answers 403 without
`?k=`): the older scoreboard trusted the closed hotspot and would be open to the internet. Check from anywhere:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://hunt.irisiotlab.com/roster.json    # 403
curl -s -o /dev/null -w '%{http_code}\n' https://hunt.irisiotlab.com/ringkas.json   # 403
curl -s -o /dev/null -w '%{http_code}\n' https://hunt.irisiotlab.com/               # 200
```

The scoreboard reads the real client address from `CF-Connecting-IP` (only when the socket itself is loopback),
and refuses the agent-only routes to anything that came through the tunnel.

## 2b. Postgres on the PC

Fedora 44 ships PostgreSQL 18.6, the version Neon runs, so a plain install is the newest one and a dump
restores cleanly. It listens on localhost only. First the install:

```sh
sudo dnf install -y postgresql-server postgresql-contrib age
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
sudo grep -vE '^\s*(#|$)' /var/lib/pgsql/data/pg_hba.conf     # the 127.0.0.1 lines should say scram-sha-256
```

Then, as one paste, the app's role and database. The password is made here and written to a root-only file; it
is never typed or shown:

```sh
PASS=$(openssl rand -hex 24)
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
create role iris login password '$PASS';
create database iris owner iris encoding 'UTF8';
SQL
echo "postgresql://iris:$PASS@127.0.0.1:5432/iris" | sudo tee /etc/iris-web/database-url.local >/dev/null
sudo chown root:iris-web /etc/iris-web/database-url.local && sudo chmod 640 /etc/iris-web/database-url.local
unset PASS
```

A trial copy of the live data (reads Neon, touches nothing that serves the site). `pg_dump` needs the
unpooled address, so the script drops `-pooler`:

```sh
NEON=$(sudo grep '^DATABASE_URL=' /etc/iris-web/env | cut -d= -f2- | sed 's/-pooler//')
pg_dump -Fc --no-owner --no-acl "$NEON" -f /tmp/iris.dump
sudo -u postgres pg_restore --no-owner --no-acl --role=iris -d iris < /tmp/iris.dump
sudo -u postgres psql iris -tAc "select count(*) from audit"      # about what Neon has
rm -f /tmp/iris.dump
```

The server talks to `DATABASE_URL` with plain node-postgres (`src/lib/db.ts`; the Neon WebSocket driver was
removed once Neon was gone). Rehearsed on 8 Nov against a restored copy of
production on PostgreSQL 18.4: 119 tables, the same row counts, the lab clock answering in 6 to 9 ms
(8 queries per call) where Neon from this PC would take about 0.65 s.

## 2c. Nightly backups

A dump at 02:00 WIB, kept 14 days on the PC (`/var/lib/iris-backup`), and the same dump encrypted with the
existing age key and uploaded to R2. Without the R2 half, losing the PC's disk loses everything, so do not
cut over before one upload has been seen. In Cloudflare: R2, create the bucket `iris-backups`, create an API
token with Object Read & Write on that bucket only, and add a lifecycle rule deleting objects after 30 days.

```sh
sudo cp /opt/iris-web/apps/web/deploy/iris-backup.service /opt/iris-web/apps/web/deploy/iris-backup.timer /etc/systemd/system/
sudo install -m 600 -o root -g root /opt/iris-web/apps/web/deploy/backup.env.example /etc/iris-web/backup.env
sudo $EDITOR /etc/iris-web/backup.env        # R2_ACCOUNT_ID, R2_KEY_ID, R2_SECRET (see its comments)
sudo systemctl daemon-reload && sudo systemctl enable --now iris-backup.timer
sudo systemctl start iris-backup.service && sudo journalctl -u iris-backup -n 5 --no-pager   # "backup ok"
```

`backup.sh` refuses a dump with fewer than 50 tables of data or under 50 KB (the service then shows as
failed), writes under a `.partial` name and renames only when it checks out, and keeps the newest 14.
Tested locally (success, refusal on an empty database, retention, restore matching row for row); the R2
upload works (a dump every night since 8 Nov). To restore, on any machine with the age key:

```sh
age -d -i ~/.iris-backup/age-key.txt iris-2026-11-09T1900Z.dump.age > iris.dump
createdb iris_restored && pg_restore --no-owner --no-acl -d iris_restored iris.dump
```

`restore-drill.sh` does the same into a throwaway database, prints what came back (tables, indexes, foreign keys,
row counts, the audit sequence) and deletes everything it made: `bash restore-drill.sh iris-<stamp>.dump.age`.
Run it on a machine that has the key, not on the PC. First run on 9 Nov 2026 with the 02:01 backup: restored with
no errors, 119 tables, 261 indexes, 132 foreign keys, 14,336 audit rows. Run it again before deleting Neon.

## 2d. The Module 4 quiz game (games.irisiotlab.com)

The Kahoot-style Tes Awal quiz for Module 4 runs inside this same server (`server/kuis.ts`, a WebSocket at
`/kuis/ws`), so it needs no new service and no new port: `games.irisiotlab.com` is just a second tunnel
hostname pointing at the same `127.0.0.1:8787`. Add one ingress entry **above** the catch-all and route DNS:

```sh
cloudflared tunnel route dns iris-pc games.irisiotlab.com
sudo sed -i '/- service: http_status:404/i\  - hostname: games.irisiotlab.com\n    service: http://127.0.0.1:8787' /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
```

Then the Website Upgrade (or `deploy.sh`) as usual: the page, the socket and the sign-in hand-over all ship in
the one build. Check from anywhere:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://games.irisiotlab.com/                       # 200, the game page
curl -s -o /dev/null -w '%{http_code}\n' https://games.irisiotlab.com/dashboard              # 302, back to /
curl -s -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==' https://games.irisiotlab.com/kuis/ws   # 403: a socket needs a browser's Origin and a session
```

- The games host has its **own cookie** (`iris_session` is host-only, so the main site's is not sent). A person
  opening the link from the Konsol or the Module 4 page arrives signed in through a one-minute, single-use
  ticket in the link; anyone typing the address signs in on the site's own sign-in page, served on that host.
- The game exists only while a **Module 4** session is running. A room is kept in memory and saved to
  `pengaturan` (`kuis_<sesiId>`, no migration) a moment after each change, so a restart (a Website Upgrade, say)
  brings the room back **paused** and the host presses Lanjutkan. A deploy mid-game is therefore safe but visible.
- `IRIS_HOST_KUIS=<host>` names one more host that behaves as the games host (only for tests or a second domain).
- Cloudflare keeps an idle WebSocket open for about 100 seconds; the page pings every 15 seconds.

## 3. Gates before the cutover

All against `https://pc.irisiotlab.com`, while the real site is still on Vercel:

1. `node scripts/parity.mjs https://irisiotlab.com https://pc.irisiotlab.com` shows 0 differences.
2. Sign in as an Asisten and as a Praktikan, open a live page: the live-update socket reaches
   `konsol.irisiotlab.com`, no CSP errors in the console. (Sign-in cookies are tied to the host, so test
   on `pc.irisiotlab.com` itself.)
3. **Speed.** Measured on the PC on 8 Nov 2026, one `select 1` to Neon takes about 75 to 90 ms (the first
   connection 0.3 s), against about 1 ms from Vercel and well under 1 ms to a Postgres on this PC. A page that
   runs ten queries one after the other would cost about a second more over Neon. Decided: the database moves
   onto the PC (section 2b) in the same window as the site, so the gate is passed by not crossing the network.
   After the move, time the busy endpoints (session view, Dasbor, live session, sign-in) against Vercel's.
4. The PC agent's heartbeat and the relay's minute call both go to `irisiotlab.com`, so they follow the
   record you move in step 6. Nothing to change on the agent.
5. Re-run the leak audit (`leak_api`, `idor_probe`, `leak_pages`, the bundle scan) on this commit.

## 4. Deploying a new commit

`sudo -u iris-web /opt/iris-web/apps/web/deploy/deploy.sh [git-ref]` fetches, builds next to the live
copy, swaps it in and restarts. A failed build stops before touching the running site. Roll back by
deploying the previous ref. A restart lets background jobs finish for up to 60 s.

Since 10 Nov 2026 the same thing is a button: the Pencipta's **Website Upgrade** card on the Server page
(section 7). Use it instead of SSH once it is installed.

## 5. Differences from Vercel to know about

- **No edge caching.** Vercel cached the few API answers that send `s-maxage`; here every request reaches
  the process (and Neon). If a hot endpoint shows up in the speed gate, add a Cloudflare Cache Rule for its path.
- **No compression at the origin.** Cloudflare compresses at its edge.
- **Request bodies stop at 4.5 MB**, the same limit as Vercel, so a handler sees the same thing.
- The client IP is taken from `cf-connecting-ip` (`IRIS_PERCAYA_CF=1`, set in the unit). That is safe only
  because the server listens on 127.0.0.1 and nothing but `cloudflared` can reach it.
- A restart or a crash takes the site down until systemd brings it back (about 3 s). A PC outage takes
  the site and the robot down together; the laptop standby (not built yet) covers the site only.

## 6. Cutover (done 9 Nov 2026 02:12 WIB; kept for a redo or a second site)

State before: gates 1 to 5 pass; one backup has reached R2; PR #127 is deployed and the SeeLabs seals read
`g1 0 | g2 23`. `/etc/iris-web/env` on the PC holds the same `DATA_KUNCI`, its own `SESSION_SECRET` (everyone
signs in once), `KONSOL_RELAY_SECRET`, `BUNDEL_TERBIT`, and a `DATABASE_URL` that points at the **local**
database. The Neon address is kept in `/etc/iris-web/env.neon`; check which is which before copying anything:
`sudo sed -n 's/^DATABASE_URL=.*@\([^/:?]*\).*/\1/p' /etc/iris-web/env /etc/iris-web/env.neon` prints only host names.

What the first attempt (8 Nov, rolled back) taught:

- Until the data copy is fresh, the PC answers from its own old snapshot, while the agent keeps talking to
  whatever the apex points at. Konsol commands queued on the PC's copy never reach the agent.
- The Konsol stores a transcript of everything it shows (up to 64 KB). Never print a secret there; set one with
  a silent paste (`read -rs`) and compare fingerprints (`sha256sum | cut -c1-12`) instead.
- The Konsol drops whenever `cloudflared` restarts and closes after 10 idle minutes. Run multi-step PC work as
  a detached `systemd-run` job and read it with `journalctl -u <unit>`.
- The tunnel's `ingress` must list the apex (section 2), or the apex answers 404.

The order that worked:

1. **Share the secrets while the old host still serves.** Make each value on the laptop straight into the
   clipboard (PowerShell: `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $K = ($b | % { $_.ToString('x2') }) -join ''; Set-Clipboard $K`).
   `KONSOL_RELAY_SECRET`: the `iris-konsol` Worker (Rotate, Deploy), Vercel (edit, redeploy; needs the owner's
   2FA), then the PC. `BUNDEL_TERBIT`: both GitHub repos and the PC (Vercel only if you may roll back to it).
   The PC step is silent: `sudo bash -c 'read -rsp "paste: " S; echo; [ "${#S}" -eq 64 ] && sed -i "s|^NAME=.*|NAME=$S|" /etc/iris-web/env && systemctl restart iris-web'`.
2. **Take a fresh copy** as a detached job: stop the site, `pg_dump -Fc` Neon (address from `env.neon`, minus
   `-pooler`), restore into a new database `iris_new`, compare the table count and `select count(*) from audit`
   with Neon, and only then rename `iris` to `iris_old` and `iris_new` to `iris`; start the site. A failure at
   any step leaves the old local copy in place.
3. **Move the address.** Edit the `irisiotlab.com` record from A to a **proxied** CNAME to
   `<tunnel-id>.cfargotunnel.com`. Leave `www` until a Cloudflare redirect rule replaces Vercel's.
4. **Check:** `curl https://irisiotlab.com/api/sehat?db=1` names the PC; the agent's heartbeat in
   `/api/server/<id>` is seconds old; the PC Server Console opens; `scripts/check-seals.ts` reads 23 of 23.

**Rolling back.** Writes now go to the local database, so first `pg_dump -Fc` the local `iris`, `pg_restore
--clean --if-exists` into Neon, put the Neon `DATABASE_URL` back in the env of whatever serves, then edit the
apex record back to A `76.76.21.21` (DNS only). Leave Neon untouched until after the first real test day.

After a clean week: delete the Neon project, drop `iris_old`, delete `env.neon` and `env.before-secrets`, move
Blob files to R2, stop Vercel deploying on push, cancel Vercel Pro. `.github/workflows/backup.yml` (it dumps
Neon) is disabled since 9 Nov. From now on a merge to `main` does not update the site: run `deploy.sh` (section 4).

## 7. The Website Upgrade button (once)

The Server page has a card, for the Pencipta only, with **Check for Updates**, **Hold to Upgrade**
and a list of earlier builds to **Go Back to**. It replaces typing section 4 over SSH or in the Konsol.

How it works, and why it is built this way. The web process is sandboxed (`ProtectSystem=strict`,
`NoNewPrivileges`), so it cannot run git, npm or sudo, and it should not be able to. It only writes one request
file into `/var/lib/iris-web/upgrade/`. `iris-upgrade.path` sees the file and starts `iris-upgrade.service`, which
runs `upgrade-job.mjs` as `iris-web` outside the sandbox. The job moves the request away first (so it runs once),
runs `deploy.sh`, waits for `/api/sehat` to answer with the new commit, and writes `status.json`, `log.txt`,
`latest.json` and `releases.json` for the card to read. The only privilege involved is the one sudoers line
section 1 already added (`systemctl restart iris-web`).

- **A bad build undoes itself.** If the new build fails to build, or does not answer with its commit within 40 s,
  the job deploys the build that was running and says so on the card.
- **Rollback only goes to builds that ran through the button, and that still have it.** The history starts
  when the first upgrade through the button seeds the build it replaced, so rolling back can never remove the
  button or the API it talks to (the check is that `apps/web/deploy/upgrade-job.mjs` exists in that commit).
  A rollback rebuilds that commit, so it takes the same two to four minutes as an upgrade; the broken build keeps
  serving until the old one is ready.
- **No upgrade during an exam or a practicum session.** The build uses the PC hard for a few minutes, so the card
  refuses while a real exam room is in `prep`, `parts` or `spin`, or a practicum session is running. A rollback and
  a check are never refused for that reason, because a rollback is needed most when something broke.
- **Database changes are not rolled back.** A build that came with a migration keeps its migration applied;
  migrations here are applied by hand and are additive, so the older build runs on the newer schema. Check
  that before going back across one.
- Every request is audited (`web_upgrade`: who, which action, which build).

Install once on the PC, in the Konsol or over SSH, after the commit that adds the button has been deployed the old
way (section 4). It needs a quiet moment because it restarts the site (about 3 s) to apply the new unit:

```sh
sudo install -d -m 755 -o iris-web -g iris-web /var/lib/iris-web/upgrade
cd /opt/iris-web/apps/web/deploy
sudo cp iris-web.service iris-upgrade.service iris-upgrade.path /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now iris-upgrade.path
sudo systemctl restart iris-web
systemctl is-active iris-upgrade.path           # active
curl -s 'http://127.0.0.1:8787/api/sehat'       # the site is back
```

Then open the Server page, press **Check for Updates** and read the log underneath: `Up to date.` or a list of
newer commits means the whole chain works (card, request file, path unit, job). The first **Hold to Upgrade**
adds the running build to the history so there is something to go back to. If the card says it is not set up, the
folder is missing or the site was not restarted after the new unit was copied (`ReadWritePaths`).

Nothing here needs a new secret. To remove it: `sudo systemctl disable --now iris-upgrade.path`, and delete the
unit files and `/var/lib/iris-web/upgrade`.

## 8. Measuring (real-time upgrade)

Every change to speed is judged against numbers taken before it. Four tools, all read-only on the live site.

**What the server says about itself.** `GET /api/sehat` (public) shows the build, uptime, background jobs, the
database pool (`kolam`: total, idle, waiting), open sockets per live hub (`soket`) and the event-loop delay
(`jedaLoopMs`, p99 over 100 ms means something held the process). With a token it also shows, per route, how many
requests, how many failed, p50/p95/p99 in ms, and how many database queries each one ran and how long they took:

```sh
# once: put a token in /etc/iris-web/env as IRIS_METRIK_TOKEN (16+ characters, silent prompt), restart the site
curl -s -H "x-metrik: $IRIS_METRIK_TOKEN" 'http://127.0.0.1:8787/api/sehat?metrik=1'            # read
curl -s -H "x-metrik: $IRIS_METRIK_TOKEN" 'http://127.0.0.1:8787/api/sehat?metrik=1&ulang=1'    # read, then start a fresh window
```

A percentile of `-1` means over 5 s. Set `IRIS_LAMBAT_MS=200` to log every answer slower than that.

**The database.** Turn on `pg_stat_statements` once (it needs a Postgres restart, so do it at a quiet moment):

```sh
sudo -u postgres psql -Atc "show shared_preload_libraries"      # note what is there, keep it and add the new name
sudo -u postgres psql -c "alter system set shared_preload_libraries = 'pg_stat_statements'"   # append to any existing list
sudo systemctl restart postgresql
sudo -u postgres psql -d iris -c "create extension if not exists pg_stat_statements"
```

(The file is piped through `cat` because the `postgres` user cannot read `/opt/iris-web`; `psql -f` would say
"permission denied". The same goes for applying a migration:
`sudo cat /opt/iris-web/apps/web/drizzle/00NN_name.sql | sudo -u postgres psql -d iris -v ON_ERROR_STOP=1`.)

Then take the baseline (cache hit ratio, connections, biggest tables, sequential-scan-heavy tables, unused indexes,
the settings that matter, top 20 statements by total time):

```sh
sudo cat /opt/iris-web/apps/web/deploy/baseline-db.sql | sudo -u postgres psql -d iris > ~/db-baseline-$(date +%F).txt
```

**The web as a visitor sees it** (from a laptop; use `http://127.0.0.1:8787` on the PC for the server alone):
`node scripts/baseline-web.mjs https://irisiotlab.com --runs 5 --out perf/web-baseline-<date>.json` records, for
eight pages, TTFB, first-load bytes, number of stylesheets and scripts, and whether a repeat visit is a 304.

**Real-time fan-out** (`scripts/fanout.mjs`): opens N listener sockets, announces unique topics, and times every
socket hearing each one (p50/p95/p99/max, missing deliveries, connect time). On a live host it needs `--allow-live`
and refuses during class hours (06:00 to 21:00 WIB, Monday to Saturday) unless `--force`. The secret only ever comes
from an environment variable:

```sh
node scripts/fanout.mjs --url ws://127.0.0.1:8787/siaran --sockets 1000 --hold 30           # connections only
FANOUT_SECRET=... node scripts/fanout.mjs --url wss://HOST/siaran --emit bearer --emit-url https://HOST/siaran/kirim   --sockets 1000 --rounds 20 --out perf/fanout-<name>.json --allow-live
```

Baselines taken so far are in `apps/web/perf/`.

**Live rooms and the lab clock in this server** (real-time upgrade, phase 2b). The session rooms (`/aliran/sesi-<id>`,
`/aliran/pc`) and the exam rooms (`/ujian/rec-<id>`) live in the server process, with the same tickets and the same
who-sees-what rules as the Worker's rooms. A page's ticket request now answers with this server's address
(`wss://<host>/aliran/...`); three failed connects in a row make the page ask for the Worker's address (`?lama=1`)
for a while. The lab clock also runs in the server, two seconds into every minute (starts sessions at their
attendance clock, ends them at their cap with no page open, announces it).

| Variable                | Default | What it does                                                                         |
| ----------------------- | ------- | ------------------------------------------------------------------------------------ |
| `IRIS_RUANG_HUB=0`      | on      | tickets point at the Worker again (rollback, then restart the service)               |
| `IRIS_RUANG_SOKET_MAKS` | 5000    | sockets in all rooms together                                                        |
| `IRIS_JAM_LAB=0`        | on      | leaves the lab clock to the Worker's minute cron                                     |
| `IRIS_RELAY_LAMA=0`     | on      | stops every POST to the Worker (topics and rooms); do it only after a few quiet days |

The Worker's cron and the server's timer can both run: the minute is claimed in one SQL statement, so it runs once.
After a week without trouble, `IRIS_RELAY_LAMA=0` is the last step; the Worker stays for Konsol, TP files and as a
fallback. `/api/sehat` shows `soket.ruang` next to `soket.siaran`.

`IRIS_PANTAU_QR=0` turns off the server reading a QR wall's Google Form sheet every 2.5 s while a page watches it (pages are told with the `recqr` topic; with it off they ask every 20 s).

## 9. Tuning Postgres for this PC

A stock Postgres is set for a small machine. These values suit a PC with plenty of RAM and an SSD that runs Postgres
beside the site, `cloudflared` and the lab services. Sizes come from the RAM: take **RAM = 16 GB** here and scale the
three memory lines for another machine (the second server will have more).

| Setting                        | Value              | Why                                                                                |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `shared_buffers`               | 25% of RAM (4 GB)  | Postgres's own cache of table and index pages                                      |
| `effective_cache_size`         | 60% of RAM (10 GB) | tells the planner the OS also caches; no memory is reserved                        |
| `work_mem`                     | 16 MB              | per sort or hash in a query; the report queries sort a little                      |
| `maintenance_work_mem`         | 512 MB             | index builds and vacuum                                                            |
| `random_page_cost`             | 1.1                | an SSD reads a random page almost as fast as a sequential one                      |
| `effective_io_concurrency`     | 200                | SSD                                                                                |
| `wal_compression`              | on                 | smaller WAL for the heartbeat and telemetry writes                                 |
| `checkpoint_completion_target` | 0.9                | spreads checkpoint writes                                                          |
| `max_wal_size`                 | 2 GB               | fewer forced checkpoints under bursts                                              |
| `track_io_timing`              | on                 | read and write time per query in `pg_stat_statements`                              |
| `max_connections`              | 200                | the site's pool is 30 per process (`IRIS_DB_POOL`); leave room for several workers |

```sh
sudo -u postgres psql <<'SQL'
alter system set shared_buffers = '4GB';
alter system set effective_cache_size = '10GB';
alter system set work_mem = '16MB';
alter system set maintenance_work_mem = '512MB';
alter system set random_page_cost = 1.1;
alter system set effective_io_concurrency = 200;
alter system set wal_compression = on;
alter system set checkpoint_completion_target = 0.9;
alter system set max_wal_size = '2GB';
alter system set track_io_timing = on;
alter system set max_connections = 200;
SQL
sudo systemctl restart postgresql      # shared_buffers and max_connections need a restart; do it at a quiet moment
```

`denyut` (a row per PC beat) and `telemetri_log` are inserted and pruned all day, so their dead rows pile up fast.
Make autovacuum visit them sooner:

```sh
sudo -u postgres psql -d iris <<'SQL'
alter table denyut set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table telemetri_log set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
SQL
```

After a restart, check with `show shared_buffers;` and run section 8's database baseline again to compare the cache hit
ratio and the top statements. If the site's workers (Phase 3 of the upgrade) are many, lower `IRIS_DB_POOL` so that
workers times pool stays under `max_connections` minus a margin.
