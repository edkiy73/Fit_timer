import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,domainErrorMessage} from './domain-api';

const response=z.object({ok:z.literal(true),requestId:z.uuid()}).strict();
const reactionState=response.extend({liked:z.boolean(),likes:z.number().int().nonnegative()});
const reactionSet=reactionState.extend({replayed:z.boolean()});
const bookmarkSet=response.extend({saved:z.boolean(),replayed:z.boolean()});
type Command={action:'posts.reactionSet';id:string;kind:'like';active:boolean;operationId:string}
 |{action:'posts.bookmarkSave'|'posts.bookmarkRemove';id:string;operationId:string};

/** Existing community card actions: no per-card network requests until a person interacts. */
export function PostEngagement({session,id,savedView,onUnsaved}:{session:AuthSession;id:string;savedView:boolean;onUnsaved:()=>void}){
 const [liked,setLiked]=useState<boolean|null>(null),[likes,setLikes]=useState<number|null>(null),[saved,setSaved]=useState(savedView);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef<Command|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const reaction=async()=>{
  if(busy||pending.current?.action?.startsWith('posts.bookmark'))return;
  setBusy(true);setError('');
  try{
   let cmd=pending.current;
   if(!cmd){
    let before=liked;
    if(before===null){
     const current=await domainRequest(session,{action:'posts.reactionState',id},reactionState);
     if(!alive.current)return;
     before=current.liked;setLiked(current.liked);setLikes(current.likes);
    }
    cmd={action:'posts.reactionSet',id,kind:'like',active:!before,operationId:crypto.randomUUID()};
    pending.current=cmd;
   }
   if(cmd.action!=='posts.reactionSet')return;
   const result=await domainRequest(session,cmd,reactionSet);
   if(!alive.current)return;
   pending.current=null;setUncertain(false);setLiked(result.liked);setLikes(result.likes);
  }catch(e){if(alive.current){setUncertain(!!pending.current);setError(domainErrorMessage(e));}}
  finally{if(alive.current)setBusy(false);}
 };
 const bookmark=async()=>{
  if(busy||pending.current?.action==='posts.reactionSet')return;
  setBusy(true);setError('');
  try{
   const cmd:Command=pending.current??{action:saved?'posts.bookmarkRemove':'posts.bookmarkSave',id,operationId:crypto.randomUUID()};
   pending.current=cmd;
   if(cmd.action==='posts.reactionSet')return;
   const result=await domainRequest(session,cmd,bookmarkSet);
   if(!alive.current)return;
   pending.current=null;setUncertain(false);setSaved(result.saved);
   if(savedView&&!result.saved)onUnsaved();
  }catch(e){if(alive.current){setUncertain(!!pending.current);setError(domainErrorMessage(e));}}
  finally{if(alive.current)setBusy(false);}
 };
 const reactionPending=pending.current?.action==='posts.reactionSet';
 const bookmarkPending=pending.current?.action==='posts.bookmarkSave'||pending.current?.action==='posts.bookmarkRemove';
 return <div>
  <div className="ft-form-actions" aria-label="Действия с публикацией">
   <button type="button" disabled={busy||uncertain&&!!bookmarkPending} aria-pressed={liked===true}
     onClick={()=>void reaction()}>{uncertain&&reactionPending?'Повторить реакцию':liked?'Убрать реакцию':'Нравится'}{likes!==null?' · '+likes:''}</button>
   <button type="button" disabled={busy||uncertain&&!!reactionPending} aria-pressed={saved}
     onClick={()=>void bookmark()}>{uncertain&&bookmarkPending?'Повторить сохранение':saved?'Убрать из сохранённого':'Сохранить'}</button>
  </div>
  {uncertain&&<p role="status">Ответ сервера не подтверждён. Повтори то же действие — новый запрос не создаст дубликат.</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
