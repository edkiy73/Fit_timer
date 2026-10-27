import React,{forwardRef,useEffect,useRef,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check as Check2,ChevronLeft,ChevronRight,CircleAlert,CircleCheck,Info,Search,TriangleAlert,X,type LucideIcon} from 'lucide-react';
import {Btn,Layer} from '../ui';
import './tokens.css';
import './kit.css';

/** FetUre kit (owner, 28.10.2026): every screen takes its controls from here — never its own sheet, dialog, list row,
 * tab bar, chip, switch, select, notice or round button. Colours, fonts, sizes, spacing and radii are the V21 tokens
 * (`var(--…)` in v21.css, generated from the prototype); screens never write their own values.
 * `npm run check:kit` (part of `npm run check`) fails when a screen hand-writes what the kit has.
 * Each piece keeps the prototype's markup and class names, so v21.css styles it. */

export {Av,Bar,Btn,Empty,Layer,Seg,Skel,View,plate} from '../ui';
export type {SegOption} from '../ui';

/** `.ibtn` — a round icon button; the label is required (it is the only text a screen reader gets). */
export function IconBtn({icon:Icon,label,kind='',size='',className,type='button',badge,...rest}:ButtonHTMLAttributes<HTMLButtonElement>&{icon:LucideIcon,label:string,
 kind?:''|'ghost'|'glass'|'add'|'send',size?:''|'sm',badge?:number|'dot'|undefined}){
 return <button type={type} className={['ibtn',kind,size,className].filter(Boolean).join(' ')} aria-label={label} {...rest}><Icon/>
  {badge==='dot'?<b className="k-badge dot" aria-hidden="true"/>:badge?<b className="k-badge" aria-hidden="true">{badge>99?'99+':badge}</b>:null}</button>;
}

/** A screen header with an optional second line (`SubBar` of the community screens). */
export function SubBar({title,sub,back=true,children}:{title:string,sub?:string|null|undefined,back?:string|true|false,children?:ReactNode}){
 const navigate=useNavigate();const {t}=useI18n();
 return <header className="bar">
  {back&&<IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={()=>typeof back==='string'?navigate(back):navigate(-1)}/>}
  <h1 className="sm" tabIndex={-1}>{title}{sub&&<span className="sub">{sub}</span>}</h1>
  {children}
 </header>;
}

/** Closes on Escape and gives focus back to whatever opened it. */
function useModal(ref:React.RefObject<HTMLElement|null>,onClose:()=>void,first?:string){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;
  (first?ref.current?.querySelector<HTMLElement>(first):ref.current)?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}};
  document.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('keydown',key);requestAnimationFrame(()=>opener?.focus?.({preventScroll:true}));};},[ref,first]);
}

/** `sheet()` — the bottom sheet: grab, title (+ a line under it), optional lead/head controls, ✕, body, footer.
 * Escape, ✕ and the scrim close it. `full` is the tall variant. */
export function Sheet({title,sub,lead,head,onClose,children,foot,full,className}:{title:string,sub?:ReactNode,lead?:ReactNode,head?:ReactNode,onClose:()=>void,children:ReactNode,
 foot?:ReactNode,full?:boolean,className?:string}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);useModal(ref,onClose);
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div ref={ref} className={['sheet on',full?'full':'',className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h">{lead}<div className="sh-ht"><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{head}<IconBtn icon={X} kind="ghost" size="sm" label={t('fe.px.close')} onClick={onClose}/></div>
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
 </Layer>;
}

/** `ask()` — the confirmation dialog: icon, title, text, an optional error, the main and the cancel button.
 * Focus starts on «Отмена», so Enter never confirms something destructive by accident. */
export function Ask({icon:Icon=TriangleAlert,tone,title,text,ok,cancel,danger,busy,error,onOk,onCancel,children}:{icon?:LucideIcon,tone?:string|undefined,title:string,
 text?:ReactNode,ok:string,cancel?:string,danger?:boolean,busy?:boolean,error?:string|undefined,onOk:()=>void,onCancel:()=>void,children?:ReactNode}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);useModal(ref,busy?()=>{}:onCancel,'[data-r="0"]');
 return <Layer>
  {/* Above an open sheet (a confirmation asked from inside one). */}
  <div className="scrim on" style={{zIndex:3}} onClick={busy?undefined:onCancel}/>
  <div ref={ref} className="dialog on" role="alertdialog" aria-modal="true" aria-label={title} style={{display:'block',zIndex:4}}>
   <div className={'ico'+(tone?' '+tone:danger?' a':'')}><Icon/></div><h2>{title}</h2>{text&&<p>{text}</p>}{children}
   {error&&<Alert kind="err">{error}</Alert>}
   <div className="btns"><Btn kind={danger?'danger':'primary'} onClick={onOk} busy={!!busy} disabled={!!busy}>{ok}</Btn>
    <Btn kind="soft" onClick={onCancel} disabled={!!busy} data-r="0">{cancel??t('fe.cancel')}</Btn></div>
  </div>
 </Layer>;
}

