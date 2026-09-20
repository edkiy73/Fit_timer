# Fit Timer: Web, Android и iOS

Источник истины для разработчиков и ИИ, которые продолжают мобильную сборку.
Проект использует одну HTML/CSS/JS-кодовую базу и Capacitor 8. Старый TWA
сохранён только для истории в `legacy/android-twa/`.

## Архитектура

```text
index.html + mobile.js + app.config.js
                 │ npm run build
                 ▼
              dist/
            ┌────┴────┐
         Android     iOS
            └────┬────┘
                 │ HTTPS/CORS
                 ▼
     fittimer99.vercel.app/api/*
```

- В Web `app.config.js` оставляет `apiBase` пустым: запросы идут на `/api`.
- Для мобильной сборки `scripts/build-web.mjs` создаёт абсолютный адрес API.
  Иначе `/api` указывал бы на внутренний `https://localhost` Capacitor.
- `publicAppUrl` используется для ссылок на программы. Нельзя отправлять людям
  внутренние ссылки `capacitor://localhost` или `https://localhost`.
- Сервер уже отвечает CORS-заголовками.
- Интерфейс и локальные данные работают без сети. Фото прогресса и аватары
  остаются только на устройстве и намеренно не синхронизируются.

## Главные файлы

| Файл | Назначение |
|---|---|
| `capacitor.config.json` | App ID, имя, `webDir`, splash и плагины |
| `assets/icon.svg` | Редактируемый мастер новой иконки; плоский знак таймера без текста и персонажей |
| `assets/icon.png` | Растровый мастер 1024×1024 для генератора Capacitor Assets |
| `app.config.js` | Публичные runtime-настройки Web; без секретов |
| `mobile.js` | Мост уведомлений, haptics, TTS, распознавания речи и микрофона |
| `android/.../FitAudioPlugin.java` | Android TTS, SpeechRecognizer и runtime-разрешение микрофона |
| `scripts/build-web.mjs` | Собирает локальный frontend в `dist/` |
| `scripts/check-mobile.mjs` | Проверяет структуру обеих платформ |
| `android/` | Текущий проект Android Studio, API 36 |
| `ios/` | Текущий проект Xcode, iOS 15+ |
| `.github/workflows/android.yml` | Проверка PR и подписанные update-совместимые AAB/APK на каждом push |
| `.github/workflows/ios.yml` | Проверочная сборка iOS Simulator |
| `legacy/android-twa/` | Архив прежней TWA, не редактировать |

## Локальная подготовка

Нужен Node.js 22. Для Android нужны Android Studio/JDK 21, для iOS — Mac с
актуальным Xcode.

```bash
npm ci
npm run mobile:sync
npm run check:mobile
```

`mobile:sync` собирает `dist/`, копирует frontend, обновляет нативные плагины и
генерирует все размеры иконок/splash из `assets/icon.png`. Цвет фона иконки и
splash должен оставаться одинаковым (`#0C0916`), чтобы холодный запуск выглядел
как продолжение иконки. Если меняется знак, сначала править `assets/icon.svg`,
затем экспортировать из него `assets/icon.png`, `icon-512.png`,
`icon-512-maskable.png` и `icon-192.png`. Производные нативные картинки намеренно
не хранятся в Git.
Запускать после каждого изменения `index.html`, `mobile.js`, иконок или Capacitor.

Production-адреса по умолчанию:

```text
FIT_TIMER_API_URL=https://fittimer99.vercel.app
FIT_TIMER_PUBLIC_URL=https://fittimer99.vercel.app
```

При появлении собственного домена:

```bash
FIT_TIMER_API_URL=https://app.example.com \
FIT_TIMER_PUBLIC_URL=https://app.example.com \
npm run mobile:sync
```

Эти значения публичны. Никогда не помещать сюда токены Vercel, Resend, ключ
администратора, service-role или ключ подписи.

## Android

```bash
npm run mobile:android
```

Debug APK:

```bash
cd android
./gradlew assembleDebug
```

Обычный push в любую ветку выдаёт release `.aab` и `.apk`, подписанные постоянным
upload key. `versionCode` берётся из растущего `github.run_number`, поэтому APK
можно ставить поверх предыдущей сборки. Ручной запуск позволяет задать собственные
`version_code` и `version_name`. Pull request без push собирает только проверочный
debug APK с явным именем `not-for-update`.

Android устанавливает обновление только при одинаковых applicationId и подписи и
при не меньшем versionCode. Если на телефоне уже стоит старый debug APK или APK,
подписанный другим ключом, переход на постоянный ключ требует одного удаления.
После установки первого release APK все следующие обновляются поверх него.

Один раз нужны GitHub Actions Secrets:

| Secret | Значение |
|---|---|
| `KEYSTORE_BASE64` | Android upload key в base64 |
| `KEYSTORE_PASSWORD` | Пароль хранилища |
| `KEY_ALIAS` | Alias ключа |
| `KEY_PASSWORD` | Пароль ключа |

Если берётся старый TWA keystore, сначала проверить наличие файла и паролей. Не
генерировать новый ключ поверх старого и не коммитить ключи.

## iOS

Только на Mac:

```bash
npm run mobile:ios
```

В Xcode:

