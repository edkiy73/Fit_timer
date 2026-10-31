#!/usr/bin/env bash
# FetUre: the whole server in one command (docs/infra/migration-plan.md, deploy/README.md).
# On a fresh Ubuntu 24.04 VPS, as root:
#   curl -fsSL https://raw.githubusercontent.com/edkiy73/Fit_timer/feture/self-host/apps/feture/deploy/install.sh | bash
# It asks three things: the domain, the Bunny API key, the Resend API key (full access, only used here).
# On a NEW server for an existing installation (the old one is gone) it finds the backups in the same Bunny account,
# asks the backup passphrase, restores the secrets and the database, and moves the domain to the new server.
# Then it: installs Docker and a firewall, fetches the code, creates every secret, sets up Bunny (media storage,
# CDN with signed links and GB/US blocked, backup storage, DNS for the domain), sets up Resend (sending domain,
# DNS records, a send-only key), starts everything, and prints the one thing left: nameservers at the registrar.
# Safe to run again: every step that is already done is skipped.
set -euo pipefail

BRANCH="${BRANCH:-feture/self-host}"
REPO_URL="${REPO_URL:-https://github.com/edkiy73/Fit_timer}"
DIR="${DIR:-/opt/feture}"
BUNNY_API="${BUNNY_API:-https://api.bunny.net}"
RESEND_API="${RESEND_API:-https://api.resend.com}"
STORAGE_URL="${STORAGE_URL:-https://storage.bunnycdn.com}"
# Tests only: SKIP_SYSTEM=1 (no apt/docker/firewall/git), SKIP_COMPOSE=1, REPO_DIR=<checkout>, SERVER_IP=<ip>.

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask VAR "prompt" [secret]
  local var=$1 prompt=$2 secret=${3:-}
  [ -n "${!var:-}" ] && return 0
  if [ -n "$secret" ]; then read -r -s -p "$prompt" "$var" </dev/tty; echo; else read -r -p "$prompt" "$var" </dev/tty; fi
}

# --- .env helpers: values are random base64url, URLs and names; written via awk so nothing needs escaping ---
getenv() { [ -f "$1" ] && awk -F= -v k="$2" '$1==k{sub(/^[^=]*=/,""); sub(/[ \t]+#.*$/,""); print; exit}' "$1" || true; }
setenv() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp)
  K="$key" V="$value" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; done=0}
    { if (index($0, k"=")==1) { print k"="v; done=1 } else print }
    END{ if (!done) print k"="v }' "$file" >"$tmp"
  cat "$tmp" >"$file"; rm -f "$tmp"
}

# --- HTTP helpers: fail loudly with the API's own message ---
api() { # api METHOD URL KEYHEADER BODY → stdout JSON; dies on HTTP error
  local method=$1 url=$2 auth=$3 body=${4:-} out code
  out=$(mktemp)
  if [ -n "$body" ]; then
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" -H "$auth" -H 'Content-Type: application/json' -H 'Accept: application/json' --data "$body")
  else
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" -H "$auth" -H 'Accept: application/json')
  fi
  if [ "${code:0:1}" != "2" ]; then echo "HTTP $code from $method $url: $(head -c 400 "$out")" >&2; rm -f "$out"; return 1; fi
  cat "$out"; rm -f "$out"
}
bunny() { api "$1" "$BUNNY_API$2" "AccessKey: $BUNNY_API_KEY" "${3:-}"; }
resend() { api "$1" "$RESEND_API$2" "Authorization: Bearer $RESEND_API_KEY" "${3:-}"; }

node_run() { # runs a node script inside deploy/ (host node if any, otherwise the pinned image)
  if command -v node >/dev/null 2>&1; then node "$@"
  else docker run --rm -v "$PWD":/w -w /w node:22.20.0-bookworm-slim node "$@"; fi
}

