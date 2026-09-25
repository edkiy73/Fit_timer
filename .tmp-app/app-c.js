/* ================= ПОЛЬЗОВАТЕЛИ И ХРАНИЛИЩЕ ================= */
let users = [];
let currentUser = 'f'; // id текущего пользователя; данные пользователей полностью раздельны
const fitStorage = AppBaseStorage.createStorage({
  dbName: 'fittimer',
  storeName: 'kv',
  mirrorKeys: ['account'],
  externalStorage: () => window.storage || null,
  onWriteFailure: () => { try{ appAlert(t('storage.full')); }catch(_){} }
});
const pk = key => fitStorage.namespacedKey(key, currentUser);
const curUser = () => users.find(u => u.id === currentUser) || users[0];
async function kvGet(key){ return fitStorage.get(key); }
async function kvSet(key, val){ return fitStorage.set(key, val); }
async function kvDel(key){ await fitStorage.delete(key); }
async function kvClearAll(){ await fitStorage.clearAll(); }
async function saveUsers(){ await kvSet('users', JSON.stringify(users)); }
function validAge(v){
  if(v === '' || v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 5 && n <= 100 ? n : null;
}
// Одноразовая совместимость со старыми профилями и резервными копиями. Точная
// дата используется только в памяти для расчёта, после чего поле удаляется.
function legacyAge(v){
  if(!v) return null;
  const b = new Date(v); if(isNaN(b)) return null;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if(n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return validAge(a);
}
function profileAge(u){
  return validAge(u && u.age) || legacyAge(u && u.birth);
}
function migrateUserAge(u){
  if(!u || typeof u !== 'object') return u;
  const a = profileAge(u);
  if(a) u.age = a; else delete u.age;
  delete u.birth;
  return u;
}
function localISO(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
let customPrograms = [];
let stats = {totalSec: 0};
// Чей профиль сейчас лежит в customPrograms/stats. currentUser меняется раньше, чем
// приезжают данные нового профиля; сохранение в этом окне записало бы программы
// прежнего профиля под ключ нового — так они «растекались» по всем профилям.
let dataOwner = null;
// Старые версии позволяли незаметно записать поправку рабочего веса прямо во время
// тренировки. В редакторе при этом оставалась база (например, 6 кг), а на старте
// показывалось уже 4 кг. Такой второй источник веса удалён.
let progWeights = {};

/* Низкоуровневое local/IndexedDB-хранилище теперь принадлежит AppBase Storage Core.
   Здесь остаётся только FitTimer-конфигурация и совместимые kv* вызовы. */
async function analyticsDeviceId(){
  let id = await kvGet('deviceId');
  if(!id){
    id = newId();
    await kvSet('deviceId', id);
  }
  return id;
}
function analyticsPlatform(){
  try{
    if(window.Capacitor && typeof window.Capacitor.getPlatform === 'function'){
      const p = window.Capacitor.getPlatform();
      if(p === 'android' || p === 'ios') return p;
    }
  }catch(_){}
  return 'web';
}
const appObservability = AppBaseObservability.createClient({
  post: async body => {
    try{
      const res = await fetch('/api/auth',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
        keepalive:true,
        cache:'no-store'
      });
      return !!res.ok;
    }catch(_){ return false; }
  },
  deviceId: analyticsDeviceId,
  context: ()=> ({
    platform:analyticsPlatform(),
    locale:(typeof appLocale !== 'undefined' && appLocale === 'en') ? 'en' : 'ru',
    build:String(window.FIT_TIMER_BUILD || ''),
    premium:(typeof isPremium === 'function') ? !!isPremium() : false
  })
});
async function trackProductEvent(event){ return appObservability.track(event); }
async function trackInstallOnce(){
  if((await kvGet('analyticsInstallSent')) === '1') return;
  if(await trackProductEvent('install')) await kvSet('analyticsInstallSent','1');
}
function clientErrorPayload(kind, error, fallbackMessage){
  return appObservability.diagnosticPayload(kind === 'rejection' ? 'rejection' : 'error', error, fallbackMessage);
}
async function reportClientError(kind, error, fallbackMessage){
  return appObservability.capture(kind === 'rejection' ? 'rejection' : 'error', error, fallbackMessage);
}
window.addEventListener('error',e=>{
  reportClientError('error',e&&e.error,e&&e.message).catch(()=>{});
});
window.addEventListener('unhandledrejection',e=>{
  const r=e&&e.reason;
  reportClientError('rejection',r,r==null?'unhandled rejection':String(r)).catch(()=>{});
});

async function loadData(ownerId = currentUser){
  // Все чтения привязываем к профилю, который начал загрузку. Раньше pk() вычислялся
  // заново после каждого await: если в этот момент фоновая синхронизация и ручное
  // переключение профиля пересекались, данные могли приехать уже от другого профиля.
  const ownerKey = key => key + '_' + ownerId;
  let progRaw = await kvGet(ownerKey('customPrograms'));
  let statRaw = await kvGet(ownerKey('stats'));
  if(currentUser !== ownerId) return false;
  if(progRaw === null && (await kvGet('migrated')) !== '1'){
    const legacyP = await kvGet('customPrograms');
    const legacyS = await kvGet('stats');
    if(currentUser !== ownerId) return false;
    if(legacyP !== null){ progRaw = legacyP; await kvSet(ownerKey('customPrograms'), legacyP); }
    if(legacyS !== null){ statRaw = legacyS; await kvSet(ownerKey('stats'), legacyS); }
    await kvSet('migrated', '1');
  }

  let nextPrograms = [];
  let nextStats = {totalSec:0};
  try{ nextPrograms = JSON.parse(progRaw) || []; }catch(e){ nextPrograms = []; }
  nextPrograms.forEach(p => {
    if(!p || p.id === 'warmup' || p.locale === 'ru' || p.locale === 'en') return;
    const plans = Array.isArray(p.plans) ? p.plans : [];
    const sample = [p.name, p.desc].concat(plans.flatMap(pl => (pl.exercises || []).flatMap(ex => [ex.name, ex.desc, ex.mistakes, ex.swapName, ex.swapDesc]))).join(' ');
    p.locale = /[А-Яа-яЁё]/.test(sample) ? 'ru' : 'en';
  });
  try{ nextStats = JSON.parse(statRaw) || {totalSec:0}; }catch(e){ nextStats = {totalSec:0}; }
  if(typeof nextStats.totalSec !== 'number') nextStats.totalSec = 0;
  if(!Array.isArray(nextStats.weights)) nextStats.weights = [];
  if(!Array.isArray(nextStats.wellness)) nextStats.wellness = [];
  if(!Array.isArray(nextStats.history)) nextStats.history = [];
  if(typeof nextStats.count !== 'number') nextStats.count = 0;
  if(currentUser !== ownerId) return false;

  customPrograms = nextPrograms;
  stats = nextStats;
  dataOwner = ownerId;
  await loadProgWeights(ownerId);
  if(currentUser !== ownerId) return false;
  await loadTrainer();
  if(currentUser !== ownerId) return false;
  syncDockTabs();
  discardLegacyWeightCorrections(ownerId);
  return true;
}

// Удаляем накопленные прежними версиями скрытые поправки веса.
function discardLegacyWeightCorrections(ownerId = currentUser){
  if(currentUser !== ownerId) return;
  progWeights = {};
  kvSet('progWeights_' + ownerId, '{}');
  if(docMeta && docMeta.progWeights){ delete docMeta.progWeights; kvSet('docMeta_' + ownerId, JSON.stringify(docMeta)); }
  if(Array.isArray(outbox) && outbox.some(x => x.key === 'progWeights')){
    outbox = outbox.filter(x => x.key !== 'progWeights');
    kvSet('outbox_' + ownerId, JSON.stringify(outbox));
  }
}

// Переключение профиля сериализуем. Раньше два быстрых нажатия могли запустить
// loadIdentity/loadData одновременно: обе функции читают профильные ключи через
// currentUser, поэтому продолжение первого await уже могло читать данные второго
// профиля и оставлять их в глобальном состоянии приложения.
let profileSwitchQueue = Promise.resolve();
function queueProfileState(task){
  profileSwitchQueue = profileSwitchQueue
    .catch(()=>{})
    .then(task);
  return profileSwitchQueue;
}
function switchUser(id){
  return queueProfileState(()=> switchUserNow(id));
}
async function switchUserNow(id){
  if(currentUser === id) return;
  currentUser = id;
  await kvSet('currentUser', id);
  await loadIdentity(id);
  await loadData(id);
  // Язык включаем только после загрузки данных нового профиля: смена языка
  // пересохраняет встроенную разминку, и раньше это записывало программы прежнего
  // профиля в новый.
  await setAppLocale(profileLocalePreference(curUser()), {persist:false});
  await loadPhotos();
  await ensureWarmup();
  applyProgressionAll();
  applyAudioFromUser(curUser());
  const u = curUser();
  applyThemeFor(u);
  renderUsers();
  renderMine();
  renderStats();
  renderWeight();
  renderWellness();
  renderPhotos();
  syncSettingsForm(); // отсчёты и ключ ИИ — у каждого профиля свои
}

// Все профили — одинаковыми строками, у каждой одна и та же кнопка-карандаш.
// Активный отличается не формой, а меткой «сейчас» и рамкой: раньше он жил отдельной
// карточкой сверху, и понять, какой из них выбран, было невозможно.
function renderUsers(){
  const box = $('usersList'); box.innerHTML = '';
  users.forEach(u => {
    const act = u.id === currentUser;
    const row = document.createElement('div');
    row.className = 'user-row' + (act ? ' act' : '');
    const ua = u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc((u.name || '?')[0].toUpperCase());
    const bits = [];
    if(u.gender) bits.push(t(u.gender === 'm' ? 'common.male' : 'common.female'));
    const a = profileAge(u);
    if(a) bits.push(t('profile.ageYears',{count:a,years:appLocale === 'ru' ? plural(a,t('profile.yearOne'),t('profile.yearFew'),t('profile.yearMany')) : (a === 1 ? t('profile.yearOne') : t('profile.yearFew'))}));
    if(!act) bits.push(t('profile.switch'));
    row.innerHTML = `<div class="ua">${ua}</div><div class="ub"><b></b><small>${bits.join(' · ')}</small></div>`
      + (act ? `<span class="u-now">${esc(t('profile.now'))}</span>` : '')
      + `<button class="ue" title="${esc(t('profile.edit'))}">${icon('pencil')}</button>`;
    row.querySelector('b').textContent = u.name || t('profile.noName');
    row.querySelector('.ue').onclick = e => { e.stopPropagation(); openUserEdit(u.id); };
    // нажатие по строке активного профиля переключать некуда — открываем его правку
    row.onclick = ()=> act ? openUserEdit(u.id) : switchUser(u.id);
    box.appendChild(row);
  });
  $('usersHint').textContent = users.length > 1
    ? t('profile.multiHint')
    : t('profile.singleHint');
  renderAccount();
}

function renderAccount(){ renderPlan(); }

// Метрики тела: вес всегда есть, остальное — если человек это записывает.
// Жир и мышцы в процентах показывают умные весы, и без них вес врёт: минус два
// килограмма мышц и минус два килограмма жира на графике веса выглядят одинаково.
function weightSeries(){
  return [
    {k:'w',color:'var(--accent-ink)',label:t('progress.weight'),unit:t('progress.kg')},
    {k:'fat',color:'var(--danger)',label:t('progress.fatShort'),unit:'%'},
    {k:'musc',color:'var(--ok)',label:t('progress.muscleShort'),unit:'%'},
    {k:'waist',color:'var(--accent-ink)',label:t('progress.waistShort'),unit:t('progress.cm')},
    {k:'hips',color:'var(--rest-ink)',label:t('progress.hipsShort'),unit:t('progress.cm')},
    {k:'chest',color:'var(--warn)',label:t('progress.chestShort'),unit:t('progress.cm')}
  ];
}
function fmtMeasure(v){
  return new Intl.NumberFormat(localeTag(), {maximumFractionDigits:1}).format(Number(v));
}
let weightMetric = 'w';

function renderWeight(){
  const ws = stats.weights;
  $('btnWeightHist').innerHTML = icon('pencil') + t('progress.history');
  $('btnShareWeight').innerHTML = icon('share') + t('progress.share');

  if(!ws.length){
    $('weightDelta').textContent = '';
    setShown('weightNowRow', false);   // пустое состояние говорит само за себя ниже
    setShown('weightMeta', false);
    setShown('weightSwitch', false);
    setShown('weightCharts', false);
    setShown('weightActions', false);
    setShown('weightEmpty', true);
    return;
  }
  setShown('weightEmpty', false);
  setShown('weightActions', true);
  setShown('weightNowRow', true);

  const last = ws[ws.length - 1], prev = ws[ws.length - 2];
  $('weightNow').textContent = fmtMeasure(last.w) + ' ' + t('progress.kg');
  if(prev){
    const d = Math.round((last.w - prev.w) * 10) / 10;
    $('weightDelta').textContent = d === 0
      ? t('progress.noChange')
      : t('progress.sinceLast',{delta:(d > 0 ? '+' : '−') + fmtMeasure(Math.abs(d)),unit:t('progress.kg')});
    $('weightDelta').style.color = d > 0 ? 'var(--warn)' : (d < 0 ? 'var(--ok)' : 'var(--muted)');
  } else $('weightDelta').textContent = '';

  // в чипах остались только рост и ИМТ: замеры переехали в переключатель ниже,
  // где у каждого и значение, и свой график — раньше они дублировались дважды
  const meta = [];
  if(stats.height){
    meta.push(`<span class="chip">${esc(t('progress.height'))} <b>${fmtMeasure(stats.height)}</b> ${esc(t('progress.cm'))}</span>`);
    meta.push(`<span class="chip">${esc(t('progress.bmi'))} <b>${fmtMeasure(Math.round(last.w / Math.pow(stats.height/100,2)*10)/10)}</b></span>`);
  }
  $('weightMeta').innerHTML = meta.join('');
  setShown('weightMeta', meta.length);

  // ---- переключатель метрик вместо трёх одинаковых графиков подряд ----
  const avail = weightSeries().filter(s => ws.some(p => p[s.k] != null));
  if(!avail.some(s => s.k === weightMetric)) weightMetric = avail.length ? avail[0].k : 'w';
  $('weightSwitch').innerHTML = avail.map(s => {
    const pts = ws.filter(p => p[s.k] != null);
    const v = pts[pts.length - 1][s.k];
    return `<button type="button" class="wm-chip${s.k === weightMetric ? ' act' : ''}" data-k="${s.k}">
      <span>${s.label}</span><b>${fmtMeasure(v)}<small>${s.unit}</small></b></button>`;
  }).join('');
  setShown('weightSwitch', avail.length > 1);

  const cur = avail.find(s => s.k === weightMetric) || avail[0];
  const have = cur ? ws.map(p => (p[cur.k] != null) ? [p.d, p[cur.k]] : null).filter(Boolean).slice(-30) : [];
  $('weightCharts').innerHTML = have.length ? metricGraph(cur, have) : '';
  setShown('weightCharts', have.length);
}

// Один график метрики: сетка, плавная линия, заливка, подписи концов и дат.
// have2 — вторая линия той же метрики (нижнее давление): это не отдельная метрика,
// а вторая половина одного числа, и врозь «120» и «80» ничего не значат.
function metricGraph(s, have, have2){
  const W = 320, H = 148, padL = 10, padR = 10, padT = 26, padB = 26;
  const pair = Array.isArray(have2) && have2.length === have.length ? have2 : null;
  const vals = have.map(h => h[1]).concat(pair ? pair.map(h => h[1]) : []);
  const first = have[0][1], lastv = have[have.length - 1][1];
  const d = Math.round((lastv - first) * 10) / 10;
  const dCls = d < 0 ? 'down' : (d > 0 ? 'up' : 'flat');
  const du = s.unit;
  const dTxt = d === 0 ? t('progress.noChange') : `${d > 0 ? '+' : '−'}${fmtMeasure(Math.abs(d))} ${du || ''}`.trim();

  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.15, 0.5);
  min -= pad; max += pad;
  const span = Math.max(max - min, 1);
  const xAt = i => padL + (W - padL - padR) * (have.length === 1 ? 0.5 : i / (have.length - 1));
  const yAt = v => padT + (H - padT - padB) * (1 - (v - min) / span);
  const xy = have.map((h, i) => [Math.round(xAt(i) * 10) / 10, Math.round(yAt(h[1]) * 10) / 10]);

  // сглаженная линия (Catmull-Rom → Bezier)
  const smooth = pts => {
    let p = `M ${pts[0][0]} ${pts[0][1]}`;
    for(let i = 0; i < pts.length - 1; i++){
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      p += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
    }
    return p;
  };
  const path = smooth(xy);
  const xy2 = pair ? pair.map((h, i) => [xy[i][0], Math.round(yAt(h[1]) * 10) / 10]) : null;
  const gid = 'g_' + s.k;
  const area = path + ` L ${xy[xy.length-1][0]} ${H-padB} L ${xy[0][0]} ${H-padB} Z`;

  // горизонтальные линии сетки
  let grid = '';
  for(let g = 0; g <= 2; g++){
    const y = padT + (H - padT - padB) * g / 2;
    grid += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--line)" stroke-width="1" opacity="0.5"/>`;
  }

  const dots = xy.length === 1
    ? `<circle cx="${xy[0][0]}" cy="${xy[0][1]}" r="4" fill="${s.color}"/>`
    : `<circle cx="${xy[0][0]}" cy="${xy[0][1]}" r="3.5" fill="${s.color}"/><circle cx="${xy[xy.length-1][0]}" cy="${xy[xy.length-1][1]}" r="4.5" fill="${s.color}"/>`;

  // подписи значений у концов. У парной метрики подписываем обе половины сразу
  // («120/80»): нижнюю линию без числа рядом всё равно не прочитать.
  const num = v => fmtMeasure(v);
  const capA = pair ? num(first) + '/' + num(pair[0][1]) : num(first);
  const capB = pair ? num(lastv) + '/' + num(pair[pair.length - 1][1]) : num(lastv);
  let labels = '';
  const ly0 = xy[0][1] < padT + 14 ? xy[0][1] + 17 : xy[0][1] - 11;
  labels += `<text x="${xy[0][0]}" y="${ly0}" text-anchor="start" font-size="12" font-weight="700" fill="var(--ink)">${capA}</text>`;
  if(xy.length > 1){
    const lp = xy[xy.length - 1];
    const lyN = lp[1] < padT + 14 ? lp[1] + 17 : lp[1] - 11;
    labels += `<text x="${lp[0]}" y="${lyN}" text-anchor="end" font-size="12" font-weight="700" fill="var(--ink)">${capB}</text>`;
  }
  // даты по краям: без них график не отвечал, за какой срок это движение
  let axis = `<text x="${padL}" y="${H - 6}" text-anchor="start" font-size="10.5" fill="var(--muted)">${shortD(have[0][0])}</text>`;
  if(have.length > 1) axis += `<text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="10.5" fill="var(--muted)">${shortD(have[have.length-1][0])}</text>`;

  return `<div class="metric-graph">
    <div class="mg-head">
      <span class="mg-delta ${dCls}">${dTxt}</span>
      <small>${s.label} · ${t('progress.records',{count:have.length,records:appLocale === 'ru' ? plural(have.length,t('progress.recordOne'),t('progress.recordFew'),t('progress.recordMany')) : (have.length === 1 ? t('progress.recordOne') : t('progress.recordFew'))})}</small>
    </div>
    <svg viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${s.color}" stop-opacity="0.22"/>
        <stop offset="1" stop-color="${s.color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      ${xy.length > 1 ? `<path d="${area}" fill="url(#${gid})"/>` : ''}
      ${xy.length > 1 ? `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${xy2 && xy2.length > 1 ? `<path d="${smooth(xy2)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" opacity="0.75"/>` : ''}
      ${xy2 ? xy2.map((p, i) => (i === 0 || i === xy2.length - 1) ? `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}" opacity="0.75"/>` : '').join('') : ''}
      ${dots}
      ${labels}
      ${axis}
    </svg>
  </div>`;
}
/* ================= САМОЧУВСТВИЕ =================
   Давление, пульс и сон. Живут в stats.wellness — внутри уже перечисленного
   в PROFILE_KEYS ключа stats, отдельного ключа хранилища не заводим.
   Запись — одна на день, как у веса: en = {d, sys, dia, pulse, sleep}.
   Давление — не две метрики, а одно число из двух половин: верхнее ведёт график,
   нижнее идёт второй линией и подписывается вместе с ним («120/80»).

   ОЦЕНКИ ДНЯ ЗДЕСЬ НЕТ. Три остальных показателя — измеренные числа: их даёт
   тонометр или телефон, и они сравнимы между собой и между днями. «4 из 5» такой
   же шкалой не является: сегодняшняя четвёрка и прошлогодняя — разные четвёрки,
   а график из них выглядит как измерение. Поле mood в уже сохранённых записях
   остаётся нетронутым — данные не трогаем, просто больше не показываем. */
function wellSeries(){
  return [
    {k:'sys',pair:'dia',color:'var(--danger)',label:t('progress.pressureShort'),unit:''},
    {k:'pulse',color:'var(--accent-ink)',label:t('progress.pulseShort'),unit:t('progress.bpm')},
    {k:'sleep',color:'var(--rest-ink)',label:t('progress.sleepShort'),unit:t('progress.hoursShort')}
  ];
}
const WELL_LIM = {sys: [70, 250], dia: [40, 160], pulse: [30, 220], sleep: [0, 16]};
let wellMetric = 'sys';

const wellList = ()=> Array.isArray(stats.wellness) ? stats.wellness : (stats.wellness = []);
// как метрика читается одной строкой: давление всегда парой, остальное — число с единицей
function wellValue(en, s){
  if(en[s.k] == null) return '';
  const v = fmtMeasure(en[s.k]);
  return s.pair && en[s.pair] != null ? v + '/' + fmtMeasure(en[s.pair]) : v;
}

// Средние за последние 30 дней — то, что показывает главная. Именно среднее, а не
// последняя запись: одно измерение давления ничего не говорит, а месяц — уже картина.
// Окно жёсткое: если за месяц не записано ничего, метрики на главной нет вовсе —
// прошлогодний пульс под заголовком «Прогресс» был бы враньём.
function wellAvg(){
  const from = new Date();
  from.setDate(from.getDate() - 29);
  const lo = localISO(from);
  const ws = wellList().filter(e => e.d >= lo);
  const avg = k => {
    const v = ws.map(e => e[k]).filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return {sys: avg('sys'), dia: avg('dia'), pulse: avg('pulse'), sleep: avg('sleep')};
}

function renderWellness(){
  const ws = wellList();
  $('btnWellHist').innerHTML = icon('pencil') + t('progress.history');
  $('btnShareWell').innerHTML = icon('share') + t('progress.share');
  if(!ws.length){
    setShown('wellNowRow', false);
    setShown('wellSwitch', false);
    setShown('wellCharts', false);
    setShown('wellActions', false);
    setShown('wellEmpty', true);
    return;
  }
  setShown('wellEmpty', false);
  setShown('wellActions', true);
  setShown('wellNowRow', true);

  // доступна метрика, которую хоть раз записали, — как у веса с обхватами
  const avail = wellSeries().filter(s => ws.some(p => p[s.k] != null));
  if(!avail.length){ setShown('wellNowRow', false); setShown('wellSwitch', false); setShown('wellCharts', false); return; }
  if(!avail.some(s => s.k === wellMetric)) wellMetric = avail[0].k;
  const cur = avail.find(s => s.k === wellMetric);

  $('wellSwitch').innerHTML = avail.map(s => {
    const pts = ws.filter(p => p[s.k] != null);
    const en = pts[pts.length - 1];
    return `<button type="button" class="wm-chip${s.k === wellMetric ? ' act' : ''}" data-k="${s.k}">
      <span>${s.label}</span><b>${wellValue(en, s)}${s.unit ? `<small>${s.unit}</small>` : ''}</b></button>`;
  }).join('');
  setShown('wellSwitch', avail.length > 1);

  // крупная цифра — значение выбранной метрики: та же роль, что у веса в карточке выше
  const pts = ws.filter(p => p[cur.k] != null);
  const lastEn = pts[pts.length - 1];
  $('wellNow').textContent = (wellValue(lastEn, cur) + ' ' + (cur.unit || '')).trim();
  $('wellWhen').textContent = t('progress.recordedOn',{date:shortD(lastEn.d)});
  $('wellWhen').style.color = 'var(--muted)';

  const have = pts.map(p => [p.d, p[cur.k]]).slice(-30);
  const have2 = cur.pair ? pts.map(p => [p.d, p[cur.pair]]).slice(-30) : null;
  const paired = have2 && have2.every(h => h[1] != null) ? have2 : null;
  $('wellCharts').innerHTML = have.length ? metricGraph(cur, have, paired) : '';
  setShown('wellCharts', have.length);
}

// ---- запись самочувствия ----
function openWellAdd(){
  const ws = wellList();
  const today = localISO(new Date());
  const en = ws.find(e => e.d === today) || {};
  // подставляем сегодняшнюю запись, если она уже есть: иначе вторая правка за день
  // выглядела бы как новая пустая форма, а сохранение молча перетирало бы прежнюю
  $('sysInput').value = en.sys || '';
  $('diaInput').value = en.dia || '';
  $('pulseInput').value = en.pulse || '';
  $('sleepInput').value = en.sleep != null ? en.sleep : '';
  $('wellModal').classList.add('open');
}
async function saveWell(){
  const num = (id, k) => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    return (!isNaN(v) && v >= WELL_LIM[k][0] && v <= WELL_LIM[k][1]) ? Math.round(v * 10) / 10 : null;
  };
  const sys = num('sysInput', 'sys'), dia = num('diaInput', 'dia');
  const pulse = num('pulseInput', 'pulse'), sleep = num('sleepInput', 'sleep');
  // половина давления бессмысленна: «верхнее 130» без нижнего не читается
  if((sys && !dia) || (dia && !sys)){ appAlert(t('well.pressurePair')); return; }
  if(!sys && !pulse && sleep == null){ appAlert(t('well.fillOne')); return; }
  // пульс и давление — сведения о здоровье, как вес и обхваты
  if(!hasConsent('health')) recordConsent('health');
  const ws = wellList();
  const today = localISO(new Date());
  let en = ws.find(e => e.d === today);
  if(!en){ en = {d: today}; ws.push(en); }
  const put = (k, v) => { if(v != null) en[k] = v; else delete en[k]; };
  put('sys', sys); put('dia', dia); put('pulse', pulse); put('sleep', sleep);
  ws.sort((a, b) => a.d < b.d ? -1 : 1);
  await saveStats();
  $('wellModal').classList.remove('open');
  renderWellness();
}

// ---- история самочувствия: та же правка задним числом, что и у веса ----
function openWellHist(){
  const list = $('wellHistList'); list.innerHTML = '';
  wellList().slice(-30).reverse().forEach(en => {
    const row = document.createElement('div');
    row.className = 'wh-row';
    const [y, m, d] = en.d.split('-');
    const inp = (k, st) => `<input type="number" step="${st || 1}" inputmode="decimal" value="${en[k] != null ? en[k] : ''}" data-k="${k}">`;
    const cell = (k, lbl, st) => `<div class="whc"><label>${lbl}</label>${inp(k, st)}</div>`;
    // давление — одна ячейка с двумя полями через косую черту: «Верхнее» и «Нижнее»
    // порознь выглядели как два разных показателя, и строка ехала в две ячейки враскоряку
    row.innerHTML =
      `<div class="wh-top"><b>${+d} ${MONTH_OF[+m - 1]} ${y}</b>` +
      `<button type="button" class="wh-del" title="${esc(t('progress.deleteEntry'))}">${icon('trash')}</button></div>` +
      `<div class="wh-cells wh-well" data-d="${en.d}">` +
        `<div class="whc"><label>${esc(t('progress.pressureShort'))}</label>` +
          `<span class="whp">${inp('sys')}<i>/</i>${inp('dia')}</span></div>` +
        cell('pulse', t('progress.pulseShort')) + cell('sleep', t('well.sleepHours'), 0.5) +
      `</div>`;
    row.querySelector('.wh-del').onclick = ()=> row.classList.toggle('del');
    list.appendChild(row);
  });
  $('wellHistModal').classList.add('open');
}
async function saveWellHist(){
  const ws = wellList();
  [...$('wellHistList').querySelectorAll('.wh-row')].forEach(row => {
    const d = row.querySelector('.wh-cells').dataset.d;
    const i = ws.findIndex(e => e.d === d);
    if(i < 0) return;
    if(row.classList.contains('del')){ ws.splice(i, 1); return; }
    const en = ws[i];
    Object.keys(WELL_LIM).forEach(k => {
      const v = parseFloat(String(row.querySelector(`input[data-k=${k}]`).value).replace(',', '.'));
      if(!isNaN(v) && v >= WELL_LIM[k][0] && v <= WELL_LIM[k][1]) en[k] = Math.round(v * 10) / 10;
      else delete en[k];
    });
    // запись без единого числа — пустая строка в истории, убираем вместе с днём
    if(!Object.keys(en).some(k => k !== 'd')) ws.splice(i, 1);
  });
  ws.sort((a, b) => a.d < b.d ? -1 : 1);
  await saveStats();
  $('wellHistModal').classList.remove('open');
  renderWellness();
}

/* ================= СИНХРОНИЗАЦИЯ С АККАУНТОМ =================
   Локальная копия остаётся основной для тренировки без сети. После подтверждения
   почты Премиум подключает серверный адаптер: сначала принимает изменения с других
   устройств, затем отправляет локальные и оставляет очередь до следующей связи.

   Почему именно это и почему сейчас:

   • ВЕРСИЯ СХЕМЫ у каждого документа. Сервер, получив запись от старой версии
     приложения, должен понимать, надо ли её преобразовать. Проставить версию задним
     числом нельзя: непомеченная запись неотличима от любой другой.
   • ОТМЕТКА ВРЕМЕНИ И НОМЕР РЕДАКЦИИ. Правило «побеждает более поздняя запись»
     не работает, если никто не знает, когда запись сделана. Это тоже не
     восстанавливается задним числом — поэтому заводим до, а не после.
   • ЖУРНАЛ ИЗМЕНЕНИЙ. Каждое сохранение попадает в очередь и доезжает после
     восстановления связи.
   • ИДЕНТИФИКАТОРЫ устройства и профиля. Один аккаунт может содержать несколько
     профилей, а каждое подтверждённое устройство получает собственный ключ доступа.
   • СОГЛАСИЯ С ДАТОЙ И ВЕРСИЕЙ. Когда человек согласился и с какой редакцией
     документа — единственное здесь, что не восстанавливается вообще никак.

   Фотографии в синхронизацию не входят намеренно: самые чувствительные данные,
   самый дорогой трафик и наименьшая польза от переноса между устройствами. */
const SCHEMA_VERSION = 1;
/* Документы, которые поедут на сервер; всё остальное — настройки устройства.

   Единица синхронизации — ОДНА ПРОГРАММА, а не весь их список. Иначе два устройства,
   правящие РАЗНЫЕ программы, растят редакцию одного и того же документа: на сервере
   они конфликтуют целиком, и любое разрешение конфликта теряет чью-то правку.
   Локально программы по-прежнему лежат одним ключом customPrograms — поштучно они
   только УЕЗЖАЮТ. Порядок и состав списка едут отдельным документом 'index': без него
   сервер не отличит «программу удалили» от «программа ещё не доехала». */
const SYNC_KEYS = FIT_SYNC_PROFILE_DOC_KEYS;
const PROGRAM_DOC = id => 'program:' + id;
const isSyncKey = key => FIT_SYNC_REGISTRY.accepts('profile', key);
// Короткий хеш строки. Нужен не для защиты, а чтобы понять «изменилось или нет» и не
// гонять на сервер программы, которых человек не трогал.
function docHash(s){
  let h = 5381;
  for(let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

let identity = null;   // {profileId, deviceId, createdAt, email, linkedAt}
let docMeta  = {};     // ключ -> {rev, at, schema}
let outbox   = [];     // [{key, rev, at}] — что ждёт отправки на сервер

// deviceId общий для устройства, profileId — свой у каждого профиля.
//
// Имя поля здесь важнее, чем кажется. Аккаунт на сервере будет ОДИН — почта, подписка,
// оплата, — а профилей внутри него несколько, ведь профили в приложении и есть разные
// люди. Поле, названное accountId, увезло бы эту путаницу в схему базы, и жила бы она
// там годами; переименовать до первого запроса — правка в десять строк, после — миграция
// с данными у всех.
async function loadIdentity(ownerId = currentUser){
  const ownerKey = key => key + '_' + ownerId;
  let dev = await kvGet('deviceId');
  if(!dev){ dev = newId(); await kvSet('deviceId', dev); }
  let nextIdentity = null;
  try{ nextIdentity = JSON.parse(await kvGet(ownerKey('identity'))) || null; }catch(e){ nextIdentity = null; }
  if(currentUser !== ownerId) return false;
  if(nextIdentity && !nextIdentity.profileId && nextIdentity.accountId){
    nextIdentity.profileId = nextIdentity.accountId;
    delete nextIdentity.accountId;
    await kvSet(ownerKey('identity'), JSON.stringify(nextIdentity));
  }
  if(!nextIdentity || !nextIdentity.profileId){
    nextIdentity = {profileId: newId(), createdAt: new Date().toISOString(), email: null, linkedAt: null, consents: {}};
    await kvSet(ownerKey('identity'), JSON.stringify(nextIdentity));
  }
  const owner = users.find(u => u.id === ownerId);
  if(owner && owner.profileId && owner.profileId !== nextIdentity.profileId){
    nextIdentity.profileId = owner.profileId;
    await kvSet(ownerKey('identity'), JSON.stringify(nextIdentity));
  } else if(owner && !owner.profileId){
    owner.profileId = nextIdentity.profileId;
    await saveUsers();
  }
  if(!nextIdentity.consents) nextIdentity.consents = {};
  nextIdentity.deviceId = dev;
  if(pendingConsents.length && currentUser === ownerId){
    pendingConsents.forEach(({kind, rec}) => { if(!nextIdentity.consents[kind]) nextIdentity.consents[kind] = rec; });
    pendingConsents = [];
    await kvSet(ownerKey('identity'), JSON.stringify(nextIdentity));
  }
  let nextMeta = {}, nextOutbox = [];
  try{ nextMeta = JSON.parse(await kvGet(ownerKey('docMeta'))) || {}; }catch(e){ nextMeta = {}; }
  try{ nextOutbox = JSON.parse(await kvGet(ownerKey('outbox'))) || []; }catch(e){ nextOutbox = []; }
  if(currentUser !== ownerId) return false;
  identity = nextIdentity;
  docMeta = nextMeta;
  outbox = nextOutbox;
  return true;
}
async function saveIdentity(){ await kvSet(pk('identity'), JSON.stringify(identity)); }

// Поднять редакцию документа и поставить его в очередь. Очередь схлопывается по ключу —
// на сервер уедет последнее состояние, а не история правок.
function bumpDoc(key, extra){
  const prev = docMeta[key] || {rev: 0};
  const at = new Date().toISOString();
  docMeta[key] = Object.assign({rev: prev.rev + 1, at, schema: SCHEMA_VERSION}, extra || {});
  outbox = outbox.filter(o => o.key !== key);
  outbox.push({key, rev: docMeta[key].rev, at});
}
async function flushMeta(uid, metaValue, outboxValue){
  // Фиксируем профиль и снимки ДО первого await. Иначе переключение профиля между
  // двумя kvSet записывало docMeta одному человеку, а outbox уже другому.
  const ownerId = uid || currentUser;
  const metaSnapshot = metaValue || docMeta;
  const outboxSnapshot = outboxValue || outbox;
  await kvSet('docMeta_' + ownerId, JSON.stringify(metaSnapshot));
  await kvSet('outbox_' + ownerId, JSON.stringify(outboxSnapshot));
}

// Одно сохранение документа: пишем значение, поднимаем редакцию, ставим в очередь.
// Все данные операции принадлежат uid, который был активен В МОМЕНТ нажатия Save.
async function saveDoc(key, value){
  const uid = currentUser;
  if(key === 'stats' && dataOwner !== uid) return;
  const valueJson = JSON.stringify(value);
  let meta = docMeta;
  let queue = outbox.slice();
  // не записалось — в очередь синхронизации не ставим: отправлять нечего
  if(!(await kvSet(key + '_' + uid, valueJson))) return;
  if(!isSyncKey(key)) return;

  const prev = meta[key] || {rev:0};
  const at = new Date().toISOString();
  meta = Object.assign({}, meta, {
    [key]: {rev:prev.rev + 1, at, schema:SCHEMA_VERSION}
  });
  queue = queue.filter(o => o.key !== key);
  queue.push({key, rev:meta[key].rev, at});
  await flushMeta(uid, meta, queue);

  // Глобальное состояние обновляем только если пользователь всё ещё на том же профиле.
  if(currentUser === uid){ docMeta = meta; outbox = queue; }
  queueAccountSync();
}

// Что уедет на сервер под этим ключом. Программы лежат в памяти одним списком, поэтому
// значение документа собирается здесь, а не читается из хранилища по имени ключа.
// null — это НАДГРОБИЕ: программу удалили, и сервер должен об этом узнать.
async function docValue(key, uid){
  const ownerId = uid || currentUser;
  if(key === 'index' || key.startsWith('program:')){
    const programs = parsed(await kvGet('customPrograms_' + ownerId), []);
    if(key === 'index') return JSON.stringify({order:(Array.isArray(programs) ? programs : []).map(p => p.id)});
    const id = key.slice('program:'.length);
    const p = (Array.isArray(programs) ? programs : []).find(x => String(x.id) === id);
    return p ? JSON.stringify(p) : null;
  }
  return await kvGet(key + '_' + ownerId);
}

// Единый шов обмена с сервером. Пока нет аккаунта, Премиума или сети, адаптера нет:
// приложение продолжает работать локально, а очередь ждёт следующего подключения.
// Переезд существующего пользователя на сервер. Руками ничего выгружать и заливать не
// нужно и не будет нужно: при первом подключении всё, что уже лежит на телефоне,
// помечается изменённым и уходит наверх обычной очередью — тем же путём, что и правки,
// сделанные офлайн. Резервная копия файлом остаётся отдельной ручной функцией.
async function markAllForSync(){
  for(const key of SYNC_KEYS) bumpDoc(key);
  for(const p of customPrograms) bumpDoc(PROGRAM_DOC(p.id), {h: docHash(JSON.stringify(p))});
  bumpDoc('index', {h: docHash(customPrograms.map(p => p.id).join(','))});
  await flushMeta();
}

const SYNC = {
  adapter: null,
  get connected(){ return !!SYNC.adapter; },
  // единственная точка входа для серверного адаптера
  async connect(adapter){
    SYNC.adapter = adapter;
    if(adapter.pull) await adapter.pull();
    await markAllForSync();
    return SYNC.push();
  },
  pending(){ return outbox.length; },
  async push(){
    // Фиксируем владельца очереди до первого await. Это старый путь синхронизации,
    // но он тоже не должен уметь отправить документы A под profileId профиля B.
    if(!SYNC.adapter || !identity) return {sent:0, offline:true};
    const uid = currentUser;
    const ident = Object.assign({}, identity);
    const batch = outbox.slice();
    const payload = [];
    for(const o of batch){
      const value = await docValue(o.key, uid);
      const gone = value === null && FIT_SYNC_REGISTRY.allowsDeleted('profile', o.key);
      if(value === null && !gone) continue;
      payload.push({
        key:o.key, rev:o.rev, at:o.at, schema:SCHEMA_VERSION,
        profileId:ident.profileId, deviceId:ident.deviceId,
        deleted:gone, value
      });
    }
    if(payload.length) await SYNC.adapter.push(payload);

    let queue = parsed(await kvGet('outbox_' + uid), []);
    queue = (Array.isArray(queue) ? queue : []).filter(o =>
      !batch.some(b => b.key === o.key && b.rev === o.rev)
    );
    await kvSet('outbox_' + uid, JSON.stringify(queue));
    if(currentUser === uid) outbox = queue;
    return {sent:batch.length};
  }
};

/* Серверный адаптер аккаунта. Ключ выдаётся только после кода на почту и отдельный
   для каждого устройства. Фото-прогресс здесь отсутствует даже как возможный ключ:
   на сервер уходят только stats, index и program:<id>. */
let syncTimer = null;
let syncBusy = null;
let syncUploadBusy = null;
let syncUploadAgain = false;
let syncReplaceLocal = false;
let syncState = 'idle';
let syncStep = 0;
let syncTotal = 0;
let syncDetail = '';

function showSyncState(state, step, total, detailKey){
  syncState = state;
  if(state === 'busy'){
    // Вызов только с state идёт из renderAccount(): он не должен стирать уже
    // показанный этап. Явные 0/0 используются там, где нужен обычный busy без прогресса.
    if(step !== undefined || total !== undefined || detailKey !== undefined){
      syncStep = +step || 0;
      syncTotal = +total || 0;
      syncDetail = detailKey || '';
    }
  }else{
    syncStep = 0;
    syncTotal = 0;
    syncDetail = '';
  }
  const el = $('accSync');
  if(!el) return;
  if(!account || !account.email) el.textContent = '';
  else if(!isPremium()) el.textContent = t('sync.premiumOnly');
  else if(state === 'busy' && syncStep && syncTotal && syncDetail){
    el.textContent = t('sync.progress',{step:syncStep,total:syncTotal,detail:t(syncDetail)});
  } else if(state === 'busy' && syncStep && syncTotal){
    el.textContent = t('sync.progressShort',{step:syncStep,total:syncTotal});
  } else if(state === 'busy') el.textContent = t('sync.busy');
  else if(state === 'ok') el.textContent = t('sync.ok');
  else if(state === 'error') el.textContent = t('sync.error');
  else el.textContent = t('sync.account');
}

async function syncApiPost(body){
  let last;
  for(let attempt = 0; attempt < 2; attempt++){
    try{
      return await apiFetch('/api/sync', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
        timeoutMs:15000
      });
    }catch(e){
      last = e;
      const transient = !e || !e.status || e.status >= 500 || e.name === 'AbortError';
      if(!transient || attempt) break;
      await new Promise(r => setTimeout(r, 700));
    }
  }
  throw last || new Error('sync_failed');
}

const accountAuth = () => ({
  email: (account && account.email) || '',
  token: (account && account.syncToken) || '',
  deviceId: (identity && identity.deviceId) || ''
});
const syncAuth = action => Object.assign({action}, accountAuth());
const syncProfileInt = (value, def, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : def;
};
const syncUser = u => ({
  id:u.profileId || u.id, name:u.name || '', gender:u.gender || '', age:profileAge(u),
  theme:u.theme || 'system',
  locale:profileLocalePreference(u),
  prepSec:syncProfileInt(u.prepSec, 5, 0, 30),
  readySec:syncProfileInt(u.readySec, 5, 0, 30),
  sideSec:syncProfileInt(u.sideSec, 10, 3, 60),
  voiceVol:syncProfileInt(u.voiceVol, 100, 0, 100),
  fxVol:syncProfileInt(u.fxVol, 100, 0, 100)
});
const remoteWins = (remote, local) => {
  if(!local) return true;
  const rr = Math.max(0, +(remote && remote.rev) || 0);
  const lr = Math.max(0, +(local && local.rev) || 0);
  if(rr !== lr) return rr > lr;
  // Одинаковая ревизия от другого устройства означает одновременное изменение
  // одной базы. Сервер уже сериализует такие push и возвращает принятую версию;
  // время телефона здесь намеренно не участвует.
  return String(remote.deviceId || '') !== String(local.deviceId || '');
};
const parsed = (raw, fallback) => { try{ return raw == null ? fallback : JSON.parse(raw); }catch(e){ return fallback; } };

const isPlaceholderProfile = u => {
  const name = String((u && u.name) || '').trim().toLowerCase();
  return (!name || name === 'мой профиль' || /^профиль\s*\d*$/.test(name))
    && !(u && u.gender) && !profileAge(u);
};
function remoteProfileHasData(r){
  return (r && Array.isArray(r.docs) ? r.docs : []).some(d => {
    if(!d || d.deleted) return false;
    if(String(d.key || '').startsWith('program:')){
      const p = parsed(d.value, null);
      return !!(p && p.id !== 'warmup');
    }
    if(d.key === 'index') return (parsed(d.value, {}).order || []).some(id => id !== 'warmup');
    if(d.key === 'stats'){
      const s = parsed(d.value, {});
      return (s.history || []).length > 0 || (+s.count || +s.totalSec || 0) > 0;
    }
    return false;
  });
}
async function localProfileHasData(uid){
  const programs = parsed(await kvGet('customPrograms_' + uid), []);
  const s = parsed(await kvGet('stats_' + uid), {});
  const photos = parsed(await kvGet('photos_' + uid), []);
  return (Array.isArray(programs) && programs.some(p => p && p.id !== 'warmup'))
    || (Array.isArray(s.history) && s.history.length > 0)
    || (+s.count || +s.totalSec || 0) > 0
    || (Array.isArray(photos) && photos.length > 0);
}

async function collapseEmptyLocalProfiles(active){
  const blanks = [];
  for(const u of users){
    if(isPlaceholderProfile(u) && !(await localProfileHasData(u.id))) blanks.push(u);
  }
  if(blanks.length < 2) return;
  const remoteIds = new Set((active || []).map(r => r.user && r.user.id).filter(Boolean));
  const keep = blanks.find(u => remoteIds.has(u.profileId || u.id))
    || blanks.find(u => u.id === currentUser) || blanks[0];
  for(const u of blanks){
    if(u === keep) continue;
    for(const k of PROFILE_KEYS) await kvDel(k + '_' + u.id);
  }
  users = users.filter(u => !blanks.includes(u) || u === keep);
  if(!users.some(u => u.id === currentUser)) currentUser = keep.id;
}

function mergeStatsDocs(local, remote, preferRemote){
  const a = local && typeof local === 'object' ? local : {};
  const b = remote && typeof remote === 'object' ? remote : {};
  const older = preferRemote ? a : b, newerDoc = preferRemote ? b : a;
  const out = Object.assign({}, older, newerDoc);
  const unite = (x, y, key) => {
    const map = new Map();
    (Array.isArray(x) ? x : []).concat(Array.isArray(y) ? y : []).forEach(v => {
      const k = key(v);
      if(k) map.set(k, v);
    });
    return [...map.values()];
  };
  out.history = unite(older.history, newerDoc.history, h => h && (h.id
    ? 'id:' + h.id
    : [h.d||'',h.t??'',h.pid||'',h.sec||0,h.plan||0].join('|')))
    .sort((x,y) => String(x.d||'').localeCompare(String(y.d||'')) || (+x.t||0)-(+y.t||0));
  out.weights = unite(older.weights, newerDoc.weights, x => x && (x.d || JSON.stringify(x)));
  out.wellness = unite(older.wellness, newerDoc.wellness, x => x && (x.d || JSON.stringify(x)));
  out.badges = [...new Set([].concat(b.badges || [], a.badges || []))];
  out.totalSec = out.history.length ? out.history.reduce((n,h)=>n+(+h.sec||0),0) : Math.max(+a.totalSec||0,+b.totalSec||0);
  out.count = out.history.length || Math.max(+a.count||0,+b.count||0);
  out.bestStreak = Math.max(+a.bestStreak||0,+b.bestStreak||0);
  out.totalKg = Math.max(+a.totalKg||0,+b.totalKg||0);
  out.hfDone = Math.max(+a.hfDone||0,+b.hfDone||0);
  return out;
}

async function applyRemoteSync(result){
  return queueProfileState(()=> applyRemoteSyncNow(result));
}
async function applyRemoteSyncNow(result){
  await applyRemoteAccountDocs(result);
  const remote = Array.isArray(result && result.profiles) ? result.profiles : [];
  if(!remote.length) return;
  let active = remote.filter(r => !r.deleted);

  // Старый клиент мог несколько раз выгрузить технический пустой «Мой профиль».
  // Содержательные профили никогда не склеиваем; среди пустых оставляем один, а
  // остальные отправляем на сервер как удалённые, чтобы они не возвращались.
  const emptyRemote = active.filter(r => isPlaceholderProfile(r.user) && !remoteProfileHasData(r));
  if(emptyRemote.length > 1){
    emptyRemote.sort((a,b) => String(b.userAt || '').localeCompare(String(a.userAt || '')));
    const keepId = emptyRemote[0].user.id;
    const drop = new Set(emptyRemote.slice(1).map(r => r.user.id));
    active = active.filter(r => !drop.has(r.user && r.user.id));
    if(!Array.isArray(account.deletedProfiles)) account.deletedProfiles = [];
    drop.forEach(id => {
      if(!account.deletedProfiles.some(x => x.id === id)) account.deletedProfiles.push({id, at:new Date().toISOString()});
    });
    await saveAccount();
  }
  await collapseEmptyLocalProfiles(active);

  if(syncReplaceLocal){
    if(active.length){
      users = active.map(r => Object.assign(syncUser(r.user || {}), {profileId:r.user.id, photo:null, syncAt:r.userAt || ''}));
      currentUser = users[0].id;
      await saveUsers();
      await kvSet('currentUser', currentUser);
    }
    syncReplaceLocal = false;
  } else {
    // До первой серверной версии один и тот же человек мог получить разные
    // profileId на двух телефонах. Единственное точное совпадение анкеты связываем
    // с уже приехавшим id; неоднозначные совпадения оставляем разными профилями.
    const claimed = new Set(users.map(u => u.profileId || u.id));
    users.forEach(u => {
      if(active.some(r => r.user && r.user.id === (u.profileId || u.id))) return;
      const same = active.filter(r => !claimed.has(r.user.id)
        && (r.user.name || '') === (u.name || '')
        && (r.user.gender || '') === (u.gender || '')
        && profileAge(r.user) === profileAge(u));
      if(same.length === 1){ u.profileId = same[0].user.id; claimed.add(u.profileId); }
    });
    active.forEach(r => {
      const ru = r.user || {};
      const i = users.findIndex(u => (u.profileId || u.id) === ru.id);
      if(i < 0) users.push(Object.assign(syncUser(ru), {id:ru.id, profileId:ru.id, photo:null, syncAt:r.userAt || ''}));
      else if(!users[i].syncAt || String(r.userAt || '') >= String(users[i].syncAt || '')){
        const old = users[i], photo = old.photo || null;
        users[i] = Object.assign({}, old, syncUser(ru), {id:old.id, profileId:ru.id, photo, syncAt:r.userAt || ''});
      }
    });
    await saveUsers();
  }

  // Удаление профиля тоже синхронизируется. Сервер хранит надгробие, поэтому
  // выключенный телефон не воскресит профиль старой копией при следующем входе.
  for(const rp of remote.filter(r => r.deleted)){
    const i = users.findIndex(u => (u.profileId || u.id) === (rp.user && rp.user.id));
    if(i < 0 || users.length <= 1) continue;
    if(users[i].syncAt && String(users[i].syncAt) > String(rp.userAt || '')) continue;
    const id = users[i].id;
    for(const k of PROFILE_KEYS) await kvDel(k + '_' + id);
    users.splice(i, 1);
  }
  await saveUsers();

  for(const rp of active){
    const pid = rp.user && rp.user.id;
    if(!pid) continue;
    const localUser = users.find(u => (u.profileId || u.id) === pid);
    const localId = localUser ? localUser.id : pid;
    if((await kvGet('identity_' + localId)) === null){
      await kvSet('identity_' + localId, JSON.stringify({profileId:pid, createdAt:new Date().toISOString(),
        email:account.email, linkedAt:new Date().toISOString(), consents:{}}));
    }
    let meta = parsed(await kvGet('docMeta_' + localId), {});
    let queue = parsed(await kvGet('outbox_' + localId), []);
    let progs = parsed(await kvGet('customPrograms_' + localId), []);
    let stat = parsed(await kvGet('stats_' + localId), null);
    let order = null, programsTouched = false, mergedStats = false;
    const byId = new Map((Array.isArray(progs) ? progs : []).map(p => [String(p.id), p]));

    for(const d of (rp.docs || [])){
      if(!isSyncKey(d.key)) continue;
      if(d.key === 'stats'){
        const incoming = parsed(d.value, {totalSec:0});
        if(stat && JSON.stringify(stat) !== JSON.stringify(incoming)){
          stat = mergeStatsDocs(stat, incoming, remoteWins(d, meta[d.key])); mergedStats = true;
        } else if(!stat || remoteWins(d, meta[d.key])) stat = incoming;
        else continue;
        await kvSet('stats_' + localId, JSON.stringify(stat));
      } else {
        if(!remoteWins(d, meta[d.key])) continue;
        if(d.key === 'index'){
          order = parsed(d.value, {}).order || [];
        } else if(d.key.startsWith('program:')){
          const id = d.key.slice(8);
          if(d.deleted) byId.delete(id);
          else {
            const p = parsed(d.value, null);
            if(p) byId.set(id, p);
          }
          programsTouched = true;
        }
      }
      meta[d.key] = {rev:+d.rev||1, at:d.at, schema:+d.schema||1,
                     deviceId:d.deviceId||'', gone:!!d.deleted,
                     h:d.value == null ? '' : docHash(String(d.value))};
      queue = queue.filter(o => o.key !== d.key);
    }

    if(programsTouched || order){
      const ids = Array.isArray(order) ? order.map(String) : [];
      progs = ids.map(id => byId.get(id)).filter(Boolean);
      byId.forEach((p,id) => { if(!ids.includes(id)) progs.push(p); });
      // Счёт прохождений восстанавливаем из объединённой истории: две законченные
      // тренировки на двух телефонах должны дать два повышения, а не победителя LWW.
      const history = (stat && stat.history) || [];
      progs.forEach(p => {
        const n = history.filter(h => String(h.pid || '') === String(p.id)).length;
        if(n){ p.stats = p.stats || {}; p.stats.completions = Math.max(+p.stats.completions||0, n); }
      });
      await kvSet('customPrograms_' + localId, JSON.stringify(progs));
    }
    if(mergedStats){
      const at = new Date().toISOString();
      meta.stats = {rev:(+meta.stats.rev||0)+1, at, schema:SCHEMA_VERSION};
      queue = queue.filter(o => o.key !== 'stats').concat([{key:'stats',rev:meta.stats.rev,at}]);
    }
    await kvSet('docMeta_' + localId, JSON.stringify(meta));
    await kvSet('outbox_' + localId, JSON.stringify(queue));
  }

  if(!users.some(u => u.id === currentUser)) currentUser = users[0].id;
  await kvSet('currentUser', currentUser);
  const activeOwner = currentUser;
  await loadIdentity(activeOwner);
  identity.email = account.email;
  await saveIdentity();
  await loadData(activeOwner);
  // После loadData: иначе смена языка пересохранила бы устаревший список программ
  // из памяти поверх только что принятых с сервера.
  await setAppLocale(profileLocalePreference(curUser()), {persist:false});
  await loadPhotos();
  await ensureWarmup();
  applyProgressionAll();
  renderUsers(); renderMine(); renderStats(); renderWeight(); renderWellness(); renderPhotos();
}

function trainerSyncValue(value){
  const out = Object.assign({}, value || {});
  delete out.key;
  delete out.pageErr;
  return out;
}
function mergeClientLists(localList, remoteList, preferRemote){
  const out = new Map();
  const add = (c, preferred) => {
    if(!c || !c.id) return;
    const old = out.get(c.id);
    if(!old){ out.set(c.id, JSON.parse(JSON.stringify(c))); return; }
    const merged = Object.assign({}, preferred ? old : c, preferred ? c : old);
    const progs = new Map();
    [].concat(old.progs || [], c.progs || []).forEach(p => {
      const key = String((p && p.pid) || (p && p.link && p.link.id) || '');
      if(key) progs.set(key, Object.assign({}, progs.get(key) || {}, p));
    });
    merged.progs = [...progs.values()];
    out.set(c.id, merged);
  };
  (Array.isArray(localList) ? localList : []).forEach(c => add(c, false));
  (Array.isArray(remoteList) ? remoteList : []).forEach(c => add(c, !!preferRemote));
  return [...out.values()];
}
async function applyRemoteAccountDocs(result){
  if(!account || !account.email) return;
  const docs = Array.isArray(result && result.accountDocs) ? result.accountDocs : [];
  if(!docs.length) return;
  const rec = await readAccountBucket();
  if(!rec.bucket.meta) rec.bucket.meta = {};
  for(const d of docs){
    if(!d || !['trainer','clients','notificationPrefs'].includes(d.key) || d.deleted) continue;
    const localMeta = rec.bucket.meta[d.key];
    const takeRemote = !localMeta || remoteWins(d, localMeta);
    const incoming = parsed(d.value, d.key === 'clients' ? [] : {});
    if(d.key === 'trainer'){
      if(!takeRemote) continue;
      const keep = rec.bucket.trainer || trainer || {};
      rec.bucket.trainer = Object.assign({}, incoming || {});
      // Ключ управления страницей никогда не хранится в синхронизации. Ник,
      // подтверждённый входом, тоже важнее старой копии документа.
      if(keep.key) rec.bucket.trainer.key = keep.key;
      if(keep.handle) rec.bucket.trainer.handle = keep.handle;
      if(keep.on && keep.handle) rec.bucket.trainer.on = true;
      rec.bucket.meta[d.key] = {rev:+d.rev || 1, at:d.at || '', schema:+d.schema || 1,
                                deviceId:d.deviceId || ''};
    } else if(d.key === 'clients'){
      rec.bucket.clients = mergeClientLists(rec.bucket.clients || clients, incoming, takeRemote);
      if(takeRemote) rec.bucket.meta[d.key] = {rev:+d.rev || 1, at:d.at || '', schema:+d.schema || 1,
                                               deviceId:d.deviceId || ''};
    } else if(takeRemote){
      rec.bucket.notificationPrefs = Object.assign({}, incoming || {});
      rec.bucket.meta[d.key] = {rev:+d.rev || 1, at:d.at || '', schema:+d.schema || 1,
                                deviceId:d.deviceId || ''};
      try{
        if(typeof NOTIFICATION_PREF_DEFAULTS !== 'undefined'){
          localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(
            Object.assign({}, NOTIFICATION_PREF_DEFAULTS, rec.bucket.notificationPrefs)
          ));
        }
      }catch(_){}
    }
  }
  await writeAccountBucket(rec);
  trainer = rec.bucket.trainer || trainer;
  clients = Array.isArray(rec.bucket.clients) ? rec.bucket.clients : clients;
  if(typeof syncNotificationSettings === 'function') syncNotificationSettings();
}

async function accountDocsSnapshot(){
  if(!account || !account.email) return [];
  const rec = await readAccountBucket();
  if(!rec.bucket.meta) rec.bucket.meta = {};
  const now = new Date().toISOString();
  let localNotificationPrefs = {};
  try{
    localNotificationPrefs = (typeof getNotificationPrefs === 'function')
      ? getNotificationPrefs()
      : parsed(localStorage.getItem('fitNotificationPrefsV1'), {});
  }catch(_){}
  if(!rec.bucket.notificationPrefs) rec.bucket.notificationPrefs = localNotificationPrefs;
  const values = {
    trainer:trainerSyncValue(rec.bucket.trainer || trainer),
    clients:Array.isArray(rec.bucket.clients) ? rec.bucket.clients : clients,
    notificationPrefs:Object.assign({}, rec.bucket.notificationPrefs || localNotificationPrefs)
  };
  const docs = [];
  for(const key of FIT_SYNC_ACCOUNT_DOC_KEYS){
    if(!rec.bucket.meta[key]) rec.bucket.meta[key] = {rev:1, at:account.linkedAt || now, schema:SCHEMA_VERSION};
    const m = rec.bucket.meta[key];
    docs.push({key, profileId:'__account__', rev:m.rev || 1, at:m.at || now,
               schema:m.schema || SCHEMA_VERSION, value:JSON.stringify(values[key] || (key === 'clients' ? [] : {}))});
  }
  await writeAccountBucket(rec);
  return docs;
}

async function syncNotificationPrefsServer(action){
  if(!account || !account.email || !account.syncToken) return false;
  let deviceId = await kvGet('deviceId');
  if(!deviceId){ deviceId = newId(); await kvSet('deviceId', deviceId); }
  const base = {action:action || 'push', email:account.email, deviceId, token:account.syncToken};
  if(base.action === 'pull'){
    const result = await syncApiPost(base);
    await applyRemoteAccountDocs(result);
    return true;
  }
  const rec = await readAccountBucket();
  if(!rec.bucket.meta) rec.bucket.meta = {};
  const key = 'notificationPrefs';
  if(!rec.bucket.notificationPrefs && typeof getNotificationPrefs === 'function'){
    rec.bucket.notificationPrefs = getNotificationPrefs();
  }
  if(!rec.bucket.meta[key]) bumpAccountMeta(rec.bucket, key);
  const m = rec.bucket.meta[key];
  const doc = {key, profileId:'__account__', rev:m.rev || 1, at:m.at || new Date().toISOString(),
    schema:m.schema || SCHEMA_VERSION, value:JSON.stringify(rec.bucket.notificationPrefs || {})};
  await writeAccountBucket(rec);
  await syncApiPost(Object.assign(base, {profiles:[], docs:[doc]}));
  return true;
}

async function pushAccountDocs(){
  if(!account || !account.email || !account.syncToken || !isPremium()) return;
  const docs = await accountDocsSnapshot();
  if(!docs.length) return;
  await syncApiPost(Object.assign(syncAuth('push'), {profiles:[], docs}));
}

// Собрать только то, что реально изменилось у конкретного профиля.
// outbox уже существует для этой задачи; полный снимок каждого профиля при каждом
// старте был лишним и превращал обычную синхронизацию в десятки HTTP-запросов.
async function pendingProfileSnapshot(uid){
  const u = users.find(x => x.id === uid);
  if(!u) return null;
  const queue = parsed(await kvGet('outbox_' + uid), []);
  const meta = parsed(await kvGet('docMeta_' + uid), {});
  const ident = parsed(await kvGet('identity_' + uid), {});
  const programs = parsed(await kvGet('customPrograms_' + uid), []);
  const serverId = u.profileId || u.id;
  const deviceId = (await kvGet('deviceId')) || '';
  const docs = [];
  for(const o of Array.isArray(queue) ? queue : []){
    const key = String(o.key || '');
    if(!isSyncKey(key)) continue;
    let value = null;
    if(key === 'stats') value = await kvGet('stats_' + uid);
    else if(key === 'index') value = JSON.stringify({order:(Array.isArray(programs) ? programs : []).map(p => p.id)});
    else if(key.startsWith('program:')){
      const id = key.slice(8);
      const p = (Array.isArray(programs) ? programs : []).find(x => String(x.id) === id);
      value = p ? JSON.stringify(p) : null;
    } else value = await kvGet(key + '_' + uid);
    const gone = value === null && FIT_SYNC_REGISTRY.allowsDeleted('profile', key);
    if(value === null && !gone) continue;
    docs.push({
      key, profileId:serverId, rev:+o.rev || +((meta[key]||{}).rev) || 1,
      at:o.at || (meta[key]||{}).at || new Date().toISOString(),
      schema:+((meta[key]||{}).schema) || SCHEMA_VERSION,
      deviceId, deleted:gone || !!((meta[key]||{}).gone), value
    });
  }
  return {
    uid,
    queue:Array.isArray(queue) ? queue : [],
    profile:{user:syncUser(u), at:u.syncAt || ident.createdAt || '1970-01-01T00:00:00.000Z'},
    docs
  };
}

const accountSyncAdapter = {
  async push(payload){
    const base = syncAuth('push');
    const u = curUser();
    await syncApiPost(Object.assign(base, {profiles:[{user:syncUser(u), at:u.syncAt || identity.createdAt}], docs:[]}));
    // У активного профиля payload уже является дельтой из outbox.
    for(const doc of payload) await syncApiPost(Object.assign(base, {profiles:[], docs:[doc]}));
  },
  async pull(){
    const result = await syncApiPost(syncAuth('pull'));
    await applyRemoteSync(result);
    return result;
  }
};

async function pushPendingProfiles(){
  const snaps = [];
  for(const u of users){
    const snap = await pendingProfileSnapshot(u.id);
    if(snap) snaps.push(snap);
  }
  const profiles = snaps.map(s => s.profile);
  if(profiles.length){
    // Метаданные всех профилей маленькие — отправляем одним запросом.
    await syncApiPost(Object.assign(syncAuth('push'), {profiles, docs:[]}));
  }

  // Отправляем только изменённые документы. Небольшой параллелизм не даёт одной
  // медленной serverless-функции растянуть десяток независимых документов на минуты.
  const jobs = [];
  for(const snap of snaps){
    for(const doc of snap.docs) jobs.push({snap, doc});
  }
  const doneByUid = new Map();
  for(let i = 0; i < jobs.length; i += 3){
    const chunk = jobs.slice(i, i + 3);
    const results = await Promise.all(chunk.map(async job => {
      await syncApiPost(Object.assign(syncAuth('push'), {profiles:[], docs:[job.doc]}));
      return job;
    }));
    results.forEach(job => {
      if(!doneByUid.has(job.snap.uid)) doneByUid.set(job.snap.uid, []);
      doneByUid.get(job.snap.uid).push(job.doc);
    });
  }

  // Удаляем из очереди только успешно отправленные конкретные ревизии. Если за время
  // отправки документ изменился снова, новая ревизия останется ждать следующего прохода.
  for(const snap of snaps){
    const done = doneByUid.get(snap.uid) || [];
    if(!done.length) continue;
    let queue = parsed(await kvGet('outbox_' + snap.uid), []);
    queue = (Array.isArray(queue) ? queue : []).filter(o =>
      !done.some(d => d.key === o.key && d.rev === o.rev)
    );
    await kvSet('outbox_' + snap.uid, JSON.stringify(queue));
    if(snap.uid === currentUser) outbox = queue;
  }
}

async function pushDeletedProfiles(){
  const list = Array.isArray(account.deletedProfiles) ? account.deletedProfiles.slice() : [];
  if(!list.length) return;
  const profiles = list.map(rec => ({user:{id:rec.id}, at:rec.at, deleted:true}));
  await syncApiPost(Object.assign(syncAuth('push'), {profiles, docs:[]}));
  account.deletedProfiles = [];
  await saveAccount();
}

async function flushAccountSync(){
  if(syncUploadBusy){
    syncUploadAgain = true;
    return syncUploadBusy;
  }
  showSyncState('busy', 3, 3, 'sync.stage.upload');
  syncUploadBusy = (async()=>{
    try{
      await pushDeletedProfiles();
      await pushPendingProfiles();
      await pushAccountDocs();
      showSyncState('ok');
      return true;
    }catch(e){
      showSyncState('error');
      return false;
    }finally{
      syncUploadBusy = null;
      if(syncUploadAgain){
        syncUploadAgain = false;
        setTimeout(()=> flushAccountSync(), 0);
      }
    }
  })();
  return syncUploadBusy;
}

async function connectAccountSync(opts){
  if(!account || !account.email || !account.syncToken || !identity){
    showSyncState('idle');
    return false;
  }
  if(!isPremium()){
    try{ await syncNotificationPrefsServer('pull'); }catch(_){}
    showSyncState('idle');
    return false;
  }
  if(syncBusy) return syncBusy;
  syncReplaceLocal = !!(opts && opts.replaceLocal);
  showSyncState('busy', 1, 3, 'sync.stage.check');
  syncBusy = (async()=>{
    try{
      SYNC.adapter = accountSyncAdapter;
      // Удаление должно дойти до pull, иначе сервер может вернуть уже удалённый профиль.
      await pushDeletedProfiles();
      showSyncState('busy', 2, 3, 'sync.stage.download');
      await accountSyncAdapter.pull();

      // После pull актуальные данные уже применены и интерфейс можно считать готовым.
      // Долгую выгрузку не ждём: она идёт последним этапом в фоне.
      flushAccountSync();
      return true;
    }catch(e){
      showSyncState('error');
      return false;
    }finally{
      syncBusy = null;
    }
  })();
  return syncBusy;
}

function queueAccountSync(){
  if(!account || !account.email || !account.syncToken || !isPremium()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>{
    if(SYNC.adapter) flushAccountSync();
    else connectAccountSync().catch(()=> showSyncState('error'));
  }, 900);
}

window.addEventListener('online', ()=>{
  if(account && account.email && account.syncToken && isPremium()){
    connectAccountSync().catch(()=> showSyncState('error'));
  }
});

// На новой установке загрузчик создаёт технический «Профиль 1», поэтому users.length
// уже равен единице ещё до входа. Проверяем содержимое: только совершенно пустую
// заглушку можно заменить серверными профилями. Реальные локальные данные объединяем.
async function hasMeaningfulLocalData(){
  if(users.length !== 1) return users.length > 0;
  const u = users[0] || {};
  if(!isPlaceholderProfile(u) || u.photo) return true;
  const uid = u.id;
  return localProfileHasData(uid);
}

// Согласия: что именно, какой редакции и когда. Версию поднимаем при правке текстов —
// иначе нельзя доказать, с какой редакцией человек соглашался.
const CONSENT_VERSION = 1;
// Согласие с правилами человек даёт на первом шаге знакомства — а профиля, и значит
// личности, в этот момент ещё нет: он создаётся на последнем шаге. Молча терять такую
// отметку нельзя, восстановить её потом неоткуда. Копим до появления личности.
let pendingConsents = [];
async function recordConsent(kind){
  const rec = {v: CONSENT_VERSION, at: new Date().toISOString()};
  if(!identity){ pendingConsents.push({kind, rec}); return; }
  identity.consents[kind] = rec;
  await saveIdentity();
}
const hasConsent = kind => !!(identity && identity.consents && identity.consents[kind]);

// Программы хранятся одним ключом, а в очередь встают поштучно: на сервер уйдут только
// те, что человек действительно тронул. Хеш программы лежит рядом с её редакцией —
// без него каждое сохранение любой программы гнало бы наверх весь список.
async function savePrograms(){
  // customPrograms — глобальный массив активного профиля. Делаем независимый снимок
  // до первого await, чтобы последующее переключение профиля не подменило содержимое.
  const uid = currentUser;
  if(dataOwner !== uid) return;   // данные нового профиля ещё не загружены
  // id упражнений уникальны в программе (см. uniqueExerciseIds) — чиним на месте,
  // чтобы копия, заведённая старым способом, не жила с чужим id до перезапуска
  customPrograms.forEach(p => { if(p && typeof p === 'object') uniqueExerciseIds(p); });
  const programs = JSON.parse(JSON.stringify(customPrograms));
  let meta = docMeta;
  let queue = outbox.slice();
  if(!(await kvSet('customPrograms_' + uid, JSON.stringify(programs)))) return;

  const bump = (key, extra)=>{
    const prev = meta[key] || {rev:0};
    const at = new Date().toISOString();
    meta = Object.assign({}, meta, {
      [key]: Object.assign({rev:prev.rev + 1, at, schema:SCHEMA_VERSION}, extra || {})
    });
    queue = queue.filter(o => o.key !== key);
    queue.push({key, rev:meta[key].rev, at});
  };

  let touched = false;
  const live = new Set();
  for(const p of programs){
    const key = PROGRAM_DOC(p.id);
    live.add(key);
    const h = docHash(JSON.stringify(p));
    const prev = meta[key];
    if(prev && prev.h === h && !prev.gone) continue;
    bump(key, {h});
    touched = true;
  }
  // удалённая программа — тоже документ: без надгобия она вернётся с другого устройства
  for(const key of Object.keys(meta)){
    if(!key.startsWith('program:') || live.has(key) || meta[key].gone) continue;
    bump(key, {gone:true});
    touched = true;
  }
  const order = docHash(programs.map(p => p.id).join(','));
  if(!meta.index || meta.index.h !== order){ bump('index', {h:order}); touched = true; }

  if(touched){
    await flushMeta(uid, meta, queue);
    if(currentUser === uid){ docMeta = meta; outbox = queue; }
    queueAccountSync();
  }
}
async function saveStats(){ await saveDoc('stats', stats); }
async function saveProgWeights(){ progWeights = {}; await kvSet(pk('progWeights'), '{}'); }
async function loadProgWeights(ownerId = currentUser){
  await kvSet('progWeights_' + ownerId, '{}');
  if(currentUser === ownerId) progWeights = {};
}

function fmtLong(sec){
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  if(h > 0) return t('time.hoursMinutes',{hours:h,minutes:m});
  if(m > 0) return t('time.minutes',{minutes:m});
  return sec > 0 ? t('time.lessMinute') : t('time.minutes',{minutes:0});
}
function renderTotal(){
  $('totalTime').textContent = fmtLong(stats.totalSec);
  const n = stats.count || 0;
  $('totalCount').textContent = n;
  $('totalCountWord').textContent = appLocale === 'ru' ? plural(n,t('calendar.workoutOne'),t('calendar.workoutFew'),t('calendar.workoutMany')) : t(n===1?'calendar.workoutOne':'calendar.workoutFew');
}


/* ================= НЕЗАВЕРШЁННАЯ СЕССИЯ ТРЕНИРОВКИ =================
   Сохраняем место, на котором прервались, чтобы в следующий раз продолжить с него.
   Храним не сами шаги (они пересобираются из программы), а координаты: какая программа,
   какой вариант, нагрузка, номер шага и уже накопленное время. */

function sessionKey(){ return pk('workoutSession'); }

async function saveSession(){
  const raw = state.raw, cur = state.current;
  if(!raw || !cur || !state.steps.length) return;
  const pausedNow = state.paused && state.pausedAt ? Math.max(0, Date.now() - state.pausedAt) : 0;
  const elapsed = state.globalStart
    ? Math.max(0, Date.now() - state.globalStart - state.pausedTotal - pausedNow)
    : 0;
  const data = {
    pid: raw.id,
    sessionId: String(state.workoutSessionId || ''),
    planIdx: state.planIdx || 0,
    stepIdx: state.stepIdx || 0,
    total: state.steps.length,
    elapsed,
    load: Array.isArray(state.startLoad) ? state.startLoad : null,
    // Absolute deadline lets a cold notification launch distinguish three cases:
    // timer still running, timer expired while WebView was dead, or non-timed step.
    stepDeadline: Math.max(0, Number(state.stepDeadline) || 0),
    remaining: Math.max(0, Number(state.remaining) || 0),
    paused: !!state.paused,
    at: Date.now()
  };
  await kvSet(sessionKey(), JSON.stringify(data));
}

async function loadSession(){
  try{
    const raw = await kvGet(sessionKey());
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s || !s.pid) return null;
    // программу могли удалить — тогда сессия бессмысленна
    if(!customPrograms.some(p => p.id === s.pid)){ await clearSession(); return null; }
    return s;
  }catch(e){ return null; }
}

async function clearSession(){
  try{ await kvDel(sessionKey()); }catch(e){}
}

// незавершённая сессия именно этой программы (для экрана перед стартом)
async function sessionForProgram(pid){
  const s = await loadSession();
  return (s && s.pid === pid) ? s : null;
}

function sessionAgeText(at){
  const mins = Math.round((Date.now() - at) / 60000);
  if(mins < 1) return t('session.justNow');
  if(mins < 60){
    const word = appLocale === 'ru' ? plural(mins,t('session.minuteOne'),t('session.minuteFew'),t('session.minuteMany')) : t(mins===1?'session.minuteOne':'session.minuteFew');
    return t('session.minutesAgo',{count:mins,minutes:word});
  }
  const hours = Math.round(mins / 60);
  if(hours < 24){
    const word = appLocale === 'ru' ? plural(hours,t('session.hourOne'),t('session.hourFew'),t('session.hourMany')) : t(hours===1?'session.hourOne':'session.hourFew');
    return t('session.hoursAgo',{count:hours,hours:word});
  }
  const days = Math.round(hours / 24);
  const word = appLocale === 'ru' ? plural(days,t('session.dayOne'),t('session.dayFew'),t('session.dayMany')) : t(days===1?'session.dayOne':'session.dayFew');
  return t('session.daysAgo',{count:days,days:word});
}

// список упражнений для выбора «с какого упражнения начать».
// Выбирается именно упражнение, а не отдельный подход/сторона/круг:
// всегда начинаем с его первого подхода, первой стороны и первого круга.
function workStepChoices(){
  const out = [];
  (state.steps || []).forEach((s, i) => {
    if(s.phase !== 'work') return;
    if((s.setNo || 1) !== 1 || (s.side || 1) !== 1 || s.round > 1) return;
    const meta = [];
    if(s.round === 0) meta.push(t('start.metaWarmup'));
    out.push({idx: i, label:s.title, meta:meta.join(' · ')});
  });
  return out;
}
/* ================= КАЛЕНДАРЬ И НЕДЕЛЯ ================= */
let calOffset = 0;
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const DAY_FULL = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
// «чем в августе» — тот же список в предложном падеже: подставлять именительный
// («чем в август») в живой текст нельзя, а склонять на лету незачем
const MONTH_IN = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
// и в родительном — «3 сентября», а не «3 сентябрь»: даты попадаются в попапе дня,
// в истории веса и на картинке для шеринга
const MONTH_OF = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

/* Серия считается ПО ПЛАНУ, а не по календарю.
   Раньше это были «дни подряд»: при расписании три раза в неделю между тренировками
   всегда лежали пустые дни, серия обрывалась каждый раз и вечно показывала «1 день подряд» —
   человек делал всё, что запланировал, а приложение как будто этого не замечало.
   Теперь единица серии — выполненная тренировка: день не по плану ничего не рвёт,
   рвёт только пропущенный запланированный день. Сделал три из трёх — «3 тренировки подряд».
   Если расписания нет вообще, считать по плану нечего — тогда работает прежний счёт по дням.

   Терять серию должно быть ТРУДНО. Лестница из четырёх ступеней, снизу вверх:
   1. ОТРАБОТКА — день, закрытый в другой день той же недели, не пропуск вовсе
      (см. weekPlanInfo). Человек сделал работу, прощать нечего.
   2. ПОД УГРОЗОЙ (risk) — пока долг ещё можно отработать, то есть пока идёт та же
      неделя, серия НЕ обнуляется: она висит помеченной, и любая тренировка её
      возвращает. Раньше четырнадцать тренировок подряд превращались в ноль на
      следующее же утро после пропуска — чип просто исчезал с главной, без
      объяснения и без шанса исправиться.
   3. ЗАМОРОЗКА — невыполненный день прощается совсем, но не чаще раза в 7
      засчитанных тренировок. Прежний «мостик» (требование тренировки в соседний
      день) при расписании 3 раза в неделю не срабатывал почти никогда: между
      тренировками лежат дни отдыха, и заморозка простаивала.
   4. РЕКОРД — сгоревшая серия остаётся лучшей (stats.bestStreak). Собранное не
      отбираем — то же правило, что у достижений. */
function calcStreakInfo(){
  const done = new Set(stats.history.map(h => h.d));
  const plan = new Set();
  customPrograms.forEach(p => planDays(p).forEach(d => plan.add(d)));
  const byPlan = plan.size > 0;
  const isPlanned = dt => plan.has(DAYS[(dt.getDay() + 6) % 7]);
  // дальше самой ранней тренировки уходить некуда — там просто нет истории
  const earliest = stats.history.reduce((m, h) => (!m || h.d < m) ? h.d : m, null);
  // отработка — механика недельная, поэтому неделю считаем один раз на неделю
  const weeks = {};
  const shut = dt => {
    const m = new Date(dt); m.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const key = localISO(m);
    return (weeks[key] || (weeks[key] = weekPlanInfo(dt))).days[(dt.getDay() + 6) % 7].full;
  };
  const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const weekStart = localISO(mon);

  let n = 0, freezes = 0, sinceFreeze = 99, risk = false;
  const d = new Date();
  if(!done.has(localISO(d))) d.setDate(d.getDate() - 1); // сегодня ещё впереди — не в счёт
  while(earliest && localISO(d) >= earliest){
    const iso = localISO(d);
    if(done.has(iso)){
      n++; sinceFreeze++;
      d.setDate(d.getDate() - 1);
      continue;
    }
    // день вне расписания — это законный отдых, он серию не трогает
    if(byPlan && !isPlanned(d)){
      d.setDate(d.getDate() - 1);
      continue;
    }
    // слот закрыт отработкой в другой день недели — пропуска не было
    if(byPlan && shut(d)){
      d.setDate(d.getDate() - 1);
      continue;
    }
    // долг идущей недели: отработать ещё можно, поэтому серия висит, а не сгорает
    if(byPlan && iso >= weekStart){
      risk = true;
      d.setDate(d.getDate() - 1);
      continue;
    }
    // заморозка: пропуск прощается, но не чаще раза в 7 засчитанных тренировок
    if(n > 0 && sinceFreeze >= 7){
      freezes++; sinceFreeze = 0;
      d.setDate(d.getDate() - 1);
      continue;
    }
    break;
  }
  return {n, freezes, byPlan, risk: risk && n > 0, best: Math.max(stats.bestStreak || 0, n)};
}
function calcStreak(){ return calcStreakInfo().n; }
// подпись под число серии: по плану считаем тренировки, без плана — дни
// «3 тренировки подряд» переносилось в две строки и распирало чип — на главной
// хватает сокращения, полная форма осталась в подсказке
function streakWord(n, byPlan){
  return byPlan
    ? t('streak.planShort')
    : (appLocale === 'ru' ? plural(n,t('streak.dayOne'),t('streak.dayFew'),t('streak.dayMany')) : t(n===1?'streak.dayOne':'streak.dayFew'));
}

const MON_SHORT_NAMES = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
let weekBarStarts = [];   // понедельник каждого из восьми столбиков

function renderStatsBlock(){
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0,0,0,0);
  const weekOf = start => [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return localISO(d); });

  // пока тренировок нет, показывать нули незачем: на экране остаётся одна честная
  // строка «Тренировок пока нет», а не три пустых карточки
  const empty = !stats.history.length;
  setShown('workEmpty', empty);
  setShown('weeksCard', !empty);
  setShown('calCard', !empty);
  setShown('totalCard', !empty);

  // ---- мини-график: сколько тренировок в каждую из 8 последних недель ----
  // Подпись справа «всего 16» убрана: это была сумма по восьми показанным
  // неделям, а читалась как общий итог и спорила с числом тренировок выше.
  // месяц пишем только там, где он меняется: восемь подписей «20 июл 27 июл 3 авг…»
  // не помещались в 35 px на столбик и слипались в кашу
  const MON_SHORT = MON_SHORT_NAMES;
  const counts = [], labels = [];
  let prevMon = -1;
  for(let w = 7; w >= 0; w--){
    const s = new Date(monday); s.setDate(monday.getDate() - w * 7);
    counts.push(stats.history.filter(h => weekOf(s).includes(h.d)).length);
    const showMon = s.getMonth() !== prevMon;
    prevMon = s.getMonth();
    labels.push(w === 0 ? t('stats.thisWeek') : (showMon
      ? `${s.getDate()} ${new Intl.DateTimeFormat(localeTag(),{month:'short'}).format(s).replace('.','')}`
      : String(s.getDate())));
  }
  const maxC = Math.max(1, ...counts);
  const bw = 300 / 8, top = 24, base = 72;
  // каждому столбику — понедельник его недели: по нажатию покажем, что в ту неделю сделано
  weekBarStarts = [];
  for(let w = 7; w >= 0; w--){
    const st = new Date(monday); st.setDate(monday.getDate() - w * 7);
    weekBarStarts.push(localISO(st));
  }
  $('weekBars').innerHTML =
    `<line x1="2" y1="${base + .5}" x2="298" y2="${base + .5}" stroke="var(--line)" stroke-width="1"/>` +
    counts.map((c, i) => {
      const h = c ? 8 + (base - top) * (c / maxC) : 3;
      const x = i * bw + bw / 2;
      const y = base - h;
      const cur = i === 7;
      const fill = cur ? 'var(--accent)' : (c ? 'var(--accent-ink)' : 'var(--line-2)');
      const op = cur ? 1 : (c ? .42 : .55);
      let s = `<rect x="${(i * bw + 5).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 10).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${fill}" opacity="${op}"/>`;
      if(c) s += `<text x="${x.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${cur ? 'var(--accent-ink)' : 'var(--muted)'}">${c}</text>`;
      s += `<text x="${x.toFixed(1)}" y="89" text-anchor="middle" font-size="10" fill="var(--muted)" opacity="${cur ? 1 : .75}">${labels[i]}</text>`;
      return s;
    }).join('');

  renderCalendar();
  renderStatBadges();
}

// достижения переехали сюда с финального экрана: там они показывались минуту
// и исчезали. Здесь видно и собранное, и что будет следующим.
function renderStatBadges(){
  // достижение могло открыться и без финального экрана (например, «Неделя по плану»
  // закрывается последней тренировкой недели) — досчитываем здесь же
  if(earnBadges().length) saveStats();
  const earned = BADGES.filter(b => hasBadge(b.id));
  setShown('badgeCard', !!earned.length);
  if(!earned.length) return;
  $('badgeNote').textContent = t('stats.badgesCount',{earned:earned.length,total:BADGES.length});
  const box = $('statBadges');
  box.innerHTML = '';
  earned.forEach(b => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bdg';
    el.innerHTML = `<i>${icon(b.ico)}</i><span></span>`;
    el.querySelector('span').textContent = badgeName(b);
    // за что выдано — не написано нигде, а название само по себе не объясняет
    el.onclick = ()=> appAlert(`«${badgeName(b)}» — ${badgeDesc(b).toLowerCase()}.`);
    box.appendChild(el);
  });
  const next = BADGES.find(b => !hasBadge(b.id));
  $('badgeNext').textContent = next
    ? t('stats.nextBadge',{name:badgeName(next),desc:badgeDesc(next).toLowerCase()})
    : t('stats.allBadges');
}

function renderCalendar(){
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calOffset);
  const y = base.getFullYear(), m = base.getMonth();
  $('calTitle').textContent = new Intl.DateTimeFormat(localeTag(),{month:'long',year:'numeric'}).format(base);
  const doneSet = new Set(stats.history.map(h => h.d));
  const todayIso = localISO(new Date());
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();

  // подпись под месяцем — это и есть ответ на «что изменилось с прошлого месяца».
  // Название месяца в сравнении не склоняем («в прошлом»), чтобы не городить падежи.
  const key = `${y}-${String(m + 1).padStart(2,'0')}`;
  const pm = new Date(y, m - 1, 1);
  const pKey = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2,'0')}`;
  const cnt = stats.history.filter(h => h.d.slice(0,7) === key).length;
  // текущий месяц ещё не кончился, поэтому у прошлого берём столько же дней —
  // иначе первого числа приложение честно сообщает «на 9 меньше» и это обидно
  const isCur = calOffset === 0;
  const cut = isCur ? new Date().getDate() : 31;
  const pCnt = stats.history.filter(h => h.d.slice(0,7) === pKey && +h.d.slice(8) <= cut).length;
  const sub = [cnt
    ? cnt + ' ' + (appLocale === 'ru' ? plural(cnt,t('calendar.workoutOne'),t('calendar.workoutFew'),t('calendar.workoutMany')) : t(cnt===1?'calendar.workoutOne':'calendar.workoutFew'))
    : t('calendar.noWorkouts')];
  // не «на 2 больше», а прямо два числа: так короче и не нужно доверять моей арифметике
  if(cnt || pCnt){
    const month = new Intl.DateTimeFormat(localeTag(),{month:'long'}).format(pm);
    sub.push(t(isCur ? 'calendar.prevCurrent' : 'calendar.prev',{month,count:pCnt}));
  }
  $('calSub').textContent = sub.join(' · ');

  const cells = DAYS.map(d => `<div class="cal-cell cal-dow">${canonicalLabel(d)}</div>`);
  for(let i = 0; i < firstDow; i++) cells.push('<div class="cal-cell"></div>');
  for(let d = 1; d <= dim; d++){
    const iso = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cal-cell'];
    if(doneSet.has(iso)) cls.push('done');
    if(iso === todayIso) cls.push('today');
    else if(iso > todayIso) cls.push('fut');
    cells.push(`<div class="${cls.join(' ')}" data-iso="${iso}">${d}</div>`);
  }
  $('calGrid').innerHTML = cells.join('');
}

// Одна запись истории — одна карточка: название программы и строка обычного текста
// «время · калории · вариант», под ней заметка. Из этого же строится список за день,
// за неделю и за что угодно ещё. withStatus добавляет в начало «Тренировка пройдена»:
// в попапе дня рядом стоят и пройденные, и запланированные.
function sessRow(en, withDate, withStatus){
  const p = customPrograms.find(x => x.id === en.pid);
  const name = p ? p.name : t('sessions.workoutFallback');
  let variant = '';
  if(p && normPlans(p).length > 1){
    if(en.planDays) variant = t('sessions.variantDays',{days:String(en.planDays).split(/[·,]/).map(x=>canonicalLabel(x.trim())).filter(Boolean).join(' · ')});
    else if(typeof en.plan === 'number') variant = t('sessions.variant',{count:en.plan+1});
  }
  const parts = [];
  if(withStatus) parts.push(t('sessions.doneText'));
  if(en.sec) parts.push(en.sec < 60 ? t('time.lessMinute') : t('time.minutes',{minutes:Math.round(en.sec/60)}));
  if(en.kcal) parts.push(`≈${en.kcal} ${t('workout.kcal')}`);
  if(variant) parts.push(variant);
  // Упражнений здесь нет намеренно. Состав смотрят на странице программы, куда ведёт
  // нажатие по карточке.
  const row = document.createElement(p ? 'button' : 'div');
  row.className = 'sess-row' + (p ? ' sess-link' : '');
  if(p){ row.type = 'button'; row.onclick = () => openDayProgram(p.id, typeof en.plan === 'number' ? en.plan : -1); }
  row.innerHTML =
    '<div class="sess-head"><b></b>' + (withDate ? '<span class="sess-date"></span>' : '') + '</div>' +
    (parts.length ? '<p class="sess-line"></p>' : '') +
    (en.note ? '<span class="sess-note"></span>' : '');
  row.querySelector('.sess-head b').textContent = name;
  if(withDate) row.querySelector('.sess-date').textContent = shortD(en.d);
  if(parts.length) row.querySelector('.sess-line').textContent = parts.join(' · ');
  if(en.note) row.querySelector('.sess-note').textContent = `«${en.note}»`;
  return row;
}
function openSessions(label, title, entries, emptyText, opts){
  $('sessLabel').textContent = label;
  $('sessTitle').textContent = title;
  const box = $('sessList');
  box.innerHTML = '';
  // за неделю записи из разных дней — без даты они сливаются в один список
  const multiDay = new Set(entries.map(e => e.d)).size > 1;
  const withStatus = !!(opts && opts.status);
  if(entries.length) entries.forEach(en => box.appendChild(sessRow(en, multiDay, withStatus)));
  else if(emptyText){
    const p = document.createElement('p');
    p.className = 'sess-empty';
    p.textContent = emptyText;
    box.appendChild(p);
  }
  $('sessModal').classList.add('open');
}
$('sessModal').onclick = e => { if(e.target === $('sessModal')) $('sessModal').classList.remove('open'); };

const dayTitle = iso => new Intl.DateTimeFormat(localeTag(),{day:'numeric',month:'long',year:'numeric'}).format(new Date(iso+'T12:00:00'));

// неделя целиком: что было пройдено с понедельника по воскресенье того столбика
$('weekBars').addEventListener('click', e => {
  // колонку считаем по координате нажатия, а не по элементу: столбик бывает высотой
  // в три пикселя, а поверх него ещё лежат число и подпись — попасть в сам прямоугольник
  // пальцем нельзя. Кликабельна вся колонка целиком, вместе с цифрой и подписью.
  const box = $('weekBars').getBoundingClientRect();
  if(!box.width) return;
  const i = Math.max(0, Math.min(7, Math.floor((e.clientX - box.left) / (box.width / 8))));
  const startIso = weekBarStarts[i];
  if(!startIso) return;
  const start = new Date(startIso);
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return localISO(d); });
  const entries = stats.history.filter(h => days.includes(h.d))
    .sort((a, b) => a.d < b.d ? -1 : 1);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const title = new Intl.DateTimeFormat(localeTag(),{day:'numeric',month:'short'}).format(start) + ' — ' + new Intl.DateTimeFormat(localeTag(),{day:'numeric',month:'short'}).format(end);
  openSessions(t('sessions.weekLabel'), title, entries, t('sessions.weekEmpty'));
});

$('calGrid').addEventListener('click', e => {
  const cell = e.target.closest('.cal-cell.done');
  if(!cell || !cell.dataset.iso) return;
  const iso = cell.dataset.iso;
  const entries = stats.history.filter(h => h.d === iso);
  if(!entries.length) return;
  openSessions(t('sessions.dayLabel'), dayTitle(iso), entries, '', {status:true});
});

function renderStats(){ renderTotal(); renderStatsBlock(); renderGreeting(); }

// планы программы: новые программы хранят plans[], старые — поля верхнего уровня
// Варианты идут по дню недели, а не по времени добавления: заведя «Пн» после «Сб»,
// человек ждёт его в начале списка. Сортируем по самому раннему дню варианта,
// варианты без дней уходят в конец. Сортировка устойчивая (ES2019), поэтому равные
// сохраняют свой порядок, и повторный вызов уже ничего не меняет.
// При очереди (rotate) не сортируем никогда: там порядок вариантов — это и есть
// очередь, и дни принадлежат программе целиком, а не варианту.
function planDayRank(pl){
  const ds = (pl && pl.days) || [];
  let min = 99;
  ds.forEach(d => { const i = DAYS.indexOf(d); if(i >= 0 && i < min) min = i; });
  return min;
}
function sortPlans(plans){
  return plans.sort((a, b) => planDayRank(a) - planDayRank(b));
}
function normPlans(p){
  if(Array.isArray(p.plans) && p.plans.length){
    if(!p.rotate) sortPlans(p.plans);
    return p.plans;
  }
  return [{
    days: p.days || [],
    rounds: p.rounds || 3,
    roundRest: (p.roundRest === undefined) ? 120 : p.roundRest,
    exercises: p.exercises || []
  }];
}
function programDaysUnion(p){
  // при чередовании дни задаются один раз для всей программы:
  // они говорят КОГДА тренироваться, а какой вариант выпадет — решает очередь
  if(p && p.rotate && Array.isArray(p.days)) return DAYS.filter(d => p.days.includes(d));
  const plans = normPlans(p);
  return DAYS.filter(d => plans.some(pl => (pl.days || []).includes(d)));
}

/* ---- отключённая программа ----
   Программу бывает нужно убрать из планов, не удаляя: сезон закончился, травма,
   переключились на другую. Удаление забирает вместе с ней всю её статистику, а
   стереть расписание руками — значит потом набирать его заново.

   Отключённая программа ОСТАЁТСЯ В СПИСКЕ и её по-прежнему можно запустить
   руками: она не запрещена, она просто не стоит в расписании. Такая тренировка
   попадёт в историю как «сверх плана» — слотов у программы нет, и закрывать ей
   нечего, отдельного запрета для этого не нужно.

   Поле active заводится со значением по умолчанию «включена»: у всех уже
   сохранённых программ его нет, и `!== false` избавляет от миграции.
   programDaysUnion остаётся ЧИСТЫМ ЧТЕНИЕМ настроек — им пользуются редактор и
   карточка в списке, где дни надо показывать и у выключенной программы. Планы,
   неделя, серия и уведомления спрашивают planDays(). */
const progActive = p => !p || p.active !== false;
const planDays = p => progActive(p) ? programDaysUnion(p) : [];

// превращает выбранный план программы в тренировочный цикл
function customToProgram(p, planIdx = 0){
  const plans = normPlans(p);
  const plan = plans[planIdx] || plans[0];

  const mkWork = (ex, setNo, setsTotal, side)=>{
    const axis = progAxis(ex);          // 'weight' и для формата «вес», и для «повторения и вес»
    const on = axis !== 'none';         // общий тумблер «усложнять со временем»
    const isWeight = hasWeight(ex);     // формат включает вес — независимо от того, растёт ли он
    const isTimeFmt = ex.type === 'time';
    // «повторения и вес» — особый случай: вес и повторы растут НЕЗАВИСИМО друг от друга.
    // Явный 0 в шаге означает «эта конкретная ось у этого упражнения не растёт» — так ИИ
    // или сам человек может решить «поднимаем только вес» или «поднимаем только повторы».
    const wGrows = on && isWeight && progStepSize(ex, 'weight') > 0;
    const rGrows = on && !isTimeFmt && progStepSize(ex, 'reps') > 0;
    const tGrows = on && isTimeFmt && progStepSize(ex, 'time') > 0;

    const step = {
      phase:'work', title:ex.name, instruction:ex.desc || '', media:ex.media || null,
      video:ex.video || null, muscles:ex.muscles || [], mistakes:ex.mistakes || '',
      perSide: !!ex.perSide,
      progAxis: axis,
      // рабочий вес: сохранённая ручная поправка + текущие шаги программы поверх базы упражнения.
      // Если формат включает вес, но конкретно вес не растёт (растут только повторы) —
      // показываем зафиксированную базу: цифра всё равно нужна, просто она не меняется сама.
      weight: isWeight ? (wGrows ? getExProgValue(p.id, ex, p, 'weight') : progBaseValue(ex, 'weight')) : 0,
      weightBase: +ex.weight || 0,   // база упражнения (без прогрессии) — для справки в шаге тренировки
      wStep: ex.wStep != null ? +ex.wStep : 2, // != null — иначе явный 0 (не растим вес) подменится дефолтом
      exName: ex.name,
      exId: ex.id || ''  // по id проверка прогресса узнаёт, до каких упражнений дошла тренировка
    };
    // расти дальше некуда, а более сложный вариант задан — на тренировке покажем подсказку
    if(on && ex.swapOn && (ex.swapName || '').trim() && progAtCeiling(p.id, ex, p)){
      step.swap = {name: ex.swapName.trim(), desc: (ex.swapDesc || '').trim()};
    }
    if(setsTotal > 1){ step.setNo = setNo; step.setsTotal = setsTotal; }
    if(side){ step.side = side; step.sidesTotal = 2; }
    if(isTimeFmt){
      step.kind = 'timer';
      step.seconds = tGrows ? getExProgValue(p.id, ex, p, 'time') : parseValue(ex.value).min;
    } else {
      step.kind = 'click'; step.repsNote = t('workout.repsShort');
      // диапазон повторов сдвигается целиком (и низ, и верх), если повторы растут —
      // не зависит от того, растёт ли ОДНОВРЕМЕННО вес у этого же упражнения
      step.reps = rGrows ? progressedRepsRange(p.id, ex, p) : normValue(ex.value, 'reps');
    }
    return step;
  };
  // короткая пауза на смену стороны между половинами упражнения
  const mkSideSwitch = ()=> ({
    kind:'timer', phase:'rest', title:t('workout.switchSide'), seconds: Math.max(3, sideSec),
    instruction:t('workout.switchSideInstruction'), illo:'rest', sideSwitch:true
  });
  const mkRest = sec => ({kind:'timer', phase:'rest', title:t('workout.rest'), seconds:sec, instruction:t('workout.restInstruction'), illo:'rest'});

  const list = plan.exercises || [];
  const warmEx = list.filter(e => e.warmup);
  const mainEx = list.filter(e => !e.warmup);

  // Разминка выполняется один раз, до кругов, — но внутри устроена так же, как
  // основная часть: свои подходы и своя смена стороны. Раньше здесь жёстко стоял
  // один подход, и заданные у разминочного упражнения подходы молча терялись.
  const warmup = [];
  warmEx.forEach(ex =>{
    const sets = Math.max(1, Math.min(10, parseInt(ex.sets) || 1));
    const twoSides = ex.type === 'time' && ex.perSide;
    const restAfter = exRestAfter(ex);
    for(let n = 1; n <= sets; n++){
      const add = st => { st.isWarmup = true; warmup.push(st); };
      if(twoSides){
        add(mkWork(ex, n, sets, 1));
        warmup.push(mkSideSwitch());
        add(mkWork(ex, n, sets, 2));
      } else {
        add(mkWork(ex, n, sets));
      }
      // между подходами одного упражнения — ex.rest, после последнего (следующее
      // упражнение или конец разминки) — свой отдых «после упражнения»
      const restSec = n === sets ? restAfter : (+ex.rest || 0);
      if(restSec > 0) warmup.push(mkRest(restSec));
    }
  });

  // основная часть: у каждого упражнения свои подходы
  const cycle = [];
  mainEx.forEach((ex, i)=>{
    const sets = Math.max(1, Math.min(10, parseInt(ex.sets) || 1));
    const isLastEx = i === mainEx.length - 1;
    const twoSides = ex.type === 'time' && ex.perSide; // на время и на каждую сторону
    const restAfter = exRestAfter(ex);
    for(let s = 1; s <= sets; s++){
      if(twoSides){
        // каждая сторона отрабатывается полностью, между ними — пауза на смену
        cycle.push(mkWork(ex, s, sets, 1));
        cycle.push(mkSideSwitch());
        cycle.push(mkWork(ex, s, sets, 2));
      } else {
        cycle.push(mkWork(ex, s, sets));
      }
      const isLastSet = s === sets;
      // после самого последнего подхода самого последнего упражнения личный отдых
      // не ставим — там сработает отдых между кругами. Между подходами одного
      // упражнения — ex.rest, после последнего подхода (переход к следующему
      // упражнению) — свой отдых «после упражнения».
      if(isLastEx && isLastSet) continue;
      const restSec = isLastSet ? restAfter : (+ex.rest || 0);
      if(restSec > 0) cycle.push(mkRest(restSec));
    }
  });

  const rr = parseInt(plan.roundRest) || 0;
  if(rr > 0){
    cycle.push({kind:'timer', phase:'rest', title:t('workout.roundComplete'), seconds:rr, instruction:t('workout.roundRestInstruction'), illo:'water', roundRest:true});
  }

  const planTime = plan.time || p.time || '';
  const schedule = [planTime, (plan.days && plan.days.length) ? plan.days.map(canonicalLabel).join(', ') : ''].filter(Boolean).join(' · ');
  return {
    num: t('program.defaultMine'),
    title: p.name,
    sourceId: p.id,
    load: p.load || 100,
    desc: t('program.exerciseSummary',{count:list.length}) + (schedule ? '. ' + t('program.scheduleSummary',{schedule}) : ''),
    rounds: plan.rounds, cycle, warmup
  };
}

function closeAllMenus(){
  document.querySelectorAll('.ctx-menu.open').forEach(m => m.classList.remove('open', 'up'));
}
// Меню открывается вниз от кнопки, и у нижних карточек списка оно уезжало под док
// или вовсе за край экрана — пункты были недоступны. Открываем его вверх, если
// внизу не помещается. Док — плавающий и накрывает содержимое, поэтому нижней
// границей считаем его верх, а не низ окна.
function placeMenu(m){
  m.classList.remove('up');
  const vh = window.innerHeight;
  // Низ экрана закрывают док и панели, которые ПРИЛИПЛИ к низу («Сохранить программу»).
  // Та же панель на короткой странице стоит сразу под списком, посреди экрана, и
  // ничего не закрывает — раньше из-за неё меню открывалось вверх при свободном месте.
  let bottom = vh;
  const dock = document.querySelector('.dock');
  if(dock && getComputedStyle(dock).display !== 'none') bottom = Math.min(bottom, dock.getBoundingClientRect().top);
  document.querySelectorAll('.screen.on .actions, .screen.on .builder-actions').forEach(el => {
    const cs = getComputedStyle(el);
    if(cs.display === 'none' || (cs.position !== 'sticky' && cs.position !== 'fixed')) return;
    const b = el.getBoundingClientRect();
    if(b.height && b.top < vh && b.bottom >= vh - 2) bottom = Math.min(bottom, b.top);
  });
  const down = m.getBoundingClientRect();
  if(down.bottom <= bottom - 8) return;            // снизу помещается — вниз
  m.classList.add('up');
  const up = m.getBoundingClientRect();
  if(up.top >= 8) return;                          // снизу нет, сверху есть — вверх
  // не помещается ни так, ни так: вниз, и докручиваем страницу, чтобы меню было видно
  m.classList.remove('up');
  window.scrollBy({top: down.bottom - (bottom - 8), behavior: 'smooth'});
}
// Открыть меню: закрыть остальные, показать это и развернуть вверх, если надо.
function toggleMenu(m){
  const was = m.classList.contains('open');
  closeAllMenus();
  if(was) return;
  m.classList.add('open');
  placeMenu(m);
}
// первый тап мимо открытого меню только закрывает его и НЕ нажимает то, что под ним
document.addEventListener('click', e => {
  if(!document.querySelector('.ctx-menu.open')) return;
  if(e.target.closest('.ctx-menu') || e.target.closest('.more-btn')) return;
  e.preventDefault();
  e.stopPropagation();
  closeAllMenus();
}, true);

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
    if(!window.FitNative || !window.FitNative.installUpdate){
      renderAndroidUpdate('error');
      return false;
    }
    // нажатие во время загрузки — «Отменить»; во время проверки файла — ничего
    if(APP_UPDATE.busy){
      if(APP_UPDATE.phase==='downloading' && window.FitNative.cancelUpdate) await window.FitNative.cancelUpdate();
      return false;
    }
    APP_UPDATE.busy=true;
    renderAndroidUpdate('downloading',-1);
    const result=await window.FitNative.installUpdate(APP_UPDATE.url,APP_UPDATE.latest);
    return finishDirectUpdateResult(result);
  }
  if(window.FitNative && window.FitNative.openExternal){
    const ok = await window.FitNative.openExternal(APP_UPDATE.url);
    if(ok) return true;
  }
  return false;
}
// Баннер пересобирается при каждом обновлении настроек (в том числе после
// сворачивания): подхватываем загрузку, которая уже идёт или оборвалась.
async function restoreAndroidUpdateState(){
  if(!APP_UPDATE||APP_UPDATE.channel!=='direct'||!window.FitNative||!window.FitNative.getUpdateState)return;
  const st=await window.FitNative.getUpdateState();
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
  if(!window.FitNative||!window.FitNative.resumeUpdateInstall)return;
  APP_UPDATE.busy=true;
  APP_UPDATE.awaitingPermission=false;
  const result=await window.FitNative.resumeUpdateInstall(APP_UPDATE.latest);
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
  if(!raw || !window.FitNative || !window.FitNative.isNative || !window.FitNative.getAppInfo) return;
  if(typeof analyticsPlatform === 'function' && analyticsPlatform() !== 'android') return;

  const info=await window.FitNative.getAppInfo();
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
const BUILD = '20.09 · v22';
try{ window.FIT_TIMER_BUILD = BUILD; }catch(_){}
function renderBuild(){
  const el = $('buildLine');
  if(el) el.textContent = t('account.version') + ' ' + BUILD + ' · ' + t('account.buildNote');
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
  return !!(window.FitNative && window.FitNative.isNative
    && window.FitNative.biometricStatus && window.FitNative.authenticateBiometric);
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
    const state = await window.FitNative.biometricStatus();
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
    return await window.FitNative.authenticateBiometric({
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

/* ================= ПРЕДУСТАНОВЛЕННАЯ РАЗМИНКА ================= */
const WARMUP_SPEC = [
  {k:1,m:['le','ca'],type:'time',value:60,rest:10},
  {k:2,m:['sh','ar'],type:'time',value:45,rest:10},
  {k:3,m:['co','ba'],type:'time',value:45,rest:10},
  {k:4,m:['co','gl'],type:'time',value:30,rest:10},
  {k:5,m:['le','gl'],type:'reps',value:15,rest:15},
  {k:6,m:['le','gl'],type:'reps',value:12,rest:15},
  {k:7,m:['co','ba','le'],type:'time',value:30,rest:10},
  {k:8,m:['le','ca'],type:'time',value:45,rest:10},
  {k:9,m:['le','ca','sh'],type:'time',value:45,rest:10},
  {k:10,m:['ba','le'],type:'time',value:40,rest:0}
];
function warmupProgram(){
  const exercises = WARMUP_SPEC.map(x => ({
    name:t('warmup.'+x.k+'.name'), desc:t('warmup.'+x.k+'.desc'), video:'',
    type:x.type, value:x.value, rest:x.rest, media:null, muscles:x.m, mistakes:''
  }));
  return {id:'warmup',name:t('warmup.programName'),time:'',cover:null,stats:{completions:0},
    plans:[{days:[],rounds:1,roundRest:0,exercises}]};
}
function localizeBuiltinWarmup(p){
  if(!p || p.id !== 'warmup') return false;
  const pl = normPlans(p)[0], list = (pl && pl.exercises) || [];
  if(list.length !== WARMUP_SPEC.length) return false;
  const untouched = WARMUP_SPEC.every((x,i)=>{
    const ex=list[i], nk='warmup.'+x.k+'.name', dk='warmup.'+x.k+'.desc';
    return ex && [I18N_RU[nk],I18N_EN[nk]].includes(ex.name)
      && [I18N_RU[dk],I18N_EN[dk]].includes(ex.desc);
  });
  if(!untouched) return false;
  let changed = p.name !== t('warmup.programName');
  p.name = t('warmup.programName');
  WARMUP_SPEC.forEach((x,i)=>{
    const ex=list[i], name=t('warmup.'+x.k+'.name'), desc=t('warmup.'+x.k+'.desc');
    if(ex.name !== name || ex.desc !== desc) changed = true;
    ex.name=name; ex.desc=desc;
  });
  return changed;
}
async function ensureWarmup(){
  const existing = customPrograms.find(p => p.id === 'warmup');
  if(existing){
    if(localizeBuiltinWarmup(existing)) await savePrograms();
    if((await kvGet(pk('warmupAdded'))) !== '1') kvSet(pk('warmupAdded'),'1');
    return;
  }
  // Разминку добавляем один раз. Если её уже добавляли (флаг) или удалили на другом
  // устройстве (надгробие синхронизации), значит человек её удалил сам — раньше она
  // возвращалась при каждом запуске и переключении профиля.
  const owner = currentUser;
  const tomb = docMeta && docMeta[PROGRAM_DOC('warmup')];
  if((await kvGet(pk('warmupAdded'))) === '1' || (tomb && tomb.gone)) return;
  if(owner !== currentUser) return;
  customPrograms.unshift(warmupProgram());
  await savePrograms();
  kvSet(pk('warmupAdded'),'1');
}

/* ================= ФОТО-ПРОГРЕСС ================= */
let photos = []; // [{d:'ГГГГ-ММ-ДД', img:dataURL}] — отдельный ключ хранилища, фото тяжёлые
async function loadPhotos(){
  try{ photos = JSON.parse(await kvGet(pk('photos'))) || []; }catch(e){ photos = []; }
}
async function savePhotos(){ await kvSet(pk('photos'), JSON.stringify(photos)); }

function fmtD(iso){
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat(localeTag(), {day:'numeric', month:'short', year:'2-digit'}).format(d);
}
function shortD(iso){
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat(localeTag(), {day:'numeric', month:'short'}).format(d);
}

function renderPhotos(){
  const n = photos.length;
  $('photoCount').textContent = n ? t('progress.photoCount',{count:n}) : '';
  setShown('photoNowRow', !!n);
  const hint = $('photoHint');
  if(n){
    const last = new Date(photos[photos.length - 1].d);
    const days = Math.floor((new Date() - last) / 86400000);
    hint.textContent = days >= 7 ? t('progress.photoUpdate') : '';
    hint.style.color = 'var(--danger)';
  } else hint.textContent = '';

  // сетка вместо ленты: шестой снимок больше не обрезается краем экрана,
  // и у каждого подписана дата — иначе непонятно, что с чем сравнивать
  const strip = $('photoStrip');
  strip.innerHTML = '';
  photos.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ph-item';
    b.innerHTML = `<img src="${esc(p.img)}" alt=""><small>${shortD(p.d)}</small>`;
    b.onclick = ()=> openCompare(i);
    strip.appendChild(b);
  });
  setShown(strip, !!n);
  setShown('photoEmpty', !n);
  setShown('photoActions', n >= 2);
  setShown('btnDeleteAllPhotos', n > 0);
}

async function deleteAllPhotos(){
  if(!photos.length) return;
  const ok = await appDialog(
    t('progress.deleteAllPhotos',{count:photos.length}),
    {confirm: true, okText: t('common.delete'), cancelText: t('common.cancel'), type: t('progress.deleteConfirmPhrase')}
  );
  if(!ok) return;
  photos = [];
  await savePhotos();
  renderPhotos();
}

// Один день — один снимок: второе фото за ту же дату заменяет первое. Раньше замена
// происходила молча, и человек терял утренний кадр, сняв вечерний «на пробу».
async function addPhoto(file){
  const today = localISO(new Date());
  if(photos.some(p => p.d === today)){
    const ok = await appDialog(
      t('progress.todayReplace'),
      {confirm: true, okText: t('common.replace'), cancelText: t('common.cancel')}
    );
    if(!ok) return;
  }
  shrinkImage(file, 480, async dataUrl => {
    const ex = photos.find(p => p.d === today);
    if(ex) ex.img = dataUrl; else photos.push({d: today, img: dataUrl});
    photos.sort((a, b) => a.d < b.d ? -1 : 1);
    if(photos.length > 40) photos = photos.slice(-40); // защита хранилища
    await savePhotos();
    renderPhotos();
  });
}

function fillCmpSel(sel, idx){
  sel.innerHTML = '';
  photos.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = fmtD(p.d);
    if(i === idx) o.selected = true;
    sel.appendChild(o);
  });
}
function renderCmp(){
  const a = photos[+$('cmpA').value], b = photos[+$('cmpB').value];
  $('cmpImgA').innerHTML = a ? `<img src="${esc(a.img)}" alt="">` : '';
  $('cmpImgB').innerHTML = b ? `<img src="${esc(b.img)}" alt="">` : '';
  if(a && b){
    const days = Math.abs(Math.round((new Date(b.d) - new Date(a.d)) / 86400000));
    $('cmpDays').textContent = days
      ? t('progress.daysBetween',{count:days,days:appLocale === 'ru' ? plural(days,'день','дня','дней') : (days === 1 ? 'day' : 'days')})
      : t('progress.sameDay');
  }
}
// нажатие на снимок в сетке открывает сравнение сразу с ним справа,
// нажатие на кнопку — крайние даты (было/стало)
function openCompare(bIdx){
  if(photos.length < 2) return;
  const b = (typeof bIdx === 'number' && bIdx > 0) ? bIdx : photos.length - 1;
  fillCmpSel($('cmpA'), 0);
  fillCmpSel($('cmpB'), b);
  renderCmp();
  $('cmpModal').classList.add('open');
}

// свайп по фото в сравнении: влево — следующая дата, вправо — предыдущая.
// без оборота по кругу; правое фото не может стать раньше или равным левому
function cmpStep(which, dir){
  const selId = which === 'A' ? 'cmpA' : 'cmpB';
  const other = which === 'A' ? +$('cmpB').value : +$('cmpA').value;
  let idx = +$(selId).value + dir;
  if(idx < 0 || idx > photos.length - 1) return; // край — дальше некуда, свайп молча гасится
  if(which === 'A' && idx >= other) return;       // левое не может обогнать/сравняться с правым
  if(which === 'B' && idx <= other) return;       // правое не может стать раньше/равным левому
  $(selId).value = idx;
  renderCmp();
}
/* ---- снимок во весь экран ---- */
let pfIdx = 0;
function openPhotoFull(i){
  if(!photos.length) return;
  pfIdx = Math.max(0, Math.min(photos.length - 1, i));
  renderPhotoFull();
  $('photoFullModal').classList.add('open');
}
function renderPhotoFull(){
  const p = photos[pfIdx];
  if(!p) return;
  $('pfImg').src = p.img;
  $('pfCap').textContent = fmtD(p.d) + (photos.length > 1 ? ' · ' + t('progress.photoPosition',{current:pfIdx+1,total:photos.length}) : '');
}
function pfStep(d){
  const n = pfIdx + d;
  if(n < 0 || n > photos.length - 1) return;
  pfIdx = n;
  renderPhotoFull();
}
// свайп и нажатие живут на одном элементе, поэтому после свайпа гасим ближайший клик:
// иначе каждое пролистывание заодно открывало снимок во весь экран
const justSwiped = el => Date.now() - (+(el.dataset.swiped || 0)) < 400;
function wireSwipe(el, onLeft, onRight){
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY;
  }, {passive: true});
  el.addEventListener('touchend', e => {
    if(x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if(Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // слишком коротко или вертикально — не свайп
    el.dataset.swiped = String(Date.now());
    if(dx < 0) onLeft(); else onRight();
  }, {passive: true});
}
wireSwipe($('cmpImgA'), ()=> cmpStep('A', 1), ()=> cmpStep('A', -1));
wireSwipe($('cmpImgB'), ()=> cmpStep('B', 1), ()=> cmpStep('B', -1));
wireSwipe($('pfImg'), ()=> pfStep(1), ()=> pfStep(-1));
$('cmpImgA').onclick = ()=>{ if(!justSwiped($('cmpImgA'))) openPhotoFull(+$('cmpA').value); };
$('cmpImgB').onclick = ()=>{ if(!justSwiped($('cmpImgB'))) openPhotoFull(+$('cmpB').value); };
$('photoFullModal').onclick = e => { if(e.target === $('photoFullModal')) $('photoFullModal').classList.remove('open'); };
async function delCmpPhoto(which){
  const idx = +$(which).value;
  const p = photos[idx];
  if(!p) return;
  if(!(await appConfirm(t('progress.deletePhoto',{date:fmtD(p.d)})))) return;
  photos.splice(idx, 1);
  await savePhotos();
  renderPhotos();
  if(photos.length < 2){ $('cmpModal').classList.remove('open'); return; }
  fillCmpSel($('cmpA'), 0);
  fillCmpSel($('cmpB'), photos.length - 1);
  renderCmp();
}

function loadImg(src){
  return new Promise(res => { const i = new Image(); i.onload = ()=> res(i); i.onerror = ()=> res(null); i.src = src; });
}
function drawCover(x, img, dx, dy, dw, dh, r){
  x.save();
  roundRect(x, dx, dy, dw, dh, r);
  x.clip();
  const s = Math.max(dw / img.width, dh / img.height);
  const sw = dw / s, sh = dh / s;
  x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, dx, dy, dw, dh);
  x.restore();
}
async function shareGeneratedFile(blob, fname, title, savedText){
  if(window.FitNative && window.FitNative.isNative){
    const ok = await window.FitNative.shareFile(blob, fname, title || 'Fit Timer');
    if(!ok) appAlert(t('share.openFailed'));
    return ok;
  }
  const file = new File([blob], fname, {type:blob.type || 'application/octet-stream'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:title || 'Fit Timer'}); return true; }
    catch(e){ if(e && e.name === 'AbortError') return true; }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fname;
  link.click();
  setTimeout(()=> URL.revokeObjectURL(link.href), 5000);
  appAlert(savedText || t('share.savedDownloads'));
  return true;
}
async function shareCompare(){
  const a = photos[+$('cmpA').value], b = photos[+$('cmpB').value];
  if(!a || !b) return;
  const [ia, ib] = await Promise.all([loadImg(a.img), loadImg(b.img)]);
  if(!ia || !ib){ appAlert(t('progress.preparePhotoFailed')); return; }
  const cs = getComputedStyle(document.body);
  const col = n => cs.getPropertyValue(n).trim();
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  try{ await document.fonts.load('600 44px Oswald'); await document.fonts.load('500 38px Rubik'); }catch(e){}
  x.fillStyle = col('--bg'); x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = col('--muted'); x.font = '600 44px Oswald, sans-serif';
  x.fillText('F I T  /  T I M E R', W / 2, 110);
  x.fillStyle = col('--ink'); x.font = '500 46px Rubik, sans-serif';
  x.fillText(t('progress.myProgress'), W / 2, 190);
  // два фото
  const pw = 486, ph = 760, gy = 240;
  drawCover(x, ia, 34, gy, pw, ph, 26);
  drawCover(x, ib, W - 34 - pw, gy, pw, ph, 26);
  x.strokeStyle = col('--line'); x.lineWidth = 3;
  roundRect(x, 34, gy, pw, ph, 26); x.stroke();
  roundRect(x, W - 34 - pw, gy, pw, ph, 26); x.stroke();
  x.fillStyle = col('--muted'); x.font = '500 36px Rubik, sans-serif';
  x.fillText(fmtD(a.d), 34 + pw / 2, gy + ph + 58);
  x.fillText(fmtD(b.d), W - 34 - pw / 2, gy + ph + 58);
  const days = Math.abs(Math.round((new Date(b.d) - new Date(a.d)) / 86400000));
  x.fillStyle = col('--work'); x.font = '600 52px Oswald, sans-serif';
  x.fillText(days
    ? t('progress.daysWork',{count:days,days:appLocale === 'ru' ? plural(days,'ДЕНЬ','ДНЯ','ДНЕЙ') : (days === 1 ? 'DAY' : 'DAYS')})
    : t('progress.journeyStart'), W / 2, 1180);
  x.fillStyle = col('--muted'); x.font = '600 32px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, 1256);
  c.toBlob(async blob => {
    if(!blob){ appAlert(t('progress.imageFailed')); return; }
    await shareGeneratedFile(blob, 'fittimer-progress.png', t('progress.shareTitle'), t('progress.shareFallback'));
  }, 'image/png');
}

/* ================= ЭКСПОРТ / ИМПОРТ ВСЕХ ДАННЫХ ================= */
/* Что в резервную копию НЕ кладём, и почему именно это.

   Список исключений, а не список включений, — принципиально. Копия собиралась
   перечислением четырёх полей руками, и за ней не уследили: мимо прошли ручные
   правки веса (progWeights), режим тренера с его ником и ключом, вся картотека
   подопечных, пол с возрастом и — хуже всего — аккаунт с подпиской. Человек
   восстанавливался из копии и терял оплаченное, не узнав об этом.

   Теперь копия берёт ВСЁ, что перечислено в PROFILE_KEYS и GLOBAL_KEYS (те же
   списки, по которым идёт удаление — заводя ключ, его вписывают туда по 152-ФЗ),
   кроме вот этого: */
const NO_BACKUP = [
  // «прямо сейчас», а не данные: восстанавливать недоигранный подход из копии,
  // снятой месяц назад, — это вернуть человека в тренировку, которой не было
  'workoutSession',
  // служебное для обмена с сервером: восстановив очередь, телефон полезет
  // доотправлять то, чего на сервере уже нет
  'docMeta', 'outbox',
  // про устройство, а не про человека: два телефона с одним id — это два
  // телефона, притворяющиеся одним
  'deviceId'
];
const backupProfileKeys = () => PROFILE_KEYS.filter(k => !NO_BACKUP.includes(k));
const backupGlobalKeys  = () => GLOBAL_KEYS.filter(k => !NO_BACKUP.includes(k));

async function exportAllData(){
  const dump = {app: 'fittimer', version: 2, exportedAt: new Date().toISOString(),
                users, currentUser, data: {}, settings: {}};
  for(const u of users){
    // Складываем СЫРЫЕ строки, как они лежат в хранилище: копия не должна знать,
    // что внутри каждого ключа, — иначе она устареет вместе с первым же полем.
    const d = {};
    for(const k of backupProfileKeys()){
      const v = await kvGet(k + '_' + u.id);
      if(v != null) d[k] = v;
    }
    dump.data[u.id] = d;
  }
  for(const k of backupGlobalKeys()){
    const v = await kvGet(k);
    if(v != null) dump.settings[k] = v;
  }
  const blob = new Blob([JSON.stringify(dump, null, 1)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fittimer-backup-' + localISO(new Date()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  appAlert(t('backup.saved'));
}

async function importAllData(file){
  let dump;
  try{ dump = JSON.parse(await file.text()); }
  catch(e){ appAlert(t('backup.readFailed')); return; }
  if(!dump || dump.app !== 'fittimer' || !Array.isArray(dump.users)){
    appAlert(t('backup.invalid')); return;
  }
  if(!(await appConfirm(t('backup.replaceAll')))) return;

  /* Файл резервной копии — обычный JSON, и до сюда он мог доехать откуда угодно:
     его пересылают, правят в блокноте, собирают заново. Поэтому проходим по нему
     теми же пределами, что и по всему остальному. Раньше содержимое клалось в
     хранилище как есть, и имя профиля в мегабайт или строка вместо адреса
     фотографии приезжали прямо на экран. */
  const users = dump.users.filter(u => u && typeof u === 'object').slice(0, 20).map(u => {
    u.name = clampLine(u.name, NAME_MAX) || DEFAULT_NAME;
    u.photo = cleanPic(u.photo);
    if(u.gender && u.gender !== 'm' && u.gender !== 'f') u.gender = '';
    if(u.theme && !['system', 'light', 'dark'].includes(u.theme)) u.theme = 'system';
    return migrateUserAge(u);
  });
  if(!users.length){ appAlert(t('backup.noProfiles')); return; }

  await kvSet('users', JSON.stringify(users));
  await kvSet('currentUser', dump.currentUser || users[0].id);

  /* Копии первой версии складывали четыре поля разобранными объектами
     (programs/stats/photos/warmupAdded), вторая кладёт ВСЕ ключи сырыми строками.
     Читаем оба: файлы первой версии лежат у людей на диске, и ломать их задним
     числом значит отобрать у человека его же копию. */
  const OLD = {programs: 'customPrograms', stats: 'stats', photos: 'photos',
               warmupAdded: 'warmupAdded'};
  const raw = (v, k) => {
    if(v == null) return null;
    if(typeof v === 'string') return v;               // вторая версия
    if(k === 'warmupAdded') return v ? '1' : '0';     // первая: булево
    try{ return JSON.stringify(v); }catch(e){ return null; }
  };

  for(const [uid, d] of Object.entries(dump.data || {})){
    const got = {};
    for(const [oldName, key] of Object.entries(OLD)){
      if(d[oldName] !== undefined) got[key] = raw(d[oldName], oldName);
    }
    for(const k of backupProfileKeys()){
      if(d[k] !== undefined) got[k] = raw(d[k], k);
    }
    for(const [k, v] of Object.entries(got)){
      if(v == null) continue;
      await kvSet(k + '_' + uid, sanitizeBackupValue(k, v));
    }
  }
  for(const [k, v] of Object.entries(dump.settings || {})){
    // Кладём только известные ключи: файл не должен уметь завести в хранилище
    // то, чего приложение не заводит само.
    if(v == null || !backupGlobalKeys().includes(k)) continue;
    await kvSet(k, sanitizeBackupValue(k, raw(v, k)));
  }
  location.reload();
}

/* Значения из копии проходят те же пределы, что и всё пришедшее снаружи: файл
   пересылают, правят в блокноте, собирают заново. Чистим по смыслу ключа, а что
   не узнали — кладём как есть: это ключи, которые приложение пишет само, и трогать
   их содержимое здесь значило бы повторять их разбор во втором месте. */
function sanitizeBackupValue(key, str){
  const parse = () => { try{ return JSON.parse(str); }catch(e){ return null; } };
  if(key === 'customPrograms'){
    const list = parse();
    return JSON.stringify((Array.isArray(list) ? list : []).map(sanitizeProgram));
  }
  if(key === 'photos'){
    // Фото прогресса — те же data-адреса, что и у упражнений, и та же проверка.
    const list = parse();
    return JSON.stringify((Array.isArray(list) ? list : [])
      .map(ph => (ph && typeof ph === 'object' && cleanPic(ph.img)) ? {...ph, img: cleanPic(ph.img)} : null)
      .filter(Boolean));
  }
  if(key === 'trainer'){
    const t = parse() || {};
    t.name = clampLine(t.name, LIM.coachName);
    t.about = clampText(t.about, LIM.coachAbout);
    t.photo = cleanPic(t.photo) || '';
    t.links = cleanLink(t.links) || '';
    return JSON.stringify(t);
  }
  if(key === 'clients'){
    const list = parse();
    return JSON.stringify((Array.isArray(list) ? list : []).slice(0, 500).map(c => {
      if(!c || typeof c !== 'object') return null;
      c.name = clampLine(c.name, LIM.clientName);
      c.note = clampLine(c.note, LIM.clientNote);
      return c;
    }).filter(Boolean));
  }
  return str;
}

/* ================= КАРТИНКА ДЛЯ ШЕРИНГА =================
   Колонка полос, по полосе на метрику. Один и тот же код рисует и метрики тела,
   и самочувствие: отличаются они только набором полос.

   ВЫСОТА ХОЛСТА СЧИТАЕТСЯ ОТ ЧИСЛА ПОЛОС. С жиром и мышцами метрик тела стало
   шесть, а холст оставался 1080×1350: на полосу приходилось 150 точек, в которые
   не помещались ни шапка полосы, ни график под ней, — числа налезали на подписи,
   а линия выходила за подложку. Полоса теперь не меньше 210 точек, холст растёт
   вниз, а всё внутри полосы (отступы, кегли, поле графика) считается от её
   высоты, а не жёсткими числами: полоса любого размера остаётся читаемой.

   Подписи концов линии прижаты к полю графика: у точки под самым верхом подпись
   уходит ПОД неё, иначе она вылезала в шапку полосы. */
const SHARE_W = 1080, SHARE_TOP = 250, SHARE_BOT = 90, SHARE_GAP = 26, SHARE_LANE = 210;

async function sharePng(title, lanes, fname){
  const cs = getComputedStyle(document.body);
  // переменная темы может ссылаться на другую (--work: var(--accent)) — разворачиваем
  const col = n => {
    let v = cs.getPropertyValue(n).trim();
    for(let i = 0; i < 5 && /^var\(/.test(v); i++) v = cs.getPropertyValue(v.slice(4, -1).split(',')[0].trim()).trim();
    return v;
  };
  // «#RRGGBB» + прозрачность. Склейка «цвет + "44"» работала только с шестизначным
  // hex: на любом другом значении createLinearGradient().addColorStop() бросает
  // ошибку и обрывает всю отрисовку.
  const alpha = (c0, a) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c0).trim());
    return m ? `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})` : c0;
  };
  const num = v => new Intl.NumberFormat(localeTag(), {maximumFractionDigits:1}).format(Math.round(v * 10) / 10);

  // Полосу сначала подгоняем под привычные 1080×1350, потом зажимаем в границы
  // читаемости — и уже от неё считаем высоту холста. Так картинка с шестью
  // метриками растёт вниз, а с одной не превращается в полосу во весь экран.
  const n = Math.max(1, lanes.length);
  const W = SHARE_W;
  const fit = Math.floor((1350 - SHARE_TOP - SHARE_BOT - SHARE_GAP * (n - 1)) / n);
  const laneH = Math.max(SHARE_LANE, Math.min(320, fit));
  const H = SHARE_TOP + n * laneH + SHARE_GAP * (n - 1) + SHARE_BOT;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  try{
    await document.fonts.load('700 60px Oswald');
    await document.fonts.load('600 34px Oswald');
    await document.fonts.load('500 40px Rubik');
  }catch(e){}
  x.fillStyle = col('--bg'); x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = col('--muted'); x.font = '600 42px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, 100);
  x.fillStyle = col('--ink'); x.font = '500 54px Rubik, sans-serif';
  x.fillText(title, W / 2, 178);

  const gx = 70, gw = W - 140;
  // вся внутренняя вёрстка полосы — от её высоты
  const pad = Math.round(laneH * 0.11);
  const fsHead = Math.max(24, Math.min(34, Math.round(laneH * 0.17)));
  const fsVal = Math.max(22, Math.min(30, Math.round(laneH * 0.15)));
  let gy = SHARE_TOP;

  lanes.forEach(L => {
    const have = L.have;
    const pair = (L.have2 && L.have2.length === have.length) ? L.have2 : null;
    const color = col(L.v);
    const first = have[0], last = have[have.length - 1];
    const d = Math.round((last - first) * 10) / 10;
    // подложка
    x.fillStyle = col('--card'); x.strokeStyle = col('--line'); x.lineWidth = 2;
    roundRect(x, gx, gy, gw, laneH, 24); x.fill(); x.stroke();
    // шапка полосы: цветной кружок, название слева, изменение справа
    const headY = gy + pad + Math.round(fsHead * 0.85);
    x.fillStyle = color;
    x.beginPath(); x.arc(gx + 34, headY - Math.round(fsHead * 0.3), 11, 0, 7); x.fill();
    x.textAlign = 'left'; x.fillStyle = col('--ink'); x.font = `600 ${fsHead}px Oswald, sans-serif`;
    x.fillText(L.label, gx + 58, headY);
    x.textAlign = 'right';
    x.fillStyle = d < 0 ? col('--rest') : (d > 0 ? col('--work') : col('--muted'));
    x.font = `700 ${fsHead + 2}px Oswald, sans-serif`;
    const dTxt = d === 0 ? `${num(last)} ${L.unit}` : `${d > 0 ? '+' : '−'}${num(Math.abs(d))} ${L.unit}`;
    x.fillText(dTxt.trim(), gx + gw - 34, headY);

    // поле графика
    const plotX = gx + 40, plotW = gw - 80;
    const plotY = gy + pad + fsHead + Math.round(laneH * 0.07);
    const plotH = laneH - (plotY - gy) - pad;
    const all = pair ? have.concat(pair) : have;
    let min = Math.min(...all), max = Math.max(...all);
    const pd = Math.max((max - min) * 0.15, 0.5); min -= pd; max += pd;
    const span = Math.max(max - min, 1);
    const lx = i => plotX + plotW * (have.length === 1 ? .5 : i / (have.length - 1));
    const ly = v => plotY + plotH * (1 - (v - min) / span);
    // сетка
    x.strokeStyle = col('--line'); x.lineWidth = 1.5;
    for(let g = 0; g <= 2; g++){ const yy = plotY + plotH * g / 2; x.beginPath(); x.moveTo(plotX, yy); x.lineTo(plotX + plotW, yy); x.stroke(); }
    if(have.length > 1){
      // заливка
      const grad = x.createLinearGradient(0, plotY, 0, plotY + plotH);
      grad.addColorStop(0, alpha(color, .27)); grad.addColorStop(1, alpha(color, 0));
      x.beginPath(); x.moveTo(lx(0), ly(have[0]));
      have.forEach((v, i) => x.lineTo(lx(i), ly(v)));
      x.lineTo(lx(have.length - 1), plotY + plotH); x.lineTo(lx(0), plotY + plotH); x.closePath();
      x.fillStyle = grad; x.fill();
      // линия
      x.strokeStyle = color; x.lineWidth = 6; x.lineJoin = 'round'; x.lineCap = 'round';
      x.beginPath(); have.forEach((v, i) => i ? x.lineTo(lx(i), ly(v)) : x.moveTo(lx(i), ly(v))); x.stroke();
      // вторая половина одного числа (нижнее давление) — та же линия тоньше и бледнее
      if(pair){
        x.strokeStyle = alpha(color, .55); x.lineWidth = 4;
        x.beginPath(); pair.forEach((v, i) => i ? x.lineTo(lx(i), ly(v)) : x.moveTo(lx(i), ly(v))); x.stroke();
      }
    }
    x.fillStyle = color;
    x.beginPath(); x.arc(lx(0), ly(first), 9, 0, 7); x.fill();
    x.beginPath(); x.arc(lx(have.length - 1), ly(last), 11, 0, 7); x.fill();
    // подписи концов: у самого верха поля подпись уходит ПОД точку, иначе вылезет в шапку
    x.fillStyle = col('--ink'); x.font = `600 ${fsVal}px Oswald, sans-serif`;
    const mark = (i, v, v2, align) => {
      const py = ly(v);
      const yy = (py - 20 < plotY + fsVal) ? py + fsVal + 10 : py - 20;
      x.textAlign = align;
      x.fillText(pair ? `${num(v)}/${num(v2)}` : num(v), lx(i), Math.min(yy, plotY + plotH));
    };
    mark(0, first, pair ? pair[0] : 0, 'left');
    if(have.length > 1) mark(have.length - 1, last, pair ? pair[pair.length - 1] : 0, 'right');

    gy += laneH + SHARE_GAP;
  });

  x.textAlign = 'center';
  x.fillStyle = col('--muted'); x.font = '600 30px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, H - 44);

  c.toBlob(async blob => {
    if(!blob){ appAlert(t('progress.imageFailed')); return; }
    await shareGeneratedFile(blob, fname, title + ' — Fit Timer', t('progress.shareSaved'));
  }, 'image/png');
  return c;
}

// полосы метрик тела: тот же порядок, что в карточке «Вес и объёмы»
function shareBodyLanes(){
  const ws = stats.weights || [];
  const defs = [
    {k:'w',v:'--work',label:t('progress.bodyWeight'),unit:t('progress.kg')},
    {k:'fat',v:'--danger',label:t('progress.bodyFat'),unit:'%'},
    {k:'musc',v:'--ok',label:t('progress.bodyMuscle'),unit:'%'},
    {k:'waist',v:'--accent-ink',label:t('progress.waist'),unit:t('progress.cm')},
    {k:'hips',v:'--rest-ink',label:t('progress.hips'),unit:t('progress.cm')},
    {k:'chest',v:'--warn',label:t('progress.chest'),unit:t('progress.cm')}
  ];
  return defs.map(item => {
    item.have = ws.map(p => p[item.k]).filter(v => v != null).slice(-30);
    return item;
  }).filter(L => L.have.length);
}

// полосы самочувствия: давление идёт парой линий — верхнее ведёт, нижнее следом
function shareWellLanes(){
  const ws = wellList();
  const defs = [
    {k:'sys',pair:'dia',v:'--danger',label:t('progress.pressure'),unit:''},
    {k:'pulse',v:'--accent-ink',label:t('progress.pulse'),unit:t('progress.bpm')},
    {k:'sleep',v:'--rest-ink',label:t('progress.sleep'),unit:t('progress.hoursShort')}
  ];
  return defs.map(item => {
    const pts = ws.filter(p => p[item.k] != null).slice(-30);
    item.have = pts.map(p => p[item.k]);
    item.have2 = (item.pair && pts.length && pts.every(p => p[item.pair] != null)) ? pts.map(p => p[item.pair]) : null;
    return item;
  }).filter(L => L.have.length);
}

async function shareWeightChart(){
  const lanes = shareBodyLanes();
  if(!lanes.length){ appAlert(t('progress.addMetricFirst')); return; }
  await sharePng(t('progress.myChanges'), lanes, 'fittimer-progress.png');
}

async function shareWellChart(){
  const lanes = shareWellLanes();
  if(!lanes.length){ appAlert(t('progress.addWellnessFirst')); return; }
  await sharePng(t('progress.myWellness'), lanes, 'fittimer-wellness.png');
}

/* ================= ИСТОРИЯ ВЕСА (правка задним числом) ================= */
function openWeightHist(){
  const list = $('whList'); list.innerHTML = '';
  const entries = stats.weights.slice(-30).reverse();
  entries.forEach(en => {
    const row = document.createElement('div');
    row.className = 'wh-row';
    const [y, m, d] = en.d.split('-');
    const cell = (k, lbl, v, st) => `<div class="whc"><label>${lbl}</label><input type="number" step="${st || 0.5}" inputmode="decimal" value="${v || ''}" data-k="${k}"></div>`;
    row.innerHTML =
      `<div class="wh-top"><b>${+d} ${MONTH_OF[+m - 1]} ${y}</b>` +
      `<button type="button" class="wh-del" title="${esc(t('progress.deleteEntry'))}">${icon('trash')}</button></div>` +
      `<div class="wh-cells">` +
        `<div class="whc"><label>${esc(t('common.weight'))}</label><input type="number" step="0.1" inputmode="decimal" value="${en.w}" data-d="${en.d}" data-k="w"></div>` +
        cell('fat', t('progress.fat'), en.fat, 0.1) + cell('musc', t('progress.muscle'), en.musc, 0.1) +
        cell('waist', t('progress.waistLabel'), en.waist) + cell('hips', t('progress.hipsLabel'), en.hips) + cell('chest', t('progress.chestLabel'), en.chest) +
      `</div>`;
    row.querySelector('.wh-del').onclick = ()=> row.classList.toggle('del');
    list.appendChild(row);
  });
  $('whModal').classList.add('open');
}
async function saveWeightHist(){
  const rows = [...$('whList').querySelectorAll('.wh-row')];
  for(const row of rows){
    const wInp = row.querySelector('input[data-k=w]');
    const d = wInp.dataset.d;
    const i = stats.weights.findIndex(e => e.d === d);
    if(i < 0) continue;
    if(row.classList.contains('del')){
      stats.weights.splice(i, 1);
      continue;
    }
    const en = stats.weights[i];
    const w = parseFloat(String(wInp.value).replace(',', '.'));
    if(w && w >= 20 && w <= 300) en.w = w;
    // у обхватов и процентов разные границы: 18 % жира — нормальная цифра, 18 см талии — нет
    const lim = {waist: [30, 200], hips: [30, 200], chest: [30, 200], fat: [3, 70], musc: [10, 80]};
    for(const k of Object.keys(lim)){
      const v = parseFloat(String(row.querySelector(`input[data-k=${k}]`).value).replace(',', '.'));
      if(v && v >= lim[k][0] && v <= lim[k][1]) en[k] = Math.round(v * 10) / 10; else delete en[k];
    }
  }
  stats.weights.sort((a, b) => a.d < b.d ? -1 : 1);
  await saveStats();
  $('whModal').classList.remove('open');
  renderWeight();
}

/* ================= ПЕРВЫЙ ЗАПУСК (ОНБОРДИНГ) ================= */
/* ================= ПРЕДЕЛЫ ПОЛЕЙ =================

   Одно место на всё приложение, и это не вкусовщина: длина поля решается дважды —
   когда человек печатает и когда ТО ЖЕ САМОЕ приезжает снаружи. Снаружи приезжает
   много: программа по ссылке от тренера, программа из каталога, файл программы,
   код FIT1, резервная копия. Там `maxlength` не действует, и ровно там встречается
   и миллион символов, и кавычка посреди адреса картинки.

   Поэтому правило одно, а применяется в трёх местах: атрибут в разметке (чтобы
   нельзя было напечатать), обрезка при сохранении (чтобы нельзя было вставить) и
   разбор всего, что пришло снаружи (`sanitizeProgram`).

   Числа взяты не с потолка: столько помещается там, где поле показывают. Имя
   программы — в карточку, «о себе» — на страницу тренера, описание упражнения —
   в свёрнутый блок на экране упражнения. */
const LIM = {
  progName: 60, progDesc: 1000,
  exName: 60, exDesc: 600, exMistakes: 300, exSwapName: 60, exSwapDesc: 600,
  exValue: 16,               // «12-15», «01:30» — больше там быть нечему
  link: 120, video: 300,
  userName: 20, clientName: 40, clientNote: 80,
  coachName: 40, coachAbout: 400, coachHandle: 30,
  gives: 300, note: 500, wish: 600,
  aiAnswer: 80000,           // ответ нейросети — это целая программа, он правда длинный
  pic: 900 * 1024            // картинка в строке base64
};

/* Управляющие символы из текста убираем ВСЕГДА. Перевод строки и табуляция —
   это текст, остальное — нет: невидимые символы ломают разметку, сортировку и
   поиск, а человек их не видит и не может убрать. */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\uFEFF]/g;
// Разделители строк из юникода — это ПЕРЕНОС, а не мусор: выбросив их молча,
// склеишь два слова в одно («…ния» + «тут» → «ниятут»). Сводим к обычному \n,
// а дальше с ним поступают по правилам поля.
const NL = /[\u2028\u2029\r]/g;

// Многострочный текст: описания, заметки, «о себе».
function clampText(v, max){
  return String(v == null ? '' : v).replace(NL, '\n').replace(CTRL, '').trim().slice(0, max);
}
// Однострочный: имена, названия. Перенос строки в названии программы — это
// две строки в карточке там, где место под одну.
function clampLine(v, max){
  return String(v == null ? '' : v).replace(NL, '\n').replace(CTRL, '')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
const clampNum = (v, min, max, dflt) => {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  if(!isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

/* Картинка. Всё, что мы показываем через <img src>, обязано быть data-адресом
   картинки и ничем другим. Чужая программа приносит это поле как обычную строку,
   и строка вида  x" onerror="…  превращается в чужой код на экране: браузер
   читает атрибут, а не наше намерение. Проверяем ФОРМУ, а не доверяем источнику. */
const PIC_RE = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/;
function cleanPic(v){
  const s = String(v == null ? '' : v).trim();
  return (s.length <= LIM.pic && PIC_RE.test(s)) ? s : null;
}

/* Ссылка на себя. «Где меня найти» — это адрес, а не слово: «хуй» в этом поле
   уезжает на страницу тренера и делается ссылкой https://хуй, по которой человек
   нажимает и попадает в никуда. Поэтому требуем то, что вообще может быть адресом:
   имя узла с точкой. Схему дописываем сами — её не набирают.

   Возвращает нормализованный адрес или null. Ругаться и объяснять — дело того,
   кто вызвал: в одном месте это надпись под полем, в другом молчаливый пропуск. */
const HOST_RE = /^[a-zа-яё0-9]([a-zа-яё0-9-]*[a-zа-яё0-9])?(\.[a-zа-яё0-9-]+)+$/i;
function cleanLink(v, max){
  let s = clampLine(v, max || LIM.link);
  if(!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, m => /^https?:\/\//i.test(m) ? m : '');
  // Схемы вроде javascript: и data: не начинаются с //, поэтому их ловим отдельно.
  if(/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null;
  const bare = s.replace(/^https?:\/\//i, '');
  const host = bare.split(/[/?#]/)[0];
  if(!HOST_RE.test(host)) return null;
  return /^https?:\/\//i.test(s) ? s : 'https://' + s;
}

/* Всё, что приехало снаружи, чистится ОДНОЙ функцией: программа по ссылке, из
   каталога, из файла, из кода FIT1 и из резервной копии проходят один и тот же
   путь. Разводить их по местам нельзя — каждый забытый путь и есть дыра. */
function sanitizeProgram(p){
  if(!p || typeof p !== 'object') return p;
  p.name = clampLine(p.name, LIM.progName) || t('program.default');
  if(p.desc != null) p.desc = clampText(p.desc, LIM.progDesc);
  p.cover = cleanPic(p.cover);
  if(p.by != null) p.by = clampLine(p.by, 40);
  if(p.byLink != null) p.byLink = cleanLink(p.byLink) || '';
  (Array.isArray(p.plans) ? p.plans : []).forEach(pl => {
    if(!pl || typeof pl !== 'object') return;
    (Array.isArray(pl.exercises) ? pl.exercises : []).forEach(sanitizeExercise);
  });
  (Array.isArray(p.exercises) ? p.exercises : []).forEach(sanitizeExercise);
  uniqueExerciseIds(p);
  return p;
}
// id упражнения обязан быть уникальным в программе: по нему сопоставляются
// AI-правки и проверка прогресса на финише. Раньше «дублировать упражнение»
// копировало id вместе со всем остальным — такие копии получают свой.
function uniqueExerciseIds(p){
  let changed = false;
  const seen = new Set();
  (Array.isArray(p.plans) ? p.plans : []).concat([{exercises: p.exercises}]).forEach(pl => {
    (pl && Array.isArray(pl.exercises) ? pl.exercises : []).forEach(ex => {
      if(!ex || typeof ex !== 'object') return;
      if(!ex.id || seen.has(ex.id)){ ex.id = newExId(); changed = true; }
      seen.add(ex.id);
    });
  });
  return changed;
}
function sanitizeExercise(ex){
  if(!ex || typeof ex !== 'object') return;
  // упражнения из старых данных (созданы до появления id) или пришедшие по
  // сети без него — см. newExId() в 60-builder.js
  if(!ex.id) ex.id = newExId();
  ex.name = clampLine(ex.name, LIM.exName);
  if(ex.desc != null)     ex.desc = clampText(ex.desc, LIM.exDesc);
  if(ex.mistakes != null) ex.mistakes = clampText(ex.mistakes, LIM.exMistakes);
  if(ex.swapName != null) ex.swapName = clampLine(ex.swapName, LIM.exSwapName);
  if(ex.swapDesc != null) ex.swapDesc = clampText(ex.swapDesc, LIM.exSwapDesc);
  if(ex.video != null)    ex.video = cleanLink(ex.video, LIM.video) || '';
  if(ex.value != null && typeof ex.value === 'string') ex.value = clampLine(ex.value, LIM.exValue);
  const pic = ex.media && ex.media.kind === 'img' ? cleanPic(ex.media.data) : null;
  ex.media = pic ? {kind: 'img', data: pic} : null;
  // ex.ps — фактическая прогрессия (см. 60-builder.js), сюда же может прийти
  // что угодно из чужой ссылки/синка — те же ограничения, что у остальных полей
  if(ex.ps && typeof ex.ps === 'object'){
    ex.ps.n = Math.max(0, Math.min(9999, Math.round(+ex.ps.n || 0)));
    const cur = ex.ps.cur;
    ex.ps.cur = (cur && typeof cur === 'object') ? {
      reps: cur.reps != null ? clampLine(String(cur.reps), LIM.exValue) : undefined,
      sec: cur.sec != null ? Math.max(0, Math.min(3600, Math.round(+cur.sec || 0))) : undefined,
      kg: cur.kg != null ? Math.max(0, Math.min(500, Math.round((+cur.kg || 0) * 2) / 2)) : undefined
    } : {};
  } else delete ex.ps;
}

// Имя профиля. На старте его не спрашивают, но называться профиль как-то должен.
// «Гость» здесь не годится: гость — это чужой и ненадолго, а человек у себя дома
// и надолго. Имя профиля, в отличие от аккаунта, ничего не адресует — уникальность
// ему не нужна, поэтому первый профиль просто «Мой профиль», а следующие нумеруются,
// чтобы их можно было различить в списке.
const NAME_MAX = 20;   // длиннее не помещается ни в приветствие, ни в строку профиля
const DEFAULT_PROFILE_NAMES = ['Мой профиль','My profile'];
const defaultProfileName = ()=> t('profile.defaultMine');
function nextProfileName(){
  if(!users.some(u => DEFAULT_PROFILE_NAMES.includes((u.name || '').trim()))) return defaultProfileName();
  let n = 1;
  users.forEach(u => {
    const m = /^(?:Профиль|Profile)\s+(\d+)$/i.exec((u.name || '').trim());
    if(m) n = Math.max(n, +m[1]);
  });
  return t('profile.defaultNumber',{count:n+1});
}

function startOnboarding(){
  // Тема первого запуска — системная. Раньше здесь жёстко включалась светлая, и на
  // тёмном телефоне знакомство начиналось с белой вспышки во весь экран. Дальше
  // человек всё равно переключит её в настройках, а первое впечатление уже испорчено.
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  themeLight = !dark;
  applyTheme();
  show('scrOnboard', false);
}

// Профиль заводится по нажатию любой кнопки знакомства — и там же фиксируется согласие
// с правилами, о котором написано под кнопками.
async function finishOnboardingCreate(){
  if(users.length) return false;
  const u = {
    id: 'u' + Date.now(),
    name: nextProfileName(),
    gender: '', age: null, photo: null,
    theme: 'system', locale: 'system'
  };
  users = [u];
  await saveUsers();
  currentUser = u.id;
  kvSet('currentUser', u.id);
  await loadIdentity();
  recordConsent('terms');
  await loadData();
  await loadPhotos();
  await ensureWarmup();
  renderUsers(); renderMine(); renderStats(); renderWeight(); renderWellness(); renderPhotos();
  applyTheme();
  return true;
}

/* ---- пол и возраст: спрашиваем по требованию ---- */
// Оба поля обязательны. Пол по умолчанию не выбран вовсе: подставленный «женский»
// уходил в запрос к ИИ как настоящий ответ, и половина программ составлялась не для
// того человека. Пропустить вопрос нельзя — «Отмена» возвращает туда, откуда пришли.
const WHO_MSG = {
  program:'who.programMsg',
  ai:'who.aiMsg'
};
let whoDraft = null, whoDone = null;
const needWho = u => !!u && (!profileAge(u) || !u.gender);
function whoSyncForm(){
  $('whoF').classList.toggle('act', whoDraft.gender === 'f');
  $('whoM').classList.toggle('act', whoDraft.gender === 'm');
  $('whoSave').disabled = !whoDraft.gender || !!ageError($('whoAge').value || '', true);
}
function askWho(reason){
  const u = curUser();
  if(!u) return Promise.resolve(false);
  whoDraft = {gender: u.gender || ''};
  $('whoMsg').textContent = t(WHO_MSG[reason] || WHO_MSG.program);
  $('whoAge').value = profileAge(u) || '';
  whoSyncForm();
  $('whoModal').classList.add('open');
  return new Promise(res => { whoDone = res; });
}
// Экран, которому эти данные нужны, уже открыт: попап видно поверх него. Если человек
// отказался отвечать — уводим обратно, а не оставляем его на экране, который без
// ответа всё равно не сработает.
function requireWho(reason, onCancel){
  const u = curUser();
  if(!u || !needWho(u)) return;
  askWho(reason).then(ok => { if(!ok && onCancel) onCancel(); });
}
async function whoFinish(save){
  const u = curUser();
  if(!u){ $('whoModal').classList.remove('open'); return; }
  if(save){
    const age = $('whoAge').value || '';
    const err = ageError(age, true);
    if(err){ appAlert(err); return; }
    if(!whoDraft.gender){ appAlert(t('profile.genderNeeded')); return; }
    u.gender = whoDraft.gender;
    u.age = validAge(age);
    await saveUsers();
    renderUsers();
  }
  $('whoModal').classList.remove('open');
  if(whoDone){ whoDone(!!save); whoDone = null; }
}


window.addEventListener('appLocaleChanged', async ()=>{
  const p = customPrograms.find(x=>x.id==='warmup');
  if(p && localizeBuiltinWarmup(p)) await savePrograms();
  try{ renderMine(); renderToday(); }catch(_){}
});
/* ================= ПРОГРЕССИЯ НАГРУЗКИ ================= */
// Раз в progression ТРЕНИРОВОК ЭТОГО УПРАЖНЕНИЯ рабочая нагрузка растёт на свой
// шаг — см. ensurePs/advanceExerciseProgression в 60-builder.js и инкремент
// ex.ps.n в commitFinish (70-workout.js). Раньше был один счётчик на программу
// (p.progSteps, потом progStepsAdj поверх floor(completions/progression)):
// удобно для отката, но при чередовании вариантов A/Б каждое упражнение
// получало +1 шаг за КАЖДУЮ тренировку программы, включая дни, где его вообще
// не было. Состояние теперь у каждого упражнения отдельно и растёт только тогда,
// когда это упражнение реально выполнено.
// Прогрессия по-прежнему считается по ФАКТИЧЕСКИ пройденным тренировкам, а не по
// календарю: раньше вес рос просто оттого, что прошло время (отпуск на месяц —
// и программа подняла нагрузку на четыре шага без единой тренировки), что и
// демотивирует, и травмоопасно.
// applyProgressionAll() здесь — не про сам расчёт (он в ensurePs/getExProgValue),
// а только про одноразовую миграцию старых программ на эту модель.
function applyProgressionAll(){
  let changed = false;
  customPrograms.forEach(p => {
    // у программ, живших на календарной прогрессии, уже накоплен progSteps — превращаем его
    // в ручную поправку, чтобы прогресс не обнулился при переходе на счёт по тренировкам
    if(p.progLast != null && p.progStepsAdj == null){
      // переносим только реально накопленный календарём счётчик. Если его нет, программа
      // на календарной прогрессии не жила и переносить нечего: поправка «0 минус авто»
      // ушла бы в минус и навсегда обнулила бы весь будущий рост
      if(p.progSteps != null){
        const done = (p.stats && p.stats.completions) || 0;
        const auto = p.progression ? Math.floor(done / p.progression) : 0;
        p.progStepsAdj = Math.max(0, Math.round(+p.progSteps || 0)) - auto;
      }
      delete p.progLast; // календарь больше не используется
      changed = true;
    }
  });
  if(applyPerExerciseProgressionMigration()) changed = true;
  customPrograms.forEach(p => { if(uniqueExerciseIds(p)) changed = true; });
  if(changed) savePrograms();
}

// Переход с одного счётчика шагов на программу (progSteps = floor(completions/
// progression) + progStepsAdj, читался на лету) на состояние у каждого
// упражнения (ex.ps.cur) — см. docs/ai-edit-progression-plan.md, пачка 3.
// Работает один раз на программу (p.psMigrated): текущая нагрузка КАЖДОГО
// упражнения прогоняется через advanceExerciseProgression() ровно столько раз,
// сколько шагов у него уже фактически накопилось по СТАРОЙ формуле — так все
// ограничения (потолок, двойная прогрессия) применяются как всегда, а не
// переносятся смещением. ex.value/ex.weight (база) не трогаем: если человек ещё
// не обновил мобильное приложение, оно продолжит показывать те же числа, что и
// раньше — база и общий счётчик программы у него по-прежнему на месте, ex.ps
// он просто не знает. Дрейф возможен, только если тренировки на старом
// приложении продолжаются ПОСЛЕ того, как программа уже росла на новом —
// тот же класс риска, что и у любого другого различия версий приложения.
function applyPerExerciseProgressionMigration(){
  let changed = false;
  customPrograms.forEach(p => {
    if(p.psMigrated) return;
    p.psMigrated = true;
    changed = true;
    if(!p.progression) return;
    const done = Math.max(0, +((p.stats && p.stats.completions) || 0));
    const oldProgramSteps = Math.max(0, Math.floor(done / p.progression) + Math.round(+p.progStepsAdj || 0));
    normPlans(p).forEach(pl => (pl.exercises || []).forEach(ex => {
      const progFrom = Math.max(0, Math.round(+ex.progFrom || 0));
      delete ex.progFrom;
      if(ex.warmup || progAxis(ex) === 'none') return;
      ensurePs(ex).n = done % p.progression;
      const exSteps = Math.max(0, oldProgramSteps - progFrom);
      for(let i = 0; i < exSteps; i++) advanceExerciseProgression(ex);
    }));
  });
  return changed;
}

/* ================= ПРИВЕТСТВИЕ И БЛОК «СЕГОДНЯ» ================= */

/* Чип на главной — короткая метка, и объяснить себя в двух словах она не может:
   «под угрозой» и «отработано» звучат как приговор, пока не сказано, что за ними.
   Поэтому чип с объяснением — КНОПКА, и нажатие открывает одну фразу: откуда
   число и что с ним делать. Тот же приём, что у достижений в «Прогрессе». */
function makeChip({ico, val, label, cls, why}){
  const el = document.createElement(why ? 'button' : 'span');
  if(why) el.type = 'button';
  el.className = 'g-chip' + (cls ? ' ' + cls : '');
  const has = val !== '' && val != null;
  el.innerHTML = icon(ico) + (has ? '<b></b>' : '') + '<span></span>';
  if(has) el.querySelector('b').textContent = val;
  el.querySelector('span').textContent = label;
  if(why) el.onclick = ()=> appAlert(why);
  return el;
}

function renderGreeting(){
  const u = curUser();
  const h = new Date().getHours();
  const hi = h < 5 ? t('home.goodNight') : h < 12 ? t('home.goodMorning') : h < 18 ? t('home.goodDay') : t('home.goodEvening');
  const name = (u && u.name || '').trim();
  // Имени на главной нет намеренно. Своё имя человек и так знает, а в крупном
  // начертании оно ведёт себя непредсказуемо: длинное переносится, короткое выглядит
  // обрубком, имя по умолчанию превращает приветствие в «Доброе утро, Мой профиль».
  // Одно приветствие читается спокойнее и одинаково у всех. Чей это экран, показывает
  // аватарка рядом.
  $('greetName').textContent = hi;
  // аватарка: фото, первая буква имени или иконка — то же правило, что в профиле
  $('greetAva').innerHTML = (u && u.photo)
    ? `<img src="${esc(u.photo)}" alt="">`
    : (name ? esc(name[0].toUpperCase()) : icon('user'));
  const box = $('greetChips');
  box.innerHTML = '';
  const chip = o => box.appendChild(makeChip(o));
  const si = calcStreakInfo();
  // Серия не пропадает с экрана от одного пропуска. Пока долг можно отработать, она
  // висит «под угрозой» — это приглашение, а не приговор; а сгоревшая оставляет после
  // себя рекорд, потому что собранное мы не отбираем.
  if(si.n) chip({
    ico: 'flame', val: si.n, cls: si.risk ? 'warn' : 'hot',
    label: si.risk ? t('home.streakRisk') : streakWord(si.n, si.byPlan),
    // числа в подсказках стоят ПОСЛЕ двоеточия: «1 тренировка ещё не пройдены»
    // получалось само собой, стоило числу встать перед глаголом
    why: si.risk
      ? t('home.streakRiskWhy',{count:si.n})
      : t('home.streakWhy',{count:si.n})
  });
  else if(si.best > 1) chip({
    ico: 'flame', val: si.best, label: t('home.bestStreak'),
    why: t('home.bestStreakWhy',{count:si.best})
  });
  const n = stats.count || 0;
  // счётчик тренировок теперь крупной цифрой ниже, в «Прогрессе», — в чипах он был вторым разом
  const mins = Math.round((stats.totalSec || 0) / 60);
  if(mins) chip({
    ico: 'clock',
    val: mins < 60 ? mins : Math.round(mins / 60),
    label: mins < 60 ? t('home.minutesTotal') : t(Math.round(mins/60)===1?'home.hourTotalOne':'home.hourTotalMany'),
    why: t('home.totalTimeWhy',{minutes:mins,workouts:n})
  });
  if(!box.children.length) chip({ico:'sparkle',label:t('home.firstAhead')});
  // крупные цифры под приветствием — они же кнопки в нужную вкладку статистики
  const last = stats.weights && stats.weights.length ? stats.weights[stats.weights.length - 1] : null;
  countTo('qsVal1', n);
  $('qsVal2').textContent = last && last.w ? String(last.w).replace('.', ',') : '—';
  countTo('qsVal3', (photos || []).length);
  renderWellQuick();
}

// Вторая строка «Прогресса»: давление, пульс и сон средним за месяц.
// Плитка появляется только под то, что человек правда записывает, — см. wellAvg().
function renderWellQuick(){
  const box = $('qsWell');
  if(!box) return;
  const a = wellAvg();
  const r1 = v => String(Math.round(v));
  const cards = [];
  // давление — одно число из двух половин, врозь «124» и «79» не читаются
  // «Ср.» стоит в самой подписи: отдельная строка-пояснение под плитками была лишним
  // текстом, а без неё среднее читалось как последнее измерение
  if(a.sys != null && a.dia != null) cards.push({ico: 'gauge', val: r1(a.sys) + '/' + r1(a.dia), label: t('home.avgPressure')});
  if(a.pulse != null) cards.push({ico: 'heart', val: r1(a.pulse), label: t('home.avgPulse')});
  if(a.sleep != null) cards.push({ico: 'moon', val: String(Math.round(a.sleep * 10) / 10).replace('.', ','), label: t('home.avgSleep')});
  box.innerHTML = '';
  cards.forEach(({ico, val, label}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qs-btn';
    b.innerHTML = `<span class="qs-ico">${icon(ico)}</span><b></b><span></span>`;
    b.querySelector('b').textContent = val;
    b.querySelector('span:last-child').textContent = label;
    // самочувствие живёт во вкладке «Тело» — там же, где вес
    b.onclick = ()=> openStats('weight');
    box.appendChild(b);
  });
  setShown(box, !!cards.length);
}

// счётчик добегает до значения — но только если человек не просил убрать движение
function countTo(id, val){
  const el = $(id);
  if(!el) return;
  val = Math.max(0, Math.round(val || 0));
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce || val <= 1 || el.textContent === String(val)){ el.textContent = val; return; }
  clearInterval(el._cnt);
  const t0 = Date.now(), dur = 520;
  el._cnt = setInterval(()=>{
    const k = Math.min(1, (Date.now() - t0) / dur);
    el.textContent = Math.round(val * (1 - Math.pow(1 - k, 3)));
    if(k >= 1) clearInterval(el._cnt);
  }, 40);
}

// строка плана — целиком кнопка, чтобы нажатие по названию программы работало
function todayRow({cls, ico, title, sub, action, onclick}){
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'today-row' + (cls ? ' ' + cls : '');
  row.innerHTML = `<span class="tr-ico">${icon(ico)}</span>` +
    `<span class="ti"><b></b><small></small></span>` +
    `<span class="tr-go"></span>`;
  row.querySelector('b').textContent = title;
  row.querySelector('small').textContent = sub;
  row.querySelector('.tr-go').textContent = action;
  row.onclick = onclick;
  return row;
}

// неделя одним взглядом: где галочка — уже сделано, где точка — по плану.
// Состояние передаётся формой значка, а не только цветом.
/* ---- неделя: что назначено, что закрыто и что ещё можно отработать ----
   Неделя считается по СЛОТАМ плана, а слот — это «программа P в день D».
   День выполнен, только когда закрыты ВСЕ слоты этого дня. Раньше день закрывала
   любая тренировка: человек делал десятиминутную разминку вместо силовой — и неделя
   рапортовала «выполнено».
   ОТРАБОТКА: лишняя тренировка закрывает ПРОШЕДШИЙ незакрытый слот той же программы.
   Пропустил среду, сделал в четверг — неделя закрыта, а не «2 из 3 и крестик».
   План недельный, и закрывать его неделей честнее, чем требовать попадания в день.
   Будущие слоты и сегодняшний отработкой НЕ закрываются: иначе «План на сегодня» звал
   бы на тренировку, которую неделя уже посчитала сделанной, — два экрана врали бы
   друг про друга.
   Записи истории до появления pid (id программы) отнести к плану нельзя — они идут
   в «сверх плана», а не занижают выполнение. */
function weekPlanInfo(date){
  const now = date || new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  // «сегодня» — всегда настоящее сегодня: для прошедших недель все слоты уже позади
  const todayIso = localISO(new Date());
  const isos = DAYS.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return localISO(d); });
  const hist = stats.history || [];

  const slots = [];
  customPrograms.forEach(p => planDays(p).forEach(nm => {
    const i = DAYS.indexOf(nm);
    if(i >= 0) slots.push({pid: p.id, idx: i, from: null});
  }));
  const ent = [];
  hist.forEach(h => {
    const i = isos.indexOf(h.d);
    if(i >= 0) ent.push({idx: i, pid: h.pid || null, used: false});
  });
  ent.sort((a, b) => a.idx - b.idx);

  // 1) тренировка в свой день закрывает свой слот
  slots.forEach(s => {
    const e = ent.find(x => !x.used && x.pid === s.pid && x.idx === s.idx);
    if(e){ e.used = true; s.from = s.idx; }
  });
  // 2) отработка: свободная тренировка той же программы закрывает прошедший пропуск.
  //    Берём ближайшую по времени, чтобы подпись «отработана в четверг» не врала.
  slots.forEach(s => {
    if(s.from !== null || isos[s.idx] >= todayIso) return;
    let best = null;
    ent.forEach(x => {
      if(x.used || x.pid !== s.pid) return;
      if(!best || Math.abs(x.idx - s.idx) < Math.abs(best.idx - s.idx)) best = x;
    });
    if(best){ best.used = true; s.from = best.idx; }
  });

  const days = DAYS.map((nm, i) => {
    const mine = slots.filter(s => s.idx === i);
    const shut = mine.filter(s => s.from !== null);
    const iso = isos[i];
    const past = iso < todayIso;
    return {
      name: nm, iso, idx: i,
      planned: mine.length,
      done: shut.length,
      slots: mine.map(s => ({pid:s.pid, from:s.from})),
      moved: shut.filter(s => s.from !== i).length,
      movedFrom: [...new Set(shut.filter(s => s.from !== i).map(s => s.from))],
      help: slots.filter(s => s.from === i && s.idx !== i).length, // закрыл чужой пропуск
      extra: ent.filter(x => x.idx === i && !x.used).length,
      any: ent.some(x => x.idx === i),
      full: mine.length > 0 && shut.length >= mine.length,
      part: mine.length > 0 && shut.length > 0 && shut.length < mine.length,
      debt: mine.length > 0 && shut.length < mine.length && past,
      past, today: iso === todayIso, future: iso > todayIso
    };
  });
  // долг — только прошедшие незакрытые слоты: сегодняшний план ещё не пропуск
  const debt = slots.filter(s => s.from === null && isos[s.idx] < todayIso).sort((a, b) => a.idx - b.idx);
  return {
    monday, todayIso, days, debt,
    plannedDays: days.filter(d => d.planned).length,
    fullDays: days.filter(d => d.full).length,
    plannedTotal: slots.length,
    doneTotal: slots.filter(s => s.from !== null).length,
    movedTotal: slots.filter(s => s.from !== null && s.from !== s.idx).length,
    debtTotal: debt.length,
    extraTotal: ent.filter(x => !x.used).length,
    anyDays: days.filter(d => d.any).length
  };
}

function renderWeekStrip(){
  const box = $('weekStrip');
  if(!box) return;
  box.innerHTML = '';
  const w = weekPlanInfo();
  const di = (new Date().getDay() + 6) % 7;
  w.days.forEach((d, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    // пропуск — только у прошедших дней: сегодняшний план ещё можно закрыть
    cell.className = 'ws-day'
      + (d.planned && !d.past && !d.done ? ' plan' : '')
      + (d.full ? ' done' : (d.part ? ' part' : ''))
      + (i === di ? ' today' : '');
    let mark = '<i></i>';
    if(d.full) mark = `<span class="ws-ok">${icon('check')}</span>`;
    else if(d.part) mark = `<span class="ws-part">${d.done}/${d.planned}</span>`;
    else if(d.debt) mark = '<i class="ws-debt"></i>';
    else if(!d.planned && d.any) mark = `<span class="ws-extra">${icon('check')}</span>`;
    cell.innerHTML = `<b>${canonicalLabel(d.name)}</b>` + mark;
    cell.onclick = ()=> openWeekDay(d);
    box.appendChild(cell);
  });
  // ---- счёт недели: цифра, полоса и чипы вместо одной серой строки через « · » ----
  // Смысл тот же, что и был (weekPlanInfo не трогаем), но «сколько закрыто» и
  // «что ещё можно закрыть» — разные мысли, и читаться должны раздельно.
  const planned = w.plannedTotal, closed = planned > 0 && w.doneTotal >= planned;
  setShown('weekScore', planned > 0);
  setShown('weekBar', planned > 0);
  if(planned > 0){
    $('weekDone').textContent = w.doneTotal;
    $('weekOf').textContent = t('week.of',{total:planned});
    $('weekScore').classList.toggle('full', closed);
    $('weekBar').classList.toggle('full', closed);
    // ширину ставим следующим кадром — иначе полоса не «дорастает», а появляется готовой
    const fill = Math.round(100 * Math.min(1, w.doneTotal / planned)) + '%';
    requestAnimationFrame(()=> { $('weekBarFill').style.width = fill; });
  }

  const chips = $('weekChips');
  chips.innerHTML = '';
  const chip = o => chips.appendChild(makeChip(o));
  if(planned > 0){
    if(closed) chip({
      ico: 'check', val: '', label: t('week.closed'), cls: 'ok',
      why: t('week.closedWhy',{done:planned,total:planned})
    });
    // пропуск — не приговор, а незакрытое дело: неделя ещё идёт, срок — воскресенье
    else if(w.debtTotal) chip({
      ico: 'clock', val: w.debtTotal, label: t('week.makeUp'), cls: 'warn',
      why: t('week.makeUpWhy',{count:w.debtTotal})
    });
    if(w.movedTotal) chip({
      ico: 'reset', val: w.movedTotal, label: t(w.movedTotal===1?'week.movedOne':'week.movedMany'),
      why: t('week.movedWhy',{count:w.movedTotal})
    });
    // «сверх плана» без плана — пустые слова: там всё, что сделано, и есть вся неделя
    if(w.extraTotal) chip({
      ico: 'plus', val: w.extraTotal, label: t('week.extra'),
      why: t('week.extraWhy',{count:w.extraTotal})
    });
  }

  // подпись остаётся ровно там, где чипами не сказать: расписания ещё нет
  const hint = !planned
    ? (w.anyDays
        ? t('week.doneThisWeek',{count:w.anyDays,workouts:appLocale==='ru'?plural(w.anyDays,t('calendar.workoutOne'),t('calendar.workoutFew'),t('calendar.workoutMany')):t(w.anyDays===1?'calendar.workoutOne':'calendar.workoutFew')})
        : t('week.daysUnset'))
    : '';
  $('weekStripHint').textContent = hint;
  setShown('weekStripHint', !!hint);
}

// Программа из попапа дня: закрываем попап и открываем страницу программы на том
// варианте, который стоит в этот день. Состав смотрят уже там, а не в попапе.
function openDayProgram(pid, pi){
  const p = customPrograms.find(x => x.id === pid);
  if(!p) return;
  $('sessModal').classList.remove('open');
  openStart(p);
  if(pi >= 0 && pi < normPlans(p).length && pi !== state.planIdx){
    state.planIdx = pi; renderPlanRow(); renderStartInfo();
  }
}

// нажатие по дню недели: выполненное остаётся подробной историей, а незакрытый
// план показываем отдельными карточками программ — не строкой названий через запятую.
function openWeekDay(d){
  const entries = (stats.history || []).filter(h => h.d === d.iso);
  const title = canonicalLabel(DAY_FULL[d.idx]) + ', ' + dayTitle(d.iso);
  openSessions(t('sessions.dayLabel'), title, entries, '', {status:true});
  const box = $('sessList');
  let plannedRows = 0;

  (d.slots || []).forEach(slot => {
    // Слот, закрытый тренировкой именно в этот день, уже показан выше как sessRow.
    // Здесь нужны только будущие/пропущенные планы и отработки в другой день.
    if(slot.from === d.idx) return;
    const p = customPrograms.find(x => x.id === slot.pid);
    if(!p) return;

    const plans = normPlans(p);
    let planIdx = 0;
    if(p.rotate && plans.length > 1){
      planIdx = defaultPlanIdx(plans, p);
    }else{
      const found = plans.findIndex(pl => (pl.days || []).includes(d.name));
      if(found >= 0) planIdx = found;
    }
    const plan = plans[planIdx] || plans[0] || null;
    const moved = slot.from !== null && slot.from !== d.idx;
    // Обычный текст вместо плашек: что с этой тренировкой в этот день.
    const parts = [moved
      ? t('week.dayMovedOn',{day:appLocale === 'ru' ? canonicalLabel(DAY_FULL[slot.from]).toLowerCase() : canonicalLabel(DAY_FULL[slot.from])})
      : (d.past ? t('week.canStillMakeUp') : t('week.plannedText'))];
    if(p.rotate && plans.length > 1) parts.push(t('today.variant',{current:planIdx+1,total:plans.length}) + '.');

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'sess-row sess-link';
    row.innerHTML = '<div class="sess-head"><b></b></div><p class="sess-line"></p>';
    row.querySelector('.sess-head b').textContent = p.name || t('sessions.workoutFallback');
    row.querySelector('.sess-line').textContent = parts.join(' ');
    row.onclick = () => openDayProgram(p.id, plans.indexOf(plan));

    box.appendChild(row);
    plannedRows++;
  });

  if(!entries.length && !plannedRows){
    const empty = document.createElement('p');
    empty.className = 'sess-empty';
    empty.textContent = t('week.nonePlanned');
    box.appendChild(empty);
  }
}

function renderToday(){
  renderWeekStrip();
  const box = $('todayBox');
  const di = (new Date().getDay() + 6) % 7;
  const today = DAYS[di];
  $('todayDayName').textContent = canonicalLabel(DAY_FULL[di]);
  const anyDays = customPrograms.some(p => planDays(p).length);
  setShown(box, true);
  // раньше без расписания блок просто исчезал, и «Сегодня» оставалась пустой.
  // Теперь она всегда честно говорит, что делать дальше, и ведёт в «Тренировки».
  if(!anyDays){
    const l = $('todayList');
    l.innerHTML = '';
    box.classList.remove('has-plan');
    const own = customPrograms.filter(p => p.id !== 'warmup').length;
    const onlyWarmup = !own && customPrograms.length > 0;
    // расписание может быть задано и при этом не работать — если все программы
    // выключены. «Расписание не задано» звало бы чинить то, что не сломано
    const allOff = !!own && customPrograms.every(p => !progActive(p) || !programDaysUnion(p).length)
                   && customPrograms.some(p => !progActive(p) && programDaysUnion(p).length);
    l.appendChild(todayRow({
      cls: 'rest info',
      ico: allOff ? 'power' : 'sparkle',
      title: allOff ? t('today.programsOff') : (own ? t('today.noSchedule') : (onlyWarmup ? t('today.warmupOnly') : t('today.noPrograms'))),
      sub: allOff ? t('today.enableProgram')
                  : (own ? t('today.chooseDays') : t('today.buildProgram')),
      action: own ? t('today.open') : t('today.create'),
      onclick: ()=> goTab('scrPrograms')
    }));
    return;
  }

  const doneToday = new Set(stats.history.filter(h => h.d === localISO(new Date())).map(h => h.pid));
  const scheduled = [];
  customPrograms.forEach(p => {
    if(!progActive(p)) return;   // выключенная программа на сегодня не зовёт
    const plans = normPlans(p);
    if(p.rotate && plans.length > 1){
      // ротация: дни общие для программы, вариант берём очередной по очереди
      if((p.days || []).includes(today)){
        scheduled.push({p, plan: plans[defaultPlanIdx(plans, p)], done: doneToday.has(p.id), rot: true});
      }
      return;
    }
    const idx = plans.findIndex(pl => (pl.days || []).includes(today));
    if(idx >= 0) scheduled.push({p, plan: plans[idx], done: doneToday.has(p.id)});
  });

  const list = $('todayList');
  list.innerHTML = '';
  box.classList.toggle('has-plan', scheduled.length > 0);

  // Отработка: пропущенный день недели, который ещё можно закрыть. Пропуск без
  // способа исправиться — тупик: человек видит дыру в неделе и ничего не может с ней
  // сделать. Строка даёт конкретное выполнимое дело и появляется только тогда, когда
  // на сегодня ничего не ждёт: сначала сегодняшний план, долги потом.
  const makeUpRow = ()=>{
    const w = weekPlanInfo();
    const slot = w.debt[0];
    if(!slot) return null;
    const p = customPrograms.find(x => x.id === slot.pid);
    if(!p) return null;
    const more = w.debtTotal > 1 ? t('today.andMore',{count:w.debtTotal-1}) : '';
    return todayRow({
      ico: 'reset',
      title: t('today.makeUp'),
      sub: t('today.makeUpSub',{day:canonicalLabel(DAY_FULL[slot.idx]),name:p.name,more}),
      action: t('today.start'),
      onclick: ()=> openStart(p)
    });
  };

  if(scheduled.length){
    scheduled.forEach(({p, plan, done, rot}) => {
      const setsTotal = (plan.exercises || []).reduce((n, e) => n + (e.warmup ? 0 : (parseInt(e.sets) || 1)), 0);
      const bits = [];
      if(rot){
        const plansR = normPlans(p);
        bits.push(t('today.variant',{current:plansR.indexOf(plan)+1,total:plansR.length}));
      }
      bits.push(storeCountText(plan.exercises.length,'exercise'));
      // силовая (подходы у упражнений) — показываем подходы, круговая — круги
      if(plan.rounds > 1) bits.push(storeCountText(plan.rounds,'round'));
      else if(setsTotal > plan.exercises.length) bits.push(storeCountText(setsTotal,'set'));
      const planTime = plan.time || p.time;
      if(planTime) bits.push(planTime);
      list.appendChild(todayRow({
        cls: done ? 'done' : '',
        ico: done ? 'check' : 'play',
        title: p.name,
        sub: done ? t('today.done') : bits.join(' · '),
        action: done ? t('today.again') : t('today.start'),
        onclick: () => openStart(p)
      }));
    });
    // сегодняшнее сделано — можно предложить закрыть долг недели
    if(scheduled.every(s => s.done)){
      const mu = makeUpRow();
      if(mu) list.appendChild(mu);
    }
  } else {
    // день отдыха: ищем ближайшую тренировку в ближайшие 7 дней
    let next = null;
    for(let i = 1; i <= 7 && !next; i++){
      const d = new Date(); d.setDate(d.getDate() + i);
      const dd = DAYS[(d.getDay() + 6) % 7];
      for(const p of customPrograms){
        if(planDays(p).includes(dd)){ next = {day: DAY_FULL[(d.getDay() + 6) % 7], p, in: i}; break; }
      }
    }
    if(next){
      // раньше здесь был просто текст «Следующая тренировка: завтра — Название».
      // Название выглядело нажимаемым, но не нажималось. Теперь это обычная строка
      // плана: тап открывает программу, и в день отдыха можно начать её досрочно.
      const when = next.in === 1 ? t('today.tomorrow') : t('today.onDay',{day:canonicalLabel(next.day)});
      // Название следующей программы в день отдыха не показываем: до неё ещё дожить,
      // а расписание может смениться. Достаточно дня — «Следующая — в понедельник».
      // День установки: программу только что добавили, а приложение отвечает
      // «сегодня отдых» — и первая тренировка не случается никогда. Пока не пройдена
      // ни одна, «отдыха» не бывает: расписание есть, но начать предлагаем сейчас.
      const neverTrained = !stats.history.length;
      list.appendChild(todayRow({
        cls: neverTrained ? '' : 'rest',
        ico: neverTrained ? 'play' : 'moon',
        title: neverTrained ? t('today.startToday') : t('today.rest'),   // заголовок строки не переносится: длиннее — обрежется
        sub: neverTrained ? t('today.firstWorkout',{name:next.p.name}) : t('today.next',{when}),
        action: neverTrained ? t('today.start') : t('today.open'),
        onclick: () => openStart(next.p)
      }));
      // в день отдыха незакрытый долг важнее общих слов про отдых: он конкретен,
      // выполним сегодня и закрывает неделю
      const mu = neverTrained ? null : makeUpRow();
      if(mu) list.appendChild(mu);
      else {
        const note = document.createElement('p');
        note.className = 'today-note';
        note.textContent = neverTrained
          ? t('today.firstNote',{when})
          : t('today.restNote');
        list.appendChild(note);
      }
    } else {
      list.appendChild(todayRow({
        cls: 'rest info',
        ico: 'moon',
        title: t('today.rest'),
        sub: t('today.noWeekWorkouts'),
        action: t('today.open'),
        onclick: () => goTab('scrPrograms')
      }));
    }
  }
}

/* Дублировать программу. Обычный способ начать новую от готовой: у тренера —
   вариант той же программы под другого подопечного, у человека — «то же, но легче».
   Всё, что привязано к ПРОЙДЕННОМУ, копия не наследует: статистика, счётчик
   повышений, метка каталога, метка чужой ссылки. Копия — новая программа,
   а не продолжение старой. */
async function duplicateProgram(p){
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = 'p' + Date.now();
  copy.name = (p.name || t('program.fallback')) + ' — ' + t('program.copySuffix');
  copy.stats = {completions: 0};
  delete copy.progStepsAdj; delete copy.progLast;
  // прогресс каждого упражнения (ex.ps) — тоже часть «пройденного», копия начинает с базы
  normPlans(copy).forEach(pl => (pl.exercises || []).forEach(ex => { delete ex.ps; }));
  delete copy.storeId;      // не «из каталога»: это уже своя программа
  delete copy.pub;          // заявка в каталог принадлежит оригиналу
  delete copy.src;          // и отчёты чужому тренеру от копии уходить не должны
  delete copy.by; delete copy.byLink; delete copy.origEx;
  customPrograms.push(copy);
  await savePrograms();
  renderMine();
  return copy;
}

/* ================= ЭКСПОРТ / ИМПОРТ ПРОГРАММ ================= */
/* ПРОГРАММУ В АДРЕС НЕ КЛАДЁМ. Раньше ссылка выглядела как ?import=FIT1.<вся
   программа в base64>, и на длинной программе это молча ломалось: Vercel отбивает
   такой запрос на границе (URI_TOO_LONG, предел около 14 КБ) — до приложения он
   вообще не доходит, и получатель видит ошибку хостинга вместо программы.
   Три упражнения каталога дают 4 КБ, а у тренера их бывает десять, плюс разминка,
   описания и замены. То есть ломалось ровно на настоящих программах.

   Ссылка теперь одна и только через сервер: короткая, с любой программой, и по ней
   видно, открыл ли её человек. Когда сервера нет, ссылки НЕ БУДЕТ вовсе — вместо
   неё код или файл. Выдать адрес, который у получателя не откроется, хуже, чем
   честно сказать, что ссылка сейчас недоступна. */

/* КАРТИНКИ ЕДУТ ВМЕСТЕ С ПРОГРАММОЙ.

   Раньше и обложка, и фото упражнений выбрасывались: они не помещались в адрес,
   куда программа паковалась целиком. Адреса больше нет — программа идёт на сервер
   обычным JSON, и выбрасывать картинки стало не нужно, а вредно. Тренер их для
   того и ставил: по фото человек понимает движение быстрее, чем по описанию.

   Общий вес ограничен: хранилище не принимает сколь угодно большую запись, а
   двадцать фото по сто килобайт — это уже не программа, а фотоальбом. Что не
   влезло — отбрасывается с конца, и программа всё равно доезжает. */
const MEDIA_BUDGET = 700 * 1024;

// Карта «название упражнения → фото». Отдельно от текста программы, потому что в
// каталоге программа лежит ТЕКСТОМ, а текст картинку в себе не носит. Одна карта
// работает и для ссылки подопечному, и для каталога.
function programMedia(p){
  const out = {};
  let left = MEDIA_BUDGET;
  normPlans(p).forEach(pl => (pl.exercises || []).forEach(ex => {
    const d = ex.media && ex.media.kind === 'img' ? ex.media.data : null;
    const name = (ex.name || '').trim();
    if(!d || !name || out[name]) return;
    if(d.length > left) return;          // не влезло — молча пропускаем, программа важнее
    out[name] = d;
    left -= d.length;
  }));
  return out;
}
// Вернуть фото на места после разбора текста программы.
function applyMedia(p, media){
  if(!media) return p;
  normPlans(p).forEach(pl => (pl.exercises || []).forEach(ex => {
    // cleanPic, а не «есть значит есть»: карта фото приходит с сервера обычным
    // JSON, и строка в ней может быть любой — в том числе такой, что уедет в
    // атрибут <img src> и станет там не адресом.
    const d = cleanPic(media[(ex.name || '').trim()]);
    if(d) ex.media = {kind: 'img', data: d};
  }));
  return p;
}

// Что уезжает получателю: без чужой статистики, но С картинками.
function programPayload(p){
  const copy = JSON.parse(JSON.stringify(p));
  delete copy.stats;
  delete copy.active;     // «отключена» — про мой список, а не про саму программу
  delete copy.src;        // метка чужой ссылки получателю не нужна
  delete copy.origEx;     // снимок для сравнения — дело получателя, а не отправителя
  delete copy.pub;        // заявка в каталог принадлежит оригиналу
  // Обложка и фото остаются. Лишний вес срезает programMedia — здесь только то,
  // что не влезло в общий предел.
  const media = programMedia(p);
  copy.plans = normPlans(copy).map(pl => ({
    ...pl,
    exercises: pl.exercises.map(ex => {
      const keep = media[(ex.name || '').trim()];
      return {...ex, media: keep ? {kind: 'img', data: keep} : null};
    })
  }));
  delete copy.exercises; delete copy.rounds; delete copy.roundRest; delete copy.days;
  // Штамп тренера. По нему приложение подопечного поймёт, от кого программа, и покажет
  // кнопку отчёта. Поле by не новое: под этим же именем ник лежит у программ каталога.
  if(typeof trainerOn === 'function' && trainerOn()){
    copy.by = normHandle(trainer.handle);
    if((trainer.links || '').trim()) copy.byLink = trainer.links.trim();
  }
  return copy;
}

// Короткая ссылка через сервер. Бросает — значит ссылки нет, и это надо сказать.
// Ник тренера уходит и внутри программы, и отдельным полем — сервер показывает его
// на своей стороне, приложение на своей. Берём оба значения ИЗ ОДНОГО места: пока
// отдельное поле заполнялось само по себе, оно молча оставалось пустым.
/* Кто такой тренер — то, что увидит подопечный на его странице. Уезжает ВМЕСТЕ со
   ссылкой, а не отдельным действием: отдельное «сохранить профиль» человек забудет
   нажать, и подопечный увидит пустую страницу. Здесь же профиль всегда свежий. */
function trainerProfile(){
  // Имя тренера своё, но пустым уезжать не должно: у тех, кто включил режим до
  // появления поля, его просто нет, а страница без имени доверия не вызывает.
  const me = users.find(u => u.id === currentUser);
  // Те же пределы, что и на входе. Поля правятся не только через форму — их
  // переносит вход по почте, и тогда `maxlength` в разметке не при чём.
  return {
    name: clampLine(trainer.name, LIM.coachName) || clampLine(me && me.name, LIM.coachName),
    photo: cleanPic(trainer.photo) || '',   // сжато до 240px при загрузке
    about: clampText(trainer.about, LIM.coachAbout),
    years: clampNum(trainer.years, 0, 60, null),
    links: cleanLink(trainer.links) || ''
  };
}

/* Отправка профиля на сервер происходит только по явной кнопке «Сохранить». */
async function pushProfile(){
  if(!trainerAccountReady()){
    trainer.pageErr = t('trainer.needAccountPage');
    return false;
  }
  if(!trainerOn()) return false;
  try{
    // Правка и чтение страницы — один адрес, разные глаголы: страница одна.
    const r = await apiPost('/api/trainer/' + encodeURIComponent(normHandle(trainer.handle)), Object.assign({
      trainer: trainerProfile(),
      trainerKey: trainer.key || ''
    }, accountAuth()));
    if(r.trainerKey) trainer.key = r.trainerKey;
    trainer.pageErr = null;
    return true;
  }catch(e){
    trainer.pageErr = e && e.code === 'handle_taken'
      ? t('trainer.handleTaken')
      : t('trainer.saveFailed');
    return false;
  }
}

// Публичная страница — серверный источник данных тренера. Подтягиваем её при
// входе в раздел и при запуске даже без Premium: аккаунт тренера бесплатный, а
// его имя и описание не должны зависеть от синхронизации тренировок.
async function refreshTrainerProfile(){
  if(!trainerAccountReady() || !(trainer && trainer.handle)) return false;
  try{
    const remote = await apiFetch('/api/trainer/' + encodeURIComponent(normHandle(trainer.handle)));
    ['name', 'photo', 'about', 'links'].forEach(k => { trainer[k] = remote[k] || ''; });
    trainer.years = remote.years == null ? null : remote.years;
    trainer.pageErr = null;
    await saveTrainer({remote:true});
    if(show._last === 'scrAccount') renderTrainerCard();
    return true;
  }catch(e){
    return false;
  }
}

/* ---- ссылки, отправленные подопечным ---- */

/* Нужны ровно в одном месте — когда человек удаляет аккаунт: на сервере список
   «кто кому что отправил» нигде не собран, и собирать его ради одного удаления
   значило бы завести ещё одно место, где такое хранится. Знает его только этот
   телефон. */
function coachLinkIds(){
  const out = [];
  (clients || []).forEach(c => clProgs(c).forEach(pr => {
    if(pr.link && pr.link.id) out.push(pr.link.id);
  }));
  return out;
}

// Человеческие названия отказов сервера. Код вроде mail_failed сам по себе не
// говорит человеку ничего, а разбираться ему придётся самому.
const MAIL_ERRS = {
  no_mail:'mail.noMail', no_store:'mail.noStore', bad_email:'mail.badEmail',
  too_many_today:'mail.tooManyToday', rate_limited:'mail.rateLimited',
  code_expired:'mail.codeExpired', too_many_tries:'mail.tooManyTries',
  bad_code:'mail.badCode', handle_taken:'mail.handleTaken', offline:'mail.offline'
};
const mailErrText = e => (e && MAIL_ERRS[e.code] ? t(MAIL_ERRS[e.code]) : null)
  || (e && e.code === 'mail_failed'
      ? t('mail.failed',{detail:(e.detail || '').slice(0,120) || t('mail.serviceRefused')})
      : t('mail.generic'));

/* ---- удаление ----

   Два объёма, и разница между ними существенная. «Удалить данные о себе» очищает
   СТРАНИЦУ: имя, фото, «о себе», стаж, ссылку. Ник остаётся, ключ правки остаётся,
   программы в каталоге остаются — человек убрал о себе сведения, а не отозвал
   сделанное. Полное удаление аккаунта уносит ещё и сам аккаунт со ссылками
   подопечным, но каталог не трогает и там: программа, которую взяли себе сотни
   людей, — это не сведения о человеке, а сделанная им вещь. */
async function forgetMe(scope){
  const body = {scope, links: scope === 'all' ? coachLinkIds() : []};
  if(trainer && trainer.key && (trainer.handle || '').trim()){
    body.handle = normHandle(trainer.handle);
    body.trainerKey = trainer.key;
  }
  if(account && account.email) body.email = account.email;
  if(account && account.syncToken){
    body.syncToken = account.syncToken;
    body.deviceId = (identity && identity.deviceId) || '';
  }
  if(!body.handle && !body.email) return true;   // на сервере нас нет
  await apiPost('/api/auth', Object.assign({action: 'forget'}, body));
  return true;
}

async function wipeTrainerInfo(){
  const ok = await appDialog(
    t('trainer.removeInfoQuestion'),
    {confirm:true,okText:t('clients.removeAction'),cancelText:t('common.cancel')}
  );
  if(!ok) return;
  try{ await forgetMe('trainer'); }
  catch(e){
    appAlert(t('trainer.removeInfoFailed'));
    return;
  }
  ['name', 'photo', 'about', 'years', 'links'].forEach(k => { delete trainer[k]; });
  await saveTrainer();
  renderTrainerCard();
  appAlert(t('trainer.removeInfoDone'));
}

async function programLink(p, extra){
  const program = programPayload(p);
  const r = await apiPost('/api/share', Object.assign(
    {program, by: program.by || '', byLink: program.byLink || '',
     trainer: trainerProfile(), trainerKey: trainer.key || ''}, extra || {}));
  // Ник закрепляется за первым, кто им воспользовался: ключ приходит один раз и
  // дальше подтверждает, что профиль правит его хозяин.
  if(r.trainerKey && !trainer.key){ trainer.key = r.trainerKey; saveTrainer(); }
  return {url: PUBLIC_APP_URL + 'p/' + encodeURIComponent(r.id), id: r.id, key: r.key};
}

/* Почему ссылки не вышло — человеку, и без запасного пути.

   Раньше здесь в буфер уходил код программы. Он длины не боялся, но и смысла не
   имел: отправлять простыню в мессенджер человек всё равно не станет, а объяснять
   получателю, куда её вставлять, — тем более. Остался один запасной путь, который
   люди действительно понимают: файл. Он и так есть в меню, и он лучше — уходит
   целиком, вместе с картинками. */
function linkFailNote(e){
  if(e && e.code === 'no_store'){
    return t('share.noStore');
  }
  if(e && e.code === 'rate_limited'){
    return t('share.rate');
  }
  return t('share.offline');
}
const FILE_HINT = ()=> t('share.fileHint');

async function exportProgram(p){
  let link;
  try{ link = await programLink(p); }
  catch(e){ appAlert(linkFailNote(e) + FILE_HINT()); return; }

  const text = t('share.programText',{name:p.name});
  if(navigator.share){
    try{ await navigator.share({title: 'Fit Timer', text, url: link.url}); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(link.url);
    appAlert(t('share.linkCopied'));
  }catch(e){
    appAlert(t('common.copyManual'), {code: link.url});
  }
}

// Экспорт программы файлом — со всем содержимым: обложка и фото упражнений
async function exportProgramFile(p){
  const copy = JSON.parse(JSON.stringify(p));
  delete copy.stats;      // чужая статистика получателю не нужна
  delete copy.active;     // «отключена» — про мой список, а не про саму программу
  delete copy.rotIdx;     // позиция в очереди — личная
  delete copy.progLast;
  copy.plans = normPlans(copy);
  delete copy.exercises; delete copy.rounds; delete copy.roundRest;
  const payload = {app: 'fittimer', type: 'program', v: 1, program: copy};
  const json = JSON.stringify(payload);
  const safeName = (p.name || 'program').replace(/[^\wа-яёА-ЯЁ\- ]+/g, '').trim().slice(0, 40) || 'program';
  const fname = `fittimer-${safeName}.json`;
  const blob = new Blob([json], {type: 'application/json'});

  const sizeKb = Math.round(json.length / 1024);
  if(window.FitNative && window.FitNative.isNative){
    await shareGeneratedFile(blob, fname, t('share.fileTitle',{name:p.name}));
    return;
  }
  const file = new File([blob], fname, {type: 'application/json'});
  if(navigator.canShare && navigator.canShare({files: [file]})){
    try{
      await navigator.share({files: [file], title:t('share.fileTitle',{name:p.name})});
      return;
    }catch(e){ if(e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
  appAlert(t('share.fileSaved',{size:sizeKb}));
}

// Импорт программы из файла
async function importProgramFile(file){
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    // поддерживаем и файл программы, и голый объект программы
    const prog = (data && data.type === 'program' && data.program) ? data.program : data;
    if(!prog || !prog.name || !Array.isArray(prog.plans)){
      appAlert(t('share.badFile'));
      return;
    }
    prog.id = 'p' + Date.now();
    prog.stats = {completions: 0};
    delete prog.rotIdx; delete prog.progLast;
    prog.plans = normPlans(prog);
    sanitizeProgram(prog);      // файл мог написать кто угодно и чем угодно
    customPrograms.push(prog);
    await savePrograms();
    renderMine();
    appAlert(t('share.programAdded',{name:prog.name}));
  }catch(e){
    appAlert(t('share.readFileFailed',{error:e && e.message ? e.message : t('common.unknownError')}));
  }
}

/* ---- возраст и пол: нужны для подбора тренировок ---- */
function userAge(u){
  return profileAge(u);
}
// Возраст обязателен только там, где его спрашивают ради дела (попап «пара
// уточнений»). В профиле пустое поле — законное состояние: на старте его больше не
// спрашивают, и человек не должен упираться в ошибку, зайдя поменять имя.
function ageError(v, required = false){
  if(v === '' || v == null) return required ? t('age.required') : '';
  const a = Number(v);
  if(!Number.isInteger(a)) return t('age.integer');
  if(a < 5) return t('age.tooYoung');
  if(a > 100) return t('age.tooOld');
  return '';
}
// строка о человеке для запроса к ИИ
function userForAI(locale){
  const u = curUser();
  if(!u) return '';
  const bits = [];
  bits.push(u.gender === 'm' ? 'Sex: male' : 'Sex: female');
  const a = userAge(u);
  if(a) bits.push(`Age: ${a}`);
  const outLang=locale==='ru'?'Russian':locale==='en'?'English':aiOutputLanguage();
  bits.push(`User-visible output language: ${outLang}`);
  return bits.join('. ') + '. Use age and stated context when choosing exercise selection and recovery, but never infer absolute strength or starting weight from sex alone.';
}

/* ================= GEMINI API ================= */
// Несколько моделей на выбор: Google периодически выключает старые, и жёстко зашитое имя
// однажды начинает отдавать 404 (так случилось с псевдонимом gemini-flash-latest).
// Перебираем список, рабочую модель запоминаем, чтобы не тратить попытки каждый раз.
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

function geminiKey(){
  const u = curUser();
  return (u && u.geminiKey ? String(u.geminiKey).trim() : '');
}
function hasGemini(){ return !!geminiKey(); }

function geminiModelOrder(){
  let saved = '';
  try{ saved = localStorage.getItem('geminiModel') || ''; }catch(e){}
  // ранее сработавшую модель пробуем первой, остальные оставляем запасными
  return saved ? [saved, ...GEMINI_MODELS.filter(m => m !== saved)] : GEMINI_MODELS.slice();
}

// «Failed to fetch» — запрос не дошёл до сервера: сеть, блокировка или отсутствие CORS.
// Отличаем это от ответов API, чтобы не показывать бессмысленное «HTTP undefined».
function isNetworkFail(e){
  return e && (e.name === 'TypeError' || /failed to fetch|network|load failed/i.test(e.message || ''));
}
function networkFailMessage(){
  const isFile = location.protocol === 'file:';
  let m = 'Запрос не дошёл до Google — это сетевая ошибка, а не отказ ключа.\n\nВероятные причины:\n';
  if(isFile) m += '• Приложение открыто как файл с диска (file://). Из такого режима браузер запрещает запросы к сторонним серверам — открой приложение по адресу http/https.\n';
  m += '• Нет интернета или он пропал в момент запроса.\n' +
       '• Домен generativelanguage.googleapis.com недоступен у твоего провайдера или в регионе — в этом случае поможет VPN.\n' +
       '• Запрос режет расширение браузера (блокировщик рекламы, антитрекер) — попробуй отключить их для этой страницы.\n\n' +
       'Ключ при этом может быть полностью рабочим: в AI Studio запросы идут с серверов Google, а здесь — прямо с твоего устройства.';
  return m;
}

// одна попытка на конкретной модели; возвращает {ok, text, status, msg}
// Браузер шлёт предварительный запрос OPTIONS, если у POST нестандартный заголовок
// (X-goog-api-key) или Content-Type: application/json. В некоторых сетях этот
// предварительный запрос режется — тогда сам POST даже не отправляется («Failed to fetch»),
// хотя обычный GET к тому же домену проходит.
// Поэтому сначала пробуем «простой» запрос: ключ в адресе, Content-Type: text/plain —
// такой POST отправляется сразу, без OPTIONS. Если не выйдет — пробуем обычный способ.
async function geminiFetch(url, body, signal, simple){
  if(simple){
    return fetch(url + '?key=' + encodeURIComponent(geminiKey()), {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=UTF-8'}, // из безопасного списка — OPTIONS не нужен
      body: JSON.stringify(body),
      signal
    });
  }
  return fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-goog-api-key': geminiKey()},
    body: JSON.stringify(body),
    signal
  });
}

async function geminiTry(model, body, signal){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res = null, lastErr = null;
  for(const simple of [true, false]){
    try{
      res = await geminiFetch(url, body, signal, simple);
      break;
    }catch(e){
      if(e && e.name === 'AbortError') throw e;   // отмена пользователем — пробрасываем как есть
      if(!isNetworkFail(e)) throw e;
      lastErr = e;                                 // сеть не пустила — пробуем другой способ
    }
  }
  if(!res) return {ok: false, status: 0, msg: networkFailMessage(), network: true};
  if(res.ok) return {ok: true, data: await res.json()};
  let msg = 'HTTP ' + res.status;
  try{
    const j = await res.json();
    if(j && j.error && j.error.message) msg = j.error.message;
  }catch(e){}
  return {ok: false, status: res.status, msg, model};
}

async function callGemini(prompt, signal){
  const key = geminiKey();
  if(!key) throw new Error(t('ai.keyMissing'));
  // ответ бывает большим (программа целиком с описаниями),
  // поэтому лимит вывода задаём явно — иначе модель обрежет на полуслове
  const body = {
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {maxOutputTokens: 32768, temperature: .3}
  };
  let last = null;
  // 503 «high demand» — временная перегрузка, а не отказ: Google прямо советует повторить.
  // Один проход по моделям этого не лечит (все могут быть заняты одновременно),
  // поэтому делаем несколько кругов с нарастающей паузой.
  const ROUNDS = 3;
  for(let round = 0; round < ROUNDS; round++){
    if(round > 0){
      // ждём перед новым кругом: 4с, потом 10с — обычно перегрузка проходит за это время
      const waitMs = round === 1 ? 4000 : 10000;
      if(typeof aiRunNote === 'function') aiRunNote(t('ai.busyRetry',{seconds:Math.round(waitMs/1000),attempt:round+1,total:ROUNDS}));
      await new Promise(res => setTimeout(res, waitMs));
      if(signal && signal.aborted) throw Object.assign(new Error('aborted'), {name: 'AbortError'});
    }
  for(const model of geminiModelOrder()){
    const r = await geminiTry(model, body, signal);
    if(r.ok){
      try{ localStorage.setItem('geminiModel', model); }catch(e){}
      const cand = (r.data.candidates || [])[0] || {};
      const parts = (cand.content || {}).parts || [];
      const text = parts.map(p => p.text || '').join('').trim();
      if(!text){
        const why = cand.finishReason || (r.data.promptFeedback && r.data.promptFeedback.blockReason) || '';
        throw new Error(t('ai.emptyResponse',{reason:why?t('ai.reason',{reason:why}):''}));
      }
      if(cand.finishReason === 'MAX_TOKENS'){
        throw new Error(t('ai.tooLong'));
      }
      return text;
    }
    last = r;
    if(r.network) break; // сеть недоступна — другие модели не помогут
    // модели не существует, её убрали, или она сейчас перегружена — пробуем следующую из списка.
    // 503/«high demand»/«overloaded» — это отказ КОНКРЕТНОЙ модели, а не всего сервиса,
    // и именно это раньше обрывало попытки без перехода на запасной вариант.
    const tryNext = r.status === 404 || r.status === 503 ||
      /not found|not supported|is not available|overloaded|high demand|unavailable/i.test(r.msg);
    if(!tryNext) break;
  }
  // ошибка не связана с загруженностью — новые круги не помогут
  const busy = last && (last.status === 503 || /overloaded|high demand|unavailable/i.test(last.msg || ''));
  if(!busy) break;
  }
  let msg = last ? last.msg : 'Неизвестная ошибка';
  if(last && !last.network){
    // Дружелюбная формулировка первой строкой: «Ответ Google (модель X, код 429)»
    // отпугивал ещё до дочитывания. Технический хвост оставляем — без него
    // непонятно, что именно пошло не так, — но он идёт после человеческого текста.
    let hint = '';
    if(last.status === 429) hint = 'Нейросеть сейчас перегружена — слишком много запросов за день. Попробуй ещё раз через минуту, а если не выходит и потом — собери программу в чате с нейросетью (способ ниже на экране).';
    else if(last.status === 400 && /API key/i.test(msg)) hint = 'Похоже, ключ ИИ введён неверно — Google его отклонил. Проверь ключ в настройках, а если он на месте — включи Generative Language API в своём кабинете Google.';
    else if(last.status === 503) hint = 'Серверы Google сейчас перегружены. Обычно проходит за пару минут — попробуй ещё раз.';
    else if(last.status === 404) hint = 'Эта модель сейчас недоступна. Попробуй ещё раз — запрос пойдёт на другую.';
    else if(last.status === 413 || /too large|exceeds|token/i.test(msg)) hint = 'Запрос оказался слишком длинным. Попробуй доработать программу по частям или сократить описание.';
    msg = (hint ? hint + '\n\n' : '') +
          `Технические детали (можно не читать):\nмодель ${last.model || '—'}, код ${last.status}.\n${last.msg}`;
  }
  throw new Error(msg);
}

/* Встроенная генерация идёт через наш сервер. Ключи провайдеров не попадают в
   HTML/APK, а основной и резервный провайдер выбираются в админке. Эта функция
   объявлена после прежнего клиента намеренно: старые профили продолжают
   открываться, но пользовательский Gemini-ключ больше нигде не используется. */
function aiAuth(){
  return {email:(account && account.email) || '', token:(account && account.syncToken) || '',
          deviceId:(identity && identity.deviceId) || ''};
}
async function callServerAI(prompt, signal, kind){
  const auth = aiAuth();
  if(!auth.email || !auth.token || !auth.deviceId)
    throw new Error(t('ai.signInPremium'));
  const extra = kind === 'video.parse' ? {
    videoUrl:(parseYouTubeUrl($('ytUrl').value) || {}).url || ($('ytUrl').value || '').trim(),
    locale:appLocale,
    wish:clampText($('ytWish').value,LIM.wish),
    userContext:userForAI()
  } : {};
  const res = await fetch(API_BASE + '/api/ai', {method:'POST',headers:{'Content-Type':'application/json'},signal,
    body:JSON.stringify(Object.assign({prompt,kind}, extra, auth))});
  const j = await res.json().catch(()=> ({}));
  if(!res.ok){
    if(j.error === 'ai_limit') throw new Error(t('ai.limitReached',{used:j.used,limit:j.limit}));
    if(j.error === 'premium_required') throw new Error(t('ai.premiumRequired'));
    if(j.error === 'ai_disabled') throw new Error(t('ai.disabled'));
    if(j.error === 'video_not_workout') throw new Error(t('video.notWorkout'));
    if(j.error === 'video_no_transcript') throw new Error(t('video.noTranscript'));
    if(j.error === 'video_insufficient') throw new Error(t('video.insufficient'));
    if(j.error === 'video_unavailable') throw new Error(t('video.unavailable'));
    if(j.error === 'video_analysis_timeout') throw new Error(t('video.analysisTimeout'));
    if(j.error === 'video_bad_url') throw new Error(t('video.badUrl'));
    if(j.error === 'ai_timeout') throw new Error(t('ai.timeout'));
    if(j.error === 'ai_bad_response'){
      const miss = Array.isArray(j.missing) ? j.missing.filter(Boolean).slice(0,6).join(', ') : '';
      throw new Error(t('ai.badResponse') + (miss ? ' ' + t('ai.badResponseMissing',{fields:miss}) : ''));
    }
    throw new Error(j.detail || t('ai.serviceFailed'));
  }
  trackProductEvent('ai_used').catch(()=>{});
  return j;
}

// Более позднее присваивание заменяет прежний прямой вызов Gemini во всех
// обработчиках, включая те, которые были объявлены выше по файлу.
callGemini = async function(prompt, signal, kind){
  return (await callServerAI(prompt, signal, kind || 'program.create')).text;
};

// Единая дверь ко всему платному. Отказов вида «недоступно» в приложении нет:
// нажатие либо работает, либо показывает, что даёт подписка и сколько стоит.
function premiumGate(){
  if(isPremium()) return true;
  openPremium();
  return false;
}

// Кнопка «за меня» входит в подписку. Без подписки она не исчезает и ничего не
// запрещает: на ней стоит метка «Премиум», а нажатие открывает витрину подписки.
function syncGeminiBtns(){
  const on = isPremium();
  document.querySelectorAll('.ai-self').forEach(b => {
    const txt = b.querySelector('.ha-txt');
    if(!txt) return;
    let mark = txt.querySelector('.ha-pro');
    if(!mark){
      mark = document.createElement('span');
      mark.className = 'ha-pro';
      mark.innerHTML = icon('crown') + t('premium.title').replace(/^Fit Timer\s+/,'');
      txt.appendChild(mark);
    }
    setShown(mark, !on);
  });
}

// временная подпись на кнопке («Проверяю…», «Обработка…»): меняем только текст,
// иконка и пояснение в строке остаются на месте
function btnBusy(btn, text){
  const el = btn.querySelector('b') || btn;
  const was = el.textContent;
  el.textContent = text;
  btn.disabled = true;
  return ()=>{ el.textContent = was; btn.disabled = false; };
}

// короткое «✓ Скопировано» на кнопке: подпись живёт в <b>, поэтому меняем именно её,
// а не всю кнопку целиком — иначе из строки пропадали иконка и пояснение
function flashDone(btn, text){
  if(!btn) return;
  const el = btn.querySelector('b') || btn;
  if(el.dataset.flash) return;
  el.dataset.flash = el.textContent;
  el.textContent = text || t('common.copied');
  setTimeout(()=>{ el.textContent = el.dataset.flash; delete el.dataset.flash; }, 1600);
}


/* ================= ОДИН ЭКРАН ЗАПРОСА К ИИ =================
   Источников пять, а экран один. Всё, чем источники отличаются, собрано здесь в
   таблицу: заголовок, вкладки, панель первого шага, подписи, чем собрать промт,
   чем применить ответ и куда вернуть «назад». Добавить шестой источник — одна
   строка в этой таблице, а не ещё один экран.

   Формат обмена с нейросетью таблица НЕ трогает: prompt и apply — те же самые
   функции, что были на прежних экранах, просто названы по имени. */
const AI_UI_KEYS = {
  'Новая программа':'programs.newProgram','Вручную':'common.manual','Через ИИ':'common.viaAI','Из видео':'common.fromVideo',
  'Упражнение':'builder.exercise','Редактирование':'ai.editTitle',
  'Пара вопросов — и готова программа: упражнения, повторения, круги и дни. Всё можно поправить.':'ai.createLead',
  'Шаг 1 · О тебе и тренировке':'ai.stepAbout','Шаг 2 · Как собрать':'ai.stepBuild','Собрать за меня':'ai.buildForMe',
  'Собираю программу':'ai.preparingProgram',
  'Приложение подготовит задание для нейросети. Передай его в чат, ответ вставь сюда. Дольше, зато бесплатно.':'ai.chatTaskNote',
  'Вставь ответ нейросети целиком — программа откроется в конструкторе.':'ai.answerProgramHint','Собрать программу из ответа':'ai.buildFromAnswer',
  'Ссылка на тренировку с YouTube — нейросеть разложит ролик на упражнения с таймингом.':'ai.videoLead',
  'Шаг 1 · Ссылка на видео':'ai.stepVideo','Шаг 2 · Как разобрать':'ai.stepParse','Разобрать за меня':'ai.parseForMe','Разбираю видео':'ai.parsingVideo',
  'Видео умеет смотреть не каждый чат — нужен тот, у кого есть доступ в интернет.':'ai.videoChatNote',
  'Шаг 1 · Что поправить':'ai.stepWhatFix','Шаг 2 · Как внести правки':'ai.stepHowApply','Изменить за меня':'ai.changeForMe','Вношу изменения':'ai.applyingChanges',
  'Старая программа останется, рядом появится изменённая копия. Картинки перенесутся сами.':'ai.editCopyNote',
  'Приложение подготовит задание с твоей программой. Передай его в чат, ответ вставь сюда.':'ai.chatProgramNote',
  'Вставь ответ нейросети целиком — получится изменённая копия. Старая программа останется.':'ai.answerEditedHint','Создать изменённую программу':'ai.createEdited',
  'Опиши упражнение словами — нейросеть добавит технику, мышцы и частые ошибки.':'ai.exerciseLead',
  'Шаг 1 · Какое упражнение нужно':'ai.stepExerciseNeed','Шаг 2 · Как подобрать упражнение':'ai.stepPickExercise','Подбираю упражнение':'ai.pickingExercise',
  'Приложение подготовит задание. Передай его в чат, ответ вставь сюда.':'ai.chatExerciseNote',
  'Вставь ответ нейросети целиком — упражнение добавится в конец программы.':'ai.answerExerciseHint','Добавить в программу':'ai.addToProgram',
  'Шаг 1 · Что поменять':'ai.stepWhatChange','Шаг 2 · Как применить':'ai.stepApply','Меняю упражнение':'ai.changingExercise',
  'Картинка упражнения останется на месте.':'ai.keepImageNote','Вставь ответ нейросети целиком — приложение возьмёт из него всё, что нашлось.':'ai.answerApplyHint',
  'Применить изменения':'ai.applyChanges'
};
function aiUiText(value){
  const raw=String(value == null ? '' : value);
  const key=AI_UI_KEYS[raw];
  return key ? t(key) : raw;
}
let aiSrc = null;                 // ключ текущего источника
const AI_SOURCES = {
  text: {
    kind: 'program.create',
    title: 'Новая программа',
    tabs: [['manual','Вручную'], ['text','Через ИИ'], ['video','Из видео']],
    lead: ['sparkle', 'Пара вопросов — и готова программа: упражнения, повторения, круги и дни. Всё можно поправить.'],
    pane: 'aiPaneText',
    step1: 'Шаг 1 · О тебе и тренировке',
    step2: 'Шаг 2 · Как собрать',
    self: 'Собрать за меня',
    selfTitle: 'Собираю программу',
    guard: ()=> aiCreateProgramGuard(),
    chatNote: ['chat', 'Приложение подготовит задание для нейросети. Передай его в чат, ответ вставь сюда. Дольше, зато бесплатно.'],
    answerHint: 'Вставь ответ нейросети целиком — программа откроется в конструкторе.',
    action: 'Собрать программу из ответа',
    prompt: ()=> fullAIPrompt(),
    copy:   ()=> copyPrompt(),
    apply:  ()=> importFromText(),
    dirty: ['qNote', 'qContext', 'aiResult'],
    manual: ()=> openBuilder(),
    back:  ()=> goTab('scrPrograms')
  },
  video: {
    kind: 'video.parse',
    title: 'Новая программа',
    tabs: [['manual','Вручную'], ['text','Через ИИ'], ['video','Из видео']],
    lead: ['video', 'Ссылка на тренировку с YouTube — нейросеть разложит ролик на упражнения с таймингом.'],
    pane: 'aiPaneVideo',
    step1: 'Шаг 1 · Ссылка на видео',
    step2: 'Шаг 2 · Как разобрать',
    self: 'Разобрать за меня',
    selfTitle: 'Разбираю видео',
    guard: ()=> ytGuard(),
    chatNote: ['alert', 'Видео умеет смотреть не каждый чат — нужен тот, у кого есть доступ в интернет.'],
    answerHint: 'Вставь ответ нейросети целиком — программа откроется в конструкторе.',
    action: 'Собрать программу из ответа',
    prompt: ()=> youtubePrompt(),
    copy:   ()=> ytCopyPrompt(),
    apply:  ()=> ytApplyResult(),
    dirty: ['ytUrl', 'ytWish', 'aiResult'],
    manual: ()=> openBuilder(),
    back:  ()=> goTab('scrPrograms')
  },
  edit: {
    kind: 'program.modify',
    title: 'Редактирование',
    tabs: [['manual','Вручную'], ['ai','Через ИИ']],
    subject: true,
    pane: 'aiPaneEdit',
    step1: 'Шаг 1 · Что поправить',
    step2: 'Шаг 2 · Как внести правки',
    self: 'Изменить за меня',
    selfTitle: 'Вношу изменения',
    guard: ()=> aiEditRequestGuard('eaWish'),
    selfNote: ['check', 'Старая программа останется, рядом появится изменённая копия. Картинки перенесутся сами.'],
    chatNote: ['chat', 'Приложение подготовит задание с твоей программой. Передай его в чат, ответ вставь сюда.'],
    copyFull: true,
    answerHint: 'Вставь ответ нейросети целиком — получится изменённая копия. Старая программа останется.',
    action: 'Создать изменённую программу',
    prompt: ()=> editAIPrompt(),
    copy:   ()=> copyEditPrompt(),
    apply:  ()=> createEditedProgram(),
    dirty: ['eaWish', 'aiResult'],
    manual: ()=> editAIProg ? openBuilder(editAIProg.id) : goTab('scrPrograms'),
    back:  ()=> goTab('scrPrograms')
  },
  exNew: {
    kind: 'exercise.create',
    title: 'Упражнение',
    tabs: [['manual','Вручную'], ['ai','Через ИИ']],
    lead: ['sparkle', 'Опиши упражнение словами — нейросеть добавит технику, мышцы и частые ошибки.'],
    pane: 'aiPaneExNew',
    step1: 'Шаг 1 · Какое упражнение нужно',
    step2: 'Шаг 2 · Как подобрать упражнение',
    self: ()=> exaSelfLabel(),
    selfTitle: 'Подбираю упражнение',
    guard: ()=> aiCreateExerciseGuard(),
    chatNote: ['chat', 'Приложение подготовит задание. Передай его в чат, ответ вставь сюда.'],
    answerHint: 'Вставь ответ нейросети целиком — упражнение добавится в конец программы.',
    action: 'Добавить в программу',
    prompt: ()=> exaPrompt(),
    copy:   ()=> exaCopyPrompt(),
    apply:  ()=> exaAddExercise(),
    dirty: ['exaWish', 'exaContext', 'aiResult'],
    manual: ()=> addExManual(),
    back:  ()=> goBackTo('scrBuilder')
  },
  exEdit: {
    kind: 'exercise.modify',
    title: 'Упражнение',
    tabs: [['manual','Вручную'], ['ai','Через ИИ']],
    subject: true,
    pane: 'aiPaneExEdit',
    step1: 'Шаг 1 · Что поменять',
    step2: 'Шаг 2 · Как применить',
    self: 'Изменить за меня',
    selfTitle: 'Меняю упражнение',
    guard: ()=> aiEditRequestGuard('exeWish'),
    selfNote: ['image', 'Картинка упражнения останется на месте.'],
    answerHint: 'Вставь ответ нейросети целиком — приложение возьмёт из него всё, что нашлось.',
    action: 'Применить изменения',
    prompt: ()=> exePrompt(),
    copy:   ()=> exeCopyPrompt(),
    apply:  ()=> applyExEdit(),
    dirty: ['exeWish', 'aiResult'],
    manual: ()=> {
      const keep = exeIdx;
      if(keep >= 0 && curPlan().exercises[keep]) openExercise(keep);
      else exitExAI();
    },
    back:  ()=> exitExAI()
  }
};

// Куда возвращаться с экрана ИИ по упражнению: на тренировку, если правка началась
// оттуда, иначе в конструктор. Раньше отсюда всегда уводило в конструктор — и
// тренировка, идущая прямо сейчас, оставалась брошенной.
function exitExAI(){
  if(exFromWork) backToWorkout(false);
  else goBackTo('scrBuilder');
}

// Любая AI-правка существующего объекта требует явного задания от пользователя.
// Сам факт наличия программы/упражнения — это контекст, а не запрос на изменение.
function aiEditRequestGuard(fieldId){
  const field = $(fieldId);
  const wish = clampText(field && field.value || '', LIM.wish).trim();
  if(wish) return true;
  appAlert(t('ai.needEditRequest'));
  if(field) field.focus();
  return false;
}

// собирает экран под источник и показывает его
function openAI(key){
  const c = AI_SOURCES[key];
  if(!c) return;
  aiSrc = key;
  $('aiTitle').textContent = aiUiText(c.title);
  $('aiStep1Title').textContent = aiUiText(c.step1);
  $('aiStep2Title').textContent = aiUiText(c.step2);
  $('aiSelfLabel').textContent = typeof c.self === 'function' ? c.self() : aiUiText(c.self);
  $('aiApply').textContent = aiUiText(c.action);
  $('aiAnswerHint').textContent = aiUiText(c.answerHint);
  $('aiResult').value = '';

  // вкладки режима: у программы их три, у упражнения две
  const tabs = $('aiTabs');
  tabs.innerHTML = '';
  c.tabs.forEach(([m, label]) => {
    const b = document.createElement('button');
    b.className = 'tab' + (m === key || (m === 'ai' && key !== 'manual' && c.tabs.length === 2) ? ' act' : '');
    b.dataset.m = m;
    b.textContent = aiUiText(label);
    tabs.appendChild(b);
  });
  markAITab();

  // заметки: показываем только те, что заданы у источника
  const note = (box, ico, txt, val) => {
    setShown(box, !!val);
    if(!val) return;
    $(ico).innerHTML = icon(val[0]);
    $(txt).textContent = aiUiText(val[1]);
  };
  note('aiLead', 'aiLeadIco', 'aiLeadTxt', c.lead);
  note('aiSelfNote', 'aiSelfNoteIco', 'aiSelfNoteTxt', c.selfNote);
  note('aiChatNote', 'aiChatNoteIco', 'aiChatNoteTxt', c.chatNote);

  // меню действий есть только там, где есть с чем действовать: у правки
  // существующего упражнения
  setShown('aiMenuWrap', key === 'exEdit');
  if(key === 'exEdit') buildAiMenu();
  setShown('aiSubject', !!c.subject);
  setShown('aiCopyFull', !!c.copyFull);

  // первый шаг у каждого источника свой
  document.querySelectorAll('#scrAI .ai-pane').forEach(el => setShown(el, el.id === c.pane));

  syncGeminiBtns();
  aiWaysReset.scrAI && aiWaysReset.scrAI();
  show('scrAI');
  window.scrollTo(0, 0);
}

// подсветка активной вкладки: «через ИИ» — это и text, и ai
function markAITab(){
  const cur = (aiSrc === 'video') ? 'video' : (aiSrc === 'text' ? 'text' : 'ai');
  document.querySelectorAll('#aiTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === cur));
}

/* ---- экраны запроса к ИИ: главный путь и ручной ----
   Раньше ручной путь прятался под раскрывашкой (её надо было догадаться нажать), а поле
   «Ответ из чата» висело на экране всегда — даже у тех, кто ничего никуда не копировал,
   и читалось как обязательный третий шаг. Теперь ручной путь виден сразу, а поле для
   ответа появляется, только когда ему есть что принимать: после копирования задания —
   или сразу, если ответ в нём уже лежит. */
const aiWaysReset = {};
function setupAIAnswer(cfg){
  const answer = cfg.answer ? $(cfg.answer) : null;
  const actions = cfg.actions ? $(cfg.actions) : null;
  if(!answer && !actions){ aiWaysReset[cfg.screen] = ()=>{}; return; }
  // «уже копировал» помним по источнику, а не по экрану: экран запроса к ИИ теперь
  // один на пять источников, и общий флаг открывал поле ответа на упражнении только
  // потому, что человек когда-то копировал задание на программе.
  const copied = new Set();
  const apply = on => { setShown(answer, on); setShown(actions, on); };
  aiWaysReset[cfg.screen] = ()=>{
    const filled = cfg.result && $(cfg.result) && $(cfg.result).value.trim();
    apply(copied.has(aiSrc) || !!filled);
  };
  (cfg.copy || []).forEach(id => {
    const b = $(id);
    if(!b) return;
    // именно addEventListener: у кнопки уже есть свой onclick с копированием
    b.addEventListener('click', ()=>{
      copied.add(aiSrc);
      apply(true);
      setTimeout(()=> answer && answer.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 150);
    });
  });
  apply(false);
}

/* ---- картинка упражнения ---- */
// Пиктограмм больше нет: рисованные нейросетью человечки на 44 пикселях списка
// не читались вовсе, а правила их рисования занимали пятую часть промта и столько же
// вывода модели. Осталось одно фото на упражнение.
function setExImg(ex, data){
  ex.media = data ? {kind: 'img', data} : null;
}
function dropExMedia(ex){
  ex.media = null;
}

/* ================= ГЕНЕРАЦИЯ КАРТИНОК ЧЕРЕЗ PREMIUM AI ================= */
// модель с выводом изображений — платная, в отличие от текстовой модели, которую приложение
// использует для остального ИИ. У неё нет бесплатной квоты, поэтому предупреждаем перед тратой денег.
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

async function callGeminiImage(prompt, signal){
  const key = geminiKey();
  if(!key) throw new Error(t('ai.keyMissing'));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
  const body = {
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {responseModalities: ['TEXT', 'IMAGE']}
  };
  // тот же обход предварительной проверки CORS, что и в текстовых запросах
  let res = null;
  for(const simple of [true, false]){
    try{ res = await geminiFetch(url, body, signal, simple); break; }
    catch(e){
      if(e && e.name === 'AbortError') throw e;
      if(!isNetworkFail(e)) throw e;
    }
  }
  if(!res) throw new Error(networkFailMessage());
  if(!res.ok){
    let msg = 'HTTP ' + res.status;
    try{
      const j = await res.json();
      if(j && j.error && j.error.message) msg = j.error.message;
    }catch(e){}
    if(res.status === 400 && /API key/i.test(msg)) msg = t('images.keyRejected');
    if(res.status === 429) msg = t('images.rateLimited');
    if(res.status === 403 || /billing|permission/i.test(msg)) msg = t('images.billingRequired');
    if(res.status === 503 || /overloaded|high demand|unavailable/i.test(msg)) msg = t('images.providerBusy');
    throw new Error(msg);
  }
  const data = await res.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const imgPart = parts.find(p => p.inlineData && p.inlineData.data);
  if(!imgPart){
    const textPart = parts.find(p => p.text);
    throw new Error(textPart ? t('images.textInstead',{text:textPart.text.slice(0,120)}) : t('images.noImage'));
  }
  return `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`;
}

callGeminiImage = async function(prompt, signal, kind){
  return (await callServerAI(prompt, signal, kind || 'image.exercise')).image;
};

// сжимает готовую картинку (data URL) так же, как сжимаются загруженные с телефона фото
function shrinkDataUrl(dataUrl, maxSide, cb){
  const img = new Image();
  img.onload = ()=>{
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    try{ cb(c.toDataURL('image/jpeg', .85)); }catch(e){ cb(null); }
  };
  img.onerror = ()=> cb(null);
  img.src = dataUrl;
}

// промт под ОДНО конкретное изображение (в отличие от промта для копирования — там просят весь набор разом)
function imageEquipment(item){
  const s = `${item && item.name || ''} ${item && item.desc || ''}`.toLowerCase();
  const out = [];
  const add = (re, label) => { if(re.test(s) && !out.includes(label)) out.push(label); };
  add(/гантел|dumbbell/, 'dumbbells');
  add(/штанг|barbell/, 'barbell');
  add(/гир(я|и|ей|ю|ь)?|kettlebell/, 'kettlebell');
  add(/резин|эспанд|resistance band|\bband\b/, 'resistance band');
  add(/скам(ья|ьи|ью)|bench/, 'workout bench');
  add(/блок|кроссовер|трос|cable/, 'cable machine');
  add(/турник|перекладин|pull[- ]?up bar/, 'pull-up bar');
  add(/коврик|\bmat\b/, 'exercise mat');
  add(/фитбол|мяч|exercise ball|swiss ball/, 'exercise ball');
  add(/тумб|платформ|степ|plyo box|step platform/, 'box or step platform');
  return out;
}

function imageStaticExercise(item){
  const s = `${item && item.name || ''} ${item && item.desc || ''}`.toLowerCase();
  return /планк|удержан|статич|изометр|вис на|wall sit|dead hang|hollow hold|side plank|isometric|static hold/.test(s);
}

function imageProgramContext(){
  const parts = [
    draft && draft.goal, draft && draft.cat, draft && draft.category,
    draft && draft.name, draft && draft.desc
  ];
  uniqueProgramExercises().slice(0, 12).forEach(ex => {
    parts.push(ex.name);
    if(ex.muscles && ex.muscles.length) parts.push(ex.muscles.join(', '));
  });
  return parts.filter(Boolean).join(' · ');
}

function imageCoverTone(context){
  const s = String(context || '').toLowerCase();
  if(/кардио|вынослив|жиросж|похуд|hiit|cardio|endurance|fat loss/.test(s))
    return {tone:'deep blue to cyan', mood:'energetic, fast, fresh'};
  if(/сила|силов|мышечн|масса|гипертроф|strength|muscle|hypertrophy/.test(s))
    return {tone:'deep crimson and burgundy with subtle violet undertones', mood:'powerful, intense, athletic'};
  if(/растяж|гибк|мобил|восстанов|после род|stretch|flexibility|mobility|recovery|postpartum/.test(s))
    return {tone:'teal and emerald with soft lavender accents', mood:'calm, fluid, restorative'};
  if(/осанк|спин|кор|пресс|стабил|posture|back|core|stability/.test(s))
    return {tone:'indigo and warm amber with violet accents', mood:'focused, controlled, stable'};
  if(/ягод|glute/.test(s))
    return {tone:'berry magenta and deep violet', mood:'strong, sculpted, energetic'};
  return {tone:'Fit Timer violet and purple', mood:'balanced, premium, modern'};
}


function imageMuscleRegions(item){
  const exercise = `${item && item.name || ''} ${item && item.desc || ''}`.toLowerCase();
  const labels = (item && item.muscles || []).map(x => String(x || '').trim()).filter(Boolean);
  const out = [];
  const add = text => { if(text && !out.includes(text)) out.push(text); };
  labels.forEach(label => {
    const raw = label.toLowerCase();
    const en = String(aiCanonicalEnglish(label) || '').toLowerCase();
    const key = raw + ' ' + en;
    if(/ягод|glute/.test(key)) add('gluteus maximus on both sides');
    else if(/квадриц|quadriceps/.test(key)) add('quadriceps on both legs');
    else if(/задн.*бед|hamstring/.test(key)) add('hamstrings on both legs');
    else if(/икр|calves|calf/.test(key)) add('calf muscles on both legs');
    else if(/груд|chest/.test(key)) add('pectoralis major on both sides of the chest');
    else if(/плеч|shoulder/.test(key)) add('deltoid muscles on both shoulders');
    else if(/пресс|core|abs|abdom/.test(key)) add('rectus abdominis and obliques on both sides of the core');
    else if(/рук|arms/.test(key)){
      if(/бицепс|biceps? curl|hammer curl|сгибан.*рук/.test(exercise)){
        add('biceps brachii on both upper arms');
        add('brachialis on both upper arms');
        add('brachioradialis on both forearms');
      } else if(/трицепс|triceps? extension|разгибан.*рук/.test(exercise)){
        add('triceps brachii on both upper arms');
      } else add('upper-arm muscles on both arms');
    }
    else if(/шея|neck/.test(key)) add('neck stabilizer muscles on both sides');
    else if(/спин|back/.test(key)){
      if(/присед|squat|станов|deadlift|румын|romanian|наклон|good morning|hip hinge/.test(exercise))
        add('lower back / spinal erectors on both sides');
      else
        add('latissimus dorsi and mid-back muscles on both sides');
    } else add(aiCanonicalEnglish(label));
  });
  return out;
}

function imageCharacterStyle(genderTxt){
  return genderTxt === 'man'
    ? 'lifelike male athlete, natural skin tone, attractive masculine face, strong athletic physique'
    : 'lifelike female athlete, natural skin tone, beautiful feminine face, fit athletic physique';
}

function exerciseImagePrompt(item, genderTxt){
  const equipment = imageEquipment(item);
  const isStatic = imageStaticExercise(item);
  const regions = imageMuscleRegions(item);
  const muscles = regions.length ? regions.join(', ') : 'only the primary working muscles required by this movement';
  // Раньше немоторные (не изометрические, не изолированные суставом) движения
  // просили «два полупрозрачных наложенных фото одного атлета» — нейросеть
  // регулярно рисовала это как двух слипшихся людей друг в друге, а не как
  // внятное до/после. Один чёткий кадр самой показательной фазы + стрелки —
  // тот же приём, что уже нормально работал для локальных движений (сгибания
  // рук и т.п.), теперь единый для всех не-статичных упражнений.
  const motion = isStatic
    ? 'Show ONE clear final pose only. No ghost pose or movement trail.'
    : 'Show ONE full athlete only, in the single clearest and most demonstrative phase of the movement (usually peak contraction or full range of motion). Exactly one solid, fully opaque figure — no second body, no duplicated limbs, no ghost pose, no semi-transparent overlay, no motion blur, no double exposure. Show the direction of motion only with one or two small violet-lavender trajectory arrows beside the moving body part(s) or equipment.';
  return [
    `Create a 4:3 instructional fitness illustration for "${item.name}" in the Fit Timer app.`,
    `Style: premium stylized-realistic 3D, ${imageCharacterStyle(genderTxt)}, realistic dark sportswear, polished high-end rendering.`,
    'Background: premium modern gym with depth and good lighting, softly blurred and secondary; avoid flat gray studio backgrounds.',
    'Brand accents: Fit Timer violet (#7C56F5) and light lavender (#B7A0FF) only for arrows, subtle rim light and small environmental accents.',
    item.desc ? `Technique: ${item.desc}` : null,
    equipment.length
      ? `Equipment: ${equipment.join(', ')}. Show correct quantity, scale, grip/contact and position.`
      : 'Do not invent equipment that the exercise does not require.',
    motion,
    `Highlight ONLY these muscle regions with a clearly visible localized warm red to red-orange glow: ${muscles}.`,
    'Do not highlight unrelated muscles. Keep muscle glow anatomically consistent, symmetrical and equally strong between male and female versions.',
    'Choose the clearest side or three-quarter camera angle. Keep important joints, limbs and equipment visible.',
    'Prioritize correct biomechanics: realistic joint alignment, spine, stance, grip, range of motion and equipment placement.',
    'No extra limbs, merged hands, duplicated equipment, text, labels, logos, UI, collage, borders or watermarks.'
  ].filter(Boolean).join('\n');
}

function coverImagePrompt(name, genderTxt){
  const context = imageProgramContext();
  const palette = imageCoverTone(context);
  const exercises = uniqueProgramExercises().slice(0, 8).map(x => x.name).join(', ');
  return [
    `Create a square 1:1 premium catalog cover for the fitness program "${name}".`,
    'This is a PROGRAM COVER, not an exercise instruction. Create one bold, simple hero image that reads instantly at small thumbnail size.',
    'COMPOSITION: full-bleed edge-to-edge artwork. Absolutely no inset square, inner card, picture frame, border, outline, vignette frame or mockup-within-a-mockup. The artwork itself must fill the entire 1:1 canvas.',
    'Use one large hero athlete as the dominant subject, occupying roughly 65-80% of the frame. Prefer a close or medium-wide athletic composition over a distant full gym scene. Keep only one or two large supporting elements; avoid tiny weights, racks, plates and decorative detail that disappears in the catalog.',
    'VISUAL STYLE: premium cinematic stylized-realistic 3D, natural skin tone, realistic sportswear, polished directional lighting, subtle depth and a modern gym atmosphere. Avoid gray mannequin/anatomy-model styling.',
    `Character: ${genderTxt}. Make the pose energetic and aspirational, but not an exercise diagram.`,
    `Program context: ${context || name}.`,
    exercises ? `Representative exercises: ${exercises}.` : null,
    `Goal-specific atmosphere: ${palette.tone}. Mood: ${palette.mood}. Keep one restrained Fit Timer violet (#7C56F5) rim-light or environmental accent so every category still belongs to the same brand.`,
    'The goal color should come mainly from the background light and atmosphere, not from tinting the athlete skin.',
    'Use a softly blurred, simplified gym background with broad shapes and depth. The athlete must remain much more important than the environment.',
    'No instructional arrows, no ghost poses, no muscle heat-map, no text, letters, numbers, labels, logos, UI, collage, split-screen, frames, borders, corner icons, badges, decorative sparkles, stars or watermarks.'
  ].filter(Boolean).join('\n');
}

function imageProgramName(){
  const field = $('bName');
  if(field && field.value != null) return String(field.value).trim();
  return String(draft && draft.name || '').trim();
}

function unnamedImageExerciseCount(){
  let count = 0;
  ((draft && draft.plans) || []).forEach(pl => (pl.exercises || []).forEach(ex => {
    if(!String(ex && ex.name || '').trim()) count++;
  }));
  return count;
}

function imageGenerationGuard(kind, item){
  if(kind === 'cover'){
    if(imageProgramName()) return true;
    appAlert(t('images.needProgramName'));
    return false;
  }
  if(String(item && item.name || '').trim()) return true;
  appAlert(t('images.needExerciseName'));
  return false;
}

function imageWorkspaceGuard(){
  if(!imageProgramName()){
    appAlert(t('images.needProgramName'));
    return false;
  }
  const unnamed = unnamedImageExerciseCount();
  if(unnamed){
    appAlert(t('images.needAllExerciseNames',{count:unnamed}));
    return false;
  }
  return true;
}

// Промт под ОДНО конкретное изображение. До этой точки всегда проходит общий
// guard, поэтому скрытого fallback-названия нет: картинка строится только из
// реального названия программы/упражнения.
function singleImagePrompt(kind, item){
  const u = curUser();
  const genderTxt = u && u.gender === 'm' ? 'man' : 'woman';
  const name = imageProgramName();
  return kind === 'cover'
    ? coverImagePrompt(name, genderTxt)
    : exerciseImagePrompt(item || {}, genderTxt);
}

let imgGenCancelled = false;

async function generateAllImagesViaAI(scope){
  if(!premiumGate()) return;
  if(!imageWorkspaceGuard()) return;
  scope = scope === 'missing' ? 'missing' : 'all';

  const exList = uniqueProgramExercises().filter(ex => {
    if(scope !== 'missing') return true;
    const key = ex.name.toLowerCase();
    return !(draft.plans || []).some(pl => (pl.exercises || []).some(e2 =>
      (e2.name || '').trim().toLowerCase() === key &&
      e2.media && e2.media.kind === 'img' && e2.media.data
    ));
  });
  const makeCover = scope !== 'missing' || !draft.cover;
  const total = (makeCover ? 1 : 0) + exList.length;
  if(!total){ appAlert(t('images.nothingMissing')); return; }

  const imageWord = appLocale === 'ru'
    ? plural(total,t('images.imageOne'),t('images.imageFew'),t('images.imageMany'))
    : t(total === 1 ? 'images.imageOne' : 'images.imageMany');
  const ok = await appDialog(
    t('images.generateConfirm',{count:total,images:imageWord}),
    {confirm:true,okText:t('images.draw'),cancelText:t('common.cancel')}
  );
  if(!ok) return;

  imgGenCancelled = false;
  aiRunOpen(t('images.generating'), ()=>{ imgGenCancelled = true; });

  const failed = [];
  let done = 0;

  const runOne = async (kind, item, applyFn)=>{
    if(imgGenCancelled) return false;
    $('aiRunTitle').textContent = t('images.progress',{current:done+1,total});
    $('aiRunText').textContent = kind === 'cover' ? t('images.coverProgram') : item.name;
    try{
      const raw = await callGeminiImage(singleImagePrompt(kind, item), aiRunCtl ? aiRunCtl.signal : undefined,
        kind === 'cover' ? 'image.cover' : 'image.exercise');
      await new Promise(res => shrinkDataUrl(raw, 640, data => {
        if(data){
          applyFn(data);
          if(!imgTray.includes(data)) imgTray.push(data);
        } else failed.push(kind === 'cover' ? t('images.cover') : item.name);
        res();
      }));
      renderTray();
      renderSlots();
    }catch(e){
      if(imgGenCancelled) return false;
      failed.push((kind === 'cover' ? t('images.cover') : item.name) + ': ' + (e && e.message ? e.message : t('images.error')));
    }
    done++;
    return !imgGenCancelled;
  };

  if(makeCover){
    if(!(await runOne('cover', null, data => { draft.cover = data; }))){ aiRunClose(); await finishImgGen(done, total, failed); return; }
  }
  for(const ex of exList){
    const go = await runOne('ex', ex, data => {
      // применяем ко всем упражнениям с этим именем во всех вариантах — не платим за копию дважды
      (draft.plans || []).forEach(pl => (pl.exercises || []).forEach(e2 => {
        if((e2.name || '').trim().toLowerCase() === ex.name.toLowerCase()) setExImg(e2, data);
      }));
    });
    if(!go) break;
  }
  aiRunClose();
  await finishImgGen(done, total, failed);
}

// Что рисовать для упражнения: название, техника и мышцы.
function exImageItem(ex){
  return {
    name:(ex && ex.name || '').trim(),
    desc:(ex && ex.desc || '').trim(),
    muscles:((ex && ex.muscles) || []).map(id => M_LABEL[id]).filter(Boolean)
  };
}

// Одна картинка через ИИ — общая для экрана картинок, редактора упражнения и
// обложки в настройках программы: тот же прогресс, отмена и «Попробовать снова».
// apply(data) получает уже ужатую картинку.
async function generateOneImageViaAI(kind, item, title, apply){
  if(!premiumGate()) return false;
  if(!imageGenerationGuard(kind, item)) return false;
  imgGenCancelled = false;
  aiRunOpen(t('images.generating'), ()=>{ imgGenCancelled = true; });
  $('aiRunTitle').textContent = t('images.progress',{current:1,total:1});
  $('aiRunText').textContent = title;
  try{
    const raw = await callGeminiImage(singleImagePrompt(kind, item), aiRunCtl ? aiRunCtl.signal : undefined,
      kind === 'cover' ? 'image.cover' : 'image.exercise');
    let applied = false;
    await new Promise(res => shrinkDataUrl(raw, 640, data => {
      if(data){ apply(data); applied = true; }
      res();
    }));
    aiRunClose();
    if(!applied) appAlert(t('images.loadFailed'));
    return applied;
  }catch(e){
    aiRunClose();
    if(imgGenCancelled) return false;
    const retry = await appDialog(
      t('ai.runFailed',{error:(e && e.message ? e.message : t('common.unknownError'))}) + '\n\n' + t('ai.retryQuestion'),
      {confirm:true,okText:t('ai.retry'),cancelText:t('ai.notNow')}
    );
    if(retry) return generateOneImageViaAI(kind, item, title, apply);
    return false;   // всё, что уже было, остаётся на месте
  }
}

async function generateSlotImageViaAI(){
  const s = imageSlots()[slotTarget];
  if(!s) return;
  let kind = 'cover', item = null;
  if(s.kind === 'ex'){
    const pl = (draft.plans || [])[s.plan];
    const ex = pl && pl.exercises ? pl.exercises[s.idx] : null;
    if(!ex) return;
    kind = 'ex';
    item = exImageItem(ex);
  }
  $('slotModal').classList.remove('open');
  await generateOneImageViaAI(kind, item, s.title, data => {
    s.set(data);
    if(!imgTray.includes(data)) imgTray.push(data);
    renderTray(); renderSlots();
  });
}

async function finishImgGen(done, total, failed){
  renderSlots();
  if(imgGenCancelled){
    appAlert(t('images.stopped',{done,total}));
    return;
  }
  if(!failed.length){
    appAlert(t('images.done',{done,total}));
  } else {
    const retry = await appDialog(
      t('images.partial',{done:done-failed.length,total,failed:failed.join('\n• ')}) + '\n\n' + t('ai.retryQuestion'),
      {confirm:true,okText:t('ai.retry'),cancelText:t('ai.notNow')}
    );
    // Повторяем только пустые места: уже успешно созданные картинки не тратим заново.
    if(retry) return generateAllImagesViaAI('missing');
  }
}

/* ================= ПРОМТ ДЛЯ ГЕНЕРАЦИИ КАРТИНОК ================= */
// уникальные упражнения программы: без повторов между вариантами, с описанием и мышцами
function uniqueProgramExercises(){
  const seen = new Map(); // ключ — имя в нижнем регистре
  (draft.plans || []).forEach(pl => (pl.exercises || []).forEach(ex => {
    const name = (ex.name || '').trim();
    if(!name) return;
    const key = name.toLowerCase();
    if(seen.has(key)) return;
    seen.set(key, {
      name,
      desc: (ex.desc || '').trim(),
      muscles: (ex.muscles || []).map(id => M_LABEL[id]).filter(Boolean),
      format: ex.type || '',
      weight: +ex.weight || 0
    });
  }));
  return [...seen.values()];
}

function imagesPromptText(){
  const u = curUser();
  const genderTxt = u && u.gender === 'm' ? 'man' : 'woman';
  const name = (draft.name || '').trim() || 'Workout program';
  const exList = uniqueProgramExercises();
  const L = [
    'Generate a coherent image set for the Fit Timer fitness app.',
    'All exercise illustrations use 4:3. The program cover uses 1:1.',
    'Keep the same premium stylized-realistic 3D visual language, athlete, sportswear and rendering quality throughout the set.',
    '',
    'PROGRAM COVER:',
    coverImagePrompt(name, genderTxt)
  ];
  exList.forEach((ex, i) => {
    L.push('', `EXERCISE ${i + 1}:`, exerciseImagePrompt(ex, genderTxt));
  });
  L.push('', 'Return the cover first, then the exercise images in the exact order listed above.');
  return L.join('\n');
}

/* ================= КАРТИНКИ ПРОГРАММЫ: МАССОВАЯ ЗАГРУЗКА ================= */
let imgTray = [];        // загруженные, но ещё не разложенные картинки (data-url)
let slotTarget = null;   // {kind:'cover'} | {kind:'ex', plan, idx}

// последовательно сжимаем выбранные файлы
function shrinkAll(files, maxSide, done){
  const out = [];
  let i = 0;
  const next = ()=>{
    if(i >= files.length){ done(out); return; }
    shrinkImage(files[i++], maxSide, data => { if(data) out.push(data); next(); });
  };
  next();
}

// Экран картинок открывается и из настроек программы, и (для уже сохранённой
// программы) из её меню — поэтому «Готово» возвращает туда, откуда пришли, а не
// всегда в конструктор.
let imagesFrom = 'scrBuilder';
function openImages(){
  if(!imageWorkspaceGuard()) return false;
  imagesFrom = show._last || 'scrBuilder';
  // «Доступные» всегда начинается с картинок, которые уже используются в программе.
  // Поэтому после сохранения и повторного открытия назначенные изображения не исчезают.
  imgTray = [];
  imageSlots().forEach(s => {
    const data = s.get();
    if(data && !imgTray.includes(data)) imgTray.push(data);
  });
  renderTray();
  renderSlots();
  syncGeminiBtns();
  show('scrImages');
  window.scrollTo(0, 0);
}
function closeImages(){
  renderExList();
  syncSettingsSum();
  goBackTo(imagesFrom === 'scrImages' ? 'scrBuilder' : imagesFrom);
}

// Какие из загруженных картинок уже где-то стоят. Раньше «разложенность» считали
// тем, что картинка ИСЧЕЗАЛА из лотка при назначении, — и из-за этого: одну
// картинку нельзя было поставить двум упражнениям; замена картинки у одного и
// того же места съедала лоток по штуке за раз, а прежняя пропадала совсем; снятая
// с упражнения картинка в лоток не возвращалась. Теперь назначение КОПИРУЕТ, а
// лоток — просто то, что загружено.
function trayUsed(){
  const set = new Set();
  imageSlots().forEach(s0 => { const v = s0.get(); if(v) set.add(v); });
  return set;
}
function renderTray(){
  const box = $('tray');
  setShown('trayBox', imgTray.length);
  const used = trayUsed();
  const left = imgTray.filter(d => !used.has(d)).length;
  $('trayCount').textContent = imgTray.length ? `· ${imgTray.length}` : '';
  $('trayLeft').textContent = imgTray.length
    ? (left ? t('images.trayLeft',{count:left}) : t('images.trayAll'))
    : '';
  box.innerHTML = '';
  imgTray.forEach((data, i)=>{
    const el = document.createElement('div');
    const isUsed = used.has(data);
    el.className = 'tray-item' + (isUsed ? ' used' : '');
    el.innerHTML = `<img src="${esc(data)}" alt="">` +
      (isUsed ? '' : `<button type="button" class="ti-x">${icon('close')}</button>`);
    const x = el.querySelector('.ti-x');
    if(x) x.onclick = e => { e.stopPropagation(); imgTray.splice(i, 1); renderTray(); };
    el.onclick = ()=> appAlert(t('images.pickHint'));
    box.appendChild(el);
  });
}

// все места, куда можно подставить картинку
function imageSlots(){
  const slots = [{kind:'cover',group:t('images.cover'),title:t('images.coverProgram'),get:()=>draft.cover,set:v=>draft.cover=v}];
  const plans = draft.plans || [];
  plans.forEach((pl, pi)=>{
    (pl.exercises || []).forEach((ex, ei)=>{
      slots.push({
        kind: 'ex', plan: pi, idx: ei,
        group: plans.length > 1 ? `${t('builder.variant')} ${pi + 1}` : t('images.exerciseGroup'),
        title: (ex.name || '').trim() || t('store.untitled'),
        get: ()=> (ex.media && ex.media.kind === 'img') ? ex.media.data : null,
        set: v => { if(v) setExImg(ex, v); else dropExMedia(ex); }
      });
    });
  });
  return slots;
}

function renderSlots(){
  const box = $('slotList'); box.innerHTML = '';
  const slots = imageSlots();
  let lastGroup = null;
  slots.forEach((s, i)=>{
    if(s.group && s.group !== lastGroup){
      lastGroup = s.group;
      const g = document.createElement('div');
      g.className = 'slot-group';
      g.textContent = s.group;
      box.appendChild(g);
    }
    const cur = s.get();
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML =
      `<div class="sl-thumb">${cur ? `<img src="${esc(cur)}" alt="">` : DUMBBELL_ICON}</div>` +
      `<div class="sl-body"><b></b><small class="${cur ? 'has' : ''}">${cur ? 'картинка есть' : 'нет картинки'}</small></div>`;
    row.querySelector('b').textContent = s.title;
    row.onclick = ()=> openSlotPicker(i);
    box.appendChild(row);
  });
}

function openSlotPicker(i){
  const slots = imageSlots();
  slotTarget = i;
  const s = slots[i];
  $('slotTitle').textContent = s.title;
  const box = $('slotTray'); box.innerHTML = '';
  setShown('slotEmptyHint', !(imgTray.length));
  const cur = s.get();
  imgTray.forEach(data =>{
    const el = document.createElement('div');
    el.className = 'tray-item' + (data === cur ? ' act' : '');
    el.innerHTML = `<img src="${esc(data)}" alt="">`;
    el.onclick = ()=>{
      s.set(data);                       // копируем, лоток не трогаем
      $('slotModal').classList.remove('open');
      renderTray(); renderSlots();
    };
    box.appendChild(el);
  });
  // обложку тоже можно нарисовать — как и картинку упражнения
  setShown('slotRemove', s.get());
  $('slotModal').classList.add('open');
}

// раскладывает лоток по местам без картинок, по порядку
function trayAutoAssign(){
  if(!imgTray.length){ appAlert(t('images.pickFirst')); return; }
  const already = trayUsed();
  const free = imgTray.filter(d => !already.has(d));   // раскладываем ещё не пристроенные
  if(!free.length){ appAlert(t('images.allPlaced')); return; }
  let n = 0;
  for(const s of imageSlots()){
    if(n >= free.length) break;
    if(s.get()) continue;          // тут уже есть картинка — не трогаем
    s.set(free[n++]);
  }
  renderTray(); renderSlots();
  const rest = free.length - n;
  appAlert(n
    ? t('images.assigned',{count:n}) + (rest ? t('images.noRoom',{count:rest}) : '')
    : t('images.noSlots'));
}

/* ================= ПРАВКА УПРАЖНЕНИЯ ЧЕРЕЗ ИИ ================= */
let exeIdx = -1; // индекс правимого упражнения

// «ФОРМАТ: …» — четыре сочетания: повторения/время × без веса/с весом
// («время и вес» — удержание или перенос с утяжелением: фермерская прогулка,
// планка с блином, вис с утяжелителем).
function exFormatLine(ex){
  const axis = ex.type === 'time' ? 'время' : 'повторения';
  return 'ФОРМАТ: ' + (hasWeight(ex) ? axis + ' и вес' : axis);
}
// ОТДЫХ — между подходами (как раньше). Вторую строку, «после упражнения»,
// пишем только когда она реально отличается: у большинства упражнений отдых
// после — то же число, и не указанное явно поле само возьмёт его в качестве
// запасного варианта (exRestAfter) — не нужно засорять текст повтором.
function exRestLines(ex){
  const L = ['ОТДЫХ: ' + (ex.rest || 0)];
  const after = exRestAfter(ex);
  if(after !== (+ex.rest || 0)) L.push('ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ: ' + after);
  return L;
}
// строки УСЛОЖНЯТЬ/ВЕС/ШАГ/ПОТОЛОК/ЗАМЕНА — общие для сериализации упражнения
// что в тексте одного упражнения (правка через ИИ), что в тексте всей программы.
// Сериализуем только оси, которые реально что-то значат для этого формата: для
// «…и вес» — обе независимо (0 = эта ось намеренно не растёт), для простых — одна.
function exProgToLines(ex, opts){
  // при forEdit (opts.program задан) показываем текущий прогрессированный вес,
  // а не базу — см. exCurrentValueText/programToText выше
  const p = opts && opts.program;
  const weightNow = p ? getExWeight(p.id, ex, p) : (+ex.weight || 0);
  const L = ['УСЛОЖНЯТЬ: ' + (progAxis(ex) === 'none' ? 'нет' : 'да')];
  // ВЕС: 0 — не «пустое место», а значимое «снаряд ещё не выбран» (см.
  // weightPending() в 60-builder.js): раньше строку пропускали при нуле, и
  // формат «повторения и вес» без выбранного снаряда терял ВЕС из протокола
  // вовсе, а прогрессия молча копилась поверх несуществующей базы.
  if(hasWeight(ex)) L.push('ВЕС: ' + fmtKg(weightNow));
  if(progAxis(ex) !== 'none'){
    if(hasWeight(ex)){
      if(ex.type === 'time'){
        L.push('ШАГ ВРЕМЕНИ: ' + (ex.timeStep != null ? ex.timeStep : 5));
        L.push('ШАГ ВЕСА: ' + fmtKg(ex.wStep != null ? ex.wStep : 2));
        if(+ex.timeMax > 0) L.push('ПОТОЛОК ВРЕМЕНИ: ' + ex.timeMax);
        if(+ex.weightMax > 0) L.push('ПОТОЛОК ВЕСА: ' + fmtKg(ex.weightMax));
      } else {
        L.push('ШАГ ПОВТОРОВ: ' + (ex.repsStep != null ? ex.repsStep : 1));
        L.push('ШАГ ВЕСА: ' + fmtKg(ex.wStep != null ? ex.wStep : 2));
        if(+ex.repsMax > 0) L.push('ПОТОЛОК ПОВТОРОВ: ' + ex.repsMax);
        if(+ex.weightMax > 0) L.push('ПОТОЛОК ВЕСА: ' + fmtKg(ex.weightMax));
        if(ex.dualProg) L.push('ПРИ ПОТОЛКЕ: да');
      }
    } else if(ex.type === 'time'){
      L.push('ШАГ: ' + (ex.timeStep != null ? ex.timeStep : 5));
      if(+ex.timeMax > 0) L.push('ПОТОЛОК: ' + ex.timeMax);
    } else {
      L.push('ШАГ: ' + (ex.repsStep != null ? ex.repsStep : 1));
      if(+ex.repsMax > 0) L.push('ПОТОЛОК: ' + ex.repsMax);
    }
    if(ex.swapOn && (ex.swapName || '').trim()){
      L.push('ЗАМЕНА: ' + ex.swapName.trim());
      if((ex.swapDesc || '').trim()) L.push('ОПИСАНИЕ ЗАМЕНЫ: ' + ex.swapDesc.replace(/\s*\n+\s*/g, ' ').trim());
    }
  }
  return L;
}

// одно упражнение → текст в нашем формате
function exerciseToText(ex){
  const L = ['УПРАЖНЕНИЕ: ' + (ex.name || '')];
  if((ex.desc || '').trim()) L.push('ОПИСАНИЕ: ' + ex.desc.replace(/\s*\n+\s*/g, ' ').trim());
  const mus = (ex.muscles || []).map(id => M_LABEL[id]).filter(Boolean);
  if(mus.length) L.push('МЫШЦЫ: ' + mus.join(', '));
  if((ex.mistakes || '').trim()) L.push('ОШИБКИ: ' + ex.mistakes.replace(/\s*\n+\s*/g, ' ').trim());
  L.push(exFormatLine(ex));
  L.push('ЗНАЧЕНИЕ: ' + valueText(ex.value).replace('–', '-'));
  L.push('ПОДХОДЫ: ' + (parseInt(ex.sets) || 1));
  if(ex.perSide) L.push('СТОРОНА: да');
  if(ex.warmup) L.push('РАЗМИНКА: да');
  L.push(...exRestLines(ex));
  L.push(...exProgToLines(ex));
  if((ex.video || '').trim()) L.push('ВИДЕО: ' + ex.video.trim());
  return L.join('\n');
}

function openExEdAI(i){
  const ex = curPlan().exercises[i];
  if(!ex) return;
  exeIdx = i;
  $('aiSubjName').textContent = (ex.name || '').trim() || t('common.exerciseFallback');
  $('aiSubjSum').textContent = exSummary(ex);
  $('exeWish').value = '';
  autoGrow($('exeWish'));
  openAI('exEdit');
}

// формат ответа для ОДНОГО упражнения — общий для правки через ИИ и для замены прямо
// с тренировки, чтобы обе кнопки просили у нейросети ровно одно и то же
function aiClientVerdict(kind, raw, opts){
  const verdict = FitAIProtocol.validateResponse(kind, raw);
  if(!verdict.ok){
    const miss = (verdict.missing || []).slice(0,6).join(', ');
    appAlert(MSG_AI_PARSE() + (miss ? '\n\n' + t('ai.parseProblems') + '\n— ' + miss : ''));
    return null;
  }
  if(opts && opts.expectedCount != null && verdict.count != null && verdict.count !== opts.expectedCount){
    appAlert(MSG_AI_PARSE());
    return null;
  }
  return verdict.text;
}

function exAnswerFormat(locale){
  const lang=locale==='ru'?'Russian':locale==='en'?'English':aiOutputLanguage();
  return [
    FitAIProtocol.machineLanguageRules(lang),
    FitAIProtocol.exerciseSchema(lang),
    FitAIProtocol.progressionRules()
  ].join('\n\n');
}

function exePrompt(){
  const ex=curPlan().exercises[exeIdx];
  const wish=clampText($('exeWish').value,LIM.wish);
  return [
    'Edit exactly ONE home-workout exercise.',
    'Return exactly ONE complete exercise block and nothing else: no Markdown and no explanation.',
    FitAIProtocol.editRules(),
    'USER: '+userForAI(draft&&draft.locale),
    'REQUEST: '+wish,
    '=== CURRENT EXERCISE ===\n'+exerciseToText(ex),
    exAnswerFormat(draft&&draft.locale)
  ].join('\n\n');
}

async function applyExEdit(){
  const raw=($('aiResult').value||'').trim();
  if(!raw){appAlert(MSG_AI_EMPTY());return;}
  const list=curPlan().exercises;
  const oldEx=list[exeIdx];
  if(!oldEx){goBackTo('scrBuilder');return;}
  // ровно один блок — правка не имеет права тихо расплодиться в два упражнения
  const candidateBlocks=aiExerciseBlocks(raw);
  if(candidateBlocks.length!==1){appAlert(MSG_AI_NOEX());return;}
  // Ответ ИИ используется как есть; carryExerciseFields лишь подставляет описание/
  // мышцы/ошибки/видео из старого блока, если ИИ их не вернул — раньше здесь был
  // позиционный merge всех полей, который не давал ИИ ни убрать, ни переставить строку.
  const merged=FitAIProtocol.carryExerciseFields(exerciseToText(oldEx),candidateBlocks[0].lines.join('\n'));
  if(!aiClientVerdict('exercise.modify', merged, {expectedCount:1})) return;
  const wrapped='ПРОГРАММА: temp\nДЕНЬ:\nКРУГИ: 1\n\n'+merged;
  const {program}=parseProgramText(wrapped);
  const got=(program.plans&&program.plans[0]&&program.plans[0].exercises)||[];
  if(got.length!==1){appAlert(MSG_AI_NOEX());return;}
  const upd=got[0];
  if(!upd.media&&oldEx.media)upd.media=oldEx.media;
  // это правка, а не замена: то же самое упражнение сохраняет свой id, а
  // прогресс — если ИИ не менял его базовые числа (см. carryExerciseProgress)
  upd.id=oldEx.id;
  carryExerciseProgress(oldEx, upd);
  list[exeIdx]=upd;
  // запрос тоже очищаем: пока в нём был текст, экран считался несохранённым,
  // и возврат назад молча не срабатывал — человек оставался на «Через ИИ»
  $('aiResult').value='';
  $('exeWish').value='';
  if(exFromWork) await afterExChange();
  else{
    // показываем результат там, где его видно и можно сразу поправить руками
    renderExList();
    const keep=exeIdx;
    asTab(()=> openExercise(keep));
  }
  appAlert(t('ai.exerciseUpdated',{name:upd.name||t('common.exerciseFallback')}));
}

/* ================= УПРАЖНЕНИЕ ЧЕРЕЗ ИИ ================= */
// Наборы чипов ОДНИ И ТЕ ЖЕ у программы и у упражнения. Раньше они разошлись:
// в программе инвентарь начинался с «Нет» и содержал «Резинки», «Утяжелители» и
// «Турник», в упражнении — с «Без инвентаря», «Резинка» и без последних двух.
// Мышцы тоже: у программы был свой список с «Талией» и «Ногами целиком», у
// упражнения — строгий список MUSCLES, который понимает парсер.
const EXA_OPTS = {
  format: ['Повторения', 'С весом', 'Время'],
  level: OPT_LEVEL,
  equip: OPT_EQUIP
};
// сколько упражнений просить у нейросети — обычное число, а не диапазон чипом
const exa = {count: 1, format: '', level: '', muscles: [], equip: []};

// «Подобрать за меня» без объекта непонятно, что именно подберётся — называем
// прямо, и число упражнений в кнопке следует за выбором в «Сколько упражнений»
function exaSelfLabel(){
  const n = exa.count || 1;
  if(n === 1) return t('ai.pickOneExercise');
  return appLocale === 'ru'
    ? `Подобрать ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')}`
    : t('ai.pickExercises', {count:n});
}

function exaChips(){
  const sel = $('exaCount');
  if(!sel.options.length){
    for(let i = 1; i <= 10; i++) sel.add(new Option(String(i), String(i)));
    sel.onchange = ()=>{
      exa.count = Math.max(1, Math.min(10, parseInt(sel.value) || 1));
      if(aiSrc === 'exNew') $('aiSelfLabel').textContent = exaSelfLabel();
    };
  }
  sel.value = String(exa.count || 1);
  qChips('exaFormat', EXA_OPTS.format, false, ()=> exa.format, v => exa.format = v);
  qChips('exaLevel', EXA_OPTS.level, false, ()=> exa.level, v => exa.level = v);
  qChips('exaEquip', EXA_OPTS.equip, true, ()=> exa.equip, v => exa.equip = v);
  qChips('exaMuscles', MUSCLES.map(m => m[1]), true, ()=> exa.muscles, v => exa.muscles = v);
}

function openExAI(){
  exa.count = 1; exa.format = ''; exa.level = ''; exa.muscles = []; exa.equip = [];
  $('exaWish').value = '';
  $('exaContext').value = '';
  exaChips();
  autoGrow($('exaWish'));
  autoGrow($('exaContext'));
  openAI('exNew');
}

function aiExerciseHasUserInput(){
  const wish = clampText((($('exaWish') && $('exaWish').value) || ''), LIM.wish).trim();
  const context = clampText((($('exaContext') && $('exaContext').value) || ''), 600).trim();
  return !!(
    exa.format || exa.level ||
    (exa.muscles && exa.muscles.length) ||
    (exa.equip && exa.equip.length) ||
    wish || context
  );
}

function aiCreateExerciseGuard(){
  if(aiExerciseHasUserInput()) return true;
  appAlert(t('ai.needExerciseInput'));
  return false;
}

function exaPrompt(){
  const wish=clampText($('exaWish').value,LIM.wish);
  const given=[],free=[];
  const fmtMap={'Повторения':'unweighted reps','С весом':'weighted reps','Время':'time'};
  if(exa.format)given.push(`Preferred format: ${fmtMap[exa.format]||aiCanonicalEnglish(exa.format)}.`);
  else free.push('choose the most natural format: reps, weighted reps, time, or weighted time');
  if(exa.level)given.push(`Difficulty: ${aiCanonicalEnglish(exa.level)}.`);
  else free.push('difficulty level');
  if(exa.muscles.length)given.push(`Target muscles: ${exa.muscles.map(aiCanonicalEnglish).join(', ')}.`);
  else free.push('working muscles');
  if(exa.equip.length)given.push(`Available equipment: ${exa.equip.map(aiCanonicalEnglish).join(', ')}.`);
  else free.push('equipment; assume no special home equipment unless the exercise needs it');

  const cnt=Math.max(1,Math.min(10,parseInt(exa.count)||1));
  const many=cnt>1;
  const task=many
    ? `Create exactly ${cnt} different home-workout exercises. Return exactly ${cnt} separate exercise blocks, each beginning with "УПРАЖНЕНИЕ:", separated by a blank line. Do not duplicate exercises. Return nothing else.`
    : 'Create exactly one home-workout exercise. Return exactly one exercise block and nothing else.';
  let req='USER: '+userForAI(draft&&draft.locale)+'\nREQUEST: '+(wish||'(No specific request. Suggest a useful exercise that fits the user.)');
  const context=clampText(($('exaContext')&&$('exaContext').value)||'',600).trim();
  if(context){
    req+='\nUSER CAPABILITIES / LIMITATIONS CONTEXT: '+context+
      '. Treat this as authoritative self-reported context for exercise selection, starting load, range of motion, impact and progression. Do not diagnose from it. If it describes an injury, pain, or other health limitation, avoid exercise choices that clearly conflict with it and do not claim medical clearance.';
  }
  if(given.length)req+='\n'+given.join(' ');
  if(free.length)req+='\nDecide these unspecified items yourself using sensible training logic: '+free.join('; ')+'.';
  return [task,req,exAnswerFormat(draft&&draft.locale)].join('\n\n');
}

async function exaAddExercise(){
  const raw = ($('aiResult').value || '').trim();
  if(!raw){ appAlert(MSG_AI_EMPTY()); return; }
  const checkedRaw = aiClientVerdict('exercise.create', raw);
  if(!checkedRaw) return;
  // оборачиваем в минимальную программу, чтобы переиспользовать основной парсер
  const wrapped = 'ПРОГРАММА: temp\nДЕНЬ:\nКРУГИ: 1\n\n' + checkedRaw;
  const {program, errors} = parseProgramText(wrapped);
  const list = (program.plans && program.plans[0] && program.plans[0].exercises) || [];
  if(!list.length){
    appAlert(MSG_AI_NOEX());
    return;
  }
  const target = curPlan().exercises;
  const nWarm = target.filter(e => e.warmup).length;
  let nMain = target.length - nWarm;
  let added = 0;
  for(const ex of list){
    if(ex.warmup ? nWarm + added >= MAX_WARM : nMain >= MAX_MAIN) break;
    target.push(ex);
    if(!ex.warmup) nMain++;
    added++;
  }
  if(!added){ appAlert(t('exercise.addLimit')); return; }
  $('aiResult').value = '';
  if($('exaContext')) $('exaContext').value = '';
  renderExList();
  // Успешное применение завершает режим ИИ. Builder уже лежит под экраном ИИ,
  // поэтому именно ВОЗВРАЩАЕМСЯ к нему и ждём popstate. Простая замена текущей
  // записи делала два Builder подряд, из-за чего следующий Back оставался в Builder.
  await goBackTo('scrBuilder');
  appAlert(added === 1
    ? t('exercise.addedOne',{name:list[0].name})
    : t('exercise.addedMany',{count:added}));
}

/* ================= ПРОГРАММА ИЗ ВИДЕО ================= */
// проверяем и нормализуем ссылку на YouTube
function parseYouTubeUrl(raw){
  const s = String(raw || '').trim();
  if(!s) return null;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if(!m) return null;
  return {id: m[1], url: s.startsWith('http') ? s : ('https://' + s)};
}

function youtubePrompt(){
  const yt = parseYouTubeUrl($('ytUrl').value);
  const wish = clampText($('ytWish').value, LIM.wish);
  const link = yt ? yt.url : ($('ytUrl').value || '').trim();
  return aiPrompt() +
    '\n\n=== TASK: BUILD A PROGRAM FROM A VIDEO ===\n' +
    'Analyze the workout at the link and convert it into the protocol above.\n' +
    'VIDEO URL: ' + link + '\n' +
    'USER: ' + userForAI() + '\n\n' +
    'Requirements:\n' +
    '- Keep exercises in the same order as the video, with the same reps/durations and rest when they can be determined.\n' +
    '- Mark warm-up exercises with the exact token "РАЗМИНКА: да".\n' +
    '- If the video repeats the whole exercise list, represent that with КРУГИ. If one exercise is repeated in consecutive sets, use ПОДХОДЫ.\n' +
    '- Write user-visible exercise names and descriptions in ' + aiOutputLanguage() + '.\n' +
    '- For ВИДЕО on EACH exercise, use the same video URL with a timestamp for the moment that exercise starts. Prefer an approximate timestamp over linking to the beginning when exact timing is uncertain.\n' +
    '- Describe technique in your own words; do not quote the creator verbatim.\n' +
    '- In ОПИСАНИЕ ПРОГРАММЫ mention the source video and what type of workout it is.\n' +
    '- If the video is unavailable or is not a workout, say so instead of inventing a program.\n' +
    (wish ? ('\nADDITIONAL USER REQUEST: ' + wish + '\n') : '');
}

function openYouTube(){
  $('ytUrl').value = '';
  $('ytWish').value = '';
  autoGrow($('ytWish'));
  openAI('video');
  requireWho('ai', ()=> goTab('scrPrograms'));
}

function ytCheckUrl(){
  const v = ($('ytUrl').value || '').trim();
  const ok = !v || !!parseYouTubeUrl(v);
  $('ytHint').style.color = ok ? '' : 'var(--danger)';
  $('ytHint').textContent = ok ? t('youtube.hint') : t('youtube.badLink');
  return ok;
}

/* ================= ДОРАБОТКА ПРОГРАММЫ ЧЕРЕЗ ИИ ================= */
let editAIProg = null; // программа-исходник

// текущее (уже прогрессированное) значение упражнения — то, что человек реально
// делает сейчас, а не база из редактора. Используется только для AI-правки всей
// программы (см. programToText forEdit): она создаёт НОВУЮ программу со своим
// счётчиком прогрессии с нуля, поэтому если отдать ИИ базу, правка отбросит
// пользователя к исходным цифрам — а если отдать текущее и принять его как
// новую базу, продолжение идёт ровно с той точки, на которой человек остановился.
function exCurrentValueText(p, ex){
  if(ex.type === 'time') return String(getExProgValue(p.id, ex, p, 'time'));
  // двойная прогрессия: текущие повторы — одна точка внутри диапазона. Отдать
  // её как новую базу значит потерять низ диапазона, к которому повторы
  // сбрасываются при прибавке веса. Отдаём диапазон как есть — после правки
  // повторы начнут цикл снизу с текущим (уже выросшим) весом.
  if(isDualProg(ex)) return valueText(ex.value).replace('–', '-');
  return progressedRepsRange(p.id, ex, p).replace('–', '-');
}

// программа → текст того же формата, который понимает парсер
// картинки и svg НЕ включаем: они длинные, а перенесём их сами по id (см. carryMedia)
// opts.forEdit: для AI-правки всей программы — добавляет техническую метку КОД:
// у каждого упражнения (не видна пользователю) и отдаёт текущую прогрессированную
// нагрузку вместо базовой, см. exCurrentValueText выше и exProgToLines(ex, opts)
function programToText(p, opts){
  const forEdit = !!(opts && opts.forEdit);
  const L = [];
  L.push('ПРОГРАММА: ' + (p.name || ''));
  if((p.desc || '').trim()) L.push('ОПИСАНИЕ ПРОГРАММЫ: ' + p.desc.replace(/\s*\n+\s*/g, ' ').trim());
  if(p.time) L.push('ВРЕМЯ: ' + p.time);
  if(p.progression){
    L.push(`ПРОГРЕССИЯ: ${p.progression} — проверять нагрузку раз в ${p.progression} ${plural(p.progression, 'выполнение упражнения', 'выполнения упражнения', 'выполнений упражнения')}`);
  }
  const plans = normPlans(p);
  if(p.rotate && plans.length > 1){
    L.push('ЧЕРЕДОВАНИЕ: да');
    if((p.days || []).length) L.push('ДНИ ТРЕНИРОВОК: ' + p.days.join(', '));
  }
  plans.forEach(pl => {
    L.push('');
    L.push('ДЕНЬ: ' + ((!p.rotate && pl.days && pl.days.length) ? pl.days.join(', ') : ''));
    L.push('КРУГИ: ' + (pl.rounds || 1));
    L.push('ОТДЫХ МЕЖДУ КРУГАМИ: ' + (pl.roundRest || 0));
    if(pl.time) L.push('ВРЕМЯ ВАРИАНТА: ' + pl.time);
    (pl.exercises || []).forEach(ex => {
      L.push('');
      L.push('УПРАЖНЕНИЕ: ' + (ex.name || ''));
      if(forEdit && ex.id) L.push('КОД: ' + ex.id);
      if((ex.desc || '').trim()) L.push('ОПИСАНИЕ: ' + ex.desc.replace(/\s*\n+\s*/g, ' ').trim());
      const mus = (ex.muscles || []).map(id => M_LABEL[id]).filter(Boolean);
      if(mus.length) L.push('МЫШЦЫ: ' + mus.join(', '));
      if((ex.mistakes || '').trim()) L.push('ОШИБКИ: ' + ex.mistakes.replace(/\s*\n+\s*/g, ' ').trim());
      L.push(exFormatLine(ex));
      L.push('ЗНАЧЕНИЕ: ' + (forEdit ? exCurrentValueText(p, ex) : valueText(ex.value).replace('–', '-')));
      // всегда, даже при 1 подходе: ИИ повторяет формат исходника, и без строки
      // возвращал программу без ПОДХОДЫ вовсе
      L.push('ПОДХОДЫ: ' + (parseInt(ex.sets) || 1));
      if(ex.perSide) L.push('СТОРОНА: да');
      if(ex.warmup) L.push('РАЗМИНКА: да');
      L.push(...exRestLines(ex));
      L.push(...exProgToLines(ex, forEdit ? {program:p} : null));
      if((ex.video || '').trim()) L.push('ВИДЕО: ' + ex.video.trim());
    });
  });
  return L.join('\n');
}

function editAIPrompt(){
  const wish=clampText($('eaWish').value,LIM.wish);
  return aiPrompt((editAIProg&&editAIProg.locale)||appLocale)+
    '\n\n=== TASK: EDIT AN EXISTING PROGRAM ===\n'+
    'Apply the requested changes and return the COMPLETE program in the same machine-readable protocol.\n'+
    FitAIProtocol.editRules()+'\n'+
    // КОД — только для сопоставления «то же упражнение / новое», сюда не входит в
    // обычный протокол и не должна попасть в пользовательский текст (ОПИСАНИЕ и т.п.)
    'Each УПРАЖНЕНИЕ line may be followed by a КОД: <code> line — an internal reference tag, never user-visible text. Repeat the SAME КОД for the same movement even if you rename it, move it, or change its format; give a genuinely new exercise no КОД line at all; never move a КОД onto a different exercise.\n'+
    // Длинная программа (20+ упражнений) переписывалась целиком вместе с
    // описаниями техники по 600 знаков и не успевала за время ответа сервера.
    // Описания неизменных упражнений приложение подставит само (carryExerciseText).
    'Keep the answer short: for an exercise you keep (it has a КОД) whose ОПИСАНИЕ, МЫШЦЫ and ОШИБКИ stay accurate after the change, OMIT those three lines — the app keeps the existing text. Write them in full for new exercises and whenever the movement, equipment or technique changes.\n'+
    'USER: '+userForAI((editAIProg&&editAIProg.locale)||appLocale)+'\n'+
    'USER REQUEST: '+wish+'\n\n'+
    '=== CURRENT PROGRAM (values shown are the CURRENT working load, not the original baseline) ===\n'+programToText(editAIProg, {forEdit:true});
}

function openEditAI(p){
  editAIProg = p;
  $('aiSubjName').textContent = p.name || t('program.fallback');
  const plans = normPlans(p);
  const exN = plans.reduce((n, pl) => n + pl.exercises.length, 0);
  $('aiSubjSum').textContent = (plans.length>1?storeCountText(plans.length,'variant')+' · ':'') + storeCountText(exN,'exercise');
  $('eaWish').value = '';
  autoGrow($('eaWish'));
  openAI('edit');
}

// подбирает свободное имя: «Ягодицы (обновлённая)», «Ягодицы (обновлённая 2)»…
function versionedName(base){
  const clean = String(base || t('program.fallback')).replace(/\s+\((?:обновлённая|updated)(?:\s+\d+)?\)$/i, '').trim();
  const taken = new Set(customPrograms.map(x => (x.name || '').trim().toLowerCase()));
  if(!taken.has(clean.toLowerCase())) return clean;
  const cand = `${clean} (${t('program.updated')})`;
  if(!taken.has(cand.toLowerCase())) return cand;
  for(let v = 2; v < 100; v++){
    const cand2 = `${clean} (${t('program.updatedN',{count:v})})`;
    if(!taken.has(cand2.toLowerCase())) return cand2;
  }
  return clean + ' (' + t('program.updatedN',{count:Date.now()}) + ')';
}

// переносит картинки и обложку из исходной программы. Упражнения сопоставлены
// заранее через FitAIProtocol.diffPrograms (id/КОД/имя, см. createEditedProgram)
// — так перестановка и лёгкое переименование сохраняют картинку, а настоящая
// замена движения (новое упражнение без пары) — нет: старая картинка от другого
// движения только запутала бы.
function carryMedia(oldProg, newProg, diff){
  let carried = 0;
  diff.matches.forEach(({oldEx, newEx}) => {
    if(!newEx.media && oldEx.media){ newEx.media = JSON.parse(JSON.stringify(oldEx.media)); carried++; }
  });
  if(!newProg.cover && oldProg.cover) newProg.cover = oldProg.cover;
  return carried;
}

// Счётчик «сколько раз выполнено до проверки повышения» (ex.ps.n) — у того же
// упражнения после правки он продолжается, а не начинается с нуля. Текущие
// значения (ps.cur) не переносим: ИИ получил их в тексте программы
// (programToText forEdit) и вернул как новую базу — иначе прибавка
// посчиталась бы дважды.
// Исключение — база упражнения не изменилась (правили описание, отдых, порядок;
// у двойной прогрессии ИИ видит исходный диапазон, а не текущее число): тогда
// переносится и ps.cur, иначе повторы двойной прогрессии откатывались к началу.
function carryProgressCounters(diff){
  diff.matches.forEach(({oldEx, newEx}) => { carryExerciseProgress(oldEx, newEx); });
}

// Описание, мышцы, ошибки и видео у сопоставленного упражнения, которые ИИ не
// вернул (так просит editAIPrompt — ради короткого ответа), берём из исходника.
// Вернул — значит поменял: его текст не трогаем.
function carryExerciseText(diff){
  diff.matches.forEach(({oldEx, newEx}) => {
    if(!(newEx.desc || '').trim() && (oldEx.desc || '').trim()) newEx.desc = oldEx.desc;
    if(!(newEx.muscles || []).length && (oldEx.muscles || []).length) newEx.muscles = oldEx.muscles.slice();
    if(!(newEx.mistakes || '').trim() && (oldEx.mistakes || '').trim()) newEx.mistakes = oldEx.mistakes;
    if(!(newEx.video || '').trim() && (oldEx.video || '').trim()) newEx.video = oldEx.video;
  });
}

// расчётная (не по истории) длительность одного варианта — используется только
// для сравнения «было / стало» при AI-правке, поэтому обеим сторонам нужна одна
// и та же основа: реальная история новой программы всегда пуста (свежий id), а у
// старой может быть — сравнение «средняя реальная» против «расчётная» было бы
// нечестным. Подменяем id, чтобы estimatedWorkoutMinutes не подобрала историю.
function structuralMinutes(p, planIdx){
  return estimatedWorkoutMinutes(Object.assign({}, p, {id:'~diff~'}), planIdx || 0, []).n;
}

// «Было / стало» после AI-правки: коротко, без похода в текст ответа. Плюс
// хардовые проверки итога (пачка 1, п.4) — то, что не запретить заранее в
// промте, но можно и нужно поймать после генерации.
function editSummaryText(diff, oldProg, newProg){
  const bits = [];
  if(diff.added.length) bits.push(t('ai.editAdded', {names: diff.added.map(e => e.name || t('common.exerciseFallback')).join(', ')}));
  if(diff.removed.length) bits.push(t('ai.editRemoved', {names: diff.removed.map(e => e.name || t('common.exerciseFallback')).join(', ')}));
  if(diff.moved > 0) bits.push(t('ai.editReordered'));
  // сравниваем КАЖДЫЙ вариант (Пн/Чт…): ИИ мог раздуть только один из них.
  // Вариант, которого до правки не было или который убрали, в сравнение не
  // идёт — его упражнения уже названы выше как добавленные/убранные.
  // Порог как в самой генерации: короткие тренировки — ±5 минут, длинные — ±20%.
  const n = Math.min(normPlans(oldProg).length, normPlans(newProg).length);
  let worst = null;
  for(let i = 0; i < n; i++){
    const before = structuralMinutes(oldProg, i), after = structuralMinutes(newProg, i);
    const d = Math.abs(after - before);
    const notable = before > 0 && d > (before <= 20 ? 5 : Math.max(5, before * 0.2));
    if(notable && (!worst || d > worst.d)) worst = {before, after, d};
  }
  if(worst) bits.push(t('ai.editTimeChanged', {before: worst.before, after: worst.after}));
  return bits.join('');
}

async function createEditedProgram(){
  const raw = ($('aiResult').value || '').trim();
  if(!raw){ appAlert(MSG_AI_EMPTY()); return; }
  // Ответ ИИ принимается как есть — свобода добавлять/убирать/переставлять
  // упражнения теперь в промте (FitAIProtocol.editRules), а не в клиенте через
  // regex-угадайку «structural» и принудительный merge старой структуры.
  const checkedRaw = aiClientVerdict('program.modify', raw);
  if(!checkedRaw) return;
  const {program, errors} = parseProgramText(checkedRaw);
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('ai.parseProblems') + '\n— ' + errors.join('\n— '));
    return;
  }
  // жёсткая проверка итога: программа не развалилась на пустые варианты — иначе
  // за «улучшением» на деле нет тренировки
  const newPlans = normPlans(program);
  if(!newPlans.length || newPlans.some(pl => !(pl.exercises || []).length)){
    appAlert(MSG_AI_PARSE());
    return;
  }
  const diff = FitAIProtocol.diffPrograms({plans: normPlans(editAIProg)}, {plans: newPlans});
  // КОД — техническая метка сопоставления, в сохранённой программе ей делать нечего
  newPlans.forEach(pl => (pl.exercises || []).forEach(ex => { delete ex._code; }));

  program.id = 'p' + Date.now();
  program.stats = {completions: 0};
  program.locale = (editAIProg && (editAIProg.locale === 'ru' || editAIProg.locale === 'en'))
    ? editAIProg.locale : (appLocale === 'ru' ? 'ru' : 'en');
  delete program.rotIdx; delete program.progLast;
  // имя: если не изменилось — добавляем версию
  program.name = versionedName(program.name || editAIProg.name);
  carryMedia(editAIProg, program, diff);
  carryExerciseText(diff);
  carryProgressCounters(diff);
  // настройки, которые ИИ мог не вернуть, берём из исходника
  if(!program.time && editAIProg.time) program.time = editAIProg.time;
  if(program.load == null && editAIProg.load != null) program.load = editAIProg.load;

  customPrograms.push(program);
  await savePrograms();
  renderMine();
  $('aiResult').value = '';
  goTab('scrPrograms');
  appAlert(t('program.createdEdited',{name:program.name}) + editSummaryText(diff, editAIProg, program));
}

/* Короткая ссылка /p/<id>: программу забираем с сервера. Метка src остаётся в
   программе — по ней потом уедет отчёт, и по ней же подопечный понимает, что программа
   пришла от тренера, а не собрана им самим. */
async function claimProgramLink(id){
  if(!id || !account || !account.email || !account.syncToken) return false;
  let deviceId=await kvGet('deviceId');
  if(!deviceId){deviceId=newId();await kvSet('deviceId',deviceId);}
  try{
    await apiPost('/api/p/'+encodeURIComponent(id),{action:'claim',email:account.email,deviceId,token:account.syncToken});
    return true;
  }catch(_){return false;}
}

async function importProgramLink(id){
  let d;
  try{ d = await apiFetch('/api/p/' + encodeURIComponent(id)); }
  catch(e){
    appAlert(e.status === 404
      ? t('import.linkExpired')
      : t('import.linkOffline'));
    return;
  }
  const prog = d.program;
  if(!prog || !prog.name){ appAlert(t('import.noProgram')); return; }
  const existing = customPrograms.find(x => x && x.src === id);
  prog.id = existing ? existing.id : ('p' + Date.now());
  prog.stats = existing && existing.stats ? existing.stats : {completions: 0};
  if(existing && existing.active !== undefined) prog.active = existing.active;
  if(existing && existing.progStepsAdj != null) prog.progStepsAdj = existing.progStepsAdj;
  prog.src = id;
  prog.plans = normPlans(prog);
  sanitizeProgram(prog);        // пришло по сети — значит, могло прийти любым
  // Снимок присланного — чтобы потом было видно, что подопечный в нём поменял.
  prog.origEx = snapshotEx(prog);
  if(d.by) prog.by = d.by;
  if(d.byLink) prog.byLink = d.byLink;
  draft = prog;
  draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
  delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days;
  planIdx = 0;
  fillBuilder(t('import.reviewSave'));
  // Говорим ОДИН РАЗ и ЗАРАНЕЕ: тренер будет видеть занятия по этой программе.
  // Отчёты уходят сами, и узнавать об этом постфактум человек не должен —
  // согласие на «за мной смотрят» даётся до, а не после.
  if(prog.by){
    appAlert(t('import.trainerNotice',{trainer:prog.by}));
  }
}

/* Разбор вставленного. Приложение выдаёт КОРОТКУЮ ссылку (?p=<id>) — и именно её
   поле не понимало вовсе: человек вставлял то, что ему прислали, и получал «это не
   похоже на код программы». Проверять надо то, что приходит, а не то, что мы когда-то
   выдавали.

   Три случая, и все три встречаются:
   • короткая ссылка ?p=<id> — программу забираем с сервера;
   • старая ссылка ?import=FIT1… — приложение таких больше не делает, но они лежат
     в чужих переписках, и ломать их задним числом незачем;
   • голый код FIT1… — то же самое, вставленное без адреса. */
function importProgramCode(code){
  code = (code || '').trim();

  const short = code.match(/[?&]p=([0-9a-z]{4,16})\b/i)
    || (/^[0-9a-z]{4,16}$/i.test(code) && !/^FIT1/i.test(code) ? [null, code] : null);
  if(short){
    $('importModal').classList.remove('open');
    importProgramLink(short[1]);
    return;
  }

  if(code.includes('import=')){
    try{ code = decodeURIComponent(code.split('import=')[1].split('&')[0]); }catch(e){}
  }
  if(!code.startsWith('FIT1.')){
    appAlert(t('import.badLink'));
    return;
  }
  let prog;
  try{
    prog = JSON.parse(decodeURIComponent(escape(atob(code.slice(5)))));
  }catch(e){ appAlert(t('import.badCode')); return; }
  if(!prog || !prog.name || !normPlans(prog).some(pl => pl.exercises && pl.exercises.length)){
    appAlert(t('import.noProgramCode')); return;
  }
  prog.id = 'p' + Date.now();
  prog.stats = {completions: 0};
  prog.plans = normPlans(prog);
  sanitizeProgram(prog);        // код можно собрать руками, и собирают
  draft = prog;
  draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
  delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days;
  planIdx = 0;
  $('importModal').classList.remove('open');
  fillBuilder(t('import.reviewSave'));
}

/* ================= СЕРВЕРНАЯ ЧАСТЬ =================
   Приложение работает без сети и обязано продолжать: сервер тут ДОБАВЛЯЕТ, а не
   заменяет. Поэтому у каждого вызова есть запасной путь, а сам вызов короткий —
   если сервера нет (офлайн, открыли файлом, ещё не задеплоено), ждать его нечего.

   База по умолчанию — тот же адрес, откуда открыто приложение: функции лежат
   рядом со страницей (api/ в репозитории). */
const RUNTIME_CONFIG = window.FIT_TIMER_CONFIG || {};
const API_BASE = RUNTIME_CONFIG.apiBase
  ? String(RUNTIME_CONFIG.apiBase).replace(/\/$/, '')
  : (location.protocol.startsWith('http') ? '' : null);
const PUBLIC_APP_URL = RUNTIME_CONFIG.publicAppUrl
  ? String(RUNTIME_CONFIG.publicAppUrl).replace(/\/$/, '') + '/'
  : (location.origin + location.pathname.replace(/[^/]*$/, ''));   // /index.html → /
const API_WAIT = 7000;
/* Потолок длины адреса, который мы соглашаемся выдать человеку. Настоящий предел
   выше (хостинг отбивает около 14 КБ), но запас нужен: ссылку пересылают, к ней
   дописывают метки переходов, а мессенджеры её оборачивают. Всё, что не влезло,
   уходит не ссылкой, а кодом или файлом — см. exportProgram. */
const URL_SAFE = 1800;

async function apiFetch(path, opts){
  if(API_BASE === null) throw new Error('offline');
  const cfg = Object.assign({}, opts || {});
  const wait = Math.max(1000, Math.min(30000, +cfg.timeoutMs || API_WAIT));
  delete cfg.timeoutMs;
  const ctl = new AbortController();
  const t = setTimeout(()=> ctl.abort(), wait);
  try{
    // Ответы API краткоживущие и не должны кэшироваться браузером.
    const res = await fetch(API_BASE + path,
      Object.assign({signal: ctl.signal, cache: 'no-store'}, cfg));
    const data = await res.json().catch(()=> ({}));
    if(!res.ok){
      const err = new Error(data.error || ('http_' + res.status));
      err.code = data.error; err.status = res.status;
      throw err;
    }
    return data;
  } finally { clearTimeout(t); }
}
/* Последний ответ сервера — чтобы экран не был пустым, пока идёт новый.

   Показать вчерашние данные и через секунду заменить их свежими честнее, чем
   держать пустоту: человек видит содержимое сразу, а не «сломалось». Хранится в
   localStorage, потому что переживать перезапуск обязано, а ценности не имеет —
   пропало, значит просто подождём ответа, как раньше. */
function lastSeen(key, value){
  try{
    if(value === undefined){
      const raw = localStorage.getItem('seen_' + key);
      return raw ? JSON.parse(raw) : null;
    }
    localStorage.setItem('seen_' + key, JSON.stringify(value));
  }catch(e){}
  return null;
}

const apiPost = (path, body) => apiFetch(path, {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
});

/* ================= ТРЕНЕР И ЕГО ПОДОПЕЧНЫЕ =================
   Кабинет строится ДО бэкенда, потому что его задача — не хранить данные, а выяснить,
   пользуются ли тренеры каналом вообще. Поэтому v1 целиком локальная и держится на
   том, что в приложении уже работает: программа уезжает подопечному ссылкой FIT1, отчёт
   возвращается ссылкой FITR1. Ни аккаунта, ни регистрации, ни сети.

   Когда появится сервер, экраны останутся те же — поменяется только источник подопечных
   и способ доставки отчётов. Разбор — docs/trainer-ui.md. */

let trainer = null;    // {on, handle, links}
/* Подопечный: [{id, name, note, progs: [...]}]
   progs — программы, отправленные ЭТОМУ человеку, у каждой своя ссылка, свои
   отметки и свои занятия:
     {pid, name, sentAt, link:{id,key}, opens, firstOpen, reports:[], err, checkedAt}
   Раньше ссылка была одна на подопечного, и вторая отправка затирала первую вместе с
   её занятиями — тренер терял всё, что человек сделал по прошлому курсу. */
let clients = [];
let clientIdx = -1;    // какого подопечного открыли на scrClient
let coachPhotoDraft = null;

async function loadTrainer(){
  let localTrainer = null, localClients = [];
  try{ localTrainer = JSON.parse(await kvGet(pk('trainer'))) || null; }catch(e){}
  try{ localClients = JSON.parse(await kvGet(pk('clients'))) || []; }catch(e){}
  if(account && account.email){
    const rec = await readAccountBucket();
    if(!rec.bucket.trainer && localTrainer){
      rec.bucket.trainer = localTrainer;
      bumpAccountMeta(rec.bucket, 'trainer');
    }
    if(!rec.bucket.clients && Array.isArray(localClients) && localClients.length){
      rec.bucket.clients = localClients;
      bumpAccountMeta(rec.bucket, 'clients');
    }
    trainer = rec.bucket.trainer || null;
    clients = rec.bucket.clients || [];
    await writeAccountBucket(rec);
    // После миграции данные принадлежат аккаунту, а не активному профилю.
    await kvDel(pk('trainer'));
    await kvDel(pk('clients'));
  } else {
    trainer = localTrainer;
    clients = localClients;
  }
  if(!trainer) trainer = {on: false, handle: '', links: ''};
  if(!Array.isArray(clients)) clients = [];
  // Прежняя запись: одна программа прямо на подопечном. Переносим её в список, ничего
  // не теряя, — у тех, кто уже отправлял, занятия должны остаться на месте.
  let moved = false;
  clients.forEach(c => {
    if(Array.isArray(c.progs)) return;
    c.progs = (c.programId || c.link || c.sentAt) ? [{
      pid: c.programId || null, name: c.programName || '', sentAt: c.sentAt || null,
      link: c.link || null, opens: c.opens || 0, firstOpen: c.firstOpen || null,
      reports: c.reports || []
    }] : [];
    ['programId', 'programName', 'sentAt', 'link', 'opens', 'firstOpen', 'reports', 'err', 'checkedAt']
      .forEach(k => delete c[k]);
    moved = true;
  });
  if(moved) await saveClients();
}
async function saveTrainer(opts){
  if(account && account.email){
    const rec = await readAccountBucket();
    rec.bucket.trainer = trainer;
    if(!(opts && opts.remote)) bumpAccountMeta(rec.bucket, 'trainer');
    await writeAccountBucket(rec);
    if(!(opts && (opts.remote || opts.deferSync))) queueAccountSync();
  } else await kvSet(pk('trainer'), JSON.stringify(trainer));
}
async function saveClients(opts){
  if(account && account.email){
    const rec = await readAccountBucket();
    rec.bucket.clients = clients;
    if(!(opts && opts.remote)) bumpAccountMeta(rec.bucket, 'clients');
    await writeAccountBucket(rec);
    if(!(opts && opts.remote)) queueAccountSync();
  } else await kvSet(pk('clients'), JSON.stringify(clients));
}
// Режим считается включённым только вместе с ником: без ника подопечный не поймёт, от кого
// пришла программа, а «Отправить подопечному» в меню без адресата — пункт в никуда.
const trainerAccountReady = () => !!(account && account.email && account.syncToken && account.handle);
const trainerOn = () => !!(trainerAccountReady() && trainer && trainer.on && (trainer.handle || '').trim());
// ник приводим к одному виду: человек напишет и «@lena», и «lena», и «t.me/lena»
function normHandle(v){
  let h = String(v || '').trim().replace(/^https?:\/\//, '').replace(/^(t\.me|instagram\.com)\//, '');
  h = h.replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '');
  return h ? '@' + h : '';
}
function humanDay(iso){
  if(!iso) return '';
  try{ return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'}); }
  catch(e){ return iso; }
}
function daysSince(iso){
  if(!iso) return null;
  try{ return Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000); }catch(e){ return null; }
}
const lastReport = pr => (pr && pr.reports && pr.reports.length) ? pr.reports[pr.reports.length - 1] : null;
const clProgs = c => (c && Array.isArray(c.progs)) ? c.progs : [];
// Сводка по подопечному целиком: занятия по всем программам, самое свежее из них.
function clientSum(c){
  let n = 0, last = '', opens = 0, sent = 0;
  clProgs(c).forEach(pr => {
    const r = lastReport(pr);
    if(r){ n += r.n || 0; if((r.last || '') > last) last = r.last || ''; }
    opens += pr.opens || 0;
    if(pr.sentAt) sent++;
  });
  return {n, last, opens, sent, progs: clProgs(c).length};
}

/* ---- экран аккаунта: карточка «Тренер» ---- */
function renderTrainerCard(){
  syncDockTabs();
  renderCatalogRow();
  if(!$('tglTrainer')) return;
  const accountReady = trainerAccountReady();
  const modeOn = !!(accountReady && trainer && trainer.on);
  $('tglTrainer').classList.toggle('on', modeOn);
  setShown('coachFields', modeOn);
  setShown('coachDeleteBlock', modeOn);
  if(document.activeElement !== $('coachName'))   $('coachName').value   = (trainer && trainer.name) || '';
  const ph = trainer && trainer.photo;
  coachPhotoDraft = ph || '';
  $('coachPhotoPrev').innerHTML = ph ? `<img src="${esc(ph)}" alt="">` : icon('camera');
  if(document.activeElement !== $('coachLinks')){
    $('coachLinks').value = ((trainer && trainer.links) || '').replace(/^https?:\/\//i, '');
    $('coachLinksErr').textContent = '';
  }
  if(document.activeElement !== $('coachAbout'))  $('coachAbout').value  = (trainer && trainer.about) || '';
  if(document.activeElement !== $('coachYears'))  $('coachYears').value  = (trainer && trainer.years) || '';
  // Ник принадлежит аккаунту, и без аккаунта он уйдёт вместе с телефоном. Говорим
  // об этом там, где ник заводят, а не постфактум.
  setShown('coachNoAcc', !accountReady);
}

/* ---- экран «Подопечные» ---- */
function renderClientsSkeleton(){
  const box = $('clsList');
  if(!box) return;
  box.innerHTML = Array.from({length:3}, () =>
    '<div class="cl-row cl-row-skeleton" aria-hidden="true">'
      + '<div class="ua sk"></div>'
      + '<div class="ub"><i class="sk cl-sk-name"></i><i class="sk cl-sk-sub"></i></div>'
      + '<i class="sk cl-sk-state"></i>'
    + '</div>'
  ).join('');
}
async function refreshClientsScreen(){
  const box = $('clsList');
  if(box && !box.children.length) renderClientsSkeleton();
  await loadTrainer();
  renderClients();
  await pullAll();
}
function openClients(){
  if(show._last === 'scrTrainer'){ refreshClientsScreen(); return; }
  goTab('scrTrainer');
}
async function pullAll(){
  const list = clients.filter(c => clProgs(c).some(pr => pr.link && pr.link.id));
  if(!list.length) return;
  let any = false;
  for(const c of list){ if(await pullClient(c)) any = true; }
  if(show._last === 'scrTrainer'){ renderClients(); renderTrainerCard(); }
  if(any && show._last === 'scrClient') fillClient();
}
function clientDayWord(n){
  return appLocale === 'ru' ? plural(n, 'день', 'дня', 'дней') : (n === 1 ? 'day' : 'days');
}
function renderClients(){
  const n = clients.length;
  const live = clients.filter(c => clientSum(c).n > 0).length;
  const total = clients.reduce((a, c) => a + clientSum(c).n, 0);
  setShown('clsSumCard', n > 0);
  if(n){
    const sum = $('clsSum');
    sum.innerHTML = '';
    // Подпись под числом, а не после него: тогда она не зависит от числа и её не
    // надо согласовывать. Заодно все три видны сразу, а не через точку в строке.
    [[t('clients.statClients'), n], [t('clients.statActive'), live], [t('clients.statWorkouts'), total]].forEach(([label, v]) => {
      const el = document.createElement('div');
      el.className = 'cl-stat' + (v ? '' : ' zero');
      el.innerHTML = '<b></b><small></small>';
      el.querySelector('b').textContent = v;
      el.querySelector('small').textContent = label;
      sum.appendChild(el);
    });
  }
  const box = $('clsList');
  box.innerHTML = '';
  clients.forEach((c, i) => {
    const sum = clientSum(c);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cl-row';
    // Состояние говорится СЛОВОМ, а не одной приглушённостью: «ждёт» и «молчит 12 дней»
    // читаются с расстояния, а серый оттенок — нет.
    const newest = clProgs(c).slice().reverse().find(pr => pr.sentAt) || null;
    let state, tone = 'wait';
    if(sum.n > 0){
      const d = daysSince(sum.last);
      state = sum.n + ' ' + (appLocale === 'ru' ? plural(sum.n, t('clients.sessionOne'), t('clients.sessionFew'), t('clients.sessionMany')) : t(sum.n === 1 ? 'clients.sessionOne' : 'clients.sessionFew'));
      tone = (d != null && d > 10) ? 'cold' : 'ok';
      if(d != null && d > 10) state += ' · ' + t('clients.silent',{count:d,days:clientDayWord(d)});
    } else if(newest){
      const d = daysSince(newest.sentAt);
      // «Открыл, но не занимался» и «даже не открыл» — разные разговоры с человеком,
      // и тренеру нужно видеть, какой из них его.
      if(sum.opens > 0) state = t('clients.openedNoSessions');
      else state = d === 0 ? t('clients.sentToday') : t('clients.waiting',{count:d,days:clientDayWord(d)});
    } else state = t('clients.notSent');
    const av = esc(((c.name || '?').trim()[0] || '?').toUpperCase());
    row.innerHTML = `<div class="ua">${av}</div><div class="ub"><b></b><small></small></div>`
      + `<span class="cl-state ${tone}"></span>`;
    row.querySelector('b').textContent = c.name || t('profile.noName');
    row.querySelector('.ub small').textContent = !sum.progs ? t('clients.noPrograms')
      : sum.progs === 1 ? (newest ? (newest.name || t('clients.programFallback')) : t('clients.programFallback'))
      : t('clients.withPrograms',{count:sum.progs,programs:storeCountText(sum.progs,'program').replace(/^\d+\s+/,'')});
    row.querySelector('.cl-state').textContent = state;
    row.onclick = ()=> openClient(i);
    box.appendChild(row);
  });
  $('clsHint').textContent = n
    ? t('clients.hintHas')
    : t('clients.hintEmpty');
}

/* ---- карточка подопечного ---- */
function openClient(i){
  clientIdx = i;
  fillClient();                 // сначала показываем что есть — экран не ждёт сети
  show('scrClient');
  const c = curClient();
  if(c && clProgs(c).length) pullClient(c).then(got => {
    if(got && curClient() === c){ fillClient(); renderClients(); renderTrainerCard(); }
  });
}
const curClient = () => clients[clientIdx] || null;

function fillClient(){
  const c = curClient();
  if(!c) return;
  $('clTitle').textContent = c.name || t('clients.default');
  if(document.activeElement !== $('clName')) $('clName').value = c.name || '';
  if(document.activeElement !== $('clNote')) $('clNote').value = c.note || '';

  const box = $('clProgs');
  box.innerHTML = '';
  const list = clProgs(c);
  $('btnClSendTxt').textContent = list.length ? t('clients.sendMore') : t('clients.send');
  $('clSendHint').textContent = list.length
    ? t('clients.sendHintMany')
    : t('clients.sendHintFirst');

  if(!list.length){
    const empty = document.createElement('div');
    empty.className = 'card-block';
    empty.innerHTML = '<p class="field-hint">' + esc(t('clients.emptyCard')) + '</p>';
    box.appendChild(empty);
    return;
  }

  // Каждая программа — своя карточка со своими занятиями. Складывать занятия по
  // разным курсам в одну кучу нельзя: «двенадцать тренировок» ни о чём не говорит,
  // если восемь из них по программе, которую человек уже закончил.
  list.slice().reverse().forEach(pr => box.appendChild(progCard(c, pr)));
}

function progCard(c, pr){
  const el = document.createElement('div');
  el.className = 'card-block';
  const prog = pr.pid ? customPrograms.find(x => x.id === pr.pid) : null;

  const head = document.createElement('div');
  head.className = 'cb-head';
  head.innerHTML = '<p class="cb-title"></p>';
  head.querySelector('.cb-title').textContent = pr.name || t('clients.programFallback');
  el.appendChild(head);

  const bits = [];
  if(pr.sentAt) bits.push(t('clients.sentOn',{date:humanDay(pr.sentAt)}));
  if(pr.link) bits.push(pr.opens > 0
    ? (pr.firstOpen ? t('clients.openedOn',{date:humanDay((pr.firstOpen || '').slice(0, 10))}) : t('clients.opened'))
    : t('clients.notOpened'));
  if(pr.sentAt && !prog) bits.push(t('clients.localMissing'));
  const sub = document.createElement('p');
  sub.className = 'field-hint';
  sub.textContent = bits.join(' · ');
  el.appendChild(sub);

  // Ссылка, отправленная старой версией приложения, сервера не знает — отметок по
  // ней не будет никогда, и молчать об этом нельзя: тренер ждёт того, что не придёт.
  const stale = !!pr.sentAt && !pr.link;
  if(pr.err || stale){
    const st = document.createElement('p');
    st.className = 'field-hint warn';
    st.textContent = pr.err || t('clients.oldLink');
    el.appendChild(st);
  }

  renderReport(el, pr);

  const acts = document.createElement('div');
  acts.className = 'list-rows';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'choice ico-row';
  again.innerHTML = icon('share') + '<b>' + esc(t('clients.resend')) + '</b>';
  again.onclick = ()=> resendProgram(c, pr);
  acts.appendChild(again);
  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'link-btn';
  drop.textContent = t('clients.remove');
  drop.onclick = async ()=>{
    if(!(await appDialog(t('clients.removeQuestion',{name:pr.name}),
      {confirm: true, okText: t('clients.removeAction'), cancelText: t('common.keep')}))) return;
    c.progs = clProgs(c).filter(x => x !== pr);
    await saveClients();
    fillClient();
    renderClients();
  };
  acts.appendChild(drop);
  el.appendChild(acts);
  return el;
}

/* ОТЧЁТ ПО ОДНОЙ ПРОГРАММЕ. Что тренер должен видеть — разобрано в
   docs/trainer-ui.md: держит ли расписание, что именно делает, как растёт и не
   переделал ли программу. */
function renderReport(box, pr){
  const r = lastReport(pr);
  if(!r){
    const h = document.createElement('p');
    h.className = 'field-hint';
    h.textContent = t('report.none');
    box.appendChild(h);
    return;
  }

  const add = (cls, html) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html || '';
    box.appendChild(el);
    return el;
  };
  const line = (label, value, tone) => {
    const el = add('cl-grow', '<span></span><b></b>');
    el.querySelector('span').textContent = label;
    const b = el.querySelector('b');
    b.textContent = value;
    if(tone) b.className = tone;
  };
  // Было → стало. Старое перечёркнутым и приглушённым: стрелка между двумя
  // одинаково яркими числами заставляет разбираться, где какое.
  const change = (label, a, b2, tone) => {
    const el = add('cl-grow', '<span></span><b><s></s> <i></i></b>');
    el.querySelector('span').textContent = label;
    el.querySelector('s').textContent = a;
    el.querySelector('i').textContent = b2;
    if(tone) el.querySelector('b').className = tone;
  };

  // ---- сколько и когда ----
  const head = add('tr-sum cls-sum', '<b></b><small></small>');
  head.querySelector('b').textContent = r.n + ' ' + (appLocale === 'ru' ? plural(r.n,t('report.workoutOne'),t('report.workoutFew'),t('report.workoutMany')) : t(r.n === 1 ? 'report.workoutOne' : 'report.workoutFew'));
  const bits = [];
  if(r.last) bits.push(t('report.last',{date:humanDay(r.last)}));
  if(r.streak > 1) bits.push(t('report.streak',{count:r.streak}));
  head.querySelector('small').textContent = bits.join(' · ');

  /* ---- четыре недели ----
     Главное число не «сколько всего», а «сколько за последние недели»: двенадцать
     за полгода и двенадцать за месяц — два разных человека. */
  const log = r.log || [];
  if(log.length){
    const now = new Date();
    const weeks = [0, 0, 0, 0];
    log.forEach(x => {
      const d = daysSince(x.d);
      if(d != null && d >= 0 && d < 28) weeks[Math.floor(d / 7)]++;
    });
    const top = Math.max(1, ...weeks);
    add('cls-label', t('report.byWeeks'));
    const wrap = add('cl-weeks', '');
    const dm = t => t.getDate() + '.' + String(t.getMonth() + 1).padStart(2, '0');
    weeks.slice().reverse().forEach((n, i) => {
      const back = 3 - i;
      const to = new Date(now); to.setDate(to.getDate() - back * 7);
      const from = new Date(to); from.setDate(from.getDate() - 6);
      const w = document.createElement('div');
      w.className = 'cw' + (n ? ' on' : '') + (back === 0 ? ' now' : '');
      // Столбик, а не рамка с числом: провал должен читаться формой, а не чтением.
      w.innerHTML = `<b></b><span class="cw-bar"><i style="height:${Math.round(n / top * 100)}%"></i></span><small></small>`;
      w.querySelector('b').textContent = n;
      w.querySelector('small').textContent = back === 0 ? t('report.now') : dm(from);
      wrap.appendChild(w);
    });
  }

  /* ---- какие дни делает ---- */
  const plans = (r.plans || []).filter(x => x.days || x.n);
  if(plans.length > 1){
    add('cls-label', t('report.byDays'));
    plans.forEach(pl => line(pl.days ? pl.days.split('·').map(x=>canonicalLabel(x)).join('·') : (t('builder.variant') + ' ' + (pl.i + 1)),
      pl.n ? String(pl.n) : t('report.never'),
      pl.n ? '' : 'muted'));
  }

  /* ---- каждая тренировка отдельно ----
     Средняя длительность скрывает то, ради чего её смотрят: одна тренировка на
     двадцать минут и одна на час дают «сорок минут», которых не было ни разу. */
  if(log.length){
    add('cls-label', t('report.workouts'));
    const wd = null;
    // Сортируем сами: порядок записей в журнале — это порядок, в котором они легли,
    // а не порядок дней. Список тренировок, идущий вразнобой, нельзя читать вовсе.
    const sorted = log.slice().sort((a2, b2) => String(b2.d).localeCompare(String(a2.d)));
    sorted.slice(0, 8).forEach(x => {
      const pl = plans.find(y => y.i === x.p);
      let when = humanDay(x.d);
      try{ when += ', ' + new Intl.DateTimeFormat(localeTag(),{weekday:'short'}).format(new Date(x.d + 'T12:00:00')); }catch(e){}
      // Вариант в скобках, как у упражнений. Через точку он читался как второй день
      // («17 сентября, чт · Пн» выглядит ошибкой), хотя говорит другое: человек
      // сделал понедельничную тренировку в четверг, и это как раз стоит заметить.
      if(plans.length > 1 && pl && pl.days) when += ` (${pl.days})`;
      const mins = x.sec > 0 && x.sec < 6 * 3600 ? Math.round(x.sec / 60) + ' ' + t('store.minuteShort') : '';
      line(when, mins || '—', mins ? '' : 'muted');
    });
    if(log.length > 8) add('field-hint', '').textContent = t('report.moreEarlier',{count:log.length - 8});
  }

  /* ---- что подопечный поменял ---- */
  const d = r.diff || {};
  const changed = (d.add || []).length + (d.del || []).length + (d.mod || []).length;
  if(changed){
    add('cls-label warn', t('report.changed'));
    (d.del || []).forEach(n => line(n, t('report.removed'), 'warn'));
    (d.add || []).forEach(n => line(n, t('report.added'), 'warn'));
    (d.mod || []).forEach(m => change(m.n, m.a, m.b, 'warn'));
  }

  // ---- рост нагрузки ----
  const ex = r.ex || [];
  if(ex.length){
    add('cls-label', t('report.growth'));
    const many = plans.length > 1;
    ex.forEach(e => {
      const pl = plans.find(x => x.i === e.p);
      const tag = [e.w ? t('report.warmup') : '', many && pl && pl.days ? pl.days.split('·').map(x=>canonicalLabel(x)).join('·') : ''].filter(Boolean).join(' · ');
      change(e.n + (tag ? ` (${tag})` : ''), e.a, e.b, 'ok');
    });
  }

  add('field-hint', '').textContent = t('report.reportOn',{date:humanDay(r.at)}) + (pr.reports.length > 1 ? ' · ' + t('report.totalReports',{count:pr.reports.length}) : '');
}

/* ---- отправка программы подопечному ----
   Программа уходит короткой ссылкой через сервер: по ней видно, открыл ли её
   подопечный, а его отчёты приезжают сами. Штамп by внутри программы говорит приложению
   подопечного, от кого она пришла. */
async function sendProgramToClient(c, p){
  if(!p){ appAlert(t('clients.chooseProgram')); return; }

  // Уже отправляли эту же программу — обновляем ту запись, а не заводим вторую:
  // иначе у подопечного в карточке две одинаковые строки с разными половинами занятий.
  let pr = clProgs(c).find(x => x.pid === p.id);
  let link = null, failed = null;
  try{ link = await programLink(p, {to: c.name, existing: pr && pr.link ? pr.link : null}); }
  catch(e){ failed = e; }

  if(!link){ appAlert(linkFailNote(failed) + FILE_HINT); return; }

  if(!pr){
    pr = {pid: p.id, name: p.name, reports: []};
    c.progs = clProgs(c).concat([pr]);
  }
  pr.name = p.name;
  pr.sentAt = localISO(new Date());
  pr.link = {id: link.id, key: link.key};
  pr.opens = 0;
  pr.firstOpen = null;
  await saveClients();
  fillClient();
  renderClients();
  renderTrainerCard();

  await shareLink(link.url, c.name, p.name);
}

// Повторная отправка ТОЙ ЖЕ ссылки: отметки и занятия по ней остаются на месте.
async function resendProgram(c, pr){
  if(!pr.link || !pr.link.id){
    const p = pr.pid ? customPrograms.find(x => x.id === pr.pid) : null;
    if(p) return sendProgramToClient(c, p);
    appAlert(t('clients.programGone'));
    return;
  }
  await shareLink(PUBLIC_APP_URL + 'p/' + encodeURIComponent(pr.link.id),
                  c.name, pr.name);
}

async function shareLink(url, who, what){
  const text = t('clients.shareText',{program:what,forClient:who ? t('clients.forClient',{name:who}) : ''});
  if(navigator.share){
    try{ await navigator.share({title: 'Fit Timer', text, url}); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(url);
    appAlert(t('clients.linkCopied'));
  }catch(e){ appAlert(t('clients.copyLink'), {code: url}); }
}

/* Что стало со ссылкой: открытия и отчёты. Ключ лежит только в телефоне тренера —
   в саму ссылку он не попадает, иначе доступ к отчётам пересылался бы вместе с ней.

   Ошибку ЗАПОМИНАЕМ и показываем. Раньше здесь стоял пустой catch, и тренер видел
   ровно то же самое при «сети нет», «ссылка старая», «база не настроена» и «всё
   в порядке, но подопечный ещё не занимался»: пустую карточку. */
const PULL_ERR = {
  no_store: 'clients.pullNoStore',
  not_found: 'clients.pullNotFound',
  bad_key: 'clients.pullBadKey',
  rate_limited: 'clients.pullRate'
};
async function pullProgram(pr){
  if(!pr || !pr.link || !pr.link.id) return false;
  let d;
  try{
    // Ключ превращает тот же адрес из «отдай программу» в «отдай отметки и отчёты».
    d = await apiFetch(`/api/p/${encodeURIComponent(pr.link.id)}`, {headers:{'X-Fit-Link-Key':pr.link.key}});
  }catch(e){
    pr.err = t(PULL_ERR[e && e.code] || 'clients.pullOffline');
    return false;
  }
  pr.err = null;
  pr.checkedAt = Date.now();
  pr.opens = d.opens || 0;
  pr.firstOpen = d.firstOpen || null;
  // Сервер — источник правды по отчётам: перезаписываем целиком, а не дополняем,
  // иначе после переустановки у тренера задвоится всё, что уже было.
  pr.reports = (d.reports || []).map(r => ({at: (r.at || '').slice(0, 10), n: r.n, sec: r.sec,
    streak: r.streak, first: r.first, last: r.last, ex: r.ex || [],
    log: r.log || [], plans: r.plans || [], diff: r.diff || null}));
  return true;
}
// Обновить все программы подопечного разом.
async function pullClient(c){
  let any = false;
  for(const pr of clProgs(c)){ if(await pullProgram(pr)) any = true; }
  await saveClients();
  return any;
}

async function addClient(){
  const c = {id: 'c' + Date.now(), name: t('clients.defaultName',{count:clients.length + 1}), note: '',
             programId: null, programName: '', sentAt: null, reports: []};
  clients.push(c);
  await saveClients();
  return c;
}

// «Отправить подопечному» из меню программы: выбрать, кому, — и сразу отправить.
function pickClientFor(p){
  const box = $('pickClientList');
  box.innerHTML = '';
  $('pickClientModal').querySelector('.mini-label').textContent = t('clients.sendTo');
  clients.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = c.name || t('profile.noName');
    const has = clProgs(c).find(x => x.pid === p.id);
    const sum = clientSum(c);
    b.querySelector('small').textContent = has ? t('clients.alreadyHas')
      : !sum.progs ? t('clients.noPrograms').toLowerCase()
      : t('clients.alreadyCount',{count:sum.progs,programs:storeCountText(sum.progs,'program').replace(/^\d+\s+/,'')});
    b.onclick = async ()=>{
      $('pickClientModal').classList.remove('open');
      await sendProgramToClient(c, p);
    };
    box.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'choice add-row';
  add.innerHTML = icon('plus') + '<b>' + esc(t('clients.new')) + '</b>';
  add.onclick = async ()=>{
    $('pickClientModal').classList.remove('open');
    const c = await addClient();
    await sendProgramToClient(c, p);
  };
  box.appendChild(add);
  $('pickClientModal').classList.add('open');
}

/* ---- сторона подопечного: отчёт тренеру ----
   Отчёт собирает и отправляет САМ человек, кнопкой. Приложение не следит за ним и не
   отсылает ничего без ведома — иначе «тренер видит мои тренировки» превращается в то,
   на что никто не соглашался. */
/* ЧТО ТРЕНЕР ДОЛЖЕН ВИДЕТЬ.

   Первая версия отчёта показывала четыре упражнения из ПЕРВОГО варианта без
   разминки — то есть отвечала на вопрос «что-то растёт?» и ни на один из
   настоящих. Тренер ведёт человека и должен понимать четыре вещи:

   1. ДЕРЖИТ ЛИ РАСПИСАНИЕ. Не «сколько всего», а сколько за последние недели и
      попадает ли в назначенные дни. «12 тренировок» без срока не значит ничего.
   2. ЧТО ИМЕННО ДЕЛАЕТ. У программы бывает несколько вариантов по дням, и
      «делает только лёгкий, тяжёлый пропускает» — это разговор, который надо
      завести. Без разбивки по вариантам он невозможен.
   3. КАК РАСТЁТ. По ВСЕМ вариантам и с разминкой: разминка не растёт сама, но
      человек мог поменять её руками, и это тоже сведения.
   4. НЕ ПЕРЕДЕЛАЛ ЛИ ПРОГРАММУ. Упражнения можно править, выбрасывать и
      добавлять. Тренер, уверенный, что подопечный делает присланное, а тот выкинул
      половину, — худший вид слепоты, и раньше отчёт о ней молчал.

   Отчёт по-прежнему НАКОПИТЕЛЬНЫЙ: всё состояние целиком, поэтому неудачная
   отправка ничего не теряет. */

// Снимок присланного: с чем сравнивать правки подопечного. Снимается один раз, при
// получении программы, и живёт в ней же — сравнивать «сейчас» не с чем иначе.
function snapshotEx(p){
  const out = [];
  normPlans(p).forEach((pl, pi) => (pl.exercises || []).forEach(e => {
    out.push({p: pi, w: e.warmup ? 1 : 0, n: e.name || '',
              v: String(e.value == null ? '' : e.value),
              s: +e.sets || 1, kg: +e.weight || 0});
  }));
  return out;
}

// Ключ упражнения — вариант плюс название: одно и то же движение в разных днях
// это разные строки программы, и путать их нельзя.
const exKey = x => x.p + '|' + (x.n || '').trim().toLowerCase();
const exVal = x => x.v + (x.kg > 0 ? ' × ' + x.kg + ' ' + t('progress.kg') : '') + (x.s > 1 ? ' × ' + x.s + ' ' + t('report.setShort') : '');

function buildReport(p){
  const mine = stats.history.filter(h => h.pid === p.id);
  const me = users.find(u => u.id === currentUser);
  const plans = normPlans(p);

  // 1. Журнал: что и когда. Тридцати тренировок хватает на два месяца занятий —
  // дальше тренеру интересна не история, а то, что происходит сейчас.
  const log = mine.slice(-30).map(h => ({d: h.d, p: +h.plan || 0, sec: h.sec || 0}));

  // 2. Варианты: какие дни назначены и сколько раз каждый сделан.
  const planStats = plans.map((pl, i) => {
    const own = mine.filter(h => (+h.plan || 0) === i);
    // Сколько это занимает У ПОДОПЕЧНОГО. Тренер планировал одно, а человек делает
    // сорок минут вместо двадцати или пятнадцать вместо тридцати — и то и другое
    // повод поговорить, но узнать об этом иначе неоткуда.
    // Шесть часов — заведомо не тренировка, а забытый на ночь таймер или сбой.
    // Одна такая запись сдвигает среднее так, что число перестаёт что-то значить.
    const secs = own.map(h => +h.sec || 0).filter(x => x > 0 && x < 6 * 3600);
    return {
      i, days: (pl.days || []).join('·'), n: own.length,
      sec: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0
    };
  });

  /* 3. Рост — по всем вариантам, разминка помечена отдельно.

     Сравнивать СТРОКИ нельзя. При двойной прогрессии цель — одно число, а не
     диапазон, поэтому «12-15» превращается в «12» уже на нулевом шаге: ничего не
     выросло, а строки разные. В отчёт попадало «12-15 × 6 кг → 12 × 6 кг», и это
     читалось как падение нагрузки там, где её вообще не трогали.
     Сравниваем числа: выросла нижняя граница повторов или вес. */
  const ex = [];
  plans.forEach((pl, pi) => (pl.exercises || []).forEach(e => {
    if(ex.length >= 40) return;
    const was = String(e.value == null ? '' : e.value);
    const now = e.warmup ? was : progressedRepsRange(p.id, e, p);
    const kgWas = hasWeight(e) ? (+e.weight || 0) : 0;
    const kgNow = hasWeight(e) ? getExWeight(p.id, e, p) : 0;
    const grew = parseValue(now).min > parseValue(was).min || kgNow > kgWas;
    if(!grew) return;
    ex.push({p: pi, w: e.warmup ? 1 : 0, n: e.name || t('common.exerciseFallback'),
             a: was + (kgWas > 0 ? ` × ${fmtKg(kgWas)} ${t('progress.kg')}` : ''),
             b: now + (kgNow > 0 ? ` × ${fmtKg(kgNow)} ${t('progress.kg')}` : '')});
  }));

  // 4. Правки: что подопечный убрал, добавил и поменял руками.
  const diff = {add: [], del: [], mod: []};
  if(Array.isArray(p.origEx)){
    const now = snapshotEx(p);
    const byKey = new Map(now.map(x => [exKey(x), x]));
    const wasKeys = new Set();
    p.origEx.forEach(o => {
      wasKeys.add(exKey(o));
      const cur = byKey.get(exKey(o));
      if(!cur){ if(diff.del.length < 12) diff.del.push(o.n); return; }
      // Поправку от прогрессии за правку не считаем: она и так в списке роста.
      if(cur.v !== o.v || cur.s !== o.s || cur.kg !== o.kg){
        if(diff.mod.length < 12) diff.mod.push({n: o.n, a: exVal(o), b: exVal(cur)});
      }
    });
    now.forEach(x => { if(!wasKeys.has(exKey(x)) && diff.add.length < 12) diff.add.push(x.n); });
  }

  return {
    v: 2, by: p.by || '', who: (me && me.name) || '', name: p.name,
    n: mine.length,
    sec: mine.reduce((a, h) => a + (h.sec || 0), 0),
    first: mine.length ? mine[0].d : null,
    last: mine.length ? mine[mine.length - 1].d : null,
    streak: calcStreakInfo().n,
    log, plans: planStats, ex, diff
  };
}

/* Отчёт тренеру — сам, после каждой законченной тренировки.

   Отчёт НАКОПИТЕЛЬНЫЙ: в нём всегда всё состояние целиком, а не «что нового».
   Из этого следует главное свойство — неудачная отправка ничего не теряет.
   Нет сети, сервер не отвечает, человек тренировался в подвале — следующая
   отправка увезёт и это тоже. Поэтому здесь нет ни очереди, ни повторов, ни
   сообщений об ошибке: всё это чинило бы беду, которой нет.

   Молчим и при успехе: человек закончил тренировку и смотрит на свой результат,
   а не на отчётность. О том, что тренер видит занятия, сказано один раз — когда
   программа принималась (см. importProgramLink). */
function autoReport(p){
  if(!p || !p.src) return;
  let rep;
  try{ rep = buildReport(p); }catch(e){ return; }
  if(!rep.n) return;
  apiPost('/api/report', Object.assign({link: p.src, report: rep}, accountAuth())).catch(()=>{});
}

/* ================= КАТАЛОГ ПРОГРАММ =================
   Готовые программы от тренеров. Оплаты нет: программу добавляют в библиотеку,
   а не покупают, и слова «купить», «цена», «бесплатно» на экране не встречаются
   вовсе — иначе новичок читает «бесплатно» как «пока бесплатно».
   Каталог лежит прямо здесь; поле by — ник тренера, составившего программу.
   Каждая программа описана ровно тем же текстовым форматом, что и
   ответ нейросети, и при добавлении проходит через тот же parseProgramText —
   поэтому программа из каталога неотличима от собранной руками: те же круги,
   подходы, прогрессия с потолком и замены. Когда появится база, поменяется
   только источник каталога, а всё остальное останется как есть.
   Метка storeId у добавленной программы прежняя — библиотеки старых пользователей
   продолжают узнаваться. */
// Направление программы в каталоге — ЭТО ТА ЖЕ ЦЕЛЬ, которую спрашивают при
// создании программы: список один (OPT_GOAL), здесь к каждой цели добавлены
// только короткий ключ, значок и пара цветов обложки. Ключ уходит в поле cat
// у программы, поэтому менять его нельзя — поменяется расклад обложек.
// Цвета — все в фиолетовом семействе, чтобы витрина не рябила.
const STORE_LOOK = {
  'Похудеть':                   {id:'slim',   ico:'flame',    grad:['#F2617A','#8E33E0']},
  'Подтянуть всё тело':         {id:'tone',   ico:'dumbbell', grad:['#5B4BE8','#2E9BD6']},
  'Ягодицы и пресс':            {id:'glut',   ico:'weight',   grad:['#C13AA0','#6134DE']},
  'Плоский живот':              {id:'core',   ico:'target',   grad:['#7C56F5','#B44BDA']},
  'Сила и выносливость':        {id:'power',  ico:'bolt',     grad:['#6A3FE0','#C13AA0']},
  'Рельеф мышц':                {id:'relief', ico:'gem',      grad:['#8E33E0','#2E9BD6']},
  'Растяжка и гибкость':        {id:'flex',   ico:'moon',     grad:['#4FB3A0','#7C56F5']},
  'Осанка и спина':             {id:'back',   ico:'shield',   grad:['#4A7BE8','#8E33E0']},
  'Восстановиться после родов': {id:'post',   ico:'heart',    grad:['#E06A9E','#7C56F5']},
  'Кардио и энергия':           {id:'cardio', ico:'rocket',   grad:['#F2617A','#5B4BE8']}
};
const STORE_CATS = OPT_GOAL.map(name => Object.assign({name}, STORE_LOOK[name]));
const STORE_LEVELS = OPT_LEVEL;
const storeCat = id => STORE_CATS.find(c => c.id === id) || STORE_CATS[0];
function storeCountText(n, type){
  const forms = {
    program:['store.programOne','store.programFew','store.programMany'],
    set:['store.setOne','store.setFew','store.setMany'],
    round:['store.roundOne','store.roundFew','store.roundMany'],
    variant:['store.variantOne','store.variantFew','store.variantMany'],
    exercise:['store.exerciseOne','store.exerciseFew','store.exerciseMany']
  }[type];
  if(!forms) return String(n);
  const word = appLocale === 'ru'
    ? plural(n, t(forms[0]), t(forms[1]), t(forms[2]))
    : t(n === 1 ? forms[0] : forms[1]);
  return n + ' ' + word;
}
// Расклад обложки берём по месту программы ВНУТРИ её категории, а не по хешу
// названия: хеш легко кладёт двух соседей в один вариант, и рядом стоящие
// карточки выглядят близнецами. Порядковый номер такого не допускает.
function storeVariant(it){
  const n = storeAll().filter(x => x.cat === it.cat).findIndex(x => x.id === it.id);
  return (n < 0 ? 0 : n) % 3;
}

/* Тренеры каталога. Ник — ключ, по нему карточка находит человека. Фото пока нет ни
   у кого: `photo` останется пустым до реального наполнения, и тогда в попапе рисуется
   заглушка из набора иконок. Описание — обычный текст, в нём же могут быть контакты:
   ссылками ник специально не делаем, чтобы карточка каталога не уводила из приложения. */
/* Каталог — это зашитые программы ПЛЮС принятые с сервера. Серверная позиция
   складывается в том же виде (id, by, cat, level, min, name, gives, text), поэтому
   ни витрина, ни страница программы, ни добавление в библиотеку не знают, откуда
   она взялась, — и знать не должны. */
let storeServer = [];
/* Каталог живёт ТОЛЬКО в базе. Раньше десяток программ был вшит сюда и ехал в
   загрузке к каждому человеку, хотя нужен ровно однажды — чтобы витрине было чем
   открыться. Теперь стартовый набор заливается из админки (api/_seed.js), а
   приложение знает то, что пришло с сервера, плюс последний ответ на случай без
   сети. Каталога без сети у того, кто его ни разу не открывал, не будет — и это
   честно: пустая витрина лучше вечно устаревшей. */
const storeAll = () => storeServer;
let storeLoading = false;

async function catalogItemFull(it){
  const lang = appLocale === 'ru' ? 'ru' : 'en';
  const headers = {};
  if(it && it.pro){
    if(!account || !account.email || !account.syncToken) throw Object.assign(new Error('premium_required'),{code:'premium_required',status:402});
    const deviceId = await kvGet('deviceId');
    if(!deviceId) throw Object.assign(new Error('premium_required'),{code:'premium_required',status:402});
    headers['X-Fit-Email'] = account.email;
    headers['X-Fit-Device'] = deviceId;
    headers['X-Fit-Token'] = account.syncToken;
  }
  const d = await apiFetch('/api/catalog?item=' + encodeURIComponent(it.id) + '&lang=' + encodeURIComponent(lang), {headers});
  if(d && d.item && d.item.locked) throw Object.assign(new Error('premium_required'),{code:'premium_required',status:402});
  return d && d.item;
}

async function ensureCatalogBody(it){
  if(!it || !it.pro || it.text) return it;
  try{
    const full = await catalogItemFull(it);
    if(full) Object.assign(it, full, {locked:false});
    return it;
  }catch(e){
    if(e && e.code === 'premium_required'){
      await refreshServerSubscription(true);
    }
    throw e;
  }
}

async function loadStoreServer(){
  const locale = appLocale === 'ru' ? 'ru' : 'en';
  const cacheKey = 'catalog_' + locale;
  storeLoading = true;
  try{
    const d = await apiFetch('/api/catalog?lang=' + encodeURIComponent(locale));
    storeServer = Array.isArray(d.items) ? d.items.map(it => it && it.pro ? Object.assign({},it,{text:''}) : it) : [];
    lastSeen(cacheKey, storeServer);
  }catch(e){
    // Кэш тоже языковой: после переключения профиля русская витрина не должна
    // внезапно подменять английскую и наоборот.
    storeServer = lastSeen(cacheKey) || [];
    storeServer = storeServer.map(it => it && it.pro ? Object.assign({},it,{text:''}) : it);
  } finally { storeLoading = false; }
}


// Обложка рисуется, а не хранится: градиент, два мягких блика и крупная
// пиктограмма категории. Ни одного внешнего файла — офлайн витрина выглядит
// так же, как онлайн.
// Счётчик у идентификатора градиента. Одна и та же обложка стоит теперь в двух
// местах сразу (строка витрины и страница программы), и при одинаковых id браузер
// берёт ПЕРВОЕ определение в документе — то, что лежит в скрытом экране витрины.
// Обложка на странице программы из-за этого оставалась белой.
let storeUid = 0;
function storeCover(it, square){
  // Своя картинка вместо рисованной. Рисованная остаётся у всех, кто её не задал:
  // пустое место на витрине хуже, чем обложка по цели.
  if(it.cover){
    return `<div class="st-photo"${square ? ' data-square="1"' : ''}><img src="${esc(it.cover)}" alt=""></div>`;
  }
  const c = storeCat(it.cat);
  const g = c.grad;
  const uid = 'stg' + it.id.replace(/[^a-z0-9]/gi, '') + (square ? 'q' : '') + (++storeUid);
  // Цвет обложки задаёт категория — по нему витрина читается с одного взгляда.
  // Но тогда две программы одной категории подряд выглядят близнецами, поэтому
  // наклон градиента, места бликов и посадка пиктограммы разводятся по самой
  // программе: устойчивое число из её id, три готовых расклада.
  const v = storeVariant(it);
  const AX = [[0,0,1,1], [1,1,0,0], [0,0,1,.3]][v];
  const BL = [[52,26,96, 286,164,78], [270,14,88, 34,176,74], [30,152,92, 262,16,84]][v];
  const IC = [[200,34,3.6], [196,54,3.2], [206,24,3.9]][v];
  // квадратный вариант — для миниатюры в библиотеке: она обрезает картинку по
  // бокам, и вынесенная вправо пиктограмма из широкой обложки уезжала за край
  if(square) return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}" x1="${AX[0]}" y1="${AX[1]}" x2="${AX[2]}" y2="${AX[3]}">
        <stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/>
      </linearGradient>
      <radialGradient id="${uid}b"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#${uid})"/>
    <circle cx="34" cy="22" r="86" fill="url(#${uid}b)"/>
    <circle cx="176" cy="188" r="70" fill="url(#${uid}b)"/>
    <g transform="translate(58,58) scale(3.5)" opacity=".92" color="#ffffff" fill="none"
       stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[c.ico] || ''}</g>
  </svg>`;
  // берём разметку иконки, а не результат icon(): вложенный <svg> внутри <g> с
  // transform браузер размеряет по своим правилам и уносит его за пределы обложки.
  // ICONS[...] — это уже готовые фигуры в системе координат 24×24, их и масштабируем.
  const ico = ICONS[c.ico] || '';
  return `<svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}" x1="${AX[0]}" y1="${AX[1]}" x2="${AX[2]}" y2="${AX[3]}">
        <stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/>
      </linearGradient>
      <radialGradient id="${uid}b"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="320" height="170" fill="url(#${uid})"/>
    <circle cx="${BL[0]}" cy="${BL[1]}" r="${BL[2]}" fill="url(#${uid}b)"/>
    <circle cx="${BL[3]}" cy="${BL[4]}" r="${BL[5]}" fill="url(#${uid}b)"/>
    <g transform="translate(${IC[0]},${IC[1]}) scale(${IC[2]})" opacity=".9" color="#ffffff" fill="none"
       stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ico}</g>
  </svg>`;
}
// та же обложка, но как картинка для карточки в библиотеке: программа из каталога
// не должна выглядеть в списке безымянной гантелью
function storeCoverData(it){
  if(it.cover) return it.cover;
  // как отдельный документ SVG обязан объявить пространство имён: внутри HTML оно
  // подразумевается, а в data-URI без него картинка не грузится вовсе
  const svg = storeCover(it, true)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(/\s+/g, ' ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

let storeFilter = {q: '', cat: '', level: ''};
// уже добавлена: у программы из каталога остаётся метка storeId, поэтому
// повторный заход предлагает открыть, а не положить второй экземпляр.
// Имя поля storeId не трогаем — по нему узнаются библиотеки старых пользователей.
const storeOwned = id => customPrograms.find(p => p.storeId === id) || null;

// список для выбора одного варианта в своём попапе — вместо системной шторки select
// «Цель»/«Уровень» — подпись поля, а не значение из набора: в списке её не
// показываем, чтобы не выглядела как ещё один вариант выбора. Сброс — отдельной
// строкой и только когда правда есть что сбрасывать.
function openOptPicker(title, opts, cur, onPick){
  $('optTitle').textContent = title;
  const box = $('optList'); box.innerHTML = '';
  opts.forEach(([v, t]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt-row'; b.classList.toggle('act', v === cur);
    b.innerHTML = `<span></span><span class="or-check">${icon('check')}</span>`;
    b.querySelector('span').textContent = t;
    b.onclick = ()=>{ $('optModal').classList.remove('open'); onPick(v); };
    box.appendChild(b);
  });
  const reset = $('optReset');
  setShown(reset, cur !== '');
  reset.onclick = ()=>{ $('optModal').classList.remove('open'); onPick(''); };
  $('optModal').classList.add('open');
}

function renderStoreFilters(){
  const fill = (btnId, valId, chevId, ph, opts, cur, onPick) => {
    const cho = opts.find(([v]) => v === cur);
    $(valId).textContent = cho ? cho[1] : ph;
    $(btnId).classList.toggle('ph', !cho);
    $(chevId).innerHTML = icon('chevD');
    $(btnId).onclick = ()=> openOptPicker(ph, opts, cur, v => { onPick(v); renderStoreFilters(); renderStore(); });
  };
  // Подписи над списками убраны: первый пункт и есть подпись — «Цель», «Уровень».
  // Показываем только те цели, по которым в каталоге вообще что-то есть: пустой
  // пункт в списке — обещание, которого каталог не выполняет.
  const has = id => storeAll().some(x => x.cat === id);
  fill('storeCatBtn', 'storeCatVal', 'storeCatChev', t('ai.goal'),
    STORE_CATS.filter(c => has(c.id)).map(c => [c.id, canonicalLabel(c.name)]),
    storeFilter.cat, v => storeFilter.cat = v);
  fill('storeLevelBtn', 'storeLevelVal', 'storeLevelChev', t('ai.level'),
    STORE_LEVELS.map(l => [l, canonicalLabel(l)]),
    storeFilter.level, v => storeFilter.level = v);
}

function storeMatches(it){
  if(storeFilter.cat && it.cat !== storeFilter.cat) return false;
  if(storeFilter.level && it.level !== storeFilter.level) return false;
  const q = storeFilter.q.trim().toLowerCase();
  if(!q) return true;
  // ищем по названию — и по категории с ником тренера заодно: «пресс» человек
  // наберёт скорее, чем полное имя программы, а тренера ищут по нику
  return ((it.name || '') + ' ' + storeCat(it.cat).name + ' ' + canonicalLabel(storeCat(it.cat).name) + ' ' + (it.by || '')).toLowerCase().includes(q);
}

// «Премиум» и «Уже у вас» — одни и те же метки в списке и на странице программы.
// Раньше на странице «Премиум» был серой меткой в ряду фактов и с меткой на
// витрине не имел ничего общего, а «добавлено» показывалось галочкой в углу
// обложки — её читали как «выбрано».
function storeLabels(it, own){
  if(!it.pro && !own) return '';
  return `<div class="st-labels">` +
    (it.pro ? `<span class="st-tag pro">${icon('crown')}${esc(t('premium.title'))}</span>` : '') +
    (own ? `<span class="st-own">${icon('check')}${esc(t('store.alreadyOwned'))}</span>` : '') +
    `</div>`;
}

function renderStore(){
  const box = $('storeList');
  // Пока каталог едет и показывать нечего — заглушка строками той же формы.
  if(storeLoading && !storeServer.length){
    $('storeCount').textContent = '';
    // Форма строки та же, что у настоящей (.store-row), иначе появление данных
    // подвинет всё на экране — ровно то мигание, от которого заглушка и спасает.
    box.innerHTML = [0, 1, 2, 3].map(()=>
      '<article class="store-row"><div class="sr-cover"><span class="sk" style="display:block;width:100%;height:100%"></span></div>'
      + '<div class="sr-info"><span class="sk sk-line" style="display:block;width:72%"></span>'
      + '<span class="sk sk-line" style="display:block;width:46%"></span>'
      + '<span class="sk sk-line" style="display:block;width:58%"></span></div></article>').join('');
    return;
  }
  const list = storeAll().filter(storeMatches);
  $('storeCount').textContent = list.length
    ? storeCountText(list.length, 'program')
    : '';
  if(!list.length){
    box.innerHTML = '<div class="empty-state">' +
      `<span class="es-ico">${icon('sparkle')}</span>` +
      `<b>${esc(t('store.emptyTitle'))}</b>` +
      `<p>${esc(t('store.emptyText'))}</p>` +
      '</div>';
    return;
  }
  // Строка витрины отвечает на один вопрос — «стоит ли открыть»: обложка, название,
  // цель, минуты, уровень и тренер. Остальное (состав, расписание, описание) живёт
  // на странице программы.
  box.innerHTML = list.map(it => {
    const own = storeOwned(it.id);
    return `<article class="store-row" data-open="${it.id}">
      <div class="sr-cover">${storeCover(it, true)}</div>
      <div class="sr-info">
        <h3>${esc(it.name || t('store.untitled'))}</h3>
        <div class="sr-goal">${esc(canonicalLabel(storeCat(it.cat).name))}</div>
        <div class="sr-meta"><span>${it.min} ${esc(t('store.minuteShort'))}</span><span>${esc(canonicalLabel(it.level))}</span>${it.by ? `<span>${esc(it.by)}</span>` : ''}</div>
        ${storeLabels(it, own)}
      </div>
    </article>`;
  }).join('');
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = ()=> openStoreItem(b.dataset.open));
}

/* ---- страница программы каталога ---- */
let siItem = null;
// объём упражнения для превью. НЕ exSummary: тот смотрит в draft и подставил бы
// рабочий вес чужой программы — здесь нужен состав ровно такой, как в тексте.
function siBits(ex){
  const b = [];
  b.push(ex.type === 'time' ? `${parseValue(ex.value).min} ${t('store.secShort')}` : `${valueText(ex.value)} ${t('store.repShort')}`);
  const sets = Math.max(1, parseInt(ex.sets) || 1);
  if(sets > 1) b.push(storeCountText(sets, 'set'));
  if(+ex.weight > 0) b.push(`${fmtKg(ex.weight)} ${t('progress.kg')}`);
  if(ex.perSide) b.push(t('store.perSide'));
  return b;
}
async function openStoreItem(id){
  const it = storeAll().find(x => x.id === id);
  if(!it) return;
  if(it.pro && isPremium() && !it.text){
    try{ await ensureCatalogBody(it); }
    catch(e){
      if(e && e.code === 'premium_required'){ openPremium(); return; }
    }
  }
  siItem = it;
  const c = storeCat(it.cat);
  $('siCover').innerHTML = storeCover(it, true);
  $('siName').textContent = it.name || t('store.untitled');
  $('siGoal').textContent = canonicalLabel(c.name);
  $('siGives').textContent = it.gives || '';
  $('siNick').textContent = it.by || '';
  setShown('siBy', !!it.by);

  const {program} = parseProgramText(it.text);
  const plans = (program && program.plans) || [];
  const exs = plans.reduce((a, pl) => a.concat(pl.exercises || []), []);
  const rounds = (plans[0] && +plans[0].rounds) || 1;
  // Дни — СО ВСЕЙ программы, а не с первого варианта. У программы «Пн, Чт» плюс
  // «Вт, Пт» в шапке значилось «Пн, Чт», и выходило, что занимаются два раза.
  const days = (program && program.rotate)
    ? '' : DAYS.filter(d => plans.some(pl => (pl.days || []).includes(d))).join(', ');

  const facts = $('siFacts'); facts.innerHTML = '';
  const fact = (txt, cls) => {
    if(!txt) return;
    const el = document.createElement('span');
    if(cls) el.className = cls;
    el.textContent = txt;
    facts.appendChild(el);
  };
  fact(canonicalLabel(it.level));
  fact(`${it.min} ${t('store.minuteShort')}`);
  if(rounds > 1) fact(storeCountText(rounds, 'round'));
  if(days) fact(days.split(',').map(x => canonicalLabel(x.trim())).join(', '));
  if(plans.length > 1){
    fact(program.rotate
      ? `${storeCountText(plans.length, 'variant')} ${t('store.inSequence')}`
      : storeCountText(plans.length, 'variant'));
  }

  const own = storeOwned(it.id);
  $('siLabels').innerHTML = storeLabels(it, own);

  // При нескольких вариантах в заголовке — число ВАРИАНТОВ, а не сумма упражнений:
  // сумма читалась как «столько делают за раз», а сколько в каждом — написано на
  // самом варианте.
  $('siCount').textContent = plans.length > 1
    ? storeCountText(plans.length, 'variant')
    : storeCountText(exs.length, 'exercise');
  // Состав премиум-программы — часть подписки: без неё показываем не пустоту и не
  // отказ, а что именно там лежит. Нажатие открывает витрину подписки.
  const locked = !!it.pro && !isPremium();
  setShown('siList', !locked);
  setShown('siLock', locked);
  if(locked){
    $('siLockTxt').textContent =
      t('store.lockedText',{count:(it.exCount||exs.length),exercises:appLocale === 'ru' ? plural((it.exCount||exs.length),t('store.exerciseOne'),t('store.exerciseFew'),t('store.exerciseMany')) : ((it.exCount||exs.length) === 1 ? t('store.exerciseOne') : t('store.exerciseFew'))});
  }
  /* Состав — ПО ВАРИАНТАМ, а не одним списком.

     Одним списком он врал в трёх местах сразу: упражнения разных дней шли подряд
     и выглядели как одна тренировка, сквозная нумерация давала «12 упражнений»
     там, где за раз делают четыре, а разминка, которая есть в каждом варианте,
     повторялась столько раз, сколько вариантов, — и это читалось как ошибка в
     программе. Человек смотрит сюда, чтобы понять, во что ввязывается, и понимать
     он должен ОДНУ тренировку, а не сумму всех.

     Вкладок здесь нет намеренно, хотя в редакторе они есть: там человек правит
     один вариант и остальные ему мешают, а здесь он ВЫБИРАЕТ — и половина
     состава, спрятанная за вкладкой, ровно то, чего не хватает для выбора. */
  const box = $('siList'); box.innerHTML = '';
  if(!locked) plans.forEach((pl, pi) => {
    if(plans.length > 1){
      const head = document.createElement('p');
      head.className = 'si-plan';
      const list = (pl.days || []).join(', ');
      head.textContent = (program.rotate || !list) ? `${t('builder.variant')} ${pi + 1}` : list.split(',').map(x => canonicalLabel(x.trim())).join(', ');
      const n = (pl.exercises || []).length;
      const sub = document.createElement('span');
      sub.textContent = storeCountText(n, 'exercise') + (+pl.rounds > 1 ? ` · ${storeCountText(+pl.rounds, 'round')}` : '');
      head.appendChild(sub);
      box.appendChild(head);
    }
    // Номера СВОИ у каждого варианта: сквозные говорили бы, что за одну
    // тренировку делают двенадцать упражнений.
    const list = sortWarmFirst((pl.exercises || []).slice());
    list.forEach((ex, i) => {
      const row = document.createElement('div');
      row.className = 'ex-row static' + (ex.warmup ? ' warm' : '');
      const before = list.slice(0, i).filter(e => !e.warmup).length;
      row.innerHTML =
        `<div class="ex-thumb">${ex.warmup ? icon('flame') : (before + 1)}</div>` +
        `<div class="ex-info"><b></b><div class="ex-meta">` +
        (ex.warmup ? `<span class="wm">${esc(t('store.warmup'))}</span>` : '') +
        siBits(ex).map(t => `<span>${t}</span>`).join('') +
        (progShort(ex) ? `<span class="grow">${progShort(ex)}</span>` : '') +
        `</div></div>`;
      row.querySelector('b').textContent = (ex.name || '').trim() || t('store.untitled');
      // Название — ключ к фото: карта фото приходит отдельным запросом, и связывать
      // её с рядами надо по тому же, по чему она собрана на сервере.
      row.dataset.ex = (ex.name || '').trim();
      box.appendChild(row);
    });
  });

  $('siBuy').textContent = own ? t('store.open') : t('store.addMine');
  show('scrStoreItem');
  window.scrollTo(0, 0);
  if(!locked) siPaintMedia(it);
}

/* Фото упражнений на странице программы.

   В списке каталога их нет намеренно — тридцать программ по полмегабайта картинок
   это пятнадцать мегабайт на открытие витрины, где у программы одна строка. Но на
   странице программы они обязательны: по фото и понятно, что за движение, а без
   них состав читается как список слов.

   Поэтому отдельным запросом и ПОСЛЕ отрисовки: страница открывается сразу, фото
   доезжают через мгновение. Ждать их, чтобы показать текст, значит показывать
   пустой экран. Карта кладётся на саму позицию — второй заход по той же программе
   уже не спрашивает сервер. */
async function siPaintMedia(it){
  if(!(it.hasMedia || it.media)) return;
  let media = it.media;
  if(!media){
    try{ media = (await catalogItemFull(it)).media; }
    catch(e){ return; }            // без фото страница остаётся рабочей
    it.media = media || {};
  }
  if(!media) return;
  // Пока фото ехали, человек мог уйти на другую программу. Рисуем только если
  // открыта всё та же.
  if(!siItem || siItem.id !== it.id) return;
  $('siList').querySelectorAll('.ex-row').forEach(row => {
    const pic = media[row.dataset.ex || ''];
    if(!pic) return;
    const thumb = row.querySelector('.ex-thumb');
    if(thumb) thumb.innerHTML = `<img src="${esc(pic)}" alt="">`;
  });
}
$('siLock').onclick = openPremium;
$('siBy').onclick = ()=> siItem && openTrainer(siItem.by);
$('siBuy').onclick = ()=> siItem && addStoreItem(siItem.id);
$('siBackTop').onclick = ()=> goBackTo('scrStore');

async function addStoreItem(id){
  const it = storeAll().find(x => x.id === id);
  if(!it) return;
  const own = storeOwned(id);
  if(own){
    // уже добавлена — открываем экран старта. Каталог не корневой раздел, поэтому
    // «назад» с него сам не настроится: возвращаем туда, откуда пришли в каталог
    startFrom = storeFrom;
    openStart(own);
    return;
  }
  // Локальная проверка — только UX. Сам текст Premium-программы всё равно
  // выдаёт только сервер после проверки аккаунта и подписки.
  if(it.pro && !isPremium()){ openPremium(); return; }
  if(it.pro && !it.text){
    try{ await ensureCatalogBody(it); }
    catch(e){ openPremium(); return; }
  }

  const {program, errors} = parseProgramText(it.text);
  if(errors.length || !program.plans.length){
    appAlert(t('store.addFailed'));
    return;
  }
  program.id = 'p' + Date.now();
  program.stats = {completions: 0};
  // После добавления это обычная личная одноязычная копия. Язык нужен ИИ-правкам,
  // чтобы они не переписали английскую программу на язык текущего интерфейса.
  program.locale = (it.locale === 'ru' || it.locale === 'en') ? it.locale : (appLocale === 'ru' ? 'ru' : 'en');
  // Фото упражнений в списке каталога не лежат (иначе витрина весила бы мегабайты).
  // Забираем их сейчас — в момент, когда программа становится своей.
  if(it.hasMedia || it.media){
    let media = it.media;
    if(!media){
      try{ media = (await apiFetch('/api/catalog?item=' + encodeURIComponent(it.id) + '&lang=' + encodeURIComponent(appLocale === 'ru' ? 'ru' : 'en'))).item.media; }
      catch(e){ media = null; }        // без фото программа всё равно рабочая
    }
    applyMedia(program, media);
  }
  if(it.cover) program.cover = it.cover;
  program.storeId = it.id;             // метка каталога: по ней узнаём, что уже добавлено
  program.cover = storeCoverData(it);
  customPrograms.push(program);
  await savePrograms();
  trackProductEvent('program_added').catch(()=>{});
  renderMine();
  renderStore();                        // в списке у программы появляется метка «Уже у вас»
  // Уходить отсюда на витрину НЕЛЬЗЯ: возврат по истории асинхронный, и popstate
  // приходит уже после открытия попапа — а обработчик popstate закрывает верхний
  // попап. Остаёмся на странице программы, кнопка превращается в «Открыть».
  if(siItem && siItem.id === id){
    $('siBuy').textContent = t('store.open');
    // метку «Уже у вас» ставим тут же: уходить с экрана после добавления нельзя
    // (возврат по истории асинхронный и закрыл бы только что открытый попап)
    $('siLabels').innerHTML = storeLabels(siItem, true);
  }
  renderToday();
  /* Про дни здесь БОЛЬШЕ НЕ СПРАШИВАЕМ. Дни у программы из каталога уже есть — они
     записаны в её тексте, — и попап предлагал переделать их человеку, который
     секунду назад решал совсем другой вопрос: брать программу или нет. Захочет
     иначе — поменяет в самой программе, туда за этим и ходят. */
  appAlert(t('store.added',{name:it.name || t('store.untitled')}));
}

// откуда пришли в каталог: с «Сегодня» или из «Тренировок». Кнопка «назад»
// должна возвращать туда же, а не всегда на главную
let storeFrom = 'scrMenu';
// Карточка тренера. Ник может не найтись в справочнике — тогда показываем сам ник и
// честную строку вместо выдуманного описания, а не пустой попап.
/* Страница тренера. Всё знает сервер: и тех, чьи программы в каталоге, и тех, кто
   прислал программу ссылкой. Что знаем — показываем, чего не знаем — не выдумываем. */
let tpFrom = 'scrMenu';

function openTrainer(nick){
  if(!nick) return;
  tpFrom = show._last;
  /* Сразу рисуем виденное в прошлый раз. Если человека видим впервые — заглушку:
     пустой экран, который через секунду наполняется, читается как сбой, а смена
     одной раскладки на другую — как мигание. */
  const seen = lastSeen('tr_' + nick);
  if(seen) fillTrainerPage(nick, seen);
  else skeletonTrainer(nick);
  show('scrTrainerPage');
  apiFetch('/api/trainer/' + encodeURIComponent(nick)).then(d => {
    const trainerData = Object.assign({}, d, {
      programs: Math.max(d.programs || 0, storeAll().filter(x => x.by === nick).length)
    });
    lastSeen('tr_' + nick, trainerData);
    if(show._last === 'scrTrainerPage') fillTrainerPage(nick, trainerData);
  }).catch(()=>{});
}

// Заглушка страницы тренера: та же форма, что и настоящая, — фото, имя, ник,
// три числа и ссылка. Поэтому появление данных не двигает ни одну строку.
function skeletonTrainer(nick){
  $('tpPhoto').innerHTML = '<span class="sk" style="width:100%;height:100%;border-radius:50%"></span>';
  $('tpName').textContent = nick.replace(/^@/, '');
  $('tpNick').textContent = nick;
  setShown('tpAbout', true);
  $('tpAbout').innerHTML = '<span class="sk sk-line" style="display:block;width:92%"></span>'
    + '<span class="sk sk-line" style="display:block;width:64%"></span>';
  setShown('tpStatsCard', true);
  $('tpStats').innerHTML = [0, 1, 2].map(()=>
    '<div class="tp-stat"><span class="sk" style="width:34px;height:20px"></span>'
    + '<span class="sk sk-line" style="width:56px;margin:4px 0 0"></span></div>').join('');
  setShown('tpLinkCard', false);
}

function fillTrainerPage(nick, trainerData){
  trainerData = trainerData || {};
  $('tpPhoto').innerHTML = trainerData.photo ? `<img src="${esc(trainerData.photo)}" alt="">` : icon('user');
  $('tpName').textContent = trainerData.name || nick.replace(/^@/, '');
  $('tpNick').textContent = nick;
  const about = trainerData.about || '';
  setShown('tpAbout', !!about);
  $('tpAbout').textContent = about;   // textContent затирает и разметку заглушки

  // Три числа, и каждое показывается, только если оно есть. «0 программ» и
  // «стаж не указан» доверия не добавляют, а место занимают.
  const cells = [];
  if(trainerData.years != null && trainerData.years > 0){
    cells.push([trainerData.years, appLocale === 'ru'
      ? plural(trainerData.years, t('trainer.experienceOne'), t('trainer.experienceFew'), t('trainer.experienceMany'))
      : t(trainerData.years === 1 ? 'trainer.experienceOne' : 'trainer.experienceFew')]);
  }
  if(trainerData.programs > 0){
    cells.push([trainerData.programs, appLocale === 'ru'
      ? plural(trainerData.programs, t('trainer.programOne'), t('trainer.programFew'), t('trainer.programMany'))
      : t(trainerData.programs === 1 ? 'trainer.programOne' : 'trainer.programFew')]);
  }
  if(trainerData.opens > 0){
    cells.push([trainerData.opens, t(trainerData.opens === 1 ? 'trainer.opensOne' : 'trainer.opensMany')]);
  }
  if(trainerData.since){
    const d = daysSince((trainerData.since || '').slice(0, 10));
    if(d != null){
      const m = Math.floor(d / 30);
      cells.push(m >= 1
        ? [m, t(m === 1 ? 'trainer.withUsMonth' : 'trainer.withUsMonths')]
        : [Math.max(1, d), t(Math.max(1, d) === 1 ? 'trainer.withUsDay' : 'trainer.withUsDays')]);
    }
  }
  setShown('tpStatsCard', cells.length > 0);
  $('tpStats').innerHTML = '';
  cells.forEach(([n, label]) => {
    const el = document.createElement('div');
    el.className = 'tp-stat';
    el.innerHTML = '<b></b><small></small>';
    el.querySelector('b').textContent = n;
    el.querySelector('small').textContent = label;
    $('tpStats').appendChild(el);
  });

  const link = (trainerData.links || '').trim();
  setShown('tpLinkCard', !!link);
  if(link){
    $('tpLink').href = /^https?:/.test(link) ? link : 'https://' + link;
    $('tpLinkTxt').textContent = link.replace(/^https?:\/\//, '');
  }
}

/* ПРЕДЛОЖИТЬ В КАТАЛОГ */
let pubProg = null;
let pubFrom = 'scrPrograms';
let pubDraft = {cat: '', level: '', gives: ''};

// Минуты для витрины. Точность здесь не нужна и невозможна — человек читает это
// как «влезет ли в обед», а не как обещание. Считаем грубо и честно округляем.
function estimateMinutes(p){
  let sec = 0;
  const plans = normPlans(p);
  const pl = plans[0] || {exercises: []};
  (pl.exercises || []).forEach(ex => {
    const sets = Math.max(1, +ex.sets || 1);
    const one = ex.type === 'time' ? (+parseValue(ex.value).max || 30)
                                   : (parseValue(ex.value).max || 12) * 3;
    sec += sets * one + (sets - 1) * (+ex.rest || 30) + exRestAfter(ex);
  });
  const rounds = Math.max(1, +pl.rounds || 1);
  sec = sec * rounds + (rounds - 1) * (+pl.roundRest || 60);
  return Math.max(1, Math.round(sec / 60));
}

function pubLabel(status){
  const item = {
    pending:  ['publish.pending', 'wait'],
    approved: ['publish.approved', 'ok'],
    rejected: ['publish.rejected', 'cold'],
    gone:     ['publish.gone', 'cold']
  }[status] || ['publish.pending', 'wait'];
  return [t(item[0]), item[1]];
}
const pubbed = () => customPrograms.filter(p => p.pub && p.pub.id);

function openMyCatalog(){
  renderMyCatalog();
  show('scrMyCatalog');
  refreshAllPubStatus();
}
function renderMyCatalog(){
  const box = $('mcList');
  box.innerHTML = '';
  const list = pubbed();
  list.forEach(p => {
    const [label, tone] = pubLabel(p.pub.status);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cl-row';
    const ex = (normPlans(p)[0].exercises || []).length;
    row.innerHTML = `<div class="ua">${icon('crown')}</div>`
      + `<div class="ub"><b></b><small></small></div><span class="cl-state ${tone}"></span>`;
    row.querySelector('b').textContent = p.name;
    row.querySelector('.ub small').textContent =
      storeCountText(ex, 'exercise');
    row.querySelector('.cl-state').textContent = label;
    row.onclick = ()=> openPublish(p);
    box.appendChild(row);
  });
  $('mcHint').textContent = list.length
    ? t('publish.listHint')
    : t('publish.emptyHint');
}
// Статусы всех заявок разом: по одной на программу — это столько путей до сервера,
// сколько программ.
async function refreshAllPubStatus(){
  const list = pubbed();
  if(!list.length) return;
  try{
    const d = await apiFetch('/api/catalog?status=' + encodeURIComponent(list.map(p => p.pub.id).join(',')));
    let ch = false;
    list.forEach(p => {
      const st = d.status && d.status[p.pub.id];
      if(st && st !== p.pub.status){ p.pub.status = st; ch = true; }
    });
    if(ch){
      await savePrograms();
      if(show._last === 'scrMyCatalog') renderMyCatalog();
      if(show._last === 'scrPublish') fillPublish();
      renderTrainerCard();
    }
  }catch(e){}
}

function openPublish(p){
  pubProg = p;
  // Возврат туда, откуда пришли: из списка, со страницы программы или из «В каталоге».
  pubFrom = ['scrMyCatalog', 'scrStart', 'scrPrograms'].includes(show._last) ? show._last : 'scrPrograms';
  pubDraft = Object.assign({cat: '', level: '', gives: ''}, p.pub && p.pub.draft || {});
  fillPublish();
  show('scrPublish');
  refreshPubStatus();
}

function fillPublish(){
  const p = pubProg;
  if(!p) return;
  const ex = (normPlans(p)[0].exercises || []).length;
  $('pubName').textContent = p.name;
  $('pubSub').textContent = t('publish.approx',{count:ex,exercises:storeCountText(ex,'exercise').replace(/^\d+\s+/,''),minutes:estimateMinutes(p)});

  const st = p.pub && p.pub.status;
  const shown = st ? t({
    pending:'publish.pendingText',
    approved:'publish.approvedText',
    rejected:'publish.rejectedText',
    gone:'publish.goneText'
  }[st] || 'publish.pendingText') : '';
  $('pubState').textContent = shown;
  $('pubState').classList.toggle('warn', st === 'rejected' || st === 'gone');
  setShown('pubForm', st !== 'pending' && st !== 'approved');
  setShown($('btnPublish').parentElement, st !== 'pending' && st !== 'approved');

  const fill = (btnId, valId, chevId, ph, opts, cur, onPick) => {
    const cho = opts.find(([v]) => v === cur);
    $(valId).textContent = cho ? cho[1] : ph;
    $(btnId).classList.toggle('ph', !cho);
    $(chevId).innerHTML = icon('chevD');
    $(btnId).onclick = ()=> openOptPicker(ph, opts, cur, v => { onPick(v); fillPublish(); });
  };
  fill('pubCatBtn', 'pubCatVal', 'pubCatChev', t('ai.goal'),
       OPT_GOAL.map(g => [g, canonicalLabel(g)]), pubDraft.cat, v => pubDraft.cat = v);
  fill('pubLevelBtn', 'pubLevelVal', 'pubLevelChev', t('ai.level'),
       OPT_LEVEL.map(l => [l, canonicalLabel(l)]), pubDraft.level, v => pubDraft.level = v);
  if(document.activeElement !== $('pubGives')) $('pubGives').value = pubDraft.gives || '';
}

// Что стало с заявкой. Спрашиваем сервер, а не помним своё: «на проверке» навсегда
// — это ровно то, из-за чего человек жмёт кнопку повторно.
async function refreshPubStatus(){
  const p = pubProg;
  if(!p || !p.pub || !p.pub.id) return;
  try{
    const d = await apiFetch('/api/catalog?status=' + encodeURIComponent(p.pub.id));
    const st = d.status && d.status[p.pub.id];
    if(st && st !== p.pub.status){
      p.pub.status = st;
      await savePrograms();
      if(show._last === 'scrPublish') fillPublish();
    }
  }catch(e){}
}

// Каталог отдаёт обложку прямо в списке программ, поэтому держим её лёгкой.
async function catalogCoverData(src){
  if(!src) return null;
  const raw = String(src);
  if(raw.length < 88000) return raw;
  return await new Promise(resolve => {
    const img = new Image();
    img.onload = ()=>{
      let maxSide = 480, quality = .78;
      const render = ()=>{
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const cnv = document.createElement('canvas');
        cnv.width = Math.max(1, Math.round(img.width * k));
        cnv.height = Math.max(1, Math.round(img.height * k));
        const ctx = cnv.getContext('2d');
        ctx.drawImage(img, 0, 0, cnv.width, cnv.height);
        let out = '';
        try{ out = cnv.toDataURL('image/jpeg', quality); }catch(_){}
        if(out && out.length < 88000) return resolve(out);
        if(quality > .52){ quality -= .08; return render(); }
        if(maxSide > 300){ maxSide -= 60; quality = .72; return render(); }
        resolve(out && out.length < 90000 ? out : null);
      };
      render();
    };
    img.onerror = ()=> resolve(null);
    img.src = raw;
  });
}

async function doPublish(){
  const p = pubProg;
  if(!p) return;
  pubDraft.gives = clampText($('pubGives').value, LIM.gives);
  const miss = [];
  if(!pubDraft.cat) miss.push(t('publish.needGoal'));
  if(!pubDraft.level) miss.push(t('publish.needLevel'));
  if(pubDraft.gives.length < 20) miss.push(t('publish.needGives'));
  const ex = (normPlans(p)[0].exercises || []).length;
  if(ex < 3) miss.push(t('publish.needExercises'));
  if(miss.length){
    appAlert(t('publish.missing',{items:miss.join(', ')}));
    return;
  }
  try{
    const catalogCover = await catalogCoverData(p.cover);
    const r = await apiPost('/api/catalog', {
      by: normHandle(trainer.handle),
      trainerKey: trainer.key || '',
      item: {
        sourceLocale: (p.locale === 'ru' || p.locale === 'en') ? p.locale : (appLocale === 'ru' ? 'ru' : 'en'),
        name: p.name, gives: pubDraft.gives,
        // cat — КЛЮЧ цели («cardio»), а не её название: по нему подбирается обложка
        // и работают фильтры витрины. С названием обложка бралась первая попавшаяся.
        cat: (STORE_LOOK[pubDraft.cat] || {}).id || '',
        level: pubDraft.level,
        min: estimateMinutes(p), exCount: ex, text: programToText(p),
        // Своя обложка, если тренер её задал. Рисованная по цели остаётся запасной.
        cover: catalogCover,
        // Фото упражнений — отдельной картой: в тексте программы им места нет.
        media: programMedia(p)
      }
    });
    p.pub = {id: r.id, status: r.status, draft: pubDraft};
    await savePrograms();
    fillPublish();
    renderCatalogRow();
    appAlert(t('publish.sent'));
  }catch(e){
    const why = {
      no_trainer: t('publish.errNoTrainer'),
      not_yours: t('publish.errNotYours'),
      banned: t('publish.errBanned'),
      too_many_today: t('publish.errTooMany'),
      already_sent: t('publish.errAlready'),
      no_store: t('publish.errStore'),
      bad_item: t('publish.errBad',{items:((e.miss || []).join(', ') || t('publish.checkFields'))})
    }[e && e.code];
    appAlert(why || t('publish.errNetwork'));
  }
}

function openStore(from){
  storeFrom = from || 'scrMenu';
  if(!storeServer.length) storeServer = lastSeen('catalog_' + (appLocale === 'ru' ? 'ru' : 'en')) || [];
  // Свежие позиции подтягиваем при входе и дорисовываем, когда придут: витрина
  // не должна ждать сеть, чтобы показать то, что уже есть.
  loadStoreServer().then(()=>{ if(show._last === 'scrStore'){ renderStoreFilters(); renderStore(); } });
  storeFilter = {q: '', cat: '', level: ''};
  $('storeQuery').value = '';
  setShown('storeClear', false);
  renderStoreFilters();
  renderStore();
  show('scrStore', true);
  window.scrollTo(0, 0);
}

// Заявки живут рядом с профилем тренера: это его публикации и модерация, а не
// обычный список тренировок. Строка сразу показывает сводку статусов.
function renderCatalogRow(){
  if(!$('btnMyCatalog')) return;
  const n = storeAll().length;
  $('storeRowSub').textContent = n
    ? t('catalog.fromTrainers',{count:n,programs:storeCountText(n,'program').replace(/^\d+\s+/,'')})
    : t('catalog.trainerWorkouts');
  // Строку заявок показываем, только когда заявки есть: «ничего не отправлено»
  // сообщает ровно то, что строку не надо было показывать.
  const pub = pubbed();
  setShown('btnMyCatalog', trainerOn() && pub.length > 0);
  if(!pub.length) return;
  const byStatus = st => pub.filter(p => p.pub.status === st).length;
  $('coachCatSub').textContent =
    [[byStatus('approved'), t('publish.statusCatalog')], [byStatus('pending'), t('publish.statusReview')],
     [byStatus('rejected'), t('publish.statusRejected')]]
      .filter(([k]) => k > 0).map(([k, w]) => `${k} ${w}`).join(' · ');
}

function compactProgramDays(days){
  const ordered = DAYS.filter(d => Array.isArray(days) && days.includes(d));
  if(!ordered.length) return '';
  const parts = [];
  for(let i = 0; i < ordered.length; ){
    let j = i;
    while(j + 1 < ordered.length && DAYS.indexOf(ordered[j + 1]) === DAYS.indexOf(ordered[j]) + 1) j++;
    const run = j - i + 1;
    if(run >= 3) parts.push(canonicalLabel(ordered[i]) + '–' + canonicalLabel(ordered[j]));
    else for(let k = i; k <= j; k++) parts.push(canonicalLabel(ordered[k]));
    i = j + 1;
  }
  return parts.join(' · ');
}

function renderMine(){
  renderCatalogRow();
  const box = $('mineList'); box.innerHTML='';
  const own = customPrograms.length;
  $('progCount').textContent = own ? storeCountText(own,'program') : t('programs.none');

  if(!customPrograms.length){
    box.insertAdjacentHTML('beforeend',
      '<div class="empty-state">' +
      `<span class="es-ico">${icon('sparkle')}</span>` +
      '<b>' + esc(t('programs.emptyTitle')) + '</b>' +
      '<p>' + esc(t('programs.emptyText')) + '</p>' +
      '</div>');
    renderToday();
    return;
  }
  customPrograms.forEach(p=>{
    const wrap = document.createElement('div');
    // выключенную программу не прячем: иначе кажется, что она пропала совсем.
    // Приглушаем и подписываем словом — одним цветом такое сообщать нельзя
    const on = progActive(p);
    wrap.className = 'mine-card' + (on ? '' : ' off');
    const card = document.createElement('button');
    card.className = 'month-card';
    const plans = normPlans(p);
    const exTotal = plans.reduce((n, pl)=> n + pl.exercises.length, 0);
    const daysU = programDaysUnion(p);
    // расписание — один чип, очередь вариантов — отдельный: длинная строка
    // «Пн · Ср · 07:30 · варианты по очереди» разрывалась посреди фразы
    const schedule = [compactProgramDays(daysU), p.time].filter(Boolean).join(' · ');
    const rotates = p.rotate && plans.length > 1;
    const done = (p.stats && p.stats.completions) || 0;
    const cover = p.cover ? `<img src="${esc(p.cover)}" alt="">` : DUMBBELL_ICON;
    const setsOne = (plans[0].exercises || []).reduce((n, e) => n + (e.warmup ? 0 : (parseInt(e.sets) || 1)), 0);
    const volOne = (plans[0].rounds > 1 || setsOne <= plans[0].exercises.length)
      ? storeCountText(plans[0].rounds,'round')
      : storeCountText(setsOne,'set');
    // человеческие подписи вместо «Упр-ий» и «Вар-ов»
    const exWord = storeCountText(exTotal,'exercise');
    const line1 = plans.length > 1
      ? `${storeCountText(plans.length,'variant')} · ${exWord}`
      : `${exWord} · ${volOne}`;
    card.innerHTML =
      `<div class="mc-cover">${cover}</div>` +
      `<div class="mc-body"><h3></h3>` +
      `<p>${line1}</p>` +
      (done ? `<p>${esc(t('programs.completed',{count:done}))}</p>` : '') +
      ((schedule || rotates || !on)
        ? `<p class="mc-chips">` +
          (!on ? `<span class="sched off">${icon('power')}${esc(t('programs.offShort'))}</span>` : '') +
          (schedule ? `<span class="sched">${icon('calendar')}<span></span></span>` : '') +
          (rotates ? `<span class="sched">${icon('reset')}${esc(t('programs.sequence'))}</span>` : '') +
          `</p>`
        : '') + `</div>`;
    card.querySelector('h3').textContent = p.name;
    if(schedule) card.querySelector('.sched span').textContent = schedule;
    card.onclick = ()=> openStart(p);

    // контекстное меню ⋮
    const more = document.createElement('button');
    more.className = 'more-btn';
    more.innerHTML = icon('more');
    more.title = t('common.actions');
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    const bEdit = document.createElement('button');
    bEdit.innerHTML = icon('pencil') + t('common.edit');
    bEdit.onclick = ()=>{ closeAllMenus(); openBuilder(p.id); };
    // включить / отключить: рядом с «Изменить», а не рядом с «Удалить» — это
    // не уничтожение, и путать эти два действия соседством нельзя
    const bOff = document.createElement('button');
    bOff.innerHTML = icon('power') + (on ? t('programs.disable') : t('programs.enable'));
    bOff.title = on ? t('programs.disableTitle') : t('programs.enableTitle');
    bOff.onclick = async ()=>{
      closeAllMenus();
      p.active = !on;
      await savePrograms();
      renderMine();
      // объясняем только выключение: включение возвращает привычное поведение,
      // а вот исчезновение программы из «Сегодня» без объяснения пугает
      if(on) appAlert(t('programs.disabledAlert'));
    };
    const bShare = document.createElement('button');
    bShare.innerHTML = icon('share') + t('programs.shareLink');
    bShare.onclick = ()=>{ closeAllMenus(); exportProgram(p); };
    // «Отправить подопечному» — то же действие, но с адресатом: отправка запоминается,
    // и потом видно, кому что уходило. Пункт есть только у тренера.
    const bClient = document.createElement('button');
    bClient.innerHTML = icon('users') + t('programs.sendClient');
    bClient.onclick = ()=>{ closeAllMenus(); pickClientFor(p); };
    const bFile = document.createElement('button');
    bFile.innerHTML = icon('download') + t('programs.saveFile');
    bFile.title = t('programs.allImages');
    bFile.onclick = ()=>{ closeAllMenus(); exportProgramFile(p); };
    const bDel = document.createElement('button');
    bDel.className = 'danger';
    bDel.innerHTML = icon('trash') + t('common.delete');
    bDel.onclick = async ()=>{
      closeAllMenus();
      if(!(await appDialog(t('programs.deleteQuestion',{name:p.name}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
      customPrograms = customPrograms.filter(x=>x.id!==p.id);
      await savePrograms();
      renderMine();
    };
    // Копия и предложение в каталог — те же действия, что на экране программы.
    // Действие, доступное в одном месте и недоступное в другом, человек считает
    // сломанным, а не «не предусмотренным здесь».
    const bCopy = document.createElement('button');
    bCopy.innerHTML = icon('copy') + t('common.duplicate');
    bCopy.onclick = async ()=>{
      closeAllMenus();
      const c = await duplicateProgram(p);
      openBuilder(c.id);
    };
    const bPub = document.createElement('button');
    bPub.innerHTML = icon('crown') + t('programs.submitCatalog');
    bPub.onclick = ()=>{ closeAllMenus(); openPublish(p); };

    menu.append(bEdit, bOff, bCopy, bShare);
    if(trainerOn()) menu.append(bClient);
    if(trainerOn() && !p.storeId) menu.append(bPub);
    menu.append(bFile, bDel);
    more.onclick = e=>{ e.stopPropagation(); toggleMenu(menu); };
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.innerHTML = icon('grip');
    handle.title = t('programs.drag');
    wrap.append(card, handle, more, menu);
    wrap.dataset.pid = p.id;
    enableDrag(wrap, handle);
    box.appendChild(wrap);
  });
  renderToday();
}

/* ================= ПЕРЕТАСКИВАНИЕ КАРТОЧЕК (за ручку, с задержкой) ================= */
function enableDrag(wrap, handle, selector, onDrop){
  selector = selector || '.mine-card';
  handle.oncontextmenu = e => e.preventDefault();
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startY = e.clientY;
    let active = false, baseY = 0;

    const holdT = setTimeout(startDragging, 260); // задержка против случайного скролла

    function startDragging(){
      active = true;
      wrap.classList.add('dragging');
      try{ navigator.vibrate && navigator.vibrate(15); }catch(_){}
      document.body.style.userSelect = 'none';
      baseY = lastY;
    }
    let lastY = startY;

    const move = ev => {
      lastY = ev.clientY;
      if(!active){
        if(Math.abs(ev.clientY - startY) > 8){ cleanup(); } // дёрнулись до задержки — отмена
        return;
      }
      wrap.style.transform = `translateY(${ev.clientY - baseY}px) scale(1.02)`;
      const sibs = [...wrap.parentNode.querySelectorAll(selector)].filter(x => x !== wrap);
      for(const s of sibs){
        const r = s.getBoundingClientRect();
        if(ev.clientY > r.top && ev.clientY < r.bottom){
          const before = ev.clientY < r.top + r.height / 2;
          const target = before ? s : s.nextSibling;
          if(target !== wrap && target !== wrap.nextSibling){
            wrap.parentNode.insertBefore(wrap, target);
            baseY = ev.clientY;
            wrap.style.transform = 'translateY(0) scale(1.02)';
          }
          break;
        }
      }
    };
    const finish = async () => {
      const wasActive = active;
      cleanup();
      if(wasActive){
        const nodes = [...wrap.parentNode.querySelectorAll(selector)];
        if(onDrop){ onDrop(nodes); return; }
        const order = nodes.map(x => x.dataset.pid);
        customPrograms.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        await savePrograms();
      }
    };
    function cleanup(){
      clearTimeout(holdT);
      active = false;
      wrap.classList.remove('dragging');
      wrap.style.transform = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    }
    // слушаем на window — событие не потеряется, карточка не «зависнет»
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  });
}

/* ================= КОНСТРУКТОР ================= */
const MAX_WARM = 20;  // разминочных упражнений на вариант
const MAX_MAIN = 20;  // основных упражнений на вариант
const MAX_EX = MAX_WARM + MAX_MAIN; // общий потолок списка
let draft = null;

// Внутренний id упражнения — не показывается человеку и не входит в обычный
// текстовый протокол (импорт/каталог/«скопировать программу» его не видят).
// Нужен, чтобы при AI-правке отличать «то же упражнение переставили или
// переименовали» от «это другое упражнение»: раньше всё определялось по имени,
// и «Жим гантелей лёжа» → «Жим гантелей на полу» выглядело новым упражнением.
// Уникальности достаточно внутри одной программы (десятки строк), поэтому без
// проверки на коллизии: 36^6 комбинаций с большим запасом хватает.
function newExId(){
  return 'e' + Math.random().toString(36).slice(2, 8);
}

function blankExercise(){
  return {id:newExId(), name:'', desc:'', video:'', type:'reps', value:10, sets:1, perSide:false, warmup:false,
          rest:45, restAfter:null, media:null, muscles:[], mistakes:'',
          // ось прогрессии: reps | weight | time | none.
          // Каждая ось — свой шаг на одно повышение: вес в кг, повторы числом, время в секундах.
          prog:'', weight:0, wStep:2, repsStep:1, timeStep:5,
          // Потолок: выше него прогрессия не поднимает. Без него линейный рост за год
          // доводит до нереальных значений (60 кг гантель, 60 повторений, 5 минут планки).
          repsMax:0, weightMax:0, timeMax:0,
          // Двойная прогрессия: дошли до потолка повторов → +шаг веса, повторы падают в начало.
          // Так растёт вес, а не бесконечное число повторений (классическая силовая схема).
          dualProg:false,
          // Чем заменить упражнение, когда потолок достигнут и расти дальше некуда:
          // название и техника более сложного варианта того же движения.
          swapOn:false, swapName:'', swapDesc:''};
}

// приводит поля упражнения к валидным значениям: и после ручного ввода, и после ответа ИИ,
// который может прислать что угодно. Меняет объект на месте и возвращает его же.
function normalizeExercise(ex){
  /* Пределы полей — здесь же. Эта функция и есть место, где «что угодно»
     становится упражнением: через неё проходит и набранное руками, и ответ
     нейросети, и чужая программа. Раньше длина названия и описаний тут не
     проверялась вовсе, и название в мегабайт доезжало до карточки как есть. */
  // упражнения из старых данных (созданы до id) или пришедшие по сети без него
  if(!ex.id) ex.id = newExId();
  ex.name  = clampLine(ex.name, LIM.exName);
  ex.desc  = clampText(ex.desc, LIM.exDesc);
  ex.mistakes = clampText(ex.mistakes, LIM.exMistakes);
  // Мышцы — только известные: чужой список уезжает в подписи и в промт к ИИ.
  ex.muscles = (Array.isArray(ex.muscles) ? ex.muscles : [])
    .filter(id => MUSCLES.some(([m]) => m === id)).slice(0, MUSCLES.length);
  const pic = ex.media && ex.media.kind === 'img' ? cleanPic(ex.media.data) : null;
  ex.media = pic ? {kind: 'img', data: pic} : null;
  ex.value = normValue(ex.value, ex.type);
  // Подходы у разминки принудительно сбрасывались в единицу, а поле в форме пряталось.
  // Разминка отличается от обычного упражнения ровно одним — она идёт в начале,
  // один раз, до кругов. Подходы и стороны у неё такие же.
  ex.sets  = Math.max(1, Math.min(10, parseInt(ex.sets) || 1));
  ex.perSide = !!ex.perSide;
  ex.warmup  = !!ex.warmup;
  // Верхняя граница была только у отдыха ПОСЛЕ упражнения, а у этого не было
  // вовсе: «ОТДЫХ: 99999» из ответа ИИ давал шаг тренировки на сутки.
  ex.rest  = Math.max(0, Math.min(600, parseInt(ex.rest) || 0));
  // отдых после ВСЕГО упражнения (перед следующим) — своё число, независимое от
  // отдыха между подходами. null = не задан явно: кто читает это поле, берёт
  // rest как запасной вариант (см. exRestAfter() и paint в buildSteps)
  ex.restAfter = ex.restAfter == null ? null : Math.max(0, Math.min(600, parseInt(ex.restAfter) || 0));
  // ось усложнения и вес: приводим к валидным значениям, чтобы кривой ответ ИИ не ломал показ
  if(ex.prog && !['reps','weight','time','none'].includes(ex.prog)) ex.prog = '';
  ex.weight = parseKg(ex.weight);
  // Шаг 0 — законное значение: «эта ось у этого упражнения не растёт», и именно на
  // нём держится независимая прогрессия формата «повторения и вес» (progStepSize
  // и подсказка «можно усложнить» уже понимают его так). Раньше здесь стоял
  // Math.max(1, …), и явный ноль молча превращался в единицу: программа, где ИИ
  // прислал одну «ШАГ ВЕСА» — как и просит промт, когда растёт только вес, — всё
  // равно прибавляла по повторению за тренировку.
  // Дефолт подставляем только там, где шага нет вовсе, и он зависит от формата.
  const stepNum = (v, def, hi, round) => {
    const n = parseStepNum(v);
    return n == null ? def : Math.max(0, Math.min(hi, round(n)));
  };
  ex.wStep  = stepNum(ex.wStep, 2, 100, v => Math.round(v * 2) / 2);
  ex.repsStep = stepNum(ex.repsStep, hasWeight(ex) ? 0 : 1, 20, Math.round);
  ex.timeStep = stepNum(ex.timeStep, 5, 120, Math.round);
  // потолки: 0 = без потолка. Верхние границы отсекают явную чушь из ответа ИИ
  ex.repsMax = Math.max(0, Math.min(200, parseInt(ex.repsMax) || 0));
  ex.weightMax = parseKg(ex.weightMax);
  ex.timeMax = Math.max(0, Math.min(3600, parseInt(ex.timeMax) || 0));
  ex.dualProg = !!ex.dualProg && hasWeight(ex) && ex.repsMax > 0;
  ex.swapName = clampLine(ex.swapName, LIM.exSwapName);
  ex.swapDesc = clampText(ex.swapDesc, LIM.exSwapDesc);
  ex.swapOn = !!ex.swapName;
  // Тот же разбор, что у ссылки тренера: схему дописываем сами, а непохожее на
  // адрес не сохраняем. Кнопка «смотреть» на непонятной строке ведёт в никуда.
  ex.video = cleanLink(ex.video, LIM.video) || '';
  return ex;
}


// упражнение-исходник в самой программе по названию из шага: шаг тренировки — только копия,
// в нём нет ни потолка, ни двойной прогрессии, ни собственного старта отсчёта
function liveExercise(name){
  const p = state.raw;
  if(!p || !p.id || !name) return null;
  const plan = normPlans(p)[(typeof state.planIdx === 'number') ? state.planIdx : 0];
  if(!plan) return null;
  const key = String(name).trim().toLowerCase();
  const idx = (plan.exercises || []).findIndex(e => (e.name || '').trim().toLowerCase() === key);
  return idx >= 0 ? {p, plan, idx, ex: plan.exercises[idx]} : null;
}


/* ---- прогрессия по упражнению ----
   Ось усложнения у разных упражнений разная: гантельные растут по весу (дискретно,
   шагами реальных гантелей), упражнения со своим весом — по повторениям,
   удержания — по времени, а разминка и техника не усложняются вовсе. */
const PROG_AXES = [
  {id:'reps',   label:'Повторения'},
  {id:'weight', label:'Вес'},
  {id:'time',   label:'Время'},
  {id:'none',   label:'Не усложнять'}
];
// ось по умолчанию, если не задана явно: разминку не трогаем, время — по времени, иначе повторы
// Ось прогрессии определяется по-разному у старых и новых упражнений — специально совместимо:
//   новые (после этого обновления): формат («повторения» / «повторения и вес» / «время»,
//     через ex.type + ex.trackWeight) и отдельный тумблер ex.progOn — «усложнять со временем?».
//     Это то, что видно и редактируется в интерфейсе: два простых вопроса вместо одной
//     абстрактной оси из четырёх вариантов.
//   старые (созданы до этого обновления, у них нет ex.progOn вовсе): ось читается из
//     явно сохранённого ex.prog, как раньше. Апгрейд происходит сам собой в момент,
//     когда упражнение открывают в редакторе и сохраняют — тогда оно уже пишет новые поля.
function progAxis(ex){
  if(!ex) return 'none';
  if(ex.warmup) return 'none';
  if(ex.progOn != null){
    if(!ex.progOn) return 'none';
    if(ex.type === 'time') return 'time';
    return ex.trackWeight ? 'weight' : 'reps';
  }
  if(ex.prog) return ex.prog;
  return ex.type === 'time' ? 'time' : 'reps';
}
// «формат включает вес» — не зависит от того, усложняется ли упражнение сейчас:
// вес может быть просто зафиксирован (тумблер выключен) и не расти, но оставаться видимым
function hasWeight(ex){
  if(!ex) return false;
  // trackWeight и есть «формат включает вес», и от тумблера прогрессии он не зависит.
  // Раньше ему верили только вместе с progOn — и программа, разобранная из текста без
  // строки «УСЛОЖНЯТЬ», теряла вес полностью: разборщик ставил trackWeight и число кг,
  // а тренировка их не показывала, потому что progOn оставался пустым.
  if(ex.trackWeight != null) return !!ex.trackWeight;
  if(ex.progOn != null) return false;          // новая модель, но формат без веса
  return progAxis(ex) === 'weight'; // старые данные: раньше это было одно и то же понятие
}
// формат включает вес, но снаряд ещё не выбран (0 — не «нулевой вес», а «неизвестный»,
// см. getExProgValue): прогрессия по весу не копится, экран старта предлагает выбрать
function weightPending(ex){
  return hasWeight(ex) && !(+ex.weight > 0);
}
// отдых после ВСЕГО упражнения (перед следующим), а не между его подходами.
// У старых упражнений (и когда явно не задан) поле пустое — запасной вариант
// тогда тот же, что и между подходами: разное число нужно не всем, и лучше
// молча унаследовать разумное значение, чем ломать программу или писать 0.
function exRestAfter(ex){
  if(!ex) return 0;
  return ex.restAfter != null ? +ex.restAfter : (+ex.rest || 0);
}
// для редактора: текущее состояние упражнения в терминах простого интерфейса —
// какой формат выбран и включён ли тумблер «усложнять со временем»
function exFormatState(ex){
  const format = ex.type === 'time' ? 'time' : (hasWeight(ex) ? 'reps_weight' : 'reps');
  return {format, progOn: progAxis(ex) !== 'none'};
}
// подпись периода прогрессии программы. Считаем в ПРОЙДЕННЫХ ТРЕНИРОВКАХ, а не в днях:
// календарь поднимал нагрузку за время отпуска, поэтому от него отказались (см. progAutoSteps)
const PROG_EVERY_MAX = 15;
// у программ, созданных до перехода на счёт по тренировкам, здесь мог лежать календарный
// период (например, 30 — «каждый месяц»): загоняем такое значение в допустимый диапазон
function clampProgEvery(n){
  return Math.max(1, Math.min(PROG_EVERY_MAX, Math.round(+n || 0) || 6));
}
function progPeriodLabel(n){
  n = Math.max(1, Math.round(+n || 1));
  if(n === 1) return t('builder.everyWorkout');
  const workouts = appLocale === 'ru' ? plural(n,t('start.workoutOne'),t('start.workoutFew'),t('start.workoutMany')) : t(n === 1 ? 'start.workoutOne' : 'start.workoutFew');
  return t('builder.everyNWorkouts',{count:n,workouts});
}
// «как часто повышать» в настройках программы: 1–15 тренировок
function fillProgEveryOptions(){
  const sel = $('bProgEvery');
  if(sel.options.length) return;
  for(let n = 1; n <= PROG_EVERY_MAX; n++){
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = progPeriodLabel(n);
    sel.appendChild(o);
  }
}
// 12 кг, 12,5 кг — без хвостов вроде 12.50
function fmtKg(kg){
  const n = Math.round((+kg || 0) * 2) / 2;
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/* ================= ПРОГРЕССИЯ: единая модель для веса, повторов и времени =================
   Итоговое значение = БАЗА упражнения + (номер шага прогрессии × размер шага) + ручная поправка.
     • «Номер шага» — один на всю программу, растёт по расписанию («каждые 2 недели»).
       Его можно посмотреть и поправить руками на экране перед стартом — это ОБРАТИМО:
       базовые значения упражнений не трогаются, всё пересчитывается на лету.
     • «Ручная поправка» — своя у каждого упражнения, копится от кнопок ± на тренировке
       и от попапа «Легко / Тяжело» после подхода. Не зависит от номера шага и не теряется,
       если номер шага потом изменят.
   Раньше эти две вещи были смешаны в одном сохранённом числе — из-за этого правка веса
   на тренировке необратимо искажала базу, и это было слышно на второй-третьей тренировке. */

// Все функции ниже принимают НЕОБЯЗАТЕЛЬНЫЙ параметр axis. Если не передать — берётся
// progAxis(ex), как и раньше (для веса-only, повторы-only, время-only упражнений ничего
// не меняется). Явный axis нужен для формата «повторения и вес»: там ОДНОВРЕМЕННО могут
// расти и вес, и повторы — это уже не одна ось, а две, и prog-функциям нужно вызываться
// дважды с разным axis для одного и того же упражнения.

// значение упражнения «с нуля», без какой-либо прогрессии
function progBaseValue(ex, axis){
  axis = axis || progAxis(ex);
  if(axis === 'weight') return +ex.weight || 0;
  return parseValue(ex.value).min; // повторы, время и «не усложнять» — читают минимум из value
}
// на сколько сдвигается значение за один шаг прогрессии.
// ВАЖНО: используем ex.field != null, а не ex.field || default — иначе явный 0
// (значит «эту ось для этого упражнения не растим») JS посчитает «не задано» и
// молча подставит дефолт вместо нуля, полностью ломая независимую прогрессию
// в формате «повторения и вес» (где именно 0 отключает конкретную ось).
// Что именно растёт у упражнения, одной строкой: «+2 кг», «+1 повт. и +2 кг»,
// «+5 сек». Пусто — значит не растёт, и тогда НЕ ПОКАЗЫВАЕМ НИЧЕГО: отсутствие
// роста — обычное дело, сообщать о нём незачем, а метка «не растёт» у каждого
// второго упражнения только зашумляет список и экран тренировки.
function progShort(ex){
  if(!ex || ex.warmup || progAxis(ex) === 'none') return '';
  const bits = [];
  if(ex.type === 'time'){
    const st = progStepSize(ex, 'time');
    if(st > 0) bits.push(`+${fmtKg(st)} ${t('store.secShort')}`);
  } else {
    const r = progStepSize(ex, 'reps');
    if(r > 0) bits.push(`+${fmtKg(r)} ${t('store.repShort')}`);
  }
  // вес — независимая ось что при повторениях, что при времени («время и вес»:
  // фермерская прогулка, планка с блином)
  if(hasWeight(ex)){
    const w = progStepSize(ex, 'weight');
    if(w > 0) bits.push(`+${fmtKg(w)} ${t('progress.kg')}`);
  }
  return bits.length ? bits.join(appLocale === 'ru' ? ' и ' : ' & ') : t('builder.progressionAuto');
}

function progStepSize(ex, axis){
  axis = axis || progAxis(ex);
  if(axis === 'weight') return ex.wStep != null ? +ex.wStep : 2;
  if(axis === 'reps') return ex.repsStep != null ? +ex.repsStep : 1;
  if(axis === 'time') return ex.timeStep != null ? +ex.timeStep : 5;
  return 0;
}
// нижняя граница, ниже которой значение не опускается (вес — 0, повторы и время — хотя бы 1)
function progFloor(axis){ return axis === 'weight' ? 0 : 1; }
// округление под ось: вес — до 0,5, повторы и время — целые
function progRound(axis, v){
  return axis === 'weight' ? Math.round(v * 2) / 2 : Math.round(v);
}

/* ---- состояние прогрессии У КАЖДОГО УПРАЖНЕНИЯ (ex.ps) ----
   Раньше был один счётчик шагов на программу (progSteps), вычисленный на лету
   из floor(пройденных тренировок / progression) — и все упражнения программы
   получали одно и то же число шагов. Это ломалось на чередовании A/Б: упражнение
   варианта А получало +1 шаг за КАЖДУЮ тренировку программы, в том числе за дни
   варианта Б, и росло вдвое быстрее задуманного.
   Теперь у каждого упражнения своё состояние ex.ps:
     n    — сколько раз это упражнение выполнено с последней проверки прогресса
     cur  — фактическая текущая нагрузка {reps, sec, kg}; отсутствующее поле
            означает «ещё равна базе» (ex.value/ex.weight)
   Состояние живёт внутри упражнения и синхронизируется вместе с программой —
   отдельного места хранения не нужно. advanceExerciseProgression() сдвигает
   cur на один шаг; вызывающий код (commitFinish в 70-workout.js) решает, когда
   это делать — см. также docs/ai-edit-progression-plan.md, пачка 4. */
function ensurePs(ex){
  if(!ex.ps || typeof ex.ps !== 'object') ex.ps = {n:0, cur:{}};
  else{
    ex.ps.n = Math.max(0, Math.round(+ex.ps.n || 0));
    if(!ex.ps.cur || typeof ex.ps.cur !== 'object') ex.ps.cur = {};
  }
  return ex.ps;
}
// текущий диапазон повторов: из ex.ps.cur.reps, если прогрессия уже сдвигала его,
// иначе — база из ex.value (та же строка «12» / «8-12», что хранится в редакторе)
function psReps(ex){
  const ps = ensurePs(ex);
  return parseValue(ps.cur.reps != null ? ps.cur.reps : ex.value);
}
function psSec(ex){
  const ps = ensurePs(ex);
  return ps.cur.sec != null ? +ps.cur.sec : parseValue(ex.value).min;
}
function psKg(ex){
  const ps = ensurePs(ex);
  return ps.cur.kg != null ? +ps.cur.kg : (+ex.weight || 0);
}

// текущий рабочий вес упражнения: то, что человек поднимает сейчас (растёт от тренировки к тренировке)
function exWeightKey(pid, name){
  return 'w_' + pid + '_' + String(name || '').trim().toLowerCase();
}

// потолок оси: 0 или пусто = потолка нет (растём без ограничения, как раньше)
function progCeil(ex, axis){
  const v = axis === 'weight' ? ex.weightMax : axis === 'time' ? ex.timeMax : ex.repsMax;
  return (+v > 0) ? +v : null;
}
// двойная прогрессия возможна, только когда есть и вес, и потолок повторов:
// без потолка неизвестно, когда сбрасывать повторы и добавлять вес
function isDualProg(ex){
  return !!ex.dualProg && hasWeight(ex) && progCeil(ex, 'reps') != null;
}

// итоговое значение упражнения сейчас — читает фактическое состояние (ex.ps),
// а не вычисляет его из числа шагов программы. pid/program больше не нужны для
// самого чтения (совместимость со старыми вызовами — аргументы просто игнорируются),
// но getExWeight/exBits/exerciseLoad и т.п. по-прежнему передают их, поэтому сигнатура
// сохранена, чтобы не переписывать десятки мест вызова.
function getExProgValue(pid, ex, program, axis){
  axis = axis || progAxis(ex);
  if(axis === 'none') return progBaseValue(ex, axis);
  if(axis === 'weight'){
    // вес 0 — это «снаряд ещё не выбран», а не «стартуем с нуля кг»: пока он не
    // выбран, прогрессия не копится поверх несуществующей базы (иначе вес сначала
    // не показывается вовсе, а после пары тренировок вдруг появляется «4 кг» из
    // воздуха). Как только человек выберет вес на экране старта, психология та же:
    // это станет новой базой, и прогрессия пойдёт от неё.
    const kg = psKg(ex);
    if(kg <= 0) return 0;
    const ceil = progCeil(ex, 'weight');
    return Math.max(0, progRound('weight', ceil != null ? Math.min(ceil, kg) : kg));
  }
  if(axis === 'time'){
    const ceil = progCeil(ex, 'time');
    const v = psSec(ex);
    return Math.max(1, progRound('time', ceil != null ? Math.min(ceil, v) : v));
  }
  // reps: одно число — минимум текущего диапазона (см. progressedRepsRange для диапазона целиком)
  const ceil = progCeil(ex, 'reps');
  const v = psReps(ex).min;
  return Math.max(1, progRound('reps', ceil != null ? Math.min(ceil, v) : v));
}
// диапазон повторов «8-12»: границы читаются из текущего состояния целиком (обе
// сдвинуты вместе), потолок применяется к обеим
function progressedRepsRange(pid, ex, program){
  const r = psReps(ex);
  const ceil = progCeil(ex, 'reps');
  let min = r.min, max = r.max;
  // при двойной прогрессии цель — одно число (8 → 9 → … → потолок, затем +вес
  // и снова 8), а диапазон из ЗНАЧЕНИЯ служит только рамками; без этого первый
  // круг показывал «8-12», а следующие — одиночные числа
  if(isDualProg(ex)) max = min;
  if(ceil != null){ min = Math.min(ceil, min); max = Math.min(ceil, max); }
  min = Math.max(1, min);
  max = Math.max(min, max);
  return min === max ? String(min) : min + '-' + max;
}
// упёрлось ли упражнение в свой потолок — чтобы подсказать «пора усложнить вариант».
// Потолок считается достигнутым, только когда РАСТИ БОЛЬШЕ НЕКУДА: каждая растущая ось
// упражнения имеет потолок и уже на нём. Если хоть одна ось растёт без ограничения,
// упражнение продолжает усложняться само и подсказка была бы ложной.
function axisAtCeiling(pid, ex, program, axis){
  const ceil = progCeil(ex, axis);
  if(ceil == null) return false;
  if(axis === 'reps'){
    const top = parseValue(progressedRepsRange(pid, ex, program));
    return top.max >= ceil;
  }
  return getExProgValue(pid, ex, program, axis) >= ceil;
}
function progAtCeiling(pid, ex, program){
  const axis = progAxis(ex);
  if(axis === 'none') return false;
  // при двойной прогрессии повторы ходят по кругу, а копится вес — смотрим только на него
  if(isDualProg(ex)) return axisAtCeiling(pid, ex, program, 'weight');
  // вес — независимая ось что при повторениях, что при времени («время и вес»)
  const axes = ex.type === 'time'
    ? (hasWeight(ex) ? ['time', 'weight'] : ['time'])
    : (hasWeight(ex) ? ['weight', 'reps'] : ['reps']);
  const growing = axes.filter(a => progStepSize(ex, a) > 0);
  if(!growing.length) return false;
  return growing.every(a => axisAtCeiling(pid, ex, program, a));
}

// ОДИН шаг прогрессии для упражнения — вызывается, когда ex.ps.n достиг порога
// (см. commitFinish в 70-workout.js). Мутирует ex.ps.cur; счётчик n сбрасывает
// вызывающий код. Правила те же, что раньше вычислялись «на лету» из номера шага:
// при двойной прогрессии повторы растут до потолка, затем сбрасываются к базе и
// добавляется шаг веса; иначе каждая растущая ось просто сдвигается на свой шаг.
function advanceExerciseProgression(ex){
  const axis = progAxis(ex);
  if(axis === 'none') return;
  ensurePs(ex);
  if(axis === 'weight' && isDualProg(ex)){
    const base = parseValue(ex.value).min;
    const repsCeil = progCeil(ex, 'reps');
    const repsStep = progStepSize(ex, 'reps') || 1;
    const curReps = psReps(ex).min;
    const next = curReps + repsStep;
    if(repsCeil != null && next > repsCeil && psKg(ex) <= 0){
      // вес ещё не выбран — прибавлять не к чему (см. getExProgValue): повторы
      // остаются на потолке, пока человек не задаст вес на экране старта
      ex.ps.cur.reps = String(repsCeil);
    } else if(repsCeil != null && next > repsCeil){
      const weightCeil = progCeil(ex, 'weight');
      const nextKg = psKg(ex) + progStepSize(ex, 'weight');
      ex.ps.cur.kg = progRound('weight', weightCeil != null ? Math.min(weightCeil, nextKg) : nextKg);
      ex.ps.cur.reps = String(base);
    } else {
      ex.ps.cur.reps = String(Math.max(1, next));
    }
    return;
  }
  if(ex.type === 'time'){
    const step = progStepSize(ex, 'time');
    if(step > 0){
      const ceil = progCeil(ex, 'time');
      const next = psSec(ex) + step;
      ex.ps.cur.sec = Math.max(1, ceil != null ? Math.min(ceil, next) : next);
    }
  } else {
    const step = progStepSize(ex, 'reps');
    if(step > 0){
      const ceil = progCeil(ex, 'reps');
      const r = psReps(ex);
      const min = Math.max(1, r.min + step), max = Math.max(min, r.max + step);
      ex.ps.cur.reps = String(ceil != null ? Math.min(ceil, min) : min) +
        (max !== min ? '-' + (ceil != null ? Math.min(ceil, max) : max) : '');
    }
  }
  // вес — независимая ось при формате «…и вес» вне двойной прогрессии
  if(hasWeight(ex)){
    const wStep = progStepSize(ex, 'weight');
    const base = psKg(ex);
    if(wStep > 0 && base > 0){ // 0 — вес ещё не выбран, расти нечему (см. getExProgValue)
      const ceil = progCeil(ex, 'weight');
      const next = base + wStep;
      ex.ps.cur.kg = progRound('weight', ceil != null ? Math.min(ceil, next) : next);
    }
  }
}

// База упражнения (числа, которые задают человек в конструкторе или ИИ) поменялась —
// прежняя фактическая нагрузка ex.ps.cur к ней больше не относится: новые числа и
// есть текущая нагрузка, иначе правка значения/веса в конструкторе просто не
// действовала бы, пока прогрессия уже сдвинула cur. Счётчик до проверки (n)
// сохраняем — упражнение то же. База не менялась (правили описание, отдых,
// подходы, название) — прогресс переносится целиком.
function progBaseKey(ex){
  return [ex.type === 'time' ? 'time' : 'reps', hasWeight(ex) ? 1 : 0,
    normValue(ex.value, ex.type), +ex.weight || 0, ex.dualProg ? 1 : 0].join('|');
}
function carryExerciseProgress(oldEx, newEx){
  if(!newEx) return newEx;
  if(!oldEx || !oldEx.ps){ delete newEx.ps; return newEx; }
  if(progBaseKey(oldEx) === progBaseKey(newEx)) newEx.ps = JSON.parse(JSON.stringify(oldEx.ps));
  else newEx.ps = {n: Math.max(0, Math.round(+oldEx.ps.n || 0)), cur: {}};
  return newEx;
}
// копия упражнения — отдельное упражнение: свой id (по нему сопоставляются
// правки ИИ и отметки «тяжело» на экране финала) и прогресс с нуля
function cloneExerciseAsNew(ex){
  const c = JSON.parse(JSON.stringify(ex));
  c.id = newExId();
  delete c.ps;
  return c;
}

// вес отдельно — то же самое, но только для оси «вес» (используется в старых местах интерфейса).
// Для формата «повторения и вес» вес растёт независимо от того, что там с повторами,
// поэтому явно просим axis='weight', а не полагаемся на progAxis(ex) (которая для этого
// формата тоже вернёт 'weight' — здесь совпадает, но так честнее читается)
function getExWeight(pid, ex, program){
  return hasWeight(ex) ? getExProgValue(pid, ex, program, 'weight') : 0;
}
// прямая правка текущего веса (нажатие на строку экрана старта, см. 00-core.js) —
// пишет в ex.ps.cur.kg напрямую, база (ex.weight) не трогается
function setExWeight(ex, kg){
  ensurePs(ex).cur.kg = Math.max(0, progRound('weight', +kg || 0));
}

/* ---- ЗНАЧЕНИЕ может быть числом или диапазоном «12-15» ---- */
// возвращает {min, max} — для одиночного значения min === max
function parseValue(v){
  const s = String(v == null ? '' : v).replace(',', '.').trim();
  const m = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if(m){
    let a = parseInt(m[1]), b = parseInt(m[2]);
    if(a > b){ const t = a; a = b; b = t; }
    return {min: Math.max(1, a), max: Math.min(999, b)};
  }
  const n = Math.max(1, Math.min(999, parseInt(s) || 1));
  return {min: n, max: n};
}
// «12» или «12–15»
function valueText(v){
  const r = parseValue(v);
  return r.min === r.max ? String(r.min) : (r.min + '–' + r.max);
}
// масштабирование нагрузки с сохранением диапазона
function scaleValue(v, k){
  const r = parseValue(v);
  const a = Math.max(1, Math.round(r.min * k));
  const b = Math.max(1, Math.round(r.max * k));
  return a === b ? String(a) : (a + '-' + b);
}
// нормализация значения для хранения
function normValue(v, type){
  const r = parseValue(v);
  if(type === 'time') return String(r.min); // время — всегда одно число
  return r.min === r.max ? String(r.min) : (r.min + '-' + r.max);
}

let planIdx = 0;
// Новый вариант начинается пустым: раньше в нём сразу лежало безымянное упражнение,
// и человек видел строку, которой не заводил. Теперь виден пустой список с объяснением,
// а первую строку создаёт «Добавить упражнение» — сразу с полем названия в фокусе.
function blankPlan(){
  return {days:[], rounds:3, roundRest:120, exercises:[]};
}

function openBuilder(id=null){
  if(id){
    const src = customPrograms.find(x=>x.id===id);
    draft = JSON.parse(JSON.stringify(src));
    draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
    delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days; delete draft.tod;
    if(!draft.time) draft.time = '';
    if(!draft.cover) draft.cover = null;
    if(!draft.stats) draft.stats = {completions: 0};
  } else {
    draft = {id:'p'+Date.now(), name:'', time:'', cover:null, stats:{completions:0}, plans:[blankPlan()]};
  }
  planIdx = 0;
  fillBuilder(id ? t('ai.editTitle') : t('programs.newProgram'));
  // вот здесь пол и возраст впервые нужны по делу: от них зависят подбор упражнений
  // и нагрузка
  requireWho('program', ()=> goTab('scrPrograms'));
}

function curPlan(){ return draft.plans[planIdx]; }

function syncRotateUI(){
  const many = (draft.plans || []).length > 1;
  const rot = !!draft.rotate && many;

  // переключатель режима есть только когда вариантов больше одного
  setShown('schedModeRow', many);
  document.querySelectorAll('#schedSeg button').forEach(b =>
    b.classList.toggle('act', (b.dataset.mode === 'rot') === rot));
  $('schedHint').textContent = rot
    ? t('builder.rotationHint')
    : t('builder.weekdayHint');

  // дни варианта показываются только когда вариантов правда несколько
  $('bDaysLabel').textContent = t('builder.variantDaysLabel');
  $('bDaysHint').textContent = t('builder.variantDaysHint');

  // подписи вариантов. У программы с одним вариантом карточка не про варианты:
  // в ней круги и отдых, и называться она должна тем, что в ней лежит.
  $('variantsLabel').textContent = !many
    ? t('builder.roundsRest')
    : (rot ? t('builder.variantsRotate') : t('builder.variantsWorkout'));
  $('variantsHint').textContent = !many
    ? t('builder.addVariantHint')
    : (rot
        ? t('builder.selectedVariantHint')
        : t('builder.selectedVariantDaysHint'));

  // пометка у заголовка «Круги и отдых»
  $('stVariantNote').textContent = many ? `${t('builder.variant')} ${planIdx + 1}` : '';

  renderDays();
  renderPlanTabs();
}
document.querySelectorAll('#schedSeg button').forEach(b => {
  b.onclick = ()=>{
    draft.rotate = b.dataset.mode === 'rot';
    if(draft.rotate && !Array.isArray(draft.days)) draft.days = [];
    syncRotateUI();
  };
});
$('bRounds').onchange = ()=>{ curPlan().rounds = +$('bRounds').value; syncVolHint(); };
$('bProgOn').onclick = ()=>{
  const on = !$('bProgOn').classList.contains('on');
  $('bProgOn').classList.toggle('on', on);
  setShown('bProgOpts', on);
};

// перед сменой вкладки/сохранением переносим значения полей в текущий план
function commitPlanFields(){
  const pl = curPlan();
  pl.rounds = +$('bRounds').value || 3;
  pl.roundRest = Math.max(0, Math.min(600, parseInt($('bRoundRest').value) || 0));
  // Своё время напоминания у варианта из редактора убрано: одно время на программу
  // и так есть, а второе рядом только путало. Ключ pl.time остаётся — его понимают
  // импорт, формат обмена с ИИ и напоминания; просто мы его больше не предлагаем.
}

// заполняет форму конструктора из draft и показывает экран
// текущее состояние программы для сравнения с исходным
function programState(){
  if(!draft) return null;
  try{ commitPlanFields(); }catch(e){}
  return {name: $('bName') ? $('bName').value.trim() : draft.name, d: draft};
}
function programDirty(){ return isChanged('program', programState()); }

function fillBuilder(title){
  $('builderTitle').textContent = title;
  setTimeout(()=> takeSnap('program', programState()), 0);
  setTimeout(markBuilderTab, 0);
  $('bName').value = draft.name;
  $('bDesc').value = draft.desc || '';
  $('bDescCount').textContent = (draft.desc || '').length;
  setTimeout(()=> autoGrow($('bDesc')), 0);
  $('bTime').value = draft.time || '';

  // ротация вариантов доступна, когда вариантов больше одного
  syncRotateUI();
  const pOn = !!draft.progression;
  $('bProgOn').classList.toggle('on', pOn);
  setShown('bProgOpts', pOn);
  fillProgEveryOptions();
  $('bProgEvery').value = String(clampProgEvery(draft.progression || 6)); // 6 тренировок — примерно 2-3 недели при 2-3 занятиях в неделю
  syncCover();
  renderPlanTabs();
  fillPlanFields();
  show('scrBuilder');
  window.scrollTo(0,0);
}

function renderPlanTabs(){
  ['planTabs', 'planTabsTop'].forEach(id => buildPlanTabs(id));
  // верхние вкладки нужны, только когда вариантов больше одного
  setShown('planTabsTop', draft.plans.length > 1);
  if(typeof renderExList === 'function' && $('bVariantTitle')) { /* подписи обновит renderExList */ }
  syncSettingsSum();
}

function buildPlanTabs(boxId){
  const box = $(boxId); box.innerHTML='';
  const isTop = boxId === 'planTabsTop';
  // одна вкладка ничего не переключает и просто повторяет дни, выбранные выше
  (draft.plans.length > 1 ? draft.plans : []).forEach((pl, i)=>{
    const b = document.createElement('div');
    b.className = 'plan-tab';
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const rot = !!draft.rotate && draft.plans.length > 1;
    const lbl = document.createElement('span');
    if(rot){
      // при очереди дни варианта не имеют смысла — показываем номер и позицию в очереди
      const nextIdx = ((draft.rotIdx || 0) % draft.plans.length + draft.plans.length) % draft.plans.length;
      lbl.textContent = `${t('builder.variant')} ${i+1}` + (i === nextIdx ? ' • ' + t('builder.current') : '');
    } else {
      lbl.textContent = (pl.days && pl.days.length) ? pl.days.map(canonicalLabel).join('·') : `${t('builder.variant')} ${i+1}`;
    }
    b.appendChild(lbl);
    b.classList.toggle('act', i === planIdx);
    // удаление — крестиком на самом варианте: отдельной ссылкой внизу карточки
    // его не искали, а отдельным чипом в ряду он не помещался
    if(!isTop && i === planIdx){
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'pt-x';
      x.innerHTML = icon('close');
      x.title = t('builder.deleteVariantTitle');
      x.onclick = e => { e.stopPropagation(); delCurrentPlan(); };
      b.appendChild(x);
    }
    b.onclick = ()=>{
      if(i === planIdx) return;
      commitPlanFields();
      planIdx = i;
      renderPlanTabs();
      fillPlanFields();
      $('stVariantNote').textContent = draft.plans.length > 1 ? `${t('builder.variant')} ${planIdx + 1}` : '';
    };
    box.appendChild(b);
  });
  if(!isTop){
    if(draft.plans.length < 7){
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'plan-tab add';
      add.innerHTML = icon('plus') + t('builder.add');
      add.title = t('builder.addVariant');
      add.onclick = ()=>{
        commitPlanFields();
        draft.plans.push(blankPlan());
        planIdx = draft.plans.length - 1;
        fillPlanFields();
        syncRotateUI(); // появился второй вариант — показываем выбор режима
      };
      box.appendChild(add);
    }
  }
}

function fillPlanFields(){
  const pl = curPlan();
  $('bRoundRest').value = pl.roundRest;
  setTimeout(syncVolHint, 0);
  const sel = $('bRounds'); sel.innerHTML='';
  for(let i=1;i<=10;i++){
    const o = document.createElement('option');
    o.value=i; o.textContent = i;
    if(i===pl.rounds) o.selected = true;
    sel.appendChild(o);
  }
  renderDays();
  renderExList();
}

function syncCover(){
  $('bCoverBtn').classList.toggle('act', !!draft.cover);
  $('bCoverNone').classList.toggle('act', !draft.cover);
  $('bCoverPrev').innerHTML = draft.cover ? `<img src="${esc(draft.cover)}" alt="">` : '';
}

// дни недели текущего варианта — множественный выбор
// объясняет, как круги и подходы складываются в реальный объём
function syncVolHint(){
  const el = $('bVolHint');
  if(!el) return;
  const pl = curPlan();
  const main = (pl.exercises || []).filter(e => !e.warmup);
  const R = pl.rounds || 1;
  // Раньше здесь приклеивался ярлык — «Круговая», «Силовая», «Смешанная». Откуда он
  // берётся, по экрану понять было нельзя, а человеку это слово ничего не даёт.
  // Говорим то же самое числами: сколько всего подходов выйдет за тренировку.
  if(!main.length){ el.textContent = ''; return; }
  const sets = main.map(e => Math.max(1, parseInt(e.sets) || 1));
  const total = sets.reduce((a, b) => a + b, 0) * R;
  const exText = storeCountText(main.length,'exercise');
  const roundsText = R > 1 ? ' × ' + storeCountText(R,'round') : '';
  const setsText = storeCountText(total,'set');
  el.textContent = t('builder.volumeHint',{exercises:exText,rounds:roundsText,sets:setsText});
}

function renderDays(){
  const rotOn = !!draft.rotate && (draft.plans || []).length > 1;
  // При очереди дни принадлежат программе целиком — им место в верхней карточке,
  // рядом с режимом и общим временем. Иначе дни принадлежат варианту и стоят в его
  // карточке, над кругами и отдыхом того же варианта.
  // Где рисуем чипы: у очереди и у программы с единственным вариантом дни
  // относятся ко всей программе на вид, поэтому стоят в карточке «Когда
  // тренироваться». Карточка с таким названием без дней — а так и было, пока
  // единственный вариант прятал их в «Вариантах тренировки», — бессмысленна.
  // Чьи это дни, не меняется: при очереди — программы, иначе — варианта.
  const one = (draft.plans || []).length <= 1;
  const top = rotOn || one;
  setShown('bDaysFieldTop', top);
  setShown('bDaysField', !top);
  $('bDaysTopHint').textContent = rotOn
    ? t('builder.daysRotateHint')
    : t('builder.daysPlanHint');
  const box = $(top ? 'bDaysTop' : 'bDays'); box.innerHTML='';
  const owner = rotOn ? draft : curPlan();
  if(!Array.isArray(owner.days)) owner.days = [];
  DAYS.forEach(d=>{
    const b = document.createElement('button');
    b.type='button'; b.className='day-chip'; b.textContent = d;
    b.classList.toggle('act', owner.days.includes(d));
    b.onclick = ()=>{
      owner.days = owner.days.includes(d) ? owner.days.filter(x=>x!==d) : DAYS.filter(x => owner.days.includes(x) || x===d);
      // порядок вариантов пересобирается сразу, но редактируемый остаётся выбранным:
      // иначе смена дня молча перебрасывала бы на соседний вариант
      if(!rotOn){
        const cur = draft.plans[planIdx];
        sortPlans(draft.plans);
        planIdx = Math.max(0, draft.plans.indexOf(cur));
      }
      renderDays();
      renderPlanTabs();
    };
    box.appendChild(b);
  });
}

/* ================= РЕДАКТОР ОДНОГО УПРАЖНЕНИЯ ================= */
let exIdx = -1;      // индекс редактируемого упражнения в текущем варианте
let exDraft = null;  // копия для правки
let exIsNew = false; // упражнение только что заведено и в списке его держит сам редактор

// убрать пустышку, заведённую «Добавить упражнение», если её так и не сохранили
function dropFreshEx(){
  if(!exIsNew) return;
  exIsNew = false;
  try{
    const list = curPlan().exercises;
    if(exIdx >= 0 && list[exIdx]) list.splice(exIdx, 1);
    renderExList();
  }catch(_){}
  exDraft = null; exIdx = -1; exOrig = '';
}

let exOrig = '';  // снимок упражнения на момент открытия — для проверки изменений
function openExercise(i, isNew){
  const list = curPlan().exercises;
  exIdx = i;
  exIsNew = !!isNew;
  exDraft = JSON.parse(JSON.stringify(list[i]));
  // «материализуем» новую модель один раз при открытии: считаем progOn/trackWeight из того,
  // что фактически было (через старый совместимый путь), и с этого момента редактор работает
  // только с явными полями — без этого клики по табам/тумблеру ничего не меняли (progOn
  // оставался null, и hasWeight()/progAxis() продолжали читать по старому пути в обход правки)
  if(exDraft.progOn == null){
    exDraft.progOn = progAxis(exDraft) !== 'none';
    exDraft.trackWeight = hasWeight(exDraft);
  }
  // старые упражнения (и только что заведённые) не знают «отдых после упражнения»
  // отдельно от «между подходами» — на первое открытие подставляем то же число,
  // что и в rest, тем же приёмом, что и progOn/trackWeight выше. С этого момента
  // оно явное: сохранится тем же числом, даже если человек его не тронет.
  if(exDraft.restAfter == null) exDraft.restAfter = exDraft.rest;
  fillExercise();
  buildExMenu();
  // Пока упражнение только ЗАВОДЯТ, дублировать и удалять нечего: в списке оно
  // держится самим редактором и уйдёт само, если уйти без сохранения. Меню с
  // двумя действиями над пустой строкой только путало.
  setShown('exMoreWrap', !exIsNew);
  document.querySelectorAll('#exModeTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
  // Снимок для сравнения снимаем С ФОРМЫ, тем же путём, каким потом сравниваем
  // (applyFormTo), и уже ПОСЛЕ материализации progOn/trackWeight. Раньше снимок
  // брали прямо с черновика — и он не совпадал с формой по типам: в черновике
  // «значение» лежит числом (10), из поля читается строкой ("10"). Строки JSON
  // расходились всегда, поэтому «назад» с упражнения, которого даже не коснулись,
  // каждый раз спрашивало про несохранённые изменения.
  exOrig = JSON.stringify(applyFormTo(JSON.parse(JSON.stringify(exDraft))));
  show('scrExercise');
  window.scrollTo(0, 0);
}

function fillExercise(){
  const ex = exDraft;
  // «тронутые» поля шага и потолка помечаются, чтобы renderProgControls не затирал ввод.
  // При открытии ДРУГОГО упражнения метка должна сбрасываться, иначе в полях остаются
  // цифры предыдущего — и уходят в него при сохранении
  ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
  $('exName').value = ex.name || '';
  $('exValue').value = valueText(ex.value).replace('–', '-');
  $('exSets').value = ex.sets || 1;
  $('exDesc').value = ex.desc || '';
  $('exMistakes').value = ex.mistakes || '';
  $('exVideo').value = ex.video || '';
  $('exWeight').value = ex.weight ? fmtKg(ex.weight) : '';
  renderProgControls();
  $('exWarm').classList.toggle('on', !!ex.warmup);
  $('exSide').classList.toggle('on', !!ex.perSide);
  syncExType();
  syncExWarm();
  renderExMuscles();
  renderExRestChips();
  renderExMedia();
  syncExDetailsSum();
  // обе раскрывашки по умолчанию свёрнуты: при открытии упражнения видно только то,
  // без чего упражнения не существует
  setShown('exDetailsBox', false);
  $('exDetailsToggle').classList.remove('open');
  setShown('exProgBox', false);
  $('exProgToggle').classList.remove('open');
}

// «Как считать» (повторения/время) и «Упражнение с доп. весом» — независимые переключатели:
// вес сочетается с обоими, четыре формата вместо трёх («время и вес» — удержание
// или перенос с грузом: планка с блином, фермерская прогулка).
function syncExType(){
  const reps = exDraft.type !== 'time';
  const withWeight = hasWeight(exDraft);
  $('exTypeReps').classList.toggle('act', reps);
  $('exTypeTime').classList.toggle('act', !reps);
  $('exWeightOn').classList.toggle('on', withWeight);
  $('exValLabel').textContent = reps ? t('builder.repsLabel') : t('builder.secondsLabel');
  $('exValue').placeholder = reps ? t('builder.repsExample2') : t('builder.secondsExample2');
  // Подпись объясняет выбранный формат своими словами: «повт. + 8 кг» в списке
  // не читалось как «повторения и килограммы вместе».
  if($('exTypeHint')){
    $('exTypeHint').textContent = withWeight
      ? t(reps ? 'builder.typeWeightedRepsHint' : 'builder.typeWeightedTimeHint')
      : t(reps ? 'builder.typeRepsHint' : 'builder.typeTimeHint');
  }
  setShown('exWeightRow', withWeight);
  renderProgControls(); // смена формата может сделать текущую ось прогрессии бессмысленной
}
function syncExWarm(){
  setShown('exSetsField', true);
}
function renderExMuscles(){
  const box = $('exMuscles'); box.innerHTML = '';
  if(!Array.isArray(exDraft.muscles)) exDraft.muscles = [];
  MUSCLES.forEach(([id, label])=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = label;
    b.classList.toggle('act', exDraft.muscles.includes(id));
    b.onclick = ()=>{
      exDraft.muscles = exDraft.muscles.includes(id)
        ? exDraft.muscles.filter(x => x !== id)
        : [...exDraft.muscles, id];
      renderExMuscles(); syncExDetailsSum();
    };
    box.appendChild(b);
  });
}
// «12,5» и «12.5» — одинаково допустимый ввод веса
function parseKg(v){
  const n = parseFloat(String(v || '').replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.round(n * 2) / 2 : 0;
}

// подпись шага и плейсхолдер зависят от текущего формата — одно и то же поле,
// разный смысл: прибавка кг / повторений / секунд
// тумблер «усложнять со временем» + поля шага. Для «повторения и вес» полей ДВА сразу —
// вес и повторы растут независимо друг от друга (0 в одном из них = эта ось не растёт,
// решает либо сам человек, либо ИИ по промту). Для простых форматов — одно поле.
function renderProgControls(){
  // разминка выполняется один раз и технически не может «усложняться со временем» —
  // тумблер здесь не имеет смысла, поэтому блокируем его явно, а не просто прячем шаг
  if(exDraft.warmup){
    $('exProgOn').classList.remove('on');
    $('exProgOn').classList.add('disabled');
    $('exProgOn').disabled = true;
    $('exProgOnHint').textContent = t('builder.progressWarmupOff');
    ['exStepRow','exDualRow','exStepBothHint','exSwapRow','exSwapBox'].forEach(id => setShown(id, false));
    syncExProgSum(); syncExNowHints();
    return;
  }
  $('exProgOn').classList.remove('disabled');
  $('exProgOn').disabled = false;

  const on = progAxis(exDraft) !== 'none';
  const period = (typeof draft !== 'undefined' && draft && draft.progression) ? draft.progression : 0;
  $('exProgOn').classList.toggle('on', on);
  if(!on){
    $('exProgOnHint').textContent = t('builder.progressOffHint');
    ['exStepRow','exDualRow','exStepBothHint','exSwapRow','exSwapBox'].forEach(id => setShown(id, false));
    syncExProgSum(); syncExNowHints();
    return;
  }

  $('exProgOnHint').textContent = period
    ? t('builder.progressAutoPeriod',{period:progPeriodLabel(period)})
    : t('builder.progressProgramOff');

  const withWeight = hasWeight(exDraft);
  const isTime = exDraft.type === 'time';
  // Пары «прибавка + потолок» живут одним рядом, показываем те, чья ось у этого
  // упражнения вообще растёт: повторения, вес (обе сразу — это и есть двойная
  // прогрессия) или секунды. Ось известна из формата, гадать не нужно.
  setShown('exStepRow', true);
  setShown('exStepRepsRow', !isTime);
  setShown('exStepMaxRepsRow', !isTime);
  setShown('exStepWeightRow', withWeight);
  setShown('exStepMaxWeightRow', withWeight);
  setShown('exStepTimeRow', isTime);
  setShown('exStepMaxTimeRow', isTime);
  // двойная прогрессия возможна только там, где есть и повторы, и вес
  setShown('exDualRow', withWeight && !isTime);
  $('exDual').classList.toggle('on', !!exDraft.dualProg);
  setShown('exStepBothHint', true);
  // замена нужна только усложняющемуся упражнению — при выключенном тумблере блок скрыт выше
  setShown('exSwapRow', true);
  $('exSwapOn').classList.toggle('on', !!exDraft.swapOn);
  setShown('exSwapBox', !!exDraft.swapOn);
  $('exSwapName').value = exDraft.swapName || '';
  $('exSwapDesc').value = exDraft.swapDesc || '';

  const set = (id, val) => { if(!$(id).dataset.touched) $(id).value = val; };
  if(!isTime){
    set('exStepReps', exDraft.repsStep != null ? exDraft.repsStep : (withWeight ? 0 : 1));
    set('exMaxReps', exDraft.repsMax > 0 ? exDraft.repsMax : '');
  }
  if(withWeight){
    set('exStepWeight', fmtKg(exDraft.wStep != null ? exDraft.wStep : 2));
    set('exMaxWeight', exDraft.weightMax > 0 ? fmtKg(exDraft.weightMax) : '');
  }
  if(isTime){
    set('exStepTime', exDraft.timeStep != null ? exDraft.timeStep : 5);
    set('exMaxTime', exDraft.timeMax > 0 ? exDraft.timeMax : '');
  }
  syncExProgSum(); syncExNowHints();
}

// В полях редактора лежит БАЗА упражнения — то, с чего всё начиналось. Сколько
// человек поднимает и делает СЕЙЧАС, считается само: база + пройденные повышения
// программы + ручная правка с тренировки. Без этой строки правка выглядела сломанной:
// в списке 18 кг, в поле 12, и непонятно, какое из двух чисел ты меняешь.
// Считаем по ФОРМЕ (applyFormTo), а не по черновику: вписанная только что прибавка
// должна отражаться в подсказке сразу, а не после сохранения.
function syncExNowHints(){
  const el = $('exNowHint');
  const p = (typeof draft !== 'undefined' && draft && draft.id) ? draft : null;
  if(!exDraft || !p || exDraft.warmup){ setShown(el, false); return; }
  let probe;
  try{ probe = applyFormTo(JSON.parse(JSON.stringify(exDraft))); }catch(_){ setShown(el, false); return; }
  // Только итог — без разбора «откуда цифра»: пример решения тут не нужен,
  // важно само значение. Диапазон считает progressedRepsRange (растит min и max порознь,
  // режет по потолку), при двойной прогрессии min===max — уже готовое число.
  const parts = [];
  let weightChanged = false;
  if(hasWeight(probe)){
    const base = progBaseValue(probe, 'weight'), now = getExWeight(p.id, probe, p);
    weightChanged = now > 0 && Math.abs(now - base) > 0.01;
    if(weightChanged) parts.push(`${fmtKg(now)} ${t('progress.kg')}`);
  }
  // Растёт вес, а вторая ось (повторы или секунды) сама по себе — нет (обычное
  // дело: «время и вес» просит держать секунды на месте и добавлять только груз):
  // всё равно показываем её рядом с весом, иначе «Сейчас 18 кг» без неё читалась
  // так, будто сколько делать — не сказано.
  if(probe.type === 'time'){
    const base = parseValue(probe.value).min, now = getExProgValue(p.id, probe, p, 'time');
    if(now !== base || weightChanged) parts.push(`${now} ${t('store.secShort')}`);
  } else {
    const base = valueText(probe.value), now = progressedRepsRange(p.id, probe, p).replace('-', '–');
    if(now !== base || weightChanged) parts.push(`${now} ${t('store.repShort')}`);
  }
  if(!parts.length){ setShown(el, false); return; }
  // «повт.» уже заканчивается точкой — не дублируем её точкой предложения
  let sentence = t('builder.nowPrefix',{parts:parts.join(', ')});
  if(sentence.endsWith('.')) sentence = sentence.slice(0, -1);
  el.textContent = sentence + '. ' + t('builder.startValuesHint');
  setShown(el, true);
}

// Сводка в заголовке свёрнутого блока: человек должен понимать, что внутри, не
// открывая его. Читаем поля формы, а не exDraft: вписанное только что число ещё
// не перенесено в черновик (перенос делает applyFormTo при сохранении).
function syncExProgSum(){
  if(exDraft.warmup){ $('exProgSum').textContent = t('builder.warmupNoGrowth'); return; }
  if(progAxis(exDraft) === 'none'){ $('exProgSum').textContent = t('builder.noGrowth'); return; }
  const num = id => parseStepNum($(id).value);
  // Читаем словами: «+2 повт., до 25» пугала, «+2 повт., максимум 25» — уже ближе.
  const part = (stepId, maxId, unit, withMax) => {
    const st = num(stepId), mx = num(maxId);
    if(st == null || st <= 0) return '';
    const s = `+${fmtKg(st)} ${unit}`;
    return withMax && mx > 0 ? t('builder.summaryMax',{value:s,max:fmtKg(mx)}) : s;
  };
  // осей может быть две (вес — независимо от повторений или времени) — тогда
  // предел в строку не влезает, и сводка говорит только про прибавку: подробности —
  // в раскрытом блоке
  const dual = hasWeight(exDraft);
  const bits = exDraft.type === 'time'
    ? [part('exStepTime', 'exMaxTime', t('store.secShort'), !dual)]
    : [part('exStepReps', 'exMaxReps', t('store.repShort'), !dual)];
  if(dual) bits.push(part('exStepWeight', 'exMaxWeight', t('progress.kg'), !dual));
  const txt = bits.filter(Boolean).join(appLocale === 'ru' ? ' и ' : ' & ');
  $('exProgSum').textContent = txt || t('builder.emptyProgress');
}


// Одно значение — один видимый контрол. Раньше рядом с чипами стояло числовое
// поле, нужное только тем, кому не подходит ни один чип, — и висело в разметке
// всегда. Теперь свой отдых вводится в попапе #restModal, а в самом экране
// остаются только чипы. Два независимых ряда — «между подходами» и «после
// упражнения» — используют одни и те же чипы и один и тот же попап; какой ряд
// сейчас редактируют, помнит restModalKey.
const REST_CHIPS = [0, 15, 30, 45, 60];
const restCustom = {rest: false, restAfter: false};
function renderRestChipsInto(boxId, key){
  const cur = parseInt(exDraft[key]) || 0;
  if(!REST_CHIPS.includes(cur)) restCustom[key] = true;
  const box = $(boxId); box.innerHTML = '';
  REST_CHIPS.forEach(v=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'load-chip';
    b.textContent = v === 0 ? t('builder.none') : String(v);
    b.classList.toggle('act', !restCustom[key] && cur === v);
    b.onclick = ()=>{
      restCustom[key] = false;
      exDraft[key] = v;
      renderRestChipsInto(boxId, key);
    };
    box.appendChild(b);
  });
  const own = document.createElement('button');
  own.type = 'button'; own.className = 'load-chip';
  own.textContent = restCustom[key] ? String(cur) : t('builder.custom');
  own.classList.toggle('act', restCustom[key]);
  own.onclick = ()=> openRestModal(key, boxId);
  box.appendChild(own);
}
function renderExRestChips(){
  renderRestChipsInto('exRestChips', 'rest');
  renderRestChipsInto('exRestAfterChips', 'restAfter');
}
let restModalKey = null, restModalBoxId = null;
function openRestModal(key, boxId){
  restModalKey = key; restModalBoxId = boxId;
  $('restModalTitle').textContent = key === 'rest' ? t('builder.customRestSets') : t('builder.customRestAfter');
  $('restModalInput').value = parseInt(exDraft[key]) || '';
  $('restModal').classList.add('open');
  $('restModalInput').focus();
}
$('restModalDone').onclick = ()=>{
  if(!restModalKey) return;
  exDraft[restModalKey] = Math.max(0, Math.min(600, parseInt($('restModalInput').value) || 0));
  restCustom[restModalKey] = true;
  $('restModal').classList.remove('open');
  renderRestChipsInto(restModalBoxId, restModalKey);
};
function renderExMedia(){
  const box = $('exMediaPrev');
  const m = exDraft.media;
  if(m && m.kind === 'img') box.innerHTML = `<img src="${esc(m.data)}" alt="">`;
  else box.innerHTML = `<span class="mp-empty">${esc(t('builder.noImage'))}</span>`;
}
function syncExDetailsSum(){
  const bits = [];
  if((exDraft.desc || '').trim()) bits.push(t('builder.detailDescription'));
  if((exDraft.mistakes || '').trim()) bits.push(t('builder.detailMistakes'));
  if((exDraft.muscles || []).length) bits.push(t('builder.detailMuscles'));
  if(exDraft.media) bits.push(t('builder.detailImage'));
  if((exDraft.video || '').trim()) bits.push(t('builder.detailVideo'));
  $('exDetailsSum').textContent = bits.length ? bits.join(', ') : t('builder.notFilled');
}

// переносит текущее состояние формы в объект упражнения (черновик или его снимок) —
// общая логика для exDirty (сравнение) и commitExercise (сохранение), чтобы не дублировать
function applyFormTo(target){
  target.name = $('exName').value.trim();
  target.value = normValue($('exValue').value, target.type);
  target.sets = target.warmup ? 1 : Math.max(1, Math.min(10, parseInt($('exSets').value) || 1));
  // rest/restAfter не читаем из формы — чипы и попап #restModal пишут прямо в
  // exDraft при клике, а target уже клон exDraft на момент вызова
  target.desc = $('exDesc').value.trim();
  target.mistakes = $('exMistakes').value.trim();
  target.video = $('exVideo').value.trim();
  target.weight = parseKg($('exWeight').value);
  // читаем оба поля шага независимо — для «повторения и вес» обе цифры реальны одновременно,
  // и явный 0 в любом из них означает «эта ось у этого упражнения не растёт» (не путать
  // с пустым полем, куда ещё не вписали ничего — там остаётся дефолт оси)
  if(target.progOn){
    const num = (id, def, round) => {
      const n = parseStepNum($(id).value);
      return n != null ? round(n) : def;
    };
    if(target.type !== 'time'){
      target.repsStep = num('exStepReps', hasWeight(target) ? 0 : 1, Math.round);
      target.repsMax = num('exMaxReps', 0, Math.round);   // 0 = потолка нет
    }
    if(hasWeight(target)){
      target.wStep = num('exStepWeight', 2, v => Math.round(v * 2) / 2);
      target.weightMax = num('exMaxWeight', 0, v => Math.round(v * 2) / 2);
    }
    if(target.type === 'time'){
      target.timeStep = num('exStepTime', 5, Math.round);
      target.timeMax = num('exMaxTime', 0, Math.round);
    }
    target.swapName = $('exSwapName').value.trim().slice(0, 60);
    target.swapDesc = $('exSwapDesc').value.trim().slice(0, 600);
    target.swapOn = !!(target.swapOn && target.swapName);
  }
  return target;
}
// есть ли несохранённые правки
function exDirty(){
  if(!exDraft || exIdx < 0) return false;
  const snapshot = applyFormTo(JSON.parse(JSON.stringify(exDraft)));
  return JSON.stringify(snapshot) !== exOrig;
}

function commitExercise(){
  const old = (curPlan().exercises || [])[exIdx];
  const upd = applyFormTo(exDraft);
  return old ? carryExerciseProgress(old, upd) : upd;
}

// Разминка выполняется один раз ДО кругов, где бы она ни лежала в списке
// (см. buildSteps: warmEx идут первыми). Значит и список обязан показывать
// порядок выполнения — иначе перетаскивание разминки вниз «получалось», но на
// тренировке ничего не менялось, и номера строк врали.
function sortWarmFirst(list){
  const w = list.filter(e => e.warmup), m = list.filter(e => !e.warmup);
  if(!w.length || !m.length) return list;
  list.length = 0;
  list.push(...w, ...m);
  return list;
}
function renderExList(){
  const box = $('bExList'); box.innerHTML = '';
  const list = sortWarmFirst(curPlan().exercises);
  if(!list.length){
    box.innerHTML = '<div class="empty-state">' +
      `<span class="es-ico">${icon('dumbbell')}</span>` +
      `<b>${esc(t('builder.noExercisesTitle'))}</b>` +
      `<p>${esc(t('builder.noExercisesText'))}</p>` +
      '</div>';
  }
  list.forEach((ex, i)=> box.appendChild(exRow(ex, i)));
  syncVolHint();
  const nWarm = list.filter(e => e.warmup).length;
  const nMain = list.length - nWarm;
  const full = nWarm >= MAX_WARM && nMain >= MAX_MAIN;
  setShown('btnAddEx', !full);
  const note = list.length ? storeCountText(list.length,'exercise') : '';
  $('exCountNote').textContent = note;
  syncImagesSum();
  // объясняем, к чему относится список упражнений
  const plans = draft.plans || [];
  const pl = curPlan();
  const titleEl = $('bVariantTitle'), h = $('bVariantHint');
  if(plans.length > 1){
    const rot = !!draft.rotate;
    const days = (pl.days || []).length ? pl.days.map(canonicalLabel).join(', ') : '';
    titleEl.textContent = t('builder.variantExercises',{current:planIdx+1,total:plans.length});
    h.textContent = rot
      ? t('builder.variantExercisesHint')
      : (days
          ? t('builder.variantOnDays',{days})
          : t('builder.variantNoDays'));
    setShown(h, true);
  } else {
    titleEl.textContent = t('builder.exercisesTitle');
    const d1 = (pl.days || []).length ? pl.days.map(canonicalLabel).join(', ') : '';
    h.textContent = d1
      ? t('builder.scheduleExercises',{days:d1})
      : t('builder.anyDayExercises');
    setShown(h, true);
  }
}

// объём упражнения разложен по кускам: в строке списка каждый кусок — отдельная
// метка (и они переносятся), в тексте — те же куски через точку
function exBits(ex){
  const bits = [];
  // Показываем РАБОЧИЕ числа — те, что будут на ближайшей тренировке, а не базу
  // из полей редактора. Программу с «ВЕС: 12» и тремя пройденными повышениями
  // список упрямо показывал двенадцатью килограммами, и прогрессия выглядела
  // сломанной. Раньше вес считался без программы (getExWeight без третьего
  // аргумента), а значит без её шагов — то есть всегда по базе.
  const p = (typeof draft !== 'undefined' && draft && draft.id) ? draft : null;
  bits.push(ex.type === 'time'
    ? `${p ? getExProgValue(p.id, ex, p, 'time') : parseValue(ex.value).min} ${t('store.secShort')}`
    : `${(p ? progressedRepsRange(p.id, ex, p) : valueText(ex.value)).replace('-', '–')} ${t('store.repShort')}`);
  const sets = Math.max(1, parseInt(ex.sets) || 1);
  if(sets > 1) bits.push(storeCountText(sets,'set'));
  if(hasWeight(ex)){
    const w = p ? getExWeight(p.id, ex, p) : (+ex.weight || 0);
    if(w) bits.push(`${fmtKg(w)} ${t('progress.kg')}`);
  }
  if(ex.perSide) bits.push(t('store.perSide'));
  if(+ex.rest > 0) bits.push(`${t('workout.rest')} ${ex.rest} ${t('store.secShort')}`);
  return bits;
}
function exSummary(ex){ return exBits(ex).join(' · '); }

// Номер считаем только по основным упражнениям: разминка идёт один раз до кругов,
// где бы она ни лежала в списке, и сквозная нумерация врала бы о порядке.
function exThumb(ex, i){
  if(ex.media && ex.media.kind === 'img') return `<img src="${esc(ex.media.data)}" alt="">`;
  if(ex.warmup) return icon('flame');
  const before = curPlan().exercises.slice(0, i).filter(e => !e.warmup).length;
  return String(before + 1);
}

// Дублирование и удаление ПРЯМО ИЗ СПИСКА: те же действия есть и в редакторе, но
// ради них не должно быть нужно открывать упражнение.
function dupExerciseAt(i){
  const list = curPlan().exercises;
  const ex = list[i];
  if(!ex) return;
  const nWarm = list.filter(x => x.warmup).length;
  if(ex.warmup ? nWarm >= MAX_WARM : list.length - nWarm >= MAX_MAIN){
    appAlert(ex.warmup
      ? t('builder.warmLimit',{count:MAX_WARM})
      : t('builder.mainLimit',{count:MAX_MAIN}));
    return;
  }
  list.splice(i + 1, 0, cloneExerciseAsNew(ex));
  renderExList();
}
async function delExerciseAt(i){
  const list = curPlan().exercises;
  const ex = list[i];
  if(!ex) return;
  const nameTxt = (ex.name || '').trim() || t('exercise.this');
  if(!(await appDialog(t('exercise.deleteQuestion',{name:nameTxt}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  list.splice(i, 1);
  renderExList();
}

function exRow(ex, i){
  const row = document.createElement('div');
  row.className = 'ex-row' + (ex.warmup ? ' warm' : '');
  row.dataset.idx = String(i);

  const thumb = document.createElement('div');
  thumb.className = 'ex-thumb';
  thumb.innerHTML = exThumb(ex, i);

  const info = document.createElement('div');
  info.className = 'ex-info';
  const name = document.createElement('b');
  name.textContent = (ex.name || '').trim() || t('store.untitled');
  const meta = document.createElement('div');
  meta.className = 'ex-meta';
  const tag = (txt, cls) => {
    const el = document.createElement('span');
    if(cls) el.className = cls;
    el.textContent = txt;
    meta.appendChild(el);
  };
  if(ex.warmup) tag(t('store.warmup'), 'wm');
  exBits(ex).forEach(txt => tag(txt));
  const grow = progShort(ex);
  if(grow) tag(grow, 'grow');
  info.append(name, meta);

  // Справа всё как у карточки программы: «⋮» сверху, ручка перетаскивания снизу.
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'more-btn';
  more.innerHTML = icon('more');
  more.title = t('common.actions');
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  const item = (html, fn, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    if(cls) b.className = cls;
    b.innerHTML = html;
    b.onclick = e => { e.stopPropagation(); closeAllMenus(); fn(); };
    menu.appendChild(b);
  };
  item(icon('plus') + t('common.duplicate'), ()=> dupExerciseAt(i));
  item(icon('trash') + t('common.delete'), ()=> delExerciseAt(i), 'danger');
  more.onclick = e => { e.stopPropagation(); toggleMenu(menu); };

  const grip = document.createElement('div');
  grip.className = 'ex-grip';
  grip.innerHTML = icon('grip');
  grip.title = t('programs.drag');

  row.append(thumb, info, more, grip, menu);
  // Нажатие на саму строку открывает редактор; перетаскивание начинается только
  // с ручки и клика по строке не даёт.
  row.onclick = e => {
    if(grip.contains(e.target) || more.contains(e.target) || menu.contains(e.target)) return;
    openExercise(i);
  };

  enableDrag(row, grip, '.ex-row', nodes => {
    const order = nodes.map(n => +n.dataset.idx);
    const arr = curPlan().exercises;
    curPlan().exercises = order.map(idx => arr[idx]);
    renderExList();   // sortWarmFirst внутри вернёт разминку наверх
  });
  return row;
}

// уменьшаем фото до 640px по большей стороне, чтобы программа занимала мало места
function shrinkImage(file, maxSide, cb){
  const img = new Image();
  img.onload = ()=>{
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL('image/jpeg', .8));
    URL.revokeObjectURL(img.src);
  };
  img.onerror = ()=> appAlert(t('builder.imageReadFailed'));
  img.src = URL.createObjectURL(file);
}

/* ================= СОЗДАНИЕ ИЗ ТЕКСТА ================= */
function aiPrompt(locale){
  const outLocale=(locale==='ru'||locale==='en')?locale:appLocale;
  const lang=outLocale==='ru'?'Russian':'English';
  return FitAIProtocol.programPrompt(lang);
}

function aiProtocolLine(line){
  const m=String(line||'').match(/^([А-ЯЁ][А-ЯЁ ]{1,40}):\s*(.*)$/);
  return m?{key:m[1],value:m[2]}:null;
}
function aiExerciseBlocks(text){
  const lines=String(text||'').split(/\r?\n/),out=[];
  for(let i=0;i<lines.length;i++){
    if(!/^УПРАЖНЕНИЕ:\s*/i.test(lines[i])) continue;
    let end=i+1;
    while(end<lines.length&&!/^УПРАЖНЕНИЕ:\s*/i.test(lines[end])&&!/^ДЕНЬ:\s*/i.test(lines[end]))end++;
    out.push({start:i,end,lines:lines.slice(i,end),name:(aiProtocolLine(lines[i])||{}).value||''});
    i=end-1;
  }
  return out;
}
// Раньше здесь жили aiMergeExerciseBlock/aiMergeProgramEdit — они принудительно
// возвращали старую структуру (порядок, число упражнений) и подставляли от ИИ
// только значения полей. Простые запросы вроде «поменяй порядок» или «добавь
// упражнение» либо тихо ничего не меняли, либо ловили ошибку разбора. Теперь
// ответ ИИ принимается как есть (см. createEditedProgram/applyExEdit), а его
// итог проверяется парсингом и FitAIProtocol.diffPrograms — не запрещается заранее.

// В отличие от parseKg (там 0 бессмысленный стартовый вес — трактуем как «не задано»),
// здесь 0 — ЗНАЧИМОЕ значение: «эту ось для этого упражнения не растим». Отличаем
// «не указано вовсе» (возвращаем null, пусть вызывающий код подставит дефолт оси)
// от «явно указано 0» — иначе классическая ошибка JS (0 || default) тихо портит логику.
function parseStepNum(v){
  if(v == null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : null;
}

const DAY_ALIASES = {
  'пн':'Пн','понедельник':'Пн','вт':'Вт','вторник':'Вт','ср':'Ср','среда':'Ср',
  'чт':'Чт','четверг':'Чт','пт':'Пт','пятница':'Пт','сб':'Сб','суббота':'Сб',
  'вс':'Вс','воскресенье':'Вс'
};

/* Все ключи, которые понимает парсер. Берём их ИЗ САМОГО ПАРСЕРА, а не списком
   рядом: список пришлось бы помнить, а расходятся такие пары тихо — новый ключ
   заработал бы в разборе и не заработал бы в починке ниже. Сборки в проекте нет,
   имена в исходнике остаются как написаны, так что читать их оттуда безопасно. */
let PARSE_KEYS = null;
function parseKeys(){
  if(PARSE_KEYS) return PARSE_KEYS;
  const out = [];
  const src = String(parseProgramText);
  const re = /case\s*'([А-ЯЁ][А-ЯЁ\s]*)'/g;
  let m;
  while((m = re.exec(src))) out.push(m[1].trim());
  // Длинные вперёд: иначе «ОТДЫХ» срабатывает раньше «ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ»
  // и режет строку посередине ключа.
  PARSE_KEYS = [...new Set(out)].sort((a, b) => b.length - a.length);
  return PARSE_KEYS;
}

/* Починка текста, у которого пропали переносы строк.

   Некоторые чаты с ИИ отдают ответ так, что при копировании переносы теряются, и
   вся программа приезжает одной строкой: «ПРОГРАММА: Сила дома ДНИ: Пн КРУГИ: 3…».
   Разбор на этом ломался молча и целиком: первая строка съедала всё, программа
   получалась из одного названия без единого упражнения.

   Просить ИИ ставить особый символ — не выход: во-первых, его теряют ровно так же,
   во-вторых, весь уже написанный текст (каталог, сохранённые программы, чужие
   ссылки) этого символа не знает, и формат пришлось бы менять дважды. Чинить надо
   то, что пришло, а не требовать другого.

   Ключи известны наперёд, и ключ в середине строки — это всегда начало новой:
   в значении «ДНИ:» с двоеточием взяться неоткуда. Ставим перенос перед каждым
   таким ключом. Уже целый текст правило не трогает: там перед ключом и так
   перенос. */
function repairLines(txt){
  const keys = parseKeys();
  if(!keys.length) return txt;   // не вышло прочитать ключи — не трогаем текст вовсе
  const alt = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return txt
    // ключ посреди строки: перед ним пробел, а не начало строки
    .replace(new RegExp('([^\\n])[ \\t]+(' + alt + ')[ \\t]*:', 'g'), '$1\n$2:')
    // хвостовые маркеры списка: «УПРАЖНЕНИЕ: Приседания -» после разреза остаётся
    // от «- ФОРМАТ:», и дефис прилипал бы к названию
    .replace(/[ \t]*[•*\u2013-]+[ \t]*$/gm, '');
}

function parseProgramText(txt){
  const p = {id:'p'+Date.now(), name:'', time:'', cover:null, stats:{completions:0}, progression:0, plans:[]};
  let plan = null;
  let cur = null;
  const errors = [];
  const ensurePlan = ()=>{
    if(!plan){
      plan = {days:[], rounds:3, roundRest:120, exercises:[]};
      p.plans.push(plan);
    }
    return plan;
  };
  // раскладывает накопленный «сырой» ШАГ в нужное поле (вес/повторы/время) по итоговому
  // формату упражнения — вызывается, когда упражнение точно больше не изменится
  const finalizeExercise = ex => {
    if(!ex) return;
    if(ex._rawStep != null){
      const n = ex._rawStep; // уже прошёл parseStepNum — либо валидное число (включая 0), либо сюда не попал бы
      if(ex.type === 'time') ex.timeStep = Math.round(n);
      else if(ex.trackWeight) ex.wStep = Math.round(n * 2) / 2;
      else ex.repsStep = Math.round(n);
      delete ex._rawStep;
    }
    // ПОТОЛОК раскладываем так же, как ШАГ: смысл числа задаёт формат упражнения,
    // а строка ФОРМАТ могла встретиться в тексте и позже
    if(ex._rawMax != null){
      const n = ex._rawMax;
      if(ex.type === 'time') ex.timeMax = Math.round(n);
      else if(ex.trackWeight) ex.weightMax = Math.round(n * 2) / 2;
      else ex.repsMax = Math.round(n);
      delete ex._rawMax;
    }
    // «Повторения и вес»: повторения растут, только если про них сказали явно.
    // Промт так и просит — когда растёт только вес (обычное дело), в ответе одна
    // строка «ШАГ ВЕСА». Раньше упражнение всё равно получало шаг повторений из
    // заготовки пустого упражнения, и тренировка прибавляла по повторению за раз
    // вопреки ответу: «10 повторений × 8 кг» через три повышения превращалось
    // в «13 повторений × 14 кг».
    if(ex.trackWeight && ex.type !== 'time' && !ex._gotRepsStep) ex.repsStep = 0;
    delete ex._gotRepsStep;
    // двойная прогрессия имеет смысл только с весом и потолком повторов —
    // иначе неоткуда взяться моменту «повторы упёрлись, добавляем вес»
    if(ex.dualProg && !(ex.trackWeight && ex.repsMax > 0)) ex.dualProg = false;
    // замена без названия — это просто пустой флаг, он ничего не покажет
    if(!(ex.swapName || '').trim()){ ex.swapOn = false; ex.swapName = ''; ex.swapDesc = ''; }
    else ex.swapOn = true;
  };
  const parseDays = val => {
    const list = val.split(/[,;]/).map(d => DAY_ALIASES[d.trim().toLowerCase()]).filter(Boolean);
    return DAYS.filter(d => list.includes(d));
  };
  const lines = repairLines(txt.replace(/\*\*/g,'')).split(/\r?\n/);
  for(let raw of lines){
    const line = raw.replace(/^[\s#>*•\-–]+/,'').trim();
    if(!line) continue;
    const m = line.match(/^([А-ЯЁA-Zа-яёa-z\s]+?)\s*:\s*(.*)$/);
    if(!m) continue;
    const key = m[1].trim().toUpperCase();
    const val = m[2].trim();
    switch(key){
      case 'ПРОГРАММА': case 'НАЗВАНИЕ ПРОГРАММЫ': p.name = val; break;
      case 'ОПИСАНИЕ ПРОГРАММЫ': case 'О ПРОГРАММЕ': p.desc = val.slice(0, 1000); break;
      case 'ВРЕМЯ': {
        const t = val.match(/^(\d{1,2}):(\d{2})/);
        if(t){
          const h = +t[1], mn = +t[2];
          if(h >= 0 && h <= 23 && mn >= 0 && mn <= 59) p.time = String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
        }
        break;
      }
      case 'ДЕНЬ': {
        // новый вариант тренировки для указанных дней
        if(p.plans.length >= 7){ plan = null; cur = null; break; }
        plan = {days: parseDays(val), rounds:3, roundRest:120, exercises:[]};
        p.plans.push(plan);
        cur = null;
        break;
      }
      case 'ДНИ': ensurePlan().days = parseDays(val); break;
      case 'КРУГИ': case 'КРУГОВ': ensurePlan().rounds = Math.max(1, Math.min(10, parseInt(val)||3)); break;
      case 'ОТДЫХ МЕЖДУ КРУГАМИ': ensurePlan().roundRest = Math.max(0, Math.min(600, parseInt(val)||0)); break;
      case 'ВРЕМЯ ВАРИАНТА': {
        const t = val.match(/^(\d{1,2}):(\d{2})/);
        if(t){
          const h = +t[1], mn = +t[2];
          if(h >= 0 && h <= 23 && mn >= 0 && mn <= 59) ensurePlan().time = String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
        }
        break;
      }
      case 'ЧЕРЕДОВАНИЕ': case 'РОТАЦИЯ':
        p.rotate = !/нет|off|false|0/i.test(val);
        break;
      case 'ДНИ ТРЕНИРОВОК': case 'ДНИ НЕДЕЛИ':
        p.days = parseDays(val); // общее расписание программы (используется при чередовании)
        break;
      case 'УПРАЖНЕНИЕ': {
        finalizeExercise(cur); // предыдущее упражнение точно готово — раскладываем его ШАГ
        ensurePlan();
        if(plan.exercises.length >= MAX_EX){ cur = null; break; }
        cur = blankExercise();
        cur.name = val;
        cur.rest = 0;
        cur.sets = 1;
        plan.exercises.push(cur);
        break;
      }
      // техническая метка сопоставления при AI-правке (см. programToText(…,{forEdit:true}));
      // человеку не показывается и никогда не сохраняется — см. createEditedProgram
      case 'КОД': if(cur) cur._code = val.trim().slice(0, 20); break;
      case 'ОПИСАНИЕ': if(cur) cur.desc = val.slice(0,600); break;
      case 'ФОРМАТ':
        if(cur){
          const v = val.toLowerCase();
          cur.type = /врем|сек|time/.test(v) ? 'time' : 'reps';
          // «и вес» — отдельно от простого формата, у обеих осей (повторения и
          // время): удержание с утяжелением, фермерская прогулка на время. Порядок
          // важен: слово «вес» не должно случайно сработать на будущей строке
          // УСЛОЖНЯТЬ, поэтому проверяем здесь и сразу.
          if(/вес/.test(v)) cur.trackWeight = true;
        }
        break;
      case 'ЗНАЧЕНИЕ': case 'ПОВТОРЕНИЯ': case 'СЕКУНДЫ':
        if(cur){
          cur.value = normValue(val, cur.type);
          // «по 10 на каждую ногу» прямо в значении
          if(/кажд|сторон|ногу|руку|на бок/i.test(val)) cur.perSide = true;
        }
        break;
      case 'ПОДХОДЫ': case 'ПОДХОДОВ': case 'СЕТЫ':
        if(cur) cur.sets = Math.max(1, Math.min(10, parseInt(val) || 1));
        break;
      case 'СТОРОНА': case 'НА КАЖДУЮ СТОРОНУ':
        if(cur) cur.perSide = !/нет|no|false|0/i.test(val);
        break;
      case 'РАЗМИНКА':
        if(cur){
          const wantWarm = !/нет|no|false|0/i.test(val);
          // не больше MAX_WARM разминочных на вариант
          const warmCount = plan.exercises.filter(e => e.warmup && e !== cur).length;
          cur.warmup = wantWarm && warmCount < MAX_WARM;
          // подходы у разминки больше не сбрасываются: она отличается от обычного
          // упражнения только тем, что идёт в начале и один раз, до кругов
        }
        break;
      case 'ОТДЫХ': if(cur) cur.rest = Math.max(0, Math.min(600, parseInt(val)||0)); break;
      case 'ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ': if(cur) cur.restAfter = Math.max(0, Math.min(600, parseInt(val)||0)); break;
      case 'МЫШЦЫ': {
        if(cur){
          const labels = val.split(/[,;]/).map(s => s.trim().toLowerCase());
          cur.muscles = MUSCLES.filter(([id, l]) => labels.includes(l.toLowerCase())).map(([id]) => id);
        }
        break;
      }
      case 'ОШИБКИ': if(cur) cur.mistakes = val.slice(0, 300); break;
      case 'ПРОГРЕССИЯ': {
        // если ИИ написал это внутри упражнения и имел в виду ось усложнения — трактуем так
        if(cur && /вес|повтор|врем|нет/i.test(val) && !/недел/i.test(val)){
          const v = val.toLowerCase();
          if(/вес|кг|гантел|штанг|гир/.test(v)) cur.prog = 'weight';
          else if(/врем|секунд|удержан/.test(v)) cur.prog = 'time';
          else if(/повтор/.test(v)) cur.prog = 'reps';
          else if(/нет|не усложн/.test(v)) cur.prog = 'none';
          break;
        }
        if(/нет|no|выкл|без/i.test(val)){ p.progression = 0; break; }
        const num = parseInt(String(val).match(/\d+/));
        if(isFinite(num) && num > 0){ p.progression = clampProgEvery(num); break; }
        // прежние формулировки в неделях: переводим в тренировки из расчёта ~3 занятия в неделю
        if(/недел/i.test(val)) p.progression = /2|две/i.test(val) ? 6 : 3;
        else p.progression = 0;
        break;
      }
      case 'ВИДЕО': if(cur && val) cur.video = val; break;
      case 'УСЛОЖНЯТЬ': case 'КАК УСЛОЖНЯТЬ': {
        // новая форма — просто да/нет, ось решает уже распарсенный ФОРМАТ этого же упражнения.
        // старая форма (одно из четырёх слов: повторения/вес/время/нет) распознаётся тоже —
        // на случай ручной вставки текста, собранного по прежней версии промта.
        if(!cur) break;
        const v = val.toLowerCase();
        // \b (граница слова) в JS не распознаёт кириллицу — используем явный конец строки/пробел
        if(/^да(\s|$)|^yes(\s|$)/.test(v)) cur.progOn = true;
        else if(/нет|не усложн|^no(\s|$)/.test(v)) cur.progOn = false;
        else if(/вес|кг|гантел|штанг|гир/.test(v)){ cur.progOn = true; cur.trackWeight = true; }
        else if(/врем|секунд|удержан/.test(v)){ cur.progOn = true; cur.type = 'time'; }
        else if(/повтор/.test(v)){ cur.progOn = true; cur.trackWeight = false; }
        break;
      }
      case 'ВЕС': if(cur) cur.weight = parseKg(val); break;
      // единый ключ ШАГ: что именно он значит — зависит от формата этого упражнения,
      // распарсенного строкой раньше (ФОРМАТ идёт в спецификации перед УСЛОЖНЯТЬ и ШАГ)
      // не резолвим сразу: ШАГ мог встретиться в тексте РАНЬШЕ строки ФОРМАТ, а его смысл
      // (кг / повторы / секунды) зависит именно от формата. Копим «сырым» и решаем один раз
      // при завершении упражнения — см. finalizeExercise ниже. Так порядок строк не важен.
      case 'ШАГ': if(cur){ const n = parseStepNum(val); if(n != null) cur._rawStep = n; } break;
      // старые раздельные ключи шага — поддержаны для устойчивости к прежнему формату текста
      case 'ШАГ ВЕСА': if(cur){ const n = parseStepNum(val); cur.wStep = n != null ? Math.round(n * 2) / 2 : 2; } break;
      case 'ШАГ ПОВТОРОВ': if(cur){ const n = parseStepNum(val); cur.repsStep = n != null ? Math.round(n) : 1; cur._gotRepsStep = true; } break;
      case 'ШАГ ВРЕМЕНИ': if(cur){ const n = parseStepNum(val); cur.timeStep = n != null ? Math.round(n) : 5; } break;
      // потолок роста: выше него прогрессия не поднимает. Единый ключ ПОТОЛОК разбирается
      // по формату упражнения в finalizeExercise, раздельные — сразу
      case 'ПОТОЛОК': if(cur){ const n = parseStepNum(val); if(n != null) cur._rawMax = n; } break;
      case 'ПОТОЛОК ПОВТОРОВ': if(cur){ const n = parseStepNum(val); if(n != null) cur.repsMax = Math.round(n); } break;
      case 'ПОТОЛОК ВЕСА': if(cur){ const n = parseStepNum(val); if(n != null) cur.weightMax = Math.round(n * 2) / 2; } break;
      case 'ПОТОЛОК ВРЕМЕНИ': if(cur){ const n = parseStepNum(val); if(n != null) cur.timeMax = Math.round(n); } break;
      case 'ПРИ ПОТОЛКЕ': case 'ДВОЙНАЯ ПРОГРЕССИЯ':
        if(cur) cur.dualProg = !/нет|no|false|0/i.test(val);
        break;
      case 'ЗАМЕНА': if(cur) cur.swapName = val.slice(0, 60); break;
      case 'ОПИСАНИЕ ЗАМЕНЫ': case 'ЗАМЕНА ОПИСАНИЕ': if(cur) cur.swapDesc = val.slice(0, 600); break;
    }
  }
  finalizeExercise(cur); // последнее упражнение в тексте — цикл закончился, но раскладку сделать нужно
  // выбрасываем пустые варианты
  p.plans = p.plans.filter(pl => pl.exercises.length);
  // Ошибки — человеческим языком, без ключей формата. Ключи («ПРОГРАММА:»,
  // «УПРАЖНЕНИЕ:») жили в тексте ошибки нарочно, чтобы человек понял, чего не
  // хватило; на деле они только пугали. Теперь объясняем смысл, а не синтаксис.
  if(!p.name) errors.push(t('parser.noName'));
  if(!p.plans.length) errors.push(t('parser.noExercises'));
  /* Пределы полей — здесь, а не в каждом разборе отдельно. Через эту функцию
     проходит ВСЁ, что становится программой из текста: ответ нейросети, позиция
     каталога, обмен через programToText. Название в мегабайт приезжает ровно так
     же, как приезжает нормальное, и обрезать его надо там, где текст становится
     программой. */
  sanitizeProgram(p);
  return {program:p, errors};
}

/* ================= ЗАПРОС К ИИ В ОДНО КАСАНИЕ ================= */
// Отметка «Беременность» уходит в запрос к нейросети как обычное ограничение, а
// нейросеть не знает ни срока, ни самочувствия. Один раз на выбор показываем это
// прямым текстом и даём ход к разделу «Здоровье и безопасность».
async function pregnancyWarning(){
  const go = await appDialog(
    t('pregnancy.warning'),
    {confirm:true,okText:t('common.ok'),cancelText:t('common.details')}
  );
  if(!go) openLegal('health', ()=> goBackTo('scrAI'));
}

const Q_OPTS = {
  goal: OPT_GOAL,
  level: OPT_LEVEL,
  dur: ['5 мин', '10 мин', '15 мин', '20 мин', '30 мин', '40 мин', '45+ мин'],
  // мышцы — строгий список MUSCLES: его же понимает парсер и просит промт
  focus: MUSCLES.map(m => m[1]),
  equip: OPT_EQUIP,
  limit: ['Без ограничений', 'Без прыжков', 'Тихо (соседи снизу)', 'Берегу колени', 'Берегу поясницу', 'Берегу запястья', 'Берегу шею', 'Беременность'],
  style: ['Круговая', 'Силовая', 'Смешанная'],
  warm: ['С разминкой', 'Без разминки']
};
// Дефолты интерфейса не считаются осмысленным запросом пользователя: они лишь
// дают ИИ безопасную отправную точку. Длительность обязательна и не может быть снята.
const AI_DEFAULT_LEVEL = 'Новичок';
const AI_DEFAULT_DURATION = '10 мин';
const AI_DEFAULT_LIMITS = ['Без ограничений'];
const q = {goal: [], level: AI_DEFAULT_LEVEL, days: [], dur: AI_DEFAULT_DURATION, focus: [], equip: [], limit: AI_DEFAULT_LIMITS.slice(),
           note: '', split: false, style: '', warm: '', rotate: false};

function qChips(boxId, opts, isMulti, get, set, requiredSingle = false){
  const box = $(boxId); box.innerHTML = '';
  opts.forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = canonicalLabel(o);
    const sel = get();
    b.classList.toggle('act', isMulti ? sel.includes(o) : sel === o);
    b.onclick = ()=>{
      if(isMulti){
        let arr = get();
        const none = opts.find(x => OPT_NONE.has(x));
        if(none && o === none){ arr = arr.includes(none) ? [] : [none]; }
        else {
          if(none) arr = arr.filter(x => x !== none);
          arr = arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o];
        }
        set(arr);
      } else set(requiredSingle ? o : (get() === o ? '' : o));
      qChips(boxId, opts, isMulti, get, set, requiredSingle);
    };
    box.appendChild(b);
  });
}

// варианты, разницу между которыми по одному слову не понять: показываем описанием,
// а не мелкой подсказкой под рядом одинаковых чипов
const Q_DESC = {
  'Круговая': 'Проходишь весь список по разу и возвращаешься к началу: A, B, C → A, B, C. Пульс выше, скучать некогда.',
  'Силовая': 'Сначала все подходы одного упражнения, потом следующее: A, A, A → B, B, B. Мышца устаёт сильнее.',
  'Смешанная': 'Несколько упражнений идут блоком, и этот блок повторяется кругами.',
  'С разминкой': 'Пара лёгких упражнений в начале — один раз, до кругов.',
  'Без разминки': 'Сразу к основной части: если разминка уже сделана или это продолжение другой тренировки.'
};
// выбор одного варианта с пояснением; повторное нажатие снимает выбор
function qCards(boxId, opts, get, set){
  const box = $(boxId); box.innerHTML = '';
  opts.forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt-card';
    b.classList.toggle('act', get() === o);
    b.innerHTML = `<span class="oc-mark">${icon('check')}</span><span class="oc-txt"><b></b><small></small></span>`;
    b.querySelector('b').textContent = canonicalLabel(o);
    b.querySelector('small').textContent = canonicalDescription(o) || Q_DESC[o] || '';
    b.onclick = ()=>{ set(get() === o ? '' : o); qCards(boxId, opts, get, set); };
    box.appendChild(b);
  });
}

function initAIForm(){
  requireWho('ai', ()=> goTab('scrPrograms'));   // данные уходят прямо в запрос (userForAI)
  qChips('qGoal', Q_OPTS.goal, true, ()=> q.goal, v => q.goal = v);
  qCards('qStyle', Q_OPTS.style, ()=> q.style, v => q.style = v);
  qCards('qWarm', Q_OPTS.warm, ()=> q.warm, v => q.warm = v);
  qChips('qLevel', Q_OPTS.level, false, ()=> q.level, v => q.level = v);
  qChips('qDur', Q_OPTS.dur, false, ()=> q.dur, v => q.dur = v, true);
  qChips('qFocus', Q_OPTS.focus, true, ()=> q.focus, v => q.focus = v);
  qChips('qEquip', Q_OPTS.equip, true, ()=> q.equip, v => q.equip = v);
  // «Беременность» — не обычное ограничение: при выборе показываем предупреждение,
  // при снятии — молчим
  qChips('qLimit', Q_OPTS.limit, true, ()=> q.limit, v => {
    const added = v.includes('Беременность') && !q.limit.includes('Беременность');
    q.limit = v;
    if(added) pregnancyWarning();
  });
  const db = $('qDays'); db.innerHTML = '';
  DAYS.forEach(d => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = canonicalLabel(d);
    b.classList.toggle('act', q.days.includes(d));
    b.onclick = ()=>{
      q.days = q.days.includes(d) ? q.days.filter(x => x !== d) : DAYS.filter(x => q.days.includes(x) || x === d);
      initAIForm();
    };
    db.appendChild(b);
  });
  $('qSplit').classList.toggle('on', q.split);
  $('qRotate').classList.toggle('on', q.rotate);
  setShown('qRotateRow', q.split);
  $('qNote').value = q.note || '';
  autoGrow($('qContext'));
  if(aiWaysReset.scrAI) aiWaysReset.scrAI();
}
$('qNote').oninput = e => q.note = clampText(e.target.value, 300);
$('qSplit').onclick = ()=>{
  q.split = !q.split;
  $('qSplit').classList.toggle('on', q.split);
  setShown('qRotateRow', q.split);
  if(!q.split){ q.rotate = false; $('qRotate').classList.remove('on'); }
};
$('qRotate').onclick = ()=>{ q.rotate = !q.rotate; $('qRotate').classList.toggle('on', q.rotate); };

function aiChoiceEnglish(v){
  const map = {
    'Новичок':'beginner', 'Средний':'intermediate', 'Продвинутый':'advanced',
    'Круговая':'circuit', 'Силовая':'strength', 'Смешанная':'mixed',
    'С разминкой':'with warm-up', 'Без разминки':'without warm-up',
    'Без ограничений':'no stated limitations', 'Без прыжков':'no jumping',
    'Тихо (соседи снизу)':'quiet / low-impact for downstairs neighbors',
    'Берегу колени':'protect knees', 'Берегу поясницу':'protect lower back',
    'Берегу запястья':'protect wrists', 'Берегу шею':'protect neck',
    'Беременность':'pregnancy'
  };
  return map[v] || String(v || '');
}
function aiListEnglish(arr){
  return (arr || []).map(aiChoiceEnglish).join(', ');
}

function aiProgramHasUserInput(){
  const context = clampText((($('qContext') && $('qContext').value) || ''), 600).trim();
  const realLimits = (q.limit || []).filter(x => x && !AI_DEFAULT_LIMITS.includes(x));
  return !!(
    (q.goal && q.goal.length) ||
    (q.days && q.days.length) ||
    (q.focus && q.focus.length) ||
    (q.equip && q.equip.length) ||
    realLimits.length ||
    (q.level && q.level !== AI_DEFAULT_LEVEL) ||
    q.style || q.warm || q.split ||
    (q.note && q.note.trim()) ||
    context
  );
}

function aiCreateProgramGuard(){
  if(aiProgramHasUserInput()) return true;
  appAlert(t('ai.needProgramInput'));
  return false;
}

function aiDurationEnglish(value){
  const raw = String(value || '').trim();
  const minutes = parseInt(raw, 10);
  if(!minutes) return raw;
  return raw.includes('+') ? `${minutes} minutes or longer` : `about ${minutes} minutes`;
}

function composeRequest(){
  const parts = [];
  const free = [];

  if(q.goal.length) parts.push(`Goal: ${aiListEnglish(q.goal)}.`);
  else free.push('goal');

  if(q.level) parts.push(`Level: ${aiChoiceEnglish(q.level)}.`);
  else free.push('fitness level');

  if(q.days.length) parts.push(`Training weekdays (canonical tokens): ${q.days.join(', ')}.`);
  else free.push('training days and weekly frequency');

  if(q.dur) parts.push(`Target duration: ${aiDurationEnglish(q.dur)}.`);
  else free.push('workout duration');

  if(q.focus.length) parts.push(`Extra focus: ${aiListEnglish(q.focus)}.`);

  if(q.equip.length) parts.push(`Available equipment: ${aiListEnglish(q.equip)}.`);
  else free.push('equipment; assume a normal home setting if unspecified');

  if(q.limit.length) parts.push(`Limitations/preferences: ${aiListEnglish(q.limit)}.`);

  if(q.style === 'Круговая'){
    parts.push('Structure: circuit. Repeat the whole exercise list; use КРУГИ 2-5 and usually ПОДХОДЫ 1.');
  } else if(q.style === 'Силовая'){
    parts.push('Structure: strength. Complete all sets of one exercise before moving on; use КРУГИ: 1 and usually ПОДХОДЫ 3-4.');
  } else if(q.style === 'Смешанная'){
    parts.push('Structure: mixed. A block with multiple sets repeats for multiple rounds; usually КРУГИ 2-3 and ПОДХОДЫ 2-3, while keeping total volume sensible.');
  } else {
    free.push('workout structure: circuit, strength, or mixed');
  }

  if(q.warm === 'С разминкой'){
    parts.push('Include warm-up exercises at the beginning and mark each with РАЗМИНКА: да. They run once before the rounds.');
  } else if(q.warm === 'Без разминки'){
    parts.push('Do not add warm-up exercises.');
  } else {
    free.push('whether a warm-up is needed and how long it should be');
  }

  if(q.split){
    parts.push('Use different exercise sets on different workout days, split logically by muscle groups or training focus.');
    if(q.rotate) parts.push('Use ЧЕРЕДОВАНИЕ: да, leave ДЕНЬ values empty for variants, and put the shared schedule in ДНИ ТРЕНИРОВОК.');
    else parts.push('Use ЧЕРЕДОВАНИЕ: нет and assign canonical weekday tokens to each variant.');
  } else {
    free.push('whether to split into different day variants or keep one repeating workout');
  }

  let out = 'Build a home-workout program. ' + userForAI() + ' ' + parts.join(' ');
  if(free.length) out += ` Decide these unspecified items yourself using sensible training logic: ${free.join('; ')}.`;
  const context = clampText(($('qContext') && $('qContext').value) || '', 600).trim();
  if(context){
    out += ` USER CAPABILITIES / LIMITATIONS CONTEXT: ${context}. Treat this as authoritative self-reported context for exercise selection, starting load, volume, range of motion, impact and progression. Do not diagnose from it. If it describes an injury, pain, or other health limitation, avoid choices that clearly conflict with it and do not claim medical clearance.`;
  }
  if(q.note && q.note.trim()) out += ` Additional user request: ${q.note.trim()}`;
  return out.trim();
}
const fullAIPrompt = ()=> aiPrompt() + '\n\n=== TASK: CREATE PROGRAM ===\n' + composeRequest();

// отправка: системное меню «Поделиться» само покажет ChatGPT/Gemini/Claude — нам не нужно знать, что установлено
async function copyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(fullAIPrompt());
    flashDone(btn);
  }catch(e){
    appAlert(t('common.copyManual'), {code: fullAIPrompt()});
  }
}

// Два повторяемых сообщения — одна формулировка на всё приложение. Слово «чат»
// объясняется («чат с нейросетью — ChatGPT, Gemini и т.п.»), а формулировка
// подсказывает и лёгкий путь («за меня»), и что именно делать («вставь ответ
// целиком»).
const MSG_AI_EMPTY = ()=> t('ai.emptyAnswer');
const MSG_AI_PARSE = ()=> t('ai.parseProgramFailed');
const MSG_AI_NOEX = ()=> t('ai.noExerciseResponse');

function importFromText(){
  const txt = ($('aiResult').value || '').trim();
  if(!txt){ appAlert(t('ai.pasteProgram')); return; }
  const {program, errors} = parseProgramText(txt);
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('ai.problemList') + '\n— ' + errors.join('\n— '));
    return;
  }
  // открываем распознанное в конструкторе — можно проверить, поправить и сохранить
  draft = program;
  planIdx = 0;
  if($('qContext')) $('qContext').value = '';
  fillBuilder(t('ai.reviewSave'));
}

async function saveProgram(){
  commitPlanFields();
  draft.name = clampLine($('bName').value, LIM.progName);
  draft.desc = clampText($('bDesc').value, LIM.progDesc);
  draft.time = $('bTime').value || '';
  // ротация имеет смысл только при нескольких вариантах
  if((draft.plans || []).length < 2) draft.rotate = false;
  if(!draft.rotate){ delete draft.rotIdx; delete draft.days; }
  else if(!Array.isArray(draft.days)) draft.days = [];
  if($('bProgOn').classList.contains('on')){
    draft.progression = clampProgEvery($('bProgEvery').value);
    // progLast — метка календарной прогрессии, от которой отказались. Если её проставить
    // здесь, миграция applyProgressionAll при следующем запуске примет программу за старую
    // и запишет отрицательную поправку, обнулив весь накопленный рост
    delete draft.progLast;
  } else {
    draft.progression = 0;
    delete draft.progLast;
  }
  // Проверки собираются в один список и показываются одним попапом: раньше каждая
  // проблема — отдельный попап, и пять нажатий «Сохранить» давали пять попапов.
  const many = draft.plans.length > 1;
  const miss = [];
  if(!draft.name) miss.push(t('builder.needProgramName'));
  // один день не может быть в двух вариантах
  const seenDays = {};
  for(const pl of draft.plans){
    for(const d of (pl.days || [])){
      if(seenDays[d]) miss.push(t('builder.duplicateDay',{day:canonicalLabel(d)}));
      seenDays[d] = true;
    }
  }
  for(let v=0; v<draft.plans.length; v++){
    const pl = draft.plans[v];
    if(!pl.exercises.length){
      miss.push(many ? t('builder.noExercisesVariant',{variant:v+1}) : t('builder.noExercises'));
      continue;
    }
    let badNames = 0;
    for(let i=0; i<pl.exercises.length; i++){
      const ex = normalizeExercise(pl.exercises[i]);
      if(!ex.name) badNames++;
    }
    if(badNames){
      miss.push(many
        ? t('builder.unnamedVariant',{variant:v+1,count:badNames,exercises:storeCountText(badNames,'exercise').replace(/^\d+\s+/,'')})
        : t('builder.unnamed',{count:badNames,exercises:storeCountText(badNames,'exercise').replace(/^\d+\s+/,'')}));
    }
  }
  if(miss.length){
    const tip = t('builder.validationTip');
    appAlert(miss.length === 1
      ? t('builder.saveFailedOne',{item:miss[0],tip})
      : t('builder.saveFailedMany',{items:miss.join('\n— '),tip}));
    return;
  }
  if(draft.locale !== 'ru' && draft.locale !== 'en') draft.locale = appLocale === 'ru' ? 'ru' : 'en';
  const idx = customPrograms.findIndex(x=>x.id===draft.id);
  const isNewProgram = idx < 0;
  if(idx >= 0) customPrograms[idx] = draft; else customPrograms.push(draft);
  await savePrograms();
  if(isNewProgram) trackProductEvent('program_added').catch(()=>{});
  if(draft.src && draft.by && typeof claimProgramLink === 'function') claimProgramLink(draft.src).catch(()=>{});
  // расписание задано — попросим разрешение на уведомления
  const anyTime = draft.time || (draft.plans || []).some(pl => pl.time);
  if(planDays(draft).length && window.FitNative && window.FitNative.requestNotifications){
    window.FitNative.requestNotifications().then(ok => { if(ok) syncNativeNotifications(); });
  }
  if(anyTime && planDays(draft).length && 'Notification' in window && Notification.permission === 'default'){
    try{ Notification.requestPermission(); }catch(e){}
  }
  renderMine();
  syncNativeNotifications();
  goTab('scrPrograms');
}

