/* Прогрессия — состояние у КАЖДОГО упражнения (ex.ps), а не один счётчик на
   программу. Раньше при чередовании вариантов A/Б упражнение варианта А
   получало +1 шаг за КАЖДУЮ тренировку программы, включая дни варианта Б, и
   росло вдвое быстрее задуманного (см. docs/ai-edit-progression-plan.md,
   пачка 3). Здесь — прямые unit-тесты на чистых функциях 60-builder.js, без
   браузера: загружаем только парсер/прогрессию, DOM затычки минимальны.

   Запуск:  node tests/progression-per-exercise-unit.js */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');

let bad = 0;
function need(cond, msg){
  if(!cond){ bad++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

global.FitAIProtocol = require(path.join(root, 'lib/ai-protocol.js'));
global.clampLine = (s,n)=>String(s||'').slice(0,n||9999);
global.clampText = (s,n)=>String(s||'').slice(0,n||9999);
global.cleanLink = s => /^https?:\/\//i.test(s||'') ? s : '';
global.cleanPic = () => null;
global.LIM = {exName:120,exDesc:600,exMistakes:300,exSwapName:60,exSwapDesc:600,exValue:20,wish:2000};
global.MUSCLES = [['glutes','Ягодицы']];
global.M_LABEL = {glutes:'Ягодицы'};
global.DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
global.plural = (n,a,b,c)=> n%10===1&&n%100!==11 ? a : (n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14) ? b : c);
global.clampProgEvery = n => Math.max(1, Math.min(30, n));
global.appLocale = 'ru';
global.t = (key, vars = {}) => {
  if(key === 'builder.dualShort') return `+${vars.reps} повт. до ${vars.max} → +${vars.weight} кг`;
  if(key === 'store.repShort') return 'повт.';
  if(key === 'store.secShort') return 'сек';
  if(key === 'progress.kg') return 'кг';
  if(key === 'builder.progressionAuto') return 'нагрузка растёт сама';
  return key;
};
const stubEl = () => ({ value:'', classList:{add(){},remove(){},contains(){return false;}}, style:{}, textContent:'', addEventListener(){}, appendChild(){}, options:[] });
global.$ = stubEl;
global.document = { createElement: stubEl, body:{style:{}}, querySelectorAll(){return [];}, querySelector(){return null;}, addEventListener(){} };
global.window = { addEventListener(){}, removeEventListener(){} };
global.navigator = { vibrate(){} };
global.customPrograms = [];
global.normPlans = p => (Array.isArray(p.plans) && p.plans.length)
  ? p.plans
  : [{days:p.days||[], rounds:p.rounds||3, roundRest:(p.roundRest===undefined?120:p.roundRest), exercises:p.exercises||[]}];
global.sanitizeExercise = ex => { if(!ex.id) ex.id = newExId(); };
global.sanitizeProgram = p => { (p.plans||[]).forEach(pl => (pl.exercises||[]).forEach(sanitizeExercise)); return p; };
global.savePrograms = async () => {};

// 60-builder.js — ES-модуль: для eval убираем import-строки и слово export
const builderSrc = fs.readFileSync(path.join(root, 'src/app/60-builder.js'), 'utf8')
  .replace(/^import [\s\S]*?from '[^']+';\n/gm, '')
  .replace(/^export /gm, '');
eval(builderSrc.slice(0, builderSrc.indexOf('async function pregnancyWarning')));

function mkEx(name, opts){
  return normalizeExercise(Object.assign(blankExercise(), {name, sets:3, rest:60}, opts || {}));
}
// имитирует то, что commitFinish() (70-workout.js) делает по каждому
// выполненному упражнению варианта после тренировки
function runWorkout(exercises, every){
  exercises.forEach(ex => {
    if(ex.warmup || progAxis(ex) === 'none') return;
    ensurePs(ex).n++;
    if(ex.ps.n >= every){ advanceExerciseProgression(ex); ex.ps.n = 0; }
  });
}

/* ---- частота прогрессии: упражнение переопределяет программу ---- */
{
  const inherited = mkEx('Наследует', {progOn:true, repsStep:1, progEvery:null});
  const custom = mkEx('Своя частота', {progOn:true, repsStep:1, progEvery:2});
  const off = mkEx('Отключено', {progOn:true, repsStep:1, progEvery:0});
  need(exerciseProgEvery(inherited, {progression:4}) === 4, 'empty exercise frequency inherits program default');
  need(exerciseProgEvery(custom, {progression:4}) === 2, 'exercise frequency overrides program default');
  need(exerciseProgEvery(off, {progression:4}) === 0, 'exercise frequency 0 disables progression');
  need(exerciseProgEvery(custom, {progression:0}) === 2, 'positive exercise override works even when program default is off');
}
{
  const parsed = parseProgramText(`ПРОГРАММА: Частоты
ПРОГРЕССИЯ: 4
ДЕНЬ: Пн
КРУГИ: 1
ОТДЫХ МЕЖДУ КРУГАМИ: 30
УПРАЖНЕНИЕ: Своя
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 10
ПОДХОДЫ: 1
ОТДЫХ: 30
УСЛОЖНЯТЬ: да
ЧАСТОТА ПРОГРЕССИИ: 2
ШАГ: 1
ПОТОЛОК: 15
УПРАЖНЕНИЕ: Без прогрессии
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 10
ПОДХОДЫ: 1
ОТДЫХ: 30
УСЛОЖНЯТЬ: да
ЧАСТОТА ПРОГРЕССИИ: 0
ШАГ: 1
ПОТОЛОК: 15`);
  const p = parsed.program || parsed;
  const list = normPlans(p)[0].exercises;
  need(list[0].progEvery === 2, 'parser keeps per-exercise progression frequency');
  need(list[1].progEvery === 0, 'parser keeps explicit zero progression frequency');
}

/* ---- normalization adapter: legacy → единая semantic strategy ---- */
{
  const reps = mkEx('Повторы', {value:'10-12', type:'reps', progOn:true, trackWeight:false,
    repsStep:1, repsMax:20});
  const s = getProgressionStrategy(reps, {progression:4});
  need(s.enabled && s.every === 4 && s.metric === 'reps' && s.loadType === 'none' && s.mode === 'reps',
    'strategy adapter infers reps-only and program frequency: ' + JSON.stringify(s));
}
{
  const weight = mkEx('Вес', {value:'10', type:'reps', progOn:true, trackWeight:true,
    weight:10, repsStep:0, wStep:2, weightMax:30});
  const s = getProgressionStrategy(weight, {progression:3});
  need(s.enabled && s.loadType === 'weight' && s.mode === 'weight' && s.weight.step === 2,
    'strategy adapter infers weight-only: ' + JSON.stringify(s));
}
{
  const dual = mkEx('Двойная', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:10, repsStep:1, repsMax:14, wStep:2, weightMax:30, dualProg:true});
  const s = getProgressionStrategy(dual, {progression:2});
  need(s.mode === 'double_range' && s.reps.step === 1 && s.weight.step === 2,
    'strategy adapter infers double_range: ' + JSON.stringify(s));
}
{
  const timed = mkEx('Планка', {value:'30', type:'time', progOn:true, trackWeight:false,
    timeStep:5, timeMax:60});
  const s = getProgressionStrategy(timed, {progression:2});
  need(s.mode === 'time' && s.metric === 'time' && s.time.step === 5,
    'strategy adapter infers time-only: ' + JSON.stringify(s));
}
{
  const parallel = mkEx('Обе оси', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:10, repsStep:1, repsMax:15, wStep:2, weightMax:30, dualProg:false});
  const s = getProgressionStrategy(parallel, {progression:2});
  need(s.mode === 'parallel' && s.reps.step === 1 && s.weight.step === 2,
    'strategy adapter preserves legacy reps+weight simultaneous growth: ' + JSON.stringify(s));
}
{
  const parallelTime = mkEx('Время и вес', {value:'30', type:'time', progOn:true, trackWeight:true,
    weight:10, timeStep:5, timeMax:60, wStep:2, weightMax:30});
  const s = getProgressionStrategy(parallelTime, {progression:2});
  need(s.mode === 'parallel' && s.metric === 'time' && s.time.step === 5 && s.weight.step === 2,
    'strategy adapter preserves legacy time+weight simultaneous growth: ' + JSON.stringify(s));
}
{
  const override = mkEx('Override', {progOn:true, trackWeight:false, repsStep:1, progEvery:2});
  const s = getProgressionStrategy(override, {progression:0});
  need(s.enabled && s.every === 2,
    'exercise frequency override stays active when program default is off: ' + JSON.stringify(s));

  override.progEvery = 0;
  const off = getProgressionStrategy(override, {progression:4});
  need(!off.enabled && off.every === 0 && off.mode === 'reps',
    'exercise frequency 0 disables checks without destroying its strategy: ' + JSON.stringify(off));
}
{
  const explicit = mkEx('Явный режим', {value:'10', type:'reps', progOn:true, trackWeight:true,
    weight:10, repsStep:1, wStep:2, progMode:'weight', loadType:'weight'});
  const s = getProgressionStrategy(explicit, {progression:2});
  need(s.mode === 'weight' && s.loadType === 'weight',
    'explicit new progMode/loadType override legacy inference in the adapter: ' + JSON.stringify(s));
}
{
  const bad = mkEx('Кривые новые поля', {progOn:true, loadType:'wat', progMode:'magic'});
  need(bad.loadType == null && bad.progMode == null,
    'normalizeExercise drops invalid loadType/progMode');
}

