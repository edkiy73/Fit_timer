import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ArrowUpDown,AtSign,Bookmark,Check,Calendar,ChartColumn,ChevronLeft,ChevronRight,Clock,Ellipsis,Eye,EyeOff,FileText,Globe,Heart,Image as ImageIcon,KeyRound,Lock,MessageCircle,Newspaper,Pencil,Plus,Search,SendHorizontal,Share,SlidersHorizontal,Sparkles,Trash2,Users,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Layer,Seg,View,Skel} from './ui';
import {useFe} from './session';
import {BellButton} from './inbox';
import {PostMenu,ReplyMenu,type Removal} from './post-menu';
import {restoreInto,useToast} from './toast';
import {MediaGrid,Poll,RichText,Viewer,mdPlain,mediaSrc,plural,useTopics,type CatTopic,type PollData} from './post-parts';
import {Jars,useInterests,type Interest} from './interests';
import {NameBadges} from './faces';

/** Slice B (V21 F01, F05, F07, F09) with the prototype's markup: feed tabs, composer row, topic chips and filters,
 * posts (text, media, poll, interests, marks), replies in threads, the composer and its preview.
 * Visibility and counts are the server's; the client never filters or invents them. */
const author=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string(),avatar:z.string().nullable().optional(),photoVerified:z.boolean().optional(),premium:z.boolean().optional()});
const media=z.object({id:z.uuid(),kind:z.string(),w:z.number().nullable(),h:z.number().nullable(),pending:z.boolean(),blurred:z.boolean(),src:z.record(z.string(),z.string()).nullable()});
const tag=z.object({id:z.uuid(),handle:z.string().nullable().optional(),name:z.string().nullable().optional(),state:z.string().optional()}).passthrough();
const interest=z.object({topicId:z.string(),value:z.number().nullable().optional(),dir:z.unknown().optional()}).passthrough();
export const postSchema=z.object({id:z.uuid(),type:z.enum(['post','note']),title:z.string().nullable(),body:z.string(),author,media:z.array(media),
 topics:z.array(z.string()).optional(),likes:z.number(),liked:z.boolean(),replies:z.number(),saved:z.boolean(),publishedAt:z.string().nullable(),state:z.string().optional(),
 // The audience is sent for own posts and for posts narrower than «all».
 audience:z.string().optional(),editedAt:z.string().nullable().optional(),
 // Own posts only: what the edit screen starts from.
 rev:z.number().int().optional(),inFeed:z.boolean().optional(),returned:z.string().nullable().optional(),
 poll:z.object({question:z.string(),options:z.array(z.string()),myVote:z.number().nullable().optional(),results:z.array(z.number()).nullable().optional()}).nullable().optional(),
 interests:z.array(interest).nullable().optional(),tags:z.array(tag).optional()});
export type Post=z.infer<typeof postSchema>;
const page=z.object({ok:z.literal(true),items:z.array(postSchema),next:z.string().nullable()});
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const reply=z.object({id:z.uuid(),parentId:z.uuid().nullable().optional(),deleted:z.boolean().optional(),hidden:z.boolean().optional(),body:z.string().optional(),
 author:author.nullable().optional(),mine:z.boolean().optional(),liked:z.boolean().optional(),createdAt:z.string().optional(),editedAt:z.string().nullable().optional(),likes:z.number().optional(),rev:z.number().optional()});
export type Reply=z.infer<typeof reply>;
const replies=z.object({ok:z.literal(true),items:z.array(reply)});
const onePost=z.object({ok:z.literal(true),post:postSchema});
const hiddenList=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string()}).passthrough())});

export function when(iso:string|null|undefined,locale:string){
 if(!iso)return '';
 const d=new Date(iso),s=(Date.now()-d.getTime())/1000;
 const rtf=new Intl.RelativeTimeFormat(locale==='en'?'en':'ru',{numeric:'auto'});
 if(s<60)return rtf.format(0,'second');if(s<3600)return rtf.format(-Math.floor(s/60),'minute');if(s<86400)return rtf.format(-Math.floor(s/3600),'hour');
 if(s<7*86400)return rtf.format(-Math.floor(s/86400),'day');
 return d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});
}
const nameOf=(a:{name?:string|null|undefined,handle?:string|null|undefined}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'?');
const coupleOf=(a:{kind:string,name:string})=>a.kind==='couple'&&a.name.includes(' и ')?a.name.split(' и ',2) as [string,string]:undefined;

/* ---------- F01: the feed ---------- */

type Tab='forYou'|'following'|'popular';
export function FeedTab(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const location=useLocation();const toast=useToast();
 const {name:tname,topics:catalog,cats}=useTopics();
 const [tab,setTab]=useState<Tab>('forYou');
 // Topic filters per tab (F02): the server returns only posts with one of these topics.
 const [filters,setFilters]=useState<Record<Tab,string[]>>({forYou:[],following:[],popular:[]});const sel=filters[tab];
 // A post screen that lost its post (deleted, hidden, blocked) comes back with `state.notice`.
 const [notice,setNotice]=useState(()=>{const n=(location.state as {notice?:unknown}|null)?.notice;return typeof n==='string'?n:'';});
 const [items,setItems]=useState<Post[]|null>(null);const [next,setNext]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);const [more,setMore]=useState(false);
 const [hidden,setHidden]=useState(0);const [sheet,setSheet]=useState<'create'|'filters'|null>(null);
 // Quick topics come from the posts this tab really shows (most frequent first) and stay put while filtering.
 const [quick,setQuick]=useState<Record<Tab,string[]>>({forYou:[],following:[],popular:[]});
 // Only the latest request may fill the list: a slow answer for the tab or filter left behind never overwrites the current one.
 const req=useRef(0);
 const load=useCallback((cursor?:string)=>{
  const n=++req.current;
  setError(null);if(!cursor)setItems(null);else setMore(true);
  call('feed.list',{tab,...(sel.length?{topics:sel}:{}),...(cursor?{cursor}:{})},page).then(r=>{
   if(n!==req.current)return;
   setItems(prev=>cursor&&prev?[...prev,...r.items]:r.items);setNext(r.next);
   if(!sel.length&&!cursor){const fq:Record<string,number>={};r.items.forEach(p=>(p.topics??[]).forEach(x=>{fq[x]=(fq[x]??0)+1;}));
    setQuick(q=>({...q,[tab]:Object.keys(fq).sort((a,b)=>fq[b]!-fq[a]!).slice(0,7)}));}
  }).catch(e=>{if(n===req.current)setError(e);}).finally(()=>{if(n===req.current)setMore(false);});
 },[call,tab,sel]);
 useEffect(()=>{load();},[load]);
 const loadHidden=useCallback(()=>{call('feedHide.list',{},hiddenList).then(r=>setHidden(r.items.filter(x=>x.kind==='post'||x.kind==='author').length)).catch(()=>{});},[call]);
 useEffect(()=>{loadHidden();},[loadHidden]);
 const setSel=(list:string[])=>setFilters(f=>({...f,[tab]:list}));
 const toggleTopic=(id:string)=>setSel(sel.includes(id)?sel.filter(x=>x!==id):[...sel,id]);
 const me=nameOf(acting);
 const chips=sel.length?sel.map(x=><button key={x} type="button" className="chip filter on" onClick={()=>toggleTopic(x)}>#{tname(x)} <X/></button>)
  :quick[tab].map(x=><button key={x} type="button" className="chip filter" onClick={()=>toggleTopic(x)}>#{tname(x)}</button>);
 const replace=(np:Post)=>setItems(list=>list?.map(x=>x.id===np.id?np:x)??null);
 const refetch=(id:string)=>{call('post.get',{postId:id},onePost).then(r=>replace(r.post)).catch(()=>{});};
 let body:ReactNode;
 if(error&&!items)body=<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>;
 else if(items===null)body=<Skel kind="post"/>;
 else if(!items.length)body=sel.length?<Empty icon={SlidersHorizontal} title={t('fe.fd.nothing')} text={tab==='following'?t('fe.fd.nothingFollowing'):t('fe.fd.nothingText')}><Btn kind="soft" onClick={()=>setSel([])}>{t('fe.fd.resetFilters')}</Btn></Empty>
  :hidden?<Empty icon={EyeOff} title={t('fe.fd.allHidden')} text={t('fe.fd.allHiddenText')}><Btn kind="soft" onClick={()=>navigate('/n/settings/hidden')}>{t('fe.fd.showHidden')}</Btn></Empty>
  :tab==='following'?<Empty icon={Users} title={t('fe.fd.noFollows')} text={t('fe.fd.noFollowsText')}><Btn onClick={()=>navigate('/n/search?scope=people')}>{t('fe.fd.findPeople')}</Btn></Empty>
  :<Empty icon={Newspaper} title={t('fe.fd.noPosts')} text={t('fe.fd.noPostsText')}><Btn onClick={()=>navigate('/n/search?scope=people')}>{t('fe.fd.findPeople')}</Btn></Empty>;
 else body=<>
  <div className="posts">{items.map(p=><PostCard key={p.id} post={p} onChange={replace} onExpired={()=>refetch(p.id)}
   onRemove={r=>{
    const before=items;const gone=new Set(before.filter(x=>x.id===r.postId||x.author.id===r.authorId).map(x=>x.id));
    setItems(list=>list?.filter(x=>!gone.has(x.id))??null);setNotice('');loadHidden();
    const undo=r.undo;
    toast(r.notice,{type:'ok',action:undo?{label:t('fe.tl.undo'),fn:()=>{undo().then(()=>{setItems(list=>restoreInto(before,list,gone));loadHidden();toast(t('fe.tl.restored'),{type:'ok'});},e=>toast(feErrorMessage(e,t),{type:'err'}));}}:null});
   }}/>)}</div>
  {next&&<Btn kind="soft" className="mt12" onClick={()=>load(next)} busy={more} disabled={more}>{t('fe.feed.more')}</Btn>}
  {hidden>0&&<button type="button" className="linkbtn feed-hid" onClick={()=>navigate('/n/settings/hidden')}><EyeOff/>{t('fe.fd.hiddenN',{n:hidden})}</button>}
 </>;
 return <>
  <Bar title={t('fe.nav.feed')}><button type="button" className="ibtn" aria-label={t('fe.br.search')} onClick={()=>navigate('/n/search?scope=posts')}><Search/></button><BellButton/></Bar>
  <View>
   <div className="mb12"><Seg value={tab} onChange={v=>{setNotice('');setTab(v);}} options={[{id:'forYou',label:t('fe.feed.tab.forYou')},{id:'following',label:t('fe.feed.tab.following')},{id:'popular',label:t('fe.fd.tab.popular')}]}/></div>
   {notice&&<div className="alert ok mb12" role="status"><span>{notice}</span></div>}
   <div className="composer">
    <button type="button" className="cmp-main" onClick={()=>navigate('/n/feed/new')}>{acting&&<Av name={me} seed={acting.id} size="sm" src={acting.avatar} couple={acting.kind==='couple'&&acting.name?coupleOf({kind:'couple',name:acting.name}):undefined}/>}<span>{t('fe.feed.whatsNew')}</span></button>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.fd.photoOrVideo')} onClick={()=>navigate('/n/feed/new?x=media')}><ImageIcon/></button>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.feed.poll')} onClick={()=>navigate('/n/feed/new?x=poll')}><ChartColumn/></button>
    <button type="button" className="ibtn add" aria-label={t('fe.create')} onClick={()=>setSheet('create')}><Plus/></button>
   </div>
   {(chips.length>0||sel.length>0||catalog.length>0)&&<div className="filterline"><div className="chips scroll">{chips}</div>
    <button type="button" className={'chip filter'+(sel.length?' on':'')} aria-label={t('fe.fd.filters')} onClick={()=>setSheet('filters')}><SlidersHorizontal/>{t('fe.fd.filters')}{sel.length>0&&<em className="badge-abs">{sel.length}</em>}</button>
   </div>}
   {body}
  </View>
  {sheet==='create'&&<CreateSheet onClose={()=>setSheet(null)}/>}
  {sheet==='filters'&&<FilterSheet title={t('fe.fd.feedFilters')} topics={catalog} cats={cats} popular={quick[tab]} value={sel} onClose={()=>setSheet(null)} onApply={v=>{setSel(v);setSheet(null);toast(t('fe.fd.applied'),{type:'ok'});}}/>}
 </>;
}

