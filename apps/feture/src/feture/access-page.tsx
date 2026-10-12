import {useEffect,useState} from 'react';
import {Link,useBlocker,useParams} from 'react-router';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import concept from '../../data/concept-catalog.json';
import {authClient} from '../auth';
import {sameSession} from './interest-api';
import {domainRequest,domainErrorMessage,DomainClientError} from './domain-api';
import {AppDialog} from './components/primitives';
import {stance,experience,boundary} from './model';
const fieldLabels={nickname:'Имя',about:'О себе',pronouns:'Местоимения',identity:'Самоопределение',orientation:'Ориентация',relationships:'Отношения',city:'Город'};
const topicLabels=new Map(concept.categories.flatMap(c=>c.interests.map(i=>[i.id,i.title] as const)));
const scopeLabel=(scope:string)=>scope.startsWith('profile:')?fieldLabels[scope.slice(8) as keyof typeof fieldLabels]||scope:topicLabels.get(scope.slice(9))||'Тема';
const scope=z.string().regex(/^(profile:(nickname|about|pronouns|identity|orientation|relationships|city)|interest:interest-[1-9]\d{0,2}-[1-9]\d{0,2})$/);
const rowSchema=z.object({id:z.uuid(),peerId:z.uuid(),direction:z.enum(['incoming','outgoing']),scopes:z.array(scope).max(30),canMessage:z.boolean(),state:z.enum(['pending','approved','declined','cancelled','expired','active','revoked','blocked']),expiresAt:z.iso.datetime({offset:true}).nullable()}).strict();
type Row=z.infer<typeof rowSchema>;
const listSchema=z.object({ok:z.literal(true),items:z.array(rowSchema).max(30),nextCursor:z.uuid().nullable(),requestId:z.uuid()}).strict();
const configSchema=z.object({ok:z.literal(true),id:z.uuid(),revision:z.number().int().nonnegative(),publicFields:z.array(z.enum(Object.keys(fieldLabels) as [keyof typeof fieldLabels,...(keyof typeof fieldLabels)[]])).max(7),grantedFields:z.array(z.enum(Object.keys(fieldLabels) as [keyof typeof fieldLabels,...(keyof typeof fieldLabels)[]])).max(7),requestId:z.uuid()}).strict();
const ackSchema=z.object({ok:z.literal(true),requestId:z.uuid(),accessId:z.uuid().optional()}).strict();
const projectionSchema=z.object({fields:z.object({nickname:z.string().max(80).optional(),about:z.string().max(2000).optional(),pronouns:z.string().max(160).optional(),identity:z.string().max(160).optional(),orientation:z.string().max(160).optional(),relationships:z.string().max(160).optional(),city:z.string().max(120).optional()}).strict(),interests:z.array(z.object({interestId:z.string(),stance,experience,boundary,boundaryNote:z.string().max(1000).nullable(),intensity:z.number().int().min(1).max(5).nullable()}).strict()).max(144),canMessage:z.boolean()}).strict();
type Projection=z.infer<typeof projectionSchema>;
const previewSchema=z.object({ok:z.literal(true),projection:projectionSchema,requestId:z.uuid()}).strict();
const peerSchema=previewSchema.extend({id:z.uuid(),isOwner:z.boolean()}).strict();
function ScopeChoices({selected,onChange,choices,disabled}:{selected:string[];onChange:(v:string[])=>void;choices:string[];disabled:boolean}){return <div>{choices.map(s=><label className="ft-consent-choice" key={s}><input type="checkbox" checked={selected.includes(s)} disabled={disabled||!selected.includes(s)&&selected.length>=30} onChange={e=>onChange(e.target.checked?[...selected,s]:selected.filter(x=>x!==s))}/>{scopeLabel(s)}</label>)}</div>;}
function ProjectedProfile({data}:{data:Projection}){return <article className="ft-profile-projection"><dl>{Object.entries(data.fields).filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{fieldLabels[k as keyof typeof fieldLabels]}</dt><dd>{v}</dd></div>)}</dl>{data.interests.map(i=><div key={i.interestId}><strong>{topicLabels.get(i.interestId)||'Тема'}</strong><p>{({unknown:'Пока не определено',curious:'Любопытно',fantasy:'Интересно в фантазии',want_to_try:'Хочется попробовать',not_interested:'Неинтересно'})[i.stance]}{i.boundary!=='none'?' · Есть личная граница':''}</p>{i.boundaryNote&&<p>{i.boundaryNote}</p>}</div>)}{!Object.values(data.fields).some(Boolean)&&!data.interests.length&&<p>Сведения пока не раскрыты.</p>}<p className="muted">{data.canMessage?'Запрос общения принят.':'Отдельного разрешения на общение нет.'}</p></article>;}
function SignedPage({children}:{children:(session:AuthSession)=>React.ReactNode}){const auth=useOptionalAuth();if(auth.loading)return <p role="status">Загружаем аккаунт…</p>;if(!auth.session)return <section className="card"><h2>Доступ к профилю</h2><p>Войди, чтобы управлять разрешениями и запрашивать доступ.</p><Link to="/account">Войти</Link></section>;return <div key={auth.session.email+':'+auth.session.deviceId+':'+auth.session.syncToken}>{children(auth.session)}</div>;}
export function AccessPage(){return <SignedPage>{session=><AccessManager session={session}/>}</SignedPage>;}
function AccessManager({session}:{session:AuthSession}){
 const [kind,setKind]=useState<'requests'|'grants'|'blocks'>('requests'),[items,setItems]=useState<Row[]>([]),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const [config,setConfig]=useState<z.infer<typeof configSchema>|null>(null),[publicFields,setPublic]=useState<string[]>([]),[grantedFields,setGranted]=useState<string[]>([]),[dirty,setDirty]=useState(false),[preview,setPreview]=useState<Projection|null>(null),[viewerId,setViewerId]=useState(''),[configReload,setConfigReload]=useState(0);
 const [configState,setConfigState]=useState<'loading'|'ready'|'missing'|'error'>('loading'),[configError,setConfigError]=useState('');
 useEffect(()=>{const controller=new AbortController();setBusy(true);setError('');setItems([]);setNext(null);
  domainRequest(session,{action:'access.list',kind,cursor},listSchema,controller.signal).then(r=>{if(!controller.signal.aborted){setItems(r.items);setNext(r.nextCursor);}}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return ()=>controller.abort();
 },[session,kind,cursor,reload]);
 useEffect(()=>{const controller=new AbortController();setConfig(null);setDirty(false);setPreview(null);setConfigState('loading');setConfigError('');
  domainRequest(session,{action:'access.settings'},configSchema,controller.signal)
   .then(r=>{if(!controller.signal.aborted){setConfig(r);setPublic(r.publicFields);setGranted(r.grantedFields);setConfigState('ready');}})
   .catch(e=>{if(!controller.signal.aborted){
    setConfigState(e instanceof DomainClientError&&e.code==='resource_not_found'?'missing':'error');
    setConfigError(domainErrorMessage(e));
   }});
  return ()=>controller.abort();
 },[session,configReload]);
 const run=async(body:Record<string,unknown>)=>{if(busy)return false;setBusy(true);setError('');setNotice('');setPreview(null);try{await domainRequest(session,body,ackSchema);if(!sameSession(await authClient.getSession(),session))return false;setNotice('Изменение сохранено.');setReload(n=>n+1);if(body.action==='access.disclosure')setConfigReload(n=>n+1);return true;}catch(e){if(sameSession(await authClient.getSession(),session))setError(domainErrorMessage(e));return false;}finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}};
 const view=async()=>{if(busy||dirty)return;setBusy(true);setError('');try{const r=await domainRequest(session,{action:'access.preview',viewerId:viewerId||null},previewSchema);if(sameSession(await authClient.getSession(),session))setPreview(r.projection);}catch(e){if(sameSession(await authClient.getSession(),session))setError(domainErrorMessage(e));}finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}};
 return <section className="card ft-access"><p><Link to="/account">← Аккаунт</Link></p><h2>Видимость и доступ</h2><p>Разрешение относится только к выбранным сведениям. Общение одобряется отдельно. Отзыв и срок прекращают новые обращения; полученный снимок экрана отозвать нельзя.</p>
  {configState==='loading'?<p role="status">Проверяем настройки видимости…</p>:
   configState==='error'?<div role="alert"><p>Не удалось загрузить настройки видимости. Это не означает, что профиль отсутствует или его поля закрыты. {configError}</p><button type="button" onClick={()=>setConfigReload(n=>n+1)}>Повторить загрузку</button></div>:
   config?<><p><Link to={'/people/'+config.id}>Ссылка на мой профиль</Link></p><h3>Поля профиля</h3>{Object.entries(fieldLabels).map(([field,label])=><label className="ft-visibility-row" key={field}><span>{label}</span><select disabled={busy} value={publicFields.includes(field)?'public':grantedFields.includes(field)?'granted':'private'} onChange={e=>{setPublic(v=>e.target.value==='public'?[...v.filter(s=>s!==field),field]:v.filter(s=>s!==field));setGranted(v=>e.target.value==='granted'?[...v.filter(s=>s!==field),field]:v.filter(s=>s!==field));setDirty(true);setPreview(null);}}><option value="private">Только мне</option><option value="granted">По разрешению</option><option value="public">Участникам</option></select></label>)}
   <button type="button" disabled={busy||!dirty} onClick={()=>void run({action:'access.disclosure',expectedRevision:config.revision,publicFields,grantedFields})}>Сохранить видимость</button>
   <p>Видимость каждой темы меняется в её редакторе на карте. Частное поле или тема остаются закрытыми даже при одобренном запросе.</p>
   <h3>Посмотреть глазами другого человека</h3><label>Идентификатор профиля получателя (необязательно)<input value={viewerId} disabled={busy} onChange={e=>{setViewerId(e.target.value.trim());setPreview(null);}} placeholder="Пусто — участник без разрешений"/></label><button type="button" disabled={busy||dirty||!!viewerId&&!z.uuid().safeParse(viewerId).success} onClick={()=>void view()}>Проверить сохранённую видимость</button>{preview&&<ProjectedProfile data={preview}/>}</>:<p><Link to="/profile">Заполнить личный профиль</Link> · <Link to="/verification">Совершеннолетие</Link> · <Link to="/documents">Согласия</Link></p>}
  <h3>Разрешения и запросы</h3><nav className="ft-form-actions" aria-label="Управление доступом">{(['requests','grants','blocks'] as const).map(k=><button type="button" key={k} aria-current={kind===k?'page':undefined} disabled={busy} onClick={()=>{setKind(k);setCursor(null);}}>{({requests:'Запросы',grants:'Разрешения',blocks:'Блокировки'})[k]}</button>)}</nav>
  {!busy&&!error&&!items.length&&<p>Здесь пока пусто.</p>}{items.map(item=><PermissionRow key={item.id+':'+kind} row={item} kind={kind} busy={busy} run={run}/>)}
  <div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Обновить сохранённую видимость? Изменения в форме будут потеряны.')){setCursor(null);setReload(n=>n+1);setConfigReload(n=>n+1);}}}>Обновить</button>{next&&<button type="button" disabled={busy} onClick={()=>setCursor(next)}>Следующие</button>}{cursor&&<button type="button" disabled={busy} onClick={()=>setCursor(null)}>В начало</button>}</div>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
