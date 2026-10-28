import {useRef,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Flag,Info,Users,type LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {publicOrigin} from '../api-url';
import {Alert,Btn,RadioList,Sheet,TextArea} from './kit';
import {useFe} from './session';
import {namedPlate} from './create-community';

/** What only the «Сообщества» screens share, built from the kit (src/fe/kit): the named plates, the report sheet,
 * the link helpers and the plural/fill text helpers. Controls themselves always come from the kit. */

export const okRes=z.object({ok:z.literal(true)}).passthrough();
export const fill=(s:string,v:Record<string,string|number>)=>s.replace(/\{(\w+)\}/g,(m,k:string)=>k in v?String(v[k]):m);
/** `pl()` — «1 участник / 2 участника / 5 участников»; the forms come from the dictionary as «a|b|c». */
export function pl(n:number,forms:string,locale:string){
 const f=forms.split('|');
 if(locale==='en')return `${n} ${n===1?f[0]:f[1]??f[0]}`;
 const m=n%10,h=n%100;return `${n} ${m===1&&h!==11?f[0]:m>=2&&m<=4&&(h<12||h>14)?f[1]:f[2]??f[1]}`;
}
export const plWord=(n:number,forms:string,locale:string)=>pl(n,forms,locale).replace(/^\d+ /,'');

/** The community / event picture when there is no photo: the named plate, with the group icon for communities. */
export function NamedPlate({k,icon:Icon}:{k:string|null|undefined,icon?:LucideIcon|undefined}){
 return <div className="plate" style={namedPlate(k||'lilac')}>{Icon&&<span className="pi"><Icon/></span>}</div>;
}
export const CommPlate=({k}:{k:string|null|undefined})=><NamedPlate k={k} icon={Users}/>;

const REASONS=['threat','private','minor','spam','other'] as const;
/** «Пожаловаться» on a community or an event: the reason, details, and the report goes to moderators. */
export function ReportSheet({targetType,targetId,onClose,onDone}:{targetType:'community'|'event'|'post',targetId:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [reason,setReason]=useState<typeof REASONS[number]|''>('');const [details,setDetails]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const op=useRef(newOpId());
 const send=async()=>{
  if(!reason){setErr(t('fe.pm.rp.chooseReason'));return;}
  setBusy(true);setErr('');
  try{await call('report.create',{opId:op.current,targetType,targetId,reason,details:details.trim().slice(0,500)},okRes);onDone(t('fe.cm.reported'));}
  catch(e){setErr(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 return <Sheet title={t('fe.pm.rp.title')} onClose={onClose} foot={<Btn kind="danger" onClick={send} busy={busy} disabled={busy} icon={Flag}>{t('fe.pm.rp.send')}</Btn>}>
  <RadioList label={t('fe.pm.rp.reason')} value={reason||null} onChange={k=>{setReason(k);setErr('');}} options={REASONS.map(k=>[k,t('fe.pm.rp.'+k)] as const)}/>
  <label className="field mt16"><span>{t('fe.pm.rp.details')}<i>{t('fe.pm.rp.optional')}</i></span>
   <TextArea rows={3} maxLength={500} value={details} onChange={e=>setDetails(e.target.value)}/></label>
  {err&&<Alert kind="err" icon={Info} className="mt12">{err}</Alert>}
 </Sheet>;
}

/** Copies a link; says so either way. */
export async function copyLink(url:string){
 try{await navigator.clipboard.writeText(url);return true;}catch{return false;}
}
export const appUrl=(path:string)=>`${publicOrigin()}/#${path}`;
