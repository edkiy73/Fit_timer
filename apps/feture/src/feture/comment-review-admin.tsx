import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AdminClient} from '@appbase/core/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';

const cursor=z.object({at:z.iso.datetime({offset:true}),id:z.uuid()}).strict();
const entry=z.object({id:z.uuid(),postId:z.uuid(),parentId:z.uuid().nullable(),text:z.string().max(1200),state:z.enum(['pending','published','hidden']),revision:z.number().int().positive(),at:z.iso.datetime({offset:true})}).strict();
const event=z.object({id:z.uuid(),commentId:z.uuid(),decision:z.enum(['approve','hide','reopen']),reason:z.enum(['reviewed','policy','privacy','nonconsent','minor','illegal','spam','other']),revision:z.number().int().positive(),at:z.iso.datetime({offset:true})}).strict();
const queue=z.object({ok:z.literal(true),items:z.array(entry).max(20),nextCursor:cursor.nullable()}).strict();
const audit=z.object({ok:z.literal(true),items:z.array(event).max(20),nextCursor:cursor.nullable()}).strict();
const decisionResult=z.object({ok:z.literal(true),entry:z.object({id:z.uuid(),state:z.enum(['pending','published','hidden']),revision:z.number().int().positive()}).strict(),replayed:z.boolean()}).strict();
const reasons={policy:'Правила',privacy:'Приватность',nonconsent:'Нет согласия',minor:'Возраст',illegal:'Запрещено',spam:'Спам',other:'Другое'};
const states={pending:'На проверке',published:'Опубликован',hidden:'Скрыт'};
type Entry=z.infer<typeof entry>;
type Cursor=z.infer<typeof cursor>;
type Event=z.infer<typeof event>;

