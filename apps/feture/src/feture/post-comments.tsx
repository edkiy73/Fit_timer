import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {DomainClientError,domainErrorMessage,domainRequest} from './domain-api';

const cursor=z.object({at:z.iso.datetime({offset:true}),id:z.uuid()}).strict();
const comment=z.object({id:z.uuid(),postId:z.uuid(),parentId:z.uuid().nullable(),text:z.string().max(1200),
 state:z.enum(['pending','published','hidden','deleted']),revision:z.number().int().positive(),
 mine:z.boolean(),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true})}).strict();
const page=z.object({ok:z.literal(true),items:z.array(comment).max(20),nextCursor:cursor.nullable(),requestId:z.uuid()}).strict();
const result=z.object({ok:z.literal(true),entry:comment,replayed:z.boolean(),requestId:z.uuid()}).strict();
type Comment=z.infer<typeof comment>;
type Cursor=z.infer<typeof cursor>;
type Mutation=
 |{action:'comments.create';id:string;postId:string;parentId:string|null;operationId:string;text:string}
 |{action:'comments.edit';id:string;operationId:string;expectedRevision:number;text:string}
 |{action:'comments.delete';id:string;operationId:string;expectedRevision:number};
const labels={pending:'На проверке',published:'Опубликован',hidden:'Скрыт',deleted:'Удалён'};

