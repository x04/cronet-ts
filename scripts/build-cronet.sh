#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPOT_TOOLS="$REPO_ROOT/depot_tools"
CHROMIUM_SRC="$REPO_ROOT/chromium/src"

export PATH="$DEPOT_TOOLS:$PATH"

if [ ! -d "$CHROMIUM_SRC" ]; then
    echo "Error: Chromium source not found at $CHROMIUM_SRC"
    echo "Run 'fetch chromium' in $REPO_ROOT/chromium first."
    exit 1
fi

cd "$CHROMIUM_SRC"

# Determine platform
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "==> Building Cronet for $OS/$ARCH"

# GN args for a release Cronet build
GN_ARGS='
is_debug = false
is_component_build = false
is_official_build = false
symbol_level = 0
enable_nacl = false
treat_warnings_as_errors = false
use_goma = false
use_remoteexec = false

# Cronet-specific
disable_file_support = true
enable_websockets = false
include_transport_security_state_preload_list = false

# Minimize build — only networking
enable_reporting = true
enable_backup_ref_ptr_support = false
enable_dangling_raw_ptr_checks = false
'

# Platform-specific args
case "$OS" in
    Darwin)
        GN_ARGS+='
target_os = "mac"
'
        if [ "$ARCH" = "arm64" ]; then
            GN_ARGS+='target_cpu = "arm64"'
        else
            GN_ARGS+='target_cpu = "x64"'
        fi
        ;;
    Linux)
        GN_ARGS+='
target_os = "linux"
use_sysroot = true
'
        if [ "$ARCH" = "aarch64" ]; then
            GN_ARGS+='target_cpu = "arm64"'
        else
            GN_ARGS+='target_cpu = "x64"'
        fi
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

OUT_DIR="out/Release"

echo "==> Generating build files in $OUT_DIR"
gn gen "$OUT_DIR" --args="$GN_ARGS"

echo "==> Building cronet target"
# Build the cronet package which produces libcronet and headers
autoninja -C "$OUT_DIR" cronet_package

echo "==> Build complete"
echo "Library: $CHROMIUM_SRC/$OUT_DIR/cronet/libcronet.dylib (or .so)"
echo "Headers: $CHROMIUM_SRC/$OUT_DIR/cronet/include/"

# Copy the built artifacts to a known location
ARTIFACTS_DIR="$REPO_ROOT/packages/cronet-sys/lib/$OS-$ARCH"
mkdir -p "$ARTIFACTS_DIR"

if [ "$OS" = "Darwin" ]; then
    cp "$OUT_DIR/cronet/libcronet."*".dylib" "$ARTIFACTS_DIR/" 2>/dev/null || \
    cp "$OUT_DIR/libcronet.dylib" "$ARTIFACTS_DIR/" 2>/dev/null || true
else
    cp "$OUT_DIR/cronet/libcronet.so" "$ARTIFACTS_DIR/" 2>/dev/null || \
    cp "$OUT_DIR/libcronet.so" "$ARTIFACTS_DIR/" 2>/dev/null || true
fi

# Also copy the header if the build produced an updated one
if [ -f "$OUT_DIR/cronet/include/cronet_c.h" ]; then
    cp "$OUT_DIR/cronet/include/cronet_c.h" "$REPO_ROOT/packages/cronet-sys/include/"
    echo "==> Updated cronet_c.h from build output"
fi

echo "==> Artifacts copied to $ARTIFACTS_DIR"
