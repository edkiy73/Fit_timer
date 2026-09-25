'use strict';

const FitAIProtocol = require('../../ai-protocol');
const { getSettings, generate } = require('../../ai');
require('../../fit-ai-test-fixtures');
const { send, fail, clampLine, clampText } = require('../../util');
const {
  GOALS,LEVELS,normLocale,cleanLocaleBlock,localeMiss,
  translationFieldsFromText,applyTranslationFields,
  translationPayload,translationPayloadComplete,protocolShape
} = require('./catalog-text');

const ACTIONS = new Set(['translate_catalog','catalog_ai_create','catalog_ai_edit']);
const clean=(v,n)=>String(v==null?'':v).slice(0,n);

function exerciseBlockRange(text,exerciseName){
  const lines=String(text||'').split(/\r?\n/);
  const target=String(exerciseName||'').trim().toLowerCase();
  let start=-1,end=lines.length;
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^УПРАЖНЕНИЕ:\s*(.*)$/i);
    if(!m)continue;
    if(start<0&&m[1].trim().toLowerCase()===target){start=i;continue;}
    if(start>=0){end=i;break;}
  }
  return {lines,start,end};
}

function replaceExerciseBlock(text,exerciseName,candidate){
  const src=exerciseBlockRange(text,exerciseName);
  if(src.start<0)return text;
  const sourceBlock=src.lines.slice(src.start,src.end).join('\n');
  const merged=FitAIProtocol.carryExerciseFields(sourceBlock,candidate).split('\n');
  return src.lines.slice(0,src.start).concat(merged,src.lines.slice(src.end)).join('\n');
}

