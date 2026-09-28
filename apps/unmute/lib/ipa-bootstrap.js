'use strict';

const IPA_SOURCE_SHA='43c3570eb3553bdd19fccd2bd0091534889af023';
const IPA_SOURCE_URL='https://raw.githubusercontent.com/open-dict-data/ipa-dict/'+IPA_SOURCE_SHA+'/data/en_US.txt';

function normalize(value){
  return String(value||'').toLowerCase().replace(/[\u2019\u02bc]/g,"'").replace(/\s+/g,' ').trim();
}
function clone(value){return JSON.parse(JSON.stringify(value));}

async function defaultLoadIpaSource(){
  const response=await fetch(IPA_SOURCE_URL,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('ipa_source_http_'+response.status);
  return response.text();
}

function parseIpaSource(source){
  const map=new Map();
  for(const rawLine of String(source||'').split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line) continue;
    const tab=line.indexOf('\t');
    if(tab<=0) continue;
    const surface=normalize(line.slice(0,tab));
    const ipa=line.slice(tab+1).trim();
    if(!surface || !ipa || map.has(surface)) continue;
    map.set(surface,ipa);
  }
  return map;
}

function planIpaBootstrap(lexicon,source){
  const index=parseIpaSource(source);
  const changes=[];
  let forms=0,already=0,sourceMatches=0,updatedForms=0,unmatched=0;

  for(const original of lexicon&&lexicon.entries||[]){
    if(original.deprecated) continue;
    let next=null;
    for(let i=0;i<(original.forms||[]).length;i++){
      const form=original.forms[i];
      const surface=normalize(form&&form.text);
      if(!surface) continue;
      forms++;

      const exactIpa=String(form.pronunciation&&form.pronunciation.ipa||'').trim();
      const isLemma=surface===normalize(original.lemma);
      const lemmaIpa=isLemma ? String(original.pronunciation&&original.pronunciation.ipa||'').trim() : '';
      if(exactIpa || lemmaIpa){already++;continue;}

      const ipa=index.get(surface);
      if(!ipa){unmatched++;continue;}
      sourceMatches++;

      if(!next) next=clone(original);
      const target=next.forms[i];
      target.pronunciation={...(target.pronunciation||{}),ipa};
      updatedForms++;
    }
    if(next){
      changes.push({
        id:original.id,
        expectedRevision:Math.max(1,+original.revision||1),
        entry:next
      });
    }
  }

  return {
    source:{sha:IPA_SOURCE_SHA,url:IPA_SOURCE_URL,entries:index.size},
    report:{forms,alreadyHaveIpa:already,sourceMatches,updatedForms,unmatched,updatedLexemes:changes.length},
    changes
  };
}

module.exports={IPA_SOURCE_SHA,IPA_SOURCE_URL,defaultLoadIpaSource,parseIpaSource,planIpaBootstrap};
