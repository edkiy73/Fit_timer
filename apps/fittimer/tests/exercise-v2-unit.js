/* Модель упражнения V2 (lib/fit-exercise-v2.js): снаряды, количество, ключ конфигурации,
   этапы движения, копирование и компактная история.
   Матрица — docs/load-equipment-progression-plan-2026-10-08.md, раздел 14.
   Запуск: node tests/exercise-v2-unit.js */
const V2 = require('../lib/fit-exercise-v2');

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null && !cond ? '  → ' + extra : ''));
};

const presc = (load, extra) => Object.assign({name:'Упражнение', type:'reps', value:'8-10', sets:3, rest:60, load}, extra || {});
const one = (prescription, extra) => V2.normalizeExercise(Object.assign({
  id:'ex1', stages:[{stageId:'mv1', prescription}]
}, extra || {}));
const errs = r => r.errors.join(',');

/* ---- нагрузка ---- */
{
  const r = one(presc({type:'weight', equipment:'dumbbell', count:2, weight:10}));
  const l = V2.activePrescription(r.exercise).load;
  ok('2 гантели × 10 кг', !r.errors.length && l.count === 2 && l.weight === 10 && l.equipment === 'dumbbell', errs(r));
}
{
  const r = one(presc({type:'weight', equipment:'dumbbell', count:1, weight:10}, {perSide:true}));
  const p = V2.activePrescription(r.exercise);
  ok('тяга одной рукой: 1 гантель, по сторонам', !r.errors.length && p.load.count === 1 && p.perSide, errs(r));
}
{
  const r = one(presc({type:'weight', equipment:'barbell', count:1, weight:40}));
  ok('штанга 40 кг — одна собранная единица', !r.errors.length && V2.activePrescription(r.exercise).load.count === 1, errs(r));
}
{
  const a = one(presc({type:'weight', equipment:'kettlebell', count:1, weight:16}));
  const b = one(presc({type:'weight', equipment:'kettlebell', count:2, weight:16}));
  ok('1 и 2 гири по 16 кг — разные конфигурации',
    !a.errors.length && !b.errors.length
      && V2.cfgKey(V2.activePrescription(a.exercise).load) !== V2.cfgKey(V2.activePrescription(b.exercise).load));
}
{
  const r = one(presc({type:'weight', equipment:'vest', count:1, weight:10}));
  ok('жилет 10 кг', !r.errors.length, errs(r));
}
{
  const r = one(presc({type:'level', equipment:'band', levels:[{key:'light'},{key:'medium'},{key:'strong'}], level:1}));
  ok('резинка со стандартной шкалой', !r.errors.length && V2.activePrescription(r.exercise).load.level === 1, errs(r));
}
{
  const r = one(presc({type:'level', equipment:'band', levels:['Жёлтая','Красная','Чёрная'], level:2}));
  const l = V2.activePrescription(r.exercise).load;
  ok('резинка со своими цветами', !r.errors.length && l.levels.length === 3 && l.levels[2].label === 'Чёрная', errs(r));
}
{
  const r = one(presc({type:'level', equipment:'band', levels:['10–15 lb','15–25 lb','25–35 lb']}));
  ok('диапазоны lb — просто подписи уровней, не перевод в кг', !r.errors.length
    && V2.activePrescription(r.exercise).load.levels[0].label === '10–15 lb', errs(r));
}
{
  const r = one(presc({type:'weight', equipment:'custom', name:'Канистра', count:1, weight:12}));
  ok('свой снаряд + вес', !r.errors.length && V2.activePrescription(r.exercise).load.name === 'Канистра', errs(r));
  const noName = one(presc({type:'weight', equipment:'custom', count:1, weight:12}));
  ok('«Другое» без названия не сохраняется', noName.errors.some(e => /custom_name_required/.test(e)), errs(noName));
}
{
  const r = one(presc({type:'level', equipment:'custom', name:'Power Twister', levels:['Мягкий','Жёсткий']}));
  ok('свой снаряд + сопротивление', !r.errors.length, errs(r));
}
{
  const r = one(presc({type:'none', equipment:'dumbbell', weight:10}));
  const l = V2.activePrescription(r.exercise).load;
  ok('без дополнительной нагрузки: ни снаряда, ни веса', !r.errors.length && l.equipment === null && l.weight === 0, errs(r));
}
{
  const r = one(presc({type:'weight', count:2, weight:10}));
  ok('вес без снаряда не сохраняется', r.errors.some(e => /equipment_required/.test(e)), errs(r));
  const lv = one(presc({type:'level', levels:['A','B']}));
  ok('сопротивление без снаряда не сохраняется (TRX/угол — это этапы движения)',
    lv.errors.some(e => /equipment_required/.test(e)), errs(lv));
  const sup = one(presc({type:'weight', equipment:'bench', weight:10}));
  ok('скамья не может быть снарядом нагрузки', sup.errors.some(e => /equipment_not_load/.test(e)), errs(sup));
  const zero = one(presc({type:'weight', equipment:'dumbbell', count:2, weight:0}));
  ok('вес 0 у весовой нагрузки не сохраняется', zero.errors.some(e => /weight_required/.test(e)), errs(zero));
}

