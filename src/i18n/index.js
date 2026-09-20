/* ================= ЛОКАЛИЗАЦИЯ ================= */
const I18N = {ru: I18N_RU, en: I18N_EN};
let appLocale = 'ru';
let appLocaleStored = false;

function normalizeLocale(value){
  return String(value || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
function systemLocale(){
  try{
    const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    return langs.some(x => String(x).toLowerCase().startsWith('ru')) ? 'ru' : 'en';
  }catch(_){ return 'en'; }
}
function t(key, vars){
  const dict = I18N[appLocale] || I18N.en;
  const fallback = I18N.en[key] != null ? I18N.en[key] : I18N.ru[key];
  let out = dict[key] != null ? dict[key] : (fallback != null ? fallback : key);
  if(vars && typeof out === 'string'){
    Object.keys(vars).forEach(k => { out = out.replaceAll('{' + k + '}', String(vars[k])); });
  }
  return out;
}
function applyI18n(root){
  root = root || document;
  document.documentElement.lang = appLocale;
  document.title = t('app.title');
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const select = document.getElementById('appLocaleSelect');
  if(select) select.value = appLocale;
}
async function loadAppLocale(){
  let saved = null;
  try{ saved = await kvGet('appLocale'); }catch(_){}
  appLocaleStored = saved === 'ru' || saved === 'en';
  appLocale = appLocaleStored ? saved : systemLocale();
  applyI18n();
  return appLocale;
}
async function setAppLocale(value, opts){
  const next = normalizeLocale(value);
  const changed = next !== appLocale;
  appLocale = next;
  if(!opts || opts.persist !== false){
    appLocaleStored = true;
    try{ await kvSet('appLocale', appLocale); }catch(_){}
  }
  applyI18n();
  if(changed){
    try{ window.dispatchEvent(new CustomEvent('appLocaleChanged', {detail:{locale:appLocale}})); }catch(_){}
  }
  return appLocale;
}
function localeTag(){ return appLocale === 'ru' ? 'ru-RU' : 'en-US'; }