/* ---- pure compute/preview/apply: один источник расчёта ---- */
{
  const ex = mkEx('Preview reps', {value:'10-12', type:'reps', progOn:true, trackWeight:false,
    repsStep:1, repsMax:15});
  const before = JSON.stringify(ex);
  const p = previewNextProgression(ex, {progression:2});
  need(p.canAdvance && p.mode === 'reps' && p.current.reps === '10-12' && p.next.reps === '11-13',
    'preview computes reps next step: ' + JSON.stringify(p));
  need(JSON.stringify(ex) === before, 'preview does not mutate exercise state');
  advanceExerciseProgression(ex);
  need(progressedRepsRange('p', ex, {id:'p'}) === p.next.reps,
    'apply uses exactly the reps value shown by preview');
}
{
  const ex = mkEx('Preview weight', {value:'10', type:'reps', progOn:true, trackWeight:true,
    weight:10, repsStep:0, wStep:2, weightMax:14});
  const p = previewNextProgression(ex, {progression:2});
  need(p.changed.join(',') === 'weight' && p.current.kg === 10 && p.next.kg === 12,
    'preview computes weight-only next step: ' + JSON.stringify(p));
  advanceExerciseProgression(ex);
  need(getExWeight('p', ex, {id:'p'}) === p.next.kg, 'weight apply equals preview');
}
{
  const ex = mkEx('Preview parallel', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:10, repsStep:1, repsMax:14, wStep:2, weightMax:20, dualProg:false});
  const p = previewNextProgression(ex, {progression:2});
  need(p.mode === 'parallel' && p.next.reps === '9-11' && p.next.kg === 12 &&
      p.changed.includes('reps') && p.changed.includes('weight'),
    'parallel preview advances both axes: ' + JSON.stringify(p));
  advanceExerciseProgression(ex);
  need(progressedRepsRange('p', ex, {id:'p'}) === p.next.reps && getExWeight('p', ex, {id:'p'}) === p.next.kg,
    'parallel apply equals preview on both axes');
}
{
  const ex = mkEx('Preview time+weight', {value:'30', type:'time', progOn:true, trackWeight:true,
    weight:10, timeStep:5, timeMax:40, wStep:2, weightMax:14});
  const p = previewNextProgression(ex, {progression:2});
  need(p.mode === 'parallel' && p.next.sec === 35 && p.next.kg === 12,
    'time+weight parallel preview advances both axes: ' + JSON.stringify(p));
  advanceExerciseProgression(ex);
  need(getExProgValue('p', ex, {id:'p'}, 'time') === 35 && getExWeight('p', ex, {id:'p'}) === 12,
    'time+weight apply equals preview');
}
{
  const ex = mkEx('Preview dual', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:20, repsStep:1, repsMax:12, wStep:2, weightMax:24, dualProg:true});
  const p1 = previewNextProgression(ex, {progression:2});
  need(p1.next.reps === '9-11' && p1.next.kg === 20, 'dual preview first grows range');
  advanceExerciseProgression(ex);
  const p2 = previewNextProgression(ex, {progression:2});
  need(p2.next.reps === '10-12' && p2.next.kg === 20, 'dual preview reaches rep ceiling before weight');
  advanceExerciseProgression(ex);
  const p3 = previewNextProgression(ex, {progression:2});
  need(p3.next.reps === '8-10' && p3.next.kg === 22,
    'dual preview then raises weight and resets range: ' + JSON.stringify(p3));
}
{
  const ex = mkEx('Pending weight', {value:'10', type:'reps', progOn:true, trackWeight:true,
    weight:0, repsStep:0, wStep:2, weightMax:20});
  const p = previewNextProgression(ex, {progression:2});
  need(!p.canAdvance && p.current.kg === 0 && p.next.kg === 0,
    'unset weight cannot be invented by preview');
  advanceExerciseProgression(ex);
  need(getExWeight('p', ex, {id:'p'}) === 0, 'unset weight still cannot be invented by apply');
}
{
  const ex = mkEx('Terminal dual preview', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:20, repsStep:1, repsMax:12, wStep:2, weightMax:22, dualProg:true,
    ps:{n:0,cur:{reps:'10-12',kg:22}}});
  const p = previewNextProgression(ex, {progression:2});
  need(!p.canAdvance && p.next.reps === '10-12' && p.next.kg === 22,
    'terminal dual preview reports no further automatic step');
  need(progAtCeiling('p', ex, {id:'p',progression:2}), 'terminal dual is reported at ceiling');
}

