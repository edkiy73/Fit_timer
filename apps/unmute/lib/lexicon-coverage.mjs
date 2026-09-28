function cleanText(value){
  return String(value == null ? '' : value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;|&#34;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();
}

export function normalizeSurface(value){
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2019\u02bc]/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}

function localizedValues(value){
  if(!value || typeof value!=='object' || Array.isArray(value)) return [];
  return Object.values(value).filter(item=>typeof item==='string');
}

export function activityVisibleStrings(activity){
  if(!activity || typeof activity!=='object') return [];
  const out=[];
  const push=value=>{
    if(typeof value==='string') out.push(value);
    else for(const item of localizedValues(value)) out.push(item);
  };

  push(activity.title);

  switch(activity.type){
    case 'theory':
      push(activity.body);
      break;
    case 'choice':
      push(activity.prompt); push(activity.hint);
      for(const option of activity.options || []) push(option);
      push(activity.explanation);
      break;
    case 'text-input':
      push(activity.prompt); push(activity.source);
      for(const answer of activity.answer?.accepted || []) push(answer);
      push(activity.explanation);
      break;
    case 'translation':
      push(activity.prompt);
      for(const answer of activity.answer?.accepted || []) push(answer);
      push(activity.explanation);
      break;
    case 'speaking':
      push(activity.prompt); push(activity.target);
      for(const answer of activity.answer?.accepted || []) push(answer);
      break;
    case 'pattern-drill':
      push(activity.pattern);
      for(const item of activity.items || []){
        push(item.prompt);
        for(const answer of item.answer?.accepted || []) push(answer);
      }
      break;
    case 'dialogue':
      push(activity.scene);
      for(const line of activity.lines || []){
        push(line.partner); push(line.task); push(line.displayAnswer);
        for(const answer of line.answer?.accepted || []) push(answer);
      }
      break;
    case 'listening':
      push(activity.prompt); push(activity.text);
      for(const answer of activity.answer?.accepted || []) push(answer);
      break;
    case 'ai-conversation':
      push(activity.topic);
      // promptTemplate is model instruction, not learner-visible content.
      for(const focus of activity.focus || []) push(focus);
      break;
    default:
      break;
  }
  return out.map(cleanText).filter(Boolean);
}

