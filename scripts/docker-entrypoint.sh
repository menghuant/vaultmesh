#!/bin/sh
set -e

echo "Pushing database schema..."
cd /app/packages/shared && bunx drizzle-kit push --config /app/drizzle.config.ts --force 2>&1 || {
  echo "Schema push failed, retrying in 3s..."
  sleep 3
  cd /app/packages/shared && bunx drizzle-kit push --config /app/drizzle.config.ts --force
}

echo "Starting VaultMesh server..."
cd /app
exec bun run server/src/index.ts
