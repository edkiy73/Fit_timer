/* ================= ТЕМА ================= */
// Тема у каждого профиля своя и по умолчанию «как в системе»: телефон один, а вкусы
// разные, и спорить с системной настройкой без спроса приложению незачем.
const sysDark = ()=> !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
let themeLight = !sysDark();
const themeOf = u => (u && u.theme) || 'system';
function applyThemeFor(u){
  const t = themeOf(u);
  themeLight = (t === 'system') ? !sysDark() : t !== 'dark';
  applyTheme();
}
try{
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    const u = curUser();
    if(themeOf(u) === 'system') applyThemeFor(u);
  });
}catch(e){}
function applyTheme(){
  document.body.classList.toggle('light', themeLight);
  // color-scheme говорит браузеру, в каком свете рисовать СВОИ элементы: полосу
  // прокрутки, календарь в поле даты, список в select. Без него они остаются
  // системными светлыми поверх тёмной темы.
  const root = document.documentElement;
  root.style.colorScheme = themeLight ? 'light' : 'dark';
  // цвет ползунка берём из палитры темы, а не дублируем константой: иначе при
  // правке палитры полоса останется от старой темы, и заметят это не сразу
  const sb = getComputedStyle(document.body).getPropertyValue('--line-2').trim();
  root.style.setProperty('--sb-thumb', sb || (themeLight ? '#CFC5EA' : '#3B2F58'));
  const bg = themeLight ? '#F6F4FC' : '#0C0916';
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.content = bg;
  // html — родитель body, поэтому не видит --bg из body.light; красим его напрямую,
  // иначе полоса статус-бара сверху и системная полоса снизу (safe-area) остаются
  // тёмными даже в светлой теме, пока не отрисуется body
  document.documentElement.style.background = bg;
  if(window.FitNative && window.FitNative.setSystemTheme) window.FitNative.setSystemTheme(themeLight);
}

/* ================= ГОЛОСОВОЕ УПРАВЛЕНИЕ ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
let voiceWanted = false;  // пользователь включил микрофон
let voiceActive = false;  // распознавание реально запущено
let recognitionLang = 'ru'; // ru | en; в APK выбирает локальный пакет Vosk

/* Карточки «Синхронизация» убраны с экрана.

   Она показывала «Не подключена · 0 изменений ждёт отправки» — то есть счётчик
   очереди для того, чего не существует: синхронизации профилей между устройствами
   как не было, так и нет (SYNC.adapter по-прежнему null). Сервер у приложения
   теперь есть, и строка «появится сервер» сбивала с толку вдвойне.

   Сама машинерия (docMeta, outbox, SYNC) осталась нетронутой — это шов, в который
   сервер встанет. Убран только рассказ о ней человеку: о том, чего он не может ни
   включить, ни почувствовать, рассказывать незачем. */

function syncPrefs(){
  const anyAudio = soundOn && (fxVol > 0 || voiceVol > 0);
  $('btnSoundW').innerHTML = icon(anyAudio ? 'vol' : 'volX');
  $('btnSoundW').classList.toggle('muted', !anyAudio);
  $('btnSoundW').title = t('top.soundTitle');
  $('btnMicW').classList.toggle('listening', hfMode !== 'off');
  $('btnMicW').title = t('top.voiceTitle') + ': ' + ({off:t('common.off'), voice:t('common.voice'), headset:t('common.headset')}[hfMode] || t('common.off'));
  // держим три каскада («старт», «тренировка», «профиль») в согласованном состоянии
  ['st', 'snd'].forEach(p => {
    const btn = $(p + 'SoundOn');
    if(!btn) return;
    btn.classList.toggle('on', soundOn);
    const mb = $(p + 'Music'); if(mb) mb.classList.toggle('on', musicMode);
    syncSoundCascade(p);
  });
}

