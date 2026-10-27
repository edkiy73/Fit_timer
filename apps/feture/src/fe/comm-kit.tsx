import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,ChevronRight,Flag,Info,TriangleAlert,Users,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn,Layer} from './ui';
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
export function SubBar({title,sub,back=true,children}:{title:string,sub?:string|null|undefined,back?:string|true|false,children?:ReactNode}){
 const navigate=useNavigate();const {t}=useI18n();
 return <header className="bar">
  {back&&<button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>typeof back==='string'?navigate(back):navigate(-1)}><ChevronLeft/></button>}
  <h1 className="sm" tabIndex={-1}>{title}{sub&&<span className="sub">{sub}</span>}</h1>
  {children}
 </header>;
}

/** `seg(items)` with the counter bubble of the prototype (`<em>n</em>`). */
export function SegN<T extends string>({value,options,onChange,label,small}:{value:T,options:{id:T,label:string,n?:number|undefined}[],onChange:(v:T)=>void,label?:string,small?:boolean}){
 const i=Math.max(0,options.findIndex(o=>o.id===value));
 return <div className={'seg'+(small?' sm':'')} role="tablist" aria-label={label}>
  <span className="knob" style={{width:`calc((100% - 8px)/${options.length})`,transform:`translateX(${i*100}%)`}}/>
  {options.map(o=><button key={o.id} type="button" role="tab" aria-selected={o.id===value} className={o.id===value?'on':''} onClick={()=>onChange(o.id)}><span>{o.label}</span>{o.n?<em>{o.n}</em>:null}</button>)}
 </div>;
}

/** `tabStrip()` — natural-width tabs with an optional counter. */
export function TabStrip<T extends string>({value,items,onChange}:{value:T,items:[T,string,number?][],onChange:(v:T)=>void}){
 return <div className="tabs14" role="tablist">{items.map(([id,l,n])=><button key={id} type="button" role="tab" aria-selected={id===value} className={id===value?'on':''} onClick={()=>onChange(id)}>{l}{n?<em>{n}</em>:null}</button>)}</div>;
}

/** `linkRow()` — icon, title, optional sub, value, badge and chevron. */
export function LinkRow({icon:Icon,tone='',title,sub,val,badge,danger,noChev,onClick,disabled,av}:{icon?:LucideIcon,tone?:string,title:ReactNode,sub?:ReactNode,val?:string,badge?:string|number|undefined,danger?:boolean,noChev?:boolean,onClick:()=>void,disabled?:boolean,av?:ReactNode}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick} disabled={disabled}>
  {Icon&&<span className={'ico '+tone}><Icon/></span>}{av}<span className="tx"><b>{title}</b>{sub?<small>{sub}</small>:null}</span>
  {val&&<span className="val">{val}</span>}{badge?<span className="pill hot">{badge}</span>:null}{!noChev&&<ChevronRight/>}
 </button>;
}

/** The community / event picture when there is no photo: the named plate, with the group icon for communities. */
export function NamedPlate({k,icon:Icon}:{k:string|null|undefined,icon?:LucideIcon|undefined}){
 return <div className="plate" style={namedPlate(k||'lilac')}>{Icon&&<span className="pi"><Icon/></span>}</div>;
}
export const CommPlate=({k}:{k:string|null|undefined})=><NamedPlate k={k} icon={Users}/>;

/** `sheet()` — `div.layer > div.scrim + div.sheet` with the grab handle, title, optional header action, body and foot. */
export function CSheet({title,sub,lead,head,onClose,children,foot,full}:{title:string,sub?:string,lead?:ReactNode,head?:ReactNode,onClose:()=>void,children:ReactNode,foot?:ReactNode,full?:boolean}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}};
  document.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('keydown',key);requestAnimationFrame(()=>opener?.focus?.({preventScroll:true}));};},[]);
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div ref={ref} className={'sheet on'+(full?' full':'')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h">{lead}<div className="sh-ht"><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{head}<button type="button" className="ibtn ghost sm" aria-label={t('fe.cm.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
 </Layer>;
}

/** `ask()` — the confirmation dialog: icon, title, text, the main (or red) button and «Отмена». */
export function Ask({icon:Icon=TriangleAlert,tone,title,text,ok,cancel,danger,busy,onOk,onCancel,children}:{icon?:LucideIcon,tone?:string,title:string,text?:string,ok:string,cancel?:string,danger?:boolean,busy?:boolean,onOk:()=>void,onCancel:()=>void,children?:ReactNode}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);const close=useRef(onCancel);close.current=onCancel;
 useEffect(()=>{ref.current?.querySelector<HTMLElement>('[data-r="0"]')?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[]);
 return <Layer>
  <div className="scrim on" style={{zIndex:3}} onClick={busy?undefined:onCancel}/>
  <div ref={ref} className="dialog on" role="alertdialog" aria-modal="true" aria-label={title} style={{display:'block',zIndex:4}}>
   <div className={'ico '+(tone??(danger?'a':''))}><Icon/></div><h2>{title}</h2>{text&&<p>{text}</p>}{children}
   <div className="btns"><Btn kind={danger?'danger':'primary'} onClick={onOk} busy={!!busy} disabled={!!busy} data-r="1">{ok}</Btn><Btn kind="soft" onClick={onCancel} disabled={!!busy} data-r="0">{cancel??t('fe.cancel')}</Btn></div>
  </div>
 </Layer>;
}

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
