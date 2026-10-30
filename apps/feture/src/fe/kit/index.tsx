import React,{forwardRef,useEffect,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {useBlocker,useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check as Check2,ChevronDown,ChevronLeft,ChevronRight,CircleAlert,CircleCheck,Info,Pencil,Plus,Search,TriangleAlert,X,type LucideIcon} from 'lucide-react';
import {Btn,Layer} from '../ui';
import './tokens.css';
import './kit.css';

/** FetUre kit (owner, 28.10.2026): every screen takes its controls from here — never its own sheet, dialog, list row,
 * tab bar, chip, switch, select, notice or round button. Colours, fonts, sizes, spacing and radii are the kit tokens
 * (`var(--…)` in base.css and tokens.css); screens never write their own values.
 * `npm run check:kit` (part of `npm run check`) fails when a screen hand-writes what the kit has.
 * Each piece keeps the prototype's markup and class names, so base.css styles it. */

export {Av,Bar,Btn,Empty,Layer,Seg,Skel,View,plate,namedPlate,articlePlate,PLATE_KEYS,type PlateKey} from '../ui';
export type {SegOption} from '../ui';

/** `.ibtn` — a round icon button; the label is required (it is the only text a screen reader gets). */
export const IconBtn=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>&{icon:LucideIcon,label:string,kind?:''|'ghost'|'glass'|'add'|'send',size?:''|'sm',badge?:number|'dot'|undefined}>(
 function IconBtn({icon:Icon,label,kind='',size='',className,type='button',badge,...rest},ref){
 return <button ref={ref} type={type} className={['ibtn',kind,size,className].filter(Boolean).join(' ')} aria-label={label} {...rest}><Icon/>
  {badge==='dot'?<b className="k-badge dot" aria-hidden="true"/>:badge?<b className="k-badge" aria-hidden="true">{badge>99?'99+':badge}</b>:null}</button>;
});

/** A screen header with an optional second line (`SubBar` of the community screens). */
export function SubBar({title,sub,back=true,onBack,children}:{title:string,sub?:string|null|undefined,back?:string|true|false,onBack?:()=>void,children?:ReactNode}){
 const navigate=useNavigate();const {t}=useI18n();
 return <header className="bar">
  {(back||onBack)&&<IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={()=>onBack?onBack():typeof back==='string'?navigate(back):navigate(-1)}/>}
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
 * Escape, ✕ and the scrim close it. `full` is the tall variant. `dirty`: something is picked or typed and not saved
 * yet — ✕, the scrim and Escape first ask «Закрыть без сохранения?» (the sheet's own «Готово» / «Сохранить» buttons
 * close it as usual). */
export function Sheet({title,sub,lead,head,search,onClose,children,foot,full,className,dirty}:{title:string,sub?:ReactNode,lead?:ReactNode,head?:ReactNode,search?:ReactNode,onClose:()=>void,children:ReactNode,
 foot?:ReactNode,full?:boolean,className?:string,/** Unsaved choices: ✕, the scrim and Escape ask before closing. */ dirty?:boolean}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);const [asking,setAsking]=useState(false);
 const tryClose=()=>{if(dirty)setAsking(true);else onClose();};
 useModal(ref,asking?()=>{}:tryClose);
 return <Layer>
  <div className="scrim on" onClick={tryClose}/>
  <div ref={ref} className={['sheet on',full?'full':'',className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h">{lead}<div className="sh-ht"><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{head}<IconBtn icon={X} kind="ghost" size="sm" label={t('fe.px.close')} onClick={tryClose}/></div>
   {search&&<div className="sh-search">{search}</div>}
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
  {asking&&<Ask tone="a" title={t('fe.kit.sheet.dirtyTitle')} text={t('fe.kit.sheet.dirtyText')} ok={t('fe.kit.sheet.dirtyOk')} cancel={t('fe.kit.sheet.dirtyStay')} danger
   onOk={()=>{setAsking(false);onClose();}} onCancel={()=>setAsking(false)}/>}
 </Layer>;
}

/** `useLeaveGuard(dirty, save?)` — one guard for every edited form that is a screen (not a sheet; a sheet has `dirty`).
 * While `dirty`, leaving the screen — its own back button, the dock / side tabs, the browser's Back, closing the tab —
 * asks «Выйти без сохранения?» (Остаться / Выйти). Render `node` once; run the form's own «after save» navigation
 * through `pass(() => …)` so a saved form is not asked about.
 * `save` (optional) is a third answer for a form that can keep its work: «Сохранить черновик / Не сохранять / Остаться».
 * `run` saves and says whether it worked (the person leaves only then); `discard` runs on «Не сохранять». */
export function useLeaveGuard(dirty:boolean,save?:{title?:string,text?:string,label?:string,run:()=>Promise<boolean>|boolean,discard?:()=>void}){
 const {t}=useI18n();const live=useRef(dirty);live.current=dirty;const skip=useRef(false);const [busy,setBusy]=useState(false);
 const blocker=useBlocker(({currentLocation,nextLocation})=>live.current&&!skip.current&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{if(!dirty)return;const h=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',h);return ()=>window.removeEventListener('beforeunload',h);},[dirty]);
 const pass=(go:()=>void)=>{skip.current=true;go();setTimeout(()=>{skip.current=false;},600);};
 const node=blocker.state==='blocked'
  ?(save
   ?<Ask tone="v" icon={Pencil} title={save.title??t('fe.lo.leave.saveTitle')} text={save.text??t('fe.lo.leave.saveText')} ok={save.label??t('fe.lo.leave.save')} busy={busy} cancel={t('fe.lo.leave.stay')}
    alt={{label:t('fe.lo.leave.discard'),danger:true,onClick:()=>{save.discard?.();blocker.proceed();}}}
    onOk={async()=>{setBusy(true);let ok=false;try{ok=!!(await save.run());}catch{ok=false;}setBusy(false);if(ok){skip.current=true;blocker.proceed();}}} onCancel={()=>blocker.reset()}/>
   :<Ask tone="a" danger title={t('fe.lo.leave.title')} text={t('fe.lo.leave.text')} ok={t('fe.lo.leave.ok')} cancel={t('fe.lo.leave.stay')}
    onOk={()=>blocker.proceed()} onCancel={()=>blocker.reset()}/>):null;
 return {node,pass};
}

/** `ask()` — the confirmation dialog: icon, title, text, an optional error, the main and the cancel button.
 * Focus starts on «Отмена», so Enter never confirms something destructive by accident. */
export function Ask({icon:Icon=TriangleAlert,tone,title,text,ok,cancel,danger,busy,error,onOk,onCancel,alt,children}:{icon?:LucideIcon,tone?:string|undefined,title:string,
 text?:ReactNode,ok:string,cancel?:string,danger?:boolean,busy?:boolean,error?:string|undefined,onOk:()=>void,onCancel:()=>void,
 /** A second answer between the main one and «Отмена» (e.g. «Не сохранять»). */ alt?:{label:string,onClick:()=>void,danger?:boolean},children?:ReactNode}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);useModal(ref,busy?()=>{}:onCancel,'[data-r="0"]');
 return <Layer>
  {/* Above an open sheet (a confirmation asked from inside one). */}
  <div className="scrim on" style={{zIndex:3}} onClick={busy?undefined:onCancel}/>
  <div ref={ref} className="dialog on" role="alertdialog" aria-modal="true" aria-label={title} style={{display:'block',zIndex:4}}>
   <div className={'ico'+(tone?' '+tone:danger?' a':'')}><Icon/></div><h2>{title}</h2>{text&&<p>{text}</p>}{children}
   {error&&<Alert kind="err">{error}</Alert>}
   <div className="btns"><Btn kind={danger?'danger':'primary'} onClick={onOk} busy={!!busy} disabled={!!busy}>{ok}</Btn>
    {alt&&<Btn kind="soft" className={alt.danger?'danger':undefined} onClick={alt.onClick} disabled={!!busy}>{alt.label}</Btn>}
    <Btn kind="soft" onClick={onCancel} disabled={!!busy} data-r="0">{cancel??t('fe.cancel')}</Btn></div>
  </div>
 </Layer>;
}

/** `linkRow()` — one list row: icon or avatar, title and a line under it, a value, a badge, the chevron. */
export function Row({icon:Icon,tone,av,title,sub,val,badge,danger,noChev,onClick,disabled,className,pressed,end,expanded,wrap,body,extra}:{icon?:LucideIcon|undefined,tone?:string|undefined,av?:ReactNode,
 title?:ReactNode,sub?:ReactNode,/** A plain running-text line instead of a bold title (steps of an instruction). */ body?:ReactNode,
 /** Content under the title as it is (not wrapped in the small sub-line): summaries, a small action. */ extra?:ReactNode,val?:ReactNode,badge?:string|number|undefined,danger?:boolean,noChev?:boolean,
 /** Without onClick the row only shows information (no chevron, not focusable). */ onClick?:(()=>void)|undefined,disabled?:boolean,className?:string,pressed?:boolean,
 /** For a row that opens a section below it. */ expanded?:boolean|undefined,/** Long values (links) break anywhere. */ wrap?:boolean,
 /** A control at the end of the row instead of the chevron (Follow, ✕); the row then is a group, not one button. */ end?:ReactNode}){
 const cls=['li',danger?'danger':'',wrap?'k-break':'',className].filter(Boolean).join(' ');
 const tx=<span className="tx">{title!==undefined&&title!==null&&title!==''&&<b>{title}</b>}{body!=null&&<span className="k-sm">{body}</span>}{sub?<small>{sub}</small>:null}{extra}</span>;
 if(!onClick)return <div className={cls+' k-li-static'}>{Icon&&<span className={'ico'+(tone?' '+tone:'')}><Icon/></span>}{av}
  {tx}{val!==undefined&&val!==null&&val!==''&&<span className="val">{val}</span>}{badge?<span className="pill hot">{badge}</span>:null}{end}</div>;
 if(end)return <div className={['li','k-li-end',className].filter(Boolean).join(' ')}>
  <button type="button" className="k-li-main" onClick={onClick} disabled={disabled} aria-pressed={pressed}>{Icon&&<span className={'ico'+(tone?' '+tone:'')}><Icon/></span>}{av}
   {tx}{val!==undefined&&val!==null&&val!==''&&<span className="val">{val}</span>}</button>{end}</div>;
 return <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={pressed} aria-expanded={expanded}>
  {Icon&&<span className={'ico'+(tone?' '+tone:'')}><Icon/></span>}{av}
  {tx}
  {val!==undefined&&val!==null&&val!==''&&<span className="val">{val}</span>}{badge?<span className="pill hot">{badge}</span>:null}
  {expanded!==undefined?<span className={'chv'+(expanded?' open':'')}><ChevronDown/></span>:!noChev&&!danger&&<ChevronRight/>}
 </button>;
}

/** `toggleRow()` — a list row with a switch; the whole row toggles. */
export function ToggleRow({icon:Icon,title,sub,on,onClick,disabled}:{icon?:LucideIcon|undefined,title:ReactNode,sub?:ReactNode,on:boolean,onClick:()=>void,disabled?:boolean}){
 return <button type="button" className="li" role="switch" aria-checked={on} onClick={onClick} disabled={disabled}>
  {Icon&&<span className="ico"><Icon/></span>}
  <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span><span className={'sw'+(on?' on':'')} aria-hidden="true"/>
 </button>;
}

/** `expandRow()` — an optional section of a form as ONE list row that opens in place (poll, interests, topics): closed it
 * shows the icon, the title and what is set; open, its fields sit right under the row, inside the same list — no card
 * in a card. `onRemove` adds «Убрать» under the fields (the section goes back to closed and empty). */
export function ExpandRow({icon,title,sub,val,open,onToggle,onRemove,removeLabel,children,tone}:{icon:LucideIcon,title:ReactNode,sub?:ReactNode,val?:ReactNode,open:boolean,onToggle:()=>void,
 onRemove?:()=>void,removeLabel?:string,children:ReactNode,tone?:string}){
 return <div className={'k-exp'+(open?' open':'')}>
  <Row icon={icon} {...(tone?{tone}:{})} title={title} sub={sub} val={val} expanded={open} onClick={onToggle}/>
  {open&&<div className="k-exp-b">{children}{onRemove&&<Btn kind="text" size="sm" auto onClick={onRemove}>{removeLabel}</Btn>}</div>}
 </div>;
}

/** `selectRow()` — a label with the chosen value; the native select opens over it. */
export function SelectRow<T extends string>({label,sub,value,options,onChange,solo,icon:Icon,disabled,row:inList}:{label?:string,sub?:string|undefined,value:T,options:readonly (readonly [T,string])[],
 onChange:(v:T)=>void,solo?:boolean,icon?:LucideIcon,disabled?:boolean,/** A row of a list card (keeps the divider) even without an icon. */ row?:boolean}){
 const cur=options.find(([k])=>k===value);
 const row=<label className={'selrow'+(solo?' solo':'')}>{label&&!solo&&<span className="selt">{label}{sub&&<small>{sub}</small>}</span>}
  <span className="selv" aria-hidden="true">{cur?cur[1]:''}</span>
  <select value={value} disabled={disabled} onChange={e=>onChange(e.target.value as T)} aria-label={label}>{options.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
 </label>;
 return Icon||inList?<div className="li k-li-sel">{Icon&&<span className="ico v"><Icon/></span>}{row}</div>:row;
}

/** `chip()` — a pill that is either a toggle (`on`) or an action; `more` is the dashed «Все · N» chip. */
export function Chip({on,onClick,icon:Icon,children,more,filter,disabled,label,badge,className,lit,popup,inactive}:{on?:boolean|undefined,onClick?:()=>void,icon?:LucideIcon,children:ReactNode,more?:boolean,filter?:boolean,
 disabled?:boolean,label?:string,/** Opens a sheet or list. */ popup?:boolean,/** A count on the chip (e.g. active filters). */ badge?:number|undefined,className?:string,/** Highlighted without being a toggle (an opener with filters set). */ lit?:boolean,
 /** Looks as usual but cannot be reached or pressed (its whole group is dimmed and explains why). */ inactive?:boolean}){
 if(!onClick)return <span className={['chip',on?'on':'',className].filter(Boolean).join(' ')}>{Icon&&<Icon/>}{children}</span>; // a label, not a control
 return <button type="button" className={['chip',filter?'filter':'',more?'more':'',on||lit?'on':'',className].filter(Boolean).join(' ')} aria-pressed={on===undefined?undefined:on}
  aria-label={label} aria-haspopup={popup?'dialog':undefined} disabled={disabled} tabIndex={inactive?-1:undefined} aria-disabled={inactive||undefined} onClick={onClick}>{Icon&&<Icon/>}{children}{badge?<em className="badge-abs">{badge}</em>:null}</button>;
}
export function Chips({children,scroll,className,label,role}:{children:ReactNode,scroll?:boolean,className?:string,label?:string,role?:'group'|'list'}){
 return <div className={['chips',scroll?'scroll':'',className].filter(Boolean).join(' ')} role={role??(label?'group':undefined)} aria-label={label}>{children}</div>;
}

/** One even column of form blocks (fields, a notice, the main button), 16 apart whatever each holds (owner, rule 10); the
 * last block is the primary button. Screens never space a form with their own wrappers or margins. */
export function Form({children}:{children:ReactNode}){return <div className="k-form">{children}</div>;}

/** `.alert` — a notice in the flow: ok, err (announced), warn, info. */
const ALERT_ICON:Record<'ok'|'err'|'warn'|'info'|'plain',LucideIcon>={ok:CircleCheck,err:CircleAlert,warn:TriangleAlert,info:Info,plain:Info};
export const Alert=forwardRef<HTMLDivElement,{kind?:'ok'|'err'|'warn'|'info'|'plain',children:ReactNode,icon?:LucideIcon,noIcon?:boolean,className?:string,
 /** Override the announcement: `alert` interrupts, `status` waits, `none` is not announced; `alertdialog` for an inline question with its answers in `action`. */ role?:'alert'|'status'|'none'|'alertdialog',
 /** Buttons under the text (reload, «Удалить» / «Отмена»). */ action?:ReactNode,
 /** The whole notice opens something (a pending change of the couple). */ onClick?:()=>void}>(function Alert({kind='plain',children,icon,noIcon,className,role,action,onClick},ref){
 const I=icon??ALERT_ICON[kind];const r=role??(kind==='err'?'alert':kind==='plain'?'none':'status');
 const cls=['alert',kind==='plain'?'':kind,onClick?'k-alert-btn':'',className].filter(Boolean).join(' ');
 const body=<>{!noIcon&&<I/>}<span>{children}{action&&<span className="k-alert-act">{action}</span>}</span></>;
 if(onClick)return <button type="button" className={cls} onClick={onClick}>{body}</button>;
 return <div ref={ref} className={cls} role={r==='none'?undefined:r}>{body}</div>;
});

/** `.grp` — a titled group: the title row (with an optional action on the right), the content, a footnote. */
export const Group=forwardRef<HTMLElement,{title?:ReactNode,action?:ReactNode,foot?:ReactNode,children:ReactNode,className?:string,bare?:boolean,id?:string}>(function Group({title,action,foot,children,className,bare,id},ref){
 return <section ref={ref} id={id} className={['grp',bare?'bare':'',className].filter(Boolean).join(' ')}>
  {(title||action)&&<div className="grp-t"><span>{title}</span>{action}</div>}
  {children}
  {foot&&<p className="grp-n">{foot}</p>}
 </section>;
});

/** `.ph-empty` — the one «add» card of an empty section (owner, 29.10.2026: one look for every empty block): the icon
 * in a soft circle, the title, a short plain hint (up to two lines), «+». Put it straight into a `Group` — no Card around. */
export function AddCard({icon:Icon,title,sub,onClick,disabled,busy,className}:{icon:LucideIcon,title:ReactNode,sub?:ReactNode,onClick:()=>void,disabled?:boolean|undefined,busy?:boolean|undefined,className?:string|undefined}){
 return <button type="button" className={['ph-empty',className].filter(Boolean).join(' ')} onClick={onClick} disabled={disabled} aria-busy={busy||undefined}>
  <span className="pe-ic"><Icon/></span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span><Plus/></button>;
}

/** `.field` — a labelled input or textarea with its error under it. */
export function Field({id,label,error,children,hint,className,name,optional}:{id?:string,label?:ReactNode,error?:string|undefined,children:ReactNode,hint?:ReactNode,className?:string,
 /** data-field: the screen finds the first wrong field by it (shake, scroll). */ name?:string,/** «необязательно» on the right of the label. */ optional?:ReactNode}){
 return <div className={['field',error?'err':'',className].filter(Boolean).join(' ')} data-field={name}>{label&&<label className="flabel" htmlFor={id}>{label}{optional&&<i>{optional}</i>}</label>}{children}{hint&&<p className="fhint">{hint}</p>}{error&&<div className="ferr" role="alert"><CircleAlert/>{error}</div>}</div>;
}

/** `.inp` — the one text input. Every text field of the app is this (or TextArea / SearchInput): one height, one
 * font, one radius, one error look. `invalid` marks it for screen readers; the message goes in Field. */
type InputProps=Omit<React.InputHTMLAttributes<HTMLInputElement>,'className'|'type'>&{type?:'text'|'email'|'tel'|'url'|'number'|'password'|'date'|'time',invalid?:boolean};
export const Input=forwardRef<HTMLInputElement,InputProps>(function Input({type='text',invalid,...rest},ref){
 return <input ref={ref} type={type} className="inp" aria-invalid={invalid||undefined} {...rest}/>;
});
/** `textarea.inp` — multi-line text with the same look as Input. */
type AreaProps=Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>,'className'>&{invalid?:boolean};
export const TextArea=forwardRef<HTMLTextAreaElement,AreaProps&{grow?:number,bare?:boolean}>(function TextArea({invalid,grow,bare,onInput,...rest},ref){
 // `grow`: height follows the text up to that many pixels (reply / message boxes); `bare`: no field look (input bars).
 const fit=(el:HTMLTextAreaElement)=>{if(!grow)return;el.style.height='auto';const h=el.scrollHeight+2;el.style.height=Math.min(grow,h)+'px';el.style.overflowY=h>grow?'auto':'hidden';};
 return <textarea ref={ref} className={bare?undefined:'inp'} aria-invalid={invalid||undefined} onInput={e=>{fit(e.currentTarget);onInput?.(e);}} {...rest}/>;
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

/** The camera viewfinder of a verification shot (age check, photo check): `face` shows an oval, `document` a card
 * frame; `hint` sits at the bottom. With `src` it shows the taken shot instead (whole, never cropped). */
export function CaptureFrame({shape='face',hint,src,alt}:{shape?:'face'|'document',hint?:ReactNode,src?:string|null|undefined,alt?:string}){
 return <div className={'k-cam'+(shape==='document'?' doc':'')}>
  {src?<img src={src} alt={alt??''} draggable={false}/>:<><div className="k-cam-guide" aria-hidden="true"/>{hint&&<div className="k-cam-hint">{hint}</div>}</>}
 </div>;
}

/** Headings h1–h5 on the type scale (tokens.css). `as` keeps the document outline right when the look and the level
 * differ (a sheet title looks like h2 but may be an h2 or h3). */
export function H({level,as,children,className,id,tabIndex}:{/** 0 = display (event / community title on a cover). */ level:0|1|2|3|4|5,as?:'h1'|'h2'|'h3'|'h4'|'h5'|'p'|'span',children:ReactNode,className?:string,id?:string,tabIndex?:number}){
 const Tag=as??(level===0?'h1':`h${level}` as const);
 return <Tag id={id} tabIndex={tabIndex} className={['k-h'+level,className].filter(Boolean).join(' ')}>{children}</Tag>;
}
/** Running text on the type scale; `tone` from the colour tokens. */
export function Text({size='body',tone,as='p',children,className,center,bold,breakAll,pre}:{size?:'md'|'body'|'strong'|'sm'|'xs'|'cap'|'label'|'micro',tone?:'ink'|'mute'|'faint'|'accent'|'danger'|'ok',
 as?:'p'|'span'|'div'|'small'|'b',children:ReactNode,className?:string,center?:boolean,/** Heavy weight on any size (an address, a name line). */ bold?:boolean,/** Links and addresses break anywhere. */ breakAll?:boolean,
 /** Keeps the line breaks of a person's plain text (an event description). */ pre?:boolean}){
 const Tag=as;
 return <Tag className={['k-'+size,tone?'k-'+tone:'',center?'k-center':'',bold?'k-bold':'',breakAll?'k-break-all':'',pre?'k-pre':'',className].filter(Boolean).join(' ')}>{children}</Tag>;
}
/** Vertical / horizontal stacks: spacing between blocks comes only from the scale (gap 1–6 = 4…24 px). */
export function Stack({children,gap=3,row,className,grow,align,justify}:{children:ReactNode,gap?:0|1|2|3|4|5|6,row?:boolean,className?:string,grow?:boolean,align?:'start'|'center'|'end'|'stretch',justify?:'start'|'between'|'end'|'center'}){
 return <div className={[row?'k-row':'k-stack','k-g'+gap,grow?'k-grow':'',align?'k-al-'+align:'',justify?'k-js-'+justify:'',className].filter(Boolean).join(' ')}>{children}</div>;
}

/** The one row of buttons (owner 29.10.2026): side by side with equal widths across the column, or `stack`ed; the gap
 * and the alignment are the kit's. Screens never line buttons up with their own Stack, margins or widths. */
export function Actions({children,stack,fit}:{children:ReactNode,/** One under another (a main action and its alternatives). */ stack?:boolean,/** Each button as wide as its text; they wrap under each other when two do not fit in a row. */ fit?:boolean}){
 return <div className={'k-actions'+(stack?' k-actions-stack':'')+(fit?' k-actions-fit':'')}>{children}</div>;
}

/** `.card` — the surface every block sits on. `list` holds Rows (dividers between them come with it); `form` holds
 * fields and has no surface of its own in V21 (fields sit on the page, 16 apart). Radius, fill and shadow are tokens, so changing the card here changes every card. */
export function Card({children,list,form,className,id,onClick,label,tone}:{children:ReactNode,list?:boolean,form?:boolean,className?:string,id?:string,/** danger: the edge of something irreversible (delete account). */ tone?:'danger',/** A whole card that opens something. */ onClick?:()=>void,label?:string}){
 if(onClick)return <button type="button" id={id} aria-label={label} onClick={onClick} className={['card','k-card-btn',list?'list':'',className].filter(Boolean).join(' ')}>{children}</button>;
 return <div id={id} className={['card',list?'list':'',form?'form-card':'',tone?'k-card-'+tone:'',className].filter(Boolean).join(' ')}>{children}</div>;
}
/** `.pill` — a small status label (ok / waiting / violet / hot / plain). */
export function Pill({tone,icon:Icon,children,onClick,className,label}:{tone?:'ok'|'wait'|'v'|'hot'|'bad'|'glass'|undefined,icon?:LucideIcon,children:ReactNode,onClick?:()=>void,className?:string,label?:string}){
 const cls=['pill',tone,className].filter(Boolean).join(' ');
 return onClick?<button type="button" className={cls} aria-label={label} onClick={onClick}>{Icon&&<Icon/>}{children}</button>:<span className={cls}>{Icon&&<Icon/>}{children}</span>;
}
/** A hairline between blocks that are not rows of one list. */
export function Divider(){return <hr className="k-hr"/>;}
/** Empty room between blocks that are not in one Stack (a step of the spacing scale). */
export function Spacer({size=3}:{size?:1|2|3|4|6}){return <div className={'k-sp k-sp-'+size} aria-hidden="true"/>;}

/** Single choice as a list (`.radio` rows: report reasons, kinds). The rows carry their own frame (one rounded block
 * with dividers), so the list never sits in a Card — that drew a card inside a card (owner, 28.10.2026). */
export function RadioList<T extends string>({value,options,onChange,label}:{value:T|null|undefined,options:readonly (readonly [T,ReactNode,ReactNode?])[],onChange:(v:T)=>void,label:string,/** Kept for old calls; the rows never have a second frame. */ bare?:boolean}){
 return <div className="k-radios" role="radiogroup" aria-label={label}>{options.map(([k,title,sub])=><button key={k} type="button" className={'radio'+(value===k?' on':'')} role="radio" aria-checked={value===k} onClick={()=>onChange(k)}>
  <i/><span className="tx">{title}{sub&&<small>{sub}</small>}</span></button>)}</div>;
}
/** Single choice as chips (filters, «кто видит»). Multi-choice chips are Chip with `on`. */
export function ChoiceChips<T extends string>({value,options,onChange,label,scroll,disabled}:{value:T|null|undefined,options:readonly (readonly [T,ReactNode])[],onChange:(v:T)=>void,label:string,scroll?:boolean,disabled?:boolean}){
 return <div className={'chips'+(scroll?' scroll':'')} role="radiogroup" aria-label={label} aria-disabled={disabled||undefined}>{options.map(([k,l])=><button key={k} type="button" disabled={disabled} className={'chip'+(value===k?' on':'')} role="radio" aria-checked={value===k} onClick={()=>onChange(k)}>{l}</button>)}</div>;
}
/** Several values from a small set as chips (what to ask for). `all` adds a first chip that picks every option at once
 * and reads as picked while all are; a tap on it with everything picked clears the choice. `value` keeps the order of
 * `options`. */
export function MultiChips<T extends string>({value,options,onChange,label,all,disabled}:{value:readonly T[],options:readonly (readonly [T,ReactNode])[],onChange:(v:T[])=>void,label:string,
 /** The «Всё» chip's label; shown only when there are two options or more. */ all?:ReactNode,disabled?:boolean}){
 // «Всё» or several (owner 29.10.2026): with every option picked only «Всё» is lit; a tap on one part then picks that
 // part alone; picking the last missing part lights «Всё» again.
 const keys=options.map(o=>o[0]);const showAll=!!all&&keys.length>1;const every=keys.length>0&&keys.every(k=>value.includes(k));
 const flip=(k:T)=>onChange(showAll&&every?[k]:keys.filter(x=>x===k?!value.includes(k):value.includes(x)));
 return <div className="chips" role="group" aria-label={label}>
  {showAll&&<button type="button" disabled={disabled} className={'chip'+(every?' on':'')} aria-pressed={every} onClick={()=>onChange(keys)}>{all}</button>}
  {options.map(([k,l])=>{const on=value.includes(k)&&!(showAll&&every);return <button key={k} type="button" disabled={disabled} className={'chip'+(on?' on':'')} aria-pressed={on} onClick={()=>flip(k)}>{l}</button>;})}
 </div>;
}
/** Several values from a list as rows with a box (what to open, what to keep). A row may say more under its title
 * («не запрошено», «уже открыто»); `value` keeps the order of `options`. */
export function CheckList<T extends string>({value,options,onChange,label}:{value:readonly T[],options:readonly (readonly [T,ReactNode,ReactNode?])[],onChange:(v:T[])=>void,label:string,/** Kept for old calls; the rows never have a second frame. */ bare?:boolean}){
 const flip=(k:T)=>onChange(options.map(o=>o[0]).filter(x=>x===k?!value.includes(k):value.includes(x)));
 return <div className="k-radios" role="group" aria-label={label}>{options.map(([k,title,sub])=>{const on=value.includes(k);return <button key={k} type="button" className={'radio k-chk'+(on?' on':'')} role="checkbox" aria-checked={on} onClick={()=>flip(k)}>
  <i><Check2/></i><span className="tx">{title}{sub&&<small>{sub}</small>}</span></button>;})}</div>;
}
/** `.check` — a checkbox with its text (consents, «Также заблокировать» in forms). */
export function Check({on,onChange,children,error,aside}:{on:boolean,onChange:(v:boolean)=>void,children:ReactNode,error?:boolean,
 /** A small action on the same row, outside the box's tap area (an explicit consent and «Читать» next to it). */ aside?:ReactNode}){
 const box=<button type="button" role="checkbox" aria-checked={on} className={'check'+(on?' on':'')+(error?' err':'')} onClick={()=>onChange(!on)}><i><Check2/></i><span>{children}</span></button>;
 return aside?<div className="k-check-row">{box}{aside}</div>:box;
}
/** `.sw` — a bare switch, for a row the kit's ToggleRow does not fit. */
export function Switch({on,onChange,label,disabled,className}:{on:boolean,onChange:(v:boolean)=>void,label:string,disabled?:boolean|undefined,className?:string}){
 return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'k-sw'+(className?' '+className:'')} onClick={()=>onChange(!on)}><span className={'sw'+(on?' on':'')} aria-hidden="true"/></button>;
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
export function Note({children,className,as='p'}:{children:ReactNode,className?:string,as?:'p'|'span'|'div'|'small'|'ul'}){const T=as;return <T className={'note'+(className?' '+className:'')}>{children}</T>;}
/** `.fact` — one line of a short list with an icon in front (an event's requirements, what Premium gives); `tone`
 * colours the icon: ok (green), v (accent), a (warning); without it the icon is quiet. */
export function Fact({icon:Icon,tone,children}:{icon:LucideIcon,tone?:'ok'|'v'|'a'|undefined,children:ReactNode}){
 return <div className="fact"><i className={tone==='ok'?'g':tone}><Icon/></i><span>{children}</span></div>;
}
export function SectionLabel({children,action,id,className}:{children:ReactNode,action?:ReactNode,id?:string,className?:string}){return <div className={'sec'+(className?' '+className:'')} id={id}><span>{children}</span>{action}</div>;}
/** «12 / 1000» under a text field. */
export function Counter({n,max}:{n:number,max:number}){return <div className={'counter'+(n>max?' over':'')} aria-live="polite">{n} / {max}</div>;}

/** A button that is a link (open a site, a map, a ticket page): Btn look, a real <a>. */
export function LinkBtn({href,children,kind='soft',size='',icon:Icon,external=true,fit}:{href:string,children:ReactNode,kind?:'primary'|'soft'|'text',size?:''|'md'|'sm',icon?:LucideIcon,external?:boolean,fit?:boolean}){
 return <a href={href} className={['btn',kind,size,fit?'k-fit':'','k-link'].filter(Boolean).join(' ')} {...(external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{Icon&&<Icon/>}{children}</a>;
}

/** The six boxes of a sign-in code; paste or type fills them, one digit each. `onComplete` gets the code once every
 * box is filled; Enter calls `onEnter`. The ref is the box group (a screen shakes it on a wrong code). */
export const CodeInput=forwardRef<HTMLDivElement,{value:string,onChange:(v:string)=>void,length?:number,label:string,invalid?:boolean,autoFocus?:boolean,disabled?:boolean,
 onComplete?:(code:string)=>void,onEnter?:(code:string)=>void,name?:string,/** Each box's name before its number (default: the label). */ digitLabel?:string}>(function CodeInput({value,onChange,length=6,label,invalid,autoFocus,disabled,onComplete,onEnter,name,digitLabel},ref){
 const refs=useRef<(HTMLInputElement|null)[]>([]);
 const set=(i:number,ch:string)=>{const d=ch.replace(/\D/g,'');const at=Math.min(i,value.length);if(!d){onChange(value.slice(0,at));return;}
  const next=(value.slice(0,at)+d).slice(0,length);onChange(next);refs.current[Math.min(next.length,length-1)]?.focus();if(next.length===length)onComplete?.(next);};
 return <div ref={ref} className={'code'+(invalid?' err':'')} role="group" aria-label={label} data-field={name}>{Array.from({length},(_,i)=><input key={i} ref={el=>{refs.current[i]=el;}} inputMode="numeric" autoComplete={i===0?'one-time-code':'off'}
  aria-label={`${digitLabel??label} ${i+1}`} aria-invalid={invalid||undefined} maxLength={length} value={value[i]??''} autoFocus={autoFocus&&i===0} disabled={disabled}
  onChange={e=>set(i,e.target.value)} onKeyDown={e=>{if(e.key==='Backspace'&&!value[i]&&i>0){onChange(value.slice(0,i-1));refs.current[i-1]?.focus();}if(e.key==='Enter')onEnter?.(value);}}/>)}</div>;
});
/** Two thumbs on one track (age from–to). */
export function RangeDual({min,max,lo,hi,onChange,label,labels}:{min:number,max:number,lo:number,hi:number,onChange:(lo:number,hi:number)=>void,label:string,
 /** The two thumbs' own names (default: «label от» / «label до»). */ labels?:[string,string]}){
 const pct=(v:number)=>(v-min)/(max-min)*100;
 return <div className="k-dual" style={{'--lo':pct(lo)+'%','--hi':pct(hi)+'%'} as React.CSSProperties}>
  <input type="range" min={min} max={max} value={lo} aria-label={labels?.[0]??label+' от'} onChange={e=>onChange(Math.min(+e.target.value,hi),hi)}/>
  <input type="range" min={min} max={max} value={hi} aria-label={labels?.[1]??label+' до'} onChange={e=>onChange(lo,Math.max(+e.target.value,lo))}/>
 </div>;
}

/** A full-screen overlay (the photo viewer) that the system «Назад» closes: opening adds a history entry with the
 * same address and state, «Назад» (browser, Android) takes it away and calls `onClose` instead of leaving the screen;
 * closing by ✕ / Esc goes back over that entry so it never stays behind. */
export function useBackClose(onClose:()=>void){
 const cb=useRef(onClose);cb.current=onClose;
 useEffect(()=>{
  const token=Math.random().toString(36).slice(2);const st=window.history.state as Record<string,unknown>|null;
  window.history.pushState({...(st??{}),feOverlay:token},'');
  let popped=false;const pop=()=>{if((window.history.state as {feOverlay?:string}|null)?.feOverlay===token)return;popped=true;cb.current();};
  window.addEventListener('popstate',pop);
  return ()=>{window.removeEventListener('popstate',pop);if(!popped&&(window.history.state as {feOverlay?:string}|null)?.feOverlay===token)window.history.back();};
 },[]);
}

/** The scroll box an element lives in (a screen's `.view`, a sheet body), or null for the page itself. */
function scrollBox(el:HTMLElement|null):HTMLElement|null{
 for(let p=el?.parentElement;p;p=p.parentElement){const o=getComputedStyle(p).overflowY;if(o==='auto'||o==='scroll')return p;}
 return null;
}
/** Infinite scroll (owner 28.10.2026: no «Показать ещё» buttons): put it after a paged list. When the reader comes
 * within about a screen of the end it asks for the next page (`onMore`) by itself; meanwhile three dots blink in a
 * box of fixed height (nothing jumps), a failed page leaves one quiet retry line, and with no more pages it is gone.
 * `more` — there is a next page; `busy` — it is being loaded; `error` — the last page failed. */
export function LoadMore({more,busy,error,onMore,label}:{more:boolean,busy?:boolean|undefined,error?:unknown,onMore:()=>void,/** What is loading, for screen readers. */ label?:string|undefined}){
 const {t}=useI18n();const box=useRef<HTMLDivElement>(null);const near=useRef(false);
 const cb=useRef(onMore);cb.current=onMore;
 const state=useRef({more,busy,error});state.current={more,busy,error};
 const ask=()=>{const s=state.current;if(near.current&&s.more&&!s.busy&&!s.error)cb.current();};
 useEffect(()=>{
  const el=box.current;if(!el||!more||typeof IntersectionObserver==='undefined')return;
  const root=scrollBox(el);
  const io=new IntersectionObserver(es=>{near.current=es.some(e=>e.isIntersecting);ask();},{root,rootMargin:'0px 0px 100% 0px'});
  io.observe(el);return ()=>io.disconnect();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[more]);
 // A page that did not fill the screen: the end is still near once it has come, so the next one is asked at once.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!busy&&!error)ask();},[busy,error]);
 if(!more)return null;
 if(error&&!busy)return <div className="k-more err" role="alert"><span>{t('fe.kit.more.fail')}</span><Btn kind="text" size="sm" fit onClick={()=>cb.current()}>{t('fe.kit.more.retry')}</Btn></div>;
 return <div ref={box} className="k-more" role="status" aria-busy={busy||undefined} aria-label={label??t('fe.kit.more.loading')}>{busy&&<span className="k-more-dots" aria-hidden="true"><i/><i/><i/></span>}</div>;
}

/** Counts as tiles in a row (a manage screen: members, requests, who is going): the number large, a word under it; a
 * tile with `onClick` opens its list. Two or three tiles share the width. */
export function StatTiles({items}:{items:readonly {n:number,label:string,onClick?:(()=>void)|undefined}[]}){
 return <div className={'stat3'+(items.length===2?' two':'')}>{items.map((x,i)=>x.onClick
  ?<button key={i} type="button" onClick={x.onClick}><b>{x.n}</b><small>{x.label}</small></button>
  :<div key={i}><b>{x.n}</b><small>{x.label}</small></div>)}</div>;
}

/** One of two or three options as equal cards side by side (a mode: «Обычные» / «Безопасные» on the lock screen): a
 * round mark, a bold title and a line under it. Every card has the same height and the same inner alignment, whatever
 * the length of its text; no «по умолчанию» badges — the line says what the option does. */
export function ChoiceCards<T extends string>({value,options,onChange,label}:{value:T,options:readonly (readonly [T,ReactNode,ReactNode?])[],onChange:(v:T)=>void,label:string}){
 return <div className={'k-cards'+(options.length===3?' three':'')} role="radiogroup" aria-label={label}>{options.map(([k,title,sub])=>
  <button key={k} type="button" role="radio" aria-checked={value===k} className={'k-card'+(value===k?' on':'')} onClick={()=>{if(value!==k)onChange(k);}}>
   <i aria-hidden="true"/><b>{title}</b>{sub&&<small>{sub}</small>}</button>)}</div>;
}

/** A span of time on one line, as words with two inline selects: «с 23:00 до 08:00». It goes under a row's title
 * (`Row extra`) next to the switch that turns it on; `disabled` dims it while the switch is off. */
export function TimeSpan<T extends string>({from,to,options,onFrom,onTo,words,disabled}:{from:T,to:T,options:readonly (readonly [T,string])[],onFrom:(v:T)=>void,onTo:(v:T)=>void,
 /** The words around the times and the selects' names: {from:'с', to:'до', fromLabel:'Начало', toLabel:'Конец'}. */ words:{from:string,to:string,fromLabel:string,toLabel:string},disabled?:boolean}){
 const pick=(v:T,on:(v:T)=>void,l:string)=><label className="k-tsel"><span aria-hidden="true">{options.find(([k])=>k===v)?.[1]??v}</span>
  <select value={v} disabled={disabled} aria-label={l} onChange={e=>on(e.target.value as T)}>{options.map(([k,x])=><option key={k} value={k}>{x}</option>)}</select></label>;
 return <span className={'k-tspan'+(disabled?' off':'')}>{words.from} {pick(from,onFrom,words.fromLabel)} {words.to} {pick(to,onTo,words.toLabel)}</span>;
}

export * from './domain';
export * from './feed';
export * from './account';
export * from './security';
export * from './av';
export * from './facts';
export {NewPill,PullRefresh,PullRefreshRunner,useRefreshable} from './pull';