function PermissionRow({row,kind,busy,run}:{row:Row;kind:string;busy:boolean;run:(body:Record<string,unknown>)=>Promise<boolean>}){
 const [selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState(false),[days,setDays]=useState(7);
 const stateLabels={pending:'Ожидает решения',approved:'Одобрен',declined:'Отклонён',cancelled:'Отменён',expired:'Срок истёк',active:'Выдан',revoked:'Отозван',blocked:'Заблокирован'};
 return <article className="ft-permission"><p><Link to={'/people/'+row.peerId}>Профиль участника</Link> · {stateLabels[row.state]}</p><p>{row.scopes.map(scopeLabel).join(', ')||'Без доступа к сведениям'}{row.canMessage?' · Отдельное общение':''}</p>{row.expiresAt&&<p className="muted">До {new Date(row.expiresAt).toLocaleDateString('ru')}</p>}
  {kind==='requests'&&row.state==='pending'&&(row.direction==='incoming'?<><ScopeChoices selected={selected} onChange={setSelected} choices={row.scopes} disabled={busy}/>{row.canMessage&&<label className="ft-consent-choice"><input type="checkbox" disabled={busy} checked={message} onChange={e=>setMessage(e.target.checked)}/>Разрешить общение отдельно</label>}<label>Срок разрешения<select disabled={busy} value={days} onChange={e=>setDays(Number(e.target.value))}>{[1,7,30,90].map(n=><option value={n} key={n}>{n} дн.</option>)}</select></label><div className="ft-form-actions"><button type="button" disabled={busy||!selected.length&&!message} onClick={()=>void run({action:'access.decide',requestId:row.id,decision:'approve',scopes:selected,canMessage:message,days})}>Одобрить выбранное</button><button type="button" disabled={busy} onClick={()=>void run({action:'access.decide',requestId:row.id,decision:'decline',scopes:[],canMessage:false,days:7})}>Отклонить</button></div></>:<button type="button" disabled={busy} onClick={()=>void run({action:'access.close',requestId:row.id,kind:'cancel'})}>Отменить запрос</button>)}
  {kind==='grants'&&row.direction==='outgoing'&&row.state==='active'&&<button type="button" disabled={busy} onClick={()=>void run({action:'access.close',requestId:row.id,kind:'revoke'})}>Отозвать доступ и общение</button>}
  {kind==='blocks'&&<button type="button" disabled={busy} onClick={()=>void run({action:'access.block',targetId:row.peerId,blocked:false})}>Разблокировать без восстановления доступа</button>}
 </article>;
}
type PeerRequestCommand={action:'access.request';targetId:string;operationId:string;scopes:string[];canMessage:boolean};
// Access preflight (adult/consent) runs before the SQL receipt lookup. A denial on
// retry therefore cannot establish whether the previous request was accepted.
function definitivelyRejectedPeerRequest(error:unknown,wasRetry:boolean){
 return error instanceof DomainClientError&&(
  ['operation_conflict','invalid_request'].includes(error.code)||
  (!wasRetry&&['resource_not_found','request_pending','verification_required','consent_required'].includes(error.code))
 );
}
export function PeerProfilePage(){const {id}=useParams();return <SignedPage>{session=><PeerProfile key={id} session={session} id={id||''}/>}</SignedPage>;}
function PeerProfile({session,id}:{session:AuthSession;id:string}){
 const [profile,setProfile]=useState<Projection|null>(null),[own,setOwn]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState(false),[notice,setNotice]=useState(''),[pendingRequest,setPendingRequest]=useState<PeerRequestCommand|null>(null),[topic,setTopic]=useState('');
 // Another account may revoke a grant while the profile is in a background tab.
 // Recheck the server on return and remove the old projection before the response.
 const [accessRefresh,setAccessRefresh]=useState(0);
 const blocker=useBlocker(({currentLocation,nextLocation})=>pendingRequest!==null&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(pendingRequest){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[pendingRequest]);
 useEffect(()=>{
  const refresh=()=>{setProfile(null);setAccessRefresh(n=>n+1);};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
 },[]);
 useEffect(()=>{const controller=new AbortController();setProfile(null);setError('');setBusy(true);if(!z.uuid().safeParse(id).success){setError('Профиль недоступен.');setBusy(false);return ()=>controller.abort();}domainRequest(session,{action:'access.profile',targetId:id},peerSchema,controller.signal).then(r=>{if(!controller.signal.aborted){setProfile(r.projection);setOwn(r.isOwner);}}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return ()=>controller.abort();},[session,id,accessRefresh]);
 const request=async()=>{
  if(busy||(!pendingRequest&&!selected.length&&!message))return;
  const wasRetry=pendingRequest!==null;
  const command=pendingRequest??{action:'access.request',targetId:id,operationId:crypto.randomUUID(),scopes:[...selected],canMessage:message} satisfies PeerRequestCommand;
  setPendingRequest(command);setBusy(true);setError('');setNotice('');
  try{
   await domainRequest(session,command,ackSchema);
   if(sameSession(await authClient.getSession(),session)){
    setNotice('Запрос отправлен. Доступ появится после решения владельца.');
    setSelected([]);setMessage(false);setPendingRequest(null);
   }
  }catch(e){
   if(sameSession(await authClient.getSession(),session)){
    setError(domainErrorMessage(e));
    if(definitivelyRejectedPeerRequest(e,wasRetry))setPendingRequest(null);
   }
  }finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };
 const block=async()=>{if(busy||pendingRequest||!window.confirm('Заблокировать участника и отозвать доступ в обе стороны?'))return;setBusy(true);try{await domainRequest(session,{action:'access.block',targetId:id,blocked:true},ackSchema);if(sameSession(await authClient.getSession(),session)){setProfile(null);setNotice('Участник заблокирован.');}}catch(e){if(sameSession(await authClient.getSession(),session))setError(domainErrorMessage(e));}finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}};
 return <section className="card ft-access"><p><Link to="/access">← Мои разрешения</Link></p><h2>Профиль участника</h2>{profile&&<ProjectedProfile data={profile}/>} {profile&&!own&&<><h3>Запросить выбранные сведения</h3><ScopeChoices selected={selected} onChange={setSelected} choices={Object.keys(fieldLabels).map(k=>'profile:'+k)} disabled={busy||!!pendingRequest}/><label>Добавить тему<select value={topic} disabled={busy||!!pendingRequest||selected.length>=30} onChange={e=>setTopic(e.target.value)}><option value="">Выбери тему</option>{[...topicLabels].map(([topicId,title])=><option key={topicId} value={'interest:'+topicId}>{title}</option>)}</select></label><button type="button" disabled={busy||!!pendingRequest||!topic||selected.includes(topic)||selected.length>=30} onClick={()=>{setSelected(v=>[...v,topic]);setTopic('');}}>Добавить</button><ScopeChoices selected={selected.filter(s=>s.startsWith('interest:'))} choices={selected.filter(s=>s.startsWith('interest:'))} disabled={busy||!!pendingRequest} onChange={v=>setSelected(old=>[...old.filter(s=>!s.startsWith('interest:')), ...v])}/><label className="ft-consent-choice"><input type="checkbox" checked={message} disabled={busy||!!pendingRequest} onChange={e=>setMessage(e.target.checked)}/>Отдельно запросить общение</label>{!pendingRequest&&<button type="button" disabled={busy||!selected.length&&!message} onClick={()=>void request()}>Отправить запрос</button>}</>}
  {pendingRequest&&<div role="status"><p>Результат запроса пока неизвестен. Сервер мог его принять. Повтори точно тот же запрос, прежде чем изменять выбор или уходить.</p><button type="button" disabled={busy} onClick={()=>void request()}>Повторить прежний запрос</button><p><Link to="/verification" target="_blank" rel="noopener noreferrer">Проверка возраста</Link> · <Link to="/documents" target="_blank" rel="noopener noreferrer">Согласия</Link></p></div>}
  {!own&&profile&&z.uuid().safeParse(id).success&&<p><button type="button" disabled={busy||!!pendingRequest} onClick={()=>void block()}>Заблокировать участника</button> · <Link to={'/report/'+id}>Сообщить о нарушении</Link></p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">Загружаем…</p>}
  {blocker.state==='blocked'&&<AppDialog title="Запрос ещё не подтверждён" onClose={()=>blocker.reset()}>
   <p>Запрос мог быть принят сервером. Не создавай новый запрос: используй повтор с тем же идентификатором.</p>
   <div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{blocker.reset();void request();}}>Повторить прежний запрос</button><button type="button" onClick={()=>blocker.reset()}>Остаться</button></div>
  </AppDialog>}
 </section>;
}
