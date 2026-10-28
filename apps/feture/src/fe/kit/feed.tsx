import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bold,ChartColumn,ChevronDown,Ellipsis,Image as ImageIcon,Italic,Link as LinkIcon,List,Pencil,Quote,Sparkles,Video,type LucideIcon} from 'lucide-react';
import {fmtDur} from './media';
import {Av,Btn,Field,IconBtn,Input,Sheet,Text} from './index';

/* ---------------- Text formatting (V21 rte) ---------------- */

type Sel={start:number,end:number};
/** What a toolbar button does to the text: Markdown that RichText shows (bold, italic, list, quote, link). */
export function formatText(value:string,sel:Sel,kind:'bold'|'italic'|'list'|'quote'):{value:string,sel:Sel}{
 const {start,end}=sel;
 if(kind==='bold'||kind==='italic'){
  const mark=kind==='bold'?'**':'*';const inner=value.slice(start,end)||'';
  // Already wrapped: unwrap (the button toggles).
  if(value.slice(start-mark.length,start)===mark&&value.slice(end,end+mark.length)===mark&&(kind==='bold'||value.slice(start-2,start)!=='**'))
   return {value:value.slice(0,start-mark.length)+inner+value.slice(end+mark.length),sel:{start:start-mark.length,end:end-mark.length}};
  return {value:value.slice(0,start)+mark+inner+mark+value.slice(end),sel:{start:start+mark.length,end:end+mark.length}};
 }
 // Lines: every line the selection touches gets (or loses) the prefix.
 const prefix=kind==='list'?'- ':'> ';
 const a=value.lastIndexOf('\n',start-1)+1;const bEnd=value.indexOf('\n',end);const b=bEnd<0?value.length:bEnd;
 const lines=value.slice(a,b).split('\n');const all=lines.every(l=>l.startsWith(prefix));
 const out=lines.map(l=>all?l.slice(prefix.length):prefix+l).join('\n');
 const next=value.slice(0,a)+out+value.slice(b);
 return {value:next,sel:{start:a,end:a+out.length}};
}
/** A link a post may carry: http(s) with a real host (the same rule RichText follows when it shows one). */
export function linkOk(url:string){
 if(!/^https?:\/\/[^\s()<>"']{1,400}$/i.test(url))return false;
 try{const u=new URL(url);return /\.[a-z]{2,}$/i.test(u.hostname)||u.hostname==='localhost';}catch{return false;}
}

export type RichAreaHandle={focus:()=>void,el:HTMLTextAreaElement|null};
type AreaProps=Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>,'className'|'value'|'onChange'>&{invalid?:boolean};
/** `.rte` — a text field with the formatting bar (bold, italic, list, quote, link with an address check). The text is
 * Markdown, as RichText shows it; the bar only writes the marks. Every multi-line text that may be formatted (a post,
 * an article, a discussion) uses this instead of a bare TextArea. `onValue` gets the new text. */
export const RichArea=forwardRef<RichAreaHandle,AreaProps&{value:string,onValue:(v:string,el:HTMLTextAreaElement)=>void,
 /** Extra buttons at the end of the bar (mention…). */ extra?:ReactNode}>(function RichArea({value,onValue,invalid,extra,...rest},ref){
 const {t}=useI18n();const area=useRef<HTMLTextAreaElement>(null);const [link,setLink]=useState<{sel:Sel,text:string}|null>(null);
 useImperativeHandle(ref,()=>({focus:()=>area.current?.focus(),get el(){return area.current;}}),[]);
 const put=(next:string,sel:Sel)=>{const el=area.current;if(!el)return;onValue(next,el);
  requestAnimationFrame(()=>{el.focus();el.setSelectionRange(sel.start,sel.end);});};
 const apply=(kind:'bold'|'italic'|'list'|'quote')=>{const el=area.current;if(!el)return;const r=formatText(value,{start:el.selectionStart,end:el.selectionEnd},kind);put(r.value,r.sel);};
 const B=(icon:LucideIcon,label:string,fn:()=>void)=><button type="button" aria-label={label} title={label} onMouseDown={e=>e.preventDefault()} onClick={fn}>{React.createElement(icon)}</button>;
 return <div className="rte used">
  <div className="rte-box">
   <div className="rte-tb" role="toolbar" aria-label={t('fe.kit.fmt.bar')}>
    {B(Bold,t('fe.kit.fmt.bold'),()=>apply('bold'))}{B(Italic,t('fe.kit.fmt.italic'),()=>apply('italic'))}<i/>
    {B(List,t('fe.kit.fmt.list'),()=>apply('list'))}{B(Quote,t('fe.kit.fmt.quote'),()=>apply('quote'))}
    {B(LinkIcon,t('fe.kit.fmt.link'),()=>{const el=area.current;if(!el)return;const sel={start:el.selectionStart,end:el.selectionEnd};setLink({sel,text:value.slice(sel.start,sel.end)});})}
    {extra}
   </div>
   <textarea ref={area} className="inp rte-ed" aria-invalid={invalid||undefined} value={value} onChange={e=>onValue(e.target.value,e.target)} {...rest}/>
  </div>
  {link&&<LinkSheet text={link.text} onClose={()=>setLink(null)} onDone={(text,url)=>{const s=link.sel;const md=`[${text.replace(/[[\]\n]/g,' ').trim()}](${url})`;
   setLink(null);put(value.slice(0,s.start)+md+value.slice(s.end),{start:s.start+md.length,end:s.start+md.length});}}/>}
 </div>;
});

/** «Ссылка» of the formatting bar: the words and the address; a wrong address says so under the field. */
function LinkSheet({text,onClose,onDone}:{text:string,onClose:()=>void,onDone:(text:string,url:string)=>void}){
 const {t}=useI18n();const [words,setWords]=useState(text);const [url,setUrl]=useState('https://');const [err,setErr]=useState('');
 const ok=()=>{const u=url.trim();if(!linkOk(u)){setErr(t('fe.kit.fmt.badUrl'));return;}onDone(words.trim()||new URL(u).hostname,u);};
 return <Sheet title={t('fe.kit.fmt.linkTitle')} onClose={onClose} foot={<Btn onClick={ok}>{t('fe.kit.fmt.insert')}</Btn>}>
  <Field id="k-lnk-t" label={t('fe.kit.fmt.linkText')}><Input id="k-lnk-t" value={words} maxLength={120} onChange={e=>setWords(e.target.value)}/></Field>
  <Field id="k-lnk-u" label={t('fe.kit.fmt.linkUrl')} error={err||undefined} hint={t('fe.kit.fmt.linkHint')}><Input id="k-lnk-u" type="url" invalid={!!err} value={url} maxLength={400}
   onChange={e=>{setUrl(e.target.value);setErr('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();ok();}}}/></Field>
 </Sheet>;
}

/* ---------------- Likes and activity ---------------- */

/** «Нравится: Mia, Alex и ещё 3» under a post — opens the list of who liked it. */
export function LikesLine({people,text,onClick}:{people:{id:string,name:string,avatar?:string|null|undefined}[],text:ReactNode,onClick:()=>void}){
 return <button type="button" className="likes-line" onClick={onClick}><span className="av-stack">{people.slice(0,3).map(p=><Av key={p.id} name={p.name} seed={p.id} src={p.avatar} size="xs"/>)}</span><span>{text}</span></button>;
}

/** What an activity thumbnail shows (V21 likeThumb): a liked post — its first picture (or video poster) with the media
 * capsule and poll / interests marks, otherwise a poll, interests or text tile; a person — their face; an event or a
 * community — its cover (or `icon`). */
export type ActThumb={src?:string|null|undefined,video?:boolean|undefined,photos?:number|undefined,videos?:number|undefined,
 durationMs?:number|null|undefined,poll?:boolean|undefined,interests?:boolean|undefined,text?:string|undefined,
 person?:{id:string,name:string,avatar?:string|null|undefined}|undefined,icon?:LucideIcon|undefined};

/** The media capsule (▣ 3 · 🎥 0:06 · ▣ 3 🎥 1), as in the feed. */
function MediaMark({photos=0,videos=0,durationMs}:{photos?:number|undefined,videos?:number|undefined,durationMs?:number|null|undefined}){
 const a:ReactNode[]=[];
 if(photos&&(photos>1||videos))a.push(<b key="p"><ImageIcon/>{photos}</b>);
 if(videos)a.push(<b key="v"><Video/>{videos>1||photos?videos:fmtDur(durationMs)}</b>);
 return a.length?<span className="actc-n" aria-hidden="true">{a}</span>:null;
}
/** Class and inside of a thumbnail: `row` is the small square of a list row (`.actth`), otherwise a strip tile (`.actc-th`). */
function thumbParts(x:ActThumb,row:boolean,t:(k:string)=>string):{cls:string,body:ReactNode}{
 if(x.person)return {cls:'round',body:<Av name={x.person.name} seed={x.person.id} src={x.person.avatar}/>};
 const media=(x.photos??0)+(x.videos??0);
 if(x.src||x.video||media){
  const marks=!row&&(x.poll||x.interests)?<span className="actc-xs" aria-hidden="true">{x.poll&&<i><ChartColumn/></i>}{x.interests&&<i><Sparkles/></i>}</span>:null;
  return {cls:media>1?'multi':'',body:<>{x.src?<img src={x.src} alt="" loading="lazy" draggable={false}/>:<span className="actc-vid"><Video/></span>}
   <MediaMark photos={x.photos} videos={x.videos} durationMs={x.durationMs}/>{marks}</>};
 }
 if(x.icon)return {cls:row?'ic':'kind',body:React.createElement(x.icon)};
 if(x.poll)return {cls:row?'ic':'kind',body:<><ChartColumn/>{!row&&<small>{t('fe.kit.act.poll')}</small>}</>};
 if(x.interests)return {cls:row?'ic':'kind',body:<><Sparkles/>{!row&&<small>{t('fe.kit.act.interests')}</small>}</>};
 return row?{cls:'ic',body:<Pencil/>}:{cls:'txt',body:<span>{(x.text??'').slice(0,40)}</span>};
}
/** One tile of an activity strip: a tap opens the thing (`label` names it for screen readers). */
export function ActivityTile({thumb,label,onClick}:{thumb:ActThumb,label:string,onClick:()=>void}){
 const {t}=useI18n();const {cls,body}=thumbParts(thumb,false,t);
 return <button type="button" className={'actc-th '+cls} aria-label={label} title={label} onClick={onClick}>{body}</button>;
}

/** The strip: tiles scroll sideways under a fixed «+N» on the right (N = tiles not fully seen plus `rest` not loaded);
 * fades show on the side that has more. «+N» (or ⌄ at the end) opens the whole list. */
function ActStrip({tiles,rest,onOpen,label}:{tiles:ReactNode[],rest:number,onOpen:()=>void,label:string}){
 const ref=useRef<HTMLDivElement>(null);const [fit,setFit]=useState({over:false,hid:0,l:false,r:false});
 const measure=useCallback(()=>{const s=ref.current;if(!s)return;const over=s.scrollWidth>s.clientWidth+1;const edge=s.scrollLeft+s.clientWidth+1;
  const hid=over?[...s.children].filter(c=>{const e=c as HTMLElement;return e.offsetLeft+e.offsetWidth>edge;}).length:0;
  setFit(f=>{const n={over,hid,l:over&&s.scrollLeft>2,r:over&&s.scrollLeft+s.clientWidth<s.scrollWidth-2};return f.over===n.over&&f.hid===n.hid&&f.l===n.l&&f.r===n.r?f:n;});},[]);
 useEffect(()=>{measure();const s=ref.current;if(!s||typeof ResizeObserver!=='function')return;const o=new ResizeObserver(measure);o.observe(s);return ()=>o.disconnect();},[measure,tiles.length]);
 const n=fit.hid+rest;const show=fit.over||rest>0;
 return <div className="actc-row">
  <div ref={ref} className={'actc-strip'+(fit.l?' fl':'')+(fit.r?' fr':'')} onScroll={measure}>{tiles}</div>
  {show&&<button type="button" className="actc-more" aria-label={label} aria-expanded={false} onClick={onOpen}>{n?`+${n}`:<ChevronDown/>}</button>}
 </div>;
}

/** One «Подписки» activity card (V21 actCard): who, what (one line, the time under it), ⋯, and the things it is about.
 * With `tiles` (liked posts, people followed) the things are a sideways strip; «+N» opens them as a list (`items`)
 * with «Свернуть». Without tiles `items` show `fold` rows and «Ещё N». `total` — how many there are in all (the
 * server sends up to 20); those not sent are named at the end of the open list (`restText`). */
export function ActivityCard({actor,text,time,menuLabel,onMenu,onActor,items,tiles,total,fold=2,more,less,restText}:{actor:{id:string,name:string,avatar?:string|null|undefined},text:ReactNode,time:ReactNode,
 menuLabel:string,onMenu:()=>void,onActor?:()=>void,items:ReactNode[],tiles?:ReactNode[]|undefined,total?:number|undefined,fold?:number,
 /** «Показать все» (strip) / «Ещё N» (rows). */ more:string,less:string,/** «И ещё N — в профиле». */ restText?:ReactNode}){
 const [open,setOpen]=useState(false);const all=Math.max(total??items.length,items.length);const rest=all-items.length;
 const av=<Av name={actor.name} seed={actor.id} src={actor.avatar} size="sm"/>;
 let body:ReactNode=null;
 if(open)body=<div className="actc-list">{items}{rest>0&&restText&&<Text size="sm" tone="mute">{restText}</Text>}
  <Btn kind="text" auto aria-expanded onClick={()=>setOpen(false)}>{less}</Btn></div>;
 else if(tiles?.length)body=<ActStrip tiles={tiles} rest={rest} label={more} onOpen={()=>setOpen(true)}/>;
 else if(items.length)body=<div className="actc-list">{items.slice(0,fold)}
  {all>fold&&<Btn kind="text" auto aria-expanded={false} onClick={()=>setOpen(true)}>{more}</Btn>}</div>;
 return <article className="actc">
  <span className="actc-av">{onActor?<button type="button" className="plink" aria-label={actor.name} onClick={onActor}>{av}</button>:av}</span>
  <div className="actc-b">
   <div className="actc-hd"><p className="actc-t">{text}<small>{time}</small></p><IconBtn icon={Ellipsis} kind="ghost" size="sm" label={menuLabel} aria-haspopup="dialog" onClick={onMenu}/></div>
   {body}
  </div>
 </article>;
}
/** A thing inside an activity card (a post, an event, a community, a person): its thumbnail (`thumb`, or `av` / `icon`),
 * title and a line under it. */
export function ActivityItem({icon:I,av,thumb,title,sub,onClick}:{icon?:LucideIcon,av?:ReactNode,thumb?:ActThumb|undefined,title:ReactNode,sub?:ReactNode,onClick:()=>void}){
 const {t}=useI18n();const th=thumb?thumbParts(thumb,true,t):null;
 return <button type="button" className="actc-p" onClick={onClick}>{th?<span className={'actth '+th.cls}>{th.body}</span>:av??(I&&<span className="actth ic"><I/></span>)}
  <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span></button>;
}

/* ---------------- Create ---------------- */

/** «Или сразу начать с» under the create choices: dashed tiles that open the editor with a part already added. */
export function QuickStart({title,items}:{title:ReactNode,items:[LucideIcon,string,()=>void][]}){
 return <><p className="create-qt">{title}</p><div className="create-q">{items.map(([I,l,fn])=><button key={l} type="button" onClick={fn}><I/>{l}</button>)}</div></>;
}

/** «Скоро» in the feed (V21 feedEvLess): a few upcoming events as compact tiles (`EventTile row`), each with its own
 * «Скрыть». The block disappears with its last event. */
export function FeedEvents({title,items}:{title:ReactNode,items:{key:string,tile:ReactNode,hide:ReactNode,hideLabel:string,onHide:()=>void}[]}){
 if(!items.length)return null;
 return <section className="feed-ev k-fev-block"><small>{title}</small>
  {items.map(i=><div key={i.key} className="k-fev">{i.tile}<button type="button" className="linkbtn k-fev-hide" aria-label={i.hideLabel} onClick={i.onHide}>{i.hide}</button></div>)}
 </section>;
}

/** A quiet line with one action on the right (under an article: «Только статьи — без остальных публикаций · Следить»). */
export function ActionLine({text,children}:{text:ReactNode,children:ReactNode}){
 return <div className="note-sub"><span>{text}</span>{children}</div>;
}
