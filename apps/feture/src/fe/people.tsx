import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Ban,ChevronLeft,ChevronRight,Ellipsis,Eye,Heart,History,Info,Lock,MapPin,Search as SearchIcon,SlidersHorizontal,Undo2,Users,X} from 'lucide-react';
import {Av,Bar,Btn,Empty,Seg,View,Layer,Skel} from './ui';
import {useFe} from './session';
import {PhotoBadge} from './photo-check';
import {PrivateOf} from './private';
import {ProfileLinks} from './browse';
import {CompatSummary,LinksSection,PersonBio,PersonHero,PersonMenu,PersonPhotos,personName,personProfileRes,pxError,useToast,type MenuStep,type PersonProfile} from './profile-extras';

/** Slice F (V21 D03–D09) plus people search (F2): Discover cards from the server's mutual pool, like / pass,
 * «It's mutual» → chat, incoming likes, nickname search and another person's profile. The client shows only what
 * the server returned: no invented matches, counters or scores. */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
const card=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),ages:z.array(z.number()),
 city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),likedMe:z.boolean(),shared:z.number(),photoVerified:z.boolean().optional()});
type Card=z.infer<typeof card>;
const deck=z.object({ok:z.literal(true),off:z.boolean(),items:z.array(card)});
const decided=z.object({ok:z.literal(true),decision:z.enum(['like','pass']),state:z.string().optional(),conversationId:z.uuid().optional()}).passthrough();
const list=z.object({ok:z.literal(true),items:z.array(card)});
const incoming=z.object({ok:z.literal(true),items:z.array(z.object({profile:card}).passthrough())}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const undone=z.object({ok:z.literal(true),profileId:z.uuid(),decision:z.enum(['like','pass'])}).passthrough();

function photo(c:{avatar:z.infer<typeof media>|null}){return c.avatar?.src?.card??c.avatar?.src?.full??c.avatar?.src?.thumb??null;}
function sub(c:Card,locale:string){return [c.ages.length?c.ages.join(' · '):null,c.city?(locale==='en'?c.city.en:c.city.ru):null].filter(Boolean).join(', ');}

export function PeopleTab(){
 const {t}=useI18n();const {call}=useFe();const [tab,setTab]=useState<'discover'|'likes'|'search'>('discover');
 const [off,setOff]=useState(false);const [filter,setFilter]=useState<Filter|null>(null);const [open,setOpen]=useState(false);const [deckKey,setDeckKey]=useState(0);
 const opener=useRef<HTMLButtonElement>(null);const navigate=useNavigate();
 useEffect(()=>{call('discover.filter',{},filterRes).then(r=>setFilter(r.filter)).catch(()=>{});},[call]);
 const close=useCallback(()=>{setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));},[]);
 const on=filter?dfOn(filter):0;
 return <>
  <header className="bar dating-bar">
   <Seg small={false} value={tab} onChange={setTab} options={(['discover','likes','search'] as const).map(id=>({id,label:t('fe.people.tab.'+id)}))}/>
   {tab==='discover'&&!off&&filter&&<button ref={opener} type="button" className="ibtn" aria-haspopup="dialog" aria-label={on?t('fe.df.openOn').replace('{n}',String(on)):t('fe.df.open')} onClick={()=>setOpen(true)}><SlidersHorizontal/>{on>0&&<sup>{on}</sup>}</button>}
   {tab==='discover'&&!off&&<button type="button" className="ibtn" aria-label={t('fe.px.h.open')} onClick={()=>navigate('/n/people/history')}><History/></button>}
  </header>
  {tab==='discover'?<Discover reloadKey={deckKey} onOff={setOff}/>:<View>{tab==='likes'?<Likes/>:<Search/>}</View>}
  {open&&filter&&<DiscoverFilter initial={filter} onClose={close} onApplied={f=>{setFilter(f);setDeckKey(k=>k+1);close();}}/>}
 </>;
}

/* V21 D04 «Фильтры знакомств» (prototype dfSheet): the draft lives in the sheet until «Показать · N»; N is the server's
 * capped count (discover.count), «Показать» saves with discover.setFilter and reloads the deck. «Где искать» needs a
 * location and comes later; a city saved earlier is kept as is. */
