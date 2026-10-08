/* Прогрессия на модели упражнения V2: политика — progression активного этапа,
   накопленное состояние — progressState слота. Прямые unit-тесты на чистых
   функциях 60-builder.js, без браузера.
   Смысл правил — docs/load-equipment-progression-plan-2026-10-08.md (5, 5.4, 5.5).

   Запуск:  node tests/progression-per-exercise-unit.js */

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

let bad = 0;
function need(cond, msg){
  if(!cond){ bad++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

global.FitAIProtocol = require(path.join(root, 'lib/ai-protocol.js'));
global.FitExerciseV2 = require(path.join(root, 'lib/fit-exercise-v2.js'));
global.clampLine = (s,n)=>String(s||'').slice(0,n||9999);
global.clampText = (s,n)=>String(s||'').slice(0,n||9999);
global.cleanLink = s => /^https?:\/\//i.test(s||'') ? s : '';
global.cleanPic = () => null;
global.LIM = {exName:60,exDesc:600,exMistakes:300,exValue:20,video:300,wish:2000};
global.MUSCLES = [['gl','Ягодицы']];
global.M_LABEL = {gl:'Ягодицы'};
global.DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
global.plural = (n,a,b,c)=> n%10===1&&n%100!==11 ? a : (n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14) ? b : c);
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
global.normPlans = p => p.plans;
global.newPlanId = () => 'p' + Math.random().toString(36).slice(2, 8);
global.sanitizeProgram = p => p;
global.savePrograms = async () => {};

// 60-builder.js — ES-модуль: для eval убираем import-строки и слово export
const builderSrc = fs.readFileSync(path.join(root, 'src/app/60-builder.js'), 'utf8')
  .replace(/^import [\s\S]*?from '[^']+';\n/gm, '')
  .replace(/^export /gm, '');
eval(builderSrc.slice(0, builderSrc.indexOf('async function pregnancyWarning')));

// Упражнение V2 из короткого описания prescription активного этапа
function mk(name, spec){
  const s = spec || {};
  const ex = blankExercise();
  const p = exP(ex);
  Object.assign(p, {name, sets:3, rest:60}, s.p || {});
  if(s.load) Object.assign(p.load, s.load);
  if(s.prog){
    const pr = s.prog;
    p.progression.mode = pr.mode || p.progression.mode;
    if('every' in pr) p.progression.every = pr.every;
    ['reps','weight','time'].forEach(a => { if(pr[a]) Object.assign(p.progression[a], pr[a]); });
  }
  if(s.state) ex.progressState = {count:s.state.count || 0,
    current:Object.assign({reps:null, weight:null, time:null, level:null}, s.state.current || {})};
  return normalizeExercise(ex);
}
const dumbbells = (weight, count = 2) => ({type:'weight', equipment:'dumbbell', count, weight});
const band = (levels, level = 0) => ({type:'level', equipment:'band', levels, level});
const cur = ex => ex.progressState.current;
const P = {id:'p1', progression:2};

/* ---- частота: упражнение переопределяет программу; выключение — только mode 'none' ---- */
{
  const inherited = mk('Наследует', {prog:{mode:'reps', every:null, reps:{step:1}}});
  const custom = mk('Своя частота', {prog:{mode:'reps', every:2, reps:{step:1}}});
  const off = mk('Выключено', {prog:{mode:'none'}});
  need(exerciseProgEvery(inherited, {progression:4}) === 4, 'empty exercise frequency inherits program default');
  need(exerciseProgEvery(custom, {progression:4}) === 2, 'exercise frequency overrides program default');
  need(exerciseProgEvery(custom, {progression:0}) === 2, 'positive exercise override works even when program default is off');
  need(progAxis(off) === 'none' && !getProgressionStrategy(off, {progression:4}).enabled,
    'progression mode none is the single OFF switch');
  const zero = mk('Ноль', {prog:{mode:'reps', every:0, reps:{step:1}}});
  need(exP(zero).progression.every === null, 'every 0 is not a second OFF: it falls back to inheritance');
}

/* ---- стратегия читается из V2 без догадок ---- */
{
  const s = getProgressionStrategy(mk('Повторы', {p:{value:'10-12'}, prog:{mode:'reps', reps:{step:1, max:20}}}), {progression:4});
  need(s.enabled && s.every === 4 && s.metric === 'reps' && s.loadType === 'none' && s.mode === 'reps',
    'reps-only strategy: ' + JSON.stringify(s));
}
{
  const s = getProgressionStrategy(mk('Вес', {load:dumbbells(10), prog:{mode:'weight', weight:{step:2, max:30}}}), {progression:3});
  need(s.enabled && s.loadType === 'weight' && s.mode === 'weight' && s.weight.step === 2 && s.weight.max === 30,
    'weight-only strategy: ' + JSON.stringify(s));
}
{
  const s = getProgressionStrategy(mk('Планка', {p:{type:'time', value:'30'}, prog:{mode:'time', time:{step:5, max:60}}}), P);
  need(s.mode === 'time' && s.metric === 'time' && s.time.step === 5, 'time-only strategy: ' + JSON.stringify(s));
}

/* ---- ручной редактор: матрица способов и defaults ---- */
{
  const reps = mk('Без веса', {prog:{mode:'reps', reps:{step:1}}});
  need(progressionModeOptions(reps).join(',') === 'reps' && recommendedProgressionMode(reps) === 'reps',
    'reps + no load exposes only reps progression');
  const weighted = mk('Гантели', {load:dumbbells(8), prog:{mode:'weight', weight:{step:2}}});
  need(progressionModeOptions(weighted).join(',') === 'double_range,weight,reps,parallel',
    'reps + weight exposes all meaningful manual modes');
  need(recommendedProgressionMode(weighted) === 'double_range', 'reps + weight recommends double_range');
  const carry = mk('Фермерская прогулка', {p:{type:'time', value:'30'}, load:{type:'weight', equipment:'kettlebell', count:2, weight:12}, prog:{mode:'time', time:{step:5}}});
  need(progressionModeOptions(carry).join(',') === 'time,weight,parallel', 'time + weight exposes time, weight and parallel');
  need(recommendedProgressionMode(carry) === 'time', 'time + weight recommends time by default');
}
{
  const ex = mk('Новый жим', {prog:{mode:'reps', reps:{step:1}}});
  setExerciseLoadType(ex, 'weight', true);
  const p = exP(ex);
  need(p.load.type === 'weight' && p.load.equipment === 'dumbbell' && p.load.count === 2,
    'adding weight picks a real default equipment (two dumbbells)');
  need(p.progression.mode === 'double_range' && p.progression.reps.step > 0 && p.progression.weight.step > 0
      && p.progression.reps.max > parseValue(p.value).max,
    'new weighted exercise switches to a valid double_range');
}
{
  const ex = mk('Выключенная прогрессия', {prog:{mode:'none'}});
  setExerciseLoadType(ex, 'weight', false);
  need(exP(ex).load.type === 'weight' && exP(ex).progression.mode === 'none',
    'changing load type does not silently enable disabled progression');
  setExerciseMetric(ex, 'time', false);
  need(exP(ex).type === 'time' && exP(ex).progression.mode === 'none',
    'changing reps/time does not silently enable disabled progression');
  setExerciseProgressionOn(ex, true);
  need(exP(ex).progression.mode === 'time', 'turning progression on picks the recommended mode');
}
{
  const ex = mk('Смена на время', {load:dumbbells(10), prog:{mode:'double_range', reps:{step:1, max:14}, weight:{step:2}}});
  setExerciseMetric(ex, 'time', false);
  need(exP(ex).type === 'time' && exP(ex).progression.mode === 'time' && exP(ex).progression.time.step > 0,
    'incompatible double_range falls back to recommended time when metric changes');
}
{
  const ex = mk('Резинка', {prog:{mode:'reps', reps:{step:1}}});
  setExerciseLoadType(ex, 'level', true);
  const load = exP(ex).load;
  need(load.equipment === 'band' && load.levels.map(x => x.key).join(',') === 'light,medium,strong,veryStrong',
    'resistance gets a band and the built-in scale');
}

/* ---- проверки конфигурации прогрессии в редакторе ---- */
{
  const noCeil = mk('Двойная', {load:dumbbells(10), prog:{mode:'double_range', reps:{step:1, max:20}, weight:{step:2}}});
  exP(noCeil).progression.reps.max = null;
  need(progressionConfigIssue(noCeil) === 'builder.ceilingRequiredDoubleError', 'double_range rejects missing rep transition ceiling');
  const ok = mk('Двойная', {p:{value:'8-10'}, load:dumbbells(10), prog:{mode:'double_range', reps:{step:1, max:14}, weight:{step:2}}});
  need(progressionConfigIssue(ok) === '', 'double_range accepts a usable rep transition ceiling');
  const direct = mk('Прямое сопротивление', {load:band([{key:'light'},{key:'medium'}]), prog:{mode:'level'}});
  exP(direct).progression.reps.step = null;
  need(progressionConfigIssue(direct) === '', 'direct resistance progression does not require a rep ceiling');
}

/* ---- preview = apply: один расчёт для показа и применения ---- */
{
  const ex = mk('Приседания', {p:{value:'10-12'}, prog:{mode:'reps', reps:{step:1}}});
  const before = JSON.stringify(ex);
  const p = previewNextProgression(ex, P);
  need(p.next.reps === '11-13', 'preview computes reps next step: ' + p.next.reps);
  need(JSON.stringify(ex) === before, 'preview does not mutate exercise state');
  advanceExerciseProgression(ex);
  need(cur(ex).reps === p.next.reps, 'apply uses exactly the reps value shown by preview');
}
{
  const ex = mk('Жим', {load:dumbbells(10), prog:{mode:'weight', weight:{step:2, max:30}}});
  const p = previewNextProgression(ex, P);
  advanceExerciseProgression(ex);
  need(p.next.kg === 12 && getExWeight('p1', ex, P) === 12 && cur(ex).weight === 12,
    'weight step is per ONE unit: 2 × 10 → 2 × 12');
  need(exP(ex).load.count === 2, 'count is never a progression axis');
}
{
  const ex = mk('Обе оси', {p:{value:'8-10'}, load:dumbbells(10), prog:{mode:'parallel', reps:{step:1}, weight:{step:2}}});
  const p = previewNextProgression(ex, P);
  need(p.mode === 'parallel' && p.next.reps === '9-11' && p.next.kg === 12, 'parallel preview advances both axes');
}
{
  const ex = mk('Двойная', {p:{value:'8-10'}, load:dumbbells(10), prog:{mode:'double_range', reps:{step:2, max:14}, weight:{step:2, max:12}}});
  const seq = [];
  for(let i = 0; i < 6; i++){
    seq.push(progressedRepsRange('p1', ex, P) + '@' + getExWeight('p1', ex, P));
    advanceExerciseProgression(ex);
  }
  need(seq.join(' ') === '8-10@10 10-12@10 12-14@10 8-10@12 10-12@12 12-14@12',
    'double range: range grows, then weight +step and range resets: ' + seq.join(' '));
  need(progAtCeiling('p1', ex, P), 'double progression is terminal only at max weight AND max rep range');
}
{
  const ex = mk('Планка с блином', {p:{type:'time', value:'30'}, load:{type:'weight', equipment:'plate', count:1, weight:5},
    prog:{mode:'time', time:{step:5, max:40}}});
  advanceExerciseProgression(ex); advanceExerciseProgression(ex); advanceExerciseProgression(ex);
  need(getExProgValue('p1', ex, P, 'time') === 40 && progAtCeiling('p1', ex, P), 'time grows to its ceiling and stops');
}

/* ---- сопротивление ---- */
{
  const ex = mk('Тяга резинки', {p:{value:'12-15'}, load:band([{key:'light'},{key:'medium'},{key:'strong'}], 0),
    prog:{mode:'level', reps:{step:2, max:17}}});
  const seq = [];
  for(let i = 0; i < 5; i++){
    seq.push(progressedRepsRange('p1', ex, P) + '@' + exerciseLoadLevel(ex));
    advanceExerciseProgression(ex);
  }
  need(seq.join(' ') === '12-15@0 14-17@0 12-15@1 14-17@1 12-15@2',
    'reps then resistance progression sequence: ' + seq.join(' '));
  advanceExerciseProgression(ex);
  need(progAtCeiling('p1', ex, P), 'last resistance at rep ceiling is terminal');
}
{
  const ex = mk('Помощь в подтягиваниях', {p:{value:'5'}, load:band(['Сильная помощь','Средняя помощь','Лёгкая помощь'], 0),
    prog:{mode:'level'}});
  exP(ex).progression.reps.step = null;
  advanceExerciseProgression(ex);
  need(exerciseLoadLevelState(ex).label === 'Средняя помощь',
    'level order is growth of difficulty: assistance goes from strong to light');
}

/* ---- состояние у каждого упражнения: вариант Б не растёт от тренировок варианта А ---- */
{
  const exA = mk('А', {p:{value:'10'}, prog:{mode:'reps', reps:{step:1}}});
  const exB = mk('Б', {p:{value:'10'}, prog:{mode:'reps', reps:{step:1}}});
  for(let w = 0; w < 4; w++){
    const ps = ensureProgressState(exA);
    ps.count++;
    if(ps.count >= 2){ advanceExerciseProgression(exA); ps.count = 0; }
  }
  need(getExProgValue('p1', exA, P, 'reps') === 12, 'exercise in the played variant grows (2 steps in 4 workouts)');
  need(getExProgValue('p1', exB, P, 'reps') === 10, 'exercise in the never-played variant does not grow');
}

/* ---- перенос прогресса при правке (план 5.4/5.5) ---- */
const progressed = () => {
  const ex = mk('Румынская тяга', {p:{value:'8-10'}, load:dumbbells(5),
    prog:{mode:'double_range', reps:{step:1, max:14}, weight:{step:1, max:12}}, state:{count:2, current:{reps:'10-12', weight:6}}});
  return ex;
};
{
  const old = progressed();
  const textOnly = JSON.parse(JSON.stringify(old));
  exP(textOnly).desc = 'Новая техника';
  exP(textOnly).name = 'Румынская тяга с гантелями';
  delete textOnly.progressState;
  carryExerciseProgress(old, textOnly);
  need(textOnly.progressState.count === 2 && cur(textOnly).weight === 6 && cur(textOnly).reps === '10-12',
    'text-only edit keeps the whole progress');
}
{
  const old = progressed();
  const workload = JSON.parse(JSON.stringify(old));
  exP(workload).load.weight = 7;
  carryExerciseProgress(old, workload);
  need(workload.progressState.count === 0 && cur(workload).weight === null,
    'manual working-load change keeps the segment but resets the counter and current load');
  const policy = JSON.parse(JSON.stringify(old));
  exP(policy).progression.weight.step = 2;
  carryExerciseProgress(old, policy);
  need(policy.progressState.count === 0, 'progression policy change resets the counter');
  const sets = JSON.parse(JSON.stringify(old));
  exP(sets).sets = 4;
  carryExerciseProgress(old, sets);
  need(sets.progressState.count === 0, 'sets change resets the counter');
}
{
  const old = progressed();
  const count = JSON.parse(JSON.stringify(old));
  exP(count).load.count = 1;
  carryExerciseProgress(old, count);
  need(count.progressState.count === 0 && cur(count).weight === null && cur(count).reps === null,
    'equipment count change (2 → 1) is a new configuration: progress starts over');
  const barbell = JSON.parse(JSON.stringify(old));
  Object.assign(exP(barbell).load, {equipment:'barbell', count:1, weight:20});
  carryExerciseProgress(old, barbell);
  need(barbell.progressState.count === 0 && cur(barbell).weight === null,
    'dumbbells → barbell is a new configuration');
}
{
  const old = progressed();
  const stage = JSON.parse(JSON.stringify(old));
  stage.stages.push({stageId:'next-stage', prescription:JSON.parse(JSON.stringify(exP(old))), advance:{mode:'manual'}, mediaRef:null, visualKey:''});
  stage.currentStageId = 'next-stage';
  carryExerciseProgress(old, stage);
  need(stage.progressState.count === 0 && cur(stage).reps === null, 'another movement stage starts its own progress');
}
{
  const old = mk('Резинка', {p:{value:'12-15'}, load:band(['A','B','C'], 0), prog:{mode:'level', reps:{step:2, max:19}},
    state:{count:3, current:{reps:'14-17', level:1}}});
  const added = JSON.parse(JSON.stringify(old));
  exP(added).load.levels = [{label:'A'},{label:'B'},{label:'C'},{label:'D'}];
  carryExerciseProgress(old, added);
  need(added.progressState.count === 3 && cur(added).level === 1 && cur(added).reps === '14-17',
    'adding a band to the end of the scale keeps progress');
  const reordered = JSON.parse(JSON.stringify(old));
  exP(reordered).load.levels = [{label:'C'},{label:'B'},{label:'A'}];
  exP(reordered).load.level = 2;
  carryExerciseProgress(old, reordered);
  need(cur(reordered).level === 1 && reordered.progressState.count === 0,
    'reordered scale maps the current level by identity and resets the counter');
  const gone = JSON.parse(JSON.stringify(old));
  exP(gone).load.levels = [{label:'A'},{label:'X'},{label:'C'}];
  carryExerciseProgress(old, gone);
  need(cur(gone).level === null && gone.progressState.count === 0,
    'if the current band disappears from the scale, level state resets');
}
{
  const old = progressed();
  const copy = cloneExerciseAsNew(old);
  need(copy.id !== old.id && copy.stages[0].stageId !== old.stages[0].stageId
      && copy.currentStageId === copy.stages[0].stageId && copy.progressState.count === 0,
    'duplicate gets new exercise/stage ids and starts without progress');
}

/* ---- подписи ---- */
{
  const ex = mk('Двойная', {p:{value:'8-10'}, load:dumbbells(10), prog:{mode:'double_range', reps:{step:1, max:14}, weight:{step:2}}});
  need(progShort(ex) === '+1 повт. до 14 → +2 кг', 'double progression short label: ' + progShort(ex));
  need(exerciseWeightText(ex, 10) === '2 × 10 кг', 'weight text shows the count: ' + exerciseWeightText(ex, 10));
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё сошлось');
process.exit(bad ? 1 : 0);
