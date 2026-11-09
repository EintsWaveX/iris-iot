#!/usr/bin/env bash
# The laptop standby of the IRIS site, in a WSL Fedora distro: the same Node, Postgres, user, unit and
# deploy script as the PC (DEPLOY.md sections 1 and 2b), so it is a twin that can take over by hand.
#
# Run as root inside the distro (it changes nothing on Windows, and never touches the live site):
#
#   wsl -d FedoraLinux-44 -u root -- bash /mnt/c/.../iris-iot/apps/web/deploy/standby-wsl.sh
#
# Knobs (environment, all optional):
#   IRIS_SRC          the repo to clone: a path or a URL (default: the checkout on the Windows side)
#   IRIS_BACKUP_FILE  an age-encrypted pg_dump to restore (the newest db_iris-*.dump.age in Downloads)
#   IRIS_AGE_KEY      the age private key that opens it (~/.iris-backup/age-key.txt on Windows)
#   NODE_VER          Node 24.x to install (as DEPLOY.md)
#
# Safe to run again: each step looks before it acts, and an existing database or env file is kept.
# The env file it writes holds REHEARSAL secrets (fresh random ones). Before the standby serves
# anyone, swap in the PC's real values (deploy/standby-refresh.sh --env, STANDBY.md) or sessions and
# the SeeLabs seals will not carry over.
set -euo pipefail

WIN_HOME="${IRIS_WIN_HOME:-/mnt/c/Users/EintsWaveX}"
SRC="${IRIS_SRC:-$WIN_HOME/Documents/WebApps/iris-iot}"
AGE_KEY="${IRIS_AGE_KEY:-$WIN_HOME/.iris-backup/age-key.txt}"
NODE_VER="${NODE_VER:-v24.19.0}"
BACKUP="${IRIS_BACKUP_FILE:-}"
if [ -z "$BACKUP" ]; then
  # shellcheck disable=SC2012
  BACKUP="$(ls -1t "$WIN_HOME"/Downloads/db_iris-*.dump.age 2>/dev/null | head -1 || true)"
fi

step() { printf '\n== %s\n' "$*"; }
as_web() { runuser -u iris-web -- "$@"; }
as_pg() { runuser -u postgres -- "$@"; }

[ "$(id -u)" = 0 ] || { echo "run this as root (wsl -u root)" >&2; exit 1; }

step "packages"
dnf install -y postgresql-server postgresql-contrib age git tar xz curl openssl python3 util-linux sudo >/dev/null
echo "ok"

step "node $NODE_VER"
if [ ! -x /opt/node24/bin/node ]; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/$NODE_VER/SHASUMS256.txt" | grep "node-$NODE_VER-linux-x64.tar.xz" | sha256sum -c -
  tar -xJf "node-$NODE_VER-linux-x64.tar.xz" -C /opt
  ln -sfn "/opt/node-$NODE_VER-linux-x64" /opt/node24
  rm -f "node-$NODE_VER-linux-x64.tar.xz"
fi
/opt/node24/bin/node --version

step "the iris-web user and the code"
id iris-web >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/iris-web --shell /sbin/nologin iris-web
install -d -o iris-web -g iris-web /opt/iris-web
# The Windows checkout belongs to another owner as far as git can tell.
as_web git config --global --add safe.directory '*'
if [ ! -d /opt/iris-web/.git ]; then
  as_web git clone --quiet "$SRC" /opt/iris-web
fi
as_web git -C /opt/iris-web log -1 --format='code at %h %s' | cut -c1-90

step "postgres"
if [ ! -d /var/lib/pgsql/data/base ]; then
  postgresql-setup --initdb >/dev/null
fi
# Fedora's default for the loopback addresses is ident; the app logs in with a password.
sed -i -E 's/^(host[[:space:]]+all[[:space:]]+all[[:space:]]+(127\.0\.0\.1\/32|::1\/128)[[:space:]]+)ident/\1scram-sha-256/' /var/lib/pgsql/data/pg_hba.conf
systemctl enable --now postgresql >/dev/null 2>&1
systemctl reload postgresql
install -d -m 750 -o root -g iris-web /etc/iris-web
if [ ! -s /etc/iris-web/database-url.local ]; then
  PASS="$(openssl rand -hex 24)"
  as_pg psql -v ON_ERROR_STOP=1 -q <<SQL
create role iris login password '$PASS';
create database iris owner iris encoding 'UTF8';
SQL
  echo "postgresql://iris:$PASS@127.0.0.1:5432/iris" > /etc/iris-web/database-url.local
  chown root:iris-web /etc/iris-web/database-url.local
  chmod 640 /etc/iris-web/database-url.local
  unset PASS
  echo "role and database created"
else
  echo "role and database already there"
fi

step "data"
TABLES="$(as_pg psql -d iris -tAc "select count(*) from information_schema.tables where table_schema='public'")"
if [ "$TABLES" -gt 0 ]; then
  echo "the database already has $TABLES tables; leaving it alone"
elif [ -n "$BACKUP" ] && [ -r "$BACKUP" ] && [ -r "$AGE_KEY" ]; then
  echo "restoring $(basename "$BACKUP")"
  DUMP="$(mktemp /tmp/iris-standby-XXXXXX.dump)"
  age -d -i "$AGE_KEY" -o "$DUMP" "$BACKUP" < /dev/null
  as_pg pg_restore --no-owner --no-acl --role=iris -d iris < "$DUMP" || echo "pg_restore reported warnings (usually harmless); checking the result"
  rm -f "$DUMP"
  echo "tables: $(as_pg psql -d iris -tAc "select count(*) from information_schema.tables where table_schema='public'"), audit rows: $(as_pg psql -d iris -tAc 'select count(*) from audit')"
else
  echo "no backup and key found: the database is empty (set IRIS_BACKUP_FILE and IRIS_AGE_KEY)"
fi

step "the env file"
if [ ! -s /etc/iris-web/env ]; then
  cp /opt/iris-web/apps/web/deploy/iris-web.env.example /etc/iris-web/env
  setkv() { sed -i "s|^$1=.*|$1=$2|" /etc/iris-web/env; }
  setkv DATABASE_URL "$(cat /etc/iris-web/database-url.local)"
  for k in SESSION_SECRET DATA_KUNCI REC_QR_SECRET KONSOL_RELAY_SECRET BUNDEL_TERBIT; do setkv "$k" "$(openssl rand -hex 32)"; done
  chown root:iris-web /etc/iris-web/env
  chmod 640 /etc/iris-web/env
  echo "written with REHEARSAL secrets; replace them with the PC's before serving anyone"
else
  echo "already there; kept"
fi

step "the service"
cp /opt/iris-web/apps/web/deploy/iris-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable iris-web >/dev/null 2>&1
echo 'iris-web ALL=(root) NOPASSWD: /usr/bin/systemctl restart iris-web' > /etc/sudoers.d/iris-web
chmod 440 /etc/sudoers.d/iris-web
visudo -cf /etc/sudoers.d/iris-web >/dev/null

step "build and start (deploy.sh, as on the PC)"
as_web /opt/iris-web/apps/web/deploy/deploy.sh origin/main

step "checks"
curl -fsS 'http://127.0.0.1:8787/api/sehat?db=1'
echo
