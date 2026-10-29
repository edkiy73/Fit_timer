/** Unsent text kept for an account: a chat message (with the message it answers) and a support reply. Lives in
 * localStorage under the account, so it survives closing the tab and signing out, and another account never reads it.
 * A draft older than 30 days is dropped on read and once at start. */
import {useFe} from './session';

export type DraftValue={text:string,replyTo?:string|undefined,at:number};

const PREFIX='fe.draft.';
const LIFE=30*24*3600e3;

/** `<account>:<acting profile>:<slot>`; a slot is `new:<to>` / a conversation id / `support:<ticketId>`. */
export const draftKey=(account:string,profile:string,slot:string)=>PREFIX+account+':'+profile+':'+slot;

const parse=(raw:string|null):DraftValue|null=>{
 if(!raw)return null;
 try{const v=JSON.parse(raw) as Partial<DraftValue>;
  if(typeof v.text!=='string'||typeof v.at!=='number')return null;
  return {text:v.text,at:v.at,...(typeof v.replyTo==='string'?{replyTo:v.replyTo}:{})};}catch{return null;}
};

export function readDraft(key:string):DraftValue|null{
 try{
  const v=parse(localStorage.getItem(key));
  if(!v)return null;
  if(Date.now()-v.at>LIFE){localStorage.removeItem(key);return null;}
  return v;
 }catch{return null;}
}

/** An empty text with no reply drops the draft. */
export function writeDraft(key:string,text:string,replyTo?:string|null){
 try{
  if(!text&&!replyTo){localStorage.removeItem(key);return;}
  const v:DraftValue={text,at:Date.now(),...(replyTo?{replyTo}:{})};
  localStorage.setItem(key,JSON.stringify(v));
 }catch{/* private mode: this visit only */}
}

export function clearDraft(key:string){try{localStorage.removeItem(key);}catch{/* no storage */}}

/** Once at start: expired drafts go, and the old per-tab chat drafts (`fe.chatdraft.*`) are removed. */
export function sweepDrafts(){
 try{
  for(const k of Object.keys(sessionStorage))if(k.startsWith('fe.chatdraft.'))sessionStorage.removeItem(k);
  for(const k of Object.keys(localStorage))if(k.startsWith(PREFIX))readDraft(k);
 }catch{/* no storage */}
}

/** The key builder for the profile currently acting; `ready` is false until the session and the profile are known. */
export function useDraftKey(){
 const {state,acting}=useFe();
 const account=state.status==='ready'?state.boot.account.id:'';
 return {ready:!!account&&!!acting,key:(slot:string)=>draftKey(account,acting?.id??'',slot)};
}
