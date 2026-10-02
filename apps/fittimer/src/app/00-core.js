import { appLocale, canonicalLabel, localeTag, t } from '../i18n/index.js';
import { appRuntimeCompat, appUi } from './00-dependencies.js';
import { registerAction } from './05-actions.js';
import { DAYS, closeAllMenus, curUser, customPrograms, normPlans, progActive, renderStats,
  renderUsers, renderWeight, renderWellness, savePrograms, deleteCustomProgram, setDataSyncCoreHooks, stats
} from './10-data-sync.js';

let accountUserDirtyHook = () => false;
let maybeRunDeferredBiometricLockHook = () => {};
export function setCoreAccountHooks(hooks = {}){
  accountUserDirtyHook = typeof hooks.userDirty === 'function' ? hooks.userDirty : (() => false);
  maybeRunDeferredBiometricLockHook = typeof hooks.maybeRunDeferredBiometricLock === 'function'
    ? hooks.maybeRunDeferredBiometricLock
    : (() => {});
}

let renderPhotosHook = () => {};
export function setCoreProgressHooks(hooks = {}){
  renderPhotosHook = typeof hooks.renderPhotos === 'function' ? hooks.renderPhotos : (() => {});
}

let platformSpeechRecognitionHook = () => false;
let platformHfModeHook = () => 'off';
let platformHfHintTextHook = () => '';
let platformSyncPrefsHook = () => {};
export function setCorePlatformHooks(hooks = {}){
  platformSpeechRecognitionHook = typeof hooks.hasSpeechRecognition === 'function'
    ? hooks.hasSpeechRecognition
    : (() => false);
  platformHfModeHook = typeof hooks.getHfMode === 'function' ? hooks.getHfMode : (() => 'off');
  platformHfHintTextHook = typeof hooks.hfHintText === 'function' ? hooks.hfHintText : (() => '');
  platformSyncPrefsHook = typeof hooks.syncPrefs === 'function' ? hooks.syncPrefs : (() => {});
}

let eventApplyAudioFromUserHook = () => {};
let eventFillLiveSoundCascadeHook = () => {};
let eventMoreTabHook = () => 'me';
let eventSwitchMoreTabHook = () => {};
let eventSyncSettingsFormHook = () => {};
export function setCoreEventHooks(hooks = {}){
  eventApplyAudioFromUserHook = typeof hooks.applyAudioFromUser === 'function' ? hooks.applyAudioFromUser : (() => {});
  eventFillLiveSoundCascadeHook = typeof hooks.fillLiveSoundCascade === 'function' ? hooks.fillLiveSoundCascade : (() => {});
  eventMoreTabHook = typeof hooks.getMoreTab === 'function' ? hooks.getMoreTab : (() => 'me');
  eventSwitchMoreTabHook = typeof hooks.switchMoreTab === 'function' ? hooks.switchMoreTab : (() => {});
  eventSyncSettingsFormHook = typeof hooks.syncSettingsForm === 'function' ? hooks.syncSettingsForm : (() => {});
}

let programsAiDirtyHook = () => null;
let programsApplyProgressionHook = () => {};
let programsDuplicateHook = async p => p;
let programsExportHook = async () => {};
let programsExportFileHook = async () => {};
let programsRenderGreetingHook = () => {};
let programsRenderTodayHook = () => {};
let programsTrainerOnHook = () => false;
export function setCoreProgramsAiHooks(hooks = {}){
  programsAiDirtyHook = typeof hooks.getActiveAiDirty === 'function' ? hooks.getActiveAiDirty : (() => null);
  programsApplyProgressionHook = typeof hooks.applyProgressionAll === 'function' ? hooks.applyProgressionAll : (() => {});
  programsDuplicateHook = typeof hooks.duplicateProgram === 'function' ? hooks.duplicateProgram : (async p => p);
  programsExportHook = typeof hooks.exportProgram === 'function' ? hooks.exportProgram : (async () => {});
  programsExportFileHook = typeof hooks.exportProgramFile === 'function' ? hooks.exportProgramFile : (async () => {});
  programsRenderGreetingHook = typeof hooks.renderGreeting === 'function' ? hooks.renderGreeting : (() => {});
  programsRenderTodayHook = typeof hooks.renderToday === 'function' ? hooks.renderToday : (() => {});
  programsTrainerOnHook = typeof hooks.trainerOn === 'function' ? hooks.trainerOn : (() => false);
}


let trainerCatalogHooks = {
  openPublish: async () => {},
  pickClientFor: async () => {},
  refreshClientsScreen: () => {},
  renderMine: () => {},
  renderTrainerCard: () => {},
  storeCountText: (n, kind) => `${n} ${kind}`
};
export function setCoreTrainerCatalogHooks(hooks = {}){
  trainerCatalogHooks = {...trainerCatalogHooks, ...hooks};
}

let builderHooks = {
  dropFreshEx: () => {},
  exDirty: () => false,
  exRestAfter: () => 0,
  exerciseLoadLevelState: () => ({level:0,key:'',label:'',identity:''}),
  exerciseLoadLevels: () => [],
  ensurePs: ex => ex && ex.ps,
  loadLevelLabel: level => String((level && level.label) || ''),
  exerciseProgEvery: () => 0,
  fmtKg: v => String(v == null ? '' : v),
  getExProgValue: () => 0,
  getExWeight: () => 0,
  hasWeight: () => false,
  normValue: v => v,
  openBuilder: async () => {},
  parseKg: v => +v || 0,
  parseValue: v => ({min:+v || 0, max:+v || 0}),
  progAtCeiling: () => false,
  progAxis: () => 'none',
  progressionLoadType: () => 'none',
  progBaseValue: () => 0,
  progStepSize: () => 0,
  programHasProgression: () => false,
  programDirty: () => false,
  progressedRepsRange: () => '',
  clearExerciseDraft: () => {},
  setExWeight: () => {},
  weightPending: () => false
};
export function setCoreBuilderHooks(hooks = {}){
  builderHooks = {...builderHooks, ...hooks};
}

let workoutHooks = {
  esc: v => String(v == null ? '' : v),
  exitWorkout: () => {},
  clearExerciseWorkoutOrigin: () => {},
  settleQuickFinish: () => {},
  stopFinishFx: () => {},
  tnum: v => String(v == null ? '' : v)
};
export function setCoreWorkoutHooks(hooks = {}){
  workoutHooks = {...workoutHooks, ...hooks};
}

/* ================= ВСТРОЕННЫЕ КАРТИНКИ ЭКРАНА ТРЕНИРОВКИ ================= */
export const ILLO = {
  water: `<svg viewBox="0 0 240 120"><path class="acc" d="M104 20 L136 20 L130 100 L110 100 Z"/><path class="prop" d="M108 56 C116 50, 124 62, 132 56"/></svg>`,
  rest: `<svg viewBox="0 0 240 120"><path class="acc" d="M96 36 a28 28 0 1 0 52 34 a34 34 0 1 1 -52 -34 Z"/></svg>`
};

