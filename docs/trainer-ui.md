# Trainer UX and data flow

Этот файл — актуальная краткая спецификация trainer mode. Исторические макеты и старые схемы
удалены, чтобы не конфликтовать с текущим приложением.

## Базовая модель

- Есть один обычный email-account.
- Trainer mode принадлежит этому же аккаунту; отдельного trainer login нет.
- Тренера нельзя создать без подтверждённого аккаунта.
- Account handle используется и как публичный trainer handle.
- Trainer sync не зависит от Premium.
- В русской версии люди тренера называются **«подопечные»**, не «клиенты».

## Где живёт trainer UI

Основной frontend: `src/app/50-trainer-catalog.js` + соответствующая разметка в
`src/html/50-profile-progress.html`.

Backend:
- `api/trainer/[handle].js` — trainer page и account-authorized trainer updates;
- `api/share.js` — shared program links;
- `api/p/[id].js` — получение/claim shared program и trainer report access;
- `api/report.js` — отчёты по shared program;
- `api/catalog.js` — submission в каталог;
- `api/admin.js` — moderation каталога.

## Включение trainer mode

Trainer mode включается только после нормального входа в account.

При первом включении можно подставить display name/photo из текущего профиля как начальные
значения, но trainer identity затем живёт отдельно от profile identity.

Share endpoint не имеет права создавать trainer record. Если trainer не создан через
account-authorized trainer endpoint, share должен вернуть ошибку.

## Подопечные и shared programs

Связь trainer → подопечный строится вокруг shared program/link.

- Тренер отправляет программу через server link.
- Получатель сохраняет/claim-ит программу под своим account.
- Только после реального claim связь может считаться account relationship.
- Повторная публикация той же trainer program должна обновлять существующую связь там, где
  продукт это поддерживает, а не плодить случайные параллельные identities.
- Отчёты доступны тренеру по секретному link key; новый клиент передаёт этот секрет в
  `X-Fit-Link-Key`, не в URL query.
- Неверный report key не должен открывать отчёты.
- Публичный link id сам по себе не является секретом.

## Публичная trainer page

Публичная trainer page показывает только те поля, которые тренер явно публикует.
Account email, auth tokens, sync tokens и внутренние server keys туда не попадают.

Удаление trainer/account personal data не должно удалять уже опубликованные catalog programs:
каталог хранит опубликованный материал независимо от дальнейшего существования trainer profile.

## Каталог

Trainer может предложить программу в каталог.

Поток:
1. trainer отправляет submission;
2. admin видит submission вместе с доступными изображениями;
3. moderation/translation выполняются в admin;
4. approve публикует catalog entry;
5. trainer видит status в своём разделе.

RU/EN каталог — одна программа/ID и одна механика тренировки, но с локализованным текстом.
Не создавать отдельные RU и EN дубликаты программы.

## Уведомления

Trainer-related remote push относится к account-level notification preferences.
Уведомления не должны создавать отдельное trainer account state.

Подробная стратегия каналов и частот — `docs/notification-strategy.md`.

## Что нельзя ломать

- Не возвращать отдельный trainer login/account.
- Не создавать trainer локально до account registration/login.
- Не делать trainer sync зависимым от Premium.
- Не возвращать термин «клиенты» в пользовательский RU UI.
- Не передавать secret report key в URL нового клиента.
- Не позволять `/api/share` обходить account-authorized создание trainer.
- Не удалять опубликованные catalog programs вместе с personal trainer data.
- Не синхронизировать progress photos автоматически.

## Проверка

Минимум после изменений trainer flow:
- `tests/trainer-page.js`
- `tests/trainer-feedback.js`
- `tests/catalog-flow.js`
- `tests/sync-api.js` для account/trainer boundaries
- `python3 check.py`

Для frontend-изменений дополнительно:
- `npm run ai:index`
- `npm run check:sources`
- `npm run check:ai-index`
