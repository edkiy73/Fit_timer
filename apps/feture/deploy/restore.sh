#!/bin/sh
# Restores a backup made by backup.sh into an EMPTY database (new server or a test restore).
#   restore.sh feture-20261101T030000Z.dump.enc
# Then start the stack as usual; migrate.sh skips everything the dump already has.
set -eu
: "${DATABASE_URL:?}" "${BACKUP_STORAGE_ZONE:?}" "${BACKUP_STORAGE_KEY:?}" "${BACKUP_PASSPHRASE:?}" "${1:?file name}"
HOST="${BACKUP_STORAGE_HOST:-storage.bunnycdn.com}"
curl -fsS "https://$HOST/$BACKUP_STORAGE_ZONE/db/$1" -H "AccessKey: $BACKUP_STORAGE_KEY" -o /tmp/restore.enc
trap 'rm -f /tmp/restore.enc /tmp/restore.dump' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in /tmp/restore.enc -out /tmp/restore.dump
pg_restore --no-owner --exit-on-error -d "$DATABASE_URL" /tmp/restore.dump
echo "restored $1"
