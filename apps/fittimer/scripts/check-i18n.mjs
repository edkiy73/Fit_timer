import { readFile, readdir } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';

async function loadDictionary(path, name){
  const src = await readFile(path, 'utf8');
  // Dictionaries are ES modules (`export const I18N_RU = {...}`); evaluate the literal only.
  return Function(src.replace(/^export\s+/m, '') + '\nreturn ' + name + ';')();
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

// Untranslated markup: Russian text or a Russian placeholder/aria-label/title in
// src/html must carry a data-i18n* key, otherwise the English UI shows it in Russian.
// Allowed: inside an element with data-i18n / data-i18n-html (the key replaces it),
// <option> (a language's own name) and <script>/<style>.
{
  const CYR = /[А-Яа-яЁё]/;
  const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const ATTR_KEYS = {placeholder: 'data-i18n-placeholder', 'aria-label': 'data-i18n-aria', title: 'data-i18n-title'};
  const attrOf = (attrs, name) => { const m = attrs.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')')); return m ? (m[2] ?? m[3]) : null; };
  for(const file of htmlFiles){
    const text = await readFile('src/html/' + file, 'utf8');
    const stack = [];
    const tokenRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
    let m;
    while((m = tokenRe.exec(text))){
      const line = text.slice(0, m.index).split('\n').length;
      if(m[4] != null){
        if(!CYR.test(m[4])) continue;
        if(stack.some(e => /\sdata-i18n(-html)?=/.test(' ' + e.attrs) || ['option','script','style'].includes(e.tag))) continue;
        console.error(`${file}:${line}: untranslated text "${m[4].trim().slice(0, 60)}" — add data-i18n`);
        bad = true;
      } else if(m[2]){
        const tag = m[2].toLowerCase(), attrs = m[3] || '';
        if(m[1]){
          const i = stack.map(e => e.tag).lastIndexOf(tag);
          if(i >= 0) stack.length = i;
          continue;
        }
        for(const [name, key] of Object.entries(ATTR_KEYS)){
          const value = attrOf(attrs, name);
          if(value && CYR.test(value) && attrOf(attrs, key) == null){
            console.error(`${file}:${line}: untranslated ${name}="${value.slice(0, 60)}" — add ${key}`);
            bad = true;
          }
        }
        if(!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push({tag, attrs});
      }
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
  // The i18n files are ES modules; run them as one classic script for this DOM check.
  const asScript = src => src.replace(/^import .*$/gm, '').replace(/^export\s+/gm, '');
  new Script(
    asScript(ruSrc) + '\n' + asScript(enSrc) + '\n' + asScript(runtimeSrc) +
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
