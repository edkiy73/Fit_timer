/* FitTimer AI_TEST_MODE fixtures: deterministic answers for FitTimer prompts
   (AI Contract V2 — app and admin catalog alike, catalog translation, video parsing). Registered with
   the generic AI runtime so lib/ai.js stays free of fitness content. */
const ai = require('../../../packages/core/server/ai');

/* AI Contract V2 (JSON по схеме). Правки ссылаются на ID из prompt'а, поэтому фикстура
   читает переданную программу/упражнение из текста запроса. */
const STAGE = (name, extra) => Object.assign({
  name, desc:'Тестовая техника.', mistakes:'', type:'reps', value:'10', sets:2, perSide:false, rest:30, restAfter:null,
  muscles:['le'], load:{type:'none', equipment:null, equipmentName:'', count:1, weight:0, levels:[], level:0},
  supportEquipment:[], progression:{mode:'reps', every:null, repsStep:1, repsMax:15, weightStep:null, weightMax:null,
    timeStep:null, timeMax:null}, advance:'manual'
}, extra || {});
const jsonAfter = (prompt, label) => {
  const line = prompt.split('\n').find(l => l.startsWith(label));
  return line ? JSON.parse(line.slice(label.length)) : null;
};
function contractFixture(kind, prompt){
  if(kind === 'program_create_v2'){
    const segment = prompt.match(/This is day (\d+) of (\d+): (mon|tue|wed|thu|fri|sat|sun)\./);
    if(segment){
      const day = segment[3];
      return {contractVersion:2, program:{
        name:'Тестовая программа', desc:'Тест V2.', progressionEvery:4,
        rotate:false, rotateDays:[], plans:[{days:[day], rounds:1, roundRest:60,
          exercises:[{warmup:true, stages:[STAGE('Разминка '+day)]},
            {warmup:false, stages:[STAGE('Упражнение '+day)]}]}]
      }};
    }
    return {contractVersion:2, program:{name:'Тестовая программа', desc:'Тест V2.',
    progressionEvery:2, rotate:false, rotateDays:[], plans:[{days:['mon', 'thu'], rounds:2, roundRest:60, exercises:[
      {warmup:true, stages:[STAGE('Разминка суставов', {sets:1, progression:{mode:'none', every:null, repsStep:null,
        repsMax:null, weightStep:null, weightMax:null, timeStep:null, timeMax:null}})]},
      {warmup:false, stages:[STAGE('Приседания')]},
      {warmup:false, stages:[STAGE('Отжимания от стены', {advance:'ceiling'}), STAGE('Отжимания с колен')]},
      {warmup:false, stages:[STAGE('Тяга гантели', {load:{type:'weight', equipment:'dumbbell', equipmentName:'', count:1,
        weight:8, levels:[], level:0}, progression:{mode:'weight', every:null, repsStep:null, repsMax:null, weightStep:2,
        weightMax:null, timeStep:null, timeMax:null}})]}
    ]}]}};
  }
  if(kind === 'exercise_create_v2') return {contractVersion:2, exercises:[{warmup:false, stages:[STAGE('Выпады', {perSide:true})]}]};
  if(kind === 'exercise_replace_v2') return {contractVersion:2, exercise:{warmup:false, stages:[STAGE('Ягодичный мост')]}};
  if(kind === 'exercise_modify_v2'){
    const ex = jsonAfter(prompt, 'Exercise (JSON): ');
    return {contractVersion:2, exercise:{movementChanged:false, warmup:!!ex.warmup, removedStageIds:[],
      stages:ex.stages.map(st => st.stageId === ex.currentStageId
        ? {ref:st.stageId, replace:Object.assign({}, st, {stageId:undefined, value:'15', name:st.name}), new:null}
        : {ref:st.stageId, replace:null, new:null})}};
  }
  if(kind === 'program_modify_v2'){
    const p = jsonAfter(prompt, 'Program (JSON): ');
    return {contractVersion:2, patch:{name:p.name + ' (изм.)', desc:null, progressionEvery:null, rotate:null, rotateDays:null},
      plans:p.plans.map((pl, i) => ({ref:pl.id, patch:{days:null, rounds:null, roundRest:null},
        exercises:pl.exercises.map(ex => ({ref:ex.id, replace:null, new:null}))
          .concat(i === 0 ? [{ref:null, replace:null, new:{warmup:false, stages:[STAGE('Планка', {type:'time', value:'30',
            progression:{mode:'time', every:null, repsStep:null, repsMax:null, weightStep:null, weightMax:null, timeStep:5, timeMax:60}})]}}] : [])})),
      removedPlanIds:[], removedExerciseIds:[]};
  }
  // Перевод записи каталога: те же stageId, тексты с пометкой языка — детерминированно
  if(kind === 'catalog_translation_v1'){
    const src = jsonAfter(prompt, 'SOURCE JSON: ') || {};
    const t = src.texts || {};
    const mark = v => v ? 'EN ' + v : '';
    return {name:mark(src.name), gives:mark(src.gives), texts:{programName:mark(t.programName),
      programDesc:mark(t.programDesc), stages:(t.stages || []).map(s => ({stageId:s.stageId, name:mark(s.name),
        desc:mark(s.desc), mistakes:mark(s.mistakes)}))}};
  }
  return null;
}
const clean = v => JSON.parse(JSON.stringify(v));

function fitTestResponder(type, prompt, opts){
  const schemaName = opts && opts.schema && opts.schema.name;
  if(type === 'text' && schemaName){
    const out = contractFixture(schemaName, prompt);
    if(out) return {text:JSON.stringify(clean(out))};
  }
  if(type === 'video'){
    return {text:JSON.stringify({isWorkout:false,confidence:.99,reason:'test mode',exercises:[]})};
  }
  return null;
}

// Unit tests may stub the runtime without the registration hook.
if(typeof ai.registerTestResponder === 'function') ai.registerTestResponder(fitTestResponder);

module.exports = { fitTestResponder };
