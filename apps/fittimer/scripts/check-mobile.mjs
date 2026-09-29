import { access, readFile, readdir } from 'node:fs/promises';

const required = [
  'dist/index.html',
  'dist/style.css',
  'dist/app.config.js',
  'dist/esm/mobile.js',
  'dist/esm/main.js',
  '.well-known/assetlinks.json',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/direct/AndroidManifest.xml',
  'android/app/src/main/java/ru/fittimer/app/FitAudioPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/VoiceModelWorker.java',
  'android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/UpdateDownloadWorker.java',
  'android/app/src/main/java/ru/fittimer/app/FitBiometricPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/FitWorkoutPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/WorkoutNotifications.java',
  'android/app/src/main/java/ru/fittimer/app/WorkoutAlarmReceiver.java',
  'ios/App/App/FitBiometricPlugin.swift',
  'ios/App/App/FitWorkoutPlugin.swift',
  'ios/App/App/WorkoutActivityAttributes.swift',
  'ios/App/App/WorkoutLiveActivity/WorkoutLiveActivity.swift',
  'ios/App/App/WorkoutLiveActivity/Info.plist',
  'ios/App/App/Info.plist'
];
for(const file of required) await access(file);

const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
if(config.appId !== 'ru.fittimer.app') throw new Error('Unexpected appId');
if(config.webDir !== 'dist') throw new Error('Capacitor webDir must be dist');

const html = await readFile('dist/index.html', 'utf8');
// The product runtime (src/app ES modules) is bundled by esbuild into an ES-module chunk under dist/esm.
const esmFiles = [];
async function collectEsm(dir){
  for(const entry of await readdir(dir, {withFileTypes:true})){
    const full = `${dir}/${entry.name}`;
    if(entry.isDirectory()) await collectEsm(full);
    else if(entry.name.endsWith('.js')) esmFiles.push(full);
  }
}
await collectEsm('dist/esm');
const app = (await Promise.all(esmFiles.map(file => readFile(file, 'utf8')))).join('\n');
const runtimeConfig = await readFile('dist/app.config.js', 'utf8');
if(!html.includes('type="module"') || !html.includes('esm/main.js') || html.includes('<script src="mobile.js"></script>') || html.includes('<script src="app.js"></script>') || !html.includes('style.css')) throw new Error('Application assets are not loaded');
const assetVersions = [...html.matchAll(/(?:app\.config\.js|esm\/main\.js|style\.css)\?v=([a-zA-Z0-9._-]+)/g)].map(m => m[1]);
if(assetVersions.length !== 3 || new Set(assetVersions).size !== 1) throw new Error('Application assets must share one build cache-bust id');
if(!runtimeConfig.includes('window.APP_CONFIG') || runtimeConfig.includes('FIT_TIMER_CONFIG')) throw new Error('Generic runtime configuration is missing or still carries the legacy FIT_TIMER_CONFIG alias');
if(!app.includes('applyAndroidUpdateConfig')) throw new Error('Android update policy is missing from client bundle');
// AppBase Core is bundled into the ES-module entries (scripts/build-esm.mjs).
const mobileBridge = await readFile('dist/esm/mobile.js', 'utf8');
const nativeNotificationCore = mobileBridge;
if(!nativeNotificationCore.includes('createTransport') || !nativeNotificationCore.includes('replaceRange')) throw new Error('Generic native notification ESM transport is missing');
const mobileCore = mobileBridge;
if(!mobileCore.includes('createBridge') || !mobileCore.includes('shareBlob') || !mobileCore.includes('onLifecycle')) throw new Error('Generic mobile Core ESM bridge is missing');
const capabilitiesCore = mobileBridge;
if(!capabilitiesCore.includes('createCapabilities')) throw new Error('Generic capability Core ESM module is missing');
const speechCore = mobileBridge;
if(!speechCore.includes('createSpeech') || !speechCore.includes('startRecognition')) throw new Error('Generic speech Core ESM transport is missing');
if(!mobileBridge.includes('getAppInfo') || !mobileBridge.includes('openExternal')) throw new Error('Native update bridge is incomplete');
if(!mobileBridge.includes('installUpdate') || !mobileBridge.includes('resumeUpdateInstall')) throw new Error('Native direct-update bridge is incomplete');
if(!mobileBridge.includes('startMediaButtonControl') || !mobileBridge.includes('stopMediaButtonControl')) throw new Error('Native media-button bridge is incomplete');
if(!mobileBridge.includes('requestReview')) throw new Error('Native in-app review bridge is missing');
if(!mobileBridge.includes('biometricStatus') || !mobileBridge.includes('authenticateBiometric')) throw new Error('Native biometric bridge is missing');
if(!mobileBridge.includes('updateWorkoutState') || !mobileBridge.includes('clearWorkoutState')) throw new Error('Native workout-state bridge is missing');
if(!mobileBridge.includes('consumeWorkoutResume') || !mobileBridge.includes('fitWorkoutResumeRequest')) throw new Error('Native workout notification resume bridge is missing');
if(!mobileCore.includes('appUrlOpen') || !mobileCore.includes('getLaunchUrl') || !mobileBridge.includes('consumeProgramLink')) throw new Error('Native App Link bridge is incomplete');
const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
const directManifest = await readFile('android/app/src/direct/AndroidManifest.xml', 'utf8');
if(manifest.includes('REQUEST_INSTALL_PACKAGES')) throw new Error('Play/store base manifest must not request package install permission');
if(!directManifest.includes('REQUEST_INSTALL_PACKAGES')) throw new Error('Direct APK flavor must request package install permission');
if(!manifest.includes('android:autoVerify="true"') || !manifest.includes('android:host="fittimer99.vercel.app"') || !manifest.includes('android:pathPrefix="/p/"')){
  throw new Error('Verified Android App Link intent filter is missing');
}
if(!manifest.includes('android.permission.FOREGROUND_SERVICE_DATA_SYNC')
  || !manifest.includes('androidx.work.impl.foreground.SystemForegroundService')
  || !manifest.includes('android:foregroundServiceType="dataSync"')){
  throw new Error('Android foreground data-sync service is missing');
}
const assetLinks = JSON.parse(await readFile('.well-known/assetlinks.json', 'utf8'));
const appLinkTarget = assetLinks.find(item => item && item.target && item.target.package_name === 'ru.fittimer.app');
if(!appLinkTarget || !Array.isArray(appLinkTarget.relation) || !appLinkTarget.relation.includes('delegate_permission/common.handle_all_urls')){
  throw new Error('assetlinks.json does not authorize FitTimer');
}
const certs = (appLinkTarget.target && appLinkTarget.target.sha256_cert_fingerprints) || [];
if(!certs.includes('94:97:92:14:41:BD:0E:E1:05:C4:ED:D3:7A:24:A1:E8:88:99:81:E9:FA:B3:54:AD:78:45:90:39:1D:87:C7:DA')){
  throw new Error('assetlinks.json does not contain the release certificate fingerprint');
}

