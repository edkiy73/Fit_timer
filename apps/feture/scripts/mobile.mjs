// Creates reproducible Android/iOS Capacitor projects; no signed release is built.
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const platform=process.argv[2];
if(!['android','ios'].includes(platform)){console.error('Usage: npm run mobile:prepare:android|ios');process.exit(1)}
if(platform==='ios' && process.platform!=='darwin'){console.error('Native iOS shell requires macOS with Xcode.');process.exit(1)}
function run(args){const r=spawnSync(process.platform==='win32'?'npx.cmd':'npx',args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}
const build=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{stdio:'inherit'});
if(build.status!==0)process.exit(build.status??1);
const expected=platform==='android'?'android/app/src/main/AndroidManifest.xml':'ios/App/App.xcodeproj/project.pbxproj';
if(!existsSync(expected))run(['cap','add',platform]);
run(['cap','sync',platform]);
console.log('FetUre Capacitor '+platform+' shell synchronized; no APK/IPA created.');
