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
  const productConfig = window.APP_CONFIG;
  const productUi = productConfig && productConfig.brand && productConfig.brand.ui;
  const productTheme = productUi && productUi[themeLight ? 'light' : 'dark'];
  if(productTheme){
    appUi.applyCssVars(document.body, {
      bg: productTheme.background,
      card: productTheme.card,
      surface: productTheme.surface,
      accent: productTheme.accent,
      'accent-ink': productTheme.accentInk
    });
  }
  // color-scheme говорит браузеру, в каком свете рисовать СВОИ элементы: полосу
  // прокрутки, календарь в поле даты, список в select. Без него они остаются
  // системными светлыми поверх тёмной темы.
  const root = document.documentElement;
  root.style.colorScheme = themeLight ? 'light' : 'dark';
  // цвет ползунка берём из палитры темы, а не дублируем константой: иначе при
  // правке палитры полоса останется от старой темы, и заметят это не сразу
  const computed = getComputedStyle(document.body);
  const sb = computed.getPropertyValue('--line-2').trim();
  root.style.setProperty('--sb-thumb', sb || (themeLight ? '#CFC5EA' : '#3B2F58'));
  const bg = computed.getPropertyValue('--bg').trim() || (themeLight ? '#F6F4FC' : '#0C0916');
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.content = bg;
  // html — родитель body, поэтому не видит --bg из body.light; красим его напрямую,
  // иначе полоса статус-бара сверху и системная полоса снизу (safe-area) остаются
  // тёмными даже в светлой теме, пока не отрисуется body
  document.documentElement.style.background = bg;
  appRuntimeCompat.setSystemTheme(themeLight);
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
  // те же фразы, что в словаре распознавателя Android (VoiceCommands.java)
  const resume = new Set(['продолжить','продолжай','продолжаем','продолжи','поехали','можно продолжать','дальше пошли','continue','resume','go on','keep going']);
  const next = new Set(['дальше','готово','готов','готова','готовы','пропустить','пропусти','следующее','следующий','сделал','закончил','завершить','next','done','skip','finished']);

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
    return t(appRuntimeCompat.offlineVoice() ? 'handsfree.voiceHintNative' : 'handsfree.voiceHintWeb');
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
// В браузере оставляем только ближайшее напоминание для явно заданного времени.
// В native всю очередь строит единый менеджер ниже; второй web Notification там был
// бы дублем системного уведомления.
const notifiedKeys = new Set();
async function showNotification(title, body){
  try{ new Notification(title, {body, tag:'fittimer'}); }catch(e){}
}
function checkSchedules(){
  if(document.hidden) return;
  if(appRuntimeCompat.isNative()) return;
  const prefs = (typeof getNotificationPrefs === 'function') ? getNotificationPrefs() : {workouts:true,progress:true};
  if(prefs.workouts === false) return;
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const done = new Set((stats.history || []).map(h => String(h.d || '') + '|' + String(h.pid || '')));
  const rows = notifyScheduleRowsForDay(now, done, new Set(), prefs).filter(r => r.time);
  const groups = notifyRowsByTime(rows);
  groups.forEach((group, time) => {
    const hm = notifyTimeParts(time);
    if(!hm) return;
    const minuteOfDay = hm[0] * 60 + hm[1];
    const key = notifyDayKey(now) + '|pre|' + time;
    if(cur !== minuteOfDay - 15 || notifiedKeys.has(key)) return;
    notifiedKeys.add(key);
    const copy = notifyTimedGroupCopy(group, time);
    showNotification(copy.title, copy.body);
  });
}
setInterval(checkSchedules, 20000);

/* ================= МЕНЕДЖЕР УВЕДОМЛЕНИЙ =================
   Уведомляем о плане человека, а не о каждой записи отдельно:
   - программы без времени: один утренний digest + один вечерний итог;
   - одинаковое точное время: одна группа;
   - точное время: только -15 минут, без дубля ровно в старт и без отдельного +2ч;
   - незавершённая сохранённая тренировка сильнее обычного reminder той же программы;
   - engagement/premium не конкурируют с тренировочным днём.
   Очередь ограничена безопасным для iOS/Android запасом в 60 локальных уведомлений. */
const NOTIFY_HORIZON_DAYS = 14;
const NOTIFY_NATIVE_LIMIT = 60;
const NOTIFY_PASSIVE_DAILY_LIMIT = 3;
const NOTIFY_DAY = 86400000;

