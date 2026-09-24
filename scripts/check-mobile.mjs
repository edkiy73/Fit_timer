import { access, readFile } from 'node:fs/promises';

const required = [
  'dist/index.html',
  'dist/style.css',
  'dist/app.js',
  'dist/app.config.js',
  '.well-known/assetlinks.json',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/direct/AndroidManifest.xml',
  'android/app/src/main/java/ru/fittimer/app/FitAudioPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/FitBiometricPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/FitWorkoutPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/WorkoutNotifications.java',
  'android/app/src/main/java/ru/fittimer/app/WorkoutAlarmReceiver.java',
  'ios/App/App/FitBiometricPlugin.swift',
  'ios/App/App/FitWorkoutPlugin.swift',
  'ios/App/App/Info.plist'
];
for(const file of required) await access(file);

const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
if(config.appId !== 'ru.fittimer.app') throw new Error('Unexpected appId');
if(config.webDir !== 'dist') throw new Error('Capacitor webDir must be dist');

const html = await readFile('dist/index.html', 'utf8');
const app = await readFile('dist/app.js', 'utf8');
if(!html.includes('app.js') || !html.includes('style.css')) throw new Error('Application assets are not loaded');
if(!app.includes('FIT_TIMER_CONFIG')) throw new Error('Runtime configuration is not used');
if(!app.includes('applyAndroidUpdateConfig')) throw new Error('Android update policy is missing from client bundle');
const mobileBridge = await readFile('mobile.js', 'utf8');
if(!mobileBridge.includes('getAppInfo') || !mobileBridge.includes('openExternal')) throw new Error('Native update bridge is incomplete');
if(!mobileBridge.includes('installUpdate') || !mobileBridge.includes('resumeUpdateInstall')) throw new Error('Native direct-update bridge is incomplete');
if(!mobileBridge.includes('requestReview')) throw new Error('Native in-app review bridge is missing');
if(!mobileBridge.includes('biometricStatus') || !mobileBridge.includes('authenticateBiometric')) throw new Error('Native biometric bridge is missing');
if(!mobileBridge.includes('updateWorkoutState') || !mobileBridge.includes('clearWorkoutState')) throw new Error('Native workout-state bridge is missing');
if(!mobileBridge.includes('appUrlOpen') || !mobileBridge.includes('getLaunchUrl') || !mobileBridge.includes('consumeProgramLink')) throw new Error('Native App Link bridge is incomplete');
const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
const directManifest = await readFile('android/app/src/direct/AndroidManifest.xml', 'utf8');
if(manifest.includes('REQUEST_INSTALL_PACKAGES')) throw new Error('Play/store base manifest must not request package install permission');
if(!directManifest.includes('REQUEST_INSTALL_PACKAGES')) throw new Error('Direct APK flavor must request package install permission');
if(!manifest.includes('android:autoVerify="true"') || !manifest.includes('android:host="fittimer99.vercel.app"') || !manifest.includes('android:pathPrefix="/p/"')){
  throw new Error('Verified Android App Link intent filter is missing');
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

const fitSystem = await readFile('android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java', 'utf8');
if(!fitSystem.includes('openExternal') || !fitSystem.includes('Intent.ACTION_VIEW')) throw new Error('Android external update launcher is missing');
if(!fitSystem.includes('downloadUpdate') || !fitSystem.includes('verifyUpdateApk') || !fitSystem.includes('signature_mismatch')) throw new Error('Android direct updater validation is missing');
if(!fitSystem.includes('canRequestPackageInstalls') || !fitSystem.includes('ACTION_MANAGE_UNKNOWN_APP_SOURCES')) throw new Error('Android direct updater install permission flow is missing');
if(!fitSystem.includes('ReviewManagerFactory') || !fitSystem.includes('launchReviewFlow')) throw new Error('Android in-app review flow is missing');

const fitBiometricAndroid = await readFile('android/app/src/main/java/ru/fittimer/app/FitBiometricPlugin.java', 'utf8');
if(!fitBiometricAndroid.includes('BiometricPrompt') || !fitBiometricAndroid.includes('BIOMETRIC_WEAK')) throw new Error('Android native biometric flow is missing');
const iosBiometric = await readFile('ios/App/App/FitBiometricPlugin.swift', 'utf8');
if(!iosBiometric.includes('LocalAuthentication') || !iosBiometric.includes('deviceOwnerAuthenticationWithBiometrics')) throw new Error('iOS native biometric flow is missing');

const androidRoot = await readFile('android/build.gradle', 'utf8');
const androidApp = await readFile('android/app/build.gradle', 'utf8');
if(!androidRoot.includes('firebase-crashlytics-gradle')) throw new Error('Android Crashlytics Gradle plugin is missing');
if(!androidApp.includes("com.google.firebase:firebase-crashlytics")) throw new Error('Android Crashlytics SDK is missing');
if(!androidApp.includes("com.google.firebase.crashlytics")) throw new Error('Android Crashlytics plugin is not applied');
if(!androidApp.includes("com.google.android.play:review:2.0.2")) throw new Error('Google Play review dependency is missing');
if(!androidApp.includes('productFlavors') || !androidApp.includes('DIRECT_UPDATES')) throw new Error('Android direct/store flavors are missing');

console.log('Mobile project structure is valid.');
