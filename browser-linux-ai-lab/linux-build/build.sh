#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GENERATED_DIR="$SCRIPT_DIR/generated"
BOARD_DIR="$SCRIPT_DIR/board/browser-ai-lab"
CONFIG_FILE="$SCRIPT_DIR/configs/browser_ai_lab_defconfig"

echo '=== Browser Linux AI Lab Build ==='
echo "Project root: $PROJECT_ROOT"

# Check Docker
if ! command -v docker &>/dev/null; then
  echo 'ERROR: Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/' >&2
  exit 1
fi

if ! docker info &>/dev/null; then
  echo 'ERROR: Docker daemon is not running. Start Docker Desktop.' >&2
  exit 1
fi

mkdir -p "$GENERATED_DIR"

# Build Docker image
echo '--- Building Docker image...'
docker build -t browser-ai-lab-builder:latest -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"

# Use a named Docker volume for the build output so compilation happens on
# Docker's Linux filesystem (case-sensitive). macOS APFS is case-insensitive
# and causes tar failures extracting the Linux kernel source tree.
BUILD_VOLUME="browser-ai-lab-build"
docker volume inspect "$BUILD_VOLUME" &>/dev/null || docker volume create "$BUILD_VOLUME"

# Run Buildroot inside Docker
# Mount: configs/, board/ read-only; build output in a Linux-fs named volume
echo '--- Running Buildroot build (this takes 30-90 minutes on first run)...'
docker run --rm \
  --user root \
  -v "$SCRIPT_DIR/configs:/build/configs:ro" \
  -v "$SCRIPT_DIR/board:/build/board:ro" \
  -v "$BUILD_VOLUME:/build/output" \
  browser-ai-lab-builder:latest \
  bash -c '
    set -euo pipefail

    mkdir -p /build/output/dl /build/output/build

    # Clear any stale BR2_EXTERNAL state from a previous failed run
    rm -f /build/output/build/.br2-external.mk

    # Stage the static overlay into the writable output dir, then generate
    # lab data on top of it (board/ is mounted read-only)
    rm -rf /build/output/rootfs-overlay
    cp -r /build/board/browser-ai-lab/rootfs-overlay /build/output/rootfs-overlay
    bash /build/board/browser-ai-lab/generate-lab-data.sh /build/output/rootfs-overlay

    # Copy defconfig directly to O/.config so it always overrides any stale config in the volume
    cp /build/configs/browser_ai_lab_defconfig /build/output/build/.config

    # Set output dir
    export BR2_DL_DIR=/build/output/dl
    export O=/build/output/build

    # Apply config (no BR2_EXTERNAL — we patch all relative paths to absolute below)
    cd /home/builder/buildroot
    make O=/build/output/build BR2_DL_DIR=/build/output/dl olddefconfig

    # Patch all board-relative paths to absolute container paths
    sed -i "s|BR2_ROOTFS_OVERLAY=.*|BR2_ROOTFS_OVERLAY=\"/build/output/rootfs-overlay\"|" /build/output/build/.config
    sed -i "s|BR2_ROOTFS_POST_BUILD_SCRIPT=.*|BR2_ROOTFS_POST_BUILD_SCRIPT=\"/build/board/browser-ai-lab/post-build.sh\"|" /build/output/build/.config
    sed -i "s|BR2_ROOTFS_POST_IMAGE_SCRIPT=.*|BR2_ROOTFS_POST_IMAGE_SCRIPT=\"/build/board/browser-ai-lab/post-image.sh\"|" /build/output/build/.config

    # Run build
    make -C /home/builder/buildroot O=/build/output/build BR2_DL_DIR=/build/output/dl -j$(nproc)

    echo "Build complete."
  '

# Copy artifacts from the Docker volume to the host (copy-artifacts.sh reads from generated/build/images/)
echo '--- Extracting artifacts from build volume...'
mkdir -p "$GENERATED_DIR/build/images"
docker run --rm \
  -v "$BUILD_VOLUME:/vol:ro" \
  -v "$GENERATED_DIR/build/images:/out" \
  debian:12-slim \
  cp /vol/build/images/bzImage /vol/build/images/rootfs.cpio.gz /out/

# Copy artifacts to public/
echo '--- Copying artifacts...'
bash "$SCRIPT_DIR/copy-artifacts.sh"

# Check artifacts
bash "$SCRIPT_DIR/check-artifacts.sh"

echo ''
echo '=== Build complete! ==='
echo 'Artifacts are in public/linux/v1/'
echo 'Run: npm run dev'
