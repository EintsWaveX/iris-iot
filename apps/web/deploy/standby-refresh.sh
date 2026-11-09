#!/usr/bin/env bash
# Brings the laptop standby up to date with the PC: the newest nightly database backup from R2 and,
# with --env, the PC's secrets (backup.sh uploads them, age-encrypted to the same key, as env/iris-env.age).
#
# Run as root in the standby distro (STANDBY.md):
#   bash standby-refresh.sh            # newest database backup
#   bash standby-refresh.sh --env      # also the PC's secrets, so sessions and SeeLabs seals carry over
#   bash standby-refresh.sh --print-newest   # only say which backup it would take
#
# Needs /etc/iris-web/standby.env (root 0600): R2_ACCOUNT_ID, R2_BUCKET, R2_KEY_ID and R2_SECRET of a
# token with Object READ on the backup bucket only; and the age private key (IRIS_AGE_KEY).
#
# The new copy is restored into a fresh database (iris_new) and checked against the dump's own table count
# before the names are swapped (iris becomes iris_old), so a bad or half-downloaded file changes nothing.
set -euo pipefail

WIN_HOME="${IRIS_WIN_HOME:-/mnt/c/Users/EintsWaveX}"
AGE_KEY="${IRIS_AGE_KEY:-$WIN_HOME/.iris-backup/age-key.txt}"
CONF="${IRIS_STANDBY_ENV:-/etc/iris-web/standby.env}"
WITH_ENV=0
PRINT_ONLY=0
for a in "$@"; do
  case "$a" in
    --env) WITH_ENV=1 ;;
    --print-newest) PRINT_ONLY=1 ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

as_pg() { runuser -u postgres -- "$@"; }
say() { printf '%s\n' "$*"; }

# The newest backup key out of an S3 ListObjectsV2 answer on stdin. Names are iris-<UTC stamp>.dump.age,
# so the lexical maximum is the newest.
newest_key() {
  python3 -c '
import re, sys
keys = re.findall(r"<Key>([^<]+\.dump\.age)</Key>", sys.stdin.read())
if not keys:
    sys.exit(3)
print(max(keys))
'
}

r2() { # r2 <path-and-query> [curl args...]
  local path="$1"; shift
  curl --fail --silent --show-error --aws-sigv4 "aws:amz:auto:s3" --user "$R2_KEY_ID:$R2_SECRET" \
    -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" "$@" "${R2_ENDPOINT:-https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}/$path"
}

if [ -n "${IRIS_LIST_XML:-}" ]; then # a saved listing, for testing the choice without R2
  KEY="$(newest_key < "$IRIS_LIST_XML")"
else
  [ -r "$CONF" ] || { echo "missing $CONF (see STANDBY.md)" >&2; exit 1; }
  # shellcheck disable=SC1090
  . "$CONF"
  : "${R2_ACCOUNT_ID:?}" "${R2_BUCKET:?}" "${R2_KEY_ID:?}" "${R2_SECRET:?}"
  KEY="$(r2 "$R2_BUCKET?list-type=2&prefix=db/" | newest_key)"
fi
say "newest backup: $KEY"
[ "$PRINT_ONLY" = 1 ] && exit 0

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
[ -r "$AGE_KEY" ] || { echo "cannot read the age key $AGE_KEY" >&2; exit 1; }
WORK="$(mktemp -d /tmp/iris-refresh-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

say "== downloading and opening it"
r2 "$R2_BUCKET/$KEY" -o "$WORK/db.age"
age -d -i "$AGE_KEY" -o "$WORK/db.dump" "$WORK/db.age" < /dev/null
WANT="$(pg_restore --list "$WORK/db.dump" | grep -c 'TABLE DATA' || true)"
[ "$WANT" -ge 50 ] || { echo "the backup lists only $WANT tables with data; refusing it" >&2; exit 1; }

say "== restoring into iris_new ($WANT tables with data)"
as_pg dropdb --if-exists iris_new
as_pg createdb -O iris iris_new
as_pg pg_restore --no-owner --no-acl --role=iris -d iris_new < "$WORK/db.dump" || say "pg_restore reported warnings (usually harmless)"
GOT="$(as_pg psql -d iris_new -tAc "select count(*) from information_schema.tables where table_schema='public'")"
say "iris_new has $GOT tables, audit rows: $(as_pg psql -d iris_new -tAc 'select count(*) from audit')"
[ "$GOT" -ge 50 ] || { echo "the restore looks wrong ($GOT tables); the standby is unchanged" >&2; exit 1; }

if [ "$WITH_ENV" = 1 ]; then
  say "== the PC's secrets"
  r2 "$R2_BUCKET/env/iris-env.age" -o "$WORK/env.age"
  age -d -i "$AGE_KEY" -o "$WORK/env" "$WORK/env.age" < /dev/null
  # The PC's database address is the PC's; the standby keeps its own.
  LOCAL_URL="$(cat /etc/iris-web/database-url.local)"
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$LOCAL_URL|" "$WORK/env"
  grep -q '^SESSION_SECRET=.' "$WORK/env" && grep -q '^DATA_KUNCI=.' "$WORK/env" \
    || { echo "the env copy has no SESSION_SECRET or DATA_KUNCI; the standby's env is unchanged" >&2; exit 1; }
fi

say "== swapping in"
systemctl stop iris-web
as_pg psql -q -d postgres -c "ALTER DATABASE iris RENAME TO iris_old" -c "ALTER DATABASE iris_new RENAME TO iris"
if [ "$WITH_ENV" = 1 ]; then
  cp -p /etc/iris-web/env "/etc/iris-web/env.before-refresh"
  install -m 640 -o root -g iris-web "$WORK/env" /etc/iris-web/env
fi
systemctl start iris-web
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8787/api/sehat?db=1" >/dev/null 2>&1; then
    say "up: $(curl -fsS 'http://127.0.0.1:8787/api/sehat?db=1')"
    say "refreshed from $KEY (the previous database is kept as iris_old)"
    exit 0
  fi
  sleep 1
done
echo "the site did not come up after the swap; the previous database is iris_old" >&2
exit 1
