import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Ban,Check,ChevronDown,ChevronLeft,ChevronRight,EyeOff,Heart,Ellipsis,History,Info,KeyRound,Lock,MapPin,MessageCircle,SlidersHorizontal,Sparkles,Undo2,Users,X} from 'lucide-react';
import {Alert,Av,Bar,Btn,Card,Chip,Chips,ChoiceChips,Empty,H,IconBtn,Note,Pill,Row,SearchInput,SectionLabel,Seg,Sheet,Skel,View,plate} from './kit';
import {useFe} from './session';
import {NameBadges} from './faces';
import {BellButton} from './inbox';
import {when} from './feed';
import {catalogRes,CompatSummary,FollowCounts,MatchOverlay,PersonBio,PersonMenu,PhotoViewer,ProfileBody,ProfilePage,personName,personProfileRes,pxError,usePrivate,useRelation,useToast,
 type Catalog,type MenuStep,type PersonProfile,type Relation} from './profile-extras';

/** Slice F (V21 D03–D10): Discover cards from the server's mutual pool with the whole profile under the photo, swipe
 * or buttons to like / pass, «Это взаимно» → chat, the likes grid and another person's profile (P01). The client shows
 * only what the server returned: no invented matches, counters or scores. People search lives in the global search. */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
const card=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),ages:z.array(z.number()),
 city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),likedMe:z.boolean(),shared:z.number(),photoVerified:z.boolean().optional(),premium:z.boolean().optional()});
type Card=z.infer<typeof card>;
const deck=z.object({ok:z.literal(true),off:z.boolean(),items:z.array(card)});
const decided=z.object({ok:z.literal(true),decision:z.enum(['like','pass']),state:z.string().optional(),conversationId:z.uuid().optional()}).passthrough();
const incoming=z.object({ok:z.literal(true),items:z.array(z.object({profile:card,at:z.string().nullable().optional()}).passthrough())}).passthrough();
const outgoing=z.object({ok:z.literal(true),items:z.array(z.object({profile:card,at:z.string().nullable().optional(),source:z.string().nullable().optional(),initiator:z.string().nullable().optional()}).passthrough())}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const likeRes=z.object({ok:z.literal(true),state:z.string().optional(),conversationId:z.uuid().optional()}).passthrough();
const undone=z.object({ok:z.literal(true),profileId:z.uuid(),decision:z.enum(['like','pass'])}).passthrough();
const settingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.string()}).passthrough()});

const photo=(c:{avatar:z.infer<typeof media>|null})=>c.avatar&&!c.avatar.pending?c.avatar.src?.card??c.avatar.src?.full??c.avatar.src?.thumb??null:null;
const cname=(c:{name:string|null,handle:string|null})=>c.name||(c.handle?'@'+c.handle:'?');
const fill=(s:string,vars:Record<string,string|number>)=>Object.entries(vars).reduce((a,[k,v])=>a.split('{'+k+'}').join(String(v)),s);
const HeartF=(p:React.ComponentProps<typeof Heart>)=><Heart fill="currentColor" {...p}/>;
const CSeg=Seg;
// The swipe tip shows once per session, on touch devices only (prototype PPL-007).
let deckCoachShown=false;

export function PeopleTab(){
 const {t}=useI18n();const {call,acting}=useFe();
 const [tab,setTab]=useState<'discover'|'likes'>(()=>new URLSearchParams(location.hash.split('?')[1]??'').get('sub')==='likes'?'likes':'discover');
 const [off,setOff]=useState(false);const [filter,setFilter]=useState<Filter|null>(null);const [open,setOpen]=useState(false);const [deckKey,setDeckKey]=useState(0);
 const [likesN,setLikesN]=useState(0);
 const opener=useRef<HTMLButtonElement>(null);const navigate=useNavigate();
 useEffect(()=>{call('discover.filter',{},filterRes).then(r=>setFilter(r.filter)).catch(()=>{});},[call]);
 const countLikes=useCallback(()=>{call('likes.incoming',{},incoming).then(r=>setLikesN(r.items.length)).catch(()=>{});},[call]);
 useEffect(()=>{countLikes();},[countLikes,acting?.id]);
 const close=useCallback(()=>{setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));},[]);
 const on=filter?dfOn(filter):0;const deckOn=tab==='discover'&&!off;
 return <>
  <header className="bar dating-bar">
   <CSeg big value={tab} onChange={v=>{setTab(v);history.replaceState(null,'','#/n/people'+(v==='likes'?'?sub=likes':''));}}
    options={[{id:'discover',label:t('fe.people.tab.discover')},{id:'likes',label:t('fe.people.tab.likes'),n:likesN}]}/>
   {deckOn&&<IconBtn icon={History} label={t('fe.px.h.open')} title={t('fe.px.h.open')} onClick={()=>navigate('/n/people/history')}/>}
   {deckOn?<IconBtn ref={opener} icon={SlidersHorizontal} aria-haspopup="dialog" label={on?t('fe.df.openOn').replace('{n}',String(on)):t('fe.df.open')} badge={on||undefined} disabled={!filter} onClick={()=>setOpen(true)}/>:<BellButton/>}
  </header>
  {tab==='discover'?<Discover reloadKey={deckKey} onOff={setOff} filterOn={on} openFilter={()=>setOpen(true)} likesN={likesN} toLikes={()=>setTab('likes')} onLikes={countLikes}/>:<Likes onCount={setLikesN} toDiscover={()=>setTab('discover')}/>}
  {open&&filter&&<DiscoverFilter initial={filter} onClose={close} onApplied={f=>{setFilter(f);setDeckKey(k=>k+1);close();}}/>}
 </>;
}

