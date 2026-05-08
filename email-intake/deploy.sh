#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
echo "[deploy] cwd=$ROOT"

npm ci
npm run build

if command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] starting with pm2 cheeky-os"
  PORT="${PORT:-3000}"
  pm2 delete cheeky-os 2>/dev/null || true
  pm2 start "node -r ./scripts/cheekyOsLoadEnv.js ./cheeky-os/server.js" --name cheeky-os --time
  pm2 save || true
  echo "[deploy] pm2 cheeky-os on PORT=$PORT · logs: pm2 logs cheeky-os"
else
  echo "[deploy] pm2 not found — install: npm i -g pm2"
  echo "[deploy] fallback: NODE_ENV=production node -r ./scripts/cheekyOsLoadEnv.js ./cheeky-os/server.js"
fi