let lastCmdTime = 0, lastCmdKind = '';
function applyVoiceCommand(input){
  if(!$('scrWork').classList.contains('on')) return false;
  const step = state.steps[state.stepIdx];
  if(!step) return false;
  const nativeKind = input && typeof input === 'object' ? String(input.kind || '') : '';
  const text = input && typeof input === 'object' ? String(input.text || '') : String(input || '');
  const t = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const pause = new Set(['пауза','на паузу','поставь на паузу','стоп','подожди','остановись','pause','stop','wait']);
  const resume = new Set(['продолжить','продолжай','продолжаем','поехали','можно продолжать','дальше пошли','continue','resume','go on','keep going']);
  const next = new Set(['дальше','готово','готов','пропустить','пропусти','следующее','следующий','сделал','закончил','завершить','next','done','skip','finished']);

  let kind = ['pause','resume','next'].includes(nativeKind) ? nativeKind : '';
  if(!kind && resume.has(t)) kind = 'resume';
  else if(!kind && pause.has(t)) kind = 'pause';
  else if(!kind && next.has(t)) kind = 'next';
  if(!kind) return false;

  // Вторая линия защиты после дедупа по фразе (см. onresult): распознавание могло
  // перезапуститься посреди фразы, и тогда та же команда придёт уже новой сессией
  // с индексом 0, мимо первой защиты.
  const now = Date.now();
  // «дальше» — единственная команда, которая двигает тренировку, и уезжала пачкой
  // именно она: для неё окно широкое и общее для всех команд. «Пауза» и
  // «продолжить» повтором ничего не ломают, им хватает узкой защиты от эха, иначе
  // сказанное сразу после «пауза» слово «продолжить» просто не сработает.
  if(kind === 'next'){ if(now - lastCmdTime < 1500) return true; }
  else if(kind === lastCmdKind && now - lastCmdTime < 800) return true;
  lastCmdTime = now; lastCmdKind = kind;
  // свой же гонг и озвучка следующего шага не должны вернуться командой
  lastAppSoundT = Math.max(lastAppSoundT, now + 700);

  if(kind === 'pause'){
    if(!state.paused){ setPause(true); beep(990, .1); }
    return true;
  }
  if(kind === 'resume'){
    if(state.paused){ setPause(false); beep(990, .1); }
    return true;
  }
  // next
  if(state.paused) setPause(false);
  if(step.kind === 'click'){ $('btnDone').click(); }
  else { beep(990, .1); nextStep(); }
  return true;
}

/* ================= РЕЖИМЫ УПРАВЛЕНИЯ БЕЗ РУК ================= */
let hfMode = 'off'; // off | voice | headset

function hfHintText(mode){
  if(mode === 'voice'){
    return t((window.FitNative && window.FitNative.offlineVoice) ? 'handsfree.voiceHintNative' : 'handsfree.voiceHintWeb');
  }
  if(mode === 'headset') return t('handsfree.headsetHint');
  return t('handsfree.offHint');
}

function syncHandsFreeUI(){
  document.querySelectorAll('#hfSeg [data-hf], #hfModal [data-hf]').forEach(b =>
    b.classList.toggle('act', b.dataset.hf === hfMode));
  ['hfHint','hfModalHint'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = hfHintText(hfMode);
  });
}
function setHfMode(mode){
  hfMode = mode;
  kvSet('hfMode', mode);
  voiceWanted = (mode === 'voice');
  syncHandsFreeUI();
  syncPrefs();
  // если уже на тренировке — переключаем на лету
  if($('scrWork').classList.contains('on')){
    stopListening(); stopHeadset();
    startHandsFree();
  }
}
function startHandsFree(){
  if(hfMode === 'voice') startListening();
  else if(hfMode === 'headset') startHeadset();
}
function stopHandsFree(){
  stopListening(); stopHeadset();
}

