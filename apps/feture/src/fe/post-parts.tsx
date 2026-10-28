import {Fragment,useCallback,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,ChevronLeft,ChevronRight,Link as LinkIcon,Undo2,Users,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Ask,Av,Btn,Card,Empty,H,IconBtn,Layer,Note,PhotoTrack,Row,Sheet,Skel,VideoBadge,VideoPlayer,useBackClose,type Slide} from './kit';
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

/** A mention that is a link: the server lists them per post / reply (V21 unmentionMe — a removed one stays text). */
export type MentionRef={id:string,handle:string|null};
function Inline({s,onLink,mentions}:{s:string,onLink:(u:string)=>void,mentions:MentionRef[]|undefined}){
 const out:ReactNode[]=[];let last=0;let k=0;
 for(const m of s.matchAll(INLINE)){
  const i=m.index??0;if(i>last)out.push(s.slice(last,i));const v=m[0];
  if(m[1])out.push(<code key={k++}>{v.slice(1,-1)}</code>);
  else if(m[2]){const mm=/\[([^\]]+)\]\(([^)]+)\)/.exec(v)!;const u=mm[2]!;out.push(<a key={k++} href={u} rel="noopener noreferrer nofollow" onClick={e=>{e.preventDefault();e.stopPropagation();onLink(u);}}>{mm[1]}</a>);}
  else if(m[3]){const h=v.slice(1).toLowerCase();const ref=mentions?.find(x=>x.handle?.toLowerCase()===h);out.push(ref?<Mention key={k++} handle={v.slice(1)} id={ref.id}/>:v);}
  else if(m[4])out.push(<b key={k++}>{v.slice(2,-2)}</b>);
  else if(m[5])out.push(<s key={k++}>{v.slice(2,-2)}</s>);
  else if(m[6])out.push(<i key={k++}>{v.slice(1,-1)}</i>);
  last=i+v.length;
 }
 if(last<s.length)out.push(s.slice(last));
 return <>{out}</>;
}

/** `@handle` → the person's profile. Only the mentions the server lists for this text are links (people who allow
 * mentions, not blocked, not removed by themselves); any other `@word` stays plain text. Your own name opens «Я». */
function Mention({handle,id}:{handle:string,id:string}){
 const {acting}=useFe();const navigate=useNavigate();
 const open=(e:{stopPropagation:()=>void})=>{e.stopPropagation();navigate(id===acting?.id?'/n/me':'/n/people/'+id);};
 return <span className="mention" role="link" tabIndex={0} onClick={open} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open(e);}}}>@{handle}</span>;
}

/** `images`: an article's pictures (`![](media:<id>)` lines) — the caller draws the post's own media by id; a line
 * whose picture is not there (hidden, still in review) shows nothing. */
