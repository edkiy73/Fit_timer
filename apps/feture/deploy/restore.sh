#!/bin/sh
# Restores a database backup made by backup.sh into an EMPTY database (new server or a test restore).
#   restore.sh latest | restore.sh feture-20261101T030000Z.dump.enc
# install.sh does this by itself on a new server; then migrate.sh skips everything the dump already has.
set -eu
: "${DATABASE_URL:?}" "${BACKUP_STORAGE_ZONE:?}" "${BACKUP_STORAGE_KEY:?}" "${BACKUP_PASSPHRASE:?}" "${1:?file name or latest}"
HOST="${BACKUP_STORAGE_HOST:-storage.bunnycdn.com}"
SCHEME="${BACKUP_STORAGE_SCHEME:-https}"
BASE="$SCHEME://$HOST/$BACKUP_STORAGE_ZONE"
name=$1
if [ "$name" = "latest" ]; then
  name=$(curl -fsS "$BASE/db/" -H "AccessKey: $BACKUP_STORAGE_KEY" -H "Accept: application/json" \
    | jq -r '.[] | select(.IsDirectory == false) | .ObjectName' | sort | tail -1)
  [ -n "$name" ] || { echo "no backups" >&2; exit 1; }
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsS "$BASE/db/$name" -H "AccessKey: $BACKUP_STORAGE_KEY" -o "$work/db.enc"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$work/db.enc" -out "$work/db.dump"
pg_restore --no-owner --exit-on-error -d "$DATABASE_URL" "$work/db.dump"
echo "restored $name"
