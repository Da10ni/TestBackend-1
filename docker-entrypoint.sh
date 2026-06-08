#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

# Seed demo users + balances and print their JWTs to the logs. SEED=false skips
# this (e.g. in production). Seeding is idempotent (upserts).
if [ "${SEED:-true}" = "true" ]; then
  echo "[entrypoint] Seeding demo data..."
  npm run seed || echo "[entrypoint] Seed failed (continuing)."
fi

echo "[entrypoint] Starting application..."
exec node dist/main