/** `linkRow()` — one list row: icon or avatar, title and a line under it, a value, a badge, the chevron. */
export function Row({icon:Icon,tone,av,title,sub,val,badge,danger,noChev,onClick,disabled,className,pressed}:{icon?:LucideIcon|undefined,tone?:string|undefined,av?:ReactNode,
 title:ReactNode,sub?:ReactNode,val?:ReactNode,badge?:string|number|undefined,danger?:boolean,noChev?:boolean,onClick:()=>void,disabled?:boolean,className?:string,pressed?:boolean}){
 return <button type="button" className={['li',danger?'danger':'',className].filter(Boolean).join(' ')} onClick={onClick} disabled={disabled} aria-pressed={pressed}>
  {Icon&&<span className={'ico'+(tone?' '+tone:'')}><Icon/></span>}{av}
  <span className="tx"><b>{title}</b>{sub?<small>{sub}</small>:null}</span>
  {val!==undefined&&val!==null&&val!==''&&<span className="val">{val}</span>}{badge?<span className="pill hot">{badge}</span>:null}
  {!noChev&&!danger&&<ChevronRight/>}
 </button>;
}

/** `toggleRow()` — a list row with a switch; the whole row toggles. */
export function ToggleRow({icon:Icon,title,sub,on,onClick,disabled}:{icon?:LucideIcon|undefined,title:ReactNode,sub?:ReactNode,on:boolean,onClick:()=>void,disabled?:boolean}){
 return <button type="button" className="li" role="switch" aria-checked={on} onClick={onClick} disabled={disabled}>
  {Icon&&<span className="ico"><Icon/></span>}
  <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span><span className={'sw'+(on?' on':'')} aria-hidden="true"/>
 </button>;
}