/* ---- обычная прогрессия по повторам ---- */
{
  const ex = mkEx('Отжимания', {value:'10', type:'reps', progOn:true, trackWeight:false, repsStep:1, repsMax:20});
  for(let i = 0; i < 3; i++) runWorkout([ex], 3);
  need(getExProgValue('p1', ex, {id:'p1'}, 'reps') === 11, 'reps +1 after 3 workouts at progression=3');
  need(ex.ps.n === 0, 'per-exercise counter resets right after the step');
}

/* ---- вес-только прогрессия ---- */
{
  const ex = mkEx('Жим гантелей', {value:'10', type:'reps', progOn:true, trackWeight:true, weight:10, wStep:2, repsStep:0});
  const p = {id:'p1'};
  for(let cycle = 0; cycle < 4; cycle++) for(let i = 0; i < 2; i++) runWorkout([ex], 2);
  need(getExWeight('p1', ex, p) === 10 + 4 * 2, 'weight grows +2kg per 2-workout cycle, 4 cycles');
  need(getExProgValue('p1', ex, p, 'reps') === 10, 'reps stay fixed when repsStep is 0');
}

/* ---- двойная прогрессия: диапазон растёт целиком, верхняя граница = потолок ---- */
{
  const ex = mkEx('Жим лёжа', {value:'8-10', type:'reps', progOn:true, trackWeight:true, weight:20, wStep:2.5, repsStep:1, repsMax:20, dualProg:true});
  const p = {id:'p1'};
  const seq = [progressedRepsRange('p1', ex, p) + '@' + getExWeight('p1', ex, p)];
  for(let i = 0; i < 11; i++){
    advanceExerciseProgression(ex);
    seq.push(progressedRepsRange('p1', ex, p) + '@' + getExWeight('p1', ex, p));
  }
  need(seq.join(' ') === [
    '8-10@20','9-11@20','10-12@20','11-13@20','12-14@20','13-15@20',
    '14-16@20','15-17@20','16-18@20','17-19@20','18-20@20','8-10@22.5'
  ].join(' '), 'dual range progression sequence: ' + seq.join(' '));
}
{
  // Если шаг не делит расстояние до максимума, последний рост уменьшается так,
  // чтобы сохранить ширину диапазона и ровно упереться верхней границей в потолок.
  const ex = mkEx('Жим лёжа', {value:'8-10', type:'reps', progOn:true, trackWeight:true, weight:20, wStep:2, repsStep:2, repsMax:15, dualProg:true});
  const p = {id:'p1'};
  const seq = [progressedRepsRange('p1', ex, p)];
  for(let i = 0; i < 4; i++){ advanceExerciseProgression(ex); seq.push(progressedRepsRange('p1', ex, p)); }
  need(seq.join(' ') === '8-10 10-12 12-14 13-15 8-10', 'dual range reaches exact upper ceiling: ' + seq.join(' '));
}

