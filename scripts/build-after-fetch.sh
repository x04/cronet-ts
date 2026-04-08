#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPOT_TOOLS="$REPO_ROOT/depot_tools"
CHROMIUM_DIR="$REPO_ROOT/chromium"
CHROMIUM_SRC="$CHROMIUM_DIR/src"
LOG="$REPO_ROOT/.context/build.log"

export PATH="$DEPOT_TOOLS:$PATH"

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

echo "=== $(date) === Waiting for Chromium fetch to complete..."

# Wait for the fetch process to finish
while pgrep -f "fetch.py.*chromium" > /dev/null 2>&1; do
    sleep 30
    # Show rough progress
    SIZE=$(du -sh "$CHROMIUM_DIR" 2>/dev/null | cut -f1 || echo "?")
    echo "  $(date '+%H:%M:%S') - chromium dir: $SIZE"
done

echo "=== $(date) === Fetch complete. Running gclient runhooks..."

cd "$CHROMIUM_SRC"
gclient runhooks

echo "=== $(date) === Hooks done. Configuring GN for Cronet build..."

# Determine platform
OS="$(uname -s)"
ARCH="$(uname -m)"

# GN args for Cronet
GN_ARGS='
is_debug = false
is_component_build = false
is_official_build = false
symbol_level = 0
enable_nacl = false
treat_warnings_as_errors = false
use_remoteexec = false
disable_file_support = true
enable_websockets = false
include_transport_security_state_preload_list = false
enable_reporting = true
'

case "$OS" in
    Darwin)
        GN_ARGS+="target_os = \"mac\"
"
        if [ "$ARCH" = "arm64" ]; then
            GN_ARGS+='target_cpu = "arm64"'
        else
            GN_ARGS+='target_cpu = "x64"'
        fi
        ;;
    Linux)
        GN_ARGS+="target_os = \"linux\"
use_sysroot = true
"
        if [ "$ARCH" = "aarch64" ]; then
            GN_ARGS+='target_cpu = "arm64"'
        else
            GN_ARGS+='target_cpu = "x64"'
        fi
        ;;
esac

OUT_DIR="out/Release"
gn gen "$OUT_DIR" --args="$GN_ARGS"

echo "=== $(date) === Building Cronet with ninja..."
autoninja -C "$OUT_DIR" cronet_package

echo "=== $(date) === Cronet build complete!"

# Copy artifacts
ARTIFACTS_DIR="$REPO_ROOT/packages/cronet-sys/lib/$OS-$ARCH"
mkdir -p "$ARTIFACTS_DIR"

# Find and copy the shared library
find "$OUT_DIR" -name "libcronet.*" -type f | while read -r lib; do
    echo "Copying $lib -> $ARTIFACTS_DIR/"
    cp "$lib" "$ARTIFACTS_DIR/"
done

# Copy updated header if available
if [ -f "$OUT_DIR/cronet/include/cronet_c.h" ]; then
    cp "$OUT_DIR/cronet/include/cronet_c.h" "$REPO_ROOT/packages/cronet-sys/include/"
    echo "Updated cronet_c.h from build"
fi

echo "=== $(date) === Building Rust workspace..."
export CRONET_LIB_DIR="$ARTIFACTS_DIR"
cd "$REPO_ROOT"
cargo build --release

echo "=== $(date) === Building napi-rs addon..."
cd "$REPO_ROOT/packages/cronet-node"
npm install
npx napi build --platform --release --cargo-cwd "$REPO_ROOT"

echo "=== $(date) === Building TypeScript package..."
cd "$REPO_ROOT/packages/cronet-fetch"
npm install
npx tsc

echo ""
echo "============================================"
echo "  BUILD COMPLETE — $(date)"
echo "============================================"
echo "  Cronet lib:   $ARTIFACTS_DIR/"
echo "  Rust crates:  $REPO_ROOT/target/release/"
echo "  Node addon:   $REPO_ROOT/packages/cronet-node/"
echo "  TS package:   $REPO_ROOT/packages/cronet-fetch/dist/"
echo "============================================"
