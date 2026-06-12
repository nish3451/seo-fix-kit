#!/usr/bin/env bash
# Weekly D1 backup: export production database and store it in R2.
# Runs locally via wrangler OAuth (no API token needed).
# Usage: ./ops/backup-d1.sh
set -euo pipefail

cd "$(dirname "$0")/.."

STAMP="$(date -u +%Y-%m-%d)"
FILE="/tmp/seofixkit-backup-${STAMP}.sql"

npx wrangler d1 export seofixkit_waitlist --remote --output "$FILE"
npx wrangler r2 object put "seofixkit-backups/d1/seofixkit-backup-${STAMP}.sql" --file "$FILE" --remote
SIZE="$(wc -c <"$FILE" | tr -d ' ')"
rm -f "$FILE"

echo "Backup complete: d1/seofixkit-backup-${STAMP}.sql (${SIZE} bytes) in r2://seofixkit-backups"
