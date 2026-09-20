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
function aiOutputLanguage(){ return appLocale === 'ru' ? 'Russian' : 'English'; }

function aiCanonicalEnglish(value){
  const map = {
    'Новичок':'beginner','Средний':'intermediate','Продвинутый':'advanced',
    'Похудеть':'lose weight','Подтянуть всё тело':'tone the whole body','Ягодицы и пресс':'glutes and core',
    'Плоский живот':'flatter stomach','Сила и выносливость':'strength and endurance','Рельеф мышц':'muscle definition',
    'Растяжка и гибкость':'stretching and flexibility','Осанка и спина':'posture and back',
    'Восстановиться после родов':'postpartum recovery','Кардио и энергия':'cardio and energy',
    'Без инвентаря':'no equipment','Коврик':'mat','Гантели':'dumbbells','Резинки':'resistance bands',
    'Стул':'chair','Фитбол':'stability ball','Утяжелители':'wearable weights','Турник':'pull-up bar',
    'Без ограничений':'no stated limitations','Без прыжков':'no jumping','Тихо (соседи снизу)':'quiet / low-impact',
    'Берегу колени':'protect knees','Берегу поясницу':'protect lower back','Берегу запястья':'protect wrists',
    'Берегу шею':'protect neck','Беременность':'pregnancy',
    'Круговая':'circuit','Силовая':'strength','Смешанная':'mixed','С разминкой':'with warm-up','Без разминки':'without warm-up',
    'Шея':'neck','Плечи':'shoulders','Грудь':'chest','Руки':'arms','Пресс':'core','Спина':'back',
    'Ягодицы':'glutes','Квадрицепс':'quadriceps','Задняя бедра':'hamstrings','Икры':'calves',
    'Повторения':'reps','С весом':'weighted reps','Время':'time'
  };
  return map[String(value || '')] || String(value || '');
}
function aiCanonicalListEnglish(values){
  return (values || []).map(aiCanonicalEnglish).join(', ');
}
