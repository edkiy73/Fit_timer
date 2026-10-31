#!/bin/sh
# Nightly encrypted database backup to a separate Bunny Storage Zone (another provider than the server).
# The dump holds intimate data, so it leaves the server only encrypted (AES-256, key = BACKUP_PASSPHRASE, kept in
# the owner's password manager). Keeps the newest BACKUP_KEEP (14) files.
set -eu
: "${DATABASE_URL:?}" "${BACKUP_STORAGE_ZONE:?}" "${BACKUP_STORAGE_KEY:?}" "${BACKUP_PASSPHRASE:?}"
HOST="${BACKUP_STORAGE_HOST:-storage.bunnycdn.com}"
KEEP="${BACKUP_KEEP:-14}"
ts=$(date -u +%Y%m%dT%H%M%SZ)
raw="/tmp/feture-$ts.dump"
f="$raw.enc"
trap 'rm -f "$raw" "$f"' EXIT
# Dump to a file first: in a pipe a failed pg_dump would still produce a valid-looking encrypted (empty) backup.
pg_dump -Fc "$DATABASE_URL" -f "$raw"
pg_restore --list "$raw" >/dev/null
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$raw" -out "$f"
rm -f "$raw"
sum=$(sha256sum "$f" | cut -d' ' -f1 | tr 'a-f' 'A-F')
curl -fsS -X PUT "https://$HOST/$BACKUP_STORAGE_ZONE/db/feture-$ts.dump.enc" -H "AccessKey: $BACKUP_STORAGE_KEY" \
  -H "Content-Type: application/octet-stream" -H "Checksum: $sum" --upload-file "$f" >/dev/null
echo "backup ok: feture-$ts.dump.enc"
curl -fsS "https://$HOST/$BACKUP_STORAGE_ZONE/db/" -H "AccessKey: $BACKUP_STORAGE_KEY" -H "Accept: application/json" \
  | jq -r '.[] | select(.IsDirectory == false) | .ObjectName' | sort | head -n "-$KEEP" | while read -r old; do
    curl -fsS -X DELETE "https://$HOST/$BACKUP_STORAGE_ZONE/db/$old" -H "AccessKey: $BACKUP_STORAGE_KEY" >/dev/null && echo "removed $old"
  done
