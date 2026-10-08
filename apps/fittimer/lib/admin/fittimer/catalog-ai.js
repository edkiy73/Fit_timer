'use strict';

/* ИИ в редакторе каталога: создание, правка и перевод записи.

   Создание и правка идут через ТОТ ЖЕ AI Contract V2, что и в приложении
   (lib/fit-ai-contract.js): один prompt, одна схема ответа, один доменный валидатор,
   один adapter DTO → программа V2. Отдельной «каталожной» схемы нет — запрос от админа
   отличается только постановкой задачи. Перевод — Structured Output по схеме накладки
   языка (lib/fit-catalog-program.js): механика переводу недоступна по построению. */

const FitAIContract = require('../../fit-ai-contract');
const CP = require('../../fit-catalog-program');
const { getSettings, generate } = require('../../../../../packages/core/server/ai');
require('../../fit-ai-test-fixtures');
const { send, fail, clampLine, clampText } = require('../../../../../packages/core/server/util');
const { GOALS, LEVELS, normLocale } = require('./catalog-text');

const ACTIONS = new Set(['translate_catalog','catalog_ai_create','catalog_ai_edit','catalog_import_dto']);
const LANGUAGE = {ru:'Russian', en:'English'};
const rnd = prefix => prefix + Math.random().toString(36).slice(2, 8);
const detail = e => String((e && e.message) || e).slice(0, 500);
const validationMiss = e => (e && e.validation && Array.isArray(e.validation.missing)) ? e.validation.missing.slice(0, 20) : [];

// Готовая программа → ответ редактору: программа + накладка исходного языка
function programReply(res, program, lang, out){
  const cleaned = CP.cleanCatalogProgram(program, {newId:rnd});
  if(!cleaned.program || cleaned.errors.length){
    return fail(res, 502, 'ai_invalid_program', {miss:cleaned.errors.slice(0, 20)});
  }
  const p = cleaned.program;
  return send(res, 200, {ok:true, sourceLocale:lang, program:p, exCount:cleaned.exCount,
    locale:{name:clampLine(p.name, 60), gives:clampText(p.desc, 300), texts:CP.textsOf(p)},
    provider:out && out.provider, model:out && out.model, fallback:out && out.fallback});
}

async function runContract(kind, input){
  const settings = await getSettings();
  return generate('text', settings, FitAIContract.buildPrompt(kind, input), {
    schema:FitAIContract.outputSchema(kind),
    maxOutputTokens:FitAIContract.MAX_OUTPUT_TOKENS[kind],
    validate:r => FitAIContract.checkOutput(kind, r.json, input)
  });
}

const GOAL_LABELS = {
  slim:'weight loss and calorie burn',
  tone:'full-body toning and general fitness',
  glut:'glutes and lower-body shaping',
  core:'core and abdominal strength',
  power:'strength and endurance',
  relief:'muscle definition',
  flex:'mobility, stretching and flexibility',
  back:'posture and back strength',
  post:'postpartum recovery',
  cardio:'cardio and energy'
};

