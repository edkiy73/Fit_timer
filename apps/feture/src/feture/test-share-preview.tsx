import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import type {AuthSession} from '@appbase/core/auth.js';
import {z} from 'zod';
import {domainRequest,domainErrorMessage,DomainClientError} from './domain-api';
import {postSchema} from './community';
import type {PostTestCommand} from '../../lib/feture/posts';
import {AppDialog} from './components/primitives';
const previewSchema=z.object({ok:z.literal(true),preview:z.object({attemptId:z.uuid(),attemptRevision:z.number().int().positive(),versionId:z.uuid(),projectionHash:z.string().regex(/^[a-f0-9]{64}$/),items:z.array(z.object({id:z.string(),title:z.string().max(120),summary:z.string().max(300)}).strict()).max(4)}).strict(),requestId:z.uuid()}).strict();
const createdSchema=z.object({ok:z.literal(true),entry:postSchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
// The server's adult/consent gate runs BEFORE the immutable operation receipt lookup.
// A gate denial on retry cannot prove whether the earlier attempt created a draft.
// Client-side auth_required can also occur AFTER an applied response if the session changed.
const definiteFirstAttemptCodes=new Set(['forbidden','rate_limited','recipient_unavailable','resource_not_found','revision_conflict','operation_conflict','invalid_request','verification_required','consent_required']);
const definiteReplayCodes=new Set(['revision_conflict','operation_conflict']);
export function definitivelyRejectedTestDraft(error:unknown,wasRetry:boolean):boolean {
 return error instanceof DomainClientError&&
  (wasRetry?definiteReplayCodes.has(error.code):definiteFirstAttemptCodes.has(error.code));
}
export function TestSharePreview({session,attemptId,onClose,onPendingChange}:{session:AuthSession;attemptId:string;onClose:()=>void;onPendingChange:(pending:boolean)=>void}){
 const [preview,setPreview]=useState<z.infer<typeof previewSchema>['preview']|null>(null),[selected,setSelected]=useState<string[]>([]),[name,setName]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[saved,setSaved]=useState(false),[savedState,setSavedState]=useState<z.infer<typeof postSchema>['state']|null>(null),[uncertain,setUncertain]=useState(false);
 const live=useRef(true),pending=useRef<Extract<PostTestCommand,{action:'posts.fromTest'}>|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{const abort=new AbortController();setPreview(null);setSelected([]);setConsent(false);setError('');setBusy(true);void domainRequest(session,{action:'posts.testPreview',attemptId},previewSchema,abort.signal).then(r=>{if(!abort.signal.aborted){if(r.preview.attemptId!==attemptId)throw new Error('invalid_response');setPreview(r.preview);}}).catch(e=>{if(!abort.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[session,attemptId]);
 const text=preview&&selected.length?'Выбранные выводы моего опросника:\n'+preview.items.filter(i=>selected.includes(i.id)).map(i=>i.title+': '+i.summary).join('\n')+'\n\nЭто мои ответы сейчас, не диагноз и не согласие на конкретный опыт.':'';
 const create=async()=>{if(busy||saved||!preview||(!pending.current&&(!consent||!selected.length||!name.trim())))return;
  const wasRetry=pending.current!==null;
  const command=pending.current||{action:'posts.fromTest',attemptId:preview.attemptId,versionId:preview.versionId,expectedAttemptRevision:preview.attemptRevision,projectionHash:preview.projectionHash,id:crypto.randomUUID(),operationId:crypto.randomUUID(),selected:[...selected].sort(),authorLabel:name.trim(),plannedAudience:'public',recipientCodes:[],consent:true} satisfies PostTestCommand;
  pending.current=command;onPendingChange(true);setBusy(true);setUncertain(false);setError('');
  try{const r=await domainRequest(session,command,createdSchema);if(!live.current)return;if(r.entry.id!==command.id||!r.entry.mine)throw new Error('invalid_response');pending.current=null;onPendingChange(false);setSaved(true);setSavedState(r.entry.state);setConsent(false);}
  catch(e){if(live.current){setError(domainErrorMessage(e));const rejected=definitivelyRejectedTestDraft(e,wasRetry);if(rejected){pending.current=null;onPendingChange(false);setPreview(null);setSelected([]);setConsent(false);}setUncertain(!rejected);}}
  finally{if(live.current)setBusy(false);}
 };
 const close=()=>{if(!busy&&!pending.current)onClose();};
 return <AppDialog title="Выбрать вывод для публикации" onClose={close}><p>Выбери только то, чем хочешь поделиться. Ответы на вопросы, оценки, границы и остальные выводы не переносятся.</p>
 {!saved&&preview&&<fieldset disabled={busy||uncertain}><legend>Подготовленные выводы</legend>{preview.items.map(i=><label className="ft-consent-choice" key={i.id}><input type="checkbox" checked={selected.includes(i.id)} onChange={e=>{setSelected(old=>e.target.checked?[...old,i.id]:old.filter(id=>id!==i.id));setConsent(false);}}/>{i.title}: {i.summary}</label>)}{!preview.items.length&&<p>Для этого результата нет разрешённых выводов для публикации. Он остаётся только твоим.</p>}
 {text&&<><h3>Точный текст черновика</h3><p className="ft-review-text">{text}</p><label>Имя для публикации<input maxLength={80} value={name} onChange={e=>{setName(e.target.value);setConsent(false);}}/></label><label className="ft-consent-choice"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Разрешаю перенести выбранные выводы и указанное имя в отдельный личный черновик для публикации.</label><p>Черновик видишь только ты. Аудиторию и согласие на отправку выберешь в «Моих публикациях»; текст откроется другим только после проверки управляющим. Удаление прохождения не удаляет отдельный черновик — его можно удалить в публикациях.</p></>}
 </fieldset>}
 {busy&&<p role="status">Загружаем или сохраняем…</p>}{error&&<p role="alert">{error}</p>}
 {uncertain&&<p role="status">Ответ потерян. Повтори то же сохранение; окно остаётся открытым, чтобы не создать второй черновик.</p>}
 {saved&&<p role="status">{savedState==='deleted'?'Черновик уже удалён. Повтор не восстановил текст.':savedState==='draft'?'Личный черновик сохранён. Повтор не создаёт копию.':'Черновик уже изменён. Проверь его текущий статус в публикациях.'} <Link to="/community?view=mine">Открыть мои публикации</Link></p>}
 <div className="ft-form-actions">{!saved&&preview&&<button type="button" disabled={busy||(!uncertain&&(!consent||!selected.length||!name.trim()))} onClick={()=>void create()}>{uncertain?'Повторить то же сохранение':'Создать личный черновик'}</button>}<button type="button" disabled={busy||uncertain} onClick={close}>{saved?'Готово':'Закрыть'}</button></div>
 </AppDialog>;
}
