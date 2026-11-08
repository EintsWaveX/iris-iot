# Running IRIS web on the PC Server (Part B)

Status: **built and tested, not deployed.** `irisiotlab.com` is still served by Vercel. Nothing here
changes it until the apex DNS record is moved (step 6), and moving it back undoes everything.

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
  - hostname: pc.irisiotlab.com
    service: http://127.0.0.1:8787
  - service: http_status:404
EOF
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Check from anywhere: `curl -s https://pc.irisiotlab.com/api/sehat` names the PC (`"host":"fedora"`).

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

The server picks its driver from `DATABASE_URL` (`src/lib/db.ts`): a `*.neon.tech` host uses Neon's WebSocket
driver, anything else (127.0.0.1) uses plain node-postgres. Rehearsed on 8 Nov against a restored copy of
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
upload itself is untested until the keys exist. To restore, on any machine with the age key:

```sh
age -d -i ~/.iris-backup/age-key.txt iris-2026-11-09T1900Z.dump.age > iris.dump
createdb iris_restored && pg_restore --no-owner --no-acl -d iris_restored iris.dump
```

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

## 5. Differences from Vercel to know about

- **No edge caching.** Vercel cached the few API answers that send `s-maxage`; here every request reaches
  the process (and Neon). If a hot endpoint shows up in the speed gate, add a Cloudflare Cache Rule for its path.
- **No compression at the origin.** Cloudflare compresses at its edge.
- **Request bodies stop at 4.5 MB**, the same limit as Vercel, so a handler sees the same thing.
- The client IP is taken from `cf-connecting-ip` (`IRIS_PERCAYA_CF=1`, set in the unit). That is safe only
  because the server listens on 127.0.0.1 and nothing but `cloudflared` can reach it.
- A restart or a crash takes the site down until systemd brings it back (about 3 s). A PC outage takes
  the site and the robot down together; the laptop standby (not built yet) covers the site only.

## 6. Cutover (a quiet window, no session running, about five minutes of downtime)

Before: gates 1 to 5 pass; one backup has reached R2; PR #127 is deployed, `DATA_KUNCI` is set on Vercel and
the SeeLabs seals read `g1 0 | g2 23`; `/etc/iris-web/env` on the PC holds the same `DATA_KUNCI`, a **new**
`SESSION_SECRET` (everyone signs in once), and the real `KONSOL_RELAY_SECRET` and `BUNDEL_TERBIT`.

1. **Move the address.** In the Cloudflare dashboard, change the `irisiotlab.com` and `www` records to a
   **proxied** CNAME to `<tunnel-id>.cfargotunnel.com` (or `cloudflared tunnel route dns --overwrite-dns iris-pc irisiotlab.com`).
   The PC, still on Neon, now serves everything; check `https://irisiotlab.com/api/sehat` names it.
2. **Stop the site:** `sudo systemctl stop iris-web`. The relay's minute call and the PC agent just retry.
3. **Take a fresh copy** into an empty database:
   ```sh
   NEON=$(sudo grep '^DATABASE_URL=' /etc/iris-web/env | cut -d= -f2- | sed 's/-pooler//')
   sudo -u postgres dropdb iris && sudo -u postgres createdb -O iris iris
   pg_dump -Fc --no-owner --no-acl "$NEON" -f /tmp/iris.dump
   sudo -u postgres pg_restore --no-owner --no-acl --role=iris -d iris < /tmp/iris.dump
   rm -f /tmp/iris.dump
   ```
4. **Point the server at it:**
   `sudo sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$(sudo cat /etc/iris-web/database-url.local)|" /etc/iris-web/env`
5. **Start and check:** `sudo systemctl start iris-web`, then `curl -s 'https://irisiotlab.com/api/sehat?db=1'`,
   `node scripts/parity.mjs <reference> https://irisiotlab.com`, sign in, and watch one lab-clock minute in
   `sudo journalctl -u iris-web -f`.

**Rolling back.** Before step 2, put the old DNS records back; nothing else changed. After step 5, writes go to
the local database, so a rollback means copying it back first: `pg_dump -Fc` the local `iris`, `pg_restore
--clean --if-exists` into Neon, put the Neon `DATABASE_URL` back, then move DNS. Leave Neon untouched for a week.

After a clean week, in this order: disable `.github/workflows/backup.yml` (it dumps Neon) and delete the Neon
project, move Blob files to R2, build the laptop standby, stop Vercel deploying on push, cancel Vercel Pro.
