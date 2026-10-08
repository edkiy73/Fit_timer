/* AI Contract V2: схемы проходят переносимое подмножество, ответ ИИ превращается в
   persistent-модель V2, правка «target state + refs» не теряет и не дублирует сущности.
   Запуск: node tests/ai-contract-v2-unit.js */
const assert = require('assert');
const C = require('../lib/fit-ai-contract');
const V2 = require('../lib/fit-exercise-v2');
const S = require('../../../packages/core/server/json-schema-lite');

let n = 0;
const ids = () => { let i = 0; return p => p + '_t' + (++i); };
const test = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };

const stage = (name, extra) => Object.assign({
  name, desc:'', mistakes:'', type:'reps', value:'10', sets:3, perSide:false, rest:45, restAfter:null,
  muscles:['ch'], load:{type:'none', equipment:null, equipmentName:'', count:1, weight:0, levels:[], level:0},
  supportEquipment:[], progression:{mode:'reps', every:null, repsStep:1, repsMax:15, weightStep:null, weightMax:null,
    timeStep:null, timeMax:null}, advance:'manual'
}, extra || {});

test('coach prompt requires useful program intro and executable exercise coaching', () => {
  const prompt = C.buildPrompt('program.create', {language:'Russian', task:'Create a home workout',
    profile:'', context:'', availableLoadEquipment:[], availableSupportEquipment:[]});
  assert.ok(prompt.includes('practical guide the trainee can read before starting'));
  assert.ok(prompt.includes('starting position and equipment/anchor'));
  assert.ok(prompt.includes('observable errors AND immediately state how to correct each'));
  assert.ok(prompt.includes('For bands specify exactly where and how they are anchored'));
  assert.ok(C.outputSchema('program.create').schema.properties.program.properties.desc.maxLength === 1800);
  assert.ok(C.outputSchema('program.modify').schema.properties.patch.properties.desc.maxLength === 1800);
});

const created = {contractVersion:2, program:{name:'Сила', desc:'', progressionEvery:2, rotate:false, rotateDays:[], plans:[
  {days:['mon', 'thu'], rounds:1, roundRest:0, exercises:[
    {warmup:false, stages:[stage('Отжимания от стены', {advance:'ceiling'}), stage('Отжимания с колен')]},
    {warmup:false, stages:[stage('Жим гантелей', {load:{type:'weight', equipment:'dumbbell', equipmentName:'', count:2,
      weight:10, levels:[], level:0}, progression:{mode:'weight', every:null, repsStep:null, repsMax:null, weightStep:2,
      weightMax:null, timeStep:null, timeMax:null}})]}
  ]}]}};

test('все схемы ответа — переносимое подмножество и сами валидны', () => {
  C.KINDS.forEach(k => assert.strictEqual(S.assertPortable(C.outputSchema(k).schema), true));
  assert.deepStrictEqual(S.validate(C.outputSchema('program.create').schema, created), []);
});

test('создание: ID выдаёт приложение, первый этап текущий, вес на одну гантель', () => {
  const res = C.programFromCreate(created, ids());
  assert.deepStrictEqual(res.errors, []);
  const p = res.program;
  assert.deepStrictEqual(p.plans[0].days, ['Пн', 'Чт']);
  assert.strictEqual(p.progression, 2);
  const chain = p.plans[0].exercises[0];
  assert.strictEqual(chain.stages.length, 2);
  assert.strictEqual(chain.currentStageId, chain.stages[0].stageId);
  assert.strictEqual(chain.stages[0].advance.mode, 'ceiling');
  const db = V2.activePrescription(p.plans[0].exercises[1]);
  assert.deepStrictEqual([db.load.equipment, db.load.count, db.load.weight], ['dumbbell', 2, 10]);
  assert.strictEqual(C.checkOutput('program.create', created, {}).ok, true);
});

test('создание: вес без снаряда — доменная ошибка', () => {
  const bad = JSON.parse(JSON.stringify(created));
  bad.program.plans[0].exercises[1].stages[0].load.equipment = null;
  const v = C.checkOutput('program.create', bad, {});
  assert.strictEqual(v.ok, false);
  assert.ok(v.missing.some(e => /equipment_required/.test(e)), v.missing.join());
});

test('неизвестный снаряд превращается в «Другое» со своим именем', () => {
  const p = C.prescriptionFromSpec(stage('X', {load:{type:'weight', equipment:'custom', equipmentName:'Канистра',
    count:1, weight:8, levels:[], level:0}}));
  assert.deepStrictEqual([p.load.equipment, p.load.name], ['custom', 'Канистра']);
});