async function createCatalogProgram(body, res){
  const lang = normLocale(body && body.lang);
  const cat = GOALS.includes(String(body && body.cat || '')) ? String(body.cat) : 'tone';
  const level = LEVELS.includes(String(body && body.level || '')) ? String(body.level) : 'Средний';
  const min = Math.max(5, Math.min(180, Math.round(+(body && body.min) || 30)));
  const days = Math.max(1, Math.min(7, Math.round(+(body && body.days) || 3)));
  const limitations = clampText(body && body.limitations, 700).trim();
  const focus = clampText(body && body.focus, 500).trim();
  const instruction = clampText(body && body.instruction, 1200).trim();
  const style = ['circuit','strength','mixed','auto'].includes(String(body && body.style || '')) ? String(body.style) : 'auto';
  const warmup = ['yes','no','auto'].includes(String(body && body.warmup || '')) ? String(body.warmup) : 'auto';
  const levelEn = {Новичок:'beginner', Средний:'intermediate', Продвинутый:'advanced'}[level] || 'intermediate';
  const task = [
    'Create a complete catalog-ready workout program for a public catalog, not an outline.',
    'Goal: ' + (GOAL_LABELS[cat] || cat) + '. Fitness level: ' + levelEn + '.',
    'Target duration per workout: about ' + min + ' minutes. Training frequency: ' + days + ' days per week.',
    style !== 'auto' ? 'Preferred structure: ' + style + '.' : 'Choose the most suitable structure yourself.',
    warmup === 'yes' ? 'Include a warm-up.' : (warmup === 'no' ? 'Do not include a warm-up.' : 'Decide whether a warm-up is appropriate.'),
    focus ? 'Extra focus: ' + focus + '.' : '',
    instruction ? 'Additional request: ' + instruction : '',
    'program.desc is a detailed useful trainee guide, not a sales blurb. Explain suitability, training structure, technique priorities, progression, recovery, realistic expectations and how to track results. Keep the introductory sentence self-contained because the catalog has a separate short “what it gives” field.'
  ].filter(Boolean).join('\n');
  const norm = FitAIContract.normalizeInput('program.create', {
    language:LANGUAGE[lang], task, context:limitations,
    availableLoadEquipment:body && body.availableLoadEquipment,
    availableSupportEquipment:body && body.availableSupportEquipment
  });
  if(norm.error) return fail(res, 400, norm.error);
  try{
    const out = await runContract('program.create', norm.input);
    const made = FitAIContract.programFromCreate(out.json, rnd);
    if(!made.program || made.errors.length) return fail(res, 502, 'ai_invalid_program', {miss:made.errors.slice(0, 20)});
    return programReply(res, made.program, lang, out);
  }catch(e){
    return fail(res, 502, 'ai_create_failed', {detail:detail(e), miss:validationMiss(e)});
  }
}

/* Правка — как в приложении: ИИ возвращает целевое состояние со ссылками на id,
   приложение применяет его к снимку. Тексты исходного языка живут в самой программе,
   поэтому правят программу на исходном языке; второй язык после правки дополняется
   переводом (новые этапы в нём ещё пусты — публикация это покажет). */
async function editCatalogProgram(body, res){
  const mode = String(body && body.mode || 'program');
  if(!['program','exercise'].includes(mode)) return fail(res, 400, 'bad_ai_mode');
  const lang = normLocale(body && body.lang);
  const instruction = clampText(body && body.instruction, 2000).trim();
  if(!instruction) return fail(res, 400, 'missing_instruction');
  const cleaned = CP.cleanCatalogProgram(body && body.program, {newId:rnd});
  if(!cleaned.program) return fail(res, 400, 'bad_program');
  const program = cleaned.program;
  try{
    if(mode === 'exercise'){
      const exId = String(body && body.exerciseId || '');
      let plan = null, index = -1;
      program.plans.forEach(pl => { const i = pl.exercises.findIndex(ex => ex.id === exId); if(i >= 0){ plan = pl; index = i; } });
      if(!plan) return fail(res, 404, 'exercise_not_found');
      const norm = FitAIContract.normalizeInput('exercise.modify', {language:LANGUAGE[lang], task:instruction,
        exercise:FitAIContract.exerciseView(plan.exercises[index])});
      if(norm.error) return fail(res, 400, norm.error);
      const out = await runContract('exercise.modify', norm.input);
      const res2 = FitAIContract.applyExerciseModify(plan.exercises[index], out.json, rnd);
      if(!res2.exercise || res2.errors.length) return fail(res, 502, 'ai_invalid_program', {miss:res2.errors.slice(0, 20)});
      plan.exercises[index] = res2.exercise;
      return programReply(res, program, lang, out);
    }
    const norm = FitAIContract.normalizeInput('program.modify', {language:LANGUAGE[lang], task:instruction,
      program:FitAIContract.programView(program)});
    if(norm.error) return fail(res, 400, norm.error);
    const out = await runContract('program.modify', norm.input);
    const applied = FitAIContract.applyProgramModify(program, out.json, rnd);
    if(!applied.program) return fail(res, 502, 'ai_invalid_program', {miss:applied.errors.slice(0, 20)});
    return programReply(res, applied.program, lang, out);
  }catch(e){
    return fail(res, 502, 'ai_edit_failed', {detail:detail(e), miss:validationMiss(e)});
  }
}

