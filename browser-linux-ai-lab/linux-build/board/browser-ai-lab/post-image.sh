#!/usr/bin/env bash
set -euo pipefail
# Called after image creation
echo 'post-image.sh: Images created:'
ls -lh "$BINARIES_DIR/"*.gz "$BINARIES_DIR/bzImage" 2>/dev/null || true
