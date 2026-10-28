import React,{type CSSProperties,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,ChevronLeft,Clock,Image as ImageIcon,Lock,Plus,Ticket,Users,type LucideIcon} from 'lucide-react';
import {Av,Btn,Card,IconBtn,Note,Skel,Switch,plate} from './index';
import './domain.css';

/** FetUre domain pieces (Storybook «Домен»): the parts of screens that are product-specific but repeat or carry their
 * own look — the event RSVP, the answer scale, a request card, the selfie frame, the photo slots, the chat header…
 * Screens use these instead of drawing the markup themselves. Styles live in base.css (prototype classes) and
 * domain.css; values only from the tokens. */

/* ---------------- Headers ---------------- */

/** A header that floats over a cover picture (community, event): glass round buttons; the title shows only once the
 * cover scrolls away. `children` are the actions on the right. */
export function CoverBar({title,onBack,children}:{title?:string|null|undefined,onBack?:(()=>void)|undefined,children?:ReactNode}){
 const {t}=useI18n();const navigate=useNavigate();
 return <header className="bar overlay ev-bar">
  <IconBtn icon={ChevronLeft} kind="glass" label={t('fe.back')} onClick={()=>onBack?onBack():navigate(-1)}/>
  <b className="ev-bar-t" aria-hidden="true">{title}</b><span className="k-grow"/>
  {children}
 </header>;
}

/** The header of a conversation: ‹, the other side as the title (avatar, name, a line under it) that opens their
 * profile, then the actions. Without `name` it shows a placeholder while the chat loads. */
export function PersonBar({name,av,sub,onOpen,onBack,children}:{name?:string|undefined,av?:ReactNode,sub?:ReactNode,onOpen?:(()=>void)|undefined,onBack:()=>void,children?:ReactNode}){
 const {t}=useI18n();
 return <header className="bar solid">
  <IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={onBack}/>
  {name?<button type="button" className="row grow chat-who" onClick={onOpen}>{av}
   <span className="cw-tx"><b className="k-strong one">{name}</b>{sub&&<small className="k-cap k-mute">{sub}</small>}</span>
  </button>:<span className="row grow chat-who"><i className="sk sk-av"/><i className="sk sk-l w40"/></span>}
  {children}
 </header>;
}

/** A person's or couple's name on a photo card: name, ages, badges (verified photo…). */
export function PersonName({name,age,children,as='h2'}:{name:ReactNode,age?:ReactNode,children?:ReactNode,as?:'h2'|'h3'|'p'}){
 const T=as;
 return <T className="pc-name"><span className="pcn">{name}</span>{age!==undefined&&age!==null&&age!==''&&<span>{age}</span>}{children}</T>;
}

/* ---------------- Covers ---------------- */

/** The event cover: the plate or photo, place and kind as glass labels, the title, the viewer's status. */
export function EventHero({cover,tags,title,status}:{cover?:ReactNode,tags?:ReactNode[],title?:ReactNode,status?:ReactNode}){
 if(title===undefined)return <div className="ev-hero"><Skel kind="fill" rows={1}/></div>;
 return <div className="ev-hero">{cover}<div className="pc-info">
  {!!tags?.length&&<div className="row g8 k-ev-tags">{tags.map((x,i)=><span key={i} className="pill glass">{x}</span>)}</div>}
  <h2 className="ev-title" tabIndex={-1}>{title}</h2>
  {status&&<div className="ev-hero-st">{status}</div>}
 </div></div>;
}

/** The community cover and head: the wide cover, the square picture, the name and the meta line.
 * Without `name` it is the loading placeholder of the same shape. */
export function CommunityHead({cover,pic,name,meta}:{cover?:ReactNode,pic?:ReactNode,name?:ReactNode,meta?:ReactNode}){
 if(name===undefined)return <><div className="cm-hero"><Skel kind="fill" rows={1}/></div>
  <div className="cm-head"><div className="cv"><Skel kind="fill" rows={1}/></div><i className="sk sk-l w70 k-sk-title"/><i className="sk sk-l w50 k-sk-block"/></div></>;
 return <><div className="cm-hero">{cover}</div>
  <div className="cm-head"><div className="cv">{pic}</div><h2 tabIndex={-1}>{name}</h2>{meta&&<div className="cm-meta">{meta}</div>}</div></>;
}