/* ---- доп. оборудование ---- */
{
  const press = one(presc({type:'weight', equipment:'dumbbell', count:2, weight:10}, {supportEquipment:['bench']}));
  ok('жим гантелей: нагрузка = гантели, доп. = скамья',
    !press.errors.length && V2.activePrescription(press.exercise).supportEquipment.join() === 'bench', errs(press));
  const pull = one(presc({type:'none'}, {supportEquipment:['pullup_bar']}));
  ok('подтягивания: без нагрузки, доп. = турник', !pull.errors.length
    && V2.activePrescription(pull.exercise).supportEquipment.join() === 'pullup_bar', errs(pull));
  const step = one(presc({type:'weight', equipment:'dumbbell', count:2, weight:5}, {supportEquipment:['step']}));
  ok('зашагивания: гантели + степ', !step.errors.length, errs(step));
  const wrong = one(presc({type:'none'}, {supportEquipment:['dumbbell']}));
  ok('гантель не попадает в доп. оборудование', wrong.errors.some(e => /support.unknown/.test(e)), errs(wrong));
  const roles = one(presc({type:'weight', equipment:'plate', count:1, weight:10}, {supportEquipment:['step']}));
  const plateStep = one(presc({type:'none'}, {supportEquipment:['plate']}));
  ok('один предмет в разных ролях: блин — груз или платформа', !roles.errors.length && !plateStep.errors.length,
    errs(roles) + ' / ' + errs(plateStep));
}

/* ---- ключ конфигурации ---- */
{
  const base = {type:'weight', equipment:'dumbbell', count:2, weight:5, unit:'kg'};
  const k = V2.cfgKey(base);
  ok('смена веса не меняет конфигурацию (2×5 → 2×6)', V2.cfgKey(Object.assign({}, base, {weight:6})) === k);
  ok('смена количества — новая конфигурация (1 → 2)', V2.cfgKey(Object.assign({}, base, {count:1})) !== k);
  ok('смена снаряда — новая конфигурация (гантели → штанга)', V2.cfgKey(Object.assign({}, base, {equipment:'barbell', count:1})) !== k);
  ok('единицы не входят в ключ', V2.cfgKey(Object.assign({}, base, {unit:'lb'})) === k);
  const band = {type:'level', equipment:'band', count:1, levels:[{key:'light'},{key:'medium'}], level:0};
  ok('шкала уровней не входит в ключ', V2.cfgKey(band) === V2.cfgKey(Object.assign({}, band, {levels:[{key:'medium'},{key:'light'},{label:'Новая'}], level:2})));
  const custom = {type:'weight', equipment:'custom', name:'Канистра | 20 л', count:1};
  const parsed = V2.parseCfgKey(V2.cfgKey(custom));
  ok('ключ обратим, в том числе со спецсимволами в своём названии',
    parsed && parsed.type === 'weight' && parsed.equipment === 'custom' && parsed.name === 'канистра | 20 л' && parsed.count === 1,
    JSON.stringify(parsed));
  ok('ключ короткий', k.length <= 12, k);
  ok('без нагрузки — один ключ', V2.cfgKey({type:'none'}) === 'n' && V2.parseCfgKey('n').type === 'none');
}

