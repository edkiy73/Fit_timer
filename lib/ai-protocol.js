/* Shared Fit Timer AI protocol contract.
   Browser: globalThis.FitAIProtocol
   Server:  require('../lib/ai-protocol')
   Keep this file dependency-free so the same rules are used by the app and admin API. */
(function(root){
  const OPTIONAL_EXERCISE_LABELS = [
    'ОПИСАНИЕ','МЫШЦЫ','ОШИБКИ',
    'ФОРМАТ','ЗНАЧЕНИЕ','ВЕС','ПОДХОДЫ',
    'СТОРОНА','НА КАЖДУЮ СТОРОНУ','РАЗМИНКА',
    'ОТДЫХ','ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ',
    'УСЛОЖНЯТЬ','КАК УСЛОЖНЯТЬ',
    'ШАГ','ШАГ ВЕСА','ШАГ ПОВТОРОВ','ШАГ ВРЕМЕНИ',
    'ПОТОЛОК','ПОТОЛОК ВЕСА','ПОТОЛОК ПОВТОРОВ','ПОТОЛОК ВРЕМЕНИ',
    'ПРИ ПОТОЛКЕ','ДВОЙНАЯ ПРОГРЕССИЯ',
    'ЗАМЕНА','ОПИСАНИЕ ЗАМЕНЫ','ЗАМЕНА ОПИСАНИЕ','ВИДЕО'
  ];

  const machineLanguageRules = outputLanguage => `IMPORTANT LANGUAGE RULE:
- All instructions in this prompt are in English.
- User-visible content values must be written in ${outputLanguage}.
- Protocol field names, weekday tokens, muscle tokens, format tokens, and yes/no tokens below are machine-readable constants. Keep them EXACTLY unchanged even when user-visible content is English.
- Never translate canonical muscle tokens or weekday tokens.`;

  const progressionRules = () => `=== TRAINING AND PROGRESSION RULES ===
Act like a deeply experienced strength-and-conditioning coach. Base decisions on established exercise science, biomechanics, load management, technique, recovery and progression principles. Treat all explicitly provided user data as authoritative constraints and build a program that genuinely matches the stated goal, level, equipment, schedule, duration and preferences. Do not make the whole program easier just because some unrelated details are unknown. Use extra caution only where uncertainty truly matters: absolute starting loads when strength is unknown, medical or pain-related risk, and unusually aggressive progression. Do not invent facts about the user or pretend certainty where context is missing.

- ПРОГРЕССИЯ at PROGRAM level means WHEN the next progression step happens: after N completed workouts. It does NOT mean +N reps or +N kg. As a default, beginners often need roughly 3-6 completed workouts between increases and experienced users roughly 2-4, but adapt to the actual program and recovery.
- Exercise-level ШАГ / ШАГ ПОВТОРОВ / ШАГ ВРЕМЕНИ / ШАГ ВЕСА define WHAT changes on each progression step.
- For unweighted reps/time with УСЛОЖНЯТЬ: да, provide a sensible ШАГ and ПОТОЛОК.
- For weighted reps, distinguish three cases:
  1) weight-only progression: fixed reps, positive ШАГ ВЕСА, no automatic rep increase;
  2) rep progression: positive ШАГ ПОВТОРОВ;
  3) double progression: reps rise toward ПОТОЛОК ПОВТОРОВ; then ПРИ ПОТОЛКЕ: да raises weight by ШАГ ВЕСА and reps return toward the starting range.
- ПРИ ПОТОЛКЕ: да is valid only for a weighted format with a positive ШАГ ВЕСА and a meaningful ПОТОЛОК ПОВТОРОВ/ВРЕМЕНИ. For double progression, make the rep/time progression explicit too instead of relying on an accidental default.
- ЗАМЕНА is NOT a generic alternative. Use it only as the next harder movement after the useful ceiling of the current exercise. Do not add it when normal progression in reps/time/weight is sufficient.
- СТОРОНА: да means ЗНАЧЕНИЕ is performed PER SIDE, not the sum of both sides.
- If external load is requested, use a weighted ФОРМАТ, add ВЕС, and configure progression only when appropriate.
- Do not infer absolute strength or starting weight from sex alone. Prefer known current load, experience, requested difficulty, equipment and the movement itself. When strength is unknown, choose a conservative starting load without downgrading the overall program difficulty.
- Respect the declared fitness level. Beginner, intermediate and advanced programs should differ meaningfully in exercise complexity, volume, density and progression where appropriate; do not silently turn an intermediate or advanced request into a beginner workout.
- Warm-up, mobility, breathing and technique drills normally use УСЛОЖНЯТЬ: нет.
- Keep total volume and recovery realistic. More fields are not automatically better; only include progression axes that make sense for that exercise.
- Preserve unilateral/bilateral movement nature unless the user explicitly requests a different movement.
- Never invent equipment the user does not have.
- Do not diagnose or claim medical safety. Respect stated limitations and avoid exercises that clearly conflict with them.`;

  const exerciseSchema = outputLanguage => `=== EXERCISE PROTOCOL ===
УПРАЖНЕНИЕ: exercise name in ${outputLanguage}
ОПИСАНИЕ: 3-4 practical sentences in ${outputLanguage} covering setup, movement, bracing/breathing, and what to avoid; max 600 characters
МЫШЦЫ: comma-separated tokens STRICTLY from: Шея, Плечи, Грудь, Руки, Пресс, Спина, Ягодицы, Квадрицепс, Задняя бедра, Икры
ОШИБКИ: 1-2 common mistakes in ${outputLanguage}, max 300 characters (optional)
ФОРМАТ: exactly one of "повторения", "повторения и вес", "время", "время и вес"
ЗНАЧЕНИЕ: number or range like 12-15; for time formats use seconds
ВЕС: starting kilograms for weighted formats
ПОДХОДЫ: consecutive sets before the next exercise, 1-10
СТОРОНА: "да" if ЗНАЧЕНИЕ is performed separately for each side; omit otherwise
РАЗМИНКА: "да" for warm-up exercises; omit otherwise
ОТДЫХ: seconds between sets
ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ: seconds after the last set before the next exercise; include only when different from ОТДЫХ
УСЛОЖНЯТЬ: "да" or "нет"
ШАГ: progression increment for unweighted reps/time only
ШАГ ПОВТОРОВ: reps increment for weighted reps, only when reps themselves should progress
ШАГ ВРЕМЕНИ: seconds increment for weighted time, only when time itself should progress
ШАГ ВЕСА: kg increment for weighted formats
ПОТОЛОК: required ceiling for progressive unweighted formats
ПОТОЛОК ПОВТОРОВ: reps ceiling for weighted reps
ПОТОЛОК ВРЕМЕНИ: time ceiling for weighted time
ПОТОЛОК ВЕСА: realistic kg ceiling for weighted formats
ПРИ ПОТОЛКЕ: "да" or "нет"; use "да" only for genuine double progression
ЗАМЕНА: harder next-level exercise in ${outputLanguage}, only when a movement progression is preferable after the ceiling
ОПИСАНИЕ ЗАМЕНЫ: 2-4 sentences in ${outputLanguage}, only when ЗАМЕНА exists
ВИДЕО: real technique URL only if confident it exists; otherwise omit`;

  const programSchema = outputLanguage => `=== PROGRAM PROTOCOL ===
ПРОГРАММА: program name in ${outputLanguage}
ОПИСАНИЕ ПРОГРАММЫ: up to 1000 characters on ONE line in ${outputLanguage}; explain purpose, frequency, expected result, what to watch, and when to reduce load
ВРЕМЯ: HH:MM (optional)
ПРОГРЕССИЯ: integer 1-15 or "нет"; number of COMPLETED workouts between progression steps
ЧЕРЕДОВАНИЕ: "да" or "нет"; "да" means variants rotate A-B-A independently of weekdays
ДНИ ТРЕНИРОВОК: comma-separated canonical tokens Пн, Вт, Ср, Чт, Пт, Сб, Вс; only for shared schedule when ЧЕРЕДОВАНИЕ: да

Workout variants:
- one repeating workout = one variant
- different exercise sets = multiple variants, max 7
- every variant starts with ДЕНЬ:
ДЕНЬ: canonical weekday tokens for this variant; leave empty when ЧЕРЕДОВАНИЕ: да
КРУГИ: 1-10; repetitions of the ENTIRE exercise list
ОТДЫХ МЕЖДУ КРУГАМИ: seconds, 0-600

КРУГИ and ПОДХОДЫ are independent:
- circuit: usually КРУГИ 2-5 and ПОДХОДЫ 1
- strength: usually КРУГИ 1 and ПОДХОДЫ 3-4
- mixed: both can be >1 when total volume remains sensible

${exerciseSchema(outputLanguage)}`;

  // Раньше здесь было два жёстко разных набора правил (свободная перестройка /
  // запрет структуры), а клиент выбирал между ними regex-угадайкой по тексту
  // запроса — и либо душил «добавь упражнение», либо разрешал больше, чем
  // просили. Один набор правил учит модель судить о масштабе изменения сама,
  // а итог всё равно проверяется после генерации (парсинг + семантический diff),
  // а не запрещается заранее.
  const editRules = () => `=== EDIT RULES ===
- Match the size of the change to the request. A narrow request ("set rest to 60 seconds", "rename this exercise") must change only what it asks for — do not also add, remove, reorder or replace exercises, and do not touch unrelated fields. A broad request ("optimize for 20 minutes", "make this harder", "rebuild the plan") may add, remove, reorder or replace exercises, and change variant count, as needed to satisfy it.
- When a change requires touching a related field to stay coherent (replacing an exercise changes its muscles/description/progression/rest; shortening a workout changes exercise count or sets/rounds), make that related change too. Do not change fields the request has no bearing on.
- Preserve every existing protocol line whose value the request does not change. Never delete or rename a protocol label just because it looks unnecessary.
- If the user asks to disable/remove a numeric setting while keeping the same structure, keep its existing label and set a neutral value such as 0.
- You may add valid optional exercise fields when the requested change needs them.`;

  const programPrompt = outputLanguage => [
    'You are a fitness-program assistant for home workouts.',
    'Return ONLY the plain-text protocol below: no Markdown and no commentary before or after it.',
    machineLanguageRules(outputLanguage),
    programSchema(outputLanguage),
    progressionRules(),
    'Quality checks before answering:',
    '- Make exercise selection, volume, intensity, rest and progression coherent as one program.',
    '- Do not target a fixed number of exercises. Choose the exercise count, sets and rounds from the training goal, structure and time budget; a longer workout may intentionally use only a few exercises with more sets/rounds.',
    '- When a target workout duration is supplied, estimate the whole session, not just active work: timed work = stated seconds × sides; rep-based work ≈ reps × 3 seconds × sides; multiply by sets and rounds; then add between-set rest, rest after exercises, side-switch time and between-round rest. Warm-up exercises run once before the main rounds.',
    '- For target durations from 5 to 20 minutes, aim to stay within about ±5 minutes. For targets of 30 minutes or more, aim to stay within about ±20%. Treat an open-ended target such as 45+ minutes as a lower-bound preference rather than an exact cap.',
    '- Do not create conflicting progression fields.',
    '- Return only the protocol.'
  ].join('\n\n');

  function normalizeResponse(raw){
    return String(raw == null ? '' : raw).trim()
      .replace(/^\`\`\`(?:text|txt|markdown)?\s*/i, '')
      .replace(/\s*\`\`\`$/,'')
      .trim();
  }

  function validateExerciseResponse(raw, opts){
    const text = normalizeResponse(raw);
    const blocks = text.split(/(?=^УПРАЖНЕНИЕ:\s*\S)/gm).map(x=>x.trim()).filter(Boolean);
    const required = ['УПРАЖНЕНИЕ','ФОРМАТ','ЗНАЧЕНИЕ','ПОДХОДЫ','ОТДЫХ'];
    const missing = [];
    blocks.forEach((block, i) => required.forEach(label => {
      if(!new RegExp('(?:^|\\n)'+label+':\\s*\\S','m').test(block)) missing.push((i+1)+':'+label);
    }));
    const min = opts && opts.minCount != null ? Math.max(1,+opts.minCount||1) : 1;
    const max = opts && opts.maxCount != null ? Math.max(min,+opts.maxCount||min) : 1;
    const countOk = blocks.length >= min && blocks.length <= max;
    return {ok: !!blocks.length && !missing.length && countOk, text, missing, count:blocks.length,
      reason: missing.length ? 'missing_fields' : (!countOk ? 'exercise_count' : '')};
  }

  function validateProgramResponse(raw){
    const text = normalizeResponse(raw);
    const required = ['ПРОГРАММА','ДЕНЬ','КРУГИ','УПРАЖНЕНИЕ','ФОРМАТ','ЗНАЧЕНИЕ','ПОДХОДЫ','ОТДЫХ'];
    const missing = required.filter(label => !new RegExp('(?:^|\\n)'+label+':(?:\\s*\\S)?','m').test(text));
    const exercises = (text.match(/(?:^|\n)УПРАЖНЕНИЕ:\s*\S/g) || []).length;
    // каждый вариант начинается со своей строки ДЕНЬ: — делим по ней и отбрасываем
    // преамбулу (ПРОГРАММА/ОПИСАНИЕ/ВРЕМЯ) до первого варианта
    const variants = text.split(/(?:^|\n)ДЕНЬ:/).slice(1);
    const days = variants.length;
    const emptyVariant = variants.some(v => !/(?:^|\n)УПРАЖНЕНИЕ:\s*\S/.test(v));
    return {ok: !missing.length && exercises > 0 && days > 0 && !emptyVariant, text, missing,
      reason: missing.length ? 'missing_fields' : (!exercises ? 'no_exercises' : (!days ? 'no_days' : (emptyVariant ? 'empty_variant' : '')))};
  }

  function validateResponse(kind, raw){
    if(String(kind || '').startsWith('image.')){
      const image = String(raw == null ? '' : raw).trim();
      return {ok:/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]{8,}$/.test(image),
        text:image, missing:[], reason:'bad_image'};
    }
    if(String(kind || '') === 'exercise.create') return validateExerciseResponse(raw,{minCount:1,maxCount:10});
    if(/^exercise\.(?:modify|replace)$/.test(String(kind || ''))) return validateExerciseResponse(raw,{minCount:1,maxCount:1});
    if(/^(?:program\.(?:create|modify)|video\.parse)$/.test(String(kind || ''))) return validateProgramResponse(raw);
    return {ok:!!normalizeResponse(raw), text:normalizeResponse(raw), missing:[], reason:'empty_response'};
  }

  // Одна строка протокола → {key, value}. Общая для клиента и сервера: обе стороны
  // разбирали её независимо и чуть по-разному, хотя формат один и тот же.
  function protocolLine(line){
    const m = String(line || '').match(/^([А-ЯЁ][А-ЯЁ ]{1,40}):\s*(.*)$/);
    return m ? {key:m[1], value:m[2]} : null;
  }

  // Поля, которые нельзя терять молча при правке ОДНОГО упражнения. Раньше вся
  // правка шла через позиционный merge каждого поля (что не даёт ИИ ни удалить,
  // ни переставить строки) — теперь ответ ИИ принимается как есть, а сюда
  // подставляются только описательные поля техники, если ответ их не вернул.
  const DESCRIPTIVE_EXERCISE_LABELS = ['ОПИСАНИЕ','МЫШЦЫ','ОШИБКИ','ВИДЕО'];
  function carryExerciseFields(sourceText, candidateText){
    const srcByKey = {};
    String(sourceText || '').split(/\r?\n/).forEach(line => {
      const p = protocolLine(line);
      if(p && p.value.trim() && srcByKey[p.key] == null) srcByKey[p.key] = p.value.trim();
    });
    const candLines = String(candidateText || '').split(/\r?\n/);
    const candHasValue = new Set();
    candLines.forEach(line => {
      const p = protocolLine(line);
      if(p && p.value.trim()) candHasValue.add(p.key);
    });
    const extra = DESCRIPTIVE_EXERCISE_LABELS.filter(k => !candHasValue.has(k) && srcByKey[k] != null);
    if(!extra.length) return candidateText;
    return candLines.concat(extra.map(k => k + ': ' + srcByKey[k])).join('\n');
  }

  function normExName(s){
    return String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  }
  // длина наидлиннейшей возрастающей подпоследовательности — сколько сопоставленных
  // упражнений уже стоят в правильном относительном порядке без переноса
  function longestIncreasingRun(seq){
    const tails = [];
    seq.forEach(x => {
      let lo = 0, hi = tails.length;
      while(lo < hi){ const mid = (lo + hi) >> 1; if(tails[mid] < x) lo = mid + 1; else hi = mid; }
      tails[lo] = x;
    });
    return tails.length;
  }

  // Семантическое сравнение программ по упражнениям: что добавлено, что убрано,
  // сколько переставлено — вместо принудительного «то же количество, тот же
  // порядок» (aiMergeProgramEdit/sameProgramShape), которое молча душило любую
  // структурную правку. Работает на {plans:[{exercises:[{id,name,...}]}]} —
  // тот же вид, что у customProgram после normPlans()/parseProgramText().
  // Сопоставление: сперва по стабильному id (если он совпал напрямую), затем по
  // технической метке КОД в новом упражнении (её кладёт клиент в текст для
  // AI-правки и не показывает пользователю), затем по точному имени — сначала в
  // том же варианте, потом в любом. Совпадение не гарантирует, что это буквально
  // то же движение — это лишь лучшая доступная оценка непрерывности.
  function diffPrograms(oldP, newP){
    const oldPlans = (oldP && Array.isArray(oldP.plans)) ? oldP.plans : [];
    const newPlans = (newP && Array.isArray(newP.plans)) ? newP.plans : [];
    const oldFlat = [], newFlat = [];
    oldPlans.forEach((pl, pi) => (pl.exercises || []).forEach(ex => oldFlat.push({ex, pi})));
    newPlans.forEach((pl, pi) => (pl.exercises || []).forEach(ex => newFlat.push({ex, pi})));

    const usedNew = new Array(newFlat.length).fill(false);
    const matches = [];
    const alreadyMatched = new Set();
    const matchPass = test => {
      oldFlat.forEach((o, oi) => {
        if(alreadyMatched.has(oi)) return;
        let ni = -1;
        for(let j = 0; j < newFlat.length; j++){
          if(usedNew[j]) continue;
          if(newFlat[j].pi === o.pi && test(o.ex, newFlat[j].ex)){ ni = j; break; }
        }
        if(ni < 0) for(let j = 0; j < newFlat.length; j++){
          if(usedNew[j]) continue;
          if(test(o.ex, newFlat[j].ex)){ ni = j; break; }
        }
        if(ni >= 0){
          usedNew[ni] = true; alreadyMatched.add(oi);
          matches.push({oi, ni, oldEx:o.ex, newEx:newFlat[ni].ex});
        }
      });
    };
    matchPass((a, b) => a.id && b.id && a.id === b.id);
    matchPass((a, b) => a.id && b._code && a.id === b._code);
    matchPass((a, b) => normExName(a.name) && normExName(a.name) === normExName(b.name));

    const matchedOld = new Set(matches.map(m => m.oi));
    const removed = oldFlat.filter((_, oi) => !matchedOld.has(oi)).map(o => o.ex);
    const added = newFlat.filter((_, ni) => !usedNew[ni]).map(n => n.ex);

    const orderedNewIdx = matches.slice().sort((a, b) => a.oi - b.oi).map(m => m.ni);
    const moved = matches.length ? matches.length - longestIncreasingRun(orderedNewIdx) : 0;

    return {
      matches: matches.map(m => ({oldEx:m.oldEx, newEx:m.newEx})),
      added, removed, moved,
      oldVariants: oldPlans.length, newVariants: newPlans.length
    };
  }

  const api = {
    OPTIONAL_EXERCISE_LABELS,
    normalizeResponse,
    validateExerciseResponse,
    validateProgramResponse,
    validateResponse,
    machineLanguageRules,
    progressionRules,
    exerciseSchema,
    programSchema,
    editRules,
    programPrompt,
    protocolLine,
    carryExerciseFields,
    diffPrograms
  };
  root.FitAIProtocol = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
