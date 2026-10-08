# Fit Timer AI: как устроено и что менять

Этот файл — инструкция для следующего разработчика или ИИ. Реализация уже
работает в коде; старый `ai-generation-plan.md` остаётся списком следующих
улучшений, а не описанием текущего состояния.

## Поток запроса

1. Действия с программами и упражнениями (`program.create`, `program.modify`,
   `exercise.create`, `exercise.modify`, `exercise.replace`) работают по **AI Contract V2**
   (`lib/fit-ai-contract.js`): клиент отправляет `POST /api/ai` с `{kind, contractVersion:2, input}`
   — структурированный input (язык, задача, профиль, доступные снаряды/доп. оборудование,
   программа/упражнение со стабильными ID). Текст prompt'а клиент не присылает.
2. Вместе с input приходят `email`, отдельный `syncToken` устройства и `deviceId`. Ключей Gemini/OpenAI в HTML и APK нет.
3. `/api/ai` через rewrite попадает в `api/admin.js` → Core `ai-endpoint`: токен, Premium, лимиты.
   Action metadata — `lib/fit-ai-actions.js`; для контрактных действий prompt собирает сервер
   (`buildPrompt`), схема ответа — `FitAIContract.outputSchema(kind)`.
4. Core `generate(..., {schema, maxOutputTokens, validate})` вызывает провайдера в режиме Structured Output
   (Gemini `responseJsonSchema`, OpenAI `json_schema strict`, OpenRouter `response_format` + `require_parameters`),
   локально проверяет JSON той же схемой (`packages/core/server/json-schema-lite.js`) и доменными правилами
   контракта (`checkOutput`). Отказ модели → `ai_refused` без резерва; обрезанный/невалидный ответ → резерв.
5. Клиент применяет JSON детерминированно: ID упражнений/этапов выдаёт приложение; правка — «target state + refs»
   к снимку программы, ушедшей в запрос, целиком или никак.
6. Ручной режим «скопировать в чат» использует тот же prompt + схему текстом; вставленный JSON
   разбирается той же функцией.
7. `video.parse`: сервер получает таймкодированные субтитры YouTube (или Gemini video input), извлекает
   только подтверждённые факты и собирает из них тот же Program DTO V2 без второго вызова ИИ.
8. Обезличенная запись запроса и результата лежит в дневном Redis-списке `ai:log:YYYY-MM-DD`
   с TTL не больше 30 дней. Почта в журнал не пишется — только необратимый hash аккаунта.

Типы `kind`: `program.create`, `program.modify`, `video.parse`,
`exercise.create`, `exercise.modify`, `exercise.replace`, `image.cover`,
`image.exercise`. Программы/видео расходуют `heavy`, упражнения — `light`,
картинки — `image`.

## Настройка

Открыть `/admin.html` → «ИИ и тариф». Там без релиза APK меняются:

- включение AI;
- основной и резервный провайдер/модель отдельно для текста и изображений;
- месячные Premium-лимиты;
- срок диагностического хранения (сервер ограничивает максимумом 30 дней);
- отображаемые цены по валютам;
- будущие product ID Google Play и App Store.

Кнопки проверки выполняют настоящий тест через сервер; для текста дополнительно проверяется structured-ответ (JSON по схеме) — маршрут без него помечается «Нет JSON». Админка видит только факт
наличия ключа, но не его значение. Секреты задаются в окружении Vercel:

```text
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

Достаточно одного ключа, если основной и резервный маршруты используют одного
провайдера. Для настоящего failover нужны оба. `ADMIN_KEY` и Redis также должны
быть настроены как раньше.

## Важные ограничения текущей версии

- Оплата пока не списывает деньги через Google Play/App Store. Админка уже
  хранит цены и product ID, но entitlement нужно связать с проверенным store
  receipt/webhook до публичного платного запуска.
- Кэш картинок и общий каталог канонических упражнений ещё не добавлены.
- Материал проверяет создавший его пользователь. Если тренер отправляет программу
  в каталог, действует существующая очередь и ручной approve администратора.

## Проверка локально

`AI_TEST_MODE=1` возвращает детерминированный ответ, но всё равно требует
Premium-аккаунт и dummy-ключ провайдера. Этот флаг нельзя ставить в production.

После изменений выполнить:

```bash
python3 check.py
npm run mobile:sync
npm run check:mobile
node --check api/admin.js
node --check lib/ai-endpoint.js
node --check lib/ai.js
```

Нельзя переносить ключи провайдеров в `app.config.js`, `index.html`, Capacitor
config или админский ответ. Провайдер и модель меняются настройкой, а не правкой
клиентского приложения.
