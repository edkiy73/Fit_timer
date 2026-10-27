import type {ButtonHTMLAttributes,CSSProperties,ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,type LucideIcon} from 'lucide-react';

/** V21 building blocks with the prototype's own markup and class names (styles: v21.css, generated from
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
const initial=(name:string)=>[...(name.trim()||'?')][0]!.toUpperCase();

/** `av()` — photo, or initials on a plate; a couple without a photo is one circle with two halves. */
export function Av({name,src,size='',seed,couple}:{name:string,src?:string|null|undefined,size?:''|'xs'|'sm'|'lg'|'xl',seed?:string|undefined,couple?:[string,string]|undefined}){
 if(!src&&couple)return <span className={`av split ${size}`}>{couple.map((n,i)=><span key={i} className="avs ini"><div className="plate" style={plate((seed??n)+i)}/><b>{initial(n)}</b></span>)}</span>;
 if(src)return <span className={`av ${size}`}><img src={src} alt="" loading="lazy" draggable={false}/></span>;
 return <span className={`av ini ${size}`}><div className="plate" style={plate(seed??name)}/><b style={{position:'relative'}}>{initial(name)}</b></span>;
}

/** `bar()` — the screen header; «‹» goes back within the tab's stack. */
export function Bar({title,back,small,children}:{title:string,back?:string|true,small?:boolean,children?:ReactNode}){
 const navigate=useNavigate();const {t}=useI18n();
 return <header className="bar">
  {back&&<button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>typeof back==='string'?navigate(back):navigate(-1)}><ChevronLeft/></button>}
  <h1 className={small||back?'sm':''} tabIndex={-1}>{title}</h1>
  {children}
 </header>;
}

type BtnProps=ButtonHTMLAttributes<HTMLButtonElement>&{kind?:'primary'|'soft'|'text'|'danger',size?:''|'md'|'sm',auto?:boolean,icon?:LucideIcon};
/** `.btn` — 48 / md 44 / sm 36; one main button per group. */
export function Btn({kind='primary',size='',auto,icon:Icon,className,children,type='button',...rest}:BtnProps){
 return <button type={type} className={['btn',kind,size,auto?'auto':'',className].filter(Boolean).join(' ')} {...rest}>{Icon&&<Icon/>}{children}</button>;
}

/** `empty()` — one look for empty, error and unavailable states. */
export function Empty({icon:Icon,title,text,children,role}:{icon:LucideIcon,title:string,text?:string,children?:ReactNode,role?:'status'|'alert'}){
 return <div className="empty" role={role}><div className="em-ic"><Icon/></div><h3>{title}</h3>{text&&<p>{text}</p>}{children&&<div className="btns">{children}</div>}</div>;
}

/** `seg()` — segmented tabs with the sliding knob. */
export function Seg<T extends string>({value,options,onChange,label,small=true}:{value:T,options:{id:T,label:string}[],onChange:(v:T)=>void,label?:string,small?:boolean}){
 const i=Math.max(0,options.findIndex(o=>o.id===value));
 return <div className={'seg'+(small?' sm':'')} role="tablist" aria-label={label}>
  <span className="knob" style={{width:`calc((100% - 8px)/${options.length})`,transform:`translateX(${i*100}%)`}}/>
  {options.map(o=><button key={o.id} type="button" role="tab" aria-selected={o.id===value} className={o.id===value?'on':''} onClick={()=>onChange(o.id)}><span>{o.label}</span></button>)}
 </div>;
}

/** View body: `.view > .wrap`. */
export function View({children,className}:{children:ReactNode,className?:string}){
 return <div className={'view'+(className?' '+className:'')}><div className="wrap">{children}</div></div>;
}
