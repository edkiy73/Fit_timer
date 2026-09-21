# Fit Timer — локализация

Статус: **RU / EN локализация завершена** (2026-09-21).

Этот файл теперь не план миграции, а инструкция по поддержке локализации и добавлению следующих языков.

## Что уже сделано

- Выбор языка хранится как preference `system | <locale>`; по умолчанию — **как в системе**.
- `appLocale` — вычисленный эффективный язык интерфейса, TTS и API. Аккаунт хранит эффективный locale для писем/серверных ответов, но не переопределяет системный выбор на новом устройстве.
- Язык меняется без перезапуска.
- Статические строки идут через `data-i18n*`, динамические — через `t(key, vars)`.
- RU и EN словари лежат в `src/i18n/ru.js` и `src/i18n/en.js`; English остаётся fallback.
- Auth/email, ошибки, уведомления и AI-потоки учитывают locale.
- AI canonical/system prompts остаются English, а язык пользовательского результата задаётся отдельно.
- Каталог использует один program id и одну структуру тренировки; локализуется display-контент, а не создаются RU/EN-дубли.
- **Язык TTS всегда следует языку приложения.** Отдельного селекта «Язык озвучки» нет. Пользователь выбирает только конкретный системный голос.
- Язык распознавания голосовых команд остаётся отдельной настройкой, потому что для него используется отдельный offline voice pack.
- `npm run i18n:check`, `npm run check:sources` и `npm run check:ai-index` обязательны после изменений локализации.

## Архитектура

`src/i18n/index.js` содержит `I18N`, `LOCALE_META`, `SUPPORTED_LOCALES`, `t()`, locale/TTS helpers и AI language mapping.

Правила:

1. Новый пользовательский текст — только через `t()` или `data-i18n*`.
2. Набор ключей одинаковый во всех словарях.
3. API error codes остаются language-neutral; переводит клиент.
4. Личный пользовательский текст не переводим скрыто.
5. Catalog content — один ID/структура + локализованные display-поля.
6. UI не переводим AI в runtime.
7. Legal для каждого нового языка — отдельная проверенная версия.
8. TTS locale берётся из `appLocale`; отдельный TTS language selector не возвращать.

## Как добавить новый язык

Пример: Bahasa Indonesia (`id`).

1. Создать `src/i18n/id.js` с теми же ключами, что в `en.js`; константа — `I18N_ID`.
2. Добавить `id: I18N_ID` в `I18N` и `LOCALE_META.id = {tag:'id-ID', ai:'Indonesian'}`.
3. Добавить option в `#appLocaleSelect` в редакторе профиля (`src/html/50-profile-progress.html`), рядом с оформлением. Пункт `system` должен оставаться первым.
4. Добавить locale-файл в `scripts/build-sources.mjs` и расширить `scripts/check-i18n.mjs`, пока эти скрипты перечисляют языки явно.
5. Найти `appLocale ===` и проверить plural/date/number/unit branches: новый язык нельзя автоматически считать English.
6. Расширить server-side locale allowlists, auth/email, public/server-rendered pages и notification payloads.
7. Добавить native Android/iOS strings там, где текст рисует ОС.
8. Для AI добавить язык результата через `LOCALE_META`; canonical prompt/schema не копировать на новый язык.
9. В каталоге добавить перевод display-полей к существующему program id; структуру, progression, exercise ids, рейтинг и статистику не дублировать.
10. Voice-command language добавлять только если реально есть поддерживаемая offline-модель.
11. Проверить share/export/public links, legal, manifest и store metadata.
12. Прогнать:
   ```bash
   npm run build:sources
   npm run i18n:check
   npm run check:sources
   npm run ai:index
   npm run check:ai-index
   ```
13. Smoke-test: onboarding → Сегодня → Тренировки → старт/финиш → Прогресс → Другое → аккаунт → тренер/каталог → AI → share → звук/voice commands.

## Definition of done для нового языка

- язык переключается без перезапуска и восстанавливается после входа;
- нет смеси языков в UI, ошибках и диалогах;
- TTS автоматически использует язык приложения и показывает подходящие голоса;
- recognition language не подменяется без поддерживаемого voice pack;
- AI выдаёт контент на выбранном языке;
- catalog item остаётся одним объектом/ID;
- старые программы, ссылки и аккаунты продолжают работать;
- i18n/source/AI-index checks проходят.
