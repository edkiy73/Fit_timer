#!/bin/sh
# Applies the schema FetUre needs, each file once, in Supabase's order (numeric version prefix, then name):
#   1. Core's key-value store (accounts, sign-in codes): deploy/core-migrations (copy of fittimer's create_appbase_kv).
#   2. Every FetUre migration in apps/feture/supabase/migrations.
# Parts that need Supabase-only extensions (pg_net, Vault, Storage) skip themselves; pg_cron is in our image.
# Then gives the two login roles their passwords and tells PostgREST to reload the schema.
# Usage: DATABASE_URL=postgres://postgres:...@db/feture migrate.sh <dir>...   (the `migrate` service in compose)
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL="psql $DATABASE_URL -X -q -v ON_ERROR_STOP=1"
$PSQL -c "create table if not exists public.deploy_migrations (name text primary key, applied_at timestamptz not null default now())"
list=$(for dir in "$@"; do ls "$dir"/*.sql; done | awk -F/ '{f=$NF; v=f; sub(/_.*/,"",v); printf "%020d %s %s\n", v, f, $0}' | sort | cut -d' ' -f3)
n=0
for path in $list; do
  name=$(basename "$path")
  case "$name" in *"'"*) echo "bad migration name: $name" >&2; exit 1;; esac
  done_=$($PSQL -At -c "select 1 from public.deploy_migrations where name = '$name'")
  [ "$done_" = "1" ] && continue
  echo "apply $name"
  { echo "begin;"; cat "$path"; echo; echo "insert into public.deploy_migrations(name) values ('$name');"; echo "commit;"; } | $PSQL
  n=$((n+1))
done
echo "migrations applied: $n"
# Passwords go through psql variables (never into the SQL text) and only when given.
if [ -n "${AUTHENTICATOR_PASSWORD:-}" ]; then
  echo "alter role authenticator login password :'pw';" | $PSQL -v pw="$AUTHENTICATOR_PASSWORD"
fi
if [ -n "${FETURE_API_DB_PASSWORD:-}" ]; then
  echo "alter role feture_api login password :'pw';" | $PSQL -v pw="$FETURE_API_DB_PASSWORD"
fi
$PSQL -c "notify pgrst, 'reload schema'"
