#!/usr/bin/env bash
# Nightly dump of the IRIS database: a local copy, then the same dump encrypted with age
# and uploaded to Cloudflare R2, so losing the PC's disk loses at most one night.
#
# Runs as the postgres user from iris-backup.service (02:00 WIB). By hand:
#   sudo -u postgres /opt/iris-web/apps/web/deploy/backup.sh
#
# Needs for the upload (/etc/iris-web/backup.env, see backup.env.example): R2_ACCOUNT_ID,
# R2_BUCKET, R2_KEY_ID, R2_SECRET. The age recipient is a public key; the private key lives off
# this PC (~/.iris-backup/age-key.txt on the maintainer's PC) and is what restores need.
#
# Knobs (all optional): IRIS_BACKUP_DB (iris), IRIS_BACKUP_DIR (/var/lib/iris-backup),
# IRIS_BACKUP_KEEP local copies (14), IRIS_BACKUP_LOCAL_ONLY=1 to skip encrypt and upload.
set -euo pipefail

DB="${IRIS_BACKUP_DB:-iris}"
DIR="${IRIS_BACKUP_DIR:-/var/lib/iris-backup}"
KEEP="${IRIS_BACKUP_KEEP:-14}"
AGE_RECIPIENT="${AGE_RECIPIENT:-age1e08tnc8mpk0cs3znyujtlmt5z4cd5fevu3zsecsk0c7hgcaxnpzs2fwv4w}"

umask 077
mkdir -p "$DIR"
chmod 700 "$DIR" 2>/dev/null || echo "backup: could not chmod $DIR (continuing; files are 0600 anyway)" >&2
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
OUT="$DIR/iris-$STAMP.dump"
# Written under a .partial name and renamed only once it checks out, so a failed or repeated
# run can never replace or leave half a backup under the real name.
PART="$OUT.partial"
trap 'rm -f "$PART"' EXIT

pg_dump --format=custom --no-owner --no-acl --dbname="$DB" --file="$PART"

# A dump that lists no data, or is tiny, is not a backup: stop loudly (the timer shows it failed).
TABLES="$(pg_restore --list "$PART" | grep -c 'TABLE DATA' || true)"
SIZE="$(stat -c %s "$PART")"
if [ "$TABLES" -lt 50 ] || [ "$SIZE" -lt 50000 ]; then
  echo "backup: only $TABLES tables with data and $SIZE bytes; refusing to keep it" >&2
  exit 1
fi
mv -f "$PART" "$OUT"

if [ "${IRIS_BACKUP_LOCAL_ONLY:-0}" != "1" ]; then
  command -v age >/dev/null || { echo "backup: age is not installed" >&2; exit 1; }
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}" "${R2_BUCKET:?R2_BUCKET is not set}"
  : "${R2_KEY_ID:?R2_KEY_ID is not set}" "${R2_SECRET:?R2_SECRET is not set}"
  age -r "$AGE_RECIPIENT" -o "$OUT.age" "$OUT"
  curl --fail --silent --show-error \
    --aws-sigv4 "aws:amz:auto:s3" --user "$R2_KEY_ID:$R2_SECRET" \
    -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
    -T "$OUT.age" \
    "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com/$R2_BUCKET/db/iris-$STAMP.dump.age"
  rm -f "$OUT.age"
fi

# Keep the newest $KEEP local dumps.
ls -1t "$DIR"/iris-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --

echo "backup ok: $OUT ($SIZE bytes, $TABLES tables with data)"
