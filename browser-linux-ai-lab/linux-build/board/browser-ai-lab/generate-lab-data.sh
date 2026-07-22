#!/usr/bin/env bash
set -euo pipefail

OVERLAY_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rootfs-overlay}"
LAB_DIR="$OVERLAY_DIR/root/lab"

mkdir -p "$LAB_DIR/expected"

# Generate dispatch.tsv with header + 25 fictional records
cat > "$LAB_DIR/dispatch.tsv" << 'TSVEOF'
dispatch_id	timestamp	region	priority	status
DSP-10041	2024-03-15T08:12:00Z	North-1	High	Returned
DSP-10042	2024-03-15T08:34:22Z	South-2	Low	Delivered
DSP-10043	2024-03-15T09:01:05Z	East-3	Critical	In-Transit
DSP-10044	2024-03-15T09:22:47Z	West-4	Medium	Delivered
DSP-10045	2024-03-15T09:45:33Z	North-1	Low	In-Transit
DSP-10046	2024-03-15T10:03:18Z	Central-5	High	Delivered
DSP-10047	2024-03-15T10:21:59Z	South-2	Critical	Pending
DSP-10048	2024-03-15T10:44:07Z	North-1	Medium	Delivered
DSP-10049	2024-03-15T11:02:30Z	East-3	Low	Delivered
DSP-10050	2024-03-15T11:19:55Z	West-4	High	In-Transit
DSP-10051	2024-03-15T11:37:11Z	Central-5	Medium	Delivered
DSP-10052	2024-03-15T11:55:42Z	South-2	Low	Returned
DSP-10053	2024-03-15T12:14:28Z	North-1	High	Delivered
DSP-10054	2024-03-15T12:32:09Z	East-3	Critical	Delivered
DSP-10055	2024-03-15T12:50:44Z	West-4	Medium	In-Transit
DSP-10056	2024-03-15T13:08:17Z	Central-5	Low	Delivered
DSP-10057	2024-03-15T13:26:53Z	South-2	High	Pending
DSP-10058	2024-03-15T13:44:31Z	North-1	Medium	Delivered
DSP-10059	2024-03-15T14:02:48Z	East-3	Low	In-Transit
DSP-10060	2024-03-15T14:21:26Z	West-4	Critical	Delivered
DSP-10061	2024-03-15T14:39:55Z	Central-5	High	Delivered
DSP-10062	2024-03-15T14:57:33Z	South-2	Medium	Returned
DSP-10063	2024-03-15T15:15:14Z	North-1	Low	Delivered
DSP-10064	2024-03-15T15:33:41Z	East-3	High	In-Transit
DSP-10065	2024-03-15T15:52:09Z	West-4	Medium	Delivered
TSVEOF

# Compress to dispatch.bin (XZ)
xz -k -9 -c "$LAB_DIR/dispatch.tsv" > "$LAB_DIR/dispatch.bin"

# Generate validation info
DATA_ROWS=$(wc -l < "$LAB_DIR/dispatch.tsv")
DATA_ROWS=$((DATA_ROWS - 1))  # subtract header row
SHA256=$(sha256sum "$LAB_DIR/dispatch.tsv" | cut -d' ' -f1 2>/dev/null || shasum -a 256 "$LAB_DIR/dispatch.tsv" | cut -d' ' -f1)
COL_COUNT=$(head -1 "$LAB_DIR/dispatch.tsv" | awk -F'\t' '{print NF}')

cat > "$LAB_DIR/expected/validation.txt" << VALEOF
# Lab Validation Information
# This file is in the public VM image and can be downloaded by learners.
# It is not secret and should not be treated as such.

Expected data rows (excluding header): $DATA_ROWS
Expected column count: $COL_COUNT
Expected column names: dispatch_id, timestamp, region, priority, status
Expected separator: TAB (\t)
Expected SHA-256 of dispatch.tsv: $SHA256

Note: All files in a browser VM image can be downloaded and inspected
by a technically sophisticated learner. Do not embed secrets in VM images.
VALEOF

# Create README
cat > "$LAB_DIR/README.txt" << 'READMEEOF'
==================================================
 Browser Linux AI Lab
==================================================

Objective:

A file named /root/lab/dispatch.bin contains compressed
tab-separated dispatch data.

Complete the following tasks:

1. Determine the compression format.
2. Extract the file as /root/lab/dispatch.tsv.
3. Display the first five records.
4. Determine the number of data rows.
5. Verify that the extracted file is tab-separated text.

You may ask the AI assistant for help.

Commands entered in this disposable lab may be analyzed
for instructional feedback.
==================================================
READMEEOF

# Do NOT leave plaintext dispatch.tsv in obvious location
# It will be in /root/lab/dispatch.tsv only AFTER the student extracts it
# Remove it from the overlay - only keep dispatch.bin
rm -f "$LAB_DIR/dispatch.tsv"

echo "Lab data generated in $LAB_DIR"