export function RichText({text,className,mentions,images}:{text:string,className?:string,mentions?:MentionRef[]|undefined,images?:((id:string)=>ReactNode)|undefined}){
 const {t}=useI18n();const [link,setLink]=useState<string|null>(null);
 const lines=text.split('\n');const blocks:ReactNode[]=[];let para:string[]=[];let list:{t:'ul'|'ol',items:string[]}|null=null;let k=0;
 const il=(s:string)=><Inline s={s} onLink={setLink} mentions={mentions}/>;
 const flushP=()=>{if(para.length){const p=para;blocks.push(<p key={k++}>{p.map((x,i)=><Fragment key={i}>{i>0&&<br/>}{il(x)}</Fragment>)}</p>);para=[];}};
 const flushL=()=>{if(list){const l=list;const T=l.t;blocks.push(<T key={k++}>{l.items.map((x,i)=><li key={i}>{il(x)}</li>)}</T>);list=null;}};
 for(let i=0;i<lines.length;i++){const l=lines[i]!;let m:RegExpMatchArray|null;
  if(!l.trim()){flushP();flushL();continue;}
  if((m=l.trim().match(/^!\[[^\]\n]{0,120}\]\(media:([0-9a-f-]{36})\)$/))){flushP();flushL();const img=images?.(m[1]!);if(img)blocks.push(<Fragment key={k++}>{img}</Fragment>);continue;}
  if(/^\\([-*]|\d+[.)]|>|#{1,3})\s/.test(l)){flushL();para.push(l.slice(1));continue;}
  if((m=l.match(/^\s*[-*]\s+(.*)/))||(m=l.match(/^\s*\d+[.)]\s+(.*)/))){const tp=/^\s*\d/.test(l)?'ol':'ul';flushP();if(list&&list.t!==tp)flushL();list??={t:tp,items:[]};list.items.push(m[1]!);continue;}
  flushL();
  if((m=l.match(/^>\s?(.*)/))){flushP();const q=[m[1]!];while(i+1<lines.length&&/^>/.test(lines[i+1]!))q.push(lines[++i]!.replace(/^>\s?/,''));
   blocks.push(<blockquote key={k++}>{q.map((x,j)=><Fragment key={j}>{j>0&&<br/>}{il(x)}</Fragment>)}</blockquote>);continue;}
  if((m=l.match(/^#{1,3}\s+(.*)/))){flushP();blocks.push(<H key={k++} level={4}>{il(m[1]!)}</H>);continue;}
  para.push(l);
 }
 flushP();flushL();
 let host='';try{host=link?new URL(link).host:'';}catch{/* not a link */}
 return <>
  <div className={'md'+(className?' '+className:'')}>{blocks}</div>
  {link&&<Ask icon={LinkIcon} title={t('fe.fd.linkTitle')} text={t('fe.fd.linkText',{host})} ok={t('fe.fd.linkOpen')} cancel={t('fe.pm.cancel')}
   onOk={()=>{window.open(link,'_blank','noopener,noreferrer');setLink(null);}} onCancel={()=>setLink(null)}/>}
 </>;
}
/** Markdown → one plain line, for list rows. */
export const mdPlain=(s:string)=>s.replace(/!\[[^\]\n]*\]\(media:[^)]*\)/g,' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/^\s*(#{1,3}|>|[-*]|\d+[.)])\s+/gm,'').replace(/(\*\*|__|~~|`)/g,'').replace(/\s*\n+\s*/g,' ').trim();

/* ---------- mediaGrid() + mosaic ---------- */
export type MediaItem={id:string,kind?:string|undefined,w:number|null,h:number|null,pending:boolean,blurred:boolean,src:Record<string,string>|null,durationMs?:number|null|undefined};
/** What the viewer shows for an item: the picture, or a clip with its poster (a covered clip stays its picture). */
export const slideOf=(m:MediaItem):Slide=>m.kind==='video'&&m.src?.file?{video:m.src.file,poster:mediaSrc(m,'full'),durationMs:m.durationMs}:mediaSrc(m,'full')!;
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

export function MediaGrid({media,onExpired,bar}:{media:MediaItem[],onExpired?:(()=>void)|undefined,/** The post over the viewer (`ViewerPostBar`). */ bar?:ViewerBar|undefined}){
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
 // One clip plays in place with its controls (owner, 28.10.2026); «На весь экран» opens the viewer.
 if(n===1&&shown[0]!.kind==='video'&&shown[0]!.src?.file){const m=shown[0]!;const r=rs[0];
  grid=<div className="mgrid n1"><div className="mcell mv" style={r?{'--ar':fitAr(r,.8,1.91).toFixed(4)} as CSSProperties:undefined}>
   <VideoPlayer src={m.src!.file} poster={mediaSrc(m,'full')} w={m.w} h={m.h} durationMs={m.durationMs} fill onExpired={onExpired} onExpand={()=>{opener.current=null;setOpen(0);}}/></div></div>;}
 else if(n===1){const m=shown[0]!;const r=rs[0];
  grid=<div className="mgrid n1"><button type="button" className="mcell mf" style={r?{'--ar':fitAr(r,.8,1.91).toFixed(4)} as CSSProperties:undefined} aria-label={m.kind==='video'?t('fe.kit.av.play'):label} onClick={go(0)}>
   <MfImg src={mediaSrc(m)!} blur={m.src?.blur} onRatio={learn(m.id)} onFail={onExpired}/>{m.kind==='video'&&<VideoBadge durationMs={m.durationMs}/>}</button></div>;}
 else{const mo=mosaic(rs);
  grid=<div className="mgrid mos" style={{'--mo-ar':(1/mo.H).toFixed(4)} as CSSProperties}>{shown.map((m,i)=><button key={m.id} type="button" className="mcell mf" style={mosaicBox(mo.cells[i]!,mo.H)} aria-label={m.kind==='video'?t('fe.kit.av.play'):label} onClick={go(i)}>
   <MfImg src={mediaSrc(m)!} blur={m.src?.blur} onRatio={learn(m.id)} onFail={onExpired}/>{m.kind==='video'&&<VideoBadge durationMs={m.durationMs}/>}{i===3&&n>4&&<span className="more">+{n-4}</span>}</button>)}</div>;}
 // A tap anywhere on the media is the media's (a cell, a clip, an overlay the browser draws) — never «open the post».
 return <><div className="mgrid-box" onClick={e=>e.stopPropagation()}>{grid}</div>{open!==null&&<Viewer srcs={list.map(slideOf)} index={open} onClose={close} onExpired={onExpired} bar={bar}/>}</>;
}

/** `openViewer()` — full-screen photos: ‹ ›, arrows, swipe, Esc. It is a layer of its own above the bars, the dock,
 * the bottom buttons and the toasts; the system «Назад» closes it instead of leaving the screen. */
/** A post's actions and text over the media (`ViewerPostBar`): `close` shuts the viewer; `leave` shuts it and then
 * opens another screen, so its own history entry is gone first and «Назад» comes back to where the viewer was opened. */
export type ViewerBar=(close:()=>void,leave:(to:string)=>void)=>ReactNode;
export function Viewer({srcs,index,onClose,onExpired,bar}:{srcs:Slide[],index:number,onClose:()=>void,onExpired?:(()=>void)|undefined,bar?:ViewerBar|undefined}){
 const {t}=useI18n();const navigate=useNavigate();
 const leave=useCallback((to:string)=>{window.addEventListener('popstate',()=>setTimeout(()=>navigate(to),0),{once:true});window.history.back();},[navigate]);const [i,setI]=useState(index);const [on,setOn]=useState(false);const box=useRef<HTMLDivElement>(null);const sx=useRef<number|null>(null);
 useBackClose(onClose);
 useEffect(()=>{const r=requestAnimationFrame(()=>{setOn(true);box.current?.querySelector<HTMLButtonElement>('.vw-top .ibtn')?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[]);
 const step=useCallback((d:number)=>setI(v=>Math.max(0,Math.min(srcs.length-1,v+d))),[srcs.length]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose();}else if((e.target as HTMLElement|null)?.closest?.('input'))return;else if(e.key==='ArrowLeft')step(-1);else if(e.key==='ArrowRight')step(1);};
  document.addEventListener('keydown',k,true);return ()=>document.removeEventListener('keydown',k,true);},[onClose,step]);
 return <Layer><div ref={box} className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.br.viewer')}
  onPointerDown={e=>{sx.current=e.clientX;}} onPointerUp={e=>{if(sx.current==null)return;const dx=e.clientX-sx.current;sx.current=null;if(Math.abs(dx)>50)step(dx<0?1:-1);}}>
  <PhotoTrack srcs={srcs} index={i} onExpired={onExpired} onStep={step} onClose={onClose}/>
  {bar?.(onClose,leave)}
  <div className="vw-top"><span className="vw-n">{i+1} / {srcs.length}</span><IconBtn icon={X} kind="glass" label={t('fe.br.close')} onClick={onClose}/></div>
  {srcs.length>1&&<>
   <button type="button" className="vw-nav l" aria-label={t('fe.br.prev')} disabled={i===0} onClick={()=>step(-1)}><ChevronLeft/></button>
   <button type="button" className="vw-nav r" aria-label={t('fe.br.next')} disabled={i===srcs.length-1} onClick={()=>step(1)}><ChevronRight/></button>
   <div className="vw-dots">{srcs.map((_,k)=><i key={k} className={k===i?'on':undefined}/>)}</div>
  </>}
 </div></Layer>;
}

/* ---------- pollHTML() ---------- */
export type PollData={question:string,options:string[],myVote?:number|null,results?:number[]|null};
const voted=z.object({ok:z.literal(true),myVote:z.number().nullable()}).passthrough();
const plural=(n:number,ru:[string,string,string],en:[string,string],locale:string)=>{
 if(locale==='en')return `${n} ${n===1?en[0]:en[1]}`;const a=n%10,b=n%100;return `${n} ${a===1&&b!==11?ru[0]:a>=2&&a<=4&&(b<10||b>=20)?ru[1]:ru[2]}`;};
export {plural};

/** Before the vote every option is a button with an empty circle; after it the bars fill, your mark sits after the
 * text and «Отменить голос» withdraws it. Results come from the server only after one's own vote. `preview` is inert. */
export function Poll({postId,poll,onChange,preview=false,mine=false}:{postId:string,poll:PollData,onChange?:(p:PollData)=>void,preview?:boolean,
 /** The author sees who chose what without voting (poll.voters). */ mine?:boolean}){
 const {call,acting}=useFe();const us=acting?.kind==='couple';const {t,locale}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);const [anim,setAnim]=useState(false);
 const [voters,setVoters]=useState<number|null>(null);
 const mv=poll.myVote??null;const isVoted=mv!=null;const res=poll.results??null;
 const tot=res?res.reduce((a,b)=>a+b,0):0;const max=res?Math.max(1,...res):1;
 const vote=async(option:number|null)=>{
  if(busy||preview)return;setBusy(true);
  try{const r=await call('poll.vote',{opId:newOpId(),postId,option},voted);
   // The counts are the server's: a fresh post brings them; until then the bar shows the vote locally.
   const results=res?res.map((n,i)=>n+(i===r.myVote?1:0)-(i===mv?1:0)):r.myVote!=null?poll.options.map((_,i)=>i===r.myVote?1:0):null;
   onChange?.({...poll,myVote:r.myVote,results:r.myVote==null&&!res?null:results});setAnim(true);setTimeout(()=>setAnim(false),1500);
   // As the couple the vote is the couple's: the toast says so (as oneself the bar is enough).
   if(option==null)toast(t(us?'fe.fd.poll.withdrawnUs':'fe.fd.poll.withdrawn'),{type:'ok'});else if(us)toast(t('fe.fd.poll.votedUs'),{type:'ok'});
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
    {(isVoted||mine&&res)&&!preview?<button type="button" className="poll-count" aria-label={t('fe.w3.voters.open',{n})} onClick={()=>setVoters(i)}><span>{n}</span><ChevronRight/></button>
     :isVoted&&<span className="poll-count" aria-label={t('fe.fd.poll.count',{n})}><span>{n}</span></span>}
   </div>;})}
  <div className="poll-f"><Note>{plural(tot,['голос','голоса','голосов'],['vote','votes'],locale)}{!isVoted&&!preview?' · '+t('fe.fd.poll.pick'):''}</Note>
   {isVoted&&!preview&&<button type="button" className="poll-undo" disabled={busy} onClick={()=>vote(null)}><Undo2/><span>{t('fe.fd.poll.undo')}</span></button>}</div>
  {voters!==null&&<MarksSheet title={poll.options[voters]??''} empty={t('fe.w3.voters.none')}
   load={cursor=>call('poll.voters',{postId,option:voters,...(cursor?{cursor}:{})},marksPage)} onClose={()=>setVoters(null)}/>}
 </div>;
}

