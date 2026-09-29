'use strict';

const FORMAT='unmute.lexicon.patch.v1';
const ID=/^[a-z0-9][a-z0-9._-]*$/;
const POS=new Set(['noun','verb','adjective','adverb','pronoun','preposition','conjunction','determiner','modal','interjection','phrase','other']);
const FORM_KINDS=new Set(['lemma','inflection','contraction','variant','phrase']);

function clone(value){return JSON.parse(JSON.stringify(value));}
function norm(value){return String(value||'').toLowerCase().replace(/[\u2019\u02bc]/g,"'").replace(/\s+/g,' ').trim();}
function slug(value){
  return norm(value).replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,54)||'item';
}
function asArray(value){return Array.isArray(value)?value:[];}
function text(value){return String(value==null?'':value).trim();}
function unique(list){return [...new Set(list.filter(Boolean))];}

function parseJsonText(raw){
  if(raw && typeof raw==='object' && !Array.isArray(raw)) return clone(raw);
  let value=String(raw||'').trim();
  const fence=String.fromCharCode(96).repeat(3);
  if(value.startsWith(fence)){
    const firstNewline=value.indexOf('\n');
    if(firstNewline>=0) value=value.slice(firstNewline+1);
    if(value.trimEnd().endsWith(fence)) value=value.trimEnd().slice(0,-3);
    value=value.trim();
  }
  if(!value) throw new Error('empty_lexicon_patch');
  try{return JSON.parse(value);}catch(_){throw new Error('bad_lexicon_patch_json');}
}

function normalizePronunciation(source){
  if(!source || typeof source!=='object' || Array.isArray(source)) return null;
  const ipa=text(source.ipa),ruReading=text(source.ruReading);
  return (ipa||ruReading)?{...(ipa?{ipa}:{}),...(ruReading?{ruReading}:{})}:null;
}

function normalizeForm(raw,lemma){
  if(typeof raw==='string'){
    const value=text(raw);
    if(!value) throw new Error('bad_patch_form');
    return {
      text:value,
      kind:norm(value)===norm(lemma)?(value.includes(' ')?'phrase':'lemma'):(value.includes(' ')?'phrase':'variant')
    };
  }
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('bad_patch_form');
  const value=text(raw.text);
  if(!value) throw new Error('bad_patch_form');
  const kind=FORM_KINDS.has(raw.kind)?raw.kind:(norm(value)===norm(lemma)?(value.includes(' ')?'phrase':'lemma'):(value.includes(' ')?'phrase':'variant'));
  const pronunciation=normalizePronunciation(raw.pronunciation || raw);
  return {text:value,kind,...(pronunciation?{pronunciation}:{})};
}

function normalizeExample(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('bad_patch_example');
  const en=text(raw.en),ru=text(raw.ru);
  if(!en||!ru) throw new Error('bad_patch_example');
  return {en,ru};
}

function normalizeSense(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('bad_patch_sense');
  const id=text(raw.id);
  if(id && !ID.test(id)) throw new Error('bad_patch_sense_id');
  const partOfSpeech=text(raw.partOfSpeech);
  if(partOfSpeech && !POS.has(partOfSpeech)) throw new Error('bad_patch_part_of_speech');
  const translations=unique(asArray(raw.translations).map(text));
  if(!translations.length) throw new Error('bad_patch_translations');
  return {
    ...(id?{id}:{}),
    ...(partOfSpeech?{partOfSpeech}:{}),
    translations,
    examples:asArray(raw.examples).map(normalizeExample)
  };
}

function normalizePatchEntry(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('bad_patch_entry');
  const lexemeId=text(raw.lexemeId);
  if(lexemeId && !ID.test(lexemeId)) throw new Error('bad_patch_lexeme_id');
  const lemma=text(raw.lemma);
  if(!lemma) throw new Error('bad_patch_lemma');
  let forms=asArray(raw.forms).map(item=>normalizeForm(item,lemma));
  if(!forms.some(form=>norm(form.text)===norm(lemma))){
    forms.unshift({text:lemma,kind:lemma.includes(' ')?'phrase':'lemma'});
  }
  const byForm=new Map();
  for(const form of forms){
    const key=norm(form.text);
    if(!byForm.has(key)) byForm.set(key,form);
    else{
      const existing=byForm.get(key);
      if(!existing.pronunciation && form.pronunciation) existing.pronunciation=form.pronunciation;
    }
  }
  forms=[...byForm.values()];
  const pronunciation=normalizePronunciation(raw);
  const senses=asArray(raw.senses).map(normalizeSense);
  if(!senses.length) throw new Error('bad_patch_senses');
  return {lexemeId,lemma,forms,pronunciation,senses};
}