/* ---- прогрессия ---- */
{
  const r = one(presc({type:'weight', equipment:'dumbbell', count:2, weight:5},
    {progression:{mode:'double_range', every:null, reps:{step:1, max:15}, weight:{step:1, max:12}}}));
  const pr = V2.activePrescription(r.exercise).progression;
  ok('двойная прогрессия: every:null = наследовать частоту программы', !r.errors.length && pr.every === null && pr.mode === 'double_range', errs(r));
  const bad = one(presc({type:'none'}, {progression:{mode:'weight'}}));
  ok('весовая прогрессия без веса отклоняется', bad.errors.some(e => /mode_incompatible/.test(e)), errs(bad));
  const off = one(presc({type:'none'}, {progression:{mode:'none', every:0}}));
  ok('every:0 не используется как второй «выключено»', V2.activePrescription(off.exercise).progression.every === null);
  const noCeil = one(presc({type:'weight', equipment:'dumbbell', count:2, weight:5},
    {progression:{mode:'double_range', reps:{step:1}, weight:{step:1}}}));
  ok('двойная прогрессия без потолка повторов отклоняется', noCeil.errors.some(e => /reps_range_ceiling_required/.test(e)), errs(noCeil));
}

/* ---- этапы движения ---- */
{
  const knees = presc({type:'none'}, {name:'Отжимания с колен', progression:{mode:'reps', reps:{step:1, max:20}}});
  const full = presc({type:'none'}, {name:'Отжимания', progression:{mode:'reps', reps:{step:1}}});
  const r = V2.normalizeExercise({id:'push', warmup:false, currentStageId:'b', stages:[
    {stageId:'a', prescription:knees, advance:{mode:'ceiling'}},
    {stageId:'b', prescription:full, advance:{mode:'ceiling'}}
  ]});
  ok('цепочка из двух этапов, активный — второй', !r.errors.length && V2.activePrescription(r.exercise).name === 'Отжимания', errs(r));
  ok('у последнего этапа переход всегда manual', r.exercise.stages[1].advance.mode === 'manual');

  const dead = V2.normalizeExercise({id:'x', stages:[
    {stageId:'a', prescription:presc({type:'none'}, {progression:{mode:'reps', reps:{step:1}}}), advance:{mode:'ceiling'}},
    {stageId:'b', prescription:full}
  ]});
  ok('ceiling без потолка не сохраняется', dead.errors.some(e => /ceiling_requires_terminal_ceiling/.test(e)), errs(dead));
  const manual = V2.normalizeExercise({id:'x', stages:[
    {stageId:'a', prescription:presc({type:'none'}, {progression:{mode:'reps', reps:{step:1}}}), advance:{mode:'manual'}},
    {stageId:'b', prescription:full}
  ]});
  ok('manual-переход потолка не требует', !manual.errors.length, errs(manual));

  const five = V2.normalizeExercise({id:'x', stages:[1,2,3,4,5].map(i => ({stageId:'s' + i, prescription:presc({type:'none'}, {name:'S' + i})}))});
  ok('не больше 4 этапов', five.errors.includes('stages.too_many') && five.exercise.stages.length === 4);
  const dup = V2.normalizeExercise({id:'x', stages:[{stageId:'a', prescription:knees}, {stageId:'a', prescription:full}]});
  ok('повторный stageId внутри упражнения перевыдаётся', dup.exercise.stages[0].stageId !== dup.exercise.stages[1].stageId);
  const warm = V2.normalizeExercise({id:'w', warmup:true, stages:[{stageId:'a', prescription:knees}]});
  ok('разминка — свойство слота, не этапа', warm.exercise.warmup === true && !('warmup' in warm.exercise.stages[0].prescription));
}

/* ---- копирование ---- */
{
  const r = V2.normalizeExercise({id:'orig', currentStageId:'b', stages:[
    {stageId:'a', prescription:presc({type:'none'}, {name:'A'})},
    {stageId:'b', prescription:presc({type:'none'}, {name:'B'})}
  ]});
  const copy = V2.regenerateExerciseIds(JSON.parse(JSON.stringify(r.exercise)));
  ok('копия получает новый exercise.id и все новые stageId',
    copy.id !== 'orig' && copy.stages.every(s => s.stageId !== 'a' && s.stageId !== 'b'));
  ok('currentStageId копии указывает на новый id того же этапа',
    copy.currentStageId === copy.stages[1].stageId && V2.activePrescription(copy).name === 'B');
}

