import vm from 'node:vm';
import { auditLexicalCoverage, compactCoverageReport } from './lexicon-coverage.mjs';
import LEXICON_SUPPLEMENT from './legacy-lexicon-supplement.mjs';

function skipSpace(source,i){
  while(i<source.length){
    const c=source[i],n=source[i+1];
    if(/\s/.test(c)){i++;continue;}
    if(c==='/'&&n==='/'){i+=2;while(i<source.length&&source[i]!=='\n')i++;continue;}
    if(c==='/'&&n==='*'){i+=2;const end=source.indexOf('*/',i);if(end<0)throw new Error('unterminated_comment');i=end+2;continue;}
    break;
  }
  return i;
}

export function readBalanced(source,start,open,close){
  let depth=0,quote=null,escape=false,lineComment=false,blockComment=false;
  for(let i=start;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(c==='\\'){escape=true;continue;}
      if(c===quote){quote=null;continue;}
      continue;
    }
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c===open)depth++;
    if(c===close){
      depth--;
      if(depth===0)return {text:source.slice(start,i+1),end:i+1};
    }
  }
  throw new Error('unterminated_balanced_expression');
}

function readExpression(source,start){
  const i=skipSpace(source,start);
  if(source[i]==='[')return readBalanced(source,i,'[',']');
  if(source[i]==='{')return readBalanced(source,i,'{','}');
  throw new Error('unsupported_expression_at_'+i);
}

function evalLiteral(text,label){
  try{return vm.runInNewContext('('+text+')',Object.create(null),{timeout:1000,filename:label});}
  catch(error){throw new Error('legacy_eval_failed:'+label+':'+error.message);}
}

export function extractConst(source,name){
  const safe=name.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  const re=new RegExp('\\bconst\\s+'+safe+'\\s*=');
  const match=re.exec(source);
  if(!match)throw new Error('missing_const:'+name);
  const out=readExpression(source,match.index+match[0].length);
  return evalLiteral(out.text,name);
}

export function extractAssignObjects(source,name){
  const marker='Object.assign('+name+',';
  const out=[];let at=0;
  while(true){
    const i=source.indexOf(marker,at);if(i<0)break;
    const start=skipSpace(source,i+marker.length);
    const obj=readBalanced(source,start,'{','}');
    out.push(evalLiteral(obj.text,name+'.assign.'+(out.length+1)));
    at=obj.end;
  }
  return out;
}

export function extractPushItems(source,name){
  const marker=name+'.push(';
  const out=[];let at=0;
  while(true){
    const i=source.indexOf(marker,at);if(i<0)break;
    const open=i+marker.length-1;
    const group=readBalanced(source,open,'(',')');
    const args=group.text.slice(1,-1);
    out.push(...evalLiteral('['+args+']',name+'.push.'+(out.length+1)));
    at=group.end;
  }
  return out;
}

function slug(value){
  return String(value||'').toLowerCase().trim().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,54)||'item';
}
function uniqId(base,used){let id=base,n=2;while(used.has(id))id=base+'-'+n++;used.add(id);return id;}
function text(value){return String(value==null?'':value);}

function applyCardPatches(lessons,patches){
  for(const [key,patch] of Object.entries(patches||{})){
    const parts=key.split('#'),lesson=lessons.find(item=>item.id===parts[0]);
    const card=lesson&&lesson.cards&&lesson.cards[Number(parts[1])];
    if(card)Object.assign(card,patch);
  }
}
function appendCards(lessons,blocks){
  for(const block of blocks)for(const [lessonId,cards] of Object.entries(block||{})){
    const lesson=lessons.find(item=>item.id===lessonId);
    if(lesson&&Array.isArray(cards))lesson.cards=(lesson.cards||[]).concat(cards);
  }
}
function applyAlternates(lessons,alt){
  for(const [key,answers] of Object.entries(alt||{})){
    const parts=key.split('#'),lesson=lessons.find(item=>item.id===parts[0]);
    const card=lesson&&lesson.cards&&lesson.cards[Number(parts[1])];
    if(!card||!Array.isArray(card.a)||!Array.isArray(answers))continue;
    for(const answer of answers)if(!card.a.includes(answer))card.a.push(answer);
  }
}

