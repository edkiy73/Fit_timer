'use strict';

const { store } = require('../../../packages/core/server/store');
const Content = require('./content-store');
const Lexicon = require('./lexicon-store');

const RELEASE_KEY = 'unmute:release:v1:published';
const RELEASE_COUNTER = 'unmute:release:v1:counter';

function parse(raw){ try{return raw ? JSON.parse(raw) : null;}catch(_){return null;} }

async function getRelease(){
  const value=parse(await store.get(RELEASE_KEY));
  return value && value.schemaVersion===1 ? value : null;
}

async function nextReleaseRevision(){
  const current=Math.max(0,+((await getRelease())?.revision||0),+(await store.get(RELEASE_COUNTER)||0));
  const out=await store.pipe([
    ['SET',RELEASE_COUNTER,String(current)],
    ['INCR',RELEASE_COUNTER]
  ]);
  return Math.max(1,+out[1]||current+1);
}

async function publishDraftRelease(setIds=['general-foundation']){
  return store.withLock('lock:content-release',async()=>{
    const ids=[...new Set(setIds.map(Content.cleanId).filter(Boolean))];
    if(!ids.length) throw new Error('release_sets_required');

    const drafts=[];
    for(const id of ids){
      const draft=await Content.getDraft(id);
      if(!draft) throw new Error('course_draft_not_found:'+id);
      Content.validateSet(draft);
      drafts.push([id,draft]);
    }
    const lexiconDraft=await Lexicon.getDraft();
    if(!lexiconDraft) throw new Error('lexicon_draft_not_found');
    Lexicon.validateLexicon(lexiconDraft);

    // Create immutable snapshots first. Public readers still use the previous release.
    const stagedSets={};
    for(const [id] of drafts){
      const snapshot=await Content.stageDraft(id);
      stagedSets[id]=snapshot.revision;
    }
    const stagedLexicon=await Lexicon.stageDraft();

    const previous=await getRelease();
    const sets={...((previous&&previous.sets)||{}),...stagedSets};
    const revision=await nextReleaseRevision();
    const publishedAt=new Date().toISOString();
    const release={
      schemaVersion:1,
      revision,
      publishedAt,
      sets,
      lexiconRevision:stagedLexicon.revision
    };

    // This single pointer is the visibility boundary: before it readers see the old
    // pair, after it they see the fully staged course+lexicon pair.
    await store.pipe([['SET',RELEASE_KEY,JSON.stringify(release)]]);

    // Compatibility pointers/catalog are secondary. Failure here must not make the
    // public release inconsistent, because APIs resolve through RELEASE_KEY first.
    for(const [id,rev] of Object.entries(stagedSets)){
      await Content.activateRevision(id,rev).catch(()=>{});
    }
    await Lexicon.activateRevision(stagedLexicon.revision).catch(()=>{});

    return {release,sets:stagedSets,lexiconRevision:stagedLexicon.revision};
  },{ttl:20,retries:100,delay:50});
}

// Dictionary edits (transcription, translations) go out on their own: the courses stay at
// the revisions learners already have, unfinished course edits are not released with them.
async function publishLexiconRelease(){
  return store.withLock('lock:content-release',async()=>{
    const previous=await getRelease();
    if(!previous || !previous.sets || !Object.keys(previous.sets).length) throw new Error('no_released_courses');
    const lexiconDraft=await Lexicon.getDraft();
    if(!lexiconDraft) throw new Error('lexicon_draft_not_found');
    Lexicon.validateLexicon(lexiconDraft);
    const stagedLexicon=await Lexicon.stageDraft();
    const revision=await nextReleaseRevision();
    const release={
      schemaVersion:1,
      revision,
      publishedAt:new Date().toISOString(),
      sets:{...previous.sets},
      lexiconRevision:stagedLexicon.revision
    };
    await store.pipe([['SET',RELEASE_KEY,JSON.stringify(release)]]);
    await Lexicon.activateRevision(stagedLexicon.revision).catch(()=>{});
    return {release,lexiconRevision:stagedLexicon.revision};
  },{ttl:20,retries:100,delay:50});
}

async function getReleasedSet(id){
  const release=await getRelease();
  const key=Content.cleanId(id);
  const revision=release&&release.sets ? Math.max(0,+release.sets[key]||0) : 0;
  if(revision) return Content.getRevision(key,revision);
  return Content.getPublished(key);
}

async function getReleasedLexicon(){
  const release=await getRelease();
  const revision=Math.max(0,+(release&&release.lexiconRevision)||0);
  if(revision) return Lexicon.getRevision(revision);
  return Lexicon.getPublished();
}

async function getReleasedCatalog(){
  const release=await getRelease();
  if(!release || !release.sets) return Content.getCatalog();
  const sets=[];
  for(const [id,revision] of Object.entries(release.sets)){
    const set=await Content.getRevision(id,revision);
    if(!set) continue;
    sets.push({
      id:set.id,
      slug:set.slug,
      revision:set.revision,
      title:set.title,
      description:set.description || null,
      level:set.level || {},
      access:set.access,
      defaultRoadmapId:set.defaultRoadmapId,
      publishedAt:set.publishedAt
    });
  }
  sets.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return {schemaVersion:1,revision:release.revision,updatedAt:release.publishedAt,sets};
}

module.exports={getRelease,publishDraftRelease,publishLexiconRelease,getReleasedSet,getReleasedLexicon,getReleasedCatalog,keys:{RELEASE_KEY,RELEASE_COUNTER}};
