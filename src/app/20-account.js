/* ================= РЕДАКТОР ПРОФИЛЯ ================= */
let uDraft = null;
// текущее состояние профиля для сравнения
function userState(){
  if(!uDraft) return null;
  const u = JSON.parse(JSON.stringify(uDraft));
  if($('ueName')) u.name = $('ueName').value.trim();
  if($('ueAge')) u.age = validAge($('ueAge').value);
  return u;
}
function userDirty(){ return isChanged('user', userState()); }

function openUserEdit(id = null){
  // новый профиль сразу назван: пустое поле «Имя» — это опять анкета, только в другом месте
  const u = id ? users.find(x => x.id === id) : Object.assign(AppBaseIdentity.createProfileDraft(nextProfileName()), {gender: '', age: null});
  uDraft = JSON.parse(JSON.stringify(u));
  $('ueTitle').textContent = id ? t('profile.title') : t('profile.new');
  $('ueName').value = uDraft.name || '';
  $('ueAge').value = profileAge(uDraft) || '';
  setTimeout(()=> takeSnap('user', userState()), 0);
  // отсчёты и ключ ИИ живут в «Настройках» и применяются сразу; здесь только
  // раскладываем значения по умолчанию для нового профиля
  if(uDraft.prepSec == null) uDraft.prepSec = 5;
  if(uDraft.readySec == null) uDraft.readySec = 5;
  if(uDraft.sideSec == null) uDraft.sideSec = 10;
  if(uDraft.voiceURI == null) uDraft.voiceURI = savedVoiceURI || '';
  if(uDraft.voiceVol == null) uDraft.voiceVol = 100;
  if(uDraft.fxVol == null) uDraft.fxVol = 100;
  if(!uDraft.theme) uDraft.theme = 'system';
  uDraft.locale = profileLocalePreference(uDraft);
  $('uePrepSec').value = uDraft.prepSec;
  $('ueReadySec').value = uDraft.readySec;
  $('ueSideSec').value = uDraft.sideSec;
  syncUserForm();
  // единственный профиль удалить нельзя — кнопку не показываем вовсе
  setShown('btnDelUser', id && users.length > 1);
  show('scrUserEdit');
  window.scrollTo(0, 0);
}
function syncUserForm(){
  // ни одна кнопка не подсвечена, пока пол не выбран: подставленный по умолчанию
  // «женский» уходил в запрос к ИИ как настоящий ответ
  $('ueGenderF').classList.toggle('act', uDraft.gender === 'f');
  $('ueGenderM').classList.toggle('act', uDraft.gender === 'm');
  const th = themeOf(uDraft);
  document.querySelectorAll('#ueThemeSeg button').forEach(b => b.classList.toggle('act', b.dataset.theme === th));
  const loc = profileLocalePreference(uDraft);
  document.querySelectorAll('#ueLocaleSeg button').forEach(b => b.classList.toggle('act', b.dataset.locale === loc));
  // аватарка: фото, либо первая буква имени, либо иконка
  const nm = (uDraft.name || '').trim();
  $('uePhotoPrev').innerHTML = uDraft.photo
    ? `<img src="${esc(uDraft.photo)}" alt="">`
    : (nm ? `<span class="ava-let">${nm[0].toUpperCase()}</span>` : icon('camera'));
}
async function saveUser(){
  // maxlength сторожит только набор с клавиатуры — вставка и перенос данных мимо него
  uDraft.name = clampLine($('ueName').value, NAME_MAX);
  uDraft.age = validAge($('ueAge').value);
  uDraft.syncAt = new Date().toISOString();
  readTimings();
  if(!uDraft.name){ appAlert(t('profile.nameRequired')); return; }
  // пол и возраст — не украшение анкеты: они уходят в запрос к ИИ и определяют
  // подбор упражнений, нагрузку и восстановление. Пустыми их оставлять нельзя
  if(!uDraft.gender){ appAlert(t('profile.genderRequired')); return; }
  const aErr = ageError($('ueAge').value, true);
  if(aErr){
    appAlert(aErr);
    $('ueAge').focus();
    return;
  }
  if(uDraft.id){
    const i = users.findIndex(x => x.id === uDraft.id);
    users[i] = uDraft;
    await saveUsers();
    if(uDraft.id === currentUser){
      await setAppLocale(profileLocalePreference(uDraft), {persist:false});
      applyAudioFromUser(uDraft);
      applyThemeFor(uDraft);
    }
    renderUsers();
    if(account && account.email) connectAccountSync().catch(()=>{});
    goTab('scrAccount');
  } else {
    uDraft.id = 'u' + Date.now();
    users.push(uDraft);
    await saveUsers();
    await switchUser(uDraft.id); // новый профиль сразу активен, со своей чистой статистикой
    if(account && account.email) connectAccountSync().catch(()=>{});
    goTab('scrAccount');
  }
}
/* Удаление профиля НЕ трогает аккаунт. Раньше удаление последнего профиля стирало
   заодно все GLOBAL_KEYS — то есть почту, подписку и knownAccounts. Человек удалял
   профиль, а терял оплаченное, причём безвозвратно: вернуть подписку входом было
   уже неоткуда, список известных аккаунтов стирался тем же циклом.
   Поэтому последний профиль удалить нельзя. Полный сброс никуда не делся — он живёт
   на экране аккаунта под своим именем «Удалить все данные», с подтверждением фразой,
   и человек понимает, на что идёт. */