function parsePatch(raw){
  const parsed=parseJsonText(raw);
  if(parsed.format!==FORMAT) throw new Error('bad_lexicon_patch_format');
  if(!Array.isArray(parsed.entries) || !parsed.entries.length || parsed.entries.length>120) throw new Error('bad_lexicon_patch_entries');
  return {format:FORMAT,entries:parsed.entries.map(normalizePatchEntry)};
}

function nextId(base,used){
  let id=base,n=2;
  while(used.has(id)) id=base+'-'+n++;
  used.add(id);
  return id;
}

function mergePronunciation(target,incoming,warnings,label){
  if(!incoming) return target;
  const out={...(target||{})};
  for(const field of ['ipa','ruReading']){
    const next=text(incoming[field]);
    if(!next) continue;
    if(!out[field]) out[field]=next;
    else if(out[field]!==next) warnings.push(label+': kept existing '+field);
  }
  return Object.keys(out).length?out:undefined;
}

function addExamples(entry,senseId,examples){
  entry.examples=Array.isArray(entry.examples)?entry.examples:[];
  const known=new Set(entry.examples.map(example=>norm(example.text)+'|'+norm(example.translations&&example.translations.ru)));
  let n=entry.examples.length+1;
  for(const item of examples){
    const key=norm(item.en)+'|'+norm(item.ru);
    if(known.has(key)) continue;
    let id='ai.'+slug(senseId)+'.'+n++;
    const ids=new Set(entry.examples.map(example=>example.id));
    while(ids.has(id)) id='ai.'+slug(senseId)+'.'+n++;
    entry.examples.push({
      id,
      senseId,
      text:item.en,
      translations:{ru:item.ru},
      source:{sourceKind:'manual'}
    });
    known.add(key);
  }
}

function mergeSingleSense(entry,current,patchSense,warnings){
  const sense={...current,translations:{...(current.translations||{})}};
  if(patchSense.partOfSpeech){
    if(!sense.partOfSpeech) sense.partOfSpeech=patchSense.partOfSpeech;
    else if(sense.partOfSpeech!==patchSense.partOfSpeech) warnings.push(entry.id+': kept existing partOfSpeech for '+sense.id);
  }
  sense.translations.ru=unique([...(sense.translations.ru||[]),...patchSense.translations]);
  sense.tags=unique([...(sense.tags||[]),'ai-generated']);
  addExamples(entry,sense.id,patchSense.examples);
  return sense;
}

function makeNewSense(entry,patchSense,index){
  const used=new Set((entry.senses||[]).map(sense=>sense.id));
  let id=patchSense.id;
  if(!id){
    const pos=patchSense.partOfSpeech&&ID.test(patchSense.partOfSpeech)?patchSense.partOfSpeech:'sense';
    id=pos;
    if(used.has(id)) id='sense-'+(index+1);
  }
  if(used.has(id)){
    let n=2,base=id;
    while(used.has(base+'-'+n))n++;
    id=base+'-'+n;
  }
  const sense={
    id,
    ...(patchSense.partOfSpeech?{partOfSpeech:patchSense.partOfSpeech}:{}),
    translations:{ru:patchSense.translations},
    tags:['ai-generated']
  };
  addExamples(entry,id,patchSense.examples);
  return sense;
}

