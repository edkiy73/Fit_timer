const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

const config=JSON.parse(read('capacitor.config.json'));
assert.equal(config.appId,'app.unmute.english');
assert.equal(config.appName,'UnMute');
assert.equal(config.webDir,'dist');

const activity=read('android/app/src/main/java/app/unmute/english/MainActivity.java');
const plugin=read('android/app/src/main/java/app/unmute/english/UnMuteAudioPlugin.java');
const manifest=read('android/app/src/main/AndroidManifest.xml');

assert.match(activity,/registerPlugin\(UnMuteAudioPlugin\.class\)/);
assert.match(plugin,/@CapacitorPlugin\(\s*name\s*=\s*"UnMuteAudio"/s);
assert.match(plugin,/SpeechRecognizer\.createSpeechRecognizer/);
assert.match(plugin,/RecognizerIntent\.EXTRA_MAX_RESULTS, 3/);
assert.match(plugin,/new TextToSpeech/);
assert.match(plugin,/notifyListeners\("speechResult"/);
assert.match(plugin,/notifyListeners\("speechError"/);
assert.doesNotMatch(activity,/FitAudio/);
assert.doesNotMatch(plugin,/FitAudio/);
// In-app updates: the direct APK may install updates, the store build may not.
const updater=read('android/app/src/main/java/app/unmute/english/UnMuteUpdatePlugin.java');
const gradle=read('android/app/build.gradle');
const rootGradle=read('android/build.gradle');
const pkg=JSON.parse(read('package.json'));
const directManifest=read('android/app/src/direct/AndroidManifest.xml');
assert.match(activity,/registerPlugin\(UnMuteUpdatePlugin\.class\)/);
assert.match(updater,/@CapacitorPlugin\(\s*name\s*=\s*"UnMuteUpdate"/s);
assert.match(updater,/signature_mismatch/);
assert.match(updater,/version_mismatch/);
assert.match(gradle,/direct\s*\{[^}]*DIRECT_UPDATES", "true"/s);
assert.match(gradle,/play\s*\{[^}]*DIRECT_UPDATES", "false"/s);
assert.match(directManifest,/REQUEST_INSTALL_PACKAGES/);
assert.doesNotMatch(manifest,/REQUEST_INSTALL_PACKAGES/);
assert.match(manifest,/androidx\.core\.content\.FileProvider/);
assert.match(read('android/app/src/main/res/xml/file_paths.xml'),/path="updates\/"/);

assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
assert.match(manifest,/android\.permission\.POST_NOTIFICATIONS/);

// Launcher icon: adaptive icons must use a real foreground layer. A transparent foreground
// makes some launchers (including Samsung One UI) fall back to the generic Android placeholder.
assert.match(manifest,/android:icon="@mipmap\/ic_launcher"/);
assert.match(manifest,/android:roundIcon="@mipmap\/ic_launcher_round"/);
const launcherAdaptive=read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
const launcherRoundAdaptive=read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
const launcherForeground=read('android/app/src/main/res/drawable/ic_launcher_adaptive_foreground.xml');
const launcherColors=read('android/app/src/main/res/values/colors.xml');
assert.match(launcherAdaptive,/@color\/ic_launcher_background/);
assert.match(launcherAdaptive,/@drawable\/ic_launcher_adaptive_foreground/);
assert.match(launcherRoundAdaptive,/@drawable\/ic_launcher_adaptive_foreground/);
assert.doesNotMatch(launcherAdaptive,/@android:color\/transparent/);
assert.match(launcherForeground,/@drawable\/ic_launcher_master/);
assert.match(launcherColors,/#12131C/);
assert.equal(pkg.dependencies['@capacitor/push-notifications'],'8.1.2');
assert.match(rootGradle,/com\.google\.gms:google-services:4\.4\.4/);
assert.match(gradle,/google-services\.json/);
assert.match(gradle,/com\.google\.gms\.google-services/);

// No fixed-colour strip under the status bar: the page is drawn edge to edge and paints it
// in the theme's colour (index.html viewport-fit=cover, theme.ts sets the icon colour).
assert.match(activity,/setDecorFitsSystemWindows\(getWindow\(\), false\)/);
assert.match(read('android/app/src/main/res/values/styles.xml'),/statusBarColor">@android:color\/transparent/);
assert.match(read('index.html'),/viewport-fit=cover/);

// Real Android accessibility/keyboard behavior: WebView text follows the system font scale and
// the visual viewport shrinks when the IME opens instead of letting the keyboard cover content.
assert.match(activity,/applySystemFontScale\(\)/);
assert.match(activity,/getResources\(\)\.getConfiguration\(\)\.fontScale/);
assert.match(activity,/setTextZoom\(zoom\)/);
assert.match(activity,/onConfigurationChanged\(Configuration newConfig\)/);
assert.match(read('index.html'),/interactive-widget=resizes-content/);

console.log('UnMute Android shell OK');
