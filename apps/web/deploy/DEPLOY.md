# Running IRIS web on the PC Server (Part B)

Status: **built and tested, not deployed.** `irisiotlab.com` is still served by Vercel. Nothing here
changes it until the apex DNS record is moved (step 6), and moving it back undoes everything.

What this replaces: Vercel hosting (Pro, $20/mo). What it keeps for now: Neon (the database) and
Vercel Blob (slides, schematics, photos), both reached from the PC over the internet with the same
credentials. The relay Worker, R2 and the domain are already on Cloudflare.

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
node --version                      # needs 24.x (engines in package.json)
sudo useradd --system --create-home --home-dir /opt/iris-web iris-web
sudo -u iris-web git clone https://github.com/EintsWaveX/iris-iot.git /opt/iris-web   # deploy key or token, your call
sudo install -d -m 750 -o root -g iris-web /etc/iris-web
sudo cp /opt/iris-web/apps/web/deploy/iris-web.env.example /etc/iris-web/env
sudo $EDITOR /etc/iris-web/env      # fill every value from Vercel's Production env; chmod root:iris-web 0640
sudo cp /opt/iris-web/apps/web/deploy/iris-web.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable iris-web
echo 'iris-web ALL=(root) NOPASSWD: /usr/bin/systemctl restart iris-web' | sudo tee /etc/sudoers.d/iris-web
sudo -u iris-web /opt/iris-web/apps/web/deploy/deploy.sh
curl -s 'http://127.0.0.1:8787/api/sehat?db=1'
```

If the service will not start and SELinux is on, `sudo ausearch -m avc -ts recent` shows what it denied.
Do this on a day with no practicum session; it does not touch the live site.

## 2. The tunnel (once)

```sh
cloudflared tunnel login                      # opens a browser: pick irisiotlab.com
cloudflared tunnel create iris-pc
cloudflared tunnel route dns iris-pc pc.irisiotlab.com
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: iris-pc
credentials-file: /etc/cloudflared/<tunnel-id>.json
ingress:
  - hostname: pc.irisiotlab.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Then `sudo cloudflared service install && sudo systemctl enable --now cloudflared`.

## 3. Gates before the cutover

All against `https://pc.irisiotlab.com`, while the real site is still on Vercel:

1. `node scripts/parity.mjs https://irisiotlab.com https://pc.irisiotlab.com` shows 0 differences.
2. Sign in as an Asisten and as a Praktikan, open a live page: the live-update socket reaches
   `konsol.irisiotlab.com`, no CSP errors in the console. (Sign-in cookies are tied to the host, so test
   on `pc.irisiotlab.com` itself.)
3. **Speed.** The database is in Singapore and the PC in Bandung, so each query costs about 20 to 30 ms
   instead of about 1 ms on Vercel. Time the busy endpoints (session view, Dasbor, live session, sign-in)
   on both and compare; if a page does many queries one after the other, batch them first.
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

## 6. Cutover (a quiet window, no session running)

In the Cloudflare dashboard, change the `irisiotlab.com` and `www` records from the Vercel address to a
**proxied** CNAME to `<tunnel-id>.cfargotunnel.com` (or run `cloudflared tunnel route dns --overwrite-dns iris-pc irisiotlab.com`).
Check `https://irisiotlab.com/api/sehat` names this machine. **To roll back,** put the old records back; the
Vercel project is untouched and still deployed.

Keep Vercel deployed for a clean week. Then, in this order: move Blob files to R2, move Postgres onto the
PC (with nightly dumps to R2 first), build the laptop standby, stop Vercel deploying on push, cancel Vercel Pro.