function previewPatch(snapshot,rawPatch){
  const patch=parsePatch(rawPatch);
  const entries=asArray(snapshot&&snapshot.entries);
  const byId=new Map(entries.map(entry=>[entry.id,entry]));
  const byLemma=new Map();
  const surfaceOwners=new Map();
  const usedIds=new Set(entries.map(entry=>entry.id));

  for(const entry of entries){
    const key=norm(entry.lemma);
    const list=byLemma.get(key)||[];
    list.push(entry);
    byLemma.set(key,list);
    for(const form of entry.forms||[]){
      const fk=norm(form.text),owners=surfaceOwners.get(fk)||[];
      if(!owners.includes(entry.id)) owners.push(entry.id);
      surfaceOwners.set(fk,owners);
    }
  }

  const changes=[],conflicts=[],warnings=[];
  for(const item of patch.entries){
    let current=null;
    if(item.lexemeId){
      current=byId.get(item.lexemeId)||null;
      if(!current){
        conflicts.push({lemma:item.lemma,code:'unknown_lexeme_id',detail:item.lexemeId});
        continue;
      }
      if(norm(current.lemma)!==norm(item.lemma)){
        conflicts.push({lemma:item.lemma,code:'lemma_mismatch',detail:current.lemma});
        continue;
      }
    }else{
      const candidates=byLemma.get(norm(item.lemma))||[];
      if(candidates.length>1){
        conflicts.push({lemma:item.lemma,code:'ambiguous_existing_lemma',detail:candidates.map(entry=>entry.id).join(', ')});
        continue;
      }
      current=candidates[0]||null;
    }

    const id=current
      ? current.id
      : nextId((item.lemma.includes(' ')?'phrase.':'lex.')+slug(item.lemma),usedIds);

    const next=current?clone(current):{
      id,revision:1,language:'en',lemma:item.lemma,forms:[],senses:[],examples:[],deprecated:false
    };

    let hardConflict=false;
    for(const form of item.forms){
      const key=norm(form.text);
      const other=(surfaceOwners.get(key)||[]).filter(owner=>owner!==id);
      if(other.length){
        conflicts.push({lemma:item.lemma,surface:form.text,code:'surface_owned_by_other_lexeme',detail:other.join(', ')});
        hardConflict=true;
        continue;
      }
      const existing=(next.forms||[]).find(value=>norm(value.text)===key);
      if(existing){
        existing.pronunciation=mergePronunciation(existing.pronunciation,form.pronunciation,warnings,id+'/'+form.text);
        if(!existing.pronunciation) delete existing.pronunciation;
      }else{
        (next.forms||(next.forms=[])).push(clone(form));
      }
    }
    if(hardConflict) continue;

    next.pronunciation=mergePronunciation(next.pronunciation,item.pronunciation,warnings,id+'/lemma');
    if(!next.pronunciation) delete next.pronunciation;

    if(!current){
      item.senses.forEach((sense,index)=>next.senses.push(makeNewSense(next,sense,index)));
    }else if(next.senses.length===1 && item.senses.length===1){
      next.senses[0]=mergeSingleSense(next,next.senses[0],item.senses[0],warnings);
    }else{
      for(const patchSense of item.senses){
        const target=patchSense.id ? next.senses.find(sense=>sense.id===patchSense.id) : null;
        if(target){
          const idx=next.senses.indexOf(target);
          next.senses[idx]=mergeSingleSense(next,target,patchSense,warnings);
        }else{
          warnings.push(id+': senses not auto-merged because existing lexeme is polysemous; forms/pronunciation were still enriched');
        }
      }
    }

    changes.push({
      id,
      kind:current?'update':'create',
      expectedRevision:current?Math.max(1,+current.revision||1):0,
      entry:next,
      addedForms:item.forms.map(form=>form.text)
    });
  }

  return {
    patch,
    changes,
    conflicts,
    warnings:unique(warnings),
    summary:{
      requested:patch.entries.length,
      creates:changes.filter(change=>change.kind==='create').length,
      updates:changes.filter(change=>change.kind==='update').length,
      conflicts:conflicts.length,
      warnings:unique(warnings).length
    }
  };
}

function pronunciationForSurface(entry,surface){
  const form=(entry.forms||[]).find(item=>norm(item.text)===norm(surface));
  if(form&&form.pronunciation) return form.pronunciation;
  return norm(entry.lemma)===norm(surface) ? (entry.pronunciation||null) : null;
}

