const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const swift=read('native/ios/UnMuteAudio.swift');
const prep=read('scripts/prepare-ios.mjs');
const pkg=JSON.parse(read('package.json'));

assert.match(swift,/class UnMuteBridgeViewController: CAPBridgeViewController/);
assert.match(swift,/registerPluginInstance\(UnMuteAudioPlugin\(\)\)/);
assert.match(swift,/class UnMuteAudioPlugin: CAPPlugin, CAPBridgedPlugin/);
assert.match(swift,/SFSpeechRecognizer/);
assert.match(swift,/result\.transcriptions/);
assert.match(swift,/prefix\(3\)/);
assert.match(swift,/AVSpeechSynthesizer/);
assert.match(swift,/notifyListeners\("speechResult"/);
assert.match(swift,/notifyListeners\("speechError"/);
assert.match(prep,/NSSpeechRecognitionUsageDescription/);
assert.match(prep,/NSMicrophoneUsageDescription/);
assert.equal(pkg.dependencies['@capacitor/ios'],'8.5.2');
assert.match(pkg.scripts['mobile:sync:ios'],/prepare-ios\.mjs/);
assert.match(pkg.scripts['check:ios'],/xcodebuild/);
assert.doesNotMatch(swift,/FitAudio/);

console.log('UnMute iOS shell OK');
