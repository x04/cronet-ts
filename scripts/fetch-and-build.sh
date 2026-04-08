#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPOT_TOOLS="$REPO_ROOT/depot_tools"
CHROMIUM_DIR="$REPO_ROOT/chromium"
CHROMIUM_SRC="$CHROMIUM_DIR/src"
LOG="$REPO_ROOT/.context/build.log"

export PATH="$DEPOT_TOOLS:$PATH"

mkdir -p "$(dirname "$LOG")"

echo "=== $(date) === Starting Chromium fetch + Cronet build ===" >> "$LOG"

# Step 1: Fetch chromium source
cd "$CHROMIUM_DIR"
echo "=== $(date) === Running fetch --nohooks chromium ===" | tee -a "$LOG"
fetch --nohooks chromium >> "$LOG" 2>&1
echo "=== $(date) === fetch complete ===" | tee -a "$LOG"

# Step 2: Run hooks
cd "$CHROMIUM_SRC"
echo "=== $(date) === Running gclient runhooks ===" | tee -a "$LOG"
gclient runhooks >> "$LOG" 2>&1
echo "=== $(date) === hooks complete ===" | tee -a "$LOG"

# Step 3: Configure GN
OS="$(uname -s)"
ARCH="$(uname -m)"

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
echo "=== $(date) === Running gn gen ===" | tee -a "$LOG"
gn gen "$OUT_DIR" --args="$GN_ARGS" >> "$LOG" 2>&1

# Step 4: Build cronet
echo "=== $(date) === Building cronet with ninja ===" | tee -a "$LOG"
autoninja -C "$OUT_DIR" cronet_package >> "$LOG" 2>&1
echo "=== $(date) === Cronet build complete ===" | tee -a "$LOG"

# Step 5: Copy artifacts
ARTIFACTS_DIR="$REPO_ROOT/packages/cronet-sys/lib/$OS-$ARCH"
mkdir -p "$ARTIFACTS_DIR"
find "$OUT_DIR" -name "libcronet.*" -type f | while read -r lib; do
    cp "$lib" "$ARTIFACTS_DIR/"
    echo "Copied $lib" | tee -a "$LOG"
done
if [ -f "$OUT_DIR/cronet/include/cronet_c.h" ]; then
    cp "$OUT_DIR/cronet/include/cronet_c.h" "$REPO_ROOT/packages/cronet-sys/include/"
fi

# Step 6: Build Rust
echo "=== $(date) === Building Rust workspace ===" | tee -a "$LOG"
export CRONET_LIB_DIR="$ARTIFACTS_DIR"
cd "$REPO_ROOT"
cargo build --release >> "$LOG" 2>&1

# Step 7: Build napi addon
echo "=== $(date) === Building napi-rs addon ===" | tee -a "$LOG"
cd "$REPO_ROOT/packages/cronet-node"
npm install >> "$LOG" 2>&1
npx napi build --platform --release --cargo-cwd "$REPO_ROOT" >> "$LOG" 2>&1

# Step 8: Build TypeScript
echo "=== $(date) === Building TypeScript ===" | tee -a "$LOG"
cd "$REPO_ROOT/packages/cronet-fetch"
npm install >> "$LOG" 2>&1
npx tsc >> "$LOG" 2>&1

echo "=== $(date) === ALL DONE ===" | tee -a "$LOG"