function buildAiPrompt(audit,limit=50,options={}){
  const count=Math.max(1,Math.min(100,Math.round(Number(limit)||50)));
  const mode=options.mode==='enrich'?'enrich':'missing';
  const lexicon=options.lexicon||{entries:[]};
  const byId=new Map((lexicon.entries||[]).map(entry=>[entry.id,entry]));

  let targets=[];
  if(mode==='missing'){
    targets=(audit&&audit.missing||[]).slice()
      .sort((a,b)=>b.count-a.count||a.surface.localeCompare(b.surface))
      .slice(0,count)
      .map(item=>({surface:item.surface,count:item.count,contexts:(item.contexts||[]).slice(0,3)}));
  }else{
    targets=(audit&&audit.resolved||[]).map(item=>{
      const id=(item.lexemeIds||[]).length===1?item.lexemeIds[0]:null;
      const entry=id?byId.get(id):null;
      if(!entry)return null;
      const pronunciation=pronunciationForSurface(entry,item.surface)||{};
      const missingFields=[];
      if(!pronunciation.ipa)missingFields.push('ipa');
      if(!pronunciation.ruReading)missingFields.push('ruReading');
      if(!(entry.examples||[]).length)missingFields.push('examples');
      if((entry.senses||[]).some(sense=>!sense.partOfSpeech))missingFields.push('partOfSpeech');
      if(!missingFields.length)return null;
      return {
        surface:item.surface,
        count:item.count,
        contexts:(item.contexts||[]).slice(0,3),
        lexemeId:entry.id,
        lemma:entry.lemma,
        missingFields,
        existingSenses:(entry.senses||[]).map(sense=>({
          id:sense.id,
          partOfSpeech:sense.partOfSpeech||null,
          translations:sense.translations&&sense.translations.ru||[]
        }))
      };
    }).filter(Boolean)
      .sort((a,b)=>b.count-a.count||a.surface.localeCompare(b.surface))
      .slice(0,count);
  }

  if(!targets.length)return {targets:[],prompt:'',mode};

  const schema={
    format:FORMAT,
    entries:[{
      lexemeId:mode==='enrich'?'lex.work':undefined,
      lemma:'work',
      forms:[
        {text:'work',kind:'lemma',ipa:'wɝːk',ruReading:'уёрк'},
        {text:'worked',kind:'inflection',ipa:'wɝːkt',ruReading:'уёркт'}
      ],
      senses:[{
        id:mode==='enrich'?'verb':undefined,
        partOfSpeech:'verb',
        translations:['работать'],
        examples:[{en:'I work from home.',ru:'Я работаю из дома.'}]
      }]
    }]
  };

  const taskLines=mode==='missing'
    ? [
        '- Cover EVERY target surface below exactly once in the returned entries.forms.',
        '- Group inflections/contractions/variants under the correct lemma when appropriate.',
        '- It is OK to introduce the base lemma form even when it is not in the target list.',
        '- Give the common Russian learner meanings needed for the supplied contexts.',
        '- Split genuinely different parts of speech/meanings into separate senses.'
      ]
    : [
        '- Enrich EVERY target below. Use its exact lexemeId in the returned entry.',
        '- Preserve existing sense IDs when the sense already exists. Do NOT merge distinct existing senses.',
        '- Fill the listed missingFields. You may include existing good data, but do not deliberately change it.',
        '- Add a new sense only when the supplied contexts clearly require a meaning not represented by existingSenses.',
        '- Contexts help choose useful examples, but examples must remain correct for the exact sense they are attached to.'
      ];

  const prompt=[
    'You are preparing a production English-Russian learner lexicon for UnMute.',
    'Return ONLY valid JSON. No Markdown, no comments, no text before or after JSON.',
    '',
    'MODE: '+mode,
    'TASK',
    ...taskLines,
    '- Use General American English pronunciation.',
    '- IPA must describe the EXACT form next to it, not merely the lemma.',
    '- ruReading is a short Russian learner-friendly sound hint, not a spelling transliteration.',
    '- Give 1-2 short natural examples per returned sense with accurate Russian translations.',
    '- Preserve apostrophes in contractions.',
    '- Do not invent obscure senses unrelated to these contexts.',
    '',
    'FORM KINDS: lemma | inflection | contraction | variant | phrase',
    'PARTS OF SPEECH: noun | verb | adjective | adverb | pronoun | preposition | conjunction | determiner | modal | interjection | phrase | other',
    '',
    'OUTPUT SHAPE EXAMPLE (data is illustrative only):',
    JSON.stringify(schema,(key,value)=>value===undefined?undefined:value,2),
    '',
    'TARGETS:',
    JSON.stringify(targets,null,2)
  ].join('\n');

  return {targets,prompt,mode};
}

module.exports={FORMAT,parsePatch,previewPatch,buildAiPrompt,norm};
