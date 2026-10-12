import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {DomainClientError,domainRequest,domainErrorMessage} from './domain-api';

const cursor=z.object({at:z.iso.datetime({offset:true}),id:z.uuid()}).strict();
const resolveSchema=z.object({ok:z.literal(true),publicAuthorId:z.uuid().nullable(),requestId:z.uuid()}).strict();
const stateSchema=z.object({ok:z.literal(true),active:z.boolean(),requestId:z.uuid()}).strict();
const setSchema=stateSchema.extend({replayed:z.boolean()});
const mineSchema=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),at:z.iso.datetime({offset:true})}).strict()).max(20),nextCursor:cursor.nullable(),requestId:z.uuid()}).strict();
type Kind='follow'|'mute';
type RelationCommand={action:'relationships.set';kind:Kind;publicAuthorId:string;postId:string|null;operationId:string;active:boolean};
type Cursor=z.infer<typeof cursor>;
const isTerminal=(e:unknown)=>e instanceof DomainClientError&&['invalid_request','invalid_cursor','auth_required','verification_required','consent_required','resource_not_found','operation_conflict','rate_limited'].includes(e.code);

export function PostAuthorActions({session,postId,onMuted}:{session:AuthSession;postId:string;onMuted:()=>void}){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [publicAuthorId,setPublicAuthorId]=useState<string|null>(null),[checked,setChecked]=useState(false);
 const [following,setFollowing]=useState(false),[muted,setMuted]=useState(false);
 const [error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<RelationCommand|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=async()=>{
  if(loading||busy||uncertain)return;
  setLoading(true);setError('');setChecked(false);setPublicAuthorId(null);
  try{
   const resolved=await domainRequest(session,{action:'authors.resolve',postId},resolveSchema);
   if(!alive.current)return;
   if(!resolved.publicAuthorId){setChecked(true);return;}
   const id=resolved.publicAuthorId;
   const [f,m]=await Promise.all([
    domainRequest(session,{action:'relationships.state',kind:'follow',postId,publicAuthorId:id},stateSchema),
    domainRequest(session,{action:'relationships.state',kind:'mute',postId,publicAuthorId:id},stateSchema)
   ]);
   if(!alive.current)return;
   setPublicAuthorId(id);setFollowing(f.active);setMuted(m.active);setChecked(true);
  }catch(e){if(alive.current)setError(domainErrorMessage(e));}
  finally{if(alive.current)setLoading(false);}
 };
 const send=async(cmd:RelationCommand)=>{
  if(busy)return;
  pending.current=cmd;setBusy(true);setUncertain(false);setError('');
  try{
   const r=await domainRequest(session,cmd,setSchema);
   if(!alive.current)return;
   pending.current=null;
   if(cmd.kind==='follow')setFollowing(r.active);
   else {setMuted(r.active);if(r.active)onMuted();}
  }catch(e){
   if(!alive.current)return;
   setError(domainErrorMessage(e));
   if(isTerminal(e)){pending.current=null;setUncertain(false);if(e instanceof DomainClientError&&e.code==='resource_not_found')setChecked(false);}
   else setUncertain(true);
  }finally{if(alive.current)setBusy(false);}
 };
 const toggle=(kind:Kind,active:boolean)=>{
  if(!publicAuthorId||busy||loading||uncertain)return;
  void send({action:'relationships.set',kind,publicAuthorId,postId:active?postId:null,operationId:crypto.randomUUID(),active});
 };
 return <div className="ft-post-author-actions">
  <button type="button" aria-expanded={open} disabled={busy||uncertain} onClick={()=>{if(open)setOpen(false);else {setOpen(true);void load();}}}>Автор · {open?'Скрыть действия':'Подписка и скрытие'}</button>
  {open&&<div>
   {loading&&<p role="status">Проверяем доступность автора…</p>}
   {!loading&&checked&&!publicAuthorId&&<p>Автор не включил публичные подписки.</p>}
   {!!publicAuthorId&&<div className="ft-form-actions">
    <button type="button" disabled={busy||loading||uncertain} aria-pressed={following} onClick={()=>toggle('follow',!following)}>{following?'Отписаться':'Подписаться'}</button>
    <button type="button" disabled={busy||loading||uncertain} aria-pressed={muted} onClick={()=>toggle('mute',!muted)}>{muted?'Вернуть в ленту':'Скрыть из ленты'}</button>
   </div>}
   {uncertain&&pending.current&&<div role="status"><p>Ответ не подтверждён. Повтор не создаст вторую операцию.</p><button type="button" disabled={busy} onClick={()=>void send(pending.current!)}>Повторить то же действие</button></div>}
   {error&&<p role="alert">{error}</p>}
   <button type="button" disabled={busy||loading||uncertain} onClick={()=>void load()}>Обновить</button>
  </div>}
 </div>;
}

export function MutedAuthors({session,onUnmuted}:{session:AuthSession;onUnmuted:()=>void}){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [items,setItems]=useState<z.infer<typeof mineSchema>['items']>([]),[next,setNext]=useState<Cursor|null>(null);
 const [error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<RelationCommand|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=async(more=false)=>{
  if(loading||busy||uncertain)return;
  setLoading(true);setError('');
  try{
   const r=await domainRequest(session,{action:'relationships.mine',kind:'mute',cursor:more?next:null},mineSchema);
   if(!alive.current)return;
   setItems(old=>more?[...old,...r.items.filter(item=>!old.some(x=>x.id===item.id))]:r.items);
   setNext(r.nextCursor);
  }catch(e){if(alive.current)setError(domainErrorMessage(e));}
  finally{if(alive.current)setLoading(false);}
 };
 const remove=async(cmd:RelationCommand)=>{
  if(busy)return;
  pending.current=cmd;setBusy(true);setUncertain(false);setError('');
  try{
   const r=await domainRequest(session,cmd,setSchema);
   if(!alive.current)return;
   if(r.active)throw new Error('unexpected_relationship_state');
   pending.current=null;setItems(old=>old.filter(v=>v.id!==cmd.publicAuthorId));onUnmuted();
  }catch(e){
   if(!alive.current)return;
   setError(domainErrorMessage(e));
   if(isTerminal(e))pending.current=null;else setUncertain(true);
  }finally{if(alive.current)setBusy(false);}
 };
 return <section className="ft-note" aria-label="Скрытые авторы">
  <button type="button" aria-expanded={open} disabled={busy||uncertain} onClick={()=>{if(open)setOpen(false);else{setOpen(true);void load();}}}>Скрытые авторы {open?'▴':'▾'}</button>
  {open&&<div>
   {loading&&<p role="status">Загружаем список…</p>}
   {!loading&&!error&&items.length===0&&<p>Пока никого не скрываешь.</p>}
   {items.map(v=><div className="ft-form-actions" key={v.id}><span>Автор скрыт {new Date(v.at).toLocaleDateString('ru-RU')}</span><button type="button" disabled={busy||loading||uncertain} onClick={()=>void remove({action:'relationships.set',kind:'mute',publicAuthorId:v.id,postId:null,operationId:crypto.randomUUID(),active:false})}>Вернуть в ленту</button></div>)}
   {next&&<button type="button" disabled={busy||loading||uncertain} onClick={()=>void load(true)}>Показать ещё</button>}
   {uncertain&&pending.current&&<div role="status"><p>Ответ не подтверждён. Можно повторить то же действие.</p><button type="button" disabled={busy} onClick={()=>void remove(pending.current!)}>Повторить</button></div>}
   {error&&<p role="alert">{error}</p>}
   <button type="button" disabled={busy||loading||uncertain} onClick={()=>void load()}>Обновить список</button>
  </div>}
 </section>;
}
