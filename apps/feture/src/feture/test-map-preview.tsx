import {useEffect,useRef,useState} from 'react';
import type {AuthSession} from '@appbase/core/auth.js';
import {z} from 'zod';
import {domainRequest,domainErrorMessage,DomainClientError} from './domain-api';
import {interestStateSchema} from './model';
import {useInterestMap,interestQueue} from './use-interest-map';
import {AppDialog} from './components/primitives';
import type {TestMapCommand} from '../../lib/feture/questionnaires';
const previewSchema=z.object({ok:z.literal(true),attemptId:z.uuid(),versionId:z.uuid(),items:z.array(z.object({interestId:z.string().regex(/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/),title:z.string().max(160),reason:z.string().max(600),dimensionId:z.string(),available:z.boolean(),blockedReason:z.literal('existing_choice').nullable(),next:interestStateSchema}).strict()).max(6),requestId:z.uuid()}).strict();
const applySchema=z.object({ok:z.literal(true),replayed:z.boolean(),applied:z.number().int().min(1).max(6),requestId:z.uuid()}).strict();
export function TestMapPreview({session,attemptId,onClose,onPendingChange}:{session:AuthSession;attemptId:string;onClose:()=>void;onPendingChange:(pending:boolean)=>void}){
 const [preview,setPreview]=useState<z.infer<typeof previewSchema>|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const live=useRef(true),pending=useRef<TestMapCommand|null>(null),map=useInterestMap();
 const mapReady=map.phase==='synced'&&map.pending===0&&map.conflicts.length===0;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{const abort=new AbortController();setBusy(true);setError('');setSelected([]);setNotice('');void domainRequest(session,{action:'tests.mapPreview',attemptId},previewSchema,abort.signal).then(r=>{if(!abort.signal.aborted){setPreview(r);pending.current=null;}}).catch(e=>{if(!abort.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[session,attemptId,refresh]);
 const apply=async()=>{if(busy||(!pending.current&&(!mapReady||!selected.length)))return;setBusy(true);setError('');const command=pending.current||{action:'tests.mapApply',attemptId,operationId:crypto.randomUUID(),selected:[...selected].sort().map(interestId=>({interestId,expectedRevision:0 as const}))} satisfies TestMapCommand;pending.current=command;onPendingChange(true);
  try{const r=await domainRequest(session,command,applySchema);if(!live.current)return;pending.current=null;onPendingChange(false);setSelected([]);setNotice(`Добавлено тем: ${r.applied}. Они видны только тебе.`);setPreview(p=>p?{...p,items:p.items.map(i=>command.action==='tests.mapApply'&&command.selected.some(s=>s.interestId===i.interestId)?{...i,available:false,blockedReason:'existing_choice'}:i)}:p);void interestQueue.sync(); }catch(e){if(live.current){
   setError(domainErrorMessage(e));
   // A server-confirmed map conflict never applied this operation.
   if(e instanceof DomainClientError&&e.code==='map_changed'){pending.current=null;onPendingChange(false);}
  }}finally{if(live.current)setBusy(false);}
 };
 return <AppDialog title="Выбрать темы для карты" onClose={()=>{if(!busy&&!pending.current)onClose();}}><div className="ft-map-preview"><p>Это темы для дальнейшего изучения. Они не определяют твои желания, опыт или согласие. Выбери то, что хочется обдумать.</p><p>Каждая выбранная тема добавится как «Интересно», без оценки силы и только для тебя. Уже сохранённые или удалённые отметки остаются прежними.</p>
  {preview?.items.map(i=><article className="ft-map-proposal" key={i.interestId}><label className="ft-consent-choice"><input type="checkbox" checked={selected.includes(i.interestId)} disabled={busy||!!pending.current||!i.available} onChange={e=>setSelected(s=>e.target.checked?[...s,i.interestId]:s.filter(id=>id!==i.interestId))}/><strong>{i.title}</strong></label><p>{i.reason}</p><p className="muted">{i.available?'Изменение: нет отметки → «Интересно» · Только мне · Опыт не указан · Сила не указана':'Уже есть твой выбор по этой теме. Он не изменится; ручные границы и видимость сохраняются.'}</p></article>)}
  {preview?.items.length===0&&<p>Для этого результата нет подготовленных предложений. Можно самостоятельно выбрать темы в разделе «Исследовать».</p>}
  {!mapReady&&<p role="status">Дождись сохранения карты и разреши её конфликты перед добавлением тем.</p>}
  {busy&&<p role="status">Загружаем или сохраняем…</p>}{pending.current&&!busy&&<p role="status">Результат сохранения пока неизвестен. Повтори то же действие, прежде чем обновлять предложения или выходить.</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="ft-form-actions"><button type="button" disabled={busy||(!pending.current&&(!mapReady||!selected.length))} onClick={()=>void apply()}>{pending.current?'Повторить то же сохранение':'Добавить выбранные темы'}</button><button type="button" disabled={busy||!!pending.current} onClick={()=>{setRefresh(n=>n+1);void interestQueue.sync();}}>Проверить предложения заново</button><button type="button" disabled={busy||!!pending.current} onClick={onClose}>{notice?'Готово':'Отмена'}</button></div>
 </div></AppDialog>;
}