async function translateCatalog(body,res){
  const from=normLocale(body&&body.from);
  const to=normLocale(body&&body.to);
  if(from===to)return fail(res,400,'same_locale');
  const source=cleanLocaleBlock(body&&body.locale);
  const bad=localeMiss(source,from.toUpperCase());
  if(bad.length)return fail(res,400,'bad_source_locale',{miss:bad});

  const names={ru:'Russian',en:'English'};
  const sourceFields=translationPayload(source);
  const prompt=[
    'Translate the user-visible fitness text from '+names[from]+' to '+names[to]+'.',
    'Return ONLY valid JSON with exactly these top-level keys: name, gives, programName, programDescription, exercises. No Markdown.',
    'Each exercises item MUST contain exactly: index, name, description, mistakes, replacementName, replacementDescription.',
    'Keep every exercise index and array order unchanged.',
    'Translate ONLY human-readable prose and names. Do not translate or invent machine fields, muscles, weekdays, numbers, weights, reps, rest, format tokens, booleans, progression settings or workout mechanics.',
    'If a source string is empty, return an empty string for that field.',
    'Do not summarize, improve, reinterpret or rewrite the workout. Translate meaning faithfully.',
    'SOURCE JSON:',
    JSON.stringify(sourceFields)
  ].join('\n');

  try{
    const settings=await getSettings();
    const out=await generate('text',settings,prompt);
    const raw=String(out.text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
    let parsed;
    try{parsed=JSON.parse(raw);}catch(_){return fail(res,502,'translation_bad_json');}
    if(!translationPayloadComplete(source,parsed))return fail(res,502,'translation_incomplete');

    const locale={
      name:clampLine(parsed.name,60),
      gives:clampText(parsed.gives,300),
      text:applyTranslationFields(source.text,parsed)
    };
    const miss=localeMiss(locale,to.toUpperCase());
    if(miss.length)return fail(res,502,'translation_incomplete',{miss});
    if(JSON.stringify(protocolShape(source.text))!==JSON.stringify(protocolShape(locale.text))){
      return fail(res,502,'translation_changed_structure');
    }
    return send(res,200,{ok:true,locale,provider:out.provider,model:out.model,fallback:out.fallback});
  }catch(e){
    return fail(res,502,'translation_failed',{detail:String(e.message||e).slice(0,500)});
  }
}

async function createCatalogProgram(body,res){
  const lang=normLocale(body&&body.lang);
  const language=lang==='ru'?'Russian':'English';
  const cat=GOALS.includes(String(body&&body.cat||''))?String(body.cat):'tone';
  const level=LEVELS.includes(String(body&&body.level||''))?String(body.level):'Средний';
  const min=Math.max(5,Math.min(180,Math.round(+body.min||30)));
  const days=Math.max(1,Math.min(7,Math.round(+body.days||3)));
  const equipment=clampText(body&&body.equipment,500).trim();
  const limitations=clampText(body&&body.limitations,700).trim();
  const focus=clampText(body&&body.focus,500).trim();
  const instruction=clampText(body&&body.instruction,1200).trim();
  const style=['circuit','strength','mixed','auto'].includes(String(body&&body.style||''))?String(body.style):'auto';
  const warmup=['yes','no','auto'].includes(String(body&&body.warmup||''))?String(body.warmup):'auto';
  const levelEn={Новичок:'beginner',Средний:'intermediate',Продвинутый:'advanced'}[level]||'intermediate';
  const goalLabels={
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
  const request=[
    '=== ADMIN CATALOG REQUEST ===',
    'Create a complete catalog-ready workout program, not an outline.',
    'Goal: '+(goalLabels[cat]||cat)+'.',
    'Fitness level: '+levelEn+'.',
    'Target duration per workout: about '+min+' minutes.',
    'Training frequency: '+days+' days per week. Choose sensible canonical weekday tokens.',
    style!=='auto'?'Preferred structure: '+style+'.':'Choose the most suitable structure yourself.',
    warmup==='yes'?'Include a warm-up and mark warm-up exercises with РАЗМИНКА: да.'
      :(warmup==='no'?'Do not include a warm-up.':'Decide whether a warm-up is appropriate.'),
    equipment?'Available equipment: '+equipment+'.':'Equipment: normal home setting; bodyweight is always available.',
    limitations?'Limitations/preferences: '+limitations+'.':'No additional stated limitations.',
    focus?'Extra focus: '+focus+'.':'',
    instruction?'Additional admin request: '+instruction+'.':'',
    'Make the program internally coherent and ready for human review in the catalog editor.'
  ].filter(Boolean).join('\n');

  const prompt=FitAIProtocol.programPrompt(language)+'\n\n'+request;
  try{
    const settings=await getSettings();
    const out=await generate('text',settings,prompt);
    const checked=FitAIProtocol.validateProgramResponse(out.text,{requireWeightCeiling:true});
    if(!checked.ok)return fail(res,502,'ai_invalid_program',{detail:checked.reason,miss:checked.missing||[]});

    const fields=translationFieldsFromText(checked.text);
    const locale=cleanLocaleBlock({
      name:fields.programName||'',
      gives:fields.programDescription||'',
      text:checked.text
    });
    const miss=localeMiss(locale,lang.toUpperCase());
    if(miss.length)return fail(res,502,'ai_incomplete',{miss});
    return send(res,200,{ok:true,locale,provider:out.provider,model:out.model,fallback:out.fallback});
  }catch(e){
    return fail(res,502,'ai_create_failed',{detail:String(e.message||e).slice(0,500)});
  }
}

async function editCatalogProgram(body,res){
  const mode=String(body&&body.mode||'program');
  if(!['program','exercise'].includes(mode))return fail(res,400,'bad_ai_mode');

  const locale=cleanLocaleBlock(body&&body.locale);
  const bad=localeMiss(locale,'AI');
  if(bad.length)return fail(res,400,'bad_source_locale',{miss:bad});

  const instruction=clean(body&&body.instruction,2000).trim();
  if(!instruction)return fail(res,400,'missing_instruction');

  const exercise=clampLine(body&&body.exercise,120);
  const editLocale=normLocale(body&&body.lang);
  const language=editLocale==='ru'?'Russian':'English';

  try{
    const settings=await getSettings();

    if(mode==='exercise'){
      const range=exerciseBlockRange(locale.text,exercise);
      if(range.start<0)return fail(res,404,'exercise_not_found');

      const sourceBlock=range.lines.slice(range.start,range.end).join('\n');
      const prompt=[
        'Edit exactly ONE Fit Timer exercise according to the instruction.',
        'Return ONLY valid JSON: {"block":"..."}. No Markdown.',
        FitAIProtocol.machineLanguageRules(language),
        FitAIProtocol.exerciseSchema(language),
        FitAIProtocol.progressionRules(),
        FitAIProtocol.editRules(),
        'Instruction: '+instruction,
        '=== CURRENT EXERCISE ===\n'+sourceBlock
      ].join('\n\n');

      const out=await generate('text',settings,prompt);
      const raw=String(out.text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
      let parsed;
      try{parsed=JSON.parse(raw);}catch(_){return fail(res,502,'ai_bad_json');}

      const block=String(parsed.block||'').trim();
      if(!block)return fail(res,502,'ai_incomplete');
      const count=(block.match(/^УПРАЖНЕНИЕ:\s*/gm)||[]).length;
      if(count!==1)return fail(res,502,'ai_wrong_exercise_count',{count});

      const text=replaceExerciseBlock(locale.text,exercise,block);
      const edited={name:locale.name,gives:locale.gives,text};
      return send(res,200,{ok:true,locale:edited,provider:out.provider,model:out.model,fallback:out.fallback});
    }

    const prompt=[
      'Edit this Fit Timer catalog program according to the instruction.',
      'Return ONLY valid JSON with exactly the keys name, gives, text. No Markdown.',
      FitAIProtocol.machineLanguageRules(language),
      FitAIProtocol.programSchema(language),
      FitAIProtocol.progressionRules(),
      FitAIProtocol.editRules(),
      'Instruction: '+instruction,
      'PROGRAM JSON:',
      JSON.stringify(locale)
    ].join('\n\n');

    const out=await generate('text',settings,prompt);
    const raw=String(out.text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
    let parsed;
    try{parsed=JSON.parse(raw);}catch(_){return fail(res,502,'ai_bad_json');}

    const rawEdited=cleanLocaleBlock(parsed);
    const miss=localeMiss(rawEdited,'AI');
    if(miss.length)return fail(res,502,'ai_incomplete',{miss});
    const checked=FitAIProtocol.validateProgramResponse(rawEdited.text);
    if(!checked.ok)return fail(res,502,'ai_invalid_program',{detail:checked.reason,miss:checked.missing||[]});

    const edited={name:rawEdited.name,gives:rawEdited.gives,text:rawEdited.text};
    return send(res,200,{ok:true,locale:edited,provider:out.provider,model:out.model,fallback:out.fallback});
  }catch(e){
    return fail(res,502,'ai_edit_failed',{detail:String(e.message||e).slice(0,500)});
  }
}

async function handleCatalogTextAI(action,body,res){
  if(!ACTIONS.has(action))return false;
  if(action==='translate_catalog')await translateCatalog(body,res);
  else if(action==='catalog_ai_create')await createCatalogProgram(body,res);
  else await editCatalogProgram(body,res);
  return true;
}

module.exports={handleCatalogTextAI,ACTIONS,exerciseBlockRange,replaceExerciseBlock};
