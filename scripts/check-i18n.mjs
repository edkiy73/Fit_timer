import { readFile, readdir } from 'node:fs/promises';

async function loadDictionary(path, name){
  const src = await readFile(path, 'utf8');
  return Function(src + '\nreturn ' + name + ';')();
}

const ru = await loadDictionary('src/i18n/ru.js', 'I18N_RU');
const en = await loadDictionary('src/i18n/en.js', 'I18N_EN');

let bad = false;
const ruKeys = Object.keys(ru).sort();
const enKeys = Object.keys(en).sort();
for(const key of ruKeys){
  if(!(key in en)){ console.error('missing EN key:', key); bad = true; }
}
for(const key of enKeys){
  if(!(key in ru)){ console.error('missing RU key:', key); bad = true; }
}

const htmlFiles = (await readdir('src/html')).filter(x => x.endsWith('.html'));
const attrRe = /data-i18n(?:-html|-placeholder|-title|-aria)?=["']([^"']+)["']/g;
for(const file of htmlFiles){
  const text = await readFile('src/html/' + file, 'utf8');
  let m;
  while((m = attrRe.exec(text))){
    if(!(m[1] in ru) || !(m[1] in en)){
      console.error(file + ': unknown i18n key:', m[1]);
      bad = true;
    }
  }
}

if(bad) process.exit(1);
console.log('i18n dictionaries and HTML keys are in sync (' + ruKeys.length + ' keys)');
