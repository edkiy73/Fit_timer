import { readFile } from 'node:fs/promises';

const events = await readFile('src/app/90-events.js', 'utf8');
const sync = await readFile('src/app/10-data-sync.js', 'utf8');
const workflow = await readFile('.github/workflows/android.yml', 'utf8');
const gradle = await readFile('android/app/build.gradle', 'utf8');
const mobile = await readFile('mobile.js', 'utf8');

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
need(workflow.includes('FitTimer-release.json'), 'latest APK release must publish machine-readable metadata');
need(workflow.includes('const versionCode = Number(process.env.VERSION_CODE)'), 'release metadata must use the exact CI versionCode');
need(workflow.includes('FitTimer-latest.apk FitTimer-release.json'), 'latest release must upload APK and metadata together');

need(mobile.includes('requestMicrophone'), 'native microphone permission handling is missing');
need(mobile.includes('requestNotifications'), 'native notification permission handling is missing');

console.log('Release UX invariants are valid.');
