import { MUSCLES, OPT_EQUIP, OPT_GOAL, OPT_LEVEL, OPT_NONE } from './options.js';
import { appLocale, canonicalDescription, canonicalLabel, t } from '../i18n/index.js';
import FitExerciseV2 from '../../lib/fit-exercise-v2.js';
import FitAIContract from '../../lib/fit-ai-contract.js';
import { appRuntimeCompat } from './00-dependencies.js';
import { registerAction } from './05-actions.js';
import { $, appAlert, appConfirm, appDialog, goBackTo, goTab, icon, isChanged, plural, setCoreBuilderHooks, setShown, show, state,
  takeSnap
} from './00-core.js';
import { DAYS, closeAllMenus, customPrograms, newPlanId, normPlans, planDays, savePrograms,
  setDataSyncBuilderHooks, sortPlans, toggleMenu, trackProductEvent
} from './10-data-sync.js';
import { LIM, clampLine, clampText, cleanLink, cleanPic, requireWho, sanitizeProgram, setProgressBuilderHooks } from './30-progress-media.js';
import { aiWaysReset, claimProgramLink, flashDone, setProgramsBuilderHooks, userForAI } from './40-programs-ai.js';
import { renderMine, setTrainerBuilderHooks, storeCountText } from './50-trainer-catalog.js';

let workoutBuilderHooks = {
  autoGrow: () => {},
  esc: v => String(v == null ? '' : v)
};
export function setBuilderWorkoutHooks(hooks = {}){
  workoutBuilderHooks = {...workoutBuilderHooks, ...hooks};
}

let platformBuilderHooks = {
  getSyncNativeNotifications: () => null
};
export function setBuilderPlatformHooks(hooks = {}){
  platformBuilderHooks = {...platformBuilderHooks, ...hooks};
}
function builderSyncNativeNotifications(){
  const fn = platformBuilderHooks.getSyncNativeNotifications();
  return typeof fn === 'function' ? fn() : undefined;
}

let eventBuilderHooks = {
  buildExMenu: () => {},
  delCurrentPlan: () => {},
  markBuilderTab: () => {},
  openLegal: () => {},
  syncImagesSum: () => {},
  syncSettingsSum: () => {}
};
export function setBuilderEventHooks(hooks = {}){
  eventBuilderHooks = {...eventBuilderHooks, ...hooks};
}

/* ================= ПЕРЕТАСКИВАНИЕ КАРТОЧЕК (за ручку, с задержкой) ================= */
export function enableDrag(wrap, handle, selector, onDrop){
  selector = selector || '.mine-card';
  handle.oncontextmenu = e => e.preventDefault();
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startY = e.clientY;
    let active = false, baseY = 0;

    const holdT = setTimeout(startDragging, 260); // задержка против случайного скролла

    function startDragging(){
      active = true;
      wrap.classList.add('dragging');
      try{ navigator.vibrate && navigator.vibrate(15); }catch(_){}
      document.body.style.userSelect = 'none';
      baseY = lastY;
    }
    let lastY = startY;

    const move = ev => {
      lastY = ev.clientY;
      if(!active){
        if(Math.abs(ev.clientY - startY) > 8){ cleanup(); } // дёрнулись до задержки — отмена
        return;
      }
      wrap.style.transform = `translateY(${ev.clientY - baseY}px) scale(1.02)`;
      const sibs = [...wrap.parentNode.querySelectorAll(selector)].filter(x => x !== wrap);
      for(const s of sibs){
        const r = s.getBoundingClientRect();
        if(ev.clientY > r.top && ev.clientY < r.bottom){
          const before = ev.clientY < r.top + r.height / 2;
          const target = before ? s : s.nextSibling;
          if(target !== wrap && target !== wrap.nextSibling){
            wrap.parentNode.insertBefore(wrap, target);
            baseY = ev.clientY;
            wrap.style.transform = 'translateY(0) scale(1.02)';
          }
          break;
        }
      }
    };
    const finish = async () => {
      const wasActive = active;
      cleanup();
      if(wasActive){
        const nodes = [...wrap.parentNode.querySelectorAll(selector)];
        if(onDrop){ onDrop(nodes); return; }
        const order = nodes.map(x => x.dataset.pid);
        customPrograms.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        await savePrograms();
      }
    };
    function cleanup(){
      clearTimeout(holdT);
      active = false;
      wrap.classList.remove('dragging');
      wrap.style.transform = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    }
    // слушаем на window — событие не потеряется, карточка не «зависнет»
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  });
}

/* ================= КОНСТРУКТОР ================= */
export const MAX_WARM = 20;  // разминочных упражнений на вариант
export const MAX_MAIN = 20;  // основных упражнений на вариант
const MAX_EX = MAX_WARM + MAX_MAIN; // общий потолок списка
export let draft = null;

// Внутренний id упражнения — не показывается человеку и не входит в обычный
// текстовый протокол (импорт/каталог/«скопировать программу» его не видят).
// Нужен, чтобы при AI-правке отличать «то же упражнение переставили или
// переименовали» от «это другое упражнение»: раньше всё определялось по имени,
// и «Жим гантелей лёжа» → «Жим гантелей на полу» выглядело новым упражнением.
// Уникальности достаточно внутри одной программы (десятки строк), поэтому без
// проверки на коллизии: 36^6 комбинаций с большим запасом хватает.
export function newExId(){
  return 'e' + Math.random().toString(36).slice(2, 8);
}

/* ================= МОДЕЛЬ УПРАЖНЕНИЯ V2 =================
   Упражнение — слот программы: {id, warmup, currentStageId, stages[1..4], progressState, media}.
   Всё, что задают человек или ИИ (название, повторы, нагрузка, способ прогрессии), лежит в
   prescription АКТИВНОГО этапа; runtime и UI читают его только через activePrescription().
   Правила модели — lib/fit-exercise-v2.js, смысл — docs/load-equipment-progression-plan-2026-10-08.md. */
// Активный prescription; для отсутствующего упражнения — нейтральная заглушка
export function exP(ex){
  return FitExerciseV2.prescriptionOf(ex);
}
const BUILTIN_LOAD_LEVEL_KEYS = new Set(FitExerciseV2.BUILTIN_LEVEL_KEYS);
const DEFAULT_LOAD_LEVELS = FitExerciseV2.BUILTIN_LEVEL_KEYS.map(key => ({key}));

function cleanLoadLevelLabel(raw){
  // "|" — машинный разделитель уровней в старом текстовом протоколе; в label не пускаем
  return clampLine(raw, 60).replace(/\|+/g, ' / ').replace(/\s+/g, ' ').trim();
}
function cleanLoadLevels(raw, withDefault=false){
  const list = (Array.isArray(raw) ? raw : []).map(item => typeof item === 'string'
    ? cleanLoadLevelLabel(item)
    : item && !BUILTIN_LOAD_LEVEL_KEYS.has(item.key) && item.label ? {label:cleanLoadLevelLabel(item.label)} : item);
  const out = FitExerciseV2.cleanLevels(list);
  if(out.length >= 2) return out;
  return withDefault ? DEFAULT_LOAD_LEVELS.map(x=>({...x})) : out;
}

export function exerciseLoadLevels(ex){
  const load = exP(ex).load;
  return load.type === 'level' ? load.levels : [];
}

export function exerciseLoadLevel(ex){
  const levels = exerciseLoadLevels(ex);
  if(!levels.length) return 0;
  const cur = ex && ex.progressState && ex.progressState.current;
  const raw = cur && cur.level != null ? cur.level : exP(ex).load.level;
  return Math.max(0, Math.min(levels.length - 1, Math.round(+raw || 0)));
}

export function loadLevelLabel(level){
  if(!level) return '';
  if(level.label) return String(level.label);
  if(level.key === 'light') return t('builder.resistanceLight');
  if(level.key === 'medium') return t('builder.resistanceMedium');
  if(level.key === 'strong') return t('builder.resistanceStrong');
  if(level.key === 'veryStrong') return t('builder.resistanceVeryStrong');
  return '';
}
function loadLevelIdentity(level){
  if(!level) return '';
  if(level.key) return 'key:' + level.key;
  if(level.label) return 'label:' + level.label;
  return '';
}
export function exerciseLoadLevelState(ex){
  const levels = exerciseLoadLevels(ex);
  const level = exerciseLoadLevel(ex);
  const item = levels[level] || null;
  return {
    level,
    key: item && item.key ? item.key : '',
    label: item ? loadLevelLabel(item) : '',
    // Стабильная physical identity нужна resume-снимку. Для встроенной шкалы
    // используем key (он не меняется при RU↔EN), для пользовательской — label.
    identity: loadLevelIdentity(item)
  };
}
function resistanceScaleText(ex){
  return exerciseLoadLevels(ex).map(loadLevelLabel).filter(Boolean).join('\n');
}
function protocolLevelNorm(raw){
  return String(raw || '').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
}
function protocolLoadLevelItem(raw){
  const label = clampLine(String(raw || '').trim(), 60);
  const v = protocolLevelNorm(label);
  if(v === 'легкое' || v === 'light') return {key:'light'};
  if(v === 'среднее' || v === 'medium') return {key:'medium'};
  if(v === 'сильное' || v === 'strong') return {key:'strong'};
  if(v === 'очень сильное' || v === 'very strong') return {key:'veryStrong'};
  return label ? {label} : null;
}
function parsedResistanceScaleText(raw){
  const rows = String(raw || '').split(/\r?\n/)
    .map(x=>clampLine(x.trim(),60)).filter(Boolean)
    .map(protocolLoadLevelItem).filter(Boolean);
  return cleanLoadLevels(rows, false);
}
export function exerciseResistanceScaleOk(showError=true){
  if(!exDraft || progressionLoadType(exDraft) !== 'level') return true;
  const field = $('exLoadLevels');
  if(!field) return true;
  const raw = field.value.trim();
  const initial = String(field.dataset.initialValue || '').trim();
  if(raw === initial) return true;
  const levels = parsedResistanceScaleText(raw);
  if(levels.length < 2){
    if(showError) appAlert(t('builder.resistanceNeedTwo'));
    return false;
  }

  // Индекс сам по себе не описывает физическую резинку: при правке шкалы ищем ТУ ЖЕ
  // ступень по key/label. Пропала — текущий уровень переносить нельзя, иначе «Красная»
  // молча превратилась бы в «Чёрную» только потому, что обе были index=1.
  const load = exP(exDraft).load;
  const oldLevels = exerciseLoadLevels(exDraft);
  const oldBaseId = loadLevelIdentity(oldLevels[Math.max(0, Math.min(oldLevels.length - 1, load.level || 0))]);
  const state = ensureProgressState(exDraft);
  const rawCurrent = state.current.level != null
    ? Math.max(0, Math.min(Math.max(0, oldLevels.length - 1), Math.round(+state.current.level || 0)))
    : null;
  const oldCurrentId = rawCurrent == null ? '' : loadLevelIdentity(oldLevels[rawCurrent]);
  const findIdentity = id => id ? levels.findIndex(x => loadLevelIdentity(x) === id) : -1;

  load.levels = levels;
  const mappedBase = findIdentity(oldBaseId);
  load.level = mappedBase >= 0 ? mappedBase : 0;

  if(rawCurrent != null){
    const mappedCurrent = findIdentity(oldCurrentId);
    if(mappedCurrent >= 0) state.current.level = mappedCurrent;
    else state.current = emptyProgressCurrent();
  }

  // После успешного применения новая шкала становится сохранённой базой формы.
  // Иначе exDirty() продолжал считать её несохранённой до закрытия экрана.
  delete field.dataset.initialValue;
  renderExerciseLevelControls();
  syncExNowHints();
  return true;
}

/* ---- новое упражнение ----
   Один этап, без нагрузки, растут повторы с частотой программы. */
export function blankPrescription(){
  return {
    name:'', desc:'', type:'reps', value:'10', sets:1, perSide:false, rest:45, restAfter:null,
    muscles:[], mistakes:'', video:'',
    load:{type:'none', equipment:null, name:'', count:1, unit:'kg', weight:0, levels:[], level:0},
    supportEquipment:[],
    progression:{mode:'reps', every:null,
      reps:{step:1, max:null}, weight:{step:null, max:null}, time:{step:null, max:null}}
  };
}
function emptyProgressCurrent(){ return {reps:null, weight:null, time:null, level:null}; }
export function newStageId(){
  return 'mv' + Math.random().toString(36).slice(2, 8);
}
export function blankExercise(){
  const stageId = newStageId();
  return {id:newExId(), warmup:false, currentStageId:stageId,
    stages:[{stageId, prescription:blankPrescription(), advance:{mode:'manual'}, mediaRef:null, visualKey:''}],
    progressState:{count:0, current:emptyProgressCurrent()}, media:null};
}

// Приводит упражнение к валидной V2-форме на месте и возвращает его же: через эту
// функцию проходит и набранное руками, и пришедшее извне. Строгие ошибки модели
// (например, вес без снаряда) возвращаются в ex._errors для редактора/импорта —
// нормализация их не «чинит» молча.
export function normalizeExercise(ex){
  const res = FitExerciseV2.normalizeExercise(ex, {
    muscles: MUSCLES.map(([m]) => m),
    newId: prefix => prefix === 'e' ? newExId() : newStageId()
  });
  const out = res.exercise;
  out.stages.forEach(st => {
    const p = st.prescription;
    p.name = clampLine(p.name, LIM.exName);
    p.desc = clampText(p.desc, LIM.exDesc);
    p.mistakes = clampText(p.mistakes, LIM.exMistakes);
    // Тот же разбор, что у ссылки тренера: схему дописываем сами, а непохожее на
    // адрес не сохраняем. Кнопка «смотреть» на непонятной строке ведёт в никуда.
    p.video = cleanLink(p.video, LIM.video) || '';
  });
  const pic = out.media && out.media.kind === 'img' ? cleanPic(out.media.data) : null;
  out.media = pic ? {kind:'img', data:pic} : null;
  Object.keys(ex).forEach(k => { delete ex[k]; });
  Object.assign(ex, out);
  if(res.errors.length) Object.defineProperty(ex, '_errors', {value:res.errors, enumerable:false, configurable:true});
  return ex;
}
export function exerciseErrors(ex){
  return FitExerciseV2.normalizeExercise(JSON.parse(JSON.stringify(ex || {}))).errors;
}

// Упражнение-источник в самой программе: шаг тренировки — только копия,
// в нём нет потолков, полного состояния прогрессии и редакторских полей.
// Основной ключ — стабильный exercise.id. Название оставлено только для старых
// сохранённых шагов без id; при двух одинаковых названиях fallback намеренно
// считается неоднозначным и ничего не выбирает.
export function liveExercise(exId, fallbackName){
  const p = state.raw;
  if(!p || !p.id) return null;
  const plan = normPlans(p)[(typeof state.planIdx === 'number') ? state.planIdx : 0];
  if(!plan) return null;
  const list = plan.exercises || [];

  const id = String(exId || '').trim();
  if(id){
    const idx = list.findIndex(e => String((e && e.id) || '') === id);
    return idx >= 0 ? {p, plan, idx, ex:list[idx]} : null;
  }

  const key = String(fallbackName || '').trim().toLowerCase();
  if(!key) return null;
  const matches = [];
  list.forEach((e, idx) => {
    if(String(exP(e).name || '').trim().toLowerCase() === key) matches.push(idx);
  });
  if(matches.length !== 1) return null;
  const idx = matches[0];
  return {p, plan, idx, ex:list[idx]};
}

/* ---- прогрессия по упражнению ----
   Ось усложнения: разминка и выключенная прогрессия (mode 'none') не растут,
   время — по времени, весовая нагрузка — по весу, остальное — по повторам. */
