/* ================= СБОРКА ШАГОВ ================= */
function buildSteps(){
  const cur = state.current;
  const cycle = cur.cycle;
  const warmup = cur.warmup || [];
  const R = cur.rounds;
  const steps = [];

  // Глобального множителя нагрузки больше нет: он умножал вес, а исправленный вес
  // сохранялся как новый рабочий — множитель просачивался в базу и накапливался
  // (10 кг превращались в 29 кг за три тренировки). Единственный механизм роста —
  // прогрессия по каждому упражнению: вес растёт шагами, повторы и время — по своим осям.
  const prep = (s, extra)=> ({...s, ...extra});

  // разминка — один раз перед основной частью
  warmup.forEach(s => steps.push(prep(s, {round: 0})));

  for(let r = 1; r <= R; r++){
    cycle.forEach((s, i)=>{
      // последний отдых последнего круга пропускаем — сразу финал
      if(r === R && i === cycle.length - 1 && s.phase === 'rest') return;
      steps.push(prep(s, {round: r}));
    });
  }
  return steps;
}

/* ================= ГЛОБАЛЬНЫЙ ТАЙМЕР ================= */
function fmt(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
// каждая цифра — в блок фиксированной ширины (.tnum-d), чтобы смена секунды не
// двигала строку целиком (см. комментарий у .tnum-d): двоеточие и прочее — как есть.
// Внешний <span> — единственный флекс-элемент в .count/.reps: без него цифры сами
// становятся элементами флекс-ряда, и column-gap рассаживает их с зазорами
function tnum(str){
  return '<span>' + String(str).replace(/[0-9]/g, d => `<span class="tnum-d">${d}</span>`) + '</span>';
}
function globalElapsed(){
  const pausedNow = state.paused ? (Date.now() - state.pausedAt) : 0;
  return Math.floor((Date.now() - state.globalStart - state.pausedTotal - pausedNow) / 1000);
}
function startGlobal(){
  // при продолжении сессии сдвигаем точку отсчёта назад, чтобы часы шли с накопленного времени
  state.globalStart = Date.now() - (state.resumeElapsed || 0);
  state.resumeElapsed = 0;
  state.paused = false;
  state.pausedAt = 0;
  state.pausedTotal = 0;
  paintPause();
  $('globalClock').classList.add('on');
  $('globalClock').textContent = '00:00';
  state.globalInterval = setInterval(()=>{
    if(state.paused || document.hidden) return;
    $('globalClock').textContent = fmt(globalElapsed());
  }, 1000);
}
function stopGlobal(){
  clearInterval(state.globalInterval);
  $('globalClock').classList.remove('on');
  const total = globalElapsed();
  state.paused = false;
  paintPause();
  return total;
}

/* ---- правка упражнения прямо с тренировки ----
   Всё встаёт на паузу, открывается обычный редактор того же упражнения. «Назад»
   возвращает на тренировку нетронутой, «Готово» переносит правку в саму программу,
   пересобирает оставшиеся шаги и возвращает на тот же шаг — по-прежнему на паузе. */
let exFromWork = false;
$('workMore').innerHTML = icon('more');
$('workMore').onclick = e => { e.stopPropagation(); toggleMenu($('workMenu')); };
(function buildWorkMenu(){
  const box = $('workMenu');
  const b = document.createElement('button');
  b.innerHTML = icon('pencil') + t('workout.editExercise');
  b.onclick = ev => { ev.stopPropagation(); closeAllMenus(); editExerciseFromWorkout(); };
  box.appendChild(b);
})();

function editExerciseFromWorkout(){
  const step = state.steps[state.stepIdx];
  const src = step && liveExercise(step.exName);
  if(!src){
    appAlert(t('workout.editUnavailable'));
    return;
  }
  setPause(true);
  // редактор работает с draft: подставляем ту самую программу и тот самый вариант
  draft = JSON.parse(JSON.stringify(src.p));
  draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
  delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days; delete draft.tod;
  planIdx = (typeof state.planIdx === 'number') ? state.planIdx : 0;
  exFromWork = true;
  openExercise(src.idx);
}

// вернуться на тренировку; rebuild — пересобрать шаги под изменённое упражнение
function backToWorkout(rebuild){
  exFromWork = false;
  if(rebuild && state.raw){
    state.raw = customPrograms.find(p => p.id === state.raw.id) || state.raw;
    state.current = customToProgram(state.raw, state.planIdx);
    const cur = state.steps[state.stepIdx] || {};
    state.steps = buildSteps();
    // ищем тот же самый шаг по кругу, упражнению, подходу и стороне; если упражнение
    // переименовали — остаёмся на том же месте по счёту
    let i = state.steps.findIndex(x =>
      x.exName === cur.exName && x.phase === cur.phase &&
      (x.round || 0) === (cur.round || 0) &&
      (x.setNo || 1) === (cur.setNo || 1) &&
      (x.side || 0) === (cur.side || 0));
    if(i < 0) i = Math.min(state.stepIdx, state.steps.length - 1);
    state.stepIdx = Math.max(0, i);
    renderStep();              // снимает паузу: «новый шаг всегда начинается без паузы»
    setPause(true, true);      // но мы не начинали новый шаг, а вернулись в тот же
  }
  goBackTo('scrWork');
}

// Куда деваться после любой правки состава: на тренировку, если пришли оттуда
// (тогда изменение сразу уезжает в саму программу и шаги пересобираются), иначе
// обратно в конструктор.
async function afterExChange(){
  renderExList();
  if(!exFromWork){ goBackTo('scrBuilder'); return; }
  const i = customPrograms.findIndex(x => x.id === draft.id);
  if(i >= 0) customPrograms[i] = draft;
  await savePrograms();
  renderMine();
  backToWorkout(true);
}

async function saveExToWorkout(){
  const list = curPlan().exercises;
  if(list[exIdx]) list[exIdx] = commitExercise();
  const i = customPrograms.findIndex(x => x.id === draft.id);
  if(i >= 0) customPrograms[i] = draft;
  await savePrograms();
  renderMine();
  exDraft = null; exIdx = -1; exOrig = ''; exIsNew = false;
  backToWorkout(true);
}

/* ================= ПАУЗА ================= */
function setPause(p, silent){
  if(p === state.paused) return;
  if(p){
    state.paused = true;
    state.pausedAt = Date.now();
    if(window.FitNative) window.FitNative.cancelRest();
    syncNativeWorkoutState(state.steps[state.stepIdx], 0);
  } else {
    const pausedFor = Date.now() - state.pausedAt;
    state.pausedTotal += pausedFor;
    if(state.stepDeadline) state.stepDeadline += pausedFor;
    state.paused = false;
    const step = state.steps[state.stepIdx];
    syncNativeWorkoutState(step, state.stepDeadline || 0);
  }
  // Голосом отмечаем только ВХОД в паузу: на выходе и так идёт отсчёт, а второе
  // слово поверх него только мешает. silent — когда пауза не новость: мы её и не
  // снимали, просто вернулись из редактора упражнения.
  if(p && !silent) speak(voiceIsEnglish() ? 'Paused' : 'Пауза');
  paintPause();
}
// Красная плашка и кнопка ВСЕГДА рисуются по state.paused и никогда — мимо него.
// Иначе так: правка упражнения ставит паузу, человек уходит с тренировки, сессия
// заканчивается — startWorkout сбрасывает state.paused в false напрямую, а класс
// на body остаётся. Плашка горит, и setPause(false) её не снимает, потому что по
// состоянию паузы уже нет: «горит и не снимается, помогает только перезапуск».
function paintPause(){
  const p = !!state.paused;
  document.body.classList.toggle('paused', p);
  const btn = $('btnPause');
  btn.innerHTML = icon(p ? 'play' : 'pause');
  btn.title = p ? t('workout.resume') : t('workout.pause');
  btn.classList.toggle('paused', p);
  const step = state.steps[state.stepIdx];
  if(step){
    $('phaseTag').textContent = p ? t('workout.pause') : (step.phase==='rest' ? t('workout.rest') : t('workout.exercise'));
  }
}

/* ================= ДВИЖОК ШАГОВ ================= */
// fromIdx — с какого шага начать (продолжение сессии или выбор упражнения)
// elapsed — уже накопленное время тренировки в мс, чтобы счётчик не начинался с нуля
function startWorkout(fromIdx, elapsed, options){
  const opts = options || {};
  trackProductEvent('workout_started').catch(()=>{});
  initAudio(); keepAwake();
  if(window.FitNative) window.FitNative.requestNotifications();
  try{ if('speechSynthesis' in window) speechSynthesis.getVoices(); }catch(e){} // прогрев списка голосов
  state.steps = buildSteps();
  state.live = true;   // тренировка идёт: на неё можно вернуться жестом «назад»
  state.workoutSessionId = String(opts.sessionId || state.workoutSessionId || '');
  if(!state.workoutSessionId){
    state.workoutSessionId = 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }
  state.stepIdx = Math.min(Math.max(0, parseInt(fromIdx) || 0), Math.max(0, state.steps.length - 1));
  state.resumeElapsed = Math.max(0, parseInt(elapsed) || 0);
  state.resumeStepDeadline = Math.max(0, Number(opts.resumeDeadline) || 0);
  state.globalStart = 0;
  // Упражнения, до которых тренировка реально дошла: только они считаются
  // выполненными для прогрессии (commitFinish). Продолжение прерванной сессии
  // (elapsed > 0) — всё до точки продолжения уже сделано; старт «с выбранного
  // упражнения» — пропущенные до него не в счёт.
  state.reachedEx = new Set();
  if(state.resumeElapsed > 0){
    state.steps.slice(0, state.stepIdx).forEach(s => { if(s.phase === 'work') state.reachedEx.add(s.exId || s.exName || s.title); });
  }
  show('scrWork');
  startHandsFree();
  // отсчёт 5..1 перед стартом
  const ov = $('prepOverlay');
  $('prepTitle').textContent = state.current.title;
  let n = opts.skipPrep ? 0 : Math.max(0, prepSec);
  if(n === 0){
    ov.classList.remove('on');
    document.body.classList.remove('prep-on');
    startGlobal();
    renderStep();
    return;
  }
  $('prepNum').textContent = n;
  ov.classList.add('on');
  // пока идёт отсчёт — страница не прокручивается и не дёргается
  document.body.classList.add('prep-on');
  window.scrollTo(0, 0);
  beep(660, .1);
  state.prepTimer = setInterval(()=>{
    n--;
    if(n <= 0){
      clearInterval(state.prepTimer); state.prepTimer = null;
      ov.classList.remove('on');
      document.body.classList.remove('prep-on');
      window.scrollTo(0, 0);
      beep(990, .15, 0, .3);
      startGlobal();
      renderStep();
      return;
    }
    $('prepNum').textContent = n;
    beep(660, .1);
  }, 1000);
}

function clearStepTimer(){
  if(state.stepTimer){ clearInterval(state.stepTimer); state.stepTimer=null; }
  state.stepDeadline = 0;
  state.remaining = 0;
  if(window.FitNative) window.FitNative.cancelRest();
  state.beginTimer = null; // отменяем отложенный запуск (если шаг пропустили во время озвучки)
  hideReadyBar();
}

// На отдыхе у самого шага нет ни номера подхода, ни имени упражнения — mkRest создаёт
// его без этих полей вовсе (в этом и была причина «Подход исчезает» и «Упражнение 0/N»).
// Поэтому для подписей во время отдыха берём данные с ближайшего предыдущего рабочего шага,
// а не с самого шага отдыха. Ищем по state.steps, а не полагаемся на то, что уже нарисовано —
// так подпись верна и при переходе назад, и при возобновлении сессии сразу на отдыхе.
function lastWorkStep(){
  for(let i = state.stepIdx; i >= 0; i--){
    if(state.steps[i].phase === 'work') return state.steps[i];
  }
  return state.steps[state.stepIdx];
}

// «Упражнение N из M» — считает именно упражнения, а не строки в state.steps: подходы одного
// упражнения (setNo/setsTotal) и обе стороны (side) — это ОДНО упражнение, не два и не три,
// а строки отдыха вообще не считаются. Разминка и упражнения основного круга объединены
// в один сквозной счёт (4 разминочных + 6 основных = «упражнение N из 10»), а не считаются
// раздельно — круг при этом не растягивает знаменатель: каждый круг заново проходит те же
// «после разминки» позиции, номер круга и так виден отдельно в «Круг X/Y».
// какое это упражнение разминки по счёту — «Разминка 2 / 4». Разминка идёт вне кругов,
// и без такого счёта на её экранах вообще не видно, сколько ещё осталось
function warmupPosition(step){
  const order = [];
  state.steps.forEach(s => {
    if(s.phase === 'work' && s.round === 0 && !order.includes(s.exName)) order.push(s.exName);
  });
  const i = order.indexOf(step.exName);
  return i < 0 ? null : {idx: i + 1, total: order.length};
}

function nextNativeWorkStep(){
  for(let i = state.stepIdx + 1; i < (state.steps || []).length; i++){
    const s = state.steps[i];
    if(s && s.phase === 'work') return s;
  }
  return null;
}

let nativeSessionSaveT = 0;
function autosaveNativeWorkoutSession(delay){
  if(!(window.FitNative && window.FitNative.isNative) || !state.live || typeof saveSession !== 'function') return;
  clearTimeout(nativeSessionSaveT);
  nativeSessionSaveT = setTimeout(()=>{
    nativeSessionSaveT = 0;
    if(state.live) saveSession().catch(()=>{});
  }, Math.max(0, Number(delay) || 0));
}

window.addEventListener('fitAppBackground', ()=>{
  if(!(window.FitNative && window.FitNative.isNative) || !state.live || typeof saveSession !== 'function') return;
  clearTimeout(nativeSessionSaveT);
  nativeSessionSaveT = 0;
  saveSession().catch(()=>{});
});

function syncNativeWorkoutState(step, endsAt){
  if(!step || !(window.FitNative && window.FitNative.updateWorkoutState)) return;
  const next = nextNativeWorkStep();
  const paused = !!state.paused;
  const now = Date.now();
  const timed = !paused && Number(endsAt) > now + 100;
  const nextName = next ? (next.title || next.exName || '') : '';
  const meta = (($('roundLabel') && $('roundLabel').textContent) || '').trim();
  // A running timer is intentional activity. Start the 20-minute "forgotten workout"
  // window after that timer should finish, not in the middle of a long timed exercise.
  const inactivityBase = timed ? Number(endsAt) : now;
  window.FitNative.updateWorkoutState({
    active: true,
    sessionId: String(state.workoutSessionId || ''),
    workoutTitle: (state.current && state.current.title) || 'Fit Timer',
    phase: step.phase === 'rest' ? 'rest' : 'work',
    phaseLabel: paused ? t('workout.pause') : (step.phase === 'rest' ? t('workout.rest') : t('workout.exercise')),
    current: step.phase === 'rest' ? t('workout.rest') : (step.title || step.exName || t('workout.exercise')),
    next: nextName ? t('workout.next') + ' · ' + nextName : '',
    meta,
    paused,
    timed,
    startedAt: timed ? Date.now() : 0,
    endsAt: timed ? Number(endsAt) : 0,
    alertTitle: t('notify.timerDoneTitle'),
    alertBody: nextName ? t('notify.timerDoneNext',{name:nextName}) : t('notify.timerDoneBody'),
    inactivityAt: inactivityBase + 20 * 60 * 1000,
    inactivityTitle: t('notify.activeForgotTitle'),
    inactivityBody: t('notify.activeForgotBody')
  });
  autosaveNativeWorkoutSession(40);
}

function exerciseProgressLabel(step){
  const warmupOrder = [], mainOrder = [];
  // список основного круга берём ВСЕГДА по кругу 1 — он одинаков в любом круге (программа
  // повторяется), а во время самой разминки step.round === 0 никогда бы не совпал с кругом
  // основной части, и общее число упражнений считалось бы только по разминке (баг: 4 из 4
  // вместо 4 из 10). round===1 — надёжный ориентир и для разминки, и для круга 2, 3…
  state.steps.forEach(s => {
    if(s.phase !== 'work') return;
    if(s.round === 0){ if(!warmupOrder.includes(s.exName)) warmupOrder.push(s.exName); }
    else if(s.round === 1){ if(!mainOrder.includes(s.exName)) mainOrder.push(s.exName); }
  });
  const total = warmupOrder.length + mainOrder.length;
  const idx = step.round === 0
    ? warmupOrder.indexOf(step.exName) + 1
    : warmupOrder.length + mainOrder.indexOf(step.exName) + 1;
  return t('workout.exerciseProgress',{idx,total});
}

function renderStep(){
  clearStepTimer();
  // На отдыхе и на смене стороны менять нечего: текущий шаг — не упражнение.
  // Кнопка там открывала меню, которое отвечало «это упражнение не из сохранённой
  // программы», — нажатие без результата.
  closeAllMenus();
  setPause(false); // новый шаг всегда начинается без паузы
  const step = state.steps[state.stepIdx];
  const total = state.steps.length;
  if(!(step && step.kind === 'timer' && step.seconds)) state.resumeStepDeadline = 0;
  if(step && step.phase === 'work' && state.reachedEx) state.reachedEx.add(step.exId || step.exName || step.title);

  document.body.classList.toggle('phase-rest', step.phase==='rest');
  setShown('workMenuWrap', step.phase === 'work' && !!step.exName);
  // на отдыхе подписи берём с последнего рабочего шага — у самого отдыха этих данных нет
  const labelStep = step.phase === 'rest' ? lastWorkStep() : step;
  // круг / разминка + подход
  let rl;
  if(labelStep.round === 0){
    // в разминке кругов нет — вместо них показываем, какое это упражнение разминки по счёту
    const w = warmupPosition(labelStep);
    rl = w ? t('workout.warmupProgress',{idx:w.idx,total:w.total}) : t('workout.warmup');
  } else {
    // круг всего один — «Круг 1 / 1» ничего не сообщает, только занимает строку
    rl = state.current.rounds > 1 ? t('workout.roundProgress',{idx:labelStep.round,total:state.current.rounds}) : '';
  }
  if(labelStep.setsTotal > 1) rl += (rl ? ' · ' : '') + t('workout.setProgress',{idx:labelStep.setNo,total:labelStep.setsTotal});
  $('roundLabel').textContent = rl;
  $('stepLabel').textContent = exerciseProgressLabel(labelStep);
  $('btnPrev').disabled = state.stepIdx === 0;
  $('progressFill').style.width = ((state.stepIdx)/total*100) + '%';
  syncNativeWorkoutState(step, 0);

  setShown('phaseTag', false);
  $('stepTitle').textContent = step.title;
  fitStepTitle();
  $('stepInstruction').textContent = step.instruction || '';
  $('stepDetails').scrollTop = 0;

  // работающие мышцы — чипами
  const mus = (step.phase === 'work' && step.muscles && step.muscles.length) ? step.muscles : null;
  if(mus){
    $('stepMuscles').innerHTML =
      `<div class="m-chips">${mus.map(id => `<span class="m-chip">${canonicalLabel(M_LABEL[id] || id)}</span>`).join('')}</div>`;
    setShown('stepMuscles', true);
  } else {
    setShown('stepMuscles', false);
  }
  // частые ошибки — подвал карточки: иконка из общего набора вместо эмодзи
  if(step.phase === 'work' && step.mistakes){
    $('stepMistakes').innerHTML = icon('alert') + '<span>' + esc(step.mistakes) + '</span>';
    setShown('stepMistakes', true);
  } else {
    setShown('stepMistakes', false);
  }

  // звуки начала шага (для work запуск таймера происходит ниже, после озвучки)
  state.stepToken = (state.stepToken || 0) + 1;
  const myToken = state.stepToken;
  if(step.phase === 'work'){
    gong();
    setTimeout(()=>{
      if(state.stepToken !== myToken) return; // шаг уже сменили
      announceExercise(step, ()=>{
        if(state.stepToken !== myToken) return;
        if(step.kind === 'timer' && readySec > 0){
          // упражнение на время: даём подготовиться под убывающую полосу, затем гонг и отсчёт
          runReadyBar(readySec, ()=>{
            if(state.stepToken !== myToken) return;
            exerciseGong(); // упражнение началось — самый заметный сигнал
            setTimeout(()=>{ if(state.stepToken === myToken && state.beginTimer) state.beginTimer(); }, 300);
          });
        } else {
          exerciseGong(); // тот же заметный сигнал, что и на упражнениях со временем
          setTimeout(()=>{ if(state.stepToken === myToken && state.beginTimer) state.beginTimer(); }, 350);
        }
      });
    }, 500); // после удара гонга
  } else if(step.sideSwitch){
    // пауза на смену стороны — коротко проговариваем
    beep(880, .12);
    setTimeout(()=>{
      if(state.stepToken !== myToken) return;
      const n2 = state.steps.slice(state.stepIdx + 1).find(s => s.phase === 'work');
      const base = voiceIsEnglish() ? 'Switch sides' : t('workout.switchSidesVoice');
      const side = n2 && n2.side
        ? (voiceIsEnglish()
            ? `. Side ${n2.side} of ${n2.sidesTotal || 2}`
            : '. ' + t('workout.sideVoice',{current:n2.side,total:n2.sidesTotal || 2}))
        : '';
      speak(base + side);
    }, 260);
  } else if(step.roundRest || (step.kind === 'timer' && step.seconds)){
    const nxt = state.steps.slice(state.stepIdx + 1).find(s => s.phase === 'work');
    if(step.roundRest) roundDone(step.seconds, nxt);
    else announceRest(step.seconds, nxt);
  }

  // на отдыхе показываем, что будет дальше
  renderNextUp(step);

  // Иллюстрация внутри скролл-блока; на отдыхе скрыта через CSS
  const box = $('illoBox');
  if(step.media && step.media.kind === 'img'){
    box.innerHTML = `<img src="${esc(step.media.data)}" alt="">`;
  } else {
    box.innerHTML = ILLO[step.illo] || '';
  }
  const hasIllo = !!box.innerHTML;
  setShown('illoWrap', (hasIllo && step.phase === 'work'));

  // видео: есть картинка → маленький значок YouTube над ней; нет картинки → крупная кнопка «Смотреть видео»
  const hasVideo = !!(step.video && step.phase === 'work');
  const badge = $('videoLink'), cta = $('videoCta');
  badge.classList.toggle('on', hasVideo && hasIllo);
  cta.classList.toggle('on', hasVideo && !hasIllo);
  if(hasVideo){ badge.href = step.video; cta.href = step.video; }

  // карточка упражнения — один объект. Показывать нечего (нет ни картинки, ни описания,
  // ни мышц, ни ошибок) — карточки нет совсем, вместо пустой рамки остаётся воздух.
  setShown('exCard',
    (hasIllo && step.phase === 'work') || (hasVideo && !hasIllo) || !!mus ||
    !!(step.phase === 'work' && step.mistakes) || !!(step.instruction || '').trim());
  // Значок «можно усложнить»: есть картинка — лежит на ней в правом верхнем углу,
  // нет картинки — отдельной строкой по центру над карточкой. Своего постоянного
  // места на экране у него больше нет, поэтому и пустого отступа под него тоже.
  const wantSwap = step.phase === 'work' && !!step.swap;
  const swapEl = $('swapBadge'), swapSlot = $('swapSlot');
  const swapHost = (hasIllo && step.phase === 'work') ? $('illoWrap') : swapSlot;
  if(swapEl.parentNode !== swapHost) swapHost.appendChild(swapEl);
  setShown(swapEl, wantSwap);
  setShown(swapSlot, wantSwap && swapHost === swapSlot);

  // картинка может доехать позже — пересчитаем края, когда она встанет на место
  const im = box.querySelector('img');
  if(im) im.addEventListener('load', refreshDetailsFade, {once:true});
  requestAnimationFrame(refreshDetailsFade);


  if(step.kind === 'click'){
    setShown('stepReps', true);
    // рабочий вес — часть задания, поэтому цифра контрастнее подписи «повторений»
    // Условие именно «вес задан», а не «вес растёт»: weight отличен от нуля только
    // у форматов с весом, и при выключенной автопрогрессии там лежит зафиксированная
    // база. По старому условию (progAxis === 'weight') такой вес не показывался вовсе —
    // человек вписал 12 кг, а на тренировке их не видел.
    const kgTxt = step.weight > 0 ? `<span class="v-unit v-kg">× ${fmtKg(step.weight)} ${appLocale === 'ru' ? 'кг' : 'kg'}</span>` : '';
    // здесь у строки есть своя цифра: слот главной цифры нужен целиком, а место
    // справа от неё ничем не занято — кольцу подготовки на этом шаге и не нужно
    $('stepReps').classList.remove('kg-side');
    $('countRow').classList.remove('with-kg');
    // пробелы между частями строки — для чтения вслух и копирования; во флекс-контейнере
    // они не создают отдельных элементов и на раскладку не влияют
    $('stepReps').innerHTML = `<span class="v-num">${valueText(step.reps)}</span> `
      + (step.repsNote ? `<span class="v-unit">${step.repsNote}</span> ` : '') + kgTxt;
    // «на каждую сторону» — отдельной строкой, чтобы не ломать вёрстку под числом
    const snR = $('sideNote');
    if(step.perSide){ snR.textContent = t('workout.eachSide'); setShown(snR, true); }
    else setShown(snR, false);
    setShown('countdown', false);
    setShown('btnDone', true);
    setShown('btnSkip', false);
  } else {
    // «время и вес» (удержание или перенос с грузом) — вес виден и на самом
    // таймере, не только в озвучке в начале: не отдых, показывать нечего смысла нет.
    // Встаёт он СПРАВА от таймера, на одной с ним базовой линии (одна .count-row):
    // отдельной строкой он занимал весь слот главной цифры и весил столько же,
    // сколько сам отсчёт. Класс kg-side снимает этот слот.
    const withKg = step.phase === 'work' && step.weight > 0;
    if(withKg) $('stepReps').innerHTML = `<span class="v-unit v-kg">× ${fmtKg(step.weight)} ${appLocale === 'ru' ? 'кг' : 'kg'}</span>`;
    $('stepReps').classList.toggle('kg-side', withKg);
    setShown('stepReps', withKg);
    // класс нужен только вёрстке слота (.reps.kg-side чуть выше) — на позицию кольца
    // подготовки больше не влияет, оно на время отсчёта прячет вес сам (body.readying)
    $('countRow').classList.toggle('with-kg', withKg);
    setShown('btnDone', false);
    setShown('btnSkip', true);
    $('btnSkip').textContent = t('workout.skip');
    // подпись для упражнений «на каждую сторону» — как у повторений
    const sn = $('sideNote');
    if(step.phase === 'work' && step.perSide){
      sn.innerHTML = t('workout.eachSide') + (step.side ? ` · <b>${t('workout.sideProgress',{idx:step.side,total:step.sidesTotal || 2})}</b>` : '');
      setShown(sn, true);
    } else setShown(sn, false);

    const cd = $('countdown');
    setShown(cd, true);
    const resumeDeadline = Math.max(0, Number(state.resumeStepDeadline) || 0);
    state.resumeStepDeadline = 0;
    state.remaining = resumeDeadline > Date.now()
      ? Math.max(1, Math.min(step.seconds, Math.ceil((resumeDeadline - Date.now()) / 1000)))
      : step.seconds;
    cd.innerHTML = tnum(fmt(state.remaining));
    cd.classList.remove('warn');
    const launch = ()=>{
      if(resumeDeadline > 0){
        state.remaining = Math.max(1, Math.min(step.seconds, Math.ceil((resumeDeadline - Date.now()) / 1000)));
        cd.innerHTML = tnum(fmt(state.remaining));
      }
      state.stepDeadline = resumeDeadline > Date.now()
        ? resumeDeadline
        : Date.now() + state.remaining * 1000;
      syncNativeWorkoutState(step, state.stepDeadline);
      state.stepTimer = setInterval(()=>{
        if(state.paused || document.hidden) return;
        state.remaining = Math.max(0, Math.ceil((state.stepDeadline - Date.now()) / 1000));
        if(state.remaining <= 0){
          clearStepTimer();
          if(step.phase === 'work') endSignal(); // после отдыха вместо сигнала прозвучит гонг нового упражнения
          nextStep();
          return;
        }
        cd.innerHTML = tnum(fmt(state.remaining));
        if([60,45,30,15].includes(state.remaining)) announceRemaining(state.remaining);
        if(state.remaining <= 3){ cd.classList.add('warn'); tick(); }
      }, 1000);
    };
    if(step.phase === 'work'){
      // упражнение: ждём озвучку → старт-сигнал → отсчёт (запустит цепочка выше)
      state.beginTimer = ()=>{ state.beginTimer = null; launch(); };
      // предохранитель: если звук выключен целиком и цепочка не запустит — стартуем через 900мс
      const tk = state.stepToken;
      const guardMs = (soundOn && voiceVol > 0 ? 8000 : 900) + (step.kind === 'timer' ? readySec * 1000 : 0);
      setTimeout(()=>{ if(state.stepToken === tk && state.beginTimer) state.beginTimer(); }, guardMs);
    } else {
      // отдых: отсчёт сразу
      state.beginTimer = null;
      launch();
    }
  }
}

/* Название упражнения живёт в слоте высотой ровно в две строки — так цифра под ним
   стоит на одном и том же месте на любом шаге. Если имя длинное, уменьшаем ему кегль,
   а не двигаем всё вниз: искать глазами цифру на потной тренировке хуже, чем читать
   название на пару пунктов мельче. */
function fitStepTitle(){
  const h = $('stepTitle');
  if(!h || !h.firstChild) return;
  h.style.fontSize = '';
  const slot = parseFloat(getComputedStyle(h).minHeight) || 0;
  if(!slot) return;
  const rng = document.createRange();
  const textH = ()=>{ rng.selectNodeContents(h); return rng.getBoundingClientRect().height; };
  let size = parseFloat(getComputedStyle(h).fontSize);
  let guard = 0;
  while(textH() > slot + 1 && size > 18 && guard++ < 14){
    size -= 1.5;
    h.style.fontSize = size + 'px';
  }
}

/* Край области с описанием подсказывает, что текст продолжается: сверху и снизу
   он растворяется ровно тогда, когда там правда есть непрочитанное, а внизу
   появляется стрелка. Обрыв текста посреди фразы больше не выглядит как ошибка. */
function refreshDetailsFade(){
  const d = $('stepDetails');
  if(!d) return;
  const below = d.scrollHeight - d.clientHeight - d.scrollTop;
  // растворяем ровно столько, сколько скрыто (но не больше 40 px): если за краем
  // осталась пара пикселей, гасить целую строку читаемого текста незачем
  const fade = v => (v > 12 ? Math.min(40, v) : 0) + 'px';
  d.style.setProperty('--fade-t', fade(d.scrollTop));
  d.style.setProperty('--fade-b', fade(below));
  setShown('scrollCue', below > 24);
}

function nextStep(){
  clearStepTimer();
  state.stepIdx++;
  if(state.stepIdx >= state.steps.length) finishWorkout();
  else renderStep();
}

/* ---- подсказка «можно усложнить» ----
   Упражнение доросло до потолка и расти дальше некуда, а более сложный вариант известен.
   Ничего не меняем автоматически: показываем название и технику, а замену человек делает
   сам через редактирование упражнения — на тренировке не место структурным правкам. */
function openSwapHint(){
  const step = state.steps[state.stepIdx];
  if(!step || !step.swap) return;
  $('swapIntro').textContent = t('workout.swapIntro',{title:step.title});
  $('swapName').textContent = step.swap.name;
  $('swapDesc').textContent = step.swap.desc || t('workout.noDescription');
  $('swapCopy').textContent = t('workout.copyNameDesc');
  // замена нейросетью входит в подписку, но кнопку видно всегда: без подписки она
  // ведёт на витрину, а не притворяется, что функции не существует
  setShown('swapAI', true);
  $('swapOk').className = 'btn-ghost';
  $('swapHint').textContent = t('workout.swapAIHint');
  AppBaseUI.openModal($('swapModal'));
}
function closeSwapHint(){ AppBaseUI.closeModal($('swapModal')); }

// ---- замена упражнения через ИИ прямо на тренировке ----
// находим упражнение-исходник в самой программе: шаг тренировки — это только копия
function swapSourceExercise(){
  const step = state.steps[state.stepIdx];
  if(!step) return null;
  const src = liveExercise(step.exName);
  return src ? {...src, step} : null;
}

function swapAIPrompt(ex,swap,locale){
  return [
    'Replace this home-workout exercise with the specified harder progression.',
    'Return exactly ONE complete NEW exercise block and nothing else: no Markdown and no explanation.',
    'The replacement must remain the same general movement pattern and preserve unilateral/bilateral nature when appropriate.',
    'Do not introduce new equipment unless it is explicitly implied by TARGET REPLACEMENT or already used by the current exercise.',
    'Choose fresh starting values appropriate for the harder exercise; usually use fewer reps/seconds than the old ceiling, then define a sensible progression and ceiling.',
    'Keep set count and rest reasonably close unless the harder movement genuinely requires a change.',
    'If the new exercise itself has a clear later progression that cannot be handled by reps/time/weight alone, you may include ЗАМЕНА and ОПИСАНИЕ ЗАМЕНЫ.',
    'USER: '+userForAI(locale),
    'TARGET REPLACEMENT: '+swap.name+(swap.desc?' — '+swap.desc:''),
    'WHY: the current exercise reached its useful progression ceiling.',
    '=== CURRENT EXERCISE ===\n'+exerciseToText(ex),
    exAnswerFormat(locale)
  ].join('\n\n');
}

// переносим содержимое нового упражнения в оставшиеся шаги текущей тренировки.
// Структура занятия (сколько подходов и в каком порядке) остаётся прежней до конца
// тренировки — меняется только то, ЧТО делать; новое расписание вступит в силу со следующей.
function refreshLiveSteps(oldName, ex){
  const fresh = customToProgram(state.raw, (typeof state.planIdx === 'number') ? state.planIdx : 0);
  const model = [...fresh.warmup, ...fresh.cycle].find(s => s.phase === 'work' && s.exName === ex.name);
  if(!model) return false;
  const KEEP = ['setNo', 'setsTotal', 'side', 'sidesTotal', 'round', 'isWarmup'];
  let touchedCurrent = false;
  state.steps.forEach((s, i) => {
    if(i < state.stepIdx || s.phase !== 'work' || s.exName !== oldName) return;
    const kept = {};
    KEEP.forEach(k => { if(s[k] !== undefined) kept[k] = s[k]; });
    Object.keys(s).forEach(k => delete s[k]);
    Object.assign(s, JSON.parse(JSON.stringify(model)), kept);
    if(i === state.stepIdx) touchedCurrent = true;
  });
  return touchedCurrent;
}

async function swapViaAI(){
  if(!premiumGate()) return;
  const src = swapSourceExercise();
  if(!src || !src.step.swap){
    appAlert(t('workout.swapNotFound'));
    return;
  }
  const oldName = src.ex.name;
  closeSwapHint();
  aiRunOpen(t('workout.swapPicking'));
  let text;
  try{
    text = await callGemini(swapAIPrompt(src.ex, src.step.swap, src.p && src.p.locale), aiRunCtl ? aiRunCtl.signal : undefined, 'exercise.replace');
  }catch(e){
    aiRunClose();
    if(e && (e.name === 'AbortError' || /abort/i.test(e.message || ''))) return; // отменили — молча
    const retry = await appDialog(
      t('workout.aiNoResponse',{error:(e && e.message ? e.message : t('common.unknownError'))}) + '\n\n' + t('ai.retryQuestion'),
      {confirm:true,okText:t('ai.retry'),cancelText:t('ai.notNow')}
    );
    if(retry) return swapViaAI();
    return;
  }
  aiRunClose();
  const checked = aiClientVerdict('exercise.replace', text, {expectedCount:1});
  if(!checked) return;
  // разбираем ответ тем же парсером, что и обычный импорт — обёртка даёт ему минимальную программу
  const {program} = parseProgramText('ПРОГРАММА: temp\nДЕНЬ:\nКРУГИ: 1\n\n' + checked);
  const got = (program.plans[0] && program.plans[0].exercises[0]) || null;
  if(!got || !(got.name || '').trim()){
    appAlert(t('workout.aiNoExercise'));
    return;
  }
  got.warmup = src.ex.warmup;               // разминочное остаётся разминочным
  normalizeExercise(got);
  // новое упражнение начинает с собственной базы: у него свежий id (см. blankExercise)
  // и нет ex.ps — состояние прогрессии читается как «ещё на базе», ничего переносить не нужно
  if(!got.media) got.media = null;          // картинка от прежнего движения только запутает
  src.plan.exercises[src.idx] = got;
  await savePrograms();
  renderMine();

  const onCurrent = refreshLiveSteps(oldName, got);
  if(onCurrent) renderStep();               // это же упражнение прямо сейчас — показываем новое
  else renderNextUp(state.steps[state.stepIdx]);
  appAlert(t('workout.swapReplaced',{name:got.name}));
}

// шаг назад — если пропустил случайно или хочешь переделать подход
function prevStep(){
  if(state.stepIdx <= 0) return;
  clearStepTimer();
  state.stepIdx--;
  renderStep();
}

/* ================= ПРЕВЬЮ СЛЕДУЮЩЕГО УПРАЖНЕНИЯ ================= */
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function renderNextUp(step){
  const nu = $('nextUp');
  if(step.phase !== 'rest'){ setShown(nu, false); nu.innerHTML=''; return; }
  const nxt = state.steps.slice(state.stepIdx+1).find(s => s.phase === 'work');
  if(!nxt){ setShown(nu, false); nu.innerHTML=''; return; }

  const media = (nxt.media && nxt.media.kind === 'img')
    ? `<img src="${esc(nxt.media.data)}" alt="">`
    : DUMBBELL_ICON;
  // рабочий вес — часть задания: на отдыхе по нему решают, что нести к коврику
  const kg = nxt.weight > 0 ? ` × ${fmtKg(nxt.weight)} ${appLocale === 'ru' ? 'кг' : 'kg'}` : '';
  let val = nxt.kind === 'click'
    ? `${esc(valueText(nxt.reps))} ${esc(nxt.repsNote || t('workout.repsShort'))}${kg}${nxt.perSide ? ' ' + t('workout.eachSide') : ''}`.trim()
    : `${nxt.seconds} ${t('workout.secShort')}${kg}${nxt.perSide ? ' ' + t('workout.eachSide') : ''}`;
  // подход и сторона — чтобы было видно, что именно предстоит
  const meta = [];
  if(nxt.setsTotal > 1) meta.push(`${t('workout.setLower')} ${nxt.setNo}/${nxt.setsTotal}`);
  if(nxt.side) meta.push(`${t('workout.sideLower')} ${nxt.side}/${nxt.sidesTotal || 2}`);
  if(meta.length) val += ` · ${meta.join(' · ')}`;

  nu.innerHTML =
    `<div class="nu-label">${esc(t('workout.next'))}</div>` +
    `<div class="nu-row">` +
      `<div class="nu-media">${media}</div>` +
      `<div class="nu-body"><h4>${esc(nxt.title)}</h4>` +
      (nxt.instruction ? `<p>${esc(nxt.instruction)}</p>` : '') +
      `<div class="nu-val">${val}</div></div>` +
    `</div>`;
  setShown(nu, true); // блок показывается только на отдыхе
  requestAnimationFrame(refreshDetailsFade);
}

// поле растёт по содержимому — не нужно скроллить внутри маленькой рамки.
// Но у роста есть предел: дальше поле само становится прокручиваемым, иначе длинный
// ответ нейросети просто обрезался бы без возможности до него добраться.
// Предел роста — доля экрана, а не фиксированные пиксели: поле выше экрана нельзя
// прокрутить внутри, не потеряв из виду его края, а длинные ответы нейросети именно такие.
function autoGrowMax(){
  return Math.max(180, Math.min(900, Math.round(window.innerHeight * 0.6)));
}
function autoGrow(el){
  if(!el) return;
  const max = autoGrowMax();
  el.style.overflowY = 'hidden';
  el.style.height = 'auto';
  const need = el.scrollHeight + 2;
  el.style.height = Math.min(need, max) + 'px';
  if(need > max) el.style.overflowY = 'auto';
}
document.addEventListener('input', e => {
  if(e.target && e.target.classList && e.target.classList.contains('auto-grow')) autoGrow(e.target);
});

// карточка «дальше» больше не растягивается на всю высоту: описание в ней ограничено
// четырьмя строками через CSS (line-clamp), подгонять высоту скриптом не нужно
window.addEventListener('resize', ()=>{ if($('scrWork').classList.contains('on')){ fitStepTitle(); refreshDetailsFade(); } });

/* ================= ФИНАЛ ================= */
function stopSpeech(){
  if(window.FitNative && window.FitNative.stopSpeaking) window.FitNative.stopSpeaking();
  try{ speechSynthesis.cancel(); }catch(e){}
}

function estimateKcal(sec, load){
  const ws = stats.weights;
  const u = curUser();
  const w = (ws && ws.length) ? ws[ws.length - 1].w : (u && u.gender === 'm' ? 78 : 62);
  const met = Math.min(9, Math.max(3, 4 + 2 * (load || 100) / 100)); // домашняя круговая, с поправкой на нагрузку
  return Math.round(met * 3.5 * w / 200 * (sec / 60));
}

const REVIEW_STATE_KEY = 'fitReviewPromptV1';
const REVIEW_MILESTONES = [5, 20, 50];
const REVIEW_MIN_GAP_MS = 90 * 24 * 60 * 60 * 1000;

function reviewPromptState(){
  try{
    const raw = JSON.parse(localStorage.getItem(REVIEW_STATE_KEY) || '{}');
    return {
      attempts: Array.isArray(raw.attempts) ? raw.attempts.filter(x => x && Number(x.at) > 0) : []
    };
  }catch(_){ return {attempts:[]}; }
}

function reviewMilestoneDue(count, now){
  count = Number(count) || 0;
  now = Number(now) || Date.now();
  if(count < REVIEW_MILESTONES[0]) return 0;
  const state = reviewPromptState();
  const used = Math.min(state.attempts.length, REVIEW_MILESTONES.length);
  if(used >= REVIEW_MILESTONES.length) return 0;
  const milestone = REVIEW_MILESTONES[used];
  if(count < milestone) return 0;
  if(used > 0){
    const last = Number(state.attempts[used - 1] && state.attempts[used - 1].at) || 0;
    if(last && now - last < REVIEW_MIN_GAP_MS) return 0;
  }
  return milestone;
}

async function maybeRequestAppReview(count){
  const milestone = reviewMilestoneDue(count);
  if(!milestone || !(window.FitNative && window.FitNative.requestReview)) return false;
  const ok = await window.FitNative.requestReview();
  if(!ok) return false;
  const state = reviewPromptState();
  state.attempts.push({count:Number(count) || milestone, milestone, at:Date.now()});
  state.attempts = state.attempts.slice(0, REVIEW_MILESTONES.length);
  try{ localStorage.setItem(REVIEW_STATE_KEY, JSON.stringify(state)); }catch(_){}
  return true;
}

const QUICK_FINISH_SEC = 30;

// Запись законченной тренировки: история, минуты, серия, достижения, счётчик
// прохождений программы и отчёт тренеру. Для обычной тренировки вызывается сразу,
// для слишком короткой — только когда человек нажал «Засчитать» (или ушёл с экрана).
function commitFinish(ctx){
  const totalSec = ctx.totalSec, srcProgram = ctx.srcProgram;
  const now = ctx.at || Date.now();
  {
    stats.totalSec += totalSec;
    stats.count = (stats.count || 0) + 1;
    if(stats.count === 3) trackProductEvent('workout_3').catch(()=>{});
    else if(stats.count === 5) trackProductEvent('workout_5').catch(()=>{});
    else if(stats.count === 10) trackProductEvent('workout_10').catch(()=>{});
    const histEntry = {
      id: newId(),
      d: localISO(new Date(now)),
      // час НАЧАЛА тренировки: «занимаюсь до работы» — это про то, когда человек встал
      // на коврик, а не когда выключил таймер. Поле новое, у прежних записей его нет.
      t: new Date(now - totalSec * 1000).getHours(),
      pid: (state.current && state.current.sourceId) || null,
      note: clampText($('finNote').value || '', LIM.note), sec: totalSec, kcal: state.lastKcal || 0,
      // Снимок названий нужен истории: программа потом может измениться, а попап дня
      // должен показывать именно то, что человек реально делал тогда.
      exercises: Array.from(new Set((state.steps || []).filter(s => s.phase === 'work')
        .map(s => s.exName || s.title).filter(Boolean))),
      plan: (typeof state.planIdx === 'number') ? state.planIdx : 0,
      // Следующий старт покажет точное «было → сегодня». Раньше история знала
      // только минуты, поэтому после ручной поправки веса прошлую нагрузку уже
      // нельзя было восстановить без догадок.
      load: srcProgram
        ? (Array.isArray(state.startLoad) ? state.startLoad : workoutLoadSnapshot(srcProgram, state.planIdx || 0))
        : null,
      planDays: (()=>{ // подпись варианта, чтобы потом не гадать
        try{
          const pl = normPlans(state.raw)[state.planIdx];
          return (pl && pl.days && pl.days.length) ? pl.days.join('·') : '';
        }catch(e){ return ''; }
      })()
    };
    stats.history.push(histEntry);
    if(stats.history.length > 2000) stats.history = stats.history.slice(-2000);
    state.lastHist = histEntry;
    // Рекорд серии считаем здесь, на единственной записи в историю: он остаётся с
    // человеком навсегда, даже когда серия сгорит. Существующая серия попадёт в рекорд
    // на первой же тренировке — ровно тогда, когда это нужно.
    const stk = calcStreakInfo().n;
    state.lastRecord = stk > 1 && stk > (stats.bestStreak || 0);
    if(stk > (stats.bestStreak || 0)) stats.bestStreak = stk;
    // Суммарный поднятый вес: вес снаряда × нижняя граница повторов у каждого силового
    // подхода. Копим итогом, а не считаем по истории задним числом: в истории лежат
    // минуты и калории, а какие веса стояли в тот день, программа уже не помнит —
    // с тех пор она могла вырасти на пять шагов прогрессии.
    let lifted = 0;
    (state.steps || []).forEach(s => {
      if(s.phase !== 'work' || !(s.weight > 0)) return;
      const reps = parseInt(String(s.reps || '').split('-')[0], 10);
      if(reps > 0) lifted += s.weight * reps;
    });
    if(lifted) stats.totalKg = Math.round((stats.totalKg || 0) + lifted);
    // тренировка без рук: голос или гарнитура — считаем сам факт, не режим
    if(hfMode && hfMode !== 'off') stats.hfDone = (stats.hfDone || 0) + 1;
  }
  renderBadges();
  saveStats();
  syncNativeNotifications();
  renderStats();
  {
    const completedCount = stats.count || 0;
    setTimeout(()=>{ maybeRequestAppReview(completedCount).catch(()=>{}); }, 2500);
  }
  if(srcProgram){
    const p = srcProgram;
    p.stats = p.stats || {completions: 0};
    p.stats.completions++;
    // Прогрессия — состояние у КАЖДОГО упражнения (ex.ps), не общий счётчик
    // программы: иначе при чередовании A/Б упражнение варианта А получало бы
    // +1 шаг за каждую тренировку программы, включая дни варианта Б, и росло
    // бы вдвое быстрее задуманного. Считаем только упражнения СЕГОДНЯШНЕГО
    // варианта — они и есть «реально выполненные».
    // Раньше по достижении порога нагрузка росла сама, без участия человека:
    // вес прибавлялся, даже если предыдущий подход дался тяжело. Теперь порог
    // только открывает ПРОВЕРКУ — она показывается на экране финала
    // (renderProgCheck) и требует явного «Да, повышаем»; отклонённое или
    // непросмотренное упражнение спросит о том же на следующей тренировке.
    state.progCheck = null;
    if(p.progression){
      const every = Math.max(1, +p.progression || 1);
      const pl = normPlans(p)[state.planIdx] || normPlans(p)[0];
      const eligible = [];
      ((pl && pl.exercises) || []).forEach(ex => {
        if(ex.warmup || progAxis(ex) === 'none') return;
        // упражнение, до которого тренировка не дошла (старт с середины), не в счёт
        if(state.reachedEx && !state.reachedEx.has(ex.id) && !state.reachedEx.has(ex.name)) return;
        const ps = ensurePs(ex);
        ps.n++;
        if(ps.n >= every) eligible.push(ex.id);
      });
      // храним id, а не сами объекты: пока открыт экран финала, синхронизация
      // может заменить customPrograms новыми объектами (см. progCheckExercises)
      if(eligible.length) state.progCheck = {pid: p.id, plan: normPlans(p).indexOf(pl), ids: eligible, hard: new Set()};
    }
    // ротация вариантов: следующая тренировка — следующий вариант по очереди
    if(p.rotate){
      const plansN = normPlans(p).length;
      if(plansN > 1){
        const usedIdx = (typeof state.planIdx === 'number') ? state.planIdx : 0;
        p.rotIdx = (usedIdx + 1) % plansN;
      }
    }
    savePrograms();
    // Программа пришла от тренера — он увидит эту тренировку. Отправляем сами и
    // молча: кнопка «отправить отчёт» лежала в меню программы, куда после финала
    // никто не заходит, и поэтому не срабатывала никогда.
    autoReport(p);
  }
  renderMine();
  renderProgCheck();
}

/* ================= ПРОВЕРКА ПРОГРЕССА (экран финала) ================= */
// Заполняется в commitFinish(): упражнения, у которых подошёл порог проверки
// (см. p.progression), и ни одно ещё не отмечено «тяжело».
// Ищем только в том варианте, по которому шла тренировка, и только среди
// основных упражнений: при совпавших id (старые копии упражнений) поиск по всей
// программе находил чужое — например, упражнение из разминки другого варианта.
function progCheckExercises(chk){
  const p = chk && customPrograms.find(x => x.id === chk.pid);
  if(!p) return [];
  const plans = normPlans(p);
  const pl = plans[chk.plan] || plans[0];
  const pool = ((pl && pl.exercises) || []).filter(ex => !ex.warmup);
  return chk.ids.map(id => pool.find(ex => ex.id === id)).filter(Boolean);
}
function renderProgCheck(){
  const chk = state.progCheck;
  const exercises = progCheckExercises(chk);
  const on = exercises.length > 0;
  setShown('finProgCheck', on);
  setShown('finProgCheckList', false);
  if(!on) return;
  setShown('finProgCheckAsk', true);
  setShown('finProgCheckDone', false);
  const box = $('finProgCheckList');
  box.innerHTML = '';
  exercises.forEach(ex => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fpc-chip' + (chk.hard.has(ex.id) ? ' act' : '');
    b.textContent = ex.name || t('common.exerciseFallback');
    // только переключаем отметку: перерисовка всего блока сворачивала список,
    // и второе упражнение уже нельзя было отметить
    b.onclick = () => {
      if(chk.hard.has(ex.id)) chk.hard.delete(ex.id); else chk.hard.add(ex.id);
      b.classList.toggle('act', chk.hard.has(ex.id));
    };
    box.appendChild(b);
  });
}
function toggleProgCheckList(){
  setShown('finProgCheckList', $('finProgCheckList').classList.contains('hidden'));
}
// «Да, повышаем» — шаг применяется всем упражнениям из проверки, кроме
// отмеченных «тяжело»: у них счётчик остаётся на пороге, и тот же вопрос
// вернётся после следующей тренировки, где это упражнение снова встретится.
async function applyProgCheck(){
  const chk = state.progCheck;
  if(!chk) return;
  // сразу снимаем проверку и прячем кнопку: второй быстрый тап не должен
  // добавить ещё один шаг, пока идёт сохранение
  state.progCheck = null;
  setShown('finProgCheckAsk', false);
  setShown('finProgCheckList', false);
  setShown('finProgCheckDone', true);
  progCheckExercises(chk).forEach(ex => {
    if(chk.hard.has(ex.id)) return;
    advanceExerciseProgression(ex);
    ensurePs(ex).n = 0;
  });
  await savePrograms();
}

