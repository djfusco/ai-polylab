#!/usr/bin/env bash
set -euo pipefail
# $1 = TARGET_DIR (Buildroot rootfs staging)
TARGET_DIR="$1"

# Ensure /tmp is writable
mkdir -p "$TARGET_DIR/tmp"
chmod 1777 "$TARGET_DIR/tmp"

# Ensure /proc /sys /dev directories exist
mkdir -p "$TARGET_DIR/proc" "$TARGET_DIR/sys" "$TARGET_DIR/dev"

# Create /root/lab if not present (should be via overlay)
mkdir -p "$TARGET_DIR/root/lab"

echo 'post-build.sh: Done'
