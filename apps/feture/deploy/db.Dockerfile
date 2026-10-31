# Postgres for FetUre: the official image + pg_cron (retention jobs in the migrations) + tools for backups.
FROM postgres:16.9-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-cron curl jq openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY initdb/ /docker-entrypoint-initdb.d/
COPY migrate.sh backup.sh restore.sh /usr/local/bin/
COPY core-migrations/ /migrations/core/
