#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "============================================"
echo "  cronet-fetch — Full Build Pipeline"
echo "============================================"

# Step 1: Build Cronet (if not already built)
OS="$(uname -s)"
ARCH="$(uname -m)"
LIB_DIR="$REPO_ROOT/packages/cronet-sys/lib/$OS-$ARCH"

if [ ! -d "$LIB_DIR" ] || [ -z "$(ls "$LIB_DIR" 2>/dev/null)" ]; then
    echo ""
    echo "==> Step 1: Building Cronet from Chromium source"
    bash "$REPO_ROOT/scripts/build-cronet.sh"
else
    echo ""
    echo "==> Step 1: Cronet library found at $LIB_DIR (skipping build)"
fi

# Step 2: Build Rust crates
echo ""
echo "==> Step 2: Building Rust workspace (cronet-sys, cronet, cronet-node)"
export CRONET_LIB_DIR="$LIB_DIR"
cd "$REPO_ROOT"
cargo build --release

# Step 3: Build the napi-rs native addon
echo ""
echo "==> Step 3: Building napi-rs native addon"
cd "$REPO_ROOT/packages/cronet-node"
npm install
npx napi build --platform --release --cargo-cwd "$REPO_ROOT"

# Step 4: Build TypeScript package
echo ""
echo "==> Step 4: Building TypeScript package (cronet-fetch)"
cd "$REPO_ROOT/packages/cronet-fetch"
npm install
npx tsc

echo ""
echo "============================================"
echo "  Build complete!"
echo "============================================"
echo ""
echo "Usage:"
echo "  import { fetch } from 'cronet-fetch';"
echo ""
echo "  const response = await fetch('https://example.com');"
echo "  const text = await response.text();"
echo ""
