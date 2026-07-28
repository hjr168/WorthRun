#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

release="${APP_RELEASE:-unknown}"
home="${HOME:-/root}"
path="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"

exec env -i \
  HOME="$home" \
  PATH="$path" \
  NODE_ENV=production \
  HOST=127.0.0.1 \
  APP_RELEASE="$release" \
  /usr/bin/node --env-file=.env --max-old-space-size=256 \
  apps/api/dist/apps/api/src/server.js
