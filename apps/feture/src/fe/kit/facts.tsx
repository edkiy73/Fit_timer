import {useState,type ReactNode} from 'react';
import {type LucideIcon} from 'lucide-react';
import {SelectRow} from './index';
import {ChipPickSheet,type PickOption} from './ChipPick';
import './facts.css';

/** «Обо мне» pieces (Storybook «Домен/Обо мне», owner 29.10.2026): short facts about a person — height, smoking,
 * alcohol, kids, languages, zodiac sign — as compact soft pills «icon + value», and their editor rows. Styles in facts.css, values only from the tokens. */

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

/** An editor row of one fact inside `<Card list>`: icon, name, the value as a select (`options`, the first one is
 * «не указано») or, with `children`, the name line with the control under it (languages as chips). Facts are seen by everyone (owner 29.10.2026), so a row has no audience. */
export function FactRow<T extends string>({icon:Icon,label,value,options,onChange,pick,children}:{icon:LucideIcon,label:string,
 value?:T|undefined,options?:readonly (readonly [T,string])[]|undefined,onChange?:((v:T)=>void)|undefined,
 /** Several from a long list: the row reads like the selects (name, what is chosen, a chevron) and opens the list in a sheet. */
 pick?:{options:readonly PickOption[],value:readonly string[],max?:number,none:string,onToggle:(code:string)=>void,onClear:()=>void}|undefined,children?:ReactNode}){
 const [open,setOpen]=useState(false);
 if(pick){
  const chosen=pick.options.filter(o=>pick.value.includes(o.code)).map(o=>o.label).join(', ')||pick.none;
  return <div className="li k-li-sel k-fact-row"><span className="ico v"><Icon/></span>
   <label className="selrow"><span className="selt">{label}</span><span className="selv" aria-hidden="true">{chosen}</span>
    <button type="button" className="k-selrow-hit" aria-haspopup="dialog" aria-label={label+': '+chosen} onClick={()=>setOpen(true)}/></label>
   {open&&<ChipPickSheet label={label} options={pick.options} value={pick.value} onToggle={pick.onToggle} onClear={pick.onClear} {...(pick.max?{max:pick.max}:{})} onClose={()=>setOpen(false)}/>}</div>;
 }
 if(children!==undefined)return <div className="li k-fact-row col">
  <div className="k-fact-h"><span className="ico v"><Icon/></span><span className="k-fact-t">{label}</span></div>
  <div className="k-fact-b">{children}</div></div>;
 return <div className="li k-li-sel k-fact-row"><span className="ico v"><Icon/></span>
  {options&&onChange&&value!==undefined&&<SelectRow label={label} value={value} options={options} onChange={onChange}/>}</div>;
}