export function progAxis(ex){
  if(!ex || ex.warmup) return 'none';
  const p = exP(ex);
  if(p.progression.mode === 'none') return 'none';
  if(p.type === 'time') return 'time';
  return p.load.type === 'weight' ? 'weight' : 'reps';
}
// «нагрузка — вес» не зависит от того, растёт ли он сейчас
export function hasWeight(ex){
  return !!ex && exP(ex).load.type === 'weight';
}
// весовая нагрузка без числа — только в незавершённом черновике
export function weightPending(ex){
  return hasWeight(ex) && !(+exP(ex).load.weight > 0);
}
// отдых после ВСЕГО упражнения (перед следующим); не задан — как между подходами
export function exRestAfter(ex){
  if(!ex) return 0;
  const p = exP(ex);
  return p.restAfter != null ? +p.restAfter : (+p.rest || 0);
}
// Частота прогрессии — число ПОЛНЫХ ВЫПОЛНЕНИЙ КОНКРЕТНОГО УПРАЖНЕНИЯ. У программы
// общий default; упражнение может задать своё. Выключение — только progression.mode 'none'.
const PROG_EVERY_DEFAULT = 4;
const PROG_EVERY_MAX = FitExerciseV2.PROG_EVERY_MAX;
function clampProgEvery(n){
  return Math.max(1, Math.min(PROG_EVERY_MAX, Math.round(+n || 0) || PROG_EVERY_DEFAULT));
}
function progPeriodLabel(n){
  n = Math.max(1, Math.round(+n || 1));
  if(n === 1) return t('builder.everyExerciseCompletion');
  if(appLocale === 'ru'){
    const executions = plural(n, t('builder.exerciseCompletionOne'), t('builder.exerciseCompletionFew'), t('builder.exerciseCompletionMany'));
    return t('builder.everyNExerciseCompletions',{count:n,executions});
  }
  return t('builder.everyNExerciseCompletions',{count:n});
}
// Общий дефолт программы: 1–15 выполнений каждого упражнения
function fillProgEveryOptions(){
  const sel = $('bProgEvery');
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '0';
  none.textContent = t('builder.progressionNoProgramDefault');
  sel.appendChild(none);
  for(let n = 1; n <= PROG_EVERY_MAX; n++){
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = progPeriodLabel(n);
    sel.appendChild(o);
  }
}

function programProgEvery(n){
  return Math.max(0, Math.min(PROG_EVERY_MAX, Math.round(+n || 0)));
}

export function exerciseProgEvery(ex, program){
  if(!ex) return 0;
  const every = exP(ex).progression.every;
  if(every != null) return Math.max(1, Math.min(PROG_EVERY_MAX, Math.round(+every)));
  return programProgEvery(program && program.progression);
}

export function programHasProgression(program){
  return !!program && normPlans(program).some(pl => (pl.exercises || []).some(ex =>
    !ex.warmup && progAxis(ex) !== 'none' && exerciseProgEvery(ex, program) > 0
  ));
}

export function progressionLoadType(ex){
  return ex ? exP(ex).load.type : 'none';
}

export function getProgressionStrategy(ex, program){
  const p = exP(ex);
  const every = exerciseProgEvery(ex, program);
  const loadType = p.load.type;
  const mode = p.progression.mode === 'none' ? null : p.progression.mode;
  const switchedOn = !!ex && !ex.warmup && !!mode;
  return {
    enabled: switchedOn && every > 0,
    every,
    mode,
    metric: p.type === 'time' ? 'time' : 'reps',
    loadType,
    reps: {step: progStepSize(ex, 'reps'), max: progCeil(ex, 'reps')},
    time: {step: progStepSize(ex, 'time'), max: progCeil(ex, 'time')},
    weight: {
      step: loadType === 'weight' ? progStepSize(ex, 'weight') : 0,
      max: loadType === 'weight' ? progCeil(ex, 'weight') : null
    },
    level: {
      current: loadType === 'level' ? exerciseLoadLevel(ex) : 0,
      max: loadType === 'level' ? Math.max(0, exerciseLoadLevels(ex).length - 1) : null,
      levels: exerciseLoadLevels(ex)
    }
  };
}

/* ---- модель ручного редактора прогрессии ----
   AI и ручной редактор пишут одну и ту же семантику: допустимые способы зависят
   только от «как считаем» (reps/time) и типа нагрузки. */
export function progressionModeOptions(ex){
  const p = exP(ex);
  return FitExerciseV2.allowedModes(p.type, p.load.type).filter(m => m !== 'none');
}

export function recommendedProgressionMode(ex){
  const p = exP(ex);
  const isTime = p.type === 'time';
  if(p.load.type === 'level') return isTime ? 'time' : 'level';
  if(p.load.type === 'weight') return isTime ? 'time' : 'double_range';
  return isTime ? 'time' : 'reps';
}

// способ, который показывает редактор: выключенная прогрессия показывает рекомендуемый
export function editorProgressionMode(ex){
  if(!ex) return null;
  const mode = exP(ex).progression.mode;
  return mode !== 'none' && progressionModeOptions(ex).includes(mode) ? mode : recommendedProgressionMode(ex);
}

// Применяет выбранный способ и подставляет безопасные шаги/потолки там, где без них
// способ не работает. Потолки не стираем: переключиться туда-обратно должно быть безопасно.
export function setExerciseProgressionMode(ex, mode){
  if(!ex) return ex;
  const p = exP(ex);
  const pr = p.progression;
  const allowed = progressionModeOptions(ex);
  const nextMode = allowed.includes(mode) ? mode : recommendedProgressionMode(ex);
  pr.mode = nextMode;
  const base = parseValue(p.value);
  if(nextMode === 'double_range'){
    if(!(pr.reps.step > 0)) pr.reps.step = 1;
    if(!(pr.weight.step > 0)) pr.weight.step = 2;
    pr.reps.max = Math.max(base.max + pr.reps.step, +pr.reps.max || 0);
  } else if(nextMode === 'reps'){
    if(!(pr.reps.step > 0)) pr.reps.step = 1;
  } else if(nextMode === 'weight'){
    if(!(pr.weight.step > 0)) pr.weight.step = 2;
  } else if(nextMode === 'time'){
    if(!(pr.time.step > 0)) pr.time.step = 5;
  } else if(nextMode === 'parallel'){
    if(p.type === 'time'){ if(!(pr.time.step > 0)) pr.time.step = 5; }
    else if(!(pr.reps.step > 0)) pr.reps.step = 1;
    if(!(pr.weight.step > 0)) pr.weight.step = 2;
  } else if(nextMode === 'level'){
    p.load.levels = cleanLoadLevels(p.load.levels, true);
    p.load.level = Math.max(0, Math.min(p.load.levels.length - 1, Math.round(+p.load.level || 0)));
    if(p.type !== 'time'){
      // по умолчанию — сначала два небольших шага повторов, потом следующий уровень
      if(!(pr.reps.step > 0)) pr.reps.step = 2;
      if(!(pr.reps.max > base.max)) pr.reps.max = Math.min(200, base.max + pr.reps.step * 2);
    }
  }
  return ex;
}
// «Со временем сложнее» включает/выключает прогрессию: выключение — единственное
// значение mode 'none', включение возвращает рекомендуемый способ
export function setExerciseProgressionOn(ex, on){
  if(!ex) return ex;
  if(!on){ exP(ex).progression.mode = 'none'; return ex; }
  if(exP(ex).progression.mode === 'none') setExerciseProgressionMode(ex, recommendedProgressionMode(ex));
  return ex;
}

// Явная смена типа нагрузки в редакторе. Снаряд и шкала получают разумные
// значения по умолчанию, чтобы черновик сразу описывал реальную конфигурацию.
// preferRecommended=true — для НОВОГО упражнения: добавили вес, значит default reps→double_range.
export function setExerciseLoadType(ex, loadType, preferRecommended=false){
  if(!ex) return ex;
  const p = exP(ex);
  const wasOn = p.progression.mode !== 'none';
  const next = loadType === 'weight' ? 'weight' : loadType === 'level' ? 'level' : 'none';
  const load = p.load;
  load.type = next;
  if(next === 'none'){
    load.equipment = null; load.name = ''; load.count = 1; load.weight = 0;
  } else {
    const eq = FitExerciseV2.equipment(load.equipment);
    if(!eq || !eq.roles.includes('load') || !eq.loadTypes.includes(next)){
      const def = FitExerciseV2.equipment(next === 'weight' ? 'dumbbell' : 'band');
      load.equipment = def.id;
      load.count = def.count;
      load.name = '';
    }
    if(next === 'level'){
      load.levels = cleanLoadLevels(load.levels, true);
      load.level = Math.max(0, Math.min(load.levels.length - 1, Math.round(+load.level || 0)));
    }
  }
  const current = editorProgressionMode(ex);
  const target = preferRecommended || !progressionModeOptions(ex).includes(current)
    ? recommendedProgressionMode(ex) : current;
  setExerciseProgressionMode(ex, target);
  if(!wasOn) p.progression.mode = 'none';
  return ex;
}

// То же для «Повторения / Время»
export function setExerciseMetric(ex, type, preferRecommended=false){
  if(!ex) return ex;
  const p = exP(ex);
  const wasOn = p.progression.mode !== 'none';
  p.type = type === 'time' ? 'time' : 'reps';
  p.value = normValue(p.value, p.type);
  const current = editorProgressionMode(ex);
  const target = preferRecommended || !progressionModeOptions(ex).includes(current)
    ? recommendedProgressionMode(ex) : current;
  setExerciseProgressionMode(ex, target);
  if(!wasOn) p.progression.mode = 'none';
  return ex;
}

const levelWithReps = ex => exP(ex).type !== 'time' && progStepSize(ex, 'reps') > 0;
export function progressionModeLabel(ex, mode){
  if(mode === 'double_range') return t('builder.progModeDouble');
  if(mode === 'weight') return t('builder.progModeWeight');
  if(mode === 'time') return t('builder.progModeTime');
  if(mode === 'parallel') return t(exP(ex).type === 'time' ? 'builder.progModeParallelTime' : 'builder.progModeParallelReps');
  if(mode === 'level') return levelWithReps(ex) ? t('builder.progModeLevelReps') : t('builder.progModeLevel');
  return t('builder.progModeReps');
}

function progressionModeHintKey(ex, mode){
  if(mode === 'double_range') return 'builder.progModeHintDouble';
  if(mode === 'weight') return 'builder.progModeHintWeight';
  if(mode === 'time') return 'builder.progModeHintTime';
  if(mode === 'parallel') return exP(ex).type === 'time'
    ? 'builder.progModeHintParallelTime'
    : 'builder.progModeHintParallelReps';
  if(mode === 'level') return levelWithReps(ex)
    ? 'builder.progModeHintLevelReps'
    : 'builder.progModeHintLevel';
  return 'builder.progModeHintReps';
}

function progressionCeilingHintKey(ex, mode){
  if(mode === 'double_range') return 'builder.ceilingRequiredDoubleHint';
  if(mode === 'level' && levelWithReps(ex)) return 'builder.ceilingRequiredLevelHint';
  return 'builder.ceilingOptionalHint';
}

export function progressionConfigIssue(ex){
  if(!ex || ex.warmup || exP(ex).progression.mode === 'none') return '';
  const mode = editorProgressionMode(ex);
  const needsRepTransition = mode === 'double_range' || (mode === 'level' && levelWithReps(ex));
  if(!needsRepTransition) return '';
  const base = parseValue(exP(ex).value);
  const ceil = Math.round(+progCeil(ex, 'reps') || 0);
  if(ceil > base.max) return '';
  return mode === 'double_range'
    ? 'builder.ceilingRequiredDoubleError'
    : 'builder.ceilingRequiredLevelError';
}

export function exerciseProgressionConfigOk(showError=true){
  if(!exDraft) return true;
  let probe = exDraft;
  try{ probe = applyFormTo(JSON.parse(JSON.stringify(exDraft))); }catch(_){}
  const issue = progressionConfigIssue(probe);
  if(!issue) return true;

  if(showError) appAlert(t(issue));
  const field = $('exMaxReps');
  if(field){
    try{ field.scrollIntoView({block:'center',behavior:'smooth'}); }catch(_){}
    field.focus();
  }
  return false;
}

function fillExerciseProgModeOptions(){
  const sel = $('exProgMode');
  if(!sel || !exDraft) return;
  const current = editorProgressionMode(exDraft);
  const p = exP(exDraft);
  const levelLoad = p.load.type === 'level';
  sel.innerHTML = '';
  progressionModeOptions(exDraft).forEach(mode=>{
    if(mode === 'level' && levelLoad && p.type !== 'time'){
      const seq = document.createElement('option');
      seq.value = 'level';
      seq.textContent = t('builder.progModeLevelReps');
      sel.appendChild(seq);
      const direct = document.createElement('option');
      direct.value = 'level_direct';
      direct.textContent = t('builder.progModeLevel');
      sel.appendChild(direct);
      return;
    }
    const o = document.createElement('option');
    o.value = mode;
    o.textContent = progressionModeLabel(exDraft, mode);
    sel.appendChild(o);
  });
  sel.value = current === 'level' && levelLoad && p.type !== 'time' && !(progStepSize(exDraft, 'reps') > 0)
    ? 'level_direct'
    : (current || recommendedProgressionMode(exDraft));
}

