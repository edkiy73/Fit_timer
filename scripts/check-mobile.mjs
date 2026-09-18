import { access, readFile } from 'node:fs/promises';

const required = [
  'dist/index.html',
  'dist/app.config.js',
  'android/app/src/main/AndroidManifest.xml',
  'ios/App/App/Info.plist'
];
for(const file of required) await access(file);

const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
if(config.appId !== 'ru.fittimer.app') throw new Error('Unexpected appId');
if(config.webDir !== 'dist') throw new Error('Capacitor webDir must be dist');

const html = await readFile('dist/index.html', 'utf8');
if(!html.includes('FIT_TIMER_CONFIG')) throw new Error('Runtime configuration is not used');

console.log('Mobile project structure is valid.');