/** `ACT.create` — what to create: a post, an article or an event. */
export function CreateSheet({onClose}:{onClose:()=>void}){
 const {t}=useI18n();const navigate=useNavigate();
 useEsc(onClose);
 const rows:[LucideIcon,string,string,string,string][]=[[Pencil,'l',t('fe.fd.cr.post'),t('fe.fd.cr.postSub'),'/n/feed/new'],[FileText,'v',t('fe.fd.cr.note'),t('fe.fd.cr.noteSub'),'/n/feed/new?x=note'],[Calendar,'g',t('fe.fd.cr.event'),t('fe.fd.cr.eventSub'),'/n/events/new']];
 return <Layer><div className="scrim on" onClick={onClose}/>
  <div className="sheet on" role="dialog" aria-modal="true" aria-label={t('fe.create')} tabIndex={-1} ref={focusOnce}>
   <div className="grab"/><SheetHead title={t('fe.create')} onClose={onClose}/>
   <div className="sh-b"><div className="create3">{rows.map(([I,tone,b,s,to])=><button key={to} type="button" className="c3" onClick={()=>{onClose();navigate(to);}}>
    <span className={'ico '+tone}><I/></span><span className="tx"><b>{b}</b><small>{s}</small></span><ChevronRight/></button>)}</div></div>
  </div></Layer>;
}

export function SheetHead({title,onClose,lead,head}:{title:string,onClose:()=>void,lead?:ReactNode,head?:ReactNode}){
 const {t}=useI18n();
 return <div className="sh-h">{lead}<div className="sh-ht"><h2>{title}</h2></div>{head}<button type="button" className="ibtn ghost sm" aria-label={t('fe.pm.close')} onClick={onClose}><X/></button></div>;
}
/** Focuses a sheet once when it opens. A stable ref: an inline `el=>el.focus()` runs on every render and pulls the
 * focus out of the sheet's own search field after each typed letter. */
const focusOnce=(el:HTMLElement|null)=>{el?.focus({preventScroll:true});};
export function useEsc(fn:()=>void){
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();fn();}};document.addEventListener('keydown',k);return ()=>document.removeEventListener('keydown',k);},[fn]);
}

