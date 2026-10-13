import {useCallback,useRef,useState,type Dispatch,type SetStateAction} from 'react';

/** Preview-only state in browser TAB session storage, never in Core or Supabase.
 * The mode flag is not an auth credential. Backend guards do not inspect it.
 * Stable storage field names preserve a preview across hot reloads/deploys.
 */
const MODE='feture.design.ephemeral';
const PREFIX='feture.design.ephemeral.value.';
const MAX_BYTES=700_000;
const FIELDS=['notificationReadIds','query','liked','following','groupRequests','saved','reactions','joined',
 'peopleDecisions','likesPanel','chatQuery','readThreads','candidate','eventFormat','rsvp','publicRsvp',
 'draft','filters','checked','interestLevels','publicInterestIds','ownedPosts','ownedEvents',
 'journalEntries','topicNotes','question','questionAnswers','conversations','messageDrafts',
 'onboardingStep','onboardingGoal','onboardingSelected','lastAction','onboardingComplete',
 'meQuery','profileTab','notificationFilter'] as const;

function get(key:string):string|null{
 try{return sessionStorage.getItem(key);}catch{return null;}
}
function put(key:string,value:string):boolean{
 try{sessionStorage.setItem(key,value);return true;}catch{return false;}
}
export function sandboxActive():boolean{
 return get(MODE)==='1';
}
export function startSandbox():void{
 if(sandboxActive())return;
 endSandbox();
 put(MODE,'1');
}
export function endSandbox():void{
 try{
  sessionStorage.removeItem(MODE);
  for(const field of FIELDS)sessionStorage.removeItem(PREFIX+field);
 }catch{/* Browser storage unavailable; the React preview remains nonpersistent. */}
}
export function readSandboxValue<T>(field:typeof FIELDS[number],fallback:T):T{
 if(!sandboxActive())return fallback;
 const raw=get(PREFIX+field);
 if(raw===null||raw.length>MAX_BYTES)return fallback;
 try{
  const parsed:unknown=JSON.parse(raw);
  if(parsed===null)return fallback;
  // A stale/broken object cannot replace an array and vice versa after a deployment.
  if(Array.isArray(fallback))return Array.isArray(parsed)?parsed as T:fallback;
  if(typeof fallback==='object')return typeof parsed==='object'&&!Array.isArray(parsed)?parsed as T:fallback;
  return typeof parsed===typeof fallback?parsed as T:fallback;
 }catch{return fallback;}
}
export function writeSandboxValue(field:typeof FIELDS[number],value:unknown):boolean{
 if(!sandboxActive())return false;
 try{
  const encoded=JSON.stringify(value);
  return typeof encoded==='string'&&encoded.length<MAX_BYTES&&put(PREFIX+field,encoded);
 }catch{return false;}
}
/** Synchronous write before navigation/unmount avoids losing the last form action. */
export function useSandboxState<T>(field:typeof FIELDS[number],initial:T,enabled:boolean):[T,Dispatch<SetStateAction<T>>]{
 const [value,setValue]=useState<T>(()=>enabled?readSandboxValue(field,initial):initial);
 const ref=useRef(value);
 const update=useCallback<Dispatch<SetStateAction<T>>>((action)=>{
  const next=typeof action==='function'?(action as (previous:T)=>T)(ref.current):action;
  ref.current=next;
  if(enabled)writeSandboxValue(field,next);
  setValue(next);
 },[enabled,field]);
 return [value,update];
}
