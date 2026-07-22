#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo 'Cleaning generated build output...'
rm -rf "$SCRIPT_DIR/generated/build"

echo 'Removing Docker build volume (contains Buildroot compilation cache)...'
docker volume rm browser-ai-lab-build 2>/dev/null && echo 'Removed Docker volume browser-ai-lab-build' || echo 'Docker volume not found (already clean)'

echo 'Cleaning public/linux/v1/ artifacts...'
rm -f "$PROJECT_ROOT/public/linux/v1/bzImage"
rm -f "$PROJECT_ROOT/public/linux/v1/rootfs.cpio.gz"
rm -f "$PROJECT_ROOT/public/linux/v1/v86.wasm"
rm -f "$PROJECT_ROOT/public/linux/v1/seabios.bin"
rm -f "$PROJECT_ROOT/public/linux/v1/vgabios.bin"
rm -f "$PROJECT_ROOT/public/linux/v1/manifest.json"

echo 'Clean complete. Downloads cache preserved at linux-build/generated/dl/'
echo 'To also remove download cache: rm -rf linux-build/generated/dl/'