export function PostComments({session,postId}:{session:AuthSession;postId:string}){
 const [expanded,setExpanded]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [publicItems,setPublicItems]=useState<Comment[]>([]),[ownItems,setOwnItems]=useState<Comment[]>([]);
 const [publicCursor,setPublicCursor]=useState<Cursor|null>(null),[ownCursor,setOwnCursor]=useState<Cursor|null>(null);
 const [text,setText]=useState(''),[replyTo,setReplyTo]=useState<Comment|null>(null),[editing,setEditing]=useState<Comment|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const alive=useRef(true),pending=useRef<Mutation|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=async()=>{
  if(loading||busy||uncertain)return;
  setLoading(true);setError('');
  const [published,personal]=await Promise.allSettled([
   domainRequest(session,{action:'comments.page',postId,cursor:null},page),
   domainRequest(session,{action:'comments.mine',postId,cursor:null},page)
  ]);
  if(!alive.current)return;
  if(published.status==='fulfilled'){setPublicItems(published.value.items);setPublicCursor(published.value.nextCursor);}
  else {setPublicItems([]);setPublicCursor(null);}
  if(personal.status==='fulfilled'){setOwnItems(personal.value.items);setOwnCursor(personal.value.nextCursor);}
  else {setOwnItems([]);setOwnCursor(null);}
  if(published.status==='rejected'||personal.status==='rejected')
   setError(domainErrorMessage(published.status==='rejected'?published.reason:personal.status==='rejected'?personal.reason:null));
  setLoading(false);
 };
 const toggle=()=>{if(busy||uncertain)return;if(!expanded){setExpanded(true);void load();}else setExpanded(false);};
 const more=async(kind:'public'|'own')=>{
  const next=kind==='public'?publicCursor:ownCursor;
  if(!next||loading||busy||uncertain)return;
  setLoading(true);setError('');
  try{
   const r=await domainRequest(session,{action:kind==='public'?'comments.page':'comments.mine',postId,cursor:next},page);
   if(!alive.current)return;
   if(kind==='public'){setPublicItems(old=>[...old,...r.items.filter(v=>!old.some(x=>x.id===v.id))]);setPublicCursor(r.nextCursor);}
   else {setOwnItems(old=>[...old,...r.items.filter(v=>!old.some(x=>x.id===v.id))]);setOwnCursor(r.nextCursor);}
  }catch(e){if(alive.current)setError(domainErrorMessage(e));}
  finally{if(alive.current)setLoading(false);}
 };
 const action=async(cmd:Mutation)=>{
  if(busy)return;
  pending.current=cmd;setBusy(true);setError('');setNotice('');setUncertain(false);
  try{
   const r=await domainRequest(session,cmd,result);
   if(!alive.current)return;
   if(r.entry.id!==cmd.id||!r.entry.mine)throw new Error('invalid_response');
   pending.current=null;setUncertain(false);
   if(r.entry.state==='deleted')setOwnItems(old=>old.filter(x=>x.id!==r.entry.id));
   else setOwnItems(old=>[r.entry,...old.filter(x=>x.id!==r.entry.id)]);
   if(cmd.action!=='comments.create')setPublicItems(old=>old.filter(x=>x.id!==r.entry.id));
   setText('');setReplyTo(null);setEditing(null);
   setNotice(r.entry.state==='deleted'?'Комментарий удалён.':'Комментарий отправлен на проверку. Пока его видишь только ты.');
  }catch(e){
   if(!alive.current)return;
   setError(domainErrorMessage(e));
   const code=e instanceof DomainClientError?e.code:'';
   const definitelyRejected=['invalid_request','invalid_cursor','resource_not_found','revision_conflict','operation_conflict','verification_required','consent_required','auth_required','rate_limited'].includes(code);
   if(definitelyRejected){pending.current=null;setUncertain(false);}
   else setUncertain(true);
  }finally{if(alive.current)setBusy(false);}
 };
 const submit=()=>{
  if(busy||uncertain||!text.trim()||text.length>1200)return;
  if(editing)void action({action:'comments.edit',id:editing.id,operationId:crypto.randomUUID(),expectedRevision:editing.revision,text:text.trim()});
  else void action({action:'comments.create',id:crypto.randomUUID(),postId,parentId:replyTo?.id??null,operationId:crypto.randomUUID(),text:text.trim()});
 };
 const remove=(item:Comment)=>{
  if(busy||uncertain||!item.mine||!window.confirm('Удалить комментарий и его текст?'))return;
  void action({action:'comments.delete',id:item.id,operationId:crypto.randomUUID(),expectedRevision:item.revision});
 };
 const startEdit=(item:Comment)=>{
  if(busy||uncertain||text.trim()&&!window.confirm('Заменить несохранённый текст?'))return;
  setEditing(item);setReplyTo(null);setText(item.text);setError('');setNotice('');
 };
 const startReply=(item:Comment)=>{
  if(busy||uncertain||text.trim()&&!window.confirm('Заменить несохранённый текст?'))return;
  setEditing(null);setReplyTo(item);setText('');setError('');setNotice('');
 };
 const combined=Array.from(new Map([...publicItems,...ownItems].map(v=>[v.id,v])).values())
  .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 return <div className="ft-post-comments">
  <button type="button" aria-expanded={expanded} onClick={toggle}>{expanded?'Скрыть комментарии':'Комментарии'}</button>
  {expanded&&<section aria-label="Комментарии к публикации">
   {loading&&<p role="status">Загружаем комментарии…</p>}
   {combined.map(item=><article key={item.id} className="ft-note">
    <p><strong>{item.mine?'Твой комментарий':'Участник'}</strong> · {item.mine?labels[item.state]:'Опубликован'} · {new Date(item.createdAt).toLocaleDateString('ru-RU')}{item.parentId?' · Ответ':''}</p>
    <p className="ft-post-copy">{item.text}</p>
    <div className="ft-form-actions">
     {item.parentId===null&&item.state==='published'&&<button type="button" disabled={busy||uncertain||loading} onClick={()=>startReply(item)}>Ответить</button>}
     {item.mine&&item.state!=='deleted'&&<><button type="button" disabled={busy||uncertain||loading} onClick={()=>startEdit(item)}>Редактировать</button><button type="button" disabled={busy||uncertain||loading} onClick={()=>remove(item)}>Удалить</button></>}
    </div>
   </article>)}
   {!loading&&!combined.length&&<p>Комментариев пока нет. Можешь начать обсуждение.</p>}
   <div className="ft-form-actions">
    {publicCursor&&<button type="button" disabled={busy||loading||uncertain} onClick={()=>void more('public')}>Ещё комментарии</button>}
    {ownCursor&&<button type="button" disabled={busy||loading||uncertain} onClick={()=>void more('own')}>Ещё мои записи</button>}
    <button type="button" disabled={busy||loading||uncertain} onClick={()=>void load()}>Обновить</button>
   </div>
   <fieldset className="ft-report-form" disabled={busy||loading||uncertain}>
    <legend>{editing?'Изменить свой комментарий':replyTo?'Ответить участнику':'Написать комментарий'}</legend>
    <label>{editing?'Изменение будет повторно проверено':'Текст комментария'}<textarea value={text} rows={3} maxLength={1200} onChange={e=>setText(e.target.value)}/></label>
    <small>{text.length} / 1200 · Текст станет доступен читателям только после проверки управляющим.</small>
    <div className="ft-form-actions"><button type="button" disabled={!text.trim()} onClick={submit}>{editing?'Сохранить на проверку':'Отправить на проверку'}</button>
     {(replyTo||editing)&&<button type="button" onClick={()=>{setEditing(null);setReplyTo(null);setText('');}}>Отменить</button>}
    </div>
   </fieldset>
   {uncertain&&pending.current&&<div role="status"><p>Ответ сервера не получен. Повтори то же действие без дубликатов.</p><button type="button" disabled={busy} onClick={()=>void action(pending.current!)}>Повторить действие</button></div>}
   {error&&<p role="alert">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
  </section>}
 </div>;
}
