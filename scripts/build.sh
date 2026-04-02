#!/bin/bash
# Build VaultMesh daemon as a standalone binary
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="${PROJECT_ROOT}/dist"

echo "Building VaultMesh..."

mkdir -p "$OUT_DIR"

# Compile to standalone binary
bun build "${PROJECT_ROOT}/daemon/src/index.ts" \
  --compile \
  --outfile "${OUT_DIR}/vaultmesh" \
  --target bun

# Generate checksum
cd "$OUT_DIR"
if command -v sha256sum &>/dev/null; then
  sha256sum vaultmesh > vaultmesh.sha256
elif command -v shasum &>/dev/null; then
  shasum -a 256 vaultmesh > vaultmesh.sha256
fi

echo "Build complete: ${OUT_DIR}/vaultmesh"
ls -lh "${OUT_DIR}/vaultmesh"
