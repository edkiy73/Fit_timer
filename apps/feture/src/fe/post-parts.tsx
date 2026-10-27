import {Fragment,useCallback,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,ChevronLeft,ChevronRight,Link as LinkIcon,Undo2,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn,Layer} from './ui';
import {useFe} from './session';
import {useToast} from './toast';

/** Pieces of a post with the prototype's markup: `md()` text with mentions and links, `mediaGrid()` (one picture or a
 * mosaic shaped by the pictures, «Instafill» over a blurred copy), `openViewer()`, `pollHTML()` and the interests card. */

/* ---------- catalog (topic names), loaded once per session ---------- */
const named={ru:z.string(),en:z.string()};
const topicShape=z.object({id:z.string(),categoryId:z.string(),...named}).passthrough();
const catShape=z.object({id:z.string(),...named}).passthrough();
const catalogRes=z.object({ok:z.literal(true),categories:z.array(catShape),topics:z.array(topicShape)});
export type CatTopic=z.infer<typeof topicShape>;
export type CatCategory=z.infer<typeof catShape>;
let catalogCache:Promise<z.infer<typeof catalogRes>>|null=null;

export function useTopics(){
 const {call}=useFe();const {locale}=useI18n();
 const [data,setData]=useState<z.infer<typeof catalogRes>|null>(null);
 useEffect(()=>{let live=true;
  catalogCache??=call('catalog.get',{},catalogRes,{asAccount:true}).catch(e=>{catalogCache=null;throw e;});
  catalogCache.then(d=>{if(live)setData(d);},()=>{});return ()=>{live=false;};},[call]);
 const name=useCallback((id:string)=>{const v=data?.topics.find(o=>o.id===id);return v?(locale==='en'?v.en:v.ru):id;},[data,locale]);
 return {topics:data?.topics??[],cats:data?.categories??[],name,ready:!!data};
}

