/* ================= ВСТРОЕННЫЕ КАРТИНКИ ЭКРАНА ТРЕНИРОВКИ ================= */
const ILLO = {
  water: `<svg viewBox="0 0 240 120"><path class="acc" d="M104 20 L136 20 L130 100 L110 100 Z"/><path class="prop" d="M108 56 C116 50, 124 62, 132 56"/></svg>`,
  rest: `<svg viewBox="0 0 240 120"><path class="acc" d="M96 36 a28 28 0 1 0 52 34 a34 34 0 1 1 -52 -34 Z"/></svg>`
};

// дефолтная обложка программы — гантель
const DUMBBELL_ICON = `<svg viewBox="0 0 64 64" fill="currentColor"><rect x="15" y="19" width="9" height="26" rx="3.5"/><rect x="40" y="19" width="9" height="26" rx="3.5"/><rect x="6" y="25" width="6" height="14" rx="3"/><rect x="52" y="25" width="6" height="14" rx="3"/><rect x="24" y="29" width="16" height="6" rx="3"/></svg>`;




/* ================= ЗВУК ================= */
let soundOn = true; // общий выключатель звука
let lastAppSoundT = 0; // когда приложение само издавало звук — не принимаем его за голосовую команду
let prepSec = 5;   // отсчёт «Приготовься» перед стартом тренировки
let readySec = 5;  // подготовка перед упражнением на время
let sideSec = 10;  // пауза на смену стороны в упражнениях «на каждую сторону»
let fxVol = 1;    // громкость звуковых эффектов 0..1
let voiceVol = 1; // громкость голоса 0..1
let audioCtx = null, masterGain = null;
function initAudio(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(!masterGain){ masterGain = audioCtx.createGain(); masterGain.gain.value = fxVol; masterGain.connect(audioCtx.destination); }
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){}
}
function fxDest(){ return masterGain || audioCtx.destination; }
function beep(freq=880, dur=0.15, when=0, vol=0.25){
  if(!audioCtx || !soundOn || fxVol<=0) return;
  lastAppSoundT = Date.now() + (when + dur) * 1000;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type='sine'; o.frequency.value=freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + when + dur);
  o.connect(g); g.connect(fxDest());
  o.start(audioCtx.currentTime + when); o.stop(audioCtx.currentTime + when + dur + 0.05);
}
const tick = () => beep(660, .09, 0, .18);
const endSignal = () => { beep(880,.14,0); beep(880,.14,.2); beep(1320,.3,.4,.3); };

// гонг — начало нового упражнения
function gong(){
  if(!audioCtx || !soundOn || fxVol<=0) return;
  lastAppSoundT = Date.now() + 1500;
  const t = audioCtx.currentTime;
  [[110,1.6,.4],[164,1.2,.28],[218,1.0,.18],[329,1.9,.1]].forEach(([f,dur,vol])=>{
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type='sine'; o.frequency.value=f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.connect(g); g.connect(fxDest());
    o.start(t); o.stop(t+dur+.1);
  });
}

// СТАРТ УПРАЖНЕНИЯ — самый заметный сигнал, ни на что не похожий:
// низкий удар + восходящий колокольный аккорд со звоном
function exerciseGong(){
  if(!audioCtx || !soundOn || fxVol<=0) return;
  lastAppSoundT = Date.now() + 2200;
  const t = audioCtx.currentTime;

  // плотный низкий удар — «вес» события
  const bo = audioCtx.createOscillator(), bg = audioCtx.createGain();
  bo.type = 'sine';
  bo.frequency.setValueAtTime(200, t);
  bo.frequency.exponentialRampToValueAtTime(70, t + .55);
  bg.gain.setValueAtTime(.55, t);
  bg.gain.exponentialRampToValueAtTime(.001, t + .8);
  bo.connect(bg); bg.connect(fxDest());
  bo.start(t); bo.stop(t + .85);

  // восходящий колокольный аккорд до-ми-соль-до
  [[523.25, 0, .30], [659.25, .075, .28], [783.99, .15, .26], [1046.5, .225, .34]].forEach(([f, dt, vol])=>{
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + dt);
    g.gain.linearRampToValueAtTime(vol, t + dt + .012);
    g.gain.exponentialRampToValueAtTime(.001, t + dt + .75);
    o.connect(g); g.connect(fxDest());
    o.start(t + dt); o.stop(t + dt + .8);
  });

  // высокий звон-послезвучие
  const so = audioCtx.createOscillator(), sg = audioCtx.createGain();
  so.type = 'sine'; so.frequency.value = 2093;
  sg.gain.setValueAtTime(0, t + .22);
  sg.gain.linearRampToValueAtTime(.14, t + .25);
  sg.gain.exponentialRampToValueAtTime(.001, t + 1.15);
  so.connect(sg); sg.connect(fxDest());
  so.start(t + .22); so.stop(t + 1.2);
}

// фанфары — тренировка завершена
function fanfare(){
  if(!audioCtx || !soundOn || fxVol<=0) return;
  lastAppSoundT = Date.now() + 1500;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f,i)=> {
    beep(f, .22, i*.16, .25);
  });
  // финальный аккорд
  [783.99, 1046.5, 1318.5].forEach(f=>{
    const t = audioCtx.currentTime + notes.length*.16 + .05;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type='triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+1.1);
    o.connect(g); g.connect(fxDest());
    o.start(t); o.stop(t+1.2);
  });
}

// щелчки — фолбэк голосового отсчёта: 1 щелчок = 15 сек, 2 = 30 и т.д.
function clicks(n){
  if(!audioCtx || !soundOn || fxVol<=0) return;
  lastAppSoundT = Date.now() + 1500;
  for(let i=0;i<n;i++){
    const t = audioCtx.currentTime + i*0.22;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type='square'; o.frequency.value=1600;
    g.gain.setValueAtTime(.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+.04);
    o.connect(g); g.connect(fxDest());
    o.start(t); o.stop(t+.06);
  }
}

// Язык озвучки всегда следует языку приложения. Отдельно выбирается только голос;
// язык распознавания голосовых команд остаётся самостоятельной настройкой.
let savedVoiceURI = '';
let voiceLang = localeTag();
function voiceIsEnglish(){ return String(voiceLang || '').toLowerCase().startsWith('en'); }
function voicePlural(n, ruOne, ruFew, ruMany, enOne, enMany){
  return voiceIsEnglish() ? (Math.abs(Number(n)) === 1 ? enOne : enMany) : plural(n, ruOne, ruFew, ruMany);
}
function voicesForLang(lang){
  const prefix = String(lang || 'ru-RU').toLowerCase().split('-')[0];
  try{ return speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix)); }
  catch(e){ return []; }
}