function fillExerciseProgEveryOptions(){
  const sel = $('exProgEvery');
  if(!sel) return;
  const inherited = Math.max(0, +((draft && draft.progression) || 0));
  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = inherited
    ? t('builder.exerciseProgressionUseProgram',{count:inherited})
    : t('builder.exerciseProgressionUseProgramOff');
  sel.appendChild(def);
  for(let n = 1; n <= PROG_EVERY_MAX; n++){
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = progPeriodLabel(n);
    sel.appendChild(o);
  }
}
// 12 кг, 12,5 кг — без хвостов вроде 12.50
export function fmtKg(kg){
  const n = Math.round((+kg || 0) * 2) / 2;
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/* ================= ПРОГРЕССИЯ: единая модель для веса, повторов, времени и уровня =================
   Политика (как растёт) — exP(ex).progression; накопленное состояние слота —
   ex.progressState {count, current:{reps, weight, time, level}}. Отсутствующее значение
   current означает «равно базе этапа». Вес — всегда на ОДНУ единицу снаряда.
   После порога выполнений приложение предлагает следующий шаг; подтверждённый шаг
   меняет только это упражнение. */

// значение упражнения «с нуля», без прогрессии
export function progBaseValue(ex, axis){
  axis = axis || progAxis(ex);
  const p = exP(ex);
  if(axis === 'weight') return +p.load.weight || 0;
  return parseValue(p.value).min; // повторы, время и «не усложнять» — минимум из value
}
// Что именно растёт у упражнения, одной строкой: «+2 кг», «+1 повт. и +2 кг»,
// «+5 сек». Пусто — не растёт, и тогда не показываем ничего.
export function progShort(ex){
  if(!ex || ex.warmup || progAxis(ex) === 'none') return '';
  if(isDualProg(ex)){
    const r = progStepSize(ex, 'reps');
    const w = progStepSize(ex, 'weight');
    const max = progCeil(ex, 'reps');
    if(r > 0 && w > 0 && max != null){
      return t('builder.dualShort',{reps:fmtKg(r),max:fmtKg(max),weight:fmtKg(w)});
    }
  }
  const bits = [];
  if(exP(ex).type === 'time'){
    const st = progStepSize(ex, 'time');
    if(st > 0) bits.push(`+${fmtKg(st)} ${t('store.secShort')}`);
  } else {
    const r = progStepSize(ex, 'reps');
    if(r > 0) bits.push(`+${fmtKg(r)} ${t('store.repShort')}`);
  }
  if(hasWeight(ex)){
    const w = progStepSize(ex, 'weight');
    if(w > 0) bits.push(`+${fmtKg(w)} ${t('progress.kg')}`);
  }
  return bits.length ? bits.join(appLocale === 'ru' ? ' и ' : ' & ') : t('builder.progressionAuto');
}

// шаг оси за одно повышение; не задан — ось не растёт
export function progStepSize(ex, axis){
  axis = axis || progAxis(ex);
  const a = exP(ex).progression[axis];
  return a && +a.step > 0 ? +a.step : 0;
}
// округление под ось: вес — до 0,5, повторы и время — целые
function progRound(axis, v){
  return axis === 'weight' ? Math.round(v * 2) / 2 : Math.round(v);
}

// Состояние прогрессии хранится в слоте и синхронизируется вместе с программой.
export function ensureProgressState(ex){
  const s = ex.progressState;
  if(!s || typeof s !== 'object'){
    ex.progressState = {count:0, current:emptyProgressCurrent()};
  } else {
    s.count = Math.max(0, Math.round(+s.count || 0));
    if(!s.current || typeof s.current !== 'object') s.current = emptyProgressCurrent();
  }
  return ex.progressState;
}
const curOf = ex => (ex && ex.progressState && ex.progressState.current) || {};
function psReps(ex){
  const c = curOf(ex);
  return parseValue(c.reps != null ? c.reps : exP(ex).value);
}
function psSec(ex){
  const c = curOf(ex);
  return c.time != null ? +c.time : parseValue(exP(ex).value).min;
}
function psKg(ex){
  const c = curOf(ex);
  return c.weight != null ? +c.weight : (+exP(ex).load.weight || 0);
}

// потолок оси: не задан = растём без ограничения
function progCeil(ex, axis){
  const a = exP(ex).progression[axis];
  return a && +a.max > 0 ? +a.max : null;
}
// двойная прогрессия возможна, только когда есть и вес, и потолок повторов
export function isDualProg(ex){
  return exP(ex).progression.mode === 'double_range' && hasWeight(ex) && progCeil(ex, 'reps') != null;
}

// итоговое значение упражнения сейчас — из фактического состояния (progressState).
// pid/program не нужны для чтения, сигнатура сохранена ради мест вызова.
export function getExProgValue(pid, ex, program, axis){
  axis = axis || progAxis(ex);
  if(axis === 'none') return progBaseValue(ex, axis);
  if(axis === 'weight'){
    const kg = psKg(ex);
    if(kg <= 0) return 0;
    const ceil = progCeil(ex, 'weight');
    return Math.max(0, progRound('weight', ceil != null ? Math.min(ceil, kg) : kg));
  }
  if(axis === 'time'){
    const ceil = progCeil(ex, 'time');
    const v = psSec(ex);
    return Math.max(1, progRound('time', ceil != null ? Math.min(ceil, v) : v));
  }
  // reps: одно число — минимум текущего диапазона (см. progressedRepsRange)
  const ceil = progCeil(ex, 'reps');
  const v = psReps(ex).min;
  return Math.max(1, progRound('reps', ceil != null ? Math.min(ceil, v) : v));
}
// диапазон повторов «8-10»: это и есть текущая цель. Обе границы растут вместе.
// В двойной прогрессии максимум относится к ВЕРХНЕЙ границе: 8-10 → 9-11 → …
// → 18-20, затем +вес и возврат к исходному 8-10.
export function progressedRepsRange(pid, ex, program){
  const r = psReps(ex);
  const ceil = progCeil(ex, 'reps');
  const base = parseValue(exP(ex).value);
  const baseWidth = Math.max(0, base.max - base.min);
  let min = r.min, max = r.max;
  if(ceil != null && max > ceil){
    max = ceil;
    if(isDualProg(ex) && baseWidth > 0) min = Math.max(1, max - baseWidth);
    else min = Math.min(min, max);
  }
  min = Math.max(1, min);
  max = Math.max(min, max);
  return min === max ? String(min) : min + '-' + max;
}
// Чистое чтение текущей нагрузки: НЕ создаёт progressState и не меняет упражнение —
// просто открыть экран проверки прогрессии не должно пачкать sync-данные.
function progressionCurrentState(ex, mode){
  const p = exP(ex);
  const c = curOf(ex);
  const baseReps = parseValue(p.value);
  const rawReps = c.reps != null ? parseValue(c.reps) : baseReps;
  const repsCeil = ex ? progCeil(ex, 'reps') : null;
  const baseWidth = Math.max(0, baseReps.max - baseReps.min);

  let min = rawReps.min, max = rawReps.max;
  if(repsCeil != null && max > repsCeil){
    max = repsCeil;
    if(mode === 'double_range' && baseWidth > 0) min = Math.max(1, max - baseWidth);
    else min = Math.min(min, max);
  }
  min = Math.max(1, min);
  max = Math.max(min, max);

  const baseSec = parseValue(p.value).min;
  const rawSec = c.time != null ? +c.time : baseSec;
  const timeCeil = ex ? progCeil(ex, 'time') : null;
  const sec = Math.max(1, progRound('time', timeCeil != null ? Math.min(timeCeil, rawSec) : rawSec));

  const rawKg = c.weight != null ? +c.weight : +(p.load.weight || 0);
  const weightCeil = ex ? progCeil(ex, 'weight') : null;
  const kg = rawKg > 0
    ? Math.max(0, progRound('weight', weightCeil != null ? Math.min(weightCeil, rawKg) : rawKg))
    : 0;

  const level = ex && progressionLoadType(ex) === 'level' ? exerciseLoadLevel(ex) : 0;

  return {
    reps: min === max ? String(min) : min + '-' + max,
    sec,
    kg,
    level
  };
}

function sameProgressionValue(a, b){ return String(a) === String(b); }

function progressionChanged(current, next){
  const changed = [];
  if(!sameProgressionValue(current.reps, next.reps)) changed.push('reps');
  if(!sameProgressionValue(current.sec, next.sec)) changed.push('time');
  if(!sameProgressionValue(current.kg, next.kg)) changed.push('weight');
  if(!sameProgressionValue(current.level, next.level)) changed.push('level');
  return changed;
}

function computeRepsStep(ex, current, next){
  const step = progStepSize(ex, 'reps');
  if(!(step > 0)) return;
  const ceil = progCeil(ex, 'reps');
  const r = parseValue(current.reps);
  const min = Math.max(1, r.min + step);
  const max = Math.max(min, r.max + step);
  const a = ceil != null ? Math.min(ceil, min) : min;
  const z = ceil != null ? Math.min(ceil, max) : max;
  next.reps = String(a) + (z !== a ? '-' + z : '');
}

function computeTimeStep(ex, current, next){
  const step = progStepSize(ex, 'time');
  if(!(step > 0)) return;
  const ceil = progCeil(ex, 'time');
  const value = current.sec + step;
  next.sec = Math.max(1, ceil != null ? Math.min(ceil, value) : value);
}

function computeWeightStep(ex, current, next){
  const step = progStepSize(ex, 'weight');
  if(!(step > 0) || !(current.kg > 0)) return;
  const ceil = progCeil(ex, 'weight');
  const value = current.kg + step;
  next.kg = progRound('weight', ceil != null ? Math.min(ceil, value) : value);
}

function computeDoubleRangeStep(ex, current, next){
  const base = parseValue(exP(ex).value);
  const width = Math.max(0, base.max - base.min);
  const repsCeil = progCeil(ex, 'reps');
  if(repsCeil == null) return; // invalid double_range: нет точки перехода к весу

  const repsStep = progStepSize(ex, 'reps') || 1;
  const stored = parseValue(current.reps);
  const curMax = stored.max;

  if(curMax >= repsCeil){
    if(!(current.kg > 0)) return;

    const weightCeil = progCeil(ex, 'weight');
    if(weightCeil != null && current.kg >= weightCeil) return; // полный потолок

    const step = progStepSize(ex, 'weight');
    if(!(step > 0)) return;
    const nextKg = current.kg + step;
    next.kg = progRound('weight', weightCeil != null ? Math.min(weightCeil, nextKg) : nextKg);
    next.reps = normValue(exP(ex).value, 'reps');
    return;
  }

  const nextMax = Math.min(repsCeil, curMax + repsStep);
  const nextMin = Math.max(1, nextMax - width);
  next.reps = nextMin === nextMax ? String(nextMin) : nextMin + '-' + nextMax;
}

function computeLevelStep(ex, strategy, current, next){
  if(strategy.loadType !== 'level' || !strategy.level.levels.length) return;

  // reps+level по умолчанию работает как double progression без килограммов:
  // сначала растёт диапазон повторов, затем сопротивление и диапазон сбрасывается.
  if(exP(ex).type !== 'time' && strategy.reps.step > 0){
    const ceil = strategy.reps.max;
    const r = parseValue(current.reps);
    if(ceil == null || r.max < ceil){
      computeRepsStep(ex, current, next);
      return;
    }
  }

  if(current.level >= strategy.level.max) return;
  next.level = current.level + 1;
  if(exP(ex).type !== 'time' && strategy.reps.step > 0 && strategy.reps.max != null){
    next.reps = normValue(exP(ex).value, 'reps');
  }
}

// ЕДИНСТВЕННЫЙ расчёт следующего шага. Не мутирует ex.
// previewNextProgression() показывает его, advanceExerciseProgression() применяет его.
export function computeNextProgression(ex, program){
  const strategy = getProgressionStrategy(ex, program);
  const mode = strategy.mode;
  const current = progressionCurrentState(ex, mode);
  const next = {...current};

  if(!ex || ex.warmup || progAxis(ex) === 'none' || !mode){
    return {canAdvance:false, mode:null, current, next, changed:[]};
  }

  if(mode === 'double_range'){
    computeDoubleRangeStep(ex, current, next);
  } else if(mode === 'reps'){
    computeRepsStep(ex, current, next);
  } else if(mode === 'time'){
    computeTimeStep(ex, current, next);
  } else if(mode === 'weight'){
    computeWeightStep(ex, current, next);
  } else if(mode === 'parallel'){
    if(exP(ex).type === 'time') computeTimeStep(ex, current, next);
    else computeRepsStep(ex, current, next);
    computeWeightStep(ex, current, next);
  } else if(mode === 'level'){
    computeLevelStep(ex, strategy, current, next);
  }

  const changed = progressionChanged(current, next);
  return {canAdvance:changed.length > 0, mode, current, next, changed};
}

export function previewNextProgression(ex, program){
  return computeNextProgression(ex, program);
}

// Один formatter для всех экранов, где человек должен понимать фактическую нагрузку.
export function progressionStateLabel(ex, value){
  const v = value || {};
  const p = exP(ex);
  const bits = [];
  if(p.type === 'time'){
    bits.push(`${Math.max(0, Math.round(+v.sec || 0))} ${t('store.secShort')}`);
  }else{
    const reps = String(v.reps != null ? v.reps : normValue(p.value, 'reps')).replace('-', '–');
    bits.push(`${reps} ${t('workout.repsShort')}`);
  }
  const loadType = p.load.type;
  if(loadType === 'weight' && +v.kg > 0){
    bits.push(`${fmtKg(v.kg)} ${t('progress.kg')}`);
  }else if(loadType === 'level'){
    const levels = exerciseLoadLevels(ex);
    const idx = Math.max(0, Math.min(Math.max(0, levels.length - 1), Math.round(+v.level || 0)));
    const label = levels[idx] ? loadLevelLabel(levels[idx]) : '';
    if(label) bits.push(t('builder.resistanceValue',{value:label}));
  }
  return bits.join(' · ');
}

// Потолок определяется тем же расчётом, что preview/apply: если следующий шаг ничего
// не может изменить — автоматический рост закончен. Оси без потолка растут всегда.
export function progAtCeiling(pid, ex, program){
  if(!ex || progAxis(ex) === 'none') return false;
  const strategy = getProgressionStrategy(ex, program);
  if(!strategy.mode) return false;
  const growing = FitExerciseV2.growingAxes(exP(ex));
  if(!growing.length) return false;
  if(growing.includes('weight') && weightPending(ex)) return false;
  const allBounded = growing.every(axis => axis === 'level' ? strategy.level.max != null : progCeil(ex, axis) != null);
  if(!allBounded) return false;
  return !computeNextProgression(ex, program).canAdvance;
}

// Один подтверждённый шаг = применить ровно то, что до этого мог показать preview.
export function advanceExerciseProgression(ex){
  if(!ex || progAxis(ex) === 'none') return;
  const result = computeNextProgression(ex, null);
  if(!result.canAdvance) return;

  const cur = ensureProgressState(ex).current;
  if(result.changed.includes('reps')) cur.reps = result.next.reps;
  if(result.changed.includes('time')) cur.time = result.next.sec;
  if(result.changed.includes('weight')) cur.weight = result.next.kg;
  if(result.changed.includes('level')) cur.level = result.next.level;
}

// Следующий этап движения. Предлагается сам только при advance:'ceiling' и
// достигнутом конечном потолке текущего этапа; вручную перейти можно всегда.
export function nextExerciseStage(ex){
  const list = (ex && ex.stages) || [];
  const i = list.findIndex(st => st.stageId === ex.currentStageId);
  return i >= 0 ? list[i + 1] || null : null;
}
export function stageOfferAtCeiling(ex, program){
  const st = FitExerciseV2.activeStage(ex);
  const next = nextExerciseStage(ex);
  if(!st || !next || !st.advance || st.advance.mode !== 'ceiling') return null;
  return progAtCeiling(program && program.id, ex, program) ? next : null;
}
// Переход между этапами: тот же слот (exercise.id), другой stageId, прогресс заново
export function promoteExerciseStage(ex, stageId){
  if(!ex || !(ex.stages || []).some(st => st.stageId === stageId)) return false;
  ex.currentStageId = stageId;
  ex.progressState = {count:0, current:emptyProgressCurrent()};
  // картинка показывала прежнее движение — на новый этап её не переносим (план, «Картинки stages»)
  ex.media = null;
  return true;
}

/* ---- перенос прогресса при правке упражнения ----
   - другой этап движения или другая физическая конфигурация нагрузки (cfgKey) —
     новый период: прогресс начинается заново;
   - тот же этап и конфигурация, но изменено назначение (повторы/время, рабочий вес,
     уровень, подходы, способ/шаг/потолок/частота прогрессии) — счётчик до проверки
     обнуляется, текущая нагрузка равна новой базе;
   - правка только текста/картинки — прогресс переносится целиком;
   - шкалу уровней можно переставлять и дополнять: текущий уровень переносится по
     identity, но при смене порядка счётчик обнуляется. */
function workloadKey(ex){
  const p = exP(ex);
  const pr = p.progression;
  return JSON.stringify([
    p.type, normValue(p.value, p.type), p.sets, p.load.type === 'weight' ? +p.load.weight || 0 : 0,
    p.load.type === 'level' ? loadLevelIdentity(p.load.levels[p.load.level]) : '',
    pr.mode, pr.every, pr.reps, pr.weight, pr.time
  ]);
}
function levelIdentities(ex){ return exerciseLoadLevels(ex).map(loadLevelIdentity); }
export function carryExerciseProgress(oldEx, newEx){
  if(!newEx) return newEx;
  const fresh = () => { newEx.progressState = {count:0, current:emptyProgressCurrent()}; return newEx; };
  if(!oldEx || !oldEx.progressState) return fresh();
  if(oldEx.currentStageId !== newEx.currentStageId) return fresh();
  if(FitExerciseV2.cfgKey(exP(oldEx).load) !== FitExerciseV2.cfgKey(exP(newEx).load)) return fresh();

  const old = JSON.parse(JSON.stringify(oldEx.progressState));
  if(workloadKey(oldEx) !== workloadKey(newEx)){
    newEx.progressState = {count:0, current:emptyProgressCurrent()};
    return newEx;
  }
  newEx.progressState = old;
  if(progressionLoadType(newEx) === 'level'){
    const oldIds = levelIdentities(oldEx), newIds = levelIdentities(newEx);
    if(old.current && old.current.level != null){
      const mapped = newIds.indexOf(oldIds[old.current.level]);
      if(mapped < 0){ newEx.progressState = {count:0, current:emptyProgressCurrent()}; return newEx; }
      newEx.progressState.current.level = mapped;
    }
    const common = oldIds.filter(id => newIds.includes(id));
    const order = ids => ids.filter(id => common.includes(id)).join('\n');
    if(order(oldIds) !== order(newIds)) newEx.progressState.count = 0;
  }
  return newEx;
}
// Копия упражнения — отдельный экземпляр: новые exercise.id и stageId (по ним живут
// история и правки ИИ) и прогресс с нуля.
export function cloneExerciseAsNew(ex){
  const c = JSON.parse(JSON.stringify(ex));
  FitExerciseV2.regenerateExerciseIds(c, prefix => prefix === 'e' ? newExId() : newStageId());
  c.progressState = {count:0, current:emptyProgressCurrent()};
  return c;
}

// текущий рабочий вес (растёт от тренировки к тренировке)
export function getExWeight(pid, ex, program){
  return hasWeight(ex) ? getExProgValue(pid, ex, program, 'weight') : 0;
}
// прямая правка текущего веса (экран старта): пишет в progressState, база этапа не меняется
export function setExWeight(ex, kg){
  ensureProgressState(ex).current.weight = Math.max(0, progRound('weight', +kg || 0));
}

/* ---- ЗНАЧЕНИЕ может быть числом или диапазоном «12-15» ---- */
// возвращает {min, max} — для одиночного значения min === max
export function parseValue(v){
  const s = String(v == null ? '' : v).replace(',', '.').trim();
  const m = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if(m){
    let a = parseInt(m[1]), b = parseInt(m[2]);
    if(a > b){ const t = a; a = b; b = t; }
    return {min: Math.max(1, a), max: Math.min(999, b)};
  }
  const n = Math.max(1, Math.min(999, parseInt(s) || 1));
  return {min: n, max: n};
}
// «12» или «12–15»
export function valueText(v){
  const r = parseValue(v);
  return r.min === r.max ? String(r.min) : (r.min + '–' + r.max);
}
// масштабирование нагрузки с сохранением диапазона
function scaleValue(v, k){
  const r = parseValue(v);
  const a = Math.max(1, Math.round(r.min * k));
  const b = Math.max(1, Math.round(r.max * k));
  return a === b ? String(a) : (a + '-' + b);
}
// нормализация значения для хранения
export function normValue(v, type){
  return FitExerciseV2.normValue(v, type);
}

export let planIdx = 0;
// Новый вариант начинается пустым: раньше в нём сразу лежало безымянное упражнение,
// и человек видел строку, которой не заводил. Теперь виден пустой список с объяснением,
// а первую строку создаёт «Добавить упражнение» — сразу с полем названия в фокусе.
function blankPlan(){
  return {id:newPlanId(), days:[], rounds:3, roundRest:120, exercises:[]};
}

export function openBuilder(id=null){
  if(id){
    const src = customPrograms.find(x=>x.id===id);
    draft = JSON.parse(JSON.stringify(src));
    draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
    delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days; delete draft.tod;
    if(!draft.time) draft.time = '';
    if(!draft.cover) draft.cover = null;
    if(!draft.stats) draft.stats = {completions: 0};
  } else {
    draft = {id:'p'+Date.now(), name:'', time:'', cover:null, stats:{completions:0}, progression:PROG_EVERY_DEFAULT, plans:[blankPlan()]};
  }
  planIdx = 0;
  fillBuilder(id ? t('ai.editTitle') : t('programs.newProgram'));
}

export function curPlan(){ return draft.plans[planIdx]; }

export function syncRotateUI(){
  const many = (draft.plans || []).length > 1;
  const rot = !!draft.rotate && many;

  // переключатель режима есть только когда вариантов больше одного
  setShown('schedModeRow', many);
  document.querySelectorAll('#schedSeg button').forEach(b =>
    b.classList.toggle('act', (b.dataset.mode === 'rot') === rot));
  $('schedHint').textContent = rot
    ? t('builder.rotationHint')
    : t('builder.weekdayHint');

  // дни варианта показываются только когда вариантов правда несколько
  $('bDaysLabel').textContent = t('builder.variantDaysLabel');
  $('bDaysHint').textContent = t('builder.variantDaysHint');

  // подписи вариантов. У программы с одним вариантом карточка не про варианты:
  // в ней круги и отдых, и называться она должна тем, что в ней лежит.
  $('variantsLabel').textContent = !many
    ? t('builder.roundsRest')
    : (rot ? t('builder.variantsRotate') : t('builder.variantsWorkout'));
  $('variantsHint').textContent = !many
    ? t('builder.addVariantHint')
    : (rot
        ? t('builder.selectedVariantHint')
        : t('builder.selectedVariantDaysHint'));

  // пометка у заголовка «Круги и отдых»
  $('stVariantNote').textContent = many ? `${t('builder.variant')} ${planIdx + 1}` : '';

  renderDays();
  renderPlanTabs();
}

// перед сменой вкладки/сохранением переносим значения полей в текущий план
export function commitPlanFields(){
  const pl = curPlan();
  pl.rounds = +$('bRounds').value || 3;
  pl.roundRest = Math.max(0, Math.min(600, parseInt($('bRoundRest').value) || 0));
  // Своё время напоминания у варианта из редактора убрано: одно время на программу
  // и так есть, а второе рядом только путало. Ключ pl.time остаётся — его понимают
  // импорт, формат обмена с ИИ и напоминания; просто мы его больше не предлагаем.
}

// заполняет форму конструктора из draft и показывает экран
// текущее состояние программы для сравнения с исходным
function programState(){
  if(!draft) return null;
  try{ commitPlanFields(); }catch(e){}
  return {name: $('bName') ? $('bName').value.trim() : draft.name, d: draft};
}
export function programDirty(){ return isChanged('program', programState()); }

export function fillBuilder(title){
  $('builderTitle').textContent = title;
  setTimeout(()=> takeSnap('program', programState()), 0);
  setTimeout(eventBuilderHooks.markBuilderTab, 0);
  $('bName').value = draft.name;
  $('bDesc').value = draft.desc || '';
  $('bDescCount').textContent = (draft.desc || '').length;
  setTimeout(()=> workoutBuilderHooks.autoGrow($('bDesc')), 0);
  $('bTime').value = draft.time || '';

  // ротация вариантов доступна, когда вариантов больше одного
  syncRotateUI();
  fillProgEveryOptions();
  $('bProgEvery').value = String(programProgEvery(draft.progression));
  syncCover();
  renderPlanTabs();
  fillPlanFields();
  show('scrBuilder');
  window.scrollTo(0,0);
}

function renderPlanTabs(){
  ['planTabs', 'planTabsTop'].forEach(id => buildPlanTabs(id));
  // верхние вкладки нужны, только когда вариантов больше одного
  setShown('planTabsTop', draft.plans.length > 1);
  if(typeof renderExList === 'function' && $('bVariantTitle')) { /* подписи обновит renderExList */ }
  eventBuilderHooks.syncSettingsSum();
}

function buildPlanTabs(boxId){
  const box = $(boxId); box.innerHTML='';
  const isTop = boxId === 'planTabsTop';
  // одна вкладка ничего не переключает и просто повторяет дни, выбранные выше
  (draft.plans.length > 1 ? draft.plans : []).forEach((pl, i)=>{
    const b = document.createElement('div');
    b.className = 'plan-tab';
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const rot = !!draft.rotate && draft.plans.length > 1;
    const lbl = document.createElement('span');
    if(rot){
      // при очереди дни варианта не имеют смысла — показываем номер и позицию в очереди
      const nextIdx = ((draft.rotIdx || 0) % draft.plans.length + draft.plans.length) % draft.plans.length;
      lbl.textContent = `${t('builder.variant')} ${i+1}` + (i === nextIdx ? ' • ' + t('builder.current') : '');
    } else {
      lbl.textContent = (pl.days && pl.days.length) ? pl.days.map(canonicalLabel).join('·') : `${t('builder.variant')} ${i+1}`;
    }
    b.appendChild(lbl);
    b.classList.toggle('act', i === planIdx);
    // удаление — крестиком на самом варианте: отдельной ссылкой внизу карточки
    // его не искали, а отдельным чипом в ряду он не помещался
    if(!isTop && i === planIdx){
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'pt-x';
      x.innerHTML = icon('close');
      x.title = t('builder.deleteVariantTitle');
      x.dataset.act = 'deleteCurrentPlan';
      b.appendChild(x);
    }
    b.dataset.act = 'selectPlanTab';
    b.dataset.planIdx = String(i);
    box.appendChild(b);
  });
  if(!isTop){
    if(draft.plans.length < 7){
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'plan-tab add';
      add.innerHTML = icon('plus') + t('builder.add');
      add.title = t('builder.addVariant');
      add.dataset.act = 'addPlanVariant';
      box.appendChild(add);
    }
  }
}

export function fillPlanFields(){
  const pl = curPlan();
  $('bRoundRest').value = pl.roundRest;
  setTimeout(syncVolHint, 0);
  const sel = $('bRounds'); sel.innerHTML='';
  for(let i=1;i<=10;i++){
    const o = document.createElement('option');
    o.value=i; o.textContent = i;
    if(i===pl.rounds) o.selected = true;
    sel.appendChild(o);
  }
  renderDays();
  renderExList();
}

export function syncCover(){
  $('bCoverBtn').classList.toggle('act', !!draft.cover);
  $('bCoverNone').classList.toggle('act', !draft.cover);
  $('bCoverPrev').innerHTML = draft.cover ? `<img src="${workoutBuilderHooks.esc(draft.cover)}" alt="">` : '';
}

// дни недели текущего варианта — множественный выбор
// объясняет, как круги и подходы складываются в реальный объём
function syncVolHint(){
  const el = $('bVolHint');
  if(!el) return;
  const pl = curPlan();
  const main = (pl.exercises || []).filter(e => !e.warmup);
  const R = pl.rounds || 1;
  // Раньше здесь приклеивался ярлык — «Круговая», «Силовая», «Смешанная». Откуда он
  // берётся, по экрану понять было нельзя, а человеку это слово ничего не даёт.
  // Говорим то же самое числами: сколько всего подходов выйдет за тренировку.
  if(!main.length){ el.textContent = ''; return; }
  const sets = main.map(e => Math.max(1, parseInt(exP(e).sets) || 1));
  const total = sets.reduce((a, b) => a + b, 0) * R;
  const exText = storeCountText(main.length,'exercise');
  const roundsText = R > 1 ? ' × ' + storeCountText(R,'round') : '';
  const setsText = storeCountText(total,'set');
  el.textContent = t('builder.volumeHint',{exercises:exText,rounds:roundsText,sets:setsText});
}

function renderDays(){
  const rotOn = !!draft.rotate && (draft.plans || []).length > 1;
  // При очереди дни принадлежат программе целиком — им место в верхней карточке,
  // рядом с режимом и общим временем. Иначе дни принадлежат варианту и стоят в его
  // карточке, над кругами и отдыхом того же варианта.
  // Где рисуем чипы: у очереди и у программы с единственным вариантом дни
  // относятся ко всей программе на вид, поэтому стоят в карточке «Когда
  // тренироваться». Карточка с таким названием без дней — а так и было, пока
  // единственный вариант прятал их в «Вариантах тренировки», — бессмысленна.
  // Чьи это дни, не меняется: при очереди — программы, иначе — варианта.
  const one = (draft.plans || []).length <= 1;
  const top = rotOn || one;
  setShown('bDaysFieldTop', top);
  setShown('bDaysField', !top);
  $('bDaysTopHint').textContent = rotOn
    ? t('builder.daysRotateHint')
    : t('builder.daysPlanHint');
  const box = $(top ? 'bDaysTop' : 'bDays'); box.innerHTML='';
  const owner = rotOn ? draft : curPlan();
  if(!Array.isArray(owner.days)) owner.days = [];
  DAYS.forEach(d=>{
    const b = document.createElement('button');
    b.type='button'; b.className='day-chip'; b.textContent = d;
    b.classList.toggle('act', owner.days.includes(d));
    b.dataset.act = 'togglePlanDay';
    b.dataset.day = d;
    b.dataset.owner = rotOn ? 'draft' : 'plan';
    box.appendChild(b);
  });
}

/* ================= РЕДАКТОР ОДНОГО УПРАЖНЕНИЯ =================
   Черновик — копия V2-слота; форма правит prescription АКТИВНОГО этапа (exP(exDraft)).
   Цепочка этапов движения появится в редакторе отдельно (PR 3 плана). */
export let exIdx = -1;      // индекс редактируемого упражнения в текущем варианте
export let exDraft = null;  // копия для правки
export let exIsNew = false; // упражнение только что заведено и в списке его держит сам редактор

// убрать пустышку, заведённую «Добавить упражнение», если её так и не сохранили
export function dropFreshEx(){
  if(!exIsNew) return;
  exIsNew = false;
  try{
    const list = curPlan().exercises;
    if(exIdx >= 0 && list[exIdx]) list.splice(exIdx, 1);
    renderExList();
  }catch(_){}
  exDraft = null; exIdx = -1; exOrig = '';
}

let exOrig = '';
// Этапы движения в редакторе: в черновике currentStageId = РЕДАКТИРУЕМЫЙ этап (так вся
// форма читает exP(exDraft) без второй ветки), настоящий текущий этап хранится здесь
// и возвращается в упражнение при сравнении и сохранении (exerciseEditResult).
let exRealStageId = '';  // снимок упражнения на момент открытия — для проверки изменений
export function openExercise(i, isNew){
  const list = curPlan().exercises;
  exIdx = i;
  exIsNew = !!isNew;
  exDraft = JSON.parse(JSON.stringify(list[i]));
  exRealStageId = exDraft.currentStageId;
  // «отдых после упражнения» на первое открытие равен отдыху между подходами:
  // с этого момента он явный и сохранится тем же числом, даже если его не трогать
  const p = exP(exDraft);
  if(p.restAfter == null) p.restAfter = p.rest;
  fillExercise();
  eventBuilderHooks.buildExMenu();
  // Пока упражнение только ЗАВОДЯТ, дублировать и удалять нечего: в списке оно
  // держится самим редактором и уйдёт само, если уйти без сохранения.
  setShown('exMoreWrap', !exIsNew);
  document.querySelectorAll('#exModeTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
  // Снимок для сравнения снимаем С ФОРМЫ тем же путём, каким потом сравниваем
  // (applyFormTo): иначе типы черновика и формы расходились и «назад» с нетронутого
  // упражнения спрашивало про несохранённые изменения.
  exOrig = JSON.stringify(exerciseEditResult(JSON.parse(JSON.stringify(exDraft))));
  show('scrExercise');
  window.scrollTo(0, 0);
}

function fillExercise(keepOpen){
  const ex = exDraft;
  const p = exP(ex);
  // «тронутые» поля шага и потолка помечаются, чтобы renderProgControls не затирал ввод.
  // При открытии ДРУГОГО упражнения метка сбрасывается, иначе цифры предыдущего уйдут в него.
  ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
  if($('exLoadLevels')) delete $('exLoadLevels').dataset.initialValue;
  $('exName').value = p.name || '';
  $('exValue').value = valueText(p.value).replace('–', '-');
  $('exSets').value = p.sets || 1;
  $('exDesc').value = p.desc || '';
  $('exMistakes').value = p.mistakes || '';
  $('exVideo').value = p.video || '';
  $('exWeight').value = p.load.weight ? fmtKg(p.load.weight) : '';
  fillExerciseProgEveryOptions();
  fillExerciseProgModeOptions();
  $('exProgEvery').value = p.progression.every == null ? '' : String(p.progression.every);
  renderExerciseEquipment();
  renderExerciseLevelControls();
  renderProgControls();
  $('exWarm').classList.toggle('on', !!ex.warmup);
  $('exSide').classList.toggle('on', !!p.perSide);
  syncExType();
  syncExWarm();
  renderExMuscles();
  renderExSupport();
  renderExRestChips();
  renderExMedia();
  syncExDetailsSum();
  renderExerciseStages();
  // переключение этапа перерисовывает форму, но не сворачивает то, где человек работает
  if(keepOpen) return;
  setShown('exChainBox', false);
  $('exChainToggle').classList.remove('open');
  // обе раскрывашки по умолчанию свёрнуты: видно только то, без чего упражнения нет
  setShown('exDetailsBox', false);
  $('exDetailsToggle').classList.remove('open');
  setShown('exProgBox', false);
  $('exProgToggle').classList.remove('open');
  setShown('exLevelScaleBox', false);
}

// Название снаряда для людей: «Другое» показывает своё имя
export function equipmentLabel(id, customName){
  if(id === 'custom') return String(customName || '').trim() || t('equip.custom');
  return id ? t('equip.' + id) : '';
}
// Снаряд нагрузки: выбирается из того же каталога, что и в AI-форме. Список зависит
// от типа нагрузки (гантель не бывает сопротивлением, резинка — весом).
export function renderExerciseEquipment(){
  if(!exDraft) return;
  const load = exP(exDraft).load;
  const active = load.type !== 'none';
  setShown('exEquipRow', active);
  if(!active) return;
  const sel = $('exEquip');
  sel.innerHTML = '';
  FitExerciseV2.EQUIPMENT
    .filter(e => e.roles.includes('load') && e.loadTypes.includes(load.type))
    .forEach(e => {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = equipmentLabel(e.id);
      sel.appendChild(o);
    });
  sel.value = load.equipment || '';
  $('exEquipName').value = load.name || '';
  setShown('exEquipNameField', load.equipment === 'custom');
  $('exEquipCount').value = load.count || 1;
  $('exWeightLabel').textContent = (load.count || 1) > 1 ? t('builder.weightPerUnit') : t('builder.weightKg');
}
// смена снаряда в списке: количество по умолчанию — у самого снаряда
export function setExerciseEquipment(id){
  if(!exDraft) return;
  const load = exP(exDraft).load;
  const eq = FitExerciseV2.equipment(id);
  if(!eq) return;
  load.equipment = eq.id;
  load.count = eq.count;
  if(eq.id !== 'custom') load.name = '';
  renderExerciseEquipment();
  syncExNowHints();
}

// «Как считать» и «Нагрузка» независимы: время/повторы сочетаются с весом,
// сопротивлением или отсутствием внешней нагрузки.
export function renderExerciseLevelControls(){
  if(!exDraft) return;
  const active = progressionLoadType(exDraft) === 'level';
  setShown('exLevelRow', active);
  if(!active) return;
  const load = exP(exDraft).load;
  const levels = exerciseLoadLevels(exDraft);
  const baseLevel = Math.max(0, Math.min(levels.length - 1, Math.round(+load.level || 0)));
  load.level = baseLevel;
  const sel = $('exLoadLevel');
  sel.innerHTML = '';
  levels.forEach((level, index)=>{
    const o = document.createElement('option');
    o.value = String(index);
    o.textContent = loadLevelLabel(level) || t('builder.resistanceLevelFallback',{count:index+1});
    sel.appendChild(o);
  });
  sel.value = String(baseLevel);
  const text = resistanceScaleText(exDraft);
  const field = $('exLoadLevels');
  if(field && !field.dataset.initialValue){
    field.value = text;
    field.dataset.initialValue = text;
  }
}

export function syncExType(){
  const p = exP(exDraft);
  const reps = p.type !== 'time';
  const loadType = p.load.type;
  const withWeight = loadType === 'weight';
  const withLevel = loadType === 'level';
  $('exTypeReps').classList.toggle('act', reps);
  $('exTypeTime').classList.toggle('act', !reps);
  $('exLoadNone').classList.toggle('act', loadType === 'none');
  $('exLoadWeight').classList.toggle('act', withWeight);
  $('exLoadLevelType').classList.toggle('act', withLevel);
  $('exValLabel').textContent = reps ? t('builder.repsLabel') : t('builder.secondsLabel');
  $('exValue').placeholder = reps ? t('builder.repsExample2') : t('builder.secondsExample2');
  if($('exTypeHint')) $('exTypeHint').textContent = t(reps ? 'builder.typeRepsHint' : 'builder.typeTimeHint');
  if($('exLoadHint')){
    $('exLoadHint').textContent = t(withWeight
      ? 'builder.loadHintWeight'
      : withLevel ? 'builder.loadHintLevel' : 'builder.loadHintNone');
  }
  setShown('exWeightRow', withWeight);
  renderExerciseEquipment();
  renderExerciseLevelControls();
  renderProgControls();
}
export function syncExWarm(){
  setShown('exSetsField', true);
}
function renderExMuscles(){
  const box = $('exMuscles'); box.innerHTML = '';
  const p = exP(exDraft);
  if(!Array.isArray(p.muscles)) p.muscles = [];
  MUSCLES.forEach(([id, label])=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = label;
    b.classList.toggle('act', p.muscles.includes(id));
    b.dataset.act = 'toggleExerciseMuscle';
    b.dataset.muscleId = id;
    box.appendChild(b);
  });
}
// Доп. оборудование: на чём выполняется движение (скамья, турник), без нагрузки.
// Своё «Другое» с названием сохраняется как есть, чипы — только каталог.
function renderExSupport(){
  const box = $('exSupport'); if(!box) return;
  box.innerHTML = '';
  const p = exP(exDraft);
  const have = new Set((p.supportEquipment || []).filter(x => typeof x === 'string'));
  FitExerciseV2.equipmentIds('support').filter(id => id !== 'custom').forEach(id => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = equipmentLabel(id);
    b.classList.toggle('act', have.has(id));
    b.dataset.act = 'toggleExerciseSupport';
    b.dataset.equipmentId = id;
    box.appendChild(b);
  });
}

