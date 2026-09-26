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

/* ---- двойная прогрессия: повторы растут до потолка, затем сброс + вес ---- */
{
  const ex = mkEx('Жим лёжа', {value:'8-12', type:'reps', progOn:true, trackWeight:true, weight:20, wStep:2.5, repsStep:1, repsMax:12, dualProg:true});
  const p = {id:'p1'};
  const seen = [];
  for(let i = 0; i < 6; i++){
    advanceExerciseProgression(ex);
    seen.push({reps: progressedRepsRange('p1', ex, p), kg: getExWeight('p1', ex, p)});
  }
  const resetHappened = seen.some((h, i) => i > 0 && parseInt(h.reps) < parseInt(seen[i - 1].reps));
  need(resetHappened, 'reps cycle back to base at least once');
  need(seen[seen.length - 1].kg > 20, 'weight increases once reps hit the ceiling: ' + seen[seen.length - 1].kg);
}
{
  // цель при двойной прогрессии — одно число с первого же круга, а не «8-12»,
  // сменяющееся одиночными числами
  const ex = mkEx('Жим лёжа', {value:'8-12', type:'reps', progOn:true, trackWeight:true, weight:20, wStep:2.5, repsStep:1, repsMax:12, dualProg:true});
  const p = {id:'p1'};
  const seq = [progressedRepsRange('p1', ex, p) + '@' + getExWeight('p1', ex, p)];
  for(let i = 0; i < 5; i++){ advanceExerciseProgression(ex); seq.push(progressedRepsRange('p1', ex, p) + '@' + getExWeight('p1', ex, p)); }
  need(seq.join(' ') === '8@20 9@20 10@20 11@20 12@20 8@22.5', 'dual progression sequence: ' + seq.join(' '));
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

/* ---- двойная прогрессия без заданного веса: повторы упираются в потолок,
   вес из ничего не создаётся ---- */
{
  const ex = mkEx('Тяга гантели', {value:'8-12', type:'reps', progOn:true, trackWeight:true, dualProg:true, weight:0, wStep:2, repsStep:1});
  for(let i = 0; i < 10; i++) advanceExerciseProgression(ex);
  need(getExWeight('p1', ex, {id:'p1'}) === 0, 'dual progression does not invent a weight from 0');
}

if(bad){
  console.error('\nFailed:', bad);
  process.exit(1);
}
console.log('\nPer-exercise progression: ok');
