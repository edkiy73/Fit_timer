/* FitTimer catalog program — одна механика на запись каталога, тексты по языкам поверх неё.

   Запись каталога (Redis `c:<id>`) хранит ОДИН объект программы модели V2 со стабильными
   id вариантов/упражнений/этапов и текстами на исходном языке, плюс текстовые накладки
   (overlay) для каждого языка: {programName, programDesc, stages:[{stageId, name, desc, mistakes}]}.
   Механика (подходы, нагрузка, прогрессия, дни) у языков одна по построению — перевод
   меняет только человекочитаемые поля и не может разъехаться со структурой.

   Каталожная программа — шаблон, а не личный экземпляр: без progressState, media, stats,
   истории, ссылок на тренера и прочих личных полей.

   Browser: globalThis.FitCatalogProgram. Server: require('./fit-catalog-program'). */
(function(root, factory){
  const cjs = typeof module === 'object' && module.exports;
  const V2 = cjs ? require('./fit-exercise-v2') : root.FitExerciseV2;
  const C = cjs ? require('./fit-ai-contract') : root.FitAIContract;
  const api = factory(V2, C);
  if(cjs) module.exports = api;
  else root.FitCatalogProgram = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(V2, C){
  const LANGS = ['ru', 'en'];
  const MAX_PLANS = 7, MAX_EXERCISES = 30, MIN_EXERCISES = 3, MAX_JSON = 60000;
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const LIMITS = {programName:60, programDesc:1800, name:60, desc:600, mistakes:300};

  const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const text = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
  const int = (v, lo, hi, def) => {
    const n = Math.round(+v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  const days = list => DAYS.filter(d => (Array.isArray(list) ? list : []).includes(d));
  const rnd = prefix => prefix + Math.random().toString(36).slice(2, 8);
  const clone = v => JSON.parse(JSON.stringify(v));
  const freshState = () => ({count:0, current:{reps:null, weight:null, time:null, level:null}});

  /* Программа (личная, из AI-ответа или из хранилища) → каталожная программа.
     id сохраняются: на них держатся текстовые накладки языков и фото упражнений. */
  function cleanCatalogProgram(raw, opts){
    const o = opts || {};
    const newId = typeof o.newId === 'function' ? o.newId : rnd;
    const errors = [];
    const r = raw && typeof raw === 'object' ? raw : null;
    if(!r || !Array.isArray(r.plans)) return {program:null, errors:['program.required'], exCount:0};
    if(r.plans.length > MAX_PLANS) errors.push('plans.too_many');
    const planIds = new Set(), exIds = new Set(), stageIds = new Set();
    const unique = (id, seen, prefix) => {
      let out = str(id, 40);
      while(!out || seen.has(out)) out = newId(prefix);
      seen.add(out);
      return out;
    };
    let exCount = 0;
    const plans = r.plans.slice(0, MAX_PLANS).map((plRaw, pi) => {
      const pl = plRaw && typeof plRaw === 'object' ? plRaw : {};
      const list = Array.isArray(pl.exercises) ? pl.exercises : [];
      if(list.length > MAX_EXERCISES) errors.push(`plans[${pi}].exercises.too_many`);
      const exercises = list.slice(0, MAX_EXERCISES).map((exRaw, ei) => {
        const src = exRaw && typeof exRaw === 'object' ? exRaw : {};
        const res = V2.normalizeExercise(Object.assign({}, src, {progressState:null, media:null}),
          {muscles:C.MUSCLE_IDS, newId});
        res.errors.forEach(e => errors.push(`plans[${pi}].exercises[${ei}].${e}`));
        const ex = res.exercise;
        ex.id = unique(ex.id, exIds, 'e');
        const remap = new Map();
        ex.stages.forEach(st => {
          const id = unique(st.stageId, stageIds, 'mv');
          remap.set(st.stageId, id);
          st.stageId = id;
          // будущие медиа этапа — личное дело установленной копии
          st.mediaRef = null;
        });
        ex.currentStageId = remap.get(ex.currentStageId) || (ex.stages[0] ? ex.stages[0].stageId : '');
        ex.progressState = freshState();
        delete ex.media;
        return ex;
      });
      exCount += exercises.length;
      return {id:unique(pl.id, planIds, 'p'), days:r.rotate ? [] : days(pl.days),
        rounds:int(pl.rounds, 1, 10, 1), roundRest:int(pl.roundRest, 0, 600, 0), exercises};
    });
    const program = {
      name:str(r.name, LIMITS.programName),
      desc:text(r.desc, LIMITS.programDesc),
      progression:int(r.progression, 0, V2.PROG_EVERY_MAX, 0),
      rotate:!!r.rotate,
      days:r.rotate ? days(r.days) : [],
      plans
    };
    if(!program.name) errors.push('name.required');
    if(!plans.length) errors.push('plans.required');
    plans.forEach((pl, i) => { if(!pl.exercises.length) errors.push(`plans[${i}].exercises.required`); });
    if(exCount < MIN_EXERCISES) errors.push('exercises.min');
    if(JSON.stringify(program).length > MAX_JSON) errors.push('program.too_large');
    return {program, errors, exCount};
  }

  // все этапы программы по порядку: plan → exercise → stage
  function eachStage(program, fn){
    ((program && program.plans) || []).forEach((pl, pi) => ((pl && pl.exercises) || []).forEach((ex, ei) =>
      ((ex && ex.stages) || []).forEach(st => fn(st, ex, pi, ei))));
  }

  // Текстовая накладка языка, снятая с самой программы (исходный язык записи).
  function textsOf(program){
    const stages = [];
    eachStage(program, st => {
      const p = st.prescription || {};
      stages.push({stageId:String(st.stageId), name:String(p.name || ''), desc:String(p.desc || ''),
        mistakes:String(p.mistakes || '')});
    });
    return {programName:String((program && program.name) || ''), programDesc:String((program && program.desc) || ''), stages};
  }

  // Накладка из чужих рук (админ, ИИ, хранилище): только известные stageId и поля в пределах лимитов.
  function cleanTexts(raw, program){
    const r = raw && typeof raw === 'object' ? raw : {};
    const known = new Set();
    eachStage(program, st => known.add(String(st.stageId)));
    const seen = new Set();
    const stages = [];
    (Array.isArray(r.stages) ? r.stages : []).forEach(s => {
      const id = s && str(s.stageId, 40);
      if(!id || seen.has(id) || (program && !known.has(id))) return;
      seen.add(id);
      stages.push({stageId:id, name:str(s.name, LIMITS.name), desc:text(s.desc, LIMITS.desc),
        mistakes:text(s.mistakes, LIMITS.mistakes)});
    });
    return {programName:str(r.programName, LIMITS.programName), programDesc:text(r.programDesc, LIMITS.programDesc), stages};
  }

  // Программа на языке накладки. Механика не трогается; пустое поле накладки оставляет исходное.
  function applyTexts(program, texts){
    if(!program) return program;
    const out = clone(program);
    const t = texts && typeof texts === 'object' ? texts : {};
    if(str(t.programName, LIMITS.programName)) out.name = str(t.programName, LIMITS.programName);
    if(text(t.programDesc, LIMITS.programDesc)) out.desc = text(t.programDesc, LIMITS.programDesc);
    const by = new Map((Array.isArray(t.stages) ? t.stages : []).filter(s => s && s.stageId).map(s => [String(s.stageId), s]));
    eachStage(out, st => {
      const s = by.get(String(st.stageId));
      if(!s || !st.prescription) return;
      if(str(s.name, LIMITS.name)) st.prescription.name = str(s.name, LIMITS.name);
      if(text(s.desc, LIMITS.desc)) st.prescription.desc = text(s.desc, LIMITS.desc);
      if(text(s.mistakes, LIMITS.mistakes)) st.prescription.mistakes = text(s.mistakes, LIMITS.mistakes);
    });
    return out;
  }

  // Накладка полная: есть каждый этап исходника, и непусто всё, что непусто в исходнике.
  function textsComplete(sourceTexts, texts){
    const src = sourceTexts || {}, t = texts || {};
    if(!str(t.programName, LIMITS.programName)) return false;
    if(text(src.programDesc, LIMITS.programDesc) && !text(t.programDesc, LIMITS.programDesc)) return false;
    const by = new Map((Array.isArray(t.stages) ? t.stages : []).filter(s => s && s.stageId).map(s => [String(s.stageId), s]));
    return (Array.isArray(src.stages) ? src.stages : []).every(a => {
      const b = by.get(String(a.stageId));
      if(!b || !str(b.name, LIMITS.name)) return false;
      if(text(a.desc, LIMITS.desc) && !text(b.desc, LIMITS.desc)) return false;
      if(text(a.mistakes, LIMITS.mistakes) && !text(b.mistakes, LIMITS.mistakes)) return false;
      return true;
    });
  }

  // Названия упражнений (активный этап) по порядку — для обложки и сводок.
  function exerciseNames(program){
    const out = [];
    ((program && program.plans) || []).forEach(pl => ((pl && pl.exercises) || []).forEach(ex => {
      const p = V2.activePrescription(ex);
      if(p && p.name) out.push(String(p.name));
    }));
    return out;
  }

  /* Перевод записи каталога администратором (Structured Output). Переносимое
     подмножество JSON Schema: все свойства в required, additionalProperties:false. */
  const obj = props => ({type:'object', additionalProperties:false, required:Object.keys(props), properties:props});
  const s = (max, min) => Object.assign({type:'string', maxLength:max}, min ? {minLength:min} : {});
  let TRANSLATION = null;
  function translationSchema(){
    if(TRANSLATION) return TRANSLATION;
    TRANSLATION = {name:'catalog_translation_v1', schema:obj({
      name:s(60, 1),
      gives:s(300),
      texts:obj({
        programName:s(LIMITS.programName, 1),
        programDesc:s(LIMITS.programDesc),
        stages:{type:'array', maxItems:MAX_PLANS * MAX_EXERCISES * V2.MAX_STAGES, items:obj({
          stageId:s(40, 1), name:s(LIMITS.name, 1), desc:s(LIMITS.desc), mistakes:s(LIMITS.mistakes)
        })}
      })
    })};
    return TRANSLATION;
  }
  const LANG_NAMES = {ru:'Russian', en:'English'};
  function translationPrompt(from, to, source){
    const src = source || {};
    return [
      'Translate a FitTimer workout catalog entry from ' + LANG_NAMES[from] + ' to ' + LANG_NAMES[to] + '.',
      'Translate only human-readable text: name (catalog title), gives (what the program gives), texts.programName, texts.programDesc and every stage name, desc and mistakes.',
      'Keep every stageId exactly as given and return every stage once. If a source string is empty, return an empty string.',
      'Do not summarize, improve or reinterpret the workout. Translate meaning faithfully. Address the reader informally and without gendered wording.',
      'SOURCE JSON: ' + JSON.stringify({name:String(src.name || ''), gives:String(src.gives || ''), texts:src.texts || {}})
    ].join('\n');
  }
  // Ответ перевода (ИИ или вставка руками) против исходной накладки
  function checkTranslation(source, json){
    if(!json || typeof json !== 'object') return {ok:false, reason:'translation_bad_json'};
    if(!str(json.name, 60)) return {ok:false, reason:'translation_incomplete'};
    if(str(source && source.gives, 300) && !str(json.gives, 300)) return {ok:false, reason:'translation_incomplete'};
    if(!textsComplete(source && source.texts, json.texts)) return {ok:false, reason:'translation_incomplete'};
    return {ok:true};
  }

  return {
    LANGS, MAX_PLANS, MAX_EXERCISES, MIN_EXERCISES, MAX_JSON, LIMITS,
    cleanCatalogProgram, textsOf, cleanTexts, applyTexts, textsComplete, exerciseNames,
    translationSchema, translationPrompt, checkTranslation
  };
});
