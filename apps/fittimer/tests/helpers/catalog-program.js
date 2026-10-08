/* Каталожная программа V2 для серверных и браузерных тестов (Node-сторона).

   catalogProgram(name, exercises, extra) собирает программу тем же путём, что админский
   импорт Program DTO: FitAIContract.programFromCreate → FitCatalogProgram.cleanCatalogProgram.
   exercises — названия или {name, …поля этапа DTO}. extra.plans — несколько вариантов:
   [{days:['mon'], rounds, roundRest, exercises:[…]}].
   translated(program, map, opts) — накладка второго языка: map {исходное имя → перевод}. */
const FitAIContract = require('../../lib/fit-ai-contract');
const CP = require('../../lib/fit-catalog-program');

const stage = spec => Object.assign({
  name:'', desc:'', mistakes:'', type:'reps', value:'12', sets:3, perSide:false, rest:45, restAfter:null,
  muscles:['le'], load:{type:'none', equipment:null, equipmentName:'', count:1, weight:0, levels:[], level:0},
  supportEquipment:[], progression:{mode:'none', every:null, repsStep:null, repsMax:null, weightStep:null,
    weightMax:null, timeStep:null, timeMax:null}, advance:'manual'
}, spec);
const exercise = e => {
  const spec = typeof e === 'string' ? {name:e} : e;
  const warmup = !!spec.warmup;
  const rest = Object.assign({}, spec); delete rest.warmup;
  return {warmup, stages:[stage(rest)]};
};
let seq = 0;
const ids = prefix => prefix + 't' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

function catalogProgram(name, exercises, extra){
  const x = extra || {};
  const plans = (x.plans || [{days:x.days || ['mon', 'thu'], rounds:x.rounds || 3, roundRest:60, exercises}])
    .map(pl => ({days:pl.days || [], rounds:pl.rounds || 1, roundRest:pl.roundRest == null ? 60 : pl.roundRest,
      exercises:pl.exercises.map(exercise)}));
  const dto = {contractVersion:2, program:{name, desc:x.desc || '', progressionEvery:x.progressionEvery || null,
    rotate:!!x.rotate, rotateDays:x.rotateDays || [], plans}};
  const checked = FitAIContract.checkOutput('program.create', dto);
  if(!checked.ok) throw new Error('catalogProgram: ' + JSON.stringify(checked));
  const made = FitAIContract.programFromCreate(dto, ids);
  const cleaned = CP.cleanCatalogProgram(made.program);
  if(cleaned.errors.length && !(x.allowErrors)) throw new Error('catalogProgram: ' + cleaned.errors.join(', '));
  return cleaned.program;
}

function translated(program, map, opts){
  const o = opts || {};
  const src = CP.textsOf(program);
  const tr = v => (map && map[v]) || (v ? (o.prefix || 'EN ') + v : '');
  return {programName:o.programName || tr(src.programName), programDesc:tr(src.programDesc),
    stages:src.stages.map(s => ({stageId:s.stageId, name:tr(s.name), desc:tr(s.desc), mistakes:tr(s.mistakes)}))};
}

module.exports = { catalogProgram, translated };