/* ---- этапы движения ---- */
export function exerciseEditResult(target){
  const out = applyFormTo(target);
  if(exRealStageId && (out.stages || []).some(st => st.stageId === exRealStageId)) out.currentStageId = exRealStageId;
  return out;
}
function stageIndex(ex, stageId){ return (ex.stages || []).findIndex(st => st.stageId === stageId); }
function stageTitle(st, i){
  return (st && st.prescription && st.prescription.name || '').trim() || t('builder.stageUnnamed',{n:i + 1});
}
// Чем начнётся этап после перехода: его база (прогресс этапа начинается заново)
export function stageStartText(ex, stageId){
  const st = (ex.stages || [])[stageIndex(ex, stageId)];
  if(!st) return '';
  return exSummary({id:ex.id, warmup:ex.warmup, currentStageId:st.stageId, stages:[st],
    progressState:{count:0, current:emptyProgressCurrent()}});
}
export function renderExerciseStages(){
  if(!exDraft || !$('exChainList')) return;
  const ex = exDraft;
  const stages = ex.stages || [];
  const editIdx = Math.max(0, stageIndex(ex, ex.currentStageId));
  const realIdx = Math.max(0, stageIndex(ex, exRealStageId));
  const box = $('exChainList');
  box.innerHTML = '';
  stages.forEach((st, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'stage-row' + (i === editIdx ? ' act' : '');
    row.dataset.act = 'editExerciseStage';
    row.dataset.stageId = st.stageId;
    const name = document.createElement('b');
    name.textContent = (i + 1) + '. ' + stageTitle(st, i);
    const meta = document.createElement('small');
    const bits = [];
    if(i === realIdx) bits.push(t('builder.stageCurrent'));
    if(i < stages.length - 1) bits.push(t(st.advance && st.advance.mode === 'ceiling' ? 'builder.stageAdvanceCeiling' : 'builder.stageAdvanceManual'));
    meta.textContent = bits.join(' · ');
    row.append(name, meta);
    box.appendChild(row);
  });
  const multi = stages.length > 1;
  const st = stages[editIdx];
  setShown('exStageAdvanceRow', multi && editIdx < stages.length - 1);
  if(st) $('exStageAdvance').value = st.advance && st.advance.mode === 'ceiling' ? 'ceiling' : 'manual';
  setShown('exStageActions', multi);
  setShown('exStageCurrent', multi && editIdx !== realIdx);
  setShown('exStageUp', editIdx > 0);
  setShown('exStageDown', editIdx < stages.length - 1);
  setShown('exStageRemove', multi);
  setShown('exStageAdd', stages.length < FitExerciseV2.MAX_STAGES);
  $('exChainSum').textContent = multi ? t('builder.stageTag',{current:realIdx + 1, count:stages.length}) : '';
}
export function editExerciseStage(stageId){
  if(!exDraft || stageIndex(exDraft, stageId) < 0 || exDraft.currentStageId === stageId) return;
  applyFormTo(exDraft);
  exDraft.currentStageId = stageId;
  fillExercise(true);
}
// Новый этап начинается копией редактируемого: оборудование, подходы и отдых обычно
// те же, а название человек даёт сам — пустое имя не даст сохранить.
export function addExerciseStage(){
  if(!exDraft || exDraft.stages.length >= FitExerciseV2.MAX_STAGES) return;
  applyFormTo(exDraft);
  const i = Math.max(0, stageIndex(exDraft, exDraft.currentStageId));
  const prescription = JSON.parse(JSON.stringify(exDraft.stages[i].prescription));
  prescription.name = '';
  const stageId = newStageId();
  exDraft.stages.splice(i + 1, 0, {stageId, prescription, advance:{mode:'manual'}, mediaRef:null, visualKey:''});
  exDraft.currentStageId = stageId;
  fillExercise(true);
  $('exName').focus();
}
export function moveExerciseStage(dir){
  if(!exDraft) return;
  applyFormTo(exDraft);
  const i = stageIndex(exDraft, exDraft.currentStageId), j = i + dir;
  if(i < 0 || j < 0 || j >= exDraft.stages.length) return;
  const list = exDraft.stages;
  [list[i], list[j]] = [list[j], list[i]];
  renderExerciseStages();
}
export function setExerciseStageAdvance(mode){
  if(!exDraft) return;
  const st = exDraft.stages[stageIndex(exDraft, exDraft.currentStageId)];
  if(st) st.advance = {mode:mode === 'ceiling' ? 'ceiling' : 'manual'};
  renderExerciseStages();
}
export async function removeExerciseStage(){
  if(!exDraft || exDraft.stages.length < 2) return;
  const i = stageIndex(exDraft, exDraft.currentStageId);
  if(i < 0) return;
  applyFormTo(exDraft);
  if(!await appConfirm(t('builder.stageRemoveConfirm',{name:stageTitle(exDraft.stages[i], i)}))) return;
  const removed = exDraft.stages.splice(i, 1)[0];
  const next = exDraft.stages[Math.max(0, i - 1)];
  if(removed.stageId === exRealStageId) exRealStageId = next.stageId;
  exDraft.currentStageId = next.stageId;
  fillExercise(true);
}
// «Перейти сейчас»: и вперёд, и назад. Прогресс этапа начинается с его базы —
// подтверждение показывает, с чего именно.
export async function makeExerciseStageCurrent(){
  if(!exDraft || exDraft.currentStageId === exRealStageId) return;
  applyFormTo(exDraft);
  const i = stageIndex(exDraft, exDraft.currentStageId);
  if(i < 0) return;
  const ok = await appConfirm(t('builder.stageSwitchConfirm',{name:stageTitle(exDraft.stages[i], i),
    start:stageStartText(exDraft, exDraft.currentStageId)}));
  if(!ok) return;
  exRealStageId = exDraft.currentStageId;
  renderExerciseStages();
}

