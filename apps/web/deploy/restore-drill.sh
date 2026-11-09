#!/usr/bin/env bash
# Proves a backup restores: decrypts one encrypted dump from R2 (iris-backups/db/iris-<stamp>.dump.age),
# restores it into a throwaway database on a local Postgres, prints what came back, and removes everything
# it made. Run it on a machine that has the age PRIVATE key (not on the PC: the key lives off the PC).
#
#   bash restore-drill.sh iris-2026-11-08T1901Z.dump.age [~/.iris-backup/age-key.txt]
#
# Needs: age, pg_restore, psql and a Postgres this user can create a database in (peer auth as the current
# user, or PG* variables, or run it with sudo -u postgres). IRIS_DRILL_DB (default iris_drill) is dropped first
# and again at the end, so never point it at a database you care about.
# The decrypted dump holds real personal data: it lives in a private temp folder and is deleted on exit.
set -euo pipefail

FILE="${1:?usage: restore-drill.sh <dump.age> [age-key.txt]}"
KEY="${2:-$HOME/.iris-backup/age-key.txt}"
DB="${IRIS_DRILL_DB:-iris_drill}"
[ "$DB" != iris ] || { echo "drill: refusing to use the database called iris" >&2; exit 2; }
[ -r "$FILE" ] || { echo "drill: cannot read $FILE" >&2; exit 2; }
[ -r "$KEY" ] || { echo "drill: cannot read the age key $KEY" >&2; exit 2; }
for c in age pg_restore psql createdb dropdb; do command -v "$c" >/dev/null || { echo "drill: $c is not installed" >&2; exit 2; }; done

umask 077
WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

age -d -i "$KEY" -o "$WORK/iris.dump" "$FILE"
LISTED="$(pg_restore --list "$WORK/iris.dump" | grep -c 'TABLE DATA' || true)"
echo "decrypted: $(stat -c %s "$WORK/iris.dump") bytes, $LISTED tables with data"

dropdb --if-exists "$DB"
createdb "$DB"
# --no-owner/--no-acl like the backup. Any message from pg_restore is a failure: the drill must be clean.
ERRORS="$(pg_restore --no-owner --no-acl --exit-on-error -d "$DB" "$WORK/iris.dump" 2>&1)" || {
  echo "drill: pg_restore FAILED: $ERRORS" >&2
  exit 1
}

q() { psql -d "$DB" -Atc "$1"; }
TABLES="$(q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
echo "tables: $TABLES  indexes: $(q "select count(*) from pg_indexes where schemaname='public'")  foreign keys: $(q "select count(*) from pg_constraint where contype='f'")"
for t in asisten praktikan audit denyut nilai sesi pengaturan berkas; do
  n="$(q "select count(*) from $t" 2>/dev/null || echo 'no such table')"
  echo "  $t: $n"
done
echo "newest audit row: $(q "select max(pada) from audit")"
# A restored database whose sequences lag its data would hand out ids that already exist.
BEHIND="$(q "select count(*) from audit where id > (select last_value from audit_id_seq)")"
[ "$BEHIND" = 0 ] || { echo "drill: audit_id_seq is behind the data" >&2; exit 1; }
[ "$TABLES" -ge 100 ] || { echo "drill: only $TABLES tables came back" >&2; exit 1; }
echo "drill ok: the backup restores, nothing left behind"