/* ---- ГАРНИТУРА: беззвучный луп + Media Session перехватывает кнопку наушников ---- */
let hsAudio = null;
function startHeadset(){
  try{
    if(!('mediaSession' in navigator)){
      appAlert(t('handsfree.headsetUnsupported'));
      setHfMode('off');
      return;
    }
    // тихий бесконечный звук, чтобы система считала нас медиа-плеером
    if(!hsAudio){
      // 1-секундный почти беззвучный wav в base64 (тишина)
      const silent = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      hsAudio = new Audio(silent);
      hsAudio.loop = true;
      hsAudio.volume = 0.01;
    }
    hsAudio.play().catch(()=>{});
    const advance = ()=>{
      const step = state.steps[state.stepIdx];
      if(!step || !$('scrWork').classList.contains('on')) return;
      if(state.paused) setPause(false);
      if(step.kind === 'click') $('btnDone').click();
      else { beep(990, .1); nextStep(); }
      try{ hsAudio.play().catch(()=>{}); }catch(e){}
    };
    navigator.mediaSession.setActionHandler('play', advance);
    navigator.mediaSession.setActionHandler('pause', advance);
    navigator.mediaSession.setActionHandler('nexttrack', advance);
    try{
      navigator.mediaSession.metadata = new MediaMetadata({title:t('handsfree.mediaTitle'), artist:t('handsfree.mediaArtist')});
    }catch(e){}
  }catch(e){
    setHfMode('off');
  }
}
function stopHeadset(){
  try{
    if(hsAudio){ hsAudio.pause(); }
    if('mediaSession' in navigator){
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    }
  }catch(e){}
}

let recogTimer = null, lastRecogStart = 0, stopRequested = false, recogFails = 0;
let recogSeq = 0;               // номер сессии распознавания
let firedSeq = -1, firedIdx = -1; // какая фраза какой сессии уже дала команду
function buildRecog(){
  const r = new SR();
  r.lang = recognitionLang === 'en' ? 'en-US' : 'ru-RU';
  r.continuous = true;
  r.interimResults = true; // промежуточные результаты — команда ловится быстрее, не дожидаясь паузы
  r.maxAlternatives = 3;
  r.onresult = e=>{
    if(recog !== r) return;              // экземпляр уже заменён — его результаты не наши
    // Приложение говорит само, и микрофон слышит собственную озвучку. В ней есть
    // и «Далее — Планка», и названия упражнений: распознавание охотно отдаёт
    // «дальше» одной из трёх альтернатив, и тренировка сама проматывается вперёд
    // шаг за шагом. Пока звучит наш собственный голос, команд не существует.
    if(Date.now() < lastAppSoundT) return;
    for(let i = e.resultIndex; i < e.results.length; i++){
      // Одна фраза — одна команда. Промежуточные результаты повторяют её по
      // несколько раз, а финальный приходит секунды через две, когда защита по
      // времени уже отпустила: отсюда и брались двойные-тройные переключения.
      // Слот i внутри одной сессии распознавания срабатывает ровно один раз.
      if(r._seq === firedSeq && i <= firedIdx) continue;
      const res = e.results[i];
      // проверяем все альтернативы — короткие команды часто не «финализируются»
      for(let a = 0; a < res.length; a++){
        if(applyVoiceCommand(res[a].transcript)){
          firedSeq = r._seq; firedIdx = i;
          return; // сработало — дальше не ищем
        }
      }
    }
  };
  return r;
}
// метка «эта фраза уже сработала»: сбрасывается на каждый запуск распознавания,
// потому что при старте браузер заводит новый список результатов с нуля
function resetVoiceDedup(){ firedSeq = -1; firedIdx = -1; }
function startListening(){
  if(!SR || voiceActive) return;
  stopRequested = false;
  lastRecogStart = Date.now();
  // Прежний экземпляр мог остаться живым: сворачивание окна, возврат по видимости и
  // перезапуск по звуку вызывают startListening из трёх разных мест, и в промежутке
  // voiceActive уже false. Два распознавателя на одном микрофоне давали по две
  // команды на фразу. Старый глушим до того, как заводим новый.
  try{
    if(recog){
      recog.onend = null; recog.onresult = null; recog.onerror = null;
      recog.abort ? recog.abort() : recog.stop();
    }
  }catch(e){}
  try{
    const r = buildRecog();
    r._seq = ++recogSeq;
    recog = r;
    resetVoiceDedup();
    r.onend = ()=>{
      if(recog !== r) return;   // нас уже заменили — молча уходим, перезапуск не наш
      voiceActive = false;
      // приложение свернули — браузер обрывает распознавание сам. Это не отказ в доступе:
      // не перезапускаемся и НЕ выключаем режим, ждём возвращения (см. visibilitychange)
      if(document.hidden) return;
      // ОС сама останавливает распознавание после каждой фразы/паузы тишины.
      // перезапускаем СРАЗУ, иначе в промежутке команды не слышны.
      if(voiceWanted && !stopRequested && $('scrWork').classList.contains('on')){
        // защита от бесконечного мгновенного цикла при ошибке (если onend летит < 300мс подряд много раз)
        const now = Date.now();
        if(now - lastRecogStart < 300){ recogFails++; } else { recogFails = 0; }
        if(recogFails > 8){
          // распознавание падает мгновенно (нет доступа/не поддерживается) — не долбим микрофон
          voiceWanted = false; kvSet('voiceCtl', '0'); syncPrefs();
          return;
        }
        // новая сессия — новый список результатов, метки прошлой к нему не относятся
        r._seq = ++recogSeq;
        resetVoiceDedup();
        try{ r.start(); voiceActive = true; lastRecogStart = now; }
        catch(e){ setTimeout(()=>{ if(voiceWanted && !stopRequested) startListening(); }, 250); }
      }
    };
    r.onerror = ev=>{
      if(recog !== r) return;
      if(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'){
        // в свёрнутом приложении браузер отдаёт ту же ошибку, что и при запрете доступа.
        // Пугать человека и выключать голос из-за того, что он переключил окно, нельзя
        if(document.hidden) return;
        voiceWanted = false;
        kvSet('voiceCtl', '0');
        syncPrefs();
        appAlert(t('handsfree.micDenied'));
      }
    };
    r.start();
    voiceActive = true;
  }catch(e){ voiceActive = false; }
}

