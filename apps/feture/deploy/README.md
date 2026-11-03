# FetUre на своём сервере

План и причины — [../docs/infra/migration-plan.md](../docs/infra/migration-plan.md). Здесь — как поднять.

## Что внутри

| Сервис | Что делает |
|---|---|
| `db` | PostgreSQL 16 + pg_cron. Данные в томе `pgdata` |
| `migrate` | Один раз при каждом запуске: новые миграции, пароли ролей, перезагрузка схемы PostgREST |
| `rest` | PostgREST 12: вход Core (`kv_exec`) и старые вызовы `lib/feture`. Наружу не открыт |
| `app` | `server/host.mjs`: сайт, `/api/*`, загрузка медиа, realtime (SSE `/api/fe-events`), тик очереди раз в минуту. Один процесс — не масштабировать копиями. Том `assets` хранит файлы экранов прошлых сборок (последние 3 и все за 7 дней, `server/assets-keep.mjs`): вкладка, открытая до обновления, открывает новые экраны |
| `caddy` | HTTPS (Let’s Encrypt) на `FETURE_DOMAIN`, единственный открытый порт |
| `backup` | Каждую ночь ~03:00 UTC: зашифрованный дамп в отдельную Storage Zone Bunny, хранит 14 последних |

## Установка: одна команда

На свежем VPS (Ubuntu 24.04), от root — в Hostinger это «Browser terminal» в hPanel:

```sh
curl -fsSL https://raw.githubusercontent.com/edkiy73/Fit_timer/main/apps/feture/deploy/install.sh | bash
```

Скрипт спросит домен, API key Bunny и API key Resend (Full access) и сделает остальное: Docker, firewall, код, секреты,
Bunny (медиа, CDN с подписью и блокировкой GB/US, бэкапы, DNS), Resend (домен, записи, ключ на отправку), запуск.
В конце скажет, какие nameservers поставить у регистратора, и покажет пароль бэкапов — его в менеджер паролей.
Повторный запуск безопасен. Push (FCM, web push) — ключи из Vercel переносятся в `app.env` отдельно, без них вход,
лента и чаты работают.

Ручная установка без скрипта: `make-env.mjs`, заполнить `.env` и `app.env`, `docker compose up -d --build`.

## Письма-уведомления

Уведомления на почту (`server/email.mjs`, правила — `../docs/notifications.md` «Email») идут через тот же Resend, но
от отдельного отправителя, не от кодов входа. В `app.env`:

| Переменная | Что | Если не задана |
|---|---|---|
| `MAIL_FROM_NOTIFY` | `KINHAZE <notify@mail.kinhaze.com>` — адрес на том же подтверждённом домене Resend | берётся `MAIL_FROM` |
| `RESEND_WEBHOOK_SECRET` | Signing secret вебхука Resend (`whsec_…`) | вебхук выключен: отказы и жалобы не останавливают письма |

Вебхук в Resend → Webhooks → Add endpoint: `https://app.kinhaze.com/api/fe?email-events=1`, события
`email.bounced` и `email.complained`. Подпись (Svix) проверяется; без секрета адрес отвечает 404. Без `RESEND_API_KEY`
или с тестовым доменом `resend.dev` письма ждут в очереди и не уходят.

## Обновление

```sh
curl -fsSL https://raw.githubusercontent.com/edkiy73/Fit_timer/main/apps/feture/deploy/install.sh | bash
```
`migrate` накатывает только новые миграции; `app` перезапускается с новой сборкой.

## Бэкап и восстановление

- Каждую ночь в отдельную Storage Zone Bunny уходят, зашифрованными паролем бэкапов: дамп базы (`db/`) и `.env` +
  `app.env` (`secrets/`). Без секретов восстановленная база бесполезна: на `FETURE_ID_PEPPER` завязаны аккаунты.
- Вручную сейчас: `docker compose exec backup backup.sh`.
- Раз в месяц — пробное восстановление на отдельной машине. Непроверенный бэкап — не бэкап.

## Если сервер потерян или хостер выгнал

Новый VPS → та же команда `install.sh` с тем же доменом и ключом Bunny. Скрипт найдёт прежнюю установку в Bunny,
спросит пароль бэкапов, вернёт секреты и последнюю базу, переставит `app.<домен>` на новый IP (DNS уже в Bunny —
у регистратора ничего менять не нужно). Медиа никуда не уходили: они в Bunny. Приложение пересобирать не нужно.
Проверено 31.10.2026 на поддельных API: секреты байт в байт, ноль новых зон, одна A-запись с новым IP, база 110/176.