const handsfreeSource = await readFile('src/app/80-platform.js', 'utf8');
if(!handsfreeSource.includes("hasNative('startMediaButtonControl')") || !handsfreeSource.includes("hasNative('stopMediaButtonControl')")){
  throw new Error('Hands-free UI must detect the generic native media-button bridge');
}
if(handsfreeSource.includes("hasNative('startHeadsetControl')") || handsfreeSource.includes("hasNative('stopHeadsetControl')")){
  throw new Error('Hands-free UI still checks obsolete headset capability names');
}

const fitAudioAndroid = await readFile('android/app/src/main/java/ru/fittimer/app/FitAudioPlugin.java', 'utf8');
if(!fitAudioAndroid.includes('MediaSession') || !fitAudioAndroid.includes('startMediaButtonControl') || !fitAudioAndroid.includes('"mediaButtonAction"')){
  throw new Error('Android native headset/media-button control is missing');
}
const voiceModelWorker = await readFile('android/app/src/main/java/ru/fittimer/app/VoiceModelWorker.java', 'utf8');
if(!voiceModelWorker.includes('setForegroundAsync') || !voiceModelWorker.includes('FOREGROUND_SERVICE_TYPE_DATA_SYNC')){
  throw new Error('Voice-model download must stay alive as foreground WorkManager work');
}
const updateWorker = await readFile('android/app/src/main/java/ru/fittimer/app/UpdateDownloadWorker.java', 'utf8');
if(!updateWorker.includes('extends Worker') || !updateWorker.includes('setForegroundAsync')
  || !updateWorker.includes('FOREGROUND_SERVICE_TYPE_DATA_SYNC') || !updateWorker.includes('"Range"')){
  throw new Error('Direct APK update must download in resumable foreground WorkManager work');
}
const fitSystem = await readFile('android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java', 'utf8');
if(!fitSystem.includes('openExternal') || !fitSystem.includes('Intent.ACTION_VIEW')) throw new Error('Android external update launcher is missing');
if(!fitSystem.includes('downloadUpdate') || !fitSystem.includes('verifyUpdateApk') || !fitSystem.includes('signature_mismatch')) throw new Error('Android direct updater validation is missing');
if(!fitSystem.includes('UpdateDownloadWorker.WORK_NAME') || !fitSystem.includes('enqueueUniqueWork')) throw new Error('Android direct updater is not delegated to persistent WorkManager work');
if(!fitSystem.includes('canRequestPackageInstalls') || !fitSystem.includes('ACTION_MANAGE_UNKNOWN_APP_SOURCES')) throw new Error('Android direct updater install permission flow is missing');
if(!fitSystem.includes('ReviewManagerFactory') || !fitSystem.includes('launchReviewFlow')) throw new Error('Android in-app review flow is missing');