/* ---------- people behind likes and votes (V21 likers / pollPeople) ---------- */
const markPerson=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),mine:z.boolean().optional(),
 avatar:z.string().nullable().optional()}).passthrough();
export const marksPage=z.object({ok:z.literal(true),total:z.number(),hidden:z.number(),items:z.array(markPerson),next:z.string().nullable()});
export type MarksPage=z.infer<typeof marksPage>;
export type MarkPerson=z.infer<typeof markPerson>;
const personName=(p:{name?:string|null,handle?:string|null})=>p.name||(p.handle?'@'+p.handle:'?');
export {personName};

/** A sheet with the people behind likes or a poll option: 30 a page, own profiles first as «Ты»; people who keep their
 * marks private are only counted («И ещё N…»). A row opens the profile («Я» for one's own). */
export function MarksSheet({title,empty,load,onClose,first}:{title:string,empty:string,load:(cursor?:string)=>Promise<MarksPage>,onClose:()=>void,first?:MarksPage|null}){
 const {t,locale}=useI18n();const navigate=useNavigate();const {acting}=useFe();
 const [data,setData]=useState<MarksPage|null>(first??null);const [error,setError]=useState<unknown>(null);const [more,setMore]=useState(false);
 const get=useRef(load);get.current=load;
 useEffect(()=>{if(first)return;get.current().then(setData,setError);},[first]);
 const next=()=>{if(!data?.next||more)return;setMore(true);get.current(data.next).then(r=>setData(d=>d&&{...r,items:[...d.items,...r.items]}),setError).finally(()=>setMore(false));};
 const items=data?[...data.items].sort((a,b)=>Number(!!b.mine)-Number(!!a.mine)):[];
 return <Sheet title={title} sub={data?plural(data.total,['отметка','отметки','отметок'],['mark','marks'],locale):undefined} onClose={onClose}>
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}/>
   :!data?<Skel kind="list"/>
   :!items.length&&!data.hidden?<Empty icon={Users} title={empty}/>
   :<>{items.length>0&&<Card list>{items.map(p=><Row key={p.id} av={<Av name={personName(p)} seed={p.id} src={p.avatar} size="sm"/>}
     title={p.id===acting?.id?t('fe.w3.you'):personName(p)} sub={p.handle?'@'+p.handle:undefined}
     onClick={()=>{onClose();navigate(p.mine?'/n/me':'/n/people/'+p.id);}}/>)}</Card>}
    {data.next&&<Btn kind="soft" className="mt12" busy={more} disabled={more} onClick={next}>{t('fe.feed.more')}</Btn>}
    {data.hidden>0&&<p className="grp-n">{t('fe.w3.likers.hidden',{n:data.hidden})}</p>}</>}
 </Sheet>;
}