const base = C.programFromCreate(created, ids()).program;
base.plans[0].id = 'plan_a';
base.plans[0].exercises[0].id = 'ex_1';
base.plans[0].exercises[1].id = 'ex_2';
base.plans[0].exercises[1].progressState = {count:1, current:{reps:null, weight:12, time:null, level:null}};
const view = C.programView(base);
const s1 = view.plans[0].exercises[0].stages[0].stageId;
const s2 = view.plans[0].exercises[0].stages[1].stageId;

test('правка: перестановка, правка с сохранением прогресса, новое и удаление', () => {
  const dto = {contractVersion:2, patch:{name:null, desc:null, progressionEvery:null, rotate:null, rotateDays:null},
    plans:[{ref:'plan_a', patch:{days:['tue'], rounds:null, roundRest:null}, exercises:[
      {ref:'ex_2', replace:{movementChanged:false, warmup:false, stages:[{ref:view.plans[0].exercises[1].stages[0].stageId,
        replace:null, new:null}], removedStageIds:[]}, new:null},
      {ref:null, replace:null, new:{warmup:true, stages:[stage('Вращения', {sets:1, progression:{mode:'none', every:null,
        repsStep:null, repsMax:null, weightStep:null, weightMax:null, timeStep:null, timeMax:null}})]}}
    ]}], removedPlanIds:[], removedExerciseIds:['ex_1']};
  assert.deepStrictEqual(S.validate(C.outputSchema('program.modify').schema, dto), []);
  assert.strictEqual(C.checkOutput('program.modify', dto, {program:view}).ok, true);
  const res = C.applyProgramModify(base, dto, ids());
  assert.deepStrictEqual(res.errors, []);
  const pl = res.program.plans[0];
  assert.deepStrictEqual(pl.days, ['Вт']);
  assert.strictEqual(pl.exercises[0].id, 'ex_2');
  assert.strictEqual(pl.exercises[0].progressState.current.weight, 12, 'тот же этап — прогресс сохранён');
  assert.strictEqual(pl.exercises[1].warmup, true);
  assert.ok(!pl.exercises.some(e => e.id === 'ex_1'));
  assert.strictEqual(res.program.name, 'Сила', 'patch null = без изменений');
});

test('правка: пропавшее упражнение и повтор ref — ошибка, ничего не применяется', () => {
  const missing = {contractVersion:2, patch:{name:null, desc:null, progressionEvery:null, rotate:null, rotateDays:null},
    plans:[{ref:'plan_a', patch:{days:null, rounds:null, roundRest:null}, exercises:[{ref:'ex_2', replace:null, new:null}]}],
    removedPlanIds:[], removedExerciseIds:[]};
  const r1 = C.applyProgramModify(base, missing, ids());
  assert.strictEqual(r1.program, null);
  assert.ok(r1.errors.includes('$:exercise_missing:ex_1'));
  const dup = JSON.parse(JSON.stringify(missing));
  dup.plans[0].exercises = [{ref:'ex_1', replace:null, new:null}, {ref:'ex_2', replace:null, new:null}, {ref:'ex_2', replace:null, new:null}];
  assert.ok(C.applyProgramModify(base, dup, ids()).errors.some(e => /duplicate_ref:ex_2/.test(e)));
});

test('правка цепочки: удалить текущий этап нельзя; новое движение — новые этапы и прогресс с нуля', () => {
  const ex = base.plans[0].exercises[0];
  const removeCurrent = {contractVersion:2, exercise:{movementChanged:false, warmup:false,
    stages:[{ref:s2, replace:null, new:null}], removedStageIds:[s1]}};
  assert.ok(C.applyExerciseModify(ex, removeCurrent, ids()).errors.includes('$.exercise:current_stage_removed'));
  const changed = {contractVersion:2, exercise:{movementChanged:true, warmup:false,
    stages:[{ref:null, replace:null, new:stage('Планка', {type:'time', value:'30', progression:{mode:'time', every:null,
      repsStep:null, repsMax:null, weightStep:null, weightMax:null, timeStep:5, timeMax:60}})}], removedStageIds:[]}};
  const res = C.applyExerciseModify(Object.assign({}, ex, {progressState:{count:2, current:{reps:'12', weight:null, time:null, level:null}}}), changed, ids());
  assert.deepStrictEqual(res.errors, []);
  assert.strictEqual(res.exercise.id, ex.id, 'слот тот же');
  assert.notStrictEqual(res.exercise.currentStageId, s1);
  assert.strictEqual(res.exercise.progressState.count, 0);
});

