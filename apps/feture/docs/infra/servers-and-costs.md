# Серверы, регион и расходы

Проверено 29.10.2026.

## 1. Что сейчас

| Часть | Где | Комментарий |
|---|---|---|
| Сайт и API | Vercel, проект `feture-mvp`, функции в Токио (`hnd1`) | Тариф команды проверить в Vercel → Settings → Billing |
| База | Supabase, **общий** проект FitT (Токио), схема `feture` | Общий с FitTimer и UnMute |
| Медиа | Supabase Storage (временно, решение 27.10.2026) | Код для Cloudflare R2 в ЕС уже готов (`server/media/r2.mjs`) |
| Аккаунты и коды входа | Core store в Supabase (`APPBASE_STORE=supabase`) | Upstash/Redis для FetUre не используется |
| Фоновые задачи, push | pg_cron → API (адрес в Vault); FCM и web push | APNs — с аккаунтом Apple |

## 2. Рекомендация

1. **Перенести всё во Франкфурт до запуска**, пока данных почти нет. Из Москвы ~49 мс против ~270 мс до Токио, а
   Vercel `fra1` **дешевле** Токио.
2. **Отдельный проект Supabase для FetUre** (eu-central-1): взрослые данные не рядом с FitTimer. Регион у проекта не
   меняется — только новый проект и перенос.
3. **Медиа — на Bunny.net** (хранилище во Франкфурте + CDN). Bunny **письменно разрешает** легальный взрослый контент.
   Это компания из ЕС (Словения) и не Cloudflare, а Cloudflare в РФ с 06.2025 замедляют.
   Запасной вариант — R2: код готов, взрослое не запрещено, но в РФ работает нестабильно.
4. **Через Vercel откровенные медиа не пропускать никогда.** Правила Vercel запрещают «obscene, graphic» контент и
   хостинг медиа для горячих ссылок. Vercel отдаёт только сайт и JSON. На случай претензии держать план переезда
   API (например, Hetzner или Fly.io в ЕС; проверить).
5. **Vercel Hobby — пока нет платежей и рекламы.** Hobby разрешён только для некоммерческого использования. С первым
   платежом — Pro, $20/мес.

## 3. Цены (за месяц)

| Сервис | Цена |
|---|---|
| Vercel Pro | $20 за разработчика; включено $20 ресурсов, 1 ТБ трафика, 10 млн CDN-запросов |
| Supabase Pro | $25, включает $10 на один Micro. Второй проект в той же организации — +$10 (Micro) |
| Supabase сверх включённого | БД $0,125/ГБ (8 ГБ включено), файлы $0,0213/ГБ (100 ГБ), трафик $0,09/ГБ (250 ГБ) |
| Supabase PITR (восстановление на любую секунду, 7 дней) | $100 |
| Supabase ежедневные бэкапы | Входят в Pro, хранятся 7 дней |
| Bunny Storage | $0,01/ГБ (один регион) |
| Bunny CDN | Европа $0,01/ГБ, Азия $0,03/ГБ, минимум $1 |
| Bunny Optimizer (ресайз фото) | $9,5 за сайт, без лимита |
| Cloudflare R2 (запасной) | $0,015/ГБ, исходящий трафик бесплатно, 10 ГБ бесплатно |
| Sentry (ошибки) | Бесплатно до 5 тыс. ошибок; Team $26 |
| UptimeRobot (доступность) | Бесплатно, 50 проверок каждые 5 мин |

## 4. Расходы по числу пользователей (оценка)

| | 0 (сейчас) | 1 000 | 10 000 |
|---|---|---|---|
| Vercel | 0 (Hobby) | $20 (Pro, если есть платежи) | ~$20–40 |
| Supabase | $10–25 | $25 | ~$40–75 (Small/Medium) |
| Медиа Bunny (хранение + трафик + ресайз) | ~$11 | ~$15 | ~$50–80 |
| Автопроверка фото (Sightengine) | 0 | $29 | $99 |
| Почта (Resend) | 0 | 0 | $20 |
| Мониторинг | 0 | 0 | $0–26 |
| Домен | ~$1 | ~$1 | ~$1 |
| **Итого** | **~$25–40** | **~$90–110** | **~$230–340** |

Без учёта: модераторов, юриста, представителя в ЕС (~€35–70/мес в пересчёте), PITR ($100).

## 5. Что делает владелец

1. Supabase → New project → регион **Central EU (Frankfurt)**, имя `feture`. Пароль базы хранить в менеджере паролей.
2. Bunny.net → регистрация. Оплата картой не из РФ. Создать Storage Zone (Frankfurt) и Pull Zone. Ключи вставить в
   Vercel → Environment Variables (агент скажет имена).
3. Когда начнутся платежи — Vercel → Upgrade to Pro.
4. Позже — включить PITR в Supabase → Add-ons.

## 6. Что делает агент

- Переносит схему и данные, ставит `fra1`, обновляет адрес задач в Vault, проверяет вход, ленту, медиа, push. Схема в
  FitT удаляется после подтверждения.
- Пишет адаптер Bunny по образцу R2 (подписанные ссылки, только одобренное); подключает Sentry и UptimeRobot.

## 7. Риски

Правила Vercel и Supabase сформулированы широко и толкуются на их усмотрение — медиа у них не держим (к тому же
Supabase Storage дорогой: трафик $0,09/ГБ, ресайз $5 за 1000). «Белые списки» мобильного интернета в РФ (Москва, с
03.2026) делают сайт 18+ недоступным без VPN при любом хостинге. Работает ли Bunny из РФ — проверить тестом.

## Источники

- 
- https://vercel.com/docs/limits/fair-use-guidelines ; https://vercel.com/pricing ; https://vercel.com/docs/pricing/regional-pricing/fra1
- https://vercel.com/legal/acceptable-use-policy (ред. 21.04.2026)
- https://supabase.com/pricing ; https://supabase.com/aup ; https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z
- https://bunny.net/pricing/ ; https://bunny.net/acceptable-use/ ; https://bunny.net/optimizer/
- https://developers.cloudflare.com/r2/pricing/ ; https://therecord.media/cloudflare-russia-restricting-access-crackdown
- https://wondernetwork.com/pings/Moscow/Frankfurt ; https://wondernetwork.com/pings/Moscow/Tokyo
- https://sentry.io/pricing/ ; https://uptimerobot.com/pricing/
