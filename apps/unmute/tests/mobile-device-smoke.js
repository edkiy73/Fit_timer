const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const android=read('scripts/smoke-android-device.sh');
const ios=read('scripts/smoke-ios-device.sh');
const workflow=read('../../.github/workflows/unmute.yml');
const pkg=JSON.parse(read('package.json'));

assert.match(android,/"\$ADB" install -r/);
assert.match(android,/"\$ADB" shell am start -W/);
assert.match(android,/pidof/);
assert.match(android,/app\.unmute\.english/);
assert.match(ios,/simctl install/);
assert.match(ios,/simctl launch --terminate-running-process/);
assert.match(ios,/kill -0/);
assert.match(ios,/app\.unmute\.english/);
assert.match(workflow,/smoke-android-device\.sh/);
assert.match(workflow,/ReactiveCircus\/android-emulator-runner@a421e43855164a8197daf9d8d40fe71c6996bb0d/);
assert.match(workflow,/api-level: 35/);
assert.match(workflow,/smoke-ios-device\.sh/);
assert.match(pkg.scripts['check:ios'],/-derivedDataPath build\/ios-derived/);

console.log('UnMute native device smoke wiring OK');