/** `eventCard()` — the event tile: the cover with date and place, the kind, the title, time and price; `row` is the
 * compact line (next meeting, cancelled). Without `onClick` it is a picture of the card (the wizard's preview). */
export function EventTile({cover,day,month,place,placeIcon:PI,status,kicker,title,time,price,org,row,onClick}:{cover:ReactNode,day?:ReactNode,month?:ReactNode,place:ReactNode,placeIcon?:LucideIcon|undefined,
 status?:ReactNode,kicker?:ReactNode,title:ReactNode,time?:ReactNode,price?:ReactNode,org?:ReactNode,row?:boolean|undefined,onClick?:(()=>void)|undefined}){
 const date=day!==undefined&&<div className="date"><b>{day}</b><small>{month}</small></div>;
 const inner=row?<>
  <div className="cv">{cover}{date}</div>
  <div className="bd"><small>{place}{time?<> · {time}</>:null}</small><b>{title}</b>{org&&<Note as="span">{org}</Note>}{status}</div>
 </>:<>
  <div className="cv">{cover}{date}<div className="fmt"><span>{PI&&<PI/>}{place}</span></div>{status?<div className="my">{status}</div>:null}</div>
  <div className="bd"><small>{kicker}</small><b>{title}</b>
   <div className="meta">{time!==undefined&&<span><Clock/>{time}</span>}{price!==undefined&&<span><Ticket/>{price}</span>}</div></div>
 </>;
 const cls='evc'+(row?' row':'');
 return onClick?<button type="button" className={cls} onClick={onClick}>{inner}</button>:<div className={cls+' k-evc-still'} aria-hidden="true">{inner}</div>;
}

/* ---------------- Community body ---------------- */

/** A discussion row of a community: pinned mark, title, two lines of text, author and replies; `tools` is the host's ⋯. */
export function Discussion({pinned,title,excerpt,meta,onClick,tools}:{pinned?:ReactNode,title?:ReactNode,excerpt:ReactNode,meta:ReactNode,onClick:()=>void,tools?:ReactNode}){
 return <div className={'k-anchor'+(tools?' k-disc-tools':'')}><button type="button" className="disc" onClick={onClick}>
  {pinned&&<span className="pill v k-disc-pin">{pinned}</span>}
  {title&&<b>{title}</b>}<p>{excerpt}</p>
  <span className="meta">{meta}</span>
 </button>{tools&&<span className="k-disc-tool">{tools}</span>}</div>;
}

/** An organiser's update on an event: icon, text, when. */
export function Announcement({icon:I,body,meta}:{icon:LucideIcon,body:ReactNode,meta:ReactNode}){
 return <div className="upd"><span className="ico l"><I/></span><span className="tx"><p className="k-upd-body">{body}</p><small>{meta}</small></span></div>;
}

/** «Интересно / Иду / Не иду» — the answer to an event: three radio buttons; the chosen one is filled. */
export function Rsvp<T extends string>({value,options,onChange,label,disabled,couple}:{value:T|null|undefined,
 /** value, label, icon, tone of the chosen button: interested (violet), going (green), not (quiet). */ options:readonly (readonly [T,string,LucideIcon,'interested'|'going'|'not'])[],onChange:(v:T)=>void,label:string,disabled?:boolean|undefined,
 /** The couple's wording is longer; the buttons wrap it. */ couple?:boolean|undefined}){
 return <div className={'rsvp'+(value?' has':'')+(couple?' us':'')} role="radiogroup" aria-label={label}>
  {options.map(([v,l,I,tone])=><button key={v} type="button" className={'r-'+tone+(value===v?' on':'')} role="radio" aria-checked={value===v} onClick={()=>onChange(v)} disabled={disabled}><I/><span>{l}</span></button>)}
 </div>;
}