/* ---- компактная история ---- */
{
  const row = {exId:'e1a2b3c', stageId:'mv9x8y7z', cfgKey:'w|db||2', reps:'8-10', weight:12.5, unit:'kg', level:null};
  const reg = V2.registerStage({}, 'mv9x8y7z', 'e1a2b3c', 'Румынская тяга');
  const enc = V2.encodeLoadRow(row);
  const dec = V2.decodeLoadRow(enc, reg);
  ok('строка истории кодируется короткими ключами без значений по умолчанию и без exId',
    !('u' in enc) && !('t' in enc) && !('l' in enc) && !('e' in enc) && enc.c === 'w|db||2', JSON.stringify(enc));
  ok('кодек обратим: exId и имя этапа берутся из реестра этапов',
    dec.exId === row.exId && dec.stageId === row.stageId && dec.stageName === 'Румынская тяга' && dec.cfgKey === row.cfgKey
      && dec.reps === '8-10' && dec.weight === 12.5 && dec.unit === 'kg', JSON.stringify(dec));

  // Худший реалистичный случай: 2000 тренировок × 10 упражнений, у части — сопротивление
  // со своей подписью, все поля записи заполнены. Выполненные упражнения — номерами строк load.
  const entries = [];
  for(let i = 0; i < 2000; i++){
    const load = [];
    for(let j = 0; j < 10; j++){
      load.push(V2.encodeLoadRow({
        stageId:'mv' + (100000 + j), cfgKey:j % 3 ? 'w|db||2' : 'l|bd||1',
        reps:'12-15', weight:j % 3 ? 22.5 : 0, level:j % 3 ? null : 2, levelLabel:j % 3 ? '' : 'Очень сильная'
      }));
    }
    entries.push({
      id:'h' + i.toString(36) + 'abcdef', d:'2026-10-08', t:18, pid:'p1759912345678', planId:'pabcdef',
      note:'', sec:3600, kcal:350, status:'full', activityOnly:false, meaningful:true,
      doneExercises:10, plannedExercises:10, partial:[], skipped:[],
      doneSteps:60, plannedSteps:60, done:[0,1,2,3,4,5,6,7,8,9], load, planDays:'Пн·Ср·Пт'
    });
  }
  const names = {};
  for(let j = 0; j < 40; j++) V2.registerStage(names, 'mv' + (100000 + j), 'e' + (100000 + j), 'Румынская тяга с гантелями, вариант ' + j);
  const bytes = Buffer.byteLength(JSON.stringify({history:entries, stageNames:names}), 'utf8');
  const limit = 3 * 1024 * 1024;
  ok('2000 тренировок × 10 упражнений помещаются в лимит 3 МБ с запасом не меньше трети',
    bytes < limit * 2 / 3, (bytes / 1024 / 1024).toFixed(2) + ' МБ');
  console.log('        размер худшего случая: ' + (bytes / 1024 / 1024).toFixed(2) + ' МБ из 3 МБ');

  const gc = V2.gcStageNames({a:{n:'A'}, b:{n:'B'}, c:{n:'C'}}, [{load:[{s:'a'}]}],
    [{plans:[{exercises:[{stages:[{stageId:'b'}]}]}]}]);
  ok('GC имён этапов: остаются только этапы из истории и текущих программ', Object.keys(gc).sort().join() === 'a,b');
}

/* ---- справочник ---- */
{
  const codes = V2.EQUIPMENT.map(e => e.code);
  ok('коды снарядов уникальны', new Set(codes).size === codes.length);
  ok('снаряды нагрузки и доп. оборудование строятся из одного каталога',
    V2.equipmentIds('load').includes('dumbbell') && V2.equipmentIds('support').includes('bench')
      && V2.equipmentIds('load').includes('band') && V2.equipmentIds('support').includes('band'));
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё сошлось');
process.exit(bad ? 1 : 0);
