import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,ChevronRight,Flag,Info,TriangleAlert,Users,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn,Layer,Seg} from './ui';
import {useFe} from './session';
import {namedPlate} from './create-community';

/** Pieces the «Сообщества» screens share (V21 bar() with a sub line, seg() with counters, sheet(), ask(), linkRow(),
 * the named plates). Shared look lives in ui.tsx; these are the prototype helpers ui.tsx does not have. */

export const okRes=z.object({ok:z.literal(true)}).passthrough();
export const fill=(s:string,v:Record<string,string|number>)=>s.replace(/\{(\w+)\}/g,(m,k:string)=>k in v?String(v[k]):m);
/** `pl()` — «1 участник / 2 участника / 5 участников»; the forms come from the dictionary as «a|b|c». */
export function pl(n:number,forms:string,locale:string){
 const f=forms.split('|');
 if(locale==='en')return `${n} ${n===1?f[0]:f[1]??f[0]}`;
 const m=n%10,h=n%100;return `${n} ${m===1&&h!==11?f[0]:m>=2&&m<=4&&(h<12||h>14)?f[1]:f[2]??f[1]}`;
}
export const plWord=(n:number,forms:string,locale:string)=>pl(n,forms,locale).replace(/^\d+ /,'');

/** `bar(title,{back,sm,sub,actions})` — the screen header with the second line under the title. */
/** Kit pieces under the names the community screens use. */
import {SubBar,Row as LinkRow,Sheet as CSheet,Ask} from './kit';
export {SubBar,LinkRow,CSheet,Ask};
/** Older names of the one tab control (ui.tsx Seg). */
export const SegN=Seg;
export function TabStrip<T extends string>({value,items,onChange}:{value:T,items:[T,string,number?][],onChange:(v:T)=>void}){
 return <Seg value={value} onChange={onChange} options={items.map(([id,label,n])=>({id,label,n}))}/>;
}

/** `linkRow()` — icon, title, optional sub, value, badge and chevron. */
/** The community / event picture when there is no photo: the named plate, with the group icon for communities. */
export function NamedPlate({k,icon:Icon}:{k:string|null|undefined,icon?:LucideIcon|undefined}){
 return <div className="plate" style={namedPlate(k||'lilac')}>{Icon&&<span className="pi"><Icon/></span>}</div>;
}
export const CommPlate=({k}:{k:string|null|undefined})=><NamedPlate k={k} icon={Users}/>;

/** `sheet()` — `div.layer > div.scrim + div.sheet` with the grab handle, title, optional header action, body and foot. */

const REASONS=['threat','private','minor','spam','other'] as const;
/** «Пожаловаться» on a community or an event: the reason, details, and the report goes to moderators. */
export function ReportSheet({targetType,targetId,onClose,onDone}:{targetType:'community'|'event',targetId:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [reason,setReason]=useState<typeof REASONS[number]|''>('');const [details,setDetails]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const op=useRef(newOpId());
 const send=async()=>{
  if(!reason){setErr(t('fe.pm.rp.chooseReason'));return;}
  setBusy(true);setErr('');
  try{await call('report.create',{opId:op.current,targetType,targetId,reason,details:details.trim().slice(0,500)},okRes);onDone(t('fe.cm.reported'));}
  catch(e){setErr(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 return <CSheet title={t('fe.pm.rp.title')} onClose={onClose} foot={<Btn kind="danger" onClick={send} busy={busy} disabled={busy} icon={Flag}>{t('fe.pm.rp.send')}</Btn>}>
  <div role="radiogroup" aria-label={t('fe.pm.rp.reason')}>
   {REASONS.map(k=><button key={k} type="button" className={'radio'+(reason===k?' on':'')} role="radio" aria-checked={reason===k} onClick={()=>{setReason(k);setErr('');}}><i/><span className="tx">{t('fe.pm.rp.'+k)}</span></button>)}
  </div>
  <label className="field mt16"><span>{t('fe.pm.rp.details')}<i>{t('fe.pm.rp.optional')}</i></span>
   <textarea className="inp" rows={3} maxLength={500} value={details} onChange={e=>setDetails(e.target.value)}/></label>
  {err&&<div className="alert err mt12" role="alert"><Info/><span>{err}</span></div>}
 </CSheet>;
}

/** Copies a link; says so either way. */
export async function copyLink(url:string){
 try{await navigator.clipboard.writeText(url);return true;}catch{return false;}
}
export const appUrl=(path:string)=>`${location.origin}/#${path}`;