/** Something closed to the viewer: blurred placeholder lines under glass, a lock, why, and what can be done. */
export function Veil({title,text,lock=true,action,error,tall,toggles}:{title:ReactNode,text?:ReactNode,lock?:boolean|undefined,action?:ReactNode,error?:ReactNode,
 /** Reserve more height (a whole tab behind the veil). */ tall?:boolean|undefined,/** Show three fake toggles under the lines (a private layer). */ toggles?:boolean|undefined}){
 return <div className={'veil'+(tall?' k-veil-tall':'')}>
  <div className="veil-content" aria-hidden="true"><div className="bar-sk k-w70"/><div className="bar-sk"/><div className="bar-sk k-w50"/>{toggles?<div className="vt"><i/><i/><i/></div>:<div className="bar-sk"/>}</div>
  <div className="veil-glass">{lock&&<div className="lockdot"><Lock/></div>}<b>{title}</b>{text&&<p>{text}</p>}{action&&<div className="veil-act">{action}</div>}{error&&<p className="note" role="alert">{error}</p>}</div>
 </div>;
}

/* ---------------- Interests ---------------- */

/** The interest answer: 1–10 (the cells up to the answer fill), the words at both ends, and two marks instead of a
 * number — «обсудить» and «граница» (a boundary is never a low number). */
export function AnswerScale<M extends string>({value,onChange,label,low,high,marks}:{value:number|M|null|undefined,onChange:(v:number|M)=>void,label:string,low:string,high:string,
 marks:readonly {id:M,label:string,icon:LucideIcon,taboo?:boolean|undefined}[]}){
 const n=typeof value==='number'?value:null;
 return <>
  <div className="ans-scale" role="radiogroup" aria-label={label}>
   {[1,2,3,4,5,6,7,8,9,10].map(k=><button key={k} type="button" className={[n&&k<=n?'fill':'',n===k?'on':''].filter(Boolean).join(' ')} role="radio" aria-checked={n===k} onClick={()=>onChange(k)}>{k}</button>)}
  </div>
  <div className="ans-l"><span>{low}</span><span>{high}</span></div>
  <div className="ans-marks">{marks.map(m=><button key={m.id} type="button" className={'ans-m'+(m.taboo?' taboo':'')+(value===m.id?' on':'')} aria-pressed={value===m.id} onClick={()=>onChange(m.id)}><m.icon/><span>{m.label}</span></button>)}</div>
 </>;
}

/* ---------------- Create ---------------- */

/** The cover colour: round-cornered swatches (the plates); the chosen one has a ring. `none` = a photo is chosen. */
export function Swatches<K extends string>({value,options,onChange,label}:{value:K|null,options:readonly (readonly [K,string,CSSProperties])[],onChange:(k:K)=>void,label:string}){
 return <div className="chips" role="group" aria-label={label}>{options.map(([k,l,st])=><button key={k} type="button" className={'k-plate-sw'+(value===k?' on':'')} aria-label={l} aria-pressed={value===k} onClick={()=>onChange(k)}>
  <div className="plate" style={st}/></button>)}</div>;
}

/* ---------------- People ---------------- */

/** A person line for cards: avatar, the name (with badges) in 16, a quiet line under it; tapping opens the profile. */
export function PersonLine({av,name,sub,onOpen,label,small}:{av:ReactNode,name:ReactNode,sub?:ReactNode,onOpen?:(()=>void)|undefined,label?:string|undefined,small?:boolean|undefined}){
 const nm=<b className={small?undefined:'k-pl-name'}>{name}</b>;
 if(!onOpen)return <div className="row"><span className="rq-av">{av}</span><div className="grow">{nm}{sub&&<Note as="div">{sub}</Note>}</div></div>;
 return <div className="row"><button type="button" className="rq-av" aria-label={label} onClick={onOpen}>{av}</button>
  <button type="button" className="grow k-pl-go" onClick={onOpen}>{nm}{sub&&<Note as="div">{sub}</Note>}</button></div>;
}

