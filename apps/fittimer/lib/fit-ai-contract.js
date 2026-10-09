/* FitTimer AI Contract V2 — JSON-обмен с ИИ вместо старого строкового протокола.
   Источник смысла: docs/load-equipment-progression-plan-2026-10-08.md, раздел 8.4.

   Один модуль на сервер и клиент:
   - outputSchema(kind) — переносимая JSON Schema ответа (Structured Output + локальная проверка);
   - normalizeInput(kind, raw) — структурированный input запроса (клиент не присылает prompt);
   - buildPrompt(kind, input) — prompt для встроенного ИИ, manualPrompt — для «скопировать в чат»;
   - checkOutput(kind, json, input) — доменная проверка ответа (refs, кросс-полевые правила);
   - programFromCreate / exercisesFromCreate / applyProgramModify / applyExerciseModify —
     детерминированный adapter AI DTO → persistent-модель V2 (ID выдаёт приложение).

   AI DTO ≠ persistent-модель: в нём нет progressState, media, stageId новых этапов и
   других app-owned полей. Browser: globalThis.FitAIContract. Server: require('./fit-ai-contract'). */
(function(root, factory){
  const V2 = typeof module === 'object' && module.exports ? require('./fit-exercise-v2') : root.FitExerciseV2;
  const api = factory(V2);
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.FitAIContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(V2){
  const CONTRACT_VERSION = 2;
  const PROMPT_VERSION = '2026-10-09.2';
  const KINDS = ['program.create', 'program.modify', 'exercise.create', 'exercise.modify', 'exercise.replace'];
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const MUSCLE_IDS = ['ne', 'sh', 'ch', 'ar', 'co', 'ba', 'gl', 'le', 'hm', 'ca'];
  const LOAD_IDS = V2.equipmentIds('load');
  const SUPPORT_IDS = V2.equipmentIds('support');
  const MAX_PLANS = 7, MAX_EXERCISES = 30;

  /* ---------------- схемы ответа ---------------- */
  const obj = props => ({type:'object', additionalProperties:false, required:Object.keys(props), properties:props});
  const str = (max, min) => Object.assign({type:'string', maxLength:max}, min ? {minLength:min} : {});
  const int = (lo, hi) => ({type:'integer', minimum:lo, maximum:hi});
  const nint = (lo, hi) => ({type:['integer', 'null'], minimum:lo, maximum:hi});
  const nnum = (lo, hi) => ({type:['number', 'null'], minimum:lo, maximum:hi});
  const arr = (items, max, min) => Object.assign({type:'array', items, maxItems:max}, min ? {minItems:min} : {});

  function stageSchema(){
    return obj({
      name:str(60, 1),
      desc:str(600),
      mistakes:str(300),
      type:{type:'string', enum:['reps', 'time']},
      value:Object.assign(str(9, 1), {description:'reps: "12" or a range "8-12"; time: seconds, e.g. "40"'}),
      sets:int(1, 10),
      perSide:{type:'boolean'},
      rest:int(0, 600),
      restAfter:nint(0, 600),
      muscles:arr({type:'string', enum:MUSCLE_IDS}, 5),
      load:obj({
        type:{type:'string', enum:['none', 'weight', 'level']},
        equipment:{type:['string', 'null'], enum:LOAD_IDS.concat([null])},
        equipmentName:str(40),
        count:int(1, 20),
        weight:Object.assign({type:'number', minimum:0, maximum:500}, {description:'kg of ONE unit; 0 when load.type is not weight'}),
        levels:arr(str(40), 12),
        level:int(0, 11)
      }),
      supportEquipment:arr({type:'string', enum:SUPPORT_IDS}, 6),
      progression:obj({
        mode:{type:'string', enum:V2.PROG_MODES},
        every:nint(1, V2.PROG_EVERY_MAX),
        repsStep:nint(1, 20), repsMax:nint(1, 999),
        weightStep:nnum(0.5, 50), weightMax:nnum(0.5, 500),
        timeStep:nint(1, 300), timeMax:nint(1, 3600)
      }),
      advance:{type:'string', enum:['ceiling', 'manual']}
    });
  }
  const exerciseSchema = () => obj({warmup:{type:'boolean'}, stages:arr(stageSchema(), V2.MAX_STAGES, 1)});
  const planSchema = () => obj({
    days:arr({type:'string', enum:DAY_KEYS}, 7),
    rounds:int(1, 10), roundRest:int(0, 600),
    exercises:arr(exerciseSchema(), MAX_EXERCISES, 1)
  });
  // элемент target-state: ровно одно из ref / ref+replace / new — проверяется доменно
  const stageItemSchema = () => obj({ref:{type:['string', 'null'], maxLength:40},
    replace:Object.assign({}, stageSchema(), {type:['object', 'null']}),
    new:Object.assign({}, stageSchema(), {type:['object', 'null']})});
  const exerciseReplaceSchema = () => obj({
    movementChanged:{type:'boolean'}, warmup:{type:'boolean'},
    stages:arr(stageItemSchema(), V2.MAX_STAGES, 1),
    removedStageIds:arr(str(40), V2.MAX_STAGES)
  });

  const SCHEMAS = {};
  function outputSchema(kind){
    if(SCHEMAS[kind]) return SCHEMAS[kind];
    const head = {contractVersion:{type:'integer', enum:[CONTRACT_VERSION]}};
    let schema = null;
    if(kind === 'program.create'){
      schema = obj(Object.assign(head, {program:obj({
        name:str(60, 1), desc:str(1800),
        progressionEvery:nint(1, V2.PROG_EVERY_MAX),
        rotate:{type:'boolean'}, rotateDays:arr({type:'string', enum:DAY_KEYS}, 7),
        plans:arr(planSchema(), MAX_PLANS, 1)
      })}));
    }else if(kind === 'exercise.create'){
      schema = obj(Object.assign(head, {exercises:arr(exerciseSchema(), 10, 1)}));
    }else if(kind === 'exercise.replace'){
      schema = obj(Object.assign(head, {exercise:exerciseSchema()}));
    }else if(kind === 'exercise.modify'){
      schema = obj(Object.assign(head, {exercise:exerciseReplaceSchema()}));
    }else if(kind === 'program.modify'){
      const exItem = obj({ref:{type:['string', 'null'], maxLength:40},
        replace:Object.assign({}, exerciseReplaceSchema(), {type:['object', 'null']}),
        new:Object.assign({}, exerciseSchema(), {type:['object', 'null']})});
      schema = obj(Object.assign(head, {
        patch:obj({name:{type:['string', 'null'], maxLength:60}, desc:{type:['string', 'null'], maxLength:1800},
          progressionEvery:nint(0, V2.PROG_EVERY_MAX), rotate:{type:['boolean', 'null']},
          rotateDays:{type:['array', 'null'], items:{type:'string', enum:DAY_KEYS}, maxItems:7}}),
        plans:arr(obj({
          ref:{type:['string', 'null'], maxLength:40},
          patch:obj({days:{type:['array', 'null'], items:{type:'string', enum:DAY_KEYS}, maxItems:7},
            rounds:nint(1, 10), roundRest:nint(0, 600)}),
          exercises:arr(exItem, MAX_EXERCISES, 1)
        }), MAX_PLANS, 1),
        removedPlanIds:arr(str(40), MAX_PLANS),
        removedExerciseIds:arr(str(40), MAX_PLANS * MAX_EXERCISES)
      }));
    }
    if(!schema) throw new Error('contract_unknown_kind');
    SCHEMAS[kind] = {name:kind.replace('.', '_') + '_v2', schema};
    return SCHEMAS[kind];
  }
  // Верхний предел ответа по задаче: правка ссылками короче полного создания
  const MAX_OUTPUT_TOKENS = {'program.create':24000, 'program.modify':20000, 'exercise.create':6000,
    'exercise.modify':5000, 'exercise.replace':5000};

  /* ---------------- input ---------------- */
  const text = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
  const ids = (v, allowed, max) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter(x => allowed.includes(x)).slice(0, max);

  // View существующего упражнения/программы для правки: стабильные ID + спецификации
  // этапов + текущая рабочая нагрузка ТОЛЬКО для чтения. Без media, истории и UI-полей.
  function stageView(st){
    const spec = specFromPrescription(st.prescription, st.advance);
    return Object.assign({stageId:String(st.stageId)}, spec);
  }
  function exerciseView(ex){
    const ps = ex && ex.progressState;
    const cur = ps && ps.current || {};
    const current = {};
    ['reps', 'weight', 'time', 'level'].forEach(k => { if(cur[k] != null && cur[k] !== '') current[k] = cur[k]; });
    return {id:String(ex.id), warmup:!!ex.warmup, currentStageId:String(ex.currentStageId),
      currentLoadReadOnly:current, stages:(ex.stages || []).map(stageView)};
  }
  function programView(p){
    return {name:String(p.name || ''), desc:String(p.desc || ''),
      progressionEvery:Number.isFinite(+p.progression) && +p.progression > 0 ? Math.round(+p.progression) : null,
      rotate:!!p.rotate, rotateDays:daysToKeys(p.days),
      plans:(p.plans || []).map(pl => ({id:String(pl.id), days:daysToKeys(pl.days), rounds:+pl.rounds || 1,
        roundRest:+pl.roundRest || 0, exercises:(pl.exercises || []).map(exerciseView)}))};
  }

  function normalizeInput(kind, raw){
    if(!KINDS.includes(kind)) return {error:'contract_unknown_kind'};
    const r = raw && typeof raw === 'object' ? raw : {};
    const input = {
      language:text(r.language, 20) || 'English',
      task:text(r.task, 6000),
      profile:text(r.profile, 2000),
      context:text(r.context, 3000),
      availableLoadEquipment:ids(r.availableLoadEquipment, LOAD_IDS, 20),
      availableSupportEquipment:ids(r.availableSupportEquipment, SUPPORT_IDS, 20)
    };
    if(kind === 'program.create'){
      input.scheduleDays = ids(r.scheduleDays, DAY_KEYS, 7);
      input.splitByDays = r.splitByDays === true && input.scheduleDays.length >= 2;
    }
    if(kind === 'program.modify'){
      if(!r.program || !Array.isArray(r.program.plans)) return {error:'contract_input_program_required'};
      input.program = r.program;
    }
    if(kind === 'exercise.modify' || kind === 'exercise.replace'){
      if(!r.exercise || !Array.isArray(r.exercise.stages)) return {error:'contract_input_exercise_required'};
      input.exercise = r.exercise;
    }
    if(kind === 'exercise.create' && r.program && Array.isArray(r.program.plans)) input.program = r.program;
    if(!input.task && kind !== 'exercise.replace') return {error:'contract_input_task_required'};
    if(JSON.stringify(input).length > 110000) return {error:'contract_input_too_large'};
    return {input};
  }

  /* ---------------- prompt ---------------- */
  // Правила, которые схема не выражает. Один факт — одна строка.
  // Тренерская логика, которую схема не выражает (перенесена из прежнего протокола без правил формата)
  const COACH = 'Act like a deeply experienced strength-and-conditioning coach: base decisions on exercise science, biomechanics, load management, technique, recovery and progression. Treat explicitly provided user data as authoritative constraints; do not make the whole program easier because unrelated details are unknown; be cautious only where it matters (unknown absolute loads, pain/medical risk, aggressive progression). Do not invent facts about the user.';
  const RULES = [
    'Do not target a fixed number of exercises: choose exercise count, sets and rounds from the goal, structure and time budget.',
    'Program desc (up to 1800 characters) is a practical guide the trainee can read before starting, NOT promotional copy: state whom the plan suits, specific goals and realistic benefits, weekly structure and recovery spacing, intended workout effort (e.g. reps in reserve), how to use progression and what to do when technique or recovery deteriorates, and what to measure to judge progress. State realistic expectations without deadlines or guaranteed body changes. Include nutrition only as a brief optional general reminder when relevant; no meal plans or invented individual dietary prescriptions. Avoid fluff, hype, vague promises and repetitive warnings.',
    'Individual exercise desc is an actionable compact coaching instruction (roughly 250-550 characters where needed, maximum 600): starting position and equipment/anchor, limb placement/grip/palm orientation if relevant, exact direction of movement, a clear end point, controlled return, and one useful cue for target muscle or stability. Write natural connected sentences; do not pad simple exercises to a fixed length.',
    'Write for a person who has NEVER SEEN the exercise. Use everyday language. Translate anatomical shorthand into visible positions of hands, weights and body.',
    'For every exercise, mentally simulate one complete repetition: start position; path of weight or limbs; visible end point or contact; controlled return. Resolve ambiguous movements. Include a safe setup cue when needed.',
    'Describe movement in the trainee\'s perspective, not abstract anatomy. Say "bend your elbows and lower the dumbbells to either side of your chest until the backs of your upper arms lightly touch the floor" rather than just "lower elbows"; say "push dumbbells back above your chest" rather than "press up" when the destination is ambiguous. Identify which part of the arm touches the floor.',
    'Use landmarks (beside chest, near hips, above shoulders, toward anchor) and clarify palms and elbows when necessary; angles alone are not instructions.',
    'Before finalizing, run a beginner comprehension check: can a user perform ONE rep without a video, knowing start and end positions? If not, rewrite.',
    'Exercise mistakes (maximum 300 characters): select the 2-3 most plausible movement-specific observable errors AND immediately state how to correct each. Do not merely negate or repeat the description; do not fill with generic phrases like maintain proper form. Use pain or discomfort precautions where relevant, not as generic boilerplate.',
    'For bands specify exactly where and how they are anchored, which hand holds which end, initial tension and direction of resistance. Never describe impossible band mechanics or ambiguously mix bilateral and single-arm setups.',
    'Technique cues must be anatomically reasonable: do not prescribe mandatory thumb-down internally rotated lateral raises, forced permanently retracted scapulae, forced spinal flattening, guaranteed isolated muscle sensations or arbitrary joint angles. Prefer controlled comfortable ranges and truthful muscle involvement.',
    'Choose a balanced program for the actual goals, equipment, recovery, weekly volume and time. Order competing exercises so the priority muscles receive quality work; avoid duplicating many near-identical moves while omitting fundamental patterns. Keep warm-up useful and brief. Do not imply spot reduction of fat, guaranteed posture correction or exact physique transformation deadlines.',
    'Choose actual user-supplied weights and equipment counts where available; do not overwrite known working loads with zero or unsupported guesses. When loads are unknown, select conservative working starting values and explain adjustment by clean repetitions and 1-3 reps in reserve; do not present guesses as measured user performance. Choose progression weight steps the supplied adjustable equipment can actually make; when plate increments are unknown, do not falsely claim that exact step sizes are available.',
    'When a target duration is given, estimate the whole session: timed work = seconds × sides; rep work ≈ reps × 3 seconds × sides; × sets and rounds; plus rest between sets, rest after exercises, side switches and between rounds; warm-up runs once. For 5–20 minute targets stay within about ±5 minutes, for 30+ minutes within about ±20%; "45+" is a lower bound.',
    'Program progressionEvery = default check frequency: after N FULL completions of an exercise the app asks whether to raise its load (it is not +N reps or kg). Use 4 unless the program clearly needs another value.',
    'Resistance levels without user-given labels use the generic relative scale; never invent band colors. Preserve real colors/numbers the user gave, in order.',
    'Reps with resistance: default mode "level" (reps rise to repsMax, then the next level and reps reset). Do not choose "parallel" unless the user asks for both axes to rise together or an edited exercise already uses it.',
    'Weighted reps: "weight" = fixed reps, weight grows; "reps" = reps grow; "double_range" = the whole range moves up by repsStep keeping its width (8-10 → 9-11 …) until repsMax caps its upper bound, then weight + weightStep and the range resets.',
    'Machine keys and enums stay in English exactly as in the schema; human-readable text (names, descriptions, mistakes, custom equipment names, level labels) is written in LANGUAGE.',
    'value: reps as "12" or a range "8-12"; time as seconds, e.g. "40". type "time" never uses a range.',
    'load.type "none": no external load (body weight is never stored as weight): equipment null, weight 0, levels [], level 0, count 1.',
    'load.type "weight": equipment is required; weight is kg of ONE unit, never a total; count = units used at the same time (two dumbbells = 2; one-arm dumbbell work = 1). Barbell/machine/vest count 1.',
    'load.type "level": resistance without kg (bands, expanders, some machines). levels = ordered from easiest to hardest; for bands without known labels use ["light","medium","strong","veryStrong"]; level = index of the working level.',
    'equipment "custom" only for a specific item missing from the list, with its name in equipmentName; otherwise equipmentName is "".',
    'supportEquipment: items needed to perform the movement but not creating load (bench, mat, pull-up bar). Available equipment means guaranteed to be available, not required in every exercise; use any subset, including none. Do not assume unlisted specialized equipment unless the request implies it.',
    'progression.mode: "none" = off; "reps" grows reps; "time" grows seconds; "weight" grows weight; "double_range" grows reps inside the range, then weight and back to the range start; "level" grows reps inside the range, then the next level; "parallel" grows reps/time and weight together. every null = inherit the program frequency. Steps/max that the mode does not use are null. A *Max is the terminal ceiling; leave null when there is no natural ceiling.',
    'stages: 1 stage normally. Return 2–4 stages only when the movement has a natural ladder of variants from easier to harder (e.g. wall push-up → knee push-up → push-up). advance "ceiling" = offer the next stage when this stage reaches its terminal ceiling (requires progression with a max on every growing axis); "manual" otherwise. The last stage is always "manual".',
    'Warm-up exercises (warmup true) run once before the rounds, sets 1, progression "none".',
    'rest = seconds between sets of one exercise; restAfter = seconds after the whole exercise (null = same as rest). rounds = how many times the plan list repeats; roundRest = seconds between rounds.',
    'Never return ids for new objects. Never invent progress, history or images.',
    'Do not diagnose or claim medical clearance. Respect stated limitations conservatively.'
  ];
  const MODIFY_RULES = [
    'Return the TARGET program state using references: every existing plan id appears exactly once in plans[].ref or in removedPlanIds; every existing exercise id appears exactly once (in any plan) or in removedExerciseIds. Never infer deletion from absence.',
    'Plan item: {ref, patch, exercises}; ref null = a new plan. patch fields null = unchanged.',
    'Exercise item — exactly one form: {ref:"id", replace:null, new:null} unchanged (may move between plans or change order); {ref:"id", replace:{…}, new:null} changed; {ref:null, replace:null, new:{…}} added. The same existing id never appears twice — to put the same exercise into another plan, add a "new" copy.',
    'replace.movementChanged: false keeps the same movement (progress may be kept); then its stages use the same reference form: {ref:"stageId", replace:null, new:null} unchanged, {ref:"stageId", replace:{full stage}, new:null} changed, {ref:null, replace:null, new:{full stage}} added; every existing stageId appears once or in removedStageIds; the current stage cannot be removed. movementChanged: true = a different movement: all stages are "new", progress restarts.',
    'Top-level patch: null fields = unchanged; progressionEvery 0 = turn the program frequency off.',
    'Change only what the request asks for; keep equipment and count unless the user asks to change them. currentLoadReadOnly is context only.'
  ];
  const EXERCISE_MODIFY_RULES = [
    'Return exercise = {movementChanged, warmup, stages, removedStageIds} for the given exercise. Stage items use the reference form: {ref:"stageId", replace:null, new:null} unchanged, {ref:"stageId", replace:{full stage}, new:null} changed, {ref:null, replace:null, new:{full stage}} added; every existing stageId appears once or in removedStageIds; the current stage cannot be removed. movementChanged true = a different movement: all stages "new".',
    'Change only what the request asks for; keep equipment and count unless asked. currentLoadReadOnly is context only.'
  ];
  const TASKS = {
    'program.create':'Create a new workout program.',
    'program.modify':'Modify the existing program according to the request.',
    'exercise.create':'Create the exercise(s) the user asks for (usually one) to add to the program.',
    'exercise.modify':'Modify the given exercise according to the request.',
    'exercise.replace':'Replace the given exercise with a different movement that serves a similar purpose with the available equipment. The result is a new movement: progress restarts.'
  };

  function buildPrompt(kind, input){
    const lines = ['You are FitTimer. ' + COACH, TASKS[kind],
      'LANGUAGE: ' + input.language + '. contractVersion: ' + CONTRACT_VERSION + '.', '', 'Rules:'];
    RULES.forEach(r => lines.push('- ' + r));
    if(kind === 'program.modify') MODIFY_RULES.forEach(r => lines.push('- ' + r));
    if(kind === 'exercise.modify') EXERCISE_MODIFY_RULES.forEach(r => lines.push('- ' + r));
    lines.push('');
    if(input.profile) lines.push('User profile: ' + input.profile);
    if(input.availableLoadEquipment.length) lines.push('Available load equipment: ' + input.availableLoadEquipment.join(', ') + '.');
    if(input.availableSupportEquipment.length) lines.push('Available support equipment: ' + input.availableSupportEquipment.join(', ') + '.');
    if(input.context) lines.push('User capabilities / limitations (authoritative self-report): ' + input.context);
    if(input.program) lines.push('Program (JSON): ' + JSON.stringify(input.program));
    if(input.exercise) lines.push('Exercise (JSON): ' + JSON.stringify(input.exercise));
    if(input.task) lines.push('Request: ' + input.task);
    return lines.join('\n');
  }
  // A long split schedule is generated by independent, short provider requests.
  // Keep the same complete context on each step so the days form one coherent week.
  function segmentPrompt(input, day, index){
    if(!input || !input.splitByDays || !Array.isArray(input.scheduleDays)
      || input.scheduleDays.length < 2 || input.scheduleDays[index] !== day){
      throw new Error('invalid_segment_input');
    }
    return buildPrompt('program.create', input)
      + '\\n\\nSEGMENTED GENERATION: Generate ONE complete day variant, not the full week.'
      + ' Weekdays in order: ' + input.scheduleDays.join(', ') + '.'
      + ' This is day ' + (index + 1) + ' of ' + input.scheduleDays.length + ': ' + day + '.'
      + ' Coordinate training goals and recovery across all listed days; specialize this day'
      + ' with different exercises suitable for the whole weekly split.'
      + ' Output program.rotate=false, program.rotateDays=[],'
      + ' program.plans must contain EXACTLY ONE plan, whose days is EXACTLY ["' + day + '"].'
      + ' This day alone must meet the requested session duration; include its own warm-up'
      + ' only when the original request asks for one. Do not compress descriptions or volume'
      + ' to fit other days into this response.';
  }
  function checkSegment(json, day){
    const common = checkOutput('program.create', json, {});
    if(!common.ok) return common;
    const program = json.program;
    const plans = program.plans || [];
    if(program.rotate || (program.rotateDays || []).length || plans.length !== 1
      || !plans[0].days || plans[0].days.length !== 1 || plans[0].days[0] !== day){
      return {ok:false, reason:'segment_schedule_mismatch', missing:['$.program.plans.days']};
    }
    return {ok:true};
  }
  function mergeSegments(parts, days){
    if(!Array.isArray(parts) || !Array.isArray(days) || days.length < 2
      || parts.length !== days.length || new Set(days).size !== days.length
      || days.some(day => !DAY_KEYS.includes(day))){
      return {json:null, errors:['segment_count_mismatch']};
    }
    for(let i=0;i<days.length;i++){
      const verdict = checkSegment(parts[i], days[i]);
      if(!verdict.ok) return {json:null, errors:[`day_${i + 1}:${verdict.reason}`]};
    }
    const first = parts[0].program;
    const json = {contractVersion:CONTRACT_VERSION, program:{
      name:first.name, desc:first.desc, progressionEvery:first.progressionEvery,
      rotate:false, rotateDays:[], plans:parts.map(p => p.program.plans[0])
    }};
    const validated = checkOutput('program.create', json, {});
    return validated.ok ? {json, errors:[]} : {json:null, errors:validated.missing || [validated.reason]};
  }

  // Внешний чат не принимает API-схему: схему кладём в текст, ответ — только JSON.
  function manualPrompt(kind, input){
    return buildPrompt(kind, input) + '\n\nAnswer with ONE JSON object only (no comments), exactly matching this JSON Schema:\n'
      + JSON.stringify(outputSchema(kind).schema);
  }

  /* ---------------- DTO ↔ prescription ---------------- */
  function specFromPrescription(p, advance){
    const l = p.load || {}, pg = p.progression || {};
    return {
      name:p.name || '', desc:p.desc || '', mistakes:p.mistakes || '', type:p.type, value:String(p.value),
      sets:p.sets, perSide:!!p.perSide, rest:p.rest, restAfter:p.restAfter == null ? null : p.restAfter,
      muscles:(p.muscles || []).filter(m => MUSCLE_IDS.includes(m)),
      load:{type:l.type || 'none', equipment:l.equipment && l.equipment !== 'custom' ? l.equipment : (l.equipment === 'custom' ? 'custom' : null),
        equipmentName:l.equipment === 'custom' ? l.name || '' : '', count:l.count || 1, weight:+l.weight || 0,
        levels:(l.levels || []).map(x => x.key || x.label), level:+l.level || 0},
      supportEquipment:(p.supportEquipment || []).filter(x => typeof x === 'string'),
      progression:{mode:pg.mode || 'none', every:pg.every == null ? null : pg.every,
        repsStep:pg.reps && pg.reps.step, repsMax:pg.reps && pg.reps.max,
        weightStep:pg.weight && pg.weight.step, weightMax:pg.weight && pg.weight.max,
        timeStep:pg.time && pg.time.step, timeMax:pg.time && pg.time.max},
      advance:advance && advance.mode === 'ceiling' ? 'ceiling' : 'manual'
    };
  }
  function prescriptionFromSpec(s){
    const l = s.load || {}, pg = s.progression || {};
    const eqKnown = l.equipment && V2.equipment(l.equipment);
    const levels = (l.levels || []).map(x => V2.BUILTIN_LEVEL_KEYS.includes(x) ? {key:x} : {label:String(x)});
    return {
      name:s.name, desc:s.desc || '', mistakes:s.mistakes || '', type:s.type, value:s.value, sets:s.sets,
      // video приходит только из импорта видео (подтверждённая ссылка с таймкодом), не от модели
      perSide:!!s.perSide, rest:s.rest, restAfter:s.restAfter, muscles:s.muscles || [], video:typeof s.video === 'string' ? s.video : '',
      load:{type:l.type, equipment:eqKnown ? eqKnown.id : (l.equipment ? 'custom' : null),
        name:eqKnown && eqKnown.id !== 'custom' ? '' : String(l.equipmentName || l.equipment || ''),
        count:l.count, unit:'kg', weight:l.type === 'weight' ? l.weight : 0, levels, level:l.level || 0},
      supportEquipment:s.supportEquipment || [],
      progression:{mode:pg.mode, every:pg.every,
        reps:{step:pg.repsStep, max:pg.repsMax}, weight:{step:pg.weightStep, max:pg.weightMax},
        time:{step:pg.timeStep, max:pg.timeMax}}
    };
  }
  const stageFromSpec = (s, stageId) => ({stageId, prescription:prescriptionFromSpec(s),
    advance:{mode:s.advance === 'ceiling' ? 'ceiling' : 'manual'}, mediaRef:null, visualKey:''});

  function slotFromSpec(spec, newId){
    const stages = (spec.stages || []).map(s => stageFromSpec(s, newId('mv')));
    return finishSlot({id:newId('e'), warmup:!!spec.warmup, currentStageId:stages[0] && stages[0].stageId,
      stages, progressState:freshState(), media:null}, newId);
  }
  const freshState = () => ({count:0, current:{reps:null, weight:null, time:null, level:null}});
  function finishSlot(raw, newId, path, errors){
    const res = V2.normalizeExercise(raw, {muscles:MUSCLE_IDS, newId});
    if(errors) res.errors.forEach(e => errors.push((path || '$') + ':' + e));
    return res.exercise;
  }

  const daysToKeys = days => (Array.isArray(days) ? days : []).map(d => {
    const i = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].indexOf(d);
    return i >= 0 ? DAY_KEYS[i] : (DAY_KEYS.includes(d) ? d : null);
  }).filter(Boolean);
  // persistent-модель хранит дни каноническими токенами Пн…Вс (их локализует UI)
  const keysToDays = keys => DAY_KEYS.filter(k => (keys || []).includes(k)).map(k => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][DAY_KEYS.indexOf(k)]);

  /* Программа → Program DTO V2 (как ответ program.create): копирование «текстом» и ручной
     перенос в чат/другое устройство. currentLoad — подставить текущую рабочую нагрузку
     вместо базы (снаряд, количество и своё имя снаряда не меняются). */
  function programToContract(p, currentLoad){
    const exSpec = ex => ({warmup:!!ex.warmup, stages:(ex.stages || []).map(st => {
      const spec = specFromPrescription(st.prescription, st.advance);
      const cur = currentLoad && st.stageId === ex.currentStageId && ex.progressState ? ex.progressState.current || {} : {};
      if(cur.reps != null && cur.reps !== '' && spec.type === 'reps') spec.value = String(cur.reps);
      if(cur.time != null && spec.type === 'time') spec.value = String(cur.time);
      if(cur.weight != null && spec.load.type === 'weight') spec.load.weight = +cur.weight;
      if(cur.level != null && spec.load.type === 'level') spec.load.level = +cur.level;
      return spec;
    })});
    return {contractVersion:CONTRACT_VERSION, program:{
      name:String(p.name || ''), desc:String(p.desc || ''),
      progressionEvery:Number.isFinite(+p.progression) && +p.progression > 0 ? Math.round(+p.progression) : null,
      rotate:!!p.rotate, rotateDays:daysToKeys(p.days),
      plans:(p.plans || []).map(pl => ({days:daysToKeys(pl.days), rounds:+pl.rounds || 1, roundRest:+pl.roundRest || 0,
        exercises:(pl.exercises || []).map(exSpec)}))
    }};
  }

  /* ---------------- создание ---------------- */
  function programFromCreate(json, newId){
    const errors = [];
    const src = json && json.program;
    if(!src) return {program:null, errors:['$.program:required']};
    const plans = (src.plans || []).map((pl, pi) => ({
      id:newId('p'), days:src.rotate ? [] : keysToDays(pl.days), rounds:pl.rounds, roundRest:pl.roundRest,
      exercises:(pl.exercises || []).map((ex, ei) => {
        const stages = ex.stages.map(s => stageFromSpec(s, newId('mv')));
        return finishSlot({id:newId('e'), warmup:!!ex.warmup, currentStageId:stages[0].stageId, stages,
          progressState:freshState(), media:null}, newId, `$.program.plans[${pi}].exercises[${ei}]`, errors);
      })
    }));
    const program = {name:src.name, desc:src.desc || '', progression:src.progressionEvery || 0,
      rotate:!!src.rotate, days:src.rotate ? keysToDays(src.rotateDays) : [], plans, stats:{completions:0}};
    return {program, errors};
  }
  function exercisesFromCreate(json, newId){
    const errors = [];
    const list = json && Array.isArray(json.exercises) ? json.exercises : (json && json.exercise ? [json.exercise] : []);
    const exercises = list.map((ex, i) => {
      const stages = ex.stages.map(s => stageFromSpec(s, newId('mv')));
      return finishSlot({id:newId('e'), warmup:!!ex.warmup, currentStageId:stages[0].stageId, stages,
        progressState:freshState(), media:null}, newId, `$.exercises[${i}]`, errors);
    });
    return {exercises, errors};
  }

  /* ---------------- правка: target state + refs ----------------
     Применяется к неизменяемому снимку того, что ушло в запрос; при любой ошибке
     ничего не возвращается — приложение не сохраняет частичный результат. */
  function itemForm(item){
    const hasRef = item && item.ref != null && item.ref !== '';
    const hasRep = item && item.replace != null, hasNew = item && item.new != null;
    if(hasRef && !hasRep && !hasNew) return 'keep';
    if(hasRef && hasRep && !hasNew) return 'replace';
    if(!hasRef && !hasRep && hasNew) return 'new';
    return null;
  }
  // Новый список этапов существующего упражнения. Возвращает {stages, currentStageId, errors, keepProgress}
  function applyStageItems(oldEx, dto, newId, path){
    const errors = [];
    const old = new Map((oldEx.stages || []).map(st => [st.stageId, st]));
    if(dto.movementChanged){
      const stages = [];
      dto.stages.forEach((it, i) => {
        if(itemForm(it) !== 'new') errors.push(`${path}.stages[${i}]:movement_changed_requires_new`);
        else stages.push(stageFromSpec(it.new, newId('mv')));
      });
      return {stages, currentStageId:stages[0] && stages[0].stageId, errors, keepProgress:false};
    }
    const used = new Set();
    const removed = new Set((dto.removedStageIds || []).map(String));
    const stages = [];
    dto.stages.forEach((it, i) => {
      const form = itemForm(it);
      if(!form){ errors.push(`${path}.stages[${i}]:item_form`); return; }
      if(form === 'new'){ stages.push(stageFromSpec(it.new, newId('mv'))); return; }
      const ref = String(it.ref);
      const prev = old.get(ref);
      if(!prev){ errors.push(`${path}.stages[${i}]:unknown_ref:${ref}`); return; }
      if(used.has(ref) || removed.has(ref)){ errors.push(`${path}.stages[${i}]:duplicate_ref:${ref}`); return; }
      used.add(ref);
      if(form === 'keep') stages.push(JSON.parse(JSON.stringify(prev)));
      else stages.push(Object.assign(stageFromSpec(it.replace, ref), {mediaRef:prev.mediaRef || null, visualKey:prev.visualKey || ''}));
    });
    removed.forEach(id => { if(!old.has(id)) errors.push(`${path}.removedStageIds:unknown:${id}`); });
    old.forEach((_, id) => { if(!used.has(id) && !removed.has(id)) errors.push(`${path}:stage_missing:${id}`); });
    if(removed.has(oldEx.currentStageId)) errors.push(`${path}:current_stage_removed`);
    return {stages, currentStageId:oldEx.currentStageId, errors, keepProgress:true};
  }
  function applyExerciseReplace(oldEx, dto, newId, path){
    const res = applyStageItems(oldEx, dto, newId, path);
    if(res.errors.length) return {exercise:null, errors:res.errors};
    const errors = [];
    const out = finishSlot({id:oldEx.id, warmup:!!dto.warmup, currentStageId:res.currentStageId, stages:res.stages,
      progressState:res.keepProgress ? JSON.parse(JSON.stringify(oldEx.progressState || freshState())) : freshState(),
      media:res.keepProgress ? oldEx.media || null : null}, newId, path, errors);
    return {exercise:out, errors, movementChanged:!!dto.movementChanged};
  }
  function applyExerciseModify(oldEx, json, newId){
    if(!json || !json.exercise) return {exercise:null, errors:['$.exercise:required']};
    return applyExerciseReplace(oldEx, json.exercise, newId, '$.exercise');
  }
  // exercise.replace — всегда новое движение в том же слоте: id слота сохраняется, этапы и прогресс новые
  function applyExerciseReplacement(oldEx, json, newId){
    if(!json || !json.exercise) return {exercise:null, errors:['$.exercise:required']};
    const errors = [];
    const stages = json.exercise.stages.map(s => stageFromSpec(s, newId('mv')));
    const out = finishSlot({id:oldEx.id, warmup:!!oldEx.warmup, currentStageId:stages[0].stageId, stages,
      progressState:freshState(), media:null}, newId, '$.exercise', errors);
    return {exercise:out, errors};
  }

  function applyProgramModify(snapshot, json, newId){
    const errors = [];
    const base = JSON.parse(JSON.stringify(snapshot));
    const oldPlans = new Map((base.plans || []).map(pl => [String(pl.id), pl]));
    const oldEx = new Map();
    (base.plans || []).forEach(pl => (pl.exercises || []).forEach(ex => oldEx.set(String(ex.id), ex)));
    const removedPlans = new Set((json.removedPlanIds || []).map(String));
    const removedEx = new Set((json.removedExerciseIds || []).map(String));
    const usedPlans = new Set(), usedEx = new Set();
    const changes = {added:0, changed:0, removed:removedEx.size, moved:0};
    const plans = [];
    (json.plans || []).forEach((it, pi) => {
      const path = `$.plans[${pi}]`;
      let plan;
      if(it.ref != null && it.ref !== ''){
        const ref = String(it.ref);
        const prev = oldPlans.get(ref);
        if(!prev){ errors.push(`${path}:unknown_ref:${ref}`); return; }
        if(usedPlans.has(ref) || removedPlans.has(ref)){ errors.push(`${path}:duplicate_ref:${ref}`); return; }
        usedPlans.add(ref);
        plan = {id:prev.id, days:prev.days || [], rounds:prev.rounds, roundRest:prev.roundRest, exercises:[]};
      }else plan = {id:newId('p'), days:[], rounds:1, roundRest:0, exercises:[]};
      const pt = it.patch || {};
      if(pt.days != null) plan.days = keysToDays(pt.days);
      if(pt.rounds != null) plan.rounds = pt.rounds;
      if(pt.roundRest != null) plan.roundRest = pt.roundRest;
      (it.exercises || []).forEach((ei, xi) => {
        const xpath = `${path}.exercises[${xi}]`;
        const form = itemForm(ei);
        if(!form){ errors.push(`${xpath}:item_form`); return; }
        if(form === 'new'){
          const stages = ei.new.stages.map(s => stageFromSpec(s, newId('mv')));
          plan.exercises.push(finishSlot({id:newId('e'), warmup:!!ei.new.warmup, currentStageId:stages[0].stageId,
            stages, progressState:freshState(), media:null}, newId, xpath, errors));
          changes.added++;
          return;
        }
        const ref = String(ei.ref);
        const prev = oldEx.get(ref);
        if(!prev){ errors.push(`${xpath}:unknown_ref:${ref}`); return; }
        if(usedEx.has(ref) || removedEx.has(ref)){ errors.push(`${xpath}:duplicate_ref:${ref}`); return; }
        usedEx.add(ref);
        if(form === 'keep'){ plan.exercises.push(JSON.parse(JSON.stringify(prev))); return; }
        const res = applyExerciseReplace(prev, ei.replace, newId, xpath + '.replace');
        res.errors.forEach(e => errors.push(e));
        if(res.exercise){ plan.exercises.push(res.exercise); changes.changed++; }
      });
      plans.push(plan);
    });
    removedPlans.forEach(id => { if(!oldPlans.has(id)) errors.push(`$.removedPlanIds:unknown:${id}`); });
    removedEx.forEach(id => { if(!oldEx.has(id)) errors.push(`$.removedExerciseIds:unknown:${id}`); });
    oldPlans.forEach((pl, id) => {
      if(usedPlans.has(id) || removedPlans.has(id)) return;
      errors.push(`$:plan_missing:${id}`);
    });
    // упражнение удалённого варианта обязано быть перенесено или явно удалено
    oldEx.forEach((_, id) => { if(!usedEx.has(id) && !removedEx.has(id)) errors.push(`$:exercise_missing:${id}`); });
    if(!plans.length) errors.push('$.plans:empty');
    plans.forEach((pl, i) => { if(!pl.exercises.length) errors.push(`$.plans[${i}]:no_exercises`); });
    if(errors.length) return {program:null, errors};
    const pt = json.patch || {};
    const program = Object.assign(base, {plans});
    if(pt.name != null && String(pt.name).trim()) program.name = String(pt.name).trim();
    if(pt.desc != null) program.desc = String(pt.desc);
    if(pt.progressionEvery != null) program.progression = pt.progressionEvery;
    if(pt.rotate != null) program.rotate = !!pt.rotate;
    if(pt.rotateDays != null) program.days = keysToDays(pt.rotateDays);
    return {program, errors:[], changes};
  }

  /* ---------------- доменная проверка ответа (сервер и клиент) ---------------- */
  const fakeIds = () => { let n = 0; return prefix => prefix + '_chk' + (++n); };
  function checkOutput(kind, json, input){
    if(!json || json.contractVersion !== CONTRACT_VERSION) return {ok:false, reason:'contract_version', missing:[]};
    let errors = [];
    const newId = fakeIds();
    try{
      if(kind === 'program.create') errors = programFromCreate(json, newId).errors;
      else if(kind === 'exercise.create') errors = exercisesFromCreate(json, newId).errors;
      else if(kind === 'exercise.replace') errors = applyExerciseReplacement(viewToExercise(input.exercise), json, newId).errors;
      else if(kind === 'exercise.modify') errors = applyExerciseModify(viewToExercise(input.exercise), json, newId).errors;
      else if(kind === 'program.modify') errors = applyProgramModify(viewToProgram(input.program), json, newId).errors;
    }catch(e){ errors = ['$:' + String(e && e.message || e).slice(0, 80)]; }
    return errors.length ? {ok:false, reason:'domain_invalid', missing:errors.slice(0, 20)} : {ok:true};
  }
  // view (как ушло в запрос) → минимальная persistent-форма для проверки refs на сервере
  function viewToExercise(v){
    return {id:String(v.id), warmup:!!v.warmup, currentStageId:String(v.currentStageId),
      stages:(v.stages || []).map(s => stageFromSpec(s, String(s.stageId))), progressState:freshState(), media:null};
  }
  function viewToProgram(v){
    return {name:v.name, plans:(v.plans || []).map(pl => ({id:String(pl.id), days:keysToDays(pl.days), rounds:pl.rounds,
      roundRest:pl.roundRest, exercises:(pl.exercises || []).map(viewToExercise)}))};
  }

  return {
    CONTRACT_VERSION, PROMPT_VERSION, KINDS, DAY_KEYS, MUSCLE_IDS, MAX_OUTPUT_TOKENS,
    outputSchema, normalizeInput, buildPrompt, segmentPrompt, checkSegment, mergeSegments,
    manualPrompt, checkOutput,
    exerciseView, programView, specFromPrescription, prescriptionFromSpec,
    programToContract, programFromCreate, exercisesFromCreate, applyProgramModify, applyExerciseModify, applyExerciseReplacement,
    daysToKeys, keysToDays
  };
});