{
  // Максимальный вес — не конец сам по себе: на нём ещё надо пройти диапазон.
  // Конец наступает только в 18-20 × 22.5; следующий шаг ничего не сбрасывает.
  const ex = mkEx('Финальный жим', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:20, weightMax:22.5, wStep:2.5, repsStep:1, repsMax:20, dualProg:true});
  const p = {id:'p1'};
  for(let i = 0; i < 11; i++) advanceExerciseProgression(ex); // 8-10@22.5
  need(getExWeight('p1', ex, p) === 22.5 && progressedRepsRange('p1', ex, p) === '8-10',
    'reaching maximum weight resets to the starting rep range, not terminal yet');
  need(!progAtCeiling('p1', ex, p), 'maximum weight alone is not the final dual ceiling');
  for(let i = 0; i < 10; i++) advanceExerciseProgression(ex); // 18-20@22.5
  need(progAtCeiling('p1', ex, p), 'dual progression is terminal only at max weight AND max rep range');
  advanceExerciseProgression(ex);
  need(getExWeight('p1', ex, p) === 22.5 && progressedRepsRange('p1', ex, p) === '18-20',
    'another progression step at the terminal ceiling does not reset reps');
}

/* ---- новая семантика double progression: валидация, миграция, подпись ---- */
{
  const ex = mkEx('Жим с нулевыми шагами', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:10, dualProg:true, repsStep:0, wStep:0, repsMax:9});
  need(ex.repsStep === 1 && ex.wStep === 2,
    'new double progression repairs zero rep/weight steps');
  need(ex.repsMax === 11,
    'double progression ceiling must be above the starting upper range bound: ' + ex.repsMax);
}
{
  const ex = mkEx('Обычный диапазон', {value:'8-10', type:'reps', progOn:true, trackWeight:false,
    repsStep:1, repsMax:9});
  need(ex.repsMax === 10,
    'ordinary rep ceiling cannot sit below the starting upper range bound');
}
{
  // Старый движок хранил одно текущее число. При миграции сохраняем столько же
  // ступеней до прибавки веса: old 8→…→20 => new 8-10→…→20-22.
  const ex = Object.assign(blankExercise(), {name:'Старый жим', value:'8-10', type:'reps',
    progOn:true, trackWeight:true, weight:10, dualProg:true, repsStep:0, wStep:0, repsMax:20,
    ps:{n:1,cur:{reps:'12',kg:10}}});
  delete ex.dualRangeV;
  normalizeExercise(ex);
  need(migrateLegacyDualRangeExercise(ex), 'legacy double progression is migrated once');
  need(ex.dualRangeV === 2 && ex.repsMax === 22 && ex.ps.cur.reps === '12-14',
    'legacy ceiling/current reps preserve their progression position: ' + JSON.stringify(ex));
  need(ex.repsStep === 1 && ex.wStep === 2,
    'legacy invalid zero steps become a valid double-progression cycle');
  need(!migrateLegacyDualRangeExercise(ex), 'double-range migration is idempotent');
}
{
  // Если состояние уже диапазонное, это данные нового движка из короткого окна
  // до появления маркера: только ставим version marker, потолок не сдвигаем второй раз.
  const ex = Object.assign(blankExercise(), {name:'Уже новый жим', value:'8-10', type:'reps',
    progOn:true, trackWeight:true, weight:10, dualProg:true, repsStep:1, wStep:2, repsMax:20,
    ps:{n:0,cur:{reps:'12-14',kg:10}}});
  delete ex.dualRangeV;
  normalizeExercise(ex);
  migrateLegacyDualRangeExercise(ex);
  need(ex.repsMax === 20 && ex.ps.cur.reps === '12-14',
    'already-ranged state is not migrated twice');
}
{
  const ex = mkEx('Короткая подпись', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:10, dualProg:true, repsStep:1, wStep:2, repsMax:20});
  need(progShort(ex) === '+1 повт. до 20 → +2 кг',
    'double progression short label explains sequential growth: ' + progShort(ex));
}

