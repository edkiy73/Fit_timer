'use strict';

const SOURCE={
  id:'open-dict-data/ipa-dict:en_US',
  repo:'open-dict-data/ipa-dict',
  commit:'43c3570eb3553bdd19fccd2bd0091534889af023',
  path:'data/en_US.txt',
  license:'MIT'
};
SOURCE.url='https://raw.githubusercontent.com/'+SOURCE.repo+'/'+SOURCE.commit+'/'+SOURCE.path;

function clone(value){return JSON.parse(JSON.stringify(value));}
function norm(value){
  return String(value||'').toLowerCase().replace(/[\u2019\u02bc]/g,"'").replace(/\s+/g,' ').trim();
}
function unique(values){return [...new Set(values.filter(Boolean))];}

function parseIpaVariants(raw){
  const values=String(raw||'').split(/\s*,\s*/).map(value=>
    value.trim().replace(/^\/+|\/+$/g,'').trim()
  );
  return unique(values);
}

function parseNeededIpa(sourceText,neededSurfaces){
  const needed=new Set([...neededSurfaces].map(norm).filter(Boolean));
  const found=new Map();
  if(!needed.size)return found;

  for(const line of String(sourceText||'').split(/\r?\n/)){
    if(!line)continue;
    const tab=line.indexOf('\t');
    if(tab<1)continue;
    const surface=norm(line.slice(0,tab));
    if(!needed.has(surface))continue;
    const variants=parseIpaVariants(line.slice(tab+1));
    if(variants.length)found.set(surface,variants);
    if(found.size===needed.size)break;
  }
  return found;
}

function existingPronunciation(entry,surface){
  const key=norm(surface);
  const form=(entry.forms||[]).find(item=>norm(item.text)===key);
  if(form&&form.pronunciation)return form.pronunciation;
  return norm(entry.lemma)===key ? (entry.pronunciation||null) : null;
}

function buildSourcePronunciation(variants,existing){
  const base={...(existing||{})};
  base.ipa=variants[0];
  if(variants.length>1)base.ipaVariants=variants;
  else delete base.ipaVariants;
  base.source={id:SOURCE.id,version:SOURCE.commit,license:SOURCE.license};
  return base;
}

function planIpaEnrichment(lexicon,audit,sourceText){
  const entries=Array.isArray(lexicon&&lexicon.entries)?lexicon.entries:[];
  const byId=new Map(entries.map(entry=>[entry.id,entry]));
  const candidates=(audit&&audit.resolved||[]).filter(item=>
    Array.isArray(item.lexemeIds)&&item.lexemeIds.length===1
  );
  const needed=new Set(candidates.map(item=>item.surface));
  const source=parseNeededIpa(sourceText,needed);

  const changed=new Map();
  let alreadyHaveIpa=0,noSourcePronunciation=0,missingExactForm=0,matchedSource=0;

  for(const item of candidates){
    const entry=byId.get(item.lexemeIds[0]);
    if(!entry)continue;
    const key=norm(item.surface);
    const currentPron=existingPronunciation(entry,key);
    if(currentPron&&currentPron.ipa){
      alreadyHaveIpa++;
      continue;
    }

    const variants=source.get(key);
    if(!variants){
      noSourcePronunciation++;
      continue;
    }
    matchedSource++;

    let work=changed.get(entry.id);
    if(!work){
      work=clone(entry);
      changed.set(entry.id,work);
    }
    const form=(work.forms||[]).find(candidate=>norm(candidate.text)===key);
    if(!form){
      missingExactForm++;
      continue;
    }
    const base=form.pronunciation || (norm(work.lemma)===key ? work.pronunciation : null);
    form.pronunciation=buildSourcePronunciation(variants,base);
  }

  const changes=[...changed.values()].map(entry=>({
    id:entry.id,
    expectedRevision:Math.max(1,+byId.get(entry.id).revision||1),
    entry
  }));

  return {
    changes,
    summary:{
      source:SOURCE.id,
      sourceCommit:SOURCE.commit,
      sourceLicense:SOURCE.license,
      resolvedSurfaces:candidates.length,
      sourceMatches:matchedSource,
      alreadyHaveIpa,
      noSourcePronunciation,
      missingExactForm,
      lexemesChanged:changes.length,
      formsChanged:changes.reduce((sum,change)=>{
        const previous=byId.get(change.id);
        const before=new Map((previous.forms||[]).map(form=>[norm(form.text),form]));
        return sum+(change.entry.forms||[]).filter(form=>{
          const prev=before.get(norm(form.text));
          return !prev?.pronunciation?.ipa && !!form.pronunciation?.ipa;
        }).length;
      },0)
    }
  };
}

async function loadPinnedSource(){
  const response=await fetch(SOURCE.url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('ipa_source_http_'+response.status);
  return response.text();
}

module.exports={SOURCE,norm,parseIpaVariants,parseNeededIpa,planIpaEnrichment,loadPinnedSource};
