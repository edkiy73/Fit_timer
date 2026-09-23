import { readFile } from 'node:fs/promises';

const events = await readFile('src/app/90-events.js', 'utf8');
const sync = await readFile('src/app/10-data-sync.js', 'utf8');
const workflow = await readFile('.github/workflows/android.yml', 'utf8');
const gradle = await readFile('android/app/build.gradle', 'utf8');
const mobile = await readFile('mobile.js', 'utf8');
const home = await readFile('src/html/00-shell-home.html', 'utf8');
const account = await readFile('src/app/20-account.js', 'utf8');
const ru = await readFile('src/i18n/ru.js', 'utf8');
const en = await readFile('src/i18n/en.js', 'utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(events.includes('async function refreshAfterForeground()'), 'foreground refresh is missing');
need(events.includes('loadPublicConfig();'), 'foreground must refresh Android update config');
need(events.includes('refreshServerSubscription(true)'), 'foreground must refresh subscription');
need(events.includes('connectAccountSync().catch(()=>{})'), 'foreground must refresh account sync');
need(events.includes("prefs[key] = false;"), 'denied notification permission must roll the toggle back');
need(events.includes("t('notify.permissionDenied')"), 'denied notification permission needs user feedback');

need(sync.includes('timeoutMs:15000'), 'account sync must have a bounded timeout');
need(sync.includes('for(let attempt = 0; attempt < 2; attempt++)'), 'account sync must retry transient failures');
need(sync.includes("window.addEventListener('online'"), 'sync must recover when connectivity returns');

need(gradle.includes('applicationId "ru.fittimer.app"'), 'Android package id must stay stable for updates');
need(gradle.includes('versionCode = Integer.parseInt(System.getenv("VERSION_CODE")'), 'release versionCode must come from CI');
need(workflow.includes('260000000 + GITHUB_RUN_NUMBER'), 'automatic Android versionCode must monotonically increase');
need(workflow.includes('KEYSTORE_BASE64'), 'release signing key must be required');
need(workflow.includes('apksigner') && workflow.includes('verify --verbose --print-certs'), 'release APK signature must be verified');
need(gradle.includes('productFlavors') && gradle.includes('DIRECT_UPDATES'), 'Android must have direct and store-safe build flavors');
need(workflow.includes('bundlePlayRelease') && workflow.includes('assembleDirectRelease'), 'CI must build store AAB separately from direct APK');
need(workflow.includes('outputs/apk/direct/release'), 'latest APK must come from the direct flavor');
need(workflow.includes('FitTimer-release.json'), 'latest APK release must publish machine-readable metadata');
need(workflow.includes('const versionCode = Number(process.env.VERSION_CODE)'), 'release metadata must use the exact CI versionCode');
need(workflow.includes('FitTimer-latest.apk FitTimer-release.json'), 'latest release must upload APK and metadata together');
need(home.indexOf('id="appUpdateBanner"') < home.indexOf('id="todayBox"'), 'soft update banner must sit above Today');
need(ru.includes("'update.availableTitle': \"Доступно обновление\""), 'RU soft update title must stay version-free');
need(en.includes("'update.availableTitle': \"Update available\""), 'EN soft update title must stay version-free');
need(account.includes("t('update.availableTitle');"), 'soft update title must not append versionName');

need(mobile.includes('requestMicrophone'), 'native microphone permission handling is missing');
need(mobile.includes('requestNotifications'), 'native notification permission handling is missing');

console.log('Release UX invariants are valid.');
