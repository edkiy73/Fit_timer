import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bold,ChartColumn,ChevronDown,ChevronRight,Ellipsis,FileText,Heading,Image as ImageIcon,ImagePlus,Italic,Link as LinkIcon,List,ListOrdered,Pencil,Quote,Sparkles,Strikethrough,Video,type LucideIcon} from 'lucide-react';
import {fmtDur} from './media';
import {Av,Btn,Field,H,IconBtn,Input,Sheet,Text} from './index';
import {domToMd,imageBlock,linkOk,mdToDom} from './rich-md';

export {linkOk,BAD_CHARS,hasLongWord,mdImages} from './rich-md';

/* ---------------- Text editor (V21 rteField: formatting shows while typing) ---------------- */

export type RichEditorHandle={
 focus:()=>void,
 /** Types text where the caret was last (a mention picked in a sheet). */ insertText:(text:string)=>void,
 /** Puts a picture block of the post's own media after the caret's block (articles). */ insertImage:(id:string,src:string)=>void,
 /** «@na» right before the caret, for the mention suggestions; null when the caret is not right after one. */ mention:()=>{q:string}|null,
 /** Replaces that «@na» with the picked text. */ replaceMention:(text:string)=>void,
};
type Cmd='bold'|'italic'|'strikeThrough'|'h4'|'insertUnorderedList'|'insertOrderedList'|'blockquote';
const AUTO:[RegExp,Cmd][]=[[/^[-*]$/,'insertUnorderedList'],[/^1[.)]$/,'insertOrderedList'],[/^>$/,'blockquote']];
const exec=(c:string,v?:string)=>{try{return document.execCommand(c,false,v);}catch{return false;}};
const block=()=>{try{return String(document.queryCommandValue('formatBlock')||'').toLowerCase();}catch{return '';}};

/** `.rte` — the text editor of posts, articles and discussions (V21 rteField). Formatting shows while typing: bold,
 * italic, strikethrough, link (the address is checked), lists, quote, headings in articles and pictures of the post's own
 * media in articles. The value in and out is the safe Markdown RichText shows; the editor never stores HTML, pastes
 * plain text only and keeps links to http(s) with a real domain. «- », «1. » and «> » at a line start make a list or a
 * quote (Backspace right after gives the marks back). */
