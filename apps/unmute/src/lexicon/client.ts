import { createStorage } from '@appbase/core/storage.js';
import { validateLexicon, lookupLexemes, type LexiconSnapshot, type Lexeme } from './schema';

const storage=createStorage({dbName:'unmute/lexicon',storeName:'published'});
const CACHE_KEY='snapshot';

async function fetchJson(url:string):Promise<Record<string,unknown>>{
  const response=await fetch(url);
  let payload:Record<string,unknown>={};
  try{
    const parsed=await response.json();
    if(parsed&&typeof parsed==='object') payload=parsed as Record<string,unknown>;
  }catch(_){}
  if(!response.ok) throw new Error(String(payload.error||'lexicon_request_failed'));
  return payload;
}

export async function loadLexicon():Promise<{lexicon:LexiconSnapshot;fromCache:boolean}>{
  try{
    const payload=await fetchJson('/api/lexicon?action=snapshot');
    const lexicon=validateLexicon(payload.lexicon);
    await storage.set(CACHE_KEY,JSON.stringify(lexicon));
    return {lexicon,fromCache:false};
  }catch(error){
    const cached=await storage.get(CACHE_KEY);
    if(cached){
      try{return {lexicon:validateLexicon(JSON.parse(cached)),fromCache:true};}catch(_){}
    }
    throw error;
  }
}

export async function lookupWord(surface:string,snapshot?:LexiconSnapshot):Promise<Lexeme[]>{
  if(snapshot) return lookupLexemes(snapshot,surface);
  const {lexicon}=await loadLexicon();
  return lookupLexemes(lexicon,surface);
}