// Решение по слишком короткой тренировке. keep — засчитать как обычно.
function settleQuickFinish(keep){
  const pending = state.pendingFinish;
  if(!pending) return;
  state.pendingFinish = null;
  setShown('finQuick', false);
  if(keep) commitFinish(pending);
}

function finishWorkout(){
  trackProductEvent('workout_completed').catch(()=>{});
  state.live = false;
  state.workoutSessionId = '';
  clearTimeout(nativeSessionSaveT);
  nativeSessionSaveT = 0;
  if(window.FitNative && window.FitNative.clearWorkoutState) window.FitNative.clearWorkoutState();
  setPause(false);
  stopHandsFree();
  stopSpeech();
  clearSession(); // тренировка пройдена до конца — продолжать больше нечего
  // Заметка на экране результата пишется в state.lastHist. Пока эта тренировка не
  // записана, там не должна висеть запись прошлой — иначе заметка уехала бы в неё.
  state.lastHist = null;
  // то же для проверки прогресса: пока неясно, засчитается ли тренировка
  // (см. quick ниже), блок с предыдущей проверки показывать не должен
  state.progCheck = null;
  renderProgCheck();
  const totalSec = stopGlobal();
  // статистика: общее время + счётчик прохождений программы
  state.lastTotalSec = totalSec;
  state.lastKcal = estimateKcal(totalSec, 100);
  $('finKcal').textContent = '≈' + state.lastKcal;
  // Отключённую программу (progActive(p) === false) запускать можно — предупредили
  // об этом ДО старта (#btnStart) — но раз человек всё равно начал, держим слово:
  // результат нигде не оседает, будто его не было. Финал при этом доигрывает как
  // обычно — это про текущую сессию, а не про то, что сохранится.
  const srcProgram = (state.current && state.current.sourceId)
    ? customPrograms.find(x => x.id === state.current.sourceId) : null;
  const countsToStats = !srcProgram || progActive(srcProgram);
  // Меньше QUICK_FINISH_SEC — похоже на случайное завершение. Такую тренировку НЕ
  // записываем сразу: человек решает на экране результата. Отменять задним числом
  // нельзя — отчёт тренеру к тому моменту уже ушёл бы.
  const quick = countsToStats && totalSec < QUICK_FINISH_SEC;
  state.pendingFinish = quick ? {totalSec, srcProgram, at:Date.now()} : null;
  // сколько разных упражнений пройдено — третья цифра карточки результата (текущая
  // сессия, показываем всегда — это не то, что сохраняется)
  const exNames = new Set();
  (state.steps || []).forEach(s => { if(s.phase === 'work') exNames.add(s.exName || s.title); });
  state.lastExCount = exNames.size;
  $('finExLabel').textContent = storeCountText(exNames.size,'exercise').replace(/^\d+\s+/,'');
  $('finNote').value = '';
  setShown('finNoteField', false);   // заметка снова свёрнута: это не главное на экране
  setShown('finNoteToggle', countsToStats); // нечего комментировать у того, что не сохранится
  if(countsToStats && !quick) commitFinish({totalSec, srcProgram, at:Date.now()});
  else {
    if(quick){
      $('badgeRow').innerHTML = '';    // достижений и рекорда ещё нет — ничего не записано
      setShown('finStreakBox', false);
    } else renderBadges();
    saveStats();
    syncNativeNotifications();
    renderStats();
    renderMine();
  }
  setShown('finQuick', quick);
  // «Отличная работа!» над тремя секундами звучит издёвкой
  $('finTitle').textContent = t(quick ? 'finish.quickHeading' : 'workout.great');
  $('btnAgain').className = quick ? 'btn-secondary' : 'btn-primary';
  $('btnAgain').textContent = t(quick ? 'finish.keep' : 'finish.done');
  releaseWake();
  document.body.classList.remove('phase-rest');
  const m = Math.floor(totalSec/60), s = totalSec%60;
  const timeText = `${m}:${String(s).padStart(2,'0')}`;
  show('scrFinish');
  // Гонг звучит не здесь, а в момент, когда кольцо замкнулось: звук и вспышка
  // обязаны совпасть. Цифры набегают тогда же, когда поднимается карточка, —
  // результат «приходит», а не появляется готовым.
  // При prefers-reduced-motion countUp сразу ставит конечное значение.
  playFinishFx(() => {
    countUp($('finalTime'), totalSec, v => `${Math.floor(v/60)}:${String(Math.round(v%60)).padStart(2,'0')}`, timeText);
    countUp($('finKcal'), state.lastKcal || 0, v => '≈' + Math.round(v), '≈' + (state.lastKcal || 0));
    countUp($('finEx'), state.lastExCount || 0, v => String(Math.round(v)), String(state.lastExCount || 0));
  });
}

