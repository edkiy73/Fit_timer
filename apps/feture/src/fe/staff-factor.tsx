import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {KeyRound,ShieldCheck,UserX} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,Alert,Ask,Btn,Card,CodeInput,Empty,Field,Group,H,Input,Note,QrCode,RecoveryCodes,SecretKey,Sheet,Skel,Stack} from './kit';
import {setFactorPrompt,useFe} from './session';
import {copyLink} from './share';
import {useToast} from './toast';

/** Staff second factor (owner 29.10.2026, server/commands/staff.mjs): enrolment (QR + key → first code → recovery
 * codes once), the unlock form of the staff area, and the inline prompt that a refused dangerous action opens. */

export const factorSchema=z.object({enrolled:z.boolean(),verified:z.boolean(),fresh:z.boolean(),until:z.string().nullable(),freshUntil:z.string().nullable(),
 lockedUntil:z.string().nullable(),recoveryLeft:z.number()});
export type Factor=z.infer<typeof factorSchema>;
const startRes=z.object({ok:z.literal(true),secret:z.string(),uri:z.string()});
const checkRes=z.object({ok:z.literal(true),verified:z.boolean(),reason:z.enum(['wrong','used','locked']).optional(),left:z.number().optional(),lockedUntil:z.string().nullable().optional(),
 codes:z.array(z.string()).optional(),recovery:z.boolean().optional(),recoveryLeft:z.number().optional()}).passthrough();
type Check=z.infer<typeof checkRes>;

/** A refusal in plain words. */
function useRefusal(){
 const {t,locale}=useI18n();
 return (r:Check)=>r.reason==='locked'?t('fe.sf.locked',{time:new Date(r.lockedUntil??Date.now()).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})})
  :r.reason==='used'?t('fe.sf.used'):t('fe.sf.wrong',{n:String(r.left??0)});
}

