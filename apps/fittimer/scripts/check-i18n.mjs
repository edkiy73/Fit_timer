import { readFile, readdir } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';

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

// Regression: declarative data-i18n is a default, not a permanent owner of runtime UI.
// A background locale/profile refresh must translate untouched static labels while leaving
// stateful text/markup alone until that screen's renderer updates it in the new language.
{
  class FakeElement {
    constructor(dataset, text){
      this.dataset = Object.assign({}, dataset);
      this.attributes = {};
      this._text = '';
      this._html = '';
      this.textContent = text || '';
    }
    get textContent(){ return this._text; }
    set textContent(value){
      this._text = String(value);
      this._html = String(value);
    }
    get innerHTML(){ return this._html; }
    set innerHTML(value){
      this._html = String(value);
      this._text = String(value).replace(/<[^>]*>/g, '');
    }
    getAttribute(name){
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }
    setAttribute(name, value){ this.attributes[name] = String(value); }
  }

  const dynamic = new FakeElement({i18n:'common.ok'}, 'ОК');
  const untouched = new FakeElement({i18n:'common.cancel'}, 'Отмена');
  const withRuntimeIcon = new FakeElement({i18n:'common.ok'}, 'ОК');
  const dynamicTitle = new FakeElement({i18nTitle:'common.cancel'}, '');
  dynamicTitle.setAttribute('title', 'Отмена');

  const groups = {
    '[data-i18n]': [dynamic, untouched, withRuntimeIcon],
    '[data-i18n-html]': [],
    '[data-i18n-placeholder]': [],
    '[data-i18n-title]': [dynamicTitle],
    '[data-i18n-aria]': [],
    '.back-chip': [],
    'button[title]': [],
    '.switch': []
  };
  const documentStub = {
    documentElement: {lang:''},
    title: '',
    querySelectorAll(selector){ return groups[selector] || []; }
  };
  const context = createContext({
    navigator: {languages:['ru-RU'], language:'ru-RU'},
    document: documentStub,
    window: {addEventListener(){}, dispatchEvent(){}},
    MutationObserver: class { constructor(){} observe(){} },
    CustomEvent: class {},
    console
  });
  const ruSrc = await readFile('src/i18n/ru.js', 'utf8');
  const enSrc = await readFile('src/i18n/en.js', 'utf8');
  const runtimeSrc = await readFile('src/i18n/index.js', 'utf8');
  new Script(
    ruSrc + '\n' + enSrc + '\n' + runtimeSrc +
    '\n;globalThis.__i18nRuntimeTest={applyI18n,setAppLocale};'
  ).runInContext(context);

  const api = context.__i18nRuntimeTest;
  api.applyI18n();
  if(dynamic.textContent !== ru['common.ok']) throw new Error('initial RU translation was not applied');
  if(untouched.textContent !== ru['common.cancel']) throw new Error('initial static RU translation was not applied');

  dynamic.textContent = ru['common.switch'];
  withRuntimeIcon.innerHTML = '<svg></svg>' + ru['common.ok'];
  dynamicTitle.setAttribute('title', 'runtime-title');
  api.applyI18n();
  if(dynamic.textContent !== ru['common.switch']) throw new Error('same-locale refresh overwrote runtime button state');
  if(!withRuntimeIcon.innerHTML.startsWith('<svg>')) throw new Error('same-locale refresh removed runtime markup');

  await api.setAppLocale('en', {silent:true});
  if(untouched.textContent !== en['common.cancel']) throw new Error('static label did not switch to EN');
  if(dynamic.textContent !== ru['common.switch']) throw new Error('locale switch overwrote runtime button state');
  if(!withRuntimeIcon.innerHTML.startsWith('<svg>')) throw new Error('locale switch removed runtime markup');
  if(dynamicTitle.getAttribute('title') !== 'runtime-title') throw new Error('locale switch overwrote runtime attribute');
}

if(bad) process.exit(1);
console.log('i18n dictionaries and HTML keys are in sync (' + ruKeys.length + ' keys)');