1. Target `App` → **Signing & Capabilities** → выбрать Apple Developer Team.
2. Проверить Bundle Identifier `ru.fittimer.app`.
3. Задать `Version`, увеличить `Build`.
4. Проверить реальный iPhone: уведомления, сворачивание таймера, вход и sync.
5. **Product → Archive → Distribute App → App Store Connect**.

GitHub собирает только Simulator без подписи. App Store-архив без Apple Developer
Team, distribution certificate и provisioning profile создать невозможно.

## Что уже сделано нативно

- Frontend находится внутри APK/IPA, это больше не удалённый сайт в TWA.
- Android `compileSdk/targetSdk 36`, iOS deployment target 15.
- Иконки и splash для обеих платформ.
- Нативная тактильная отдача.
- Вибрация только на основных действиях тренировки: старт, пауза/продолжение,
  готово, пропуск, шаг назад и завершение. В APK старый глобальный `pointerdown`
  гасится в `mobile.js`, а отдача ставится на реальные `click`: так скролл по
  нажимаемому элементу не вибрирует. Не включать нативную вибрацию в `haptic()`.
- Android использует системные `TextToSpeech` и `SpeechRecognizer` через
  `FitAudioPlugin`, потому что браузерные API в WebView могут отсутствовать.
- При сворачивании приложение освобождает распознавание речи, TTS, AudioContext,
  media loop гарнитуры и wake lock. Секундные перерисовки в фоне пропускаются;
  таймеры догоняют время по абсолютным дедлайнам после возврата.
- Управление без рук — только голосовые команды и кнопка гарнитуры. Непрерывный
  анализ микрофона удалён из интерфейса, кода, тестов и миграции настроек.
- Уведомление «Отдых закончен» при свёрнутом приложении.
- Добавлены системные описания доступа к микрофону и распознаванию речи.
- Таймер считается по абсолютному времени и после сворачивания догоняет часы.
- Портретная ориентация тренировки.
- Web/PWA продолжает публиковаться прежним workflow.

## Что требует владельца перед сторами

1. Apple Developer Program и Google Play Console.
2. Подтвердить окончательный ID `ru.fittimer.app`: после релиза его не меняют.
3. Желательно выбрать собственный домен и задать repository variables
   `FIT_TIMER_API_URL` и `FIT_TIMER_PUBLIC_URL`.
4. Опубликовать Privacy Policy, Support URL и страницу удаления аккаунта/данных.
5. Подготовить название, описание, категорию, возрастной рейтинг, скриншоты и
   контакт поддержки.
6. Заполнить App Privacy/Data Safety по факту: email, профиль, тренировки/замеры,
   серверная диагностика; фотографии остаются локальными.
7. Для платных цифровых функций подключить StoreKit и Google Play Billing. Не
   добавлять Stripe-кнопку в iOS без отдельной проверки правил.
8. Universal/App Links требуют собственного домена и association-файлов. Пока
   публичные ссылки открываются в браузере, импорт продолжает работать.

## Проверка релиза

```bash
npm ci
npm run mobile:sync
npm run check:mobile
node --check mobile.js
node --check scripts/build-web.mjs
```

На Android и iPhone вручную проверить: холодный запуск без сети; email-вход; sync;
создание/открытие ссылки; удаление аккаунта; паузу и сворачивание таймера;
уведомление конца отдыха; фото; клавиатуру, safe areas и системную тему.

## Правила для следующих ИИ

- Не возвращать Android к TWA и не задавать `server.url`: frontend локальный.
- Не редактировать `dist/`, `android/.../assets/public` и `ios/App/App/public`:
  они генерируются командой `npm run mobile:sync`.
- Не менять App ID, Bundle ID, signing или versioning без решения владельца.
- После изменения frontend запускать `npm run mobile:sync` и проверки.
- Не синхронизировать фото/аватары без отдельного продуктового решения.
- Не класть секреты в JavaScript, Capacitor config или Git.
- Не возвращать старую иконку с человеком: текущий знак — кольцо таймера с
  диагональным акцентом, мастер лежит в `assets/icon.svg`.
- `legacy/android-twa/` — справочная копия; текущая платформа — `android/`.


## Offline voice commands on Android

The Android Capacitor shell uses Vosk for continuous hands-free commands instead of Android SpeechRecognizer. The small Russian model (`vosk-model-small-ru-0.22`, about 45 MB) is downloaded from the official Vosk model host on first use and stored in app-private storage. After that, recognition is fully on-device and needs no network.

The recognizer uses a narrow FitTimer command grammar and keeps one continuous microphone capture session, avoiding repeated Android SpeechRecognizer start/stop tones. Browser/PWA builds keep the Web Speech fallback.


The voice model is explicitly downloaded by the user from the hands-free settings. The UI exposes Russian (~45 MB) and English (~40 MB), shows download progress, and will not enable native voice mode until the selected model is installed. TTS language/voice and command-recognition language are separate settings.


### Voice model download lifecycle

Android WorkManager owns voice-model downloads. They continue when the user leaves the settings screen or backgrounds the app, wait for connectivity when necessary, and post a completion notification. The web layer only polls WorkManager progress while the app is visible.

Recognition uses the unrestricted small Vosk language model, ignores partial hypotheses, validates only complete command phrases, and applies confidence thresholds (stricter for next/skip than pause/resume) to reduce accidental advances.
