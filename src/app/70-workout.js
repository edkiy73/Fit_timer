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
  show('scrWork');
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
  } else {
    const pausedFor = Date.now() - state.pausedAt;
    state.pausedTotal += pausedFor;
    if(state.stepDeadline) state.stepDeadline += pausedFor;
    state.paused = false;
    const step = state.steps[state.stepIdx];
    if(step && step.phase === 'rest' && state.remaining > 0 && window.FitNative){
      window.FitNative.scheduleRest(state.remaining);
    }
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
function startWorkout(fromIdx, elapsed){
  trackProductEvent('workout_started').catch(()=>{});
  initAudio(); keepAwake();
  if(window.FitNative) window.FitNative.requestNotifications();
  try{ if('speechSynthesis' in window) speechSynthesis.getVoices(); }catch(e){} // прогрев списка голосов
  state.steps = buildSteps();
  state.live = true;   // тренировка идёт: на неё можно вернуться жестом «назад»
  state.stepIdx = Math.min(Math.max(0, parseInt(fromIdx) || 0), Math.max(0, state.steps.length - 1));
  state.resumeElapsed = Math.max(0, parseInt(elapsed) || 0);
  show('scrWork');
  startHandsFree();
  // отсчёт 5..1 перед стартом
  const ov = $('prepOverlay');
  $('prepTitle').textContent = state.current.title;
  let n = Math.max(0, prepSec);
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
    state.remaining = step.seconds;
    cd.innerHTML = tnum(fmt(state.remaining));
    cd.classList.remove('warn');
    const launch = ()=>{
      state.stepDeadline = Date.now() + state.remaining * 1000;
      if(step.phase === 'rest' && window.FitNative){
        window.FitNative.scheduleRest(state.remaining);
      }
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
  $('swapModal').classList.add('open');
}
function closeSwapHint(){ $('swapModal').classList.remove('open'); }

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
  // новое упражнение начинает с собственной базы, а не с двадцатого шага программы
  got.progFrom = progSteps(src.p);
  if(!got.media) got.media = null;          // картинка от прежнего движения только запутает
  src.plan.exercises[src.idx] = got;
  // ручная поправка веса относилась к прежнему упражнению — новому она не подходит
  delete progWeights[exWeightKey(src.p.id, got.name)];
  saveProgWeights();
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
  setPause(false);
  stopHandsFree();
  stopSpeech();
  clearSession(); // тренировка пройдена до конца — продолжать больше нечего
  // Заметка на экране результата пишется в state.lastHist. Пока эта тренировка не
  // записана, там не должна висеть запись прошлой — иначе заметка уехала бы в неё.
  state.lastHist = null;
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