export function CommentReviewAdmin({client,readOnly}:{client:AdminClient;readOnly:boolean}){
 const [tab,setTab]=useState<'queue'|'audit'>(readOnly?'audit':'queue');
 const [items,setItems]=useState<Entry[]>([]),[events,setEvents]=useState<Event[]>([]),[after,setAfter]=useState<Cursor|null>(null);
 const [selected,setSelected]=useState<Entry|null>(null),[checked,setChecked]=useState(false),[reason,setReason]=useState<keyof typeof reasons>('policy');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0);
 const pending=useRef<Record<string,unknown>|null>(null),epoch=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
 useEffect(()=>{if(readOnly){setTab('audit');setSelected(null);pending.current=null;setUncertain(false);}},[readOnly]);
 const errorText=(e:unknown)=>{
  const x=e as {code?:string};
  return x.code==='review_required'?'Нельзя проверять свой комментарий или свою публикацию. Проверь допуск и права участников.':
   x.code==='revision_conflict'?'Комментарий изменился. Обнови очередь и открой его заново.':
   x.code==='forbidden'?'Рабочая роль отозвана. Обнови кабинет.':
   x.code==='resource_not_found'?'Комментарий или публикация уже недоступны.':
   'Не удалось подтвердить ответ. Обнови очередь или повтори то же решение.';
 };
 useEffect(()=>{
  const ticket=++epoch.current;
  setItems([]);setEvents([]);setAfter(null);setSelected(null);setChecked(false);setError('');setNotice('');
  pending.current=null;setUncertain(false);setBusy(true);
  void client.action('',tab==='queue'?'feture.comments.queue':'feture.comments.audit',{cursor:null})
   .then(v=>{if(!mounted.current||ticket!==epoch.current)return;
    if(tab==='queue'){const r=queue.parse(v);setItems(r.items);setAfter(r.nextCursor);}
    else {const r=audit.parse(v);setEvents(r.items);setAfter(r.nextCursor);}
   }).catch(e=>{if(mounted.current&&ticket===epoch.current)setError(errorText(e));})
    .finally(()=>{if(mounted.current&&ticket===epoch.current)setBusy(false);});
  return()=>{epoch.current++;};
 },[client,tab,reload]);
 const send=async (command:Record<string,unknown>)=>{
  if(busy||readOnly)return;
  pending.current=command;setBusy(true);setUncertain(false);setError('');setNotice('');
  const ticket=++epoch.current;
  try{
   const r=decisionResult.parse(await client.action('','feture.comments.decide',command));
   if(!mounted.current||ticket!==epoch.current)return;
   if(r.entry.id!==command.id)throw new Error('invalid_response');
   pending.current=null;setChecked(false);setSelected(null);
   setNotice('Решение сохранено. Журнал доступен без текста комментария.');
   setReload(v=>v+1);
  }catch(e){
   if(!mounted.current||ticket!==epoch.current)return;
   const v=e as {status?:number;code?:string};
   const terminal=[400,401,403,404,409,422].includes(v.status??0)||
    ['forbidden','review_required','revision_conflict','operation_conflict','resource_not_found','invalid_request'].includes(v.code??'');
   setError(errorText(e));
   if(terminal){pending.current=null;setSelected(null);setChecked(false);setReload(n=>n+1);}
   else setUncertain(true);
  }finally{if(mounted.current&&ticket===epoch.current)setBusy(false);}
 };
 const choose=(decision:'approve'|'hide'|'reopen')=>{
  if(!selected||busy||uncertain||decision==='approve'&&!checked)return;
  void send({id:selected.id,operationId:crypto.randomUUID(),expectedRevision:selected.revision,decision,
   reason:decision==='hide'?reason:'reviewed'});
 };
 const more=async()=>{
  if(!after||busy)return;
  const ticket=++epoch.current;setBusy(true);setError('');
  try{
   const result=await client.action('',tab==='queue'?'feture.comments.queue':'feture.comments.audit',{cursor:after});
   if(!mounted.current||ticket!==epoch.current)return;
   if(tab==='queue'){const r=queue.parse(result);setItems(old=>[...old,...r.items.filter(v=>!old.some(p=>p.id===v.id))]);setAfter(r.nextCursor);}
   else {const r=audit.parse(result);setEvents(old=>[...old,...r.items.filter(v=>!old.some(p=>p.id===v.id))]);setAfter(r.nextCursor);}
  }catch(e){if(mounted.current&&ticket===epoch.current){setItems([]);setEvents([]);setAfter(null);setError(errorText(e));}}
  finally{if(mounted.current&&ticket===epoch.current)setBusy(false);}
 };
 return <section className="ft-post-review" aria-label="Проверка комментариев">
  <h3>Проверка комментариев</h3>
  <p>Комментарии становятся доступны читателям только после одобрения. Личные черновики и закрытые публикации в очередь не попадают.</p>
  <nav className="ft-form-actions" aria-label="Разделы проверки комментариев">
   {!readOnly&&<button type="button" aria-pressed={tab==='queue'} disabled={busy||uncertain} onClick={()=>setTab('queue')}>Очередь комментариев</button>}
   <button type="button" aria-pressed={tab==='audit'} disabled={busy||uncertain} onClick={()=>setTab('audit')}>Журнал комментариев</button>
   <button type="button" disabled={busy||uncertain} onClick={()=>setReload(n=>n+1)}>Обновить</button>
  </nav>
  {busy&&<p role="status">Загружаем…</p>}
  {error&&!selected&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {tab==='queue'&&!readOnly&&<div className="ab-admin-item-list">
   {!busy&&!items.length&&<p>Пока нет комментариев для проверки.</p>}
   {items.map(v=><button type="button" key={v.id+':'+v.revision} disabled={busy||uncertain} onClick={()=>{setSelected(v);setChecked(false);setReason('policy');setError('');}}>
    <span><strong>{states[v.state]} · версия {v.revision}</strong><small>{v.parentId?'Ответ на комментарий':'Комментарий к публикации'} · {new Date(v.at).toLocaleString('ru-RU')}</small><small>{v.text.slice(0,120)}{v.text.length>120?'…':''}</small></span><span aria-hidden="true">→</span>
   </button>)}
  </div>}
  {tab==='audit'&&<div>{!busy&&!events.length&&<p>Решений пока нет.</p>}{events.map(v=><article key={v.id} className="card"><strong>{v.decision==='approve'?'Одобрено':v.decision==='hide'?'Скрыто':'Вернули на проверку'}</strong><p>Версия {v.revision} · {new Date(v.at).toLocaleString('ru-RU')} · {v.reason==='reviewed'?'Проверено':v.reason}</p><small>Комментарий {v.commentId}</small></article>)}</div>}
  {after&&<button disabled={busy||uncertain} onClick={()=>void more()}>Загрузить ещё</button>}
  {selected&&!readOnly&&<AdminWorkspace title={selected.parentId?'Проверка ответа':'Проверка комментария'} subtitle={states[selected.state]+' · версия '+selected.revision} onClose={()=>{if(!busy&&!uncertain)setSelected(null);}} footer={<button disabled={busy||uncertain} onClick={()=>setSelected(null)}>Вернуться к очереди</button>}>
   <p className="ft-review-text">{selected.text}</p>
   <p>Публикация: {selected.postId}</p>
   {selected.state!=='hidden'&&<label>Причина скрытия<select disabled={busy||uncertain} value={reason} onChange={e=>setReason(e.target.value as keyof typeof reasons)}>{Object.entries(reasons).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
   <div className="ft-form-actions">
    {selected.state==='pending'&&<label className="ft-consent-choice"><input type="checkbox" checked={checked} disabled={busy||uncertain} onChange={e=>setChecked(e.target.checked)}/> Проверены возраст, согласие и правила содержания.</label>}
    {selected.state==='pending'&&<button disabled={busy||uncertain||!checked} onClick={()=>choose('approve')}>Одобрить</button>}
    {selected.state!=='hidden'?<button disabled={busy||uncertain} onClick={()=>choose('hide')}>Скрыть</button>:<button disabled={busy||uncertain} onClick={()=>choose('reopen')}>Вернуть на проверку</button>}
   </div>
   {error&&<p role="alert">{error}</p>}
   {uncertain&&pending.current&&<div role="status"><p>Ответ мог потеряться. Повтор отправит то же решение без дубликатов.</p><button disabled={busy} onClick={()=>void send(pending.current!)}>Повторить решение</button></div>}
  </AdminWorkspace>}
 </section>;
}
