#!/bin/bash
# VaultMesh Install Script
# Usage: curl -fsSL https://your-server/install | sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="vaultmesh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

info() { echo -e "${GREEN}✓${RESET} $1"; }
error() { echo -e "${RED}✗${RESET} $1" >&2; }
dim() { echo -e "${DIM}$1${RESET}"; }

# Detect OS and architecture
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      error "Unsupported OS: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)             error "Unsupported architecture: $(uname -m)"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

main() {
  local platform
  platform=$(detect_platform)

  echo ""
  echo -e "${BOLD}VaultMesh Installer${RESET}"
  echo -e "Platform: ${platform}"
  echo ""

  # Check if server URL is provided (for self-hosted)
  local server_url="${VAULTMESH_SERVER:-}"
  if [ -z "$server_url" ]; then
    error "Set VAULTMESH_SERVER to your server URL"
    dim "Example: VAULTMESH_SERVER=https://sync.example.com curl -fsSL .../install | sh"
    exit 1
  fi

  local download_url="${server_url}/releases/vaultmesh-${platform}"
  local checksum_url="${server_url}/releases/vaultmesh-${platform}.sha256"
  local tmp_dir
  tmp_dir=$(mktemp -d)
  local tmp_bin="${tmp_dir}/${BINARY_NAME}"

  # Download binary
  info "Downloading ${BINARY_NAME}..."
  if ! curl -fsSL -o "${tmp_bin}" "${download_url}"; then
    error "Download failed. Is your server running?"
    rm -rf "${tmp_dir}"
    exit 1
  fi

  # Verify checksum
  info "Verifying checksum..."
  local expected_checksum
  if expected_checksum=$(curl -fsSL "${checksum_url}" 2>/dev/null); then
    local actual_checksum
    if command -v sha256sum &>/dev/null; then
      actual_checksum=$(sha256sum "${tmp_bin}" | cut -d' ' -f1)
    elif command -v shasum &>/dev/null; then
      actual_checksum=$(shasum -a 256 "${tmp_bin}" | cut -d' ' -f1)
    else
      dim "  No sha256 tool found, skipping verification"
      expected_checksum=""
    fi

    if [ -n "${expected_checksum}" ] && [ "${actual_checksum}" != "${expected_checksum}" ]; then
      error "Checksum mismatch!"
      error "  Expected: ${expected_checksum}"
      error "  Got:      ${actual_checksum}"
      rm -rf "${tmp_dir}"
      exit 1
    fi
    [ -n "${expected_checksum}" ] && info "Checksum verified."
  else
    dim "  No checksum available, skipping verification"
  fi

  # Install
  chmod +x "${tmp_bin}"

  if [ -w "${INSTALL_DIR}" ]; then
    mv "${tmp_bin}" "${INSTALL_DIR}/${BINARY_NAME}"
  else
    info "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "${tmp_bin}" "${INSTALL_DIR}/${BINARY_NAME}"
  fi

  rm -rf "${tmp_dir}"

  info "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
  echo ""
  dim "Next steps:"
  dim "  1. Get an invite token from your admin"
  dim "  2. Run: vaultmesh setup --token <your-token>"
  dim "  3. Run: vaultmesh daemon start"
  echo ""
}

main "$@"
