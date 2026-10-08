/* lib/fit-catalog-program.js: одна механика на запись каталога, тексты языков — накладками. */
const CP = require('../lib/fit-catalog-program');
const FitAIContract = require('../lib/fit-ai-contract');
const { catalogProgram, translated } = require('./helpers/catalog-program');

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null && !cond ? '  → ' + extra : '')); };

const base = catalogProgram('Сила дома', [
  {name:'Суставная разминка', warmup:true, type:'time', value:'60', sets:1},
  {name:'Приседания', desc:'Спина прямая.', mistakes:'Колени внутрь.'},
  {name:'Тяга гантели', load:{type:'weight', equipment:'dumbbell', equipmentName:'', count:1, weight:8, levels:[], level:0},
    progression:{mode:'weight', every:null, repsStep:null, repsMax:null, weightStep:2, weightMax:null, timeStep:null, timeMax:null}},
  'Планка'
], {desc:'Описание программы.'});

/* ---- cleanCatalogProgram ---- */
const personal = JSON.parse(JSON.stringify(base));
personal.id = 'p123'; personal.stats = {completions:7}; personal.locale = 'ru'; personal.time = '08:00';
personal.pub = {id:'u1'}; personal.from = {handle:'@x'}; personal.cover = 'data:image/png;base64,AA';
personal.plans[0].time = '07:00';
const ex1 = personal.plans[0].exercises[1];
ex1.progressState = {count:5, current:{reps:'15', weight:null, time:null, level:null}};
ex1.media = {kind:'img', data:'data:image/png;base64,AA'};
ex1.stages[0].mediaRef = 'm1';
const cleaned = CP.cleanCatalogProgram(personal);
const cp = cleaned.program;
ok('валидная программа проходит без ошибок', cleaned.errors.length === 0 && cleaned.exCount === 4, cleaned.errors.join(','));
ok('id вариантов, упражнений и этапов сохраняются',
   cp.plans[0].id === base.plans[0].id && cp.plans[0].exercises.map(e => e.id).join() === base.plans[0].exercises.map(e => e.id).join()
   && cp.plans[0].exercises[1].stages[0].stageId === base.plans[0].exercises[1].stages[0].stageId);
ok('личное состояние и медиа срезаны',
   cp.plans[0].exercises[1].progressState.count === 0 && cp.plans[0].exercises[1].progressState.current.reps === null
   && !('media' in cp.plans[0].exercises[1]) && cp.plans[0].exercises[1].stages[0].mediaRef === null);
ok('личные поля программы не попадают в каталог',
   ['id', 'stats', 'locale', 'time', 'pub', 'from', 'cover', 'storeId'].every(k => !(k in cp)) && !('time' in cp.plans[0]),
   Object.keys(cp).join(','));
ok('дни и механика на месте', cp.plans[0].days.join() === 'Пн,Чт' && cp.plans[0].rounds === 3
   && cp.plans[0].exercises[2].stages[0].prescription.load.weight === 8);

const dup = JSON.parse(JSON.stringify(base));
dup.plans[0].exercises[2].id = dup.plans[0].exercises[1].id;
dup.plans[0].exercises[2].stages[0].stageId = dup.plans[0].exercises[1].stages[0].stageId;
dup.plans[0].exercises[2].currentStageId = dup.plans[0].exercises[1].stages[0].stageId;
const dd = CP.cleanCatalogProgram(dup).program.plans[0].exercises;
ok('повторные id разводятся, currentStageId следует за этапом',
   dd[1].id !== dd[2].id && dd[1].stages[0].stageId !== dd[2].stages[0].stageId && dd[2].currentStageId === dd[2].stages[0].stageId);

const two = JSON.parse(JSON.stringify(base));
two.plans[0].exercises = two.plans[0].exercises.slice(0, 2);
ok('меньше трёх упражнений — ошибка', CP.cleanCatalogProgram(two).errors.includes('exercises.min'));
const noEquip = JSON.parse(JSON.stringify(base));
noEquip.plans[0].exercises[2].stages[0].prescription.load.equipment = null;
ok('вес без снаряда — ошибка упражнения',
   CP.cleanCatalogProgram(noEquip).errors.some(e => /load\.equipment_required/.test(e)));