function stopListening(){
  stopRequested = true;
  clearTimeout(recogTimer);
  try{ if(recog){ recog.onend = null; recog.onresult = null; recog.stop(); recog.abort && recog.abort(); } }catch(e){}
  voiceActive = false;
  resetVoiceDedup();
}

// Вернулись в приложение — молча поднимаем распознавание обратно. Раньше сворачивание
// гасило голосовое управление насовсем: браузер обрывал распознавание, приложение считало
// это отказом в доступе и просило заново выбирать «Голос» в меню микрофона.
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    if(voiceActive) try{ if(recog){ recog.onend = null; recog.onresult = null; recog.stop(); } }catch(e){}
    voiceActive = false;
    resetVoiceDedup();
    return;
  }
  if(hfMode === 'voice' && voiceWanted && $('scrWork').classList.contains('on') && !voiceActive){
    recogFails = 0;              // счётчик срывов относится к прошлой сессии микрофона
    setTimeout(startListening, 300); // даём вкладке дорисоваться, иначе браузер снова оборвёт
  }
});

/* ================= УВЕДОМЛЕНИЯ ПО РАСПИСАНИЮ ================= */
// проверяем раз в 20 секунд: не пора ли напомнить о тренировке
const notifiedKeys = new Set();
async function showNotification(title, body){
  try{ new Notification(title, {body, tag:'fittimer'}); }catch(e){}
}
function checkSchedules(){
  if(document.hidden) return;
  try{ if(typeof getNotificationPrefs === 'function' && getNotificationPrefs().workouts === false) return; }catch(_){}
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const today = DAYS[(now.getDay() + 6) % 7]; // JS: 0=Вс -> наш индекс 6
  const cur = now.getHours() * 60 + now.getMinutes();
  const dateKey = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
  customPrograms.forEach(p=>{
    // время сегодняшнего варианта важнее общего времени программы
    const plansT = normPlans(p);
    const todayPlan = plansT.find(pl => (pl.days || []).includes(today));
    const useTime = (todayPlan && todayPlan.time) || p.time;
    if(!useTime || !planDays(p).includes(today)) return;
    const [h, m] = useTime.split(':').map(Number);
    const minuteOfDay = h * 60 + m;
    const preKey = p.id + '-pre-' + dateKey, goKey = p.id + '-go-' + dateKey;
    if(cur === minuteOfDay - 15 && !notifiedKeys.has(preKey)){
      notifiedKeys.add(preKey);
      showNotification(t('notify.beforeTitle'), t('notify.beforeBody',{name:p.name,time:useTime}));
    }
    if(cur === minuteOfDay && !notifiedKeys.has(goKey)){
      notifiedKeys.add(goKey);
      showNotification(t('notify.startTitle'), t('notify.startBody',{name:p.name}));
    }
  });
}
setInterval(checkSchedules, 20000);