/* V21 D04 «Фильтры знакомств» (prototype dfSheet): the draft lives in the sheet until «Показать · N»; N is the server's
 * capped count (discover.count), «Показать» saves with discover.setFilter and reloads the deck. «Где искать» offers
 * «Везде» and a city from the catalogue; «Рядом» needs a location and comes later. */
const filterShape=z.object({show:z.enum(['all','people','pairs']),ageMin:z.number(),ageMax:z.number(),cityId:z.string().nullable(),
 genders:z.array(z.string()),orients:z.array(z.string()),formats:z.array(z.string()),seeks:z.array(z.string()),roles:z.array(z.string()),topics:z.array(z.string())});
type Filter=z.infer<typeof filterShape>;
const filterRes=z.object({ok:z.literal(true),filter:filterShape});
const countRes=z.object({ok:z.literal(true),count:z.number(),capped:z.boolean()});
const DF_ROWS=[['genders','gender'],['orients','orient'],['formats','format'],['seeks','seek'],['roles','role'],['topics','']] as const;
type DfRow=typeof DF_ROWS[number][0];
type DfSub=DfRow|'city';
const DF_DEFAULT:Filter={show:'all',ageMin:18,ageMax:99,cityId:null,genders:[],orients:[],formats:[],seeks:[],roles:[],topics:[]};
// Topics people are not searched by (prototype dfRows); the server refuses them as well.
const DF_HIDDEN=new Set(['limits','edge','safety']);
const dfOn=(f:Filter)=>[f.show!=='all',f.ageMin!==18||f.ageMax!==99,!!f.cityId,...DF_ROWS.map(([k])=>f[k].length>0)].filter(Boolean).length;