/** A request to answer (access, a link, a couple invite, an event application): who asks, details, the answers. */
export function RequestCard({person,children,actions,className}:{person:ReactNode,children?:ReactNode,actions?:ReactNode,className?:string|undefined}){
 return <Card className={'rqcard'+(className?' '+className:'')}>{person}{children}{actions&&<div className="row g8 mt12">{actions}</div>}</Card>;
}

/** One question of an application and the answer under it. */
export function Answer({q,children}:{q?:ReactNode,children:ReactNode}){
 return <div className="application-answer">{q&&<Note>{q}</Note>}<div className="k-answer">{children}</div></div>;
}

/** «Лайкнули вас» tile: the photo (or plate) opens the profile; ✕ and ♥ are the screen's buttons in `children`. */
export function LikeTile({src,seed,name,label,onOpen,children}:{src?:string|null,seed:string,name:ReactNode,label:string,onOpen:()=>void,children?:ReactNode}){
 return <div className="lk"><button type="button" className="k-lk-open" aria-label={label} onClick={onOpen}>{src?<img src={src} alt="" draggable={false}/>:<div className="plate" style={plate(seed)}/>}</button>
  <span className="inf">{name}</span>{children}</div>;
}

/** «Никого рядом»: the radar with the viewer in the middle and two quiet dots. */
export function Radar({src,seed}:{src?:string|null|undefined,seed:string}){
 return <div className="radar"><i/><i/><i/>
  <span className="me">{src?<img className="k-cover" src={src} alt=""/>:<div className="plate" style={plate(seed)}/>}</span>
  <span className="dot k-radar-d1"><div className="plate" style={plate('sea')}/></span>
  <span className="dot k-radar-d2"><div className="plate" style={plate('amber')}/></span>
 </div>;
}

/* ---------------- Photos ---------------- */

/** What to show in the selfie (a gesture): icon, label, value; without `value` the value blinks while it loads. */
export function Pose({icon:I,label,value,className}:{icon:LucideIcon,label:ReactNode,value?:ReactNode,className?:string|undefined}){
 return <div className={'pv-pose'+(className?' '+className:'')}><span className="ico v" aria-hidden="true"><I/></span><span><small>{label}</small>
  {value!==undefined?<b>{value}</b>:<b aria-busy="true"><i className="sk sk-l w70 k-sk-line"/></b>}</span></div>;
}

/** The profile photo slots: the first big, the others in a grid; `priv` is the plain grid of private media.
 * `loading` draws the placeholder of the same shape. */
export function PhotoSlots({children,priv,loading}:{children?:ReactNode,priv?:boolean|undefined,loading?:boolean|undefined}){
 if(loading)return <div className="ph-slots" aria-busy="true"><i className="sk mi big k-sk-block k-ar-auto"/><i className="sk ph-add k-sk-block"/></div>;
 return <div className={'ph-slots'+(priv?' priv':'')}>{children}</div>;
}
/** One photo in PhotoSlots: picture (the small thumb paints first), «Главное», «На проверке», a tap opens it,
 * press-and-drag reorders (the screen passes onPointerDown). */