// Нативные напоминания переживают закрытие приложения. Планируем ближайшую неделю
// заново при старте, правке расписания и завершении тренировки: так уведомление
// «пропустил» исчезает, если занятие всё-таки выполнено.
/* ================= МЕНЕДЖЕР УВЕДОМЛЕНИЙ =================
   Фичи не планируют push каждая сама по себе. Здесь собираются кандидаты, применяются
   категории, частотные ограничения и только потом готовый список отдаётся нативному
   планировщику. При каждом пересчёте старый список заменяется целиком. */
const NOTIFY_HORIZON_DAYS = 35;
const NOTIFY_DAY = 86400000;

function notifyDayKey(d){ return localISO(d); }
function notifyAt(day, hour, minute){
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute || 0);
}
function notifyScheduledPlan(p, dayName){
  const plans = normPlans(p);
  const plan = plans.find(pl => (pl.days || []).includes(dayName));
  if(plan) return {plan, time:plan.time || p.time || ''};
  if(planDays(p).includes(dayName)) return {plan:null, time:p.time || ''};
  return null;
}
function notifyProgressionChanged(p){
  if(!p || !p.progression) return false;
  const done = Math.max(0, +((p.stats && p.stats.completions) || 0));
  const every = Math.max(1, +p.progression || 1);
  return done > 0 && done % every === 0 && typeof progSteps === 'function' && progSteps(p) > 0;
}
function notifyThirdWorkoutDate(){
  const hs = (stats.history || []).filter(h => h && h.d).slice().sort((a,b)=>String(a.d).localeCompare(String(b.d)));
  if(hs.length < 3) return null;
  const d = new Date(hs[2].d + 'T12:00:00');
  return isNaN(d) ? null : d;
}
function notifyHasWorkoutOn(date){
  const dayName = DAYS[(date.getDay() + 6) % 7];
  return customPrograms.some(p => p && p.id !== 'warmup' && progActive(p) && !!notifyScheduledPlan(p, dayName));
}
function notifyPremiumCandidate(anchor, now){
  if(!anchor) return null;
  let at = notifyAt(new Date(anchor), 18, 0);
  at.setDate(at.getDate() + 14);
  while(at <= now) at.setDate(at.getDate() + 14);
  // Не продаём подписку в тот же день, когда человек должен тренироваться:
  // предложение не должно спорить с основной задачей приложения.
  for(let i=0; i<3 && notifyHasWorkoutOn(at); i++) at.setDate(at.getDate() + 1);
  return at;
}
function limitNotificationCandidates(items){
  const out = [];
  const engagementDay = new Set();
  const engagementWeek = new Map();
  const workoutMissDays = new Set(items.filter(x => x.extra && x.extra.stage === 'missed').map(x => notifyDayKey(new Date(x.at))));
  items.sort((a,b) => (+new Date(a.at) - +new Date(b.at)) || ((b.priority||0) - (a.priority||0)));
  for(const item of items){
    const at = new Date(item.at);
    if(isNaN(at)) continue;
    const day = notifyDayKey(at);
    if(item.engagement){
      if(engagementDay.has(day)) continue;
      const monday = new Date(at); monday.setHours(0,0,0,0); monday.setDate(monday.getDate() - ((monday.getDay()+6)%7));
      const week = notifyDayKey(monday);
      const n = engagementWeek.get(week) || 0;
      if(n >= 3) continue;
      if(item.extra && item.extra.stage === 'premium' && workoutMissDays.has(day)) continue;
      engagementDay.add(day);
      engagementWeek.set(week, n + 1);
    }
    out.push(item);
  }
  return out;
}

