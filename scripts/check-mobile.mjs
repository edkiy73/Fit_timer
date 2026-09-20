import { access, readFile } from 'node:fs/promises';

const required = [
  'dist/index.html',
  'dist/style.css',
  'dist/app.js',
  'dist/app.config.js',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/ru/fittimer/app/FitAudioPlugin.java',
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

console.log('Mobile project structure is valid.');
