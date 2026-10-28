# FetUre для Android: сборка, подпись, обновления, ссылки

Устроено так же, как у UnMute и FitTimer (`apps/fittimer/docs/mobile-release.md`). Первая часть — для владельца,
без терминала. Вторая — для ИИ и разработчиков.

## Коротко

- **Сборка** — GitHub Actions → «FetUre — APK для установки» (`.github/workflows/feture-android.yml`). Запускается
  кнопкой **Run workflow** или сама, когда в `main` меняется `apps/feture/android-release.json` (версия и «что нового»).
  На каждый коммит APK не собирается (правило `apps/feture/AGENTS.md` §3).
- **Подпись** — собственный ключ FetUre. Пока ключа нет, получается **тестовая** сборка (debug-ключ, релиз
  `feture-apk-test-…`): ставится, работает, но обновляться сама не умеет и не годится для людей.
- **С ключом** — постоянная ссылка **«FetUre — последний APK»**:
  `https://github.com/edkiy73/Fit_timer/releases/download/feture-latest/FetUre-latest.apk`, архив версий
  `feture-apk-archive`, файл для Google Play (AAB) в артефактах запуска.
- **Обновление** — сайт → Админка → «Обновление приложения» → «Выпустить последнюю сборку». У кого стоит FetUre из
  файла, приложение предложит обновиться, скачает новую версию само и откроет установку.
- **Ссылки** `https://feture-mvp.vercel.app/#/n/...` открываются сразу в приложении — после шага 4 ниже.

## Как был сделан ключ UnMute

UnMute подписан **тем же ключом, что и FitTimer** (решение владельца 30.09.2026, комментарий в
`unmute-android-release.yml`). Секреты `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` добавлены
на GitHub вручную 19.09.2026; сам файл ключа появился раньше и как он создавался, в репозитории не записано
(`mobile-release.md` говорит только «используется существующий upload keystore»).

Для FetUre нужен **свой** ключ: чужой ключ FitTimer/UnMute сюда не подходит и не используется — сборка читает только
секреты с приставкой `FETURE_`.

## Почему ключ создаётся на твоём Mac, а не кнопкой на GitHub

Репозиторий публичный. Ключ, созданный на сервере GitHub, пришлось бы либо выложить (журналы и файлы запусков видны
посторонним), либо он остался бы только в секретах GitHub — а оттуда его нельзя скачать обратно. Без своей копии
потеря ключа означает, что ни один установленный FetUre больше не обновится. Поэтому: ключ создаётся у тебя, копия
хранится у тебя, на GitHub уходит только секрет.

## Шаги владельца (один раз, ~15 минут, без терминала)

### 1. Android Studio

Если её нет: скачай с https://developer.android.com/studio и перетащи в «Программы». Открывать её не нужно — скрипт
возьмёт из неё инструмент для ключа.

### 2. Создать ключ

1. Найди файл `apps/feture/tools/feture-key.applescript`: в папке проекта на Mac или на GitHub (открой файл →
   кнопка «Download raw file»).
2. Открой его двойным щелчком — запустится «Редактор скриптов». Нажми ▶ («Запустить»).
3. «Создать новый ключ» → придумай пароль (от 12 символов) и повтори → выбери, где сохранить
   (`FetUre-release.jks` в «Документах»).
4. Сразу:
   - сохрани пароль в менеджере паролей или «Связке ключей»;
   - сделай **две копии** файла `FetUre-release.jks`: например, iCloud Drive и флешка;
   - никому не отправляй файл и пароль, не клади их в проект и в чаты (в том числе ИИ).

Скрипт сам скопирует ключ в буфер обмена в виде текста — это и есть значение для GitHub. Если скрипт закрылся,
запусти его снова и выбери «У меня уже есть файл ключа».

### 3. Четыре секрета на GitHub

Скрипт может сам открыть страницу; вручную: GitHub → репозиторий **Fit_timer** → **Settings** → **Secrets and
variables** → **Actions** → **New repository secret**. Добавь по одному:

| Name | Secret |
|---|---|
| `FETURE_KEYSTORE_BASE64` | вставь из буфера (⌘V) |
| `FETURE_KEYSTORE_PASSWORD` | пароль ключа |
| `FETURE_KEY_ALIAS` | `feture` |
| `FETURE_KEY_PASSWORD` | тот же пароль |

Потом нажми в скрипте «Очистить буфер».

### 4. Первая подписанная сборка и ссылки в приложении

1. GitHub → **Actions** → «FetUre — APK для установки» → **Run workflow** (поле можно оставить пустым) → зелёная кнопка.
2. Через 10–15 минут открой запуск: в итогах будет ссылка на APK и **отпечаток сертификата** (строка вида
   `AB:CD:…`, 32 пары). Отпечаток публичный, его можно пересылать.
3. Отпечаток нужно один раз вставить в `apps/feture/public/.well-known/assetlinks.json` — проще всего написать ИИ:
   «вставь отпечаток из последнего запуска FetUre APK в assetlinks». Вручную на GitHub: открой файл → карандаш →
   `"sha256_cert_fingerprints": ["AB:CD:…"]` → Commit. После выкладки сайта итоги следующего запуска напишут
   «отпечаток уже стоит».

### 5. Установка на телефон

Открой на телефоне ссылку «FetUre — последний APK» и установи. Если стояла тестовая сборка — один раз удали её
(Android не ставит версию с другой подписью поверх). Дальше FetUre обновляется сам.

### Выпуск новой версии

1. Собрать: **Run workflow** (в поле можно написать «что нового») или поменять `versionName`/`notes` в
   `apps/feture/android-release.json` в `main`.