export function parseLegacySource(source){
  const lessons=extractConst(source,'LESSONS');
  lessons.push(...extractPushItems(source,'LESSONS'));

  const explanations=Object.assign({},extractConst(source,'EX'));
  for(const block of extractAssignObjects(source,'EX'))Object.assign(explanations,block);

  appendCards(lessons,[extractConst(source,'MORE_CARDS'),extractConst(source,'MORE_CARDS2'),extractConst(source,'MORE_CARDS3')]);
  applyCardPatches(lessons,Object.fromEntries(Object.entries(explanations).map(([k,ex])=>[k,{ex}])));
  applyCardPatches(lessons,extractConst(source,'FIX'));
  applyAlternates(lessons,extractConst(source,'ALT'));

  const dictionary=Object.assign({},extractConst(source,'DICT'));
  for(const block of extractAssignObjects(source,'DICT'))Object.assign(dictionary,block);

  return {
    lessons,
    patterns:extractConst(source,'PATTERNS'),
    dialogs:extractConst(source,'DIALOGS'),
    aiTalks:extractConst(source,'AI_TALKS'),
    plan:extractConst(source,'PLAN'),
    dictionary,
    phrases:extractConst(source,'PHRASES'),
    verbs:extractConst(source,'VERBS'),
    tags:extractConst(source,'TAGS'),
    phraseTranslations:extractConst(source,'PHRASE_RU')
  };
}

function answerSpec(values){
  const arr=(Array.isArray(values)?values:[values]).map(text).filter(Boolean);
  return {accepted:arr.length?arr:[''],nearMiss:true,caseSensitive:false};
}

function activityFromCard(lesson,card,index,used){
  const id=uniqId('ex.'+lesson.id+'.'+String(index+1).padStart(3,'0'),used);
  const common={id,revision:1,tags:[lesson.id],revisionProgress:'preserve',lexiconRefs:[]};
  if(card.t==='mc'){
    return Object.assign({},common,{type:'choice',prompt:{ru:text(card.q||card.ru||card.task||'')},
      hint:card.ru?{ru:text(card.ru)}:undefined,options:(card.o||[]).map(option=>({ru:text(option)})),
      correctIndex:Number(card.a)||0,explanation:card.ex?{ru:text(card.ex)}:undefined});
  }
  const prompt=text(card.task||card.q||card.ru||'');
  const sourceText=card.q?text(card.q):undefined;
  if(/перевед/i.test(text(card.task))&&card.ru){
    return Object.assign({},common,{type:'translation',direction:'to-target',prompt:{ru:text(card.ru)},
      answer:answerSpec(card.a),explanation:card.ex?{ru:text(card.ex)}:undefined});
  }
  return Object.assign({},common,{type:'text-input',prompt:{ru:prompt},source:sourceText?{ru:sourceText}:undefined,
    answer:answerSpec(card.a),explanation:card.ex?{ru:text(card.ex)}:undefined});
}