/* ================= ШЕРИНГ-КАРТИНКА РЕЗУЛЬТАТА ================= */
function roundRect(x, x0, y0, w, h, r){
  x.beginPath();
  x.moveTo(x0 + r, y0);
  x.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
  x.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
  x.arcTo(x0, y0 + h, x0, y0, r);
  x.arcTo(x0, y0, x0 + w, y0, r);
  x.closePath();
}

async function shareResult(){
  const cs = getComputedStyle(document.body);
  const col = n => cs.getPropertyValue(n).trim();
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  try{
    await document.fonts.load('700 150px Oswald');
    await document.fonts.load('600 44px Oswald');
    await document.fonts.load('500 38px Rubik');
  }catch(e){}

  // фон
  x.fillStyle = col('--bg'); x.fillRect(0, 0, W, H);
  // конфетти
  const colors = [col('--accent'), col('--accent-ink'), col('--rest'), col('--warn')];
  for(let i = 0; i < 46; i++){
    x.save();
    x.globalAlpha = .35 + Math.random() * .5;
    x.fillStyle = colors[i % colors.length];
    x.translate(Math.random() * W, 60 + Math.random() * (H * .5));
    x.rotate(Math.random() * Math.PI);
    x.fillRect(-7, -11, 14, 22);
    x.restore();
  }

  x.textAlign = 'center';
  // бренд
  x.fillStyle = col('--muted');
  x.font = '600 44px Oswald, sans-serif';
  x.fillText('F I T  /  T I M E R', W / 2, 118);
  // заголовок
  x.fillStyle = col('--ink');
  x.font = '500 46px Rubik, sans-serif';
  x.fillText(t('workout.finishedCanvas'), W / 2, 208);

  // разомкнутое кольцо + время
  x.strokeStyle = col('--work');
  x.lineWidth = 26; x.lineCap = 'round';
  x.beginPath();
  x.arc(W / 2, 480, 218, Math.PI * 0.62, Math.PI * 0.38 + Math.PI * 2);
  x.stroke();
  x.fillStyle = col('--ink');
  x.font = '700 150px Oswald, sans-serif';
  x.fillText(fmt(state.lastTotalSec || 0), W / 2, 520);
  x.fillStyle = col('--muted');
  x.font = '500 34px Rubik, sans-serif';
  x.fillText(t('workout.timeFormat'), W / 2, 578);

  // название программы
  x.fillStyle = col('--work');
  x.font = '600 58px Oswald, sans-serif';
  let title = (state.current && state.current.title || '').toUpperCase();
  if(title.length > 22) title = title.slice(0, 21) + '…';
  x.fillText(title, W / 2, 810);

  // чипы статистики
  const streak = calcStreak();
  const chips = [];
  if(state.lastKcal) chips.push(`🔥 ≈${state.lastKcal} ${t('workout.kcal')}`);
  if(streak > 1) chips.push(`⚡ ${streak} ${streakWord(streak, calcStreakInfo().byPlan)}`);
  chips.push(appLocale === 'ru'
    ? `💪 ${stats.count} ${plural(stats.count, 'тренировка', 'тренировки', 'тренировок')}`
    : `💪 ${stats.count} ${stats.count === 1 ? 'workout' : 'workouts'}`);
  x.font = '500 36px Rubik, sans-serif';
  const pad = 34, gap = 20, ch = 84, maxW = W - 80;
  const widths = chips.map(t => Math.min(maxW, x.measureText(t).width + pad * 2));
  // раскладка по рядам, чтобы ничего не уходило за края
  const rows = [[]]; let rowW = 0;
  chips.forEach((t, i) => {
    if(rowW + widths[i] + (rows[rows.length-1].length ? gap : 0) > maxW){ rows.push([]); rowW = 0; }
    rows[rows.length-1].push(i); rowW += widths[i] + gap;
  });
  let cy0 = 880;
  rows.forEach(row => {
    const total = row.reduce((a, i) => a + widths[i], 0) + gap * (row.length - 1);
    let cx0 = (W - total) / 2;
    row.forEach(i => {
      x.strokeStyle = col('--line'); x.lineWidth = 3;
      x.fillStyle = col('--card');
      roundRect(x, cx0, cy0, widths[i], ch, 42);
      x.fill(); x.stroke();
      x.fillStyle = col('--ink');
      x.fillText(chips[i], cx0 + widths[i] / 2, cy0 + ch / 2 + 13);
      cx0 += widths[i] + gap;
    });
    cy0 += ch + 18;
  });

  // дата и подпись
  const now = new Date();
  const dateY = Math.max(1180, cy0 + 60);
  x.fillStyle = col('--muted');
  x.font = '500 36px Rubik, sans-serif';
  x.fillText(new Intl.DateTimeFormat(localeTag(), {day:'numeric',month:'long',year:'numeric'}).format(now), W / 2, dateY);
  x.fillStyle = col('--muted');
  x.font = '600 32px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, dateY + 60);

  c.toBlob(async blob => {
    if(!blob){ appAlert(t('workout.imageError')); return; }
    await shareGeneratedFile(blob, 'fittimer-result.png', t('workout.shareTitle'), t('workout.shareFallback'));
  }, 'image/png');
}