/** F02 — topic filters (`filterSheet`): popular chips, «Все · N» opens every topic by category with a search. */
export function FilterSheet({title,topics,cats,popular,value,onClose,onApply}:{title:string,topics:CatTopic[],cats:{id:string,ru:string,en:string}[],popular:string[],value:string[],onClose:()=>void,onApply:(v:string[])=>void}){
 const {t,locale}=useI18n();const [d,setD]=useState(value);const [all,setAll]=useState(false);const [q,setQ]=useState('');
 useEsc(onClose);
 const nm=(x:CatTopic)=>locale==='en'?x.en:x.ru;
 const toggle=(id:string)=>setD(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const chip=(x:CatTopic)=><button key={x.id} type="button" className={'chip'+(d.includes(x.id)?' on':'')} aria-pressed={d.includes(x.id)} onClick={()=>toggle(x.id)}>{nm(x)}</button>;
 const pop=[...new Set([...d,...popular,...topics.slice(0,6).map(x=>x.id)])].slice(0,Math.max(8,d.length)).map(id=>topics.find(x=>x.id===id)).filter((x):x is CatTopic=>!!x);
 const low=q.trim().toLowerCase();
 return <Layer><div className="scrim on" onClick={onClose}/>
  <div className="sheet full on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={focusOnce}>
   <div className="grab"/>
   {all?<SheetHead title={t('fe.fd.showTopics')} onClose={onClose} lead={<button type="button" className="ibtn ghost sm" aria-label={t('fe.fd.backToFilters')} onClick={()=>{setAll(false);setQ('');}}><ChevronLeft/></button>}/>
    :<SheetHead title={title} onClose={onClose} head={<button type="button" className="btn text auto" onClick={()=>setD([])}>{t('fe.fd.reset')}</button>}/>}
   {all&&<div className="sh-search"><div className="inwrap"><Search/><input className="inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.fd.findOption')} aria-label={t('fe.fd.findOption')} enterKeyHint="search"/></div></div>}
   <div className="sh-b">
    {all?<>{cats.map(c=>{const list=topics.filter(x=>x.categoryId===c.id&&(!low||nm(x).toLowerCase().includes(low)));if(!list.length)return null;
      return <section key={c.id} className="fsec"><div className="sec">{locale==='en'?c.en:c.ru}</div><div className="chips">{list.map(chip)}</div></section>;})}
     {low&&!topics.some(x=>nm(x).toLowerCase().includes(low))&&<p className="note sh-empty">{t('fe.br.nothing')}</p>}</>
    :<section className="fin"><div className="fin-t"><b>{t('fe.fd.showTopics')}</b><span>{t('fe.fd.pickAny')}</span>{d.length>0&&<button type="button" className="fclr" onClick={()=>setD([])}>{t('fe.fd.clear')}</button>}</div>
     <div className="chips">{pop.map(chip)}<button type="button" className="chip more" onClick={()=>setAll(true)}><Search/>{t('fe.br.seeAll')} · {topics.length}</button></div>
    </section>}
   </div>
   <div className="sh-f">{all?<Btn onClick={()=>{setAll(false);setQ('');}}>{t('fe.fd.done')}</Btn>:<Btn onClick={()=>onApply(d)}>{t('fe.fd.applyFilters')}</Btn>}</div>
  </div></Layer>;
}

/* ---------- postCard() ---------- */

const AUD_ICON:Record<string,LucideIcon>={followers:Users,granted:KeyRound,only:EyeOff};
export function PostCard({post,onChange,onRemove,onExpired,full=false,onReply,preview=false}:{post:Post,onChange:(p:Post)=>void,onRemove:(r:Removal)=>void,onExpired?:(()=>void)|undefined,full?:boolean,onReply?:()=>void,preview?:boolean}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();const {name:tname,ready:tready}=useTopics();
 const [busy,setBusy]=useState(false);
 const [menu,setMenu]=useState(false);const more=useRef<HTMLButtonElement>(null);
 // Esc / scrim / ✕ return focus to «⋯» (prototype closeSheet → sheetOpener).
 const closeMenu=useCallback(()=>{setMenu(false);requestAnimationFrame(()=>more.current?.focus({preventScroll:true}));},[]);
 const toggle=async(field:'liked'|'saved')=>{
  if(busy||preview)return;setBusy(true);const on=!post[field];
  onChange(field==='liked'?{...post,liked:on,likes:post.likes+(on?1:-1)}:{...post,saved:on});
  try{
   if(field==='liked')await call('reaction.set',{opId:newOpId(),targetType:'post',targetId:post.id,on},okOnly);
   else{await call('saved.set',{opId:newOpId(),kind:'post',targetId:post.id,on},okOnly);
    // Unsaving offers «Вернуть» everywhere (in «Сохранённое» the card leaves the list at once).
    const resave=()=>{call('saved.set',{opId:newOpId(),kind:'post',targetId:post.id,on:true},okOnly).then(()=>onChange({...post,saved:true}),e=>toast(feErrorMessage(e,t),{type:'err'}));};
    toast(on?(acting?.kind==='couple'?t('fe.fd.savedUs'):t('fe.fd.savedMe')):t('fe.fd.unsaved'),on?{type:'ok',action:{label:t('fe.fd.open'),fn:()=>navigate('/n/me/saved')}}:{action:{label:t('fe.tl.undo'),fn:resave}});}
  }catch(e){onChange(post);toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 const share=async()=>{const url=`${location.origin}/#/n/feed/post/${post.id}`;try{await navigator.clipboard.writeText(url);toast(t('fe.fd.linkCopied'),{type:'ok'});}catch{toast(url,{type:'info'});}};
 const open=()=>{if(!full&&!preview)navigate('/n/feed/post/'+post.id);};
 const mine=post.rev!=null;
 const me=post.tags?.find(x=>x.id===acting?.id);
 const okTags=(post.tags??[]).filter(x=>x.state==='ok');
 const waiting=mine?(post.tags??[]).filter(x=>x.state==='pending').map(nameOf):[];const declined=mine?(post.tags??[]).filter(x=>x.state==='no').map(nameOf):[];
 const AudI=post.audience&&post.audience!=='all'?AUD_ICON[post.audience]:undefined;
 const answer=async(a:'ok'|'no')=>{if(busy)return;setBusy(true);try{await call('tag.answer',{opId:newOpId(),postId:post.id,answer:a},okOnly);onChange({...post,tags:(post.tags??[]).map(x=>x.id===me?.id?{...x,state:a}:x)});toast(a==='ok'?t('fe.fd.tag.confirmed'):t('fe.fd.tag.declined'),{type:'ok'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}};
 const words=Math.max(1,Math.round(post.body.split(/\s+/).length/180));
 return <article className="post">
  <div className="post-h">
   <button type="button" className="who" disabled={preview} onClick={()=>navigate('/n/people/'+post.author.id)}>
    <Av name={nameOf(post.author)} seed={post.author.id} size="sm" couple={coupleOf(post.author)} src={post.author.avatar}/>
    <span className="tx"><b><span className="nmt">{nameOf(post.author)}</span><NameBadges p={post.author}/></b><small>{preview?t('fe.fd.justNow'):when(post.publishedAt,locale)}
     {AudI&&<> · <span className="aud"><AudI/>{t('fe.fd.aud.'+post.audience)}</span></>}
     {mine&&post.inFeed===false&&<> · <span className="aud"><EyeOff/>{t('fe.fd.notInFeed')}</span></>}
     {post.state&&post.state!=='published'?' · '+t('fe.feed.state.'+post.state):''}{post.editedAt&&!preview?' · '+t('fe.fd.edited'):''}</small></span>
   </button>
   {!preview&&<button ref={more} type="button" className="ibtn ghost sm" aria-label={t('fe.more')} aria-haspopup="dialog" aria-expanded={menu} onClick={()=>setMenu(true)}><Ellipsis/></button>}
  </div>
  {me&&me.state==='pending'&&!mine&&<div className="consent-note"><Users/><span><b>{t('fe.fd.tag.marksYou',{name:nameOf(post.author)})}</b>{t('fe.fd.tag.marksYouText')}</span>
   <div className="row g8"><button type="button" className="btn sm primary" disabled={busy} onClick={()=>answer('ok')}>{t('fe.fd.tag.confirm')}</button><button type="button" className="btn sm soft" disabled={busy} onClick={()=>answer('no')}>{t('fe.fd.tag.decline')}</button></div></div>}
  {me&&me.state==='no'&&!mine&&<div className="consent-note bad"><EyeOff/><span><b>{t('fe.fd.tag.youDeclined')}</b>{t('fe.fd.tag.youDeclinedText')}</span>
   <div className="row g8"><button type="button" className="btn sm soft" disabled={busy} onClick={()=>answer('ok')}>{t('fe.fd.tag.changeMind')}</button></div></div>}
  {mine&&!preview&&(waiting.length>0||declined.length>0)&&<div className={'consent-note'+(declined.length?' bad':'')}>{declined.length?<EyeOff/>:<Clock/>}
   <span><b>{declined.length?t('fe.fd.tag.declinedBy',{names:declined.join(', ')}):t('fe.fd.tag.waiting',{names:waiting.join(', ')})}</b>{declined.length?t('fe.fd.tag.declinedText'):t('fe.fd.tag.waitingText')}</span>
   {declined.length>0&&<div className="row g8"><button type="button" className="btn sm soft" onClick={()=>navigate('/n/feed/post/'+post.id+'/edit')}>{t('fe.fd.tag.replace')}</button></div>}</div>}
  <div className="body" onClick={open} role={full||preview?undefined:'link'} tabIndex={full||preview?undefined:0} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget)open();}}>
   {post.type==='note'?<div className={'note-card'+(full?' full':'')}><span className="note-k"><FileText/>{t('fe.fd.article')} · {t('fe.fd.minRead',{n:words})}</span><h3 className="note-t">{post.title}</h3>
     {full?<RichText text={post.body}/>:<><p className="note-x">{mdPlain(post.body).slice(0,220)}{post.body.length>220?'…':''}</p><span className="note-more">{t('fe.fd.readMore')} <ChevronRight/></span></>}</div>
    :<>{post.title&&<h3 className="post-title">{post.title}</h3>}{post.body&&<RichText text={post.body}/>}</>}
   <MediaGrid media={post.media} onExpired={onExpired}/>
   {post.poll&&<Poll postId={post.id} poll={post.poll as PollData} preview={preview} onChange={np=>onChange({...post,poll:np})}/>}
   {post.interests&&post.interests.length>0&&<PostInterests list={post.interests} preview={preview}/>}
  </div>
  {okTags.length>0&&<div className="tagged"><Users/><span>{t('fe.fd.inPhoto')} {okTags.map((x,i)=><span key={x.id}>{i>0&&', '}<button type="button" disabled={preview} onClick={()=>navigate(x.id===acting?.id?'/n/me':'/n/people/'+x.id)}>{x.id===acting?.id?t('fe.fd.you'):nameOf(x)}</button></span>)}</span></div>}
  {post.topics&&post.topics.length>0&&<div className="tags" style={tready?undefined:{visibility:'hidden'}}>{post.topics.map(x=><button key={x} type="button" disabled={preview} onClick={()=>navigate('/n/topics/'+x)}>#{tname(x)}</button>)}</div>}
  <div className="post-a">
   <button type="button" className={post.liked?'on':''} disabled={preview} aria-pressed={post.liked} aria-label={t('fe.fd.likePost')} onClick={()=>toggle('liked')}><Heart fill={post.liked?'currentColor':'none'}/><span>{post.likes}</span></button>
   <button type="button" disabled={preview} aria-label={t('fe.feed.replies')} onClick={full?onReply:open}><MessageCircle/><span>{post.replies}</span></button>
   <button type="button" className={'sp'+(post.saved?' saved':'')} disabled={preview} aria-pressed={post.saved} aria-label={t('fe.feed.save')} onClick={()=>toggle('saved')}><Bookmark fill={post.saved?'currentColor':'none'}/></button>
   <button type="button" disabled={preview} aria-label={t('fe.feed.share')} onClick={share}><Share/></button>
  </div>
  {menu&&<PostMenu post={post} onClose={closeMenu} onChange={onChange} onRemove={r=>{setMenu(false);onRemove(r);}}/>}
 </article>;
}

/** The «Мои интересы» card of a post: a snapshot of the author's public interests; a jar opens the topic. */
function PostInterests({list,preview}:{list:z.infer<typeof interest>[],preview:boolean}){
 const {t}=useI18n();const navigate=useNavigate();const {topics}=useTopics();
 return <div className="testcard" style={{'--n':Math.min(4,list.length)} as React.CSSProperties} aria-label={t('fe.fd.myInterests')}>
  <b className="attachment-title">{t('fe.fd.myInterests')}</b>
  <Jars list={list.map(j=>({...j,vis:'public'}) as unknown as Interest)} topics={topics as never} onOpen={id=>{if(!preview)navigate('/n/topics/'+id);}}/>
 </div>;
}

/* ---------- F05: post + replies ---------- */

export function PostScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const location=useLocation();const toast=useToast();
 // The edit screen passes what happened to the edit as `state.notice`.
 const notice=(location.state as {notice?:unknown}|null)?.notice;
 const [post,setPost]=useState<Post|null>(null);const [list,setList]=useState<Reply[]|null>(null);const [error,setError]=useState<unknown>(null);
 const [text,setText]=useState('');const [busy,setBusy]=useState(false);const opId=useRef(newOpId());const box=useRef<HTMLTextAreaElement>(null);
 const [target,setTarget]=useState<Reply|null>(null);const [editing,setEditing]=useState<Reply|null>(null);
 const [sort,setSort]=useState<'top'|'new'>('top');const [open,setOpen]=useState<string[]>([]);const [menu,setMenu]=useState<Reply|null>(null);
 const [liked,setLiked]=useState<Set<string>>(new Set());
 // The server says which replies the acting profile likes, so the heart survives a reload.
 const [delta,setDelta]=useState<Record<string,number>>({});
 const take=useCallback((items:Reply[])=>{setList(items);setDelta({});if(items.some(r=>r.liked!==undefined))setLiked(new Set(items.filter(r=>r.liked).map(r=>r.id)));},[]);
 const loadReplies=useCallback(()=>call('post.replies',{postId:id},replies).then(r=>take(r.items)),[call,id,take]);
 const load=useCallback(()=>{
  setError(null);
  Promise.all([call('post.get',{postId:id},onePost),call('post.replies',{postId:id},replies)])
   .then(([p,r])=>{setPost(p.post);take(r.items);}).catch(setError);
 },[call,id,take]);
 useEffect(()=>{load();},[load]);
 const grow=(el:HTMLTextAreaElement|null)=>{if(!el)return;el.style.height='auto';const h=el.scrollHeight+2;el.style.height=Math.min(120,h)+'px';el.style.overflowY=h>120?'auto':'hidden';};
 const focusBox=()=>{box.current?.focus();};
 const send=async()=>{
  const body=text.trim();if(!body||busy)return;if(body.length>1000){toast(t('fe.fd.max1000'),{type:'err'});return;}setBusy(true);
  try{
   if(editing){await call('reply.edit',{opId:opId.current,replyId:editing.id,rev:editing.rev??1,body},okOnly);setEditing(null);}
   else{await call('reply.create',{opId:opId.current,postId:id,body,...(target?{parentId:target.id}:{})},okOnly);
    if(target){const root=rootOf(list??[],target.id);if(root)setOpen(o=>[...new Set([...o,root])]);}
    setPost(p=>p&&{...p,replies:p.replies+1});setTarget(null);}
   setText('');opId.current=newOpId();requestAnimationFrame(()=>grow(box.current));await loadReplies();
  }catch(e){toast(t('fe.fd.replyFailed')+' '+feErrorMessage(e,t),{type:'err'});opId.current=newOpId();}finally{setBusy(false);}
 };
 // The heart and the count change at once; the server's numbers replace them when the replies reload.
 const likeReply=async(r:Reply)=>{const on=!liked.has(r.id);const d=on?1:-1;
  setLiked(s=>{const n=new Set(s);if(on)n.add(r.id);else n.delete(r.id);return n;});setDelta(x=>({...x,[r.id]:(x[r.id]??0)+d}));
  try{await call('reaction.set',{opId:newOpId(),targetType:'reply',targetId:r.id,on},okOnly);await loadReplies();}
  catch(e){setLiked(s=>{const n=new Set(s);if(on)n.delete(r.id);else n.add(r.id);return n;});setDelta(x=>({...x,[r.id]:(x[r.id]??0)-d}));toast(feErrorMessage(e,t),{type:'err'});}};
 const couple=acting?.kind==='couple';
 return <>
  <Bar title={post?.type==='note'?t('fe.fd.article'):t('fe.feed.post')} back="/n/feed" small/>
  <View className="nodock cta1">
   {error?<Empty icon={Lock} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>navigate('/n/feed')}>{t('fe.feed.toFeed')}</Btn></Empty>
    :!post||!list?<Skel kind="post" rows={1}/>
    :<>
     {typeof notice==='string'&&notice&&<div className="alert ok mb12" role="status"><span>{notice}</span></div>}
     <PostCard post={post} onChange={setPost} full onReply={focusBox} onExpired={()=>{call('post.get',{postId:id},onePost).then(r=>setPost(r.post)).catch(()=>{});}} onRemove={r=>{
      navigate('/n/feed',{replace:true});const undo=r.undo;
      toast(r.notice,{type:'ok',action:undo?{label:t('fe.tl.undo'),fn:()=>{undo().then(()=>navigate('/n/feed/post/'+id),e=>toast(feErrorMessage(e,t),{type:'err'}));}}:null});
     }}/>
     <div className="sec" id="replies">{plural(post.replies,['ответ','ответа','ответов'],['reply','replies'],locale)}</div>
     {list.some(r=>!r.deleted)?<ReplyTree list={list} sort={sort} setSort={setSort} open={open} setOpen={setOpen} liked={liked} delta={delta}
       onLike={likeReply} onReply={r=>{setEditing(null);setTarget(r);focusBox();}} onMore={setMenu}/>
      :<button type="button" className="note-empty" onClick={focusBox}>{t('fe.feed.noReplies')}</button>}
    </>}
  </View>
  {post&&<div className="inputbar">
   {target&&<div className="reply-target"><span>{t('fe.fd.replyTo')} <b>{nameOf(target.author)}</b></span><button type="button" className="ibtn sm" aria-label={t('fe.fd.cancelReply')} onClick={()=>setTarget(null)}><X/></button></div>}
   {editing&&<div className="reply-target"><span>{t('fe.fd.editingReply')}</span><button type="button" className="ibtn sm" aria-label={t('fe.pm.cancel')} onClick={()=>{setEditing(null);setText('');}}><X/></button></div>}
   <textarea ref={box} rows={1} maxLength={1000} value={text} onChange={e=>{setText(e.target.value);grow(e.target);}} placeholder={couple?t('fe.fd.replyPhCouple'):t('fe.fd.replyPh')} aria-label={couple?t('fe.fd.replyAsCouple'):t('fe.fd.reply')}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/>
   <button type="button" className={'ibtn send'+(busy?' busy':'')} onClick={send} disabled={busy||!text.trim()} aria-label={t('fe.feed.send')}><SendHorizontal/></button>
  </div>}
  {menu&&post&&<ReplyMenu reply={menu} onClose={()=>setMenu(null)} onEdit={r=>{setMenu(null);setTarget(null);setEditing(r);setText(r.body??'');requestAnimationFrame(()=>{grow(box.current);focusBox();});}}
   onDone={msg=>{setMenu(null);if(msg)toast(msg,{type:'ok'});loadReplies();call('post.get',{postId:id},onePost).then(r=>setPost(r.post)).catch(()=>{});}}/>}
 </>;
}

const rootOf=(list:Reply[],id:string)=>{const by=new Map(list.map(r=>[r.id,r]));let c=by.get(id);const seen=new Set<string>();
 while(c?.parentId&&by.has(c.parentId)&&!seen.has(c.id)){seen.add(c.id);c=by.get(c.parentId);}return c?.id;};

/** Replies like Threads / X: a top-level reply with a thread line; every answer inside the branch hangs one step in,
 * deeper answers say whom they answer. A long branch shows two answers and «Ещё N ответов». */
function ReplyTree({list,sort,setSort,open,setOpen,liked,delta,onLike,onReply,onMore}:{list:Reply[],sort:'top'|'new',setSort:(s:'top'|'new')=>void,open:string[],setOpen:(f:(o:string[])=>string[])=>void,
 liked:Set<string>,delta:Record<string,number>,onLike:(r:Reply)=>void,onReply:(r:Reply)=>void,onMore:(r:Reply)=>void}){
 const {t,locale}=useI18n();const navigate=useNavigate();const {acting}=useFe();
 const by=useMemo(()=>new Map(list.map(r=>[r.id,r])),[list]);
 const kids=(pid:string)=>list.filter(r=>r.parentId===pid);
 const roots=list.filter(r=>!r.parentId||!by.has(r.parentId));
 const flat=(root:Reply)=>{const out:Reply[]=[];const seen=new Set([root.id]);const walk=(pid:string)=>kids(pid).forEach(c=>{if(seen.has(c.id))return;seen.add(c.id);out.push(c);walk(c.id);});walk(root.id);return out;};
 const lk=(r:Reply)=>Math.max(0,(r.likes??0)+(delta[r.id]??0));const score=(r:Reply)=>{const l=lk(r),n=flat(r).length;return (l>=100?l:0)+(n>=10?n*5:0);};
 const time=(r:Reply)=>new Date(r.createdAt??0).getTime();
 const gone=(r:Reply)=>r.deleted||r.hidden?1:0;
 const ordered=[...roots].sort((a,b)=>(gone(a)-gone(b))||(sort==='top'?score(b)-score(a):0)||(time(b)-time(a)));
 const go=(a:Reply['author'])=>{if(a)navigate(a.id===acting?.id?'/n/me':'/n/people/'+a.id);};
 const one=(c:Reply,root:Reply,child:boolean)=>{const hidden=c.deleted||c.hidden;const parent=c.parentId?by.get(c.parentId):undefined;
  const to=child&&parent&&parent.id!==root.id&&!parent.deleted&&!parent.hidden;const on=liked.has(c.id);
  return <article key={c.id} className={'cm'+(child?' child':'')+(hidden?' removed':'')} id={'reply-'+c.id}>
   <div className="cm-l">{hidden?<span className="av cm-ghost" aria-hidden="true">{c.deleted?<Trash2/>:<Lock/>}</span>
    :<button type="button" className="plink" aria-label={t('fe.fd.profileOf',{name:nameOf(c.author)})} onClick={()=>go(c.author)}><Av name={nameOf(c.author)} seed={c.author?.id??c.id} size={child?'xs':'sm'} src={c.author?.avatar}/></button>}</div>
   <div className="cm-b">{hidden?<p className="note">{c.deleted?t('fe.feed.replyDeleted'):t('fe.fd.replyBlocked')}</p>:<>
    <div className="cm-h"><button type="button" className="plink pnm" onClick={()=>go(c.author)}><span className="nmt">{nameOf(c.author)}</span></button><time>{when(c.createdAt,locale)}{c.editedAt?' · '+t('fe.fd.edited'):''}</time></div>
    {to&&<small className="cm-to">{t('fe.fd.replyingTo')} <button type="button" className="plink" onClick={()=>go(parent!.author)}>{nameOf(parent!.author)}</button></small>}
    <p className="reply-text">{c.body}</p>
    <div className="r-acts">
     <button type="button" className={on?'on':''} aria-pressed={on} aria-label={t('fe.fd.likeReply')} onClick={()=>onLike(c)}><Heart fill={on?'currentColor':'none'}/>{lk(c)>0&&<span>{lk(c)}</span>}</button>
     <button type="button" aria-label={t('fe.fd.replyToName',{name:nameOf(c.author)})} onClick={()=>onReply(c)}><MessageCircle/></button>
     <button type="button" aria-label={t('fe.more')} onClick={()=>onMore(c)}><Ellipsis/></button>
    </div>
   </>}</div>
  </article>;};
 return <>
  {roots.length>1&&<div className="fl-row cm-sort"><span className="sortlab"><ArrowUpDown/>{t('fe.fd.sort')}</span>
   <label className="selrow solo"><span className="selv" aria-hidden="true">{sort==='top'?t('fe.fd.sortTop'):t('fe.fd.sortNew')}</span>
    <select value={sort} onChange={e=>setSort(e.target.value as 'top'|'new')} aria-label={t('fe.fd.sortAria')}><option value="top">{t('fe.fd.sortTop')}</option><option value="new">{t('fe.fd.sortNew')}</option></select></label></div>}
  {ordered.map(root=>{const all=flat(root);const isOpen=open.includes(root.id)||all.length<=3;const shown=isOpen?all:all.slice(0,2);const rest=all.length-shown.length;
   return <div key={root.id} className={'th'+(all.length?' has-kids':'')}>{one(root,root,false)}
    {all.length>0&&<div className="cm-kids">{shown.map(c=>one(c,root,true))}
     {rest>0&&<button type="button" className="cm-more" onClick={()=>setOpen(o=>[...new Set([...o,root.id])])}>
      <span className="cm-avs">{[...new Map(all.slice(2).filter(c=>c.author).map(c=>[c.author!.id,c.author!])).values()].slice(0,3).map(a=><Av key={a.id} name={nameOf(a)} seed={a.id} size="xs" src={a.avatar}/>)}</span>
      {t('fe.fd.moreReplies',{n:plural(rest,['ответ','ответа','ответов'],['reply','replies'],locale)})}</button>}
     {isOpen&&all.length>3&&<button type="button" className="cm-more less" onClick={()=>setOpen(o=>o.filter(x=>x!==root.id))}>{t('fe.fd.collapse')}</button>}
    </div>}
   </div>;})}
 </>;
}

/* ---------- F07: the composer (new / draft / edit) and F09: preview ---------- */

const saved=z.object({ok:z.literal(true),id:z.uuid()}).passthrough();
const published=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
const uploadIntent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const edited=z.object({ok:z.literal(true),state:z.string().optional(),rev:z.number().optional(),review:z.boolean().optional(),pending:z.unknown().optional()}).passthrough();
const followRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable()}).passthrough())});
type Audience='all'|'followers'|'granted'|'only';
const POLL_MAX=10,MEDIA_MAX=6,NOTE_MAX=10000;