function buildActivities(model){
  const used=new Set(),activities=[],lessonActivities=new Map(),lessonCompletion=new Map(),byDay=new Map();
  for(const lesson of model.lessons){
    const ids=[],cardIds=[],theoryId=uniqId('theory.'+lesson.id,used);
    activities.push({id:theoryId,revision:1,type:'theory',tags:[lesson.id],revisionProgress:'preserve',lexiconRefs:[],
      body:{ru:text(lesson.theory||'')},format:'html',title:{ru:text(lesson.t||lesson.id)}});
    ids.push(theoryId);
    for(let i=0;i<(lesson.cards||[]).length;i++){
      const a=activityFromCard(lesson,lesson.cards[i],i,used);
      activities.push(a);ids.push(a.id);cardIds.push(a.id);
    }
    const pattern=model.patterns&&model.patterns[lesson.id];
    if(pattern&&Array.isArray(pattern.items)&&pattern.items.length){
      const pid=uniqId('pattern.'+lesson.id,used);
      activities.push({id:pid,revision:1,type:'pattern-drill',tags:[lesson.id],revisionProgress:'preserve',lexiconRefs:[],
        pattern:{ru:text(pattern.p||lesson.t||lesson.id)},modes:['drill','listening','speaking'],items:pattern.items.map((pair,i)=>({
          id:pid+'.item-'+(i+1),prompt:{ru:text(pair[0])},answer:answerSpec(pair[1])
        }))});
      ids.push(pid);
      lessonCompletion.set(lesson.id,{cardIds,patternId:pid});
    }else{
      lessonCompletion.set(lesson.id,{cardIds,patternId:null});
    }
    lessonActivities.set(lesson.id,ids);
  }

  for(const dialog of model.dialogs||[]){
    const id=uniqId('dialogue.'+dialog.id,used);
    activities.push({id,revision:1,type:'dialogue',tags:['dialogue'],revisionProgress:'preserve',lexiconRefs:[],
      scene:{ru:text(dialog.t||dialog.id)},lines:(dialog.lines||[]).map((line,i)=>({
        id:id+'.line-'+(i+1),partner:{ru:text(line.q||'')},task:line.task?{ru:text(line.task)}:undefined,
        answer:answerSpec(line.a),displayAnswer:text(line.ans||'')
      }))});
    if(Number.isInteger(dialog.day)){if(!byDay.has(dialog.day))byDay.set(dialog.day,[]);byDay.get(dialog.day).push(id);}
  }

  for(const talk of model.aiTalks||[]){
    const id=uniqId('ai.'+talk.id,used);
    activities.push({id,revision:1,type:'ai-conversation',tags:['ai'],revisionProgress:'preserve',lexiconRefs:[],
      topic:{ru:text(talk.title||talk.topic||talk.id)},promptTemplate:text(talk.topic||''),focus:(talk.focus||[]).map(text)});
    if(Number.isInteger(talk.day)){if(!byDay.has(talk.day))byDay.set(talk.day,[]);byDay.get(talk.day).push(id);}
  }
  return {activities,lessonActivities,lessonCompletion,byDay};
}

function normalizePhrase(value){
  return text(value).toLowerCase().replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
}

export function buildPhraseBankResource(model,lexicon){
  const byLemma=new Map();
  for(const entry of lexicon&&lexicon.entries||[]){
    const key=normalizePhrase(entry.lemma);
    if(!byLemma.has(key))byLemma.set(key,[]);
    byLemma.get(key).push(entry);
  }

  const groups=[];
  for(let groupIndex=0;groupIndex<(model.phrases||[]).length;groupIndex++){
    const group=model.phrases[groupIndex]||{};
    const items=[];
    for(const pair of group.items||[]){
      const en=text(pair&&pair[0]).trim();
      const ru=text(pair&&pair[1]).trim();
      if(!en)continue;
      const candidates=byLemma.get(normalizePhrase(en))||[];
      if(candidates.length!==1)throw new Error('phrase_resource_lexeme_resolution:'+en+':'+candidates.length);
      const entry=candidates[0];
      const senses=(entry.senses||[]).filter(sense=>
        !ru || (sense.translations&&Array.isArray(sense.translations.ru)&&sense.translations.ru.includes(ru)));
      if(senses.length>1)throw new Error('phrase_resource_sense_resolution:'+en+':'+senses.length);
      items.push({
        lexemeId:entry.id,
        ...(senses.length===1?{senseId:senses[0].id}:{})
      });
    }
    groups.push({
      id:'phrase-group-'+String(groupIndex+1).padStart(2,'0'),
      title:{ru:text(group.g||('Группа '+(groupIndex+1)))},
      items
    });
  }

  return {
    id:'phrase-bank',
    type:'phrase-collection',
    title:{ru:'Банк фраз'},
    groups
  };
}