export function PhotoSlot({id,src,thumb,big,main,review,dragging,waiting,openLabel,onOpen,onPointerDown}:{id:string,src?:string|null|undefined,thumb?:string|null|undefined,big?:boolean|undefined,
 main?:ReactNode,review?:ReactNode,dragging?:boolean|undefined,/** No served copy yet: it blinks. */ waiting?:boolean|undefined,openLabel:string,onOpen:()=>void,onPointerDown?:((e:React.PointerEvent<HTMLDivElement>)=>void)|undefined}){
 return <div data-id={id} className={'mi'+(big?' big':'')+(dragging?' mi-ph':'')+(waiting?' nosrc':'')+(thumb?' has-thumb':'')} onPointerDown={onPointerDown}
  style={thumb?{'--thumb':`url("${thumb}")`} as CSSProperties:undefined}>
  {src&&<img src={src} alt="" draggable={false}/>}
  {main&&<span className="mainph">{main}</span>}
  {review&&<span className="ph-rev"><Clock/><span>{review}</span></span>}
  <button type="button" className="vw" aria-label={openLabel} onClick={onOpen}/>
 </div>;
}
/** The «+» slot (with an optional line) and the empty ghost slots after it. */
export function PhotoAdd({label,hint,big,tall,ghost,disabled,busy,onClick}:{label?:string|undefined,hint?:ReactNode,big?:boolean|undefined,tall?:boolean|undefined,ghost?:boolean|undefined,disabled?:boolean|undefined,busy?:boolean|undefined,onClick?:(()=>void)|undefined}){
 if(ghost)return <span className="ph-add ghost" aria-hidden="true"/>;
 return <button type="button" className={'ph-add'+(big?' big':'')+(tall?' tall':'')} disabled={disabled} aria-busy={busy||undefined} onClick={onClick} aria-label={label}><Plus/>{hint&&<small>{hint}</small>}</button>;
}

/** The full-screen photo strip: the current picture slides in (index in a CSS variable). */
export function PhotoTrack({srcs,index}:{srcs:string[],index:number}){
 return <div className="vw-track" style={{'--i':index} as CSSProperties}>{srcs.map((s,k)=><figure key={k}><img src={s} alt="" draggable={false}/></figure>)}</div>;
}

/* ---------------- Gallery ---------------- */

/** The row of album cards: scrolls sideways (gallery screen) or wraps four to a line (`wrap`, «Я»). */
export function AlbumRow({children,wrap,label}:{children:ReactNode,wrap?:boolean|undefined,label?:string|undefined}){
 return <div className={'alb-row'+(wrap?' alb20':'')} role="group" aria-label={label}>{children}</div>;
}
/** One album card: cover (one picture, a mosaic of up to four, or an icon), the name, the count; `on` is the open
 * album; `locked` marks an album only followers see. */
export function AlbumCard({title,count,cover,mosaic,icon:I,on,locked,label,onClick}:{title:ReactNode,count?:ReactNode,cover?:string|null|undefined,
 mosaic?:string[]|undefined,icon?:LucideIcon|undefined,on?:boolean|undefined,/** Who sees it, for the lock mark. */ locked?:string|undefined,label?:string|undefined,onClick:()=>void}){
 const pics=(mosaic??[]).slice(0,4);const Icon=I??ImageIcon;
 return <button type="button" className={'alb'+(on?' on':'')} aria-pressed={on===undefined?undefined:on} aria-label={label} onClick={onClick}>
  {pics.length>1?<span className={'alb-c mos4 n'+pics.length}>{pics.map((s,k)=><img key={k} src={s} alt="" loading="lazy"/>)}</span>
   :<span className="alb-c">{cover||pics[0]?<img src={(cover||pics[0])!} alt="" loading="lazy"/>:<Icon/>}{locked&&<i className="alb-l" title={locked}><Users/></i>}</span>}
  <b>{title}</b><small>{count}</small>
 </button>;
}
/** The line under the album row naming the open album: name, who sees it, the order. */
export function AlbumMeta({title,followers,order}:{title:ReactNode,followers?:ReactNode,order?:ReactNode}){
 return <p className="alb-meta"><b>{title}</b>{followers&&<> · <Users/>{followers}</>}{order&&<> · {order}</>}</p>;
}
/** The gallery grid: three square tiles to a line. */
export function GalleryGrid({children,label}:{children:ReactNode,label?:string|undefined}){
 return <div className="ggrid" role="group" aria-label={label}>{children}</div>;
}
/** One gallery tile (a post): its first photo, «N фото», «только подписчики», «на проверке». In selection mode
 * (`selected` true/false) a tap picks it and a round check shows; `picked` frames the chosen one (a cover). */
