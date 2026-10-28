import {forwardRef,useLayoutEffect,useState,type ButtonHTMLAttributes,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,type LucideIcon} from 'lucide-react';
import {PLATE_KEYS,articlePlate,type PlateKey} from '../../contracts/_plates.mjs';
import {linkExpiresAt} from './kit/media';

/** V21 building blocks with the prototype's own markup and class names (styles: kit/base.css, started from
 * public/prototype-v21.html). Icons come only from Lucide. */

// V21 plates (prototype PL): the coloured disc behind initials.
const PLATES=[['#7A1236','#FF5A7A','#B9A6FF','#2A0D1F'],['#3C1B5A','#FF9F7A','#7A1236','#170A14'],['#1F3A4A','#7FE0B9','#B9A6FF','#0E1A22'],
 ['#2A2A55','#7FB8FF','#1F3A4A','#0E0E1E'],['#4A2A12','#FFB25A','#FF5A7A','#1F120A'],['#3A1A10','#F6B49B','#7A1236','#140A06'],
 ['#5C47D6','#FF5A7A','#F6B49B','#1A0F3A'],['#25403A','#C6F27F','#2A2A55','#0D1714'],['#5A1240','#FFB199','#5C47D6','#1A0F16']] as const;
export function plate(seed:string):CSSProperties{
 let h=0;for(const c of seed)h=(h*31+c.charCodeAt(0))>>>0;
 const p=PLATES[h%PLATES.length]!;
 return {'--p1':p[0],'--p2':p[1],'--p3':p[2],'--p4':p[3],position:'absolute',inset:0} as CSSProperties;
}
// Prototype PL: the named cover plates a community, an event or an article (no photos) has instead of a photo; the keys
// are shared with the server (contracts/_plates.mjs).
const NAMED:Record<PlateKey,readonly [string,string,string,string]>={
 lilac:['#5C47D6','#FF5A7A','#F6B49B','#1A0F3A'],rose:['#7A1236','#FF5A7A','#B9A6FF','#2A0D1F'],sea:['#1F3A4A','#7FE0B9','#B9A6FF','#0E1A22'],
 amber:['#4A2A12','#FFB25A','#FF5A7A','#1F120A'],moss:['#25403A','#C6F27F','#2A2A55','#0D1714'],coal:['#2B2B2B','#FF6B3D','#6F6F6F','#0F0F0F'],
};
export {PLATE_KEYS,articlePlate,type PlateKey};
/** The style of a named plate (`.plate`); an unknown key paints «rose». */
export function namedPlate(k:string):CSSProperties{
 const p=NAMED[k as PlateKey]??NAMED.rose;
 return {'--p1':p[0],'--p2':p[1],'--p3':p[2],'--p4':p[3],position:'absolute',inset:0} as CSSProperties;
}
const initial=(name:string)=>[...(name.trim()||'?')][0]!.toUpperCase();

/** `av()` — photo, or initials on a plate; a couple without a photo is one circle with two halves. */
// The server signs photo URLs per response, so the same avatar comes back under a new URL after every refetch and
// would load and fade in again (the dock's «Я» blinked on each tab switch). A photo already shown keeps its URL while
// that link still works (its own expiry, a minute to spare; ten minutes at most): the browser has it, nothing blinks.
const shown=new Map<string,{src:string,at:number,until:number}>();
function steady(src:string){
 const key=src.split('?')[0]!;const was=shown.get(key);const now=Date.now();
 if(was&&now-was.at<600e3&&now<was.until)return was.src;
 shown.set(key,{src,at:now,until:(linkExpiresAt(src)??now+600e3)-60e3});return src;
}
/** A photo that does not load (its link ran out, the photo was removed) is never a broken-image mark: the initials. */
export function Av({name,src,size='',seed,couple}:{name:string,src?:string|null|undefined,size?:''|'xs'|'sm'|'lg'|'xl',seed?:string|undefined,couple?:[string,string]|undefined}){
 const [bad,setBad]=useState<string|null>(null);
 const pic=src?steady(src):null;
 if(pic&&bad!==pic)return <span className={`av ${size}`}><img src={pic} alt="" loading="lazy" draggable={false} onError={()=>{shown.delete(pic.split('?')[0]!);setBad(pic);}}/></span>;
 if(couple)return <span className={`av split ${size}`}>{couple.map((n,i)=><span key={i} className="avs ini"><div className="plate" style={plate((seed??n)+i)}/><b>{initial(n)}</b></span>)}</span>;
 return <span className={`av ini ${size}`}><div className="plate" style={plate(seed??name)}/><b style={{position:'relative'}}>{initial(name)}</b></span>;
}

/** `bar()` — the screen header; «‹» goes back within the tab's stack. */
export function Bar({title,back,onBack,small,children}:{title:string,back?:string|true,onBack?:()=>void,small?:boolean,children?:ReactNode}){
 const navigate=useNavigate();const {t}=useI18n();
 return <header className="bar">
  {(back||onBack)&&<button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>onBack?onBack():typeof back==='string'?navigate(back):navigate(-1)}><ChevronLeft/></button>}
  <h1 className={small||back||onBack?'sm':''} tabIndex={-1}>{title}</h1>
  {children}
 </header>;
}

