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
- Во время активной тренировки Android показывает постоянное системное уведомление
  с текущим этапом и системным countdown; завершение таймерного этапа будит
  AlarmManager и даёт короткий системный сигнал.
- На iOS 16.1+ активная тренировка показывается через Live Activity на Lock Screen
  и Dynamic Island; iOS 15 остаётся на time-sensitive локальном уведомлении.
- Окончание любого таймерного этапа (отдых или упражнение на время) планируется
  нативно, поэтому не зависит от того, исполняется ли JavaScript в фоне.
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

The recognizer keeps one continuous microphone capture session, avoiding repeated Android SpeechRecognizer start/stop tones. Browser web builds keep the Web Speech fallback.

A command must be said on its own. The command grammar turns any other speech into `[unk]`, so a TV or a conversation containing «дальше» arrives as «[unk] [unk] дальше»; such a final result is rejected (`source: in_speech` in the recognition test) when it has two or more foreign words or more than 0.4 s of them, and so is a command that starts less than 0.6 s after such speech. A single short `[unk]` (breath, knock) before a command still passes. Logic and JUnit tests: `VoiceCommands.hasForeignSpeech` / `tooSoonAfterSpeech`, `VoiceCommandsTest`.

The app must not hear itself. While native TTS speaks (and 0.4 s after `onDone`), `FitSpeechCapture.holdFor` keeps reading the microphone but feeds nothing to Vosk, then calls `recognizer.reset()` so a half-heard app phrase is dropped. Without this, TTS «Пауза» came back as a pause command ~0.5 s later (after a quick resume) and «Осталось 15 секунд» skipped the step. `speechResult` also carries `utteranceMs` (how long ago the phrase started); `mobile.js` compares the phrase start, not the arrival time, with `lastAppSoundT`, which covers WebAudio beeps/gongs.

Microphone capture is `FitSpeechCapture` (not `org.vosk.android.SpeechService`): same `VOICE_RECOGNITION` source, 16 kHz mono, 0.2 s buffers and the same `RecognitionListener` callbacks, plus software automatic gain (`VoiceAutoGain`). Android disables AGC on `VOICE_RECOGNITION` by design, so normal speech from 1.5–2 m (phone on the floor next to the mat) reached the small Vosk model at roughly −50…−60 dBFS, and people had to shout or lean into the phone; Google's recognizer applied its own gain, Vosk does not. The AGC starts at its maximum, attacks fast on loud speech, recovers ~10 dB/s in pauses (a dropped dumbbell does not deafen the next command), caps gain at +24 dB and never lifts the background noise floor above ≈ −38 dBFS. JVM unit test: `android/app/src/test/java/ru/fittimer/app/VoiceAutoGainTest.java` (`./gradlew testDirectDebugUnitTest`). `FitSpeechCapture` also closes the native `Recognizer` on stop — `SpeechService` never did, so every restart leaked one.


The voice model is explicitly downloaded by the user from the hands-free settings. The UI exposes Russian (~45 MB) and English (~40 MB), shows download progress, and will not enable native voice mode until the selected model is installed. TTS language/voice and command-recognition language are separate settings.


### Voice model download lifecycle

Android WorkManager owns voice-model downloads. They continue when the user leaves the settings screen or backgrounds the app, wait for connectivity when necessary, and post a completion notification. The web layer only polls WorkManager progress while the app is visible.

Recognition uses a command grammar (`VoiceCommands.grammarJson`: the command phrases plus `[unk]`), so the small model decides between a dozen commands and "not a command" instead of guessing an arbitrary Russian word — with free speech, a correctly heard «готово» was often written as a similar word and people had to repeat it. The first grammar version (58d28f4) fired commands on raw partial hypotheses, and under a grammar a partial jumps to the nearest command at the start of any word («про…» → «продолжить»), which is why it was removed in 295d567. Now, in grammar mode, partials are ignored entirely and only the final result counts (after ~0.28 s of trailing silence), with `[unk]` tokens stripped and confidence thresholds (stricter for next/skip than pause/resume). If a model rejects the grammar, the recognizer falls back to free speech with the old partial debounce. Parsing is pure Java (`VoiceCommands`, JVM test `VoiceCommandsTest`). Every heard phrase is also emitted as `speechHeard` (text → command / not a command / low confidence); Settings → hands-free → «Проверить, как слышит» shows it live, so a device test tells whether the microphone does not hear, or hears but decodes another word.


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

The installed Android app checks the public `/api/config` response after startup and chooses an update channel from its compiled distribution flavor.

There are two independent channels:

- **Direct APK** — `direct` flavor. The Home banner downloads the APK inside Fit Timer, shows progress, verifies package id, exact `versionCode` and signing certificate, then opens the Android system installer for the final confirmation. The permanent GitHub `latest-apk` release is this flavor.
- **Store** — `play` flavor. It never downloads an APK and does not request `REQUEST_INSTALL_PACKAGES`; the update action opens the configured Google Play / RuStore page.

The backend stores independent `update.android.direct` and `update.android.store` release state. Flat `update.android.latestCode/url/...` fields remain aliases of **direct** for pre-channel APKs already installed in the wild.

Admin → **Обновление Android**:
- **Опубликовать Direct APK** publishes the latest signed direct APK immediately;
- **Опубликовать для магазина** is separate and should be pressed only after the same build is actually available in Google Play / RuStore;
- each channel has its own `minimumCode` and optional RU/EN override copy;
- normal publishing never raises either mandatory threshold.

CI builds:
- `assembleDirectRelease` → direct APK with installer permission;
- `bundlePlayRelease` and `assemblePlayRelease` → store-safe artifacts without installer permission.

The GitHub `latest-apk` release publishes `FitTimer-release.json` next to the direct APK, so the admin uses the exact signed `versionCode` / `versionName`.

Direct download state lives in `FitSystemPlugin` (`getUpdateState`, `cancelUpdate`), not only in the WebView. The Home banner is rebuilt whenever `/api/config` is reloaded (e.g. after returning to the app), and it re-attaches to a running download instead of starting over. While downloading, the banner shows the percentage once and its action is «Отменить». After a network error it offers «Повторить», which resumes the partial file with an HTTP `Range` request (same URL only; a 416 or 200 restarts from zero). Tapping during a download never starts a second one: the plugin answers `in_progress`.

Every `main` build also uploads an immutable copy `FitTimer-<versionCode>.apk` to the `apk-archive` release (last 20 kept), and `FitTimer-release.json` points `apkUrl` there. The admin publishes that exact URL. Do not point direct updates at `latest-apk/FitTimer-latest.apk`: the next push to `main` replaces that file, and the phone then rejects it as `version_mismatch` ("Не удалось скачать или проверить обновление").

Behavior:
- current build >= channel latest: nothing is shown;
- current build < channel latest: a quiet update banner appears on Home;
- current build < channel minimum: the app shows a non-dismissible update gate;
- version comparison uses native Capacitor App `build`;
- direct updates stay inside Fit Timer until the Android confirmation screen;
- store updates open the configured store.

Do not add `REQUEST_INSTALL_PACKAGES` to the base manifest or the `play` flavor. Do not raise `minimumCode` as part of a normal release.