/** The code field: six boxes for the app's code, or a line for a recovery code. `onVerified` gets the server's answer. */
function CodeForm({onVerified,submitLabel,autoFocus=true}:{onVerified:(r:Check)=>void,submitLabel?:string,autoFocus?:boolean}){
 const {call}=useFe();const {t}=useI18n();const refusal=useRefusal();
 const [code,setCode]=useState('');const [recovery,setRecovery]=useState(false);const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const send=async(c=code)=>{
  const v=c.trim();if(busy||(!recovery&&v.length<6)||(recovery&&v.length<10))return;
  setBusy(true);setErr('');
  try{const r=await call('staff.totpVerify',{code:v},checkRes,{asAccount:true});if(r.verified)onVerified(r);else{setErr(refusal(r));setCode('');}}
  catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <Stack gap={3}>
  {recovery?<Field id="fe-sf-rc" label={t('fe.sf.recovery')} error={err||undefined}>
   <Input id="fe-sf-rc" value={code} invalid={!!err} autoFocus={autoFocus} autoCapitalize="off" autoComplete="off" spellCheck={false} placeholder="xxxxx-xxxxx"
    onChange={e=>{setCode(e.target.value);setErr('');}} onKeyDown={e=>{if(e.key==='Enter')void send();}}/></Field>
   :<Field label={t('fe.sf.code')} error={err||undefined}>
    <CodeInput value={code} onChange={v=>{setCode(v);setErr('');}} label={t('fe.sf.code')} invalid={!!err} autoFocus={autoFocus} disabled={busy} onComplete={c=>void send(c)}/></Field>}
  <Actions stack>
   <Btn busy={busy} disabled={busy||(recovery?code.trim().length<10:code.length<6)} onClick={()=>void send()}>{submitLabel??t('fe.sf.confirm')}</Btn>
   <Btn kind="text" onClick={()=>{setRecovery(!recovery);setCode('');setErr('');}}>{recovery?t('fe.sf.useApp'):t('fe.sf.useRecovery')}</Btn>
  </Actions>
 </Stack>;
}

/** First visit of a staff member: connect an authenticator app, then keep the recovery codes. */
export function StaffEnrol({onDone}:{onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const refusal=useRefusal();
 const [start,setStart]=useState<z.infer<typeof startRes>|null>(null);const [error,setError]=useState<unknown>(null);
 const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [codes,setCodes]=useState<string[]|null>(null);
 const begin=useCallback(()=>{setError(null);call('staff.totpStart',{},startRes,{asAccount:true}).then(setStart).catch(setError);},[call]);
 useEffect(()=>{begin();},[begin]);
 const copy=async(text:string)=>{if(await copyLink(text))toast(t('fe.sf.copied'),{type:'ok'});};
 const confirm=async(c=code)=>{
  if(busy||c.length<6)return;setBusy(true);setErr('');
  try{const r=await call('staff.totpConfirm',{code:c},checkRes,{asAccount:true});if(r.verified&&r.codes)setCodes(r.codes);else{setErr(refusal(r));setCode('');}}
  catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 if(codes)return <Stack gap={4}>
  <Stack gap={2}><H level={3} as="h2">{t('fe.sf.codesTitle')}</H><Note>{t('fe.sf.codesLead')}</Note></Stack>
  <RecoveryCodes codes={codes} label={t('fe.sf.codesTitle')} copyLabel={t('fe.sf.copyAll')} onCopy={()=>void copy(codes.join('\n'))}/>
  <Btn icon={ShieldCheck} onClick={onDone}>{t('fe.sf.done')}</Btn>
 </Stack>;
 if(error)return <Empty icon={KeyRound} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={begin}>{t('fe.retry')}</Btn></Empty>;
 return <Stack gap={4}>
  <Stack gap={2}><H level={3} as="h2">{t('fe.sf.enrolTitle')}</H><Note>{t('fe.sf.enrolLead')}</Note></Stack>
  <Card><Stack gap={4}>
   <Note>{t('fe.sf.scan')}</Note>
   {start?<QrCode value={start.uri} label={t('fe.sf.qr')}/>:<Skel kind="card" rows={1}/>}
   {start&&<SecretKey value={start.secret} label={t('fe.sf.key')} copyLabel={t('fe.sf.copy')} onCopy={()=>void copy(start.secret)}/>}
  </Stack></Card>
  <Field label={t('fe.sf.code')} error={err||undefined}>
   <CodeInput value={code} onChange={v=>{setCode(v);setErr('');}} label={t('fe.sf.code')} invalid={!!err} disabled={busy||!start} onComplete={c=>void confirm(c)}/></Field>
  <Btn busy={busy} disabled={busy||!start||code.length<6} onClick={()=>void confirm()}>{t('fe.sf.confirm')}</Btn>
 </Stack>;
}

/** The staff area without a code in this sign-in (or after 12 hours). */
export function StaffUnlock({factor,onDone}:{factor:Factor,onDone:()=>void}){
 const {t,locale}=useI18n();const toast=useToast();
 return <Stack gap={4}>
  <Stack gap={2}><H level={3} as="h2">{t('fe.sf.unlockTitle')}</H><Note>{t('fe.sf.unlockLead')}</Note></Stack>
  {factor.lockedUntil&&<Alert kind="warn">{t('fe.sf.locked',{time:new Date(factor.lockedUntil).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})})}</Alert>}
  <CodeForm onVerified={r=>{if(r.recovery)toast(t('fe.sf.recoveryLeft',{n:String(r.recoveryLeft??0)}),{type:'info'});onDone();}}/>
 </Stack>;
}

/** Registers the inline code prompt for the staff area: a dangerous action refused for a fresh code (or a window that
 * ran out mid-work) opens this sheet; a right code repeats the action (session.tsx). */
export function FactorPromptHost({onEnrol}:{/** The factor was removed meanwhile (a lead's reset): the staff area shows enrolment. */ onEnrol:()=>void}){
 const {t}=useI18n();const toast=useToast();
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
   <CodeForm onVerified={r=>{if(r.recovery)toast(t('fe.sf.recoveryLeft',{n:String(r.recoveryLeft??0)}),{type:'info'});finish(true);}}/></Stack>
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
  <Card><Stack gap={3}>
   <Field id="fe-sf-reset" label={t('fe.sf.resetNick')}><Input id="fe-sf-reset" value={nick} placeholder="@nick" autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={e=>setNick(e.target.value)}/></Field>
   {err&&<Alert kind="err">{err}</Alert>}
   <Btn kind="soft" icon={UserX} busy={busy} disabled={busy||clean.length<2} onClick={()=>{setErr('');setAsk(true);}}>{t('fe.sf.resetBtn')}</Btn>
  </Stack></Card>
  {ask&&<Ask icon={UserX} title={t('fe.sf.resetAsk',{nick:clean})} ok={t('fe.sf.resetBtn')} danger onOk={()=>void reset()} onCancel={()=>setAsk(false)}/>}
 </Group>;
}