// если голоса нет или ошибка — фолбэк-звук
let musicMode = false; // «не прерывать музыку»: голос заменяется сигналами
function speak(text, fallback, onDone){
  const done = ()=>{ if(onDone){ const f = onDone; onDone = null; f(); } };
  if(!soundOn){ done(); return; }
  if(voiceVol <= 0){ if(fallback) fallback(); done(); return; } // голос выключен — фолбэк-звук
  if(musicMode){ if(fallback) fallback(); done(); return; }
  try{
    if(!('speechSynthesis' in window)){ if(fallback) fallback(); done(); return; }
    const voices = speechSynthesis.getVoices();
    const matching = voicesForLang(voiceLang);
    if(voices.length && !matching.length){ if(fallback) fallback(); done(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang || 'ru-RU';
    u.rate = 1.05;
    u.volume = 1;
    const chosen = matching.find(v => v.voiceURI === savedVoiceURI) || matching[0];
    if(chosen) u.voice = chosen;
    let started = false;
    u.onstart = ()=>{ started = true; lastAppSoundT = Date.now() + 8000; }; // потолок на случай зависания
    u.onend = ()=>{ lastAppSoundT = Date.now() + 250; done(); };            // фраза кончилась — быстро отпускаем детектор
    u.onerror = ()=>{ lastAppSoundT = Date.now() + 250; if(!started && fallback) fallback(); done(); };
    try{ speechSynthesis.cancel(); }catch(e){}
    speechSynthesis.speak(u);
    // предохранитель: если TTS завис и не дал ни onend, ни onerror
    setTimeout(done, 6000);
  }catch(e){ if(fallback) fallback(); done(); }
}

// «Осталось N секунд» на отметках 60/45/30/15
function announceRemaining(sec){
  speak(voiceIsEnglish() ? `${sec} seconds remaining` : `Осталось ${sec} секунд`, ()=> clicks(sec/15));
}

// круг завершён — голосом с временем отдыха и следующим упражнением
function roundDone(seconds, nxt){
  let text;
  if(voiceIsEnglish()){
    text = seconds ? `Round complete. Rest for ${seconds} ${voicePlural(seconds,'секунду','секунды','секунд','second','seconds')}` : 'Round complete';
  } else {
    text = seconds ? `Круг завершён. Отдохните ${seconds} ${plural(seconds, 'секунду', 'секунды', 'секунд')}` : 'Круг завершён';
  }
  const nd = nextStepSpeech(nxt);
  if(nd) text += voiceIsEnglish() ? `. Next: ${nd}` : `. Далее — ${nd}`;
  speak(text, ()=>{ gong(); setTimeout(gong, 550); });
}

// обычный отдых — «Отдохните 45 секунд. Далее — скручивания лёжа»
// описание следующего шага для озвучки: «Планка, подход 2 из 3, сторона 1 из 2»
function nextStepSpeech(nxt){
  if(!nxt) return '';
  let out = nxt.title;
  if(nxt.setsTotal > 1) out += voiceIsEnglish()
    ? `, set ${nxt.setNo} of ${nxt.setsTotal}`
    : `, подход ${nxt.setNo} из ${nxt.setsTotal}`;
  if(nxt.side) out += voiceIsEnglish()
    ? `, side ${nxt.side} of ${nxt.sidesTotal || 2}`
    : `, сторона ${nxt.side} из ${nxt.sidesTotal || 2}`;
  return out;
}
function announceRest(seconds, nxt){
  let text = voiceIsEnglish()
    ? `Rest for ${seconds} ${voicePlural(seconds,'секунду','секунды','секунд','second','seconds')}`
    : `Отдохните ${seconds} ${plural(seconds, 'секунду', 'секунды', 'секунд')}`;
  const nd = nextStepSpeech(nxt);
  if(nd) text += voiceIsEnglish() ? `. Next: ${nd}` : `. Далее — ${nd}`;
  speak(text, ()=> beep(520, .18, 0, .2));
}

// склонение: 1 повторение, 2 повторения, 5 повторений
function plural(n, one, few, many){
  n = Math.abs(n) % 100;
  if(n > 10 && n < 20) return many;
  const n1 = n % 10;
  if(n1 === 1) return one;
  if(n1 > 1 && n1 < 5) return few;
  return many;
}

// озвучка упражнения: «Приседания, 30 повторений» / «Планка, 120 секунд»
function announceExercise(step, onDone){
  let text = step.title;
  if(step.setsTotal > 1) text += voiceIsEnglish()
    ? `, set ${step.setNo} of ${step.setsTotal}`
    : `, подход ${step.setNo} из ${step.setsTotal}`;
  if(step.kind === 'click'){
    const r = parseValue(step.reps);
    if(r.min === r.max){
      text += voiceIsEnglish()
        ? `, ${r.min} ${voicePlural(r.min,'повторение','повторения','повторений','rep','reps')}`
        : `, ${r.min} ${plural(r.min, 'повторение', 'повторения', 'повторений')}`;
    } else {
      text += voiceIsEnglish()
        ? `, ${r.min} to ${r.max} reps`
        : `, от ${r.min} до ${r.max} ${plural(r.max, 'повторения', 'повторений', 'повторений')}`;
    }
    if(step.perSide) text += voiceIsEnglish() ? ', on each side' : ', на каждую сторону';
  } else if(step.seconds){
    text += voiceIsEnglish()
      ? `, ${step.seconds} ${voicePlural(step.seconds,'секунда','секунды','секунд','second','seconds')}`
      : `, ${step.seconds} ${plural(step.seconds, 'секунда', 'секунды', 'секунд')}`;
    if(step.perSide){
      text += step.side
        ? (voiceIsEnglish() ? `, side ${step.side} of ${step.sidesTotal || 2}` : `, сторона ${step.side} из ${step.sidesTotal || 2}`)
        : (voiceIsEnglish() ? ', on each side' : ', на каждую сторону');
    }
  }
  if(step.weight > 0){
    const kg = voiceIsEnglish() ? fmtKg(step.weight) : fmtKg(step.weight).replace('.', ',');
    text += voiceIsEnglish()
      ? `, weight ${kg} ${voicePlural(Math.round(step.weight),'килограмм','килограмма','килограммов','kilogram','kilograms')}`
      : `, вес ${kg} ${plural(Math.round(step.weight), 'килограмм', 'килограмма', 'килограммов')}`;
  }
  speak(text, null, onDone);
}

// мини-таймер подготовки перед упражнением на время: полоса + отсчёт, в конце гонг.
// считаем по кадрам, чтобы пауза реально останавливала подготовку
const RR_LEN = 2 * Math.PI * 17; // длина окружности кольца подготовки (r=17 в svg 40×40)
function runReadyBar(sec, done){
  const box = $('readyRing'), arc = $('readyArc'), num = $('readyNum');
  if(!box || sec <= 0){ done(); return; }
  const totalMs = sec * 1000;
  let left = totalMs, last = performance.now(), lastShown = sec;
  setShown(box, true);
  document.body.classList.add('readying'); // прячет вес рядом с таймером на время отсчёта — иначе им негде стоять вместе
  arc.style.strokeDashoffset = RR_LEN;   // пустое кольцо в начале
  num.innerHTML = tnum(sec);
  beep(660, .08);
  state.readyRAF = requestAnimationFrame(function tick(now){
    if(!state.readyRAF) return; // отменили
    const dt = now - last; last = now;
    if(!state.paused){
      left -= dt;
      if(left <= 0){
        state.readyRAF = 0;
        hideReadyBar();
        done();
        return;
      }
      // кольцо заполняется к нулю: круг замкнулся — упражнение началось
      arc.style.strokeDashoffset = (left / totalMs * RR_LEN).toFixed(2);
      const s = Math.ceil(left / 1000);
      if(s !== lastShown){ lastShown = s; num.innerHTML = tnum(s); beep(660, .08); }
    }
    state.readyRAF = requestAnimationFrame(tick);
  });
}
function hideReadyBar(){
  if(state.readyRAF){ cancelAnimationFrame(state.readyRAF); state.readyRAF = 0; }
  if(state.readyTimer){ clearInterval(state.readyTimer); state.readyTimer = null; }
  const box = $('readyRing');
  if(box) setShown(box, false);
  document.body.classList.remove('readying');
}

// бодрый сигнал «старт!» после озвучки упражнения
function startSignal(){
  beep(880, .1, 0, .3);
  beep(1320, .28, .13, .35);
}

/* ================= WAKE LOCK ================= */
let wakeLock = null;
async function keepAwake(){
  try{ if('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
}
function releaseWake(){ try{ wakeLock && wakeLock.release(); wakeLock=null; }catch(e){} }

/* ================= СОСТОЯНИЕ ================= */
let state = {
  current: null,   // выбранная программа (месяц или своя)
  steps: [],       // развёрнутый список шагов на все 4 круга
  startLoad: null, // нагрузка в момент старта — для точного сравнения в следующий раз
  stepIdx: 0,
  stepTimer: null, // interval текущего шага-таймера
  remaining: 0,
  load: 100,       // выбранная нагрузка в %
  prepTimer: null, // отсчёт перед стартом тренировки
  readyTimer: null, // (не используется, оставлено для совместимости)
  readyRAF: 0,      // кадровый цикл подготовки перед упражнением на время
  live: false,     // тренировка идёт прямо сейчас
  paused: false,
  pausedAt: 0,
  pausedTotal: 0,  // суммарное время на паузе, мс
  globalStart: 0,
  globalInterval: null
};

const $ = id => document.getElementById(id);

// лёгкая тактильная отдача на нажатия (где поддерживается)
function haptic(ms){
  if(window.FitNative && window.FitNative.haptic && window.FitNative.haptic()) return;
  try{ navigator.vibrate && navigator.vibrate(ms || 8); }catch(e){}
}
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('button, .day-chip, .load-chip, .plan-tab, .choice, .user-row, .mine-card .mc-cover, .cal-cell.done, a.btn-exit, .back-chip, .switch, .icon-btn');
  if(t && !t.disabled) haptic(8);
}, {passive: true});

/* ================= ИКОНКИ (единый стиль, stroke 2) ================= */
/* ================= ИКОНКИ =================
   ЕДИНСТВЕННЫЙ источник иконок в приложении — этот объект. Ни эмодзи, ни типографские
   заменители («＋», «‹», «✕», «✓»), ни картинки со стороны: они не масштабируются, не
   слушаются темы и на каждом устройстве выглядят по-своему.

   Как пользоваться:
   • в разметке — пустой элемент с атрибутом: <span data-icon="plus"></span>.
     Один проход по документу на старте подставит SVG во все такие элементы, заводить
     строку JS на каждую новую кнопку не нужно;
   • из кода — icon('plus') возвращает готовую разметку <svg>.

   Как добавлять новую иконку: только сюда, значением — ВНУТРЕННОСТИ svg (пути, круги),
   без самого тега <svg>: обёртку с общими атрибутами добавляет icon(). Правила формы —
   сетка 24×24, только контур (stroke), толщина 2, скругления на концах, никакой заливки
   и никаких захардкоженных цветов: цвет наследуется через currentColor.

   Единственное исключение — логотип YouTube в разметке: это чужой фирменный знак,
   у него своя форма и заливка, и «привести его к сетке» значит нарисовать не его. */
const ICONS = {
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  grip: '<circle cx="9" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.3" fill="currentColor" stroke="none"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  home: '<path d="M3.6 10.4 12 3.6l8.4 6.8V20a1 1 0 0 1-1 1h-4.6v-6.2H9.2V21H4.6a1 1 0 0 1-1-1Z"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.3 13.6a7.8 7.8 0 0 0 0-3.2l1.8-1.4-1.9-3.3-2.1.8a7.7 7.7 0 0 0-2.8-1.6L13.9 2.7h-3.8l-.4 2.2a7.7 7.7 0 0 0-2.8 1.6l-2.1-.8-1.9 3.3 1.8 1.4a7.8 7.8 0 0 0 0 3.2l-1.8 1.4 1.9 3.3 2.1-.8a7.7 7.7 0 0 0 2.8 1.6l.4 2.2h3.8l.4-2.2a7.7 7.7 0 0 0 2.8-1.6l2.1.8 1.9-3.3Z"/>',
  reset: '<path d="M3 3v6h6"/><path d="M3.8 9A9 9 0 1 0 6 5.3L3 8"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>',
  play: '<path d="M7 4.5 20 12 7 19.5Z" fill="currentColor" stroke-linejoin="round"/>',
  vol: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  volX: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.4l6.8 3.9M15.4 6.7 8.6 10.6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  // искра и огонь нарисованы по центру сетки 24×24: раньше искра стояла на две
  // единицы выше центра, а огонь — на полторы ниже, и в чипе рядом с часами
  // огонёк заметно съезжал вниз относительно текста
  sparkle: '<path d="M12 5l1.9 5.1L19 12l-5.1 1.9L12 19l-1.9-5.1L5 12l5.1-1.9Z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  more: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  weight: '<circle cx="12" cy="6" r="3"/><path d="M6 21l1.5-9h9L18 21H6Z"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4V8Z"/><circle cx="12" cy="13" r="3.2"/>',
  flame: '<path d="M12 20.4c4 0 6.5-2.6 6.5-6 0-4.5-4-6.4-3.4-10.8C12.8 4.8 10 7 10 9.4c-.9-.6-1.4-1.6-1.5-2.7C7 8.2 5.5 10.4 5.5 13.4c0 3.7 2.7 7 6.5 7Z"/>',
  moon: '<path d="M20 14.5A8.3 8.3 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M6 15H4.5A1.5 1.5 0 0 1 3 13.5V4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17l5-5 4 4 3-2.5 4 3.5"/>',
  fingerprint: '<path d="M3.5 12.5a8.5 8.5 0 0 1 17 0v1.5"/><path d="M6.5 12.5a5.5 5.5 0 0 1 11 0v3.5"/><path d="M9.5 12.5a2.5 2.5 0 0 1 5 0v5"/><path d="M12 12.5V20"/><path d="M6.4 17.6A7 7 0 0 1 5 20"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="M16.5 10.5 22 7v10l-5.5-3.5Z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  // щит — раздел о данных; сердце — раздел о здоровье. Та же сетка 24×24, контур,
  // толщина 2, цвет через currentColor
  // документ — пользовательское соглашение: «книга» уже занята обучением и
  // каталогом, и два одинаковых значка в одном списке настроек читаются как ошибка
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
  shield: '<path d="M12 3l7 3v5.4c0 4.2-2.9 7.7-7 8.6-4.1-.9-7-4.4-7-8.6V6l7-3Z"/>',
  heart: '<path d="M12 20.2C9.6 18.6 4 14.6 4 10.5A3.8 3.8 0 0 1 12 8.4a3.8 3.8 0 0 1 8 2.1c0 4.1-5.6 8.1-8 9.7Z"/>',
  // давление: шкала со стрелкой. Рядом с пульсом нужен ДРУГОЙ знак — два сердца
  // подряд читаются как одна метрика, показанная дважды
  gauge: '<path d="M3.5 17.5a8.5 8.5 0 1 1 17 0"/><path d="M12 17.5 16.4 12"/><circle cx="12" cy="17.7" r="1.5"/>',
  // включить / отключить программу
  power: '<path d="M12 3v9"/><path d="M6.9 6.9a7.5 7.5 0 1 0 10.2 0"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5Z"/><path d="M8 3v18"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4"/><path d="M17.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="M9.2 9.6 6 2h4l2.4 5.6M14.8 9.6 18 2h-4l-1.2 2.8"/><path d="m12 12.6.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9 14.8l2-.3.9-1.9Z"/>',
  crown: '<path d="M3.5 18h17l1.2-9.4-5 3.4L12 4.6 7.3 12l-5-3.4L3.5 18Z"/><path d="M4.4 21h15.2"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.6a2 2 0 0 0 0 4H7M17 6h2.4a2 2 0 0 1 0 4H17"/><path d="M12 14v3M8.5 20.5h7M9.6 17.6h4.8l1 2.9H8.6l1-2.9Z"/>',
  rocket: '<path d="M12 2.7c2.9 2.2 4.4 5.4 4.4 9.2l-1.7 3.4H9.3L7.6 11.9c0-3.8 1.5-7 4.4-9.2Z"/><circle cx="12" cy="10" r="1.9"/><path d="M9.3 15.3 6.6 17c-.5.3-.8.9-.7 1.5l.4 2.4 3.3-1.6M14.7 15.3l2.7 1.7c.5.3.8.9.7 1.5l-.4 2.4-3.3-1.6"/>',
  gem: '<path d="M7.4 3.5h9.2l3.9 5.2L12 20.5 3.5 8.7l3.9-5.2Z"/><path d="M3.5 8.7h17M8.6 8.7 12 20.5l3.4-11.8M7.4 3.5l1.2 5.2M16.6 3.5l-1.2 5.2"/>',
  sprout: '<path d="M12 21v-7.4"/><path d="M12 13.6C12 10.5 9.6 8 6.4 8c0 3.1 2.5 5.6 5.6 5.6Z"/><path d="M12 12.4c0-3.1 2.5-5.6 5.6-5.6 0 3.1-2.5 5.6-5.6 5.6Z"/><path d="M8 21h8"/>',
  bolt: '<path d="M13.4 2.5 4.8 13.2h5.6l-.6 8.3 8.6-10.7h-5.6l.6-8.3Z"/>',
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  dumbbell: '<path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9"/>'
};
function icon(name){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/* ================= МЫШЕЧНЫЕ ГРУППЫ ================= */
// ОДИН набор на всё приложение. Списки чипов у программы и у упражнения разошлись:
// инвентарь начинался то с «Нет», то с «Без инвентаря», «Резинки» против «Резинка»,
// а «Утяжелители» и «Турник» были только у программы. Держим их здесь, до первого
// использования, и подставляем в оба места.
const OPT_LEVEL = ['Новичок', 'Средний', 'Продвинутый'];
// Зачем человек тренируется. Один список и для вопроса при создании программы,
// и для направлений каталога: «Похудение» в фильтре против «Похудеть» в чипах —
// это два разных слова для одного и того же, и человек честно их не узнавал.
const OPT_GOAL = ['Похудеть', 'Подтянуть всё тело', 'Ягодицы и пресс', 'Плоский живот',
  'Сила и выносливость', 'Рельеф мышц', 'Растяжка и гибкость', 'Осанка и спина',
  'Восстановиться после родов', 'Кардио и энергия'];
// чипы-исключения: выбран такой — остальные снимаются, и наоборот
const OPT_NONE = new Set(['Без инвентаря', 'Без ограничений']);
const OPT_EQUIP = ['Без инвентаря', 'Коврик', 'Гантели', 'Резинки', 'Стул', 'Фитбол', 'Утяжелители', 'Турник'];

const MUSCLES = [
  ['ne','Шея'], ['sh','Плечи'], ['ch','Грудь'], ['ar','Руки'], ['co','Пресс'],
  ['ba','Спина'], ['gl','Ягодицы'], ['le','Квадрицепс'], ['hm','Задняя бедра'], ['ca','Икры']
];
const M_LABEL = Object.fromEntries(MUSCLES);

/* ================= ПОКАЗ И СКРЫТИЕ ================= */
// единственный способ управлять видимостью: класс, а не инлайновый display.
// инлайн ломал flex-раскладку и не мог побить .hidden{display:none!important}
function setShown(el, on){
  const node = (typeof el === 'string') ? $(el) : el;
  if(node) node.classList.toggle('hidden', !on);
}

/* ================= ЗАЩИТА ОТ ПОТЕРИ ПРАВОК ================= */
// снимки форм: сравниваем текущее состояние с тем, что было при открытии
const snap = {};
function takeSnap(key, val){ snap[key] = JSON.stringify(val ?? null); }
function isChanged(key, val){ return snap[key] !== undefined && snap[key] !== JSON.stringify(val ?? null); }
function clearSnap(key){ delete snap[key]; }

// спрашивает подтверждение, если что-то менялось; иначе уходит молча
// Формулировка одна на всё приложение: «ещё не сохранены» (а не «не сохранены» —
// прошедшее время звучало как приговор), а кнопки всегда «Выйти без сохранения»
// и «Остаться» — вместо пяти разных способов сказать «отменить».
async function leaveGuard(changed, go, what){
  if(changed){
    const ok = await appDialog(
      t('common.unsaved',{what:what || t('common.changes')}),
      {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')}
    );
    if(!ok) return false;
  }
  go();
  return true;
}

// текст в полях ИИ-экрана считается несохранённой работой
function aiScreenDirty(ids){
  return ids.some(id => { const el = $(id); return el && (el.value || '').trim(); });
}

/* ================= ПРОВЕРКА ЧИСЛОВЫХ ПОЛЕЙ =================
   Раньше «абв» в поле повторений молча превращалось в 1 при сохранении.
   Теперь поле краснеет прямо во время ввода и говорит, что от него хотят,
   а сохранение не проходит, пока ошибка не исправлена. */
const NUM_RULES = {
  int:   {re: /^\s*\d{1,4}\s*$/,                          key: 'num.int'},
  range: {re: /^\s*\d{1,3}\s*(?:[-–—]\s*\d{1,3}\s*)?$/, key: 'num.range'},
  dec:   {re: /^\s*\d{1,4}(?:[.,]\d{1,2})?\s*$/,         key: 'num.dec'}
};
function markNum(el){
  const kind = el.dataset.numKind;
  const rule = NUM_RULES[kind];
  if(!rule) return true;
  const raw = el.value;
  const empty = !raw.trim();
  const bad = empty ? !!el.dataset.numReq : !rule.re.test(raw);
  const field = el.closest('.field') || el.parentElement;
  field.classList.toggle('bad', bad);
  let hint = field.querySelector('.field-err');
  if(bad){
    if(!hint){
      hint = document.createElement('p');
      hint.className = 'field-err';
      field.appendChild(hint);
    }
    hint.innerHTML = icon('alert') + '<span></span>';
    hint.querySelector('span').textContent = empty ? t('num.required') : t(rule.key);
  } else if(hint) hint.remove();
  return !bad;
}
function guardNum(id, kind, required){
  const el = $(id);
  if(!el) return;
  el.dataset.numKind = kind;
  if(required) el.dataset.numReq = '1';
  const check = () => markNum(el);
  el.addEventListener('input', check);
  el.addEventListener('blur', check);
}
// проверяет все видимые числовые поля экрана; на первую ошибку — прокрутка и фокус
function numFieldsOk(scopeId){
  const scope = $(scopeId);
  if(!scope) return true;
  let first = null;
  scope.querySelectorAll('[data-num-kind]').forEach(el => {
    if(el.offsetParent === null) return; // поле сейчас скрыто — не наша забота
    if(!markNum(el) && !first) first = el;
  });
  if(first){
    try{ first.scrollIntoView({block: 'center', behavior: 'smooth'}); }catch(_){}
    first.focus();
    return false;
  }
  return true;
}

/* ================= КАСКАД НАСТРОЕК ЗВУКА (общий для трёх мест) ================= */
// показывает/прячет вложенные блоки по состоянию тумблеров; сама раскладка одна и та же
// в профиле, на экране старта и в попапе на тренировке — меняются только префикс id и что именно сохраняется
function syncSoundCascade(p){
  const on = $(p + 'SoundOn').classList.contains('on');
  setShown(p + 'SoundBox', on);
  if(!on) return;
  setShown(p + 'FxField', $(p + 'FxOn').classList.contains('on'));
}

/* ================= ДИАЛОГИ ПРИЛОЖЕНИЯ (вместо системных) ================= */
function appDialog(msg, opts = {}){
  return new Promise(res => {
    $('dlgMsg').textContent = msg;
    const codeEl = $('dlgCode');
    if(opts.code){ setShown(codeEl, true); codeEl.value = opts.code; }
    else setShown(codeEl, false);
    // opts.type — фраза, которую надо набрать: пока она не совпала, кнопка не работает
    const typed = $('dlgType');
    setShown('dlgTypeBox', !!opts.type);
    typed.oninput = null;
    if(opts.type){
      typed.value = '';
      $('dlgTypeLabel').textContent = t('dialog.type',{text:opts.type});
      const check = ()=>{ $('dlgOk').disabled = typed.value.trim().toLowerCase() !== opts.type.toLowerCase(); };
      typed.oninput = check;
      check();
      setTimeout(()=> typed.focus(), 80);
    } else {
      $('dlgOk').disabled = false;
    }
    $('dlgOk').textContent = opts.okText || t('common.ok');
    if(opts.cancelText) $('dlgCancel').textContent = opts.cancelText;
    else $('dlgCancel').textContent = t('common.cancel');
    setShown('dlgCancel', opts.confirm);
    $('dlg').classList.add('open');
    const done = v => {
      $('dlg').classList.remove('open');
      $('dlgOk').onclick = $('dlgCancel').onclick = $('dlg').onclick = null;
      $('dlgOk').disabled = false;
      setShown('dlgTypeBox', false);
      typed.oninput = null;
      res(v);
    };
    $('dlgOk').onclick = () => done(true);
    $('dlgCancel').onclick = () => done(false);
    $('dlg').onclick = e => { if(e.target === $('dlg')) done(opts.confirm ? false : true); };
  });
}
const appAlert = (m, o) => appDialog(m, o);
// Подтверждение действия. Кнопка по умолчанию — «Подтвердить», а не «Да»:
// «Да» была безопасна только когда текст вопроса читается как «да/нет», а
// у нас — «Удалить программу?».
const appConfirm = (m, o) => appDialog(m, {confirm: true, okText: t('common.confirm'), cancelText: t('common.cancel'), ...o});
const screens = ['scrMenu','scrPrograms','scrStore','scrStoreItem','scrAccount','scrStart','scrWork','scrFinish','scrBuilder','scrProgSettings','scrExercise','scrImages','scrAI','scrLegal','scrStats','scrUserEdit','scrTrainer','scrClient','scrTrainerPage','scrPublish','scrMyCatalog','scrOnboard'];
/* Корневые разделы: только у них внизу док и нет собственной панели действий.

   «Подопечные» — раздел, который есть не у всех: он появляется вместе с режимом
   тренера и исчезает вместе с ним. Держать его в списке всегда можно и нужно —
   иначе show() не узнает в нём корневой экран, — а прячет кнопку сам док. */
const ROOT_TABS = ['scrMenu','scrPrograms','scrTrainer','scrStats','scrAccount'];
// Глубина истории относительно «Сегодня»: лежит прямо в состоянии записи, поэтому
// переживает и системную кнопку «назад», и перезаход по истории.
let navDepth = 0;
// Путь по экранам, каким его видит человек. Нужен, чтобы возврат на экран, где
// он уже был, НЕ добавлял запись в историю: «конструктор → настройки → назад →
// упражнение → назад → настройки → назад» копил по записи на каждый шаг, и
// потом системная кнопка «назад» требовала столько же нажатий, сколько было
// переходов. Теперь такой возврат отматывает историю назад, а не удлиняет её.
let navStack = ['scrMenu'];
// Вкладка — ДРУГОЙ ВИД ТОГО ЖЕ МЕСТА, а не шаг вглубь: «Вручную / Через ИИ / Из
// видео» переключают способ, но человек всё это время делает одно и то же дело.
// Поэтому переключение ЗАМЕНЯЕТ текущую запись истории, а не добавляет новую:
// иначе двадцать переключений туда-сюда давали двадцать записей, и «назад»
// приходилось жать двадцать два раза вместо одного (измерено).
let tabSwitch = false;
function asTab(fn){
  tabSwitch = true;
  try{ fn(); } finally { tabSwitch = false; }
}
try{ history.replaceState({scr:'scrMenu', d:0}, ''); }catch(e){}
// Что считается несохранённой работой на каждом экране. Раньше эту проверку знали
// только кнопки «назад» внутри приложения, а системная кнопка «назад» звала show()
// напрямую — и набранная программа исчезала молча.
const LEAVE_GUARDS = {
  scrBuilder:  ()=> programDirty() ? {what:t('builder.programChanges'), clean:()=> clearSnap('program')} : null,
  scrExercise: ()=> exDirty() ? {what:t('exercise.changes'), clean:()=>{ dropFreshEx(); exDraft = null; exIdx = -1; exOrig = ''; exFromWork = false; }} : null,
  scrUserEdit: ()=> userDirty() ? {what:t('profile.changes')} : null,
  scrAI:       ()=> (AI_SOURCES[aiSrc] && aiScreenDirty(AI_SOURCES[aiSrc].dirty)) ? {what:t('ai.filledRequest')} : null
};
let guardBypass = false; // второй заход после подтверждения — уже не спрашиваем
// Жест «назад» и системная кнопка закрывают открытый попап, а не уводят с экрана.
// Закрываем ровно тем же путём, что и собственная кнопка отмены: на ней у части
// попапов висит возврат состояния, и простое снятие класса его бы потеряло.
// #dlg проверяем первым: он лежит выше остальных (z-index 90) и может быть открыт
// поверх другого попапа.
function dismissTopModal(){
  const dlg = $('dlg');
  const m = dlg.classList.contains('open')
    ? dlg
    : [...document.querySelectorAll('.modal.open')].pop();
  if(!m) return false;
  // попап хода работы: пока идёт запрос к ИИ, закрывать нечего — жест просто гасим
  if(m.dataset.locked === '1') return true;
  if(m === dlg){
    // тот же путь, что и нажатие мимо карточки: промис appDialog обязан завершиться
    m.dispatchEvent(new MouseEvent('click', {bubbles: false}));
    return true;
  }
  const cancel = m.querySelector('.modal-btn');
  if(cancel){ cancel.click(); return true; }
  m.classList.remove('open');
  return true;
}

// Системная кнопка «назад» забирает у истории одну запись — и только тогда срабатывает
// popstate. На корневом экране записей нет вообще: приложение просто сворачивалось,
// даже когда поверх него был открыт попап. Поэтому попап сам добавляет себе запись —
// её и заберёт жест «назад», а обработчик ниже закроет попап.
let skipPop = 0;   // наш собственный history.back(), а не жест человека
let modalsOpen = false;
let lockedY = 0;
// Пока страница зафиксирована, у неё нет прокрутки — и нижняя панель кнопок,
// которая держалась на position:sticky, теряет то, к чему прилипала: она
// подпрыгивала вверх ровно на величину прокрутки. На экране, пролистанном на
// треть, «Готово» с открытием любого попапа улетало на середину экрана.
// Поэтому на время попапа панель замирает там, где её видно.
function freezeSticky(on){
  document.querySelectorAll('.builder-actions, .actions').forEach(el => {
    if(on){
      if(!el.offsetParent) return;
      const r = el.getBoundingClientRect();
      el.dataset.froze = '1';
      el.style.position = 'fixed';
      // top у fixed задаёт край ПОЛЯ, а не рамки: собственный верхний отступ
      // панели сдвинул бы её ещё на свою величину вниз
      el.style.margin = '0';
      el.style.top = Math.round(r.top) + 'px';
      el.style.left = Math.round(r.left) + 'px';
      el.style.width = Math.round(r.width) + 'px';
    } else if(el.dataset.froze){
      delete el.dataset.froze;
      el.style.position = el.style.top = el.style.left = el.style.width = el.style.margin = '';
    }
  });
}
function lockPage(on){
  const b = document.body;
  if(on === b.classList.contains('modal-lock')) return;
  if(on){
    lockedY = window.scrollY || window.pageYOffset || 0;
    freezeSticky(true);          // замеряем ДО фиксации страницы
    b.style.top = `-${lockedY}px`;
    b.classList.add('modal-lock');
  } else {
    b.classList.remove('modal-lock');
    b.style.top = '';
    window.scrollTo(0, lockedY);
    freezeSticky(false);
  }
}
new MutationObserver(()=>{
  const now = !!document.querySelector('.modal.open');
  if(now === modalsOpen) return;
  modalsOpen = now;
  lockPage(now);
  if(now){
    try{ history.pushState({scr: show._last, d: navDepth, m: 1}, ''); }catch(e){}
    return;
  }
  // Попап закрыли кнопкой — лишнюю запись надо убрать. Но только если она всё ещё
  // сверху: попап мог увести на другой экран (например, «Вручную» → конструктор),
  // и тогда наш history.back() отменил бы этот переход.
  if(history.state && history.state.m){
    skipPop++;
    try{ history.back(); }catch(e){ skipPop = Math.max(0, skipPop - 1); }
  }
}).observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ['class']});

window.addEventListener('popstate', async e => {
  if(skipPop > 0){ skipPop--; return; }   // это мы сами сняли запись закрытого попапа
  // открытый попап забирает жест себе — экран под ним остаётся на месте
  if(document.querySelector('.modal.open')){
    try{ history.pushState(e.state || {scr: show._last, d: navDepth}, ''); }catch(_){}
    dismissTopModal();
    return;
  }
  if($('scrWork').classList.contains('on')){
    // назад во время тренировки — спрашиваем, а не выбрасываем
    try{ history.pushState({scr:'scrWork'}, ''); }catch(_){}
    exitWorkout();
    return;
  }
  let targetScreen = (e.state && e.state.scr) || 'scrMenu';
  navDepth = (e.state && typeof e.state.d === 'number') ? e.state.d : 0;
  {
    const at = navStack.lastIndexOf(targetScreen);
    if(at >= 0) navStack.length = at + 1; else navStack = [targetScreen];
  }
  // На эти экраны нельзя вернуться «из истории» — там нет живого состояния.
  // Исключение: тренировка, которая ИДЁТ ПРЯМО СЕЙЧАС. С неё можно уйти в
  // редактор упражнения, и жест «назад» обязан вернуть на неё, а не выбросить
  // на «Сегодня», бросив занятие на середине.
  if((targetScreen === 'scrWork' && !state.live) || targetScreen === 'scrFinish' || targetScreen === 'scrOnboard') targetScreen = 'scrMenu';

  if(!guardBypass){
    const cur = screens.find(id => $(id) && $(id).classList.contains('on'));
    let g = null;
    try{ g = cur && LEAVE_GUARDS[cur] ? LEAVE_GUARDS[cur]() : null; }catch(_){ g = null; }
    if(g){
      // возвращаем позицию в истории, чтобы «Вернуться» действительно вернуло
      navDepth++;
      try{ history.pushState({scr: cur, d: navDepth}, ''); }catch(_){}
      const ok = await appDialog(
        t('common.unsaved',{what:g.what}),
        {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')}
      );
      if(!ok) return;
      if(g.clean) g.clean();
      guardBypass = true;
      history.back();
      return;
    }
  }
  guardBypass = false;
  show(targetScreen, false);
});
// «Назад» и «Готово» на вложенном экране ВОЗВРАЩАЮТ, а не переходят: если нужный
// экран лежит в пути прямо под текущим, снимаем запись истории вместо того, чтобы
// класть новую. Иначе «конструктор → настройки → назад → упражнение → назад» копил
// по записи на каждый шаг: сорок переходов давали сорок одну запись, и системная
// кнопка «назад» тридцать раз подряд не выводила из конструктора.
// Экран покажет сам popstate — здесь только отматываем.
function goBackTo(id){
  if(navStack.length > 1 && navStack[navStack.length - 2] === id && show._last === navStack[navStack.length - 1]){
    try{ history.back(); return; }catch(e){}
  }
  show(id);
}

function show(id, push = true){
  // Ушли из редактора, не сохранив только что заведённое упражнение, — строку в
  // списке не оставляем. Ловим здесь, а не в кнопке «назад»: уйти можно ещё
  // жестом и системной кнопкой, и тогда в программе оставалось «Без названия».
  // Переключение ВКЛАДКИ уходом не считается: это тот же экран в другом виде.
  // Из-за этого ломалась правка упражнения прямо с тренировки: сходил на вкладку
  // «Через ИИ» и обратно — exFromWork терялся, и «Готово» уводило в конструктор,
  // бросив тренировку на середине.
  if(show._last === 'scrExercise' && id !== 'scrExercise' && !tabSwitch){ dropFreshEx(); exFromWork = false; }
  if(push && show._last !== id){
    if(tabSwitch){
      navStack[navStack.length - 1] = id;
      try{ history.replaceState({scr: id, d: navDepth}, ''); }catch(e){}
    } else {
      navStack.push(id);
      navDepth++;
      try{ history.pushState({scr: id, d: navDepth}, ''); }catch(e){}
    }
  }
  if(show._last !== id) stopFinishFx(); // праздник остаётся на своём экране
  show._last = id;
  screens.forEach(s => $(s).classList.toggle('on', s===id));
  // верхняя полоса нужна ровно одному экрану — тренировке
  setShown('topBar', id==='scrWork');
  $('btnExit').classList.toggle('on', id==='scrWork');
  $('btnSoundW').classList.toggle('on', id==='scrWork');
  $('btnMicW').classList.toggle('on', id==='scrWork' && !!SR);
  document.querySelectorAll('.dock-btn').forEach(b => {
    const on = b.dataset.scr === id;
    b.classList.toggle('act', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  syncDock();
  // тренировка живёт ровно в один экран телефона: скроллится только описание,
  // а панель управления всегда на одном месте (см. body.screen-work в стилях)
  document.body.classList.toggle('screen-work', id==='scrWork');
  if(ROOT_TABS.includes(id)) prepTab(id);
  // Если приложение долго было в фоне посреди тренировки, не прерываем подход
  // биометрией. Проверку откладываем до первого выхода с экрана тренировки.
  if(id !== 'scrWork' && typeof maybeRunDeferredBiometricLock === 'function') maybeRunDeferredBiometricLock();
}

// содержимое вкладки всегда свежее — неважно, пришли в неё по доку, по кнопке
// внутри приложения или системным «назад»
function prepTab(id){
  try{
    if(id === 'scrStats'){ renderStats(); renderWeight(); renderWellness(); renderPhotos(); }
    else if(id === 'scrPrograms'){ renderMine(); }
    else if(id === 'scrAccount'){
      switchMoreTab(typeof moreTab === 'string' ? moreTab : 'me');
      renderUsers();
      renderTrainerCard();
      // звук и управление без рук переехали сюда из «Настроек»
      syncSettingsForm();
      fillLiveSoundCascade('st');
      $('hfHint').textContent = hfHintText(hfMode);
      document.querySelectorAll('#hfSeg button').forEach(b => b.classList.toggle('act', b.dataset.hf === hfMode));
    }
    else if(id === 'scrTrainer'){ refreshClientsScreen(); }
    else if(id === 'scrMenu'){ renderGreeting(); renderToday(); }
  }catch(e){}
}

/* ---- док: показываем только на корневых разделах и только без клавиатуры ----
   Правило владельца: две закреплённые полосы одновременно недопустимы. Панель
   действий есть у каждого глубокого экрана, поэтому там дока нет вовсе, а на
   корневых нет панели действий. Клавиатура — третий случай: пока в фокусе поле
   ввода, док уезжает, иначе он сядет поверх клавиатуры на «Настройках». */
function kbFocused(){
  const el = document.activeElement;
  return !!(el && el.matches && el.matches('input:not([type=range]):not([type=file]):not([type=checkbox]),textarea'));
}
// Кнопка «Подопечные» живёт вместе с режимом тренера. Зовётся оттуда же, откуда
// перерисовывается карточка тренера, — чтобы появляться в тот же миг, а не после
// перезапуска.
function syncDockTabs(){
  const b = document.querySelector('.dock-btn[data-scr="scrTrainer"]');
  if(b) setShown(b, trainerOn());
}

function syncDock(){
  setShown('dock', ROOT_TABS.includes(show._last) && !kbFocused());
}
document.addEventListener('focusin', ()=> syncDock());
document.addEventListener('focusout', ()=> setTimeout(syncDock, 60));

// Переход по доку. Вкладки не копят историю: поверх «Сегодня» живёт максимум одна
// запись, а «назад» с любой вкладки возвращает на «Сегодня».
function goTab(id){
  const cur = show._last;
  if(cur === id){
    try{ window.scrollTo({top: 0, behavior: 'smooth'}); }catch(e){ window.scrollTo(0, 0); }
    return;
  }
  if(!ROOT_TABS.includes(cur)){
    // возврат из глубины: текущая запись становится «Сегодня», вкладка ложится поверх
    navDepth = 0;
    navStack = ['scrMenu'];
    try{ history.replaceState({scr:'scrMenu', d:0}, ''); }catch(e){}
    if(id === 'scrMenu'){ show('scrMenu', false); window.scrollTo(0, 0); return; }
    show(id, true);
    window.scrollTo(0, 0);
    return;
  }
  if(id === 'scrMenu'){
    if(navDepth > 0){ history.go(-navDepth); return; }
    navStack = ['scrMenu'];
    show('scrMenu', false);
    window.scrollTo(0, 0);
    return;
  }
  if(navDepth > 0){
    navDepth = 1;
    navStack = ['scrMenu', id];
    try{ history.replaceState({scr: id, d: 1}, ''); }catch(e){}
    show(id, false);
  } else {
    show(id, true);
  }
  window.scrollTo(0, 0);
}

/* ================= ЭКРАН 2: СТАРТ ================= */

// с какой вкладки открыли программу — туда и вернёт «назад» с экрана старта
let startFrom = 'scrMenu';
function openStart(raw){
  if(ROOT_TABS.includes(show._last)) startFrom = show._last;
  applyProgressionAll();
  applyAudioFromUser(curUser());
  state.raw = raw;
  const plans = normPlans(raw);
  state.planIdx = defaultPlanIdx(plans, raw);
  $('startNum').textContent = '';
  $('startTitle').textContent = raw.name;
  renderPlanRow();
  renderProgSteps();
  renderStartInfo();
  syncPrefs();
  show('scrStart');
  window.scrollTo(0, 0); // иначе экран открывается там же, где был прокручен предыдущий, — мимо названия
}

// по умолчанию выбираем вариант, в чьи дни попадает сегодня
function defaultPlanIdx(plans, prog){
  // режим ротации: варианты идут по очереди A-B-A-B независимо от календаря,
  // пропуск дня не сбивает очередь
  if(prog && prog.rotate && plans.length > 1){
    const next = (typeof prog.rotIdx === 'number') ? prog.rotIdx : 0;
    return ((next % plans.length) + plans.length) % plans.length;
  }
  const today = DAYS[(new Date().getDay() + 6) % 7];
  const i = plans.findIndex(pl => (pl.days || []).includes(today));
  return i >= 0 ? i : 0;
}

function renderPlanRow(){
  const plans = normPlans(state.raw);
  const block = $('planBlock'), row = $('planRow');
  row.innerHTML = '';
  if(plans.length < 2){ setShown(block, false); return; }
  setShown(block, true);
  plans.forEach((pl, i)=>{
    const b = document.createElement('button');
    b.className = 'load-chip plan-chip';
    const rotOn = state.raw.rotate && plans.length > 1;
    let lbl = (!rotOn && pl.days && pl.days.length) ? pl.days.map(canonicalLabel).join('·') : `${t('builder.variant')} ${i+1}`;
    if(rotOn && i === defaultPlanIdx(plans, state.raw)) lbl += ' • ' + t('start.current');
    b.textContent = lbl;
    b.classList.toggle('act', state.planIdx === i);
    b.onclick = ()=>{ state.planIdx = i; renderPlanRow(); renderStartInfo(); };
    row.appendChild(b);
  });
}

// Нагрузка одного упражнения в том же виде, в каком она появится на тренировке.
// Отдельная функция не даёт обзору и таймеру разойтись в формулах прогрессии.
function exerciseLoad(p, ex){
  const on = progAxis(ex) !== 'none';
  const timed = ex.type === 'time';
  const load = {reps:'', sec:0, kg:0};
  if(timed){
    load.sec = on && progStepSize(ex, 'time') > 0
      ? getExProgValue(p.id, ex, p, 'time')
      : progBaseValue(ex, 'time');
  } else {
    load.reps = on && progStepSize(ex, 'reps') > 0
      ? progressedRepsRange(p.id, ex, p)
      : normValue(ex.value, 'reps');
  }
  if(hasWeight(ex)){
    load.kg = on && progStepSize(ex, 'weight') > 0
      ? getExProgValue(p.id, ex, p, 'weight')
      : progBaseValue(ex, 'weight');
  }
  return load;
}

// Снимок нужен следующей тренировке для честного «было → сегодня». Старые записи
// снимка не имеют; для них ниже есть совместимый расчёт по предыдущему шагу.
function workoutLoadSnapshot(p, planIdx){
  const pl = normPlans(p)[planIdx] || normPlans(p)[0];
  return ((pl && pl.exercises) || []).map((ex, i) => {
    const v = exerciseLoad(p, ex);
    return {i, n:ex.name || '', reps:v.reps || '', sec:+v.sec || 0, kg:+v.kg || 0};
  });
}

function previousWorkoutLoad(p, planIdx){
  const hist = (stats.history || []).filter(h => h.pid === p.id && (+h.plan || 0) === planIdx);
  const last = hist[hist.length - 1];
  if(last && Array.isArray(last.load)) return {first:false, exact:true, rows:last.load};
  const done = (p.stats && p.stats.completions) || 0;
  if(!hist.length && done <= 0) return {first:true, exact:false, rows:[]};
  const prev = Object.assign({}, p, {stats:Object.assign({}, p.stats || {}, {completions:Math.max(0, done - 1)})});
  return {first:false, exact:false, rows:workoutLoadSnapshot(prev, planIdx)};
}

function loadTargetText(ex, v){
  const bits = [];
  if(ex.type === 'time') bits.push(`${v.sec} ${t('store.secShort')}`);
  else bits.push(`${v.reps} ${t('workout.repsShort')}`);
  if(v.kg > 0) bits.push(`${fmtKg(v.kg)} ${t('progress.kg')}`);
  let out = bits.join(' × ');
  if(ex.perSide) out += ' ' + t('store.perSide');
  return out;
}

function loadDelta(a, b){
  if(!a) return {text:'', dir:'same'};
  const bits = [];
  const moves = [];
  if(String(a.reps || '') !== String(b.reps || '')){
    bits.push(t('start.deltaReps',{before:a.reps,today:b.reps}));
    const av = parseValue(a.reps), bv = parseValue(b.reps);
    moves.push(bv.min - av.min, bv.max - av.max);
  }
  if((+a.sec || 0) !== (+b.sec || 0)){
    bits.push(t('start.deltaTime',{before:a.sec,today:b.sec})); moves.push((+b.sec || 0) - (+a.sec || 0));
  }
  if((+a.kg || 0) !== (+b.kg || 0)){
    bits.push(t('start.deltaWeight',{before:fmtKg(a.kg),today:fmtKg(b.kg)})); moves.push((+b.kg || 0) - (+a.kg || 0));
  }
  const directional = moves.filter(x => x !== 0);
  const dir = directional.length && directional.every(x => x > 0) ? 'up'
    : directional.length && directional.every(x => x < 0) ? 'down'
    : directional.length ? 'mixed' : 'same';
  return {text:bits.join(' · '), dir};
}

function estimatedWorkoutMinutes(p, planIdx, rows){
  const own = (stats.history || []).filter(h => h.pid === p.id && (+h.plan || 0) === planIdx
    && +h.sec > 59 && +h.sec < 6 * 3600).slice(-5);
  if(own.length){
    const avg = own.reduce((n, h) => n + h.sec, 0) / own.length;
    return {n:Math.max(1, Math.round(avg / 60)), history:true, samples:own.length};
  }
  const pl = normPlans(p)[planIdx] || normPlans(p)[0];
  let sec = 0;
  const lastMain = ((pl && pl.exercises) || []).map((ex, i) => ex.warmup ? -1 : i).filter(i => i >= 0).pop();
  ((pl && pl.exercises) || []).forEach((ex, i) => {
    const v = rows[i] || exerciseLoad(p, ex);
    const sets = Math.max(1, parseInt(ex.sets) || 1);
    const rounds = ex.warmup ? 1 : Math.max(1, +pl.rounds || 1);
    const sides = ex.perSide ? 2 : 1;
    const work = ex.type === 'time' ? (+v.sec || 1) * sides : Math.max(1, parseValue(v.reps).min) * 3 * sides;
    sec += work * sets * rounds;
    sec += Math.max(0, sets - 1) * (+ex.rest || 0) * rounds;
    if(ex.warmup || i !== lastMain) sec += exRestAfter(ex) * rounds;
    if(ex.perSide && ex.type === 'time') sec += sideSec * sets * rounds;
  });
  sec += Math.max(0, (+pl.rounds || 1) - 1) * (+pl.roundRest || 0);
  return {n:Math.max(5, Math.round(sec / 300) * 5), history:false, samples:0};
}

function renderStartOverview(){
  const p = state.raw;
  const pl = normPlans(p)[state.planIdx] || normPlans(p)[0];
  if(!p || !pl) return;
  const exercises = pl.exercises || [];
  const current = workoutLoadSnapshot(p, state.planIdx);
  const previous = previousWorkoutLoad(p, state.planIdx);
  const oldByIndex = new Map((previous.rows || []).map(x => [+x.i, x]));
  const changes = [];
  exercises.forEach((ex, i) => {
    const old = oldByIndex.get(i);
    if(old && old.n && ex.name && old.n.trim().toLowerCase() !== ex.name.trim().toLowerCase()) return;
    const delta = loadDelta(old, current[i]);
    if(delta.text) changes.push({i, text:delta.text, dir:delta.dir});
  });

  const workSets = exercises.reduce((n, ex) => n + Math.max(1, parseInt(ex.sets) || 1)
    * (ex.warmup ? 1 : Math.max(1, +pl.rounds || 1)), 0);
  const dur = estimatedWorkoutMinutes(p, state.planIdx, current);
  $('startOverviewSummary').textContent = storeCountText(exercises.length,'exercise') + ' · ' + storeCountText(workSets,'set') + ' · ' + (dur.samples === 1 ? t('start.lastTime',{minutes:dur.n}) : dur.history ? t('start.usualTime',{minutes:dur.n}) : t('start.approxTime',{minutes:dur.n}));

  const change = $('startLoadChange');
  const changeText = text => { change.textContent = text; };
  if(previous.first){
    changeText(t('start.firstWorkout'));
  } else if(changes.length){
    const direction = changes.every(x => x.dir === 'up') ? 'up'
      : changes.every(x => x.dir === 'down') ? 'down' : 'mixed';
    if(direction === 'up'){
      changeText(t('start.loadHigher',{count:changes.length,exercises:t(changes.length === 1 ? 'start.exerciseLocOne' : 'start.exerciseLocMany')}));
    } else if(direction === 'down'){
      changeText(t('start.loadLower',{count:changes.length,exercises:t(changes.length === 1 ? 'start.exerciseLocOne' : 'start.exerciseLocMany')}));
    } else {
      changeText(t('start.loadChanged',{count:changes.length,exercises:t(changes.length === 1 ? 'start.exerciseLocOne' : 'start.exerciseLocMany')}));
    }
  } else if(p.progression){
    const done = (p.stats && p.stats.completions) || 0;
    const left = p.progression - (done % p.progression);
    changeText(t('start.noChangesNext',{count:left,workouts:appLocale === 'ru' ? plural(left,t('start.workoutOne'),t('start.workoutFew'),t('start.workoutMany')) : t(left === 1 ? 'start.workoutOne' : 'start.workoutFew')}));
  } else {
    changeText(t('start.noChangesOff'));
  }

  const box = $('startOverviewList');
  box.innerHTML = '';
  let mainNo = 0;
  exercises.forEach((ex, i) => {
    if(!ex.warmup) mainNo++;
    const sets = Math.max(1, parseInt(ex.sets) || 1);
    const rounds = ex.warmup ? 1 : Math.max(1, +pl.rounds || 1);
    const meta = [];
    if(ex.warmup) meta.push({text:t('store.warmup'), cls:'wm'});
    meta.push({text:loadTargetText(ex, current[i]), cls:''});
    if(!ex.warmup && rounds > 1) meta.push({text:sets > 1 ? `${sets} ${t('start.setShort')} × ${rounds} ${t('start.roundShort')}` : storeCountText(rounds,'round'), cls:''});
    else meta.push({text:storeCountText(sets,'set'), cls:''});
    const delta = changes.find(x => x.i === i);
    const row = document.createElement('div');
    row.className = 'ex-row static' + (ex.warmup ? ' warm' : '');
    const thumb = ex.media && ex.media.kind === 'img'
      ? `<img src="${esc(ex.media.data)}" alt="">`
      : (ex.warmup ? icon('flame') : mainNo);
    row.innerHTML = `<div class="ex-thumb">${thumb}</div><div class="ex-info"><b></b><div class="ex-meta"></div></div>`;
    row.querySelector('b').textContent = ex.name || t('common.exerciseFallback');
    const tags = row.querySelector('.ex-meta');
    const tag = (text, cls) => { const el = document.createElement('span'); if(cls) el.className = cls; el.textContent = text; tags.appendChild(el); };
    meta.forEach(x => tag(x.text, x.cls));
    if(delta) tag(delta.text, 'grow');
    box.appendChild(row);
  });
}

// показывает и позволяет поправить счётчик шагов прогрессии на экране перед стартом.
// Видно, только если у программы есть хоть одно упражнение с осью прогрессии — иначе
// счётчику попросту нечего показывать, а пустая карточка только путает.
function renderProgSteps(){
  const p = state.raw;
  const hasProgAxis = normPlans(p).some(pl => (pl.exercises || []).some(ex => progAxis(ex) !== 'none'));
  const on = p.progression && hasProgAxis;
  setShown('progStepsBlock', on);
  if(!on) return;
  const steps = progSteps(p);
  $('psCount').textContent = steps;
  $('psMinus').disabled = steps <= 0;
}
// кнопки ± двигают РУЧНУЮ ПОПРАВКУ, а не сам счётчик: сам счётчик считается из числа
// пройденных тренировок и пересчитался бы заново, затерев ручное изменение
function bumpProgSteps(dir){
  const p = state.raw;
  const cur = progSteps(p);
  if(dir < 0 && cur <= 0) return;
  p.progStepsAdj = Math.round(+p.progStepsAdj || 0) + dir;
  savePrograms();
  renderProgSteps();
  renderStartOverview();
}

// меню действий на экране просмотра программы — те же пункты, что на карточке
function buildStartMenu(){
  const p = state.raw;
  const menu = $('startMenu');
  menu.innerHTML = '';
  if(!p || p.id === 'warmup'){ $('startMore').style.display = p ? '' : 'none'; }
  const mk = (html2, fn, cls)=>{
    const b = document.createElement('button');
    if(cls) b.className = cls;
    b.innerHTML = html2;
    b.onclick = e => { e.stopPropagation(); closeAllMenus(); fn(); };
    return b;
  };
  const on = progActive(p);
  setShown('startOffChip', !!p && !on);
  // Программа пришла от тренера: показываем, от кого, и даём отчитаться.
  const by = p && p.by ? String(p.by) : '';
  setShown('startByChip', !!by);
  if(by) $('startByName').textContent = by;
  menu.append(
    mk(icon('pencil') + t('common.edit'), ()=> openBuilder(p.id)),
    // тот же переключатель, что в меню карточки в списке: экран программы — второе
    // место, где о программе думают целиком, и искать выключатель в другом списке
    // ради одного действия человек не станет
    mk(icon('power') + (on ? t('programs.disable') : t('programs.enable')), async ()=>{
      p.active = !on;
      await savePrograms();
      buildStartMenu();     // подпись пункта и чип «Откл» на этом же экране
      renderMine();         // список под ним уже перерисован к возврату
      if(on) appAlert(t('programs.disabledAlert'));
    }),
    // Порядок пунктов тот же, что в меню карточки списка: одно и то же меню в двух
    // местах обязано читаться одинаково, иначе рука промахивается.
    mk(icon('copy') + t('common.duplicate'), async ()=>{
      const c = await duplicateProgram(p);
      openBuilder(c.id);
    }),
    mk(icon('share') + t('programs.shareLink'), ()=> exportProgram(p)),
    ...(trainerOn() ? [mk(icon('users') + t('programs.sendClient'), ()=> pickClientFor(p))] : []),
    ...(trainerOn() && !p.storeId ? [mk(icon('crown') + t('programs.submitCatalog'), ()=> openPublish(p))] : []),
    mk(icon('download') + t('programs.saveFile'), ()=> exportProgramFile(p)),
    mk(icon('trash') + t('common.delete'), async ()=>{
      if(!(await appDialog(t('programs.deleteQuestion',{name:p.name}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
      customPrograms = customPrograms.filter(x => x.id !== p.id);
      await savePrograms();
      renderMine();
      goTab('scrPrograms');
    }, 'danger')
  );
}

function renderStartInfo(){
  buildStartMenu();
  // описание программы: 4 строки с возможностью раскрыть
  const dBox = $('progDescBox'), dTxt = $('progDescText');
  const d = (state.raw.desc || '').trim();
  if(d){
    dTxt.textContent = d;
    setShown(dBox, true);
    dBox.classList.remove('open');
    $('progDescMore').textContent = t('builder.showFull');
    requestAnimationFrame(()=>{
      const fits = dTxt.scrollHeight <= dTxt.clientHeight + 2;
      setShown('progDescMore', !(fits));
    });
  } else setShown(dBox, false);

  const plans = normPlans(state.raw);
  const pl = plans[state.planIdx];
  const rotOn = state.raw.rotate && plans.length > 1;
  const timeText = pl.time || state.raw.time;
  const daysTxt = rotOn
    ? ((state.raw.days && state.raw.days.length) ? state.raw.days.map(canonicalLabel).join(', ') : '')
    : ((pl.days && pl.days.length) ? pl.days.map(canonicalLabel).join(', ') : '');
  const parts = [timeText, daysTxt].filter(Boolean);
  if(rotOn) parts.push(t('start.variantSequence',{current:state.planIdx+1,total:plans.length}));
  const schedule = parts.join(' · ');
  $('startDesc').textContent = schedule ? t('start.schedule',{schedule}) : '';
  // объём: круги для круговых, подходы для силовых
  const mainEx = (pl.exercises || []).filter(e => !e.warmup);
  const setsTotal = mainEx.reduce((n, e) => n + (parseInt(e.sets) || 1), 0);
  if(pl.rounds > 1 || setsTotal <= mainEx.length){
    $('startVolLabel').textContent = storeCountText(pl.rounds,'round').replace(/^\d+\s+/,'');
    $('startRounds').textContent = pl.rounds;
  } else {
    $('startVolLabel').textContent = storeCountText(setsTotal,'set').replace(/^\d+\s+/,'');
    $('startRounds').textContent = setsTotal;
  }
  const nEx = pl.exercises.length;
  $('startExCount').textContent = nEx;
  $('startExLabel').textContent = storeCountText(nEx,'exercise').replace(/^\d+\s+/,'');
  // обложка программы — если её нет, место не занимаем
  const cov = $('startCover');
  if(state.raw.cover){
    cov.innerHTML = '';
    const img = document.createElement('img');
    img.src = state.raw.cover; img.alt = '';
    cov.appendChild(img);
    setShown(cov, true);
  } else setShown(cov, false);
  renderStartOverview();
}