# ------------------------------------------------------------------------------------------------------------
say "FetUre: установка сервера"
ask FETURE_ROOT_DOMAIN "Домен (например feture.com, без app.): "
FETURE_ROOT_DOMAIN=$(printf '%s' "$FETURE_ROOT_DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##; s#^www\.##; s#^app\.##')
printf '%s' "$FETURE_ROOT_DOMAIN" | grep -Eq '^[a-z0-9-]+(\.[a-z0-9-]+)+$' || die "Домен «$FETURE_ROOT_DOMAIN» не похож на домен"
APP_HOST="app.$FETURE_ROOT_DOMAIN"

if [ "${SKIP_SYSTEM:-}" != "1" ]; then
  [ "$(id -u)" = "0" ] || die "Запусти от root (или через sudo)"
  say "Система: пакеты, Docker, firewall"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git curl jq openssl ufw ca-certificates >/dev/null
  command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh >/dev/null
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
  say "Код: ветка $BRANCH"
  if [ -d "$DIR/repo/.git" ]; then git -C "$DIR/repo" fetch -q origin "$BRANCH" && git -C "$DIR/repo" checkout -q -B "$BRANCH" "origin/$BRANCH"
  else mkdir -p "$DIR"; git clone -q --branch "$BRANCH" --depth 50 "$REPO_URL" "$DIR/repo"; fi
  REPO_DIR="$DIR/repo"
fi
command -v jq >/dev/null 2>&1 || die "Нужен jq"
cd "${REPO_DIR:?}/apps/feture/deploy"

RESTORE_DB=0
if [ ! -f .env ]; then
  ask BUNNY_API_KEY "Bunny API key (dash.bunny.net → Account → API): " secret
  bunny GET "/storagezone?page=1&perPage=1" >/dev/null || die "Bunny не принял ключ"
  # An earlier installation in this Bunny account? Then this is a new server for it: bring back its secrets and data.
  old=$(bunny GET "/storagezone?page=1&perPage=1000&search=feture-backup-" \
    | jq -c '[(.Items // .)[] | select((.Name // "") | startswith("feture-backup-")) | select(.Deleted != true)]')
  count=$(jq 'length' <<<"$old")
  if [ "$count" -gt 0 ]; then
    if [ "$count" -gt 1 ]; then
      echo "Найдено несколько прежних установок: $(jq -r '[.[].Name] | join(", ")' <<<"$old")"
      ask OLD_SUFFIX "Какую восстановить (6 символов после feture-backup-): "
      old=$(jq -c --arg n "feture-backup-$OLD_SUFFIX" '[.[] | select(.Name == $n)]' <<<"$old")
      [ "$(jq 'length' <<<"$old")" = "1" ] || die "Нет такой установки"
    fi
    bzone=$(jq -r '.[0].Name' <<<"$old"); bkey=$(jq -r '.[0].Password' <<<"$old")
    say "Найдена прежняя установка ($bzone): восстанавливаю секреты и базу"
    latest=$(curl -fsS "$STORAGE_URL/$bzone/secrets/" -H "AccessKey: $bkey" -H "Accept: application/json" \
      | jq -r '.[] | select(.IsDirectory == false) | .ObjectName' | sort | tail -1)
    [ -n "$latest" ] || die "В $bzone нет копии секретов — восстановить нечем"
    ask BACKUP_PASSPHRASE "Пароль бэкапов (из менеджера паролей): " secret
    tmp=$(mktemp -d)
    curl -fsS "$STORAGE_URL/$bzone/secrets/$latest" -H "AccessKey: $bkey" -o "$tmp/s.enc"
    BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
      -in "$tmp/s.enc" -out "$tmp/s.tar" 2>/dev/null || { rm -rf "$tmp"; die "Пароль бэкапов не подошёл"; }
    tar -C . -xf "$tmp/s.tar" .env app.env; rm -rf "$tmp"
    echo "  секреты из $latest"
    RESTORE_DB=1
  else
    say "Секреты: создаю .env и app.env"; node_run make-env.mjs >/dev/null
  fi
fi
chmod 600 .env app.env
setenv .env FETURE_DOMAIN "$APP_HOST"
[ "$(getenv .env ACME_EMAIL)" = "admin@example.com" ] && setenv .env ACME_EMAIL "admin@$FETURE_ROOT_DOMAIN"

# --- Bunny: media storage, CDN, backup storage, DNS ------------------------------------------------------------
if [ -z "$(getenv app.env BUNNY_TOKEN_KEY)" ] || [ -z "$(getenv .env BACKUP_STORAGE_KEY)" ] || [ -z "$(getenv .env FETURE_BUNNY_DNS_ID)" ]; then
  ask BUNNY_API_KEY "Bunny API key (dash.bunny.net → Account → API): " secret
  bunny GET "/storagezone?page=1&perPage=1" >/dev/null || die "Bunny не принял ключ"
fi
SFX=$(getenv .env FETURE_ZONE_SUFFIX)
if [ -z "$SFX" ]; then SFX=$(openssl rand -hex 3); setenv .env FETURE_ZONE_SUFFIX "$SFX"; fi

if [ -z "$(getenv app.env BUNNY_STORAGE_KEY)" ]; then
  say "Bunny: хранилище медиа (Франкфурт)"
  zone=$(bunny POST /storagezone "{\"Name\":\"feture-media-$SFX\",\"Region\":\"DE\"}") || die "Не создалась Storage Zone медиа"
  setenv .env FETURE_BUNNY_MEDIA_ZONE_ID "$(jq -r '.Id' <<<"$zone")"
  setenv app.env BUNNY_STORAGE_ZONE "$(jq -r '.Name' <<<"$zone")"
  setenv app.env BUNNY_STORAGE_HOST "storage.bunnycdn.com"
  setenv app.env BUNNY_STORAGE_KEY "$(jq -r '.Password' <<<"$zone")"
fi

if [ -z "$(getenv app.env BUNNY_TOKEN_KEY)" ]; then
  say "Bunny: CDN медиа — подписанные ссылки, без GB и US"
  zid=$(getenv .env FETURE_BUNNY_MEDIA_ZONE_ID)
  pz=$(bunny POST /pullzone "{\"Name\":\"feture-media-$SFX\",\"OriginType\":2,\"StorageZoneId\":$zid,\"ZoneSecurityEnabled\":true,\"BlockedCountries\":[\"GB\",\"US\"],\"IgnoreQueryStrings\":true,\"EnableAutoSSL\":true,\"DisableCookies\":true}") || die "Не создалась Pull Zone"
  pzid=$(jq -r '.Id // empty' <<<"$pz")
  [ -n "$pzid" ] || pzid=$(bunny GET "/pullzone?search=feture-media-$SFX" | jq -r '(.Items // .)[] | select(.Name=="feture-media-'"$SFX"'") | .Id' | head -1)
  [ -n "$pzid" ] || die "Pull Zone создана, но её Id не найден"
  setenv .env FETURE_BUNNY_PULLZONE_ID "$pzid"
  pz=$(bunny GET "/pullzone/$pzid")
  [ "$(jq -r '.StorageZoneId' <<<"$pz")" = "$zid" ] || die "Pull Zone смотрит не на хранилище медиа"
  [ "$(jq -r '.ZoneSecurityEnabled' <<<"$pz")" = "true" ] || die "У Pull Zone не включены подписанные ссылки"
  host=$(jq -r '[.Hostnames[] | select(.IsSystemHostname == true) | .Value][0] // empty' <<<"$pz")
  [ -n "$host" ] || host="feture-media-$SFX.b-cdn.net"
  key=$(jq -r '.ZoneSecurityKey // empty' <<<"$pz")
  [ -n "$key" ] || die "Bunny не вернул ключ подписи ссылок"
  setenv app.env BUNNY_CDN_ORIGIN "https://$host"
  setenv app.env BUNNY_TOKEN_KEY "$key"
fi

if [ -z "$(getenv .env BACKUP_STORAGE_KEY)" ]; then
  say "Bunny: отдельное хранилище бэкапов (без CDN)"
  bz=$(bunny POST /storagezone "{\"Name\":\"feture-backup-$SFX\",\"Region\":\"DE\"}") || die "Не создалась Storage Zone бэкапов"
  setenv .env BACKUP_STORAGE_ZONE "$(jq -r '.Name' <<<"$bz")"
  setenv .env BACKUP_STORAGE_HOST "storage.bunnycdn.com"
  setenv .env BACKUP_STORAGE_KEY "$(jq -r '.Password' <<<"$bz")"
fi

SERVER_IP="${SERVER_IP:-$(curl -4 -fsS https://api.ipify.org || true)}"
printf '%s' "$SERVER_IP" | grep -Eq '^[0-9]+(\.[0-9]+){3}$' || die "Не удалось узнать IP сервера"

DNS_ID=$(getenv .env FETURE_BUNNY_DNS_ID)
if [ -z "$DNS_ID" ]; then
  say "Bunny DNS: зона $FETURE_ROOT_DOMAIN, app → $SERVER_IP"
  dz=$(bunny POST /dnszone "{\"Domain\":\"$FETURE_ROOT_DOMAIN\"}" 2>/dev/null) && DNS_ID=$(jq -r '.Id // empty' <<<"$dz") || true
  [ -n "$DNS_ID" ] || DNS_ID=$(bunny GET "/dnszone?search=$FETURE_ROOT_DOMAIN" | jq -r '(.Items // .)[] | select(.Domain=="'"$FETURE_ROOT_DOMAIN"'") | .Id' | head -1)
  [ -n "$DNS_ID" ] || die "Не удалось создать DNS-зону в Bunny"
  setenv .env FETURE_BUNNY_DNS_ID "$DNS_ID"
fi
if [ -n "${BUNNY_API_KEY:-}" ]; then
  # app.<domain> → this server, exactly one A record (a second one would send half the visitors to a dead server).
  zone=$(bunny GET "/dnszone/$DNS_ID") || die "DNS-зона $DNS_ID не читается"
  for rid in $(jq -r --arg ip "$SERVER_IP" '.Records[]? | select(.Type == 0 and .Name == "app" and .Value != $ip) | .Id' <<<"$zone"); do
    bunny DELETE "/dnszone/$DNS_ID/records/$rid" >/dev/null && echo "  убрал старый адрес app (запись $rid)"
  done
  if [ "$(jq --arg ip "$SERVER_IP" '[.Records[]? | select(.Type == 0 and .Name == "app" and .Value == $ip)] | length' <<<"$zone")" = "0" ]; then
    bunny PUT "/dnszone/$DNS_ID/records" "{\"Type\":0,\"Name\":\"app\",\"Value\":\"$SERVER_IP\",\"Ttl\":300}" >/dev/null || die "Не добавилась запись app"
    echo "  app.$FETURE_ROOT_DOMAIN → $SERVER_IP"
  fi
fi

# --- Resend: sending domain mail.<domain>, DNS records, a send-only key for the app --------------------------
if [ -z "$(getenv app.env RESEND_API_KEY)" ]; then
  ask RESEND_API_KEY "Resend API key, Full access (resend.com → API Keys; Enter — пропустить): " secret
  if [ -n "${RESEND_API_KEY:-}" ]; then
    [ -n "${BUNNY_API_KEY:-}" ] || ask BUNNY_API_KEY "Bunny API key (для DNS-записей почты): " secret
    say "Resend: домен mail.$FETURE_ROOT_DOMAIN и записи DNS"
    MAIL_DOMAIN="mail.$FETURE_ROOT_DOMAIN"
    if ! rd=$(resend POST /domains "{\"name\":\"$MAIL_DOMAIN\",\"region\":\"eu-west-1\"}" 2>/dev/null); then
      # Already added on an earlier run: take it with its records.
      rid=$(resend GET /domains | jq -r --arg d "$MAIL_DOMAIN" '.data[] | select(.name==$d) | .id' | head -1)
      [ -n "$rid" ] || die "Resend: не удалось добавить домен $MAIL_DOMAIN"
      rd=$(resend GET "/domains/$rid")
    fi
    rid=$(jq -r '.id // empty' <<<"$rd"); [ -n "$rid" ] || die "Resend: домен не создан"
    jq -c '.records[]' <<<"$rd" | while read -r rec; do
      type=$(jq -r '.type' <<<"$rec"); name=$(jq -r '.name' <<<"$rec"); value=$(jq -r '.value' <<<"$rec")
      name=${name%".$FETURE_ROOT_DOMAIN"}; [ "$name" = "$FETURE_ROOT_DOMAIN" ] && name=""
      case "$type" in
        TXT) body=$(jq -nc --arg n "$name" --arg v "$value" '{Type:3,Name:$n,Value:$v,Ttl:300}') ;;
        MX) body=$(jq -nc --arg n "$name" --arg v "$value" --argjson p "$(jq -r '.priority // 10' <<<"$rec")" '{Type:4,Name:$n,Value:$v,Priority:$p,Ttl:300}') ;;
        CNAME) body=$(jq -nc --arg n "$name" --arg v "$value" '{Type:2,Name:$n,Value:$v,Ttl:300}') ;;
        *) echo "  пропускаю запись типа $type"; continue ;;
      esac
      bunny PUT "/dnszone/$DNS_ID/records" "$body" >/dev/null && echo "  DNS $type $name" || echo "  DNS $type $name — уже есть или ошибка"
    done
    resend POST "/domains/$rid/verify" '{}' >/dev/null || true
    sk=$(resend POST /api-keys "{\"name\":\"feture-server\",\"permission\":\"sending_access\",\"domain_id\":\"$rid\"}") || die "Resend: не создался ключ отправки"
    setenv app.env RESEND_API_KEY "$(jq -r '.token' <<<"$sk")"
    setenv app.env MAIL_FROM "FetUre <code@$MAIL_DOMAIN>"
  fi