function notifyDayKey(d){ return localISO(d); }
function notifyAt(day, hour, minute){
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute || 0);
}
function notifyTimeParts(value){
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  const h = +m[1], min = +m[2];
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? [h,min] : null;
}
function notifyScheduledPlan(p, dayName){
  const plans = normPlans(p);
  const plan = plans.find(pl => (pl.days || []).includes(dayName));
  if(plan) return {plan, time:plan.time || p.time || ''};
  if(planDays(p).includes(dayName)) return {plan:null, time:p.time || ''};
  return null;
}
// какой вариант должен сработать в этот день: если он не привязан к конкретным
// дням (чередование A/Б), берём следующий по очереди — лучшая оценка для напоминания.
function notifyPlanFor(p, scheduledPlan){
  if(scheduledPlan) return scheduledPlan;
  const plans = normPlans(p);
  return plans.length ? plans[Math.max(0, Math.round(+p.rotIdx || 0)) % plans.length] : null;
}
function notifyProgressionChanged(p, scheduledPlan){
  if(!p || !p.progression) return false;
  const pl = notifyPlanFor(p, scheduledPlan);
  const idx = Math.max(0, normPlans(p).indexOf(pl));
  const prev = previousWorkoutLoad(p, idx);
  if(!prev.exact) return false;
  const byIdx = new Map(prev.rows.map(r => [r.i, r]));
  return workoutLoadSnapshot(p, idx).some(row => {
    const before = byIdx.get(row.i);
    return !!before && before.n === row.n && loadDelta(before, row).dir === 'up';
  });
}
function notifyWorkoutCount(n){
  n = Math.max(0, Math.round(+n || 0));
  if(appLocale === 'ru') return n + ' ' + plural(n, t('calendar.workoutOne'), t('calendar.workoutFew'), t('calendar.workoutMany'));
  return n + ' ' + t(n === 1 ? 'calendar.workoutOne' : 'calendar.workoutFew');
}
function notifyNames(rows, max){
  const names = (rows || []).map(r => String(r && r.p && r.p.name || '')).filter(Boolean);
  const take = names.slice(0, Math.max(1, max || 3));
  const quoted = take.map(name => appLocale === 'ru' ? '«' + name + '»' : '“' + name + '”');
  const left = names.length - take.length;
  if(left > 0) quoted.push(t('notify.moreCount',{count:left}));
  return quoted.join(', ');
}
function notifyRowsExtra(rows, stage){
  const ids = (rows || []).map(r => r && r.p && r.p.id).filter(Boolean);
  const extra = {stage, category:'workouts'};
  if(ids.length === 1) extra.programId = ids[0];
  else if(ids.length > 1) extra.programIds = ids;
  return extra;
}
function notifyRowsByTime(rows){
  const groups = new Map();
  (rows || []).forEach(row => {
    if(!row.time) return;
    if(!groups.has(row.time)) groups.set(row.time, []);
    groups.get(row.time).push(row);
  });
  return groups;
}
function notifyScheduleRowsForDay(day, done, blockedKeys, prefs){
  const iso = notifyDayKey(day);
  const dayName = DAYS[(day.getDay() + 6) % 7];
  const out = [];
  customPrograms.filter(p => p && p.id !== 'warmup' && progActive(p)).forEach(p => {
    const scheduled = notifyScheduledPlan(p, dayName);
    if(!scheduled) return;
    const key = iso + '|' + p.id;
    if((done && done.has(key)) || (blockedKeys && blockedKeys.has(key))) return;
    const time = notifyTimeParts(scheduled.time) ? scheduled.time : '';
    out.push({
      p,
      scheduled,
      time,
      grew: !!(prefs && prefs.progress !== false && notifyProgressionChanged(p, scheduled.plan))
    });
  });
  return out;
}
function notifyTimedGroupCopy(rows, time){
  const group = rows || [];
  if(group.length === 1){
    const row = group[0];
    return row.grew
      ? {title:t('notify.progressTitle'), body:t('notify.progressBody',{name:row.p.name})}
      : {title:t('notify.beforeTitle'), body:t('notify.beforeBody',{name:row.p.name,time})};
  }
  const grew = group.filter(r => r.grew).length;
  const body = t('notify.beforeManyBody',{time,names:notifyNames(group,3)});
  const suffix = grew ? ' ' + t('notify.progressManySuffix',{count:notifyWorkoutCount(grew)}) : '';
  return {
    title:t('notify.beforeManyTitle',{count:notifyWorkoutCount(group.length)}),
    body,
    largeBody:t('notify.beforeManyBody',{time,names:notifyNames(group,8)}) + suffix
  };
}
function notifyMorningCopy(rows){
  const group = rows || [];
  if(group.length === 1){
    const row = group[0];
    return row.grew
      ? {title:t('notify.progressTitle'), body:t('notify.progressBody',{name:row.p.name})}
      : {title:t('notify.todayTitle'), body:t('notify.todayBody',{name:row.p.name})};
  }
  const grew = group.filter(r => r.grew).length;
  const suffix = grew ? ' ' + t('notify.progressManySuffix',{count:notifyWorkoutCount(grew)}) : '';
  return {
    title:t('notify.todayManyTitle',{count:notifyWorkoutCount(group.length)}),
    body:notifyNames(group,3),
    largeBody:notifyNames(group,8) + suffix
  };
}
function notifyEveningCopy(rows){
  const group = rows || [];
  if(group.length === 1){
    const row = group[0];
    return {title:t('notify.dontForgetTitle'), body:t('notify.dontForgetBody',{name:row.p.name})};
  }
  return {
    title:t('notify.remainingManyTitle',{count:notifyWorkoutCount(group.length)}),
    body:notifyNames(group,3),
    largeBody:notifyNames(group,8)
  };
}
function buildWorkoutNotificationCandidates(now, prefs, blockedKeys){
  const out = [];
  const done = new Set((stats.history || []).map(h => String(h.d || '') + '|' + String(h.pid || '')));
  for(let offset = 0; offset < NOTIFY_HORIZON_DAYS; offset++){
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const rows = notifyScheduleRowsForDay(day, done, blockedKeys, prefs);
    if(!rows.length) continue;

    const untimed = rows.filter(r => !r.time);
    if(untimed.length){
      const copy = notifyMorningCopy(untimed);
      out.push({
        at:notifyAt(day,9,0).toISOString(),
        title:copy.title, body:copy.body, largeBody:copy.largeBody || copy.body,
        priority:80,
        extra:notifyRowsExtra(untimed, untimed.length === 1 && untimed[0].grew ? 'progress' : (untimed.length === 1 ? 'today' : 'today-summary'))
      });
    }

    notifyRowsByTime(rows).forEach((group, time) => {
      const hm = notifyTimeParts(time);
      if(!hm) return;
      const startAt = notifyAt(day, hm[0], hm[1]);
      const copy = notifyTimedGroupCopy(group, time);
      out.push({
        at:new Date(startAt.getTime() - 15 * 60000).toISOString(),
        title:copy.title, body:copy.body, largeBody:copy.largeBody || copy.body,
        priority:90, budgetExempt:true,
        extra:notifyRowsExtra(group, group.length === 1 && group[0].grew ? 'progress' : (group.length === 1 ? 'before' : 'before-summary'))
      });
    });

    const evening = notifyEveningCopy(rows);
    out.push({
      at:notifyAt(day,20,0).toISOString(),
      title:evening.title, body:evening.body, largeBody:evening.largeBody || evening.body,
      priority:65,
      extra:notifyRowsExtra(rows, rows.length === 1 ? 'missed' : 'missed-summary')
    });
  }
  return out;
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
  for(let i=0; i<3 && notifyHasWorkoutOn(at); i++) at.setDate(at.getDate() + 1);
  return at;
}
function limitNotificationCandidates(items){
  const reservedDays = new Set(
    items.filter(x => !x.engagement && x.extra && x.extra.category === 'workouts')
      .map(x => notifyDayKey(new Date(x.at)))
  );
  return appNotifications.limitCandidates(items,{
    maxTotal:NOTIFY_NATIVE_LIMIT,
    passiveDailyLimit:NOTIFY_PASSIVE_DAILY_LIMIT,
    engagementWeeklyLimit:3,
    dayKey:notifyDayKey,
    reservedDayKeys:reservedDays,
    blocksEngagementOn:date=>notifyHasWorkoutOn(date)
  });
}