export function GalleryTile({src,label,count,followers,review,selected,picked,onClick}:{src?:string|null|undefined,label:string,count?:number|undefined,
 followers?:string|undefined,review?:string|undefined,selected?:boolean|undefined,picked?:boolean|undefined,onClick:()=>void}){
 const sel=selected!==undefined;
 return <button type="button" className={'gtile'+(sel?' sel-tile'+(selected?' on':''):'')+(picked?' pick':'')} aria-label={label}
  aria-pressed={sel?selected:picked===undefined?undefined:picked} onClick={onClick}>
  {src&&<img src={src} alt="" loading="lazy" draggable={false}/>}
  {sel?<span className="sel-ck">{selected&&<Check/>}</span>:picked?<span className="gt-k"><Check/></span>:count&&count>1?<span className="gt-n"><ImageIcon/>{count}</span>:null}
  {followers&&<span className="gt-a" title={followers}><Users/></span>}
  {review&&!sel&&<span className="gt-w" title={review}><Clock/></span>}
 </button>;
}
/** The dashed «+ Добавить» tile at the start of an own gallery. */
export function GalleryAdd({label,onClick}:{label:string,onClick:()=>void}){
 return <button type="button" className="gtile add" onClick={onClick}><Plus/><small>{label}</small></button>;
}
/** The selection bar pinned under a gallery in selection mode: how many are picked (or the hint) and the actions. */
export function SelectionBar({status,actions}:{status:ReactNode,actions:{icon:LucideIcon,label:string,onClick:()=>void,danger?:boolean,disabled?:boolean}[]}){
 return <div className="ctabar"><div className="wrap"><p className="sel-count" aria-live="polite">{status}</p>
  <div className="sel-bar">{actions.map(a=><Btn key={a.label} kind="soft" className={a.danger?'danger':undefined} disabled={a.disabled} onClick={a.onClick}><a.icon/>{a.label}</Btn>)}</div>
 </div></div>;
}

/* ---------------- Private layer ---------------- */

/** The head of the private layer: lock, title, and the switch that opens or closes it. */
export function VaultHead({title,on,onToggle,label,inCard}:{title:ReactNode,on?:boolean|undefined,onToggle?:(()=>void)|undefined,label?:string|undefined,/** Inside a summary card: tighter. */ inCard?:boolean|undefined}){
 return <span className={'vault-h'+(inCard?' k-vault-in':'')}><span className="vi"><Lock/></span>{onToggle?<div><b>{title}</b></div>:<b>{title}</b>}
  {onToggle&&<Switch className="vsw" on={!!on} label={label??''} onChange={onToggle}/>}</span>;
}

/* ---------------- Staff review ---------------- */

/** A staff review card: the title, when, and the decision controls; `danger` marks a report about a minor. */
export function ReviewCard({title,meta,children,danger}:{title:ReactNode,meta?:ReactNode,children:ReactNode,danger?:boolean|undefined}){
 return <Card className={'st-card'+(danger?' st-danger':'')}>
  <header className="st-head"><b>{title}</b>{meta&&<span className="st-meta">{meta}</span>}</header>
  {children}
 </Card>;
}
/** Label → value pairs of a review card (empty values are left out). */
export function KeyValues({rows}:{rows:[string,ReactNode][]}){
 const shown=rows.filter(([,v])=>v!==null&&v!==undefined&&v!=='');
 if(!shown.length)return null;
 return <dl className="kv st-kv">{shown.map(([k,v])=><div key={k} className="st-kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
/** The picture under review: the media, a blurred preview, or a placeholder icon; `caption` under it (side by side in ReviewPair). */
export function ReviewMedia({children,blur,icon:I,caption}:{children?:ReactNode,blur?:string|null|undefined,icon?:LucideIcon|undefined,caption?:ReactNode}){
 const box=<div className="st-media">{children??(blur?<img className="st-blur" src={blur} alt="" draggable={false}/>:I?<div className="st-ph"><I/></div>:null)}</div>;
 return caption!==undefined?<figure>{box}<figcaption>{caption}</figcaption></figure>:box;
}
/** Two or more pictures side by side (a selfie and the profile photos). */
export function ReviewPair({children}:{children:ReactNode}){return <div className="st-pair st-block">{children}</div>;}
