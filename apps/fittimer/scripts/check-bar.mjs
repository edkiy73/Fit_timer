/* Облегчённая проверка пати-бара /bar (LIGHT_SCOPES в scripts/affected-apps.mjs):
   скрипты разбираются, всё, на что ссылаются страницы и service worker, существует,
   index.html совпадает с party-bar.html, манифест — корректный JSON. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { Script } from 'node:vm';
import path from 'node:path';

const DIR = new URL('../bar/', import.meta.url).pathname;
const read = f => readFileSync(path.join(DIR, f), 'utf8');
const fail = msg => { console.error('bar: ' + msg); process.exitCode = 1; };

for(const f of readdirSync(DIR).filter(f => f.endsWith('.js'))){
  try{ new Script(read(f), {filename: f}); }catch(e){ fail(f + ': ' + e.message); }
}
const html = read('index.html');
if(html !== read('party-bar.html')) fail('index.html и party-bar.html должны совпадать');
for(const [, src] of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="\.\/([^"?#]+)/g)){
  if(!existsSync(path.join(DIR, src))) fail('нет файла ' + src);
}
const shell = /SHELL=\[([^\]]+)\]/.exec(read('sw.js'));
if(!shell) fail('в sw.js нет SHELL');
else for(const [, f] of shell[1].matchAll(/'([^']+)'/g)){
  if(f !== './' && !existsSync(path.join(DIR, f))) fail('sw.js кэширует несуществующий ' + f);
}
try{ JSON.parse(read('party-bar.webmanifest')); }catch(e){ fail('манифест: ' + e.message); }
if(!process.exitCode) console.log('ok  пати-бар: скрипты, ссылки, service worker, манифест');
