import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {DomainClientError,domainRequest,domainErrorMessage} from './domain-api';

const identity=z.object({ok:z.literal(true),enabled:z.boolean(),publicAuthorId:z.uuid().nullable(),replayed:z.boolean(),requestId:z.uuid()}).strict();
type AuthorMutation={action:'authors.enable';consent:true;operationId:string}|{action:'authors.disable'|'authors.rotate';operationId:string};
export function PublicAuthorSettings({session}:{session:AuthSession}){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [enabled,setEnabled]=useState<boolean|null>(null),[consent,setConsent]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<AuthorMutation|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=async()=>{
  if(busy||uncertain||loading)return;
  setLoading(true);setError('');
  try{
   const r=await domainRequest(session,{action:'authors.status'},identity);
   if(!alive.current)return;
   if(r.enabled!==!!r.publicAuthorId)throw new Error('inconsistent_author_status');
   setEnabled(r.enabled);
  }catch(e){if(alive.current)setError(domainErrorMessage(e));}
  finally{if(alive.current)setLoading(false);}
 };
 const execute=async(command:AuthorMutation)=>{
  if(busy)return;
  pending.current=command;setBusy(true);setUncertain(false);setError('');setNotice('');
  try{
   const result=await domainRequest(session,command,identity);
   if(!alive.current)return;
   if(result.enabled!==!!result.publicAuthorId)throw new Error('inconsistent_author_status');
   pending.current=null;setEnabled(result.enabled);setConsent(false);
   setNotice(command.action==='authors.enable'?'Публичная связь включена для новых доступных публикаций.':command.action==='authors.disable'?'Связь выключена. Прежние подписки и скрытия удалены.':'Публичный ID изменён. Прежние связи удалены.');
  }catch(e){
   if(!alive.current)return;
   setError(domainErrorMessage(e));
   const known=e instanceof DomainClientError&&['invalid_request','auth_required','verification_required','consent_required','resource_not_found','operation_conflict','rate_limited'].includes(e.code);
   if(known){pending.current=null;setUncertain(false);}else setUncertain(true);
  }finally{if(alive.current)setBusy(false);}
 };
 const change=(action:'authors.enable'|'authors.disable'|'authors.rotate')=>{
  if(busy||uncertain||action==='authors.enable'&&!consent)return;
  if(action==='authors.rotate'&&!window.confirm('Сменить публичный идентификатор? Все входящие подписки и скрытия прежнего идентификатора будут удалены.'))return;
  if(action==='authors.disable'&&!window.confirm('Отключить публичную связь? Подписки на тебя и скрытия твоего профиля по прежнему ID будут удалены.'))return;
  const cmd:AuthorMutation=action==='authors.enable'?{action,consent:true,operationId:crypto.randomUUID()}:{action,operationId:crypto.randomUUID()};
  void execute(cmd);
 };
 return <section className="ft-note" aria-label="Публичная связь с автором">
  <button type="button" aria-expanded={open} disabled={busy||uncertain} onClick={()=>{if(!open){setOpen(true);void load();}else setOpen(false);}}>Публичные подписки {open?'▴':'▾'}</button>
  {open&&<div>
   <p>Публичная связь помогает подписываться на твои открытые публикации. Она не открывает закрытый профиль, фотографии и публикации для выбранных людей.</p>
   {loading&&<p role="status">Проверяем настройки…</p>}
   {enabled===true&&<><p role="status">Публичная связь включена.</p><div className="ft-form-actions">
    <button type="button" disabled={busy||uncertain||loading} onClick={()=>change('authors.rotate')}>Сменить публичный ID</button>
    <button type="button" disabled={busy||uncertain||loading} onClick={()=>change('authors.disable')}>Выключить</button>
   </div></>}
   {enabled===false&&<><label className="ft-community-consent"><input type="checkbox" checked={consent} disabled={busy||uncertain} onChange={e=>setConsent(e.target.checked)}/> Разрешаю участникам подписываться на мои открытые публикации после проверки доступности. Могу отозвать разрешение в любой момент.</label>
    <button type="button" disabled={busy||uncertain||loading||!consent} onClick={()=>change('authors.enable')}>Включить публичную связь</button></>}
   {uncertain&&pending.current&&<div role="status"><p>Ответ не подтверждён. Повтор не создаст вторую операцию.</p><button type="button" disabled={busy} onClick={()=>void execute(pending.current!)}>Повторить то же действие</button></div>}
   {error&&<p role="alert">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <button type="button" disabled={busy||uncertain||loading} onClick={()=>void load()}>Обновить состояние</button>
  </div>}
 </section>;
}
