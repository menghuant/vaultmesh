#!/bin/sh
set -e

echo "Pushing database schema..."
cd /app
bunx drizzle-kit push --force 2>&1 || {
  echo "Schema push failed, retrying in 3s..."
  sleep 3
  bunx drizzle-kit push --force
}

echo "Starting VaultMesh server..."
exec bun run server/src/index.ts
