/* Shared Fit Timer AI protocol contract.
   Browser: globalThis.FitAIProtocol
   Server:  require('../lib/ai-protocol')
   Keep this file dependency-free so the same rules are used by the app and admin API. */
(function(root){
  const OPTIONAL_EXERCISE_LABELS = [
    'СТОРОНА','НА КАЖДУЮ СТОРОНУ','РАЗМИНКА','ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ',
    'ФОРМАТ','ВЕС','УСЛОЖНЯТЬ','КАК УСЛОЖНЯТЬ',
    'ШАГ','ШАГ ВЕСА','ШАГ ПОВТОРОВ','ШАГ ВРЕМЕНИ',
    'ПОТОЛОК','ПОТОЛОК ВЕСА','ПОТОЛОК ПОВТОРОВ','ПОТОЛОК ВРЕМЕНИ',
    'ПРИ ПОТОЛКЕ','ДВОЙНАЯ ПРОГРЕССИЯ','ЗАМЕНА','ОПИСАНИЕ ЗАМЕНЫ'
  ];

  const machineLanguageRules = outputLanguage => `IMPORTANT LANGUAGE RULE:
- All instructions in this prompt are in English.
- User-visible content values must be written in ${outputLanguage}.
- Protocol field names, weekday tokens, muscle tokens, format tokens, and yes/no tokens below are machine-readable constants. Keep them EXACTLY unchanged even when user-visible content is English.
- Never translate canonical muscle tokens or weekday tokens.`;

  const progressionRules = () => `=== TRAINING AND PROGRESSION RULES ===
Act like a deeply experienced strength-and-conditioning coach. Base decisions on established exercise science, biomechanics, load management, technique, recovery and progression principles. Prefer conservative, explainable training decisions over novelty. Do not invent facts about the user or pretend certainty where context is missing.

- ПРОГРЕССИЯ at PROGRAM level means WHEN the next progression step happens: after N completed workouts. It does NOT mean +N reps or +N kg.
- Exercise-level ШАГ / ШАГ ПОВТОРОВ / ШАГ ВРЕМЕНИ / ШАГ ВЕСА define WHAT changes on each progression step.
- For unweighted reps/time with УСЛОЖНЯТЬ: да, provide a sensible ШАГ and ПОТОЛОК.
- For weighted reps, distinguish three cases:
  1) weight-only progression: fixed reps, positive ШАГ ВЕСА, no automatic rep increase;
  2) rep progression: positive ШАГ ПОВТОРОВ;
  3) double progression: reps rise toward ПОТОЛОК ПОВТОРОВ; then ПРИ ПОТОЛКЕ: да raises weight by ШАГ ВЕСА and reps return toward the starting range.
- ПРИ ПОТОЛКЕ: да is valid only for a weighted format with a positive ШАГ ВЕСА and a meaningful ПОТОЛОК ПОВТОРОВ/ВРЕМЕНИ.
- ЗАМЕНА is NOT a generic alternative. Use it only as the next harder movement after the useful ceiling of the current exercise. Do not add it when normal progression in reps/time/weight is sufficient.
- СТОРОНА: да means ЗНАЧЕНИЕ is performed PER SIDE, not the sum of both sides.
- If external load is requested, use a weighted ФОРМАТ, add ВЕС, and configure progression only when appropriate.
- Do not infer absolute strength or starting weight from sex alone. Prefer known current load, experience, requested difficulty, equipment and the movement itself. When strength is unknown, choose a conservative starting load.
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

  const editRules = allowStructure => allowStructure
    ? `=== EDIT RULES ===
- Apply only the requested structural changes. Preserve unrelated variants, exercises, protocol fields and values.
- You may add/remove/reorder an exercise or variant ONLY where the user's request explicitly requires it.
- Never silently drop a protocol line because it looks unnecessary.
- You may add valid optional exercise fields when needed by the requested change.
- If the user asks to disable/remove a numeric setting while keeping the same structure, prefer keeping its existing label with value 0.`
    : `=== EDIT RULES ===
- Preserve the number and order of workout variants and exercises.
- Preserve every existing protocol line unless its VALUE is being changed.
- Never delete or rename an existing protocol label.
- You MAY add only valid optional exercise fields when the requested change requires them.
- If the user asks to disable/remove a numeric setting, keep its existing label and set a neutral value such as 0.
- Do not change unrelated fields.`;

  const programPrompt = outputLanguage => [
    'You are a fitness-program assistant for home workouts.',
    'Return ONLY the plain-text protocol below: no Markdown and no commentary before or after it.',
    machineLanguageRules(outputLanguage),
    programSchema(outputLanguage),
    progressionRules(),
    'Quality checks before answering:',
    '- Make exercise selection, volume, intensity, rest and progression coherent as one program.',
    '- If a target workout duration is supplied, estimate work + rest time and keep the expected duration roughly within ±20% when practical.',
    '- Do not create conflicting progression fields.',
    '- Return only the protocol.'
  ].join('\n\n');

  const api = {
    OPTIONAL_EXERCISE_LABELS,
    machineLanguageRules,
    progressionRules,
    exerciseSchema,
    programSchema,
    editRules,
    programPrompt
  };
  root.FitAIProtocol = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
