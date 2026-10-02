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

/* ---- parser materializes explicit semantic modes for existing kg protocol too ---- */
{
  const parsed = parseProgramText(`ПРОГРАММА: Семантика
ПРОГРЕССИЯ: 2
ДЕНЬ: Пн
КРУГИ: 1
УПРАЖНЕНИЕ: Двойная
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 8-10
ВЕС: 10
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ ПОВТОРОВ: 1
ШАГ ВЕСА: 2
ПОТОЛОК ПОВТОРОВ: 14
ПОТОЛОК ВЕСА: 30
ПРИ ПОТОЛКЕ: да
УПРАЖНЕНИЕ: Только вес
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 10
ВЕС: 8
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ ВЕСА: 2
ПОТОЛОК ВЕСА: 24
УПРАЖНЕНИЕ: Параллельно
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 10
ВЕС: 8
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ ПОВТОРОВ: 1
ШАГ ВЕСА: 2
ПОТОЛОК ПОВТОРОВ: 16
ПОТОЛОК ВЕСА: 24`);
  const list = normPlans(parsed.program || parsed)[0].exercises;
  need(list[0].loadType === 'weight' && list[0].progMode === 'double_range',
    'parser persists double_range semantic mode');
  need(list[1].loadType === 'weight' && list[1].progMode === 'weight',
    'parser persists weight-only semantic mode');
  need(list[2].loadType === 'weight' && list[2].progMode === 'parallel',
    'parser persists legacy simultaneous reps+weight as parallel');
}

/* ---- AI protocol resistance → та же модель, что ручной редактор ---- */
{
  const parsed = parseProgramText(`ПРОГРАММА: Резинки
ПРОГРЕССИЯ: 2
ДЕНЬ: Пн
КРУГИ: 1
ОТДЫХ МЕЖДУ КРУГАМИ: 30
УПРАЖНЕНИЕ: Тяга резинки
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12-15
НАГРУЗКА: сопротивление
СОПРОТИВЛЕНИЕ: Среднее
УРОВНИ СОПРОТИВЛЕНИЯ: Лёгкое | Среднее | Сильное | Очень сильное
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ ПОВТОРОВ: 2
ПОТОЛОК ПОВТОРОВ: 18`);
  const ex = normPlans(parsed.program || parsed)[0].exercises[0];
  need(ex.loadType === 'level' && ex.progMode === 'level' && ex.loadLevel === 1,
    'parser maps resistance protocol to level strategy/current base: ' + JSON.stringify(ex));
  need(ex.loadLevels.map(x => x.key || x.label).join(',') === 'light,medium,strong,veryStrong',
    'built-in RU resistance labels become canonical keys');
  need(ex.repsStep === 2 && ex.repsMax === 18,
    'reps→resistance keeps explicit rep step and ceiling');
}
{
  const parsed = parseProgramText(`ПРОГРАММА: Фиксированная резинка
ПРОГРЕССИЯ: 2
ДЕНЬ: Пн
КРУГИ: 1
УПРАЖНЕНИЕ: Разведение
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
НАГРУЗКА: сопротивление
СОПРОТИВЛЕНИЕ: Strong
УРОВНИ СОПРОТИВЛЕНИЯ: Light | Medium | Strong | Very strong
ПОДХОДЫ: 3
ОТДЫХ: 45
УСЛОЖНЯТЬ: да
ШАГ: 2
ПОТОЛОК: 20`);
  const ex = normPlans(parsed.program || parsed)[0].exercises[0];
  need(ex.loadType === 'level' && ex.progMode === 'reps' && ex.loadLevel === 2,
    'generic step with resistance means reps-only at fixed resistance');
  need(ex.repsStep === 2 && ex.repsMax === 20,
    'reps-only resistance keeps generic step/cap');
}
{
  const parsed = parseProgramText(`ПРОГРАММА: Только сопротивление
ПРОГРЕССИЯ: 2
ДЕНЬ: Пн
КРУГИ: 1
УПРАЖНЕНИЕ: Тяга
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
НАГРУЗКА: сопротивление
СОПРОТИВЛЕНИЕ: B
УРОВНИ СОПРОТИВЛЕНИЯ: A | B | C
ПОДХОДЫ: 3
ОТДЫХ: 45
УСЛОЖНЯТЬ: да
ШАГ ПОВТОРОВ: 0`);
  const ex = normPlans(parsed.program || parsed)[0].exercises[0];
  need(ex.progMode === 'level' && ex.repsStep === 0 && ex.loadLevel === 1,
    'zero rep step means direct resistance progression with fixed reps');
}