/* ---------- md(): safe Markdown, FetLife-like ---------- */
const INLINE=/(`[^`\n]+`)|(!?\[[^\]\n]{1,120}\]\(https?:\/\/[^\s()<>"']{1,400}\))|((?:^|(?<=[\s(]))@[a-z0-9_.]{2,30})|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|((?:^|(?<=[\s(]))[*_][^*_\n]+[*_](?=$|[\s).,!?:;]))/gi;

function Inline({s,onLink}:{s:string,onLink:(u:string)=>void}){
 const out:ReactNode[]=[];let last=0;let k=0;
 for(const m of s.matchAll(INLINE)){
  const i=m.index??0;if(i>last)out.push(s.slice(last,i));const v=m[0];
  if(m[1])out.push(<code key={k++}>{v.slice(1,-1)}</code>);
  else if(m[2]){const mm=/\[([^\]]+)\]\(([^)]+)\)/.exec(v)!;const u=mm[2]!;out.push(<a key={k++} href={u} rel="noopener noreferrer nofollow" onClick={e=>{e.preventDefault();e.stopPropagation();onLink(u);}}>{mm[1]}</a>);}
  else if(m[3])out.push(<Mention key={k++} handle={v.slice(1)}/>);
  else if(m[4])out.push(<b key={k++}>{v.slice(2,-2)}</b>);
  else if(m[5])out.push(<s key={k++}>{v.slice(2,-2)}</s>);
  else if(m[6])out.push(<i key={k++}>{v.slice(1,-1)}</i>);
  last=i+v.length;
 }
 if(last<s.length)out.push(s.slice(last));
 return <>{out}</>;
}

/** `@handle` → the person's profile. The server keeps a mention only for people who allow it; the link finds the
 * profile by its exact nickname and stays plain text when there is none. */
function Mention({handle}:{handle:string}){
 const {call}=useFe();const navigate=useNavigate();
 const open=(e:{stopPropagation:()=>void})=>{e.stopPropagation();
  call('people.search',{q:handle},z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),handle:z.string().nullable()}).passthrough())}))
   .then(r=>{const p=r.items.find(x=>x.handle?.toLowerCase()===handle.toLowerCase());if(p)navigate('/n/people/'+p.id);}).catch(()=>{});};
 return <span className="mention" role="link" tabIndex={0} onClick={open} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open(e);}}}>@{handle}</span>;
}

export function RichText({text,className}:{text:string,className?:string}){
 const {t}=useI18n();const [link,setLink]=useState<string|null>(null);
 const lines=text.split('\n');const blocks:ReactNode[]=[];let para:string[]=[];let list:{t:'ul'|'ol',items:string[]}|null=null;let k=0;
 const il=(s:string)=><Inline s={s} onLink={setLink}/>;
 const flushP=()=>{if(para.length){const p=para;blocks.push(<p key={k++}>{p.map((x,i)=><Fragment key={i}>{i>0&&<br/>}{il(x)}</Fragment>)}</p>);para=[];}};
 const flushL=()=>{if(list){const l=list;const T=l.t;blocks.push(<T key={k++}>{l.items.map((x,i)=><li key={i}>{il(x)}</li>)}</T>);list=null;}};
 for(let i=0;i<lines.length;i++){const l=lines[i]!;let m:RegExpMatchArray|null;
  if(!l.trim()){flushP();flushL();continue;}
  if(/^\\([-*]|\d+[.)]|>|#{1,3})\s/.test(l)){flushL();para.push(l.slice(1));continue;}
  if((m=l.match(/^\s*[-*]\s+(.*)/))||(m=l.match(/^\s*\d+[.)]\s+(.*)/))){const tp=/^\s*\d/.test(l)?'ol':'ul';flushP();if(list&&list.t!==tp)flushL();list??={t:tp,items:[]};list.items.push(m[1]!);continue;}
  flushL();
  if((m=l.match(/^>\s?(.*)/))){flushP();const q=[m[1]!];while(i+1<lines.length&&/^>/.test(lines[i+1]!))q.push(lines[++i]!.replace(/^>\s?/,''));
   blocks.push(<blockquote key={k++}>{q.map((x,j)=><Fragment key={j}>{j>0&&<br/>}{il(x)}</Fragment>)}</blockquote>);continue;}
  if((m=l.match(/^#{1,3}\s+(.*)/))){flushP();blocks.push(<h4 key={k++}>{il(m[1]!)}</h4>);continue;}
  para.push(l);
 }
 flushP();flushL();
 let host='';try{host=link?new URL(link).host:'';}catch{/* not a link */}
 return <>
  <div className={'md'+(className?' '+className:'')}>{blocks}</div>
  {link&&<Layer><div className="scrim on" onClick={()=>setLink(null)}/>
   <div className="dialog on" role="alertdialog" aria-modal="true" aria-label={t('fe.fd.linkTitle')}>
    <div className="ico"><LinkIcon/></div><h2>{t('fe.fd.linkTitle')}</h2><p>{t('fe.fd.linkText',{host})}</p>
    <div className="btns"><Btn onClick={()=>{window.open(link,'_blank','noopener,noreferrer');setLink(null);}}>{t('fe.fd.linkOpen')}</Btn><Btn kind="soft" onClick={()=>setLink(null)}>{t('fe.pm.cancel')}</Btn></div>
   </div></Layer>}
 </>;
}
/** Markdown → one plain line, for list rows. */
export const mdPlain=(s:string)=>s.replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/^\s*(#{1,3}|>|[-*]|\d+[.)])\s+/gm,'').replace(/(\*\*|__|~~|`)/g,'').replace(/\s*\n+\s*/g,' ').trim();

