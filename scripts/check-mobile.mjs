import { access, readFile } from 'node:fs/promises';

const required = [
  'dist/index.html',
  'dist/style.css',
  'dist/app.js',
  'dist/app.config.js',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/ru/fittimer/app/FitAudioPlugin.java',
  'android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java',
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
const fitSystem = await readFile('android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java', 'utf8');
if(!fitSystem.includes('openExternal') || !fitSystem.includes('Intent.ACTION_VIEW')) throw new Error('Android external update launcher is missing');

const androidRoot = await readFile('android/build.gradle', 'utf8');
const androidApp = await readFile('android/app/build.gradle', 'utf8');
if(!androidRoot.includes('firebase-crashlytics-gradle')) throw new Error('Android Crashlytics Gradle plugin is missing');
if(!androidApp.includes("com.google.firebase:firebase-crashlytics")) throw new Error('Android Crashlytics SDK is missing');
if(!androidApp.includes("com.google.firebase.crashlytics")) throw new Error('Android Crashlytics plugin is not applied');

console.log('Mobile project structure is valid.');
