import { MUSCLES, OPT_EQUIP, OPT_GOAL, OPT_LEVEL, OPT_NONE } from './options.js';
import { appLocale, canonicalDescription, canonicalLabel, t } from '../i18n/index.js';
import FitAIProtocol from '../../lib/ai-protocol.js';
import { appRuntimeCompat } from './00-dependencies.js';
import { registerAction } from './05-actions.js';
import { $, appAlert, appDialog, goBackTo, goTab, icon, isChanged, plural, setCoreBuilderHooks, setShown, show, state,
  takeSnap
} from './00-core.js';
import { DAYS, closeAllMenus, customPrograms, normPlans, planDays, savePrograms,
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

const BUILTIN_LOAD_LEVEL_KEYS = new Set(['light','medium','strong','veryStrong']);
const DEFAULT_LOAD_LEVELS = [
  {key:'light'},
  {key:'medium'},
  {key:'strong'},
  {key:'veryStrong'}
];

function cleanLoadLevelLabel(raw){
  // "|" — машинный разделитель УРОВНИ СОПРОТИВЛЕНИЯ в AI-протоколе.
  // В пользовательском label заменяем его заранее, иначе один физический
  // уровень после round-trip может превратиться в два.
  return clampLine(raw, 60).replace(/\|+/g, ' / ').replace(/\s+/g, ' ').trim();
}
function cleanLoadLevels(raw, withDefault=false){
  const out = [], seen = new Set();
  const list = Array.isArray(raw) ? raw : [];
  const push = level => {
    if(!level || out.length >= 12) return;
    const key = level.key
      ? 'k:' + level.key
      : 'l:' + String(level.label || '').trim().toLocaleLowerCase();
    if(!key || seen.has(key)) return;
    seen.add(key);
    out.push(level);
  };
  for(const item of list){
    if(out.length >= 12) break;
    if(typeof item === 'string'){
      const label = cleanLoadLevelLabel(item);
      if(label) push({label});
      continue;
    }
    if(!item || typeof item !== 'object') continue;
    if(BUILTIN_LOAD_LEVEL_KEYS.has(item.key)){
      push({key:item.key});
      continue;
    }
    const label = cleanLoadLevelLabel(item.label);
    if(label) push({label});
  }
  if(out.length >= 2) return out;
  return withDefault ? DEFAULT_LOAD_LEVELS.map(x=>({...x})) : out;
}

export function exerciseLoadLevels(ex){
  return cleanLoadLevels(ex && ex.loadLevels, progressionLoadType(ex) === 'level');
}

export function exerciseLoadLevel(ex){
  const levels = exerciseLoadLevels(ex);
  if(!levels.length) return 0;
  const raw = ex && ex.ps && ex.ps.cur && ex.ps.cur.level != null
    ? ex.ps.cur.level
    : (ex && ex.loadLevel != null ? ex.loadLevel : 0);
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
function parsedResistanceScaleText(raw){
  const rows = String(raw || '').split(/\r?\n/)
    .map(x=>clampLine(x.trim(),60)).filter(Boolean)
    .map(protocolLoadLevelItem).filter(Boolean);
  return cleanLoadLevels(rows, false);
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
function parseProtocolLoadLevels(raw){
  return cleanLoadLevels(String(raw || '').split('|').map(protocolLoadLevelItem).filter(Boolean), false);
}
function protocolLoadLevelIndex(levels, raw){
  const wanted = protocolLevelNorm(raw);
  if(!wanted || !Array.isArray(levels)) return 0;
  const aliases = {
    light:['легкое','light'],
    medium:['среднее','medium'],
    strong:['сильное','strong'],
    veryStrong:['очень сильное','very strong']
  };
  const i = levels.findIndex(level => {
    if(level && level.label) return protocolLevelNorm(level.label) === wanted;
    return !!(level && level.key && (aliases[level.key] || []).includes(wanted));
  });
  return i >= 0 ? i : 0;
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

  // Numeric index сам по себе не описывает физическую резинку. При редактировании
  // шкалы сначала пытаемся найти ТУ ЖЕ ступень по стабильному key/custom label.
  // Если её больше нет, старый current level переносить нельзя: иначе «Красная»
  // может молча превратиться в «Чёрную» только потому, что обе были index=1.
  const oldLevels = exerciseLoadLevels(exDraft);
  const oldBaseIndex = Math.max(0, Math.min(Math.max(0, oldLevels.length - 1), Math.round(+exDraft.loadLevel || 0)));
  const oldBaseId = loadLevelIdentity(oldLevels[oldBaseIndex]);
  const rawCurrent = exDraft.ps && exDraft.ps.cur && exDraft.ps.cur.level != null
    ? Math.max(0, Math.min(Math.max(0, oldLevels.length - 1), Math.round(+exDraft.ps.cur.level || 0)))
    : null;
  const oldCurrentId = rawCurrent == null ? '' : loadLevelIdentity(oldLevels[rawCurrent]);
  const findIdentity = id => id ? levels.findIndex(x => loadLevelIdentity(x) === id) : -1;

  exDraft.loadLevels = levels;
  const mappedBase = findIdentity(oldBaseId);
  exDraft.loadLevel = mappedBase >= 0 ? mappedBase : 0;

  if(rawCurrent != null && exDraft.ps && exDraft.ps.cur){
    const mappedCurrent = findIdentity(oldCurrentId);
    if(mappedCurrent >= 0){
      exDraft.ps.cur.level = mappedCurrent;
    }else{
      // Счётчик выполнений ps.n сохраняем, а текущую нагрузку сбрасываем к новой базе.
      exDraft.ps.cur = {};
    }
  }

  // После успешного применения новая шкала становится сохранённой базой формы.
  // Иначе exDirty() продолжал считать её несохранённой до закрытия экрана.
  delete field.dataset.initialValue;
  renderExerciseLevelControls();
  syncExNowHints();
  syncExSwapAvailability();
  return true;
}

export function blankExercise(){
  return {id:newExId(), name:'', desc:'', video:'', type:'reps', value:10, sets:1, perSide:false, warmup:false,
          rest:45, restAfter:null, media:null, muscles:[], mistakes:'',
          // ось прогрессии: reps | weight | time | none.
          // Каждая ось — свой шаг на одно повышение: вес в кг, повторы числом, время в секундах.
          prog:'', weight:0, wStep:2, repsStep:1, timeStep:5, progEvery:null,
          // Нормализованная модель новой прогрессии вводится постепенно.
          // null = старые/текущие данные, strategy adapter выводит смысл из legacy-полей.
          // UI начнёт записывать эти поля отдельной пачкой — пока поведение не меняем.
          loadType:null, progMode:null, loadLevels:null, loadLevel:null,
          // Потолок: выше него прогрессия не поднимает. Без него линейный рост за год
          // доводит до нереальных значений (60 кг гантель, 60 повторений, 5 минут планки).
          repsMax:0, weightMax:0, timeMax:0,
          // Двойная прогрессия: дошли до потолка повторов → +шаг веса, повторы падают в начало.
          // Так растёт вес, а не бесконечное число повторений (классическая силовая схема).
          dualProg:false, dualRangeV:2,
          // Чем заменить упражнение, когда потолок достигнут и расти дальше некуда:
          // название и техника более сложного варианта того же движения.
          swapOn:false, swapName:'', swapDesc:''};
}

// приводит поля упражнения к валидным значениям: и после ручного ввода, и после ответа ИИ,
// который может прислать что угодно. Меняет объект на месте и возвращает его же.
export function normalizeExercise(ex){
  /* Пределы полей — здесь же. Эта функция и есть место, где «что угодно»
     становится упражнением: через неё проходит и набранное руками, и ответ
     нейросети, и чужая программа. Раньше длина названия и описаний тут не
     проверялась вовсе, и название в мегабайт доезжало до карточки как есть. */
  // упражнения из старых данных (созданы до id) или пришедшие по сети без него
  if(!ex.id) ex.id = newExId();
  ex.name  = clampLine(ex.name, LIM.exName);
  ex.desc  = clampText(ex.desc, LIM.exDesc);
  ex.mistakes = clampText(ex.mistakes, LIM.exMistakes);
  // Мышцы — только известные: чужой список уезжает в подписи и в промт к ИИ.
  ex.muscles = (Array.isArray(ex.muscles) ? ex.muscles : [])
    .filter(id => MUSCLES.some(([m]) => m === id)).slice(0, MUSCLES.length);
  const pic = ex.media && ex.media.kind === 'img' ? cleanPic(ex.media.data) : null;
  ex.media = pic ? {kind: 'img', data: pic} : null;
  ex.value = normValue(ex.value, ex.type);
  // Подходы у разминки принудительно сбрасывались в единицу, а поле в форме пряталось.
  // Разминка отличается от обычного упражнения ровно одним — она идёт в начале,
  // один раз, до кругов. Подходы и стороны у неё такие же.
  ex.sets  = Math.max(1, Math.min(10, parseInt(ex.sets) || 1));
  ex.perSide = !!ex.perSide;
  ex.warmup  = !!ex.warmup;
  // Верхняя граница была только у отдыха ПОСЛЕ упражнения, а у этого не было
  // вовсе: «ОТДЫХ: 99999» из ответа ИИ давал шаг тренировки на сутки.
  ex.rest  = Math.max(0, Math.min(600, parseInt(ex.rest) || 0));
  // отдых после ВСЕГО упражнения (перед следующим) — своё число, независимое от
  // отдыха между подходами. null = не задан явно: кто читает это поле, берёт
  // rest как запасной вариант (см. exRestAfter() и paint в buildSteps)
  ex.restAfter = ex.restAfter == null ? null : Math.max(0, Math.min(600, parseInt(ex.restAfter) || 0));
  // ось усложнения и вес: приводим к валидным значениям, чтобы кривой ответ ИИ не ломал показ
  if(ex.prog && !['reps','weight','time','none'].includes(ex.prog)) ex.prog = '';
  // Новые поля пока только описывают смысл старой модели. Они не должны ломать
  // существующие программы: null = читать legacy trackWeight/dualProg/steps.
  if(ex.loadType != null && !['none','weight','level'].includes(ex.loadType)) delete ex.loadType;
  if(ex.progMode != null && !['reps','weight','double_range','time','level','parallel'].includes(ex.progMode)) delete ex.progMode;
  if(ex.loadLevels != null) ex.loadLevels = cleanLoadLevels(ex.loadLevels, ex.loadType === 'level');
  if(ex.loadType === 'level'){
    if(!Array.isArray(ex.loadLevels) || ex.loadLevels.length < 2) ex.loadLevels = cleanLoadLevels(null, true);
    ex.loadLevel = Math.max(0, Math.min(ex.loadLevels.length - 1, Math.round(+ex.loadLevel || 0)));
    ex.trackWeight = false;
    if(ex.ps && ex.ps.cur && ex.ps.cur.level != null){
      ex.ps.cur.level = Math.max(0, Math.min(ex.loadLevels.length - 1, Math.round(+ex.ps.cur.level || 0)));
    }
  }else if(ex.loadLevel != null){
    ex.loadLevel = Math.max(0, Math.round(+ex.loadLevel || 0));
  }
  ex.weight = parseKg(ex.weight);
  // Частота проверки конкретного упражнения:
  // null/пусто = наследовать программу; 0 = полностью отключить прогрессию;
  // 1..15 = собственный порог выполнений.
  if(ex.progEvery == null || String(ex.progEvery).trim() === '') ex.progEvery = null;
  else ex.progEvery = Math.max(0, Math.min(PROG_EVERY_MAX, Math.round(+ex.progEvery || 0)));
  // Шаг 0 — законное значение: «эта ось у этого упражнения не растёт», и именно на
  // нём держится независимая прогрессия формата «повторения и вес» (progStepSize
  // и подсказка «можно усложнить» уже понимают его так). Раньше здесь стоял
  // Math.max(1, …), и явный ноль молча превращался в единицу: программа, где ИИ
  // прислал одну «ШАГ ВЕСА» — как и просит промт, когда растёт только вес, — всё
  // равно прибавляла по повторению за тренировку.
  // Дефолт подставляем только там, где шага нет вовсе, и он зависит от формата.
  const stepNum = (v, def, hi, round) => {
    const n = parseStepNum(v);
    return n == null ? def : Math.max(0, Math.min(hi, round(n)));
  };
  ex.wStep  = stepNum(ex.wStep, 2, 100, v => Math.round(v * 2) / 2);
  ex.repsStep = stepNum(ex.repsStep, hasWeight(ex) ? 0 : 1, 20, Math.round);
  ex.timeStep = stepNum(ex.timeStep, 5, 120, Math.round);
  // потолки: 0 = без потолка. У повторов потолок никогда не может быть ниже
  // стартовой верхней границы диапазона — иначе «8-10, максимум 9» превращалось
  // в искусственное 7-9 ещё до первой тренировки.
  const baseReps = parseValue(ex.value);
  ex.repsMax = Math.max(0, Math.min(200, parseInt(ex.repsMax) || 0));
  if(ex.type !== 'time' && ex.repsMax > 0) ex.repsMax = Math.max(baseReps.max, ex.repsMax);
  ex.weightMax = parseKg(ex.weightMax);
  ex.timeMax = Math.max(0, Math.min(3600, parseInt(ex.timeMax) || 0));

  // Настоящая двойная прогрессия обязана двигать ОБЕ стадии цикла:
  // сначала диапазон повторов, затем вес. Нулевой шаг здесь не «выключенная ось»,
  // а сломанный цикл, поэтому восстанавливаем безопасные дефолты.
  const wantsDual = !!ex.dualProg && hasWeight(ex) && ex.type !== 'time';
  // Старые упражнения без dualRangeV сначала проходят одноразовую миграцию:
  // не переписываем им шаги/потолок здесь, иначе потеряем исходные числа,
  // нужные для точного пересчёта старой семантики.
  if(wantsDual && ex.dualRangeV === 2){
    if(!(ex.repsStep > 0)) ex.repsStep = 1;
    if(!(ex.wStep > 0)) ex.wStep = 2;
    // Для диапазона потолок — именно верхняя граница. Он должен быть ВЫШЕ старта,
    // иначе цикл сразу прыгает к весу, не повышая повторения ни разу.
    ex.repsMax = Math.min(200, Math.max(baseReps.max + ex.repsStep, ex.repsMax || 0));
  }
  ex.dualProg = wantsDual && ex.repsMax > 0;
  ex.swapName = clampLine(ex.swapName, LIM.exSwapName);
  ex.swapDesc = clampText(ex.swapDesc, LIM.exSwapDesc);
  ex.swapOn = !!ex.swapName;
  // Тот же разбор, что у ссылки тренера: схему дописываем сами, а непохожее на
  // адрес не сохраняем. Кнопка «смотреть» на непонятной строке ведёт в никуда.
  ex.video = cleanLink(ex.video, LIM.video) || '';
  return ex;
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
    if(String((e && e.name) || '').trim().toLowerCase() === key) matches.push(idx);
  });
  if(matches.length !== 1) return null;
  const idx = matches[0];
  return {p, plan, idx, ex:list[idx]};
}

/* ---- прогрессия по упражнению ----
   Ось усложнения у разных упражнений разная: гантельные растут по весу (дискретно,
   шагами реальных гантелей), упражнения со своим весом — по повторениям,
   удержания — по времени, а разминка и техника не усложняются вовсе. */
const PROG_AXES = [
  {id:'reps',   label:'Повторения'},
  {id:'weight', label:'Вес'},
  {id:'time',   label:'Время'},
  {id:'none',   label:'Не усложнять'}
];
// ось по умолчанию, если не задана явно: разминку не трогаем, время — по времени, иначе повторы
// Ось прогрессии определяется по-разному у старых и новых упражнений — специально совместимо:
//   новые (после этого обновления): формат («повторения» / «повторения и вес» / «время»,
//     через ex.type + ex.trackWeight) и отдельный тумблер ex.progOn — «усложнять со временем?».
//     Это то, что видно и редактируется в интерфейсе: два простых вопроса вместо одной
//     абстрактной оси из четырёх вариантов.
//   старые (созданы до этого обновления, у них нет ex.progOn вовсе): ось читается из
//     явно сохранённого ex.prog, как раньше. Апгрейд происходит сам собой в момент,
//     когда упражнение открывают в редакторе и сохраняют — тогда оно уже пишет новые поля.
export function progAxis(ex){
  if(!ex) return 'none';
  if(ex.warmup) return 'none';
  if(ex.progOn != null){
    if(!ex.progOn) return 'none';
    if(ex.type === 'time') return 'time';
    return ex.trackWeight ? 'weight' : 'reps';
  }
  if(ex.prog) return ex.prog;
  return ex.type === 'time' ? 'time' : 'reps';
}
// «формат включает вес» — не зависит от того, усложняется ли упражнение сейчас:
// вес может быть просто зафиксирован (тумблер выключен) и не расти, но оставаться видимым
export function hasWeight(ex){
  if(!ex) return false;
  // trackWeight и есть «формат включает вес», и от тумблера прогрессии он не зависит.
  // Раньше ему верили только вместе с progOn — и программа, разобранная из текста без
  // строки «УСЛОЖНЯТЬ», теряла вес полностью: разборщик ставил trackWeight и число кг,
  // а тренировка их не показывала, потому что progOn оставался пустым.
  if(ex.trackWeight != null) return !!ex.trackWeight;
  if(ex.progOn != null) return false;          // новая модель, но формат без веса
  return progAxis(ex) === 'weight'; // старые данные: раньше это было одно и то же понятие
}
// формат включает вес, но снаряд ещё не выбран (0 — не «нулевой вес», а «неизвестный»,
// см. getExProgValue): прогрессия по весу не копится, экран старта предлагает выбрать
export function weightPending(ex){
  return hasWeight(ex) && !(+ex.weight > 0);
}
// отдых после ВСЕГО упражнения (перед следующим), а не между его подходами.
// У старых упражнений (и когда явно не задан) поле пустое — запасной вариант
// тогда тот же, что и между подходами: разное число нужно не всем, и лучше
// молча унаследовать разумное значение, чем ломать программу или писать 0.
export function exRestAfter(ex){
  if(!ex) return 0;
  return ex.restAfter != null ? +ex.restAfter : (+ex.rest || 0);
}
// для редактора: текущее состояние упражнения в терминах простого интерфейса —
// какой формат выбран и включён ли тумблер «усложнять со временем»
function exFormatState(ex){
  const format = ex.type === 'time' ? 'time' : (hasWeight(ex) ? 'reps_weight' : 'reps');
  return {format, progOn: progAxis(ex) !== 'none'};
}
// Частота прогрессии — это число ПОЛНЫХ ВЫПОЛНЕНИЙ КОНКРЕТНОГО УПРАЖНЕНИЯ,
// а не число тренировок программы. У программы хранится общий дефолт; каждое
// упражнение может переопределить его своим значением или отключить прогрессию.
const PROG_EVERY_DEFAULT = 4;
const PROG_EVERY_MAX = 15;
// у старых программ здесь мог лежать календарный/тренировочный период: оставляем
// значение в допустимом диапазоне, но для нового/пустого значения используем 4.
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
  if(ex.progEvery != null && String(ex.progEvery).trim() !== ''){
    return Math.max(0, Math.min(PROG_EVERY_MAX, Math.round(+ex.progEvery || 0)));
  }
  return Math.max(0, Math.min(PROG_EVERY_MAX, Math.round(+((program && program.progression) || 0) || 0)));
}

