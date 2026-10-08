/* FitTimer AI_TEST_MODE fixtures: deterministic answers for FitTimer prompts
   (catalog translation, admin catalog generation, video parsing). Registered with
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
  if(kind === 'program_create_v2') return {contractVersion:2, program:{name:'Тестовая программа', desc:'Тест V2.',
    progressionEvery:2, rotate:false, rotateDays:[], plans:[{days:['mon', 'thu'], rounds:2, roundRest:60, exercises:[
      {warmup:true, stages:[STAGE('Разминка суставов', {sets:1, progression:{mode:'none', every:null, repsStep:null,
        repsMax:null, weightStep:null, weightMax:null, timeStep:null, timeMax:null}})]},
      {warmup:false, stages:[STAGE('Приседания')]},
      {warmup:false, stages:[STAGE('Отжимания от стены', {advance:'ceiling'}), STAGE('Отжимания с колен')]},
      {warmup:false, stages:[STAGE('Тяга гантели', {load:{type:'weight', equipment:'dumbbell', equipmentName:'', count:1,
        weight:8, levels:[], level:0}, progression:{mode:'weight', every:null, repsStep:null, repsMax:null, weightStep:2,
        weightMax:null, timeStep:null, timeMax:null}})]}
    ]}]}};
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
  if(type !== 'text') return null;
  if(prompt.startsWith('Translate the user-visible fitness text')){
    return {text:JSON.stringify({
      name:'EN Test Program',
      gives:'Complete test program translated for the catalog editor.',
      programName:'EN Test Program',
      programDescription:'Complete test program translated for the catalog editor.',
      exercises:[{index:0,name:'Squats',description:'Controlled movement with a neutral spine.',mistakes:'',replacementName:'',replacementDescription:''}]
    })};
  }
  if(prompt.includes('=== ADMIN CATALOG REQUEST ===')){
    return {text:[
      'ПРОГРАММА: Тестовая программа',
      'ОПИСАНИЕ ПРОГРАММЫ: Полноценная тестовая программа для проверки создания через ИИ в админке.',
      'ПРОГРЕССИЯ: 3',
      'ЧЕРЕДОВАНИЕ: нет',
      'ДЕНЬ: Пн, Ср, Пт',
      'КРУГИ: 3',
      'ОТДЫХ МЕЖДУ КРУГАМИ: 60',
      '',
      'УПРАЖНЕНИЕ: Приседания',
      'ОПИСАНИЕ: Контролируемое движение с нейтральной спиной.',
      'ФОРМАТ: повторения',
      'ЗНАЧЕНИЕ: 12',
      'ПОДХОДЫ: 1',
      'ОТДЫХ: 30'
    ].join('\n')};
  }
  return null;
}

// Unit tests may stub the runtime without the registration hook.
if(typeof ai.registerTestResponder === 'function') ai.registerTestResponder(fitTestResponder);

module.exports = { fitTestResponder };
