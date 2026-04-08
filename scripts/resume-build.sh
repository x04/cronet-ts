#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPOT_TOOLS="$REPO_ROOT/depot_tools"
CHROMIUM_SRC="$REPO_ROOT/chromium/src"
LOG="$REPO_ROOT/.context/build.log"

export PATH="$DEPOT_TOOLS:$PATH"

echo "=== $(date) === Resuming build ===" | tee -a "$LOG"

# Clean up any bad SCM state
rm -rf "$REPO_ROOT/chromium/_bad_scm" 2>/dev/null || true

# Retry gclient sync with --nohooks (may need multiple attempts)
cd "$REPO_ROOT/chromium"
for i in 1 2 3; do
    echo "=== $(date) === gclient sync attempt $i ===" | tee -a "$LOG"
    if gclient sync --nohooks >> "$LOG" 2>&1; then
        echo "=== $(date) === gclient sync succeeded ===" | tee -a "$LOG"
        break
    fi
    echo "=== $(date) === gclient sync failed, retrying... ===" | tee -a "$LOG"
    sleep 5
done

# Run hooks
echo "=== $(date) === Running gclient runhooks ===" | tee -a "$LOG"
gclient runhooks >> "$LOG" 2>&1
echo "=== $(date) === Hooks complete ===" | tee -a "$LOG"

# Configure GN
cd "$CHROMIUM_SRC"
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

echo "=== $(date) === Building cronet with ninja ===" | tee -a "$LOG"
autoninja -C "$OUT_DIR" cronet_package >> "$LOG" 2>&1
echo "=== $(date) === Cronet build complete ===" | tee -a "$LOG"

# Copy artifacts
ARTIFACTS_DIR="$REPO_ROOT/packages/cronet-sys/lib/$OS-$ARCH"
mkdir -p "$ARTIFACTS_DIR"
find "$OUT_DIR" -name "libcronet.*" -type f | while read -r lib; do
    cp "$lib" "$ARTIFACTS_DIR/"
    echo "Copied $lib" | tee -a "$LOG"
done
if [ -f "$OUT_DIR/cronet/include/cronet_c.h" ]; then
    cp "$OUT_DIR/cronet/include/cronet_c.h" "$REPO_ROOT/packages/cronet-sys/include/"
fi

# Build Rust
echo "=== $(date) === Building Rust workspace ===" | tee -a "$LOG"
export CRONET_LIB_DIR="$ARTIFACTS_DIR"
cd "$REPO_ROOT"
cargo build --release >> "$LOG" 2>&1

# Build napi addon
echo "=== $(date) === Building napi-rs addon ===" | tee -a "$LOG"
cd "$REPO_ROOT/packages/cronet-node"
npm install >> "$LOG" 2>&1
npx napi build --platform --release --cargo-cwd "$REPO_ROOT" >> "$LOG" 2>&1

# Build TypeScript
echo "=== $(date) === Building TypeScript ===" | tee -a "$LOG"
cd "$REPO_ROOT/packages/cronet-fetch"
npm install >> "$LOG" 2>&1
npx tsc >> "$LOG" 2>&1

echo "=== $(date) === ALL DONE ===" | tee -a "$LOG"
