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
  const productUi = window.FIT_TIMER_CONFIG && window.FIT_TIMER_CONFIG.brand && window.FIT_TIMER_CONFIG.brand.ui;
  const productTheme = productUi && productUi[themeLight ? 'light' : 'dark'];
  if(productTheme){
    AppBaseUI.applyCssVars(document.body, {
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
  const running = !!(status && ['queued','downloading','extracting'].includes(status.status));
  for(const row of [
    ['voicePackStatus','btnVoicePack','voicePackProgress','voicePackProgressBar'],
    ['hfVoicePackStatus','btnHfVoicePack','hfVoicePackProgress','hfVoicePackProgressBar']
  ]){
    const s=$(row[0]), b=$(row[1]), p=$(row[2]), bar=$(row[3]); if(!s||!b) continue;
    s.textContent=label;
    AppBaseUI.setBusy(b, running, {busyText:button, idleText:button, disabled});
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
  for(const id of ['btnVoicePack','btnHfVoicePack']){
    AppBaseUI.setBusy($(id), true, {busyText:t('voicepack.downloadingBtn')});
  }
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

