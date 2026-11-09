# The laptop standby

A second copy of the site on the maintainer's laptop, in a WSL Fedora distro, for the days the lab PC is
off. It is the same Node 24, PostgreSQL 18, user, systemd unit and `deploy.sh` as the PC (DEPLOY.md
sections 1 and 2b), so what runs there is what runs on the PC. **One machine serves `irisiotlab.com` at a
time**; moving it is a manual DNS edit, on purpose (two live copies of the data would drift apart).

What it covers: the site, sign-in and every page, the API, the Servers tab, uploaded files (they are in
the database since #129). What it cannot do, because it is not the lab hardware: the module Wi-Fi hotspot,
the Mosquitto broker the modules talk to, the SeeLabs robot and the C judge (those run in the PC's agent).
While the PC is off, those wait for it.

## Built (9 Nov 2026)

`deploy/standby-wsl.sh`, as root in the distro, did: packages, Node 24.19 in `/opt/node24`, the `iris-web`
user, the repo in `/opt/iris-web`, PostgreSQL with the `iris` role and database, a restore of the newest
backup, `/etc/iris-web/env`, the unit, and a `deploy.sh` run. It listens on `127.0.0.1:8787` inside WSL
(Windows reaches it as `http://127.0.0.1:8787`). Checked with `scripts/parity.mjs` against the live site:
118 of 150 paths identical, the other 32 differ only in page-body asset hashes (the standby was one build
newer), no status, redirect or header differed.

Its env holds **rehearsal secrets** (random ones) until `--env` below replaces them.

## Keeping it running

WSL stops its virtual machine a few seconds after the last open session, and the site stops with it. Keep
the distro alive and the laptop awake:

- now: `wsl -d FedoraLinux-44 -u root --exec sleep infinity` left running;
- after a reboot: a Windows scheduled task that runs the same command at logon, and Windows set to never
  sleep on power (`powercfg /change standby-timeout-ac 0`).

## Keeping it fresh

The PC's nightly backup (`deploy/backup.sh`) uploads the database dump to R2 and, from the night this change is deployed, the PC's env
(its secrets, readable only through the age key) encrypted to the same age key as `env/iris-env.age`. The standby pulls both:

1. In the Cloudflare dashboard, R2, create an API token with **Object Read only** on `iris-backups`.
2. In the distro, as root: `install -m 600 /dev/null /etc/iris-web/standby.env`, then put in it
   `R2_ACCOUNT_ID=`, `R2_BUCKET=iris-backups`, `R2_KEY_ID=`, `R2_SECRET=` (paste the token silently; do not
   type it where a transcript keeps it).
3. `bash deploy/standby-refresh.sh --env`. It restores into `iris_new`, checks the table count, swaps the
   names (the old copy stays as `iris_old`) and installs the PC's secrets keeping the standby's own
   database address. Without `--env` only the data is refreshed. `--print-newest` only names the backup.

With the PC's secrets, a session cookie signed on the PC is valid on the standby, and the SeeLabs seals open
(`scripts/check-seals.ts`). Data is as old as the last nightly backup; for fresher data, run
`deploy/backup.sh` by hand on the PC first (the Konsol, or the lab display).

## Taking over

Only when the PC is down. Needs its own Cloudflare tunnel (a tunnel has one home; do not run the PC's
tunnel on the laptop):

```sh
# once, in the distro
cloudflared tunnel login                      # open the link in the signed-in browser
cloudflared tunnel create iris-laptop
cloudflared tunnel route dns iris-laptop laptop.irisiotlab.com   # a test name that always works
```

with `/etc/cloudflared/config.yml` listing `irisiotlab.com`, `laptop.irisiotlab.com` and a final
`http_status:404` rule, as DEPLOY.md section 2, then `cloudflared service install`. Check
`https://laptop.irisiotlab.com/api/sehat` names the laptop. To take over: refresh (above), then in the
Cloudflare dashboard edit the apex record to a proxied CNAME to the laptop tunnel
(`<id>.cfargotunnel.com`). Everyone signs in again only if the secrets were not synced.

To give the PC back: stop writes on the laptop (`systemctl stop iris-web`), copy the laptop's database to the
PC (`pg_dump -Fc` then `pg_restore --clean --if-exists` there, as DEPLOY.md's rollback), start the PC site,
then edit the apex back to the PC's tunnel.

## The Servers tab

The laptop can be enrolled as a second server (Servers, Add a server, then the enrol command on the
laptop) so the tab shows both machines. The agent there reports the laptop's own health; services that
exist only on the lab PC show as stopped.
