import {useEffect,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronRight,Clock,CircleAlert,type LucideIcon} from 'lucide-react';
import {Card,Note} from './index';
import {RequestCard} from './domain';
import './notes.css';

/** The notification center's six card templates (docs/notifications.md «Модель», Storybook «Домен/Уведомления»).
 * Every inbox row and every «Нужно решить» item is drawn by one of them, picked by the catalog's `card`
 * (contracts/notifications.mjs): news, decision, result, safety, event, summary. A new notification type picks one;
 * nobody draws a new card. The words come from the catalog; these only lay them out. */

export type NoteTone=''|'l'|'g'|'v';

type RowProps={
 /** Who did it (the actor's `Av`); without it the type's icon stands on a plate. */
 av?:ReactNode,
 icon:LucideIcon,tone?:NoteTone|undefined,
 /** The catalog's line, the name in bold. */
 text:ReactNode,
 /** «5 мин», «вчера». */
 time:ReactNode,
 /** «Тебе» / «Паре» when the account has a couple (`us`: addressed to the couple). */
 tag?:{text:ReactNode,us?:boolean}|null|undefined,
 unread?:boolean|undefined,
 /** The object is gone or hidden from the addressee: the catalog's «Больше недоступно» instead of its details. */
 gone?:ReactNode,
 onClick?:(()=>void)|undefined,
 /** For `useScrollTo`: the row a link points at (`?item=`) is scrolled to and lit for a moment. */
 id?:string|undefined,
};

/** The frame every row template shares (`.nt`): picture with the type's icon, the text, a line under it, the time, the
 * unread dot. */
function NoteFrame({kind,av,icon:Icon,tone='',text,time,tag,unread,gone,onClick,id,lead,children}:RowProps&{kind:string,lead?:ReactNode,children?:ReactNode}){
 const {t}=useI18n();
 const pic=lead??(av?<>{av}<span className={'ico'+(tone?' '+tone:'')}><Icon/></span></>:<span className={'av k-note-plate'+(tone?' '+tone:'')}><Icon/></span>);
 return <button type="button" id={id} className={'nt k-note k-note-'+kind+(unread?' unread':'')} onClick={onClick}>
  <span className="ntw">{pic}</span>
  <span className="tx"><span className="k-note-text">{text}</span>{children}{gone&&<span className="k-note-gone">{gone}</span>}<time>{tag&&<><span className={'whom'+(tag.us?' us':'')}>{tag.text}</span> </>}{time}</time></span>
  {unread&&<span className="dotu" aria-label={t('fe.kit.note.unread')}/>}
 </button>;
}

/** Новость: someone did something, or something happened (a like, a reply, a follow). */
export function NoteNews(p:RowProps){return <NoteFrame kind="news" {...p}/>;}

/** Результат: how a request or a task ended. Closed: no buttons; the icon plate carries the outcome's tone, `outcome`
 * names it when the line does not («Принято», «Отклонено»). */
export function NoteResult({outcome,...p}:RowProps&{outcome?:ReactNode}){
 return <NoteFrame kind="result" {...p}>{outcome&&<span className={'k-note-out'+(p.tone?' '+p.tone:'')}>{outcome}</span>}</NoteFrame>;
}

/** Безопасность и модерация: a decision about the person or their content, a new sign-in. Never an actor's face;
 * the reason, the term and «можно обжаловать» under the line. */
export function NoteSafety({reason,term,appeal,...p}:Omit<RowProps,'av'>&{reason?:ReactNode,term?:ReactNode,appeal?:ReactNode}){
 return <NoteFrame kind="safety" {...p} tone={p.tone||'l'}>
  {reason&&<span className="k-note-line">{reason}</span>}
  {term&&<span className="k-note-line"><Clock/>{term}</span>}
  {appeal&&<span className="k-note-act">{appeal}</span>}
 </NoteFrame>;
}

/** Событие со сроком: the event's date on a tile instead of a face, its name, and the time in the event's own zone
 * with the zone's name («19:00 · Берлин (UTC+1)»); a cancelled one says so instead of the time. */
