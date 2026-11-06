#!/usr/bin/env bash
# FetUre: automatic updates. Run once on the server (as root):
#   curl -fsSL https://raw.githubusercontent.com/edkiy73/Fit_timer/main/apps/feture/deploy/enable-autoupdate.sh | bash
# Every minute (EVERY=n to change) the server checks the branch; if there is new code it pulls it and runs `docker compose up -d --build`
# (migrate applies new migrations, app restarts). Secrets stay in .env / app.env and are never touched.
# Off: rm /etc/cron.d/feture-update. Log: /var/log/feture-update.log
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Запусти от root"; exit 1; }
DIR="${DIR:-/opt/feture}"; BRANCH="${BRANCH:-main}"; EVERY="${EVERY:-1}"
[ -d "$DIR/repo/.git" ] || { echo "Нет $DIR/repo — сначала install.sh"; exit 1; }
cat >"$DIR/update.sh" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
exec 9>/var/lock/feture-update.lock; flock -n 9 || exit 0
cd "$DIR/repo"
git fetch -q origin "$BRANCH"
[ "\$(git rev-parse HEAD)" = "\$(git rev-parse origin/$BRANCH)" ] && exit 0
echo "\$(date -u +%FT%TZ) update \$(git rev-parse --short HEAD) -> \$(git rev-parse --short origin/$BRANCH)"
git checkout -q -B "$BRANCH" "origin/$BRANCH"
cd apps/feture/deploy
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
# Build cache grew to 35 GB (audit B8): keep what was used in the last 3 days, drop the rest.
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
echo "\$(date -u +%FT%TZ) done"
SCRIPT
chmod 755 "$DIR/update.sh"
echo "*/$EVERY * * * * root $DIR/update.sh >>/var/log/feture-update.log 2>&1" >/etc/cron.d/feture-update
chmod 644 /etc/cron.d/feture-update
echo "✅ Автообновление включено: раз в $EVERY мин. Лог: /var/log/feture-update.log"