/* ---- carry AI edit: same scale keeps current state; incompatible scale never carries index ---- */
{
  const oldEx = mkEx('Резинка', {value:'12-15', type:'reps', progOn:true, loadType:'level', progMode:'level',
    loadLevels:[{label:'A'},{label:'B'},{label:'C'}], loadLevel:0, repsStep:2, repsMax:19, progEvery:4});
  oldEx.ps = {n:3, cur:{reps:'14-17', level:1}};
  const same = mkEx('Резинка', {value:'12-15', type:'reps', progOn:true, loadType:'level', progMode:'level',
    loadLevels:[{label:'A'},{label:'B'},{label:'C'}], loadLevel:0, repsStep:2, repsMax:19, progEvery:2});
  carryExerciseProgress(oldEx, same);
  need(same.ps.n === 2 && same.ps.cur.level === 1 && same.ps.cur.reps === '14-17',
    'compatible AI edit keeps current resistance state and clamps counter to new cadence: ' + JSON.stringify(same.ps));

  const other = mkEx('Резинка', {value:'12-15', type:'reps', progOn:true, loadType:'level', progMode:'level',
    loadLevels:[{label:'A'},{label:'X'},{label:'C'}], loadLevel:0, repsStep:2, repsMax:19, progEvery:2});
  carryExerciseProgress(oldEx, other);
  need(other.ps.n === 2 && Object.keys(other.ps.cur).length === 0,
    'different resistance scale keeps only safe counter and clears current level: ' + JSON.stringify(other.ps));

  const reordered = mkEx('Резинка', {value:'12-15', type:'reps', progOn:true, loadType:'level', progMode:'level',
    loadLevels:[{label:'C'},{label:'B'},{label:'A'}], loadLevel:2, repsStep:2, repsMax:19, progEvery:2});
  carryExerciseProgress(oldEx, reordered);
  need(reordered.ps.n === 2 && reordered.ps.cur.level === 1 && reordered.ps.cur.reps === '14-17',
    'reordering the same physical resistance scale preserves current physical level and reps: ' + JSON.stringify(reordered.ps));

  const movedCurrent = mkEx('Резинка', {value:'12-15', type:'reps', progOn:true, loadType:'level', progMode:'level',
    loadLevels:[{label:'B'},{label:'A'},{label:'C'}], loadLevel:1, repsStep:2, repsMax:19, progEvery:2});
  carryExerciseProgress(oldEx, movedCurrent);
  need(movedCurrent.ps.cur.level === 0 && movedCurrent.ps.cur.reps === '14-17',
    'current resistance is remapped by physical label when its numeric index changes: ' + JSON.stringify(movedCurrent.ps));

  const changedBase = mkEx('Резинка', {value:'12-15', type:'reps', progOn:true, loadType:'level', progMode:'level',
    loadLevels:[{label:'A'},{label:'B'},{label:'C'}], loadLevel:1, repsStep:2, repsMax:19, progEvery:2});
  carryExerciseProgress(oldEx, changedBase);
  need(Object.keys(changedBase.ps.cur).length === 0,
    'changing the physical base resistance still resets stale current progression: ' + JSON.stringify(changedBase.ps));
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

/* ---- ручной редактор: матрица доступных режимов и defaults ---- */
{
  const reps = mkEx('Без веса', {type:'reps', progOn:true, trackWeight:false});
  need(progressionModeOptions(reps).join(',') === 'reps' && recommendedProgressionMode(reps) === 'reps',
    'reps + no load exposes only reps progression');
}
{
  const weighted = mkEx('Гантели', {type:'reps', progOn:true, trackWeight:true, weight:8,
    repsStep:0, wStep:2});
  need(progressionModeOptions(weighted).join(',') === 'double_range,weight,reps,parallel',
    'reps + weight exposes all meaningful manual modes');
  need(recommendedProgressionMode(weighted) === 'double_range',
    'reps + weight recommends double_range');
}
{
  const timed = mkEx('Планка', {type:'time', progOn:true, trackWeight:false});
  need(progressionModeOptions(timed).join(',') === 'time' && recommendedProgressionMode(timed) === 'time',
    'time + no load exposes time progression');
}
{
  const carry = mkEx('Фермерская прогулка', {type:'time', progOn:true, trackWeight:true, weight:12,
    timeStep:5, wStep:2});
  need(progressionModeOptions(carry).join(',') === 'time,weight,parallel',
    'time + weight exposes time, weight and parallel');
  need(recommendedProgressionMode(carry) === 'time',
    'time + weight recommends time by default');
}
{
  const ex = mkEx('Новый жим', {type:'reps', progOn:true, trackWeight:false, repsStep:1});
  setExerciseLoadType(ex, 'weight', true);
  need(ex.loadType === 'weight' && ex.trackWeight && ex.progMode === 'double_range' && ex.dualProg,
    'new reps exercise switches to recommended double_range when weight is added');
  need(ex.repsStep > 0 && ex.wStep > 0 && ex.repsMax > parseValue(ex.value).max,
    'double_range materializes valid rep/weight steps and a rep ceiling');
}
{
  const ex = mkEx('Существующий жим', {type:'reps', progOn:true, trackWeight:true, weight:10,
    repsStep:0, wStep:2, progMode:'weight', loadType:'weight'});
  setExerciseLoadType(ex, 'weight', false);
  need(ex.progMode === 'weight' && ex.repsStep === 0 && ex.wStep > 0,
    'existing compatible manual mode is preserved');
}
{
  const ex = mkEx('Выключенная прогрессия', {type:'reps', progOn:false, trackWeight:false,
    loadType:'none', repsStep:1});
  setExerciseLoadType(ex, 'weight', false);
  need(ex.loadType === 'weight' && ex.progOn === false,
    'changing load type does not silently enable explicitly disabled progression');
  setExerciseMetric(ex, 'time', false);
  need(ex.type === 'time' && ex.progOn === false,
    'changing reps/time does not silently enable explicitly disabled progression');
}
{
  const ex = mkEx('Смена на время', {type:'reps', progOn:true, trackWeight:true, weight:10,
    repsStep:1, wStep:2, repsMax:14, progMode:'double_range', loadType:'weight', dualProg:true});
  setExerciseMetric(ex, 'time', false);
  need(ex.type === 'time' && ex.progMode === 'time' && !ex.dualProg && ex.timeStep > 0 && ex.wStep === 0,
    'incompatible double_range falls back to recommended time when metric changes');
}
{
  const ex = mkEx('Ручной parallel', {type:'reps', progOn:true, trackWeight:true, weight:10,
    repsStep:1, wStep:2, progMode:'parallel', loadType:'weight'});
  setExerciseProgressionMode(ex, 'parallel');
  need(ex.progMode === 'parallel' && ex.repsStep > 0 && ex.wStep > 0 && !ex.dualProg,
    'advanced parallel remains manually available');
  setExerciseProgressionMode(ex, 'weight');
  need(ex.progMode === 'weight' && ex.repsStep === 0 && ex.wStep > 0 && !ex.dualProg,
    'weight-only zeroes rep growth without deleting weight settings');
  setExerciseProgressionMode(ex, 'reps');
  need(ex.progMode === 'reps' && ex.repsStep > 0 && ex.wStep === 0,
    'reps-only zeroes weight growth but keeps weighted exercise format');
}

/* ---- resistance/level model and engine ---- */
{
  const ex = mkEx('Резинка default', {type:'reps', value:'12-15', progOn:true,
    loadType:'level', progMode:'level', trackWeight:false, repsStep:2, repsMax:18,
    loadLevel:1});
  need(Array.isArray(ex.loadLevels) && ex.loadLevels.length === 4 &&
      ex.loadLevels.map(x=>x.key).join(',') === 'light,medium,strong,veryStrong',
    'level load gets a stable built-in resistance scale');
  need(exerciseLoadLevel(ex) === 1, 'base resistance level is normalized');
}
{
  const ex = mkEx('Свои резинки', {type:'reps', value:'12', progOn:true,
    loadType:'level', progMode:'level',
    loadLevels:['Жёлтая', {label:'Красная 15–25 lb'}, {key:'strong'}, {key:'invalid'}],
    loadLevel:20});
  need(ex.loadLevels.length === 3 && ex.loadLevels[0].label === 'Жёлтая' &&
      ex.loadLevels[1].label === 'Красная 15–25 lb' && ex.loadLevels[2].key === 'strong',
    'custom resistance labels and known built-in keys are sanitized');
  need(ex.loadLevel === 2, 'base level is clamped to the scale');
}
{
  const ex = mkEx('Тяга резинки', {type:'reps', value:'12-15', progOn:true,
    loadType:'level', progMode:'level', loadLevel:1,
    repsStep:2, repsMax:18,
    loadLevels:[{key:'light'},{key:'medium'},{key:'strong'},{key:'veryStrong'}]});
  const seq=[];
  for(let i=0;i<4;i++){
    const before=JSON.stringify(ex);
    const p=previewNextProgression(ex,{progression:2});
    seq.push(p.current.reps+'@'+p.current.level+'→'+p.next.reps+'@'+p.next.level);
    need(JSON.stringify(ex)===before, 'level preview is pure');
    advanceExerciseProgression(ex);
  }
  need(seq[0] === '12-15@1→14-17@1' &&
      seq[1] === '14-17@1→16-18@1' &&
      seq[2] === '16-18@1→12-15@2' &&
      seq[3] === '12-15@2→14-17@2',
    'reps then resistance progression sequence: '+seq.join(' | '));
}
{
  const ex = mkEx('Прямая смена резинки', {type:'reps', value:'12', progOn:true,
    loadType:'level', progMode:'level', loadLevel:0, repsStep:0,
    loadLevels:[{label:'A'},{label:'B'},{label:'C'}]});
  const p=previewNextProgression(ex,{progression:2});
  need(p.changed.join(',') === 'level' && p.current.level === 0 && p.next.level === 1 &&
      p.current.reps === p.next.reps,
    'level mode can raise resistance directly with fixed reps');
  advanceExerciseProgression(ex);
  need(ex.ps.cur.level === 1, 'apply stores current resistance in ps.cur.level');
}
{
  const ex = mkEx('Время + сопротивление', {type:'time', value:'30', progOn:true,
    loadType:'level', progMode:'level', loadLevel:1, timeStep:0,
    loadLevels:[{label:'Лёгкая'},{label:'Средняя'},{label:'Тяжёлая'}]});
  const p=previewNextProgression(ex,{progression:2});
  need(p.next.sec === 30 && p.next.level === 2 && p.changed.join(',') === 'level',
    'time+level can keep time fixed and raise resistance');
}
{
  const ex = mkEx('Последняя резинка', {type:'reps', value:'12-15', progOn:true,
    loadType:'level', progMode:'level', loadLevel:2, repsStep:2, repsMax:18,
    loadLevels:[{label:'A'},{label:'B'},{label:'C'}],
    ps:{n:0,cur:{reps:'16-18',level:2}}});
  const p=previewNextProgression(ex,{progression:2});
  need(!p.canAdvance && p.next.level === 2 && p.next.reps === '16-18',
    'last resistance at rep ceiling is terminal');
  need(progAtCeiling('p',ex,{id:'p',progression:2}),
    'level strategy reports terminal ceiling only at last level and rep ceiling');
}
{
  const old = mkEx('Шкала', {type:'reps', value:'12', progOn:true, loadType:'level',
    progMode:'level', loadLevels:[{label:'A'},{label:'B'}], loadLevel:0, repsStep:0});
  old.ps={n:2,cur:{level:1}};
  const changedScale=Object.assign(JSON.parse(JSON.stringify(old)),{
    loadLevels:[{label:'Красная'},{label:'Чёрная'}], ps:undefined
  });
  const carried=carryExerciseProgress(old,changedScale);
  need(carried.ps.n === 2 && carried.ps.cur.level == null,
    'changing resistance scale keeps counter but never carries the old numeric level into another scale');
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
  need(!progAtCeiling('p', ex, {id:'p',progression:2}),
    'unset weight is not mistaken for a terminal progression ceiling');
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
