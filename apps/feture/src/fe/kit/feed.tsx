import React,{forwardRef,useImperativeHandle,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bold,Ellipsis,Italic,Link as LinkIcon,List,Quote,type LucideIcon} from 'lucide-react';
import {Av,Btn,Field,IconBtn,Input,Sheet} from './index';

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

/** One «Подписки» activity card: who, what (one line, the time under it), ⋯, and the things it is about. `items`
 * longer than `fold` fold behind «Показать все» (`more`) / «Свернуть» (`less`). */
export function ActivityCard({actor,text,time,menuLabel,onMenu,onActor,items,fold=2,more,less}:{actor:{id:string,name:string,avatar?:string|null|undefined},text:ReactNode,time:ReactNode,
 menuLabel:string,onMenu:()=>void,onActor?:()=>void,items:ReactNode[],fold?:number,more:string,less:string}){
 const [open,setOpen]=useState(false);const shown=open?items:items.slice(0,fold);
 const av=<Av name={actor.name} seed={actor.id} src={actor.avatar} size="sm"/>;
 return <article className="actc">
  <span className="actc-av">{onActor?<button type="button" className="plink" aria-label={actor.name} onClick={onActor}>{av}</button>:av}</span>
  <div className="actc-b">
   <div className="actc-hd"><p className="actc-t">{text}<small>{time}</small></p><IconBtn icon={Ellipsis} kind="ghost" size="sm" label={menuLabel} aria-haspopup="dialog" onClick={onMenu}/></div>
   {items.length>0&&<div className="actc-list">{shown}
    {items.length>fold&&<Btn kind="text" auto aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?less:more}</Btn>}</div>}
  </div>
 </article>;
}
/** A thing inside an activity card (a post, an event, a community, a person). */
export function ActivityItem({icon:I,av,title,sub,onClick}:{icon?:LucideIcon,av?:ReactNode,title:ReactNode,sub?:ReactNode,onClick:()=>void}){
 return <button type="button" className="actc-p" onClick={onClick}>{av??(I&&<span className="actc-th kind"><I/></span>)}<span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span></button>;
}

/* ---------------- Create ---------------- */

/** «Или сразу начать с» under the create choices: dashed tiles that open the editor with a part already added. */
export function QuickStart({title,items}:{title:ReactNode,items:[LucideIcon,string,()=>void][]}){
 return <><p className="create-qt">{title}</p><div className="create-q">{items.map(([I,l,fn])=><button key={l} type="button" onClick={fn}><I/>{l}</button>)}</div></>;
}

/** A quiet line with one action on the right (under an article: «Только статьи — без остальных публикаций · Следить»). */
export function ActionLine({text,children}:{text:ReactNode,children:ReactNode}){
 return <div className="note-sub"><span>{text}</span>{children}</div>;
}