export function NoteEvent({day,month,title,when,cancelled,...p}:Omit<RowProps,'av'>&{day?:string|undefined,month?:string|undefined,title?:ReactNode,when?:ReactNode,cancelled?:ReactNode}){
 const lead=day?<><span className="k-note-date" aria-hidden="true"><b>{day}</b><small>{month}</small></span><span className={'ico'+(p.tone?' '+p.tone:'')}><p.icon/></span></>:undefined;
 return <NoteFrame kind="event" {...p} lead={lead}>
  {title&&<span className="k-note-title">{title}</span>}
  {cancelled?<span className="k-note-line k-note-cancel">{cancelled}</span>:when&&<span className="k-note-line">{when}</span>}
 </NoteFrame>;
}

/** Сводка: several rows of one kind as one («Алиса и ещё 3 ставят лайк твоей публикации»): up to three faces stacked. */
export function NoteSummary({avs,...p}:Omit<RowProps,'av'>&{avs:ReactNode[]}){
 const lead=avs.length?<><span className="k-note-stack">{avs.slice(0,3)}</span><span className={'ico'+(p.tone?' '+p.tone:'')}><p.icon/></span></>:undefined;
 return <NoteFrame kind="summary" {...p} lead={lead}/>;
}

/** Запрос решения («Нужно решить»): who asks (`person`: a `PersonLine` — the name opens the person), what they ask
 * (`action`), about what (`object`: the club, the event, the request — the card's middle opens it), the details
 * (`children`: `Answer`s, parts asked for), the buttons. `gone`: the object is no longer there (no buttons then). */
export function NoteDecision({person,action,object,objectIcon:ObjIcon,onOpen,openLabel,actions,children,gone,id}:{person:ReactNode,action:ReactNode,
 object?:ReactNode,objectIcon?:LucideIcon|undefined,onOpen?:(()=>void)|undefined,openLabel?:string|undefined,actions?:ReactNode,children?:ReactNode,gone?:ReactNode,
 id?:string|undefined}){
 const body=<><span className="k-note-text">{action}</span>
  {object&&<span className="k-note-obj">{ObjIcon&&<ObjIcon/>}<b>{object}</b></span>}</>;
 return <RequestCard id={id} className="k-note-dec" person={person} actions={gone?undefined:actions}>
  {onOpen?<button type="button" className="k-note-open" aria-label={openLabel} onClick={onOpen}><span className="grow">{body}</span><ChevronRight/></button>:<div className="k-note-open">{body}</div>}
  {children}
  {gone&&<Note className="k-note-gone"><CircleAlert/>{gone}</Note>}
 </RequestCard>;
}

/** A moderation decision's own screen (the safety card opened): what was decided, then the facts — the reason, the
 * term or the end date, the appeal's state — and the actions («Обжаловать»). Never who reported, never the closed
 * material. */
export function SafetyDecision({icon:Icon,tone='l',title,facts,children}:{icon:LucideIcon,tone?:NoteTone,title:ReactNode,facts:[string,ReactNode][],children?:ReactNode}){
 const shown=facts.filter(([,v])=>v!==null&&v!==undefined&&v!=='');
 return <Card className="k-safety">
  <div className={'k-safety-head'+(tone?' '+tone:'')}><span className="k-safety-ico"><Icon/></span><b>{title}</b></div>
  {shown.length>0&&<dl className="k-safety-facts">{shown.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
  {children}
 </Card>;
}

/** Scrolls the element with this id into view once it is there (`ready`), and lights it for a moment (`.k-focus`):
 * the place a link or a push points at — a request, an invitation, a link, the private part. */
export function useScrollTo(id:string|null|undefined,ready:boolean){
 useEffect(()=>{
  if(!id||!ready)return;
  const el=document.getElementById(id);if(!el)return;
  el.scrollIntoView({block:'center',behavior:'smooth'});
  el.classList.add('k-focus');const tm=setTimeout(()=>el.classList.remove('k-focus'),2400);
  if(el.tabIndex<0&&!/^(BUTTON|A|INPUT)$/.test(el.tagName))el.setAttribute('tabindex','-1');
  el.focus({preventScroll:true});
  return ()=>clearTimeout(tm);
 },[id,ready]);
}