// Нативные уведомления переживают закрытие приложения. Пересобираем две недели
// вперёд при старте, изменении расписания и завершении тренировки.
async function syncNativeNotifications(){
  if(!appRuntimeCompat.hasNative('syncWorkoutNotifications')) return;
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

  let savedSession = null;
  try{
    if(!(state && state.live) && typeof loadSession === 'function') savedSession = await loadSession();
  }catch(_){}
  const blockedKeys = new Set();
  if(state && state.live && state.raw && state.raw.id){
    blockedKeys.add(notifyDayKey(now) + '|' + state.raw.id);
  }
  if(savedSession && savedSession.pid && savedSession.at){
    const sessionDay = new Date(+savedSession.at);
    if(!isNaN(sessionDay)) blockedKeys.add(notifyDayKey(sessionDay) + '|' + savedSession.pid);
  }

  if(prefs.workouts !== false){
    buildWorkoutNotificationCandidates(now, prefs, blockedKeys).forEach(add);

    // Сохранённая незавершённая тренировка сильнее обычного расписания этой же
    // программы: одно конкретное «продолжить с места», без второго общего reminder.
    if(savedSession && savedSession.at){
      const at = new Date(+savedSession.at + 2 * 3600000);
      if(+at > +now && +at - +new Date(savedSession.at) < NOTIFY_DAY){
        const p = customPrograms.find(x => x.id === savedSession.pid);
        add({
          at:at.toISOString(),
          title:t('notify.unfinishedTitle'),
          body:t('notify.unfinishedBody',{name:(p && p.name) || t('sessions.workoutFallback')}),
          priority:85,
          extra:{programId:savedSession.pid, stage:'unfinished', category:'workouts'}
        });
      }
    }
  }

  // Возврат после паузы: не ставим его вообще на день, где есть план тренировки.
  if(prefs.workouts !== false && (stats.history || []).length){
    const last = (stats.history || []).filter(h=>h && h.d).slice().sort((a,b)=>String(b.d).localeCompare(String(a.d)))[0];
    if(last){
      const base = new Date(last.d + 'T12:00:00');
      [3,7,14].forEach(days => {
        const day = new Date(base);
        day.setDate(day.getDate() + days);
        if(notifyDayKey(day) === notifyDayKey(now) || notifyHasWorkoutOn(day)) return;
        add({
          at:notifyAt(day,19,0).toISOString(),
          title:t('notify.returnTitle'), body:t('notify.returnBody'),
          priority:30, engagement:true,
          extra:{stage:'inactive', category:'workouts', days}
        });
      });
    }
  }

  if(prefs.offers !== false && !isPremium()){
    const anchor = notifyThirdWorkoutDate();
    let promo = notifyPremiumCandidate(anchor, now);
    for(let i=0; promo && i<2; i++){
      if(notifyDayKey(promo) !== notifyDayKey(now)){
        add({
          at:promo.toISOString(),
          title:t('notify.premiumTitle'), body:t('notify.premiumBody'),
          priority:10, engagement:true,
          extra:{stage:'premium', category:'offers'}
        });
      }
      promo = new Date(promo.getTime() + 14 * NOTIFY_DAY);
      for(let j=0; j<3 && notifyHasWorkoutOn(promo); j++) promo.setDate(promo.getDate() + 1);
    }
  }

  const finalItems = limitNotificationCandidates(items);
  await appRuntimeCompat.syncWorkoutNotifications(finalItems);
}
window.addEventListener('fitAppForeground', ()=>{
  syncNativeNotifications().catch(()=>{});
});

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
  // Закрыть попап, внутри которого стоит кнопка. История навигации остаётся
  // за существующим MutationObserver; UI Core отвечает только за DOM-механику.
  closeModal: btn => {
    const m = appUi.closestModal(btn);
    appUi.closeModal(m);
  }
};
appUi.bindActions(document, ACTIONS);
// Клик мимо карточки — по затемнению, а не по самой карточке: e.target совпадает
// с попапом, только когда попали в подложку. #dlg решает это сам (appDialog ждёт
// свой промис), неотменяемые (data-locked="1") гасит dismissTopModal.
document.addEventListener('click', e => {
  const m = e.target;
  if(m.id !== 'dlg' && m.classList.contains('modal') && m.classList.contains('open')) dismissTopModal();
});