function splitVerbForms(value){
  return text(value).split(/\s*\/\s*/).map(item=>item.trim()).filter(Boolean);
}

function ensureVerbForm(entry,id,surface,kind){
  const normalized=normalizePhrase(surface);
  const byId=(entry.forms||[]).find(form=>form.id===id);
  if(byId){
    if(normalizePhrase(byId.text)!==normalized) throw new Error('verb_form_id_collision:'+entry.lemma+':'+id);
    return byId;
  }
  const existing=(entry.forms||[]).find(form=>normalizePhrase(form.text)===normalized && !form.id);
  const lemmaSurface=normalizePhrase(entry.lemma);
  if(existing && (id==='base' || normalized!==lemmaSurface)){
    existing.id=id;
    existing.kind=kind;
    return existing;
  }
  const form={id,text:surface,kind};
  entry.forms.push(form);
  return form;
}

function enrichIrregularVerbForms(model,lexicon){
  const byLemma=new Map();
  for(const entry of lexicon.entries||[]){
    const key=normalizePhrase(entry.lemma);
    if(!byLemma.has(key))byLemma.set(key,[]);
    byLemma.get(key).push(entry);
  }

  for(const row of model.verbs||[]){
    const base=text(row&&row[0]).trim();
    const past=splitVerbForms(row&&row[1]);
    const participle=splitVerbForms(row&&row[2]);
    const candidates=byLemma.get(normalizePhrase(base))||[];
    if(candidates.length!==1)throw new Error('verb_resource_lexeme_resolution:'+base+':'+candidates.length);
    const entry=candidates[0];
    ensureVerbForm(entry,'base',base,'lemma');
    past.forEach((surface,index)=>ensureVerbForm(entry,past.length===1?'past':'past-'+(index+1),surface,'inflection'));
    participle.forEach((surface,index)=>ensureVerbForm(entry,participle.length===1?'participle':'participle-'+(index+1),surface,'inflection'));
  }
  return lexicon;
}

export function buildVerbTableResource(model,lexicon){
  const byLemma=new Map((lexicon.entries||[]).map(entry=>[normalizePhrase(entry.lemma),entry]));
  const items=[];
  for(const row of model.verbs||[]){
    const base=text(row&&row[0]).trim();
    const past=splitVerbForms(row&&row[1]);
    const participle=splitVerbForms(row&&row[2]);
    const entry=byLemma.get(normalizePhrase(base));
    if(!entry)throw new Error('verb_resource_lexeme_missing:'+base);
    const required=[
      'base',
      ...past.map((_,index)=>past.length===1?'past':'past-'+(index+1)),
      ...participle.map((_,index)=>participle.length===1?'participle':'participle-'+(index+1))
    ];
    const formIds=new Set((entry.forms||[]).map(form=>form.id).filter(Boolean));
    for(const id of required)if(!formIds.has(id))throw new Error('verb_resource_form_missing:'+base+':'+id);
    items.push({
      lexemeId:entry.id,
      baseFormId:'base',
      pastFormIds:past.map((_,index)=>past.length===1?'past':'past-'+(index+1)),
      participleFormIds:participle.map((_,index)=>participle.length===1?'participle':'participle-'+(index+1))
    });
  }
  return {id:'irregular-verbs',type:'verb-table',title:{ru:'Неправильные глаголы'},items};
}