/* ---- фактический баг с чередованием A/Б: правильно исправлен ---- */
{
  const exA = mkEx('Присед', {value:'10', type:'reps', progOn:true, trackWeight:false, repsStep:1});
  const exB = mkEx('Тяга', {value:'10', type:'reps', progOn:true, trackWeight:false, repsStep:1});
  const p = {id:'p1'};
  for(let i = 0; i < 4; i++) runWorkout([exA], 2); // вариант Б ни разу не выполнялся
  need(getExProgValue('p1', exA, p, 'reps') === 12, 'exercise in the played variant grows normally (2 steps in 4 workouts)');
  need(getExProgValue('p1', exB, p, 'reps') === 10, 'exercise in the NEVER-played variant does not grow at all');
}

/* ---- миграция: воспроизводит число старой формулы floor(completions/progression) ---- */
{
  const ex = mkEx('Присед со штангой', {value:'10', type:'reps', progOn:true, trackWeight:true, weight:20, wStep:2, repsStep:0});
  const p = {id:'p1', progression:3, stats:{completions:10}, plans:[{exercises:[ex]}]};
  const done = p.stats.completions;
  const oldProgramSteps = Math.floor(done / p.progression);
  ensurePs(ex).n = done % p.progression;
  for(let i = 0; i < oldProgramSteps; i++) advanceExerciseProgression(ex);
  need(getExWeight('p1', ex, p) === 20 + oldProgramSteps * 2, 'migrated weight matches the old floor(completions/progression) result');
  need(ex.ps.n === done % p.progression, 'migrated counter is completions % progression');
}