/* Ручной путь без ИИ: Program DTO V2 (то, что даёт «Скопировать программу» в приложении
   или ответ внешнего чата по manual-prompt) → каталожная программа. Та же проверка, что у ИИ. */
function importContract(body, res){
  const lang = normLocale(body && body.lang);
  let json = body && body.json;
  if(typeof json === 'string'){
    let s = json.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if(fence) s = fence[1];
    try{ json = JSON.parse(s); }catch(_){ return fail(res, 400, 'bad_json'); }
  }
  const checked = FitAIContract.checkOutput('program.create', json);
  if(!checked.ok) return fail(res, 400, 'bad_program', {miss:(checked.missing || [checked.reason]).slice(0, 20)});
  const made = FitAIContract.programFromCreate(json, rnd);
  if(!made.program || made.errors.length) return fail(res, 400, 'bad_program', {miss:made.errors.slice(0, 20)});
  return programReply(res, made.program, lang, null);
}

/* Перевод накладки языка. Источник — {name, gives, texts} языка from (для исходного языка
   texts сняты с программы). promptOnly — тот же prompt для ручного перевода во внешнем чате. */
async function translateCatalog(body, res){
  const from = normLocale(body && body.from);
  const to = normLocale(body && body.to);
  if(from === to) return fail(res, 400, 'same_locale');
  const raw = (body && body.locale) || {};
  const source = {name:clampLine(raw.name, 60), gives:clampText(raw.gives, 300), texts:CP.cleanTexts(raw.texts, null)};
  const miss = [];
  // «что даёт» может быть ещё не дописано: переведём то, что есть
  if(!source.name) miss.push(from.toUpperCase() + ': название');
  if(!source.texts.programName || !source.texts.stages.length) miss.push(from.toUpperCase() + ': тексты программы');
  if(miss.length) return fail(res, 400, 'bad_source_locale', {miss});

  const prompt = CP.translationPrompt(from, to, source);
  if(body && body.promptOnly){
    return send(res, 200, {ok:true, prompt:prompt + '\n\nAnswer with ONE JSON object only (no comments), exactly matching this JSON Schema:\n'
      + JSON.stringify(CP.translationSchema().schema)});
  }
  try{
    const settings = await getSettings();
    const out = await generate('text', settings, prompt, {
      schema:CP.translationSchema(),
      maxOutputTokens:16000,
      validate:r => CP.checkTranslation(source, r.json)
    });
    const json = out.json || {};
    const locale = {name:clampLine(json.name, 60), gives:clampText(json.gives, 300), texts:CP.cleanTexts(json.texts, null)};
    // только этапы исходника: лишнее, что придумала модель, не сохраняем
    const known = new Set(source.texts.stages.map(s => s.stageId));
    locale.texts.stages = locale.texts.stages.filter(s => known.has(s.stageId));
    return send(res, 200, {ok:true, locale, provider:out.provider, model:out.model, fallback:out.fallback});
  }catch(e){
    return fail(res, 502, 'translation_failed', {detail:detail(e)});
  }
}

async function handleCatalogTextAI(action, body, res){
  if(!ACTIONS.has(action)) return false;
  if(action === 'translate_catalog') await translateCatalog(body, res);
  else if(action === 'catalog_ai_create') await createCatalogProgram(body, res);
  else if(action === 'catalog_import_dto') importContract(body, res);
  else await editCatalogProgram(body, res);
  return true;
}

module.exports = {handleCatalogTextAI, ACTIONS};
