#!/usr/bin/env bash
# Deploys one commit of IRIS web on this machine: fetch, install, build, restart.
#
#   sudo -u iris-web /opt/iris-web/apps/web/deploy/deploy.sh [git-ref]   (default: origin/main)
#
# Run as the iris-web user (it owns /opt/iris-web). The site runs as a supervisor and several workers
# (server/supervisor.ts); a deploy asks the supervisor to replace the workers one at a time (SIGHUP), so
# the site never stops answering and no sudo is needed. The supervisor itself is only replaced when its own
# files changed, or when the unit still starts the old single process (no supervisor.json in /run/iris-web):
# then the restart at the end uses sudo, so allow exactly that one command in sudoers:
#   iris-web ALL=(root) NOPASSWD: /usr/bin/systemctl restart iris-web
# The old build keeps serving until the new one is built, and a failed build stops here
# without touching the running site. Roll back by deploying the previous ref.
set -euo pipefail

# Node 24 lives in /opt/node24 on the PC (DEPLOY.md step 1); npm comes with it.
[ -d /opt/node24/bin ] && export PATH="/opt/node24/bin:$PATH"

REF="${1:-origin/main}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
RUN_DIR="${IRIS_RUN_DIR:-/run/iris-web}"
URL="http://127.0.0.1:${PORT:-8787}/api/sehat"
cd "$ROOT"

git fetch --quiet origin
git checkout --quiet --detach "$REF"
SHA="$(git rev-parse --short=12 HEAD)"
echo "deploying $SHA"

cd apps/web
npm ci --no-audit --no-fund
# Built next to the live copy, then swapped, so visitors never see a half-written dist/.
rm -rf dist.new
npx astro build --outDir dist.new
rm -rf dist.old
[ -d dist ] && mv dist dist.old
mv dist.new dist

# The commit the Server page compares the PC's bundle with (the unit reads this file; the supervisor
# re-reads it each time it starts a worker, so a rolling restart picks it up too).
echo "IRIS_BUILD_SHA=$SHA" > "$ROOT/apps/web/.build-sha"

# What the running supervisor says about itself (its pid and the print of its own files), if it runs.
STATUS="$RUN_DIR/supervisor.json"
PID=""
SIDIK_LAMA=""
if [ -r "$STATUS" ]; then
  PID="$(node -p 'try{JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid||""}catch{""}' "$STATUS" 2>/dev/null || true)"
  SIDIK_LAMA="$(node -p 'try{JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sidik||""}catch{""}' "$STATUS" 2>/dev/null || true)"
fi
SIDIK_BARU="$(node --import tsx -e 'import("./server/klaster/konfig.ts").then((m)=>console.log(m.sidikPengawas(process.cwd())))' 2>/dev/null || true)"

# True when every worker answering /api/sehat runs $SHA (and at least one answers).
semua_baru() {
  curl -fsS "$URL?klaster=1" 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const p = JSON.parse(s).pekerja || [];
        process.exit(p.length > 0 && p.every((w) => w && w.sha === process.argv[1]) ? 0 : 1);
      } catch { process.exit(1); }
    });' "$SHA"
}

if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null && [ -n "$SIDIK_BARU" ] && [ "$SIDIK_LAMA" = "$SIDIK_BARU" ]; then
  echo "rolling restart: supervisor $PID replaces its workers one at a time"
  kill -HUP "$PID"
  # A roll starts each new worker and waits for it, so give it time: the loop ends when all run $SHA.
  for i in $(seq 1 240); do
    if semua_baru; then
      echo "up: $(curl -fsS "$URL")"
      rm -rf dist.old
      exit 0
    fi
    sleep 1
  done
  echo "the workers did not all come up on $SHA; the old ones may still be serving (see: journalctl -u iris-web)" >&2
  exit 1
fi

if [ -n "$PID" ] && [ "$SIDIK_LAMA" != "$SIDIK_BARU" ]; then
  echo "the supervisor's own files changed: restarting the whole service this once"
fi
sudo /usr/bin/systemctl restart iris-web
for i in $(seq 1 60); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "up: $(curl -fsS "$URL")"
    rm -rf dist.old
    exit 0
  fi
  sleep 1
done
echo "the server did not come up; the previous build is in dist.old" >&2
exit 1