async function deleteUser(){
  if(!uDraft.id) return;
  if(users.length <= 1){
    await appAlert(t('profile.onlyOne'));
    return;
  }
  const msg = t('profile.deleteQuestion',{name:uDraft.name});
  if(!(await appDialog(msg, {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  const id = uDraft.id;
  const removed = users.find(x => x.id === id);
  if(removed){
    if(!Array.isArray(account.deletedProfiles)) account.deletedProfiles = [];
    account.deletedProfiles = account.deletedProfiles.filter(x => x.id !== (removed.profileId || removed.id));
    account.deletedProfiles.push({id:removed.profileId || removed.id, at:new Date().toISOString()});
    await saveAccount();
  }
  for(const k of PROFILE_KEYS) await kvDel(k + '_' + id);
  users = users.filter(x => x.id !== id);
  await saveUsers();
  if(id === currentUser){
    currentUser = '';
    await switchUser(users[0].id);
  } else {
    renderUsers();
  }
  connectAccountSync().catch(()=>{});
  goTab('scrAccount');
}

// Ключи, которые заводит приложение. Перечислены поимённо и в одном месте: удаление,
// которое забыло ключ, оставляет от «удалённого» аккаунта хвост — а это ровно то, за
// что и придёт претензия (и из стора, и по 152-ФЗ).
const PROFILE_KEYS = ['customPrograms', 'stats', 'progWeights', 'photos', 'warmupAdded',
                      'workoutSession', 'identity', 'docMeta', 'outbox',
                      'trainer', 'clients'];
const GLOBAL_KEYS = ['account', 'accountData', 'knownAccounts', 'users', 'currentUser', 'profile', 'seenHelp', 'migrated', 'deviceId',
                     'customPrograms', 'stats', 'hfMode', 'musicMode', 'soundOff', 'voiceCtl',
                     'recognitionLang', 'recognitionLangManual', 'voiceLang', 'voiceLangManual',
                     'voiceHint', 'voiceURI', 'analyticsInstallSent',
                     'wantSvg']; // wantSvg больше не пишется — строка нужна, чтобы стереть его у тех, кто успел его сохранить

// Полное удаление аккаунта. Требование и сторов, и 152-ФЗ: человек должен уметь
// отозвать согласие и стереть всё, не переустанавливая приложение. Стираем и очередь
// на отправку — иначе после подключения сервера удалённое уехало бы туда из очереди.
async function wipeAccount(){
  const linked = !!(account && account.email);
  // Часть данных лежит НЕ на телефоне, и стереть её заодно нельзя — её надо стереть
  // отдельно и на сервере. Пока этого не было, «удалить всё» оставляло висеть имя и
  // фотографию под ником, которым после удаления не мог управлять уже никто,
  // включая самого человека.
  const coach = !!(trainer && trainer.key && (trainer.handle || '').trim());
  const server = coach || linked;
  const ok = await appDialog(
    (linked ? t('account.deleteAccountQuestion') : t('account.deleteDataQuestion'))
      + t('account.deleteLocalWarning')
      + (coach ? t('account.deleteCoachWarning') : ''),
    {confirm: true, okText: t('account.deleteAll'), cancelText: t('common.cancel'), type: t('account.deleteConfirmPhrase')}
  );
  if(!ok) return;
  if(server){
    try{ await forgetMe('all'); }
    catch(e){
      // Молча стереть телефон нельзя: ключ уйдёт вместе с ним, и данные на сервере
      // не сможет удалить уже никто. Решение за человеком.
      const anyway = await appDialog(
        t('account.serverDeleteFailed'),
        {confirm: true, okText: t('account.eraseAnyway'), cancelText: t('common.wait')}
      );
      if(!anyway) return;
    }
  }
  for(const u of users){
    for(const k of PROFILE_KEYS){ try{ await kvDel(k + '_' + u.id); }catch(e){} }
  }
  for(const id of ['f', 'm']){  // профили старой схемы
    for(const k of PROFILE_KEYS){ try{ await kvDel(k + '_' + id); }catch(e){} }
  }
  for(const k of GLOBAL_KEYS){ try{ await kvDel(k); }catch(e){} }
  await kvClearAll();   // и IndexedDB, и localStorage
  location.reload();
}

/* ================= АККАУНТ, ПОДПИСКА, БИОМЕТРИЯ ================= */
// Аккаунт один на устройство, а профили лежат внутри него («второй — для мужа или
// подруги»), поэтому почта, подписка и биометрия хранятся глобальным ключом, а не
// рядом с профилем: подписка принадлежит тому, кто заплатил, а не имени в списке.
let account = null;
let bioOK = false;   // устройство умеет проверять отпечаток или лицо
// Аккаунты, которые на этом устройстве уже открывали. Выход не должен означать потерю
// подписки, а вход — превращаться в повторную покупку, поэтому почта, подписка и ключ
// биометрии переезжают сюда и возвращаются обратно при входе.
let knownAccounts = [];
const blankAccount = ()=> AppBaseIdentity.createAccount();
async function readAccountData(){
  return parsed(await kvGet('accountData'), {});
}
function accountBucketKey(){
  return String((account && account.email) || '').trim().toLowerCase();
}
async function readAccountBucket(){
  const all = await readAccountData();
  const key = accountBucketKey();
  return {all, key, bucket:(key && all[key]) || {meta:{}}};
}
async function writeAccountBucket(rec){
  if(!rec || !rec.key) return;
  rec.all[rec.key] = rec.bucket;
  await kvSet('accountData', JSON.stringify(rec.all));
}
function bumpAccountMeta(bucket, key){
  if(!bucket.meta) bucket.meta = {};
  const prev = bucket.meta[key] || {rev:0};
  bucket.meta[key] = {rev:(+prev.rev || 0) + 1, at:new Date().toISOString(), schema:SCHEMA_VERSION};
}
async function loadAccount(){
  try{ account = JSON.parse(await kvGet('account')) || null; }catch(e){ account = null; }
  if(!account) account = blankAccount();
  try{ knownAccounts = JSON.parse(await kvGet('knownAccounts')) || []; }catch(e){ knownAccounts = []; }
}
async function saveAccount(){ await kvSet('account', JSON.stringify(account)); }
async function saveKnown(){ await kvSet('knownAccounts', JSON.stringify(knownAccounts)); }
async function refreshServerSubscription(force){
  if(!account || !account.email || !account.syncToken) return false;
  const now = Date.now();
  if(!force && refreshServerSubscription._at && now - refreshServerSubscription._at < 15000) return false;
  refreshServerSubscription._at = now;
  let deviceId = await kvGet('deviceId');
  if(!deviceId) return false;
  try{
    const r = await apiPost('/api/auth',{
      action:'status', email:account.email, deviceId, syncToken:account.syncToken
    });
    account.sub = r.sub || null;
    await saveAccount();
    renderPlan();
    if(typeof renderPremium === 'function') renderPremium();
    if(typeof syncGeminiBtns === 'function') syncGeminiBtns();
    return true;
  }catch(_){
    return false;
  }
}

async function syncAccountLocale(locale){
  const next = normalizeLocale(locale);
  if(!account) return;
  account.locale = next;
  rememberAccount();
  await saveAccount();
  await saveKnown();
  if(account.email && account.syncToken){
    let deviceId = await kvGet('deviceId');
    if(!deviceId){ deviceId = newId(); await kvSet('deviceId', deviceId); }
    try{ await apiPost('/api/auth', {action:'set_locale', email:account.email, deviceId, syncToken:account.syncToken, locale:next}); }catch(_){}
  }
}
function rememberAccount(){
  if(!account.email) return;
  const rec = {email: account.email, handle: account.handle || '', locale: account.locale || appLocale, sub: account.sub, biometry: account.biometry, syncToken: account.syncToken || null,
               deletedProfiles: account.deletedProfiles || [],
               createdAt: account.createdAt, linkedAt: account.linkedAt};
  knownAccounts = knownAccounts.filter(a => a.email !== rec.email).concat([rec]);
}
const isPremium = ()=> !!(account && account.sub && account.sub.until && new Date(account.sub.until) > new Date());

// Цены — фиксированные точки в валюте покупателя, а не пересчёт по курсу: так делают
// и сторы. «4,99 $» читается как цена, а «412,73 ₽» — как ошибка округления.
const PRICES = {
  RUB: {month: 399,   year: 2990},
  USD: {month: 4.99,  year: 39.99},
  EUR: {month: 4.99,  year: 39.99},
  GBP: {month: 4.49,  year: 34.99},
  KZT: {month: 2490,  year: 18900},
  UAH: {month: 199,   year: 1490},
  BYN: {month: 14.9,  year: 109},
  TRY: {month: 169,   year: 1290},
  PLN: {month: 21.99, year: 169}
};
let REMOTE_PRICES = null;
const CUR_BY_REGION = {RU:'RUB', BY:'BYN', KZ:'KZT', UA:'UAH', TR:'TRY', PL:'PLN', GB:'GBP',
                       US:'USD', CA:'USD', AU:'USD', NZ:'USD', IL:'USD', AE:'USD'};
const EURO_REGIONS = 'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES'.split(' ');
// Часовой пояс — запасной путь, когда язык телефона без региона («ru», а не «ru-RU»).
const TZ_REGION = {
  'Europe/Moscow':'RU','Europe/Kaliningrad':'RU','Europe/Samara':'RU','Europe/Volgograd':'RU',
  'Asia/Yekaterinburg':'RU','Asia/Omsk':'RU','Asia/Novosibirsk':'RU','Asia/Krasnoyarsk':'RU',
  'Asia/Irkutsk':'RU','Asia/Yakutsk':'RU','Asia/Vladivostok':'RU','Asia/Magadan':'RU','Asia/Kamchatka':'RU',
  'Europe/Minsk':'BY','Asia/Almaty':'KZ','Asia/Aqtobe':'KZ','Asia/Atyrau':'KZ',
  'Europe/Kyiv':'UA','Europe/Kiev':'UA','Europe/Istanbul':'TR','Europe/Warsaw':'PL','Europe/London':'GB'
};
function userRegion(){
  try{
    const m = /[-_]([A-Za-z]{2})$/.exec(navigator.language || '');
    if(m) return m[1].toUpperCase();
  }catch(e){}
  try{
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
    if(TZ_REGION[tz]) return TZ_REGION[tz];
    if(tz.indexOf('Europe/') === 0) return 'DE';   // еврозона как общий случай
  }catch(e){}
  return 'US';
}
function userCurrency(){
  const r = userRegion();
  return CUR_BY_REGION[r] || (EURO_REGIONS.includes(r) ? 'EUR' : 'USD');
}
function money(v, cur){
  const frac = (Math.round(v * 100) % 100) ? 2 : 0;
  try{
    return new Intl.NumberFormat(localeTag(),
      {style: 'currency', currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac}).format(v);
  }catch(e){ return v + ' ' + cur; }
}
const priceTable = ()=> (REMOTE_PRICES || PRICES)[userCurrency()] || (REMOTE_PRICES || PRICES).USD;

let APP_UPDATE = null;
let APP_UPDATE_PREV = null;
// Один вид баннера на одно состояние загрузки. Раньше проценты стояли дважды (в тексте
// и на кнопке), отменить было нельзя, а после сворачивания баннер пересобирался с нуля
// и терял идущую загрузку. Состояние теперь берём у нативной стороны.
function androidUpdateAction(text, disabled){
  const action=$('appUpdateBanner')&&$('appUpdateBanner').querySelector('.ub-action');
  if(action) action.textContent=text||t('update.action');
  if($('appUpdateNow')){
    $('appUpdateNow').textContent=text||t('update.action');
    $('appUpdateNow').disabled=!!disabled;
  }
}
function androidUpdateStatus(text, action, busy){
  if(!APP_UPDATE)return;
  const target=APP_UPDATE.required?$('appUpdateGateText'):$('appUpdateText');
  if(target)target.textContent=text;
  androidUpdateAction(action, busy);
}
// phase: idle | downloading | verifying | permission | installer | error
function renderAndroidUpdate(phase, progress){
  if(!APP_UPDATE)return;
  APP_UPDATE.phase=phase;
  if(phase==='downloading'){
    androidUpdateStatus(progress>=0?t('update.downloading',{progress}):t('update.downloadingUnknown'),t('update.cancel'),false);
  }else if(phase==='verifying'){
    androidUpdateStatus(t('update.verifying'),'…',true);
  }else if(phase==='permission'){
    androidUpdateStatus(t('update.permission'),t('update.action'),false);
  }else if(phase==='installer'){
    androidUpdateStatus(t('update.installer'),t('update.action'),false);
  }else if(phase==='error'){
    androidUpdateStatus(t('update.failed'),t('update.retry'),false);
  }else{
    androidUpdateStatus(APP_UPDATE.idleText||t('update.availableText'),t('update.action'),false);
  }
}
function renderAndroidUpdateProgress(event){
  if(!APP_UPDATE||APP_UPDATE.channel!=='direct')return;
  const status=String((event&&event.status)||'');
  const progress=Math.max(-1,Math.min(100,Math.round(+(event&&event.progress)||0)));
  if(status==='downloading'){ APP_UPDATE.busy=true; renderAndroidUpdate('downloading',progress); }
  else if(status==='verifying'||status==='ready'){ APP_UPDATE.busy=true; renderAndroidUpdate('verifying'); }
  else if(status==='permission'){ renderAndroidUpdate('permission'); }
  else if(status==='installer'){ APP_UPDATE.busy=false; renderAndroidUpdate('installer'); }
  else if(status==='cancelled'){ APP_UPDATE.busy=false; renderAndroidUpdate('idle'); }
  else if(status==='error'){ APP_UPDATE.busy=false; renderAndroidUpdate('error'); }
}
async function finishDirectUpdateResult(result){
  if(!APP_UPDATE)return false;
  const status=String((result&&result.status)||'');
  // загрузка уже шла — прогресс продолжит приходить событиями, баннер уже показывает её
  if(status==='in_progress'){ APP_UPDATE.busy=true; return true; }
  APP_UPDATE.busy=false;
  if(status==='permission_required'){
    APP_UPDATE.awaitingPermission=true;
    renderAndroidUpdate('permission');
    return true;
  }
  APP_UPDATE.awaitingPermission=false;
  if(status==='installer_opened'){ renderAndroidUpdate('installer'); return true; }
  if(status==='cancelled'){ renderAndroidUpdate('idle'); return false; }
  if(status==='missing'||status==='error'||status==='unsupported'){
    renderAndroidUpdate('error');
    return false;
  }
  return true;
}
async function openAndroidUpdate(){
  if(!APP_UPDATE || !APP_UPDATE.url) return false;
  if(APP_UPDATE.channel==='direct'){
    if(!appRuntimeCompat.hasNative('installUpdate')){
      renderAndroidUpdate('error');
      return false;
    }
    // нажатие во время загрузки — «Отменить»; во время проверки файла — ничего
    if(APP_UPDATE.busy){
      if(APP_UPDATE.phase==='downloading') await appRuntimeCompat.cancelUpdate();
      return false;
    }
    APP_UPDATE.busy=true;
    renderAndroidUpdate('downloading',-1);
    const result=await appRuntimeCompat.installUpdate(APP_UPDATE.url,APP_UPDATE.latest);
    return finishDirectUpdateResult(result);
  }
  if(await appRuntimeCompat.openExternal(APP_UPDATE.url)) return true;
  return false;
}
// Баннер пересобирается при каждом обновлении настроек (в том числе после
// сворачивания): подхватываем загрузку, которая уже идёт или оборвалась.
async function restoreAndroidUpdateState(){
  if(!APP_UPDATE||APP_UPDATE.channel!=='direct'||!appRuntimeCompat.hasNative('getUpdateState'))return;
  const st=await appRuntimeCompat.getUpdateState();
  if(!APP_UPDATE||!st)return;
  const status=String(st.status||'');
  if(st.running){
    APP_UPDATE.busy=true;
    if(status==='verifying'||status==='ready') renderAndroidUpdate('verifying');
    else renderAndroidUpdate('downloading',Math.max(-1,Math.round(+st.progress||-1)));
  }else if(status==='error'){
    renderAndroidUpdate('error');
  }
}
async function resumePendingAndroidUpdate(){
  if(!APP_UPDATE||APP_UPDATE.channel!=='direct'||!APP_UPDATE.awaitingPermission||APP_UPDATE.busy)return;
  if(!appRuntimeCompat.hasNative('resumeUpdateInstall'))return;
  APP_UPDATE.busy=true;
  APP_UPDATE.awaitingPermission=false;
  const result=await appRuntimeCompat.resumeUpdateInstall(APP_UPDATE.latest);
  await finishDirectUpdateResult(result);
}
window.addEventListener('fitUpdateProgress',e=>renderAndroidUpdateProgress((e&&e.detail)||{}));
window.addEventListener('fitAppForeground',()=>setTimeout(()=>resumePendingAndroidUpdate(),180));

async function applyAndroidUpdateConfig(raw){
  const banner=$('appUpdateBanner'),gate=$('appUpdateGate');
  if(banner) banner.classList.add('hidden');
  if(gate) gate.classList.add('hidden');
  APP_UPDATE_PREV=APP_UPDATE;
  APP_UPDATE=null;
  if(!raw || !appRuntimeCompat.isNative()) return;
  if(typeof analyticsPlatform === 'function' && analyticsPlatform() !== 'android') return;

  const info=await appRuntimeCompat.getAppInfo();
  const distribution=String((info&&info.distribution)||'direct')==='store'?'store':'direct';
  const cfg=distribution==='store'
    ? ((raw.store&&typeof raw.store==='object')?raw.store:{})
    : ((raw.direct&&typeof raw.direct==='object')?raw.direct:raw);
  const latest=Math.max(0,Math.round(+cfg.latestCode||0));
  const minimum=Math.max(0,Math.round(+cfg.minimumCode||0));
  if(!latest || !cfg.url) return;
  const current=Math.max(0,Math.round(+(info&&info.build)||0));
  if(!current || current>=latest) return;

  const required=minimum>0 && current<minimum;
  const suffix=cfg.latestName ? ' · '+String(cfg.latestName) : '';
  const custom=(appLocale==='en' ? cfg.messageEn : cfg.messageRu) || '';
  const prev=APP_UPDATE_PREV;
  APP_UPDATE={url:String(cfg.url),latest,minimum,current,required,channel:distribution,busy:false,
    awaitingPermission:!!(prev&&prev.latest===latest&&prev.awaitingPermission),phase:'idle',
    idleText:custom||t(required?'update.requiredText':'update.availableText')};

  if(required){
    if($('appUpdateGateTitle')) $('appUpdateGateTitle').textContent=t('update.requiredTitle',{version:suffix});
    if($('appUpdateGateText')) $('appUpdateGateText').textContent=custom||t('update.requiredText');
    if($('appUpdateNow')) $('appUpdateNow').onclick=()=>openAndroidUpdate();
    if(gate) gate.classList.remove('hidden');
    await restoreAndroidUpdateState();
    return;
  }
  if($('appUpdateTitle')) $('appUpdateTitle').textContent=t('update.availableTitle');
  if($('appUpdateText')) $('appUpdateText').textContent=custom||t('update.availableText');
  androidUpdateAction(t('update.action'),false);
  if(banner){
    banner.onclick=()=>openAndroidUpdate();
    banner.classList.remove('hidden');
  }
  await restoreAndroidUpdateState();
}
async function loadPublicConfig(){
  try{
    const res = await fetch(API_BASE + '/api/config', {cache:'no-store'});
    if(!res.ok) return;
    const cfg = await res.json();
    if(cfg && cfg.prices && cfg.prices.USD) REMOTE_PRICES = cfg.prices;
    renderPlan(); renderPremium();
    await applyAndroidUpdateConfig(cfg && cfg.update && cfg.update.android);
  }catch(e){}
}
function planUntil(plan, from){
  const d = new Date(from || Date.now());
  if(plan === 'year') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
// «10 сентября 2027 г.» в конце фразы даёт двойную точку и лишний хвост — убираем «г.»
const humanDate = iso => new Intl.DateTimeFormat(localeTag(), {day:'numeric', month:'long', year:'numeric'}).format(new Date(iso));
// цена за месяц при годовой оплате: округляем до точности самой цены, иначе
// в рублях получается «249,17 ₽», чего не бывает ни в одном ценнике
function perMonth(pr, cur){
  const v = pr.year / 12;
  return money((Math.round(pr.month * 100) % 100) ? Math.round(v * 100) / 100 : Math.round(v), cur);
}
// цена продления берётся из подписки, а не из сегодняшней таблицы: человек платит
// по той цене, по которой оформлял
const subPrice = ()=> (account.sub ? money(account.sub.price, account.sub.currency) : '');

let pmPlan = 'year';   // годовой выбран заранее: он выгоднее и человеку, и продукту

function renderPremium(){
  const cur = userCurrency(), pr = priceTable(), on = isPremium();
  setShown('pmState', on);
  setShown('pmPlans', !on);
  setShown('pmBuy', !on);
  if(on){
    $('pmStateTitle').textContent = t('premium.until',{date:humanDate(account.sub.until)});
    $('pmStateSub').textContent = account.sub.autoRenew
      ? t(account.sub.plan === 'year' ? 'premium.autoYear' : 'premium.autoMonth',{price:subPrice()})
      : t('premium.renewOff');
    $('pmFine').textContent = t('premium.manageAccount');
    return;
  }
  const save = Math.round((1 - pr.year / (pr.month * 12)) * 100);
  const box = $('pmPlans');
  box.innerHTML = '';
  [['month', t('premium.month')], ['year', t('premium.year')]].forEach(([k, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pm-plan' + (pmPlan === k ? ' act' : '');
    const per = k === 'year' ? t('premium.perMonth',{price:perMonth(pr, cur)}) : t('premium.monthlyCharge');
    b.innerHTML = (k === 'year' && save > 0 ? `<span class="pp-badge">${t('premium.saveBadge',{percent:save})}</span>` : '')
      + `<b></b><span class="pp-price"></span><small></small>`;
    b.querySelector('b').textContent = label;
    b.querySelector('.pp-price').textContent = money(pr[k], cur);
    b.querySelector('small').textContent = per;
    b.onclick = ()=>{ pmPlan = k; renderPremium(); };
    box.appendChild(b);
  });
  $('pmBuy').textContent = t('premium.buyFor',{price:money(pr[pmPlan], cur)});
  $('pmFine').textContent = pmPlan === 'year'
    ? t('premium.yearFine',{price:money(pr.year, cur)})
    : t('premium.monthFine',{price:money(pr.month, cur)});
}

// Тариф на «Аккаунте», данные аккаунта и баннер на главной — одно состояние,
// показанное в трёх местах, поэтому и обновляются они одной функцией.
/* Версия приложения: дата и короткое имя правки, чтобы по экрану сразу было видно,
   какая сборка сейчас у человека на телефоне. */
function renderBuild(){
  const el = $('buildLine');
  if(el) el.textContent = t('account.version') + ' ' + FIT_TIMER_BUILD + ' · ' + t('account.buildNote');
}

function renderPlan(){
  renderBuild();
  if(!account) return;   // экран может отрисоваться раньше, чем аккаунт прочитан с диска
  const on = isPremium(), pr = priceTable(), cur = userCurrency();
  $('planTitle').textContent = on ? t('premium.title') : t('premium.freePlan');
  $('planSub').textContent = on
    ? t('premium.untilShort',{date:humanDate(account.sub.until)}) + ' · ' + t(account.sub.autoRenew ? 'premium.renews' : 'premium.renewDisabled')
    : t('premium.freePitch',{price:perMonth(pr, cur)});
  // купленное больше не продаём: баннер уходит с главной
  setShown('btnPremium', !on);
  $('pbSub').textContent = t('premium.bannerPitch',{price:perMonth(pr, cur)});

  // Два состояния карточки. Без аккаунта на экране не должно быть ни «Данных
  // аккаунта», ни «Удалить аккаунт»: удалять нечего, а название пугает человека,
  // который ничего не заводил.
  const has = !!(account && account.email);
  $('accCardTitle').textContent = has ? t('account.dataTitle') : t('common.account');
  $('wipeCardTitle').textContent = has ? t('account.deleteAccountTitle') : t('account.deleteDataTitle');
  setShown('accNone', !has);
  setShown('rowEmail', has);
  setShown('rowHandle', has && !!account.handle);
  setShown('btnSignOut', has);
  setShown('rowRenew', has && on);
  setShown('rowBio', has && nativeBiometryHost());
  $('btnWipeAccount').textContent = has ? t('account.deleteAccountButton') : t('account.deleteAllButton');
  $('wipeNote').textContent = has
    ? t('account.deleteAccountNote')
    : t('account.deleteLocalNote');
  if(has){
    $('accEmail').textContent = account.email;
    $('accHandle').textContent = account.handle || '';
    showSyncState(syncState);
    // Подпись под переключателем не нужна: он переехал под строку тарифа, где уже
    // написано, какой тариф и до какого числа.
    if(on) $('tglRenew').classList.toggle('on', !!account.sub.autoRenew);
    $('tglBio').classList.toggle('on', !!(account.biometry && account.biometry.enabled));
  }
}

/* Подписка живёт на АККАУНТЕ, а аккаунт — на почте, и почта обязана быть
   подтверждённой. Раньше её просто набирали в поле: на новом телефоне человек
   вводил тот же адрес, получал пустой аккаунт без подписки и был прав, считая,
   что у него отобрали оплаченное. Опечатка в адресе давала то же самое, только
   без шанса догадаться.

   Поэтому оформление проходит тот же код на почту, что и обычный вход, — и
   отдельной «регистрации» тут по-прежнему нет: аккаунта с этой почтой не было —
   он заводится этим же кодом. */
async function completePurchase(){
  const email = ($('payEmail').value || '').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)){
    appAlert(t('login.emailTypo'));
    return;
  }
  const cur = userCurrency(), pr = priceTable(), now = new Date().toISOString();
  const sub = {plan: pmPlan, since: now, until: planUntil(pmPlan),
               currency: cur, price: pr[pmPlan], autoRenew: true};

  // Своя же подтверждённая почта — спрашивать код второй раз незачем.
  if((account.email || '').toLowerCase() === email && account.syncToken){ await grantSub(email, sub); return; }

  $('payModal').classList.remove('open');
  openLogin(async ()=> { await grantSub(email, sub); },
    {email, sub, label: t('login.emailVerification'),
     msg: t('login.verificationMsg',{email})});
}

async function grantSub(email, sub){
  const now = new Date().toISOString();
  account.email = email;
  account.linkedAt = account.linkedAt || now;
  account.sub = sub;
  pendingSub = null;
  rememberAccount();
  await saveAccount();
  await saveKnown();
  // почта — часть личности аккаунта: с ней данные найдутся на новом телефоне
  if(identity){ identity.email = email; await saveIdentity(); }
  recordConsent('offer');
  $('payModal').classList.remove('open');
  $('premiumModal').classList.remove('open');
  $('pokLead').textContent = t('premium.purchaseSuccess',{date:humanDate(account.sub.until),email});
  setShown('pokBio', bioOK && !(account.biometry && account.biometry.enabled));
  $('premiumOkModal').classList.add('open');
  renderPlan(); renderPremium();
  connectAccountSync().catch(()=>{});
}

/* ---- вход и выход ---- */

/* Вход по коду на почту. Пароля нет намеренно: его пришлось бы придумать,
   запомнить и где-то восстанавливать — то есть завести вторую такую же задачу
   поверх первой. Код на почту доказывает ровно то же самое.

   Отдельной регистрации тоже нет. Если аккаунта с этой почтой не было, он
   заводится этим же кодом: форма «войти» и форма «зарегистрироваться» отличались
   бы только заголовком, а человеку пришлось бы угадывать, в какую он попал.

   Аккаунт бесплатный. Подписка — про синхронизацию и каталог, а не про право
   иметь себя; связывать их значило бы отбирать у человека его ник вместе с
   неоплаченным месяцем. */
let loginDone = null;
let loginStep = 1;
let loginPending = null;
let loginFixedEmail = '';
/* Подписка, которую оформляют прямо сейчас. Лежит ОТДЕЛЬНО от account.sub и на
   диск не попадает: пока почта не подтверждена, подписки нет — ни на экране, ни
   после перезапуска. Уходит на сервер тем же запросом, которым подтверждается
   почта, и обнуляется, чем бы дело ни кончилось. */
let pendingSub = null;

function openLogin(after, opts){
  opts = opts || {};
  loginDone = after || null;
  pendingSub = opts.sub || null;
  loginPending = null;
  loginFixedEmail = opts.fixedEmail ? String(opts.email || '').trim().toLowerCase() : '';
  loginStep = 1;
  $('loginLabel').textContent = opts.label
    || ((account && account.email) ? t('login.otherAccount') : t('common.account'));
  $('loginMsg').textContent = opts.msg
    || t('login.intro');
  $('loginEmail').value = loginFixedEmail || opts.email || (account && account.email) || '';
  $('loginEmail').readOnly = !!loginFixedEmail;
  $('loginCode').value = '';
  $('loginHandle').value = '';
  $('loginErr').textContent = '';
  $('loginCodeHint').textContent = '';
  setShown('loginStep1', true);
  setShown('loginStep2', false);
  setShown('loginStep3', false);
  $('loginGo').textContent = t('login.sendCode');
  $('loginModal').classList.add('open');
  setTimeout(()=> $('loginEmail').focus(), 60);
}

function loginUseExistingCode(){
  const email = loginFixedEmail || ($('loginEmail').value || '').trim().toLowerCase();
  $('loginErr').textContent = '';
  if(!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)){
    $('loginErr').textContent = t('login.addressTypo');
    $('loginEmail').focus();
    return;
  }
  loginStep = 2;
  setShown('loginStep1', false);
  setShown('loginStep2', true);
  $('loginMsg').textContent = t('login.haveCodeMsg',{email});
  $('loginCodeHint').textContent = t('login.haveCodeHint');
  $('loginGo').textContent = t('login.signIn');
  setTimeout(()=> $('loginCode').focus(), 80);
}

async function finishVerifiedLogin(r, email, cleanInstall, switchingAccount){
  const btn = $('loginGo');
  const now = new Date().toISOString();
  if(switchingAccount) account.deletedProfiles = [];
  account.email = email;
  account.handle = r.handle || '';
  account.locale = r.locale || account.locale || appLocale;
  account.linkedAt = switchingAccount ? now : (account.linkedAt || now);
  account.sub = r.sub || null;
  if(r.syncToken) account.syncToken = r.syncToken;
  if(r.locale) await setAppLocale(r.locale, {persist:true});
  rememberAccount();
  await saveAccount();
  await saveKnown();
  if(identity){ identity.email = email; await saveIdentity(); }
  if(typeof syncRemotePushRegistration === 'function') syncRemotePushRegistration(false).catch(()=>{});
  if(switchingAccount) await loadTrainer();

  if(r.handle){
    if(!trainer) trainer = {on: false, handle: '', links: ''};
    trainer.handle = r.handle;
    if(r.trainerKey) trainer.key = r.trainerKey;
    const trainerRemote = r.trainer || {};
    // Сам ник ещё не делает человека тренером. Режим включён только если у
    // аккаунта действительно существует сохранённая публичная страница.
    trainer.on = !!r.trainer;
    if(r.trainer){
      ['name', 'photo', 'about', 'links'].forEach(k => { trainer[k] = trainerRemote[k] || ''; });
      trainer.years = trainerRemote.years == null ? null : trainerRemote.years;
    }
    trainer.pageErr = null;
    await saveTrainer();
    if(Array.isArray(clients) && clients.length) await saveClients();
  }

  renderPlan(); renderPremium(); syncGeminiBtns();
  renderTrainerCard(); syncDockTabs();
  // Вход с экрана знакомства: профиля на телефоне ещё нет, и без него синхронизация
  // не запускалась. Потом появлялся пустой «Мой профиль», уезжал в аккаунт отдельным
  // профилем и оставался активным. Заводим его до синхронизации — она заменит его
  // профилями аккаунта.
  let done = null;
  if(!identity && loginDone){ done = loginDone; loginDone = null; await done(); }
  let synced = true;
  if(isPremium()){
    btn.textContent = t('login.syncing');
    $('loginMsg').textContent = t('login.syncingMsg');
    synced = await connectAccountSync({replaceLocal: cleanInstall && !r.fresh});
  }
  $('loginModal').classList.remove('open');
  loginPending = null;
  loginFixedEmail = '';
  $('loginEmail').readOnly = false;
  if(!done && loginDone){ done = loginDone; loginDone = null; await done(); }
  if(done) return;
  pendingSub = null;
  appAlert(!synced
    ? t('login.syncPending')
    : r.fresh
    ? t('login.created',{handle:r.handle})
    : (r.trainerKey
        ? t('login.welcomeTrainer',{handle:r.handle})
        : t('login.done')));
}

async function doLogin(){
  const btn = $('loginGo');
  const email = loginPending ? loginPending.email : (loginFixedEmail || ($('loginEmail').value || '').trim().toLowerCase());
  $('loginErr').textContent = '';
  if(!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)){
    $('loginErr').textContent = t('login.addressTypo');
    return;
  }
  btn.disabled = true;
  const back = btn.textContent;
  try{
    if(loginStep === 3){
      const handle = normHandle($('loginHandle').value);
      if(!/^@[\wа-яё.\-]{2,29}$/i.test(handle)){
        $('loginErr').textContent = t('login.handleRule');
        return;
      }
      btn.textContent = t('login.savingHandle');
      const p = loginPending;
      const claimed = await apiPost('/api/auth', {
        action:'set_handle', email:p.email, deviceId:p.deviceId,
        syncToken:p.r.syncToken, handle,
        trainerKey: !p.switchingAccount && trainer ? (trainer.key || '') : ''
      });
      p.r.handle = claimed.handle;
      p.r.needsHandle = false;
      await finishVerifiedLogin(p.r, p.email, p.cleanInstall, p.switchingAccount);
      return;
    }
    if(loginStep === 1){
      btn.textContent = t('login.sending');
      const r = await apiPost('/api/auth', {action: 'send', email, locale: appLocale});
      loginStep = 2;
      setShown('loginStep1', false);
      setShown('loginStep2', true);
      $('loginMsg').textContent = t('login.sent',{email});
      // Локальный запуск письма не шлёт — код приходит прямо в ответе, иначе
      // сценарий нельзя прогнать, не заведя настоящий ящик.
      $('loginCodeHint').textContent = r.devCode ? t('login.devCode',{code:r.devCode}) : '';
      if(r.devCode) $('loginCode').value = r.devCode;
      btn.textContent = t('login.signIn');
      setTimeout(()=> $('loginCode').focus(), 120);
      return;
    }

    btn.textContent = t('login.checking');
    const cleanInstall = !(await hasMeaningfulLocalData());
    const previousEmail = String((account && account.email) || '').toLowerCase();
    const switchingAccount = !!previousEmail && previousEmail !== email;
    let loginDeviceId = await kvGet('deviceId');
    if(!loginDeviceId){ loginDeviceId = newId(); await kvSet('deviceId', loginDeviceId); }
    const r = await apiPost('/api/auth', {
      action: 'verify', email, code: ($('loginCode').value || '').replace(/\D/g, ''),
      deviceId: loginDeviceId,
      // Ник и ключ отдаём вместе с кодом: если человек завёл ник до аккаунта,
      // он привяжется к нему сразу, а не потребует второго действия.
      handle: !switchingAccount && trainer && trainer.handle ? normHandle(trainer.handle) : '',
      trainerKey: !switchingAccount && trainer ? (trainer.key || '') : '',
      // Premium — только серверное право. Локальный account.sub является кэшем
      // интерфейса и никогда не отправляется как доказательство подписки.
      locale: appLocale,
      platform: (typeof analyticsPlatform === 'function') ? analyticsPlatform() : 'web'
    });
    if(r.needsHandle || !r.handle){
      loginPending = {r, email, cleanInstall, switchingAccount, deviceId:loginDeviceId};
      loginStep = 3;
      setShown('loginStep2', false);
      setShown('loginStep3', true);
      $('loginLabel').textContent = t('login.createTitle');
      $('loginMsg').textContent = t('login.chooseHandle');
      btn.textContent = t('login.createAccount');
      setTimeout(()=> $('loginHandle').focus(), 120);
      return;
    }
    await finishVerifiedLogin(r, email, cleanInstall, switchingAccount);
  }catch(e){
    $('loginErr').textContent = e && e.code === 'handle_taken'
      ? t('login.handleTaken')
      : e && e.code === 'bad_handle'
      ? t('login.handleRule')
      : mailErrText(e);
    if(e && e.code === 'bad_code') $('loginCode').value = '';
    btn.textContent = loginStep === 1 ? t('login.sendCode') : loginStep === 3 ? t('login.createAccount') : t('login.signIn');
    return;
  } finally {
    btn.disabled = false;
    if(btn.textContent === t('login.sending') || btn.textContent === t('login.checking') || btn.textContent === t('login.savingHandle')) btn.textContent = back;
  }
}

// Выход отвязывает аккаунт от устройства, но не стирает тренировки: они лежат здесь же
// и принадлежат человеку, а не подписке. Для «стереть всё» есть отдельная кнопка ниже.
async function signOut(){
  if(!account.email) return;
  const ok = await appDialog(
    t('account.signOutQuestion',{email:account.email}),
    {confirm: true, okText: t('account.signOut'), cancelText: t('common.cancel')});
  if(!ok) return;
  try{ if(SYNC.adapter) await Promise.all([SYNC.push(), pushAccountDocs()]); }catch(e){}
  try{ if(typeof unregisterRemotePushServer === 'function') await unregisterRemotePushServer(); }catch(e){}
  SYNC.adapter = null;
  rememberAccount();
  await saveKnown();
  account = blankAccount();
  await saveAccount();
  if(identity){ identity.email = null; await saveIdentity(); }
  await loadTrainer();
  renderPlan(); renderPremium(); syncGeminiBtns();
  renderTrainerCard(); syncDockTabs();
  goTab('scrAccount');
}

/* ---- вход по биометрии ---- */
// На Android/iOS это локальная защита приватности, а не второй способ авторизации
// аккаунта. Первый вход и восстановление доступа всегда остаются через email + OTP.
// Биометрия только открывает уже авторизованное приложение на этом устройстве.
let bioState = {available:false, reason:'unsupported'};
let bioLastResult = null;
let bioRelockDeferred = false;
const BIO_RELOCK_MS = 10 * 60 * 1000;

function nativeBiometryHost(){
  return appRuntimeCompat.hasNative('biometricStatus','authenticateBiometric');
}
function bioReason(reason){
  if(reason === 'not_enrolled') return t('bio.notEnrolled');
  if(reason === 'temporarily_unavailable') return t('bio.unavailable');
  if(reason === 'lockout') return t('bio.lockout');
  if(reason === 'cancelled') return t('bio.cancelled');
  if(reason === 'unsupported') return t('bio.unsupported');
  return t('bio.refused');
}
async function bioSupported(){
  if(!nativeBiometryHost()){
    bioState = {available:false, reason:'unsupported'};
    return false;
  }
  try{
    const state = await appRuntimeCompat.biometricStatus();
    bioState = state && typeof state === 'object' ? state : {available:false, reason:'unsupported'};
    return bioState.available === true;
  }catch(e){
    bioState = {available:false, reason:'temporarily_unavailable'};
    return false;
  }
}
async function requestNativeBiometry(){
  if(!nativeBiometryHost()) return {ok:false, error:'unsupported'};
  try{
    return await appRuntimeCompat.authenticateBiometric({
      title:t('lock.title'),
      reason:t('lock.prompt'),
      cancelText:t('common.cancel')
    });
  }catch(e){
    return {ok:false, error:'temporarily_unavailable'};
  }
}
async function bioEnable(){
  if(!account.email){ appAlert(t('bio.needAccount')); return false; }
  bioOK = await bioSupported();
  if(!bioOK){
    appAlert(t('bio.enableFailed',{error:bioReason(bioState.reason)}));
    return false;
  }
  const checked = await requestNativeBiometry();
  if(!checked || !checked.ok){
    if(!checked || checked.error !== 'cancelled'){
      appAlert(t('bio.enableFailed',{error:bioReason(checked && checked.error)}));
    }
    return false;
  }
  account.biometry = {enabled:true, kind:'native', at:new Date().toISOString()};
  rememberAccount();
  await saveAccount();
  await saveKnown();
  renderPlan();
  return true;
}
async function bioDisable(){
  if(!(await appConfirm(t('bio.disableQuestion')))) return;
  account.biometry = null;
  rememberAccount();
  await saveAccount();
  await saveKnown();
  renderPlan();
}
async function bioVerify(){
  bioLastResult = await requestNativeBiometry();
  return !!(bioLastResult && bioLastResult.ok);
}

/* ---- мягкая блокировка приватности ---- */
const lockNeeded = ()=> !!(nativeBiometryHost() && account && account.biometry
  && account.biometry.enabled && account.biometry.kind === 'native');
function openLock(){
  if(!lockNeeded()) return;
  bioRelockDeferred = false;
  $('lockMsg').textContent = t('lock.prompt');
  $('lockModal').classList.add('open');
  tryUnlock();   // системный prompt сразу, без лишнего тапа
}
async function tryUnlock(){
  if(!lockNeeded()){ $('lockModal').classList.remove('open'); return; }
  if(await bioVerify()){ $('lockModal').classList.remove('open'); return; }
  $('lockMsg').textContent = bioLastResult && bioLastResult.error && bioLastResult.error !== 'cancelled'
    ? t('lock.failedReason',{reason:bioReason(bioLastResult.error)})
    : t('lock.failed');
}
function maybeBiometricRelock(awayMs){
  if(!lockNeeded() || !(awayMs >= BIO_RELOCK_MS) || $('lockModal').classList.contains('open')) return;
  if($('scrWork') && $('scrWork').classList.contains('on')){
    bioRelockDeferred = true;
    return;
  }
  openLock();
}
function maybeRunDeferredBiometricLock(){
  if(!bioRelockDeferred || !lockNeeded()) return;
  if($('scrWork') && $('scrWork').classList.contains('on')) return;
  openLock();
}