/** V21 F07 in edit mode: the composer over an own post; the server decides whether the edit is live, goes to review or waits for the partner. */
export function EditPostScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [post,setPost]=useState<Post|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{setError(null);call('post.get',{postId:id},onePost).then(r=>setPost(r.post)).catch(setError);},[call,id]);
 if(error||(post&&post.rev==null))return <><Bar title={t('fe.fd.editPost')} back small/><View>
  <Empty icon={Lock} title={t('fe.feed.unavailable')} {...(error?{text:feErrorMessage(error,t)}:{})}><Btn kind="soft" onClick={()=>navigate('/n/feed')}>{t('fe.feed.toFeed')}</Btn></Empty></View></>;
 if(!post)return <><Bar title={t('fe.fd.editPost')} back small/><View><Skel kind="card" rows={2}/></View></>;
 return <ComposeScreen edit={post}/>;
}

type MediaDraft={id:string,preview:string};
type Person={id:string,name:string};

export function ComposeScreen({edit}:{edit?:Post}={}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [params]=useSearchParams();const toast=useToast();
 const communityId=edit?null:params.get('community');const x=params.get('x');
 const {topics:catalog,cats,name:tname}=useTopics();const {items:myJars,topics:jarTopics}=useInterests();
 const draft=edit?.state==='draft';const live=!!edit&&!draft;
 const [note,setNote]=useState(edit?edit.type==='note':x==='note');
 const [title,setTitle]=useState(edit?.title??'');
 const [body,setBody]=useState(edit?.body??'');
 const [audience,setAudience]=useState<Audience>(()=>(['all','followers','granted','only'] as const).includes(edit?.audience as Audience)?edit!.audience as Audience:'all');
 const [inFeed,setInFeed]=useState(edit?.inFeed??true);
 const [media,setMedia]=useState<MediaDraft[]>(()=>edit?edit.media.map(m=>({id:m.id,preview:mediaSrc(m)??''})):[]);
 const [poll,setPoll]=useState<{question:string,options:string[]}|null>(()=>edit?.poll?{question:edit.poll.question,options:[...edit.poll.options]}:x==='poll'?{question:'',options:['','']}:null);
 const [interests,setInterests]=useState<string[]|null>(()=>edit?.interests?.length?edit.interests.map(i=>i.topicId):null);
 const [topics,setTopics]=useState<string[]>(edit?.topics??[]);
 const [people,setPeople]=useState<Person[]>(()=>(edit?.tags??[]).map(x=>({id:x.id,name:nameOf(x)})));
 const [postId,setPostId]=useState<string|undefined>(draft?edit?.id:undefined);
 const [busy,setBusy]=useState<''|'publish'|'draft'>('');const [failure,setFailure]=useState('');const [errs,setErrs]=useState<Record<string,string>>({});
 const [uploading,setUploading]=useState(false);const file=useRef<HTMLInputElement>(null);const text=useRef<HTMLTextAreaElement>(null);
 const [sheet,setSheet]=useState<'topics'|'people'|null>(null);const [preview,setPreview]=useState(false);const [viewer,setViewer]=useState<number|null>(null);
 const ops=useRef({draft:newOpId(),publish:newOpId(),edit:newOpId()});
 const couple=acting?.kind==='couple';
 useEffect(()=>{if(x==='media'&&!edit)setTimeout(()=>file.current?.click(),250);},[x,edit]);
 // Interests a post may carry: the author's own public ones with a level, never limits (server rule).
 const eligible=(myJars??[]).filter(j=>j.vis==='public'&&j.value!=null&&!j.mark&&catalog.find(c=>c.id===j.topicId)?.categoryId!=='limits');
 const addMedia=async(files:FileList)=>{
  setFailure('');
  for(const f of [...files].slice(0,MEDIA_MAX-media.length)){
   if(!['image/jpeg','image/png','image/webp'].includes(f.type)){setFailure(t('fe.me.photoType'));continue;}
   if(f.size>20*1024*1024){setFailure(t('fe.me.photoSize'));continue;}
   setUploading(true);
   try{
    const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'post',kind:'image',mime:f.type,bytes:f.size},uploadIntent);
    const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:f});
    if(!put.ok)throw new Error('upload');
    await call('media.commit',{assetId:i.assetId},okOnly);
    setMedia(m=>[...m,{id:i.assetId,preview:URL.createObjectURL(f)}]);setErrs(e=>{const {media:_m,...rest}=e;return rest;});
   }catch(e){setFailure(feErrorMessage(e,t));}finally{setUploading(false);}
  }
  if(file.current)file.current.value='';
 };
 const max=note?NOTE_MAX:1000;
 const fields=()=>({type:note?'note' as const:'post' as const,...(note&&title.trim()?{title:title.trim()}:{}),body:body.trim(),audience,inFeed,topics,mediaIds:media.map(m=>m.id),
  ...(poll?{poll:{question:poll.question.trim(),options:poll.options.map(o=>o.trim())}}:{}),interests:interests??[],tags:audience==='all'&&media.length?people.map(p=>p.id):[],...(communityId?{communityId}:{})});
 const validate=()=>{const e:Record<string,string>={};
  if(note&&title.trim().length<3)e.title=t('fe.fd.err.title');
  if(note&&body.trim().length<20)e.body=t('fe.fd.err.noteBody');
  if(!note&&!body.trim()&&!media.length&&!poll&&!(interests?.length))e.body=t('fe.fd.err.empty');
  if(body.length>max)e.body=t('fe.fd.err.long',{n:max});
  if(poll){if(!poll.question.trim())e.pollQ=t('fe.fd.err.pollQ');
   poll.options.forEach((o,i)=>{if(!o.trim())e['o'+i]=t('fe.fd.err.option');});
   const low=poll.options.map(o=>o.trim().toLowerCase()).filter(Boolean);if(new Set(low).size!==low.length)e.opts=t('fe.fd.err.dupes');}
  if(interests&&!interests.length)e.interests=t('fe.fd.err.interests');
  setErrs(e);if(Object.keys(e).length){setFailure(t('fe.fd.err.check'));return false;}setFailure('');return true;};
 const snap=JSON.stringify([title,fields()]);const clean=useRef(snap);const [ask,setAsk]=useState(false);
 const done=(state:string|undefined)=>{
  const msg=state==='review'?t('fe.fd.sentReview'):state==='pending_partner'?t('fe.fd.sentPartner'):!inFeed?t('fe.fd.publishedProfile'):t('fe.fd.published');
  toast(msg,{type:'ok',action:{label:t('fe.fd.myPosts'),fn:()=>navigate('/n/me/posts')}});
  navigate(communityId?'/n/communities/'+communityId:state==='review'||state==='pending_partner'?'/n/me/posts':'/n/feed',{replace:true});
 };
 const publish=async()=>{
  if(busy||uploading||!validate())return;setBusy('publish');setFailure('');
  try{
   if(live){
    const r=await call('post.edit',{opId:ops.current.edit,postId:edit!.id,rev:edit!.rev!,post:fields()},edited);
    const notice=r.pending!=null?t('fe.pm.ed.pending'):r.review?t('fe.pm.ed.review'):t('fe.pm.ed.saved');
    navigate('/n/feed/post/'+edit!.id,{replace:true,state:{notice}});return;
   }
   const d=await call('post.saveDraft',{opId:ops.current.draft,...(postId?{postId}:{}),post:fields()},saved);setPostId(d.id);
   const r=await call('post.publish',{opId:ops.current.publish,postId:d.id},published);
   done(r.state);
  }catch(e){setFailure(feErrorMessage(e,t));ops.current={draft:newOpId(),publish:newOpId(),edit:newOpId()};}
  finally{setBusy('');}
 };
 const saveDraft=async():Promise<boolean>=>{
  if(busy||uploading)return false;
  if(!body.trim()&&!media.length&&!poll){setErrs({body:t('fe.fd.err.emptyDraft')});return false;}
  setBusy('draft');setFailure('');
  try{const d=await call('post.saveDraft',{opId:ops.current.draft,...(postId?{postId}:{}),post:fields()},saved);setPostId(d.id);ops.current.draft=newOpId();clean.current=snap;
   toast(couple?t('fe.fd.draftSavedUs'):t('fe.fd.draftSavedMe'),{type:'ok',action:{label:t('fe.fd.open'),fn:()=>navigate('/n/me/posts')}});return true;}
  catch(e){setFailure(feErrorMessage(e,t));ops.current.draft=newOpId();return false;}finally{setBusy('');}
 };
 // V21 FEED-018: leaving with unsent changes offers to keep them (a draft, or the edit of a live post) instead of losing them.
 // Opened by a link (no app history): back goes to the feed instead of leaving the app.
 const back=()=>{if(((window.history.state as {idx?:number}|null)?.idx??0)>0)navigate(-1);else navigate(communityId?'/n/communities/'+communityId:'/n/feed',{replace:true});};
 const leave=()=>{if(!communityId&&snap!==clean.current){setAsk(true);return;}back();};
 const hasMedia=media.length>0;
 const cta=live?(hasMedia?t('fe.fd.cta.changesReview'):t('fe.fd.cta.saveChanges')):couple?(hasMedia?t('fe.fd.cta.reviewUs'):t('fe.fd.cta.publishUs')):hasMedia?t('fe.fd.cta.review'):t('fe.feed.publish');
 const AUDS:[Audience,LucideIcon,string,string][]=[['all',Globe,t('fe.fd.aud2.all'),couple?t('fe.fd.aud2.allSubUs'):t('fe.fd.aud2.allSub')],['followers',Users,t('fe.fd.aud2.followers'),couple?t('fe.fd.aud2.followersSubUs'):t('fe.fd.aud2.followersSub')],
  ['granted',KeyRound,t('fe.fd.aud2.granted'),couple?t('fe.fd.aud2.grantedSubUs'):t('fe.fd.aud2.grantedSub')],...(edit?.audience==='only'?[['only',EyeOff,t('fe.fd.aud2.only'),t('fe.fd.aud2.onlySub')] as [Audience,LucideIcon,string,string]]:[])];
 const aud=AUDS.find(a=>a[0]===audience)??AUDS[0]!;const AudIcon=aud[1];
 const who=[communityId||!inFeed?'':aud[3],couple?t('fe.fd.asCoupleLine'):'',hasMedia?(live?t('fe.fd.hintLive'):t('fe.fd.hintReview')):''].filter(Boolean).join('. ');
 const barTitle=communityId?t('fe.comm.newTopic'):draft?(note?t('fe.fd.noteDraft'):t('fe.fd.draft')):edit?(note?t('fe.fd.editNote'):t('fe.fd.editPost')):note?t('fe.fd.newNote'):t('fe.feed.new');
 const audSelect=(label?:string)=><label className={'selrow'+(label?'':' solo')}>{label&&<span className="selt">{label}</span>}<span className="selv" aria-hidden="true">{aud[2]}</span>
  <select value={audience} onChange={e=>{const v=e.target.value as Audience;setAudience(v);if(v!=='all'&&people.length)toast(t('fe.fd.tagsNeedAll'),{type:'info'});}} aria-label={t('fe.feed.audience')}>{AUDS.map(a=><option key={a[0]} value={a[0]}>{a[2]}</option>)}</select></label>;
 const err=(k:string)=>errs[k]?<div className="ferr">{errs[k]}</div>:null;
 const insertAt=()=>{const el=text.current;const s=el?.selectionStart??body.length;const pre=body.slice(0,s);const add=(pre&&!/\s$/.test(pre)?' ':'')+'@';setBody(pre+add+body.slice(s));
  requestAnimationFrame(()=>{el?.focus();const p=s+add.length;el?.setSelectionRange(p,p);});};

 if(preview){
  const fake:Post={id:edit?.id??'00000000-0000-7000-8000-000000000000',type:note?'note':'post',title:note?title.trim():null,body:body.trim(),author:{id:acting?.id??'',kind:acting?.kind??'person',handle:acting?.handle??null,name:acting?.name??nameOf(acting),avatar:acting?.avatar??null},
   media:media.map(m=>({id:m.id,kind:'image',w:null,h:null,pending:false,blurred:false,src:{card:m.preview,full:m.preview}})),topics,likes:0,liked:false,replies:0,saved:false,publishedAt:null,
   ...(audience!=='all'?{audience}:{}),poll:poll?{question:poll.question,options:poll.options,myVote:null,results:null}:null,interests:interests?.map(id=>{const j=eligible.find(e=>e.topicId===id);return {topicId:id,value:j?.value??null,dir:j?.dir};})??null,tags:[]};
  const steps=[people.length&&audience==='all'&&hasMedia?t('fe.fd.next.marks',{names:people.map(p=>p.name).join(', ')}):'',hasMedia?t('fe.fd.next.review'):'',hasMedia||people.length?(live?t('fe.fd.next.oldVersion'):t('fe.fd.next.onlyYou')):''].filter(Boolean);
  return <>
   <header className="bar"><button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>setPreview(false)}><ChevronLeft/></button><h1 className="sm" tabIndex={-1}>{t('fe.fd.preview')}</h1></header>
   <View className="nodock cta1">
    <div className="card preview-post" style={{padding:'0 16px',marginTop:10}}><PostCard post={fake} onChange={()=>{}} onRemove={()=>{}} full preview/></div>
    {!communityId&&<div className="card list mt16"><div className="li"><span className="ico v"><Eye/></span>{audSelect(t('fe.feed.audience'))}</div></div>}
    {steps.length>0&&<div className="card mt16 next-steps"><b>{t('fe.fd.next.title')}</b><ul>{steps.map(s=><li key={s}>{s}</li>)}</ul></div>}
    {failure&&<p className="alert err mt12" role="alert">{failure}</p>}
   </View>
   <div className="ctabar"><div className="wrap"><div className="row g8">
    <Btn kind="soft" style={{flex:'0 0 auto',width:'auto'}} onClick={()=>setPreview(false)}>{t('fe.fd.change')}</Btn>
    <Btn onClick={publish} disabled={!!busy||uploading} busy={busy==='publish'}>{cta}</Btn>
   </div></div></div>
  </>;
 }

 return <>
  <header className="bar"><button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={leave}><ChevronLeft/></button><h1 className="sm" tabIndex={-1}>{barTitle}</h1>
   {!communityId&&!live&&<button type="button" className={'btn text auto'+(busy==='draft'?' busy':'')} disabled={!!busy} onClick={saveDraft}>{t('fe.fd.toDraft')}</button>}</header>
  <View className="nodock cta1">
   {note&&<div className="note-mode"><span className="chip on"><FileText/>{t('fe.fd.article')}</span>
    <button type="button" className="btn text auto" onClick={()=>{if(body.length>1000){toast(t('fe.fd.noteTooLong'),{type:'warn'});return;}setNote(false);}}>{t('fe.fd.makeRegular')}</button></div>}
   <section className="grp"><div className="card compose v14">
    {!communityId&&<div className="cmp-ctx"><div className="cmp-aud"><AudIcon/>{audSelect()}</div></div>}
    {who&&<p className="cmp-who">{who}</p>}
    {note&&<div className={'field'+(errs.title?' err':'')}><label htmlFor="ntitle">{t('fe.fd.title')}</label><input id="ntitle" className="inp" value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder={t('fe.fd.titlePh')}/>{err('title')}</div>}
    <div className={'field'+(errs.body?' err':'')}>
     <textarea ref={text} className="inp" rows={note?10:6} maxLength={max} value={body} onChange={e=>setBody(e.target.value)} autoFocus={!x}
      placeholder={note?t('fe.fd.notePh'):poll?t('fe.fd.pollPh'):couple?t('fe.fd.composePhUs'):t('fe.fd.composePh')} aria-label={t('fe.fd.text')}/>
     <div className="counter">{body.length} / {max}</div>{err('body')}
    </div>
    {hasMedia&&<div className="cmp-media"><section className="grp"><div className="grp-t"><span>{t('fe.fd.mediaN',{n:media.length,max:MEDIA_MAX})}</span></div>
     <div className="card"><div className="edit-ph">{media.map((m,i)=><div key={m.id}><img src={m.preview} alt=""/>
      <button type="button" className="rm" aria-label={t('fe.fd.remove')} onClick={()=>setMedia(l=>l.filter(y=>y.id!==m.id))}><X/></button>
      <button type="button" className="vw" aria-label={t('fe.fd.view')} onClick={()=>setViewer(i)}/></div>)}
      {media.length<MEDIA_MAX&&<button type="button" aria-label={t('fe.fd.addMedia')} disabled={uploading} onClick={()=>file.current?.click()}><Plus/></button>}</div>
      {audience==='all'&&<div className="card list mt8"><button type="button" className="li" onClick={()=>setSheet('people')}><span className="ico v"><Users/></span>
       <span className="tx"><b>{t('fe.fd.peopleInPhoto')}</b><small>{people.length?people.map(p=>p.name+(edit?.tags?.find(x=>x.id===p.id)?.state==='no'?` (${t('fe.fd.declinedShort')})`:edit?.tags?.find(x=>x.id===p.id)?.state==='ok'?'':` (${t('fe.fd.waitingShort')})`)).join(', '):t('fe.fd.peopleInPhotoSub')}</small></span><ChevronRight/></button></div>}
     </div>
     <p className="grp-n">{audience==='granted'?t('fe.fd.mediaGranted'):t('fe.fd.mediaFoot')}</p></section></div>}
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>{if(e.target.files?.length)void addMedia(e.target.files);}}/>
    <div className="attach v14">
     {!hasMedia&&<button type="button" disabled={uploading} onClick={()=>file.current?.click()}><ImageIcon/><span>{t('fe.feed.media')}</span></button>}
     {!poll&&<button type="button" onClick={()=>setPoll({question:'',options:['','']})}><ChartColumn/><span>{t('fe.feed.poll')}</span></button>}
     {!communityId&&!note&&<button type="button" onClick={()=>setNote(true)}><FileText/><span>{t('fe.fd.article')}</span></button>}
     <button type="button" onClick={insertAt}><AtSign/><span>{t('fe.fd.mention')}</span></button>
     {interests===null&&!communityId&&<button type="button" title={t('fe.fd.myInterestsHint')} onClick={()=>{if(!eligible.length){toast(t('fe.fd.noPublicInterests'),{type:'info',action:{label:t('fe.fd.open'),fn:()=>navigate('/n/me')}});return;}setInterests(eligible.slice(0,4).map(j=>j.topicId));}}><Sparkles/><span>{t('fe.fd.myInterests')}</span></button>}
    </div>
   </div>
   {!communityId&&!(audience==='granted'&&!inFeed)&&<div className="card list cmp-feed">
    <button type="button" className="li" role="switch" aria-checked={inFeed} onClick={()=>setInFeed(v=>!v)}>
     <span className="tx"><b>{t('fe.feed.inFeed')}</b><small>{inFeed?t('fe.feed.inFeedOn'):hasMedia?t('fe.fd.onlyProfileGallery'):t('fe.fd.onlyProfile')}</small></span>
     <span className={'sw'+(inFeed?' on':'')} aria-hidden="true"/>
    </button>
   </div>}
   {err('media')}
   </section>
   {poll&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.pollN',{n:poll.options.length,max:POLL_MAX})}</span><button type="button" onClick={()=>setPoll(null)}>{t('fe.fd.remove')}</button></div>
    <div className="card">
     <div className={'field'+(errs.pollQ?' err':'')}><label htmlFor="pollQ">{t('fe.fd.question')}</label><input id="pollQ" className="inp" value={poll.question} maxLength={200} placeholder={t('fe.fd.questionPh')} onChange={e=>setPoll({...poll,question:e.target.value})}/>{err('pollQ')}</div>
     {poll.options.map((o,i)=><div key={i} className={'field pollopt'+(errs['o'+i]?' err':'')}><div className="inwrap"><span className="n">{i+1}</span>
      <input className="inp" value={o} maxLength={80} placeholder={t('fe.fd.option',{n:i+1})} aria-label={t('fe.fd.option',{n:i+1})} onChange={e=>setPoll({...poll,options:poll.options.map((v,k)=>k===i?e.target.value:v)})}/>
      {poll.options.length>2&&<button type="button" className="ibtn ghost sm" aria-label={t('fe.fd.removeOption')} onClick={()=>setPoll({...poll,options:poll.options.filter((_,k)=>k!==i)})}><X/></button>}</div></div>)}
     {poll.options.length<POLL_MAX&&<button type="button" className="btn text auto" onClick={()=>setPoll({...poll,options:[...poll.options,'']})}><Plus/>{t('fe.fd.addOption')}</button>}
     {err('opts')}
    </div>
    <p className="grp-n">{t('fe.fd.pollFoot')}{edit?.poll?' '+t('fe.fd.pollReset'):''}</p></section>}
   {interests!==null&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.interests')}</span><button type="button" onClick={()=>setInterests(null)}>{t('fe.fd.remove')}</button></div>
    <div className="card">
     {interests.length>0&&<div className="testcard" style={{'--n':Math.min(4,interests.length)} as React.CSSProperties}><Jars list={eligible.filter(j=>interests.includes(j.topicId))} topics={jarTopics} onOpen={()=>{}}/></div>}
     <div className="chips mt12">{eligible.map(j=>{const on=interests.includes(j.topicId);return <button key={j.topicId} type="button" className={'chip'+(on?' on':'')} aria-pressed={on}
      onClick={()=>{if(!on&&interests.length>=4){toast(t('fe.fd.max4'),{type:'warn'});return;}setInterests(on?interests.filter(v=>v!==j.topicId):[...interests,j.topicId]);}}>{tname(j.topicId)}</button>;})}</div>
     {err('interests')}
    </div>
    <p className="grp-n">{t('fe.fd.interestsFoot')}</p></section>}
   <section className="grp"><div className="grp-t"><span>{t('fe.fd.topicsUpTo3')}</span></div>
    <div className="chips">{[...new Set([...topics,...catalog.slice(0,4).map(c=>c.id)])].map(id=>{const on=topics.includes(id);return <button key={id} type="button" className={'chip'+(on?' on':'')} aria-pressed={on}
     onClick={()=>{if(!on&&topics.length>=3){toast(t('fe.fd.max3'),{type:'warn'});return;}setTopics(on?topics.filter(v=>v!==id):[...topics,id]);}}>{tname(id)}</button>;})}
     {catalog.length>0&&<button type="button" className="chip more" onClick={()=>setSheet('topics')}><Search/>{t('fe.br.seeAll')} · {catalog.length}</button>}</div>
    <p className="grp-n">{couple?t('fe.fd.topicsFootUs'):t('fe.fd.topicsFoot')}</p></section>
   {failure&&<p className="alert err" role="alert">{failure}</p>}
  </View>
  <div className="ctabar"><div className="wrap"><div className="row g8">
   <button type="button" className="btn soft prevbtn" style={{flex:'0 0 auto',width:'auto'}} aria-label={t('fe.fd.preview')} onClick={()=>{if(validate())setPreview(true);}}><Eye/><span>{t('fe.fd.howSeen')}</span></button>
   <Btn onClick={publish} disabled={!!busy||uploading} busy={busy==='publish'}>{cta}</Btn>
  </div></div></div>
  {sheet==='topics'&&<FilterSheet title={t('fe.fd.topicsTitle')} topics={catalog} cats={cats} popular={topics} value={topics} onClose={()=>setSheet(null)}
   onApply={v=>{if(v.length>3){toast(t('fe.fd.max3'),{type:'warn'});return;}setTopics(v);setSheet(null);}}/>}
  {sheet==='people'&&<PeopleSheet value={people} onClose={()=>setSheet(null)} onApply={v=>{setPeople(v);setSheet(null);}} locked={(edit?.tags??[]).filter(x=>x.state==='no').map(x=>x.id)}/>}
  {viewer!==null&&<Viewer srcs={media.map(m=>m.preview)} index={viewer} onClose={()=>setViewer(null)}/>}
  {ask&&<LeaveAsk live={live} busy={!!busy} onCancel={()=>setAsk(false)} onDiscard={()=>{setAsk(false);back();}}
   onSave={async()=>{if(live){setAsk(false);await publish();return;}const ok=await saveDraft();setAsk(false);if(ok)back();}}/>}
 </>;
}