// «12,5» и «12.5» — одинаково допустимый ввод веса
export function parseKg(v){
  const n = parseFloat(String(v || '').replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.round(n * 2) / 2 : 0;
}

// подпись шага и плейсхолдер зависят от текущего формата — одно и то же поле,
// разный смысл: прибавка кг / повторений / секунд. Тумблер «усложнять со временем»
// + поля шага и потолка только для осей выбранного способа.
export function renderProgControls(){
  const hideControls = ()=>{
    ['exProgModeRow','exProgEveryRow','exStepRow','exStepBothHint','exCeilingHint']
      .forEach(id => setShown(id, false));
  };

  if(exDraft.warmup){
    $('exProgOn').classList.remove('on');
    $('exProgOn').classList.add('disabled');
    $('exProgOn').disabled = true;
    $('exProgOnHint').textContent = t('builder.progressWarmupOff');
    hideControls();
    syncExProgSum(); syncExNowHints();
    return;
  }
  $('exProgOn').classList.remove('disabled');
  $('exProgOn').disabled = false;

  const on = progAxis(exDraft) !== 'none';
  const period = exerciseProgEvery(exDraft, draft);
  $('exProgOn').classList.toggle('on', on);
  if(!on){
    $('exProgOnHint').textContent = t('builder.progressOffHint');
    hideControls();
    syncExProgSum(); syncExNowHints();
    return;
  }

  fillExerciseProgModeOptions();
  setShown('exProgModeRow', true);
  setShown('exProgEveryRow', true);
  $('exProgOnHint').textContent = period
    ? t('builder.progressAutoPeriod',{period:progPeriodLabel(period)})
    : t('builder.exerciseProgressionNoFrequencyHint');

  const mode = editorProgressionMode(exDraft);
  if($('exProgModeHint')) $('exProgModeHint').textContent = t(progressionModeHintKey(exDraft, mode));
  const {growReps, growTime, growWeight} = growingInForm(exDraft, mode);

  setShown('exStepRow', growReps || growTime || growWeight);
  setShown('exStepRepsRow', growReps);
  setShown('exStepMaxRepsRow', growReps);
  setShown('exStepWeightRow', growWeight);
  setShown('exStepMaxWeightRow', growWeight);
  setShown('exStepTimeRow', growTime);
  setShown('exStepMaxTimeRow', growTime);
  setShown('exStepBothHint', growReps);
  const ceilingHint = $('exCeilingHint');
  setShown(ceilingHint, growReps || growTime || growWeight);
  if(ceilingHint) ceilingHint.textContent = t(progressionCeilingHintKey(exDraft, mode));

  const pr = exP(exDraft).progression;
  const set = (id, val) => { if(!$(id).dataset.touched) $(id).value = val; };
  if(growReps){
    set('exStepReps', pr.reps.step > 0 ? pr.reps.step : 1);
    set('exMaxReps', pr.reps.max > 0 ? pr.reps.max : '');
  }
  if(growWeight){
    set('exStepWeight', fmtKg(pr.weight.step > 0 ? pr.weight.step : 2));
    set('exMaxWeight', pr.weight.max > 0 ? fmtKg(pr.weight.max) : '');
  }
  if(growTime){
    set('exStepTime', pr.time.step > 0 ? pr.time.step : 5);
    set('exMaxTime', pr.time.max > 0 ? pr.time.max : '');
  }
  syncExProgSum(); syncExNowHints();
}
// какие оси показывает форма при выбранном способе
function growingInForm(ex, mode){
  const isTime = exP(ex).type === 'time';
  return {
    growReps: mode === 'reps' || mode === 'double_range' || (mode === 'parallel' && !isTime) ||
      (mode === 'level' && levelWithReps(ex)),
    growTime: mode === 'time' || (mode === 'parallel' && isTime),
    growWeight: hasWeight(ex) && (mode === 'weight' || mode === 'double_range' || mode === 'parallel')
  };
}

// В полях редактора лежит БАЗА этапа — то, с чего всё начиналось. Сколько человек
// поднимает и делает СЕЙЧАС, считается само: база + подтверждённые повышения +
// ручная правка с тренировки. Считаем по ФОРМЕ (applyFormTo), а не по черновику:
// вписанная только что прибавка должна отражаться в подсказке сразу.
export function syncExNowHints(){
  const el = $('exNowHint');
  const p = (typeof draft !== 'undefined' && draft && draft.id) ? draft : null;
  if(!exDraft || !p || exDraft.warmup){ setShown(el, false); return; }
  let probe;
  try{ probe = applyFormTo(JSON.parse(JSON.stringify(exDraft))); }catch(_){ setShown(el, false); return; }
  const pp = exP(probe);
  const parts = [];
  let loadChanged = false;
  if(hasWeight(probe)){
    const base = progBaseValue(probe, 'weight'), now = getExWeight(p.id, probe, p);
    loadChanged = now > 0 && Math.abs(now - base) > 0.01;
    if(loadChanged) parts.push(exerciseWeightText(probe, now));
  }else if(progressionLoadType(probe) === 'level'){
    const levels = exerciseLoadLevels(probe);
    const baseLevel = Math.max(0, Math.min(Math.max(0, levels.length - 1), Math.round(+pp.load.level || 0)));
    const nowLevel = exerciseLoadLevel(probe);
    loadChanged = nowLevel !== baseLevel;
    if(loadChanged && levels[nowLevel]){
      parts.push(t('builder.nowResistance',{value:loadLevelLabel(levels[nowLevel])}));
    }
  }
  // Если меняется внешняя нагрузка, показываем рядом и «сколько делать», даже когда
  // сама метрика не выросла.
  if(pp.type === 'time'){
    const base = parseValue(pp.value).min, now = getExProgValue(p.id, probe, p, 'time');
    if(now !== base || loadChanged) parts.push(`${now} ${t('store.secShort')}`);
  } else {
    const base = valueText(pp.value), now = progressedRepsRange(p.id, probe, p).replace('-', '–');
    if(now !== base || loadChanged) parts.push(`${now} ${t('store.repShort')}`);
  }
  if(!parts.length){ setShown(el, false); return; }
  // «повт.» уже заканчивается точкой — не дублируем её точкой предложения
  let sentence = t('builder.nowPrefix',{parts:parts.join(', ')});
  if(sentence.endsWith('.')) sentence = sentence.slice(0, -1);
  el.textContent = sentence + '. ' + t('builder.startValuesHint');
  setShown(el, true);
}
// «2 × 10 кг» или «10 кг»: вес всегда на одну единицу, количество показываем явно
export function exerciseWeightText(ex, kg){
  const count = Math.max(1, Math.round(+exP(ex).load.count || 1));
  const w = `${fmtKg(kg)} ${t('progress.kg')}`;
  return count > 1 ? `${count} × ${w}` : w;
}

// Сводка в заголовке свёрнутого блока: человек должен понимать, что внутри, не открывая его.
export function syncExProgSum(){
  if(exDraft.warmup){ $('exProgSum').textContent = t('builder.warmupNoGrowth'); return; }
  if(progAxis(exDraft) === 'none'){ $('exProgSum').textContent = t('builder.noGrowth'); return; }

  const mode = editorProgressionMode(exDraft);
  const modeText = progressionModeLabel(exDraft, mode);
  const rawEvery = $('exProgEvery') ? $('exProgEvery').value : '';
  const effectiveEvery = rawEvery === ''
    ? programProgEvery(draft && draft.progression)
    : Math.max(0, +rawEvery || 0);

  let frequencyText;
  if(rawEvery === ''){
    frequencyText = effectiveEvery > 0
      ? t('builder.progressionProgramFrequencyShort',{count:effectiveEvery})
      : t('builder.progressionProgramFrequencyMissing');
  }else{
    frequencyText = progPeriodLabel(effectiveEvery);
  }
  $('exProgSum').textContent = modeText + ' · ' + frequencyText;
}

// Одно значение — один видимый контрол: свой отдых вводится в попапе #restModal,
// в самом экране — только чипы. Два независимых ряда — «между подходами» и «после
// упражнения»; какой ряд сейчас редактируют, помнит restModalKey.
const REST_CHIPS = [0, 15, 30, 45, 60];
const restCustom = {rest: false, restAfter: false};
function renderRestChipsInto(boxId, key){
  const cur = parseInt(exP(exDraft)[key]) || 0;
  if(!REST_CHIPS.includes(cur)) restCustom[key] = true;
  const box = $(boxId); box.innerHTML = '';
  REST_CHIPS.forEach(v=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'load-chip';
    b.textContent = v === 0 ? t('builder.none') : String(v);
    b.classList.toggle('act', !restCustom[key] && cur === v);
    b.dataset.act = 'setExerciseRest';
    b.dataset.restKey = key;
    b.dataset.boxId = boxId;
    b.dataset.restValue = String(v);
    box.appendChild(b);
  });
  const own = document.createElement('button');
  own.type = 'button'; own.className = 'load-chip';
  own.textContent = restCustom[key] ? String(cur) : t('builder.custom');
  own.classList.toggle('act', restCustom[key]);
  own.dataset.act = 'openCustomRest';
  own.dataset.restKey = key;
  own.dataset.boxId = boxId;
  box.appendChild(own);
}
function renderExRestChips(){
  renderRestChipsInto('exRestChips', 'rest');
  renderRestChipsInto('exRestAfterChips', 'restAfter');
}
let restModalKey = null, restModalBoxId = null;
function openRestModal(key, boxId){
  restModalKey = key; restModalBoxId = boxId;
  $('restModalTitle').textContent = key === 'rest' ? t('builder.customRestSets') : t('builder.customRestAfter');
  $('restModalInput').value = parseInt(exP(exDraft)[key]) || '';
  $('restModal').classList.add('open');
  $('restModalInput').focus();
}
export function renderExMedia(){
  const box = $('exMediaPrev');
  const m = exDraft.media;
  if(m && m.kind === 'img') box.innerHTML = `<img src="${workoutBuilderHooks.esc(m.data)}" alt="">`;
  else box.innerHTML = `<span class="mp-empty">${workoutBuilderHooks.esc(t('builder.noImage'))}</span>`;
}
export function syncExDetailsSum(){
  const p = exP(exDraft);
  const bits = [];
  if((p.desc || '').trim()) bits.push(t('builder.detailDescription'));
  if((p.mistakes || '').trim()) bits.push(t('builder.detailMistakes'));
  if((p.muscles || []).length) bits.push(t('builder.detailMuscles'));
  if(exDraft.media) bits.push(t('builder.detailImage'));
  if((p.video || '').trim()) bits.push(t('builder.detailVideo'));
  $('exDetailsSum').textContent = bits.length ? bits.join(', ') : t('builder.notFilled');
}