/* ---------- mediaGrid() + mosaic ---------- */
export type MediaItem={id:string,w:number|null,h:number|null,pending:boolean,blurred:boolean,src:Record<string,string>|null};
const fitAr=(r:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,r));
type Cell=[number,number,number,number];
function mosaic(rs:(number|null)[]){
 const n=rs.length,R=rs.map(r=>Math.max(.5,Math.min(2.4,r||1)));const lay:{cells:Cell[],H:number}[]=[];
 const rows=(parts:number[][])=>{let y=0;const cells:Cell[]=[];for(const row of parts){const sum=row.reduce((t,i)=>t+R[i]!,0),h=1/sum;let x=0;for(const i of row){const w=R[i]!/sum;cells[i]=[x,y,w,h];x+=w;}y+=h;}return {cells,H:y};};
 const col=(big:number,rest:number[])=>{const S=rest.reduce((t,i)=>t+1/R[i]!,0),w2=1/(1+R[big]!*S),w1=1-w2,H=w2*S,cells:Cell[]=[];cells[big]=[0,0,w1,H];let y=0;for(const i of rest){const h=w2/R[i]!;cells[i]=[w1,y,w2,h];y+=h;}return {cells,H};};
 if(n===2)lay.push(rows([[0,1]]),rows([[0],[1]]));
 if(n===3)lay.push(rows([[0],[1,2]]),col(0,[1,2]),rows([[0,1],[2]]),rows([[0,1,2]]));
 if(n>=4)lay.push(rows([[0,1],[2,3]]),rows([[0],[1,2,3]]),col(0,[1,2,3]));
 let best:{cells:Cell[],H:number,score:number}|null=null;
 for(const l of lay){const H=Math.max(.5,Math.min(1.25,l.H)),k=H/l.H,cells=l.cells.map(([x,y,w,h])=>[x,y*k,w,h*k] as Cell),area=(c:Cell)=>c[2]*c[3];
  const score=Math.abs(1-k)*3+(cells.some(c=>Math.min(c[2],c[3])<.2)?1:0)+(area(cells[0]!)+1e-6<Math.max(...cells.map(area))?.15:0)+Math.abs(Math.log(H/.8))*.3+rs.reduce<number>((t,r,i)=>t+(r?Math.abs(Math.log(R[i]!/r)):0),0);
  if(!best||score<best.score)best={cells,H,score};}
 return best!;
}
const mosaicBox=([x,y,w,h]:Cell,H:number):CSSProperties=>{const g=1.5,l=x>1e-3?g:0,r=x+w<.999?g:0,t=y>1e-3?g:0,b=y+h<H-1e-3?g:0;
 return {left:`calc(${(x*100).toFixed(3)}% + ${l}px)`,top:`calc(${(y/H*100).toFixed(3)}% + ${t}px)`,width:`calc(${(w*100).toFixed(3)}% - ${l+r}px)`,height:`calc(${(h/H*100).toFixed(3)}% - ${t+b}px)`};};
export const mediaSrc=(m:MediaItem,size:'card'|'full'='card')=>m.src?(size==='full'?m.src.full??m.src.card:m.src.card??m.src.full)??m.src.thumb??m.src.blur??null:null;

/** Signed media links expire: a picture that fails to load asks the owner of the list for fresh links once. */
function MfImg({src,blur,onRatio,onFail}:{src:string,blur?:string|null|undefined,onRatio?:(r:number)=>void,onFail?:(()=>void)|undefined}){
 const failed=useRef(false);
 return <>
  {/* The tiny blurred copy from the server shows first; the full picture fades in over it when loaded. */}
  <img className="mbg" src={blur||src} alt="" aria-hidden="true" draggable={false} loading="lazy" decoding="async"/>
  <img className="mfg" src={src} alt="" draggable={false} loading="lazy" decoding="async"
   onLoad={e=>{const i=e.currentTarget;if(i.naturalWidth&&i.naturalHeight)onRatio?.(i.naturalWidth/i.naturalHeight);}}
   onError={()=>{if(failed.current)return;failed.current=true;onFail?.();}}/>
 </>;
}

