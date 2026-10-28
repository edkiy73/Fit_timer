import type {ReactNode} from 'react';
import {Crown,Settings,X,type LucideIcon} from 'lucide-react';
import {IconBtn,Pill} from './index';

/** Account pieces (Storybook «Домен/Аккаунт», wave 8): the Premium hero, what Premium gives, the plan cards, the
 * maintenance screen and a support conversation. Styles come from base.css (pw-*, maintenance-screen, msgs) and the
 * tokens; screens use these instead of the markup. */

/** The Premium header plate: crown, «FetUre Premium», one line. `onClose` puts a ✕ on it (the paywall sheet). */
export function PremiumHero({lead,onClose,closeLabel}:{lead:ReactNode,onClose?:(()=>void)|undefined,closeLabel?:string}){
 return <div className="pw-hero">
  {onClose&&<IconBtn icon={X} kind="ghost" size="sm" className="pw-x" label={closeLabel??''} onClick={onClose}/>}
  <span className="pw-crown" aria-hidden="true"><Crown/></span><b>FetUre Premium</b><p>{lead}</p>
 </div>;
}

/** What Premium gives, one line each; `current` marks the one the person just tried (with `neededLabel`). */
export function PremiumFeats({items,current,neededLabel}:{items:{id:string,icon:LucideIcon,title:ReactNode,text:ReactNode}[],current?:string|null|undefined,neededLabel?:ReactNode}){
 return <div className="pw-feats">{items.map(({id,icon:Icon,title,text})=><div key={id} className={'pw-f'+(id===current?' on':'')}>
  <span className={'ico'+(id===current?' l':'')} aria-hidden="true"><Icon/></span>
  <span className="tx"><b>{title}</b><small>{text}</small></span>{id===current&&neededLabel&&<Pill tone="hot">{neededLabel}</Pill>}
 </div>)}</div>;
}

export type PlanOption<T extends string>={id:T,title:ReactNode,price:ReactNode,note?:ReactNode,badge?:ReactNode};
/** Plan cards (Premium plans, gift terms): one is chosen; a badge sits on the corner. */
export function PlanCards<T extends string>({plans,value,onChange,label}:{plans:PlanOption<T>[],value:T,onChange:(v:T)=>void,label:string}){
 return <div className="pw-plans" role="group" aria-label={label}>{plans.map(p=><button key={p.id} type="button" className={'pw-plan'+(value===p.id?' on':'')} aria-pressed={value===p.id} onClick={()=>onChange(p.id)}>
  {p.badge&&<em>{p.badge}</em>}<b>{p.title}</b><span className="pr">{p.price}</span>{p.note&&<small>{p.note}</small>}
 </button>)}</div>;
}

/** The whole-screen «Технические работы»: logo, icon, title, text, the staff message, a note and the retry action. */
export function Maintenance({title,text,message,note,children}:{title:ReactNode,text:ReactNode,message?:ReactNode,note?:ReactNode,children?:ReactNode}){
 return <div className="view nodock"><div className="wrap maintenance-screen" role="status" aria-live="polite">
  <div className="maint-brand"><img src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>
  <span className="maint-ic" aria-hidden="true"><Settings/></span>
  <h1>{title}</h1><p className="lead">{text}</p>
  {message&&<p className="lead"><b>{message}</b></p>}
  {note&&<p className="note">{note}</p>}
  {children}
 </div></div>;
}

export type ThreadMessage={id:string,mine:boolean,text:string,meta?:ReactNode};
/** A support conversation: the person's messages on the right, support's on the left, a quiet line under each. */
export function Thread({messages,label}:{messages:ThreadMessage[],label:string}){
 return <div className="msgs" role="list" aria-label={label}>{messages.map(m=><div key={m.id} role="listitem" className={'msg'+(m.mine?' me':'')}>
  <div className="mtx">{m.text}</div>{m.meta&&<div className="st">{m.meta}</div>}
 </div>)}</div>;
}