export function buildCourseSet(model,lexicon=null){
  const built=buildActivities(model),activities=built.activities,nodes=[];
  let previous=null;
  for(let i=0;i<model.plan.length;i++){
    const day=i+1,plan=model.plan[i]||{},activityIds=[];
    const planId='plan.day-'+day;
    const examples=Array.isArray(plan.ex)&&plan.ex.length?'\n\n'+plan.ex.map(x=>'• '+text(x)).join('\n'):'';
    activities.push({id:planId,revision:1,type:'theory',tags:['plan'],revisionProgress:'preserve',lexiconRefs:[],
      title:{ru:'День '+day},body:{ru:text(plan.g||'')+examples},format:'text'});
    activityIds.push(planId);
    const completionRequirements=[];
    for(const lessonId of plan.ids||[]){
      activityIds.push(...(built.lessonActivities.get(lessonId)||[]));
      const completion=built.lessonCompletion.get(lessonId);
      if(completion&&completion.cardIds.length){
        completionRequirements.push({kind:'activity-seen',activityIds:completion.cardIds});
      }
      if(completion&&completion.patternId){
        completionRequirements.push({
          kind:'practice-started',
          activityId:completion.patternId,
          modes:['drill','listening','speaking']
        });
      }
    }
    activityIds.push(...(built.byDay.get(day)||[]));
    if(!(plan.ids||[]).length){
      const rid='review.day-'+day;
      activities.push({id:rid,revision:1,type:'review',tags:['review'],revisionProgress:'preserve',lexiconRefs:[],
        source:{activityIds:[],tags:[],dueOnly:true}});
      activityIds.push(rid);
      completionRequirements.push({kind:'manual'});
    }
    const id='day-'+day;
    nodes.push({id,kind:(plan.ids||[]).length?'lesson':'review',title:{ru:'День '+day},dayIndex:day,order:i,
      prerequisites:previous?[previous]:[],activityIds,
      completion:{mode:'all',requirements:completionRequirements},
      optional:false});
    previous=id;
  }
  return {
    schemaVersion:1,id:'general-foundation',revision:1,slug:'general-foundation',
    title:{ru:'Общий английский A1–B1/B2'},description:{ru:'Основной разговорный курс, перенесённый из English Trainer.'},
    level:{from:'a1',to:'b2',labels:['A1–B1/B2']},
    access:{mode:'entitlement',entitlement:'course.general-foundation',
      freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}},
    defaultRoadmapId:'main',
    roadmaps:[{id:'main',title:{ru:'Основной путь'},nodes}],
    activities,
    resources:lexicon ? [
      ...(Array.isArray(model.phrases)&&model.phrases.length ? [buildPhraseBankResource(model,lexicon)] : []),
      ...(Array.isArray(model.verbs)&&model.verbs.length ? [buildVerbTableResource(model,lexicon)] : [])
    ] : []
  };
}

function splitLegacyMeanings(raw){return text(raw).split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean);}
function lexemeFromDict(word,value,used){
  const arr=Array.isArray(value)?value:[text(value),'',''],translation=arr[0]||'',ipa=arr[1]||'',ruReading=arr[2]||'';
  const id=uniqId('lex.'+slug(word),used),meanings=splitLegacyMeanings(translation);
  return {id,revision:1,language:'en',lemma:text(word),forms:[{text:text(word),kind:text(word).includes(' ')?'phrase':'lemma'}],
    pronunciation:(ipa||ruReading)?{ipa:text(ipa),ruReading:text(ruReading)}:undefined,
    senses:(meanings.length?meanings:['']).map((meaning,i)=>({
      id:'sense-'+(i+1),translations:{ru:[meaning||translation||word]},tags:meanings.length>1?['needs-review']:[]
    })),examples:[],deprecated:false};
}

function addPhraseLexeme(entries,used,en,ru){
  const surface=text(en).trim();if(!surface)return;
  const normalized=surface.toLowerCase().replace(/[.!?]+$/,'').trim();
  const translation=text(ru).trim();
  const existing=entries.find(entry=>entry.lemma.toLowerCase()===normalized);
  if(existing){
    const known=existing.senses.some(sense=>Array.isArray(sense.translations&&sense.translations.ru)
      && sense.translations.ru.includes(translation));
    if(!known&&translation){
      existing.senses.push({id:'sense-'+(existing.senses.length+1),partOfSpeech:'phrase',
        translations:{ru:[translation]},tags:['needs-review']});
    }
    if(!existing.forms.some(form=>form.text.toLowerCase()===normalized)){
      existing.forms.push({text:normalized,kind:'phrase'});
    }
    return;
  }
  const id=uniqId('phrase.'+slug(normalized),used);
  entries.push({id,revision:1,language:'en',lemma:normalized,forms:[{text:normalized,kind:'phrase'}],
    senses:[{id:'sense-1',partOfSpeech:'phrase',translations:{ru:[translation]},tags:[]}],examples:[],deprecated:false});
}