// дефолтная обложка программы — гантель
export const DUMBBELL_ICON = `<svg viewBox="0 0 64 64" fill="currentColor"><rect x="15" y="19" width="9" height="26" rx="3.5"/><rect x="40" y="19" width="9" height="26" rx="3.5"/><rect x="6" y="25" width="6" height="14" rx="3"/><rect x="52" y="25" width="6" height="14" rx="3"/><rect x="24" y="29" width="16" height="6" rx="3"/></svg>`;

/* ================= ЗВУК ================= */
export let soundOn = true; // общий выключатель звука
export let lastAppSoundT = 0; // когда приложение само издавало звук — не принимаем его за голосовую команду
export let prepSec = 5;   // отсчёт «Приготовься» перед стартом тренировки
export let readySec = 5;  // подготовка перед упражнением на время
export let sideSec = 10;  // пауза на смену стороны в упражнениях «на каждую сторону»
export let fxVol = 1;    // громкость звуковых эффектов 0..1
export let voiceVol = 1; // громкость голоса 0..1
export let audioCtx = null, masterGain = null;
export function initAudio(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(!masterGain){ masterGain = audioCtx.createGain(); masterGain.gain.value = fxVol; masterGain.connect(audioCtx.destination); }
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){}
}
function fxDest(){ return masterGain || audioCtx.destination; }
export function beep(freq=880, dur=0.15, when=0, vol=0.25){
  if(!audioCtx || !soundOn || fxVol<=0) return;
  lastAppSoundT = Date.now() + (when + dur) * 1000;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type='sine'; o.frequency.value=freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + when + dur);
  o.connect(g); g.connect(fxDest());
  o.start(audioCtx.currentTime + when); o.stop(audioCtx.currentTime + when + dur + 0.05);
}
export const tick = () => beep(660, .09, 0, .18);
export const endSignal = () => { beep(880,.14,0); beep(880,.14,.2); beep(1320,.3,.4,.3); };

