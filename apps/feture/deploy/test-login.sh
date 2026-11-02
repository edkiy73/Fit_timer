#!/usr/bin/env bash
# FetUre: a separate key for signing in to the TEST accounts (…@feture.test) without ADMIN_KEY.
#   bash /opt/feture/repo/apps/feture/deploy/test-login.sh        # turn on (prints the key ONCE; a new run makes a new key)
#   bash /opt/feture/repo/apps/feture/deploy/test-login.sh off    # turn off
# The key opens exactly two admin actions — user_create and user_test_code — and only for addresses at
# TEST_LOGIN_DOMAIN (feture.test). It cannot read users, change roles or touch real people's accounts.
# If it leaks: run this script again (new key) or with `off`.
set -euo pipefail
DIR="${DIR:-/opt/feture}"
cd "$DIR/repo/apps/feture/deploy"
[ -f app.env ] || { echo "Нет app.env — сначала install.sh"; exit 1; }
setenv() {
  local tmp; tmp=$(mktemp)
  K="$2" V="$3" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; done=0}
    { if (index($0, k"=")==1) { print k"="v; done=1 } else print }
    END{ if (!done) print k"="v }' "$1" >"$tmp"
  cat "$tmp" >"$1"; rm -f "$tmp"
}
if [ "${1:-on}" = "off" ]; then
  setenv app.env TEST_LOGIN_KEY ""
  setenv app.env TEST_LOGIN_DOMAIN ""
  docker compose up -d --force-recreate app >/dev/null 2>&1
  echo "✅ Тестовый вход выключен"
  exit 0
fi
key=$(openssl rand -hex 24)
setenv app.env TEST_LOGIN_DOMAIN "feture.test"
setenv app.env TEST_LOGIN_KEY "$key"
chmod 600 app.env
docker compose up -d --force-recreate app >/dev/null 2>&1
cat <<MSG
✅ Тестовый вход включён (только адреса @feture.test). Ключ — показан один раз, сохрани его:

    $key

Как получить код входа (подставь адрес тестового аккаунта):
  curl -s -X POST https://app.kinhaze.com/api/admin -H 'Content-Type: application/json' \\
    -H 'x-admin-key: <ключ>' -d '{"action":"user_test_code","email":"world-mira@feture.test"}'
Ответ: {"ok":true,"code":"123456",...}. В приложении: почта → «У меня есть код» → код (15 минут, один раз).
Новому адресу сначала: {"action":"user_create","email":"…@feture.test"}.
MSG
