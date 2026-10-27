import {useEffect,useRef,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronRight,type LucideIcon} from 'lucide-react';
import {Btn,Layer} from './ui';

/** Prototype helpers shared by the settings group (K01, K05–K07, P12, B01, S01): `linkRow()`, `toggleRow()`,
 * `selectRow()` and `ask()` with the prototype's own markup. */

export function LinkRow({icon:Icon,tone,title,sub,val,onClick,danger,noChev}:{icon?:LucideIcon|undefined,tone?:string|undefined,title:ReactNode,sub?:ReactNode,val?:ReactNode,
 onClick:()=>void,danger?:boolean,noChev?:boolean}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick}>
  {Icon&&<span className={'ico'+(tone?' '+tone:'')}><Icon/></span>}
  <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>
  {val!==undefined&&val!==null&&val!==''&&<span className="val">{val}</span>}
  {!noChev&&!danger&&<ChevronRight/>}
 </button>;
}

export function ToggleRow({icon:Icon,title,sub,on,onClick,disabled}:{icon?:LucideIcon|undefined,title:ReactNode,sub?:ReactNode,on:boolean,onClick:()=>void,disabled?:boolean}){
 return <button type="button" className="li" role="switch" aria-checked={on} onClick={onClick} disabled={disabled}>
  {Icon&&<span className="ico"><Icon/></span>}
  <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span><span className={'sw'+(on?' on':'')} aria-hidden="true"/>
 </button>;
}

export function SelectRow<T extends string>({label,sub,value,options,onChange}:{label:string,sub?:string|undefined,value:T,options:readonly (readonly [T,string])[],onChange:(v:T)=>void}){
 const cur=options.find(([k])=>k===value);
 return <label className="selrow"><span className="selt">{label}{sub&&<small>{sub}</small>}</span>
  <span className="selv" aria-hidden="true">{cur?cur[1]:''}</span>
  <select value={value} onChange={e=>onChange(e.target.value as T)} aria-label={label}>{options.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
 </label>;
}

/** `ask()` — the confirmation dialog: an icon, a title, a line of text, the main and the cancel button. */
export function Ask({icon:Icon,tone,title,text,ok,danger,busy,error,onOk,onCancel}:{icon:LucideIcon,tone?:string,title:string,text?:ReactNode,ok:string,danger?:boolean,busy?:boolean,
 error?:string,onOk:()=>void,onCancel:()=>void}){
 const {t}=useI18n();const cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;cancel.current?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onCancel();}};
  document.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('keydown',key);requestAnimationFrame(()=>opener?.focus?.({preventScroll:true}));};},[onCancel]);
 return <Layer>
  <div className="scrim on" onClick={busy?undefined:onCancel}/>
  <div className="dialog on" role="alertdialog" aria-modal="true" aria-label={title}>
   <div className={'ico'+(tone?' '+tone:danger?' a':'')}><Icon/></div><h2>{title}</h2>{text&&<p>{text}</p>}
   {error&&<div className="alert err mb12" role="alert"><span>{error}</span></div>}
   <div className="btns"><Btn kind={danger?'danger':'primary'} onClick={onOk} busy={!!busy} disabled={busy}>{ok}</Btn>
    <button ref={cancel} type="button" className="btn soft" onClick={onCancel} disabled={busy}>{t('fe.cancel')}</button></div>
  </div>
 </Layer>;
}