export function tokenizeEnglish(value){
  const text=cleanText(value);
  const matches=text.match(/[A-Za-z]+(?:['\u2019][A-Za-z]+)*/g) || [];
  return matches.map(token=>normalizeSurface(token)).filter(Boolean);
}

function contextSnippet(value,token){
  const text=cleanText(value);
  if(text.length<=140) return text;
  const low=text.toLowerCase();
  const at=low.indexOf(token.toLowerCase());
  if(at<0) return text.slice(0,137)+'...';
  const from=Math.max(0,at-55),to=Math.min(text.length,at+token.length+75);
  return (from?'...':'')+text.slice(from,to)+(to<text.length?'...':'');
}

export function buildCourseCorpus(course){
  const surfaces=new Map();
  const activityTexts=new Map();
  let occurrences=0;

  const referencedIds=new Set();
  for(const roadmap of course?.roadmaps || []){
    for(const node of roadmap?.nodes || []){
      for(const activityId of node?.activityIds || []) referencedIds.add(activityId);
    }
  }

  for(const activity of course?.activities || []){
    if(!referencedIds.has(activity.id)) continue;
    const strings=activityVisibleStrings(activity);
    activityTexts.set(activity.id,strings);
    for(const value of strings){
      for(const surface of tokenizeEnglish(value)){
        occurrences++;
        let item=surfaces.get(surface);
        if(!item){
          item={surface,count:0,activityIds:new Set(),contexts:[]};
          surfaces.set(surface,item);
        }
        item.count++;
        item.activityIds.add(activity.id);
        if(item.contexts.length<4){
          const snippet=contextSnippet(value,surface);
          if(snippet && !item.contexts.includes(snippet)) item.contexts.push(snippet);
        }
      }
    }
  }

  return {
    occurrences,
    uniqueSurfaces:surfaces.size,
    surfaces:[...surfaces.values()].map(item=>({
      surface:item.surface,
      count:item.count,
      activityIds:[...item.activityIds],
      contexts:item.contexts
    })).sort((a,b)=>b.count-a.count || a.surface.localeCompare(b.surface)),
    activityTexts
  };
}

export function buildLexiconFormIndex(lexicon){
  const index=new Map();
  for(const entry of lexicon?.entries || []){
    if(entry?.deprecated) continue;
    for(const form of entry?.forms || []){
      const key=normalizeSurface(form?.text);
      if(!key) continue;
      const list=index.get(key) || [];
      if(!list.includes(entry.id)) list.push(entry.id);
      index.set(key,list);
    }
  }
  return index;
}

function phraseForms(lexicon){
  const out=[];
  for(const entry of lexicon?.entries || []){
    if(entry?.deprecated) continue;
    for(const form of entry?.forms || []){
      const key=normalizeSurface(form?.text);
      if(key.includes(' ')) out.push({surface:key,lexemeId:entry.id});
    }
  }
  out.sort((a,b)=>b.surface.split(' ').length-a.surface.split(' ').length || a.surface.localeCompare(b.surface));
  return out;
}

function containsPhrase(text,phrase){
  const hay=' '+normalizeSurface(cleanText(text).replace(/[^A-Za-z'\u2019]+/g,' '))+' ';
  return hay.includes(' '+phrase+' ');
}

export function auditLexicalCoverage(course,lexicon){
  const corpus=buildCourseCorpus(course);
  const index=buildLexiconFormIndex(lexicon);
  const byId=new Map((lexicon?.entries || []).map(entry=>[entry.id,entry]));
  const explicitRefs=new Map();
  for(const activity of course?.activities || []){
    const map=new Map();
    for(const ref of activity.lexiconRefs || []){
      const key=normalizeSurface(ref.surface);
      if(!key) continue;
      const list=map.get(key) || [];
      list.push(ref);
      map.set(key,list);
    }
    explicitRefs.set(activity.id,map);
  }

  const missing=[],ambiguous=[],resolved=[];
  let resolvedOccurrences=0,missingOccurrences=0,ambiguousOccurrences=0;
  let surfacesWithIpa=0,surfacesWithRuReading=0,surfacesWithExamples=0,pinnedSurfaces=0;

  for(const item of corpus.surfaces){
    const ids=index.get(item.surface) || [];
    const entries=ids.map(id=>byId.get(id)).filter(Boolean);
    const pinned=item.activityIds.some(activityId=>(explicitRefs.get(activityId)?.get(item.surface)||[]).length>0);
    if(pinned) pinnedSurfaces++;

    if(!ids.length){
      missing.push(item);
      missingOccurrences+=item.count;
      continue;
    }
    if(ids.length>1 && !pinned){
      ambiguous.push({...item,lexemeIds:ids});
      ambiguousOccurrences+=item.count;
    }else{
      resolved.push({...item,lexemeIds:ids,pinned});
      resolvedOccurrences+=item.count;
    }
    const pronunciations=entries.map(entry=>{
      const form=(entry.forms||[]).find(candidate=>normalizeSurface(candidate.text)===item.surface);
      return form&&form.pronunciation ? form.pronunciation : entry.pronunciation;
    }).filter(Boolean);
    if(pronunciations.some(pronunciation=>pronunciation.ipa)) surfacesWithIpa++;
    if(pronunciations.some(pronunciation=>pronunciation.ruReading)) surfacesWithRuReading++;
    if(entries.some(entry=>(entry.examples || []).length)) surfacesWithExamples++;
  }

  const phrases=[];
  const seenPhrase=new Set();
  for(const phrase of phraseForms(lexicon)){
    for(const [activityId,texts] of corpus.activityTexts){
      const context=texts.find(value=>containsPhrase(value,phrase.surface));
      if(!context) continue;
      const key=phrase.lexemeId+'|'+phrase.surface;
      if(seenPhrase.has(key)) break;
      seenPhrase.add(key);
      phrases.push({surface:phrase.surface,lexemeId:phrase.lexemeId,activityId,context:contextSnippet(context,phrase.surface)});
      break;
    }
  }

  const total=corpus.uniqueSurfaces || 1;
  const pct=value=>Math.round(value/total*1000)/10;
  return {
    occurrences:corpus.occurrences,
    uniqueSurfaces:corpus.uniqueSurfaces,
    resolvedSurfaces:resolved.length,
    ambiguousSurfaces:ambiguous.length,
    missingSurfaces:missing.length,
    resolvedOccurrences,
    ambiguousOccurrences,
    missingOccurrences,
    ipaSurfaces:surfacesWithIpa,
    ruReadingSurfaces:surfacesWithRuReading,
    exampleSurfaces:surfacesWithExamples,
    pinnedSurfaces,
    knownPhrasesUsed:phrases.length,
    coveragePct:pct(resolved.length),
    ipaCoveragePct:pct(surfacesWithIpa),
    ruReadingCoveragePct:pct(surfacesWithRuReading),
    exampleCoveragePct:pct(surfacesWithExamples),
    missing,
    ambiguous,
    phrases,
    topMissing:missing.slice().sort((a,b)=>b.count-a.count || a.surface.localeCompare(b.surface)).slice(0,80)
  };
}

export function compactCoverageReport(audit){
  return {
    occurrences:audit.occurrences,
    uniqueSurfaces:audit.uniqueSurfaces,
    resolvedSurfaces:audit.resolvedSurfaces,
    ambiguousSurfaces:audit.ambiguousSurfaces,
    missingSurfaces:audit.missingSurfaces,
    coveragePct:audit.coveragePct,
    ipaSurfaces:audit.ipaSurfaces,
    ipaCoveragePct:audit.ipaCoveragePct,
    ruReadingSurfaces:audit.ruReadingSurfaces,
    ruReadingCoveragePct:audit.ruReadingCoveragePct,
    exampleSurfaces:audit.exampleSurfaces,
    exampleCoveragePct:audit.exampleCoveragePct,
    pinnedSurfaces:audit.pinnedSurfaces,
    knownPhrasesUsed:audit.knownPhrasesUsed,
    topMissing:audit.topMissing.map(item=>({surface:item.surface,count:item.count,contexts:item.contexts.slice(0,2)}))
  };
}
