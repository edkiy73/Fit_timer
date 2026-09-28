'use strict';

const { store }=require('../../../packages/core/server/store');

const PREFIX='unmute:lexicon:v1';
const DRAFT=`${PREFIX}:draft`;
const POINTER=`${PREFIX}:published`;
const revisionKey=revision=>`${PREFIX}:rev:${revision}`;
const REVISION_COUNTER=`${PREFIX}:revision-counter`;

const parse=raw=>{try{return raw?JSON.parse(raw):null;}catch(_){return null;}};

function normalizeSurface(value){
  return String(value||'').toLowerCase().replace(/[\u2019\u02bc]/g,"'").replace(/\s+/g,' ').trim();
}

function validateLexicon(input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('invalid_lexicon');
  if(input.schemaVersion!==1) throw new Error('unsupported_schema');
  if(!Array.isArray(input.entries)) throw new Error('missing_entries');

  const ids=new Set();
  for(const entry of input.entries){
    if(!entry || typeof entry!=='object') throw new Error('invalid_lexeme');
    const id=String(entry.id||'');
    if(!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error('bad_lexeme_id');
    if(ids.has(id)) throw new Error(`duplicate_lexeme:${id}`);
    ids.add(id);
    if(!entry.lemma || !Array.isArray(entry.forms) || !entry.forms.length || !Array.isArray(entry.senses) || !entry.senses.length){
      throw new Error(`invalid_lexeme:${id}`);
    }

    const forms=new Set();
    for(const form of entry.forms){
      const key=normalizeSurface(form && form.text);
      if(!key) throw new Error(`bad_form:${id}`);
      if(forms.has(key)) throw new Error(`duplicate_form:${id}:${key}`);
      forms.add(key);
    }
    if(!forms.has(normalizeSurface(entry.lemma))) throw new Error(`lemma_form_missing:${id}`);

    const senses=new Set();
    for(const sense of entry.senses){
      const sid=String(sense && sense.id || '');
      if(!/^[a-z0-9][a-z0-9._-]*$/.test(sid)) throw new Error(`bad_sense_id:${id}`);
      if(senses.has(sid)) throw new Error(`duplicate_sense:${id}:${sid}`);
      senses.add(sid);
      if(!sense.translations || typeof sense.translations!=='object') throw new Error(`missing_translations:${id}:${sid}`);
    }

    const examples=new Set();
    for(const example of (entry.examples||[])){
      const eid=String(example && example.id || '');
      if(!/^[a-z0-9][a-z0-9._-]*$/.test(eid)) throw new Error(`bad_example_id:${id}`);
      if(examples.has(eid)) throw new Error(`duplicate_example:${id}:${eid}`);
      examples.add(eid);
      if(!senses.has(String(example.senseId||''))) throw new Error(`unknown_example_sense:${id}:${example.senseId}`);
    }
  }
  return input;
}

async function persistentSet(key,value){
  await store.pipe([['SET',key,JSON.stringify(value)]]);
}

async function putDraft(input){
  const validated=validateLexicon(input);
  const draft={...validated,draftUpdatedAt:new Date().toISOString()};
  await persistentSet(DRAFT,draft);
  return draft;
}

async function getDraft(){return parse(await store.get(DRAFT));}

async function nextRevision(){
  const pointer=parse(await store.get(POINTER));
  const current=Math.max(0,+(pointer&&pointer.revision)||0,+(await store.get(REVISION_COUNTER)||0));
  const out=await store.pipe([
    ['SET',REVISION_COUNTER,String(current)],
    ['INCR',REVISION_COUNTER]
  ]);
  return Math.max(1,+out[1]||current+1);
}

async function stageDraft(){
  const draft=await getDraft();
  if(!draft) throw new Error('draft_not_found');
  validateLexicon(draft);
  const revision=await nextRevision();
  const publishedAt=new Date().toISOString();
  const snapshot={...draft,revision,publishedAt};
  delete snapshot.draftUpdatedAt;
  validateLexicon(snapshot);
  const result=await store.pipe([['SET',revisionKey(revision),JSON.stringify(snapshot),'NX']]);
  if(result[0] !== 'OK') throw new Error('revision_collision');
  return snapshot;
}

async function getRevision(revision){
  const rev=Math.max(0,+revision||0);
  if(!rev) return null;
  const snapshot=parse(await store.get(revisionKey(rev)));
  return snapshot?validateLexicon(snapshot):null;
}

async function activateRevision(revision){
  const snapshot=await getRevision(revision);
  if(!snapshot) throw new Error('revision_not_found');
  await persistentSet(POINTER,{revision:snapshot.revision,publishedAt:snapshot.publishedAt});
  return snapshot;
}

async function publish(){
  return store.withLock('lock:lexicon',async()=>{
    const snapshot=await stageDraft();
    await activateRevision(snapshot.revision);
    return snapshot;
  },{ttl:10,retries:80,delay:50});
}

async function getPublished(){
  const pointer=parse(await store.get(POINTER));
  const revision=Math.max(0,+(pointer&&pointer.revision)||0);
  return revision?getRevision(revision):null;
}

function buildIndex(snapshot){
  const out={};
  for(const entry of snapshot.entries||[]){
    if(entry.deprecated) continue;
    for(const form of entry.forms||[]){
      const key=normalizeSurface(form.text);
      (out[key]||(out[key]=[])).push(entry.id);
    }
  }
  return out;
}

function lookup(snapshot,surface){
  const index=buildIndex(snapshot);
  const ids=index[normalizeSurface(surface)]||[];
  const byId=new Map((snapshot.entries||[]).map(entry=>[entry.id,entry]));
  return ids.map(id=>byId.get(id)).filter(Boolean);
}

module.exports={validateLexicon,putDraft,getDraft,publish,stageDraft,activateRevision,getRevision,getPublished,lookup,buildIndex,normalizeSurface,keys:{DRAFT,POINTER,REVISION_COUNTER,revisionKey}};
