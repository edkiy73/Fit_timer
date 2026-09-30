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

console.log('UnMute Android shell OK');
