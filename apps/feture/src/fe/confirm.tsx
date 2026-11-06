import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {feErrorMessage} from '../feture/fe-api';
import {Actions,Btn,CodeInput,Field,Sheet} from './kit';
import {setConfirmPrompt,useFe} from './session';
import {useToast} from './toast';

/** «Confirm it is you» (security audit 06.11.2026, B5; server/step-up.mjs). An action the server refused for it (403
 * `second_factor`, rule `confirm`: turning on a second factor, deleting the account) opens this sheet through `call`; the code
 * goes to the signed-in address, a right one repeats the action. Core's e-mail change asks the same through `askConfirm`. */
const startRes=z.object({ok:z.literal(true),sent:z.boolean()}).passthrough();
const checkRes=z.object({ok:z.literal(true),confirmed:z.boolean(),reason:z.string().optional(),left:z.number().optional()}).passthrough();

export function ConfirmPromptHost(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [open,setOpen]=useState(false);const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const done=useRef<((ok:boolean)=>void)|null>(null);
 const send=useCallback(async(quiet=false)=>{
  setBusy(true);setErr('');setCode('');
  try{await call('account.confirmStart',{},startRes,{asAccount:true});if(!quiet)toast(t('fe.cf.sent'),{type:'ok'});}
  catch(e){setErr(feErrorMessage(e,t)||t('fe.cf.failed'));}finally{setBusy(false);}
 },[call,t,toast]);
 useEffect(()=>{
  setConfirmPrompt(()=>new Promise<boolean>(resolve=>{done.current=resolve;setOpen(true);void send(true);}));
  return ()=>{setConfirmPrompt(null);done.current?.(false);done.current=null;};
 },[send]);
 const finish=(ok:boolean)=>{const f=done.current;done.current=null;setOpen(false);setCode('');setErr('');f?.(ok);};
 const check=async(c:string)=>{
  if(c.length<6||busy)return;
  setBusy(true);setErr('');
  try{const r=await call('account.confirmCheck',{code:c},checkRes,{asAccount:true});
   if(r.confirmed){finish(true);return;}
   setCode('');
   setErr(r.reason==='bad_code'?t('fe.cf.wrong',{n:String(r.left??0)}):r.reason==='code_expired'?t('fe.cf.expired'):r.reason==='too_many_tries'?t('fe.cf.tries'):t('fe.cf.missing'));}
  catch(e){setErr(feErrorMessage(e,t));setCode('');}finally{setBusy(false);}
 };
 if(!open)return null;
 return <Sheet title={t('fe.cf.title')} onClose={()=>finish(false)} dirty
  foot={<Actions stack><Btn busy={busy} disabled={code.length<6} onClick={()=>void check(code)}>{t('fe.w8.mail.confirm')}</Btn><Btn kind="text" disabled={busy} onClick={()=>void send()}>{t('fe.cf.again')}</Btn></Actions>}>
  <p className="lead">{t('fe.cf.lead')}</p>
  <Field label={t('fe.cf.code')} error={err||undefined}>
   <CodeInput value={code} onChange={v=>{setCode(v);setErr('');}} label={t('fe.cf.code')} invalid={!!err} autoFocus disabled={busy} onComplete={c=>void check(c)}/>
  </Field>
 </Sheet>;
}