const LEGACY_VERB_FALLBACK_RU={
  become:['становиться'],
  feel:['чувствовать'],
  win:['выигрывать','побеждать']
};

function addMissingIrregularVerbLexemes(model,entries,used){
  const byLemma=new Set(entries.map(entry=>normalizePhrase(entry.lemma)));
  for(const row of model.verbs||[]){
    const base=text(row&&row[0]).trim();
    const key=normalizePhrase(base);
    if(!base || byLemma.has(key))continue;
    const translations=LEGACY_VERB_FALLBACK_RU[key];
    if(!translations)throw new Error('missing_verb_translation:'+base);
    entries.push({
      id:uniqId('lex.'+slug(base),used),
      revision:1,
      language:'en',
      lemma:base,
      forms:[{text:base,kind:'lemma'}],
      senses:[{
        id:'verb',
        partOfSpeech:'verb',
        translations:{ru:translations},
        tags:['needs-review']
      }],
      examples:[],
      deprecated:false
    });
    byLemma.add(key);
  }
}

// Course text uses many surfaces the legacy DICT never had (inflections, contractions,
// grammar endings, names). The reviewed supplement makes every visible surface resolvable.
function applyLexiconSupplement(entries,used,supplement=LEXICON_SUPPLEMENT){
  for(const [lemma,forms] of Object.entries(supplement.forms||{})){
    const key=normalizePhrase(lemma);
    const candidates=entries.filter(entry=>normalizePhrase(entry.lemma)===key);
    // Absent lemma = a different source (tests, fixtures); the coverage gate reports real gaps.
    if(!candidates.length)continue;
    if(candidates.length>1)throw new Error('supplement_lemma_resolution:'+lemma+':'+candidates.length);
    const entry=candidates[0];
    for(const surface of forms){
      if(!entry.forms.some(form=>normalizePhrase(form.text)===normalizePhrase(surface)))entry.forms.push({text:surface,kind:'inflection'});
    }
  }
  for(const [lemma,partOfSpeech,ru,extraForms=[],extraKind='inflection'] of supplement.lexemes||[]){
    entries.push({
      id:uniqId('lex.'+slug(lemma),used),
      revision:1,
      language:'en',
      lemma,
      forms:[{text:lemma,kind:lemma.includes("'")?'contraction':'lemma'},...extraForms.map(surface=>({text:surface,kind:extraKind}))],
      senses:ru.split('; ').map((translation,index)=>({id:'sense-'+(index+1),partOfSpeech,translations:{ru:[translation]},tags:[]})),
      examples:[],
      deprecated:false
    });
  }
}

// Legacy DICT also lists irregular past/participle forms (went, seen) as separate words, while
// the verb table attaches the same surfaces to the verb. Keep the verb lexeme as the single
// owner; the stand-alone headword stays under its ID as deprecated and hands over its IPA.
function retireIrregularFormHeadwords(model,lexicon){
  const byLemma=new Map(lexicon.entries.map(entry=>[normalizePhrase(entry.lemma),entry]));
  for(const row of model.verbs||[]){
    const verb=byLemma.get(normalizePhrase(text(row&&row[0])));
    if(!verb)continue;
    for(const surface of [...splitVerbForms(row[1]),...splitVerbForms(row[2])]){
      const key=normalizePhrase(surface);
      if(key===normalizePhrase(verb.lemma))continue;
      const duplicate=lexicon.entries.find(entry=>entry!==verb&&!entry.deprecated
        &&entry.forms.length===1&&normalizePhrase(entry.forms[0].text)===key);
      if(!duplicate)continue;
      duplicate.deprecated=true;
      const form=verb.forms.find(item=>normalizePhrase(item.text)===key);
      if(form&&!form.pronunciation&&duplicate.pronunciation)form.pronunciation={...duplicate.pronunciation};
    }
  }
  return lexicon;
}