// переносит текущее состояние формы в слот (черновик или его снимок) —
// общая логика для exDirty (сравнение) и commitExercise (сохранение)
function applyFormTo(target){
  const p = exP(target);
  p.name = $('exName').value.trim();
  p.value = normValue($('exValue').value, p.type);
  p.sets = target.warmup ? 1 : Math.max(1, Math.min(10, parseInt($('exSets').value) || 1));
  // rest/restAfter/perSide/мышцы пишут сами чипы и тумблеры прямо в черновик
  p.desc = $('exDesc').value.trim();
  p.mistakes = $('exMistakes').value.trim();
  p.video = $('exVideo').value.trim();
  const load = p.load;
  if(load.type === 'none'){
    load.equipment = null; load.name = ''; load.count = 1; load.weight = 0;
  } else {
    if($('exEquip') && $('exEquip').value) load.equipment = $('exEquip').value;
    load.name = load.equipment === 'custom' ? $('exEquipName').value.trim().slice(0, 40) : '';
    load.count = Math.max(1, Math.min(20, parseInt($('exEquipCount').value) || 1));
  }
  load.weight = load.type === 'weight' ? parseKg($('exWeight').value) : 0;
  if(load.type === 'level'){
    load.levels = cleanLoadLevels(load.levels, true);
    const selectedLevel = $('exLoadLevel') ? Math.round(+$('exLoadLevel').value || 0) : (+load.level || 0);
    load.level = Math.max(0, Math.min(load.levels.length - 1, selectedLevel));
  }
  const pr = p.progression;
  const rawProgEvery = $('exProgEvery') ? $('exProgEvery').value : '';
  pr.every = rawProgEvery === '' ? null : Math.max(1, Math.min(PROG_EVERY_MAX, Math.round(+rawProgEvery || 1)));
  // Читаем только оси выбранного способа: скрытая ось не растёт, её потолок
  // сохраняем — при переключении способа туда-обратно настройка не теряется.
  if(pr.mode !== 'none' && !target.warmup){
    const num = (id, def, round) => {
      const n = parseStepNum($(id).value);
      return n != null ? round(n) : def;
    };
    const mode = editorProgressionMode(target);
    pr.mode = mode;
    const {growReps, growTime, growWeight} = growingInForm(target, mode);
    const positive = v => v > 0 ? v : null;
    if(p.type !== 'time'){
      pr.reps.step = growReps ? positive(num('exStepReps', 1, Math.round)) : null;
      if(growReps) pr.reps.max = positive(num('exMaxReps', 0, Math.round));
    }
    if(hasWeight(target)){
      pr.weight.step = growWeight ? positive(num('exStepWeight', 2, v => Math.round(v * 2) / 2)) : null;
      if(growWeight) pr.weight.max = positive(num('exMaxWeight', 0, v => Math.round(v * 2) / 2));
    }
    if(p.type === 'time'){
      pr.time.step = growTime ? positive(num('exStepTime', 5, Math.round)) : null;
      if(growTime) pr.time.max = positive(num('exMaxTime', 0, Math.round));
    }
  }
  return target;
}

// есть ли несохранённые правки
export function exDirty(){
  if(!exDraft || exIdx < 0) return false;
  if(progressionLoadType(exDraft) === 'level' && $('exLoadLevels')){
    const raw = $('exLoadLevels').value.trim();
    const initial = String($('exLoadLevels').dataset.initialValue || '').trim();
    if(raw !== initial) return true;
  }
  const snapshot = exerciseEditResult(JSON.parse(JSON.stringify(exDraft)));
  return JSON.stringify(snapshot) !== exOrig;
}

export function commitExercise(){
  const old = (curPlan().exercises || [])[exIdx];
  const upd = exerciseEditResult(exDraft);
  if(old && old.currentStageId !== upd.currentStageId) upd.media = null;
  return old ? carryExerciseProgress(old, upd) : upd;
}
// Строгая проверка перед сохранением: весовая/сопротивляющая нагрузка без снаряда,
// «Другое» без названия, вес 0 — это неполное упражнение, а не повод молча что-то угадать.
// Возвращает человеческий текст проблем или пустую строку.
export function exerciseDraftProblems(){
  if(!exDraft) return '';
  let probe;
  try{ probe = exerciseEditResult(JSON.parse(JSON.stringify(exDraft))); }catch(_){ return ''; }
  const errors = exerciseErrors(probe);
  const out = [];
  const add = key => { const txt = t(key); if(!out.includes(txt)) out.push(txt); };
  errors.forEach(e => {
    if(/name_required/.test(e) && !/custom_name/.test(e)) add('builder.problemName');
    else if(/equipment_required|equipment_not_load|equipment_type_mismatch/.test(e)) add('builder.problemEquipment');
    else if(/custom_name_required/.test(e)) add('builder.problemEquipmentName');
    else if(/weight_required/.test(e)) add('builder.problemWeight');
  });
  return out.length ? t('builder.exerciseInvalid',{problems:out.join(', ')}) : '';
}

// Разминка выполняется один раз ДО кругов, где бы она ни лежала в списке
// (см. buildSteps: warmEx идут первыми). Значит и список обязан показывать
// порядок выполнения — иначе перетаскивание разминки вниз «получалось», но на
// тренировке ничего не менялось, и номера строк врали.
export function sortWarmFirst(list){
  const w = list.filter(e => e.warmup), m = list.filter(e => !e.warmup);
  if(!w.length || !m.length) return list;
  list.length = 0;
  list.push(...w, ...m);
  return list;
}
export function renderExList(){
  const box = $('bExList'); box.innerHTML = '';
  const list = sortWarmFirst(curPlan().exercises);
  if(!list.length){
    box.innerHTML = '<div class="empty-state">' +
      `<span class="es-ico">${icon('dumbbell')}</span>` +
      `<b>${workoutBuilderHooks.esc(t('builder.noExercisesTitle'))}</b>` +
      `<p>${workoutBuilderHooks.esc(t('builder.noExercisesText'))}</p>` +
      '</div>';
  }
  list.forEach((ex, i)=> box.appendChild(exRow(ex, i)));
  syncVolHint();
  const nWarm = list.filter(e => e.warmup).length;
  const nMain = list.length - nWarm;
  const full = nWarm >= MAX_WARM && nMain >= MAX_MAIN;
  setShown('btnAddEx', !full);
  const note = list.length ? storeCountText(list.length,'exercise') : '';
  $('exCountNote').textContent = note;
  eventBuilderHooks.syncImagesSum();
  // объясняем, к чему относится список упражнений
  const plans = draft.plans || [];
  const pl = curPlan();
  const titleEl = $('bVariantTitle'), h = $('bVariantHint');
  if(plans.length > 1){
    const rot = !!draft.rotate;
    const days = (pl.days || []).length ? pl.days.map(canonicalLabel).join(', ') : '';
    titleEl.textContent = t('builder.variantExercises',{current:planIdx+1,total:plans.length});
    h.textContent = rot
      ? t('builder.variantExercisesHint')
      : (days
          ? t('builder.variantOnDays',{days})
          : t('builder.variantNoDays'));
    setShown(h, true);
  } else {
    titleEl.textContent = t('builder.exercisesTitle');
    const d1 = (pl.days || []).length ? pl.days.map(canonicalLabel).join(', ') : '';
    h.textContent = d1
      ? t('builder.scheduleExercises',{days:d1})
      : t('builder.anyDayExercises');
    setShown(h, true);
  }
}

// объём упражнения разложен по кускам: в строке списка каждый кусок — отдельная
// метка (и они переносятся), в тексте — те же куски через точку
function exBits(ex){
  const bits = [];
  // Показываем РАБОЧИЕ числа — те, что будут на ближайшей тренировке, а не базу
  // из полей редактора. Программу с «ВЕС: 12» и тремя пройденными повышениями
  // список упрямо показывал двенадцатью килограммами, и прогрессия выглядела
  // сломанной. Раньше вес считался без программы (getExWeight без третьего
  // аргумента), а значит без её шагов — то есть всегда по базе.
  const p = (typeof draft !== 'undefined' && draft && draft.id) ? draft : null;
  const pr = exP(ex);
  bits.push(pr.type === 'time'
    ? `${p ? getExProgValue(p.id, ex, p, 'time') : parseValue(pr.value).min} ${t('store.secShort')}`
    : `${(p ? progressedRepsRange(p.id, ex, p) : valueText(pr.value)).replace('-', '–')} ${t('store.repShort')}`);
  const sets = Math.max(1, parseInt(pr.sets) || 1);
  if(sets > 1) bits.push(storeCountText(sets,'set'));
  if(hasWeight(ex)){
    const w = p ? getExWeight(p.id, ex, p) : (+pr.load.weight || 0);
    if(w) bits.push(exerciseWeightText(ex, w));
  }
  if(progressionLoadType(ex) === 'level'){
    const level = exerciseLoadLevelState(ex);
    if(level && level.label) bits.push(level.label);
  }
  if(pr.perSide) bits.push(t('store.perSide'));
  if(+pr.rest > 0) bits.push(`${t('workout.rest')} ${pr.rest} ${t('store.secShort')}`);
  return bits;
}
export function exSummary(ex){ return exBits(ex).join(' · '); }

// Номер считаем только по основным упражнениям: разминка идёт один раз до кругов,
// где бы она ни лежала в списке, и сквозная нумерация врала бы о порядке.
function exThumb(ex, i){
  if(ex.media && ex.media.kind === 'img') return `<img src="${workoutBuilderHooks.esc(ex.media.data)}" alt="">`;
  if(ex.warmup) return icon('flame');
  const before = curPlan().exercises.slice(0, i).filter(e => !e.warmup).length;
  return String(before + 1);
}