export function MediaGrid({media,onExpired}:{media:MediaItem[],onExpired?:(()=>void)|undefined}){
 const {t}=useI18n();const [open,setOpen]=useState<number|null>(null);const opener=useRef<HTMLElement|null>(null);
 const list=media.filter(m=>mediaSrc(m));
 const [seen,setSeen]=useState<Record<string,number>>({});
 const close=useCallback(()=>{setOpen(null);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));},[]);
 if(!list.length)return null;
 const shown=list.slice(0,4);const n=list.length;const rs=shown.map(m=>m.w&&m.h?m.w/m.h:seen[m.id]??null);
 const learn=(id:string)=>(r:number)=>setSeen(s=>s[id]?s:{...s,[id]:r});
 const go=(i:number)=>(e:React.MouseEvent<HTMLButtonElement>)=>{e.stopPropagation();opener.current=e.currentTarget;setOpen(i);};
 const label=t('fe.fd.openFull');
 let grid;
 if(n===1){const m=shown[0]!;const r=rs[0];
  grid=<div className="mgrid n1"><button type="button" className="mcell mf" style={r?{'--ar':fitAr(r,.8,1.91).toFixed(4)} as CSSProperties:undefined} aria-label={label} onClick={go(0)}>
   <MfImg src={mediaSrc(m)!} blur={m.src?.blur} onRatio={learn(m.id)} onFail={onExpired}/></button></div>;}
 else{const mo=mosaic(rs);
  grid=<div className="mgrid mos" style={{aspectRatio:(1/mo.H).toFixed(4)}}>{shown.map((m,i)=><button key={m.id} type="button" className="mcell mf" style={mosaicBox(mo.cells[i]!,mo.H)} aria-label={label} onClick={go(i)}>
   <MfImg src={mediaSrc(m)!} blur={m.src?.blur} onRatio={learn(m.id)} onFail={onExpired}/>{i===3&&n>4&&<span className="more">+{n-4}</span>}</button>)}</div>;}
 return <>{grid}{open!==null&&<Viewer srcs={list.map(m=>mediaSrc(m,'full')!)} index={open} onClose={close}/>}</>;
}

