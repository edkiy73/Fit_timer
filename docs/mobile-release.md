# Fit Timer: Web, Android и iOS

Источник истины для разработчиков и ИИ, которые продолжают мобильную сборку.
Проект использует одну HTML/CSS/JS-кодовую базу и Capacitor 8. 
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
затем экспортировать из него `assets/icon.png`. Производные нативные картинки намеренно
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

Используется существующий Android release/upload keystore. Сначала проверить наличие
файла и паролей; не генерировать новый ключ поверх старого и не коммитить ключи.

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
- Опциональная нативная биометрия защищает уже авторизованное приложение: проверка на холодном запуске и после 10 минут в фоне; активная тренировка не прерывается, а после выхода с неё отложенная проверка выполняется. Email + OTP остаётся запасным способом разблокировки и единственным способом авторизации аккаунта.
- Android использует системный `BiometricPrompt` с `BIOMETRIC_WEAK`, iOS — `LocalAuthentication`: это мягкая защита приватности, а не усиленная банковская аутентификация.
- Web-версия публикуется как обычный сайт без PWA/service worker; Android/iOS используют локальный frontend через Capacitor.

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
8. Android App Links для программ уже настроены на текущем production-домене:
   новые ссылки имеют вид `https://fittimer99.vercel.app/p/<id>`, а
   `/.well-known/assetlinks.json` связывает домен с release-подписью
   `ru.fittimer.app`. При смене домена или release-сертификата нужно одновременно
   обновить Android intent filter и association-файл.

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


## Offline voice commands on Android

The Android Capacitor shell uses Vosk for continuous hands-free commands instead of Android SpeechRecognizer. The small Russian model (`vosk-model-small-ru-0.22`, about 45 MB) is downloaded from the official Vosk model host on first use and stored in app-private storage. After that, recognition is fully on-device and needs no network.

The recognizer uses a narrow FitTimer command grammar and keeps one continuous microphone capture session, avoiding repeated Android SpeechRecognizer start/stop tones. Browser web builds keep the Web Speech fallback.


The voice model is explicitly downloaded by the user from the hands-free settings. The UI exposes Russian (~45 MB) and English (~40 MB), shows download progress, and will not enable native voice mode until the selected model is installed. TTS language/voice and command-recognition language are separate settings.


### Voice model download lifecycle

Android WorkManager owns voice-model downloads. They continue when the user leaves the settings screen or backgrounds the app, wait for connectivity when necessary, and post a completion notification. The web layer only polls WorkManager progress while the app is visible.

Recognition uses the unrestricted small Vosk language model, ignores partial hypotheses, validates only complete command phrases, and applies confidence thresholds (stricter for next/skip than pause/resume) to reduce accidental advances.


## In-app review

FitTimer просит оценить приложение только после успешно завершённых тренировок:

- первая попытка — после 5-й тренировки;
- повторные контрольные точки — 20 и 50 тренировок;
- между повторными попытками должно пройти минимум 90 дней;
- максимум три попытки за всё время на устройстве;
- запрос не показывается после незавершённой/отключённой программы и не используется в Web;
- Android использует Google Play In-App Review API через `FitSystemPlugin`;
- Google Play сам решает, показать ли системное окно. Приложение не спрашивает
  предварительно «нравится ли FitTimer» и не пытается определить, поставлена ли оценка.

Состояние попыток хранится локально в `fitReviewPromptV1`. Не превращать это в
частый кастомный попап: системный review flow намеренно контролируется магазином.

## Android App Links

Новые ссылки на программы публикуются как:

```text
https://fittimer99.vercel.app/p/<id>
```

- Android `MainActivity` принимает только HTTPS-ссылки этого домена с путём
  `/p/` и использует `android:autoVerify="true"`.
- Домен подтверждает приложение через `/.well-known/assetlinks.json`.
- `mobile.js` обрабатывает и холодный запуск через `App.getLaunchUrl()`, и
  открытие ссылки в уже запущенном приложении через `appUrlOpen`.
- Если приложение не установлено, Vercel переписывает `/p/<id>` в существующий
  web-import `/?p=<id>`; браузерный сценарий поэтому остаётся рабочим.
- Старые ссылки `?p=<id>` продолжают поддерживаться приложением для обратной
  совместимости, но новые ссылки создаются только в формате `/p/<id>`.
- Release SHA-256 в `assetlinks.json` должен совпадать с реальным сертификатом
  подписи. Не менять signing key без отдельной миграции App Links и обновлений.

## In-app Android updates

The installed Android app checks the existing public `/api/config` response after startup.

Admin → **Обновление Android** is intentionally product-level rather than a raw version form:

- the latest signed APK is read automatically from the GitHub `latest-apk` release;
- the primary action is **Опубликовать обновление**;
- the live-state card says whether an update is currently published, where the update button leads, and whether a mandatory threshold is enabled;
- `versionCode`, `minimumCode`, destination URL and optional RU/EN override copy live under **Дополнительные настройки**;
- publishing a normal release updates `latestCode`, `latestName` and the managed APK URL but never raises `minimumCode`;
- old auto-filled RU/EN release copy is normalized back to the app's built-in copy when the latest release is published.

The GitHub `latest-apk` release publishes `FitTimer-release.json` next to the APK so the admin always uses the exact signed `versionCode` / `versionName`.

Behavior:
- current build >= latest: nothing is shown;
- current build < latest: a quiet update banner appears on Home;
- current build < minimum: the app shows a non-dismissible update gate;
- version comparison uses the native Capacitor App `build` value, not the handwritten UI build label;
- update links are opened by Android `ACTION_VIEW`, outside the WebView.

Do not raise `minimumCode` as part of a normal release. It is only for builds that are no longer compatible with the backend or have a serious release-blocking defect.