// Дублирование и удаление ПРЯМО ИЗ СПИСКА: те же действия есть и в редакторе, но
// ради них не должно быть нужно открывать упражнение.
export function dupExerciseAt(i){
  const list = curPlan().exercises;
  const ex = list[i];
  if(!ex) return;
  const nWarm = list.filter(x => x.warmup).length;
  if(ex.warmup ? nWarm >= MAX_WARM : list.length - nWarm >= MAX_MAIN){
    appAlert(ex.warmup
      ? t('builder.warmLimit',{count:MAX_WARM})
      : t('builder.mainLimit',{count:MAX_MAIN}));
    return;
  }
  list.splice(i + 1, 0, cloneExerciseAsNew(ex));
  renderExList();
}
export async function delExerciseAt(i){
  const list = curPlan().exercises;
  const ex = list[i];
  if(!ex) return;
  const nameTxt = (exP(ex).name || '').trim() || t('exercise.this');
  if(!(await appDialog(t('exercise.deleteQuestion',{name:nameTxt}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  list.splice(i, 1);
  renderExList();
}

function exRow(ex, i){
  const row = document.createElement('div');
  row.className = 'ex-row' + (ex.warmup ? ' warm' : '');
  row.dataset.idx = String(i);

  const thumb = document.createElement('div');
  thumb.className = 'ex-thumb';
  thumb.innerHTML = exThumb(ex, i);

  const info = document.createElement('div');
  info.className = 'ex-info';
  const name = document.createElement('b');
  name.textContent = (exP(ex).name || '').trim() || t('store.untitled');
  const meta = document.createElement('div');
  meta.className = 'ex-meta';
  const tag = (txt, cls) => {
    const el = document.createElement('span');
    if(cls) el.className = cls;
    el.textContent = txt;
    meta.appendChild(el);
  };
  if(ex.warmup) tag(t('store.warmup'), 'wm');
  if((ex.stages || []).length > 1){
    const cur = ex.stages.findIndex(st => st.stageId === ex.currentStageId);
    tag(t('builder.stageTag',{current:cur + 1, count:ex.stages.length}));
  }
  exBits(ex).forEach(txt => tag(txt));
  const grow = progShort(ex);
  if(grow) tag(grow, 'grow');
  info.append(name, meta);

  // Справа всё как у карточки программы: «⋮» сверху, ручка перетаскивания снизу.
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'more-btn';
  more.innerHTML = icon('more');
  more.title = t('common.actions');
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  const item = (html, action, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    if(cls) b.className = cls;
    b.innerHTML = html;
    b.dataset.act = action;
    b.dataset.exerciseIdx = String(i);
    menu.appendChild(b);
  };
  item(icon('plus') + t('common.duplicate'), 'duplicateExerciseAt');
  item(icon('trash') + t('common.delete'), 'deleteExerciseAt', 'danger');
  more.dataset.act = 'toggleExerciseRowMenu';
  more.dataset.exerciseIdx = String(i);

  const grip = document.createElement('div');
  grip.className = 'ex-grip';
  grip.innerHTML = icon('grip');
  grip.title = t('programs.drag');

  row.append(thumb, info, more, grip, menu);
  // Нажатие на саму строку открывает редактор; перетаскивание начинается только
  // с ручки и клика по строке не даёт.
  row.dataset.act = 'openExerciseRow';
  row.dataset.exerciseIdx = String(i);

  enableDrag(row, grip, '.ex-row', nodes => {
    const order = nodes.map(n => +n.dataset.idx);
    const arr = curPlan().exercises;
    curPlan().exercises = order.map(idx => arr[idx]);
    renderExList();   // sortWarmFirst внутри вернёт разминку наверх
  });
  return row;
}

// уменьшаем фото до 640px по большей стороне, чтобы программа занимала мало места
export function shrinkImage(file, maxSide, cb){
  const img = new Image();
  img.onload = ()=>{
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL('image/jpeg', .8));
    URL.revokeObjectURL(img.src);
  };
  img.onerror = ()=> appAlert(t('builder.imageReadFailed'));
  img.src = URL.createObjectURL(file);
}

/* ================= СОЗДАНИЕ ИЗ ТЕКСТА ================= */

// В отличие от parseKg (там 0 бессмысленный стартовый вес — трактуем как «не задано»),
// здесь 0 — ЗНАЧИМОЕ значение: «эту ось для этого упражнения не растим». Отличаем
// «не указано вовсе» (возвращаем null, пусть вызывающий код подставит дефолт оси)
// от «явно указано 0» — иначе классическая ошибка JS (0 || default) тихо портит логику.
export function parseStepNum(v){
  if(v == null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : null;
}

const DAY_ALIASES = {
  'пн':'Пн','понедельник':'Пн','вт':'Вт','вторник':'Вт','ср':'Ср','среда':'Ср',
  'чт':'Чт','четверг':'Чт','пт':'Пт','пятница':'Пт','сб':'Сб','суббота':'Сб',
  'вс':'Вс','воскресенье':'Вс'
};

/* Старый строковый протокол «ПРОГРАММА:/УПРАЖНЕНИЕ:…» больше не превращается в
   программу: модель упражнения теперь V2 (снаряд, количество, этапы движения), а
   строки протокола её не описывают. Все пути, которые сохраняли такой текст как
   программу (ИИ, вставка ответа, каталог, видео), временно отключены до AI Contract V2 —
   docs/load-equipment-progression-plan-2026-10-08.md, PR 5. Заглушка отвечает честной
   ошибкой, чтобы случайный вызов не записал в хранилище старую форму упражнения. */

/* ================= ЗАПРОС К ИИ В ОДНО КАСАНИЕ ================= */
// Отметка «Беременность» уходит в запрос к нейросети как обычное ограничение, а
// нейросеть не знает ни срока, ни самочувствия. Один раз на выбор показываем это
// прямым текстом и даём ход к разделу «Здоровье и безопасность».
async function pregnancyWarning(){
  const go = await appDialog(
    t('pregnancy.warning'),
    {confirm:true,okText:t('common.ok'),cancelText:t('common.details')}
  );
  if(!go) eventBuilderHooks.openLegal('health', ()=> goBackTo('scrAI'));
}

const Q_OPTS = {
  goal: OPT_GOAL,
  level: OPT_LEVEL,
  dur: ['5 мин', '10 мин', '15 мин', '20 мин', '30 мин', '40 мин', '45+ мин'],
  // мышцы — строгий список MUSCLES: его же понимает парсер и просит промт
  focus: MUSCLES.map(m => m[1]),
  equip: OPT_EQUIP,
  limit: ['Без ограничений', 'Без прыжков', 'Тихо (соседи снизу)', 'Берегу колени', 'Берегу поясницу', 'Берегу запястья', 'Берегу шею', 'Беременность'],
  style: ['Круговая', 'Силовая', 'Смешанная'],
  warm: ['С разминкой', 'Без разминки']
};
// Дефолты интерфейса не считаются осмысленным запросом пользователя: они лишь
// дают ИИ безопасную отправную точку. Длительность обязательна и не может быть снята.
const AI_DEFAULT_LEVEL = 'Новичок';
const AI_DEFAULT_DURATION = '10 мин';
const AI_DEFAULT_LIMITS = ['Без ограничений'];
const AI_CONTEXT_MAX = 3000;
const q = {goal: [], level: AI_DEFAULT_LEVEL, days: [], dur: AI_DEFAULT_DURATION, focus: [], equip: [], limit: AI_DEFAULT_LIMITS.slice(),
           note: '', split: false, style: '', warm: '', rotate: false};
const qChipConfigs = new Map();
const qCardConfigs = new Map();

export function qChips(boxId, opts, isMulti, get, set, requiredSingle = false){
  qChipConfigs.set(boxId, {opts, isMulti, get, set, requiredSingle});
  const box = $(boxId); box.innerHTML = '';
  opts.forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = canonicalLabel(o);
    const sel = get();
    b.classList.toggle('act', isMulti ? sel.includes(o) : sel === o);
    b.dataset.act = 'toggleAiChip';
    b.dataset.boxId = boxId;
    b.dataset.value = o;
    box.appendChild(b);
  });
}

// варианты, разницу между которыми по одному слову не понять: показываем описанием,
// а не мелкой подсказкой под рядом одинаковых чипов
const Q_DESC = {
  'Круговая': 'Проходишь весь список по разу и возвращаешься к началу: A, B, C → A, B, C. Пульс выше, скучать некогда.',
  'Силовая': 'Сначала все подходы одного упражнения, потом следующее: A, A, A → B, B, B. Мышца устаёт сильнее.',
  'Смешанная': 'Несколько упражнений идут блоком, и этот блок повторяется кругами.',
  'С разминкой': 'Пара лёгких упражнений в начале — один раз, до кругов.',
  'Без разминки': 'Сразу к основной части: если разминка уже сделана или это продолжение другой тренировки.'
};
// выбор одного варианта с пояснением; повторное нажатие снимает выбор
function qCards(boxId, opts, get, set){
  qCardConfigs.set(boxId, {opts, get, set});
  const box = $(boxId); box.innerHTML = '';
  opts.forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt-card';
    b.classList.toggle('act', get() === o);
    b.innerHTML = `<span class="oc-mark">${icon('check')}</span><span class="oc-txt"><b></b><small></small></span>`;
    b.querySelector('b').textContent = canonicalLabel(o);
    b.querySelector('small').textContent = canonicalDescription(o) || Q_DESC[o] || '';
    b.dataset.act = 'toggleAiCard';
    b.dataset.boxId = boxId;
    b.dataset.value = o;
    box.appendChild(b);
  });
}

export function initAIForm(){
  requireWho('ai', ()=> goTab('scrPrograms'));   // данные уходят прямо в запрос (userForAI)
  qChips('qGoal', Q_OPTS.goal, true, ()=> q.goal, v => q.goal = v);
  qCards('qStyle', Q_OPTS.style, ()=> q.style, v => q.style = v);
  qCards('qWarm', Q_OPTS.warm, ()=> q.warm, v => q.warm = v);
  qChips('qLevel', Q_OPTS.level, false, ()=> q.level, v => q.level = v);
  qChips('qDur', Q_OPTS.dur, false, ()=> q.dur, v => q.dur = v, true);
  qChips('qFocus', Q_OPTS.focus, true, ()=> q.focus, v => q.focus = v);
  qChips('qEquip', Q_OPTS.equip, true, ()=> q.equip, v => q.equip = v);
  // «Беременность» — не обычное ограничение: при выборе показываем предупреждение,
  // при снятии — молчим
  qChips('qLimit', Q_OPTS.limit, true, ()=> q.limit, v => {
    const added = v.includes('Беременность') && !q.limit.includes('Беременность');
    q.limit = v;
    if(added) pregnancyWarning();
  });
  const db = $('qDays'); db.innerHTML = '';
  DAYS.forEach(d => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = canonicalLabel(d);
    b.classList.toggle('act', q.days.includes(d));
    b.dataset.act = 'toggleAiDay';
    b.dataset.day = d;
    db.appendChild(b);
  });
  $('qSplit').classList.toggle('on', q.split);
  $('qRotate').classList.toggle('on', q.rotate);
  setShown('qRotateRow', q.split);
  $('qNote').value = q.note || '';
  workoutBuilderHooks.autoGrow($('qContext'));
  if(aiWaysReset.scrAI) aiWaysReset.scrAI();
}

function aiChoiceEnglish(v){
  const map = {
    'Новичок':'beginner', 'Средний':'intermediate', 'Продвинутый':'advanced',
    'Круговая':'circuit', 'Силовая':'strength', 'Смешанная':'mixed',
    'С разминкой':'with warm-up', 'Без разминки':'without warm-up',
    'Без ограничений':'no stated limitations', 'Без прыжков':'no jumping',
    'Тихо (соседи снизу)':'quiet / low-impact for downstairs neighbors',
    'Берегу колени':'protect knees', 'Берегу поясницу':'protect lower back',
    'Берегу запястья':'protect wrists', 'Берегу шею':'protect neck',
    'Беременность':'pregnancy'
  };
  return map[v] || String(v || '');
}
function aiListEnglish(arr){
  return (arr || []).map(aiChoiceEnglish).join(', ');
}

function aiProgramHasUserInput(){
  const context = clampText((($('qContext') && $('qContext').value) || ''), AI_CONTEXT_MAX).trim();
  const realLimits = (q.limit || []).filter(x => x && !AI_DEFAULT_LIMITS.includes(x));
  return !!(
    (q.goal && q.goal.length) ||
    (q.days && q.days.length) ||
    (q.focus && q.focus.length) ||
    (q.equip && q.equip.length) ||
    realLimits.length ||
    (q.level && q.level !== AI_DEFAULT_LEVEL) ||
    q.style || q.warm || q.split ||
    (q.note && q.note.trim()) ||
    context
  );
}

export function aiCreateProgramGuard(){
  if(aiProgramHasUserInput()) return true;
  appAlert(t('ai.needProgramInput'));
  return false;
}

function aiDurationEnglish(value){
  const raw = String(value || '').trim();
  const minutes = parseInt(raw, 10);
  if(!minutes) return raw;
  return raw.includes('+') ? `${minutes} minutes or longer` : `about ${minutes} minutes`;
}

function composeRequest(){
  const parts = [];
  const free = [];

  if(q.goal.length) parts.push(`Goal: ${aiListEnglish(q.goal)}.`);
  else free.push('goal');

  if(q.level && q.level !== AI_DEFAULT_LEVEL) parts.push(`Explicitly selected level: ${aiChoiceEnglish(q.level)}.`);
  else parts.push('Fitness level: infer from authoritative self-reported context and recorded training history when available; if neither gives useful evidence, use a conservative beginner baseline.');

  if(q.days.length) parts.push(`Training weekdays: ${FitAIContract.daysToKeys(q.days).join(', ')}.`);
  else free.push('training days and weekly frequency');

  if(q.dur) parts.push(`Target duration: ${aiDurationEnglish(q.dur)}.`);
  else free.push('workout duration');

  if(q.focus.length) parts.push(`Extra focus: ${aiListEnglish(q.focus)}.`);

  if(!q.equip.length) free.push('equipment; assume a normal home setting if unspecified');
  else if(q.equip.includes('Без инвентаря') && q.equip.length === 1) parts.push('No equipment.');

  if(q.limit.length) parts.push(`Limitations/preferences: ${aiListEnglish(q.limit)}.`);

  if(q.style === 'Круговая'){
    parts.push('Structure: circuit. Repeat the whole exercise list: rounds 2-5 and usually sets 1.');
  } else if(q.style === 'Силовая'){
    parts.push('Structure: strength. Complete all sets of one exercise before moving on: rounds 1 and usually sets 3-4.');
  } else if(q.style === 'Смешанная'){
    parts.push('Structure: mixed. A block with multiple sets repeats for multiple rounds: usually rounds 2-3 and sets 2-3, keeping total volume sensible.');
  } else {
    free.push('workout structure: circuit, strength, or mixed');
  }

  if(q.warm === 'С разминкой'){
    parts.push('Include warm-up exercises (warmup true) at the beginning.');
  } else if(q.warm === 'Без разминки'){
    parts.push('Do not add warm-up exercises.');
  } else {
    free.push('whether a warm-up is needed and how long it should be');
  }

  if(q.split){
    parts.push('Use different exercise sets on different workout days, split logically by muscle groups or training focus.');
    if(q.rotate) parts.push('Use rotate true: plans alternate, plan days stay empty, the shared schedule goes to rotateDays.');
    else parts.push('Use rotate false and assign weekdays to each plan.');
  } else {
    free.push('whether to split into different day variants or keep one repeating workout');
  }

  let out = 'Build a home-workout program. ' + userForAI() + ' ' + parts.join(' ');
  if(free.length) out += ` Decide these unspecified items yourself using sensible training logic: ${free.join('; ')}.`;
  const context = clampText(($('qContext') && $('qContext').value) || '', AI_CONTEXT_MAX).trim();
  if(context){
    out += ` USER CAPABILITIES / LIMITATIONS CONTEXT: ${context}. Treat this as authoritative self-reported context for exercise selection, starting load, volume, range of motion, impact and progression. Known numeric performance and working-load data are evidence: preserve/reuse them for the same movement and use them to choose conservative positive loads for comparable movements instead of a zero weight. Do not diagnose from it. If it describes an injury, pain, or other health limitation, avoid choices that clearly conflict with it and do not claim medical clearance.`;
  }
  if(q.note && q.note.trim()) out += ` Additional user request: ${q.note.trim()}`;
  return out.trim();
}
/* ---- AI Contract V2 на клиенте ----
   Встроенный ИИ получает только структурированный input (prompt собирает сервер),
   ручной режим «скопировать в чат» — тот же prompt + схему текстом. Ответ в обоих
   случаях — JSON, разбирается здесь одной функцией. */
// Чипы инвентаря в форме ИИ → каталог снарядов и доп. оборудования
const AI_EQUIP_IDS = {'Коврик':'mat', 'Гантели':'dumbbell', 'Резинки':'band', 'Стул':'chair', 'Фитбол':'fitball',
  'Утяжелители':'ankle_weight', 'Турник':'pullup_bar'};
export function aiEquipmentInput(labels){
  const idsList = (labels || []).map(x => AI_EQUIP_IDS[x]).filter(Boolean);
  return {
    availableLoadEquipment:idsList.filter(id => FitExerciseV2.equipment(id).roles.includes('load')),
    availableSupportEquipment:idsList.filter(id => FitExerciseV2.equipment(id).roles.includes('support'))
  };
}
export function aiLanguage(locale){
  const outLocale = (locale === 'ru' || locale === 'en') ? locale : appLocale;
  return outLocale === 'ru' ? 'Russian' : 'English';
}
export function contractIds(prefix){
  return prefix === 'e' ? newExId() : prefix === 'mv' ? newStageId() : newPlanId();
}
// Текст ответа (из чата или от сервера) → проверенный JSON. Ошибки — человеческим списком путей.
export function parseContractAnswer(kind, raw, input){
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if(fence) s = fence[1].trim();
  else if(s.indexOf('{') > 0) s = s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1);
  let json;
  try{ json = JSON.parse(s); }catch(_){ return {json:null, errors:[t('ai.notJson')]}; }
  const verdict = FitAIContract.checkOutput(kind, json, input || {});
  return verdict.ok ? {json, errors:[]} : {json:null, errors:(verdict.missing.length ? verdict.missing : [verdict.reason]).slice(0, 8)};
}
export function aiCreateInput(){
  return FitAIContract.normalizeInput('program.create', Object.assign({
    language:aiLanguage(),
    task:composeRequest(),  // composeRequest уже включает контекст возможностей/ограничений
    scheduleDays:FitAIContract.daysToKeys(q.days),
    splitByDays:!!q.split && !q.rotate && q.days.length >= 2
  }, aiEquipmentInput(q.equip))).input;
}
export const fullAIPrompt = ()=> FitAIContract.manualPrompt('program.create', aiCreateInput());

// отправка: системное меню «Поделиться» само покажет ChatGPT/Gemini/Claude — нам не нужно знать, что установлено
export async function copyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(fullAIPrompt());
    flashDone(btn);
  }catch(e){
    appAlert(t('common.copyManual'), {code: fullAIPrompt()});
  }
}

// Два повторяемых сообщения — одна формулировка на всё приложение. Слово «чат»
// объясняется («чат с нейросетью — ChatGPT, Gemini и т.п.»), а формулировка
// подсказывает и лёгкий путь («за меня»), и что именно делать («вставь ответ
// целиком»).
export const MSG_AI_EMPTY = ()=> t('ai.emptyAnswer');
export const MSG_AI_PARSE = ()=> t('ai.parseProgramFailed');
export const MSG_AI_NOEX = ()=> t('ai.noExerciseResponse');