fi

# --- Start ------------------------------------------------------------------------------------------------------
if [ "${SKIP_COMPOSE:-}" != "1" ]; then
  if [ "$RESTORE_DB" = "1" ]; then
    say "База: восстанавливаю последний бэкап"
    docker compose build
    docker compose up -d db
    for _ in $(seq 1 60); do docker compose exec -T db pg_isready -U postgres -d feture >/dev/null 2>&1 && break; sleep 2; done
    docker compose run --rm --no-deps --entrypoint restore.sh backup latest || die "Восстановление базы не удалось"
  fi
  say "Сборка и запуск (первый раз ~5–10 минут)"
  docker compose up -d --build
  for _ in $(seq 1 60); do
    if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then break; fi
    sleep 5
  done
  docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    || { docker compose logs --tail 50 migrate app; die "Приложение не поднялось — логи выше"; }
  docker compose logs migrate | grep -E 'migrations applied' | tail -1 || true
fi

PASS=$(getenv .env BACKUP_PASSPHRASE)
cat <<EOF

✅ Сервер работает. Осталось одно:

  У регистратора домена $FETURE_ROOT_DOMAIN поставь DNS-серверы (nameservers):
      kiki.bunny.net
      coco.bunny.net

  Через 10–60 минут откроется https://$APP_HOST (HTTPS включится сам).

  Сохрани в менеджер паролей пароль бэкапов (без него бэкап не расшифровать):
      $PASS

  Повторный запуск этой же команды ничего не ломает: обновит код и перезапустит.
EOF