/** `selectRow()` — a label with the chosen value; the native select opens over it. */
export function SelectRow<T extends string>({label,sub,value,options,onChange,solo}:{label?:string,sub?:string|undefined,value:T,options:readonly (readonly [T,string])[],
 onChange:(v:T)=>void,solo?:boolean}){
 const cur=options.find(([k])=>k===value);
 return <label className={'selrow'+(solo?' solo':'')}>{label&&!solo&&<span className="selt">{label}{sub&&<small>{sub}</small>}</span>}
  <span className="selv" aria-hidden="true">{cur?cur[1]:''}</span>
  <select value={value} onChange={e=>onChange(e.target.value as T)} aria-label={label}>{options.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
 </label>;
}

/** `chip()` — a pill that is either a toggle (`on`) or an action; `more` is the dashed «Все · N» chip. */
export function Chip({on,onClick,icon:Icon,children,more,filter,disabled,label}:{on?:boolean|undefined,onClick:()=>void,icon?:LucideIcon,children:ReactNode,more?:boolean,filter?:boolean,
 disabled?:boolean,label?:string}){
 return <button type="button" className={['chip',filter?'filter':'',more?'more':'',on?'on':''].filter(Boolean).join(' ')} aria-pressed={on===undefined?undefined:on}
  aria-label={label} disabled={disabled} onClick={onClick}>{Icon&&<Icon/>}{children}</button>;
}
export function Chips({children,scroll,className}:{children:ReactNode,scroll?:boolean,className?:string}){
 return <div className={['chips',scroll?'scroll':'',className].filter(Boolean).join(' ')}>{children}</div>;
}

/** `.alert` — a notice in the flow: ok, err (announced), warn, info. */
const ALERT_ICON:Record<'ok'|'err'|'warn'|'info',LucideIcon>={ok:CircleCheck,err:CircleAlert,warn:TriangleAlert,info:Info};
export function Alert({kind,children,icon,noIcon,className}:{kind:'ok'|'err'|'warn'|'info',children:ReactNode,icon?:LucideIcon,noIcon?:boolean,className?:string}){
 const I=icon??ALERT_ICON[kind];
 return <div className={['alert',kind,className].filter(Boolean).join(' ')} role={kind==='err'?'alert':'status'}>{!noIcon&&<I/>}<span>{children}</span></div>;
}

/** `.grp` — a titled group: the title row (with an optional action on the right), the content, a footnote. */
export function Group({title,action,foot,children,className,bare}:{title?:ReactNode,action?:ReactNode,foot?:ReactNode,children:ReactNode,className?:string,bare?:boolean}){
 return <section className={['grp',bare?'bare':'',className].filter(Boolean).join(' ')}>
  {(title||action)&&<div className="grp-t"><span>{title}</span>{action}</div>}
  {children}
  {foot&&<p className="grp-n">{foot}</p>}
 </section>;
}

/** `.field` — a labelled input or textarea with its error under it. */
export function Field({id,label,error,children,hint}:{id?:string,label?:ReactNode,error?:string|undefined,children:ReactNode,hint?:ReactNode}){
 return <div className={'field'+(error?' err':'')}>{label&&<label htmlFor={id}>{label}</label>}{children}{hint&&<p className="note">{hint}</p>}{error&&<div className="ferr">{error}</div>}</div>;
}

/** `.inp` — the one text input. Every text field of the app is this (or TextArea / SearchInput): one height, one
 * font, one radius, one error look. `invalid` marks it for screen readers; the message goes in Field. */
type InputProps=Omit<React.InputHTMLAttributes<HTMLInputElement>,'className'|'type'>&{type?:'text'|'email'|'tel'|'url'|'number'|'password'|'date'|'time',invalid?:boolean};
export const Input=forwardRef<HTMLInputElement,InputProps>(function Input({type='text',invalid,...rest},ref){
 return <input ref={ref} type={type} className="inp" aria-invalid={invalid||undefined} {...rest}/>;
});
/** `textarea.inp` — multi-line text with the same look as Input. */
type AreaProps=Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>,'className'>&{invalid?:boolean};
export const TextArea=forwardRef<HTMLTextAreaElement,AreaProps>(function TextArea({invalid,...rest},ref){
 return <textarea ref={ref} className="inp" aria-invalid={invalid||undefined} {...rest}/>;
});
/** `.inwrap` with the magnifier — every search field. */
export const SearchInput=forwardRef<HTMLInputElement,Omit<React.InputHTMLAttributes<HTMLInputElement>,'className'|'type'>&{label:string}>(function SearchInput({label,...rest},ref){
 return <div className="inwrap"><Search/><input ref={ref} className="inp" type="search" aria-label={label} placeholder={rest.placeholder??label} enterKeyHint="search" {...rest}/></div>;
});
/** A plain select with the app's look (inside a form card); a row with a label is SelectRow. */
export function Select<T extends string>({value,options,onChange,label,id}:{value:T,options:readonly (readonly [T,string])[],onChange:(v:T)=>void,label:string,id?:string}){
 return <select id={id} className="inp" value={value} aria-label={label} onChange={e=>onChange(e.target.value as T)}>{options.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>;
}
/** A hidden file picker; the screen opens it with ref.current.click() from a kit button. */
export const FilePick=forwardRef<HTMLInputElement,{accept:string,multiple?:boolean,onFiles:(f:FileList)=>void,capture?:'user'|'environment'}>(function FilePick({accept,multiple,onFiles,capture},ref){
 return <input ref={ref} type="file" accept={accept} multiple={multiple} capture={capture} hidden onChange={e=>{if(e.target.files?.length)onFiles(e.target.files);e.target.value='';}}/>;
});

/** Headings h1–h5 on the type scale (tokens.css). `as` keeps the document outline right when the look and the level
 * differ (a sheet title looks like h2 but may be an h2 or h3). */
export function H({level,as,children,className,id,tabIndex}:{level:1|2|3|4|5,as?:'h1'|'h2'|'h3'|'h4'|'h5'|'p'|'span',children:ReactNode,className?:string,id?:string,tabIndex?:number}){
 const Tag=as??(`h${level}` as const);
 return <Tag id={id} tabIndex={tabIndex} className={['k-h'+level,className].filter(Boolean).join(' ')}>{children}</Tag>;
}
/** Running text on the type scale; `tone` from the colour tokens. */
export function Text({size='body',tone,as='p',children,className,center}:{size?:'body'|'strong'|'sm'|'xs'|'cap'|'label'|'micro',tone?:'mute'|'faint'|'accent'|'danger'|'ok',
 as?:'p'|'span'|'div'|'small'|'b',children:ReactNode,className?:string,center?:boolean}){
 const Tag=as;
 return <Tag className={['k-'+size,tone?'k-'+tone:'',center?'k-center':'',className].filter(Boolean).join(' ')}>{children}</Tag>;
}
/** Vertical / horizontal stacks: spacing between blocks comes only from the scale (gap 1–6 = 4…24 px). */
export function Stack({children,gap=3,row,className,grow}:{children:ReactNode,gap?:1|2|3|4|6,row?:boolean,className?:string,grow?:boolean}){
 return <div className={[row?'k-row':'k-stack','k-g'+gap,grow?'k-grow':'',className].filter(Boolean).join(' ')}>{children}</div>;
}

/** `.card` — the surface every block sits on. `list` holds Rows (dividers between them come with it); `form` holds
 * fields and has no surface of its own in V21 (fields sit on the page, 16 apart). Radius, fill and shadow are tokens, so changing the card here changes every card. */
export function Card({children,list,form,className,id}:{children:ReactNode,list?:boolean,form?:boolean,className?:string,id?:string}){
 return <div id={id} className={['card',list?'list':'',form?'form-card':'',className].filter(Boolean).join(' ')}>{children}</div>;
}
/** `.pill` — a small status label (ok / waiting / violet / hot / plain). */
export function Pill({tone,icon:Icon,children}:{tone?:'ok'|'wait'|'v'|'hot'|'bad'|undefined,icon?:LucideIcon,children:ReactNode}){
 return <span className={'pill'+(tone?' '+tone:'')}>{Icon&&<Icon/>}{children}</span>;
}
/** A hairline between blocks that are not rows of one list. */
export function Divider(){return <hr className="k-hr"/>;}

/** Single choice as a list (`.radio` rows: report reasons, kinds). */
export function RadioList<T extends string>({value,options,onChange,label}:{value:T|null|undefined,options:readonly (readonly [T,ReactNode,ReactNode?])[],onChange:(v:T)=>void,label:string}){
 return <div className="card list" role="radiogroup" aria-label={label}>{options.map(([k,title,sub])=><button key={k} type="button" className={'radio'+(value===k?' on':'')} role="radio" aria-checked={value===k} onClick={()=>onChange(k)}>
  <i/><span className="tx">{title}{sub&&<small>{sub}</small>}</span></button>)}</div>;
}
/** Single choice as chips (filters, «кто видит»). Multi-choice chips are Chip with `on`. */
export function ChoiceChips<T extends string>({value,options,onChange,label,scroll}:{value:T|null|undefined,options:readonly (readonly [T,ReactNode])[],onChange:(v:T)=>void,label:string,scroll?:boolean}){
 return <div className={'chips'+(scroll?' scroll':'')} role="radiogroup" aria-label={label}>{options.map(([k,l])=><button key={k} type="button" className={'chip'+(value===k?' on':'')} role="radio" aria-checked={value===k} onClick={()=>onChange(k)}>{l}</button>)}</div>;
}
/** `.check` — a checkbox with its text (consents, «Также заблокировать» in forms). */
export function Check({on,onChange,children,error}:{on:boolean,onChange:(v:boolean)=>void,children:ReactNode,error?:boolean}){
 return <button type="button" role="checkbox" aria-checked={on} className={'check'+(on?' on':'')+(error?' err':'')} onClick={()=>onChange(!on)}><i><Check2/></i><span>{children}</span></button>;
}
/** `.sw` — a bare switch, for a row the kit's ToggleRow does not fit. */
export function Switch({on,onChange,label,disabled}:{on:boolean,onChange:(v:boolean)=>void,label:string,disabled?:boolean}){
 return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="k-sw" onClick={()=>onChange(!on)}><span className={'sw'+(on?' on':'')} aria-hidden="true"/></button>;
}
/** A slider (age, distance). */
export function Range({value,min,max,step=1,onChange,label}:{value:number,min:number,max:number,step?:number,onChange:(v:number)=>void,label:string}){
 return <input type="range" className="k-range" min={min} max={max} step={step} value={value} aria-label={label} onChange={e=>onChange(+e.target.value)}/>;
}
/** `.qprog` — a progress bar (0…1). */
export function Progress({value,label}:{value:number,label?:string}){
 return <div className="qprog" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value*100)}><i style={{width:`${Math.max(0,Math.min(1,value))*100}%`}}/></div>;
}
/** A wizard's «2/4 · Где и когда» with its progress bar. */
export function Steps({step,total,name}:{step:number,total:number,name:string}){
 return <div className="stepper"><span>{step}/{total} · {name}</span><Progress value={step/total}/></div>;
}
/** A count bubble for custom spots (IconBtn has `badge`, Seg has `n`). */
export function Badge({n,dot,label}:{n?:number|undefined,dot?:boolean,label?:string}){
 if(dot)return <b className="k-badge dot" role="img" aria-label={label}/>;
 return n?<b className="k-badge" aria-label={label}>{n>99?'99+':n}</b>:null;
}
/** `.note` — a quiet hint line; `.sec` — a section label above a block. */
export function Note({children,className}:{children:ReactNode,className?:string}){return <p className={'note'+(className?' '+className:'')}>{children}</p>;}
export function SectionLabel({children,action}:{children:ReactNode,action?:ReactNode}){return <div className="sec"><span>{children}</span>{action}</div>;}
/** «12 / 1000» under a text field. */
export function Counter({n,max}:{n:number,max:number}){return <div className={'counter'+(n>max?' over':'')} aria-live="polite">{n} / {max}</div>;}
