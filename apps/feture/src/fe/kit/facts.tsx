import {useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronDown,EyeOff,KeyRound,type LucideIcon} from 'lucide-react';
import {SelectRow} from './index';
import './facts.css';

/** «Обо мне» pieces (Storybook «Домен/Обо мне», owner 29.10.2026): short facts about a person — height, smoking,
 * alcohol, kids, languages, zodiac sign — as compact soft pills «icon + value», and their editor rows with an audience
 * each. Styles in facts.css, values only from the tokens. */

export type FactItem={id:string,icon:LucideIcon,/** What the pill says: «Курю иногда», «174 см», «RU · EN». */ value:string,
 /** The fact named, shown on a tap and read by screen readers: «Курение: иногда». */ label:string};

/** The facts as one wrapping block of pills. A tap on a pill shows its label in place (another tap, or a tap on another
 * pill, puts the value back); the label is always the pill's accessible name. `inert` — drawn only, nothing reacts. */
export function FactChips({items,label,inert}:{items:readonly FactItem[],/** Names the list for screen readers («Обо мне»). */ label:string,inert?:boolean|undefined}){
 const [open,setOpen]=useState<string|null>(null);
 if(!items.length)return null;
 return <ul className="k-facts" aria-label={label}>{items.map(x=><li key={x.id}>
  <FactChip icon={x.icon} value={x.value} label={x.label} open={open===x.id} {...(inert?{}:{onClick:()=>setOpen(o=>o===x.id?null:x.id)})}/></li>)}</ul>;
}

/** One fact pill: a thin line icon and the value; `open` shows the label instead. Without `onClick` it is a label. */
export function FactChip({icon:Icon,value,label,open,onClick}:{icon:LucideIcon,value:string,label:string,open?:boolean|undefined,onClick?:(()=>void)|undefined}){
 const body=<><Icon aria-hidden="true"/><span aria-hidden="true">{open?label:value}</span></>;
 if(!onClick)return <span className="k-fact" role="img" aria-label={label}>{body}</span>;
 return <button type="button" className={'k-fact'+(open?' open':'')} aria-label={label} onClick={onClick}>{body}</button>;
}

export type Aud='all'|'granted'|'only';
const AUD_ICON:Record<Aud,LucideIcon|null>={all:null,granted:KeyRound,only:EyeOff};

/** Who sees one item, as a small tag that opens the choice «Все / По доступу / Только ты» (the native select, so the
 * phone's own picker). The same look as the read-only audience tag of a block. */
export function AudSelect({value,onChange,label,disabled}:{value:Aud,onChange:(v:Aud)=>void,/** «Кто видит рост». */ label:string,disabled?:boolean|undefined}){
 const {t}=useI18n();const Icon=AUD_ICON[value];
 return <label className={'aud k-aud-sel'+(value==='granted'?' k':value==='only'?' w':'')}>
  {Icon&&<Icon aria-hidden="true"/>}<span aria-hidden="true">{t('fe.reg.vis.'+value)}</span><ChevronDown aria-hidden="true"/>
  <select value={value} disabled={disabled} aria-label={label} onChange={e=>onChange(e.target.value as Aud)}>
   {(['all','granted','only'] as const).map(k=><option key={k} value={k}>{t('fe.reg.vis.'+k)}</option>)}</select>
 </label>;
}

/** An editor row of one fact inside `<Card list>`: icon, name, the value as a select (`options`, the first one is
 * «не указано») or, with `children`, the name line with the control under it (languages as chips); `aud` — the fact's
 * own `AudSelect` at the end of the name line. */
export function FactRow<T extends string>({icon:Icon,label,value,options,onChange,aud,children}:{icon:LucideIcon,label:string,aud?:ReactNode,
 value?:T|undefined,options?:readonly (readonly [T,string])[]|undefined,onChange?:((v:T)=>void)|undefined,children?:ReactNode}){
 if(children!==undefined)return <div className="li k-fact-row col">
  <div className="k-fact-h"><span className="ico v"><Icon/></span><span className="k-fact-t">{label}</span>{aud}</div>
  <div className="k-fact-b">{children}</div></div>;
 return <div className="li k-li-sel k-fact-row"><span className="ico v"><Icon/></span>
  {options&&onChange&&value!==undefined&&<SelectRow label={label} value={value} options={options} onChange={onChange}/>}{aud}</div>;
}