const many = JSON.parse(JSON.stringify(base));
many.plans = Array.from({length:8}, () => JSON.parse(JSON.stringify(base.plans[0])));
const mc = CP.cleanCatalogProgram(many);
ok('не больше 7 вариантов', mc.errors.includes('plans.too_many') && mc.program.plans.length === 7);
const big = JSON.parse(JSON.stringify(base));
big.plans[0].exercises = Array.from({length:31}, () => JSON.parse(JSON.stringify(base.plans[0].exercises[1])));
const bc = CP.cleanCatalogProgram(big);
ok('не больше 30 упражнений в варианте', bc.errors.includes('plans[0].exercises.too_many') && bc.program.plans[0].exercises.length === 30);
const huge = JSON.parse(JSON.stringify(base));
huge.plans = Array.from({length:7}, () => ({days:[], rounds:1, roundRest:0,
  exercises:Array.from({length:30}, () => { const e = JSON.parse(JSON.stringify(base.plans[0].exercises[1])); e.stages[0].prescription.desc = 'x'.repeat(590); return e; })}));
ok('JSON программы ограничен', CP.cleanCatalogProgram(huge).errors.includes('program.too_large'));
ok('мусор вместо программы отклоняется', CP.cleanCatalogProgram({name:'x'}).program === null
   && CP.cleanCatalogProgram(null).errors[0] === 'program.required');

/* ---- накладки языков ---- */
const ru = CP.textsOf(base);
ok('textsOf снимает программу и каждый этап', ru.programName === 'Сила дома' && ru.programDesc === 'Описание программы.'
   && ru.stages.length === 4 && ru.stages[1].name === 'Приседания' && ru.stages[1].mistakes === 'Колени внутрь.');
const en = translated(base, {'Приседания':'Squats', 'Спина прямая.':'Keep your back straight.'});
ok('полная накладка признаётся полной', CP.textsComplete(ru, en));
const holes = JSON.parse(JSON.stringify(en)); holes.stages[1].mistakes = '';
ok('пустое поле там, где исходник непуст, — неполная', !CP.textsComplete(ru, holes));
const missing = JSON.parse(JSON.stringify(en)); missing.stages.pop();
ok('пропущенный этап — неполная', !CP.textsComplete(ru, missing));
const enProgram = CP.applyTexts(base, en);
ok('applyTexts меняет только тексты', enProgram.name === 'EN Сила дома'
   && enProgram.plans[0].exercises[1].stages[0].prescription.name === 'Squats'
   && enProgram.plans[0].exercises[1].stages[0].prescription.desc === 'Keep your back straight.'
   && JSON.stringify(FitAIContract.programToContract(enProgram).program.plans[0].exercises.map(e => e.stages[0].sets))
      === JSON.stringify(FitAIContract.programToContract(base).program.plans[0].exercises.map(e => e.stages[0].sets))
   && base.plans[0].exercises[1].stages[0].prescription.name === 'Приседания');
const foreign = CP.cleanTexts({programName:'X', stages:[{stageId:'nope', name:'Y'}, {stageId:ru.stages[0].stageId, name:'Warm-up'}]}, base);
ok('cleanTexts оставляет только этапы программы', foreign.stages.length === 1 && foreign.stages[0].name === 'Warm-up');
ok('exerciseNames — активные этапы по порядку',
   CP.exerciseNames(base).join('|') === 'Суставная разминка|Приседания|Тяга гантели|Планка');

/* ---- перевод ---- */
const schema = CP.translationSchema();
const props = node => {
  if(!node || typeof node !== 'object') return true;
  if(node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))){
    const keys = Object.keys(node.properties || {});
    if(node.additionalProperties !== false || keys.some(k => !(node.required || []).includes(k))) return false;
    return keys.every(k => props(node.properties[k]));
  }
  if(node.items) return props(node.items);
  return !node.anyOf && !node.$ref && !node.pattern && !node.format;
};
ok('схема перевода — переносимое подмножество', schema.name === 'catalog_translation_v1' && props(schema.schema));
const source = {name:'Сила дома', gives:'Три движения без зала и прыжков.', texts:ru};
const prompt = CP.translationPrompt('ru', 'en', source);
ok('prompt несёт исходник одной строкой и stageId', /from Russian to English/.test(prompt)
   && JSON.parse(prompt.split('\n').find(l => l.startsWith('SOURCE JSON: ')).slice(13)).texts.stages[0].stageId === ru.stages[0].stageId);
ok('проверка перевода принимает полный ответ', CP.checkTranslation(source, {name:'Home strength', gives:'Three moves.', texts:en}).ok);
ok('и отклоняет неполный', !CP.checkTranslation(source, {name:'Home strength', gives:'Three moves.', texts:missing}).ok
   && !CP.checkTranslation(source, {name:'', gives:'x', texts:en}).ok
   && !CP.checkTranslation(source, {name:'X', gives:'', texts:en}).ok);

process.exit(bad ? 1 : 0);
