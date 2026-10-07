/* FitTimer exercise model V2 — единственная persistent-форма упражнения.
   Источник истины по смыслу: docs/load-equipment-progression-plan-2026-10-08.md (2.6, 2.8, 5.6, 10).
   Browser: globalThis.FitExerciseV2
   Server:  require('../lib/fit-exercise-v2')
   Без зависимостей: одни и те же правила нужны приложению, AI-валидатору на сервере и тестам.

   Форма упражнения (слот программы):
     {id, warmup, currentStageId, stages:[1..4 {stageId, prescription, advance, mediaRef, visualKey}], progressState}
   Обычное упражнение без цепочки хранит ровно один stage: второй persistent-формы нет. */
(function(root){
  const SCHEMA_VERSION = 2;
  const MAX_STAGES = 4;
  const MAX_LEVELS = 12;
  const PROG_EVERY_MAX = 15;

  /* ---- справочник оборудования ----
     Один каталог на всё: редактор, AI-чипы, AI enum, нормализация. Здесь только
     domain-метаданные; подписи живут в i18n (`equip.<id>`).
     code — короткий стабильный код для cfgKey и компактной истории, менять нельзя.
     roles — в каких ролях предмет встречается: load (создаёт нагрузку) / support
     (нужен для выполнения). Роль выбирается в конкретном упражнении.
     loadTypes — какие типы нагрузки допустимы, когда предмет — снаряд нагрузки.
     count — разумное количество по умолчанию в редакторе. */
  const EQUIPMENT = [
    {id:'dumbbell',     code:'db', roles:['load'],            loadTypes:['weight'],          count:2},
    {id:'barbell',      code:'bb', roles:['load'],            loadTypes:['weight'],          count:1},
    {id:'ez_bar',       code:'ez', roles:['load'],            loadTypes:['weight'],          count:1},
    {id:'kettlebell',   code:'kb', roles:['load','support'],  loadTypes:['weight'],          count:1},
    {id:'plate',        code:'pl', roles:['load','support'],  loadTypes:['weight'],          count:1},
    {id:'medball',      code:'mb', roles:['load'],            loadTypes:['weight'],          count:1},
    {id:'sandbag',      code:'sb', roles:['load'],            loadTypes:['weight'],          count:1},
    {id:'vest',         code:'vs', roles:['load'],            loadTypes:['weight'],          count:1},
    {id:'ankle_weight', code:'aw', roles:['load'],            loadTypes:['weight'],          count:2},
    {id:'machine',      code:'mc', roles:['load'],            loadTypes:['weight','level'],  count:1},
    {id:'cable',        code:'cb', roles:['load'],            loadTypes:['weight','level'],  count:1},
    {id:'band',         code:'bd', roles:['load','support'],  loadTypes:['level'],           count:1},
    {id:'expander',     code:'xp', roles:['load'],            loadTypes:['level'],           count:1},
    {id:'mat',          code:'mt', roles:['support'],         loadTypes:[],                  count:1},
    {id:'bench',        code:'bn', roles:['support'],         loadTypes:[],                  count:1},
    {id:'chair',        code:'ch', roles:['support'],         loadTypes:[],                  count:1},
    {id:'pullup_bar',   code:'pb', roles:['support'],         loadTypes:[],                  count:1},
    {id:'step',         code:'st', roles:['support'],         loadTypes:[],                  count:1},
    {id:'fitball',      code:'fb', roles:['support'],         loadTypes:[],                  count:1},
    {id:'dip_bars',     code:'dp', roles:['support'],         loadTypes:[],                  count:1},
    {id:'rack',         code:'rk', roles:['support'],         loadTypes:[],                  count:1},
    // «Другое»: своё название обязательно, роль и тип нагрузки задаёт упражнение
    {id:'custom',       code:'cu', roles:['load','support'],  loadTypes:['weight','level'],  count:1}
  ];
  const EQUIPMENT_BY_ID = new Map(EQUIPMENT.map(e => [e.id, e]));
  const EQUIPMENT_BY_CODE = new Map(EQUIPMENT.map(e => [e.code, e]));
  const equipment = id => EQUIPMENT_BY_ID.get(String(id || '')) || null;
  const equipmentIds = role => EQUIPMENT.filter(e => !role || e.roles.includes(role)).map(e => e.id);

  const LOAD_TYPES = ['none', 'weight', 'level'];
  const PROG_MODES = ['none', 'reps', 'weight', 'double_range', 'time', 'level', 'parallel'];
  const ADVANCE_MODES = ['ceiling', 'manual'];
  const BUILTIN_LEVEL_KEYS = ['light', 'medium', 'strong', 'veryStrong'];

  /* ---- мелкие приведения ---- */
  const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const int = (v, lo, hi, def) => {
    const n = Math.round(+v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  // вес — на ОДНУ единицу снаряда; для kg округляем до 0,5 как во всём приложении,
  // для других единиц (будущие lb) округление не навязываем
  const weightNum = (v, unit) => {
    const n = +String(v == null ? '' : v).replace(',', '.');
    if(!Number.isFinite(n) || n <= 0) return 0;
    const capped = Math.min(1000, n);
    return unit === 'kg' ? Math.round(capped * 2) / 2 : Math.round(capped * 100) / 100;
  };
  const stepOrMax = (raw, hi, round) => {
    if(raw == null || raw === '') return null;
    const n = +raw;
    if(!Number.isFinite(n) || n <= 0) return null;
    return round(Math.min(hi, n));
  };

  // «12» или «12-15»; время — всегда одно число секунд
  function normValue(v, type){
    const s = String(v == null ? '' : v).replace(',', '.').trim();
    const m = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    let a, b;
    if(m){ a = parseInt(m[1], 10); b = parseInt(m[2], 10); if(a > b){ const t = a; a = b; b = t; } }
    else { a = b = parseInt(s, 10) || 1; }
    a = Math.max(1, Math.min(type === 'time' ? 3600 : 999, a));
    b = Math.max(1, Math.min(type === 'time' ? 3600 : 999, b));
    if(type === 'time') return String(a);
    return a === b ? String(a) : a + '-' + b;
  }
  const valueMax = v => { const p = String(v).split('-'); return parseInt(p[p.length - 1], 10) || 1; };

  /* ---- уровни сопротивления ----
     Порядок = рост СЛОЖНОСТИ, не обязательно физически большего сопротивления
     (для помощи в подтягиваниях лестница идёт от сильной резинки к лёгкой).
     Identity уровня — key встроенной шкалы или физический label; индекс identity не является. */
  function cleanLevels(raw){
    const out = [], seen = new Set();
    (Array.isArray(raw) ? raw : []).forEach(item => {
      if(out.length >= MAX_LEVELS) return;
      let level = null;
      if(typeof item === 'string') level = str(item, 60) ? {label:str(item, 60)} : null;
      else if(item && BUILTIN_LEVEL_KEYS.includes(item.key)) level = {key:item.key};
      else if(item && str(item.label, 60)) level = {label:str(item.label, 60)};
      if(!level) return;
      const id = levelIdentity(level);
      if(seen.has(id)) return;
      seen.add(id);
      out.push(level);
    });
    return out;
  }
  const levelIdentity = level => level && level.key ? 'k:' + level.key
    : 'l:' + String((level && level.label) || '').trim().toLocaleLowerCase();
  const defaultLevels = () => BUILTIN_LEVEL_KEYS.map(key => ({key}));

  /* ---- ключ физической конфигурации ----
     Отвечает только на вопрос «чем создаётся нагрузка»: тип + снаряд + своё имя + количество.
     Рабочий вес/уровень, единицы и шкала уровней в ключ не входят. Ключ обратим и
     детерминирован: два устройства получают одну строку без словаря и без конфликтов. */
  const TYPE_CODE = {none:'n', weight:'w', level:'l'};
  const CODE_TYPE = {n:'none', w:'weight', l:'level'};
  function cfgKey(load){
    const l = load || {};
    const type = LOAD_TYPES.includes(l.type) ? l.type : 'none';
    if(type === 'none') return 'n';
    const eq = equipment(l.equipment);
    const name = eq && eq.id === 'custom' ? encodeURIComponent(str(l.name, 40).toLocaleLowerCase()) : '';
    return [TYPE_CODE[type], eq ? eq.code : '', name, Math.max(1, int(l.count, 1, 20, 1))].join('|');
  }
  function parseCfgKey(key){
    const parts = String(key || '').split('|');
    const type = CODE_TYPE[parts[0]];
    if(!type) return null;
    if(type === 'none') return {type:'none', equipment:null, name:'', count:1};
    const eq = EQUIPMENT_BY_CODE.get(parts[1] || '');
    if(!eq) return null;
    let name = '';
    try{ name = decodeURIComponent(parts[2] || ''); }catch(_){ return null; }
    return {type, equipment:eq.id, name, count:Math.max(1, int(parts[3], 1, 20, 1))};
  }

  /* ---- prescription одного stage ----
     Всё, что AI/пользователь задают для конкретного варианта движения. Чистит «что угодно»
     до валидных значений и собирает список нарушений strict-правил: lenient-нормализация
     нужна черновику редактора, strict-проверка — сохранению, импорту и AI-ответу. */
  function normalizeLoad(raw, errors){
    const r = raw && typeof raw === 'object' ? raw : {};
    const type = LOAD_TYPES.includes(r.type) ? r.type : 'none';
    if(type === 'none') return {type:'none', equipment:null, name:'', count:1, unit:'kg', weight:0, levels:[], level:0};
    const unit = r.unit === 'lb' ? 'lb' : 'kg';
    const eq = equipment(r.equipment);
    const out = {type, equipment:eq ? eq.id : null, name:'', count:int(r.count, 1, 20, eq ? eq.count : 1),
      unit, weight:0, levels:[], level:0};
    // Снаряд обязателен для weight/level: «10 кг непонятно чего» и есть та
    // неоднозначность, ради устранения которой сделана V2. null допустим только в черновике.
    if(!eq) errors.push('load.equipment_required');
    else if(!eq.roles.includes('load')) errors.push('load.equipment_not_load');
    else if(!eq.loadTypes.includes(type)) errors.push('load.equipment_type_mismatch');
    if(eq && eq.id === 'custom'){
      out.name = str(r.name, 40);
      if(!out.name) errors.push('load.custom_name_required');
    }
    if(type === 'weight'){
      out.weight = weightNum(r.weight, unit);
      if(!(out.weight > 0)) errors.push('load.weight_required');
    } else {
      out.levels = cleanLevels(r.levels);
      if(out.levels.length < 2){ errors.push('load.levels_required'); out.levels = defaultLevels(); }
      out.level = int(r.level, 0, out.levels.length - 1, 0);
    }
    return out;
  }

  function normalizeSupport(raw, errors){
    const out = [], seen = new Set();
    (Array.isArray(raw) ? raw : []).forEach(item => {
      const id = typeof item === 'string' ? item : item && item.id;
      const eq = equipment(id);
      if(!eq || !eq.roles.includes('support')){ errors.push('support.unknown'); return; }
      const entry = eq.id === 'custom' ? {id:'custom', name:str(item && item.name, 40)} : eq.id;
      if(eq.id === 'custom' && !entry.name){ errors.push('support.custom_name_required'); return; }
      const key = eq.id === 'custom' ? 'custom:' + entry.name.toLocaleLowerCase() : eq.id;
      if(seen.has(key) || out.length >= 8) return;
      seen.add(key);
      out.push(entry);
    });
    return out;
  }

  // какие способы прогрессии совместимы с метрикой и типом нагрузки
  function allowedModes(type, loadType){
    const time = type === 'time';
    if(loadType === 'level') return time ? ['none','time','level'] : ['none','level','reps'];
    if(loadType === 'weight') return time ? ['none','time','weight','parallel'] : ['none','double_range','weight','reps','parallel'];
    return time ? ['none','time'] : ['none','reps'];
  }
  // какие оси реально растут при данном способе
  function growingAxes(p){
    const mode = p.progression.mode, time = p.type === 'time';
    if(mode === 'double_range') return ['reps','weight'];
    if(mode === 'parallel') return time ? ['time','weight'] : ['reps','weight'];
    if(mode === 'level') return !time && p.progression.reps.step ? ['reps','level'] : ['level'];
    if(mode === 'none') return [];
    return [mode];
  }

  function normalizeProgression(raw, type, loadType, errors){
    const r = raw && typeof raw === 'object' ? raw : {};
    let mode = PROG_MODES.includes(r.mode) ? r.mode : 'none';
    if(!allowedModes(type, loadType).includes(mode)){ errors.push('progression.mode_incompatible'); mode = 'none'; }
    // null = наследовать частоту программы; 0 как второй «выключено» не используется
    const every = r.every == null || r.every === '' || !(+r.every > 0) ? null : int(r.every, 1, PROG_EVERY_MAX, null);
    const axis = (a, hiStep, hiMax, round) => ({
      step:stepOrMax(a && a.step, hiStep, round),
      max:stepOrMax(a && a.max, hiMax, round)
    });
    return {
      mode, every,
      reps:axis(r.reps, 20, 999, Math.round),
      weight:axis(r.weight, 100, 1000, v => Math.round(v * 2) / 2),
      time:axis(r.time, 600, 3600, Math.round)
    };
  }

  function normalizePrescription(raw, opts){
    const o = opts || {};
    const r = raw && typeof raw === 'object' ? raw : {};
    const errors = [];
    const type = r.type === 'time' ? 'time' : 'reps';
    const muscles = Array.isArray(o.muscles) ? o.muscles : null;
    const p = {
      name:str(r.name, 80),
      desc:text(r.desc, 2000),
      type,
      value:normValue(r.value, type),
      sets:int(r.sets, 1, 10, 1),
      perSide:!!r.perSide,
      rest:int(r.rest, 0, 600, 0),
      restAfter:r.restAfter == null || r.restAfter === '' ? null : int(r.restAfter, 0, 600, 0),
      muscles:(Array.isArray(r.muscles) ? r.muscles : []).filter(m => typeof m === 'string' && (!muscles || muscles.includes(m))).slice(0, 12),
      mistakes:text(r.mistakes, 1000),
      video:str(r.video, 300)
    };
    if(!p.name) errors.push('prescription.name_required');
    p.load = normalizeLoad(r.load, errors);
    p.supportEquipment = normalizeSupport(r.supportEquipment, errors);
    p.progression = normalizeProgression(r.progression, type, p.load.type, errors);

    // Двойная прогрессия обязана двигать обе стадии: без шага/потолка повторов цикл сломан.
    const pr = p.progression;
    if(pr.mode === 'double_range'){
      if(!pr.reps.step) pr.reps.step = 1;
      if(!pr.weight.step) errors.push('progression.weight_step_required');
      if(!pr.reps.max || pr.reps.max <= valueMax(p.value)) errors.push('progression.reps_range_ceiling_required');
    }
    if(['weight','parallel'].includes(pr.mode) && !pr.weight.step) errors.push('progression.weight_step_required');
    if(pr.mode === 'reps' && !pr.reps.step) pr.reps.step = 1;
    if(pr.mode === 'time' && !pr.time.step) pr.time.step = 5;
    if(pr.mode === 'parallel'){
      if(type === 'time' && !pr.time.step) pr.time.step = 5;
      if(type !== 'time' && !pr.reps.step) pr.reps.step = 1;
    }
    if(p.load.type === 'weight' && pr.weight.max && pr.weight.max < p.load.weight) errors.push('progression.weight_max_below_start');
    return {prescription:p, errors};
  }

  // Автоматический переход «ceiling» возможен, только если у этапа есть настоящий
  // terminal ceiling: прогрессия включена и у каждой растущей оси есть потолок.
  function hasTerminalCeiling(p){
    const axes = growingAxes(p);
    if(!axes.length) return false;
    return axes.every(a => a === 'level' ? true : !!(p.progression[a] && p.progression[a].max));
  }

  /* ---- слот упражнения ---- */
  const normalizeState = raw => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const c = r.current && typeof r.current === 'object' ? r.current : {};
    const numOrNull = (v, lo, hi) => v == null || v === '' || !Number.isFinite(+v) ? null : Math.max(lo, Math.min(hi, +v));
    return {
      count:int(r.count, 0, 9999, 0),
      current:{
        reps:c.reps == null || c.reps === '' ? null : normValue(c.reps, 'reps'),
        weight:numOrNull(c.weight, 0, 1000),
        time:c.time == null || c.time === '' ? null : int(c.time, 1, 3600, null),
        level:c.level == null || c.level === '' ? null : int(c.level, 0, MAX_LEVELS - 1, null)
      }
    };
  };

  function normalizeExercise(raw, opts){
    const o = opts || {};
    const r = raw && typeof raw === 'object' ? raw : {};
    const errors = [];
    const newId = typeof o.newId === 'function' ? o.newId : (prefix => prefix + Math.random().toString(36).slice(2, 8));
    const ex = {
      id:str(r.id, 40) || newId('e'),
      warmup:!!r.warmup,
      currentStageId:'',
      stages:[],
      progressState:normalizeState(r.progressState)
    };
    const rawStages = Array.isArray(r.stages) ? r.stages : [];
    if(!rawStages.length) errors.push('stages.required');
    if(rawStages.length > MAX_STAGES) errors.push('stages.too_many');
    const seen = new Set();
    rawStages.slice(0, MAX_STAGES).forEach((st, i) => {
      const s = st && typeof st === 'object' ? st : {};
      let stageId = str(s.stageId, 40);
      if(!stageId || seen.has(stageId)) stageId = newId('mv');
      seen.add(stageId);
      const res = normalizePrescription(s.prescription, o);
      res.errors.forEach(e => errors.push(`stages[${i}].${e}`));
      const advanceMode = s.advance && ADVANCE_MODES.includes(s.advance.mode) ? s.advance.mode : 'manual';
      ex.stages.push({
        stageId,
        prescription:res.prescription,
        advance:{mode:advanceMode},
        mediaRef:s.mediaRef == null ? null : str(s.mediaRef, 120) || null,
        visualKey:str(s.visualKey, 120)
      });
    });
    // у последнего этапа переходить некуда — режим ни на что не влияет, держим manual
    if(ex.stages.length) ex.stages[ex.stages.length - 1].advance.mode = 'manual';
    ex.stages.forEach((st, i) => {
      if(st.advance.mode === 'ceiling' && !hasTerminalCeiling(st.prescription)){
        errors.push(`stages[${i}].advance.ceiling_requires_terminal_ceiling`);
      }
    });
    const wanted = str(r.currentStageId, 40);
    ex.currentStageId = ex.stages.some(s => s.stageId === wanted) ? wanted : (ex.stages[0] ? ex.stages[0].stageId : '');
    if(wanted && wanted !== ex.currentStageId) errors.push('currentStageId.unknown');
    // progressState относится к активному stage: уровень вне его шкалы недействителен
    const active = activeStage(ex);
    if(active && ex.progressState.current.level != null){
      const levels = active.prescription.load.levels;
      if(active.prescription.load.type !== 'level' || ex.progressState.current.level >= levels.length){
        ex.progressState.current.level = null;
      }
    }
    return {exercise:ex, errors};
  }

  const activeStage = ex => ex && Array.isArray(ex.stages)
    ? (ex.stages.find(s => s.stageId === ex.currentStageId) || ex.stages[0] || null)
    : null;
  // ЕДИНСТВЕННЫЙ read-helper для runtime/UI: поля активного варианта движения
  const activePrescription = ex => { const s = activeStage(ex); return s ? s.prescription : null; };

  /* ---- копирование ----
     stageId — app-owned identity экземпляра, не переносимый контент: любая копия
     (дублировать упражнение/программу, каталог, файл, ссылка, тренер) получает новые
     exercise.id и ВСЕ stageId, а currentStageId переназначается на новый id того же этапа.
     Иначе две копии делили бы stageNames и историю. */
  function regenerateExerciseIds(ex, newId){
    const make = typeof newId === 'function' ? newId : (prefix => prefix + Math.random().toString(36).slice(2, 8));
    const map = new Map();
    ex.id = make('e');
    (ex.stages || []).forEach(st => { const id = make('mv'); map.set(st.stageId, id); st.stageId = id; });
    ex.currentStageId = map.get(ex.currentStageId) || ((ex.stages || [])[0] || {}).stageId || '';
    return ex;
  }

  /* ---- компактная история ----
     stats.history синхронизируется одним документом с серверным лимитом 3 МБ, поэтому
     строка нагрузки в storage — короткие ключи без пустых/стандартных полей.
     Domain-код работает с читаемым объектом; кодек — единственное место, где есть s/c/r.

     exId в строке НЕ повторяется: этап принадлежит ровно одному слоту, поэтому
     stats.stageNames[stageId] = {n:имя этапа, e:exercise.id} хранит связь один раз.
     Расчёт худшего случая (tests/exercise-v2-unit.js): с exId в каждой строке
     2000 тренировок × 10 упражнений занимали 2,34 МБ из 3 МБ. */
  function encodeLoadRow(row){
    const r = row || {};
    const out = {s:String(r.stageId || ''), c:String(r.cfgKey || 'n')};
    if(r.reps != null && r.reps !== '') out.r = String(r.reps);
    if(+r.time > 0) out.t = Math.round(+r.time);
    if(+r.weight > 0) out.w = +r.weight;
    if(r.unit && r.unit !== 'kg') out.u = String(r.unit);
    if(r.level != null && Number.isFinite(+r.level)) out.l = Math.round(+r.level);
    if(r.levelKey) out.lk = String(r.levelKey);
    else if(r.levelLabel) out.ll = String(r.levelLabel);
    return out;
  }
  function decodeLoadRow(row, stageNames){
    const r = row || {};
    const info = stageNames && r.s ? stageNames[r.s] : null;
    return {
      exId:String((info && info.e) || ''), stageId:String(r.s || ''), stageName:String((info && info.n) || ''),
      cfgKey:String(r.c || 'n'),
      reps:r.r == null ? '' : String(r.r), time:+r.t || 0, weight:+r.w || 0, unit:r.u ? String(r.u) : 'kg',
      level:r.l == null ? null : +r.l, levelKey:r.lk ? String(r.lk) : '', levelLabel:r.ll ? String(r.ll) : ''
    };
  }

  /* stats.stageNames[stageId] = {n, e}. stageId уникален и выдаётся приложением,
     поэтому карта только дополняется и не конфликтует между устройствами;
     переименование этапа обновляет n (это тот же этап, история показывает новое имя). */
  function registerStage(stageNames, stageId, exId, name){
    if(!stageNames || !stageId) return stageNames;
    stageNames[String(stageId)] = {n:str(name, 80), e:String(exId || '')};
    return stageNames;
  }
  // Очистка удаляет запись, только если этапа нет НИ в сохранённой истории, НИ в текущих программах.
  function gcStageNames(names, history, programs){
    const live = new Set();
    (Array.isArray(history) ? history : []).forEach(h => (Array.isArray(h && h.load) ? h.load : [])
      .forEach(row => { if(row && row.s) live.add(String(row.s)); }));
    (Array.isArray(programs) ? programs : []).forEach(p => (Array.isArray(p && p.plans) ? p.plans : [])
      .forEach(pl => (Array.isArray(pl && pl.exercises) ? pl.exercises : [])
        .forEach(ex => (Array.isArray(ex && ex.stages) ? ex.stages : [])
          .forEach(st => { if(st && st.stageId) live.add(String(st.stageId)); }))));
    const out = {};
    Object.keys(names || {}).forEach(id => { if(live.has(id)) out[id] = names[id]; });
    return out;
  }

  const api = {
    SCHEMA_VERSION, MAX_STAGES, PROG_EVERY_MAX,
    EQUIPMENT, LOAD_TYPES, PROG_MODES, ADVANCE_MODES, BUILTIN_LEVEL_KEYS,
    equipment, equipmentIds, allowedModes, growingAxes, hasTerminalCeiling,
    normValue, cleanLevels, levelIdentity,
    cfgKey, parseCfgKey,
    normalizePrescription, normalizeExercise, activeStage, activePrescription,
    regenerateExerciseIds,
    encodeLoadRow, decodeLoadRow, registerStage, gcStageNames
  };
  root.FitExerciseV2 = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