test('замена с тренировки: тот же слот, новое движение', () => {
  const ex = base.plans[0].exercises[1];
  const res = C.applyExerciseReplacement(ex, {contractVersion:2, exercise:{warmup:false, stages:[stage('Отжимания')]}}, ids());
  assert.deepStrictEqual(res.errors, []);
  assert.strictEqual(res.exercise.id, ex.id);
  assert.strictEqual(V2.activePrescription(res.exercise).name, 'Отжимания');
  assert.strictEqual(res.exercise.progressState.count, 0);
});

test('input и prompt: клиент не присылает prompt, правила и данные — в серверном тексте', () => {
  assert.ok(C.normalizeInput('program.create', {}).error);
  const {input} = C.normalizeInput('program.modify', {language:'Russian', task:'добавь планку', program:view,
    availableLoadEquipment:['dumbbell', 'mat', 'evil']});
  assert.deepStrictEqual(input.availableLoadEquipment, ['dumbbell']);
  const prompt = C.buildPrompt('program.modify', input);
  assert.ok(/TARGET program state/.test(prompt) && /добавь планку/.test(prompt) && /plan_a/.test(prompt));
  const manual = C.manualPrompt('exercise.create', C.normalizeInput('exercise.create', {task:'планка'}).input);
  assert.ok(/JSON Schema/.test(manual) && /"contractVersion"/.test(manual));
  assert.ok(prompt.length < 12000, 'правила короче старого протокола: ' + prompt.length);
});

test('копирование программы: тот же DTO, текущая нагрузка по желанию, обратный разбор', () => {
  const p = JSON.parse(JSON.stringify(base));
  const base2 = C.programToContract(p, false);
  assert.strictEqual(C.checkOutput('program.create', base2, {}).ok, true);
  assert.strictEqual(base2.program.plans[0].exercises[1].stages[0].load.weight, 10);
  const cur = C.programToContract(p, true);
  assert.strictEqual(cur.program.plans[0].exercises[1].stages[0].load.weight, 12, 'текущий рабочий вес');
  assert.strictEqual(cur.program.plans[0].exercises[1].stages[0].load.count, 2, 'снаряд и количество не меняются');
  const back = C.programFromCreate(cur, ids());
  assert.deepStrictEqual(back.errors, []);
  assert.strictEqual(back.program.plans[0].exercises[0].stages.length, 2);
});

test('ответ без contractVersion отклоняется', () => {
  assert.strictEqual(C.checkOutput('program.create', Object.assign({}, created, {contractVersion:1}), {}).reason, 'contract_version');
});


test('reference silhouette catalog DTO matches the V2 schema and is accepted by the model', () => {
  const fixture = require('../catalog/etalon-v-silhouette-ru-v2.json');
  assert.deepStrictEqual(S.validate(C.outputSchema('program.create').schema, fixture), []);
  assert.strictEqual(C.checkOutput('program.create', fixture, {}).ok, true);
  const program = C.programFromCreate(fixture, ids());
  assert.deepStrictEqual(program.errors, []);
  assert.strictEqual(program.program.plans.length, 2);
  assert.deepStrictEqual(program.program.plans.map(p=>p.exercises.length), [11,12]);
  assert.strictEqual(program.program.plans[0].exercises[5].stages.length, 2);
  assert.strictEqual(program.program.plans[1].exercises[11].stages.length, 2);
  const strength = program.program.plans.flatMap(p=>p.exercises.filter(ex=>!ex.warmup));
  assert.strictEqual(strength.length, 16);
});

test('catalog seed has complete RU and EN descriptions for every movement stage', () => {
  const CP = require('../lib/fit-catalog-program');
  const seed = require('../lib/seed');
  const item = seed.SEED_ITEMS.find(p=>p.id==='vshape_v2');
  assert.ok(item);
  const cleaned = CP.cleanCatalogProgram(item.program);
  assert.deepStrictEqual(cleaned.errors, []);
  const source = CP.textsOf(cleaned.program);
  assert.strictEqual(CP.textsComplete(source,item.locales.en.texts), true);
  assert.strictEqual(item.locales.en.texts.stages.length,25);
  assert.ok(item.program.desc.length > 1000);
});

console.log(`\nai-contract-v2: ${n} ok`);