const filterShape=z.object({show:z.enum(['all','people','pairs']),ageMin:z.number(),ageMax:z.number(),cityId:z.string().nullable(),
 genders:z.array(z.string()),orients:z.array(z.string()),formats:z.array(z.string()),seeks:z.array(z.string()),roles:z.array(z.string()),topics:z.array(z.string())});
type Filter=z.infer<typeof filterShape>;
const filterRes=z.object({ok:z.literal(true),filter:filterShape});
const countRes=z.object({ok:z.literal(true),count:z.number(),capped:z.boolean()});
const named={ru:z.string().nullable(),en:z.string().nullable()};
const dfCatalog=z.object({ok:z.literal(true),options:z.array(z.object({kind:z.string(),code:z.string(),...named})),
 topics:z.array(z.object({id:z.string(),categoryId:z.string(),...named}).passthrough()),
 categories:z.array(z.object({id:z.string(),...named}).passthrough()),
 places:z.array(z.object({id:z.string(),...named}).passthrough())});
type DfCatalog=z.infer<typeof dfCatalog>;
const DF_ROWS=[['genders','gender'],['orients','orient'],['formats','format'],['seeks','seek'],['roles','role'],['topics','']] as const;
type DfRow=typeof DF_ROWS[number][0];
const DF_DEFAULT:Filter={show:'all',ageMin:18,ageMax:99,cityId:null,genders:[],orients:[],formats:[],seeks:[],roles:[],topics:[]};
// Topics people are not searched by (prototype dfRows); the server refuses them as well.
const DF_HIDDEN=new Set(['limits','edge','safety']);
const dfOn=(f:Filter)=>[f.show!=='all',f.ageMin!==18||f.ageMax!==99,!!f.cityId,...DF_ROWS.map(([k])=>f[k].length>0)].filter(Boolean).length;
const fill=(s:string,n:number|string)=>s.replace('{n}',String(n));

