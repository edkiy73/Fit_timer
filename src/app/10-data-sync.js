/* ================= ПОЛЬЗОВАТЕЛИ И ХРАНИЛИЩЕ ================= */
let users = [];
let currentUser = 'f'; // id текущего пользователя; данные пользователей полностью раздельны
const fitProductInfrastructure = FitTimerModules.infrastructure.create({
  externalStorage: appRuntimeCompat.externalStorage,
  onStorageWriteFailure: () => { try{ appAlert(t('storage.full')); }catch(_){} },
  platform: appRuntimeCompat.runtimePlatform,
  locale: () => (typeof appLocale !== 'undefined' && appLocale === 'en') ? 'en' : 'ru',
  build: appRuntimeCompat.build,
  premium: () => (typeof isPremium === 'function') ? !!isPremium() : false,
  newId: () => newId(),
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
  }
});
const fitStorage = fitProductInfrastructure.storage;
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

/* Storage + observability are composed by the ESM product infrastructure.
   Legacy data-sync only owns FitTimer data behavior and kv-compatible helpers. */
const appObservability = fitProductInfrastructure.observability;
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
  FitTimerModules.ui.openModal($('wellModal'));
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
  FitTimerModules.ui.closeModal($('wellModal'));
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
const SYNC_KEYS = FitTimerModules.sync.profileKeys;
const PROGRAM_DOC = id => 'program:' + id;
const isSyncKey = key => FitTimerModules.sync.registry.accepts('profile', key);
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
      const gone = value === null && FitTimerModules.sync.registry.allowsDeleted('profile', o.key);
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
  for(const key of FitTimerModules.sync.accountKeys){
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
    const gone = value === null && FitTimerModules.sync.registry.allowsDeleted('profile', key);
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