type BtnProps=ButtonHTMLAttributes<HTMLButtonElement>&{kind?:'primary'|'soft'|'text'|'danger'|'dark',size?:''|'md'|'sm',auto?:boolean,icon?:LucideIcon};
/** `.btn` — 48 / md 44 / sm 36; one main button per group. */
export const Btn=forwardRef<HTMLButtonElement,BtnProps&{busy?:boolean,fit?:boolean,pressed?:boolean,square?:boolean}>(function Btn({kind='primary',size='',auto,fit,pressed,square,icon:Icon,className,children,type='button',busy,...rest},ref){
 // `busy` blinks in place (owner: never a spinner); `fit` keeps the button at its text width inside a row;
 // `square` is an icon-only button of the button height next to a full one (aria-label required); `dark` sits on a light veil.
 return <button ref={ref} type={type} className={['btn',kind,size,auto?'auto':'',fit?'k-fit':'',square?'icon':'',busy?'busy':'',pressed?'on':'',className].filter(Boolean).join(' ')} aria-busy={busy||undefined} aria-pressed={pressed} {...rest}>{Icon&&<Icon/>}{children}</button>;
});

/** `empty()` — one look for empty, error and unavailable states. */
export function Empty({icon:Icon,title,text,children,role,art,wide,big,top,after}:{icon?:LucideIcon,title:string,text?:string,children?:ReactNode,role?:'status'|'alert',
 /** A picture instead of the icon disc (pair art, radar). */ art?:ReactNode,/** Content (a card, a list) spans the width. */ wide?:boolean,
 /** A larger title and a narrower text (a whole tab that is switched off). */ big?:boolean,/** Starts right under the header instead of mid-screen. */ top?:boolean,
 /** Blocks after the buttons, full width and left-aligned (choices, «что останется»). */ after?:ReactNode}){
 return <div className={['empty',wide?'k-empty-wide':'',big?'k-empty-big':'',top?'k-empty-top':''].filter(Boolean).join(' ')} role={role}>{art??(Icon&&<div className="em-ic"><Icon/></div>)}<h3>{title}</h3>{text&&<p>{text}</p>}{children&&<div className="btns">{children}</div>}{after&&<div className="k-empty-after">{after}</div>}</div>;
}

/** `seg()` — segmented tabs with the sliding knob. */
/** The one tab control of the app (owner, 27.10.2026: one plaque everywhere, the feed's size). A count shows as
 * `<em>n</em>`, a dot marks something waiting; five or more tabs scroll sideways instead of squeezing. */
export type SegOption<T extends string>={id:T,label:string,n?:number|string|undefined,dot?:string|undefined};
export function Seg<T extends string>({value,options,onChange,label}:{value:T,options:SegOption<T>[],onChange:(v:T)=>void,label?:string|undefined,small?:boolean,big?:boolean}){
 const i=Math.max(0,options.findIndex(o=>o.id===value));const scroll=options.length>4;
 return <div className={'seg sm'+(scroll?' scroll':'')} role="tablist" aria-label={label}>
  {!scroll&&<span className="knob" style={{width:`calc((100% - 8px)/${options.length})`,transform:`translateX(${i*100}%)`}}/>}
  {options.map(o=><button key={o.id} type="button" role="tab" aria-selected={o.id===value} className={o.id===value?'on':''} onClick={()=>onChange(o.id)}>
   <span>{o.label}{o.dot&&<i className="tdot" role="img" aria-label={o.dot}/>}</span>{o.n?<em>{typeof o.n==='number'&&o.n>99?'99+':o.n}</em>:null}</button>)}
 </div>;
}

/** View body: `.view > .wrap`. */
export function View({children,className}:{children:ReactNode,className?:string}){
 return <div className={'view'+(className?' '+className:'')}><div className="wrap">{children}</div></div>;
}

/** The prototype's `#layer` is a child of `.root`, so sheets and dialogs sit on the app frame's bottom edge above the
 * dock. A sheet rendered inside a card or a scrolling view would be positioned against that box instead. */
export function Layer({children}:{children:ReactNode}){
 const [host,setHost]=useState<Element|null>(null);
 useLayoutEffect(()=>{setHost(document.querySelector('.fe-v21 .root'));},[]);
 return host?createPortal(<div className="layer">{children}</div>,host):null;
}

/** Loading placeholder shaped like the content it stands for (list rows, posts, a card), so nothing jumps when the
 * data arrives. Replaces a «Загружаем…» line. */
export function Skel({kind='list',rows=3}:{kind?:'list'|'post'|'card'|'tiles'|'hero'|'cover'|'line'|'grid'|'fill'|'event',rows?:number}){
 const {t}=useI18n();
 const row=(i:number)=>kind==='post'?<div key={i} className="sk-post"><div className="sk-head"><i className="sk sk-av"/><span><i className="sk sk-l w40"/><i className="sk sk-l w25"/></span></div><i className="sk sk-l w90"/><i className="sk sk-l w70"/><i className="sk sk-media"/></div>
  :kind==='card'?<div key={i} className="sk-card"><i className="sk sk-l w50"/><i className="sk sk-l w90"/><i className="sk sk-l w70"/></div>
  :kind==='tiles'?<i key={i} className="sk sk-tile"/>
  :kind==='hero'?<i key={i} className="sk k-sk-hero"/>
  :kind==='cover'?<i key={i} className="sk k-sk-cover"/>
  :kind==='line'?<i key={i} className="sk sk-l w70"/>
  :kind==='grid'?<i key={i} className="sk k-sk-cell"/>
  :kind==='fill'?<i key={i} className="sk k-sk-fill"/>
  :kind==='event'?<i key={i} className="sk k-sk-event"/>
  :<div key={i} className="sk-li"><i className="sk sk-av"/><span><i className="sk sk-l w50"/><i className="sk sk-l w30"/></span></div>;
 return <div className={'skel skel-'+kind} role="status" aria-busy="true" aria-label={t('fe.loading')}>{Array.from({length:rows},(_,i)=>row(i))}</div>;
}
