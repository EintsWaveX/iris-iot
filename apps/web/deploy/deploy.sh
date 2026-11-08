#!/usr/bin/env bash
# Deploys one commit of IRIS web on this machine: fetch, install, build, restart.
#
#   sudo -u iris-web /opt/iris-web/apps/web/deploy/deploy.sh [git-ref]   (default: origin/main)
#
# Run as the iris-web user (it owns /opt/iris-web); the restart at the end uses sudo, so
# allow exactly that one command in sudoers:
#   iris-web ALL=(root) NOPASSWD: /usr/bin/systemctl restart iris-web
# The old build keeps serving until the new one is built, and a failed build stops here
# without touching the running site. Roll back by deploying the previous ref.
set -euo pipefail

# Node 24 lives in /opt/node24 on the PC (DEPLOY.md step 1); npm comes with it.
[ -d /opt/node24/bin ] && export PATH="/opt/node24/bin:$PATH"

REF="${1:-origin/main}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
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

# The commit the Server page compares the PC's bundle with (the unit reads this file).
echo "IRIS_BUILD_SHA=$SHA" > "$ROOT/apps/web/.build-sha"

sudo /usr/bin/systemctl restart iris-web
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8787/api/sehat" >/dev/null 2>&1; then
    echo "up: $(curl -fsS http://127.0.0.1:8787/api/sehat)"
    rm -rf dist.old
    exit 0
  fi
  sleep 1
done
echo "the server did not come up; the previous build is in dist.old" >&2
exit 1
