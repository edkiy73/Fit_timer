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
  if(planDays(draft).length){
    FitTimerModules.runtimeCompat.requestNotifications().then(ok => { if(ok) syncNativeNotifications(); });
  }
  if(anyTime && planDays(draft).length && 'Notification' in window && Notification.permission === 'default'){
    try{ Notification.requestPermission(); }catch(e){}
  }
  renderMine();
  syncNativeNotifications();
  goTab('scrPrograms');
}

