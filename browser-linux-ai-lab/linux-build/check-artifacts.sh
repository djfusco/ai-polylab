#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$(cd "$SCRIPT_DIR/.." && pwd)/public/linux/v1"

FAILED=0

check_file() {
  local path="$1"
  local min_bytes="${2:-1}"
  if [ ! -f "$path" ]; then
    echo "MISSING: $path" >&2
    FAILED=1
  elif [ "$(stat -f%z "$path" 2>/dev/null || stat -c%s "$path")" -lt "$min_bytes" ]; then
    echo "TOO SMALL: $path" >&2
    FAILED=1
  else
    echo "OK: $path ($(du -sh "$path" | cut -f1))"
  fi
}

echo '=== Checking Linux artifacts ==='
check_file "$DEST/bzImage" 1000000        # at least 1 MB
check_file "$DEST/rootfs.cpio.gz" 1000000 # at least 1 MB
check_file "$DEST/v86.wasm" 500000        # at least 500 KB
check_file "$DEST/seabios.bin" 100000     # at least 100 KB
check_file "$DEST/vgabios.bin" 1000       # at least 1 KB
check_file "$DEST/manifest.json" 100

if [ $FAILED -ne 0 ]; then
  echo ''
  echo 'Some artifacts are missing or too small.' >&2
  echo 'Run: npm run build:linux' >&2
  exit 1
fi

echo ''
echo 'All artifacts present and reasonable size.'
