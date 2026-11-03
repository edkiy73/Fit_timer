#!/usr/bin/env bash
# FetUre: a separate key for signing in to the TEST accounts (…@feture.test) without ADMIN_KEY.
#   bash /opt/feture/repo/apps/feture/deploy/test-login.sh        # turn on (prints the key ONCE; a new run makes a new key)
#   bash /opt/feture/repo/apps/feture/deploy/test-login.sh off    # turn off
#   bash /opt/feture/repo/apps/feture/deploy/test-login.sh code [123456]   # a FIXED sign-in code for the test accounts
#   bash /opt/feture/repo/apps/feture/deploy/test-login.sh code off        # remove the fixed code
# The key opens exactly two admin actions — user_create and user_test_code — and only for addresses at
# TEST_LOGIN_DOMAIN (feture.test). It cannot read users, change roles or touch real people's accounts.
# The fixed code (`code`): the same six digits sign in ANY test account (…@feture.test, never qa-* staff, never a real
# address) while it is set — no key, no admin call. Meant for testers and browser agents; remove it with `code off`.
# If a key leaks: run this script again (new key) or with `off`.
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
if [ "${1:-on}" = "code" ]; then
  if [ "${2:-}" = "off" ]; then
    setenv app.env TEST_LOGIN_STATIC_CODE ""
    docker compose up -d --force-recreate app >/dev/null 2>&1
    echo "✅ Постоянный код выключен"
    exit 0
  fi
  fixed="${2:-$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom | tr -d ' ') % 1000000 )))}"
  [[ "$fixed" =~ ^[0-9]{6}$ ]] || { echo "Код — ровно 6 цифр"; exit 1; }
  setenv app.env TEST_LOGIN_DOMAIN "feture.test"
  setenv app.env TEST_LOGIN_STATIC_CODE "$fixed"
  chmod 600 app.env
  docker compose up -d --force-recreate app >/dev/null 2>&1
  cat <<MSG
✅ Постоянный код включён: $fixed
Любой тестовый аккаунт (world-<имя>@feture.test): в приложении почта → «У меня есть код» → $fixed.
Не работает для настоящих адресов и для qa-staff. Выключить: test-login.sh code off
MSG
  exit 0
fi
if [ "${1:-on}" = "off" ]; then
  setenv app.env TEST_LOGIN_KEY ""
  setenv app.env TEST_LOGIN_STATIC_CODE ""
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