/* ---- вес не задан — advanceExerciseProgression не начисляет его из ничего ---- */
{
  const ex = mkEx('Жим гантелей', {value:'10', type:'reps', progOn:true, trackWeight:true, weight:0, wStep:2, repsStep:0});
  for(let i = 0; i < 20; i++) advanceExerciseProgression(ex);
  need(getExWeight('p1', ex, {id:'p1'}) === 0, 'weight stays 0 (unset) no matter how many steps are applied');
}

/* ---- правка упражнения в сборщике/через ИИ: прогресс сохраняется, пока
   база та же; при смене базы — сброс текущих значений, счётчик остаётся ---- */
{
  const old = mkEx('Присед', {value:'10', type:'reps', progOn:true, trackWeight:false, repsStep:1, repsMax:20});
  old.ps = {n:2, cur:{reps:'13'}};
  const same = carryExerciseProgress(old, Object.assign(JSON.parse(JSON.stringify(old)), {rest:90, ps:undefined}));
  need(same.ps && same.ps.cur.reps === '13' && same.ps.n === 2, 'rest-only edit keeps the reached reps');
  const rebased = carryExerciseProgress(old, Object.assign(JSON.parse(JSON.stringify(old)), {value:'8'}));
  need(rebased.ps && !rebased.ps.cur.reps && rebased.ps.n === 2, 'new base value drops old current values but keeps the counter');
  const copy = cloneExerciseAsNew(old);
  need(copy.id !== old.id && !copy.ps, 'duplicate gets its own id and starts without progress');
}

{
  const old = mkEx('Жим — AI edit', {value:'8-10', type:'reps', progOn:true, trackWeight:true,
    weight:20, dualProg:true, repsStep:1, wStep:2, repsMax:20, weightMax:30});
  old.ps = {n:2, cur:{reps:'12-14', kg:22}};
  const same = carryExerciseProgress(old, Object.assign(JSON.parse(JSON.stringify(old)), {rest:90, ps:undefined}));
  need(same.ps && same.ps.n === 2 && same.ps.cur.reps === '12-14' && same.ps.cur.kg === 22,
    'AI-like edit of unchanged double progression keeps current range, weight and counter');
  const rebased = carryExerciseProgress(old, Object.assign(JSON.parse(JSON.stringify(old)), {value:'10-12', ps:undefined}));
  need(rebased.ps && rebased.ps.n === 2 && Object.keys(rebased.ps.cur).length === 0,
    'changing double-progression reset range keeps counter but drops stale current load');
}

/* ---- двойная прогрессия без заданного веса: полный диапазон остаётся на потолке,
   вес из ничего не создаётся ---- */
{
  const ex = mkEx('Тяга гантели', {value:'8-10', type:'reps', progOn:true, trackWeight:true, dualProg:true, weight:0, wStep:2, repsStep:1, repsMax:14});
  for(let i = 0; i < 10; i++) advanceExerciseProgression(ex);
  need(getExWeight('p1', ex, {id:'p1'}) === 0, 'dual progression does not invent a weight from 0');
  need(progressedRepsRange('p1', ex, {id:'p1'}) === '12-14', 'range stays at the upper ceiling without a selected weight');
}

if(bad){
  console.error('\nFailed:', bad);
  process.exit(1);
}
console.log('\nPer-exercise progression: ok');
