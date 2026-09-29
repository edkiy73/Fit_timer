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
assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
assert.match(manifest,/android\.permission\.POST_NOTIFICATIONS/);

console.log('UnMute Android shell OK');