export const RichEditor=forwardRef<RichEditorHandle,{value:string,onValue:(md:string)=>void,label:string,placeholder?:string|undefined,invalid?:boolean,
 /** Articles: the heading button. */ headings?:boolean,
 /** Articles: pictures in the text. `src` gives the address of an own media id; `onAdd` opens the picker (the caller then calls `insertImage`). */
 images?:{src:(id:string)=>string|null|undefined,onAdd:()=>void,disabled?:boolean}|undefined,
 /** Extra buttons at the end of the bar (mention…). */ extra?:ReactNode,
 /** The caret moved or the text changed (mention suggestions). */ onCaret?:(()=>void)|undefined,onBlur?:(()=>void)|undefined,autoFocus?:boolean,
 /** A taller field (articles). */ long?:boolean,id?:string}>(
 function RichEditor({value,onValue,label,placeholder,invalid,headings,images,extra,onCaret,onBlur,autoFocus,long,id},ref){
 const {t}=useI18n();const ed=useRef<HTMLDivElement>(null);const last=useRef<string|null>(null);const at=useRef<Range|null>(null);
 const auto=useRef<{cmd:Cmd,text:string}|null>(null);const [state,setState]=useState<Record<string,boolean>>({});const [empty,setEmpty]=useState(!value);
 const [link,setLink]=useState<{range:Range|null,text:string}|null>(null);
 const srcRef=useRef(images?.src);srcRef.current=images?.src;
 const cb=useRef({onValue,onCaret});cb.current={onValue,onCaret};
 const rmLabel=t('fe.kit.fmt.photoRm');
 // Text from outside (the first render, a reset, a loaded draft) is drawn again; the editor's own edits are not.
 useLayoutEffect(()=>{const el=ed.current;if(!el||value===last.current)return;mdToDom(el,value,{src:x=>srcRef.current?.(x),removeLabel:rmLabel});last.current=value;setEmpty(!value.trim());},[value,rmLabel]);
 useEffect(()=>{if(autoFocus)ed.current?.focus();},[autoFocus]);
 const inside=(n:Node|null|undefined)=>!!n&&!!ed.current&&ed.current.contains(n);
 const sync=useCallback(()=>{const el=ed.current;if(!el)return;const md=domToMd(el);last.current=md;setEmpty(!el.textContent?.trim()&&!el.querySelector('li,figure'));
  cb.current.onValue(md);cb.current.onCaret?.();},[]);
 // The bar's state and the last caret, so a sheet (link, mention, photo picker) comes back to it.
 useEffect(()=>{const f=()=>{const s=getSelection();if(!s?.rangeCount||!inside(s.anchorNode))return;at.current=s.getRangeAt(0).cloneRange();
  const q=(c:string)=>{try{return document.queryCommandState(c);}catch{return false;}};const blk=block();
  setState({bold:q('bold'),italic:q('italic'),strikeThrough:q('strikeThrough'),insertUnorderedList:q('insertUnorderedList'),insertOrderedList:q('insertOrderedList'),h4:blk==='h4',blockquote:blk==='blockquote'});};
  document.addEventListener('selectionchange',f);return ()=>document.removeEventListener('selectionchange',f);},[]);
 const restore=()=>{const el=ed.current;if(!el)return;el.focus();const s=getSelection();const r=at.current;
  if(r&&inside(r.startContainer)){s?.removeAllRanges();s?.addRange(r);}else{s?.selectAllChildren(el);s?.collapseToEnd();}};
 const apply=(c:Cmd)=>{if(document.activeElement!==ed.current)restore();
  if(c==='h4'||c==='blockquote')exec('formatBlock',block()===c?'p':c);else exec(c);sync();};
 useImperativeHandle(ref,()=>({
  focus:()=>restore(),
  insertText:text=>{restore();if(!exec('insertText',text)){const s=getSelection();const r=s?.rangeCount?s.getRangeAt(0):null;if(r){r.deleteContents();r.insertNode(document.createTextNode(text));r.collapse(false);}}sync();},
  insertImage:(mid,src)=>{const el=ed.current;if(!el)return;const r=at.current&&inside(at.current.startContainer)?at.current:null;
   let blk:Node|null=r?r.startContainer:null;while(blk&&blk.parentNode!==el)blk=blk.parentNode;
   const fig=imageBlock(document,mid,src,rmLabel);
   if(blk)el.insertBefore(fig,blk.nextSibling);else el.appendChild(fig);
   // Room to go on typing under the picture.
   const nx=fig.nextSibling as HTMLElement|null;
   if(!nx||nx.tagName==='FIGURE'){const p=document.createElement('p');p.appendChild(document.createElement('br'));el.insertBefore(p,nx);}
   el.focus();const s=getSelection();const nr=document.createRange();nr.setStart(fig.nextSibling!,0);nr.collapse(true);s?.removeAllRanges();s?.addRange(nr);at.current=nr.cloneRange();sync();},
  mention:()=>{const s=getSelection();if(!s?.rangeCount||!s.isCollapsed)return null;const n=s.anchorNode;if(!n||n.nodeType!==3||!inside(n))return null;
   const m=(n.nodeValue??'').slice(0,s.anchorOffset).match(/(^|[\s( ])@([a-z0-9_.]{0,30})$/i);return m?{q:m[2]!.toLowerCase()}:null;},
  replaceMention:text=>{const s=getSelection();if(!s?.rangeCount)return;const n=s.anchorNode;if(!n||n.nodeType!==3||!inside(n))return;const off=s.anchorOffset;
   const m=(n.nodeValue??'').slice(0,off).match(/@([a-z0-9_.]{0,30})$/i);if(!m)return;const r=document.createRange();r.setStart(n,off-m[0].length);r.setEnd(n,off);s.removeAllRanges();s.addRange(r);
   if(!exec('insertText',text)){r.deleteContents();r.insertNode(document.createTextNode(text));}sync();},
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }),[sync,rmLabel]);
 const onInput=(e:React.FormEvent<HTMLDivElement>)=>{const ne=e.nativeEvent as InputEvent;
  if(ne.inputType==='insertText'&&ne.data===' '){const sel=getSelection();const n=sel?.anchorNode;
   if(sel?.isCollapsed&&n&&n.nodeType===3&&inside(n)&&!(n.previousSibling&&n.previousSibling.nodeName!=='BR')&&!n.parentElement?.closest('li,blockquote,h4')){
    const typed=(n.nodeValue??'').slice(0,sel.anchorOffset);const mk=typed.replace(/[\s ]$/,'');const rule=AUTO.find(([re])=>re.test(mk));
    if(rule&&typed!==mk){const r=document.createRange();r.setStart(n,0);r.setEnd(n,sel.anchorOffset);sel.removeAllRanges();sel.addRange(r);exec('delete');
     if(rule[1]==='blockquote')exec('formatBlock','blockquote');else exec(rule[1]);auto.current={cmd:rule[1],text:mk+' '};}}}
  sync();};
 const onKeyDown=(e:React.KeyboardEvent<HTMLDivElement>)=>{const a=auto.current;
  if(a&&e.key==='Backspace'){const n=getSelection()?.anchorNode;const blk=n&&(n.nodeType===1?n as Element:n.parentElement)?.closest('li,blockquote');
   if(blk&&!blk.textContent?.trim()){e.preventDefault();if(a.cmd==='blockquote')exec('formatBlock','p');else exec(a.cmd);exec('insertText',a.text);auto.current=null;sync();return;}}
  // Enter on an empty quote or heading line leaves it for a plain paragraph (lists do so by themselves).
  if(e.key==='Enter'&&!e.shiftKey){const n=getSelection()?.anchorNode;const blk=n&&(n.nodeType===1?n as Element:n.parentElement)?.closest('blockquote,h4');
   if(blk&&inside(blk)&&!blk.textContent?.trim()){e.preventDefault();exec('formatBlock','p');auto.current=null;sync();return;}}
  if(e.key.length===1||e.key==='Enter'||e.key==='Backspace')auto.current=null;
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&(e.key==='b'||e.key==='i')){e.preventDefault();apply(e.key==='b'?'bold':'italic');}};
 // Pasting keeps the words only; a dropped file or markup never lands in the text.
 const onPaste=(e:React.ClipboardEvent<HTMLDivElement>)=>{e.preventDefault();const s=e.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n');if(s){exec('insertText',s);sync();}};
 const onClick=(e:React.MouseEvent<HTMLDivElement>)=>{const rm=(e.target as Element).closest?.('[data-rm]');if(rm){e.preventDefault();rm.closest('figure')?.remove();sync();return;}onCaret?.();};
 const B=(icon:LucideIcon,label:string,fn:()=>void,on?:boolean,disabled?:boolean)=><button type="button" aria-label={label} title={label} aria-pressed={on===undefined?undefined:on}
  disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={fn}>{React.createElement(icon)}</button>;
 const openLink=()=>{const s=getSelection();const r=s?.rangeCount&&inside(s.anchorNode)?s.getRangeAt(0).cloneRange():at.current;setLink({range:r,text:r?.toString().trim()??''});};
 const putLink=(text:string,url:string)=>{const r=link?.range??null;const same=text===link?.text;setLink(null);const el=ed.current;if(!el)return;el.focus();const s=getSelection();
  if(r&&inside(r.startContainer)){s?.removeAllRanges();s?.addRange(r);}else restore();
  const cur=s?.rangeCount?s.getRangeAt(0):null;if(!cur)return;
  if(!cur.collapsed&&same&&cur.toString().trim())exec('createLink',url);
  else{cur.deleteContents();const a=document.createElement('a');a.setAttribute('href',url);a.textContent=text;cur.insertNode(a);const sp=document.createTextNode(' ');a.after(sp);
   const nr=document.createRange();nr.setStartAfter(sp);nr.collapse(true);s?.removeAllRanges();s?.addRange(nr);}
  sync();};
 return <div className={'rte used'+(long?' long':'')}>
  <div className="rte-box">
   <div className="rte-tb" role="toolbar" aria-label={t('fe.kit.fmt.bar')}>
    {B(Bold,t('fe.kit.fmt.bold'),()=>apply('bold'),!!state.bold)}{B(Italic,t('fe.kit.fmt.italic'),()=>apply('italic'),!!state.italic)}
    {B(Strikethrough,t('fe.kit.fmt.strike'),()=>apply('strikeThrough'),!!state.strikeThrough)}{B(LinkIcon,t('fe.kit.fmt.link'),openLink)}
    {headings&&B(Heading,t('fe.kit.fmt.heading'),()=>apply('h4'),!!state.h4)}<i/>
    {B(List,t('fe.kit.fmt.list'),()=>apply('insertUnorderedList'),!!state.insertUnorderedList)}{B(ListOrdered,t('fe.kit.fmt.olist'),()=>apply('insertOrderedList'),!!state.insertOrderedList)}
    {B(Quote,t('fe.kit.fmt.quote'),()=>apply('blockquote'),!!state.blockquote)}
    {images&&<><i/>{B(ImagePlus,t('fe.kit.fmt.photo'),()=>{const s=getSelection();if(s?.rangeCount&&inside(s.anchorNode))at.current=s.getRangeAt(0).cloneRange();images.onAdd();},undefined,images.disabled)}</>}
    {extra}
   </div>
   <div ref={ed} id={id} className={'inp rte-ed'+(empty?' is-empty':'')} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
    aria-invalid={invalid||undefined} data-ph={placeholder} onInput={onInput} onKeyDown={onKeyDown} onKeyUp={()=>onCaret?.()} onClick={onClick} onPaste={onPaste}
    onDrop={e=>e.preventDefault()} onFocus={()=>{exec('defaultParagraphSeparator','p');exec('styleWithCSS','false');}} onBlur={()=>onBlur?.()}/>
  </div>
  {link&&<LinkSheet text={link.text} onClose={()=>{setLink(null);restore();}} onDone={putLink}/>}
 </div>;
});

/** «Ссылка» of the formatting bar: the words and the address (a bare «example.com» gets https://); a wrong address
 * says so under the field. */
function LinkSheet({text,onClose,onDone}:{text:string,onClose:()=>void,onDone:(text:string,url:string)=>void}){
 const {t}=useI18n();const [words,setWords]=useState(text);const [url,setUrl]=useState('https://');const [err,setErr]=useState('');
 const ok=()=>{const raw=url.trim();const u=/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw.replace(/^\/+/,'');
  if(!linkOk(u)){setErr(t('fe.kit.fmt.badUrl'));return;}onDone(words.replace(/[[\]\n]/g,' ').trim()||new URL(u).hostname,u);};
 return <Sheet title={t('fe.kit.fmt.linkTitle')} onClose={onClose} foot={<Btn onClick={ok}>{t('fe.kit.fmt.insert')}</Btn>}>
  <Field id="k-lnk-t" label={t('fe.kit.fmt.linkText')}><Input id="k-lnk-t" value={words} maxLength={120} onChange={e=>setWords(e.target.value)}/></Field>
  <Field id="k-lnk-u" label={t('fe.kit.fmt.linkUrl')} error={err||undefined} hint={t('fe.kit.fmt.linkHint')}><Input id="k-lnk-u" type="url" inputMode="url" invalid={!!err} value={url} maxLength={400}
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

/** «Скоро» in the feed (V21 feedEvLess): a few upcoming events as compact tiles (`EventTile row`). Each tile has its own
 * ⋯ in the top-right corner (like a post or an activity card); `onMenu` opens the event's menu («Скрыть событие»…) in
 * a `Sheet`. The block disappears with its last event. */
export function FeedEvents({title,items}:{title:ReactNode,items:{key:string,tile:ReactNode,
 /** Names the event for screen readers: «Действия с событием «…»». */ menuLabel:string,onMenu:()=>void,
 /** This tile's menu is open. */ open?:boolean|undefined}[]}){
 if(!items.length)return null;
 return <section className="feed-ev k-fev-block"><small>{title}</small>
  {items.map(i=><div key={i.key} className="k-fev">{i.tile}<IconBtn icon={Ellipsis} kind="ghost" size="sm" className="k-fev-menu" label={i.menuLabel}
   aria-haspopup="dialog" aria-expanded={!!i.open} onClick={i.onMenu}/></div>)}
 </section>;
}

/** A quiet hint line with one action at its end, both in the hint's font (the action only in the accent colour), on
 * one line («Популярное»: «Топ недели по твоим интересам · Как подбираем»); a hint too long for the width is cut with «…». */
export function ActionLine({text,action,onAction}:{text:ReactNode,action:string,onAction:()=>void}){
 return <p className="act-line"><span>{text}</span><button type="button" onClick={onAction}>{action}</button></p>;
}

/* ---------------- Articles ---------------- */

/** An article: the cover (its first photo), the «Статья · N мин» line, the title, and in a list the first words and
 * «Читать». On the article's own screen (`full`) the text itself goes in `children` instead of the excerpt. */
export function ArticleCard({cover,kicker,title,excerpt,more,full,children}:{cover?:string|null|undefined,kicker:ReactNode,title:ReactNode,excerpt?:ReactNode,more?:ReactNode,full?:boolean,children?:ReactNode}){
 return <div className={'note-card'+(full?' full':'')}>
  {cover&&<img className="note-cover" src={cover} alt="" loading="lazy" decoding="async" draggable={false}/>}
  <span className="note-k"><FileText/>{kicker}</span><H level={3} className="note-t">{title}</H>
  {full?children:<>{excerpt&&<p className="note-x">{excerpt}</p>}{more&&<span className="note-more">{more} <ChevronRight/></span>}</>}
 </div>;
}

/** A picture inside an article's text (`![](media:<id>)`): the whole width, tap opens the viewer. */
export function ArticleImage({src,label,onOpen}:{src:string,label:string,onOpen:()=>void}){
 return <figure className="md-img"><button type="button" aria-label={label} onClick={e=>{e.stopPropagation();onOpen();}}><img src={src} alt="" loading="lazy" decoding="async" draggable={false}/></button></figure>;
}