export function programHasProgression(program){
  return !!program && normPlans(program).some(pl => (pl.exercises || []).some(ex =>
    !ex.warmup && progAxis(ex) !== 'none' && exerciseProgEvery(ex, program) > 0
  ));
}


// Нормализованный semantic adapter для новой progression architecture.
// ВАЖНО: это пока READ-слой. Он не меняет advanceExerciseProgression() и не
// переписывает старые программы — только однозначно описывает уже существующую
// конфигурацию, чтобы следующая пачка могла перевести движок без скрытой смены поведения.
const EX_LOAD_TYPES = new Set(['none','weight','level']);
const EX_PROG_MODES = new Set(['reps','weight','double_range','time','level','parallel']);

export function progressionLoadType(ex){
  if(!ex) return 'none';
  if(EX_LOAD_TYPES.has(ex.loadType)) return ex.loadType;
  return hasWeight(ex) ? 'weight' : 'none';
}

function inferredProgressionMode(ex){
  if(!ex || ex.warmup || progAxis(ex) === 'none') return null;

  const loadType = progressionLoadType(ex);
  if(loadType === 'level') return 'level';
  if(isDualProg(ex)) return 'double_range';

  const weightStep = loadType === 'weight' ? progStepSize(ex, 'weight') : 0;
  if(ex.type === 'time'){
    const timeStep = progStepSize(ex, 'time');
    if(timeStep > 0 && weightStep > 0) return 'parallel';
    if(weightStep > 0) return 'weight';
    return 'time';
  }

  const repsStep = progStepSize(ex, 'reps');
  if(repsStep > 0 && weightStep > 0) return 'parallel';
  if(weightStep > 0) return 'weight';
  return 'reps';
}

export function getProgressionStrategy(ex, program){
  const every = exerciseProgEvery(ex, program);
  const metric = ex && ex.type === 'time' ? 'time' : 'reps';
  const loadType = progressionLoadType(ex);
  const explicitMode = ex && EX_PROG_MODES.has(ex.progMode) ? ex.progMode : null;
  const mode = explicitMode || inferredProgressionMode(ex);
  const switchedOn = !!ex && !ex.warmup && progAxis(ex) !== 'none';

  return {
    enabled: switchedOn && every > 0 && mode != null,
    every,
    mode,
    metric,
    loadType,
    reps: {
      step: ex ? Math.max(0, +progStepSize(ex, 'reps') || 0) : 0,
      max: ex ? progCeil(ex, 'reps') : null
    },
    time: {
      step: ex ? Math.max(0, +progStepSize(ex, 'time') || 0) : 0,
      max: ex ? progCeil(ex, 'time') : null
    },
    weight: {
      step: ex && loadType === 'weight' ? Math.max(0, +progStepSize(ex, 'weight') || 0) : 0,
      max: ex && loadType === 'weight' ? progCeil(ex, 'weight') : null
    },
    level: {
      current: ex && loadType === 'level' ? exerciseLoadLevel(ex) : 0,
      max: ex && loadType === 'level' ? Math.max(0, exerciseLoadLevels(ex).length - 1) : null,
      levels: ex && loadType === 'level' ? exerciseLoadLevels(ex) : []
    }
  };
}


/* ---- модель ручного редактора прогрессии ----
   AI и ручной редактор должны писать одну и ту же семантику. Эти функции не зависят
   от названия упражнения: только от «как считаем» (reps/time) и типа нагрузки.
   UI следующей пачки использует их для списка вариантов и разумного default. */
export function progressionModeOptions(ex){
  const isTime = !!ex && ex.type === 'time';
  const loadType = progressionLoadType(ex);

  if(loadType === 'level'){
    // level появится отдельной пачкой. Уже фиксируем совместимую матрицу, чтобы UI
    // не пришлось потом придумывать другую семантику.
    return isTime ? ['time','level'] : ['level','reps'];
  }
  if(loadType === 'weight'){
    return isTime
      ? ['time','weight','parallel']
      : ['double_range','weight','reps','parallel'];
  }
  return isTime ? ['time'] : ['reps'];
}

export function recommendedProgressionMode(ex){
  const isTime = !!ex && ex.type === 'time';
  const loadType = progressionLoadType(ex);
  if(loadType === 'level') return isTime ? 'time' : 'level';
  if(loadType === 'weight') return isTime ? 'time' : 'double_range';
  return isTime ? 'time' : 'reps';
}

export function editorProgressionMode(ex){
  if(!ex) return null;
  const allowed = progressionModeOptions(ex);
  const explicit = EX_PROG_MODES.has(ex.progMode) ? ex.progMode : null;
  const inferred = explicit || inferredProgressionMode(ex);
  return allowed.includes(inferred) ? inferred : recommendedProgressionMode(ex);
}

// Применяет выбранный пользователем способ прогрессии и синхронизирует legacy-поля,
// которыми пока пользуются parser/workout/старые сохранения. Потолки не стираем:
// переключиться туда-обратно должно быть безопасно.
export function setExerciseProgressionMode(ex, mode){
  if(!ex) return ex;
  const allowed = progressionModeOptions(ex);
  const nextMode = allowed.includes(mode) ? mode : recommendedProgressionMode(ex);
  ex.progMode = nextMode;
  ex.progOn = true;

  const weighted = progressionLoadType(ex) === 'weight';
  ex.trackWeight = weighted;
  ex.dualProg = nextMode === 'double_range';

  if(nextMode === 'double_range'){
    if(!(ex.repsStep > 0)) ex.repsStep = 1;
    if(!(ex.wStep > 0)) ex.wStep = 2;
    const base = parseValue(ex.value);
    ex.repsMax = Math.max(base.max + ex.repsStep, +ex.repsMax || 0);
    ex.dualRangeV = 2;
  } else if(nextMode === 'reps'){
    if(!(ex.repsStep > 0)) ex.repsStep = 1;
    if(weighted) ex.wStep = 0;
  } else if(nextMode === 'weight'){
    if(!(ex.wStep > 0)) ex.wStep = 2;
    if(ex.type === 'time') ex.timeStep = 0;
    else ex.repsStep = 0;
  } else if(nextMode === 'time'){
    if(!(ex.timeStep > 0)) ex.timeStep = 5;
    if(weighted) ex.wStep = 0;
  } else if(nextMode === 'parallel'){
    if(ex.type === 'time'){
      if(!(ex.timeStep > 0)) ex.timeStep = 5;
    }else if(!(ex.repsStep > 0)) ex.repsStep = 1;
    if(!(ex.wStep > 0)) ex.wStep = 2;
  } else if(nextMode === 'level'){
    ex.trackWeight = false;
    ex.loadLevels = cleanLoadLevels(ex.loadLevels, true);
    ex.loadLevel = Math.max(0, Math.min(ex.loadLevels.length - 1, Math.round(+ex.loadLevel || 0)));
    ex.wStep = 0;
    if(ex.type === 'time'){
      // level-mode для времени держит время фиксированным и меняет сопротивление.
      ex.timeStep = 0;
    }else{
      // Для повторов default — сначала два небольших шага повторов, потом следующий level.
      if(!(ex.repsStep > 0)) ex.repsStep = 2;
      const base = parseValue(ex.value);
      if(!(ex.repsMax > base.max)) ex.repsMax = Math.min(200, base.max + ex.repsStep * 2);
    }
  }
  return ex;
}