// гонг — начало нового упражнения
export function gong(){
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
export function exerciseGong(){
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
export function fanfare(){
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
export let savedVoiceURI = '';
export let voiceLang = localeTag();
export function voiceIsEnglish(){ return String(voiceLang || '').toLowerCase().startsWith('en'); }
function voicePlural(n, ruOne, ruFew, ruMany, enOne, enMany){
  return voiceIsEnglish() ? (Math.abs(Number(n)) === 1 ? enOne : enMany) : plural(n, ruOne, ruFew, ruMany);
}
function voicesForLang(lang){
  const prefix = String(lang || 'ru-RU').toLowerCase().split('-')[0];
  try{ return speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix)); }
  catch(e){ return []; }
}

// если голоса нет или ошибка — фолбэк-звук
export let musicMode = false; // «не прерывать музыку»: голос заменяется сигналами
export function speak(text, fallback, onDone){
  const done = ()=>{ if(onDone){ const f = onDone; onDone = null; f(); } };
  if(!soundOn){ done(); return; }
  if(voiceVol <= 0){ if(fallback) fallback(); done(); return; } // голос выключен — фолбэк-звук
  if(musicMode){ if(fallback) fallback(); done(); return; }
  if(appRuntimeCompat.hasNative('speak')){
    lastAppSoundT = Date.now() + 8000;
    appRuntimeCompat.speak(text, {
      locale: voiceLang || 'ru-RU',
      voice: savedVoiceURI || ''
    }).then(ok=>{
      lastAppSoundT = Date.now() + 250;
      if(!ok && fallback) fallback();
      done();
    }).catch(()=>{
      lastAppSoundT = Date.now() + 250;
      if(fallback) fallback();
      done();
    });
    return;
  }
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
export function announceRemaining(sec){
  speak(voiceIsEnglish() ? `${sec} seconds remaining` : `Осталось ${sec} секунд`, ()=> clicks(sec/15));
}

// круг завершён — голосом с временем отдыха и следующим упражнением
export function roundDone(seconds, nxt){
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
export function announceRest(seconds, nxt){
  let text = voiceIsEnglish()
    ? `Rest for ${seconds} ${voicePlural(seconds,'секунду','секунды','секунд','second','seconds')}`
    : `Отдохните ${seconds} ${plural(seconds, 'секунду', 'секунды', 'секунд')}`;
  const nd = nextStepSpeech(nxt);
  if(nd) text += voiceIsEnglish() ? `. Next: ${nd}` : `. Далее — ${nd}`;
  speak(text, ()=> beep(520, .18, 0, .2));
}

// склонение: 1 повторение, 2 повторения, 5 повторений
export function plural(n, one, few, many){
  n = Math.abs(n) % 100;
  if(n > 10 && n < 20) return many;
  const n1 = n % 10;
  if(n1 === 1) return one;
  if(n1 > 1 && n1 < 5) return few;
  return many;
}

// озвучка упражнения: «Приседания, 30 повторений» / «Планка, 120 секунд»
export function announceExercise(step, onDone){
  let text = step.title;
  if(step.setsTotal > 1) text += voiceIsEnglish()
    ? `, set ${step.setNo} of ${step.setsTotal}`
    : `, подход ${step.setNo} из ${step.setsTotal}`;
  if(step.kind === 'click'){
    const r = builderHooks.parseValue(step.reps);
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
    const kg = voiceIsEnglish() ? builderHooks.fmtKg(step.weight) : builderHooks.fmtKg(step.weight).replace('.', ',');
    text += voiceIsEnglish()
      ? `, weight ${kg} ${voicePlural(Math.round(step.weight),'килограмм','килограмма','килограммов','kilogram','kilograms')}`
      : `, вес ${kg} ${plural(Math.round(step.weight), 'килограмм', 'килограмма', 'килограммов')}`;
  } else if(step.loadLabel){
    text += voiceIsEnglish()
      ? `, resistance ${step.loadLabel}`
      : `, сопротивление ${step.loadLabel}`;
  }
  speak(text, null, onDone);
}

// мини-таймер подготовки перед упражнением на время: полоса + отсчёт, в конце гонг.
// считаем по кадрам, чтобы пауза реально останавливала подготовку
const RR_LEN = 2 * Math.PI * 17; // длина окружности кольца подготовки (r=17 в svg 40×40)
export function runReadyBar(sec, done){
  const box = $('readyRing'), arc = $('readyArc'), num = $('readyNum');
  if(!box || sec <= 0){ done(); return; }
  const totalMs = sec * 1000;
  let left = totalMs, last = performance.now(), lastShown = sec;
  setShown(box, true);
  document.body.classList.add('readying'); // прячет вес рядом с таймером на время отсчёта — иначе им негде стоять вместе
  arc.style.strokeDashoffset = RR_LEN;   // пустое кольцо в начале
  num.innerHTML = workoutHooks.tnum(sec);
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
      if(s !== lastShown){ lastShown = s; num.innerHTML = workoutHooks.tnum(s); beep(660, .08); }
    }
    state.readyRAF = requestAnimationFrame(tick);
  });
}
export function hideReadyBar(){
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
export async function keepAwake(){
  try{ if('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
}
export function releaseWake(){ try{ wakeLock && wakeLock.release(); wakeLock=null; }catch(e){} }

/* ================= СОСТОЯНИЕ ================= */
export let state = {
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

export const $ = id => document.getElementById(id);

// лёгкая тактильная отдача на нажатия (где поддерживается)
export function haptic(ms){
  if(appRuntimeCompat.hapticHandled()) return;
  try{ navigator.vibrate && navigator.vibrate(ms || 8); }catch(e){}
}

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
export const ICONS = {
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  grip: '<circle cx="9" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.3" fill="currentColor" stroke="none"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  home: '<path d="M3.6 10.4 12 3.6l8.4 6.8V20a1 1 0 0 1-1 1h-4.6v-6.2H9.2V21H4.6a1 1 0 0 1-1-1Z"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.3 13.6a7.8 7.8 0 0 0 0-3.2l1.8-1.4-1.9-3.3-2.1.8a7.7 7.7 0 0 0-2.8-1.6L13.9 2.7h-3.8l-.4 2.2a7.7 7.7 0 0 0-2.8 1.6l-2.1-.8-1.9 3.3 1.8 1.4a7.8 7.8 0 0 0 0 3.2l-1.8 1.4 1.9 3.3 2.1-.8a7.7 7.7 0 0 0 2.8 1.6l.4 2.2h3.8l.4-2.2a7.7 7.7 0 0 0 2.8-1.6l2.1.8 1.9-3.3Z"/>',
  reset: '<path d="M3 3v6h6"/><path d="M3.8 9A9 9 0 1 0 6 5.3L3 8"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>',
  play: '<path d="M7 4.5 20 12 7 19.5Z" fill="currentColor" stroke-linejoin="round"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
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
export function icon(name){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/* ================= ПОКАЗ И СКРЫТИЕ ================= */
// единственный способ управлять видимостью: класс, а не инлайновый display.
// инлайн ломал flex-раскладку и не мог побить .hidden{display:none!important}
export function setShown(el, on){
  const node = (typeof el === 'string') ? $(el) : el;
  appUi.setShown(node, !!on);
}

/* ================= ЗАЩИТА ОТ ПОТЕРИ ПРАВОК ================= */
// снимки форм: сравниваем текущее состояние с тем, что было при открытии
const snap = {};
export function takeSnap(key, val){ snap[key] = JSON.stringify(val ?? null); }
export function isChanged(key, val){ return snap[key] !== undefined && snap[key] !== JSON.stringify(val ?? null); }
export function clearSnap(key){ delete snap[key]; }

// спрашивает подтверждение, если что-то менялось; иначе уходит молча
// Формулировка одна на всё приложение: «ещё не сохранены» (а не «не сохранены» —
// прошедшее время звучало как приговор), а кнопки всегда «Выйти без сохранения»
// и «Остаться» — вместо пяти разных способов сказать «отменить».
export async function leaveGuard(changed, go, what){
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
export function aiScreenDirty(ids){
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
export function guardNum(id, kind, required){
  const el = $(id);
  if(!el) return;
  el.dataset.numKind = kind;
  if(required) el.dataset.numReq = '1';
  const check = () => markNum(el);
  el.addEventListener('input', check);
  el.addEventListener('blur', check);
}
// проверяет все видимые числовые поля экрана; на первую ошибку — прокрутка и фокус
export function numFieldsOk(scopeId){
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
export function syncSoundCascade(p){
  const on = $(p + 'SoundOn').classList.contains('on');
  setShown(p + 'SoundBox', on);
  if(!on) return;
  setShown(p + 'FxField', $(p + 'FxOn').classList.contains('on'));
}

/* ================= ДИАЛОГИ ПРИЛОЖЕНИЯ (вместо системных) ================= */
// appDialog должен завершаться только после того, как служебная запись открытого
// попапа реально снята из browser history. Иначе следующий переход успевает
// построить новую навигацию поверх ещё не завершившегося history.back().
let modalHistoryWaiters = [];
let dialogClickCtl = null;
let dialogResolve = null;
let dialogConfirm = false;
let dialogTypedInput = null;

function finishDialog(v){
  if(!dialogResolve) return;
  const res = dialogResolve;
  dialogResolve = null;
  const typed = dialogTypedInput || $('dlgType');
  dialogTypedInput = null;
  const waitHistory = !!(history.state && history.state.m)
    && ![...document.querySelectorAll('.modal.open')].some(m => m !== $('dlg'));
  $('dlg').classList.remove('open');
  $('dlgOk').disabled = false;
  setShown('dlgTypeBox', false);
  typed.oninput = null;
  if(waitHistory) modalHistoryWaiters.push(()=> res(v));
  else res(v);
}

export function appDialog(msg, opts = {}){
  return new Promise(res => {
    dialogResolve = res;
    dialogConfirm = !!opts.confirm;
    $('dlgMsg').textContent = typeof msg === 'function' ? msg() : msg;
    const codeEl = $('dlgCode');
    if(opts.code){ setShown(codeEl, true); codeEl.value = opts.code; }
    else setShown(codeEl, false);
    const typed = $('dlgType');
    dialogTypedInput = typed;
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
    $('dlgCancel').textContent = opts.cancelText || t('common.cancel');
    setShown('dlgCancel', opts.confirm);
    $('dlg').classList.add('open');
  });
}
export const appAlert = (m, o) => appDialog(m, o);
// Подтверждение действия. Кнопка по умолчанию — «Подтвердить», а не «Да»:
// «Да» была безопасна только когда текст вопроса читается как «да/нет», а
// у нас — «Удалить программу?».
export const appConfirm = (m, o) => appDialog(m, {confirm: true, okText: t('common.confirm'), cancelText: t('common.cancel'), ...o});
const screens = ['scrMenu','scrPrograms','scrStore','scrStoreItem','scrAccount','scrStart','scrWork','scrFinish','scrBuilder','scrProgSettings','scrExercise','scrImages','scrAI','scrLegal','scrStats','scrUserEdit','scrTrainer','scrClient','scrTrainerPage','scrPublish','scrMyCatalog','scrOnboard'];
/* Корневые разделы: только у них внизу док и нет собственной панели действий.

   «Подопечные» — раздел, который есть не у всех: он появляется вместе с режимом
   тренера и исчезает вместе с ним. Держать его в списке всегда можно и нужно —
   иначе show() не узнает в нём корневой экран, — а прячет кнопку сам док. */
export const ROOT_TABS = ['scrMenu','scrPrograms','scrTrainer','scrStats','scrAccount'];
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
let pendingTabScreen = null; // вкладка, сменённая, пока снималась запись закрытого попапа
let navBackWaiters = []; // программный возврат, которому нужно дождаться фактического popstate
export function asTab(fn){
  tabSwitch = true;
  try{ fn(); } finally { tabSwitch = false; }
}
// Что считается несохранённой работой на каждом экране. Раньше эту проверку знали
// только кнопки «назад» внутри приложения, а системная кнопка «назад» звала show()
// напрямую — и набранная программа исчезала молча.
const LEAVE_GUARDS = {
  scrBuilder:  ()=> builderHooks.programDirty() ? {what:t('builder.programChanges'), clean:()=> clearSnap('program')} : null,
  scrExercise: ()=> builderHooks.exDirty() ? {what:t('exercise.changes'), clean:()=>{ builderHooks.dropFreshEx(); builderHooks.clearExerciseDraft(); workoutHooks.clearExerciseWorkoutOrigin(); }} : null,
  scrUserEdit: ()=> accountUserDirtyHook() ? {what:t('profile.changes')} : null,
  scrAI:       ()=> { const dirty = programsAiDirtyHook(); return dirty && aiScreenDirty(dirty) ? {what:t('ai.filledRequest')} : null; }
};
let guardBypass = false; // второй заход после подтверждения — уже не спрашиваем
// Жест «назад» и системная кнопка закрывают открытый попап, а не уводят с экрана.
// Закрываем ровно тем же путём, что и собственная кнопка отмены: на ней у части
// попапов висит возврат состояния, и простое снятие класса его бы потеряло.
// #dlg проверяем первым: он лежит выше остальных (z-index 90) и может быть открыт
// поверх другого попапа.
export function dismissTopModal(){
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

// «Назад» и «Готово» на вложенном экране ВОЗВРАЩАЮТ, а не переходят: если нужный
// экран лежит в пути прямо под текущим, снимаем запись истории вместо того, чтобы
// класть новую. Иначе «конструктор → настройки → назад → упражнение → назад» копил
// по записи на каждый шаг: сорок переходов давали сорок одну запись, и системная
// кнопка «назад» тридцать раз подряд не выводила из конструктора.
// Экран покажет сам popstate — здесь только отматываем.
function resolveNavBack(target){
  if(!navBackWaiters.length) return;
  const keep = [];
  navBackWaiters.forEach(w => {
    if(w.id === target) w.resolve(true);
    else keep.push(w);
  });
  navBackWaiters = keep;
}
export function goBackTo(id){
  // Если целевой экран уже есть в текущем пути, это настоящий возврат на него,
  // даже когда между ними больше одного вложенного экрана. Не создаём ещё одну
  // копию родителя поверх истории. Возвращаем Promise, чтобы сценарии вроде
  // «ИИ применён → Builder → success-попап» могли дождаться реального popstate.
  if(show._last === navStack[navStack.length - 1]){
    const at = navStack.lastIndexOf(id);
    const distance = navStack.length - 1 - at;
    if(at >= 0 && distance > 0){
      return new Promise(resolve => {
        const waiter = {id, resolve};
        navBackWaiters.push(waiter);
        try{ history.go(-distance); }
        catch(e){
          navBackWaiters = navBackWaiters.filter(w => w !== waiter);
          show(id);
          resolve(false);
        }
      });
    }
  }
  show(id);
  return Promise.resolve(true);
}

export function show(id, push = true){
  // Ушли из редактора, не сохранив только что заведённое упражнение, — строку в
  // списке не оставляем. Ловим здесь, а не в кнопке «назад»: уйти можно ещё
  // жестом и системной кнопкой, и тогда в программе оставалось «Без названия».
  // Переключение ВКЛАДКИ уходом не считается: это тот же экран в другом виде.
  // Из-за этого ломалась правка упражнения прямо с тренировки: сходил на вкладку
  // «Через ИИ» и обратно — exFromWork терялся, и «Готово» уводило в конструктор,
  // бросив тренировку на середине.
  if(show._last === 'scrExercise' && id !== 'scrExercise' && !tabSwitch){ builderHooks.dropFreshEx(); workoutHooks.clearExerciseWorkoutOrigin(); }
  // С экрана результата ушли, не выбрав про слишком короткую тренировку (жест «назад»,
  // вкладка): засчитываем, как было всегда, — молча терять тренировку нельзя.
  if(show._last === 'scrFinish' && id !== 'scrFinish' && state.pendingFinish) workoutHooks.settleQuickFinish(true);
  if(push && show._last !== id){
    if(tabSwitch){
      navStack[navStack.length - 1] = id;
      // Сверху может лежать запись попапа, который только что закрыли, а его
      // history.back() ещё не отработал (например, окно ожидания ИИ закрылось
      // и сразу применился ответ). Заменить её — значит оставить под ней старую
      // вкладку: «Готово» потом возвращало на «Через ИИ». Меняем запись экрана,
      // когда запись попапа уже снята (см. popstate ниже).
      if(history.state && history.state.m) pendingTabScreen = id;
      else try{ history.replaceState({scr: id, d: navDepth}, ''); }catch(e){}
    } else {
      navStack.push(id);
      navDepth++;
      // Если новый экран открывается прямо из закрывающейся модалки, её служебная
      // запись уже и есть место этого перехода. Превращаем её в экран, а не кладём
      // экран поверх неё — иначе «назад» позже воскресит невидимую модалку/старый экран.
      if(history.state && history.state.m){
        try{ history.replaceState({scr: id, d: navDepth}, ''); }catch(e){}
      } else {
        try{ history.pushState({scr: id, d: navDepth}, ''); }catch(e){}
      }
    }
  }
  if(show._last !== id) workoutHooks.stopFinishFx(); // праздник остаётся на своём экране
  show._last = id;
  screens.forEach(s => $(s).classList.toggle('on', s===id));
  // верхняя полоса нужна ровно одному экрану — тренировке
  setShown('topBar', id==='scrWork');
  $('workMore').classList.toggle('on', id==='scrWork');
  $('btnSoundW').classList.toggle('on', id==='scrWork');
  $('btnMicW').classList.toggle('on', id==='scrWork' && platformSpeechRecognitionHook());
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
  if(id !== 'scrWork') maybeRunDeferredBiometricLockHook();
}

// содержимое вкладки всегда свежее — неважно, пришли в неё по доку, по кнопке
// внутри приложения или системным «назад»
export function prepTab(id){
  try{
    if(id === 'scrStats'){ renderStats(); renderWeight(); renderWellness(); renderPhotosHook(); }
    else if(id === 'scrPrograms'){ trainerCatalogHooks.renderMine(); }
    else if(id === 'scrAccount'){
      eventSwitchMoreTabHook(eventMoreTabHook());
      renderUsers();
      trainerCatalogHooks.renderTrainerCard();
      // звук и управление без рук переехали сюда из «Настроек»
      eventSyncSettingsFormHook();
      eventFillLiveSoundCascadeHook('st');
      const currentHfMode = platformHfModeHook();
      $('hfHint').textContent = platformHfHintTextHook(currentHfMode);
      document.querySelectorAll('#hfSeg button').forEach(b => b.classList.toggle('act', b.dataset.hf === currentHfMode));
    }
    else if(id === 'scrTrainer'){ trainerCatalogHooks.refreshClientsScreen(); }
    else if(id === 'scrMenu'){ programsRenderGreetingHook(); programsRenderTodayHook(); }
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
export function syncDockTabs(){
  const b = document.querySelector('.dock-btn[data-scr="scrTrainer"]');
  if(b) setShown(b, programsTrainerOnHook());
}

function syncDock(){
  setShown('dock', ROOT_TABS.includes(show._last) && !kbFocused());
}

// Переход по доку. Вкладки не копят историю: поверх «Сегодня» живёт максимум одна
// запись, а «назад» с любой вкладки возвращает на «Сегодня».
export function goTab(id){
  const cur = show._last;
  if(cur === id){
    try{ window.scrollTo({top: 0, behavior: 'smooth'}); }catch(e){ window.scrollTo(0, 0); }
    return;
  }
  if(!ROOT_TABS.includes(cur)){
    // Выход из глубины должен быть мгновенным: многие сценарии сразу после него
    // показывают результат/диалог. Поэтому не делаем асинхронный history.go() здесь.
    // Вместо этого текущую глубокую запись превращаем в «Сегодня» и запоминаем,
    // сколько старых шагов лежит под ней. При будущем Back до этой записи popstate
    // автоматически схлопнет старый путь (см. collapse выше).
    const collapse = Math.max(0, navDepth);
    navDepth = 0;
    navStack = ['scrMenu'];
    try{ history.replaceState({scr:'scrMenu', d:0, collapse}, ''); }catch(e){}
    if(id === 'scrMenu'){
      show('scrMenu', false);
      if(collapse > 0) try{ history.go(-collapse); }catch(e){}
      window.scrollTo(0, 0);
      return;
    }
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
export let startFrom = 'scrMenu';
export function openStart(raw){
  if(ROOT_TABS.includes(show._last)) startFrom = show._last;
  programsApplyProgressionHook();
  eventApplyAudioFromUserHook(curUser());
  state.raw = raw;
  const plans = normPlans(raw);
  state.planIdx = defaultPlanIdx(plans, raw);
  $('startNum').textContent = '';
  $('startTitle').textContent = raw.name;
  renderPlanRow();
  renderStartInfo();
  platformSyncPrefsHook();
  show('scrStart');
  window.scrollTo(0, 0); // иначе экран открывается там же, где был прокручен предыдущий, — мимо названия
}

// по умолчанию выбираем вариант, в чьи дни попадает сегодня
export function defaultPlanIdx(plans, prog){
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

export function renderPlanRow(){
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
    b.dataset.act = 'selectStartPlan';
    b.dataset.planIdx = String(i);
    row.appendChild(b);
  });
}

// Нагрузка одного упражнения в том же виде, в каком она появится на тренировке.
// Отдельная функция не даёт обзору и таймеру разойтись в формулах прогрессии.
function exerciseLoad(p, ex){
  const on = builderHooks.progAxis(ex) !== 'none';
  const timed = ex.type === 'time';
  const load = {reps:'', sec:0, kg:0, level:null, levelKey:'', levelLabel:''};
  if(timed){
    load.sec = on && builderHooks.progStepSize(ex, 'time') > 0
      ? builderHooks.getExProgValue(p.id, ex, p, 'time')
      : builderHooks.progBaseValue(ex, 'time');
  } else {
    load.reps = on && builderHooks.progStepSize(ex, 'reps') > 0
      ? builderHooks.progressedRepsRange(p.id, ex, p)
      : builderHooks.normValue(ex.value, 'reps');
  }
  if(builderHooks.hasWeight(ex)){
    load.kg = on && builderHooks.progStepSize(ex, 'weight') > 0
      ? builderHooks.getExProgValue(p.id, ex, p, 'weight')
      : builderHooks.progBaseValue(ex, 'weight');
  }
  if(builderHooks.progressionLoadType(ex) === 'level'){
    const state = builderHooks.exerciseLoadLevelState(ex) || {};
    load.level = Number.isFinite(+state.level) ? Math.max(0, Math.round(+state.level)) : null;
    load.levelKey = String(state.key || '');
    load.levelLabel = String(state.label || '');
  }
  return load;
}

// Снимок нужен следующей тренировке для честного «было → сегодня».
// Старые записи снимка не имеют. После перехода на per-exercise progression
// восстанавливать их арифметикой из общего completions уже нельзя: каждое
// упражнение могло прогрессировать в свой момент. Для legacy истории ниже
// честно помечаем нагрузку как неизвестную, а не придумываем «предыдущую».
export function workoutLoadSnapshot(p, planIdx){
  const pl = normPlans(p)[planIdx] || normPlans(p)[0];
  return ((pl && pl.exercises) || []).map((ex, i) => {
    const v = exerciseLoad(p, ex);
    return {
      i, n:ex.name || '',
      reps:v.reps || '', sec:+v.sec || 0, kg:+v.kg || 0,
      level:v.level == null ? null : +v.level,
      levelKey:String(v.levelKey || ''),
      levelLabel:String(v.levelLabel || '')
    };
  });
}

export function previousWorkoutLoad(p, planIdx){
  const hist = (stats.history || []).filter(h => h.pid === p.id && (+h.plan || 0) === planIdx);
  const last = hist[hist.length - 1];
  if(last && Array.isArray(last.load)) return {first:false, exact:true, legacy:false, rows:last.load};

  const done = Math.max(0, +((p.stats && p.stats.completions) || 0));
  if(!hist.length && done <= 0) return {first:true, exact:false, legacy:false, rows:[]};

  // До появления load snapshot старый движок мог приблизительно откатить
  // программу через completions-1. Теперь фактическая нагрузка хранится в ex.ps:
  // два упражнения одной программы могут иметь разные cur/n, а partial вообще
  // двигает только полностью завершённые упражнения. Поэтому общий completions
  // не содержит достаточно информации, чтобы восстановить прошлые reps/sec/kg.
  // Возвращаем «история есть, точной нагрузки нет» и НЕ рисуем ложное сравнение.
  return {first:false, exact:false, legacy:true, rows:[]};
}

function loadTargetText(ex, v){
  const bits = [];
  if(ex.type === 'time') bits.push(`${v.sec} ${t('store.secShort')}`);
  else bits.push(`${v.reps} ${t('workout.repsShort')}`);
  if(v.kg > 0) bits.push(`${builderHooks.fmtKg(v.kg)} ${t('progress.kg')}`);
  const resistanceLabel = v.levelKey
    ? builderHooks.loadLevelLabel({key:v.levelKey})
    : String(v.levelLabel || '');
  if(resistanceLabel) bits.push(resistanceLabel);
  let out = bits.join(' × ');
  if(ex.perSide) out += ' ' + t('store.perSide');
  return out;
}

export function loadDelta(a, b){
  if(!a) return {text:'', dir:'same'};
  const bits = [];
  const moves = [];
  if(String(a.reps || '') !== String(b.reps || '')){
    bits.push(t('start.deltaReps',{before:a.reps,today:b.reps}));
    const av = builderHooks.parseValue(a.reps), bv = builderHooks.parseValue(b.reps);
    moves.push(bv.min - av.min, bv.max - av.max);
  }
  if((+a.sec || 0) !== (+b.sec || 0)){
    bits.push(t('start.deltaTime',{before:a.sec,today:b.sec})); moves.push((+b.sec || 0) - (+a.sec || 0));
  }
  if((+a.kg || 0) !== (+b.kg || 0)){
    bits.push(t('start.deltaWeight',{before:builderHooks.fmtKg(a.kg),today:builderHooks.fmtKg(b.kg)})); moves.push((+b.kg || 0) - (+a.kg || 0));
  }
  const aLevel = a.level == null ? null : +a.level;
  const bLevel = b.level == null ? null : +b.level;
  if(Number.isFinite(aLevel) && Number.isFinite(bLevel) && aLevel !== bLevel){
    const beforeLabel = a.levelKey
      ? builderHooks.loadLevelLabel({key:a.levelKey})
      : String(a.levelLabel || (aLevel + 1));
    const todayLabel = b.levelKey
      ? builderHooks.loadLevelLabel({key:b.levelKey})
      : String(b.levelLabel || (bLevel + 1));
    bits.push(t('start.deltaResistance',{before:beforeLabel,today:todayLabel}));
    moves.push(bLevel - aLevel);
  }
  const directional = moves.filter(x => x !== 0);
  // вес вырос, а повторы вернулись к началу диапазона — это шаг двойной
  // прогрессии, то есть нагрузка ВЫШЕ, а не «изменилась»
  const kgUp = (+b.kg || 0) > (+a.kg || 0);
  const levelUp = Number.isFinite(aLevel) && Number.isFinite(bLevel) && bLevel > aLevel;
  const secSame = (+a.sec || 0) === (+b.sec || 0);
  const dir = (kgUp || levelUp) && secSame ? 'up'
    : directional.length && directional.every(x => x > 0) ? 'up'
    : directional.length && directional.every(x => x < 0) ? 'down'
    : directional.length ? 'mixed' : 'same';
  return {text:bits.join(' · '), dir};
}

export function estimatedWorkoutMinutes(p, planIdx, rows){
  const own = (stats.history || []).filter(h => h.pid === p.id && (+h.plan || 0) === planIdx
    && h.status !== 'partial' && +h.sec > 59 && +h.sec < 6 * 3600).slice(-5);
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
    const work = ex.type === 'time' ? (+v.sec || 1) * sides : Math.max(1, builderHooks.parseValue(v.reps).min) * 3 * sides;
    sec += work * sets * rounds;
    sec += Math.max(0, sets - 1) * (+ex.rest || 0) * rounds;
    if(ex.warmup || i !== lastMain) sec += builderHooks.exRestAfter(ex) * rounds;
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
  $('startOverviewSummary').textContent = trainerCatalogHooks.storeCountText(exercises.length,'exercise') + ' · ' + trainerCatalogHooks.storeCountText(workSets,'set') + ' · ' + (dur.samples === 1 ? t('start.lastTime',{minutes:dur.n}) : dur.history ? t('start.usualTime',{minutes:dur.n}) : t('start.approxTime',{minutes:dur.n}));

  const change = $('startLoadChange');
  const changeText = text => { change.textContent = text; };
  // через сколько тренировок приложение спросит о повышении: прогрессия у каждого
  // упражнения своя (ex.ps.n) — берём ближайшее к порогу упражнение варианта.
  // Показываем и тогда, когда нагрузка уже изменилась, — иначе после первого
  // повышения человек терял из виду, когда будет следующее.
  let nextText = '';
  if(builderHooks.programHasProgression(p)){
    const lefts = exercises
      .filter(ex => !ex.warmup && builderHooks.progAxis(ex) !== 'none' && !builderHooks.progAtCeiling(p.id, ex, p))
      .map(ex => {
        const every = builderHooks.exerciseProgEvery(ex, p);
        if(every <= 0) return null;
        const done = Math.max(0, Math.round(+(ex.ps && ex.ps.n) || 0));
        return Math.max(1, every - done);
      })
      .filter(x => x != null);
    if(lefts.length){
      const left = Math.min(...lefts);
      nextText = t('start.nextCheck',{count:left,executions:appLocale === 'ru'
        ? plural(left,t('builder.exerciseCompletionOne'),t('builder.exerciseCompletionFew'),t('builder.exerciseCompletionMany'))
        : (left === 1 ? t('builder.exerciseCompletionOne') : t('builder.exerciseCompletionFew'))});
    }
  }
  if(previous.first){
    changeText(t('start.firstWorkout'));
  } else if(previous.legacy){
    const text = t('start.previousLoadUnknown');
    changeText(nextText ? text + ' ' + nextText : text);
  } else if(changes.length){
    const direction = changes.every(x => x.dir === 'up') ? 'up'
      : changes.every(x => x.dir === 'down') ? 'down' : 'mixed';
    const key = direction === 'up' ? 'start.loadHigher' : direction === 'down' ? 'start.loadLower' : 'start.loadChanged';
    const text = t(key,{count:changes.length,exercises:t(changes.length === 1 ? 'start.exerciseLocOne' : 'start.exerciseLocMany')});
    changeText(nextText ? text + ' ' + nextText : text);
  } else if(nextText){
    changeText(t('start.noChanges') + ' · ' + nextText);
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
    // вес — отдельной кнопкой-меткой с карандашом (см. ниже): так видно, что
    // нажимается именно он, а повторы и время растут сами по плану
    meta.push({text:loadTargetText(ex, builderHooks.hasWeight(ex) ? Object.assign({}, current[i], {kg:0}) : current[i]), cls:''});
    if(!ex.warmup && rounds > 1) meta.push({text:sets > 1 ? `${sets} ${t('start.setShort')} × ${rounds} ${t('start.roundShort')}` : trainerCatalogHooks.storeCountText(rounds,'round'), cls:''});
    else meta.push({text:trainerCatalogHooks.storeCountText(sets,'set'), cls:''});
    const delta = changes.find(x => x.i === i);
    const row = document.createElement('div');
    row.className = 'ex-row static' + (ex.warmup ? ' warm' : '');
    const thumb = ex.media && ex.media.kind === 'img'
      ? `<img src="${workoutHooks.esc(ex.media.data)}" alt="">`
      : (ex.warmup ? icon('flame') : mainNo);
    row.innerHTML = `<div class="ex-thumb">${thumb}</div><div class="ex-info"><b></b><div class="ex-meta"></div></div>`;
    row.querySelector('b').textContent = ex.name || t('common.exerciseFallback');
    const tags = row.querySelector('.ex-meta');
    const tag = (text, cls) => { const el = document.createElement('span'); if(cls) el.className = cls; el.textContent = text; tags.appendChild(el); };
    meta.forEach((x, k) => {
      tag(x.text, x.cls);
      if(k === (ex.warmup ? 1 : 0) && builderHooks.hasWeight(ex)){
        const pending = builderHooks.weightPending(ex) || !(+current[i].kg > 0);
        const kg = document.createElement('span');
        kg.className = 'kg-edit' + (pending ? ' weight-pending' : '');
        kg.innerHTML = icon('pencil') + '<i></i>';
        kg.querySelector('i').textContent = pending ? t('start.weightPending') : `${builderHooks.fmtKg(current[i].kg)} ${t('progress.kg')}`;
        tags.appendChild(kg);
      }
    });
    if(delta) tag(delta.text, 'grow');
    // формат с весом — строка кликабельна: снаряд ещё не выбран (предлагаем задать
    // прямо тут, без похода в конструктор) либо просто хочется поправить вес на
    // сегодня (тот же попап; см. openWeightModal ниже). Замена бывшему общему
    // блоку «Нагрузка сегодня» с «±» — теперь правка per-упражнение.
    if(builderHooks.hasWeight(ex)){
      row.classList.add('tappable');
      row.dataset.act = 'openStartWeight';
      row.dataset.exerciseIdx = String(i);
    }
    box.appendChild(row);
  });
}

// правка веса одного упражнения — общий попап на весь список, какое открыто,
// помнит weightModalIdx (тот же приём, что у #restModal в конструкторе).
// Если вес ещё не был выбран — записываем в базу (ex.weight), она же и есть
// текущая нагрузка, пока прогрессия её не сдвинула. Если уже была выбрана —
// это разовая правка «сегодня беру другой снаряд», она идёт в ex.ps.cur и
// не переписывает исходную базу упражнения.
let weightModalIdx = -1;
function openWeightModal(i){
  const p = state.raw;
  const pl = normPlans(p)[state.planIdx] || normPlans(p)[0];
  const ex = pl && pl.exercises && pl.exercises[i];
  if(!ex) return;
  weightModalIdx = i;
  $('weightModalTitle').textContent = ex.name || t('common.exerciseFallback');
  const now = builderHooks.getExWeight(p.id, ex, p);
  $('weightModalInput').value = now > 0 ? builderHooks.fmtKg(now) : '';
  $('weightModal').classList.add('open');
  $('weightModalInput').focus();
}
export async function commitWeightModal(){
  const p = state.raw;
  const pl = normPlans(p)[state.planIdx] || normPlans(p)[0];
  const ex = pl && pl.exercises && pl.exercises[weightModalIdx];
  weightModalIdx = -1;
  $('weightModal').classList.remove('open');
  if(!ex) return;
  const kg = builderHooks.parseKg($('weightModalInput').value);
  if(!(kg > 0)) return; // пусто/0 — не считаем заданным, оставляем как есть, спросим в другой раз
  if(builderHooks.weightPending(ex)){
    ex.weight = kg;
    // первая база веса: никаких «накопленных» кг поверх неё быть не может
    if(ex.ps && ex.ps.cur) delete ex.ps.cur.kg;
  }
  else builderHooks.setExWeight(ex, kg);
  await savePrograms();
  renderStartOverview();
}

// меню действий на экране просмотра программы — те же пункты, что на карточке
function buildStartMenu(){
  const p = state.raw;
  const menu = $('startMenu');
  menu.innerHTML = '';
  if(!p || p.id === 'warmup'){ $('startMore').style.display = p ? '' : 'none'; }
  const mk = (html2, action, cls)=>{
    const b = document.createElement('button');
    if(cls) b.className = cls;
    b.innerHTML = html2;
    b.dataset.act = action;
    return b;
  };
  const on = progActive(p);
  setShown('startOffChip', !!p && !on);
  // Программа пришла от тренера: показываем, от кого, и даём отчитаться.
  const by = p && p.by ? String(p.by) : '';
  setShown('startByChip', !!by);
  if(by) $('startByName').textContent = by;
  menu.append(
    mk(icon('pencil') + t('common.edit'), 'editStartProgram'),
    mk(icon('power') + (on ? t('programs.disable') : t('programs.enable')), 'toggleStartProgramActive'),
    mk(icon('copy') + t('common.duplicate'), 'duplicateStartProgram'),
    mk(icon('share') + t('programs.shareLink'), 'shareStartProgram'),
    ...(programsTrainerOnHook() ? [mk(icon('users') + t('programs.sendClient'), 'sendStartProgramToClient')] : []),
    ...(programsTrainerOnHook() && !p.storeId ? [mk(icon('crown') + t('programs.submitCatalog'), 'publishStartProgram')] : []),
    mk(icon('download') + t('programs.saveFile'), 'exportStartProgramFile'),
    mk(icon('trash') + t('common.delete'), 'deleteStartProgram', 'danger')
  );
}

export function renderStartInfo(){
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
    $('startVolLabel').textContent = trainerCatalogHooks.storeCountText(pl.rounds,'round').replace(/^\d+\s+/,'');
    $('startRounds').textContent = pl.rounds;
  } else {
    $('startVolLabel').textContent = trainerCatalogHooks.storeCountText(setsTotal,'set').replace(/^\d+\s+/,'');
    $('startRounds').textContent = setsTotal;
  }
  const nEx = pl.exercises.length;
  $('startExCount').textContent = nEx;
  $('startExLabel').textContent = trainerCatalogHooks.storeCountText(nEx,'exercise').replace(/^\d+\s+/,'');
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

/* Setters for state owned by this chunk and changed from other chunks.
   Other chunks read these bindings directly but write them only through the owner. */
export function configureAudioRuntime({soundEnabled, voiceVolume, effectsVolume, preserveMusic} = {}){
  if(soundEnabled !== undefined) soundOn = !!soundEnabled;
  if(voiceVolume !== undefined) voiceVol = voiceVolume;
  if(effectsVolume !== undefined) fxVol = effectsVolume;
  if(preserveMusic !== undefined) musicMode = !!preserveMusic;
  return {soundOn, voiceVol, fxVol, musicMode};
}
export function configureWorkoutTiming({prep, ready, side} = {}){
  if(prep !== undefined) prepSec = prep;
  if(ready !== undefined) readySec = ready;
  if(side !== undefined) sideSec = side;
  return {prepSec, readySec, sideSec};
}
export function selectRuntimeVoice({language, uri} = {}){
  if(language !== undefined) voiceLang = language;
  if(uri !== undefined) savedVoiceURI = uri;
  return {voiceLang, savedVoiceURI};
}
export function blockVoiceCommandsFor(ms = 700){
  lastAppSoundT = Math.max(lastAppSoundT, Date.now() + Math.max(0, Number(ms) || 0));
  return lastAppSoundT;
}
export function voiceCommandsBlockedAt(at = Date.now()){
  return Number(at) < lastAppSoundT;
}
export function openStartFrom(raw, from){
  if(from) startFrom = from;
  return openStart(raw);
}

/* Startup wiring of this part (listeners, handlers, timers). Runs from src/app/index.js,
   after every product module is evaluated, in the original part order. */
export function initCore(){
  setDataSyncCoreHooks({
    $,
    appAlert,
    icon,
    plural,
    setShown,
    getSideSec: () => sideSec,
    getState: () => state,
    syncDockTabs
  });
  registerAction('confirmDialog', () => finishDialog(true));
  registerAction('cancelDialog', () => finishDialog(false));
  registerAction('dialogBackdrop', (modal, event) => {
    if(event.target === modal) finishDialog(dialogConfirm ? false : true);
  });
  registerAction('selectStartPlan', btn => {
    const i = parseInt(btn.dataset.planIdx, 10);
    if(!Number.isFinite(i)) return;
    state.planIdx = i;
    renderPlanRow();
    renderStartInfo();
  });
  registerAction('openStartWeight', btn => {
    const i = parseInt(btn.dataset.exerciseIdx, 10);
    if(Number.isFinite(i)) openWeightModal(i);
  });
  const withStartProgram = fn => async (btn, event) => {
    if(event) event.stopPropagation();
    closeAllMenus();
    const p = state.raw;
    if(p) await fn(p, btn);
  };
  registerAction('editStartProgram', withStartProgram(async p => builderHooks.openBuilder(p.id)));
  registerAction('toggleStartProgramActive', withStartProgram(async p => {
    const wasOn = progActive(p);
    p.active = !wasOn;
    await savePrograms();
    buildStartMenu();
    trainerCatalogHooks.renderMine();
    if(wasOn) appAlert(t('programs.disabledAlert'));
  }));
  registerAction('duplicateStartProgram', withStartProgram(async p => {
    const copy = await programsDuplicateHook(p);
    builderHooks.openBuilder(copy.id);
  }));
  registerAction('shareStartProgram', withStartProgram(async p => programsExportHook(p)));
  registerAction('sendStartProgramToClient', withStartProgram(async p => trainerCatalogHooks.pickClientFor(p)));
  registerAction('publishStartProgram', withStartProgram(async p => trainerCatalogHooks.openPublish(p)));
  registerAction('exportStartProgramFile', withStartProgram(async p => programsExportFileHook(p)));
  registerAction('deleteStartProgram', withStartProgram(async p => {
    if(!(await appDialog(t('programs.deleteQuestion',{name:p.name}),
      {confirm:true, okText:t('common.delete'), cancelText:t('common.keep')}))) return;
    await deleteCustomProgram(p.id);
    trainerCatalogHooks.renderMine();
    goTab('scrPrograms');
  }));
  // Подпись строки с переключателем тоже переключает его — как у системных
  // настроек. Раньше отзывался только сам тумблер 48×28, а в подпись попадали
  // пальцем чаще. Кнопки, ссылки и поля внутри строки работают как прежде.
  document.addEventListener('click', e => {
    const row = e.target.closest('.pref-row');
    if(!row || e.target.closest('button, a, input, select, textarea, label, [role="button"]')) return;
    const switches = row.querySelectorAll('.switch');
    if(switches.length === 1 && !switches[0].disabled) switches[0].click();
  });
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('button, .day-chip, .load-chip, .plan-tab, .choice, .user-row, .mine-card .mc-cover, .cal-cell.done, a.btn-exit, .back-chip, .switch, .icon-btn');
    if(t && !t.disabled) haptic(8);
  }, {passive: true});
  try{ history.replaceState({scr:'scrMenu', d:0}, ''); }catch(e){}
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
      try{ history.back(); }
      catch(e){
        skipPop = Math.max(0, skipPop - 1);
        const waiters = modalHistoryWaiters.splice(0);
        waiters.forEach(fn => fn());
      }
    } else if(modalHistoryWaiters.length){
      const waiters = modalHistoryWaiters.splice(0);
      waiters.forEach(fn => fn());
    }
  }).observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ['class']});
  window.addEventListener('popstate', async e => {
    // запись попапа снята (нами или жестом) — теперь можно переписать запись
    // экрана под ней на вкладку, сменённую, пока попап был открыт
    if(pendingTabScreen && !(history.state && history.state.m)){
      try{ history.replaceState({scr: pendingTabScreen, d: navDepth}, ''); }catch(_){}
      pendingTabScreen = null;
    }
    if(skipPop > 0){
      skipPop--;
      const waiters = modalHistoryWaiters.splice(0);
      waiters.forEach(fn => fn());
      return;
    }   // это мы сами сняли запись закрытого попапа
    // Открытый попап забирает системный Back себе. Сам Back уже снял его
    // служебную history-запись и вернул нас на запись экрана под ним — повторно
    // pushState делать нельзя: получалась вторая копия того же экрана, и следующий
    // Back с вкладки визуально «ничего не делал». Если под верхним попапом остался
    // ещё один, только тогда заводим новую служебную запись для следующего Back.
    if(document.querySelector('.modal.open')){
      dismissTopModal();
      if(document.querySelector('.modal.open')){
        try{ history.pushState({scr: show._last, d: navDepth, m: 1}, ''); }catch(_){}
      }
      return;
    }
    if($('scrWork').classList.contains('on')){
      // назад во время тренировки — спрашиваем, а не выбрасываем
      try{ history.pushState({scr:'scrWork'}, ''); }catch(_){}
      workoutHooks.exitWorkout();
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
        // Возвращаем и browser history, и логический navStack на экран, с которого
        // человек попытался уйти. Раньше history снова был Builder, а navStack уже
        // успевал обрезаться до Programs — после «Остаться» два источника расходились.
        navDepth++;
        if(navStack[navStack.length - 1] !== cur) navStack.push(cur);
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
    resolveNavBack(targetScreen);

    // После явного выхода из глубокого сценария его текущая запись превращается
    // в служебную «Сегодня» с collapse=N. Когда пользователь потом возвращается
    // сюда с корневого таба, сразу перескакиваем через старый глубокий путь к
    // исходной «Сегодня». Так Builder/AI/Store не воскресают следующим Back, но
    // сам goTab остаётся синхронным и не ломает действия сразу после перехода.
    const collapse = e.state && Number(e.state.collapse || 0);
    if(targetScreen === 'scrMenu' && collapse > 0){
      navDepth = 0;
      navStack = ['scrMenu'];
      try{ history.go(-collapse); }catch(_){}
    }
  });
  document.addEventListener('focusin', ()=> syncDock());
  document.addEventListener('focusout', ()=> setTimeout(syncDock, 60));
  installNativeBack();
}

// Системная «Назад» в APK. Без своего слушателя Capacitor то отматывал служебные записи
// истории на «Сегодня» (казалось, что кнопка не работает), то закрывал приложение.
// Теперь: где есть куда вернуться — обычный Back по истории (попапы, тренировка и
// защита несохранённого работают как раньше); на «Сегодня» первое нажатие только
// подсказывает «Нажми ещё раз, чтобы выйти», второе в течение 2 секунд сворачивает.
const EXIT_WINDOW_MS = 2000;
let lastExitPress = 0;
let exitHintTimer = 0;
export function onRootBack(now = Date.now()){
  if(lastExitPress && now - lastExitPress <= EXIT_WINDOW_MS){
    lastExitPress = 0;
    return 'exit';
  }
  lastExitPress = now;
  return 'hint';
}
function showExitHint(){
  let el = document.getElementById('exitHint');
  if(!el){
    el = document.createElement('div');
    el.id = 'exitHint';
    el.className = 'exit-hint';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = t('common.exitHint');
  el.classList.add('on');
  clearTimeout(exitHintTimer);
  exitHintTimer = setTimeout(() => el.classList.remove('on'), EXIT_WINDOW_MS);
}
function installNativeBack(){
  const cap = window.Capacitor;
  const app = cap && cap.Plugins && cap.Plugins.App;
  if(!cap || !cap.isNativePlatform || !cap.isNativePlatform() || !app || !app.addListener) return;
  try{
    app.addListener('backButton', ({canGoBack}) => {
      const onToday = $('scrMenu') && $('scrMenu').classList.contains('on');
      const atRoot = onToday && !document.querySelector('.modal.open') && navStack.length <= 1;
      if(!atRoot){
        if(canGoBack) history.back();
        else show('scrMenu');
        return;
      }
      if(onRootBack() === 'exit'){
        const hint = document.getElementById('exitHint');
        if(hint) hint.classList.remove('on');
        if(app.minimizeApp) app.minimizeApp(); else if(app.exitApp) app.exitApp();
      }else{
        showExitHint();
      }
    });
  }catch(_){}
}
