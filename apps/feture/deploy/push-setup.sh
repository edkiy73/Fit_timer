#!/usr/bin/env bash
# FetUre: push notifications on the self-hosted server. Run on the server, as root:
#   curl -fsSL https://raw.githubusercontent.com/edkiy73/Fit_timer/main/apps/feture/deploy/push-setup.sh | bash
# Web push: generates our own VAPID key pair (nothing to copy from Vercel — those values are write-only there).
# Android/iOS push (FCM): asks for the Firebase service-account JSON (Firebase console → Project settings → Service
# accounts → Generate new private key, the SAME project as the app's google-services.json). Paste it (many lines are fine)
# and press Ctrl+D; or put the file at /opt/feture/firebase.json beforehand (Termius SFTP) — it is read and shredded.
# Safe to run again: an existing VAPID pair is kept; an empty Firebase answer changes nothing.
set -euo pipefail
DIR="${DIR:-/opt/feture}"
cd "$DIR/repo/apps/feture/deploy"
[ -f app.env ] || { echo "Нет app.env — сначала install.sh"; exit 1; }
getenv() { awk -F= -v k="$2" '$1==k{sub(/^[^=]*=/,""); sub(/[ \t]+#.*$/,""); print; exit}' "$1"; }
setenv() { # setenv FILE KEY VALUE — value passed through the environment, nothing needs escaping
  local tmp; tmp=$(mktemp)
  K="$2" V="$3" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; done=0}
    { if (index($0, k"=")==1) { print k"="v; done=1 } else print }
    END{ if (!done) print k"="v }' "$1" >"$tmp"
  cat "$tmp" >"$1"; rm -f "$tmp"
}
changed=0
if [ -z "$(getenv app.env FE_VAPID_PRIVATE_KEY)" ] || [ -z "$(getenv app.env FE_VAPID_PUBLIC_KEY)" ]; then
  echo "▶ Web push: создаю ключи VAPID"
  keys=$(docker compose exec -T app node -e "const c=require('node:crypto');const e=c.createECDH('prime256v1');e.generateKeys();console.log(e.getPublicKey().toString('base64url')+' '+e.getPrivateKey().toString('base64url'))")
  setenv app.env FE_VAPID_PUBLIC_KEY "${keys%% *}"
  setenv app.env FE_VAPID_PRIVATE_KEY "${keys##* }"
  domain=$(getenv .env FETURE_DOMAIN || true); [ -n "$domain" ] || domain=$(getenv app.env FETURE_DOMAIN || true)
  setenv app.env FE_VAPID_SUBJECT "https://${domain:-$(hostname -f)}"
  changed=1
else echo "✓ Web push: ключи уже есть"; fi
if [ -z "$(getenv app.env FIREBASE_SERVICE_ACCOUNT_BASE64)" ]; then
  json=""; file="$DIR/firebase.json"
  if [ -f "$file" ]; then json=$(cat "$file"); echo "▶ FCM: беру ключ из $file"
  else
    echo "▶ Android/iOS push (FCM): вставь весь текст JSON (много строк — это нормально), затем на новой строке нажми Ctrl+D."
    echo "  Только Ctrl+D, ничего не вставляя — пропустить."
    stty -echo </dev/tty 2>/dev/null || true
    json=$(cat </dev/tty) || json=""
    stty echo </dev/tty 2>/dev/null || true; echo
  fi
  if [ -n "$json" ]; then
    printf '%s' "$json" | docker compose exec -T app node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.private_key||!j.client_email){console.error('не похоже на ключ сервисного аккаунта');process.exit(1)}})" \
      || { echo "✖ Это не JSON ключа сервисного аккаунта — ничего не записано"; exit 1; }
    setenv app.env FIREBASE_SERVICE_ACCOUNT_BASE64 "$(printf '%s' "$json" | base64 -w0)"
    [ -f "$file" ] && shred -u "$file" 2>/dev/null || true
    changed=1
  else echo "– FCM пропущен"; fi
else echo "✓ FCM: ключ уже есть"; fi
chmod 600 app.env
if [ "$changed" = 1 ]; then docker compose up -d --force-recreate app >/dev/null 2>&1 && echo "✅ Приложение перезапущено с новыми ключами"; fi
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log('push:',JSON.stringify(j.services&&j.services.push)))" || true