// Нативные уведомления переживают закрытие приложения. Планируем ограниченный горизонт
// и полностью пересобираем его при старте, правке расписания и завершении тренировки.
async function syncNativeNotifications(){
  if(!window.FitNative || !window.FitNative.syncWorkoutNotifications) return;
  const prefs = (typeof getNotificationPrefs === 'function') ? getNotificationPrefs() : {
    workouts:true, trainer:true, progress:true, offers:true
  };
  const now = new Date();
  const horizon = new Date(now.getTime() + NOTIFY_HORIZON_DAYS * NOTIFY_DAY);
  const items = [];
  const add = item => {
    const at = new Date(item && item.at);
    if(!item || isNaN(at) || at <= new Date(now.getTime() + 10000) || at > horizon) return;
    items.push(item);
  };
  const done = new Set((stats.history || []).map(h => String(h.d || '') + '|' + String(h.pid || '')));

  if(prefs.workouts !== false){
    for(let offset = 0; offset < 8; offset++){
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const iso = localISO(day);
      const dayName = DAYS[(day.getDay() + 6) % 7];
      customPrograms.filter(p => p && p.id !== 'warmup' && progActive(p)).forEach(p => {
        const scheduled = notifyScheduledPlan(p, dayName);
        if(!scheduled || done.has(iso + '|' + p.id)) return;
        const time = scheduled.time;
        const grew = prefs.progress !== false && notifyProgressionChanged(p);
        if(time){
          const hm = time.split(':').map(Number);
          if(hm.length !== 2 || !isFinite(hm[0]) || !isFinite(hm[1])) return;
          const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm[0], hm[1]);
          const pre = new Date(start.getTime() - 15 * 60000);
          const missed = new Date(start.getTime() + 2 * 3600000);
          add({at:pre.toISOString(),
            title:grew ? t('notify.progressTitle') : t('notify.beforeTitle'),
            body:grew ? t('notify.progressBody',{name:p.name,steps:progSteps(p)}) : t('notify.beforeBody',{name:p.name,time}),
            priority:90, extra:{programId:p.id, stage:grew ? 'progress' : 'before', category:'workouts'}});
          add({at:start.toISOString(), title:t('notify.startTitleShort'),
            body:t('notify.todayPlan',{name:p.name}), priority:85,
            extra:{programId:p.id, stage:'start', category:'workouts'}});
          add({at:missed.toISOString(), title:t('notify.waitingTitle'),
            body:t('notify.waitingBodyShort',{name:p.name}),
            largeBody:t('notify.waitingBody',{name:p.name}), priority:70,
            extra:{programId:p.id, stage:'missed', category:'workouts'}});
        }else{
          const morning = notifyAt(day, 9, 0);
          const evening = notifyAt(day, 20, 0);
          add({at:morning.toISOString(),
            title:grew ? t('notify.progressTitle') : t('notify.todayTitle'),
            body:grew ? t('notify.progressBody',{name:p.name,steps:progSteps(p)}) : t('notify.todayBody',{name:p.name}),
            priority:80, extra:{programId:p.id, stage:grew ? 'progress' : 'today', category:'workouts'}});
          add({at:evening.toISOString(), title:t('notify.dontForgetTitle'),
            body:t('notify.dontForgetBody',{name:p.name}), priority:65,
            extra:{programId:p.id, stage:'missed', category:'workouts'}});
        }
      });
    }

    // Незавершённая тренировка: один мягкий возврат через 2 часа, только в первые сутки.
    try{
      const session = (typeof loadSession === 'function') ? await loadSession() : null;
      if(session && session.at){
        const at = new Date(+session.at + 2 * 3600000);
        if(+at > +now && +at - +new Date(session.at) < NOTIFY_DAY){
          const p = customPrograms.find(x => x.id === session.pid);
          add({at:at.toISOString(), title:t('notify.unfinishedTitle'),
            body:t('notify.unfinishedBody',{name:(p && p.name) || t('sessions.workoutFallback')}),
            priority:75, extra:{programId:session.pid, stage:'unfinished', category:'workouts'}});
        }
      }
    }catch(_){}
  }

  // Возврат после паузы: максимум три мягких касания — через 3, 7 и 14 дней.
  // После двух недель не продолжаем догонять человека уведомлениями. Интервалы
  // привязаны к последней реальной тренировке, а не к моменту открытия приложения.
  if(prefs.workouts !== false && (stats.history || []).length){
    const last = (stats.history || []).filter(h=>h && h.d).slice().sort((a,b)=>String(b.d).localeCompare(String(a.d)))[0];
    if(last){
      const base = new Date(last.d + 'T12:00:00');
      [3,7,14].forEach(days => {
        const day = new Date(base); day.setDate(day.getDate() + days);
        const at = notifyAt(day, 19, 0);
        if(notifyDayKey(day) === notifyDayKey(now)) return; // приложение уже открыто сегодня
        add({at:at.toISOString(), title:t('notify.returnTitle'), body:t('notify.returnBody'),
          priority:30, engagement:true, extra:{stage:'inactive', category:'workouts', days}});
      });
    }
  }

  // Premium: только после того, как человек уже получил пользу от приложения —
  // минимум три завершённые тренировки. Повтор — не чаще одного раза в 14 дней.
  if(prefs.offers !== false && !isPremium()){
    const anchor = notifyThirdWorkoutDate();
    let promo = notifyPremiumCandidate(anchor, now);
    for(let i=0; promo && i<2; i++){
      if(notifyDayKey(promo) !== notifyDayKey(now)){
        add({at:promo.toISOString(), title:t('notify.premiumTitle'), body:t('notify.premiumBody'),
          priority:10, engagement:true, extra:{stage:'premium', category:'offers'}});
      }
      promo = new Date(promo.getTime() + 14 * NOTIFY_DAY);
      for(let j=0; j<3 && notifyHasWorkoutOn(promo); j++) promo.setDate(promo.getDate() + 1);
    }
  }

  const finalItems = limitNotificationCandidates(items);
  await window.FitNative.syncWorkoutNotifications(finalItems);
}
window.syncNativeNotifications = syncNativeNotifications;