/* ================= ПРАЗДНОВАНИЕ ФИНИША ================= */
// счётчик, который набегает до значения за 700 мс
function countUp(el, to, fmt, finalText){
  if(!el) return;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced || !to){ el.textContent = finalText; return; }
  const t0 = performance.now(), dur = 700;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3); // плавное торможение
    el.textContent = k < 1 ? fmt(to * e) : finalText;
    if(k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ================= ФИНАЛ: «КРУГ ЗАМКНУЛСЯ» =================
   Салют с экрана убран намеренно. Падающие бумажки — чужой праздник: они одинаковы
   для праздника, выигрыша в казино и приседаний, ничего не говорят про
   тренировку и на телефоне читаются как открытка из нулевых.
   Теперь у экрана один смысловой момент. Искры со всего экрана по спирали
   стягиваются к медали — это собранная за тренировку работа возвращается к
   человеку, — и кольцо вокруг медали замыкается ровно по числу долетевших искр.
   Круг сомкнулся: вспышка, гонг, короткая вибрация, и только ПОСЛЕ этого
   поднимается карточка результата и набегают цифры. Порядок здесь и есть эффект:
   когда всё появляется разом, «вау» просто негде случиться.
   Технически — один canvas поверх экрана. Хвосты искр получаются не заливкой фона,
   а вычитанием уже нарисованного (destination-out): под ними остаётся живой фон
   экрана, а не серая плёнка. В тёмной теме искры складываются светом (lighter),
   в светлой — обычным наложением: сложение на белом фоне невидимо.
   Долететь искры обязаны при любом раскладе: если вкладка ушла в фон и кадры не
   рисуются, сторожевой таймер сам достраивает финал — экран результата не может
   остаться пустым из-за анимации. */
const FIN_RING_C = 2 * Math.PI * 55;   // длина кольца в координатах viewBox
let finFxRaf = 0, finFxTimers = [];

// доля замкнутого кольца: она же управляет яркостью и размером медали через --p
function setFinRing(p){
  const arc = $('finArc'), head = $('finHead'), crest = $('finCrest');
  if(arc) arc.style.strokeDashoffset = String(FIN_RING_C * (1 - p));
  if(head) head.style.transform = `rotate(${360 * p}deg)`;
  if(crest) crest.style.setProperty('--p', String(p));
}

// смена экрана гасит эффект: раньше конфетти с финала продолжало сыпаться поверх
// статистики и календаря
function stopFinishFx(){
  if(finFxRaf) cancelAnimationFrame(finFxRaf);
  finFxRaf = 0;
  finFxTimers.forEach(clearTimeout);
  finFxTimers = [];
  const c = $('finFx');
  if(c){
    c.style.opacity = '';
    if(c.getContext) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
  const sc = $('scrFinish');
  if(sc) sc.classList.remove('fin-arm', 'fin-play', 'fin-go', 'fin-lit');
  setFinRing(1);
}

// #RRGGBB + прозрачность: цвета берём из переменных темы, а рисовать нужно с альфой
function hexA(hex, a){
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
  if(!m) return `rgba(124,86,245,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// after() вызывается ровно один раз — в момент, когда карточке пора подниматься
function playFinishFx(after){
  const sc = $('scrFinish'), c = $('finFx'), crest = $('finCrest');
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  stopFinishFx();
  let handed = false;
  const hand = () => { if(handed) return; handed = true; sc.classList.add('fin-go'); after(); };
  if(reduced || !sc || !c || !c.getContext || !crest){
    setFinRing(1);
    if(sc) sc.classList.add('fin-arm', 'fin-lit');
    fanfare();
    hand();
    return;
  }
  sc.classList.add('fin-arm', 'fin-play');
  setFinRing(0);
  c.style.opacity = '';

  // координаты считаем во вьюпорте: холст растянут на весь экран, а не по колонке
  const W = Math.max(1, Math.round(window.innerWidth)), H = Math.max(1, Math.round(window.innerHeight));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cr = crest.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;
  const ringR = cr.width * 55 / 120;                       // радиус кольца в пикселях
  const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 40;

  const cs = getComputedStyle(document.body);
  const cvar = n => cs.getPropertyValue(n).trim();
  const light = document.body.classList.contains('light');
  const tint = [cvar('--accent-ink') || '#B7A0FF', cvar('--rest') || '#3FD3E6', cvar('--accent') || '#7C56F5'];

  const N = 56;
  const motes = [];
  for(let i = 0; i < N; i++){
    motes.push({
      a0: Math.random() * Math.PI * 2,
      r0: far * (0.6 + Math.random() * 0.5),
      spin: (Math.random() < .5 ? -1 : 1) * (0.6 + Math.random() * 0.9), // закрутка спирали
      t0: 20 + (i / N) * 430 + Math.random() * 90,
      dur: 420 + Math.random() * 280,
      w: 1 + Math.random() * 1.7,
      col: tint[i % tint.length],
      px: 0, py: 0, on: false, done: false
    });
  }

  const waves = [];
  const T0 = performance.now();
  let arrived = 0, bloomAt = 0;

  const frame = now => {
    finFxRaf = 0;
    const t = now - T0;
    // хвосты: подтираем нарисованное раньше, фон экрана при этом не трогаем
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = 'rgba(0,0,0,.16)';
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = light ? 'source-over' : 'lighter';
    x.lineCap = 'round';

    motes.forEach(m => {
      if(m.done) return;
      const k = (t - m.t0) / m.dur;
      if(k < 0) return;
      if(k >= 1){ m.done = true; arrived++; return; }
      const e = Math.pow(k, 1.7);                          // разгон к центру
      const a = m.a0 + m.spin * e;
      const r = m.r0 + (ringR - m.r0) * e;
      const nx = cx + Math.cos(a) * r, ny = cy + Math.sin(a) * r;
      if(m.on){
        const al = (light ? .3 : .2) + .55 * k;
        x.strokeStyle = hexA(m.col, al * .3);              // мягкое свечение
        x.lineWidth = m.w * 3.4;
        x.beginPath(); x.moveTo(m.px, m.py); x.lineTo(nx, ny); x.stroke();
        x.strokeStyle = hexA(m.col, al);                   // сама искра
        x.lineWidth = m.w;
        x.beginPath(); x.moveTo(m.px, m.py); x.lineTo(nx, ny); x.stroke();
      }
      m.px = nx; m.py = ny; m.on = true;
    });

    if(!bloomAt) setFinRing(Math.min(1, arrived / N));

    if(!bloomAt && arrived >= N){
      bloomAt = now;
      setFinRing(1);
      sc.classList.remove('fin-play');
      sc.classList.add('fin-lit');
      haptic([0, 16, 70, 26]);
      fanfare();
      waves.push({t0: now, dur: 820}, {t0: now + 140, dur: 820});
      finFxTimers.push(setTimeout(hand, 180));
    }

    waves.forEach(w => {
      const k = (now - w.t0) / w.dur;
      if(k < 0 || k > 1) return;
      const r = ringR * (0.9 + 5.2 * (1 - Math.pow(1 - k, 2)));
      x.strokeStyle = hexA(tint[0], (1 - k) * (light ? .22 : .3));
      x.lineWidth = 1.5 + 4 * (1 - k);
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    });

    // Следы гасим прозрачностью самого холста, а не обрывом. Вычитание
    // (destination-out) до нуля не доходит: альфа в 8 битах округляется и на
    // последних единицах застревает, поэтому бледные дорожки оставались висеть,
    // а clearRect в конце срезал их разом — заметный щелчок. Кривая S-образная:
    // и начало, и конец затухания без излома.
    if(bloomAt){
      const f = (now - bloomAt - 450) / 1000;
      if(f >= 1){ c.style.opacity = ''; x.clearRect(0, 0, W, H); return; }
      if(f > 0) c.style.opacity = String(1 - f * f * (3 - 2 * f));
    }
    finFxRaf = requestAnimationFrame(frame);
  };
  finFxRaf = requestAnimationFrame(frame);
  // вкладка в фоне — кадров нет; результат всё равно обязан появиться
  finFxTimers.push(setTimeout(() => {
    if(handed) return;
    setFinRing(1);
    sc.classList.remove('fin-play');
    sc.classList.add('fin-lit');
    hand();
  }, 3200));
}

/* ---- достижения ----
   Названия ни к кому не привязаны: приложением пользуются и женщины, и мужчины, а
   «Железная леди» и «Несокрушимая» доставались обоим. Критерии тоже разведены —
   счётчик, время, серия, план и разнообразие: десять достижений, открывающихся одним
   и тем же способом, ничего не значат.
   Полученное достижение больше не отбирают: раньше список считался каждый раз заново
   по test(), и «Серия» пропадала вместе с прерванной серией — человек буквально терял
   уже заработанное. Теперь всё собранное копится в stats.badges. */
/* Оснований у достижения должно быть столько же, сколько самих достижений: из
   прежних семнадцати тринадцать отличались только числом (шесть раз «сколько
   тренировок», четыре «сколько подряд», три «сколько часов»), и в статистике это
   читалось как одна плашка, размноженная множителем. Теперь двадцать две штуки на
   восемнадцати разных основаниях: количество, суммарное время, закрытая неделя,
   серия, личный рекорд серии, длина одной тренировки, разнообразие программ,
   возвращение после перерыва, взятый потолок прогрессии, ведение веса, фото-прогресс,
   самочувствие, заметки, раннее утро, суммарный поднятый вес, тренировка без рук,
   второй профиль и срок, за который человек не бросил.
   Формулировки не привязаны к полу: приложением пользуются и женщины, и мужчины.
   desc бывает функцией — см. badgeDesc(): «Личный рекорд» обязан показывать нынешний
   рекорд, а не застывшее число того дня, когда плашка выдалась. */
function activeWeekStreak(history){
  const weeks = new Set();
  (history || []).forEach(h => {
    if(!h || !h.d) return;
    const d = new Date(h.d + 'T12:00:00');
    if(isNaN(d)) return;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    weeks.add(localISO(monday));
  });
  const sorted = [...weeks].sort();
  let best = 0, cur = 0, prev = null;
  sorted.forEach(iso => {
    const d = new Date(iso + 'T12:00:00');
    if(prev){
      const days = Math.round((d - prev) / 86400000);
      cur = days === 7 ? cur + 1 : 1;
    } else cur = 1;
    if(cur > best) best = cur;
    prev = d;
  });
  return best;
}

const BADGES = [
  {id: 'first', ico: 'sprout',   name: 'Первый шаг',          desc: 'Первая тренировка',                  test: () => (stats.count || 0) >= 1},
  {id: 'h1',    ico: 'clock',    name: 'Первый час',          desc: 'Час тренировок в сумме',             test: () => (stats.totalSec || 0) >= 3600},
  // ведение тела: цифры на весах — половина работы, и её тоже стоит замечать
  {id: 'body',  ico: 'chart',    name: 'Под наблюдением',     desc: '4 записи веса или замеров',          test: () => (stats.weights || []).length >= 4},
  {id: 'notes', ico: 'book',     name: 'Дневник',             desc: 'Заметка после тренировки',           test: () => (stats.history || []).some(h => (h.note || '').trim())},
  {id: 't5',    ico: 'bolt',     name: 'Первые пять',         desc: '5 тренировок',                       test: () => (stats.count || 0) >= 5},
  {id: 't10',   ico: 'dumbbell', name: 'В ритме',             desc: '10 тренировок',                      test: () => (stats.count || 0) >= 10},
  {id: 'wk',    ico: 'calendar', name: 'Неделя по плану',     desc: 'Все тренировки недели закрыты',      test: () => { const w = weekPlanInfo(); return w.plannedTotal > 0 && w.doneTotal >= w.plannedTotal; }},
  {id: 'ph2',   ico: 'camera',   name: 'Было и стало',        desc: 'Два снимка прогресса',               test: () => (photos || []).length >= 2},
  // час НАЧАЛА тренировки пишется в историю с этого обновления: у старых записей
  // поля нет вовсе, и они просто не участвуют в проверке
  {id: 'early', ico: 'sparkle',  name: 'Раннее утро',         desc: 'Тренировка начата до 7 утра',        test: () => (stats.history || []).some(h => h.t != null && h.t < 7)},
  {id: 'hands', ico: 'mic',      name: 'Без рук',             desc: 'Тренировка с голосом или гарнитурой', test: () => (stats.hfDone || 0) >= 1},
  {id: 'long',  ico: 'shield',   name: 'Долгая тренировка',   desc: 'Одна тренировка на 45 минут',        test: () => (stats.history || []).some(h => (h.sec || 0) >= 2700)},
  {id: 's7',    ico: 'flame',    name: 'Серия',               desc: '7 тренировок подряд по плану',       test: () => calcStreak() >= 7},
  // Рекорд не выдаётся один раз с застывшим числом: он живёт вместе с stats.bestStreak
  // и на следующем рекорде сам покажет новую цифру, не заводя второй плашки.
  {id: 'record', ico: 'medal',   name: 'Личный рекорд',
   // пока не выдано — это цель («серия из трёх»), после — нынешний рекорд. Иначе
   // строка «следующее достижение» обещала бы «лучшая серия: 0 подряд»
   desc: () => { const n = stats.bestStreak || 0;
     return n >= 3 ? `Лучшая серия: ${n} ${plural(n, 'тренировка', 'тренировки', 'тренировок')} подряд`
                   : 'Серия из 3 тренировок подряд'; },
   test: () => (stats.bestStreak || 0) >= 3},
  {id: 'well',  ico: 'heart',    name: 'Слушаю себя',         desc: '7 записей самочувствия',             test: () => (stats.wellness || []).length >= 7},
  {id: 'var3',  ico: 'grip',     name: 'Разные тренировки',   desc: 'Пройдены 3 разные программы',        test: () => new Set((stats.history || []).map(h => h.pid).filter(Boolean)).size >= 3},
  {id: 'duo',   ico: 'user',     name: 'Не в одиночку',       desc: 'Второй профиль на устройстве',       test: () => (users || []).length >= 2},
  // не «сколько всего», а «как давно не бросил»: три разных месяца в истории
  {id: 'month', ico: 'calendar', name: 'Четыре недели',       desc: 'Тренировки 4 недели подряд',         test: () => activeWeekStreak(stats.history) >= 4},
  {id: 'season', ico: 'target',  name: 'Три месяца',          desc: 'Тренировки в трёх разных месяцах',   test: () => new Set((stats.history || []).map(h => (h.d || '').slice(0, 7)).filter(Boolean)).size >= 3},
  // Возвращение после перерыва — то, за что стоит хвалить сильнее всего: бросить
  // проще, чем начать заново. Считаем разрыв между соседними тренировками: если он
  // был две недели и после него есть ещё одна — человек вернулся.
  {id: 'back',  ico: 'rocket',   name: 'Возвращение',         desc: 'Снова в деле после перерыва в две недели', test: () => {
    const ds = [...new Set((stats.history || []).map(h => h.d).filter(Boolean))].sort();
    for(let i = 1; i < ds.length; i++){
      if((new Date(ds[i]) - new Date(ds[i - 1])) / 86400000 >= 14) return true;
    }
    return false;
  }},
  // Взятый потолок — единственное достижение про саму нагрузку, а не про регулярность.
  // Ровно та механика, которой приложение отличается от соседей по полке.
  {id: 'heavy', ico: 'bolt',     name: 'Тяжелее',             desc: 'Упражнение доросло до потолка прогрессии', test: () => {
    try{
      return (customPrograms || []).some(p =>
        normPlans(p).some(pl => (pl.exercises || []).some(ex => !ex.warmup && progAtCeiling(p.id, ex, p))));
    }catch(e){ return false; }
  }},
  // тоннаж копится с этого обновления (stats.totalKg): по истории его не восстановить
  {id: 'tons',  ico: 'weight',   name: 'Десять тонн',         desc: '10 000 кг поднято за всё время',     test: () => (stats.totalKg || 0) >= 10000},
  {id: 'h24',   ico: 'gem',      name: 'Сутки в движении',    desc: '24 часа тренировок в сумме',         test: () => (stats.totalSec || 0) >= 86400},
  {id: 's30',   ico: 'crown',    name: 'Месяц без пропусков', desc: '30 тренировок подряд по плану',      test: () => calcStreak() >= 30},
  {id: 't100',  ico: 'trophy',   name: 'Сотня',               desc: '100 тренировок',                     test: () => (stats.count || 0) >= 100}
];
// набор достижений менялся — собранное чистим от исчезнувших, иначе счётчик
// «N из M» показывал бы больше собранного, чем достижений вообще существует
function pruneBadges(){
  if(!Array.isArray(stats.badges)) return false;
  const live = new Set(BADGES.map(b => b.id));
  const kept = stats.badges.filter(id => live.has(id));
  if(kept.length === stats.badges.length) return false;
  stats.badges = kept;
  return true;
}
// собранное копится и не отбирается обратно; возвращает список только что полученных
function earnBadges(){
  if(!Array.isArray(stats.badges)) stats.badges = [];
  pruneBadges();
  const fresh = BADGES.filter(b => !stats.badges.includes(b.id) && b.test()).map(b => b.id);
  if(fresh.length) stats.badges = stats.badges.concat(fresh);
  return fresh;
}
const hasBadge = id => Array.isArray(stats.badges) && stats.badges.includes(id);
// за что выдано. У большинства это постоянная строка, но «Личный рекорд» обязан
// говорить нынешнее число: плашка одна, а рекорд с человеком растёт.
const badgeName = b => t('badge.' + b.id + '.name');
const badgeDesc = b => {
  if(b.id === 'record'){
    const n = stats.bestStreak || 0;
    if(n >= 3){
      const workouts = appLocale === 'ru'
        ? plural(n,t('calendar.workoutOne'),t('calendar.workoutFew'),t('calendar.workoutMany'))
        : t(n === 1 ? 'calendar.workoutOne' : 'calendar.workoutFew');
      return t('badge.recordBest',{count:n,workouts});
    }
  }
  return t('badge.' + b.id + '.desc');
};

function renderBadges(){
  const fresh = earnBadges();
  let toShow = BADGES.filter(b => fresh.includes(b.id));
  if(!toShow.length){
    const earned = BADGES.filter(b => hasBadge(b.id));
    if(earned.length) toShow = [earned[earned.length - 1]];
  }
  $('badgeRow').innerHTML = toShow.map(b =>
    `<div class="badge${fresh.includes(b.id) ? ' new' : ''}">
       <span class="b-ico">${icon(b.ico)}</span>
       <div class="b-txt"><b>${badgeName(b)}</b><small>${fresh.includes(b.id) ? t('badge.new') : badgeDesc(b)}</small></div>
     </div>`
  ).join('');
  const si = calcStreakInfo();
  if(si.n > 1){
    $('finStreak').textContent = si.n;
    // личный рекорд называем рекордом: это сильнее любого числа рядом с «подряд»
    $('finStreakWord').textContent = state.lastRecord ? t('badge.personalRecord')
      : (si.byPlan ? t('badge.streakPlan') : t('badge.streakDays'));
    setShown('finStreakBox', true);
  } else setShown('finStreakBox', false);
}

// спрашиваем, сохранить ли место, и уходим согласно выбору
function exitWorkout(){
  const steps = state.steps || [];
  const done = steps.slice(0, state.stepIdx).filter(s => s.phase === 'work').length;
  const all = steps.filter(s => s.phase === 'work').length;
  $('exitProgress').textContent = all
    ? t('workout.exitProgress',{done,all})
    : '';
  $('exitModal').classList.add('open');
}

// общая часть выхода: гасим всё, что работает во время тренировки
function tearDownWorkout(){
  state.live = false;
  state.workoutSessionId = '';
  clearTimeout(nativeSessionSaveT);
  nativeSessionSaveT = 0;
  if(window.FitNative && window.FitNative.clearWorkoutState) window.FitNative.clearWorkoutState();
  setPause(false);
  stopHandsFree();
  stopSpeech();
  if(state.prepTimer){ clearInterval(state.prepTimer); state.prepTimer = null; }
  document.body.classList.remove('prep-on');
  $('prepOverlay').classList.remove('on');
  clearStepTimer(); stopGlobal(); releaseWake();
  document.body.classList.remove('phase-rest');
  goTab('scrMenu');
}

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
// В браузере оставляем только ближайшее напоминание для явно заданного времени.
// В native всю очередь строит единый менеджер ниже; второй web Notification там был
// бы дублем системного уведомления.
const notifiedKeys = new Set();
async function showNotification(title, body){
  try{ new Notification(title, {body, tag:'fittimer'}); }catch(e){}
}
function checkSchedules(){
  if(document.hidden) return;
  if(window.FitNative && window.FitNative.isNative) return;
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
  return AppBaseNotifications.limitCandidates(items,{
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
  // Закрыть попап, внутри которого стоит кнопка. История навигации остаётся
  // за существующим MutationObserver; UI Core отвечает только за DOM-механику.
  closeModal: btn => {
    const m = AppBaseUI.closestModal(btn);
    AppBaseUI.closeModal(m);
  }
};
AppBaseUI.bindActions(document, ACTIONS);
// Клик мимо карточки — по затемнению, а не по самой карточке: e.target совпадает
// с попапом, только когда попали в подложку. #dlg решает это сам (appDialog ждёт
// свой промис), неотменяемые (data-locked="1") гасит dismissTopModal.
document.addEventListener('click', e => {
  const m = e.target;
  if(m.id !== 'dlg' && m.classList.contains('modal') && m.classList.contains('open')) dismissTopModal();
});

/* ================= СОБЫТИЯ ================= */
$('startMore').innerHTML = icon('more');
$('startMore').onclick = e => { e.stopPropagation(); toggleMenu($('startMenu')); };
$('progDescMore').onclick = ()=>{
  const box = $('progDescBox'), open = !box.classList.contains('open');
  box.classList.toggle('open', open);
  $('progDescMore').textContent = open ? t('common.collapse') : t('builder.showFull');
};
$('btnStart').onclick = async ()=>{
  // Отключённая программа не запрещена (её всё ещё можно запустить), но результат
  // нигде не осядет (см. countsToStats в finishWorkout) — предупреждаем ДО модалки
  // выбора способа, а не после сорока минут тренировки.
  if(!progActive(state.raw)){
    const go = await appConfirm(
      t('programs.disabledStart'),
      {okText: t('programs.startAnyway')}
    );
    if(!go) return;
  }
  const selectedPlanIdx = state.planIdx;
  state.current = customToProgram(state.raw, selectedPlanIdx);
  const sess = await sessionForProgram(state.raw.id);
  const planCount = normPlans(state.raw).length;
  const sessionPlanIdx = sess && planCount
    ? Math.min(Math.max(0, parseInt(sess.planIdx) || 0), planCount - 1)
    : selectedPlanIdx;
  state.startLoad = sess && Array.isArray(sess.load)
    ? sess.load
    : workoutLoadSnapshot(state.raw, sess ? sessionPlanIdx : selectedPlanIdx);
  // Для сводки незавершённой тренировки шаги нужно считать из того же варианта,
  // в котором она была сохранена. Сам экран программы при этом остаётся на варианте,
  // выбранном сейчас (например, на сегодняшнем дне).
  const selectedCurrent = state.current;
  if(sess) state.current = customToProgram(state.raw, sessionPlanIdx);
  const steps = buildSteps();
  state.current = selectedCurrent;
  setShown('startResume', !!sess);
  if(sess){
    const workDone = steps.slice(0, sess.stepIdx).filter(s => s.phase === 'work').length;
    const workAll = steps.filter(s => s.phase === 'work').length;
    $('startResumeSub').textContent =
      t('workout.resumeSummary',{done:workDone,all:workAll,age:sessionAgeText(sess.at)});
  }
  window.__pendingSession = sess ? {...sess, planIdx:sessionPlanIdx} : null;
  $('startModal').classList.add('open');
};
$('startModal').onclick = e => { if(e.target === $('startModal')) $('startModal').classList.remove('open'); };

async function resumeWorkoutFromNativeNotification(){
  // Warm process: the real workout engine is still alive. Do not rebuild the step or
  // restart its timer; simply return to the existing workout screen.
  if(state.live && state.steps && state.steps.length){
    show('scrWork');
    window.scrollTo(0, 0);
    return true;
  }

  const s = await loadSession();
  if(!s){
    if(window.FitNative && window.FitNative.clearWorkoutState) window.FitNative.clearWorkoutState();
    return false;
  }
  const p = customPrograms.find(x => x && x.id === s.pid);
  if(!p){
    await clearSession();
    if(window.FitNative && window.FitNative.clearWorkoutState) window.FitNative.clearWorkoutState();
    return false;
  }

  const plans = normPlans(p);
  const planIdx = plans.length
    ? Math.min(Math.max(0, parseInt(s.planIdx) || 0), plans.length - 1)
    : 0;
  state.raw = p;
  state.planIdx = planIdx;
  state.current = customToProgram(p, planIdx);
  state.startLoad = Array.isArray(s.load) ? s.load : workoutLoadSnapshot(p, planIdx);

  // Rebuild once to decide what should have happened while the WebView was dead.
  // We advance at most one step: only the timer that was already running had a native
  // deadline; the following step never started while JavaScript was gone.
  const preview = buildSteps();
  let stepIdx = Math.min(Math.max(0, parseInt(s.stepIdx) || 0), Math.max(0, preview.length - 1));
  let resumeDeadline = 0;
  const savedDeadline = Math.max(0, Number(s.stepDeadline) || 0);
  if(s.paused && Number(s.remaining) > 0){
    resumeDeadline = Date.now() + Math.max(1, Number(s.remaining)) * 1000;
  } else if(savedDeadline > 0){
    if(savedDeadline <= Date.now() && stepIdx < preview.length - 1) stepIdx++;
    else if(savedDeadline > Date.now()) resumeDeadline = savedDeadline;
  }

  startWorkout(stepIdx, s.elapsed, {skipPrep:true, resumeDeadline, sessionId:s.sessionId});
  return true;
}

$('startResume').onclick = ()=>{
  const s = window.__pendingSession;
  $('startModal').classList.remove('open');
  if(!s){ startWorkout(); return; }
  // stepIdx имеет смысл только внутри того варианта, где сессия была сохранена.
  // Сначала восстанавливаем вариант, затем строим его шаги в startWorkout().
  state.planIdx = s.planIdx;
  state.current = customToProgram(state.raw, state.planIdx);
  startWorkout(s.stepIdx, s.elapsed, {sessionId:s.sessionId});
};
$('startFresh').onclick = async ()=>{
  $('startModal').classList.remove('open');
  await clearSession();
  startWorkout();
};
$('startPick').onclick = ()=>{
  $('startModal').classList.remove('open');
  // временно собираем шаги, чтобы показать список упражнений
  state.steps = buildSteps();
  const list = $('pickList');
  list.innerHTML = '';
  workStepChoices().forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick-item';
    b.innerHTML = '<b></b>' + (c.meta ? `<small>${c.meta}</small>` : '');
    b.querySelector('b').textContent = c.label;
    b.onclick = async ()=>{
      $('pickStepModal').classList.remove('open');
      await clearSession();
      startWorkout(c.idx, 0);
    };
    list.appendChild(b);
  });
  $('pickStepModal').classList.add('open');
};
$('pickStepModal').onclick = e => { if(e.target === $('pickStepModal')) $('pickStepModal').classList.remove('open'); };
$('startBackTop').onclick = ()=> goTab(startFrom);
$('btnDone').onclick  = ()=>{ initAudio(); beep(990,.1); nextStep(); };
$('btnSkip').onclick  = nextStep;
$('btnPrev').onclick  = prevStep;
$('btnPrev').innerHTML = icon('chevL');
$('swapBadgeIcon').innerHTML = icon('chart'); // растущая кривая — «пора поднять планку»
$('btnExit').onclick  = exitWorkout;
$('exitModal').onclick = e => { if(e.target === $('exitModal')) $('exitModal').classList.remove('open'); };
$('exitSave').onclick = async ()=>{
  $('exitModal').classList.remove('open');
  await saveSession();
  tearDownWorkout();
  if(typeof syncNativeNotifications === 'function') syncNativeNotifications();
  appAlert(t('workout.sessionSaved'));
};
$('exitDrop').onclick = async ()=>{
  $('exitModal').classList.remove('open');
  await clearSession();
  tearDownWorkout();
};
$('btnPause').onclick = ()=> setPause(!state.paused);
/* ================= НАСТРОЙКИ =================
   Отдельный корневой экран без кнопки «Сохранить»: всё применяется сразу, поэтому
   внизу остаётся только док, а не вторая закреплённая полоса. */
const NOTIFICATION_PREFS_KEY = 'fitNotificationPrefsV1';
const NOTIFICATION_PREF_DEFAULTS = Object.freeze({
  workouts:true,
  trainer:true,
  progress:true,
  offers:true,
  emailNews:false,
  emailOffers:false
});
const notificationPreferenceStore = AppBaseNotifications.createPreferenceStore({
  key:NOTIFICATION_PREFS_KEY,
  defaults:NOTIFICATION_PREF_DEFAULTS,
  storage:localStorage
});
function getNotificationPrefs(){ return notificationPreferenceStore.get(); }
function syncNotificationSettings(){
  const prefs = getNotificationPrefs();
  const ids = {
    workouts:'notifWorkouts',
    trainer:'notifTrainer',
    progress:'notifProgress',
    offers:'notifOffers',
    emailNews:'emailNews',
    emailOffers:'emailOffers'
  };
  Object.keys(ids).forEach(key => {
    const btn = $(ids[key]);
    if(!btn) return;
    const on = prefs[key] !== false;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
async function persistNotificationPrefs(prefs){
  try{ notificationPreferenceStore.set(prefs); }catch(_){}
  // Настройки относятся ко всему аккаунту, а не к отдельному профилю.
  // localStorage — быстрый локальный кэш; авторитетная копия для вошедшего аккаунта.
  try{
    if(account && account.email && typeof readAccountBucket === 'function'){
      const rec = await readAccountBucket();
      rec.bucket.notificationPrefs = Object.assign({}, NOTIFICATION_PREF_DEFAULTS, prefs);
      if(typeof bumpAccountMeta === 'function') bumpAccountMeta(rec.bucket, 'notificationPrefs');
      await writeAccountBucket(rec);
      if(typeof syncNotificationPrefsServer === 'function') syncNotificationPrefsServer('push').catch(()=>{});
      if(typeof queueAccountSync === 'function' && isPremium()) queueAccountSync();
    }
  }catch(_){}
}

async function setNotificationPref(key, value){
  const prefs = getNotificationPrefs();
  prefs[key] = !!value;
  await persistNotificationPrefs(prefs);
  syncNotificationSettings();
  if(['workouts','trainer','progress','offers'].includes(key) && value
    && window.FitNative && window.FitNative.requestNotifications){
    let granted = false;
    try{ granted = await window.FitNative.requestNotifications(); }catch(_){}
    if(!granted){
      prefs[key] = false;
      await persistNotificationPrefs(prefs);
      syncNotificationSettings();
      appAlert(t('notify.permissionDenied'));
      return;
    }
  }
  if(['workouts','trainer','progress','offers'].includes(key)
    && typeof syncNativeNotifications === 'function') syncNativeNotifications();
  if(['trainer','progress','offers'].includes(key)){
    if(value) syncRemotePushRegistration(true).catch(()=>{});
    else if(getNotificationPrefs().trainer===false&&getNotificationPrefs().progress===false&&getNotificationPrefs().offers===false) unregisterRemotePushServer().catch(()=>{});
  }
}
async function syncRemotePushRegistration(requestPermission){
  if(!(window.FitNative&&window.FitNative.registerRemotePush)||!account||!account.email||!account.syncToken)return false;
  const p=getNotificationPrefs(); if(p.trainer===false&&p.progress===false&&p.offers===false)return false;
  return window.FitNative.registerRemotePush(!!requestPermission);
}
async function unregisterRemotePushServer(){
  if(!account||!account.email||!account.syncToken)return;
  const deviceId=await kvGet('deviceId'); if(!deviceId)return;
  try{await apiPost('/api/auth',{action:'push_device',email:account.email,deviceId,syncToken:account.syncToken,enabled:false});}catch(_){}
}
window.addEventListener('fitRemotePushToken',async e=>{
  const d=(e&&e.detail)||{};if(!d.token||!account||!account.email||!account.syncToken)return;
  let deviceId=await kvGet('deviceId');if(!deviceId){deviceId=newId();await kvSet('deviceId',deviceId);}
  try{await apiPost('/api/auth',{action:'push_device',email:account.email,deviceId,syncToken:account.syncToken,token:d.token,platform:d.platform,enabled:true});}catch(_){}
});
function syncSettingsForm(){
  // Настройки ИИ находятся в серверной админке; пользовательских ключей больше нет.
  syncNotificationSettings();
}
window.addEventListener('fitNotificationAction', e => {
  const n = e && e.detail && e.detail.notification;
  const extra = (n && n.extra) || (n && n.data) || (e && e.detail && e.detail.extra) || {};
  (async()=>{
    if(!account||!account.email||!account.syncToken)return;
    const deviceId=await kvGet('deviceId');if(!deviceId)return;
    try{await apiPost('/api/auth',{action:'notification_event',email:account.email,deviceId,
      syncToken:account.syncToken,event:'open',stage:String(extra.stage||extra.kind||'unknown')});}catch(_){}
  })();
  if(extra.stage === 'premium'){
    if(typeof openPremium === 'function') openPremium();
    return;
  }
  if(extra.stage === 'catalog-status'){
    goTab('scrTrainer');
    return;
  }
  if(extra.stage === 'trainer-program' && extra.linkId){
    if(typeof importProgramLink === 'function') importProgramLink(String(extra.linkId));
    return;
  }
  if(Array.isArray(extra.programIds) && extra.programIds.length){
    goTab('scrMenu');
    return;
  }
  if(extra.programId){
    const p = customPrograms.find(x => x && x.id === extra.programId);
    if(p){
      if(typeof openProgram === 'function') openProgram(p.id);
      else goTab('scrPrograms');
    }
  }
});
let settingsSaveT = 0;
function saveSettingsSoon(){
  clearTimeout(settingsSaveT);
  settingsSaveT = setTimeout(()=> saveUsers(), 350);
}
// Отсчёты живут в черновике профиля и уезжают в него по «Сохранить» — как имя и
// возраст. Раньше они правили текущего пользователя на лету прямо из настроек.
function readTimings(){
  if(!uDraft) return;
  const num = (id, def, lo, hi) => {
    const v = parseInt($(id).value);
    return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
  };
  uDraft.prepSec = num('uePrepSec', 5, 0, 30);
  uDraft.readySec = num('ueReadySec', 5, 0, 30);
  uDraft.sideSec = num('ueSideSec', 10, 3, 60);
}
async function nativeVoiceReady(){
  if(!(window.FitNative && window.FitNative.offlineVoice)) return !!SR;
  const s = await window.FitNative.getVoiceModelStatus(recognitionLang);
  return !!(s && s.installed);
}

async function chooseHandsFree(mode){
  if(mode === 'voice'){
    if(!(window.FitNative && window.FitNative.offlineVoice) && !SR){
      appAlert(t('handsfree.unavailable'));
      return false;
    }
    if(window.FitNative && window.FitNative.offlineVoice && !(await nativeVoiceReady())){
      await refreshVoicePackUI();
      appAlert(t('handsfree.packFirst'));
      return false;
    }
  }
  setHfMode(mode);
  if(mode === 'voice' && (await kvGet('voiceHint')) !== '1'){
    kvSet('voiceHint', '1');
    appAlert(t((window.FitNative && window.FitNative.offlineVoice) ? 'handsfree.readyNative' : 'handsfree.readyWeb'));
  }
  return true;
}

document.querySelectorAll('#ueLocaleSeg button').forEach(b => {
  b.onclick = async ()=>{
    const pref = normalizeLocalePreference(b.dataset.locale);
    if(uDraft) uDraft.locale = pref;
    syncUserForm();
    // Редактирование чужого профиля не должно внезапно переводить текущий интерфейс.
    if(!uDraft || uDraft.id !== currentUser) return;
    await setAppLocale(pref, {persist:false});
    await syncAccountLocale(appLocale);
    if((await kvGet('recognitionLangManual')) !== '1'){
      recognitionLang = appLocale;
      await kvSet('recognitionLang', recognitionLang);
      if(hfMode === 'voice') setHfMode('off');
      await refreshVoicePackUI();
    }
    syncHandsFreeUI();
    syncUserForm();
  };
});
window.addEventListener('appLocaleChanged', async ()=>{
  syncTtsLocaleToApp(true);
  syncHandsFreeUI();
  if(account && account.email) syncAccountLocale(appLocale);
  // Статический текст меняет applyI18n(), динамические карточки надо собрать заново.
  if(ROOT_TABS.includes(show._last)) prepTab(show._last);
  else if(show._last === 'scrStore'){
    await loadStoreServer();
    renderStoreFilters(); renderStore();
  } else if(show._last === 'scrStoreItem' && siItem){
    const id = siItem.id;
    await loadStoreServer();
    openStoreItem(id);
  }
});

document.querySelectorAll('#hfSeg button').forEach(b => {
  b.onclick = async ()=>{ await chooseHandsFree(b.dataset.hf); };
});
$('btnResume').onclick = ()=> setPause(false);
$('weightModalDone').onclick = ()=> commitWeightModal();

function clampVol(v, def){ v = Number(v); if(!isFinite(v)) v = def; return Math.max(0, Math.min(1, v)); }
function applyAudioFromUser(u){
  if(!u) return;
  prepSec = (u.prepSec == null) ? 5 : Math.max(0, Math.min(30, u.prepSec));
  readySec = (u.readySec == null) ? 5 : Math.max(0, Math.min(30, u.readySec));
  sideSec = (u.sideSec == null) ? 10 : Math.max(3, Math.min(60, u.sideSec));
  savedVoiceURI = u.voiceURI || '';
  voiceVol = clampVol((u.voiceVol == null ? 100 : u.voiceVol) / 100, 1);
  fxVol = clampVol((u.fxVol == null ? 100 : u.fxVol) / 100, 1);
  if(masterGain) masterGain.gain.value = fxVol;
  kvSet('voiceURI', savedVoiceURI);
}

function toggleSound(){
  soundOn = !soundOn;
  kvSet('soundOff', soundOn ? '0' : '1');
  if(!soundOn) stopSpeech();
  syncPrefs();
}

/* ---- один каскад «Звук → Голос / Звуки / Музыка», три места: старт (st), тренировка (snd), профиль (ue) ---- */
let fxVolMemory = 100; // громкость сигналов, которую помним, пока «Звуки» выключены

// заполняет каскад текущими значениями сессии (для st и snd — они делят одно состояние)
function fillLiveSoundCascade(p){
  $(p + 'SoundOn').classList.toggle('on', soundOn);
  $(p + 'VoiceOn').classList.toggle('on', voiceVol > 0);
  const fOn = fxVol > 0;
  if(fOn) fxVolMemory = Math.round(fxVol * 100);
  $(p + 'FxOn').classList.toggle('on', fOn);
  $(p + 'FxVol').value = fOn ? Math.round(fxVol * 100) : fxVolMemory;
  $(p + 'FxVolVal').textContent = (fOn ? Math.round(fxVol * 100) : fxVolMemory) + '%';
  $(p + 'Music').classList.toggle('on', musicMode);
  syncSoundCascade(p);
}

// сохраняет живое состояние в аудио-движок и в активный профиль
function persistLiveSound(){
  if(masterGain) masterGain.gain.value = fxVol;
  const u = curUser();
  if(u){ u.voiceVol = Math.round(voiceVol * 100); u.fxVol = Math.round(fxVol * 100); u.voiceURI = savedVoiceURI; saveUsers(); }
  kvSet('voiceURI', savedVoiceURI);
  syncPrefs();
}

// вешает обработчики на каскад с префиксом p (вызывается один раз на префикс, при старте)
function wireLiveSoundCascade(p){
  $(p + 'SoundOn').onclick = ()=>{
    soundOn = !soundOn;
    kvSet('soundOff', soundOn ? '0' : '1');
    if(!soundOn) stopSpeech();
    $(p + 'SoundOn').classList.toggle('on', soundOn);
    syncSoundCascade(p);
    syncPrefs();
  };
  $(p + 'VoiceOn').onclick = ()=>{
    const on = !$(p + 'VoiceOn').classList.contains('on');
    voiceVol = on ? 1 : 0;
    $(p + 'VoiceOn').classList.toggle('on', on);
    syncSoundCascade(p);
    persistLiveSound();
    if(on) speak(voiceIsEnglish() ? 'Voice enabled' : t('audio.voiceOn'));
  };
  $(p + 'FxOn').onclick = ()=>{
    const on = !$(p + 'FxOn').classList.contains('on');
    if(on){ fxVol = clampVol(fxVolMemory / 100, 1); }
    else { fxVolMemory = Math.round(fxVol * 100) || fxVolMemory; fxVol = 0; }
    $(p + 'FxOn').classList.toggle('on', on);
    $(p + 'FxVol').value = Math.round(fxVol * 100);
    $(p + 'FxVolVal').textContent = Math.round(fxVol * 100) + '%';
    syncSoundCascade(p);
    persistLiveSound();
    if(on) tick();
  };
  $(p + 'FxVol').oninput = e => {
    const v = parseInt(e.target.value) || 0;
    fxVol = clampVol(v / 100, 1);
    fxVolMemory = v || fxVolMemory;
    $(p + 'FxVolVal').textContent = v + '%';
    persistLiveSound();
    if(v > 0) tick();
  };
  $(p + 'Music').onclick = ()=>{
    musicMode = !musicMode;
    kvSet('musicMode', musicMode ? '1' : '0');
    if(musicMode) stopSpeech();
    $(p + 'Music').classList.toggle('on', musicMode);
    syncPrefs();
  };
}
function cloneSettingsBlock(sourceId, targetId, ids){
  const source=$(sourceId), target=$(targetId);
  if(!source || !target) return;
  target.innerHTML = source.innerHTML;
  Object.entries(ids || {}).forEach(([from,to])=>{
    const el=target.querySelector('#' + from);
    if(el) el.id=to;
  });
}
function mountWorkoutSettingsBlocks(){
  cloneSettingsBlock('soundSettingsCard','soundModalContent',{
    stSoundOn:'sndSoundOn', stSoundBox:'sndSoundBox', stVoiceOn:'sndVoiceOn',
    stVoiceChoice:'sndVoiceChoice', stMusic:'sndMusic', stFxOn:'sndFxOn',
    stFxField:'sndFxField', stFxVolVal:'sndFxVolVal', stFxVol:'sndFxVol'
  });
  cloneSettingsBlock('handsfreeSettingsCard','hfModalContent',{
    hfSeg:'hfModalSeg', hfHint:'hfModalHint', voicePackBox:'hfVoicePackBox',
    voiceRecLang:'hfVoiceRecLang', voicePackStatus:'hfVoicePackStatus',
    voicePackProgress:'hfVoicePackProgress', voicePackProgressBar:'hfVoicePackProgressBar',
    btnVoicePack:'btnHfVoicePack', btnHfCommands:'btnHfCommandsModal'
  });
}
mountWorkoutSettingsBlocks();
wireLiveSoundCascade('st');
wireLiveSoundCascade('snd');

async function availableTtsVoices(){
  if(window.FitNative && window.FitNative.listTtsVoices){
    const list = await window.FitNative.listTtsVoices();
    return list.map(v=>({id:v.name,name:v.name,lang:v.language || '',network:!!v.network}));
  }
  try{
    return speechSynthesis.getVoices().map(v=>({id:v.voiceURI,name:v.name,lang:v.lang || '',network:!v.localService}));
  }catch(_){ return []; }
}

async function fillVoiceChoices(){
  const all = await availableTtsVoices();
  const prefix = voiceLang.toLowerCase().split('-')[0];
  const matching = all.filter(v=>String(v.lang).toLowerCase().startsWith(prefix));
  const local = matching.filter(v=>!v.network);
  const list = local.length ? local : matching;
  for(const id of ['stVoiceChoice','sndVoiceChoice']){
    const sel=$(id); if(!sel) continue;
    sel.innerHTML='';
    if(!list.length){
      const o=document.createElement('option'); o.value=''; o.textContent=t('audio.systemVoice'); sel.appendChild(o);
      continue;
    }
    list.forEach((v,i)=>{
      const o=document.createElement('option');
      o.value=v.id;
      o.textContent=(v.name || t('audio.voiceFallback',{count:i+1})) + (v.network ? ' · ' + t('audio.online') : '');
      sel.appendChild(o);
    });
    const exists=list.some(v=>v.id===savedVoiceURI);
    sel.value=exists ? savedVoiceURI : list[0].id;
    if(!exists){ savedVoiceURI=sel.value; await kvSet('voiceURI',savedVoiceURI); }
  }
  const u = curUser();
  if(u && u.voiceURI !== savedVoiceURI){
    u.voiceURI = savedVoiceURI;
    await saveUsers();
  }
}

async function syncTtsLocaleToApp(resetVoice){
  voiceLang = localeTag();
  await kvDel('voiceLangManual');
  await kvSet('voiceLang', voiceLang);
  if(resetVoice){
    savedVoiceURI='';
    await kvSet('voiceURI','');
  }
  await fillVoiceChoices();
}

let voicePackPollTimer = 0;
async function refreshVoicePackUI(progressEvent){
  const native = !!(window.FitNative && window.FitNative.offlineVoice);
  ['voicePackBox','hfVoicePackBox'].forEach(id=>setShown(id,native));
  if(!native) return;
  if($('voiceRecLang')) $('voiceRecLang').value=recognitionLang;
  if($('hfVoiceRecLang')) $('hfVoiceRecLang').value=recognitionLang;

  let status = null;
  if(progressEvent && progressEvent.language === recognitionLang) status=progressEvent;
  else status = await window.FitNative.getVoiceModelStatus(recognitionLang);

  const size = (status && status.sizeMb) || (recognitionLang==='en' ? 40 : 45);
  let label = status && status.installed ? t('voicepack.ready') : t('voicepack.downloadOnce',{size});
  let button = status && status.installed ? t('voicepack.downloaded') : t('voicepack.download');
  let disabled = !!(status && status.installed);
  if(status && status.status === 'queued'){
    label = t('voicepack.queued');
    button = t('voicepack.inQueue');
    disabled = true;
  }else if(status && status.status === 'downloading'){
    label = t('voicepack.downloading',{progress:Math.max(0,Math.min(100,status.progress||0))});
    button = t('voicepack.downloadingBtn');
    disabled = true;
  }else if(status && status.status === 'extracting'){
    label = t('voicepack.extracting');
    button = t('voicepack.almostReady');
    disabled = true;
  }else if(status && status.status === 'error'){
    label=t('voicepack.error');
    button=t('voicepack.retry');
    disabled=false;
  }
  setShown('btnVoiceTest', !!(status && status.installed));
  const pct = status && status.installed ? 100 : Math.max(0,Math.min(100,(status && status.progress)||0));
  for(const row of [
    ['voicePackStatus','btnVoicePack','voicePackProgress','voicePackProgressBar'],
    ['hfVoicePackStatus','btnHfVoicePack','hfVoicePackProgress','hfVoicePackProgressBar']
  ]){
    const s=$(row[0]), b=$(row[1]), p=$(row[2]), bar=$(row[3]); if(!s||!b) continue;
    s.textContent=label; b.textContent=button; b.disabled=disabled;
    const running = !!(status && ['queued','downloading','extracting'].includes(status.status));
    if(p) setShown(row[2], running);
    if(bar) bar.style.width = (status && status.status === 'queued' ? 3 : pct) + '%';
  }

  clearTimeout(voicePackPollTimer);
  if(status && ['queued','downloading','extracting'].includes(status.status)){
    voicePackPollTimer = setTimeout(()=>refreshVoicePackUI(), 800);
  }
}

async function downloadSelectedVoicePack(){
  if(!(window.FitNative && window.FitNative.downloadVoiceModel)) return;
  for(const id of ['btnVoicePack','btnHfVoicePack']) if($(id)) $(id).disabled=true;
  const ok=await window.FitNative.downloadVoiceModel(recognitionLang, refreshVoicePackUI);
  await refreshVoicePackUI();
  if(!ok) appAlert(t('voicepack.startError'));
}

function openHfModal(){
  syncHandsFreeUI();
  if($('hfVoiceRecLang')) $('hfVoiceRecLang').value = recognitionLang;
  refreshVoicePackUI();
  $('hfModal').classList.add('open');
}
document.querySelectorAll('#hfModal [data-hf]').forEach(c => {
  c.onclick = async ()=>{
    const ok = await chooseHandsFree(c.dataset.hf);
    if(ok) $('hfModal').classList.remove('open');
  };
});
$('hfModal').onclick = e => { if(e.target === $('hfModal')) $('hfModal').classList.remove('open'); };

async function previewSelectedVoice(){
  const resumeRecognition = hfMode === 'voice' && $('scrWork').classList.contains('on');
  if(resumeRecognition){
    try{ await Promise.resolve(stopListening()); }catch(_){}
    await new Promise(resolve=>setTimeout(resolve, 100));
  }
  speak(t('audio.voiceSelected'), null, ()=>{
    if(!resumeRecognition) return;
    setTimeout(()=>{
      if(hfMode === 'voice' && $('scrWork').classList.contains('on')){
        voiceWanted = true;
        startListening();
      }
    }, 160);
  });
}
for(const id of ['stVoiceChoice','sndVoiceChoice']){
  if($(id)) $(id).onchange = async e=>{
    savedVoiceURI=e.target.value || '';
    persistLiveSound();
    for(const other of ['stVoiceChoice','sndVoiceChoice']) if($(other) && $(other)!==e.target) $(other).value=savedVoiceURI;
    await previewSelectedVoice();
  };
}
for(const id of ['voiceRecLang','hfVoiceRecLang']){
  if($(id)) $(id).onchange = async e=>{
    recognitionLang = e.target.value === 'en' ? 'en' : 'ru';
    kvSet('recognitionLang',recognitionLang);
    kvSet('recognitionLangManual','1');
    if(hfMode==='voice') setHfMode('off');
    await refreshVoicePackUI();
  };
}
if($('btnVoicePack')) $('btnVoicePack').onclick=downloadSelectedVoicePack;
if($('btnHfVoicePack')) $('btnHfVoicePack').onclick=downloadSelectedVoicePack;
window.addEventListener('fitVoiceModelStatus', e=>refreshVoicePackUI(e.detail));
$('btnSoundW').onclick = ()=>{ fillLiveSoundCascade('snd'); $('soundModal').classList.add('open'); };
$('soundModal').onclick = e => { if(e.target === $('soundModal')) $('soundModal').classList.remove('open'); };
$('btnMicW').onclick = openHfModal;
function openHfCommands(){
  $('hfModal').classList.remove('open');
  $('hfCommandsModal').classList.add('open');
}
['btnHfCommands','btnHfCommandsModal'].forEach(id => { if($(id)) $(id).onclick = openHfCommands; });
$('hfCommandsModal').onclick = e => { if(e.target === $('hfCommandsModal')) $('hfCommandsModal').classList.remove('open'); };

/* ---- проверка распознавания (Настройки → Управление без рук) ----
   Говоришь команду с привычного расстояния и видишь цепочку «что услышал
   телефон → что сделает приложение». Так понятно, где рвётся: микрофон не
   слышит (строк нет), слышит, но не то слово («не команда»), или слышит
   неуверенно. Работает только вне тренировки: тот же микрофон занят ею. */
let voiceTestOn = false;
const VT_KIND = {next:'handsfree.commandNext', pause:'handsfree.commandPause', resume:'handsfree.commandResume'};
function voiceTestRow(d){
  const box = $('voiceTestList');
  const row = document.createElement('div');
  const text = String(d.text || '').replace(/\[unk\]/g, '').trim();
  row.className = 'vt-row' + (d.accepted ? ' ok' : '');
  row.innerHTML = '<b></b><span></span>';
  row.querySelector('b').textContent = text ? `«${text}»` : t('voicetest.noise');
  row.querySelector('span').textContent = d.accepted && VT_KIND[d.kind] ? t(VT_KIND[d.kind])
    : d.kind && d.source === 'in_speech' ? t('voicetest.inSpeech')
    : d.kind ? t('voicetest.unsure') : t('voicetest.notCommand');
  box.prepend(row);
  while(box.children.length > 8) box.lastChild.remove();
}
function onVoiceTestHeard(e){ if(voiceTestOn) voiceTestRow(e.detail || {}); }
async function openVoiceTest(){
  if(state.live || !(window.FitNative && window.FitNative.offlineVoice)) return;
  $('voiceTestList').innerHTML = '';
  $('voiceTestStatus').textContent = t('voicetest.listening');
  $('voiceTestModal').classList.add('open');
  voiceTestOn = true;
  const ok = await window.FitNative.startVoiceRecognition(()=>{}, ()=>{ $('voiceTestStatus').textContent = t('voicetest.failed'); });
  if(!ok && voiceTestOn) $('voiceTestStatus').textContent = t('voicetest.failed');
  if(!voiceTestOn) window.FitNative.stopVoiceRecognition(); // успели закрыть, пока микрофон поднимался
}
function stopVoiceTest(){
  if(!voiceTestOn) return;
  voiceTestOn = false;
  if(window.FitNative && window.FitNative.stopVoiceRecognition) window.FitNative.stopVoiceRecognition();
}
window.addEventListener('fitVoiceHeard', onVoiceTestHeard);
if($('btnVoiceTest')) $('btnVoiceTest').onclick = openVoiceTest;
$('voiceTestModal').onclick = e => { if(e.target === $('voiceTestModal')) $('voiceTestModal').classList.remove('open'); };
// окно закрывают кнопкой, тапом мимо и системным «назад» — микрофон
// отпускаем в любом из этих случаев, следя за самим окном
new MutationObserver(()=>{ if(!$('voiceTestModal').classList.contains('open')) stopVoiceTest(); })
  .observe($('voiceTestModal'), {attributes:true, attributeFilter:['class']});
// создание программы: одна кнопка + выбор способа
$('btnAddProgram').onclick = ()=> $('createModal').classList.add('open');
$('greetAva').onclick = ()=>{ const u = curUser(); if(u) openUserEdit(u.id); };
/* ---- каталог ---- */
$('btnStoreMenu').onclick = ()=> openStore('scrMenu');
$('storeBackTop').onclick = ()=> goTab(storeFrom);
$('storeQuery').oninput = ()=>{
  storeFilter.q = $('storeQuery').value;
  setShown('storeClear', !!storeFilter.q);
  renderStore();
};
$('storeClear').onclick = ()=>{
  $('storeQuery').value = '';
  storeFilter.q = '';
  setShown('storeClear', false);
  renderStore();
  $('storeQuery').focus();
};

$('createModal').onclick = e=>{ if(e.target === $('createModal')) $('createModal').classList.remove('open'); };
$('chManual').onclick = ()=>{ $('createModal').classList.remove('open'); openBuilder(); };
$('chAI').onclick = ()=>{ $('createModal').classList.remove('open'); initAIForm(); openAI('text'); };
$('chImport').onclick = ()=>{ $('createModal').classList.remove('open'); $('importCode').value=''; $('importModal').classList.add('open'); };
$('importModal').onclick = e=>{ if(e.target === $('importModal')) $('importModal').classList.remove('open'); };
$('btnDoImport').onclick = ()=> importProgramCode($('importCode').value);

/* ---- тренер: карточка на аккаунте, картотека, карточка подопечного ---- */
async function enableTrainerMode(){
  if(!trainerAccountReady()) return;
  trainer.handle = account.handle;
  trainer.on = true;
  // Первое включение: подставляем имя и фото из профиля, чтобы не набирать заново.
  // Дальше они живут отдельно — правка профиля лицо тренера не меняет.
  if(!trainer.name){
    const me = users.find(u => u.id === currentUser);
    if(me){ trainer.name = me.name || ''; trainer.photo = me.photo || ''; }
  }
  await saveTrainer();
  renderTrainerCard();
}
$('tglTrainer').onclick = async ()=>{
  if(!trainerAccountReady()){
    openLogin(enableTrainerMode, {
      label:t('trainer.needAccount'),
      msg:t('trainer.needAccountMsg')
    });
    return;
  }
  if(trainer.on){
    trainer.on = false;
    await saveTrainer();
    renderTrainerCard();
    return;
  }
  await enableTrainerMode();
};
/* Проверяем по УХОДУ из поля, а не на каждой букве: пока человек печатает
   «t.me/lena», адрес по дороге проходит через десяток заведомо неправильных
   состояний, и ругаться на каждое — значит мешать набирать.

   Непохожее на адрес не сохраняем вовсе. Раньше сюда писали что угодно, и это
   уезжало на страницу тренера, где превращалось в ссылку «https://хуй»: человек
   по ней нажимал и попадал в никуда. Лучше пусто, чем ссылка, которая врёт. */
$('coachLinks').onblur = async e => {
  const raw = e.target.value.trim();
  const ok = raw ? cleanLink(raw) : '';
  $('coachLinksErr').textContent = (raw && !ok)
    ? t('trainer.badLink')
    : '';
  if(raw && !ok) return;                 // оставляем набранное в поле, но не сохраняем
  // Схему в поле не показываем: её не набирали, и «https://» перед ником только
  // мешает прочитать, что там написано.
  e.target.value = (ok || '').replace(/^https?:\/\//i, '');
};
$('coachPhotoBtn').onclick = ()=> $('coachPhotoFile').click();
$('coachPhotoFile').onchange = e => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 240, async data => {
    if(!data){ appAlert(t('trainer.photoFailed')); return; }
    coachPhotoDraft = data;
    $('coachPhotoPrev').innerHTML = `<img src="${esc(data)}" alt="">`;
  });
};
// Только цифры и не больше двух: стаж — это «8» или «22», а не телефон.
// Поле текстовое намеренно — у number maxlength не работает вовсе.
$('coachYears').oninput = async e => {
  const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
  if(e.target.value !== digits) e.target.value = digits;
};

$('btnSaveCoach').onclick = async ()=>{
  if(!trainerAccountReady()){
    openLogin(enableTrainerMode, {
      label:t('trainer.needAccount'),
      msg:t('trainer.needAccountSaveMsg')
    });
    return;
  }
  const btn = $('btnSaveCoach');
  const rawLink = $('coachLinks').value.trim();
  const link = rawLink ? cleanLink(rawLink) : '';
  if(rawLink && !link){
    $('coachLinksErr').textContent = t('trainer.badLink');
    $('coachLinks').focus();
    return;
  }
  const handle = account.handle;
  const yearsRaw = $('coachYears').value.replace(/\D/g, '').slice(0, 2);
  const years = parseInt(yearsRaw, 10);
  trainer = Object.assign({}, trainer, {
    handle,
    name:clampLine($('coachName').value, LIM.coachName),
    photo:coachPhotoDraft || '',
    about:clampText($('coachAbout').value, LIM.coachAbout),
    years:(isFinite(years) && years > 0 && years <= 60) ? years : null,
    links:link || '',
    pageErr:null
  });
  btn.disabled = true;
  btn.textContent = t('common.saving');
  showSyncState('busy');
  await saveTrainer({deferSync:true});
  const ok = await pushProfile();
  if(ok){
    await saveTrainer({deferSync:true});
    if(isPremium()) queueAccountSync();
    showSyncState('ok');
    renderTrainerCard();
    btn.textContent = t('common.saved');
    setTimeout(()=>{ if(btn.textContent === t('common.saved')) btn.textContent = t('common.save'); }, 1500);
  } else {
    showSyncState('error');
    appAlert(trainer.pageErr || t('trainer.saveFailed'));
    btn.textContent = t('common.save');
  }
  btn.disabled = false;
};

// Ник над программой — это вход на страницу тренера, а не украшение: подопечный,
// получивший программу по ссылке, хочет знать, от кого она.
$('startByChip').onclick = ()=>{ const p = state.raw; if(p && p.by) openTrainer(p.by); };
$('tpBackTop').onclick = ()=> goBackTo(tpFrom || 'scrMenu');
$('pubBackTop').onclick = ()=> goBackTo(pubFrom || 'scrPrograms');
$('mcBackTop').onclick = ()=>{ switchMoreTab('coach'); goTab('scrAccount'); };
// Своя страница — ровно тем же экраном, каким её видит подопечный. Отдельный «просмотр
// профиля» разошёлся бы с настоящим через месяц.
$('btnToStore').onclick = ()=> openStore('scrPrograms');
$('btnMyCatalog').onclick = ()=> openMyCatalog();
// Ника без аккаунта терять нельзя — поэтому строка ведёт прямо туда, где его заводят.
$('coachNoAcc').onclick = ()=> { switchMoreTab('acc'); setTimeout(()=> openLogin(), 250); };
$('btnCoachWipe').onclick = wipeTrainerInfo;
$('btnMyPage').onclick = ()=> trainerOn() ? openTrainer(normHandle(trainer.handle))
  : appAlert(t('trainer.enableFirst'));
$('pubGives').oninput = e => { pubDraft.gives = clampText(e.target.value, LIM.gives); };
$('btnPublish').onclick = ()=> doPublish();
$('btnAddClient').onclick = async ()=>{
  const c = await addClient();
  renderClients();
  renderTrainerCard();
  openClient(clients.indexOf(c));
  setTimeout(()=> $('clName').select(), 120);
};

$('clBackTop').onclick = ()=> goBackTo('scrTrainer');
// Поля карточки сохраняются на лету: «Сохранить» здесь нечего ждать, а её отсутствие
// снимает весь разговор о несохранённом при выходе жестом.
$('clName').oninput = async e => {
  const c = curClient(); if(!c) return;
  c.name = clampLine(e.target.value, LIM.clientName);
  $('clTitle').textContent = c.name || t('clients.default');
  await saveClients();
};
$('clNote').oninput = async e => {
  const c = curClient(); if(!c) return;
  c.note = clampLine(e.target.value, LIM.clientNote);
  await saveClients();
};
// Кнопка всегда спрашивает, КАКУЮ программу отправить: их может быть несколько,
// и «отправить ещё раз» живёт у самой программы, а не здесь.
$('btnClSend').onclick = ()=>{
  const c = curClient(); if(!c) return;
  pickProgramForClient(c);
};
$('btnDelClient').onclick = async ()=>{
  const c = curClient(); if(!c) return;
  if(!(await appDialog(t('clients.removeClient',{name:c.name || t('clients.unnamed')}),
       {confirm: true, okText: t('clients.removeAction'), cancelText: t('common.keep')}))) return;
  clients = clients.filter(x => x.id !== c.id);
  clientIdx = -1;
  await saveClients();
  renderClients();
  renderTrainerCard();
  goBackTo('scrTrainer');
};

// Выбор программы для подопечного, когда её ещё нет. Тот же попап, что и «кому отправить»,
// только наоборот: подопечный известен, выбирают программу.
function pickProgramForClient(c){
  const box = $('pickClientList');
  box.innerHTML = '';
  const list = customPrograms.filter(p => p.id !== 'warmup');
  if(!list.length){
    const h = document.createElement('p');
    h.className = 'field-hint';
    h.textContent = t('clients.buildFirst');
    box.appendChild(h);
  }
  list.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = p.name;
    const has = clProgs(c).find(x => x.pid === p.id);
    b.querySelector('small').textContent = has
      ? t('clients.sentAgain')
      : t('clients.exerciseCount',{count:(normPlans(p)[0].exercises || []).length});
    b.onclick = async ()=>{
      $('pickClientModal').classList.remove('open');
      await sendProgramToClient(c, p);
    };
    box.appendChild(b);
  });
  $('pickClientModal').querySelector('.mini-label').textContent = t('clients.chooseWhichProgram');
  $('pickClientModal').classList.add('open');
}
async function delCurrentPlan(){
  if(draft.plans.length <= 1) return;
  if(!(await appDialog(t('builder.deleteVariant'),
    {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  draft.plans.splice(planIdx, 1);
  planIdx = Math.max(0, planIdx - 1);
  if(draft.plans.length < 2) draft.rotate = false; // остался один вариант — очередь не нужна
  fillPlanFields();
  syncRotateUI();
}

/* ---- данные и правила ----
   Экран открывается из трёх мест: настроек, знакомства и подсказки про
   беременность. Возврат должен вести туда, откуда пришли, поэтому обратный
   путь запоминается функцией, а не берётся из истории. */
let legalBack = ()=> goTab('scrAccount');
const LEGAL_SECTIONS = {privacy: 'legalPrivacy', terms: 'legalTerms', health: 'legalHealth'};
function legalToggle(key, on){
  const body = $(LEGAL_SECTIONS[key]);
  const head = $('legalHead' + key[0].toUpperCase() + key.slice(1));
  const open = on == null ? body.classList.contains('hidden') : on;
  setShown(body, open);
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function openLegal(section, back){
  legalBack = back || (()=> goTab('scrAccount'));
  Object.keys(LEGAL_SECTIONS).forEach(k => legalToggle(k, k === section));
  show('scrLegal');
  window.scrollTo(0, 0);
}
Object.keys(LEGAL_SECTIONS).forEach(k => {
  $('legalHead' + k[0].toUpperCase() + k.slice(1)).onclick = ()=> legalToggle(k);
});
$('legalBackTop').onclick = ()=> legalBack();
$('btnLegalDone').onclick = ()=> legalBack();
['workouts','trainer','progress','offers','emailNews','emailOffers'].forEach(key => {
  const btn = $({
    workouts:'notifWorkouts',
    trainer:'notifTrainer',
    progress:'notifProgress',
    offers:'notifOffers',
    emailNews:'emailNews',
    emailOffers:'emailOffers'
  }[key]);
  if(btn) btn.onclick = ()=> { setNotificationPref(key, !getNotificationPrefs()[key]); };
});
$('btnLegalPrivacy').onclick = ()=> openLegal('privacy');
$('btnLegalTerms').onclick   = ()=> openLegal('terms');
$('btnLegalHealth').onclick  = ()=> openLegal('health');
// трекер веса
$('btnAddWeight').onclick = ()=>{
  const last = stats.weights[stats.weights.length - 1];
  $('weightInput').value = last ? last.w : '';
  $('heightInput').value = stats.height || '';
  const lastOf = k => { for(let i = stats.weights.length - 1; i >= 0; i--) if(stats.weights[i][k]) return stats.weights[i][k]; return ''; };
  $('fatInput').value = lastOf('fat');
  $('muscInput').value = lastOf('musc');
  $('waistInput').value = lastOf('waist');
  $('hipsInput').value = lastOf('hips');
  $('chestInput').value = lastOf('chest');
  $('waModal').classList.add('open');
  setTimeout(()=> $('weightInput').focus(), 100);
};
$('waModal').onclick = e => { if(e.target === $('waModal')) $('waModal').classList.remove('open'); };
$('btnSaveWeight').onclick = async ()=>{
  const w = parseFloat(String($('weightInput').value).replace(',', '.'));
  if(!w || w < 20 || w > 300){ appAlert(t('progress.weightRange')); return; }
  const h = parseInt($('heightInput').value);
  if(h && h >= 100 && h <= 250) stats.height = h;
  const cm = id => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    return (v && v >= 30 && v <= 200) ? v : null;
  };
  // проценты состава тела: границы свои, иначе «18» в поле жира считалось бы промахом
  const pct = (id, lo, hi) => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    return (v && v >= lo && v <= hi) ? Math.round(v * 10) / 10 : null;
  };
  const today = localISO(new Date());
  let en = stats.weights.find(e => e.d === today);
  // вес и обхваты — сведения о здоровье, специальная категория: отмечаем согласие
  // в момент, когда человек впервые их вводит, а не абстрактно при установке
  if(!hasConsent('health')) recordConsent('health');
  if(!en){ en = {d: today}; stats.weights.push(en); }
  en.w = w;
  const waist = cm('waistInput'), hips = cm('hipsInput'), chest = cm('chestInput');
  const fat = pct('fatInput', 3, 70), musc = pct('muscInput', 10, 80);
  if(waist) en.waist = waist; else delete en.waist;
  if(hips) en.hips = hips; else delete en.hips;
  if(chest) en.chest = chest; else delete en.chest;
  if(fat) en.fat = fat; else delete en.fat;
  if(musc) en.musc = musc; else delete en.musc;
  stats.weights.sort((a2, b) => a2.d < b.d ? -1 : 1);
  await saveStats();
  $('waModal').classList.remove('open');
  renderWeight();
};
// навигация по календарю
// Подписка: витрина → оформление → успех. Оплату принимает магазин приложений,
// платёжные данные в приложение не попадают и у нас не хранятся.
function openPremium(){
  trackProductEvent('premium_opened').catch(()=>{});
  renderPremium(); $('premiumModal').classList.add('open');
  refreshServerSubscription(true).catch(()=>{});
}
$('btnPremium').onclick = openPremium;
$('btnPlanCard').onclick = openPremium;
$('premiumModal').onclick = e => { if(e.target === $('premiumModal')) $('premiumModal').classList.remove('open'); };
$('pmBuy').onclick = ()=>{
  trackProductEvent('purchase_started').catch(()=>{});
  const pr = priceTable(), cur = userCurrency();
  $('payWhat').textContent = pmPlan === 'year'
    ? t('premium.payYear',{price:money(pr.year,cur)})
    : t('premium.payMonth',{price:money(pr.month,cur)});
  $('payGo').textContent = t('premium.pay',{price:money(pr[pmPlan],cur)});
  $('payEmail').value = (account && account.email) || '';
  $('payModal').classList.add('open');
};
$('payModal').onclick = e => { if(e.target === $('payModal')) $('payModal').classList.remove('open'); };
$('payGo').onclick = completePurchase;
$('payEmail').addEventListener('keydown', e => { if(e.key === 'Enter') completePurchase(); });
$('premiumOkModal').onclick = e => { if(e.target === $('premiumOkModal')) $('premiumOkModal').classList.remove('open'); };
$('pokBio').onclick = async ()=>{ if(await bioEnable()) $('premiumOkModal').classList.remove('open'); };
$('tglBio').onclick = async ()=>{
  if(account.biometry && account.biometry.enabled) await bioDisable();
  else await bioEnable();
};
// Отмена продления не забирает оплаченное: срок дорабатывает до конца. Иначе это
// не отмена подписки, а изъятие уже купленного.
$('tglRenew').onclick = async ()=>{
  if(!account.sub) return;
  if(account.sub.autoRenew){
    const ok = await appDialog(
      t('premium.disableRenew',{date:humanDate(account.sub.until)}),
      {confirm: true, okText: t('premium.disableRenewAction'), cancelText: t('common.keep')});
    if(!ok) return;
  }
  account.sub.autoRenew = !account.sub.autoRenew;
  await saveAccount();
  renderPlan(); renderPremium();
};
$('loginGo').onclick = doLogin;
$('loginHaveCode').onclick = loginUseExistingCode;
const dropLogin = ()=>{
  loginDone = null;
  loginPending = null;
  loginFixedEmail = '';
  $('loginEmail').readOnly = false;
  pendingSub = null;   // ушёл с шага кода — подписки не случилось
  $('loginModal').classList.remove('open');
};
$('loginCancel').onclick = dropLogin;
$('loginModal').onclick = e => { if(e.target === $('loginModal')) dropLogin(); };
$('loginEmail').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('loginCode').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('loginHandle').addEventListener('input', e => {
  const at = e.target.value.startsWith('@');
  const body = e.target.value.replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '').slice(0, 29);
  e.target.value = (at || body) ? '@' + body : '';
});
$('loginHandle').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('btnLoginRow').onclick = ()=> openLogin();
$('btnSignOut').onclick = signOut;
// «Позже» — не отмена: дни, отмеченные до нажатия, уже лежат в программе, поэтому
// сохраняем и их, иначе выбор молча пропадёт
$('lockGo').onclick = ()=> tryUnlock();
// Биометрия не является авторизацией аккаунта. Если она недоступна или человек
// просто нажал «Отмена», запасной путь — обычный подтверждённый email + OTP.
$('lockMail').onclick = ()=> openLogin(
  ()=> $('lockModal').classList.remove('open'),
  {
    email:(account && account.email) || '',
    fixedEmail:true,
    label:t('lock.email'),
    msg:t('login.intro')
  }
);
window.addEventListener('fitAppForeground', e=>{
  maybeBiometricRelock(+((e && e.detail && e.detail.awayMs) || 0));
});

$('btnImportProgFile').onclick = ()=> $('importProgFile').click();
$('importProgFile').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  $('importModal').classList.remove('open');
  await importProgramFile(f);
};

$('btnExportAll').onclick = exportAllData;
$('btnImportAll').onclick = ()=> $('importAllFile').click();
$('btnWipeAccount').onclick = wipeAccount;
$('importAllFile').onchange = e => { const f = e.target.files && e.target.files[0]; if(f) importAllData(f); e.target.value=''; };
$('btnWeightHist').onclick = openWeightHist;
$('btnShareWeight').onclick = shareWeightChart;
$('btnAddPhoto').onclick = ()=> $('photoFile').click();
$('photoFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  if(f) addPhoto(f);
  e.target.value = '';
};
$('btnCompare').onclick = ()=> openCompare();
// переключатель метрик на вкладке «Тело»: график один, метрика выбирается здесь
$('weightSwitch').addEventListener('click', e => {
  const b = e.target.closest('.wm-chip');
  if(!b) return;
  weightMetric = b.dataset.k;
  renderWeight();
});
// самочувствие: тот же переключатель метрик, что и у веса
$('wellSwitch').addEventListener('click', e => {
  const b = e.target.closest('.wm-chip');
  if(!b) return;
  wellMetric = b.dataset.k;
  renderWellness();
});
$('btnAddWell').onclick = openWellAdd;
$('btnSaveWell').onclick = saveWell;
$('btnWellHist').onclick = openWellHist;
$('btnShareWell').onclick = shareWellChart;
$('wellHistSave').onclick = saveWellHist;
$('wellModal').onclick = e => { if(e.target === $('wellModal')) $('wellModal').classList.remove('open'); };
$('btnDeleteAllPhotos').onclick = deleteAllPhotos;
$('cmpA').onchange = renderCmp;
$('cmpB').onchange = renderCmp;
$('cmpDelA').onclick = ()=> delCmpPhoto('cmpA');
$('cmpDelB').onclick = ()=> delCmpPhoto('cmpB');
$('btnShareCmp').onclick = shareCompare;
$('cmpModal').onclick = e => { if(e.target === $('cmpModal')) $('cmpModal').classList.remove('open'); };
$('whSave').onclick = saveWeightHist;
$('whModal').onclick = e => { if(e.target === $('whModal')) $('whModal').classList.remove('open'); };
$('calPrev').onclick = ()=>{ calOffset--; renderCalendar(); };
$('calNext').onclick = ()=>{ calOffset++; renderCalendar(); };
// онбординг
// из знакомства «назад» ведёт обратно в знакомство, а не в настройки: человек
// ещё не завёл профиль, и вкладки внизу ему пока не принадлежат
$('obLegal1').onclick = ()=> openLegal('privacy', ()=> asTab(()=> show('scrOnboard')));
// Знакомство ведёт на главную, а не сразу в разминку: разминка никуда не денется —
// она уже в списке, — а начинать чужой сценарий за человека не стоит.
async function leaveOnboarding(){
  const freshProfile = await finishOnboardingCreate();
  trackProductEvent('onboarding_complete').catch(()=>{});
  if(pendingImport){
    importProgramCode(pendingImport);
    pendingImport = null;
    return;
  }
  if(pendingNativeLink){
    const id = pendingNativeLink;
    pendingNativeLink = null;
    importProgramLink(id);
    return;
  }
  if(pendingLink){
    const id = pendingLink;
    pendingLink = null;
    importProgramLink(id);
    return;
  }
  // Новый пользователь уже выразил намерение начать тренировку. Не заставляем его
  // сначала попадать на пустую «Сегодня», а ведём туда, где можно сразу выбрать
  // готовую программу, собрать свою или открыть разминку. После входа в существующий
  // аккаунт оставляем привычную главную — там уже есть личный план и история.
  goTab(freshProfile ? 'scrPrograms' : 'scrMenu');
}
$('obStart').onclick = ()=> leaveOnboarding();
// у человека уже может быть аккаунт — с прошлого телефона или после переустановки
$('obLogin').onclick = ()=> openLogin(()=> leaveOnboarding());
// пара уточнений
$('whoF').onclick = ()=>{ whoDraft.gender = 'f'; whoSyncForm(); };
$('whoM').onclick = ()=>{ whoDraft.gender = 'm'; whoSyncForm(); };
$('whoAge').oninput = ()=> whoSyncForm();
$('whoSave').onclick = ()=> whoFinish(true);
$('whoSkip').onclick = ()=> whoFinish(false);
$('whoModal').onclick = e => { if(e.target === $('whoModal')) whoFinish(false); };
// профили
function openStats(tab){
  switchStatsTab(tab || 'workouts');
  goTab('scrStats');
}
function switchStatsTab(tab){
  document.querySelectorAll('#statsTabs .tab').forEach(b => b.classList.toggle('act', b.dataset.tab === tab));
  setShown('tabWorkouts', tab === 'workouts');
  setShown('tabWeight', tab === 'weight');
  setShown('tabPhoto', tab === 'photo');
}
document.querySelectorAll('#statsTabs .tab').forEach(b => b.onclick = ()=> switchStatsTab(b.dataset.tab));

/* Вкладки раздела «Другое». Запоминаем выбранную вкладку: пока приложение
   открыто: если человек ушёл из «Аккаунта» в правила, «назад» должен вернуть его
   именно в «Аккаунт», а не каждый раз сбрасывать на «Профиль». */
let moreTab = 'me';
function switchMoreTab(key){
  if(!['me','sound','coach','acc'].includes(key)) key = 'me';
  moreTab = key;
  document.querySelectorAll('#moreTabs .tab').forEach(b => b.classList.toggle('act', b.dataset.more === key));
  ['me', 'sound', 'coach', 'acc'].forEach(k => setShown('morePane_' + k, k === key));
  if(key === 'coach') refreshTrainerProfile();
  if(key === 'acc') refreshServerSubscription(true).catch(()=>{});
}
document.querySelectorAll('#moreTabs .tab').forEach(b => b.onclick = ()=> switchMoreTab(b.dataset.more));
document.querySelectorAll('.qs-btn').forEach(b => b.onclick = ()=> openStats(b.dataset.tab));
document.querySelectorAll('.dock-btn').forEach(b => b.onclick = ()=> goTab(b.dataset.scr));
$('ueBackTop').onclick = ()=> leaveGuard(userDirty(), ()=> goTab('scrAccount'), t('profile.changes'));
$('btnAddUser').onclick = ()=> openUserEdit();
$('btnSaveUser').onclick = saveUser;
$('btnDelUser').onclick = deleteUser;
// тему показываем сразу: выбирать её вслепую, не видя результата, бессмысленно
document.querySelectorAll('#ueThemeSeg button').forEach(b => {
  b.onclick = ()=>{ uDraft.theme = b.dataset.theme; syncUserForm(); applyThemeFor(uDraft); };
});
$('ueGenderF').onclick = ()=>{ uDraft.gender = 'f'; syncUserForm(); };
$('ueGenderM').onclick = ()=>{ uDraft.gender = 'm'; syncUserForm(); };
// нет фото — сразу выбор файла; есть фото — меню «заменить / удалить»
$('uePhotoBtn').onclick = e => {
  e.stopPropagation();
  if(!uDraft.photo){ $('uePhotoFile').click(); return; }
  const menu = $('uePhotoMenu');
  const wasOpen = menu.classList.contains('open');
  closeAllMenus();
  if(wasOpen) return;
  menu.innerHTML = '';
  const mk = (h, fn, cls)=>{
    const b = document.createElement('button');
    if(cls) b.className = cls;
    b.innerHTML = h;
    b.onclick = ev => { ev.stopPropagation(); closeAllMenus(); fn(); };
    return b;
  };
  menu.append(
    mk(icon('camera') + t('profile.replacePhoto'), ()=> $('uePhotoFile').click()),
    mk(icon('trash') + t('profile.deletePhoto'), ()=>{ uDraft.photo = null; $('uePhotoFile').value = ''; syncUserForm(); }, 'danger')
  );
  menu.classList.add('open');
};

$('uePhotoFile').onchange = e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 240, dataUrl => { uDraft.photo = dataUrl; syncUserForm(); });
};

// переход на видео автоматически ставит тренировку на паузу
$('videoLink').addEventListener('click', ()=>{
  if($('scrWork').classList.contains('on')) setPause(true);
});
// одно слово: на 360 px «поделиться результатом» ломалось на две строки, а капслок
// в две строки внутри кнопки выглядит дёшево. Иконка и контекст экрана объясняют остальное
$('btnShareResult').onclick = shareResult;
$('finNote').oninput = e => { if(state.lastHist) state.lastHist.note = clampText(e.target.value, LIM.note); };
$('finNote').onchange = ()=> { if(state.lastHist) saveStats(); };
// заметка открывается по нажатию: пустое поле ввода не должно быть громче результата
$('finNoteToggle').onclick = ()=>{
  setShown('finNoteToggle', false);
  setShown('finNoteField', true);
  $('finNote').focus();
  // поле не должно остаться под клавиатурой
  setTimeout(()=>{ try{ $('finNote').scrollIntoView({block:'center', behavior:'smooth'}); }catch(e){} }, 260);
};
$('finProgCheckYes').onclick = ()=> applyProgCheck();
$('finProgCheckToggle').onclick = ()=> toggleProgCheckList();
// подсказка прокрутки на экране тренировки
$('scrollCue').innerHTML = icon('chevD');
$('stepDetails').addEventListener('scroll', refreshDetailsFade, {passive:true});
$('btnAgain').onclick = async ()=>{
  // у короткой тренировки это кнопка «Засчитать». Если после засчёта подошла
  // проверка прогресса, остаёмся на экране: иначе вопрос «Всё получилось?»
  // считался бы и тут же пропадал вместе с экраном, так и не показавшись.
  if(state.pendingFinish){
    settleQuickFinish(true);
    if(state.progCheck){
      $('finTitle').textContent = t('workout.great');
      $('btnAgain').className = 'btn-primary';
      $('btnAgain').textContent = t('finish.done');
      return;
    }
  }
  if(state.lastHist){ await saveStats(); state.lastHist = null; } // заметка фиксируется, дальше — только чтение
  document.body.classList.remove('phase-rest');
  goTab('scrMenu');
};
$('btnDiscardResult').onclick = ()=>{
  settleQuickFinish(false);           // ничего не записываем и тренеру не отправляем
  document.body.classList.remove('phase-rest');
  goTab('scrMenu');
};
/* ---- программа из видео ---- */
$('chYT').onclick = ()=>{ $('createModal').classList.remove('open'); openYouTube(); };
$('ytUrl').oninput = ytCheckUrl;
async function ytGuard(){
  const v = ($('ytUrl').value || '').trim();
  if(!v){ appAlert(t('video.addLink')); return false; }
  if(!ytCheckUrl()){
    const go = await appDialog(
      t('video.badUrl'),
      {confirm: true, okText: t('video.tryAnyway'), cancelText: t('video.checkAddress')}
    );
    return !!go;
  }
  return true;
}
async function ytCopyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(youtubePrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
}
async function ytApplyResult(){
  const raw = ($('aiResult').value || '').trim();
  if(!raw){ appAlert(MSG_AI_EMPTY()); return; }
  const kind = aiSrc === 'video' ? 'video.parse' : 'program.create';
  const checked = aiClientVerdict(kind, raw);
  if(!checked) return;
  const {program, errors} = parseProgramText(checked);
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('video.parseProblems') + '\n— ' + errors.join('\n— '));
    return;
  }
  program.id = 'p' + Date.now();
  program.stats = {completions: 0};
  program.locale = appLocale === 'ru' ? 'ru' : 'en';
  program.name = versionedName(program.name || t('video.defaultProgram'));
  // сохраняем ссылку на источник в описании, если ИИ её не упомянул
  const link = ($('ytUrl').value || '').trim();
  if(link && !(program.desc || '').includes('http')){
    program.desc = ((program.desc || '') + ' ' + t('video.source') + ': ' + link).trim().slice(0, 1000);
  }
  customPrograms.push(program);
  await savePrograms();
  trackProductEvent('program_added').catch(()=>{});
  renderMine();
  $('aiResult').value = '';
  goTab('scrPrograms');
  appAlert(t('video.added',{name:program.name}));

}

/* ---- доработка через ИИ ---- */
// «Скопировать саму программу» означает буквально экспорт текущей программы в
// переносимом текстовом формате FitTimer. Никаких системных инструкций и скрытого
// задания здесь нет — полный AI-промт с пожеланием копирует соседняя кнопка.
$('aiCopyFull').onclick = async ()=>{
  const btn = $('aiCopyFull');
  const text = programToText(editAIProg);
  try{
    await navigator.clipboard.writeText(text);
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedRetry')); }
};
async function copyEditPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(editAIPrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
}

$('swapBadge').onclick = openSwapHint;
$('swapOk').onclick = closeSwapHint;
$('swapAI').onclick = swapViaAI;
$('swapModal').onclick = e => { if(e.target === $('swapModal')) closeSwapHint(); };
$('swapCopy').onclick = async ()=>{
  const step = state.steps[state.stepIdx];
  if(!step || !step.swap) return;
  const text = `${step.swap.name}\n${step.swap.desc || ''}`.trim();
  try{
    await navigator.clipboard.writeText(text);
    $('swapCopy').textContent = t('common.copied');
  }catch(e){
    closeSwapHint();
    appAlert(t('common.copyManual'), {code: text});
  }
};

$('btnAddEx').onclick = ()=> $('addExModal').classList.add('open');
$('addExModal').onclick = e=>{ if(e.target === $('addExModal')) $('addExModal').classList.remove('open'); };
$('aemManual').onclick = ()=>{ $('addExModal').classList.remove('open'); addExManual(); };
$('aemAI').onclick = ()=>{ $('addExModal').classList.remove('open'); openExAI(); };

/* ---- окно ожидания генерации ---- */
let aiRunCtl = null, aiRunT0 = 0, aiRunTick = 0, aiRunOnCancel = null, aiRunCancelled = false;
// title — заголовок; onCancel — необязательный колбэк для многошаговых задач (генерация картинок)
function aiRunOpen(title, onCancel){
  aiRunCancelled = false;
  aiRunCtl = ('AbortController' in window) ? new AbortController() : null;
  aiRunOnCancel = onCancel || null;
  $('aiRunTitle').textContent = title || t('ai.workingDefault');
  $('aiRunText').textContent = t('ai.workingLong');
  $('aiRunTimer').textContent = '0:00';
  $('aiRunModal').classList.add('open');
  aiRunT0 = Date.now();
  clearInterval(aiRunTick);
  aiRunTick = setInterval(()=>{
    if(document.hidden) return;
    const s = Math.floor((Date.now() - aiRunT0) / 1000);
    $('aiRunTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}
// сообщение в окне ожидания: показываем, что идёт повторная попытка, а не зависание
function aiRunNote(text){
  const el = $('aiRunText');
  if(el) el.textContent = text;
}
function aiRunClose(){
  clearInterval(aiRunTick); aiRunTick = 0;
  aiRunOnCancel = null;
  $('aiRunModal').classList.remove('open');
}
$('aiRunCancel').onclick = ()=>{
  aiRunCancelled = true;
  try{ if(aiRunCtl) aiRunCtl.abort(); }catch(e){}
  aiRunCtl = null;
  const cb = aiRunOnCancel;
  aiRunClose();
  if(cb) cb();
};

async function aiRetryDialog(error){
  const detail = error && error.message ? error.message : t('common.unknownError');
  return appDialog(
    t('ai.runFailed',{error:detail}) + '\n\n' + t('ai.retryQuestion'),
    {confirm:true,okText:t('ai.retry'),cancelText:t('ai.editRequest')}
  );
}

// собрать ответ через Gemini, сразу применить и вернуться туда, откуда пришли
async function runSelfAI(promptFn, targetId, applyFn, title, kind){
  if(!premiumGate()) return;
  let prompt;
  try{ prompt = promptFn(); }catch(e){ appAlert(t('ai.buildRequestFailed')); return; }
  aiRunOpen(title);
  if(kind === 'video.parse') aiRunNote(t('video.processingSafe'));
  try{
    const text = await callGemini(prompt, aiRunCtl ? aiRunCtl.signal : undefined, kind);
    aiRunClose();
    if($(targetId)){ $(targetId).value = text; autoGrow($(targetId)); }
    await applyFn(); // сам разберёт ответ, покажет итог и вернёт на нужный экран
  }catch(e){
    aiRunClose();
    if(aiRunCancelled) return; // пользователь сам нажал «Отмена» — тогда молча
    // AbortError от сети/серверного таймаута — это ошибка, а не пользовательская
    // отмена. Раньше такой сбой выглядел ровно как «спиннер исчез и ничего нет».
    const retry = await aiRetryDialog(e);
    if(retry) return runSelfAI(promptFn, targetId, applyFn, title, kind);
    // «Изменить запрос» ничего не закрывает и ничего не очищает: человек остаётся
    // на том же AI-экране со всеми выбранными параметрами и текстом запроса.
  }
}
// Один обработчик на все источники: чем собрать промт и чем применить ответ,
// знает таблица AI_SOURCES, а не пять отдельных кнопок.
$('aiSelf').onclick = async ()=>{
  const c = AI_SOURCES[aiSrc];
  if(!c) return;
  if(c.guard && !(await c.guard())) return;
  runSelfAI(c.prompt, 'aiResult', c.apply, aiUiText(c.selfTitle), c.kind);
};
$('aiCopy').onclick = async ()=>{
  const c = AI_SOURCES[aiSrc];
  if(!c) return;
  if(c.guard && !(await c.guard())) return;
  c.copy();
};
$('aiApply').onclick = ()=>{
  const c = AI_SOURCES[aiSrc];
  if(c) c.apply();
};
$('aiBackTop').innerHTML = icon('chevL');
// Вкладка меняет способ, а не то, с чем работает человек: действия над
// упражнением должны быть на месте и здесь.
$('aiMore').innerHTML = icon('more');
$('aiMore').onclick = e => { e.stopPropagation(); toggleMenu($('aiMenu')); };
function buildAiMenu(){
  const box = $('aiMenu'); box.innerHTML = '';
  const mk = (html, fn, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    if(cls) b.className = cls;
    b.innerHTML = html;
    b.onclick = ev => { ev.stopPropagation(); closeAllMenus(); fn(); };
    box.appendChild(b);
  };
  // openBuilder() здесь звать НЕЛЬЗЯ: он перечитывает программу из сохранённых и
  // выбрасывает только что сделанную копию вместе со всей несохранённой правкой
  mk(icon('plus') + t('common.duplicate'), ()=>{ dupExerciseAt(exeIdx); asTab(()=> show('scrBuilder')); });
  mk(icon('trash') + t('common.delete'), async ()=>{
    await delExerciseAt(exeIdx);
    asTab(()=> show('scrBuilder'));
  }, 'danger');
}
$('aiBackTop').onclick = async ()=>{
  const c = AI_SOURCES[aiSrc];
  if(!c) return;
  if(aiScreenDirty(c.dirty)){
    const ok = await appDialog(t('ai.unsavedRequest'),
      {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')});
    if(!ok) return;
  }
  c.back();
};

/* ---- картинки программы ---- */
$('imgBackTop').onclick = ()=> closeImages();
$('imgSelfGen').onclick = ()=> $('imgGenScopeModal').classList.add('open');
$('imgGenScopeModal').onclick = e => { if(e.target === $('imgGenScopeModal')) $('imgGenScopeModal').classList.remove('open'); };
$('imgGenAll').onclick = ()=>{
  $('imgGenScopeModal').classList.remove('open');
  generateAllImagesViaAI('all');
};
$('imgGenMissing').onclick = ()=>{
  $('imgGenScopeModal').classList.remove('open');
  generateAllImagesViaAI('missing');
};
$('imgPromptCopy').onclick = async ()=>{
  const btn = $('imgPromptCopy');
  try{
    await navigator.clipboard.writeText(imagesPromptText());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
};
$('imgDone').onclick = ()=> closeImages();
$('imgPick').onclick = ()=> $('imgFiles').click();
$('imgFiles').onchange = e => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if(!files.length) return;
  const btn = $('imgPick'), restore = btnBusy(btn, t('images.processing',{done:0,total:files.length}));
  shrinkAll(files, 640, list => {
    imgTray = imgTray.concat(list);
    restore();
    renderTray();
    if(list.length) appAlert(t('images.uploaded',{count:list.length}));
  });
};
$('trayAuto').onclick = trayAutoAssign;
$('trayClear').onclick = async ()=>{
  if(!imgTray.length) return;
  const used = trayUsed();
  const removable = imgTray.filter(x => !used.has(x));
  if(!removable.length) return;
  if(!(await appDialog(t('images.removeQuestion'),
    {confirm: true, okText: t('images.removeAction'), cancelText: t('common.keep')}))) return;
  imgTray = imgTray.filter(x => used.has(x));
  renderTray();
};
$('slotModal').onclick = e => { if(e.target === $('slotModal')) $('slotModal').classList.remove('open'); };
$('slotRemove').onclick = ()=>{
  const s = imageSlots()[slotTarget];
  if(s) s.set(null);
  $('slotModal').classList.remove('open');
  renderSlots(); renderTray();   // счётчик «ещё не разложено» считается по местам
};
$('slotFromPhone').onclick = ()=> $('slotFile').click();
$('slotGenerateAI').onclick = generateSlotImageViaAI;
$('slotFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  shrinkImage(f, 640, data => {
    if(!data){ appAlert(t('images.loadFailed')); return; }
    const s = imageSlots()[slotTarget];
    if(s) s.set(data);
    if(!imgTray.includes(data)) imgTray.push(data);
    $('slotModal').classList.remove('open');
    renderTray(); renderSlots();
  });
};

/* ---- переключение способа прямо на экране ---- */
// упражнение: вручную ⇄ через ИИ. Введённое переносится в упражнение по дороге,
// поэтому спрашивать «а точно?» не о чем — ничего не теряется.
document.querySelectorAll('#exModeTabs .tab').forEach(b => {
  b.onclick = ()=>{
    if(b.dataset.m !== 'ai') return;
    document.querySelectorAll('#exModeTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
    if(!exDraft || exIdx < 0) return;
    // Упражнение ещё только заводят — «через ИИ» здесь значит «подбери мне
    // упражнение»: там чипы (формат, уровень, мышцы, инвентарь) и сколько штук.
    // Раньше отсюда вела правка уже существующего, и чипов человек не видел
    // вовсе: до них можно было добраться только кнопкой, которую мы убрали.
    if(exIsNew){
      const wish = $('exName').value.trim();
      dropFreshEx();
      exDraft = null; exIdx = -1; exOrig = '';
      asTab(()=>{ openExAI(); if(wish){ $('exaWish').value = wish; autoGrow($('exaWish')); } });
      return;
    }
    if(!numFieldsOk('scrExercise') || !exNameOk()) return;
    exIsNew = false;
    const list = curPlan().exercises;
    if(list[exIdx]) list[exIdx] = commitExercise();
    const keep = exIdx;
    exDraft = null; exIdx = -1; exOrig = '';
    renderExList();
    asTab(()=> openExEdAI(keep));
  };
});

// действия над открытым упражнением — в меню шапки, как у программы на экране старта
$('exMore').innerHTML = icon('more');
$('exMore').onclick = e => { e.stopPropagation(); toggleMenu($('exMenu')); };
function buildExMenu(){
  const box = $('exMenu'); box.innerHTML = '';
  const mk = (html, fn, cls) => {
    const b = document.createElement('button');
    if(cls) b.className = cls;
    b.innerHTML = html;
    b.onclick = e => { e.stopPropagation(); closeAllMenus(); fn(); };
    box.appendChild(b);
  };
  mk(icon('plus') + t('common.duplicate'), dupExercise);
  mk(icon('trash') + t('common.delete'), delExercise, 'danger');
}

// конструктор: вручную ⇄ через ИИ ⇄ из видео
document.querySelectorAll('#bModeTabs .tab').forEach(b => {
  b.onclick = async ()=>{
    const m = b.dataset.m;
    if(m === 'manual') return;
    const back = ()=> document.querySelectorAll('#bModeTabs .tab')
      .forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
    // редактируем существующую программу → «через ИИ» = доработка этой же программы
    const existing = draft && draft.id && customPrograms.find(p => p.id === draft.id);
    if(programDirty()){
      const go = await appDialog(
        t('builder.unsavedProgram'),
        {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')}
      );
      back();
      if(!go) return;
    } else back();
    if(existing && m === 'text'){ asTab(()=> openEditAI(existing)); return; }
    asTab(()=> switchCreateMode(m));
  };
});

// создание программы: по описанию ⇄ из видео ⇄ вручную
function switchCreateMode(m){
  if(m === 'text'){ initAIForm(); openAI('text'); }
  else if(m === 'video'){ openYouTube(); }
  else if(m === 'manual'){ openBuilder(); window.scrollTo(0, 0); }
}
// Вкладки режима: раньше их было четыре набора с четырьмя почти одинаковыми
// обработчиками. Теперь набор один, кнопки в нём рисуются под источник, а слушает
// их сам контейнер — поэтому обработчик переживает перерисовку.
$('aiTabs').addEventListener('click', async e => {
  const b = e.target.closest('.tab');
  const c = AI_SOURCES[aiSrc];
  if(!b || !c) return;
  const cur = (aiSrc === 'video') ? 'video' : (aiSrc === 'text' ? 'text' : 'ai');
  if(b.dataset.m === cur) return;
  if(aiScreenDirty(c.dirty)){
    const ok = await appDialog(
      t('ai.unsavedSwitch'),
      {confirm: true, okText: t('common.switch'), cancelText: t('common.stay')}
    );
    markAITab();   // подсветку возвращаем на месте, ушёл человек или нет
    if(!ok) return;
  }
  if(b.dataset.m === 'manual'){ asTab(c.manual); return; }
  asTab(()=> switchCreateMode(b.dataset.m));
});
// ручной режим открывает конструктор с активной вкладкой «Вручную».
// Подписи вкладок НЕ меняются от того, новая программа или сохранённая: у
// сохранённой вкладка звалась «Доработать ИИ», а на самом экране ИИ — «Через ИИ»,
// и получалось, что нажал одно, а попал в другое.
function markBuilderTab(){
  const isEdit = !!(draft && draft.id && customPrograms.some(p => p.id === draft.id));
  setShown('bModeTabs', true);
  document.querySelectorAll('#bModeTabs .tab').forEach(x => {
    x.classList.toggle('act', x.dataset.m === 'manual');
    // у существующей программы «из видео» не нужен: он создаёт новую
    if(x.dataset.m === 'video') x.style.display = isEdit ? 'none' : '';
  });
}

/* ---- правка упражнения через ИИ ---- */
async function exeCopyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(exePrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedRetry')); }
}

/* ---- упражнение через ИИ ---- */
async function exaCopyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(exaPrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
}

// Новая строка заводится с рабочими значениями (повторения, 10, один подход) и
// сразу открывается в редакторе: одно голое поле названия посреди списка не даёт
// ничего — упражнение всё равно нужно настроить, а название у него первое поле.
function addExManual(){
  const list = curPlan().exercises;
  const nWarm = list.filter(e => e.warmup).length;
  if(list.length - nWarm >= MAX_MAIN){ appAlert(t('exercise.mainLimitAdd',{count:MAX_MAIN})); return; }
  const ex = blankExercise();
  // наследуем формат, подходы и отдых у предыдущего — при сборке они обычно одинаковые
  const prev = list.filter(e => !e.warmup).slice(-1)[0];
  if(prev){ ex.type = prev.type; ex.sets = prev.sets || 1; ex.rest = prev.rest; ex.value = prev.value; }
  list.push(ex);
  renderExList();
  openExercise(list.length - 1, true);
}

/* ---- экран упражнения ---- */
// Упражнение без названия — пустая строка в списке: по ней ничего не понять ни
// человеку, ни промту, ни экспорту. Поэтому имя обязательно, и спрашиваем о нём
// в момент сохранения, а не молча подставляем «Упражнение 3».
function exNameOk(){
  if($('exName').value.trim()) return true;
  appAlert(t('exercise.nameRequired'));
  $('exName').focus();
  return false;
}
$('exBackTop').onclick = ()=> leaveExercise();
// числовые поля проверяются перед сохранением: неверное значение больше не
// «исправляется» молча в единицу
$('btnSaveEx').onclick = ()=>{ if(numFieldsOk('scrExercise') && exNameOk()) saveExAndBack(); };
[['exValue','range',true],['exSets','int'],['exWeight','dec'],
 ['exStepReps','int'],['exMaxReps','int'],['exStepWeight','dec'],['exMaxWeight','dec'],
 ['exStepTime','int'],['exMaxTime','int']].forEach(([id,k,req])=> guardNum(id,k,req));
['bRoundRest','uePrepSec','ueReadySec','ueSideSec'].forEach(id => guardNum(id,'int'));

// дублируем то, что видно сейчас, вместе с несохранёнными правками формы
function dupExercise(){
  if(!exDraft || exIdx < 0) return;
  exIsNew = false;
  const list = curPlan().exercises;
  const nWarm = list.filter(x => x.warmup).length;
  if(exDraft.warmup ? nWarm >= MAX_WARM : list.length - nWarm >= MAX_MAIN){
    appAlert(exDraft.warmup
      ? t('exercise.warmLimitDuplicate',{count:MAX_WARM})
      : t('exercise.mainLimitDuplicate',{count:MAX_MAIN}));
    return;
  }
  if(!numFieldsOk('scrExercise') || !exNameOk()) return;
  if(list[exIdx]) list[exIdx] = commitExercise();
  list.splice(exIdx + 1, 0, cloneExerciseAsNew(list[exIdx]));
  exDraft = null; exIdx = -1; exOrig = '';
  afterExChange();
}
async function delExercise(){
  if(!exDraft || exIdx < 0) return;
  const nameTxt = (exDraft.name || '').trim() || t('exercise.this');
  if(!(await appDialog(t('exercise.deleteQuestion',{name:nameTxt}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  exIsNew = false;
  curPlan().exercises.splice(exIdx, 1);
  exDraft = null; exIdx = -1; exOrig = '';
  await afterExChange();
}

function saveExAndBack(){
  if(exFromWork){ saveExToWorkout(); return; }
  exIsNew = false;
  if(exDraft && exIdx >= 0){
    const list = curPlan().exercises;
    if(list[exIdx]) list[exIdx] = commitExercise();
  }
  exDraft = null; exIdx = -1; exOrig = '';
  renderExList();
  goBackTo('scrBuilder');
}

// выход без сохранения — с предупреждением, если что-томенялось
async function leaveExercise(){
  if(exDirty()){
    const go = await appDialog(
      exIsNew
        ? t('exercise.newUnsaved')
        : t('exercise.unsaved'),
      {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')}
    );
    if(!go) return;
  }
  dropFreshEx();
  exDraft = null; exIdx = -1; exOrig = '';
  if(exFromWork){ backToWorkout(false); return; }
  renderExList();
  goBackTo('scrBuilder');
}
$('exName').oninput = e => { exDraft.name = e.target.value; };
// «Как считать» (повторения/время) и вес — независимы: переключение одного не
// трогает другое. != null везде вместо простой проверки на «истинность» — иначе
// явный 0 в шаге (значит «эта ось не растёт») JS воспримет как «не задано» и
// подставит дефолт заново
$('exTypeReps').onclick = ()=>{ exDraft.type = 'reps'; syncExType(); };
$('exTypeTime').onclick = ()=>{ exDraft.type = 'time'; syncExType(); };
$('exWeightOn').onclick = ()=>{
  exDraft.trackWeight = !exDraft.trackWeight;
  if(exDraft.trackWeight && exDraft.wStep == null) exDraft.wStep = 2;
  syncExType();
};

$('exProgToggle').onclick = ()=>{
  const box = $('exProgBox'), open = box.classList.contains('hidden');
  setShown(box, open);
  $('exProgToggle').classList.toggle('open', open);
};
$('exProgOn').onclick = ()=>{
  const on = !$('exProgOn').classList.contains('on');
  exDraft.progOn = on;
  if(on){
    // включили — проставляем дефолтный шаг для текущего формата, если его ещё вообще не было
    if(hasWeight(exDraft) && exDraft.wStep == null) exDraft.wStep = 2;
    if(exDraft.type !== 'time' && exDraft.repsStep == null) exDraft.repsStep = hasWeight(exDraft) ? 0 : 1;
    if(exDraft.type === 'time' && exDraft.timeStep == null) exDraft.timeStep = 5;
  }
  ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
  renderProgControls();
  syncExDetailsSum();
};
['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => {
  $(id).oninput = ()=>{ $(id).dataset.touched = '1'; syncExProgSum(); syncExNowHints(); };
});
// база поменялась — итог пересчитывается тут же, иначе подсказка врёт до сохранения
['exValue','exWeight'].forEach(id => $(id).addEventListener('input', syncExNowHints));
$('exDual').onclick = ()=>{
  exDraft.dualProg = !exDraft.dualProg;
  $('exDual').classList.toggle('on', exDraft.dualProg);
  syncExDetailsSum();
};
$('exSwapOn').onclick = ()=>{
  exDraft.swapOn = !exDraft.swapOn;
  $('exSwapOn').classList.toggle('on', exDraft.swapOn);
  setShown('exSwapBox', exDraft.swapOn);
  if(exDraft.swapOn) autoGrow($('exSwapDesc'));
};
$('exSwapName').oninput = e => { exDraft.swapName = e.target.value; };
$('exSwapDesc').oninput = e => { exDraft.swapDesc = e.target.value; };
$('exWarm').onclick = ()=>{
  const list = curPlan().exercises;
  const nWarm = list.filter((e, i) => e.warmup && i !== exIdx).length;
  const nMain = list.filter((e, i) => !e.warmup && i !== exIdx).length;
  if(!exDraft.warmup && nWarm >= MAX_WARM){ appAlert(t('exercise.warmMax',{count:MAX_WARM})); return; }
  if(exDraft.warmup && nMain >= MAX_MAIN){ appAlert(t('exercise.mainMax',{count:MAX_MAIN})); return; }
  exDraft.warmup = !exDraft.warmup;
  $('exWarm').classList.toggle('on', exDraft.warmup);
  if(exDraft.warmup) exDraft.sets = 1;
  syncExWarm();
  renderProgControls(); // разминка блокирует «усложнять со временем» — обновляем сразу
};
$('exSide').onclick = ()=>{ exDraft.perSide = !exDraft.perSide; $('exSide').classList.toggle('on', exDraft.perSide); };
$('exDesc').oninput = e => { exDraft.desc = e.target.value; syncExDetailsSum(); };
$('exMistakes').oninput = e => { exDraft.mistakes = e.target.value; syncExDetailsSum(); };
$('exVideo').oninput = e => { exDraft.video = e.target.value; syncExDetailsSum(); };
$('exDetailsToggle').onclick = ()=>{
  const box = $('exDetailsBox'), open = box.classList.contains('hidden');
  box.classList.toggle('hidden', !open);
  $('exDetailsToggle').classList.toggle('open', open);
  if(open){ autoGrow($('exDesc')); autoGrow($('exMistakes')); }
};
$('exMediaBtn').onclick = ()=> $('exMediaFile').click();
$('exMediaNone').onclick = ()=>{
  dropExMedia(exDraft);
  $('exMediaFile').value = '';
  renderExMedia(); syncExDetailsSum();
};
// картинка упражнения через ИИ — по тому, что уже набрано в форме
$('exMediaAI').onclick = ()=>{
  const item = exImageItem(Object.assign({}, exDraft, {
    name:$('exName').value, desc:$('exDesc').value
  }));
  generateOneImageViaAI('ex', item, item.name, data => {
    setExImg(exDraft, data);
    renderExMedia(); syncExDetailsSum();
  });
};
$('exMediaFile').onchange = e => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 640, data => {
    if(!data){ appAlert(t('images.loadFailed')); return; }
    setExImg(exDraft, data);
    renderExMedia(); syncExDetailsSum();
  });
};

/* ---- сворачивание настроек программы ---- */
$('bImagesRow').onclick = ()=>{ if(premiumGate()) openImages(); };
$('bSettingsToggle').onclick = ()=>{
  syncRotateUI();
  fillPlanFields();
  show('scrProgSettings');
  window.scrollTo(0, 0);
};
function closeProgSettings(){
  commitPlanFields();
  draft.desc = clampText($('bDesc').value, LIM.progDesc);
  draft.name = clampLine($('bName').value, LIM.progName) || draft.name;
  syncSettingsSum();
  renderExList();
  goBackTo('scrBuilder');
}
$('psBackTop').onclick = closeProgSettings;
$('btnPsDone').onclick = ()=>{ if(numFieldsOk('scrProgSettings')) closeProgSettings(); };
function syncImagesSum(){
  const el = $('bImagesSum');
  if(!el || !draft) return;
  let total = 0, filled = 0;
  (draft.plans || []).forEach(pl => (pl.exercises || []).forEach(ex => {
    total++;
    if(ex.media && ex.media.kind === 'img') filled++;
  }));
  el.textContent = filled
    ? t('images.summaryFilled',{filled,total})
    : t('images.summaryEmpty',{total});
}
// Сводка говорит, что НАСТРОЕНО, а не как называются поля внутри. Круги и отдых
// между ними здесь обязательны: это первое, что человек хочет проверить перед
// стартом, а раньше их приходилось искать, открыв настройки.
function syncSettingsSum(){
  const bits = [];
  const plans = draft.plans || [];
  const pl = curPlan();
  const daysU = programDaysUnion(draft);
  if(daysU.length) bits.push(daysU.map(canonicalLabel).join('·'));
  else if(draft.rotate) bits.push(t('programs.sequence'));
  else bits.push(t('builder.anyDays'));
  if(draft.time) bits.push(draft.time);
  if(plans.length > 1) bits.push(storeCountText(plans.length,'variant'));
  const rounds = (pl && +pl.rounds) || 1;
  bits.push(storeCountText(rounds,'round'));
  const rr = (pl && +pl.roundRest) || 0;
  if(rounds > 1 && rr > 0) bits.push(t('builder.restSummary',{time:(rr % 60 === 0 ? (rr / 60) + ' ' + t('store.minuteShort') : rr + ' ' + t('store.secShort'))}));
  if(draft.progression) bits.push(t('builder.progressionAuto'));
  $('bSettingsSum').textContent = bits.join(' · ');
}
$('bTime').oninput = ()=>{ draft.time = $('bTime').value || ''; syncSettingsSum(); };
$('bDesc').oninput = e => {
  draft.desc = clampText(e.target.value, LIM.progDesc);
  $('bDescCount').textContent = draft.desc.length;
};
$('btnSaveProgram').onclick = ()=>{ if(numFieldsOk('scrBuilder')) saveProgram(); };
$('builderBackTop').onclick = ()=> leaveGuard(programDirty(), ()=>{ clearSnap('program'); goTab('scrPrograms'); }, t('builder.programChanges'));
// обложка программы
$('bCoverBtn').onclick = ()=> $('bCoverFile').click();
$('bCoverNone').onclick = ()=>{ draft.cover = null; $('bCoverFile').value=''; syncCover(); };
$('bCoverAI').onclick = ()=> generateOneImageViaAI('cover', null, t('images.coverProgram'), data => {
  draft.cover = data; $('bCoverFile').value = ''; syncCover();
});
$('bCoverFile').onchange = e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 320, dataUrl => { draft.cover = dataUrl; syncCover(); });
};
// сброс счётчика прохождений (в редактировании программы)
// сброс общего времени тренировок
// Кнопка называлась «сбросить общее время и счётчик», а стирала ВСЮ историю —
// вместе с календарём, неделями, сериями и достижениями. Теперь говорит правду
// и требует набрать фразу: восстановить это неоткуда.
$('btnResetTotal').onclick = async ()=>{
  const ok = await appDialog(
    t('stats.clearQuestion'),
    {confirm: true, okText: t('stats.clear'), cancelText: t('common.cancel'), type: t('account.deleteConfirmPhrase')}
  );
  if(!ok) return;
  stats.totalSec = 0;
  stats.count = 0;
  stats.history = [];
  await saveStats();
  renderStats();
};

let releaseResumeAt = Date.now();
async function refreshAfterForeground(){
  const now = Date.now();
  if(now - releaseResumeAt < 60000) return;
  releaseResumeAt = now;
  loadPublicConfig();
  refreshServerSubscription(true).catch(()=>{});
  if(account && account.email && account.syncToken){
    connectAccountSync().catch(()=>{});
    refreshTrainerProfile().catch(()=>{});
  }
  syncNativeNotifications().catch(()=>{});
}

document.addEventListener('visibilitychange', ()=>{
  const inWorkout = $('scrWork').classList.contains('on');
  if(document.visibilityState !== 'visible'){
    releaseWake();
    stopHandsFree();
    try{ if(audioCtx && audioCtx.state === 'running') audioCtx.suspend(); }catch(e){}
    stopSpeech();
    return;
  }
  if(inWorkout){
    keepAwake();
    try{ if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }catch(e){}
    startHandsFree();
  }
  refreshAfterForeground().catch(()=>{});
  // Сами таймеры считают по Date.now и дедлайнам. В фоне ресурсы освобождаем, а
  // при возврате первый тик сразу догонит прошедшее время.
});

// статичные иконки
$('btnPause').innerHTML = icon('pause');
$('btnMicW').innerHTML = icon('mic');
// каталог, а не магазин: сумка для покупок обещает кассу, которой здесь нет
$('storeIcoMenu').innerHTML = $('storeIcoProg').innerHTML = icon('book');
$('storeArrowMenu').innerHTML = $('storeArrowProg').innerHTML = icon('chevR');
$('storeBackTop').innerHTML = icon('chevL');
$('siBackTop').innerHTML = icon('chevL');
$('storeSearchIco').innerHTML = icon('search');
$('storeClear').innerHTML = icon('close');
$('btnResetTotal').innerHTML = icon('reset');
$('btnAddWeight').innerHTML = icon('plus');
$('btnAddWell').innerHTML = icon('plus');
$('qsIco1').innerHTML = icon('chart');
$('qsIco2').innerHTML = icon('weight');
$('qsIco3').innerHTML = icon('camera');
// Кнопки «иконка + подпись» задаются кодом, а не data-i18n (иконку applyI18n стёр бы).
// Раньше подпись ставилась один раз при запуске и при смене языка оставалась прежней:
// экран результата выходил английским, а «Поделиться» — русским.
function renderIconLabels(){
  $('btnAddProgram').innerHTML = icon('plus') + '<span>' + esc(t('programs.newShort')) + '</span>';
  $('btnShareResult').innerHTML = icon('share') + '<span>' + esc(t('finish.share')) + '</span>';
  $('finNoteToggle').innerHTML = icon('pencil') + '<span>' + esc(t('finish.addNote')) + '</span>';
  $('btnAddPhoto').innerHTML = icon('camera') + esc(t('progress.addPhoto'));
  $('btnCompare').innerHTML = icon('image') + esc(t('progress.comparePhotos'));
  $('btnDeleteAllPhotos').innerHTML = icon('trash') + esc(t('progress.deleteAllPhotosBtn'));
}
renderIconLabels();
window.addEventListener('appLocaleChanged', renderIconLabels);
$('btnResume').innerHTML = icon('play');
$('calPrev').innerHTML = icon('chevL');
$('calNext').innerHTML = icon('chevR');
$('ueBackTop').innerHTML = icon('chevL');
$('builderBackTop').innerHTML = icon('chevL');
$('exBackTop').innerHTML = icon('chevL');
$('bSettingsChev').innerHTML = icon('chevR');
$('psBackTop').innerHTML = icon('chevL');
$('imgBackTop').innerHTML = icon('chevL');
$('bImagesChev').innerHTML = icon('chevR');
$('exDetailsChev').innerHTML = icon('chevR');
$('exProgChev').innerHTML = icon('chevR');
$('startBackTop').innerHTML = icon('chevL');
$('legalBackTop').innerHTML = icon('chevL');
// экраны запроса к ИИ: одна регистрация на экран
[{screen:'scrAI', answer:'aiAnswer', actions:'aiActions', result:'aiResult', copy:['aiCopy', 'aiCopyFull']},
 {screen:'scrImages'}].forEach(setupAIAnswer);

// иконки прямо в разметке: <span data-icon="copy"></span> — один проход на весь документ,
// чтобы не заводить по строке JS на каждую новую кнопку
document.querySelectorAll('[data-icon]').forEach(el => {
  const n = el.dataset.icon;
  if(ICONS[n]) el.innerHTML = icon(n);
});

/* ---- витрина «Сегодня»: мягкий паралакс блика на прокрутке ----
   Единственная задача движения — показать, что страница длиннее экрана.
   При prefers-reduced-motion блик стоит на месте (см. стили). */
(function(){
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce) return;
  let tick = false;
  window.addEventListener('scroll', ()=>{
    if(tick) return;
    tick = true;
    requestAnimationFrame(()=>{
      tick = false;
      if(show._last !== 'scrMenu') return;
      const el = $('scGlow');
      if(el) el.style.setProperty('--par', Math.min(90, window.scrollY * 0.28) + 'px');
    });
  }, {passive: true});
})();

// стартовое состояние навигации: «Сегодня» с доком внизу
show('scrMenu', false);

// параметры запуска: ?import=FIT1..., /p/<id> (legacy ?p=<id>) и ярлыки ?today / ?create
let pendingImport = null;
let pendingLink = null;
let pendingNativeLink = null;
let pendingNativeWorkoutResume = false;
let workoutResumeReady = false;
let programLinksReady = false;
let pendingAction = null;

window.addEventListener('fitWorkoutResumeRequest', ()=>{
  try{
    if(window.FitNative && window.FitNative.consumeWorkoutResume) window.FitNative.consumeWorkoutResume();
  }catch(_){}
  if(workoutResumeReady){
    resumeWorkoutFromNativeNotification().catch(()=>{});
    return;
  }
  pendingNativeWorkoutResume = true;
});

window.addEventListener('fitProgramLink', e => {
  const id = String((e && e.detail && e.detail.id) || '');
  if(!/^[0-9a-z]{4,16}$/.test(id)) return;
  try{
    if(window.FitNative && window.FitNative.consumeProgramLink) window.FitNative.consumeProgramLink();
  }catch(_){}
  if(programLinksReady){
    importProgramLink(id);
    return;
  }
  pendingNativeLink = id;
});

try{
  const sp = new URLSearchParams(location.search);
  const q = sp.get('import');
  if(q && q.startsWith('FIT1.')) pendingImport = q;
  const pathLink = String(location.pathname || '').match(/^\/p\/([0-9a-z]{4,16})\/?$/);
  if(pathLink) pendingLink = pathLink[1];
  const sp_p = sp.get('p');
  if(!pendingLink && sp_p && /^[0-9a-z]{4,16}$/.test(sp_p)) pendingLink = sp_p;
  if(sp.has('today')) pendingAction = 'today';
  if(sp.has('create')) pendingAction = 'create';
  if(pendingImport || pendingLink || pendingAction){
    history.replaceState({scr: 'scrMenu'}, '', '/'); // чистим адрес после разбора ссылки
  }
  if(window.FitNative && window.FitNative.consumeProgramLink){
    const nativeId = String(window.FitNative.consumeProgramLink() || '');
    if(/^[0-9a-z]{4,16}$/.test(nativeId)) pendingNativeLink = nativeId;
  }
  if(window.FitNative && window.FitNative.consumeWorkoutResume){
    pendingNativeWorkoutResume = !!window.FitNative.consumeWorkoutResume();
  }
}catch(e){}

(async ()=>{
  // Замок обязан появиться раньше, чем под ним что-то отрисуется, а общее чтение
  // аккаунта асинхронное. Поэтому признак замка снимаем синхронно, до первого await.
  try{
    const raw = localStorage.getItem('account');
    const saved = raw && JSON.parse(raw);
    if(window.FitNative && window.FitNative.isNative
      && saved && saved.biometry && saved.biometry.enabled && saved.biometry.kind === 'native'){
      $('lockModal').classList.add('open');
    }
  }catch(e){}
  // Язык нужен до онбординга и первой отрисовки экранов.
  await loadAppLocale();
  trackInstallOnce().catch(()=>{});
  // Аккаунт не переопределяет язык устройства: по умолчанию приложение всегда
  // следует системе. account.locale нужен серверу и письмам как эффективный язык.
  await loadAccount();
  // Старый TWA/WebAuthn credential относится к прежнему browser origin и не
  // переносится в локальный Capacitor runtime. Снимаем старый флаг один раз:
  // пользователь сможет включить новую нативную защиту в настройках.
  if(account && account.biometry && account.biometry.enabled && account.biometry.kind !== 'native'){
    account.biometry = null;
    rememberAccount();
    await saveAccount();
    await saveKnown();
    $('lockModal').classList.remove('open');
  }
  loadPublicConfig();
  syncRemotePushRegistration(false).catch(()=>{});
  bioOK = await bioSupported();
  if(lockNeeded()) openLock();
  // пользователи: миграция со старой схемы профилей f/m
  try{ users = JSON.parse(await kvGet('users')) || []; }catch(e){ users = []; }
  const hadLegacyBirth = users.some(u => u && Object.prototype.hasOwnProperty.call(u, 'birth'));
  let migratedProfilePrefs = false;
  users.forEach(u => {
    migrateUserAge(u);
    if(!['system','ru','en'].includes(u && u.locale)){
      u.locale = 'system';
      migratedProfilePrefs = true;
    }
  });
  if(hadLegacyBirth || migratedProfilePrefs) await saveUsers();
  if(!users.length){
    // старые данные есть — тихая миграция; совсем чистая установка — онбординг
    const hasLegacy = (await kvGet('customPrograms_f')) !== null
      || (await kvGet('customPrograms')) !== null
      || (await kvGet('migrated')) === '1';
    if(!hasLegacy){
      voiceWanted = false; soundOn = true;
      musicMode = false;
      syncPrefs();
      applyThemeFor({theme:'system'});
      document.body.classList.remove('booting');
      startOnboarding();
      return;
    }
    users = [{id:'f', name:t('profile.defaultNumber',{count:1}), gender:'f', age:null, photo:null, theme:'system', locale:'system'}];
    if((await kvGet('customPrograms_m')) !== null){
      users.push({id:'m', name:t('profile.defaultNumber',{count:2}), gender:'m', age:null, photo:null, theme:'system', locale:'system'});
    }
    await saveUsers();
  }
  currentUser = (await kvGet('currentUser')) || (await kvGet('profile')) || users[0].id;
  if(!users.some(u => u.id === currentUser)) currentUser = users[0].id;
  // До первой динамической отрисовки включаем язык и тему активного профиля:
  // пользователь не должен видеть дефолтный экран, пока восстанавливается его состояние.
  await setAppLocale(profileLocalePreference(curUser()), {persist:false, silent:true});
  applyThemeFor(curUser());
  await loadIdentity();
  await loadData();
  await loadPhotos();
  await ensureWarmup();
  applyProgressionAll();
  renderUsers();
  renderMine();
  renderStats();
  renderWeight();
  renderWellness();
  renderPhotos();
  // scrMenu показывается ещё до асинхронной загрузки данных. После загрузки
  // обязательно собираем его повторно, иначе на чистом/медленном старте часть
  // карточек остаётся в состоянии до loadData().
  renderGreeting();
  renderToday();
  checkSchedules();
  // Критичные локальные данные уже восстановлены — дальше идут только второстепенные
  // настройки и сеть, поэтому основной интерфейс можно показать без дефолтного флэша.
  document.body.classList.remove('booting');
  const hasScheduledWorkout = customPrograms.some(p => p && p.id !== 'warmup'
    && progActive(p) && planDays(p).length);
  if(hasScheduledWorkout && getNotificationPrefs().workouts !== false && window.FitNative && window.FitNative.requestNotifications){
    window.FitNative.requestNotifications().then(ok => { if(ok) syncNativeNotifications(); });
  } else syncNativeNotifications();
  hfMode = (await kvGet('hfMode')) || (((await kvGet('voiceCtl')) === '1' && !!SR) ? 'voice' : 'off');
  // Удалённый режим мог остаться в старой резервной копии или localStorage.
  if(!['off', 'voice', 'headset'].includes(hfMode)){
    hfMode = 'off';
    kvSet('hfMode', 'off');
  }
  voiceWanted = hfMode === 'voice';
  syncHandsFreeUI();
  soundOn = (await kvGet('soundOff')) !== '1';
  voiceLang = localeTag();
  savedVoiceURI = (await kvGet('voiceURI')) || '';
  recognitionLang = (await kvGet('recognitionLang')) || appLocale;
  if(!['ru','en'].includes(recognitionLang)) recognitionLang='ru';
  musicMode = (await kvGet('musicMode')) === '1';
  applyAudioFromUser(curUser());
  await syncTtsLocaleToApp(false);
  await refreshVoicePackUI();
  syncPrefs();
  const u = curUser();
  applyThemeFor(u);
  syncSettingsForm();

  // Only now are profile/program/session data and workout preferences ready. A notification
  // tap can restore locally without waiting for subscription/trainer network requests.
  workoutResumeReady = true;
  if(pendingNativeWorkoutResume){
    pendingNativeWorkoutResume = false;
    await resumeWorkoutFromNativeNotification();
  } else if(window.FitNative && window.FitNative.isNative && window.FitNative.clearWorkoutState){
    // If Android/iOS kept a native surface but there is no matching saved session, it is stale.
    const bootSession = await loadSession();
    if(!bootSession) window.FitNative.clearWorkoutState();
  }

  // Серверное состояние обновляем уже поверх готового локального интерфейса.
  await refreshServerSubscription(true);
  if(account.email && account.syncToken){
    await connectAccountSync();
    await refreshTrainerProfile();
  }
  programLinksReady = true;
  if(pendingImport){
    importProgramCode(pendingImport);
    pendingImport = null;
    return;
  }
  if(pendingLink){
    const id = pendingLink;
    pendingLink = null;
    importProgramLink(id);
    return;
  }
  if(pendingAction === 'today'){
    pendingAction = null;
    // ярлык «Тренировка дня»: открываем сегодняшнюю невыполненную, иначе первую по расписанию
    const today = DAYS[(new Date().getDay() + 6) % 7];
    const doneT = new Set(stats.history.filter(h => h.d === localISO(new Date())).map(h => h.pid));
    const sched = customPrograms.filter(p => planDays(p).includes(today));
    const pick = sched.find(p => !doneT.has(p.id)) || sched[0];
    if(pick){ openStart(pick); return; }
  }
  if(pendingAction === 'create'){
    pendingAction = null;
    $('createModal').classList.add('open');
  }
})();

