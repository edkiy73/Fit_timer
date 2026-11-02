#!/bin/sh
# Nightly encrypted backup to a separate Bunny Storage Zone (another provider than the server):
#   db/feture-<ts>.dump.enc            — the database (pg_dump custom format)
#   secrets/feture-secrets-<ts>.tar.enc — .env and app.env: without FETURE_ID_PEPPER & co. a restored database is useless
# Both leave the server only encrypted (AES-256, key = BACKUP_PASSPHRASE, kept in the owner's password manager).
# Keeps the newest BACKUP_KEEP (14) of each.
set -eu
: "${DATABASE_URL:?}" "${BACKUP_STORAGE_ZONE:?}" "${BACKUP_STORAGE_KEY:?}" "${BACKUP_PASSPHRASE:?}"
HOST="${BACKUP_STORAGE_HOST:-storage.bunnycdn.com}"
SCHEME="${BACKUP_STORAGE_SCHEME:-https}"
KEEP="${BACKUP_KEEP:-14}"
BASE="$SCHEME://$HOST/$BACKUP_STORAGE_ZONE"
ts=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

enc() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$1" -out "$2"; }
put() { # put <file> <remote path>
  sum=$(sha256sum "$1" | cut -d' ' -f1 | tr 'a-f' 'A-F')
  curl -fsS -X PUT "$BASE/$2" -H "AccessKey: $BACKUP_STORAGE_KEY" -H "Content-Type: application/octet-stream" \
    -H "Checksum: $sum" --upload-file "$1" >/dev/null
}
prune() { # prune <dir>
  curl -fsS "$BASE/$1/" -H "AccessKey: $BACKUP_STORAGE_KEY" -H "Accept: application/json" \
    | jq -r '.[] | select(.IsDirectory == false) | .ObjectName' | sort | head -n "-$KEEP" | while read -r old; do
      curl -fsS -X DELETE "$BASE/$1/$old" -H "AccessKey: $BACKUP_STORAGE_KEY" >/dev/null && echo "removed $1/$old"
    done
}

# Dump to a file first: in a pipe a failed pg_dump would still produce a valid-looking encrypted (empty) backup.
pg_dump -Fc "$DATABASE_URL" -f "$work/db.dump"
pg_restore --list "$work/db.dump" >/dev/null
enc "$work/db.dump" "$work/db.enc"
put "$work/db.enc" "db/feture-$ts.dump.enc"
echo "backup ok: db/feture-$ts.dump.enc"

if [ -n "${BACKUP_SECRETS_DIR:-}" ] && [ -f "$BACKUP_SECRETS_DIR/.env" ] && [ -f "$BACKUP_SECRETS_DIR/app.env" ]; then
  tar -C "$BACKUP_SECRETS_DIR" -cf "$work/secrets.tar" .env app.env
  enc "$work/secrets.tar" "$work/secrets.enc"
  put "$work/secrets.enc" "secrets/feture-secrets-$ts.tar.enc"
  echo "backup ok: secrets/feture-secrets-$ts.tar.enc"
  prune secrets
fi
prune db