function LeaveAsk({live,busy,onSave,onDiscard,onCancel}:{live:boolean,busy:boolean,onSave:()=>void,onDiscard:()=>void,onCancel:()=>void}){
 const {t}=useI18n();useEsc(onCancel);
 return <Layer><div className="scrim on" onClick={onCancel}/>
  <div className="dialog on" role="alertdialog" aria-modal="true" aria-label={live?t('fe.fd.leave.editTitle'):t('fe.fd.leave.draftTitle')} tabIndex={-1} ref={focusOnce}>
   <div className="ico v"><Pencil/></div><h2>{live?t('fe.fd.leave.editTitle'):t('fe.fd.leave.draftTitle')}</h2><p>{live?t('fe.fd.leave.editText'):t('fe.fd.leave.draftText')}</p>
   <div className="btns"><Btn onClick={onSave} disabled={busy} busy={busy}>{live?t('fe.fd.cta.saveChanges'):t('fe.fd.leave.saveDraft')}</Btn>
    <Btn kind="soft" className="danger" onClick={onDiscard} disabled={busy}>{t('fe.fd.leave.discard')}</Btn><Btn kind="soft" onClick={onCancel} disabled={busy}>{t('fe.pm.cancel')}</Btn></div>
  </div></Layer>;
}


/** `ACT.tagPeople` — mark people in the photos: the profiles the author follows; a person who declined stays marked
 * while the photos are the same. */