// Явное изменение типа нагрузки для ручного редактора.
// preferRecommended=true используется для НОВОГО упражнения: пользователь добавил вес,
// значит нормальный default меняется reps→double_range. Для уже настроенного упражнения
// false сохраняет текущий способ, пока он совместим.
export function setExerciseLoadType(ex, loadType, preferRecommended=false){
  if(!ex) return ex;
  // Формат нагрузки и ON/OFF прогрессии — независимые настройки. В частности,
  // редактирование упражнения с явно выключенной прогрессией не должно молча
  // включать её только потому, что человек добавил вес или резинку.
  const progressionWasOn = ex.progOn != null ? !!ex.progOn : progAxis(ex) !== 'none';
  const next = loadType === 'weight' ? 'weight' : loadType === 'level' ? 'level' : 'none';
  ex.loadType = next;
  ex.trackWeight = next === 'weight';
  if(next === 'level'){
    ex.loadLevels = cleanLoadLevels(ex.loadLevels, true);
    ex.loadLevel = Math.max(0, Math.min(ex.loadLevels.length - 1, Math.round(+ex.loadLevel || 0)));
  }

  const current = editorProgressionMode(ex);
  const allowed = progressionModeOptions(ex);
  const target = preferRecommended || !allowed.includes(current)
    ? recommendedProgressionMode(ex)
    : current;
  setExerciseProgressionMode(ex, target);
  ex.progOn = progressionWasOn;
  return ex;
}

// То же для «Повторения / Время»: новый черновик получает default нового формата,
// существующая ручная настройка сохраняется, если такой mode всё ещё имеет смысл.
export function setExerciseMetric(ex, type, preferRecommended=false){
  if(!ex) return ex;
  const progressionWasOn = ex.progOn != null ? !!ex.progOn : progAxis(ex) !== 'none';
  ex.type = type === 'time' ? 'time' : 'reps';
  const current = editorProgressionMode(ex);
  const allowed = progressionModeOptions(ex);
  const target = preferRecommended || !allowed.includes(current)
    ? recommendedProgressionMode(ex)
    : current;
  setExerciseProgressionMode(ex, target);
  ex.progOn = progressionWasOn;
  return ex;
}

export function progressionModeLabel(ex, mode){
  if(mode === 'double_range') return t('builder.progModeDouble');
  if(mode === 'weight') return t('builder.progModeWeight');
  if(mode === 'time') return t('builder.progModeTime');
  if(mode === 'parallel') return t(ex && ex.type === 'time' ? 'builder.progModeParallelTime' : 'builder.progModeParallelReps');
  if(mode === 'level'){
    return ex && ex.type !== 'time' && ex.repsStep > 0
      ? t('builder.progModeLevelReps')
      : t('builder.progModeLevel');
  }
  return t('builder.progModeReps');
}

function progressionModeHintKey(ex, mode){
  if(mode === 'double_range') return 'builder.progModeHintDouble';
  if(mode === 'weight') return 'builder.progModeHintWeight';
  if(mode === 'time') return 'builder.progModeHintTime';
  if(mode === 'parallel') return ex && ex.type === 'time'
    ? 'builder.progModeHintParallelTime'
    : 'builder.progModeHintParallelReps';
  if(mode === 'level') return ex && ex.type !== 'time' && ex.repsStep > 0
    ? 'builder.progModeHintLevelReps'
    : 'builder.progModeHintLevel';
  return 'builder.progModeHintReps';
}

function progressionCeilingHintKey(ex, mode){
  if(mode === 'double_range') return 'builder.ceilingRequiredDoubleHint';
  if(mode === 'level' && ex && ex.type !== 'time' && ex.repsStep > 0){
    return 'builder.ceilingRequiredLevelHint';
  }
  return 'builder.ceilingOptionalHint';
}

