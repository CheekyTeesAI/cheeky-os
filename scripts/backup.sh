#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

pg_dump "$DATABASE_URL" > backup.sql
echo "Backup written to backup.sql"