2. Выпустить: сайт → Админка → «Обновление приложения» → «Выпустить последнюю сборку». Поле «Что нового» увидят
   люди. «Обязательно обновиться» ставь только когда старая версия действительно сломана: ниже этого номера
   приложение не откроется, пока его не обновят.

### Google Play (позже)

Файл для магазина — артефакт `feture-play-<версия>` (AAB) в запуске. В Play Console ключ FetUre станет ключом
загрузки (upload key), а Google подпишет приложение своим ключом: тогда его отпечаток (Play Console → Настройка →
Целостность приложения → Подпись приложения) тоже нужно добавить в `assetlinks.json` — вторым элементом списка.
Версию из магазина отмечают в той же админке, блок «Обновление из магазина».

### Если ключ потерян

Новый ключ сделать можно, но установленные FetUre на него не обновятся: каждому придётся удалить приложение и
поставить заново, а в `assetlinks.json` нужно поменять отпечаток. Поэтому две копии файла и пароль в менеджере паролей.

---

## Для ИИ и разработчиков

Не создавать, не читать и не печатать ключи и пароли: их задаёт владелец. Отпечаток сертификата (SHA-256) публичный.

### Workflow `.github/workflows/feture-android.yml`

- Триггеры: `workflow_dispatch` (input `notes`) и push в `main` по `apps/feture/android-release.json` — как у
  FitTimer (`android.yml`: ручной запуск или маркер `.github/mobile-release.json`), а не на каждый коммит, как у UnMute,
  потому что `AGENTS.md` §3 запрещает авто-сборки на каждый push.
- Версия: `versionCode = 1000 + run_number` (у прежней тестовой сборки было `100 + run_number` в этом же файле, номер
  запуска продолжается, так что код только растёт); `versionName = <versionName из маркера>.<run_number>`.
- Режим выбирает шаг «Ключ подписи FetUre»: есть `FETURE_KEYSTORE_BASE64` → release (остальные три секрета
  обязательны, иначе ошибка), нет → debug. Ключ расшифровывается во временный файл раннера и передаётся Gradle как
  `KEYSTORE_FILE/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD` (имена как у UnMute внутри Gradle).
- Release: `assembleDirectRelease` + `bundlePlayRelease`; проверки — подпись не debug, `ru.feture.app`, точный
  `versionCode`, `REQUEST_INSTALL_PACKAGES` в direct APK, ресурс Firebase `google_app_id`; `FetUre-release.json` с
  `apkUrl` на архивную копию; релизы `feture-apk-archive` (последние 20) и `feture-latest` (draft → upload → publish,
  как у UnMute); AAB — artifact; итоги — отпечаток и есть ли он уже на сайте.
- Debug: `assembleDirectDebug`, debug-ключ из кэша Actions, prerelease `feture-apk-test-<дата>-<номер>`;
  `feture-latest` и архив не трогаются (debug-APK не может обновиться до release-APK).

### Android-проект

- Flavors `direct` / `play` с `BuildConfig.DIRECT_UPDATES`, как у UnMute; `REQUEST_INSTALL_PACKAGES` — только в
  `src/direct/AndroidManifest.xml`.
- `FetUreUpdatePlugin` + `UpdateDownloadWorker` — порт `UnMuteUpdatePlugin`/`UpdateDownloadWorker` (без in-app review):
  загрузка в WorkManager с уведомлением и докачкой (`Range`), проверка пакета, точного `versionCode` и подписи, затем
  системный установщик.
- App Links: в `MainActivity` intent filter `autoVerify` на `https://feture-mvp.vercel.app` с путём `/` и `/index.html`.
  Маршрут FetUre — во фрагменте `#/n/...`, который фильтры не видят, поэтому берётся только корень сайта (не `/api`,
  `/kit`, прототипы). Подтверждение — `public/.well-known/assetlinks.json` (в APK не копируется, `scripts/mobile.mjs`);
  `vercel.json` отдаёт его как `application/json`, rewrites его не задевают (единственный rewrite — `/api/config`).
  Пока `sha256_cert_fingerprints` пуст, проверка домена не проходит и ссылки открываются в браузере — это безопасно.
  При смене домена: `AndroidManifest.xml`, `config/product.json`, `assetlinks.json` — вместе.

### Обновление внутри приложения

- Сервер: `lib/app-update.js`. Публикация хранится под ключом `feture:update:android:v1`, **не** в Core
  `settings:ai`: хранилище AppBase общее с FitTimer/UnMute, и Core-настройки отсюда поменяли бы их каналы обновлений.
  Канал чистит Core `sanitizeAndroidRelease`, последнюю сборку читает Core `admin/release.js`
  (`android_release_latest`, релиз `feture-latest`). Публичная часть — `GET /api/config` (rewrite на
  `/api/admin?public_config=1`) → `{update:{android:{direct,store}}}`. Direct принимает только архивный URL
  `feture-apk-archive/FetUre-<code>.apk`: `feture-latest` заменяется следующей сборкой, и телефон отверг бы файл как
  `version_mismatch`.
- Админка: `src/feture/update-admin.tsx` («Обновление приложения»), как `apps/unmute/src/admin-update.tsx`.
- Клиент: `src/fe/app-update.tsx` на Core `@appbase/core/app-update` (`decideUpdate`, `androidUpdatePlugin` — их же
  использует UnMute). Проверка при запуске и при возврате в приложение; новая версия — шторка kit `Sheet` один раз на
  версию («Позже»); ниже `minimumCode` — экран `Empty` вместо приложения. На сайте и iOS ничего не происходит.
- Ссылки: `src/fe/app-links.ts` (`AppLinks` в `Root`): `App.getLaunchUrl()` и `appUrlOpen` → `routeFromLink` →
  переход на `/n/...`; ссылка пары запоминается до входа (`rememberPairLink`).