/** `openViewer()` — full-screen photos: ‹ ›, arrows, swipe, Esc. */
export function Viewer({srcs,index,onClose}:{srcs:string[],index:number,onClose:()=>void}){
 const {t}=useI18n();const [i,setI]=useState(index);const [on,setOn]=useState(false);const closeBtn=useRef<HTMLButtonElement>(null);const sx=useRef<number|null>(null);
 const [host,setHost]=useState<Element|null>(null);
 useEffect(()=>{setHost(document.querySelector('.fe-v21 main.main')??document.body);},[]);
 useEffect(()=>{if(!host)return;const r=requestAnimationFrame(()=>{setOn(true);closeBtn.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[host]);
 const step=useCallback((d:number)=>setI(v=>Math.max(0,Math.min(srcs.length-1,v+d))),[srcs.length]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();else if(e.key==='ArrowLeft')step(-1);else if(e.key==='ArrowRight')step(1);};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose,step]);
 if(!host)return null;
 return createPortal(<div className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.br.viewer')}
  onPointerDown={e=>{sx.current=e.clientX;}} onPointerUp={e=>{if(sx.current==null)return;const dx=e.clientX-sx.current;sx.current=null;if(Math.abs(dx)>50)step(dx<0?1:-1);}}>
  <div className="vw-track" style={{transform:`translateX(${-i*100}%)`}}>{srcs.map((s,k)=><figure key={k}><img src={s} alt="" draggable={false}/></figure>)}</div>
  <div className="vw-top"><span className="vw-n">{i+1} / {srcs.length}</span><button ref={closeBtn} type="button" className="ibtn glass" aria-label={t('fe.br.close')} onClick={onClose}><X/></button></div>
  {srcs.length>1&&<>
   <button type="button" className="vw-nav l" aria-label={t('fe.br.prev')} disabled={i===0} onClick={()=>step(-1)}><ChevronLeft/></button>
   <button type="button" className="vw-nav r" aria-label={t('fe.br.next')} disabled={i===srcs.length-1} onClick={()=>step(1)}><ChevronRight/></button>
   <div className="vw-dots">{srcs.map((_,k)=><i key={k} className={k===i?'on':undefined}/>)}</div>
  </>}
 </div>,host);
}

/* ---------- pollHTML() ---------- */
export type PollData={question:string,options:string[],myVote?:number|null,results?:number[]|null};
const voted=z.object({ok:z.literal(true),myVote:z.number().nullable()}).passthrough();
const plural=(n:number,ru:[string,string,string],en:[string,string],locale:string)=>{
 if(locale==='en')return `${n} ${n===1?en[0]:en[1]}`;const a=n%10,b=n%100;return `${n} ${a===1&&b!==11?ru[0]:a>=2&&a<=4&&(b<10||b>=20)?ru[1]:ru[2]}`;};
export {plural};

/** Before the vote every option is a button with an empty circle; after it the bars fill, your mark sits after the
 * text and «Отменить голос» withdraws it. Results come from the server only after one's own vote. `preview` is inert. */
export function Poll({postId,poll,onChange,preview=false}:{postId:string,poll:PollData,onChange?:(p:PollData)=>void,preview?:boolean}){
 const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);const [anim,setAnim]=useState(false);
 const mv=poll.myVote??null;const isVoted=mv!=null;const res=poll.results??null;
 const tot=res?res.reduce((a,b)=>a+b,0):0;const max=res?Math.max(1,...res):1;
 const vote=async(option:number|null)=>{
  if(busy||preview)return;setBusy(true);
  try{const r=await call('poll.vote',{opId:newOpId(),postId,option},voted);
   // The counts are the server's: a fresh post brings them; until then the bar shows the vote locally.
   const results=res?res.map((n,i)=>n+(i===r.myVote?1:0)-(i===mv?1:0)):r.myVote!=null?poll.options.map((_,i)=>i===r.myVote?1:0):null;
   onChange?.({...poll,myVote:r.myVote,results:r.myVote==null&&!res?null:results});setAnim(true);setTimeout(()=>setAnim(false),1500);
   if(option==null)toast(t('fe.fd.poll.withdrawn'),{type:'ok'});
  }catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 return <div className={'poll'+(isVoted?' voted':'')+(anim?' anim':'')} role="group" aria-label={poll.question||t('fe.feed.poll')} onClick={e=>e.stopPropagation()}>
  {poll.question&&<b className="poll-q">{poll.question}</b>}
  {poll.options.map((o,i)=>{const n=res?.[i]??0;const pc=tot?Math.round(n/tot*100):0;const mine=mv===i;const lead=isVoted&&n===max&&n>0;
   return <div key={i} className={'poll-option'+(mine?' mine':'')+(lead?' leader':'')}>
    <button type="button" className={'poll-choice'+(mine?' mine':'')} aria-pressed={mine} aria-disabled={preview||isVoted} onClick={()=>{if(!isVoted)void vote(i);}}>
     {isVoted?<i className="pfill" style={{'--pc':pc+'%'} as CSSProperties}>{mine&&<b className="pbub"/>}</i>:<span className="pradio" aria-hidden="true"/>}
     <span className="po"><span className="pot">{o}</span>{mine&&<span className="pmine" aria-label={t('fe.fd.poll.yours')}><Check/></span>}</span>
    </button>
    {isVoted&&<span className="poll-count" aria-label={t('fe.fd.poll.count',{n})}><span>{n}</span></span>}
   </div>;})}
  <div className="poll-f"><span className="note">{plural(tot,['голос','голоса','голосов'],['vote','votes'],locale)}{!isVoted&&!preview?' · '+t('fe.fd.poll.pick'):''}</span>
   {isVoted&&!preview&&<button type="button" className="poll-undo" disabled={busy} onClick={()=>vote(null)}><Undo2/><span>{t('fe.fd.poll.undo')}</span></button>}</div>
 </div>;
}