const fitBiometricAndroid = await readFile('android/app/src/main/java/ru/fittimer/app/FitBiometricPlugin.java', 'utf8');
if(!fitBiometricAndroid.includes('BiometricPrompt') || !fitBiometricAndroid.includes('BIOMETRIC_WEAK')) throw new Error('Android native biometric flow is missing');
const androidWorkoutNotifications = await readFile('android/app/src/main/java/ru/fittimer/app/WorkoutNotifications.java', 'utf8');
if(androidWorkoutNotifications.includes('AudioAttributes.USAGE_ALARM')) throw new Error('Workout timer notification must not use alarm audio volume');
if(!androidWorkoutNotifications.includes('"workout_timer_v2"') || !androidWorkoutNotifications.includes('AudioAttributes.USAGE_NOTIFICATION')) throw new Error('Workout timer notification channel must use normal notification audio');
if(!androidWorkoutNotifications.includes('notifySafe(context, LIVE_ID, alert.build())')) throw new Error('Workout timer end must replace the ongoing notification instead of posting a duplicate');
if(!androidWorkoutNotifications.includes('fittimer://workout/resume')) throw new Error('Workout notification must deep-link back into the saved workout');
if(!androidWorkoutNotifications.includes('ACTION_INACTIVITY') || !androidWorkoutNotifications.includes('INACTIVITY_ID')) throw new Error('Android active-workout inactivity reminder is missing');
if(!androidWorkoutNotifications.includes('setAndAllowWhileIdle') || !androidWorkoutNotifications.includes('PREF_FIRED')) throw new Error('Android inactivity reminder must survive process death and fire once per workout');
if(!mobileBridge.includes('WORKOUT_INACTIVITY_NOTIFICATION_ID') || !mobileBridge.includes('localNotificationActionPerformed')) throw new Error('iOS active-workout inactivity reminder / tap bridge is missing');
const iosBiometric = await readFile('ios/App/App/FitBiometricPlugin.swift', 'utf8');
if(!iosBiometric.includes('LocalAuthentication') || !iosBiometric.includes('deviceOwnerAuthenticationWithBiometrics')) throw new Error('iOS native biometric flow is missing');
const iosWorkout = await readFile('ios/App/App/FitWorkoutPlugin.swift', 'utf8');
const iosInfo = await readFile('ios/App/App/Info.plist', 'utf8');
const iosWidget = await readFile('ios/App/App/WorkoutLiveActivity/WorkoutLiveActivity.swift', 'utf8');
const iosProject = await readFile('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
if(!iosWorkout.includes('Activity<WorkoutActivityAttributes>') || !iosWorkout.includes('interruptionLevel = .timeSensitive')) throw new Error('iOS workout Live Activity / timer notification bridge is missing');
if(!iosInfo.includes('NSSupportsLiveActivities')) throw new Error('iOS Live Activities capability flag is missing');
if(!iosWidget.includes('ActivityConfiguration') || !iosWidget.includes('DynamicIsland') || !iosWidget.includes('timerInterval:')) throw new Error('iOS workout Live Activity view is incomplete');
if(!iosProject.includes('FitTimerWorkoutLiveActivity.appex') || !iosProject.includes('Embed App Extensions')) throw new Error('iOS Live Activity extension is not embedded');

const androidRoot = await readFile('android/build.gradle', 'utf8');
const androidApp = await readFile('android/app/build.gradle', 'utf8');
if(!androidRoot.includes('firebase-crashlytics-gradle')) throw new Error('Android Crashlytics Gradle plugin is missing');
if(!androidApp.includes("com.google.firebase:firebase-crashlytics")) throw new Error('Android Crashlytics SDK is missing');
if(!androidApp.includes("com.google.firebase.crashlytics")) throw new Error('Android Crashlytics plugin is not applied');
if(!androidApp.includes("com.google.android.play:review:2.0.2")) throw new Error('Google Play review dependency is missing');
if(!androidApp.includes('productFlavors') || !androidApp.includes('DIRECT_UPDATES')) throw new Error('Android direct/store flavors are missing');

console.log('Mobile project structure is valid.');
