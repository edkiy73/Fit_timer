import type {ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {Card,Empty,Skel} from './index';

/** The desktop context column (V21 `CTX`, stage ≥ 1100 px): the third column next to the screen, with a few blocks
 * about the open tab — what is coming up, what waits, where to go next. base.css shows `.ctx` only on desktop; the
 * shell renders it only there, so phones and tablets never read its data. Story «Навигация/Колонка контекста». */
export function ContextColumn({label,children,foot,always}:{/** What the column is, for screen readers («Контекст»). */ label:string,children:ReactNode,
 /** Shown at any width (Storybook): the app never passes it — the column is desktop-only. */ always?:boolean,
 /** The small line at the bottom: a word and a few quiet links. */ foot?:{text:string,links?:readonly {label:string,onClick:()=>void}[]}|undefined}){
 return <aside className={'ctx'+(always?' k-ctx-always':'')} aria-label={label}>{children}
  {foot&&<p className="foot">{foot.text}{foot.links?.map(l=><span key={l.label}> · <button type="button" className="k-ctx-link" onClick={l.onClick}>{l.label}</button></span>)}</p>}
 </aside>;
}

/** One block of the column: its heading, then rows or event tiles. `rows` — the content is mini rows (they share one
 * card). While `loading` the block blinks in place; with no content it says `empty` (the kit's compact Empty). */
export function CtxBlock({title,children,rows,loading,empty,more}:{title:string,children?:ReactNode,rows?:boolean,loading?:boolean,
 empty?:{icon:LucideIcon,title:string,text?:string|undefined,action?:ReactNode}|null|undefined,
 /** A quiet action under the block («Все · 5», «Центр уведомлений» is a row instead). */ more?:ReactNode}){
 const has=Array.isArray(children)?children.some(Boolean):!!children;
 return <>
  <h3>{title}</h3>
  {loading?<Skel kind="list" rows={2}/>
   :has?rows?<Card list className="k-ctx-list">{children}</Card>:<div className="k-ctx-tiles">{children}</div>
   :empty?<Empty compact icon={empty.icon} title={empty.title} text={empty.text}>{empty.action}</Empty>:null}
  {!loading&&more}
 </>;
}

/** A mini row (V21 `.ctx .mini`): a small picture (avatar or community plate), a bold line and a quiet one; the whole
 * row opens the item. `pic` — a square picture (community, event) instead of a round avatar. */
export function CtxRow({av,pic,icon:Icon,title,sub,unread,onClick}:{av?:ReactNode,pic?:ReactNode,icon?:LucideIcon|undefined,title:ReactNode,sub?:ReactNode,
 /** Not read yet (a notification): an accent dot before the line. */ unread?:boolean,onClick:()=>void}){
 return <button type="button" className={'mini'+(unread?' k-ctx-unread':'')} onClick={onClick}>
  {av}{pic&&<span className="k-ctx-pic">{pic}</span>}{Icon&&<span className="ico v"><Icon/></span>}
  <span className="grow"><b>{title}</b>{sub?<small>{sub}</small>:null}</span>
 </button>;
}
