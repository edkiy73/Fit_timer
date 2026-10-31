# FetUre на своём сервере

План и причины — [../docs/infra/migration-plan.md](../docs/infra/migration-plan.md). Здесь — как поднять.

## Что внутри

| Сервис | Что делает |
|---|---|
| `db` | PostgreSQL 16 + pg_cron. Данные в томе `pgdata` |
| `migrate` | Один раз при каждом запуске: новые миграции, пароли ролей, перезагрузка схемы PostgREST |
| `rest` | PostgREST 12: вход Core (`kv_exec`) и старые вызовы `lib/feture`. Наружу не открыт |
| `app` | `server/host.mjs`: сайт, `/api/*`, загрузка медиа, realtime (SSE `/api/fe-events`), тик очереди раз в минуту. Один процесс — не масштабировать копиями |
| `caddy` | HTTPS (Let’s Encrypt) на `FETURE_DOMAIN`, единственный открытый порт |
| `backup` | Каждую ночь ~03:00 UTC: зашифрованный дамп в отдельную Storage Zone Bunny, хранит 14 последних |

## Владелец: один раз

1. **Bunny** (dash.bunny.net):
   - Storage Zone `feture-media`, регион Frankfurt. Пароль из «FTP & API Access» → `BUNNY_STORAGE_KEY`.
   - Pull Zone, источник — эта Storage Zone, свой домен `media.<домен>` → `BUNNY_CDN_ORIGIN`.
     Security → Token Authentication: включить, ключ → `BUNNY_TOKEN_KEY`.
     Security → Blocked countries: GB, US ([age-and-verification.md](../docs/infra/age-and-verification.md)).
     Caching → query string не учитывать в ключе кеша (подпись ссылки меняется, файл — нет).
   - Отдельная Storage Zone `feture-backup` **без** Pull Zone → `BACKUP_STORAGE_ZONE`, `BACKUP_STORAGE_KEY`.
2. **VPS** (ЕС, письменное «да» на 18+, 4 vCPU / 8 ГБ): Ubuntu 24.04, Docker по инструкции docker.com, вход по
   SSH-ключу, пароль выключен, firewall: открыть 22, 80, 443.
3. **DNS** (Porkbun): `A app.<домен>` → IP сервера; `CNAME media.<домен>` → адрес Pull Zone Bunny.
4. На сервере:
   ```sh
   git clone https://github.com/edkiy73/Fit_timer && cd Fit_timer/apps/feture/deploy
   node make-env.mjs && chmod 600 .env app.env   # нет Node — docker run --rm -v "$PWD":/w -w /w node:22 node make-env.mjs
   nano .env app.env                             # заполнить строки «вставить»
   docker compose up -d --build
   docker compose logs -f migrate app            # «migrations applied: 110», «feture host on :3000»
   ```
5. **`BACKUP_PASSPHRASE` из `.env` — в менеджер паролей.** Без неё бэкап не расшифровать.
6. Проверить: `https://app.<домен>/healthz` → `ok`; `https://app.<домен>/api/health` → пробы `storage`, `accounts`,
   `supabase` (это PostgREST) — `true`. UptimeRobot на `/healthz`.

## Обновление

```sh
cd Fit_timer && git pull && cd apps/feture/deploy && docker compose up -d --build
```
`migrate` накатывает только новые миграции; `app` перезапускается с новой сборкой.

## Бэкап и восстановление

- Вручную сейчас: `docker compose exec backup backup.sh`.
- Восстановить на новом сервере: шаги 2–4 выше, но до `up` всего стека:
  ```sh
  docker compose up -d db
  docker compose run --rm --entrypoint restore.sh backup feture-<дата>.dump.enc
  docker compose up -d --build
  ```
  Проверено 31.10.2026 на чистом кластере: 110 миграций, 176 таблиц, cron, вход роли `feture_api`.
- Раз в месяц — пробное восстановление на отдельной машине. Непроверенный бэкап — не бэкап.

## Если хостер выгонит

Новый VPS → шаги 2–4 → восстановление → DNS `app.<домен>` на новый IP. Приложение пересобирать не нужно: в нём
только свой домен.