function DiscoverFilter({initial,onClose,onApplied}:{initial:Filter,onClose:()=>void,onApplied:(f:Filter)=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [f,setF]=useState<Filter>(initial);const [sub,setSub]=useState<DfSub|null>(null);const [q,setQ]=useState('');const [where,setWhere]=useState<'any'|'city'>(initial.cityId?'city':'any');
 const [cat,setCat]=useState<Catalog|null>(null);const [count,setCount]=useState<{count:number,capped:boolean}|null>(null);
 const [countError,setCountError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>(null);
 // `body` sits inside the sheet's scrolling `.sh-b`: a nested list starts at the top and takes the focus.
 const body=useRef<HTMLDivElement>(null);
 const lab=(x:{ru:string|null,en:string|null})=>(locale==='en'?x.en||x.ru:x.ru||x.en)||'';
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(setCat).catch(()=>{});},[call]);
 useEffect(()=>{body.current?.closest<HTMLElement>('.sheet')?.focus({preventScroll:true});const b=body.current?.closest('.sh-b');if(b)b.scrollTop=0;},[sub]);
 useEffect(()=>{
  setCount(null);setCountError(null);const ctl=new AbortController();
  const timer=setTimeout(()=>call('discover.count',{filter:f},countRes,{signal:ctl.signal}).then(r=>setCount({count:r.count,capped:r.capped})).catch(e=>{if(!ctl.signal.aborted)setCountError(e);}),400);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[f,call]);
 const back=useCallback(()=>{setSub(null);setQ('');},[]);
 // Esc / ✕ / scrim inside a nested list go back to the filters and keep the draft (prototype PPL-004): the sheet's
 // onClose is `back` there.
 const groups=(k:DfSub):{title:string,list:[string,string][]}[]=>{
  if(!cat)return [];
  if(k==='city')return [{title:'',list:cat.places.map(p=>[p.id,lab(p)] as [string,string]).sort((a,b)=>a[1].localeCompare(b[1]))}];
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
 const place=f.cityId?cat?.places.find(p=>p.id===f.cityId):null;
 const summary=()=>{
  const parts:string[]=[];
  if(!f.cityId)parts.push(t('fe.df.sumAnywhere'));else if(place)parts.push(lab(place));
  if(f.show!=='all')parts.push(t(f.show==='pairs'?'fe.df.sumPairs':'fe.df.sumPeople'));
  if(f.ageMin!==18||f.ageMax!==99)parts.push(`${f.ageMin}–${f.ageMax}`);
  const more=DF_ROWS.filter(([k])=>f[k].length).length;
  if(more){const m10=more%10,m100=more%100;parts.push(fill(t(m10===1&&m100!==11?'fe.df.sumMore1':m10>=2&&m10<=4&&(m100<12||m100>14)?'fe.df.sumMore2':'fe.df.sumMore5'),{n:more}));}
  const s=parts.join(' · ');return s.charAt(0).toUpperCase()+s.slice(1);
 };
 const clr=(fn:()=>void)=><button type="button" className="fclr" aria-label={t('fe.df.clear')} onClick={fn}><X/></button>;
 if(sub){
  const all=groups(sub);const total=all.reduce((n,g)=>n+g.list.length,0);const needle=q.trim().toLowerCase();
  const shown=all.map(g=>({...g,list:needle?g.list.filter(([,l])=>l.toLowerCase().includes(needle)):g.list})).filter(g=>g.list.length);
  const isOn=(id:string)=>sub==='city'?f.cityId===id:f[sub].includes(id);
  const pick=(id:string)=>{if(sub==='city'){setF(x=>({...x,cityId:x.cityId===id?null:id}));setWhere('city');}else toggle(sub,id);};
  const n=sub==='city'?(f.cityId?1:0):f[sub].length;
  return <Sheet full title={sub==='city'?t('fe.df.city'):t('fe.df.row.'+sub)} onClose={back}
   lead={<IconBtn icon={ChevronLeft} kind="ghost" size="sm" label={t('fe.df.back')} onClick={back}/>}
   search={total>10&&<SearchInput label={t('fe.df.find')} value={q} onChange={e=>setQ(e.target.value)}/>}
   foot={<Btn onClick={back}>{n&&sub!=='city'?fill(t('fe.df.doneN'),{n}):t('fe.df.done')}</Btn>}>
   <div ref={body}>
    {!cat?<Skel kind="list"/>
     :shown.map((g,i)=><section key={g.title||i} className="fsec">{g.title&&<SectionLabel>{g.title}</SectionLabel>}<Chips>
      {g.list.map(([id,l])=><Chip key={id} on={isOn(id)} onClick={()=>pick(id)}>{l}</Chip>)}
     </Chips></section>)}
    {cat&&!shown.length&&<Note className="sh-empty">{t('fe.df.nothing')}</Note>}
   </div>
  </Sheet>;
 }
 const lo=(f.ageMin-18)/81*100,hi=(f.ageMax-18)/81*100;
 return <Sheet full title={t('fe.df.title')} onClose={onClose}
  head={<Btn kind="text" auto className={on?undefined:'off'} aria-disabled={on?undefined:true} onClick={()=>{if(on){setF(DF_DEFAULT);setWhere('any');}}}>{t('fe.df.reset')}</Btn>}
  foot={<>
   {on>0&&<p className="df-sum">{summary()}</p>}
   <Btn onClick={apply} busy={busy} disabled={busy}>{count?count.count?fill(t('fe.df.showN'),{n:count.capped?'100+':count.count}):t('fe.df.applyAnyway'):t('fe.df.showPlain')}</Btn>
  </>}>
   <div ref={body}>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.where')}</b>{where!=='any'&&clr(()=>{setWhere('any');setF(x=>({...x,cityId:null}));})}</div>
     <ChoiceChips label={t('fe.df.where')} value={where} options={(['any','city'] as const).map(v=>[v,t('fe.df.where.'+v)] as const)}
      onChange={v=>{if(v==='any'){setWhere('any');setF(x=>({...x,cityId:null}));}else{setWhere('city');if(!f.cityId)setSub('city');}}}/>
     {where==='city'&&<div className="fld"><button type="button" className="fld-main" onClick={()=>setSub('city')}><MapPin/><span>{place?lab(place):t('fe.df.pickCity')}</span></button>
      {f.cityId?clr(()=>setF(x=>({...x,cityId:null}))):<ChevronRight/>}</div>}
    </section>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.show')}</b>{f.show!=='all'&&clr(()=>setF(x=>({...x,show:'all'})))}</div>
     <ChoiceChips label={t('fe.df.show')} value={f.show} options={(['all','people','pairs'] as const).map(v=>[v,t('fe.df.show.'+v)] as const)} onChange={v=>setF(x=>({...x,show:v}))}/>
    </section>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.age')}</b><b className="fin-v">{f.ageMin}–{f.ageMax}</b>{(f.ageMin!==18||f.ageMax!==99)&&clr(()=>setF(x=>({...x,ageMin:18,ageMax:99})))}</div>
     <div className="age-filter"><div className="dual"><span className="trk"><i style={{left:lo+'%',right:(100-hi)+'%'}}/></span>
      <input type="range" min={18} max={99} value={f.ageMin} onChange={e=>age(0,+e.target.value)} aria-label={t('fe.df.ageMin')}/>
      <input type="range" min={18} max={99} value={f.ageMax} onChange={e=>age(1,+e.target.value)} aria-label={t('fe.df.ageMax')}/>
     </div></div>
    </section>
    <div className="df-more"><SectionLabel>{t('fe.df.more')}</SectionLabel><Card list>
     {DF_ROWS.map(([k])=>{const names=new Map(groups(k).flatMap(g=>g.list));const sel=f[k].map(v=>names.get(v)).filter((x):x is string=>!!x);
      return <div key={k} className="df-row"><button type="button" className="li" onClick={()=>setSub(k)}><span className="tx"><b>{t('fe.df.row.'+k)}</b>
       <small className={sel.length?'on':''}>{sel.length?sel.slice(0,2).join(', ')+(sel.length>2?fill(t('fe.df.andMore'),{n:sel.length-2}):''):t('fe.df.any')}</small></span><ChevronRight/></button>
       {f[k].length>0&&clr(()=>setF(x=>({...x,[k]:[]})))}</div>;})}
    </Card></div>
    {count&&count.count===0&&<Alert kind="warn" icon={Info} className="mt12"><b>{t('fe.df.nobody')}</b>{t('fe.df.nobodyText')}</Alert>}
    {countError!=null&&<Alert kind="err" noIcon className="mt12">{feErrorMessage(countError,t)}</Alert>}
    {error!=null&&<Alert kind="err" noIcon className="mt12">{feErrorMessage(error,t)}</Alert>}
   </div>
 </Sheet>;
}

/* ---------- D03 deck ---------- */
type Decision={id:string,dir:1|-1};

function Discover({reloadKey,onOff,filterOn,openFilter,likesN,toLikes,onLikes}:{reloadKey:number,onOff:(off:boolean)=>void,filterOn:number,openFilter:()=>void,likesN:number,toLikes:()=>void,onLikes:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [cards,setCards]=useState<Card[]|null>(null);const [off,setOff]=useState(false);const [error,setError]=useState<unknown>(null);
 const [match,setMatch]=useState<{card:Card,conversationId?:string}|null>(null);const [toastNode,toast]=useToast();
 const [made,setMade]=useState<Decision[]>([]);const [tip,setTip]=useState(false);const [byFilter,setByFilter]=useState<number|null>(null);
 const busy=useRef(false);const top=useRef<HTMLElement|null>(null);const next=useRef<HTMLElement|null>(null);const acts=useRef<HTMLDivElement>(null);
 const load=useCallback((first?:string)=>{setError(null);call('discover.deck',{limit:10},deck).then(r=>{setOff(r.off);onOff(r.off);
  setCards(first?[...r.items.filter(c=>c.id===first),...r.items.filter(c=>c.id!==first)]:r.items);}).catch(e=>{setError(e);setCards(c=>c??[]);});},[call,onOff]);
 // A new filter (reloadKey) or another acting profile reloads the deck.
 useEffect(()=>{setCards(null);load();},[load,reloadKey,acting?.id]);
 // When the filters are what empties Discover, say so (PPL-013): the count without them.
 useEffect(()=>{if(!cards||cards.length||!filterOn){setByFilter(null);return;}
  call('discover.count',{filter:DF_DEFAULT},countRes).then(r=>setByFilter(r.count)).catch(()=>setByFilter(null));},[cards,filterOn,call]);
 useEffect(()=>{if(!cards?.length||deckCoachShown||!matchMedia('(any-pointer:coarse)').matches)return;deckCoachShown=true;setTip(true);
  const x=setTimeout(()=>setTip(false),2900);return ()=>clearTimeout(x);},[cards]);
 const fly=(dir:number)=>{const c=top.current;if(!c)return;c.classList.add('fly');c.style.transform=`translateX(${dir*130}%) rotate(${dir*16}deg)`;c.style.setProperty(dir>0?'--l':'--n','1');
  const n=next.current;if(n){n.style.transform='';n.classList.add('promote');}};
 const reset=()=>{const c=top.current;if(!c)return;c.classList.remove('fly');c.style.transform='';c.style.setProperty('--l','0');c.style.setProperty('--n','0');next.current?.classList.remove('promote');};
 const decide=useCallback(async(dir:1|-1)=>{
  const c=cards?.[0];if(!c||busy.current)return;busy.current=true;fly(dir);
  try{
   const [r]=await Promise.all([call('discover.decide',{opId:newOpId(),profileId:c.id,decision:dir>0?'like':'pass'},decided),new Promise(res=>setTimeout(res,290))]);
   // The deck holds a page of ten: when it runs out, ask the server for the next ones instead of «nobody left».
   const rest=(cards??[]).filter(x=>x.id!==c.id);if(rest.length)setCards(rest);else{setCards(null);load();}
   setMade(m=>[...m,{id:c.id,dir}]);
   if(c.likedMe||r.state==='matched')onLikes();
   if(r.state==='matched')setMatch({card:c,...(r.conversationId?{conversationId:r.conversationId}:{})});
   else if(dir>0)toast(fill(t('fe.px.lkd.sent'),{name:cname(c)}));
  }catch(e){reset();toast(pxError(e,t),true);}finally{busy.current=false;}
 },[cards,call,t,toast,load,onLikes]);
 // The server allows one free undo a day (shared with «Вернуть» in the history) and says so when it is spent.
 const undo=async()=>{
  if(busy.current)return;busy.current=true;
  try{const r=await call('discover.undo',{opId:newOpId()},undone);setMade(m=>m.filter(x=>x.id!==r.profileId));toast(t('fe.px.undo.back'));load(r.profileId);}
  catch(e){if(e instanceof FeError&&e.code==='premium_required')navigate('/n/premium?for=undo');else toast(pxError(e,t),true);}finally{busy.current=false;}
 };
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(match||document.querySelector('.fe-v21 .layer .sheet')||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;
  if(e.key==='ArrowRight')void decide(1);if(e.key==='ArrowLeft')void decide(-1);};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[decide,match]);
 const box=(node:ReactNode)=><><View>{node}</View>{toastNode}</>;
 const overlay=match&&<MatchOverlay other={{id:match.card.id,name:cname(match.card),src:photo(match.card)}} conversationId={match.conversationId} onClose={()=>setMatch(null)}/>;
 if(error&&!cards?.length)return box(<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>);
 if(cards===null)return <div className="view deckmode"><div className="deck"><div className="pc top fe-pc-skel"><div className="pc-ph"><i className="sk sk-media"/></div></div></div>{toastNode}{overlay}</div>;
 if(off)return box(<DatingOff onChanged={()=>{setCards(null);load();}} toast={toast}/>);
 const [c,nx]=cards;
 if(!c)return <>{box(<DeckEmpty byFilter={filterOn?byFilter:null} filterOn={filterOn} openFilter={openFilter} likesN={likesN} toLikes={toLikes}/>)}{overlay}</>;
 return <div className="view deckmode">
  {tip&&<p className="deck-tip" role="status"><Info/><span>{t('fe.px.deck.tip')}</span></p>}
  <div className="deck">
   {nx&&<NextCard key={nx.id} c={nx} cardRef={next}/>}
   <TopCard key={c.id} c={c} cardRef={top} nextRef={next} actsRef={acts} onDecide={decide} toast={toast}/>
   <div className="acts onphoto" ref={acts}>
    <button type="button" className={'act undo'+(made.length?'':' off')} aria-label={t('fe.people.undo')} onClick={undo}><Undo2/></button>
    <button type="button" className="act pass" aria-label={t('fe.people.pass')} onClick={()=>void decide(-1)}><X/></button>
    <KeyAct key={c.id} id={c.id} cardRef={top}/>
    <button type="button" className="act like" aria-label={t('fe.px.deck.like')} onClick={()=>void decide(1)}><HeartF/></button>
   </div>
  </div>
  {toastNode}{overlay}
 </div>;
}

/** The deck's key button (deckInner `act req`): only when the person has a private part; it scrolls the card to it,
 * where «Попросить доступ» (or what is already open) lives. */
function KeyAct({id,cardRef}:{id:string,cardRef:React.RefObject<HTMLElement|null>}){
 const {t}=useI18n();const p=usePrivate(id);
 if(!p?.exists)return null;const open=(p.scopes??[]).length>0;const label=t(open?'fe.px.deck.privOpen':'fe.px.deck.privAsk');
 const go=()=>{const c=cardRef.current;const v=c?.querySelector('.vault');if(!c||!v)return;
  c.scrollTo({top:c.scrollTop+v.getBoundingClientRect().top-c.getBoundingClientRect().top-12,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
 return <button type="button" className="act req" aria-label={label} title={label} onClick={go}><KeyRound/></button>;
}

function CardPhoto({c,src}:{c:Card,src:string|null}){
 const name=cname(c);
 return src?<><img className="mbg" src={src} alt="" aria-hidden="true" draggable={false}/><img src={src} alt={name} draggable={false}/></>:<div className="plate" style={plate(c.id)}/>;
}
function CardTags({c}:{c:Card}){
 const {t,locale}=useI18n();
 if(!c.likedMe&&!c.shared)return null;
 return <div className="pc-tags">{c.likedMe&&<span className="pc-liked"><HeartF/>{t('fe.px.deck.likesYou')}</span>}
  {c.shared>0&&<span className="pc-score"><b>{c.shared}</b><small>{plural5(t,locale,'fe.px.deck.topic',c.shared)}</small></span>}</div>;
}
function plural5(t:(k:string)=>string,locale:string,base:string,n:number){const m10=n%10,m100=n%100;return t(base+(locale==='en'?(n===1?'1':'5'):m10===1&&m100!==11?'1':m10>=2&&m10<=4&&(m100<12||m100>14)?'2':'5'));}

function NextCard({c,cardRef}:{c:Card,cardRef:React.RefObject<HTMLElement|null>}){
 const {locale}=useI18n();const city=c.city?(locale==='en'?c.city.en||c.city.ru:c.city.ru||c.city.en):null;
 return <article ref={cardRef as React.RefObject<HTMLElement>} className="pc next" inert aria-hidden="true">
  <div className="pc-ph"><CardPhoto c={c} src={photo(c)}/><CardTags c={c}/>
   <div className="pc-info"><h2 className="pc-name"><span className="pcn">{cname(c)}</span>{c.ages.length>0&&<span>{c.ages.join(' · ')}</span>}<NameBadges p={c}/></h2>
    {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}</div>
  </div>
 </article>;
}

/** The top card (deckInner/card): photo with bars and zones, tags, stamps, the info block and — scrolled — the whole
 * profile in its own layout with «Подписаться» and «Полный профиль». Horizontal drag decides, vertical scrolls. */
function TopCard({c,cardRef,nextRef,actsRef,onDecide,toast}:{c:Card,cardRef:React.RefObject<HTMLElement|null>,nextRef:React.RefObject<HTMLElement|null>,
 actsRef:React.RefObject<HTMLDivElement|null>,onDecide:(dir:1|-1)=>void,toast:(m:string,err?:boolean)=>void}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [p,setP]=useState<PersonProfile|null>(null);const [ix,setIx]=useState(0);const [view,setView]=useState<number|null>(null);
 const [rel,setRel]=useRelation(c.id);
 useEffect(()=>{call('profile.get',{profileId:c.id},personProfileRes).then(r=>setP(r.profile)).catch(()=>{});},[call,c.id]);
 const photos=p?p.photos.filter(m=>!m.pending&&m.src).map(m=>({card:m.src?.card??m.src?.full??m.src?.thumb??'',full:m.src?.full??m.src?.card??''})):[];
 const list=photos.length?photos:photo(c)?[{card:photo(c)!,full:c.avatar?.src?.full??photo(c)!}]:[];
 const i=Math.min(ix,Math.max(0,list.length-1));const city=c.city?(locale==='en'?c.city.en||c.city.ru:c.city.ru||c.city.en):null;
 const nudge=useRef(0);
 const step=(d:number)=>{const n=i+d;const el=cardRef.current;if(n<0||n>=list.length){if(el){el.classList.remove('nudge-l','nudge-r');void el.offsetWidth;el.classList.add(d<0?'nudge-l':'nudge-r');}return;}setIx(n);};
 // initDeck: pointer drag on the card, the like/pass stamps follow the distance; a fast flick counts too.
 useEffect(()=>{const el=cardRef.current;if(!el)return;
  let sx=0,sy=0,t0=0,dx=0,mode:''|'x'|'y'='',pid:number|null=null;
  const onScroll=()=>{actsRef.current?.classList.toggle('onphoto',el.scrollTop<el.clientHeight*.55);};
  const down=(e:PointerEvent)=>{if(e.button>0||(e.target as HTMLElement).closest('button,a,input,textarea,select'))return;sx=e.clientX;sy=e.clientY;t0=e.timeStamp;dx=0;mode='';pid=e.pointerId;};
  const move=(e:PointerEvent)=>{if(pid!==e.pointerId)return;const mx=e.clientX-sx,my=e.clientY-sy;const nx=nextRef.current;
   if(!mode){if(Math.abs(mx)>10&&Math.abs(mx)>Math.abs(my)*1.2){mode='x';el.setPointerCapture(pid);el.classList.add('drag');nx?.classList.add('drag');}else if(Math.abs(my)>10&&Math.abs(my)>Math.abs(mx)*1.2)mode='y';}
   if(mode==='x'){dx=mx;const pr=Math.min(1,Math.abs(dx)/140);if(nx)nx.style.transform=`scale(${.95+.05*pr}) translateY(${10-10*pr}px)`;el.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;
    el.style.setProperty('--l',String(Math.max(0,Math.min(1,dx/110))));el.style.setProperty('--n',String(Math.max(0,Math.min(1,-dx/110))));}};
  const end=(e:PointerEvent)=>{if(pid!==e.pointerId)return;pid=null;el.classList.remove('drag');nextRef.current?.classList.remove('drag');
   if(mode==='x'){nudge.current=e.timeStamp;
    if(Math.abs(dx)>Math.max(80,Math.min(110,el.clientWidth*.28))||Math.abs(dx)>44&&Math.abs(dx)/Math.max(1,e.timeStamp-t0)>.6)onDecide(dx>0?1:-1);
    else{el.style.transform='';if(nextRef.current)nextRef.current.style.transform='';el.style.setProperty('--l','0');el.style.setProperty('--n','0');}}
   mode='';};
  const cancel=(e:PointerEvent)=>{dx=0;end(e);};
  const lost=(e:PointerEvent)=>{if(e.target!==el||pid!==e.pointerId)return;end(e);};
  const click=(e:MouseEvent)=>{if(e.timeStamp-nudge.current<80){e.stopPropagation();e.preventDefault();}};
  const drag=(e:Event)=>e.preventDefault();
  el.addEventListener('scroll',onScroll,{passive:true});el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',cancel);el.addEventListener('lostpointercapture',lost);el.addEventListener('click',click,true);el.addEventListener('dragstart',drag);
  return ()=>{el.removeEventListener('scroll',onScroll);el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);
   el.removeEventListener('pointercancel',cancel);el.removeEventListener('lostpointercapture',lost);el.removeEventListener('click',click,true);el.removeEventListener('dragstart',drag);};
 },[cardRef,nextRef,actsRef,onDecide]);
 const name=cname(c);
 return <article ref={cardRef as React.RefObject<HTMLElement>} className="pc top" aria-label={name}>
  <div className="pc-ph">
   {list[i]?<><img className="mbg" src={list[i]!.card} alt="" aria-hidden="true" draggable={false}/><img src={list[i]!.card} alt={name} draggable={false}/></>:<div className="plate" style={plate(c.id)}/>}
   {list.length>1&&<div className="pc-bars" aria-label={fill(t('fe.px.ph.n'),{i:i+1,n:list.length})}>{list.map((_,k)=><i key={k} className={k===i?'on':''}/>)}</div>}
   {list.length>1&&<><div className="pc-zone l" onClick={()=>step(-1)}/><div className="pc-zone r" onClick={()=>step(1)}/></>}
   <div className="pc-zone c" aria-hidden="true" onClick={()=>list.length?setView(i):undefined}/>
   <CardTags c={c}/>
   <div className="stamp l">{t('fe.px.deck.stampLike')}</div><div className="stamp n">{t('fe.px.deck.stampPass')}</div>
   <div className="pc-info"><h2 className="pc-name"><span className="pcn">{name}</span>{c.ages.length>0&&<span>{c.ages.join(' · ')}</span>}<NameBadges p={c}/></h2>
    {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}
    <FollowCounts id={c.id} rel={rel}/>
    <div className="pc-hint"><ChevronDown/>{t('fe.px.card.hint')}</div>
   </div>
  </div>
  <div className="pc-body pc-full">
   {p&&<><PersonBio p={p}/><div className="mt12"><CompatSummary profileId={c.id}/></div><ProfileBody p={p} onOpen={setView}/></>}
   <div className="pc-foot"><FollowBtn id={c.id} name={name} rel={rel} setRel={setRel} toast={toast}/><Btn kind="soft" onClick={()=>navigate('/n/people/'+c.id)}>{t('fe.px.deck.full')}</Btn></div>
  </div>
  {view!==null&&<PhotoViewer srcs={list.map(x=>x.full)} index={view} onClose={()=>setView(null)}/>}
 </article>;
}

/** followBtnHTML: one «Подписаться» for the profile page and the Discover card; as the couple it says so. */
function FollowBtn({id,name,rel,setRel,toast}:{id:string,name:string,rel:Relation|null,setRel:(f:(r:Relation|null)=>Relation|null)=>void,toast:(m:string,err?:boolean)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const [busy,setBusy]=useState(false);const on=!!rel?.iFollow;
 const go=async()=>{if(!rel||busy)return;setBusy(true);
  try{await call('follow.set',{opId:newOpId(),profileId:id,on:!on},ok);setRel(x=>x&&{...x,iFollow:!on,followers:Math.max(0,x.followers+(on?-1:1))});toast(fill(t(on?'fe.px.fl.off':'fe.px.fl.on'),{name}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 return <Btn kind="soft" busy={busy} aria-pressed={on} title={on?t('fe.px.act.unfollowHint'):undefined} onClick={go} disabled={!rel}>
  {on?<><Check/>{t('fe.px.act.following')}</>:acting?.kind==='couple'?t('fe.px.act.followUs'):t('fe.people.follow')}</Btn>;
}

/** D01 — Discover is off for this profile: no candidates, two honest ways in (browse hidden / browse and be seen). */
function DatingOff({onChanged,toast}:{onChanged:()=>void,toast:(m:string,err?:boolean)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [busy,setBusy]=useState<''|'hidden'|'visible'>('');
 const couple=acting?.kind==='couple';
 const set=async(value:'hidden'|'visible')=>{if(busy)return;setBusy(value);
  try{const r=await call('profile.setVisibility',{opId:newOpId(),setting:'discoverMode',value},ok);
   if(r.pending){toast(t('fe.px.off.wait'));return;}
   const hasPhoto=acting?.avatar!=null;toast(value==='hidden'?t('fe.px.off.peekDone'):hasPhoto?t('fe.px.off.onDone'):t('fe.px.off.onNoPhoto'));onChanged();}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 return <div className="empty" style={{paddingTop:8}}>
  {couple?<span className="ico l"><Heart/></span>:<div className="pair-art" aria-hidden="true"><span className="pa-o pa-o1"/><span className="pa-o pa-o2"/><span className="pa-ring"/><span className="pa-heart"><HeartF/></span><i className="pa-d d1"/><i className="pa-d d2"/><i className="pa-d d3"/></div>}
  <h3 style={couple?undefined:{fontSize:24}}>{t(couple?'fe.px.off.titleUs':'fe.px.off.title')}</h3>
  <p style={{maxWidth:340}}>{t(couple?'fe.px.off.textUs':'fe.px.off.text')}</p>
  <div className="dmode">
   <button type="button" className={'dm'+(busy==='hidden'?' busy':'')} onClick={()=>set('hidden')} disabled={!!busy}><span className="ico v"><EyeOff/></span><span className="tx"><b>{t('fe.px.off.peek')}</b></span><ChevronRight/></button>
   <button type="button" className={'dm'+(busy==='visible'?' busy':'')} onClick={()=>set('visible')} disabled={!!busy}><span className="ico l"><Heart/></span><span className="tx"><b>{t('fe.px.off.on')}</b>{couple&&<small>{t('fe.px.off.onUsSub')}</small>}</span><ChevronRight/></button>
  </div>
  {couple?<Btn kind="text" auto className="mt12" onClick={()=>navigate('/n/me?layer=vis')}>{t('fe.px.off.allVis')}</Btn>
   :<div className="card list mt16" style={{textAlign:'left',width:'100%'}}>
    <div className="li"><span className="ico g"><Check/></span><span className="tx"><b>{t('fe.px.off.stays')}</b><small>{t('fe.px.off.staysSub')}</small></span></div>
    <div className="li"><span className="ico"><MessageCircle/></span><span className="tx"><b>{t('fe.px.off.chat')}</b><small>{t('fe.px.off.chatSub')}</small></span></div>
   </div>}
 </div>;
}

/** D10 — nobody left: the radar, why (filters or simply everyone seen), and where to go next. */
function DeckEmpty({byFilter,filterOn,openFilter,likesN,toLikes}:{byFilter:number|null,filterOn:number,openFilter:()=>void,likesN:number,toLikes:()=>void}){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const byF=!!byFilter&&byFilter>0;
 return <div className="empty" style={{paddingTop:4}}>
  <div className="radar"><i/><i/><i/>
   <span className="me">{acting?.avatar?<img src={acting.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div className="plate" style={plate(acting?.id??'me')}/>}</span>
   <span className="dot" style={{left:18,top:60,position:'absolute',overflow:'hidden'}}><div className="plate" style={plate('sea')}/></span>
   <span className="dot" style={{right:24,top:150,width:22,height:22,position:'absolute',overflow:'hidden'}}><div className="plate" style={plate('amber')}/></span>
  </div>
  <H level={2} as="h3">{byF?t('fe.px.empty.byF'):t('fe.px.empty.title')}</H>
  <p>{byF?fill(t('fe.px.empty.byFText'),{n:byFilter!>=100?'100+':byFilter!}):filterOn?t('fe.px.empty.withF'):t('fe.px.empty.text')}</p>
  <div className="btns">
   {filterOn>0&&<Btn onClick={openFilter}>{t('fe.px.empty.change')}</Btn>}
   <Btn kind="soft" onClick={toLikes}>{t('fe.px.empty.likes')}{likesN?` · ${likesN}`:''}</Btn>
   <Btn kind="text" onClick={()=>navigate('/n/people/history')}>{t('fe.px.empty.recent')}</Btn>
  </div>
  <div className="card list mt16" style={{textAlign:'left',width:'100%'}}>
   <Row icon={Users} tone="v" title={t('fe.px.empty.comm')} sub={t('fe.px.empty.commSub')} onClick={()=>navigate('/n/communities')}/>
   <Row icon={Sparkles} tone="l" title={t('fe.px.empty.int')} sub={t('fe.px.empty.intSub')} onClick={()=>navigate('/n/me/interests')}/>
  </div>
 </div>;
}

/* ---------- D06 likes ---------- */
function Likes({onCount,toDiscover}:{onCount:(n:number)=>void,toDiscover:()=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [toastNode,toast]=useToast();
 const [k,setK]=useState<'in'|'out'>('in');const us=acting?.kind==='couple';
 const [inc,setInc]=useState<z.infer<typeof incoming>['items']|null>(null);const [out,setOut]=useState<z.infer<typeof outgoing>['items']|null>(null);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState('');const [match,setMatch]=useState<{card:Card,conversationId?:string}|null>(null);
 const load=useCallback(()=>{setError(null);
  Promise.all([call('likes.incoming',{},incoming),call('likes.outgoing',{},outgoing)]).then(([a,b])=>{setInc(a.items);setOut(b.items);onCount(a.items.length);}).catch(setError);},[call,onCount]);
 useEffect(()=>{load();},[load,acting?.id]);
 const dismiss=async(c:Card)=>{if(busy)return;setBusy(c.id);
  try{await call('like.dismiss',{opId:newOpId(),profileId:c.id},ok);setInc(l=>{const n=l?.filter(x=>x.profile.id!==c.id)??null;onCount(n?.length??0);return n;});toast(fill(t('fe.px.lk.removed'),{name:cname(c)}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const back=async(c:Card)=>{if(busy)return;setBusy(c.id);
  try{const r=await call('like.send',{opId:newOpId(),profileId:c.id,source:'likes'},likeRes);setInc(l=>{const n=l?.filter(x=>x.profile.id!==c.id)??null;onCount(n?.length??0);return n;});
   if(r.state==='matched')setMatch({card:c,...(r.conversationId?{conversationId:r.conversationId}:{})});else toast(fill(t('fe.px.lkd.sent'),{name:cname(c)}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const unlike=async(c:Card)=>{if(busy)return;setBusy(c.id);
  try{await call('like.withdraw',{opId:newOpId(),profileId:c.id},ok);setOut(l=>l?.filter(x=>x.profile.id!==c.id)??null);toast(t('fe.px.lkd.withdrawn'));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const seg=<CSeg value={k} onChange={setK} options={[{id:'in',label:t(us?'fe.px.lk.inUs':'fe.px.lk.in'),n:inc?.length??0},{id:'out',label:t(us?'fe.px.lk.outUs':'fe.px.lk.out')}]}/>;
 let body:ReactNode;
 if(error)body=<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 else if(!inc||!out)body=k==='in'?<div className="likes">{[0,1,2,3].map(i=><div key={i} className="lk"><i className="sk sk-media"/></div>)}</div>:<Skel kind="list"/>;
 else if(k==='out')body=out.length?<Card list>{out.map(l=>{const c=l.profile;
  return <Row key={c.id} av={<Av name={cname(c)} seed={c.id} src={c.avatar?.src?.thumb}/>} title={<>{cname(c)}<NameBadges p={c}/></>}
   sub={[t(l.source==='profile'?'fe.px.lk.fromProfile':l.source==='likes'?'fe.px.lk.fromLikes':'fe.px.lk.fromDiscover'),l.at?when(l.at,locale):null,us&&l.initiator?'@'+l.initiator:null].filter(Boolean).join(' · ')}
   onClick={()=>navigate('/n/people/'+c.id)}
   end={<><Pill tone="wait">{t('fe.px.lk.pendingPill')}</Pill><IconBtn icon={X} kind="ghost" size="sm" label={t('fe.px.lk.unlike')} disabled={busy===c.id} onClick={()=>unlike(c)}/></>}/>;})}</Card>
  :<Empty icon={Heart} title={t('fe.px.lk.outEmpty')} text={t('fe.px.lk.outEmptyText')}><Btn kind="soft" onClick={toDiscover}>{t('fe.px.lk.toDiscover')}</Btn></Empty>;
 else body=inc.length?<div className="likes">{inc.map((l,i)=>{const c=l.profile;const src=photo(c);const age=c.ages.length?', '+c.ages.join(' · '):'';
  return <div key={c.id} className="lk" style={{animationDelay:`${i*50}ms`}}>
   <button type="button" style={{position:'absolute',inset:0}} aria-label={cname(c)} onClick={()=>navigate('/n/people/'+c.id)}>{src?<img src={src} alt="" draggable={false}/>:<div className="plate" style={plate(c.id)}/>}</button>
   <button type="button" className="lkx" aria-label={t('fe.px.lk.pass')} disabled={busy===c.id} onClick={()=>dismiss(c)}><X/></button>
   <span className="inf"><b>{cname(c)}{age}</b>{c.kind==='couple'&&<small className="pill lk-pair">{t('fe.px.lk.couple')}</small>}</span>
   <button type="button" className="lkb" aria-label={t('fe.px.lk.back')} disabled={busy===c.id} onClick={()=>back(c)}><HeartF/></button>
  </div>;})}</div>
  :<Empty icon={Heart} title={t('fe.px.lk.inEmpty')} text={t(us?'fe.px.lk.inEmptyUs':'fe.px.lk.inEmptyText')}><Btn kind="soft" onClick={()=>navigate('/n/me')}>{t(us?'fe.px.lk.improveUs':'fe.px.lk.improve')}</Btn></Empty>;
 return <>
  <View>{seg}{body}</View>
  {toastNode}
  {match&&<MatchOverlay other={{id:match.card.id,name:cname(match.card),src:photo(match.card)}} conversationId={match.conversationId} onClose={()=>setMatch(null)}/>}
 </>;
}

/* ---------- P01 another person's profile ---------- */
export function PersonScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();
 const [p,setP]=useState<PersonProfile|null>(null);const [error,setError]=useState<unknown>(null);
 const [menu,setMenu]=useState<MenuStep>(null);const [blocked,setBlocked]=useState(false);const [toastNode,toast]=useToast();
 const load=useCallback(()=>{setError(null);setP(null);call('profile.get',{profileId:id},personProfileRes).then(r=>setP(r.profile)).catch(setError);},[call,id]);
 useEffect(()=>{setBlocked(false);setMenu(null);load();},[load]);
 // After «Разблокировать» the profile is loaded again.
 const setBlock=useCallback((b:boolean)=>{setBlocked(b);if(!b)load();},[load]);
 const name=personName(p);
 if(p&&!blocked)return <>
  <ProfilePage p={p} onMore={()=>setMenu('menu')} toast={toast}
   menu={(rel,reload)=><PersonMenu profileId={id} name={name} step={menu} setStep={setMenu} blocked={blocked} setBlocked={setBlock} toast={toast} rel={rel} onRel={reload}/>}/>
  {toastNode}
 </>;
 return <>
  <Bar title={blocked?t('fe.px.bl.stateTitle'):error?t('fe.px.unavailable'):''} back>
   {blocked&&<IconBtn icon={Ellipsis} kind="ghost" aria-haspopup="dialog" label={t('fe.px.menu.more')} onClick={()=>setMenu('menu')}/>}
  </Bar>
  {blocked?<View><Empty icon={Ban} title={t('fe.px.bl.stateTitle')} text={t('fe.px.bl.stateText')}><Btn kind="soft" onClick={()=>setMenu('menu')}>{t('fe.px.menu.unblock')}</Btn></Empty></View>
   :error?<View><Empty icon={Lock} title={t('fe.px.unavailable')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty></View>
   :<div className="view nodock top0 profile-page"><div className="wrap"><div className="hero"><i className="sk sk-media" style={{position:'absolute',inset:0}}/></div><Skel kind="card" rows={2}/></div></div>}
  {blocked&&<PersonMenu profileId={id} name={name} step={menu} setStep={setMenu} blocked setBlocked={setBlock} toast={toast}/>}
  {toastNode}
 </>;
}

