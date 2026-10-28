// Builds the web app, copies the part the app needs into dist-native/ (Capacitor webDir) and syncs the native shell.
// No signed release is built here; the test APK is assembled by .github/workflows/feture-android.yml.
import {cpSync,existsSync,rmSync} from 'node:fs';
import {basename} from 'node:path';
import {spawnSync} from 'node:child_process';
const platform=process.argv[2];
const skipBuild=process.argv.includes('--no-build');
if(!['android','ios'].includes(platform)){console.error('Usage: npm run mobile:sync | mobile:prepare:ios');process.exit(1)}
if(platform==='ios' && process.platform!=='darwin'){console.error('Native iOS shell requires macOS with Xcode.');process.exit(1)}
function run(cmd,args){const r=spawnSync(process.platform==='win32'?cmd+'.cmd':cmd,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}
if(!skipBuild)run('npm',['run','build']);
if(!existsSync('dist/index.html')){console.error('dist/index.html is missing: run npm run build first.');process.exit(1)}

// The website also publishes Storybook (/kit), the design prototypes and the web-push service worker. None of them
// belongs in the app (they would add ~80 MB to the APK, and the app never registers a service worker).
const WEB_ONLY=name=>name==='kit'||name==='fe-sw.js'||name==='concept.html'||name==='design-handoff.html'||/^prototype-.*\.html$/.test(name);
rmSync('dist-native',{recursive:true,force:true});
cpSync('dist','dist-native',{recursive:true,filter:src=>src==='dist'||!WEB_ONLY(basename(src))||!/^dist[\\/][^\\/]+$/.test(src)});

const expected=platform==='android'?'android/app/src/main/AndroidManifest.xml':'ios/App/App.xcodeproj/project.pbxproj';
if(!existsSync(expected))run('npx',['cap','add',platform]);
run('npx',['cap','sync',platform]);
console.log('FetUre Capacitor '+platform+' shell synchronized from dist-native/; no APK/IPA created.');
