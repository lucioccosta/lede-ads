#!/bin/sh
set -e

mkdir -p /app/apps/cloud-api/uploads

echo "[lede-api] aplicando migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[lede-api] seed inicial (admin)..."
  node prisma/seed-prod.mjs
fi

echo "[lede-api] iniciando NestJS na porta ${PORT:-3001}"
exec node dist/main.js