function PeopleSheet({value,locked,onClose,onApply}:{value:Person[],locked:string[],onClose:()=>void,onApply:(v:Person[])=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const [list,setList]=useState<Person[]|null>(null);const [sel,setSel]=useState(value);const [q,setQ]=useState('');
 useEsc(onClose);
 useEffect(()=>{if(!acting)return;call('profile.followers',{profileId:acting.id,following:true},followRes)
  .then(r=>setList(r.items.filter(p=>p.kind==='person').map(p=>({id:p.id,name:nameOf(p)})))).catch(()=>setList([]));},[call,acting]);
 const low=q.trim().toLowerCase();const all=[...new Map([...value,...(list??[])].map(p=>[p.id,p])).values()].filter(p=>!low||p.name.toLowerCase().includes(low));
 return <Layer><div className="scrim on" onClick={onClose}/>
  <div className="sheet full on" role="dialog" aria-modal="true" aria-label={t('fe.fd.peopleInPhoto')} tabIndex={-1} ref={focusOnce}>
   <div className="grab"/><SheetHead title={t('fe.fd.peopleInPhoto')} onClose={onClose}/>
   <div className="sh-search"><div className="inwrap"><Search/><input className="inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.fd.findPerson')} aria-label={t('fe.fd.findPerson')}/></div></div>
   <div className="sh-b">{list===null?<Skel kind="list"/>:!all.length?<p className="note">{t('fe.fd.noFollowingToMark')}</p>
    :<div className="card list">{all.map(p=>{const on=sel.some(s=>s.id===p.id);const lock=locked.includes(p.id);
     return <button key={p.id} type="button" className="li" aria-pressed={on} aria-disabled={lock} onClick={()=>{if(lock)return;setSel(s=>on?s.filter(x=>x.id!==p.id):[...s,p]);}}>
      <Av name={p.name} seed={p.id} size="sm"/><span className="tx"><b>{p.name}</b>{lock&&<small>{t('fe.fd.lockedMark')}</small>}</span><span className={'ck'+(on?' on':'')}>{on&&<Check/>}</span></button>;})}</div>}
    <p className="grp-n">{t('fe.fd.marksFoot')}</p></div>
   <div className="sh-f"><Btn onClick={()=>onApply(sel)}>{t('fe.fd.done')}</Btn></div>
  </div></Layer>;
}