export function progressionConfigIssue(ex){
  if(!ex || !ex.progOn || ex.warmup) return '';
  const mode = editorProgressionMode(ex);
  const needsRepTransition = mode === 'double_range'
    || (mode === 'level' && ex.type !== 'time' && +ex.repsStep > 0);
  if(!needsRepTransition) return '';

  const base = parseValue(ex.value);
  const ceil = Math.round(+ex.repsMax || 0);
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
  const levelLoad = progressionLoadType(exDraft) === 'level';
  sel.innerHTML = '';
  progressionModeOptions(exDraft).forEach(mode=>{
    if(mode === 'level' && levelLoad && exDraft.type !== 'time'){
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
  sel.value = current === 'level' && levelLoad && exDraft.type !== 'time' && !(exDraft.repsStep > 0)
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

/* ================= ПРОГРЕССИЯ: единая модель для веса, повторов и времени =================
   У каждого упражнения собственное состояние ex.ps: счётчик полных выполнений и текущая
   фактическая нагрузка. После достижения его порога приложение предлагает следующий шаг;
   подтверждённый шаг меняет только это упражнение. База в редакторе остаётся стартовой
   точкой цикла, а текущие reps/sec/kg/level хранятся отдельно в ex.ps.cur.
   Program progression — только общий default частоты; progEvery упражнения может его
   переопределить или значением 0 полностью отключить проверки для этого упражнения. */

// Все функции ниже принимают НЕОБЯЗАТЕЛЬНЫЙ параметр axis. Если не передать — берётся
// progAxis(ex), как и раньше (для веса-only, повторы-only, время-only упражнений ничего
// не меняется). Явный axis нужен для формата «повторения и вес»: там ОДНОВРЕМЕННО могут
// расти и вес, и повторы — это уже не одна ось, а две, и prog-функциям нужно вызываться
// дважды с разным axis для одного и того же упражнения.

// значение упражнения «с нуля», без какой-либо прогрессии
export function progBaseValue(ex, axis){
  axis = axis || progAxis(ex);
  if(axis === 'weight') return +ex.weight || 0;
  return parseValue(ex.value).min; // повторы, время и «не усложнять» — читают минимум из value
}
// на сколько сдвигается значение за один шаг прогрессии.
// ВАЖНО: используем ex.field != null, а не ex.field || default — иначе явный 0
// (значит «эту ось для этого упражнения не растим») JS посчитает «не задано» и
// молча подставит дефолт вместо нуля, полностью ломая независимую прогрессию
// в формате «повторения и вес» (где именно 0 отключает конкретную ось).
// Что именно растёт у упражнения, одной строкой: «+2 кг», «+1 повт. и +2 кг»,
// «+5 сек». Пусто — значит не растёт, и тогда НЕ ПОКАЗЫВАЕМ НИЧЕГО: отсутствие
// роста — обычное дело, сообщать о нём незачем, а метка «не растёт» у каждого
// второго упражнения только зашумляет список и экран тренировки.
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
  if(ex.type === 'time'){
    const st = progStepSize(ex, 'time');
    if(st > 0) bits.push(`+${fmtKg(st)} ${t('store.secShort')}`);
  } else {
    const r = progStepSize(ex, 'reps');
    if(r > 0) bits.push(`+${fmtKg(r)} ${t('store.repShort')}`);
  }
  // вес — независимая ось что при повторениях, что при времени («время и вес»:
  // фермерская прогулка, планка с блином)
  if(hasWeight(ex)){
    const w = progStepSize(ex, 'weight');
    if(w > 0) bits.push(`+${fmtKg(w)} ${t('progress.kg')}`);
  }
  return bits.length ? bits.join(appLocale === 'ru' ? ' и ' : ' & ') : t('builder.progressionAuto');
}

export function progStepSize(ex, axis){
  axis = axis || progAxis(ex);
  if(axis === 'weight') return ex.wStep != null ? +ex.wStep : 2;
  if(axis === 'reps') return ex.repsStep != null ? +ex.repsStep : 1;
  if(axis === 'time') return ex.timeStep != null ? +ex.timeStep : 5;
  return 0;
}
// нижняя граница, ниже которой значение не опускается (вес — 0, повторы и время — хотя бы 1)
function progFloor(axis){ return axis === 'weight' ? 0 : 1; }
// округление под ось: вес — до 0,5, повторы и время — целые
function progRound(axis, v){
  return axis === 'weight' ? Math.round(v * 2) / 2 : Math.round(v);
}

/* ---- состояние прогрессии У КАЖДОГО УПРАЖНЕНИЯ (ex.ps) ----
   Раньше был один счётчик шагов на программу (progSteps), вычисленный на лету
   из floor(пройденных тренировок / progression) — и все упражнения программы
   получали одно и то же число шагов. Это ломалось на чередовании A/Б: упражнение
   варианта А получало +1 шаг за КАЖДУЮ тренировку программы, в том числе за дни
   варианта Б, и росло вдвое быстрее задуманного.
   Теперь у каждого упражнения своё состояние ex.ps:
     n    — сколько раз это упражнение выполнено с последней проверки прогресса
     cur  — фактическая текущая нагрузка {reps, sec, kg}; отсутствующее поле
            означает «ещё равна базе» (ex.value/ex.weight)
   Состояние живёт внутри упражнения и синхронизируется вместе с программой —
   отдельного места хранения не нужно. advanceExerciseProgression() сдвигает
   cur на один шаг; вызывающий код (commitFinish в 70-workout.js) решает, когда
   это делать — см. также docs/ai-edit-progression-plan.md, пачка 4. */
export function ensurePs(ex){
  if(!ex.ps || typeof ex.ps !== 'object') ex.ps = {n:0, cur:{}};
  else{
    ex.ps.n = Math.max(0, Math.round(+ex.ps.n || 0));
    if(!ex.ps.cur || typeof ex.ps.cur !== 'object') ex.ps.cur = {};
  }
  return ex.ps;
}
// текущий диапазон повторов: из ex.ps.cur.reps, если прогрессия уже сдвигала его,
// иначе — база из ex.value (та же строка «12» / «8-12», что хранится в редакторе)
function psReps(ex){
  const ps = ensurePs(ex);
  return parseValue(ps.cur.reps != null ? ps.cur.reps : ex.value);
}
function psSec(ex){
  const ps = ensurePs(ex);
  return ps.cur.sec != null ? +ps.cur.sec : parseValue(ex.value).min;
}
function psKg(ex){
  const ps = ensurePs(ex);
  return ps.cur.kg != null ? +ps.cur.kg : (+ex.weight || 0);
}

// текущий рабочий вес упражнения: то, что человек поднимает сейчас (растёт от тренировки к тренировке)
function exWeightKey(pid, name){
  return 'w_' + pid + '_' + String(name || '').trim().toLowerCase();
}

// потолок оси: 0 или пусто = потолка нет (растём без ограничения, как раньше)
function progCeil(ex, axis){
  const v = axis === 'weight' ? ex.weightMax : axis === 'time' ? ex.timeMax : ex.repsMax;
  return (+v > 0) ? +v : null;
}
// двойная прогрессия возможна, только когда есть и вес, и потолок повторов:
// без потолка неизвестно, когда сбрасывать повторы и добавлять вес
export function isDualProg(ex){
  return !!ex.dualProg && hasWeight(ex) && progCeil(ex, 'reps') != null;
}

// Одно упражнение старой double-progression → новая модель диапазона.
// Возвращает true, если объект был помечен/изменён. Вынесено сюда, рядом с самим
// движком, чтобы миграция и unit-тесты использовали ровно одну формулу.
export function migrateLegacyDualRangeExercise(ex){
  if(!ex || !ex.dualProg || !hasWeight(ex) || ex.type === 'time' || ex.dualRangeV === 2) return false;
  const base = parseValue(ex.value);
  const width = Math.max(0, base.max - base.min);

  if(width > 0){
    const rawCur = ex.ps && ex.ps.cur ? ex.ps.cur.reps : null;
    const cur = rawCur != null ? parseValue(rawCur) : null;
    const alreadyRangeState = !!(cur && cur.min !== cur.max);

    if(!alreadyRangeState){
      const oldCeil = Math.max(0, Math.round(+ex.repsMax || 0));
      if(oldCeil > 0){
        // Старые 8→…→20 = 12 шагов. Новые 8-10→…→20-22 — те же 12.
        ex.repsMax = Math.min(200, Math.max(base.max, oldCeil + width));
      }
      if(cur){
        let min = Math.max(1, cur.min);
        let max = min + width;
        if(ex.repsMax > 0 && max > ex.repsMax){
          max = ex.repsMax;
          min = Math.max(1, max - width);
        }
        ex.ps.cur.reps = min === max ? String(min) : min + '-' + max;
      }
    }
  }

  // После перевода double progression всегда имеет две реальные стадии.
  if(!(ex.repsStep > 0)) ex.repsStep = 1;
  if(!(ex.wStep > 0)) ex.wStep = 2;
  if(ex.repsMax > 0){
    ex.repsMax = Math.min(200, Math.max(base.max + ex.repsStep, ex.repsMax));
  }
  ex.dualRangeV = 2;
  return true;
}

// итоговое значение упражнения сейчас — читает фактическое состояние (ex.ps),
// а не вычисляет его из числа шагов программы. pid/program больше не нужны для
// самого чтения (совместимость со старыми вызовами — аргументы просто игнорируются),
// но getExWeight/exBits/exerciseLoad и т.п. по-прежнему передают их, поэтому сигнатура
// сохранена, чтобы не переписывать десятки мест вызова.
export function getExProgValue(pid, ex, program, axis){
  axis = axis || progAxis(ex);
  if(axis === 'none') return progBaseValue(ex, axis);
  if(axis === 'weight'){
    // вес 0 — это «снаряд ещё не выбран», а не «стартуем с нуля кг»: пока он не
    // выбран, прогрессия не копится поверх несуществующей базы (иначе вес сначала
    // не показывается вовсе, а после пары тренировок вдруг появляется «4 кг» из
    // воздуха). Как только человек выберет вес на экране старта, психология та же:
    // это станет новой базой, и прогрессия пойдёт от неё.
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
  // reps: одно число — минимум текущего диапазона (см. progressedRepsRange для диапазона целиком)
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
  const base = parseValue(ex.value);
  const baseWidth = Math.max(0, base.max - base.min);

  let min = r.min, max = r.max;
  // Совместимость с состоянием старой двойной прогрессии, где cur.reps хранился
  // одним числом. Не теряем достигнутую нижнюю границу, а восстанавливаем ширину
  // исходного диапазона.
  if(isDualProg(ex) && baseWidth > 0 && min === max && ex.ps && ex.ps.cur && ex.ps.cur.reps != null){
    max = min + baseWidth;
  }
  if(ceil != null && max > ceil){
    max = ceil;
    if(isDualProg(ex) && baseWidth > 0) min = Math.max(1, max - baseWidth);
    else min = Math.min(min, max);
  }
  min = Math.max(1, min);
  max = Math.max(min, max);
  return min === max ? String(min) : min + '-' + max;
}
// Чистое чтение текущей нагрузки: НЕ создаёт ex.ps и не меняет упражнение.
// Это принципиально для preview: просто открыть экран проверки прогрессии не должно
// материализовать состояние или пачкать sync-данные.
function progressionCurrentState(ex, mode){
  const baseReps = parseValue(ex && ex.value);
  const rawReps = ex && ex.ps && ex.ps.cur && ex.ps.cur.reps != null
    ? parseValue(ex.ps.cur.reps)
    : baseReps;
  const repsCeil = ex ? progCeil(ex, 'reps') : null;
  const baseWidth = Math.max(0, baseReps.max - baseReps.min);

  let min = rawReps.min, max = rawReps.max;
  if(mode === 'double_range' && baseWidth > 0 && min === max &&
      ex && ex.ps && ex.ps.cur && ex.ps.cur.reps != null){
    max = min + baseWidth;
  }
  if(repsCeil != null && max > repsCeil){
    max = repsCeil;
    if(mode === 'double_range' && baseWidth > 0) min = Math.max(1, max - baseWidth);
    else min = Math.min(min, max);
  }
  min = Math.max(1, min);
  max = Math.max(min, max);

  const baseSec = parseValue(ex && ex.value).min;
  const rawSec = ex && ex.ps && ex.ps.cur && ex.ps.cur.sec != null ? +ex.ps.cur.sec : baseSec;
  const timeCeil = ex ? progCeil(ex, 'time') : null;
  const sec = Math.max(1, progRound('time', timeCeil != null ? Math.min(timeCeil, rawSec) : rawSec));

  const rawKg = ex && ex.ps && ex.ps.cur && ex.ps.cur.kg != null ? +ex.ps.cur.kg : +(ex && ex.weight || 0);
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
  if(!(step > 0) || !(current.kg > 0)) return; // 0 = вес ещё не выбран
  const ceil = progCeil(ex, 'weight');
  const value = current.kg + step;
  next.kg = progRound('weight', ceil != null ? Math.min(ceil, value) : value);
}

function computeDoubleRangeStep(ex, current, next){
  const base = parseValue(ex.value);
  const width = Math.max(0, base.max - base.min);
  const repsCeil = progCeil(ex, 'reps');
  if(repsCeil == null) return; // invalid double_range: нет точки перехода к весу

  const repsStep = progStepSize(ex, 'reps') || 1;
  const stored = parseValue(current.reps);
  let curMin = stored.min;
  let curMax = stored.max;

  if(curMax >= repsCeil){
    if(!(current.kg > 0)) return; // weight pending: не создаём кг из воздуха

    const weightCeil = progCeil(ex, 'weight');
    if(weightCeil != null && current.kg >= weightCeil) return; // полный потолок

    const step = progStepSize(ex, 'weight');
    if(!(step > 0)) return;
    const nextKg = current.kg + step;
    next.kg = progRound('weight', weightCeil != null ? Math.min(weightCeil, nextKg) : nextKg);
    next.reps = normValue(ex.value, 'reps');
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
  if(ex.type !== 'time' && strategy.reps.step > 0){
    const ceil = strategy.reps.max;
    const r = parseValue(current.reps);
    if(ceil == null || r.max < ceil){
      computeRepsStep(ex, current, next);
      return;
    }
  }

  if(current.level >= strategy.level.max) return;
  next.level = current.level + 1;
  if(ex.type !== 'time' && strategy.reps.step > 0 && strategy.reps.max != null){
    next.reps = normValue(ex.value, 'reps');
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
    if(ex.type === 'time') computeTimeStep(ex, current, next);
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

// Один formatter для всех экранов, где человек должен понимать фактическую
// нагрузку. Preview финальной проверки и реально применённый шаг используют
// один compute, а здесь только переводим его state в человекочитаемый текст.
export function progressionStateLabel(ex, value){
  const v = value || {};
  const bits = [];
  if(ex && ex.type === 'time'){
    bits.push(`${Math.max(0, Math.round(+v.sec || 0))} ${t('store.secShort')}`);
  }else{
    const reps = String(v.reps != null ? v.reps : normValue(ex && ex.value, 'reps')).replace('-', '–');
    bits.push(`${reps} ${t('workout.repsShort')}`);
  }
  const loadType = progressionLoadType(ex);
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

// Потолок теперь определяется тем же расчётом, что preview/apply:
// если следующий подтверждённый шаг ничего не может изменить — автоматический рост закончен.
// Для осей БЕЗ потолка compute всегда сможет дать следующий шаг, поэтому false сохраняется.
export function progAtCeiling(pid, ex, program){
  if(!ex || progAxis(ex) === 'none') return false;
  const strategy = getProgressionStrategy(ex, program);
  if(!strategy.mode) return false;

  // Историческая семантика «без потолка = не показывать замену» сохраняется.
  const axes = strategy.mode === 'double_range'
    ? ['reps','weight']
    : strategy.mode === 'parallel'
      ? (ex.type === 'time' ? ['time','weight'] : ['reps','weight'])
      : strategy.mode === 'level'
        ? (ex.type !== 'time' && strategy.reps.step > 0 ? ['reps','level'] : ['level'])
        : [strategy.mode];

  const growing = axes.filter(axis => {
    if(axis === 'reps') return strategy.reps.step > 0;
    if(axis === 'time') return strategy.time.step > 0;
    if(axis === 'weight') return strategy.weight.step > 0;
    if(axis === 'level') return strategy.level.max != null;
    return false;
  });
  if(!growing.length) return false;

  // Неизвестный вес (0) — это «снаряд ещё не выбран», а не достигнутый потолок.
  // Старый progAtCeiling() в этом случае тоже возвращал false.
  if(growing.includes('weight') && weightPending(ex)) return false;

  const allBounded = growing.every(axis => {
    if(axis === 'reps') return strategy.reps.max != null;
    if(axis === 'time') return strategy.time.max != null;
    if(axis === 'weight') return strategy.weight.max != null;
    if(axis === 'level') return strategy.level.max != null;
    return false;
  });
  if(!allBounded) return false;

  return !computeNextProgression(ex, program).canAdvance;
}

// Один подтверждённый шаг = применить ровно то, что до этого мог показать preview.
export function advanceExerciseProgression(ex){
  if(!ex || progAxis(ex) === 'none') return;
  const result = computeNextProgression(ex, null);
  if(!result.canAdvance) return;

  const ps = ensurePs(ex);
  if(result.changed.includes('reps')) ps.cur.reps = result.next.reps;
  if(result.changed.includes('time')) ps.cur.sec = result.next.sec;
  if(result.changed.includes('weight')) ps.cur.kg = result.next.kg;
  if(result.changed.includes('level')) ps.cur.level = result.next.level;
}

// База упражнения (числа, которые задают человек в конструкторе или ИИ) поменялась —
// прежняя фактическая нагрузка ex.ps.cur к ней больше не относится: новые числа и
// есть текущая нагрузка, иначе правка значения/веса в конструкторе просто не
// действовала бы, пока прогрессия уже сдвинула cur. Счётчик до проверки (n)
// сохраняем — упражнение то же. База не менялась (правили описание, отдых,
// подходы, название) — прогресс переносится целиком.
function progBaseKey(ex){
  const loadType = progressionLoadType(ex);
  const mode = editorProgressionMode(ex) || inferredProgressionMode(ex) || '';
  const levelKey = loadType === 'level'
    ? JSON.stringify({levels:exerciseLoadLevels(ex), base:Math.max(0, Math.round(+ex.loadLevel || 0))})
    : '';
  return [
    ex.type === 'time' ? 'time' : 'reps',
    loadType,
    normValue(ex.value, ex.type),
    loadType === 'weight' ? (+ex.weight || 0) : 0,
    mode,
    levelKey
  ].join('|');
}
function carriedProgressCounter(oldEx, newEx){
  let n = Math.max(0, Math.round(+((oldEx && oldEx.ps && oldEx.ps.n) || 0)));
  if(newEx && newEx.progEvery != null){
    const every = Math.max(0, Math.min(PROG_EVERY_MAX, Math.round(+newEx.progEvery || 0)));
    if(every <= 0) return 0;
    n = Math.min(n, every);
  }
  return n;
}

function levelIdentityList(ex){
  return exerciseLoadLevels(ex).map(loadLevelIdentity).filter(Boolean);
}
function samePhysicalLevelScale(oldEx, newEx){
  if(progressionLoadType(oldEx) !== 'level' || progressionLoadType(newEx) !== 'level') return false;
  if((oldEx.type === 'time' ? 'time' : 'reps') !== (newEx.type === 'time' ? 'time' : 'reps')) return false;
  if(normValue(oldEx.value, oldEx.type) !== normValue(newEx.value, newEx.type)) return false;
  const oldMode = editorProgressionMode(oldEx) || inferredProgressionMode(oldEx) || '';
  const newMode = editorProgressionMode(newEx) || inferredProgressionMode(newEx) || '';
  if(oldMode !== newMode) return false;

  const oldIds = levelIdentityList(oldEx);
  const newIds = levelIdentityList(newEx);
  // Дубликаты физически неоднозначны: безопаснее сбросить current, чем угадать не ту резинку.
  if(oldIds.length < 2 || newIds.length !== oldIds.length) return false;
  if(new Set(oldIds).size !== oldIds.length || new Set(newIds).size !== newIds.length) return false;
  if(JSON.stringify(oldIds.slice().sort()) !== JSON.stringify(newIds.slice().sort())) return false;

  const oldBase = Math.max(0, Math.min(oldIds.length - 1, Math.round(+oldEx.loadLevel || 0)));
  const newBase = Math.max(0, Math.min(newIds.length - 1, Math.round(+newEx.loadLevel || 0)));
  return oldIds[oldBase] === newIds[newBase];
}
function carryReorderedLevelProgress(oldEx, newEx, n){
  if(!samePhysicalLevelScale(oldEx, newEx)) return false;
  newEx.ps = JSON.parse(JSON.stringify(oldEx.ps || {n:0,cur:{}}));
  newEx.ps.n = n;
  if(!newEx.ps.cur) newEx.ps.cur = {};

  if(oldEx.ps && oldEx.ps.cur && oldEx.ps.cur.level != null){
    const oldLevels = exerciseLoadLevels(oldEx);
    const newLevels = exerciseLoadLevels(newEx);
    const oldIndex = Math.max(0, Math.min(oldLevels.length - 1, Math.round(+oldEx.ps.cur.level || 0)));
    const currentId = loadLevelIdentity(oldLevels[oldIndex]);
    const mapped = newLevels.findIndex(level => loadLevelIdentity(level) === currentId);
    if(mapped < 0) return false;
    newEx.ps.cur.level = mapped;
  }
  return true;
}
export function carryExerciseProgress(oldEx, newEx){
  if(!newEx) return newEx;
  if(!oldEx || !oldEx.ps){ delete newEx.ps; return newEx; }
  const n = carriedProgressCounter(oldEx, newEx);
  if(progBaseKey(oldEx) === progBaseKey(newEx)){
    newEx.ps = JSON.parse(JSON.stringify(oldEx.ps));
    newEx.ps.n = n;
  }else if(carryReorderedLevelProgress(oldEx, newEx, n)){
    // Та же физическая шкала может быть переставлена. Индекс — не identity:
    // переносим current level по key/custom label, а reps/time state сохраняем.
  }else{
    // Несовместимая база/тип/шкала: счётчик можно сохранить, фактическое
    // значение нельзя. В частности level-index никогда не переезжает в другую шкалу.
    newEx.ps = {n, cur:{}};
  }
  return newEx;
}
// копия упражнения — отдельное упражнение: свой id (по нему сопоставляются
// правки ИИ и отметки «тяжело» на экране финала) и прогресс с нуля
export function cloneExerciseAsNew(ex){
  const c = JSON.parse(JSON.stringify(ex));
  c.id = newExId();
  delete c.ps;
  return c;
}

// вес отдельно — то же самое, но только для оси «вес» (используется в старых местах интерфейса).
// Для формата «повторения и вес» вес растёт независимо от того, что там с повторами,
// поэтому явно просим axis='weight', а не полагаемся на progAxis(ex) (которая для этого
// формата тоже вернёт 'weight' — здесь совпадает, но так честнее читается)
export function getExWeight(pid, ex, program){
  return hasWeight(ex) ? getExProgValue(pid, ex, program, 'weight') : 0;
}
// прямая правка текущего веса (нажатие на строку экрана старта, см. 00-core.js) —
// пишет в ex.ps.cur.kg напрямую, база (ex.weight) не трогается
export function setExWeight(ex, kg){
  ensurePs(ex).cur.kg = Math.max(0, progRound('weight', +kg || 0));
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
  const r = parseValue(v);
  if(type === 'time') return String(r.min); // время — всегда одно число
  return r.min === r.max ? String(r.min) : (r.min + '-' + r.max);
}

export let planIdx = 0;
// Новый вариант начинается пустым: раньше в нём сразу лежало безымянное упражнение,
// и человек видел строку, которой не заводил. Теперь виден пустой список с объяснением,
// а первую строку создаёт «Добавить упражнение» — сразу с полем названия в фокусе.
function blankPlan(){
  return {days:[], rounds:3, roundRest:120, exercises:[]};
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
  const sets = main.map(e => Math.max(1, parseInt(e.sets) || 1));
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

/* ================= РЕДАКТОР ОДНОГО УПРАЖНЕНИЯ ================= */
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

let exOrig = '';  // снимок упражнения на момент открытия — для проверки изменений
export function openExercise(i, isNew){
  const list = curPlan().exercises;
  exIdx = i;
  exIsNew = !!isNew;
  exDraft = JSON.parse(JSON.stringify(list[i]));
  // «материализуем» новую модель один раз при открытии: считаем progOn/trackWeight из того,
  // что фактически было (через старый совместимый путь), и с этого момента редактор работает
  // только с явными полями — без этого клики по табам/тумблеру ничего не меняли (progOn
  // оставался null, и hasWeight()/progAxis() продолжали читать по старому пути в обход правки)
  if(exDraft.progOn == null){
    exDraft.progOn = progAxis(exDraft) !== 'none';
    exDraft.trackWeight = hasWeight(exDraft);
  }
  // Старый технический progEvery=0 больше не показываем как второй способ
  // выключить прогрессию: в редакторе это обычный OFF тумблера.
  if(exDraft.progEvery === 0){
    exDraft.progOn = false;
    exDraft.progEvery = null;
  }
  if(exDraft.loadType == null) exDraft.loadType = progressionLoadType(exDraft);
  if(exDraft.progMode == null && exDraft.progOn) exDraft.progMode = editorProgressionMode(exDraft);
  // старые упражнения (и только что заведённые) не знают «отдых после упражнения»
  // отдельно от «между подходами» — на первое открытие подставляем то же число,
  // что и в rest, тем же приёмом, что и progOn/trackWeight выше. С этого момента
  // оно явное: сохранится тем же числом, даже если человек его не тронет.
  if(exDraft.restAfter == null) exDraft.restAfter = exDraft.rest;
  fillExercise();
  eventBuilderHooks.buildExMenu();
  // Пока упражнение только ЗАВОДЯТ, дублировать и удалять нечего: в списке оно
  // держится самим редактором и уйдёт само, если уйти без сохранения. Меню с
  // двумя действиями над пустой строкой только путало.
  setShown('exMoreWrap', !exIsNew);
  document.querySelectorAll('#exModeTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
  // Снимок для сравнения снимаем С ФОРМЫ, тем же путём, каким потом сравниваем
  // (applyFormTo), и уже ПОСЛЕ материализации progOn/trackWeight. Раньше снимок
  // брали прямо с черновика — и он не совпадал с формой по типам: в черновике
  // «значение» лежит числом (10), из поля читается строкой ("10"). Строки JSON
  // расходились всегда, поэтому «назад» с упражнения, которого даже не коснулись,
  // каждый раз спрашивало про несохранённые изменения.
  exOrig = JSON.stringify(applyFormTo(JSON.parse(JSON.stringify(exDraft))));
  show('scrExercise');
  window.scrollTo(0, 0);
}

function fillExercise(){
  const ex = exDraft;
  // «тронутые» поля шага и потолка помечаются, чтобы renderProgControls не затирал ввод.
  // При открытии ДРУГОГО упражнения метка должна сбрасываться, иначе в полях остаются
  // цифры предыдущего — и уходят в него при сохранении
  ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
  if($('exLoadLevels')) delete $('exLoadLevels').dataset.initialValue;
  $('exName').value = ex.name || '';
  $('exValue').value = valueText(ex.value).replace('–', '-');
  $('exSets').value = ex.sets || 1;
  $('exDesc').value = ex.desc || '';
  $('exMistakes').value = ex.mistakes || '';
  $('exVideo').value = ex.video || '';
  $('exWeight').value = ex.weight ? fmtKg(ex.weight) : '';
  fillExerciseProgEveryOptions();
  fillExerciseProgModeOptions();
  $('exProgEvery').value = ex.progEvery == null ? '' : String(ex.progEvery);
  renderExerciseLevelControls();
  renderProgControls();
  $('exWarm').classList.toggle('on', !!ex.warmup);
  $('exSide').classList.toggle('on', !!ex.perSide);
  syncExType();
  syncExWarm();
  renderExMuscles();
  renderExRestChips();
  renderExMedia();
  syncExDetailsSum();
  // обе раскрывашки по умолчанию свёрнуты: при открытии упражнения видно только то,
  // без чего упражнения не существует
  setShown('exDetailsBox', false);
  $('exDetailsToggle').classList.remove('open');
  setShown('exProgBox', false);
  $('exProgToggle').classList.remove('open');
  setShown('exLevelScaleBox', false);
}

// «Как считать» и «Нагрузка» независимы: время/повторы сочетаются с весом,
// сопротивлением или отсутствием внешней нагрузки.
export function renderExerciseLevelControls(){
  if(!exDraft) return;
  const active = progressionLoadType(exDraft) === 'level';
  setShown('exLevelRow', active);
  if(!active) return;
  const levels = exerciseLoadLevels(exDraft);
  const baseLevel = Math.max(0, Math.min(levels.length - 1, Math.round(+exDraft.loadLevel || 0)));
  exDraft.loadLevel = baseLevel;
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
  const reps = exDraft.type !== 'time';
  const loadType = progressionLoadType(exDraft);
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
  renderExerciseLevelControls();
  renderProgControls();
}
export function syncExWarm(){
  setShown('exSetsField', true);
}
function renderExMuscles(){
  const box = $('exMuscles'); box.innerHTML = '';
  if(!Array.isArray(exDraft.muscles)) exDraft.muscles = [];
  MUSCLES.forEach(([id, label])=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip'; b.textContent = label;
    b.classList.toggle('act', exDraft.muscles.includes(id));
    b.dataset.act = 'toggleExerciseMuscle';
    b.dataset.muscleId = id;
    box.appendChild(b);
  });
}
// «12,5» и «12.5» — одинаково допустимый ввод веса
export function parseKg(v){
  const n = parseFloat(String(v || '').replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.round(n * 2) / 2 : 0;
}


function progressionHasTerminalCeiling(ex){
  if(!ex || progAxis(ex) === 'none') return false;
  const strategy = getProgressionStrategy(ex, draft || null);
  const mode = strategy.mode;
  if(!mode) return false;

  const base = parseValue(ex.value);
  const repsBounded = strategy.reps.max != null && strategy.reps.max >= base.max;
  const timeBounded = strategy.time.max != null && strategy.time.max >= base.min;
  const baseKg = +ex.weight || 0;
  const weightBounded = baseKg > 0 && strategy.weight.max != null && strategy.weight.max >= baseKg;

  if(mode === 'reps') return repsBounded;
  if(mode === 'time') return timeBounded;
  if(mode === 'weight') return weightBounded;
  if(mode === 'double_range') return repsBounded && weightBounded;
  if(mode === 'parallel'){
    return (ex.type === 'time' ? timeBounded : repsBounded) && weightBounded;
  }
  if(mode === 'level'){
    const hasScaleEnd = exerciseLoadLevels(ex).length >= 2;
    if(!hasScaleEnd) return false;
    if(ex.type !== 'time' && strategy.reps.step > 0) return repsBounded;
    return true; // direct level progression ends at the last physical resistance step
  }
  return false;
}

export function syncExSwapAvailability(){
  if(!exDraft) return;
  let probe = exDraft;
  try{ probe = applyFormTo(JSON.parse(JSON.stringify(exDraft))); }catch(_){}
  const available = progressionHasTerminalCeiling(probe);
  setShown('exSwapRow', available);
  $('exSwapOn').classList.toggle('on', !!exDraft.swapOn);
  setShown('exSwapBox', available && !!exDraft.swapOn);
}

// подпись шага и плейсхолдер зависят от текущего формата — одно и то же поле,
// разный смысл: прибавка кг / повторений / секунд
// тумблер «усложнять со временем» + поля шага. Для «повторения и вес» полей ДВА сразу —
// вес и повторы растут независимо друг от друга (0 в одном из них = эта ось не растёт,
// решает либо сам человек, либо ИИ по промту). Для простых форматов — одно поле.
export function renderProgControls(){
  const hideControls = ()=>{
    ['exProgModeRow','exProgEveryRow','exStepRow','exStepBothHint','exCeilingHint','exSwapRow','exSwapBox']
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
  const isTime = exDraft.type === 'time';
  const withWeight = progressionLoadType(exDraft) === 'weight';
  const growReps = mode === 'reps' || mode === 'double_range' ||
    (mode === 'parallel' && !isTime) ||
    (mode === 'level' && !isTime && exDraft.repsStep > 0);
  const growTime = mode === 'time' || (mode === 'parallel' && isTime);
  const growWeight = withWeight && (mode === 'weight' || mode === 'double_range' || mode === 'parallel');

  setShown('exStepRow', growReps || growTime || growWeight);
  setShown('exStepRepsRow', growReps);
  setShown('exStepMaxRepsRow', growReps);
  setShown('exStepWeightRow', growWeight);
  setShown('exStepMaxWeightRow', growWeight);
  setShown('exStepTimeRow', growTime);
  setShown('exStepMaxTimeRow', growTime);
  // dualProg остаётся compatibility-полем данных, но отдельного UI для него больше нет:
  // пользователь выбирает тот же смысл через «Как усложнять → Повторы → вес».
  setShown('exStepBothHint', growReps);
  const ceilingHint = $('exCeilingHint');
  setShown(ceilingHint, growReps || growTime || growWeight);
  if(ceilingHint) ceilingHint.textContent = t(progressionCeilingHintKey(exDraft, mode));

  $('exSwapName').value = exDraft.swapName || '';
  $('exSwapDesc').value = exDraft.swapDesc || '';

  const set = (id, val) => { if(!$(id).dataset.touched) $(id).value = val; };
  if(growReps){
    set('exStepReps', exDraft.repsStep != null ? exDraft.repsStep : 1);
    set('exMaxReps', exDraft.repsMax > 0 ? exDraft.repsMax : '');
  }
  if(growWeight){
    set('exStepWeight', fmtKg(exDraft.wStep != null ? exDraft.wStep : 2));
    set('exMaxWeight', exDraft.weightMax > 0 ? fmtKg(exDraft.weightMax) : '');
  }
  if(growTime){
    set('exStepTime', exDraft.timeStep != null ? exDraft.timeStep : 5);
    set('exMaxTime', exDraft.timeMax > 0 ? exDraft.timeMax : '');
  }
  syncExSwapAvailability();
  syncExProgSum(); syncExNowHints();
}

// В полях редактора лежит БАЗА упражнения — то, с чего всё начиналось. Сколько
// человек поднимает и делает СЕЙЧАС, считается само: база + пройденные повышения
// программы + ручная правка с тренировки. Без этой строки правка выглядела сломанной:
// в списке 18 кг, в поле 12, и непонятно, какое из двух чисел ты меняешь.
// Считаем по ФОРМЕ (applyFormTo), а не по черновику: вписанная только что прибавка
// должна отражаться в подсказке сразу, а не после сохранения.
export function syncExNowHints(){
  const el = $('exNowHint');
  const p = (typeof draft !== 'undefined' && draft && draft.id) ? draft : null;
  if(!exDraft || !p || exDraft.warmup){ setShown(el, false); return; }
  let probe;
  try{ probe = applyFormTo(JSON.parse(JSON.stringify(exDraft))); }catch(_){ setShown(el, false); return; }
  // Только итог — без разбора «откуда цифра»: пример решения тут не нужен,
  // важно само значение. Диапазон считает progressedRepsRange (растит min и max порознь,
  // режет по потолку), при двойной прогрессии min===max — уже готовое число.
  const parts = [];
  let loadChanged = false;
  if(hasWeight(probe)){
    const base = progBaseValue(probe, 'weight'), now = getExWeight(p.id, probe, p);
    loadChanged = now > 0 && Math.abs(now - base) > 0.01;
    if(loadChanged) parts.push(`${fmtKg(now)} ${t('progress.kg')}`);
  }else if(progressionLoadType(probe) === 'level'){
    const levels = exerciseLoadLevels(probe);
    const baseLevel = Math.max(0, Math.min(Math.max(0, levels.length - 1), Math.round(+probe.loadLevel || 0)));
    const nowLevel = exerciseLoadLevel(probe);
    loadChanged = nowLevel !== baseLevel;
    if(loadChanged && levels[nowLevel]){
      parts.push(t('builder.nowResistance',{value:loadLevelLabel(levels[nowLevel])}));
    }
  }
  // Если меняется внешняя нагрузка, показываем рядом и «сколько делать», даже когда
  // сама метрика не выросла: иначе «Сейчас: Сильное сопротивление» не отвечает,
  // сколько повторов/секунд осталось в назначении.
  if(probe.type === 'time'){
    const base = parseValue(probe.value).min, now = getExProgValue(p.id, probe, p, 'time');
    if(now !== base || loadChanged) parts.push(`${now} ${t('store.secShort')}`);
  } else {
    const base = valueText(probe.value), now = progressedRepsRange(p.id, probe, p).replace('-', '–');
    if(now !== base || loadChanged) parts.push(`${now} ${t('store.repShort')}`);
  }
  if(!parts.length){ setShown(el, false); return; }
  // «повт.» уже заканчивается точкой — не дублируем её точкой предложения
  let sentence = t('builder.nowPrefix',{parts:parts.join(', ')});
  if(sentence.endsWith('.')) sentence = sentence.slice(0, -1);
  el.textContent = sentence + '. ' + t('builder.startValuesHint');
  setShown(el, true);
}

// Сводка в заголовке свёрнутого блока: человек должен понимать, что внутри, не
// открывая его. Читаем поля формы, а не exDraft: вписанное только что число ещё
// не перенесено в черновик (перенос делает applyFormTo при сохранении).
export function syncExProgSum(){
  if(exDraft.warmup){ $('exProgSum').textContent = t('builder.warmupNoGrowth'); return; }
  if(progAxis(exDraft) === 'none'){ $('exProgSum').textContent = t('builder.noGrowth'); return; }

  const mode = editorProgressionMode(exDraft);
  const modeText = progressionModeLabel(exDraft, mode);
  const rawEvery = $('exProgEvery') ? $('exProgEvery').value : '';
  const effectiveEvery = rawEvery === ''
    ? exerciseProgEvery({...exDraft, progEvery:null}, draft)
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

// Одно значение — один видимый контрол. Раньше рядом с чипами стояло числовое
// поле, нужное только тем, кому не подходит ни один чип, — и висело в разметке
// всегда. Теперь свой отдых вводится в попапе #restModal, а в самом экране
// остаются только чипы. Два независимых ряда — «между подходами» и «после
// упражнения» — используют одни и те же чипы и один и тот же попап; какой ряд
// сейчас редактируют, помнит restModalKey.
const REST_CHIPS = [0, 15, 30, 45, 60];
const restCustom = {rest: false, restAfter: false};
function renderRestChipsInto(boxId, key){
  const cur = parseInt(exDraft[key]) || 0;
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
  $('restModalInput').value = parseInt(exDraft[key]) || '';
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
  const bits = [];
  if((exDraft.desc || '').trim()) bits.push(t('builder.detailDescription'));
  if((exDraft.mistakes || '').trim()) bits.push(t('builder.detailMistakes'));
  if((exDraft.muscles || []).length) bits.push(t('builder.detailMuscles'));
  if(exDraft.media) bits.push(t('builder.detailImage'));
  if((exDraft.video || '').trim()) bits.push(t('builder.detailVideo'));
  $('exDetailsSum').textContent = bits.length ? bits.join(', ') : t('builder.notFilled');
}

// переносит текущее состояние формы в объект упражнения (черновик или его снимок) —
// общая логика для exDirty (сравнение) и commitExercise (сохранение), чтобы не дублировать
function applyFormTo(target){
  target.name = $('exName').value.trim();
  target.value = normValue($('exValue').value, target.type);
  target.sets = target.warmup ? 1 : Math.max(1, Math.min(10, parseInt($('exSets').value) || 1));
  // rest/restAfter не читаем из формы — чипы и попап #restModal пишут прямо в
  // exDraft при клике, а target уже клон exDraft на момент вызова
  target.desc = $('exDesc').value.trim();
  target.mistakes = $('exMistakes').value.trim();
  target.video = $('exVideo').value.trim();
  target.weight = parseKg($('exWeight').value);
  target.loadType = progressionLoadType(target);
  target.trackWeight = target.loadType === 'weight';
  if(target.loadType === 'level'){
    target.loadLevels = cleanLoadLevels(target.loadLevels, true);
    const selectedLevel = $('exLoadLevel') ? Math.round(+$('exLoadLevel').value || 0) : (+target.loadLevel || 0);
    target.loadLevel = Math.max(0, Math.min(target.loadLevels.length - 1, selectedLevel));
  }
  if(target.progOn){
    target.progMode = editorProgressionMode(target);
    target.dualProg = target.progMode === 'double_range';
  }
  const rawProgEvery = $('exProgEvery') ? $('exProgEvery').value : '';
  target.progEvery = rawProgEvery === '' ? null : Math.max(0, Math.min(PROG_EVERY_MAX, Math.round(+rawProgEvery || 0)));
  // Читаем только оси выбранной стратегии. Скрытая ось получает шаг 0,
  // но её максимум оставляем — при переключении режима туда-обратно настройка не теряется.
  if(target.progOn){
    const num = (id, def, round) => {
      const n = parseStepNum($(id).value);
      return n != null ? round(n) : def;
    };
    const mode = editorProgressionMode(target);
    target.progMode = mode;
    target.dualProg = mode === 'double_range';
    const isTime = target.type === 'time';
    const growReps = mode === 'reps' || mode === 'double_range' ||
      (mode === 'parallel' && !isTime) ||
      (mode === 'level' && !isTime && target.repsStep > 0);
    const growTime = mode === 'time' || (mode === 'parallel' && isTime);
    const growWeight = hasWeight(target) && (mode === 'weight' || mode === 'double_range' || mode === 'parallel');

    if(!isTime){
      target.repsStep = growReps ? num('exStepReps', 1, Math.round) : 0;
      if(growReps) target.repsMax = num('exMaxReps', 0, Math.round);
    }
    if(hasWeight(target)){
      target.wStep = growWeight ? num('exStepWeight', 2, v => Math.round(v * 2) / 2) : 0;
      if(growWeight) target.weightMax = num('exMaxWeight', 0, v => Math.round(v * 2) / 2);
    }
    if(isTime){
      target.timeStep = growTime ? num('exStepTime', 5, Math.round) : 0;
      if(growTime) target.timeMax = num('exMaxTime', 0, Math.round);
    }
    target.swapName = $('exSwapName').value.trim().slice(0, 60);
    target.swapDesc = $('exSwapDesc').value.trim().slice(0, 600);
    target.swapOn = !!(target.swapOn && target.swapName);
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
  const snapshot = applyFormTo(JSON.parse(JSON.stringify(exDraft)));
  return JSON.stringify(snapshot) !== exOrig;
}

export function commitExercise(){
  const old = (curPlan().exercises || [])[exIdx];
  const upd = applyFormTo(exDraft);
  return old ? carryExerciseProgress(old, upd) : upd;
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
  bits.push(ex.type === 'time'
    ? `${p ? getExProgValue(p.id, ex, p, 'time') : parseValue(ex.value).min} ${t('store.secShort')}`
    : `${(p ? progressedRepsRange(p.id, ex, p) : valueText(ex.value)).replace('-', '–')} ${t('store.repShort')}`);
  const sets = Math.max(1, parseInt(ex.sets) || 1);
  if(sets > 1) bits.push(storeCountText(sets,'set'));
  if(hasWeight(ex)){
    const w = p ? getExWeight(p.id, ex, p) : (+ex.weight || 0);
    if(w) bits.push(`${fmtKg(w)} ${t('progress.kg')}`);
  }
  if(progressionLoadType(ex) === 'level'){
    const level = exerciseLoadLevelState(ex);
    if(level && level.label) bits.push(level.label);
  }
  if(ex.perSide) bits.push(t('store.perSide'));
  if(+ex.rest > 0) bits.push(`${t('workout.rest')} ${ex.rest} ${t('store.secShort')}`);
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
  const nameTxt = (ex.name || '').trim() || t('exercise.this');
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
  name.textContent = (ex.name || '').trim() || t('store.untitled');
  const meta = document.createElement('div');
  meta.className = 'ex-meta';
  const tag = (txt, cls) => {
    const el = document.createElement('span');
    if(cls) el.className = cls;
    el.textContent = txt;
    meta.appendChild(el);
  };
  if(ex.warmup) tag(t('store.warmup'), 'wm');
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
export function aiPrompt(locale){
  const outLocale=(locale==='ru'||locale==='en')?locale:appLocale;
  const lang=outLocale==='ru'?'Russian':'English';
  return FitAIProtocol.programPrompt(lang);
}

function aiProtocolLine(line){
  const m=String(line||'').match(/^([А-ЯЁ][А-ЯЁ ]{1,40}):\s*(.*)$/);
  return m?{key:m[1],value:m[2]}:null;
}
export function aiExerciseBlocks(text){
  const lines=String(text||'').split(/\r?\n/),out=[];
  for(let i=0;i<lines.length;i++){
    if(!/^УПРАЖНЕНИЕ:\s*/i.test(lines[i])) continue;
    let end=i+1;
    while(end<lines.length&&!/^УПРАЖНЕНИЕ:\s*/i.test(lines[end])&&!/^ДЕНЬ:\s*/i.test(lines[end]))end++;
    out.push({start:i,end,lines:lines.slice(i,end),name:(aiProtocolLine(lines[i])||{}).value||''});
    i=end-1;
  }
  return out;
}
// Раньше здесь жили aiMergeExerciseBlock/aiMergeProgramEdit — они принудительно
// возвращали старую структуру (порядок, число упражнений) и подставляли от ИИ
// только значения полей. Простые запросы вроде «поменяй порядок» или «добавь
// упражнение» либо тихо ничего не меняли, либо ловили ошибку разбора. Теперь
// ответ ИИ принимается как есть (см. createEditedProgram/applyExEdit), а его
// итог проверяется парсингом и FitAIProtocol.diffPrograms — не запрещается заранее.

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

/* Все ключи, которые понимает парсер. Берём их ИЗ САМОГО ПАРСЕРА, а не списком
   рядом: список пришлось бы помнить, а расходятся такие пары тихо — новый ключ
   заработал бы в разборе и не заработал бы в починке ниже. Сборка (esbuild) не
   минифицирует код и сохраняет UTF-8 (charset: 'utf8' в scripts/build-esm.mjs), так что
   ключи в исходнике остаются как написаны и читать их оттуда безопасно. */
let PARSE_KEYS = null;
function parseKeys(){
  if(PARSE_KEYS) return PARSE_KEYS;
  const out = [];
  const src = String(parseProgramText);
  // Кавычки любые: сборщик может переписать 'КЛЮЧ' в "КЛЮЧ".
  const re = /case\s*['"]([А-ЯЁ][А-ЯЁ\s]*)['"]/g;
  let m;
  while((m = re.exec(src))) out.push(m[1].trim());
  // Длинные вперёд: иначе «ОТДЫХ» срабатывает раньше «ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ»
  // и режет строку посередине ключа.
  PARSE_KEYS = [...new Set(out)].sort((a, b) => b.length - a.length);
  return PARSE_KEYS;
}

/* Починка текста, у которого пропали переносы строк.

   Некоторые чаты с ИИ отдают ответ так, что при копировании переносы теряются, и
   вся программа приезжает одной строкой: «ПРОГРАММА: Сила дома ДНИ: Пн КРУГИ: 3…».
   Разбор на этом ломался молча и целиком: первая строка съедала всё, программа
   получалась из одного названия без единого упражнения.

   Просить ИИ ставить особый символ — не выход: во-первых, его теряют ровно так же,
   во-вторых, весь уже написанный текст (каталог, сохранённые программы, чужие
   ссылки) этого символа не знает, и формат пришлось бы менять дважды. Чинить надо
   то, что пришло, а не требовать другого.

   Ключи известны наперёд, и ключ в середине строки — это всегда начало новой:
   в значении «ДНИ:» с двоеточием взяться неоткуда. Ставим перенос перед каждым
   таким ключом. Уже целый текст правило не трогает: там перед ключом и так
   перенос. */
function repairLines(txt){
  const keys = parseKeys();
  if(!keys.length) return txt;   // не вышло прочитать ключи — не трогаем текст вовсе
  const alt = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return txt
    // ключ посреди строки: перед ним пробел, а не начало строки
    .replace(new RegExp('([^\\n])[ \\t]+(' + alt + ')[ \\t]*:', 'g'), '$1\n$2:')
    // хвостовые маркеры списка: «УПРАЖНЕНИЕ: Приседания -» после разреза остаётся
    // от «- ФОРМАТ:», и дефис прилипал бы к названию
    .replace(/[ \t]*[•*\u2013-]+[ \t]*$/gm, '');
}

export function parseProgramText(txt){
  const p = {id:'p'+Date.now(), name:'', time:'', cover:null, stats:{completions:0}, progression:0, plans:[]};
  let plan = null;
  let cur = null;
  const errors = [];
  const ensurePlan = ()=>{
    if(!plan){
      plan = {days:[], rounds:3, roundRest:120, exercises:[]};
      p.plans.push(plan);
    }
    return plan;
  };
  // раскладывает накопленный «сырой» ШАГ в нужное поле (вес/повторы/время) по итоговому
  // формату упражнения — вызывается, когда упражнение точно больше не изменится
  const finalizeExercise = ex => {
    if(!ex) return;
    if(ex._rawStep != null){
      const n = ex._rawStep; // уже прошёл parseStepNum — либо валидное число (включая 0), либо сюда не попал бы
      if(ex.type === 'time') ex.timeStep = Math.round(n);
      else if(ex.trackWeight) ex.wStep = Math.round(n * 2) / 2;
      else ex.repsStep = Math.round(n);
      delete ex._rawStep;
    }
    // ПОТОЛОК раскладываем так же, как ШАГ: смысл числа задаёт формат упражнения,
    // а строка ФОРМАТ могла встретиться в тексте и позже
    if(ex._rawMax != null){
      const n = ex._rawMax;
      if(ex.type === 'time') ex.timeMax = Math.round(n);
      else if(ex.trackWeight) ex.weightMax = Math.round(n * 2) / 2;
      else ex.repsMax = Math.round(n);
      delete ex._rawMax;
    }
    // «Повторения и вес»: повторения растут, только если про них сказали явно.
    // Промт так и просит — когда растёт только вес (обычное дело), в ответе одна
    // строка «ШАГ ВЕСА». Раньше упражнение всё равно получало шаг повторений из
    // заготовки пустого упражнения, и тренировка прибавляла по повторению за раз
    // вопреки ответу: «10 повторений × 8 кг» через три повышения превращалось
    // в «13 повторений × 14 кг».
    if(ex.trackWeight && ex.type !== 'time' && !ex._gotRepsStep) ex.repsStep = 0;
    // Новые protocol labels превращаем в ту же semantic model, которую пишет
    // ручной редактор. Порядок строк не важен: current label резолвим только здесь.
    if(ex.loadType === 'level'){
      ex.trackWeight = false;
      ex.dualProg = false;
      ex.wStep = 0;
      ex.loadLevels = cleanLoadLevels(ex.loadLevels, true);
      if(ex._rawLoadLevel != null) ex.loadLevel = protocolLoadLevelIndex(ex.loadLevels, ex._rawLoadLevel);
      else ex.loadLevel = Math.max(0, Math.min(ex.loadLevels.length - 1, Math.round(+ex.loadLevel || 0)));
      // Для reps+level раздельный ШАГ ПОВТОРОВ описывает цикл
      // «повторы → сопротивление». Обычный ШАГ — только рост повторов при
      // фиксированном сопротивлении. Для time аналогично: ШАГ = рост времени.
      if(ex.type === 'time'){
        ex.progMode = ex._gotGenericStep || ex._gotTimeStep ? 'time' : 'level';
        if(ex.progMode === 'level') ex.timeStep = 0;
      }else{
        ex.progMode = ex._gotGenericStep ? 'reps' : 'level';
        // Без строки ШАГ ПОВТОРОВ не придумываем скрытый рост повторов.
        // AI-default обязан прислать её явно; отсутствие означает прямой переход resistance.
        if(ex.progMode === 'level' && !ex._gotRepsStep) ex.repsStep = 0;
      }
    }else{
      if(ex.loadType == null) ex.loadType = ex.trackWeight ? 'weight' : 'none';
      // двойная прогрессия имеет смысл только с весом и потолком повторов —
      // иначе неоткуда взяться моменту «повторы упёрлись, добавляем вес»
      if(ex.dualProg && !(ex.trackWeight && ex.repsMax > 0)) ex.dualProg = false;
      if(ex.type === 'time'){
        if(ex.loadType === 'weight'){
          const tGrow = ex.timeStep > 0, wGrow = ex.wStep > 0;
          ex.progMode = tGrow && wGrow ? 'parallel' : (wGrow ? 'weight' : 'time');
        }else ex.progMode = 'time';
      }else if(ex.loadType === 'weight'){
        const rGrow = ex.repsStep > 0, wGrow = ex.wStep > 0;
        ex.progMode = ex.dualProg ? 'double_range' : (rGrow && wGrow ? 'parallel' : (wGrow ? 'weight' : 'reps'));
      }else ex.progMode = 'reps';
    }
    delete ex._rawLoadLevel;
    delete ex._gotGenericStep;
    delete ex._gotTimeStep;
    delete ex._gotRepsStep;
    // замена без названия — это просто пустой флаг, он ничего не покажет
    if(!(ex.swapName || '').trim()){ ex.swapOn = false; ex.swapName = ''; ex.swapDesc = ''; }
    else ex.swapOn = true;
  };
  const parseDays = val => {
    const list = val.split(/[,;]/).map(d => DAY_ALIASES[d.trim().toLowerCase()]).filter(Boolean);
    return DAYS.filter(d => list.includes(d));
  };
  const lines = repairLines(txt.replace(/\*\*/g,'')).split(/\r?\n/);
  for(let raw of lines){
    const line = raw.replace(/^[\s#>*•\-–]+/,'').trim();
    if(!line) continue;
    const m = line.match(/^([А-ЯЁA-Zа-яёa-z\s]+?)\s*:\s*(.*)$/);
    if(!m) continue;
    const key = m[1].trim().toUpperCase();
    const val = m[2].trim();
    switch(key){
      case 'ПРОГРАММА': case 'НАЗВАНИЕ ПРОГРАММЫ': p.name = val; break;
      case 'ОПИСАНИЕ ПРОГРАММЫ': case 'О ПРОГРАММЕ': p.desc = val.slice(0, 1000); break;
      case 'ВРЕМЯ': {
        const t = val.match(/^(\d{1,2}):(\d{2})/);
        if(t){
          const h = +t[1], mn = +t[2];
          if(h >= 0 && h <= 23 && mn >= 0 && mn <= 59) p.time = String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
        }
        break;
      }
      case 'ДЕНЬ': {
        // новый вариант тренировки для указанных дней
        if(p.plans.length >= 7){ plan = null; cur = null; break; }
        plan = {days: parseDays(val), rounds:3, roundRest:120, exercises:[]};
        p.plans.push(plan);
        cur = null;
        break;
      }
      case 'ДНИ': ensurePlan().days = parseDays(val); break;
      case 'КРУГИ': case 'КРУГОВ': ensurePlan().rounds = Math.max(1, Math.min(10, parseInt(val)||3)); break;
      case 'ОТДЫХ МЕЖДУ КРУГАМИ': ensurePlan().roundRest = Math.max(0, Math.min(600, parseInt(val)||0)); break;
      case 'ВРЕМЯ ВАРИАНТА': {
        const t = val.match(/^(\d{1,2}):(\d{2})/);
        if(t){
          const h = +t[1], mn = +t[2];
          if(h >= 0 && h <= 23 && mn >= 0 && mn <= 59) ensurePlan().time = String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
        }
        break;
      }
      case 'ЧЕРЕДОВАНИЕ': case 'РОТАЦИЯ':
        p.rotate = !/нет|off|false|0/i.test(val);
        break;
      case 'ДНИ ТРЕНИРОВОК': case 'ДНИ НЕДЕЛИ':
        p.days = parseDays(val); // общее расписание программы (используется при чередовании)
        break;
      case 'УПРАЖНЕНИЕ': {
        finalizeExercise(cur); // предыдущее упражнение точно готово — раскладываем его ШАГ
        ensurePlan();
        if(plan.exercises.length >= MAX_EX){ cur = null; break; }
        cur = blankExercise();
        cur.name = val;
        cur.rest = 0;
        cur.sets = 1;
        plan.exercises.push(cur);
        break;
      }
      // техническая метка сопоставления при AI-правке (см. programToText(…,{forEdit:true}));
      // человеку не показывается и никогда не сохраняется — см. createEditedProgram
      case 'КОД': if(cur) cur._code = val.trim().slice(0, 20); break;
      case 'ОПИСАНИЕ': if(cur) cur.desc = val.slice(0,600); break;
      case 'ФОРМАТ':
        if(cur){
          const v = val.toLowerCase();
          cur.type = /врем|сек|time/.test(v) ? 'time' : 'reps';
          // «и вес» — отдельно от простого формата, у обеих осей (повторения и
          // время): удержание с утяжелением, фермерская прогулка на время.
          if(/вес/.test(v)){ cur.trackWeight = true; if(cur.loadType == null) cur.loadType = 'weight'; }
        }
        break;
      case 'НАГРУЗКА':
        if(cur){
          const v = val.toLowerCase();
          if(/сопротив|resistance|резин|band/.test(v)){ cur.loadType = 'level'; cur.trackWeight = false; }
          else if(/вес|weight|кг|kg/.test(v)){ cur.loadType = 'weight'; cur.trackWeight = true; }
          else if(/нет|none|без/.test(v)){ cur.loadType = 'none'; cur.trackWeight = false; }
        }
        break;
      case 'СОПРОТИВЛЕНИЕ':
        if(cur) cur._rawLoadLevel = val;
        break;
      case 'УРОВНИ СОПРОТИВЛЕНИЯ':
        if(cur){
          const levels = parseProtocolLoadLevels(val);
          if(levels.length >= 2) cur.loadLevels = levels;
        }
        break;
      case 'ЗНАЧЕНИЕ': case 'ПОВТОРЕНИЯ': case 'СЕКУНДЫ':
        if(cur){
          cur.value = normValue(val, cur.type);
          // «по 10 на каждую ногу» прямо в значении
          if(/кажд|сторон|ногу|руку|на бок/i.test(val)) cur.perSide = true;
        }
        break;
      case 'ПОДХОДЫ': case 'ПОДХОДОВ': case 'СЕТЫ':
        if(cur) cur.sets = Math.max(1, Math.min(10, parseInt(val) || 1));
        break;
      case 'СТОРОНА': case 'НА КАЖДУЮ СТОРОНУ':
        if(cur) cur.perSide = !/нет|no|false|0/i.test(val);
        break;
      case 'РАЗМИНКА':
        if(cur){
          const wantWarm = !/нет|no|false|0/i.test(val);
          // не больше MAX_WARM разминочных на вариант
          const warmCount = plan.exercises.filter(e => e.warmup && e !== cur).length;
          cur.warmup = wantWarm && warmCount < MAX_WARM;
          // подходы у разминки больше не сбрасываются: она отличается от обычного
          // упражнения только тем, что идёт в начале и один раз, до кругов
        }
        break;
      case 'ОТДЫХ': if(cur) cur.rest = Math.max(0, Math.min(600, parseInt(val)||0)); break;
      case 'ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ': if(cur) cur.restAfter = Math.max(0, Math.min(600, parseInt(val)||0)); break;
      case 'МЫШЦЫ': {
        if(cur){
          const labels = val.split(/[,;]/).map(s => s.trim().toLowerCase());
          cur.muscles = MUSCLES.filter(([id, l]) => labels.includes(l.toLowerCase())).map(([id]) => id);
        }
        break;
      }
      case 'ОШИБКИ': if(cur) cur.mistakes = val.slice(0, 300); break;
      case 'ПРОГРЕССИЯ': {
        // если ИИ написал это внутри упражнения и имел в виду ось усложнения — трактуем так
        if(cur && /вес|повтор|врем|нет/i.test(val) && !/недел/i.test(val)){
          const v = val.toLowerCase();
          if(/вес|кг|гантел|штанг|гир/.test(v)) cur.prog = 'weight';
          else if(/врем|секунд|удержан/.test(v)) cur.prog = 'time';
          else if(/повтор/.test(v)) cur.prog = 'reps';
          else if(/нет|не усложн/.test(v)) cur.prog = 'none';
          break;
        }
        if(/нет|no|выкл|без/i.test(val)){ p.progression = 0; break; }
        const num = parseInt(String(val).match(/\d+/));
        if(isFinite(num) && num > 0){ p.progression = clampProgEvery(num); break; }
        // прежние формулировки в неделях: переводим в тренировки из расчёта ~3 занятия в неделю
        if(/недел/i.test(val)) p.progression = /2|две/i.test(val) ? 6 : 3;
        else p.progression = 0;
        break;
      }
      case 'ЧАСТОТА ПРОГРЕССИИ': {
        if(!cur) break;
        const v = String(val || '').trim().toLowerCase();
        if(!v || /по умолчанию|inherit|program/.test(v)) cur.progEvery = null;
        else{
          const n = parseInt(v.match(/\d+/));
          if(Number.isFinite(n)) cur.progEvery = Math.max(0, Math.min(PROG_EVERY_MAX, n));
        }
        break;
      }
      case 'ВИДЕО': if(cur && val) cur.video = val; break;
      case 'УСЛОЖНЯТЬ': case 'КАК УСЛОЖНЯТЬ': {
        // новая форма — просто да/нет, ось решает уже распарсенный ФОРМАТ этого же упражнения.
        // старая форма (одно из четырёх слов: повторения/вес/время/нет) распознаётся тоже —
        // на случай ручной вставки текста, собранного по прежней версии промта.
        if(!cur) break;
        const v = val.toLowerCase();
        // \b (граница слова) в JS не распознаёт кириллицу — используем явный конец строки/пробел
        if(/^да(\s|$)|^yes(\s|$)/.test(v)) cur.progOn = true;
        else if(/нет|не усложн|^no(\s|$)/.test(v)) cur.progOn = false;
        else if(/вес|кг|гантел|штанг|гир/.test(v)){ cur.progOn = true; cur.trackWeight = true; }
        else if(/врем|секунд|удержан/.test(v)){ cur.progOn = true; cur.type = 'time'; }
        else if(/повтор/.test(v)){ cur.progOn = true; cur.trackWeight = false; }
        break;
      }
      case 'ВЕС': if(cur) cur.weight = parseKg(val); break;
      // единый ключ ШАГ: что именно он значит — зависит от формата этого упражнения,
      // распарсенного строкой раньше (ФОРМАТ идёт в спецификации перед УСЛОЖНЯТЬ и ШАГ)
      // не резолвим сразу: ШАГ мог встретиться в тексте РАНЬШЕ строки ФОРМАТ, а его смысл
      // (кг / повторы / секунды) зависит именно от формата. Копим «сырым» и решаем один раз
      // при завершении упражнения — см. finalizeExercise ниже. Так порядок строк не важен.
      case 'ШАГ': if(cur){ const n = parseStepNum(val); if(n != null){ cur._rawStep = n; cur._gotGenericStep = true; } } break;
      // старые раздельные ключи шага — поддержаны для устойчивости к прежнему формату текста
      case 'ШАГ ВЕСА': if(cur){ const n = parseStepNum(val); cur.wStep = n != null ? Math.round(n * 2) / 2 : 2; } break;
      case 'ШАГ ПОВТОРОВ': if(cur){ const n = parseStepNum(val); cur.repsStep = n != null ? Math.round(n) : 1; cur._gotRepsStep = true; } break;
      case 'ШАГ ВРЕМЕНИ': if(cur){ const n = parseStepNum(val); cur.timeStep = n != null ? Math.round(n) : 5; cur._gotTimeStep = true; } break;
      // потолок роста: выше него прогрессия не поднимает. Единый ключ ПОТОЛОК разбирается
      // по формату упражнения в finalizeExercise, раздельные — сразу
      case 'ПОТОЛОК': if(cur){ const n = parseStepNum(val); if(n != null) cur._rawMax = n; } break;
      case 'ПОТОЛОК ПОВТОРОВ': if(cur){ const n = parseStepNum(val); if(n != null) cur.repsMax = Math.round(n); } break;
      case 'ПОТОЛОК ВЕСА': if(cur){ const n = parseStepNum(val); if(n != null) cur.weightMax = Math.round(n * 2) / 2; } break;
      case 'ПОТОЛОК ВРЕМЕНИ': if(cur){ const n = parseStepNum(val); if(n != null) cur.timeMax = Math.round(n); } break;
      case 'ПРИ ПОТОЛКЕ': case 'ДВОЙНАЯ ПРОГРЕССИЯ':
        if(cur) cur.dualProg = !/нет|no|false|0/i.test(val);
        break;
      case 'ЗАМЕНА': if(cur) cur.swapName = val.slice(0, 60); break;
      case 'ОПИСАНИЕ ЗАМЕНЫ': case 'ЗАМЕНА ОПИСАНИЕ': if(cur) cur.swapDesc = val.slice(0, 600); break;
    }
  }
  finalizeExercise(cur); // последнее упражнение в тексте — цикл закончился, но раскладку сделать нужно
  // выбрасываем пустые варианты
  p.plans = p.plans.filter(pl => pl.exercises.length);
  // Ошибки — человеческим языком, без ключей формата. Ключи («ПРОГРАММА:»,
  // «УПРАЖНЕНИЕ:») жили в тексте ошибки нарочно, чтобы человек понял, чего не
  // хватило; на деле они только пугали. Теперь объясняем смысл, а не синтаксис.
  if(!p.name) errors.push(t('parser.noName'));
  if(!p.plans.length) errors.push(t('parser.noExercises'));
  /* Пределы полей — здесь, а не в каждом разборе отдельно. Через эту функцию
     проходит ВСЁ, что становится программой из текста: ответ нейросети, позиция
     каталога, обмен через programToText. Название в мегабайт приезжает ровно так
     же, как приезжает нормальное, и обрезать его надо там, где текст становится
     программой. */
  sanitizeProgram(p);
  return {program:p, errors};
}

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

  if(q.level) parts.push(`Level: ${aiChoiceEnglish(q.level)}.`);
  else free.push('fitness level');

  if(q.days.length) parts.push(`Training weekdays (canonical tokens): ${q.days.join(', ')}.`);
  else free.push('training days and weekly frequency');

  if(q.dur) parts.push(`Target duration: ${aiDurationEnglish(q.dur)}.`);
  else free.push('workout duration');

  if(q.focus.length) parts.push(`Extra focus: ${aiListEnglish(q.focus)}.`);

  if(q.equip.length) parts.push(`Available equipment: ${aiListEnglish(q.equip)}.`);
  else free.push('equipment; assume a normal home setting if unspecified');

  if(q.limit.length) parts.push(`Limitations/preferences: ${aiListEnglish(q.limit)}.`);

  if(q.style === 'Круговая'){
    parts.push('Structure: circuit. Repeat the whole exercise list; use КРУГИ 2-5 and usually ПОДХОДЫ 1.');
  } else if(q.style === 'Силовая'){
    parts.push('Structure: strength. Complete all sets of one exercise before moving on; use КРУГИ: 1 and usually ПОДХОДЫ 3-4.');
  } else if(q.style === 'Смешанная'){
    parts.push('Structure: mixed. A block with multiple sets repeats for multiple rounds; usually КРУГИ 2-3 and ПОДХОДЫ 2-3, while keeping total volume sensible.');
  } else {
    free.push('workout structure: circuit, strength, or mixed');
  }

  if(q.warm === 'С разминкой'){
    parts.push('Include warm-up exercises at the beginning and mark each with РАЗМИНКА: да. They run once before the rounds.');
  } else if(q.warm === 'Без разминки'){
    parts.push('Do not add warm-up exercises.');
  } else {
    free.push('whether a warm-up is needed and how long it should be');
  }

  if(q.split){
    parts.push('Use different exercise sets on different workout days, split logically by muscle groups or training focus.');
    if(q.rotate) parts.push('Use ЧЕРЕДОВАНИЕ: да, leave ДЕНЬ values empty for variants, and put the shared schedule in ДНИ ТРЕНИРОВОК.');
    else parts.push('Use ЧЕРЕДОВАНИЕ: нет and assign canonical weekday tokens to each variant.');
  } else {
    free.push('whether to split into different day variants or keep one repeating workout');
  }

  let out = 'Build a home-workout program. ' + userForAI() + ' ' + parts.join(' ');
  if(free.length) out += ` Decide these unspecified items yourself using sensible training logic: ${free.join('; ')}.`;
  const context = clampText(($('qContext') && $('qContext').value) || '', AI_CONTEXT_MAX).trim();
  if(context){
    out += ` USER CAPABILITIES / LIMITATIONS CONTEXT: ${context}. Treat this as authoritative self-reported context for exercise selection, starting load, volume, range of motion, impact and progression. Known numeric performance and working-load data are evidence: preserve/reuse them for the same movement and use them to choose conservative positive loads for comparable movements instead of defaulting to ВЕС: 0. Do not diagnose from it. If it describes an injury, pain, or other health limitation, avoid choices that clearly conflict with it and do not claim medical clearance.`;
  }
  if(q.note && q.note.trim()) out += ` Additional user request: ${q.note.trim()}`;
  return out.trim();
}
export const fullAIPrompt = ()=> aiPrompt() + '\n\n=== TASK: CREATE PROGRAM ===\n' + composeRequest();

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
  const {program, errors} = parseProgramText(txt);
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('ai.problemList') + '\n— ' + errors.join('\n— '));
    return;
  }
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
      if(!ex.name) badNames++;
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
    getMaxMain: () => MAX_MAIN,
    getMaxWarm: () => MAX_WARM,
    msgAiEmpty: MSG_AI_EMPTY,
    msgAiNoEx: MSG_AI_NOEX,
    msgAiParse: MSG_AI_PARSE,
    advanceExerciseProgression,
    aiCreateProgramGuard,
    aiExerciseBlocks,
    aiPrompt,
    carryExerciseProgress,
    copyPrompt,
    curPlan,
    getDraft: () => draft,
    ensurePs,
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
    migrateLegacyDualRangeExercise,
    openBuilder,
    openExercise,
    parseProgramText,
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
    parseProgramText,
    parseValue,
    progressionLoadType,
    progShort,
    progressedRepsRange,
    sortWarmFirst,
    valueText
  });
  setProgressBuilderHooks({
    newExId,
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
    dropFreshEx,
    exDirty,
    exRestAfter,
    exerciseLoadLevelState,
    exerciseLoadLevels,
    ensurePs,
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
  registerAction('toggleExerciseMuscle', btn => {
    const id = btn.dataset.muscleId;
    if(!id || !exDraft) return;
    exDraft.muscles = exDraft.muscles.includes(id)
      ? exDraft.muscles.filter(x => x !== id)
      : [...exDraft.muscles, id];
    renderExMuscles();
    syncExDetailsSum();
  });
  registerAction('setExerciseRest', btn => {
    const key = btn.dataset.restKey;
    const boxId = btn.dataset.boxId;
    const v = parseInt(btn.dataset.restValue, 10);
    if(!key || !boxId || !Number.isFinite(v) || !exDraft) return;
    restCustom[key] = false;
    exDraft[key] = v;
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
    exDraft[restModalKey] = Math.max(0, Math.min(600, parseInt($('restModalInput').value) || 0));
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
    exDraft.loadLevel = Math.max(0, Math.min(exerciseLoadLevels(exDraft).length - 1, Math.round(+$('exLoadLevel').value || 0)));
  };
  $('exLoadLevels').onchange = ()=>{ exerciseResistanceScaleOk(true); };
  $('exProgMode').onchange = ()=>{
    const selected = $('exProgMode').value;
    if(selected === 'level_direct'){
      setExerciseProgressionMode(exDraft, 'level');
      exDraft.repsStep = 0;
    }else{
      setExerciseProgressionMode(exDraft, selected);
    }
    ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
    renderProgControls();
  };
  $('exProgEvery').onchange = ()=>{
    exDraft.progEvery = $('exProgEvery').value === '' ? null : Math.max(1, Math.min(PROG_EVERY_MAX, Math.round(+$('exProgEvery').value || 1)));
    renderProgControls();
  };
  $('bProgEvery').onchange = ()=>{
    draft.progression = programProgEvery($('bProgEvery').value);
  };
  $('bRounds').onchange = ()=>{ curPlan().rounds = +$('bRounds').value; syncVolHint(); };
  $('qNote').oninput = e => q.note = clampText(e.target.value, 300);
}
