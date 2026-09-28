'use strict';

const {store,parseJson,writeCommands,manyJson,nextCounter,clone}=require('./workspace-utils');

const PREFIX='unmute:lexicon:draft:v2';
const POINTER=`${PREFIX}:pointer`;
const GENERATION_COUNTER=`${PREFIX}:generation`;
const entryKey=(generation,id,revision)=>`${PREFIX}:g:${generation}:entry:${id}:r:${revision}`;

async function readPointer(){
  return parseJson(await store.get(POINTER));
}

async function replace(snapshot){
  const generation=await nextCounter(GENERATION_COUNTER);
  const now=new Date().toISOString();
  const refs={};
  const order=[];
  const commands=[];

  for(const entry of snapshot.entries || []){
    const revision=Math.max(1,+entry.revision||1);
    refs[entry.id]=revision;
    order.push(entry.id);
    commands.push(['SET',entryKey(generation,entry.id,revision),JSON.stringify(entry),'NX']);
  }
  await writeCommands(commands);

  const meta=clone(snapshot);
  delete meta.entries;
  delete meta.draftUpdatedAt;
  delete meta.draftRevision;
  delete meta.publishedAt;

  const pointer={
    schemaVersion:2,
    generation,
    draftRevision:1,
    updatedAt:now,
    meta,
    order,
    refs
  };
  await store.pipe([['SET',POINTER,JSON.stringify(pointer)]]);
  return pointer;
}

async function get(){
  const pointer=await readPointer();
  if(!pointer || pointer.schemaVersion!==2) return null;
  const keys=(pointer.order || []).map(id=>entryKey(pointer.generation,id,pointer.refs[id]));
  const entries=(await manyJson(keys)).filter(Boolean);
  if(entries.length!==keys.length) throw new Error('draft_lexeme_missing');
  return {
    ...clone(pointer.meta),
    entries,
    draftRevision:pointer.draftRevision,
    draftUpdatedAt:pointer.updatedAt
  };
}

async function ensure(fallback){
  let pointer=await readPointer();
  if(pointer && pointer.schemaVersion===2) return pointer;
  if(!fallback) return null;
  await store.withLock('lock:lexicon-workspace',async()=>{
    pointer=await readPointer();
    if(pointer && pointer.schemaVersion===2) return;
    await replace(fallback);
  },{ttl:20,retries:100,delay:50});
  return readPointer();
}

async function getEntry(id){
  const pointer=await readPointer();
  if(!pointer) return null;
  const revision=Math.max(0,+((pointer.refs||{})[id])||0);
  if(!revision) return null;
  const entry=parseJson(await store.get(entryKey(pointer.generation,id,revision)));
  return entry ? {entry,draftRevision:pointer.draftRevision} : null;
}

async function updateEntry(id,expectedRevision,updater,validateEntry){
  return store.withLock('lock:lexicon-workspace',async()=>{
    const pointer=await readPointer();
    if(!pointer) throw new Error('draft_not_found');
    const currentRevision=Math.max(0,+((pointer.refs||{})[id])||0);
    if(!currentRevision) throw new Error('lexeme_not_found');
    if(Number(expectedRevision)!==currentRevision) throw new Error('lexeme_revision_conflict');

    const current=parseJson(await store.get(entryKey(pointer.generation,id,currentRevision)));
    if(!current) throw new Error('lexeme_not_found');
    const next=updater(clone(current));
    if(!next || typeof next!=='object' || Array.isArray(next)) throw new Error('bad_lexeme_update');
    if(next.id!==current.id) throw new Error('lexeme_id_immutable');

    let revision=currentRevision+1;
    while(await store.get(entryKey(pointer.generation,id,revision))) revision++;
    next.revision=revision;
    if(validateEntry) validateEntry(next);

    const updatedPointer={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      refs:{...(pointer.refs||{}),[id]:revision}
    };

    await store.pipe([
      ['SET',entryKey(pointer.generation,id,revision),JSON.stringify(next),'NX'],
      ['SET',POINTER,JSON.stringify(updatedPointer)]
    ]);
    return {entry:next,draftRevision:updatedPointer.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

module.exports={replace,get,ensure,readPointer,getEntry,updateEntry,keys:{POINTER,GENERATION_COUNTER,entryKey}};
