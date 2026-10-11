import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import type {TestsCommand} from '../../lib/feture/questionnaires';
import {domainRequest,domainErrorMessage} from './domain-api';
import {interestQueue,useInterestMap} from './use-interest-map';
const previewSchema=z.object({ok:z.literal(true),versionId:z.uuid(),attemptId:z.uuid(),items:z.array(z.object({interestId:z.string().regex(/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/),title:z.string().max(160),dimensionId:z.string().max(48),reason:z.string().max(600),available:z.boolean()}).strict()).max(6),requestId:z.uuid()}).strict();
const applySchema=z.object({ok:z.literal(true),applied:z.number().int().min(1).max(6),replayed:z.boolean(),requestId:z.uuid()}).strict();
export function ResultMap({session,attemptId}:{session:AuthSession;attemptId:string}){
 const {map}=useInterestMap();const [preview,setPreview]=useState<z.infer<typeof previewSchema>|null>(null),[selected,setSelected]=useState<Record<string,boolean>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<TestsCommand|null>(null),live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const load=async()=>{if(busy||pending.current)return;setBusy(true);setError('');setNotice('');try{const data=await domainRequest(session,{action:'tests.mapPreview',attemptId},previewSchema);if(live.current){setPreview(data);setSelected({});}}catch(e){if(live.current)setError(domainErrorMessage(e));}finally{if(live.current)setBusy(false);}};
 const apply=async()=>{if(!preview||busy)return;const selections=Object.entries(selected).map(([interestId])=>({interestId,expectedRevision:0 as const}));if(!pending.current&&!selections.length)return;if(!pending.current&&selections.some(s=>map[s.interestId]||!preview.items.some(i=>i.interestId===s.interestId&&i.available))){setError('Выбранная тема уже есть в карте или среди твоих правок. Сними её выбор и проверь предложения заново.');return;}setBusy(true);setError('');
 const command=pending.current||{action:'tests.mapApply',attemptId,operationId:crypto.randomUUID(),selected:selections} satisfies TestsCommand;pending.current=command;
 try{const result=await domainRequest(session,command,applySchema);if(live.current){pending.current=null;setPreview(null);setSelected({});setNotice(`В карту аккаунта добавлено тем: ${result.applied}. Они приватны; границы и опыт выбираешь отдельно.`);void interestQueue.sync();}}
 catch(e){if(live.current)setError(domainErrorMessage(e));}finally{if(live.current)setBusy(false);}};
 return <article className="card"><h3>Выбрать темы для карты</h3><p>Опросник предлагает связанные темы. Только ты решаешь, что они значат для тебя. Балл не задаёт желание, опыт, границы или согласие.</p>
 {!preview&&<button type="button" disabled={busy} onClick={()=>void load()}>Посмотреть предложения</button>}
 {preview&&<><p>Проверь изменения: добавятся только выбранные новые темы. Видимость — «Только я», участие в поиске выключено. Сила, опыт и границы не определяются по результату.</p>
 {preview.items.map(item=>{const available=item.available&&!map[item.interestId];return <div className="card" key={item.interestId}><label className="ft-consent-choice"><input type="checkbox" disabled={!available&&!Object.hasOwn(selected,item.interestId)||busy||!!pending.current} checked={Object.hasOwn(selected,item.interestId)} onChange={e=>{if(e.target.checked&&!available)return;setError('');setSelected(current=>{const next={...current};if(e.target.checked)next[item.interestId]=true;else delete next[item.interestId];return next;});}}/>Мне любопытна тема «{item.title}»</label><p>{item.reason}</p>
 {!available&&<p className="muted">Эта тема уже есть в карте или среди твоих несохранённых правок. Здесь она не меняется.</p>}
</div>;})}
 {preview.items.length===0&&<p>Для этого результата нет предложений. Карту можно заполнить самостоятельно.</p>}
 <div className="ft-form-actions"><button type="button" disabled={busy||!Object.keys(selected).length} onClick={()=>void apply()}>{pending.current?'Повторить перенос':'Добавить выбранные темы'}</button><button type="button" disabled={busy||!!pending.current} onClick={()=>{setPreview(null);setSelected({});setError('');}}>Отмена</button></div>
 {error&&pending.current&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('Проверить карту заново? Предыдущее действие могло уже сохраниться. Существующие темы не будут изменены.')){pending.current=null;setPreview(null);setSelected({});setError('');void load();}}}>Проверить предложения заново</button>}
 </>}
 {busy&&<p role="status">Проверяем карту…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice} <Link to="/">Открыть карту</Link></p>}
 </article>;
}