function DiscoverFilter({initial,onClose,onApplied}:{initial:Filter,onClose:()=>void,onApplied:(f:Filter)=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [f,setF]=useState<Filter>(initial);const [sub,setSub]=useState<DfRow|null>(null);const [q,setQ]=useState('');
 const [cat,setCat]=useState<DfCatalog|null>(null);const [count,setCount]=useState<{count:number,capped:boolean}|null>(null);
 const [countError,setCountError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>(null);
 const sheet=useRef<HTMLDivElement>(null);const body=useRef<HTMLDivElement>(null);
 const lab=(x:{ru:string|null,en:string|null})=>(locale==='en'?x.en||x.ru:x.ru||x.en)||'';
 useEffect(()=>{call('catalog.get',{},dfCatalog,{asAccount:true}).then(setCat).catch(()=>{});},[call]);
 useEffect(()=>{sheet.current?.focus({preventScroll:true});},[sub]);
 useEffect(()=>{
  setCount(null);setCountError(null);const ctl=new AbortController();
  const timer=setTimeout(()=>call('discover.count',{filter:f},countRes,{signal:ctl.signal}).then(r=>setCount({count:r.count,capped:r.capped})).catch(e=>{if(!ctl.signal.aborted)setCountError(e);}),400);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[f,call]);
 const back=useCallback(()=>{setSub(null);setQ('');},[]);
 // Esc / ✕ / scrim inside a nested list go back to the filters and keep the draft (prototype PPL-004).
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;e.preventDefault();if(sub)back();else onClose();};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[sub,back,onClose]);
 useEffect(()=>{if(body.current)body.current.scrollTop=0;},[sub]);
 const groups=(k:DfRow):{title:string,list:[string,string][]}[]=>{
  if(!cat)return [];
  if(k==='topics')return cat.categories.filter(c=>!DF_HIDDEN.has(c.id))
   .map(c=>({title:lab(c),list:cat.topics.filter(x=>x.categoryId===c.id).map(x=>[x.id,lab(x)] as [string,string])})).filter(g=>g.list.length);
  const kind=DF_ROWS.find(r=>r[0]===k)![1];
  return [{title:'',list:cat.options.filter(o=>o.kind===kind).map(o=>[o.code,lab(o)] as [string,string])}];
 };
 const toggle=(k:DfRow,v:string)=>setF(x=>({...x,[k]:x[k].includes(v)?x[k].filter(y=>y!==v):[...x[k],v]}));
 const age=(i:0|1,v:number)=>setF(x=>i===0?{...x,ageMin:Math.min(v,x.ageMax-1)}:{...x,ageMax:Math.max(v,x.ageMin+1)});
 const on=dfOn(f);
 const apply=async()=>{setBusy(true);setError(null);
  try{const r=await call('discover.setFilter',{opId:newOpId(),filter:f},filterRes);onApplied(r.filter);}catch(e){setError(e);}finally{setBusy(false);}};
 const summary=()=>{
  const parts:string[]=[];const place=f.cityId?cat?.places.find(p=>p.id===f.cityId):null;
  if(!f.cityId)parts.push(t('fe.df.sumAnywhere'));else if(place)parts.push(lab(place));
  if(f.show!=='all')parts.push(t(f.show==='pairs'?'fe.df.sumPairs':'fe.df.sumPeople'));
  if(f.ageMin!==18||f.ageMax!==99)parts.push(`${f.ageMin}–${f.ageMax}`);
  const more=DF_ROWS.filter(([k])=>f[k].length).length;
  if(more){const m10=more%10,m100=more%100;parts.push(fill(t(m10===1&&m100!==11?'fe.df.sumMore1':m10>=2&&m10<=4&&(m100<12||m100>14)?'fe.df.sumMore2':'fe.df.sumMore5'),more));}
  const s=parts.join(' · ');return s.charAt(0).toUpperCase()+s.slice(1);
 };
 const clr=(fn:()=>void)=><button type="button" className="fclr" aria-label={t('fe.df.clear')} onClick={fn}><X/></button>;
 const head=(title:string,nested:boolean,extra?:React.ReactNode)=><div className="sh-h">
  {nested&&<button type="button" className="ibtn ghost sm" aria-label={t('fe.df.back')} onClick={back}><ChevronLeft/></button>}
  <div className="sh-ht"><h2>{title}</h2></div>{extra}
  <button type="button" className="ibtn ghost sm" aria-label={t('fe.df.close')} onClick={onClose}><X/></button>
 </div>;
 let content:React.ReactNode;
 if(sub){
  const all=groups(sub);const total=all.reduce((n,g)=>n+g.list.length,0);const needle=q.trim().toLowerCase();
  const shown=all.map(g=>({...g,list:needle?g.list.filter(([,l])=>l.toLowerCase().includes(needle)):g.list})).filter(g=>g.list.length);
  content=<>
   {head(t('fe.df.row.'+sub),true)}
   {total>10&&<div className="sh-search"><div className="inwrap"><SearchIcon/><input className="inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.df.find')} aria-label={t('fe.df.find')} enterKeyHint="search"/></div></div>}
   <div className="sh-b" ref={body}>
    {!cat?<Skel kind="list"/>
     :shown.map((g,i)=><section key={g.title||i} className="fsec">{g.title&&<div className="sec">{g.title}</div>}<div className="chips">
      {g.list.map(([id,l])=><button key={id} type="button" className={'chip'+(f[sub].includes(id)?' on':'')} aria-pressed={f[sub].includes(id)} onClick={()=>toggle(sub,id)}>{l}</button>)}
     </div></section>)}
    {cat&&!shown.length&&<p className="note sh-empty">{t('fe.df.nothing')}</p>}
   </div>
   <div className="sh-f"><Btn onClick={back}>{f[sub].length?fill(t('fe.df.doneN'),f[sub].length):t('fe.df.done')}</Btn></div>
  </>;
 }else{
  const lo=(f.ageMin-18)/81*100,hi=(f.ageMax-18)/81*100;
  content=<>
   {head(t('fe.df.title'),false,<button type="button" className={'btn text auto'+(on?'':' off')} aria-disabled={on?undefined:true} onClick={()=>{if(on)setF(DF_DEFAULT);}}>{t('fe.df.reset')}</button>)}
   <div className="sh-b" ref={body}>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.show')}</b>{f.show!=='all'&&clr(()=>setF(x=>({...x,show:'all'})))}</div>
     <div className="chips" role="radiogroup" aria-label={t('fe.df.show')}>{(['all','people','pairs'] as const).map(v=><button key={v} type="button" className={'chip'+(f.show===v?' on':'')} role="radio" aria-checked={f.show===v} onClick={()=>setF(x=>({...x,show:v}))}>{t('fe.df.show.'+v)}</button>)}</div>
    </section>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.age')}</b><b className="fin-v">{f.ageMin}–{f.ageMax}</b>{(f.ageMin!==18||f.ageMax!==99)&&clr(()=>setF(x=>({...x,ageMin:18,ageMax:99})))}</div>
     <div className="age-filter"><div className="dual"><span className="trk"><i style={{left:lo+'%',right:(100-hi)+'%'}}/></span>
      <input type="range" min={18} max={99} value={f.ageMin} onChange={e=>age(0,+e.target.value)} aria-label={t('fe.df.ageMin')}/>
      <input type="range" min={18} max={99} value={f.ageMax} onChange={e=>age(1,+e.target.value)} aria-label={t('fe.df.ageMax')}/>
     </div></div>
    </section>
    <div className="df-more"><div className="sec">{t('fe.df.more')}</div><div className="card list">
     {DF_ROWS.map(([k])=>{const names=new Map(groups(k).flatMap(g=>g.list));const sel=f[k].map(v=>names.get(v)).filter((x):x is string=>!!x);
      return <div key={k} className="df-row"><button type="button" className="li" onClick={()=>setSub(k)}><span className="tx"><b>{t('fe.df.row.'+k)}</b>
       <small className={sel.length?'on':''}>{sel.length?sel.slice(0,2).join(', ')+(sel.length>2?fill(t('fe.df.andMore'),sel.length-2):''):t('fe.df.any')}</small></span><ChevronRight/></button>
       {f[k].length>0&&clr(()=>setF(x=>({...x,[k]:[]})))}</div>;})}
    </div></div>
    {count&&count.count===0&&<div className="alert warn mt12"><Info/><span><b>{t('fe.df.nobody')}</b>{t('fe.df.nobodyText')}</span></div>}
    {countError!=null&&<div className="alert err mt12" role="alert"><span>{feErrorMessage(countError,t)}</span></div>}
    {error!=null&&<div className="alert err mt12" role="alert"><span>{feErrorMessage(error,t)}</span></div>}
   </div>
   <div className="sh-f">
    {on>0&&<p className="df-sum">{summary()}</p>}
    <Btn onClick={apply} disabled={busy}>{count?count.count?fill(t('fe.df.showN'),count.capped?'100+':count.count):t('fe.df.applyAnyway'):t('fe.df.showPlain')}</Btn>
   </div>
  </>;
 }
 return <Layer>
  <div className="scrim on" onClick={()=>sub?back():onClose()}/>
  <div ref={sheet} className="sheet full on" role="dialog" aria-modal="true" aria-label={sub?t('fe.df.row.'+sub):t('fe.df.title')} tabIndex={-1}>{content}</div>
 </Layer>;
}

function Discover({reloadKey,onOff}:{reloadKey:number,onOff:(off:boolean)=>void}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [cards,setCards]=useState<Card[]|null>(null);const [off,setOff]=useState(false);const [error,setError]=useState<unknown>(null);
 const [match,setMatch]=useState<{card:Card,conversationId?:string}|null>(null);const [busy,setBusy]=useState(false);const [toastNode,toast]=useToast();
 const load=useCallback(()=>{setError(null);setCards(null);call('discover.deck',{limit:10},deck).then(r=>{setOff(r.off);onOff(r.off);setCards(r.items);}).catch(setError);},[call,onOff]);
 // A new filter (reloadKey) reloads the deck too.
 useEffect(()=>{load();},[load,reloadKey]);
 const decide=async(c:Card,decision:'like'|'pass')=>{
  if(busy)return;setBusy(true);
  try{
   const r=await call('discover.decide',{opId:newOpId(),profileId:c.id,decision},decided);
   setCards(list=>list?.filter(x=>x.id!==c.id)??null);
   if(r.state==='matched')setMatch({card:c,...(r.conversationId?{conversationId:r.conversationId}:{})});
  }catch(e){setError(e);}finally{setBusy(false);}
 };
 // The server allows one free undo a day (shared with «Вернуть» in the history) and says so when it is spent.
 const undo=async()=>{
  if(busy)return;setBusy(true);
  try{await call('discover.undo',{opId:newOpId()},undone);toast(t('fe.px.undo.done'));load();}
  catch(e){if(e instanceof FeError&&e.code==='premium_required')navigate('/n/premium?for=undo');else toast(pxError(e,t),true);}finally{setBusy(false);}
 };
 const box=(node:React.ReactNode)=><><View>{node}</View>{toastNode}</>;
 if(match)return box(<Empty icon={Heart} title={t('fe.people.match')} text={t('fe.people.matchText').replace('{name}',match.card.name||'@'+match.card.handle)}>
  <Btn onClick={()=>navigate(match.conversationId?'/n/chats/'+match.conversationId:'/n/chats')}>{t('fe.people.write')}</Btn><Btn kind="text" onClick={()=>setMatch(null)}>{t('fe.people.later')}</Btn></Empty>);
 if(error&&!cards)return box(<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>);
 if(cards===null)return box(<Skel kind="list"/>);
 if(off)return box(<Empty icon={Eye} title={t('fe.people.off')} text={t('fe.people.offText')}><Btn kind="soft" onClick={()=>navigate('/n/me')}>{t('fe.people.openMe')}</Btn></Empty>);
 const [c,next]=cards;
 if(!c)return box(<Empty icon={Users} title={t('fe.people.empty')} text={t('fe.people.emptyText')}><Btn kind="soft" onClick={load}>{t('fe.people.refresh')}</Btn><Btn kind="text" icon={Undo2} onClick={undo} disabled={busy}>{t('fe.people.undo')}</Btn></Empty>);
 const card=(x:Card,top:boolean)=>{const src=photo(x);const name=x.name||'@'+x.handle;
  return <article key={x.id} className={'pc '+(top?'top':'next')} aria-label={top?name:undefined} aria-hidden={top?undefined:true} inert={top?undefined:true}>
   <div className="pc-ph" onClick={()=>top&&navigate('/n/people/'+x.id)}>
    {src?<><img className="mbg" src={src} alt="" aria-hidden="true" draggable={false}/><img src={src} alt={name} draggable={false}/></>:<div className="fe-pc-ini"><Av name={name} seed={x.id} size="xl"/></div>}
    {(x.likedMe||x.shared>0)&&<div className="pc-tags">{x.likedMe&&<span className="pc-liked"><Heart/>{t('fe.people.likedMe')}</span>}{x.shared>0&&<span className="pc-score"><b>{x.shared}</b><small>{t('fe.people.sharedTopics')}</small></span>}</div>}
    <div className="pc-info">
     <h2 className="pc-name"><span className="pcn">{name}</span>{x.ages.length>0&&<span>{x.ages.join(' · ')}</span>}{x.photoVerified&&<PhotoBadge/>}</h2>
     {x.city&&<div className="pc-who"><span className="pl"><MapPin/>{locale==='en'?x.city.en:x.city.ru}</span></div>}
    </div>
   </div>
  </article>;};
 return <div className="view deckmode"><div className="deck">
  {next&&card(next,false)}{card(c,true)}
  <div className="acts onphoto">
   <button type="button" className="act undo" aria-label={t('fe.people.undo')} onClick={undo} disabled={busy}><Undo2/></button>
   <button type="button" className="act pass" aria-label={t('fe.people.pass')} onClick={()=>decide(c,'pass')} disabled={busy}><X/></button>
   <button type="button" className="act like" aria-label={t('fe.people.like')} onClick={()=>decide(c,'like')} disabled={busy}><Heart/></button>
  </div>
 </div>{toastNode}</div>;
}

function Row({c,locale}:{c:Card,locale:string}){
 const navigate=useNavigate();
 return <button type="button" className="li" onClick={()=>navigate('/n/people/'+c.id)}>
  <Av name={c.name||c.handle||'?'} seed={c.id} src={c.avatar?.src?.thumb}/>
  <span className="tx"><b>{c.name||'@'+c.handle}{c.photoVerified&&<PhotoBadge/>}</b><small>{[c.handle&&'@'+c.handle,sub(c,locale)].filter(Boolean).join(' · ')}</small></span>
 </button>;
}

function Likes(){
 const {call}=useFe();const {t,locale}=useI18n();
 const [items,setItems]=useState<Card[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('likes.incoming',{},incoming).then(r=>setItems(r.items.map(i=>i.profile))).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 if(items===null)return <Skel kind="list"/>;
 if(!items.length)return <Empty icon={Heart} title={t('fe.people.noLikes')} text={t('fe.people.noLikesText')}/>;
 return <div className="card list">{items.map(c=><Row key={c.id} c={c} locale={locale}/>)}</div>;
}

function Search(){
 const {call}=useFe();const {t,locale}=useI18n();
 const [q,setQ]=useState('');const [items,setItems]=useState<Card[]|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{
  setError(null);if(q.trim().length<2){setItems(null);return;}
  const ctl=new AbortController();const timer=setTimeout(()=>call('people.search',{q:q.trim()},list,{signal:ctl.signal}).then(r=>setItems(r.items)).catch(e=>{if(!ctl.signal.aborted)setError(e);}),300);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[q,call]);
 return <>
  <div className="field"><div className="inwrap"><SearchIcon/><input className="inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.people.searchPh')} aria-label={t('fe.people.searchPh')} autoCapitalize="off" spellCheck={false}/></div></div>
  {error?<div className="alert err" role="alert"><span>{feErrorMessage(error,t)}</span></div>
   :items===null?<p className="note">{t('fe.people.searchHint')}</p>
   :!items.length?<Empty icon={SearchIcon} title={t('fe.people.nobody')}/>
   :<div className="card list">{items.map(c=><Row key={c.id} c={c} locale={locale}/>)}</div>}
 </>;
}

export function PersonScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();
 const [p,setP]=useState<PersonProfile|null>(null);const [error,setError]=useState<unknown>(null);
 const [following,setFollowing]=useState(false);const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 const [menu,setMenu]=useState<MenuStep>(null);const [blocked,setBlocked]=useState(false);const [toastNode,toast]=useToast();
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);call('profile.get',{profileId:id},personProfileRes).then(r=>setP(r.profile)).catch(setError);},[call,id]);
 useEffect(()=>{setBlocked(false);setMenu(null);load();},[load]);
 // After «Разблокировать» the profile is loaded again.
 const setBlock=useCallback((b:boolean)=>{setBlocked(b);if(!b)load();},[load]);
 const follow=async()=>{setBusy(true);const on=!following;try{await call('follow.set',{opId:newOpId(),profileId:id,on},ok);setFollowing(on);}catch(e){setNote(feErrorMessage(e,t));}finally{setBusy(false);}};
 const like=async()=>{setBusy(true);setNote('');try{const r=await call('like.send',{opId:op.current,profileId:id,source:'profile'},ok);setNote(r.state==='matched'?t('fe.people.match'):t('fe.people.liked'));}catch(e){setNote(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 const name=personName(p);
 return <>
  <Bar title={blocked?t('fe.px.bl.stateTitle'):name} back>
   {(p||blocked)&&<button type="button" className="ibtn ghost" aria-haspopup="dialog" aria-label={t('fe.px.menu.more')} onClick={()=>setMenu('menu')}><Ellipsis/></button>}
  </Bar>
  <View>
   {blocked?<Empty icon={Ban} title={t('fe.px.bl.stateTitle')} text={t('fe.px.bl.stateText')}><Btn kind="soft" onClick={()=>setMenu('menu')}>{t('fe.px.menu.unblock')}</Btn></Empty>
    :error?<Empty icon={Lock} title={t('fe.feed.unavailable')} text={pxError(error,t)}/>
    :!p?<Skel kind="list"/>
    :<>
     <PersonHero p={p}/>
     <div className="p-acts">
      <Btn kind={following?'soft':'primary'} onClick={follow} disabled={busy}>{following?t('fe.people.unfollow'):t('fe.people.follow')}</Btn>
      <Btn kind="soft" icon={Heart} onClick={like} disabled={busy}>{t('fe.people.like')}</Btn>
     </div>
     {note&&<div className="alert ok" role="status"><span>{note}</span></div>}
     <CompatSummary profileId={p.id}/>
     <PersonBio p={p}/>
     <LinksSection profileId={p.id}/>
     <PrivateOf profileId={p.id}/>
     <PersonPhotos p={p}/>
     <ProfileLinks profileId={p.id} photos={p.photos.filter(ph=>ph.src&&!ph.pending).length}/>
    </>}
  </View>
  {(p||blocked)&&<PersonMenu profileId={id} name={name} step={menu} setStep={setMenu} blocked={blocked} setBlocked={setBlock} toast={toast}/>}
  {toastNode}
 </>;
}
