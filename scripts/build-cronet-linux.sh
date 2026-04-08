#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/packages/cronet-sys/lib/Linux-x86_64"

echo "==> Building Cronet for Linux x86-64 via Docker"
echo "    This will download ~30GB of Chromium source and build."
echo ""

docker build \
    -f "$REPO_ROOT/docker/Dockerfile.cronet-linux" \
    -t cronet-linux-build \
    "$REPO_ROOT"

echo "==> Extracting libcronet.so"
mkdir -p "$OUT_DIR"
id=$(docker create cronet-linux-build)
docker cp "$id:/out/libcronet.so" "$OUT_DIR/libcronet.so"
docker rm "$id"

ls -lh "$OUT_DIR/libcronet.so"
echo "==> Done: $OUT_DIR/libcronet.so"
