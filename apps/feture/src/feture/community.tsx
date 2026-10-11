import {useEffect,useId,useRef,useState} from 'react';
import {Link,useBlocker} from 'react-router';
import {z} from 'zod';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,domainErrorMessage} from './domain-api';
import {AppDialog} from './components/primitives';
import './community.css';
const cursorSchema=z.object({at:z.iso.datetime({offset:true}),id:z.uuid()}).strict();
export const postSchema=z.object({id:z.uuid(),text:z.string().max(3000),kind:z.enum(['text','story','question']),authorLabel:z.string().max(80),audience:z.enum(['private','public']),state:z.enum(['draft','pending','published','rejected','hidden','deleted']),revision:z.number().int().positive(),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}),publishedAt:z.iso.datetime({offset:true}).nullable(),mine:z.boolean()}).strict();
const listSchema=z.object({ok:z.literal(true),items:z.array(postSchema).max(20),nextCursor:cursorSchema.nullable(),requestId:z.uuid()}).strict();
const saveSchema=z.object({ok:z.literal(true),entry:postSchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
type Post=z.infer<typeof postSchema>;type Cursor=z.infer<typeof cursorSchema>;type Draft=Pick<Post,'id'|'text'|'kind'|'authorLabel'|'revision'|'state'>;
const empty=():Draft=>({id:crypto.randomUUID(),text:'',kind:'text',authorLabel:'',revision:0,state:'draft'});
const kinds={text:'Мысль',story:'История',question:'Вопрос'};
const states={draft:'Только тебе',pending:'На проверке',published:'В сообществе',rejected:'Не опубликовано',hidden:'Скрыто',deleted:'Удалено'};
export function Community(){const auth=useOptionalAuth();if(auth.loading)return <p role="status">Загружаем аккаунт…</p>;if(!auth.session)return <div className="ft-note"><p>Войди в аккаунт, чтобы читать обсуждения и делиться своими историями.</p><Link to="/account">Войти</Link></div>;return <CommunityAccount key={auth.session.email+':'+auth.session.deviceId+':'+auth.session.syncToken} session={auth.session}/>;}
function CommunityAccount({session}:{session:AuthSession}){
 const textId=useId();
 const [view,setView]=useState<'feed'|'mine'>('feed'),[items,setItems]=useState<Post[]>([]),[cursor,setCursor]=useState<Cursor|null>(null),[draft,setDraft]=useState<Draft>(empty),[dirty,setDirty]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const active=useRef(true),pending=useRef<Record<string,unknown>|null>(null),[uncertain,setUncertain]=useState(false);
 const blocker=useBlocker(({currentLocation,nextLocation})=>(dirty||uncertain)&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(!dirty&&!uncertain)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,uncertain]);
 useEffect(()=>{const controller=new AbortController();setItems([]);setCursor(null);setLoading(true);setError('');void domainRequest(session,{action:view==='feed'?'posts.feed':'posts.mine',cursor:null},listSchema,controller.signal).then(r=>{if(!controller.signal.aborted){setItems(r.items);setCursor(r.nextCursor);}}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[session,view,reload]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setReload(n=>n+1);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 const change=(value:Partial<Draft>)=>{if(busy||uncertain)return;setDraft(d=>({...d,...value}));setDirty(true);setReviewed(false);setNotice('');};
 const mutate=async(command:Record<string,unknown>)=>{if(busy)return;pending.current=command;setBusy(true);setUncertain(false);setError('');setNotice('');try{const r=await domainRequest(session,command,saveSchema);if(!active.current)return;if(!r.entry.mine)throw new Error('invalid_projection');pending.current=null;setDraft(r.entry.state==='deleted'?empty():r.entry);setDirty(false);setReviewed(false);setNotice(r.entry.state==='pending'?'Отправлено на проверку. Пока публикацию видишь только ты.':r.entry.state==='deleted'?'Публикация удалена.':'Черновик сохранён. Его видишь только ты.');setReload(n=>n+1);}catch(e){if(active.current){setError(domainErrorMessage(e));setUncertain(true);}}finally{if(active.current)setBusy(false);}};
 const save=()=>void mutate({action:'posts.save',id:draft.id,operationId:crypto.randomUUID(),expectedRevision:draft.revision,text:draft.text,kind:draft.kind,authorLabel:draft.authorLabel});
 const submit=()=>{if(!dirty&&draft.revision>0&&draft.state==='draft'&&reviewed&&draft.text.trim()&&draft.authorLabel.trim())void mutate({action:'posts.submit',id:draft.id,operationId:crypto.randomUUID(),expectedRevision:draft.revision});};
 const open=(post:Post)=>{if(busy||uncertain||dirty&&!window.confirm('Открыть другую публикацию? Несохранённый текст будет потерян.'))return;setDraft(post);setDirty(false);setReviewed(false);setNotice('');};
 const reset=()=>{if(busy||uncertain||dirty&&!window.confirm('Закрыть несохранённый текст?'))return;setDraft(empty());setDirty(false);setReviewed(false);setNotice('');};
 const remove=()=>{if(window.confirm('Удалить публикацию и её текст?'))void mutate({action:'posts.delete',id:draft.id,operationId:crypto.randomUUID(),expectedRevision:draft.revision});};
 const more=async()=>{if(!cursor||busy||loading)return;setLoading(true);setError('');try{const r=await domainRequest(session,{action:view==='feed'?'posts.feed':'posts.mine',cursor},listSchema);if(active.current){setItems(old=>[...old,...r.items.filter(p=>!old.some(v=>v.id===p.id))]);setCursor(r.nextCursor);}}catch(e){if(active.current){setItems([]);setCursor(null);setError(domainErrorMessage(e));}}finally{if(active.current)setLoading(false);}};
 return <div className="ft-community"><nav className="ft-form-actions" aria-label="Публикации"><button disabled={busy||loading} aria-pressed={view==='feed'} onClick={()=>setView('feed')}>Обсуждения</button><button disabled={busy||loading} aria-pressed={view==='mine'} onClick={()=>setView('mine')}>Мои публикации</button><button disabled={busy||loading} onClick={()=>setReload(n=>n+1)}>Обновить</button></nav>
  <div className="ft-community-layout"><section className="ft-posts" aria-label={view==='feed'?'Лента обсуждений':'Мои публикации'}>
   {loading&&<p role="status">Загружаем публикации…</p>}
   {!loading&&!error&&items.length===0&&<div className="ft-note"><p>{view==='feed'?'Пока нет доступных обсуждений. Можно начать со своей истории.':'Здесь появятся твои сохранённые черновики и публикации.'}</p></div>}
   {items.map(post=><article className="ft-post" key={post.id}><div className="ft-post-author"><div><strong>{post.authorLabel||'Твой черновик'}</strong><p>{kinds[post.kind]} · {post.mine?states[post.state]:new Date(post.publishedAt!).toLocaleDateString('ru-RU')}</p></div></div><p className="ft-post-copy">{post.text||'Текст ещё не добавлен.'}</p>{post.mine&&<button disabled={busy||uncertain} onClick={()=>open(post)}>Открыть</button>}</article>)}
   {cursor&&<button disabled={busy||loading} onClick={()=>void more()}>Ещё публикации</button>}
  </section>
  <section className="ft-post ft-community-editor" aria-label="Редактор публикации"><h2>{draft.revision?'Твоя публикация':'Начни обсуждение'}</h2><p>{states[draft.state]}. Черновики доступны только тебе.</p>
   <fieldset disabled={busy||uncertain}><label>Формат<select value={draft.kind} onChange={e=>change({kind:e.target.value as Draft['kind']})}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Имя в этой публикации<input maxLength={80} value={draft.authorLabel} onChange={e=>change({authorLabel:e.target.value})}/></label><small>Это имя увидят читатели. Закрытые поля профиля не добавляются.</small>
   <label htmlFor={textId}>Текст</label><textarea id={textId} rows={7} maxLength={3000} value={draft.text} onChange={e=>change({text:e.target.value})}/><small>{draft.text.length} / 3000. Поделись только тем, что готово стать открытым для совершеннолетних участников сообщества.</small>
   <div className="ft-form-actions"><button onClick={save} disabled={!dirty}>Сохранить черновик</button><button onClick={reset}>Новая публикация</button>{draft.revision>0&&<button onClick={remove}>Удалить</button>}</div>
   {draft.state==='draft'&&draft.revision>0&&!dirty&&<><label className="ft-community-consent"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> Разрешаю показать этот текст и указанное имя совершеннолетним участникам сообщества после проверки.</label><button className="ft-primary" disabled={!reviewed||!draft.text.trim()||!draft.authorLabel.trim()} onClick={submit}>Отправить на проверку</button></>}
   {dirty&&draft.revision>0&&draft.state!=='draft'&&<p>Сохранение правок уберёт прежнюю публикацию из ленты. Новый текст понадобится отправить на проверку.</p>}
   </fieldset>
   {uncertain&&pending.current&&<div role="status"><p>Ответ не получен. Повтори то же действие, чтобы узнать результат без дубликатов. Текст остаётся в форме.</p><button disabled={busy} onClick={()=>void mutate(pending.current!)}>Повторить действие</button>{!busy&&<button onClick={()=>{pending.current=null;setUncertain(false);setNotice('Перед сохранением обнови запись из «Моих публикаций». Текущий текст пока остаётся в форме.');setReload(n=>n+1);}}>Обновить записи</button>}</div>}
   {notice&&<p role="status">{notice}</p>}
  </section></div>{error&&<p role="alert">{error} <Link to="/account">Аккаунт</Link></p>}
  {blocker.state==='blocked'&&<AppDialog onClose={()=>blocker.state==='blocked'&&blocker.reset?.()} title="Есть несохранённые изменения"><p>Уйти из сообщества? Текст, который ещё не сохранён, исчезнет из формы.</p><div className="ft-form-actions"><button onClick={()=>blocker.reset?.()}>Остаться</button><button onClick={()=>blocker.proceed?.()}>Уйти</button></div></AppDialog>}
 </div>;
}
