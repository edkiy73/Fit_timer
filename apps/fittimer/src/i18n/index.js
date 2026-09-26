/* ================= ЛОКАЛИЗАЦИЯ ================= */
const I18N = {ru: I18N_RU, en: I18N_EN};
const LOCALE_META = Object.freeze({
  ru: {tag:'ru-RU', ai:'Russian'},
  en: {tag:'en-US', ai:'English'}
});
const SUPPORTED_LOCALES = Object.freeze(Object.keys(I18N));
let appLocalePreference = 'system'; // system | supported locale
let appLocale = systemLocale();       // effective locale used by UI/TTS/API
let appLocaleStored = false;

function normalizeLocale(value){
  const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  const base = raw.split('-')[0];
  return SUPPORTED_LOCALES.includes(base) ? base : 'en';
}
function systemLocale(){
  try{
    const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for(const value of langs){
      const base = String(value || '').trim().toLowerCase().replace(/_/g, '-').split('-')[0];
      if(SUPPORTED_LOCALES.includes(base)) return base;
    }
  }catch(_){}
  return 'en';
}
function normalizeLocalePreference(value){
  return String(value || '').toLowerCase() === 'system' ? 'system' : normalizeLocale(value);
}
function resolveLocalePreference(value){
  const pref = normalizeLocalePreference(value);
  return pref === 'system' ? systemLocale() : normalizeLocale(pref);
}
function profileLocalePreference(u){
  return normalizeLocalePreference(u && u.locale ? u.locale : 'system');
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
// data-i18n задаёт перевод по умолчанию, но не должен отбирать элемент у runtime-renderer.
// После первого применения запоминаем ровно то DOM-значение, которое поставил i18n.
// Если код экрана позже изменил тот же текст/HTML/атрибут, считаем его владельцем до
// следующего собственного render. Это не даёт фоновому sync/смене профиля на секунду
// возвращать кнопки из «Переключиться / Остаться» в «Понятно / Отмена».
function applyI18nValue(el, slot, next, attr){
  const mark = 'i18nApplied' + slot;
  const read = () => {
    if(attr){
      const value = el.getAttribute(attr);
      return value == null ? '' : value;
    }
    // Для data-i18n сравниваем именно innerHTML: runtime может добавить иконку,
    // оставив тот же textContent, и такой элемент тоже нельзя потом разрушать.
    return el.innerHTML;
  };
  const last = el.dataset[mark];
  if(last != null && read() !== last) return false;

  if(attr) el.setAttribute(attr, next);
  else if(slot === 'Html') el.innerHTML = next;
  else el.textContent = next;

  // Браузер может нормализовать HTML/атрибут, поэтому сохраняем фактическое значение.
  el.dataset[mark] = read();
  return true;
}

function applyI18n(root){
  root = root || document;
  document.documentElement.lang = appLocale;
  document.title = t('app.title');
  root.querySelectorAll('[data-i18n]').forEach(el => { applyI18nValue(el, 'Text', t(el.dataset.i18n)); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { applyI18nValue(el, 'Html', t(el.dataset.i18nHtml)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { applyI18nValue(el, 'Placeholder', t(el.dataset.i18nPlaceholder), 'placeholder'); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { applyI18nValue(el, 'Title', t(el.dataset.i18nTitle), 'title'); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { applyI18nValue(el, 'Aria', t(el.dataset.i18nAria), 'aria-label'); });
  syncAccessibility(root);
}

function syncAccessibility(root){
  root = root || document;
  root.querySelectorAll('.back-chip').forEach(el => {
    el.setAttribute('aria-label', t('common.back'));
    if(!el.getAttribute('title')) el.setAttribute('title', t('common.back'));
  });
  root.querySelectorAll('button[title]').forEach(el => {
    if(!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.getAttribute('title'));
  });
  root.querySelectorAll('.switch').forEach(el => {
    el.setAttribute('role', 'switch');
    el.setAttribute('aria-checked', el.classList.contains('on') ? 'true' : 'false');
    if(!el.getAttribute('aria-label')){
      const row = el.closest('.pref-row');
      const label = row && row.querySelector(':scope > span');
      if(label) el.setAttribute('aria-label', (label.textContent || '').trim());
    }
  });
}

async function loadAppLocale(){
  appLocaleStored = false;
  appLocalePreference = 'system';
  appLocale = systemLocale();
  applyI18n();
  return appLocale;
}
async function setAppLocale(value, opts){
  const pref = normalizeLocalePreference(value);
  const next = resolveLocalePreference(pref);
  const changed = next !== appLocale;
  appLocalePreference = pref;
  appLocale = next;
  applyI18n();
  if(changed && !(opts && opts.silent)){
    try{ window.dispatchEvent(new CustomEvent('appLocaleChanged', {detail:{locale:appLocale, preference:appLocalePreference}})); }catch(_){}
  }
  return appLocale;
}
try{
  window.addEventListener('languagechange', ()=>{
    if(appLocalePreference === 'system') setAppLocale('system', {persist:false});
  });
}catch(_){}
function localeTag(value){
  const code = value == null ? appLocale : normalizeLocale(value);
  return (LOCALE_META[code] && LOCALE_META[code].tag) || code;
}
function aiOutputLanguage(){
  const meta = LOCALE_META[appLocale] || LOCALE_META.en;
  return meta.ai || 'English';
}

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

const CANONICAL_LABEL_KEYS = {
  'Новичок':'option.level.beginner','Средний':'option.level.intermediate','Продвинутый':'option.level.advanced',
  'Похудеть':'option.goal.loseWeight','Подтянуть всё тело':'option.goal.tone','Ягодицы и пресс':'option.goal.glutesCore',
  'Плоский живот':'option.goal.flatStomach','Сила и выносливость':'option.goal.strength','Рельеф мышц':'option.goal.definition',
  'Растяжка и гибкость':'option.goal.flexibility','Осанка и спина':'option.goal.posture',
  'Восстановиться после родов':'option.goal.postpartum','Кардио и энергия':'option.goal.cardio',
  'Без инвентаря':'option.equip.none','Коврик':'option.equip.mat','Гантели':'option.equip.dumbbells','Резинки':'option.equip.bands',
  'Стул':'option.equip.chair','Фитбол':'option.equip.ball','Утяжелители':'option.equip.weights','Турник':'option.equip.bar',
  'Без ограничений':'option.limit.none','Без прыжков':'option.limit.noJump','Тихо (соседи снизу)':'option.limit.quiet',
  'Берегу колени':'option.limit.knees','Берегу поясницу':'option.limit.lowerBack','Берегу запястья':'option.limit.wrists',
  'Берегу шею':'option.limit.neck','Беременность':'option.limit.pregnancy',
  'Круговая':'option.style.circuit','Силовая':'option.style.strength','Смешанная':'option.style.mixed',
  'С разминкой':'option.warm.with','Без разминки':'option.warm.without',
  'Повторения':'option.format.reps','С весом':'option.format.weight','Время':'option.format.time',
  'Шея':'muscle.neck','Плечи':'muscle.shoulders','Грудь':'muscle.chest','Руки':'muscle.arms','Пресс':'muscle.core',
  'Спина':'muscle.back','Ягодицы':'muscle.glutes','Квадрицепс':'muscle.quads','Задняя бедра':'muscle.hamstrings','Икры':'muscle.calves',
  'Пн':'day.mon','Вт':'day.tue','Ср':'day.wed','Чт':'day.thu','Пт':'day.fri','Сб':'day.sat','Вс':'day.sun',
  'Понедельник':'day.monFull','Вторник':'day.tueFull','Среда':'day.wedFull','Четверг':'day.thuFull','Пятница':'day.friFull','Суббота':'day.satFull','Воскресенье':'day.sunFull'
};
const CANONICAL_DESC_KEYS = {
  'Круговая':'option.desc.circuit','Силовая':'option.desc.strength','Смешанная':'option.desc.mixed',
  'С разминкой':'option.desc.warm','Без разминки':'option.desc.noWarm'
};
function canonicalLabel(value){
  const raw=String(value == null ? '' : value);
  const key=CANONICAL_LABEL_KEYS[raw];
  if(key) return t(key);
  const m=raw.match(/^(\d+)(\+?)\s*мин$/);
  if(m) return appLocale === 'ru' ? raw : (m[1] + m[2] + ' min');
  return raw;
}
function canonicalDescription(value){
  const key=CANONICAL_DESC_KEYS[String(value || '')];
  return key ? t(key) : '';
}

try{
  const a11yObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
      const el = m.target;
      if(el && el.classList && el.classList.contains('switch')){
        el.setAttribute('aria-checked', el.classList.contains('on') ? 'true' : 'false');
      }
    });
  });
  a11yObserver.observe(document.documentElement, {subtree:true, attributes:true, attributeFilter:['class']});
}catch(_){}