export function buildLexicon(model){
  const used=new Set(),entries=[];
  for(const [word,value] of Object.entries(model.dictionary||{}))entries.push(lexemeFromDict(word,value,used));
  for(const group of model.phrases||[])for(const pair of group.items||[])addPhraseLexeme(entries,used,pair[0],pair[1]);
  for(const [en,ru] of Object.entries(model.phraseTranslations||{}))addPhraseLexeme(entries,used,en,ru);
  addMissingIrregularVerbLexemes(model,entries,used);
  applyLexiconSupplement(entries,used);
  return retireIrregularFormHeadwords(model,enrichIrregularVerbForms(model,{schemaVersion:1,revision:1,entries}));
}

export function buildImportReport(model,course,lexicon){
  const ambiguous=lexicon.entries.filter(entry=>entry.senses.some(s=>s.tags&&s.tags.includes('needs-review')));
  const planned=new Set(model.plan.flatMap(day=>day.ids||[]));
  const coverage=compactCoverageReport(auditLexicalCoverage(course,lexicon));
  return {lessons:model.lessons.length,cards:model.lessons.reduce((n,l)=>n+(l.cards||[]).length,0),
    planDays:model.plan.length,patterns:Object.keys(model.patterns||{}).length,dialogs:(model.dialogs||[]).length,
    aiTalks:(model.aiTalks||[]).length,dictionaryEntries:Object.keys(model.dictionary||{}).length,
    courseActivities:course.activities.length,lexiconEntries:lexicon.entries.length,lexiconNeedsReview:ambiguous.length,
    phraseBankGroups:(model.phrases||[]).length,
    phraseBankItems:(model.phrases||[]).reduce((sum,group)=>sum+(group.items||[]).length,0),
    phraseBankResourceItems:(course.resources||[]).filter(resource=>resource.type==='phrase-collection')
      .reduce((sum,resource)=>sum+(resource.groups||[]).reduce((groupSum,group)=>groupSum+(group.items||[]).length,0),0),
    irregularVerbs:(model.verbs||[]).length,
    irregularVerbResourceItems:(course.resources||[]).filter(resource=>resource.type==='verb-table')
      .reduce((sum,resource)=>sum+(resource.items||[]).length,0),
    lexicalCoverage:coverage,
    unplannedLessons:model.lessons.map(x=>x.id).filter(id=>!planned.has(id))};
}

export function validateImport(model,course,lexicon){
  const report=buildImportReport(model,course,lexicon);
  if(report.planDays!==40)throw new Error('unexpected_plan_days:'+report.planDays);
  if(report.lessons<30)throw new Error('unexpected_lessons:'+report.lessons);
  if(report.cards<400)throw new Error('unexpected_cards:'+report.cards);
  if(report.dictionaryEntries<500)throw new Error('unexpected_dictionary:'+report.dictionaryEntries);
  if(report.phraseBankResourceItems!==report.phraseBankItems)throw new Error('phrase_bank_resource_mismatch:'+report.phraseBankResourceItems+':'+report.phraseBankItems);
  if(report.irregularVerbResourceItems!==report.irregularVerbs)throw new Error('verb_resource_mismatch:'+report.irregularVerbResourceItems+':'+report.irregularVerbs);
  if(!course.roadmaps[0]||course.roadmaps[0].nodes.length!==40)throw new Error('bad_roadmap_days');
  const ids=new Set(course.activities.map(x=>x.id));
  if(ids.size!==course.activities.length)throw new Error('duplicate_course_activity');
  return report;
}
