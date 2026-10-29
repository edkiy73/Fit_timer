import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {UserX} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Ask,Btn,Field,Form,Group,H,Input,Note,Sheet,Stack} from './kit';
import {CodeForm,FactorEnrol,checkRes,startRes} from './factor';
import {setFactorPrompt,useFe} from './session';
import {useToast} from './toast';

/** Staff second factor (owner 29.10.2026, server/commands/staff.mjs): enrolment, the unlock form of the staff area, and
 * the inline prompt that a refused dangerous action opens — the shared pieces of factor.tsx on the staff commands. */

export const factorSchema=z.object({enrolled:z.boolean(),verified:z.boolean(),fresh:z.boolean(),until:z.string().nullable(),freshUntil:z.string().nullable(),
 lockedUntil:z.string().nullable(),recoveryLeft:z.number()});
export type Factor=z.infer<typeof factorSchema>;
/** The staff check: the unlock form and the prompt send codes here. */
const useStaffCheck=()=>{const {call}=useFe();return (code:string)=>call('staff.totpVerify',{code},checkRes,{asAccount:true});};

/** First visit of a staff member: connect an authenticator app, then keep the recovery codes. */
export function StaffEnrol({onDone}:{onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 return <FactorEnrol title={t('fe.sf.enrolTitle')} lead={t('fe.sf.enrolLead')} onDone={onDone}
  start={()=>call('staff.totpStart',{},startRes,{asAccount:true})} confirm={code=>call('staff.totpConfirm',{code},checkRes,{asAccount:true})}/>;
}

/** The staff area without a code in this sign-in (or after 12 hours). */
export function StaffUnlock({factor,onDone}:{factor:Factor,onDone:()=>void}){
 const {t,locale}=useI18n();const toast=useToast();const check=useStaffCheck();
 return <Stack gap={4}>
  <Stack gap={2}><H level={3} as="h2">{t('fe.sf.unlockTitle')}</H><Note>{t('fe.sf.unlockLead')}</Note></Stack>
  {factor.lockedUntil&&<Alert kind="warn">{t('fe.sf.locked',{time:new Date(factor.lockedUntil).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})})}</Alert>}
  <CodeForm check={check} onVerified={r=>{if(r.recovery)toast(t('fe.sf.recoveryLeft',{n:String(r.recoveryLeft??0)}),{type:'info'});onDone();}}/>
 </Stack>;
}

/** Registers the inline code prompt for the staff area: a dangerous action refused for a fresh code (or a window that
 * ran out mid-work) opens this sheet; a right code repeats the action (session.tsx). */
export function FactorPromptHost({onEnrol}:{/** The factor was removed meanwhile (a lead's reset): the staff area shows enrolment. */ onEnrol:()=>void}){
 const {t}=useI18n();const toast=useToast();const check=useStaffCheck();
 const [need,setNeed]=useState<'verify'|'fresh'|null>(null);const done=useRef<((ok:boolean)=>void)|null>(null);
 const enrol=useRef(onEnrol);enrol.current=onEnrol;
 useEffect(()=>{
  setFactorPrompt(n=>n==='enrol'?(enrol.current(),Promise.resolve(false)):new Promise<boolean>(resolve=>{done.current=resolve;setNeed(n);}));
  return ()=>{setFactorPrompt(null);done.current?.(false);done.current=null;};
 },[]);
 const finish=(ok:boolean)=>{const f=done.current;done.current=null;setNeed(null);f?.(ok);};
 if(!need)return null;
 return <Sheet title={need==='fresh'?t('fe.sf.freshTitle'):t('fe.sf.unlockTitle')} onClose={()=>finish(false)}>
  <Stack gap={4}><Note>{need==='fresh'?t('fe.sf.freshLead'):t('fe.sf.unlockLead')}</Note>
   <CodeForm check={check} onVerified={r=>{if(r.recovery)toast(t('fe.sf.recoveryLeft',{n:String(r.recoveryLeft??0)}),{type:'info'});finish(true);}}/></Stack>
 </Sheet>;
}

/** Owner / lead: remove a staff member's authenticator (lost phone). Needs a fresh code (the prompt asks). */
export function FactorReset(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [nick,setNick]=useState('');const [ask,setAsk]=useState(false);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const clean=nick.trim().replace(/^@/,'');
 const reset=async()=>{setBusy(true);setErr('');
  setAsk(false); // a fresh-code prompt may open over the screen next
  try{const r=await call('staff.totpReset',{opId:newOpId(),handle:clean},z.object({ok:z.literal(true),reset:z.boolean()}),{asAccount:true});
   toast(t(r.reset?'fe.sf.resetDone':'fe.sf.resetNone',{nick:clean}),{type:r.reset?'ok':'info'});setNick('');}
  catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Group title={t('fe.sf.resetTitle')} foot={t('fe.sf.resetLead')}>
  <Form>
   <Field id="fe-sf-reset" label={t('fe.sf.resetNick')}><Input id="fe-sf-reset" value={nick} placeholder="@nick" autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={e=>setNick(e.target.value)}/></Field>
   <Btn kind="soft" icon={UserX} busy={busy} disabled={busy||clean.length<2} onClick={()=>{setErr('');setAsk(true);}}>{t('fe.sf.resetBtn')}</Btn>
   {err&&<Alert kind="err">{err}</Alert>}
  </Form>
  {ask&&<Ask icon={UserX} title={t('fe.sf.resetAsk',{nick:clean})} ok={t('fe.sf.resetBtn')} danger onOk={()=>void reset()} onCancel={()=>setAsk(false)}/>}
 </Group>;
}