export function importFromText(){
  const txt = ($('aiResult').value || '').trim();
  if(!txt){ appAlert(t('ai.pasteProgram')); return; }
  const parsed = parseContractAnswer('program.create', txt);
  const built = parsed.json ? FitAIContract.programFromCreate(parsed.json, contractIds) : null;
  const errors = parsed.json ? built.errors : parsed.errors;
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('ai.problemList') + '\n— ' + errors.join('\n— '));
    return;
  }
  // id и служебные поля новой программы выдаёт приложение, как у «Новая программа» вручную
  const program = sanitizeProgram(Object.assign({id:'p' + Date.now(), time:'', cover:null}, built.program));
  // открываем распознанное в конструкторе — можно проверить, поправить и сохранить
  draft = program;
  planIdx = 0;
  if($('qContext')) $('qContext').value = '';
  fillBuilder(t('ai.reviewSave'));
}

export async function saveProgram(){
  commitPlanFields();
  draft.name = clampLine($('bName').value, LIM.progName);
  draft.desc = clampText($('bDesc').value, LIM.progDesc);
  draft.time = $('bTime').value || '';
  // ротация имеет смысл только при нескольких вариантах
  if((draft.plans || []).length < 2) draft.rotate = false;
  if(!draft.rotate){ delete draft.rotIdx; delete draft.days; }
  else if(!Array.isArray(draft.days)) draft.days = [];
  draft.progression = programProgEvery($('bProgEvery').value);
  // progLast — метка календарной прогрессии, от которой отказались. Если её проставить
  // здесь, миграция applyProgressionAll при следующем запуске примет программу за старую
  // и запишет отрицательную поправку, обнулив весь накопленный рост
  delete draft.progLast;
  // Проверки собираются в один список и показываются одним попапом: раньше каждая
  // проблема — отдельный попап, и пять нажатий «Сохранить» давали пять попапов.
  const many = draft.plans.length > 1;
  const miss = [];
  if(!draft.name) miss.push(t('builder.needProgramName'));
  // один день не может быть в двух вариантах
  const seenDays = {};
  for(const pl of draft.plans){
    for(const d of (pl.days || [])){
      if(seenDays[d]) miss.push(t('builder.duplicateDay',{day:canonicalLabel(d)}));
      seenDays[d] = true;
    }
  }
  for(let v=0; v<draft.plans.length; v++){
    const pl = draft.plans[v];
    if(!pl.exercises.length){
      miss.push(many ? t('builder.noExercisesVariant',{variant:v+1}) : t('builder.noExercises'));
      continue;
    }
    let badNames = 0;
    for(let i=0; i<pl.exercises.length; i++){
      const ex = normalizeExercise(pl.exercises[i]);
      if(!exP(ex).name) badNames++;
      // Неполная нагрузка (вес без снаряда и т. п.) в сохранённую программу не попадает.
      else if((ex._errors || []).length) miss.push(t('builder.exerciseIncomplete',{name:exP(ex).name}));
    }
    if(badNames){
      miss.push(many
        ? t('builder.unnamedVariant',{variant:v+1,count:badNames,exercises:storeCountText(badNames,'exercise').replace(/^\d+\s+/,'')})
        : t('builder.unnamed',{count:badNames,exercises:storeCountText(badNames,'exercise').replace(/^\d+\s+/,'')}));
    }
  }
  if(miss.length){
    const tip = t('builder.validationTip');
    appAlert(miss.length === 1
      ? t('builder.saveFailedOne',{item:miss[0],tip})
      : t('builder.saveFailedMany',{items:miss.join('\n— '),tip}));
    return;
  }
  if(draft.locale !== 'ru' && draft.locale !== 'en') draft.locale = appLocale === 'ru' ? 'ru' : 'en';
  const idx = customPrograms.findIndex(x=>x.id===draft.id);
  const isNewProgram = idx < 0;
  if(idx >= 0) customPrograms[idx] = draft; else customPrograms.push(draft);
  await savePrograms();
  if(isNewProgram) trackProductEvent('program_added').catch(()=>{});
  if(draft.src && draft.by && typeof claimProgramLink === 'function') claimProgramLink(draft.src).catch(()=>{});
  // расписание задано — попросим разрешение на уведомления
  const anyTime = draft.time || (draft.plans || []).some(pl => pl.time);
  if(planDays(draft).length){
    appRuntimeCompat.requestNotifications().then(ok => { if(ok) builderSyncNativeNotifications(); });
  }
  if(anyTime && planDays(draft).length && 'Notification' in window && Notification.permission === 'default'){
    try{ Notification.requestPermission(); }catch(e){}
  }
  renderMine();
  builderSyncNativeNotifications();
  goTab('scrPrograms');
}

/* Builder owns its editing state. Other chunks ask for domain operations instead of
   assigning individual bindings, so an exercise edit cannot be left half-reset. */
export function loadBuilderDraft(value, selectedPlan = 0){
  draft = value;
  planIdx = Math.max(0, Number.isFinite(Number(selectedPlan)) ? Number(selectedPlan) : 0);
  return draft;
}
export function clearExerciseDraft(){
  exDraft = null;
  exIdx = -1;
  exIsNew = false;
  exOrig = '';
}
export function markExerciseExisting(){ exIsNew = false; }
export function selectPlanVariant(value){
  planIdx = Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
  return planIdx;
}

/* Startup wiring of this part (listeners, handlers, timers). Runs from src/app/index.js,
   after every product module is evaluated, in the original part order. */
export function initBuilder(){
  setProgramsBuilderHooks({
    aiLanguage,
    aiCreateInput,
    aiEquipmentInput,
    contractIds,
    parseContractAnswer,
    normalizeExercise,
    getMaxMain: () => MAX_MAIN,
    getMaxWarm: () => MAX_WARM,
    msgAiEmpty: MSG_AI_EMPTY,
    msgAiNoEx: MSG_AI_NOEX,
    msgAiParse: MSG_AI_PARSE,
    advanceExerciseProgression,
    aiCreateProgramGuard,
    carryExerciseProgress,
    copyPrompt,
    curPlan,
    getDraft: () => draft,
    ensureProgressState,
    exRestAfter,
    exSummary,
    fillBuilder,
    fmtKg,
    fullAIPrompt,
    getExProgValue,
    getExWeight,
    hasWeight,
    progressionLoadType,
    exerciseLoadLevels,
    exerciseLoadLevelState,
    loadLevelLabel,
    editorProgressionMode,
    importFromText,
    isDualProg,
    openBuilder,
    openExercise,
    progAxis,
    progressedRepsRange,
    qChips,
    renderExList,
    loadBuilderDraft,
    selectPlanVariant,
    shrinkImage,
    valueText
  });
  setTrainerBuilderHooks({
    exerciseWeightText,
    enableDrag,
    exRestAfter,
    exerciseLoadLevels,
    exerciseLoadLevelState,
    exerciseProgEvery,
    fmtKg,
    getExProgValue,
    getExWeight,
    hasWeight,
    loadLevelLabel,
    openBuilder,
    parseValue,
    progressionLoadType,
    progShort,
    progressedRepsRange,
    sortWarmFirst,
    valueText
  });
  setProgressBuilderHooks({
    newExId,
    newStageId,
    normalizeExercise,
    shrinkImage
  });
  setDataSyncBuilderHooks({
    exRestAfter,
    exerciseLoadLevelState,
    progressionLoadType,
    getExProgValue,
    hasWeight,
    normValue,
    parseValue,
    progAtCeiling,
    progAxis,
    progBaseValue,
    progStepSize,
    progressedRepsRange
  });
  setCoreBuilderHooks({
    exerciseWeightText,
    dropFreshEx,
    exDirty,
    exRestAfter,
    exerciseLoadLevelState,
    exerciseLoadLevels,
    ensureProgressState,
    loadLevelLabel,
    exerciseProgEvery,
    fmtKg,
    getExProgValue,
    getExWeight,
    hasWeight,
    normValue,
    openBuilder,
    parseKg,
    parseValue,
    progAtCeiling,
    progAxis,
    progressionLoadType,
    progBaseValue,
    progStepSize,
    programHasProgression,
    programDirty,
    progressedRepsRange,
    clearExerciseDraft,
    setExWeight,
    weightPending
  });
  registerAction('deleteCurrentPlan', (_btn, event) => {
    event.stopPropagation();
    eventBuilderHooks.delCurrentPlan();
  });
  registerAction('selectPlanTab', btn => {
    const i = parseInt(btn.dataset.planIdx, 10);
    if(!Number.isFinite(i) || i === planIdx) return;
    commitPlanFields();
    planIdx = i;
    renderPlanTabs();
    fillPlanFields();
    $('stVariantNote').textContent = draft.plans.length > 1 ? `${t('builder.variant')} ${planIdx + 1}` : '';
  });
  registerAction('addPlanVariant', () => {
    commitPlanFields();
    draft.plans.push(blankPlan());
    planIdx = draft.plans.length - 1;
    fillPlanFields();
    syncRotateUI();
  });
  registerAction('togglePlanDay', btn => {
    const d = btn.dataset.day;
    const rotOn = btn.dataset.owner === 'draft';
    const owner = rotOn ? draft : curPlan();
    if(!d || !owner) return;
    owner.days = owner.days.includes(d) ? owner.days.filter(x => x !== d) : DAYS.filter(x => owner.days.includes(x) || x === d);
    if(!rotOn){
      const cur = draft.plans[planIdx];
      sortPlans(draft.plans);
      planIdx = Math.max(0, draft.plans.indexOf(cur));
    }
    renderDays();
    renderPlanTabs();
  });
  registerAction('toggleExerciseSupport', btn => {
    const id = btn.dataset.equipmentId;
    if(!id || !exDraft) return;
    const p = exP(exDraft);
    const list = p.supportEquipment || [];
    p.supportEquipment = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    renderExSupport();
  });
  registerAction('toggleExerciseChainBox', () => {
    const box = $('exChainBox'), open = box.classList.contains('hidden');
    setShown(box, open);
    $('exChainToggle').classList.toggle('open', open);
  });
  registerAction('editExerciseStage', btn => editExerciseStage(btn.dataset.stageId));
  registerAction('addExerciseStage', () => addExerciseStage());
  registerAction('moveExerciseStageUp', () => moveExerciseStage(-1));
  registerAction('moveExerciseStageDown', () => moveExerciseStage(1));
  registerAction('removeExerciseStage', () => removeExerciseStage());
  registerAction('makeExerciseStageCurrent', () => makeExerciseStageCurrent());
  registerAction('toggleExerciseMuscle', btn => {
    const id = btn.dataset.muscleId;
    if(!id || !exDraft) return;
    const pr = exP(exDraft);
    pr.muscles = pr.muscles.includes(id)
      ? pr.muscles.filter(x => x !== id)
      : [...pr.muscles, id];
    renderExMuscles();
    syncExDetailsSum();
  });
  registerAction('setExerciseRest', btn => {
    const key = btn.dataset.restKey;
    const boxId = btn.dataset.boxId;
    const v = parseInt(btn.dataset.restValue, 10);
    if(!key || !boxId || !Number.isFinite(v) || !exDraft) return;
    restCustom[key] = false;
    exP(exDraft)[key] = v;
    renderRestChipsInto(boxId, key);
  });
  registerAction('openCustomRest', btn => {
    if(btn.dataset.restKey && btn.dataset.boxId) openRestModal(btn.dataset.restKey, btn.dataset.boxId);
  });
  registerAction('duplicateExerciseAt', (btn, event) => {
    event.stopPropagation();
    closeAllMenus();
    const i = parseInt(btn.dataset.exerciseIdx, 10);
    if(Number.isFinite(i)) dupExerciseAt(i);
  });
  registerAction('deleteExerciseAt', async (btn, event) => {
    event.stopPropagation();
    closeAllMenus();
    const i = parseInt(btn.dataset.exerciseIdx, 10);
    if(Number.isFinite(i)) await delExerciseAt(i);
  });
  registerAction('toggleExerciseRowMenu', (btn, event) => {
    event.stopPropagation();
    const row = btn.closest('.ex-row');
    const menu = row && row.querySelector('.ctx-menu');
    if(menu) toggleMenu(menu);
  });
  registerAction('openExerciseRow', (row, event) => {
    const target = event.target;
    if(target instanceof Element && target.closest('.ex-grip,.more-btn,.ctx-menu')) return;
    const i = parseInt(row.dataset.exerciseIdx, 10);
    if(Number.isFinite(i)) openExercise(i);
  });
  registerAction('toggleAiChip', btn => {
    const boxId = btn.dataset.boxId;
    const o = btn.dataset.value;
    const cfg = qChipConfigs.get(boxId);
    if(!cfg || o == null) return;
    if(cfg.isMulti){
      let arr = cfg.get();
      const none = cfg.opts.find(x => OPT_NONE.has(x));
      if(none && o === none) arr = arr.includes(none) ? [] : [none];
      else{
        if(none) arr = arr.filter(x => x !== none);
        arr = arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o];
      }
      cfg.set(arr);
    }else cfg.set(cfg.requiredSingle ? o : (cfg.get() === o ? '' : o));
    qChips(boxId, cfg.opts, cfg.isMulti, cfg.get, cfg.set, cfg.requiredSingle);
  });
  registerAction('toggleAiCard', btn => {
    const boxId = btn.dataset.boxId;
    const o = btn.dataset.value;
    const cfg = qCardConfigs.get(boxId);
    if(!cfg || o == null) return;
    cfg.set(cfg.get() === o ? '' : o);
    qCards(boxId, cfg.opts, cfg.get, cfg.set);
  });
  registerAction('toggleAiDay', btn => {
    const d = btn.dataset.day;
    if(!d) return;
    q.days = q.days.includes(d) ? q.days.filter(x => x !== d) : DAYS.filter(x => q.days.includes(x) || x === d);
    initAIForm();
  });
  registerAction('setScheduleMode', btn => {
    draft.rotate = btn.dataset.mode === 'rot';
    if(draft.rotate && !Array.isArray(draft.days)) draft.days = [];
    syncRotateUI();
  });
  registerAction('applyCustomRest', () => {
    if(!restModalKey) return;
    exP(exDraft)[restModalKey] = Math.max(0, Math.min(600, parseInt($('restModalInput').value) || 0));
    restCustom[restModalKey] = true;
    $('restModal').classList.remove('open');
    renderRestChipsInto(restModalBoxId, restModalKey);
  });
  registerAction('toggleAiSplit', () => {
    q.split = !q.split;
    $('qSplit').classList.toggle('on', q.split);
    setShown('qRotateRow', q.split);
    if(!q.split){ q.rotate = false; $('qRotate').classList.remove('on'); }
  });
  registerAction('toggleAiRotate', () => {
    q.rotate = !q.rotate;
    $('qRotate').classList.toggle('on', q.rotate);
  });
  $('exLoadLevel').onchange = ()=>{
    exP(exDraft).load.level = Math.max(0, Math.min(exerciseLoadLevels(exDraft).length - 1, Math.round(+$('exLoadLevel').value || 0)));
  };
  $('exLoadLevels').onchange = ()=>{ exerciseResistanceScaleOk(true); };
  $('exEquip').onchange = ()=>{ setExerciseEquipment($('exEquip').value); };
  $('exEquipCount').oninput = ()=>{
    exP(exDraft).load.count = Math.max(1, Math.min(20, parseInt($('exEquipCount').value) || 1));
    $('exWeightLabel').textContent = exP(exDraft).load.count > 1 ? t('builder.weightPerUnit') : t('builder.weightKg');
    syncExNowHints();
  };
  $('exEquipName').oninput = ()=>{ exP(exDraft).load.name = $('exEquipName').value; };
  $('exStageAdvance').onchange = ()=> setExerciseStageAdvance($('exStageAdvance').value);
  $('exProgMode').onchange = ()=>{
    const selected = $('exProgMode').value;
    if(selected === 'level_direct'){
      setExerciseProgressionMode(exDraft, 'level');
      exP(exDraft).progression.reps.step = null;
    }else{
      setExerciseProgressionMode(exDraft, selected);
    }
    ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
    renderProgControls();
  };
  $('exProgEvery').onchange = ()=>{
    exP(exDraft).progression.every = $('exProgEvery').value === '' ? null : Math.max(1, Math.min(PROG_EVERY_MAX, Math.round(+$('exProgEvery').value || 1)));
    renderProgControls();
  };
  $('bProgEvery').onchange = ()=>{
    draft.progression = programProgEvery($('bProgEvery').value);
  };
  $('bRounds').onchange = ()=>{ curPlan().rounds = +$('bRounds').value; syncVolHint(); };
  $('qNote').oninput = e => q.note = clampText(e.target.value, 300);
}
