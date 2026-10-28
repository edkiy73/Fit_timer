import {useRef,useState,type ReactNode} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Flag} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Card,Counter,Field,RadioList,Sheet,Stack,TextArea,ToggleRow} from './kit';
import {useFe} from './session';
import {FIELD,serverFields,shakeFirstErr,softMax,textError,textErrorMessage,textLength} from './kit/validate';

/** The one «Пожаловаться» sheet of the app (posts, replies, profiles, communities, events, chats), owner 28.10.2026:
 * plain reason rows with a short line under each, «Подробности» required (at least DETAILS_MIN characters, the server
 * checks the same), «Также заблокировать» where blocking makes sense. */
export const REPORT_REASONS=['threat','private','minor','spam','other'] as const;
export type ReportReason=typeof REPORT_REASONS[number];
export type ReportTarget='post'|'reply'|'profile'|'community'|'event'|'conversation';
/** The server's rule (contracts/_text.mjs FIELD.reportDetails): 10–500, the shared characters / lines / runs checks. */
export const DETAILS_MIN=FIELD.reportDetails.min;
const ok=z.object({ok:z.literal(true)}).passthrough();

export function ReportSheet({targetType,targetId,block,before,check,extra,profileId,onClose,onDone}:{targetType:ReportTarget,targetId:string,
 /** The starting state of «Также заблокировать»; left out — no switch (a community, an event). */ block?:boolean,
 /** Content above the reasons (the chat's message picker). */ before?:ReactNode,
 /** A check of `before` before sending: a message, or '' when fine. */ check?:()=>string,
 /** More input for report.create (the chat's messageIds). */ extra?:Record<string,unknown>|undefined,
 /** The profile acting (the chat's side). */ profileId?:string,
 onClose:()=>void,onDone:(alsoBlock:boolean)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [reason,setReason]=useState<ReportReason|null>(null);const [details,setDetails]=useState('');const [alsoBlock,setAlsoBlock]=useState(!!block);
 const [reasonErr,setReasonErr]=useState('');const [detailsErr,setDetailsErr]=useState('');const [failure,setFailure]=useState('');const [busy,setBusy]=useState(false);
 const op=useRef(newOpId());
 const send=async()=>{
  if(busy)return;
  const text=details.trim();
  const rErr=reason?'':t('fe.pm.rp.chooseReason');
  const dErr=!text?t('fe.pm.rp.detailsNeed'):textLength(text)<DETAILS_MIN?t('fe.pm.rp.detailsShort',{n:DETAILS_MIN}):textError(t,'reportDetails',details)??'';
  const cErr=check?.()??'';
  setReasonErr(rErr);setDetailsErr(dErr);setFailure(cErr);
  if(rErr||dErr||cErr||!reason){if(rErr||dErr)shakeFirstErr();return;}
  setBusy(true);
  try{
   await call('report.create',{opId:op.current,targetType,targetId,reason,details:text.slice(0,500),...(block!==undefined?{alsoBlock}:{}),...extra},ok,profileId?{profileId}:{});
   onDone(alsoBlock);
  }catch(e){
   // A refusal of the details lands under the field (invalid_input with reasons).
   const f=serverFields(e).find(x=>x.path==='details');
   if(f){setDetailsErr(textErrorMessage(t,f.code,FIELD.reportDetails));shakeFirstErr();}else setFailure(feErrorMessage(e,t));
   op.current=newOpId();
  }finally{setBusy(false);}
 };
 return <Sheet title={t('fe.pm.rp.title')} onClose={onClose} dirty={!!reason||!!details.trim()}
  foot={<Btn kind="danger" icon={Flag} onClick={()=>void send()} busy={busy} disabled={busy}>{t('fe.pm.rp.send')}</Btn>}>
  <Stack gap={4}>
   {before}
   <Field name="reason" label={t('fe.pm.rp.reason')} error={reasonErr||undefined}>
    <RadioList label={t('fe.pm.rp.reason')} value={reason} onChange={k=>{setReason(k);setReasonErr('');}}
     options={REPORT_REASONS.map(k=>[k,t('fe.pm.rp.'+k),t('fe.pm.rp.sub.'+k)] as const)}/>
   </Field>
   <Field id="report-details" name="details" label={t('fe.pm.rp.details')} error={detailsErr||undefined} hint={detailsErr?undefined:t('fe.pm.rp.detailsHint',{n:DETAILS_MIN})}>
    <TextArea id="report-details" rows={3} maxLength={softMax('reportDetails')} value={details} invalid={!!detailsErr} placeholder={t('fe.pm.rp.detailsPh')}
     onChange={e=>{setDetails(e.target.value);if(detailsErr&&e.target.value.trim().length>=DETAILS_MIN)setDetailsErr('');}}
     onBlur={()=>{const v=details.trim();if(textLength(v)>=DETAILS_MIN)setDetailsErr(textError(t,'reportDetails',details)??'');}}/>
    {textLength(details)>=FIELD.reportDetails.max*0.8&&<Counter n={textLength(details)} max={FIELD.reportDetails.max}/>}
   </Field>
   {block!==undefined&&<Card list><ToggleRow title={t('fe.pm.rp.alsoBlock')} sub={t('fe.pm.rp.alsoBlockSub')} on={alsoBlock} onClick={()=>setAlsoBlock(v=>!v)}/></Card>}
   {failure&&<Alert kind="err">{failure}</Alert>}
  </Stack>
 </Sheet>;
}