/* ================= ДЕЙСТВИЯ ПО ИМЕНИ =================
   Обычный способ привязать кнопку в этом файле — найти её по имени и повесить
   действие: $('btnX').onclick = ... Так сделано в 240 местах, и у способа есть
   цена: код ищет элемент в момент запуска. Нет элемента — $('btnX') возвращает
   пустоту, а попытка повесить на пустоту действие роняет ВЕСЬ запуск приложения.
   Молча: белый экран и никакой ошибки человеку. Ровно так приложение падало,
   когда кнопки убрали вместе с переделкой экранов, а строки с обработчиками
   остались.

   Здесь другой способ: кнопка помечается тем, ЧТО ОНА ДЕЛАЕТ, — data-act="имя",
   а приложение слушает нажатия целиком и смотрит в этот реестр. Тогда кнопку
   можно удалить из разметки, и ничего не сломается: действие просто некому
   вызвать. И наоборот — добавить кнопку можно без единой строки кода, если
   действие уже описано. Кнопки, которые рисуются из данных (строки списков),
   работают сразу, без навешивания обработчиков после каждой перерисовки.

   Старый способ никуда не делся и работает рядом: переводим по мере того, как
   трогаем экран, а не отдельной большой задачей. Правило одно — data-act только
   для кнопок, которые ничего не хранят в себе; тумблеры и поля остаются как есть.
   Обработчик получает саму кнопку и событие: этого хватает, чтобы взять данные
   из data-атрибутов рядом, не заводя элементу имя. */
const ACTIONS = {
  // Закрыть попап, внутри которого стоит кнопка. Имя попапа не нужно: он и так
  // ближайший предок. Восемнадцать одинаковых строк «найди кнопку, найди попап,
  // сними класс» свелись к одной. Историю навигации трогать не надо — за ней
  // следит MutationObserver по классу .modal.open.
  closeModal: btn => {
    const m = btn.closest('.modal');
    if(m) m.classList.remove('open');
  }
};
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if(!btn) return;
  const fn = ACTIONS[btn.dataset.act];
  if(fn) fn(btn, e);
});
// Клик мимо карточки — по затемнению, а не по самой карточке: e.target совпадает
// с попапом, только когда попали в подложку. #dlg решает это сам (appDialog ждёт
// свой промис), неотменяемые (data-locked="1") гасит dismissTopModal.
document.addEventListener('click', e => {
  const m = e.target;
  if(m.id !== 'dlg' && m.classList.contains('modal') && m.classList.contains('open')) dismissTopModal();
});

