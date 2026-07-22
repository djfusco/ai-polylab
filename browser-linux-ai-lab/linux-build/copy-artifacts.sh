#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GENERATED="$SCRIPT_DIR/generated/build"
DEST="$PROJECT_ROOT/public/linux/v1"

mkdir -p "$DEST"

# Copy kernel
cp "$GENERATED/images/bzImage" "$DEST/bzImage"

# Copy rootfs
cp "$GENERATED/images/rootfs.cpio.gz" "$DEST/rootfs.cpio.gz"

# Copy v86 assets from node_modules
V86_BUILD="$PROJECT_ROOT/node_modules/v86/build"
if [ ! -d "$V86_BUILD" ]; then
  echo 'ERROR: node_modules/v86/build not found. Run: npm install' >&2
  exit 1
fi
cp "$V86_BUILD/v86.wasm"  "$DEST/v86.wasm"
cp "$V86_BUILD/libv86.js" "$DEST/libv86.js"  # Loaded via <script> tag at runtime

# Download BIOS files from v86 GitHub repository
BIOS_BASE="https://github.com/copy/v86/raw/master/bios"
echo 'Downloading BIOS files...'
curl -fsSL "$BIOS_BASE/seabios.bin" -o "$DEST/seabios.bin"
curl -fsSL "$BIOS_BASE/vgabios.bin" -o "$DEST/vgabios.bin"

# Generate manifest
cat > "$DEST/manifest.json" << EOF
{
  "version": "v1",
  "kernel": "/linux/v1/bzImage",
  "filesystem": "/linux/v1/rootfs.cpio.gz",
  "wasm": "/linux/v1/v86.wasm",
  "bios": "/linux/v1/seabios.bin",
  "vgaBios": "/linux/v1/vgabios.bin",
  "libv86": "/linux/v1/libv86.js",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Print sizes
echo ''
echo '=== Artifact sizes ==='
ls -lh "$DEST"/
echo ''
echo 'Total:'
du -sh "$DEST"
