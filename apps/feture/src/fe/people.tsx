import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {openPaywall} from './premium';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Search,Ban,Bell,CalendarDays,Check,ChevronDown,ChevronLeft,ChevronRight,EyeOff,Heart,Ellipsis,History,Info,KeyRound,LocateFixed,Lock,MapPin,MessageCircle,SlidersHorizontal,Sparkles,Undo2,Users,X} from 'lucide-react';
import {Actions,Alert,Av,Bar,Btn,Card,Chip,Chips,ChoiceChips,Empty,H,IconBtn,LikeTile,Note,PersonName,PhotoBars,Pill,Radar,Range,RangeDual,Row,SearchInput,SectionLabel,Seg,Sheet,Skel,Soon,Stack,Text,View,plate} from './kit';
import {useFe} from './session';
import {DiscoverPhotoAsk} from './discover-photo';
import {NameBadges} from './faces';
import {BellButton} from './inbox';
import {when} from './feed';
import {FollowButton} from './follow';
import {catalogRes,cardOneRead,cardRead,CompatSummary,FollowCounts,MatchOverlay,PersonBio,PersonMenu,PhotoViewer,ProfileBody,ProfilePage,personName,personProfileRes,pxError,readCard,readCatalog,usePrivate,useRelation,useToast,type CardPre,type PxToast,
 type Catalog,type MenuStep,type PersonProfile,type Relation} from './profile-extras';

/** Slice F (V21 D03–D10): Discover cards from the server's mutual pool with the whole profile under the photo, swipe
 * or buttons to like / pass, «Это взаимно» → chat, the likes grid and another person's profile (P01). The client shows
 * only what the server returned: no invented matches, counters or scores. People search lives in the global search. */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
const card=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),ages:z.array(z.number()),
 city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),likedMe:z.boolean(),shared:z.number(),photoVerified:z.boolean().optional(),premium:z.boolean().optional(),
 // Discover only: what the top card shows before it is scrolled (photos, follower counts, follow, private part).
 photos:z.array(media).optional(),followers:z.number().optional(),following:z.number().optional(),iFollow:z.boolean().optional(),
 private:z.object({exists:z.boolean(),open:z.boolean()}).optional()});
type Card=z.infer<typeof card>;
const deck=z.object({ok:z.literal(true),off:z.boolean(),closed:z.boolean().optional(),needsLocation:z.boolean().optional(),items:z.array(card)});
const datingStatusRes=z.object({ok:z.literal(true),open:z.boolean(),notify:z.boolean()});
const notifyRes=z.object({ok:z.literal(true),notify:z.boolean()});
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
/** The card's photos: the deck's own list when the server sends it, else the avatar (the profile's list once read). */
const cardPhotos=(c:Card)=>{const l=(c.photos??[]).filter(m=>!m.pending&&m.src).map(m=>({card:m.src?.card??m.src?.full??m.src?.thumb??'',full:m.src?.full??m.src?.card??''})).filter(x=>x.card);
 if(l.length)return l;const a=photo(c);return a?[{card:a,full:c.avatar?.src?.full??a}]:[];};
/** Photos already asked for: the next cards' first photos load while the person still looks at the current one. */
const preloaded=new Set<string>();
const preload=(src:string|undefined)=>{if(!src||preloaded.has(src))return;preloaded.add(src);if(preloaded.size>300)preloaded.clear();const i=new Image();i.decoding='async';i.src=src;};
/** The swipe tip shows once per account (prototype PPL-007), as a toast, so nothing on the screen moves. */
const TIP_KEY='fe.tip.deck:';
const tipSeen=(account:string)=>{try{return localStorage.getItem(TIP_KEY+account)==='1';}catch{return false;}};
const markTip=(account:string)=>{try{localStorage.setItem(TIP_KEY+account,'1');}catch{/* no storage: once per visit */}};
const tipShown=new Set<string>();
/** The deck asks for the most the server gives (20) and for more when it is down to REFILL_AT: a deck read takes a
 * second or two, so even quick swipes never meet an empty deck. The decisions still on their way are in the answer
 * and are left out here. */
const QUEUE=20,REFILL_AT=8;

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
   <CSeg big value={tab} onChange={v=>{setTab(v);navigate({pathname:'/n/people',search:v==='likes'?'?sub=likes':''},{replace:true});}}
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
 * «Везде», a city from the catalogue, or «Рядом»: within a radius of the approximate place the person shares on tap
 * (location.set; rounded to ~5 km here and on the server, never shown to anyone). */
const filterShape=z.object({show:z.enum(['all','people','pairs']),ageMin:z.number(),ageMax:z.number(),cityId:z.string().nullable(),
 placeMode:z.enum(['city','nearby']).default('city'),radiusKm:z.number().default(25),
 genders:z.array(z.string()),orients:z.array(z.string()),formats:z.array(z.string()),seeks:z.array(z.string()),roles:z.array(z.string()),topics:z.array(z.string())});
const locationRes=z.object({ok:z.literal(true),location:z.object({lat:z.number(),lon:z.number()}).nullable().optional(),pending:z.unknown().optional()}).passthrough();
/** The browser's position, only when the person taps «Определить примерное место»; rounded to the 0.05° grid (~5 km)
 * before it leaves the device. */
function coarsePosition():Promise<{lat:number,lon:number}>{
 return new Promise((res,rej)=>{if(!('geolocation' in navigator)){rej(new Error('unsupported'));return;}
  navigator.geolocation.getCurrentPosition(p=>res({lat:Math.round(p.coords.latitude*20)/20,lon:Math.round(p.coords.longitude*20)/20}),rej,{enableHighAccuracy:false,maximumAge:600000,timeout:15000});});
}
type Filter=z.infer<typeof filterShape>;
const filterRes=z.object({ok:z.literal(true),filter:filterShape});
const countRes=z.object({ok:z.literal(true),count:z.number(),capped:z.boolean()});
const DF_ROWS=[['genders','gender'],['orients','orient'],['formats','format'],['seeks','seek'],['roles','role'],['topics','']] as const;
type DfRow=typeof DF_ROWS[number][0];
type DfSub=DfRow|'city';
const DF_DEFAULT:Filter={show:'all',ageMin:18,ageMax:99,cityId:null,placeMode:'city',radiusKm:25,genders:[],orients:[],formats:[],seeks:[],roles:[],topics:[]};
// Topics people are not searched by (prototype dfRows); the server refuses them as well.
const DF_HIDDEN=new Set(['limits','edge','safety']);
const dfOn=(f:Filter)=>[f.show!=='all',f.ageMin!==18||f.ageMax!==99,!!f.cityId||f.placeMode==='nearby',...DF_ROWS.map(([k])=>f[k].length>0)].filter(Boolean).length;
type Where='any'|'city'|'nearby';

function DiscoverFilter({initial,onClose,onApplied}:{initial:Filter,onClose:()=>void,onApplied:(f:Filter)=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [f,setF]=useState<Filter>(initial);const [sub,setSub]=useState<DfSub|null>(null);const [q,setQ]=useState('');
 const [where,setWhere]=useState<Where>(initial.placeMode==='nearby'?'nearby':initial.cityId?'city':'any');
 // «Рядом»: is an approximate place shared already (location.get); null while unknown.
 const [loc,setLoc]=useState<boolean|null>(null);const [geo,setGeo]=useState<''|'busy'|'denied'|'wait'>('');
 // A slow first read must not undo a place shared meanwhile (it left «Рядом» without its radius: D04).
 const shared=useRef(false);
 useEffect(()=>{call('location.get',{},locationRes).then(r=>{if(!shared.current)setLoc(!!r.location);}).catch(()=>{if(!shared.current)setLoc(false);});},[call]);
 const noPlace=where==='nearby'&&loc!==true;
 const share=async()=>{if(geo==='busy')return;setGeo('busy');
  try{const c=await coarsePosition();const r=await call('location.set',{opId:newOpId(),lat:c.lat,lon:c.lon},locationRes);
   if(r.pending){setGeo('wait');return;}shared.current=true;setLoc(true);setGeo('');}
  catch(e){if(e instanceof FeError)setError(e);setGeo('denied');}};
 const setWhereTo=(v:Where)=>{setWhere(v);setF(x=>v==='nearby'?{...x,placeMode:'nearby',cityId:null}:v==='any'?{...x,placeMode:'city',cityId:null}:{...x,placeMode:'city'});};
 const [cat,setCat]=useState<Catalog|null>(null);const [count,setCount]=useState<{count:number,capped:boolean}|null>(null);
 const [countError,setCountError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>(null);
 // `body` sits inside the sheet's scrolling `.sh-b`: a nested list starts at the top and takes the focus.
 const body=useRef<HTMLDivElement>(null);
 const lab=(x:{ru:string|null,en:string|null})=>(locale==='en'?x.en||x.ru:x.ru||x.en)||'';
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(setCat).catch(()=>{});},[call]);
 useEffect(()=>{body.current?.closest<HTMLElement>('.sheet')?.focus({preventScroll:true});const b=body.current?.closest('.sh-b');if(b)b.scrollTop=0;},[sub]);
 useEffect(()=>{
  setCount(null);setCountError(null);const ctl=new AbortController();
  if(f.placeMode==='nearby'&&loc!==true)return;
  const timer=setTimeout(()=>call('discover.count',{filter:f},countRes,{signal:ctl.signal}).then(r=>setCount({count:r.count,capped:r.capped})).catch(e=>{if(!ctl.signal.aborted)setCountError(e);}),400);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[f,call,loc]);
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
  if(f.placeMode==='nearby')parts.push(fill(t('fe.w7.df.sumNear'),{n:f.radiusKm}));else if(!f.cityId)parts.push(t('fe.df.sumAnywhere'));else if(place)parts.push(lab(place));
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
  const pick=(id:string)=>{if(sub==='city'){setF(x=>({...x,placeMode:'city',cityId:x.cityId===id?null:id}));setWhere('city');}else toggle(sub,id);};
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
    {cat&&!shown.length&&<Empty compact icon={Search} title={t('fe.df.nothing')}/>}
   </div>
  </Sheet>;
 }
 const dirty=JSON.stringify(f)!==JSON.stringify(initial);
 return <Sheet full title={t('fe.df.title')} onClose={onClose} dirty={dirty}
  head={<Btn kind="text" auto className={on?undefined:'off'} aria-disabled={on?undefined:true} onClick={()=>{if(on){setF(DF_DEFAULT);setWhere('any');}}}>{t('fe.df.reset')}</Btn>}
  foot={<>
   {on>0&&<p className="df-sum">{summary()}</p>}
   <Btn onClick={apply} busy={busy} disabled={busy||noPlace}>{noPlace?t('fe.w7.df.needPlace'):count?count.count?fill(t('fe.df.showN'),{n:count.capped?'100+':count.count}):t('fe.df.applyAnyway'):t('fe.df.showPlain')}</Btn>
  </>}>
   <div ref={body}>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.where')}</b>{where!=='any'&&clr(()=>setWhereTo('any'))}</div>
     <ChoiceChips label={t('fe.df.where')} value={where} options={(['any','city','nearby'] as const).map(v=>[v,v==='nearby'?t('fe.w7.df.nearby'):t('fe.df.where.'+v)] as const)}
      onChange={v=>{setWhereTo(v);if(v==='city'&&!f.cityId)setSub('city');}}/>
     {where==='city'&&<div className="fld"><button type="button" className="fld-main" onClick={()=>setSub('city')}><MapPin/><span>{place?lab(place):t('fe.df.pickCity')}</span></button>
      {f.cityId?clr(()=>setF(x=>({...x,cityId:null}))):<ChevronRight/>}</div>}
     {noPlace&&loc===false&&<><div className="fld"><button type="button" className="fld-main" onClick={()=>void share()} disabled={geo==='busy'||geo==='wait'} aria-busy={geo==='busy'||undefined}>
       <LocateFixed/><span>{t('fe.w7.df.share')}</span></button><ChevronRight/></div>
      {geo==='denied'&&<Alert kind="warn" className="mt8">{t('fe.w7.df.denied')}</Alert>}
      {geo==='wait'&&<Alert kind="info" className="mt8">{t('fe.w7.df.wait')}</Alert>}</>}
     {where==='nearby'&&loc===null&&<Skel kind="list" rows={1}/>}
     {where==='nearby'&&loc===true&&<><Stack row justify="between" className="mt8"><Text size="sm" tone="mute" as="span">{t('fe.w7.df.radius')}</Text><Text bold as="span">{fill(t('fe.w7.df.upTo'),{n:f.radiusKm})}</Text></Stack>
      <Range min={5} max={100} step={5} value={Math.min(100,f.radiusKm)} label={t('fe.w7.df.radius')} onChange={v=>setF(x=>({...x,radiusKm:v}))}/></>}
     {where==='nearby'&&<Note className="mt8">{t('fe.w7.df.coarse')}</Note>}
    </section>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.show')}</b>{f.show!=='all'&&clr(()=>setF(x=>({...x,show:'all'})))}</div>
     <ChoiceChips label={t('fe.df.show')} value={f.show} options={(['all','people','pairs'] as const).map(v=>[v,t('fe.df.show.'+v)] as const)} onChange={v=>setF(x=>({...x,show:v}))}/>
    </section>
    <section className="fin"><div className="fin-t"><b>{t('fe.df.age')}</b><b className="fin-v">{f.ageMin}–{f.ageMax}</b>{(f.ageMin!==18||f.ageMax!==99)&&clr(()=>setF(x=>({...x,ageMin:18,ageMax:99})))}</div>
     <div className="age-filter"><RangeDual min={18} max={99} lo={f.ageMin} hi={f.ageMax} label={t('fe.df.age')} labels={[t('fe.df.ageMin'),t('fe.df.ageMax')]}
      onChange={(l,h)=>{if(l!==f.ageMin)age(0,l);else age(1,h);}}/></div>
    </section>
    <div className="df-more"><SectionLabel>{t('fe.df.more')}</SectionLabel><Card list>
     {DF_ROWS.map(([k])=>{const names=new Map(groups(k).flatMap(g=>g.list));const sel=f[k].map(v=>names.get(v)).filter((x):x is string=>!!x);
      return <div key={k} className="df-row"><Row title={t('fe.df.row.'+k)} onClick={()=>setSub(k)}
       sub={<span className={sel.length?'on':''}>{sel.length?sel.slice(0,2).join(', ')+(sel.length>2?fill(t('fe.df.andMore'),{n:sel.length-2}):''):t('fe.df.any')}</span>}/>
       {f[k].length>0&&clr(()=>setF(x=>({...x,[k]:[]})))}</div>;})}
    </Card></div>
    {count&&count.count===0&&<Alert kind="warn" icon={Info} className="mt12"><b>{t('fe.df.nobody')}</b>{t('fe.df.nobodyText')}</Alert>}
    {countError!=null&&<Alert kind="err" noIcon className="mt12">{feErrorMessage(countError,t)}</Alert>}
    {error!=null&&<Alert kind="err" noIcon className="mt12">{feErrorMessage(error,t)}</Alert>}
   </div>
 </Sheet>;
}

/* ---------- D03 deck ---------- */
type Decision={card:Card,dir:1|-1};

/** The deck is a local queue: a swipe takes the top card away at once and sends the decision in the background (one
 * request per swipe, in order, so «Вернуть» always meets the server's last decision); the queue is refilled before it
 * runs out and the next cards' photos are loaded ahead, so there is never a reload between two people. */
function Discover({reloadKey,onOff,filterOn,openFilter,likesN,toLikes,onLikes}:{reloadKey:number,onOff:(off:boolean)=>void,filterOn:number,openFilter:()=>void,likesN:number,toLikes:()=>void,onLikes:()=>void}){
 const {call,acting,state}=useFe();const {t}=useI18n();
 const [cards,setCards]=useState<Card[]|null>(null);const [off,setOff]=useState(false);const [error,setError]=useState<unknown>(null);
 const [closed,setClosed]=useState(false);const [needsLoc,setNeedsLoc]=useState(false);
 const [match,setMatch]=useState<{card:Card,conversationId?:string}|null>(null);const [toastNode,toast]=useToast();
 const [made,setMade]=useState<Decision[]>([]);const [byFilter,setByFilter]=useState<number|null>(null);
 const [filling,setFilling]=useState(false);const [settled,setSettled]=useState(0);
 const busy=useRef(false);const top=useRef<HTMLElement|null>(null);const next=useRef<HTMLElement|null>(null);const acts=useRef<HTMLDivElement>(null);
 const undoRef=useRef<()=>void>(()=>{});
 // Decided here (sent or on the way): a refill that still has them (the server has not recorded it yet) leaves them out.
 const gone=useRef(new Set<string>());const chain=useRef<Promise<unknown>>(Promise.resolve());
 const gen=useRef(0);const exhausted=useRef(false);const filling$=useRef(false);const pendingN=useRef(0);
 const accountId=state.status==='ready'?state.boot.account.id:'';
 const apply=(r:z.infer<typeof deck>)=>{setOff(r.off);onOff(r.off);setClosed(!!r.closed);setNeedsLoc(!!r.needsLocation);};
 const load=useCallback(()=>{const g=++gen.current;setError(null);exhausted.current=false;
  call('discover.deck',{limit:QUEUE},deck,{fresh:true}).then(r=>{if(g!==gen.current)return;apply(r);setCards(r.items.filter(c=>!gone.current.has(c.id)));})
   .catch(e=>{if(g!==gen.current)return;setError(e);setCards(c=>c??[]);});
 },[call,onOff]);
 const refill=useCallback(()=>{if(filling$.current||exhausted.current)return;const g=gen.current;filling$.current=true;setFilling(true);
  call('discover.deck',{limit:QUEUE},deck,{fresh:true}).then(r=>{if(g!==gen.current)return;apply(r);
   setCards(cur=>{const have=new Set((cur??[]).map(x=>x.id));const add=r.items.filter(x=>!have.has(x.id)&&!gone.current.has(x.id));if(!add.length)exhausted.current=true;return [...(cur??[]),...add];});})
   .catch(()=>{exhausted.current=true;}).finally(()=>{filling$.current=false;setFilling(false);});
 },[call,onOff]);
 // A new filter (reloadKey) or another acting profile starts over.
 useEffect(()=>{gone.current=new Set();setMade([]);setCards(null);load();},[load,reloadKey,acting?.id]);
 // Down to the last few: ask for more. A decision that lands may free a place the last answer did not have.
 useEffect(()=>{exhausted.current=false;},[settled]);
 useEffect(()=>{if(cards&&cards.length<=REFILL_AT&&!off&&!closed)refill();},[cards,settled,refill,off,closed]);
 // The next cards' photos load while the current one is looked at.
 useEffect(()=>{for(const c of (cards??[]).slice(0,6))preload(cardPhotos(c)[0]?.card);},[cards]);
 // Option and topic names under a card are there before the first card is scrolled.
 useEffect(()=>{readCatalog(call).catch(()=>{});},[call]);
 // When the filters are what empties Discover, say so (PPL-013): the count without them.
 const empty=!!cards&&!cards.length&&!filling&&!pendingN.current;
 useEffect(()=>{if(!empty||!filterOn){setByFilter(null);return;}
  call('discover.count',{filter:DF_DEFAULT},countRes).then(r=>setByFilter(r.count)).catch(()=>setByFilter(null));},[empty,filterOn,call]);
 // The tip: once per account, as a toast over the screen.
 const any=!!cards?.length;
 useEffect(()=>{if(!any||!accountId||tipShown.has(accountId)||tipSeen(accountId))return;tipShown.add(accountId);markTip(accountId);
  toast(t(acting?.kind==='couple'?'fe.px.deck.tipUs':'fe.px.deck.tip'));},[any,accountId,toast,t,acting?.kind]);
 const fly=(dir:number)=>{const c=top.current;if(!c)return;c.classList.add('fly');c.style.transform=`translateX(${dir*130}%) rotate(${dir*16}deg)`;c.style.setProperty(dir>0?'--l':'--n','1');
  const n=next.current;if(n){n.style.transform='';n.classList.add('promote');}};
 const decide=useCallback(async(dir:1|-1)=>{
  const c=cards?.[0];if(!c||busy.current)return;busy.current=true;fly(dir);gone.current.add(c.id);
  const g=gen.current;
  const sent=chain.current.catch(()=>{}).then(()=>call('discover.decide',{opId:newOpId(),profileId:c.id,decision:dir>0?'like':'pass'},decided));
  chain.current=sent;pendingN.current++;
  await new Promise(res=>setTimeout(res,290));
  setCards(cur=>(cur??[]).filter(x=>x.id!==c.id));setMade(m=>[...m,{card:c,dir}]);busy.current=false;
  sent.then(r=>{pendingN.current--;if(g!==gen.current)return;setSettled(n=>n+1);
   if(c.likedMe||r.state==='matched')onLikes();
   if(r.state==='matched')setMatch({card:c,...(r.conversationId?{conversationId:r.conversationId}:{})});
   else if(dir>0)toast(fill(t(acting?.kind==='couple'?'fe.px.lkd.sentUs':'fe.px.lkd.sent'),{name:cname(c)}),false,{label:t('fe.mx.undo'),fn:()=>undoRef.current()});
  },e=>{pendingN.current--;if(g!==gen.current)return;setSettled(n=>n+1);
   // Already decided (another device, a retried request) or no longer in Discover: the card is gone either way.
   if(e instanceof FeError&&(e.code==='conflict'||e.code==='not_found'))return;
   gone.current.delete(c.id);setMade(m=>m.filter(x=>x.card.id!==c.id));setCards(cur=>[c,...(cur??[]).filter(x=>x.id!==c.id)]);toast(pxError(e,t),true);});
 },[cards,call,t,toast,onLikes,acting?.kind]);
 // The server allows one free undo a day (shared with «Вернуть» in the history) and says so when it is spent.
 const undo=async()=>{
  if(busy.current)return;busy.current=true;
  try{await chain.current.catch(()=>{});const r=await call('discover.undo',{opId:newOpId()},undone);const back=made.find(x=>x.card.id===r.profileId)?.card;
   setMade(m=>m.filter(x=>x.card.id!==r.profileId));gone.current.delete(r.profileId);toast(t('fe.px.undo.back'));
   if(back)setCards(cur=>[back,...(cur??[]).filter(x=>x.id!==back.id)]);else load();}
  catch(e){if(e instanceof FeError&&e.code==='premium_required')openPaywall('undo');else toast(pxError(e,t),true);}finally{busy.current=false;}
 };
 undoRef.current=()=>void undo();
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(match||document.querySelector('.fe-v21 .layer .sheet')||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;
  if(e.key==='ArrowRight')void decide(1);if(e.key==='ArrowLeft')void decide(-1);};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[decide,match]);
 const box=(node:ReactNode)=><><View>{node}</View>{toastNode}</>;
 const overlay=match&&<MatchOverlay other={{id:match.card.id,name:cname(match.card),src:photo(match.card)}} conversationId={match.conversationId} onClose={()=>setMatch(null)}/>;
 if(error&&!cards?.length)return box(<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>);
 const skel=<div className="view deckmode"><div className="deck"><div className="pc top fe-pc-skel"><div className="pc-ph"><i className="sk sk-media"/></div></div></div>{toastNode}{overlay}</div>;
 if(cards===null)return skel;
 if(closed)return box(<DatingSoon toast={toast}/>);
 if(off)return box(<DatingOff onChanged={()=>{setCards(null);load();}} toast={toast}/>);
 const [c,nx]=cards;
 // The last decisions are still on their way: they may free more people, so no «nobody left» yet.
 if(!c&&(filling||pendingN.current>0))return skel;
 if(!c&&needsLoc)return box(<Empty top icon={LocateFixed} title={t('fe.w7.df.locGone')} text={t('fe.w7.df.locGoneText')}><Btn onClick={openFilter}>{t('fe.px.empty.change')}</Btn></Empty>);
 if(!c)return <>{box(<DeckEmpty byFilter={filterOn?byFilter:null} filterOn={filterOn} openFilter={openFilter} likesN={likesN} toLikes={toLikes}/>)}{overlay}</>;
 return <div className="view deckmode">
  <div className="deck">
   {nx&&<NextCard key={nx.id} c={nx} cardRef={next}/>}
   <TopCard key={c.id} c={c} cardRef={top} nextRef={next} actsRef={acts} onDecide={decide} toast={toast}/>
   <div className="acts onphoto" ref={acts}>
    <button type="button" className={'act undo'+(made.length?'':' off')} aria-label={t('fe.people.undo')} onClick={undo}><Undo2/></button>
    <button type="button" className="act pass" aria-label={t('fe.people.pass')} onClick={()=>void decide(-1)}><X/></button>
    <KeyAct key={c.id} id={c.id} known={c.private} cardRef={top}/>
    <button type="button" className="act like" aria-label={t(acting?.kind==='couple'?'fe.px.deck.likeUs':'fe.px.deck.like')} onClick={()=>void decide(1)}><HeartF/></button>
   </div>
  </div>
  {toastNode}{overlay}
 </div>;
}

/** The deck's key button (deckInner `act req`): only when the person has a private part; it scrolls the card to it,
 * where «Попросить доступ» (or what is already open) lives. */
function KeyAct({id,known,cardRef}:{id:string,known?:{exists:boolean,open:boolean}|undefined,cardRef:React.RefObject<HTMLElement|null>}){
 const {t}=useI18n();const p=usePrivate(id,!!known);
 const exists=known?known.exists:!!p?.exists;
 if(!exists)return null;const open=known?known.open:(p?.scopes??[]).length>0;const label=t(open?'fe.px.deck.privOpen':'fe.px.deck.privAsk');
 const go=()=>{const c=cardRef.current;const v=c?.querySelector('.vault');if(!c||!v)return;
  c.scrollTo({top:c.scrollTop+v.getBoundingClientRect().top-c.getBoundingClientRect().top-12,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
 return <button type="button" className="act req" aria-label={label} title={label} onClick={go}><KeyRound/></button>;
}

function CardPhoto({c,src}:{c:Card,src:string|null}){
 const name=cname(c);
 return src?<><img className="mbg" src={src} alt="" aria-hidden="true" draggable={false}/><img src={src} alt={name} draggable={false}/></>:<div className="plate" style={plate(c.id)}/>;
}
function CardTags({c}:{c:Card}){
 const {t,locale}=useI18n();const {acting}=useFe();
 if(!c.likedMe&&!c.shared)return null;
 return <div className="pc-tags">{c.likedMe&&<span className="pc-liked"><HeartF/>{t(acting?.kind==='couple'?'fe.px.deck.likesYouUs':'fe.px.deck.likesYou')}</span>}
  {c.shared>0&&<span className="pc-score"><b>{c.shared}</b><small>{plural5(t,locale,'fe.px.deck.topic',c.shared)}</small></span>}</div>;
}
function plural5(t:(k:string)=>string,locale:string,base:string,n:number){const m10=n%10,m100=n%100;return t(base+(locale==='en'?(n===1?'1':'5'):m10===1&&m100!==11?'1':m10>=2&&m10<=4&&(m100<12||m100>14)?'2':'5'));}

function NextCard({c,cardRef}:{c:Card,cardRef:React.RefObject<HTMLElement|null>}){
 const {locale}=useI18n();const {call,acting}=useFe();const city=c.city?(locale==='en'?c.city.en||c.city.ru:c.city.ru||c.city.en):null;
 // What is under its photo is read now (one request), so the card is whole the moment it is on top.
 const aid=acting?.id??'';
 useEffect(()=>{if(aid&&cardOneRead()!==false)readCard(call,aid,c.id).catch(()=>{});},[call,aid,c.id]);
 return <article ref={cardRef as React.RefObject<HTMLElement>} className="pc next" inert aria-hidden="true">
  <div className="pc-ph"><CardPhoto c={c} src={cardPhotos(c)[0]?.card??null}/><CardTags c={c}/>
   <div className="pc-info"><PersonName name={cname(c)} age={c.ages.join(' · ')}><NameBadges p={c}/></PersonName>
    {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}</div>
  </div>
 </article>;
}

/** The top card (deckInner/card): photo with bars and zones, tags, stamps, the info block and — scrolled — the whole
 * profile in its own layout with «Подписаться» and «Полный профиль». Horizontal drag decides, vertical scrolls. */
function TopCard({c,cardRef,nextRef,actsRef,onDecide,toast}:{c:Card,cardRef:React.RefObject<HTMLElement|null>,nextRef:React.RefObject<HTMLElement|null>,
 actsRef:React.RefObject<HTMLDivElement|null>,onDecide:(dir:1|-1)=>void,toast:PxToast}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const aid=acting?.id??'';
 const [ix,setIx]=useState(0);const [view,setView]=useState<number|null>(null);
 // Everything under the photo (bio, compatibility, details, interests, posts, the private part) comes in one read as
 // soon as the card is next in the deck (NextCard) — usually it is here before the card is on top, so the whole body
 // is drawn on the first frame. Until then its place is held by blocks of about its size; nothing loads on scroll.
 const [pre,setPre]=useState<CardPre|null>(()=>aid?cardRead(aid,c.id):null);
 useEffect(()=>{if(pre||!aid)return;let live=true;
  // A server without the one read: the parts are asked only once someone stays on the card, so quick swipes stay cheap.
  const go=()=>readCard(call,aid,c.id).then(r=>{if(live)setPre(r);}).catch(()=>{});
  const timer=cardOneRead()===false?setTimeout(go,700):(go(),undefined);
  return ()=>{live=false;clearTimeout(timer);};},[call,aid,c.id,pre]);
 const p:PersonProfile|null=pre?.profile??null;
 const known=c.followers!=null?{followers:c.followers,following:c.following??0,iFollow:!!c.iFollow,liked:false,mutual:false}:null;
 const [rel,setRel]=useRelation(c.id,{known});
 const photos=!c.photos&&p?p.photos.filter(m=>!m.pending&&m.src).map(m=>({card:m.src?.card??m.src?.full??m.src?.thumb??'',full:m.src?.full??m.src?.card??''})):[];
 const list=photos.length?photos:cardPhotos(c);
 useEffect(()=>{for(const x of list.slice(1,3))preload(x.card);},[list.length>1?list[1]!.card:'']);
 const i=Math.min(ix,Math.max(0,list.length-1));const city=c.city?(locale==='en'?c.city.en||c.city.ru:c.city.ru||c.city.en):null;
 const nudge=useRef(0);
 const step=(d:number)=>{const n=i+d;const el=cardRef.current;if(n<0||n>=list.length){if(el){el.classList.remove('nudge-l','nudge-r');void el.offsetWidth;el.classList.add(d<0?'nudge-l':'nudge-r');}return;}setIx(n);};
 // The handlers stay bound for the card's life: a new `onDecide` (the deck refilled meanwhile) must not drop a drag.
 const decideRef=useRef(onDecide);decideRef.current=onDecide;
 // initDeck: pointer drag on the card, the like/pass stamps follow the distance; a fast flick counts too.
 useEffect(()=>{const el=cardRef.current;if(!el)return;
  let sx=0,sy=0,t0=0,dx=0,mode:''|'x'|'y'='',pid:number|null=null;
  // Scrolling only flips a class on the buttons (no re-render per frame).
  const onScroll=()=>{actsRef.current?.classList.toggle('onphoto',el.scrollTop<el.clientHeight*.55);};
  const down=(e:PointerEvent)=>{if(e.button>0||(e.target as HTMLElement).closest('button,a,input,textarea,select'))return;sx=e.clientX;sy=e.clientY;t0=e.timeStamp;dx=0;mode='';pid=e.pointerId;};
  const move=(e:PointerEvent)=>{if(pid!==e.pointerId)return;const mx=e.clientX-sx,my=e.clientY-sy;const nx=nextRef.current;
   if(!mode){if(Math.abs(mx)>10&&Math.abs(mx)>Math.abs(my)*1.2){mode='x';el.setPointerCapture(pid);el.classList.add('drag');nx?.classList.add('drag');}else if(Math.abs(my)>10&&Math.abs(my)>Math.abs(mx)*1.2)mode='y';}
   if(mode==='x'){dx=mx;const pr=Math.min(1,Math.abs(dx)/140);if(nx)nx.style.transform=`scale(${.95+.05*pr}) translateY(${10-10*pr}px)`;el.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;
    el.style.setProperty('--l',String(Math.max(0,Math.min(1,dx/110))));el.style.setProperty('--n',String(Math.max(0,Math.min(1,-dx/110))));}};
  const end=(e:PointerEvent)=>{if(pid!==e.pointerId)return;pid=null;el.classList.remove('drag');nextRef.current?.classList.remove('drag');
   if(mode==='x'){nudge.current=e.timeStamp;
    if(Math.abs(dx)>Math.max(80,Math.min(110,el.clientWidth*.28))||Math.abs(dx)>44&&Math.abs(dx)/Math.max(1,e.timeStamp-t0)>.6)decideRef.current(dx>0?1:-1);
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
 },[cardRef,nextRef,actsRef]);
 const name=cname(c);
 return <article ref={cardRef as React.RefObject<HTMLElement>} className="pc top" aria-label={name}>
  <div className="pc-ph">
   {list[i]?<><img className="mbg" src={list[i]!.card} alt="" aria-hidden="true" draggable={false}/><img src={list[i]!.card} alt={name} draggable={false}/></>:<div className="plate" style={plate(c.id)}/>}
   <PhotoBars n={list.length} i={i} label={fill(t('fe.px.ph.n'),{i:i+1,n:list.length})}/>
   {list.length>1&&<><div className="pc-zone l" onClick={()=>step(-1)}/><div className="pc-zone r" onClick={()=>step(1)}/></>}
   <div className="pc-zone c" aria-hidden="true" onClick={()=>list.length?setView(i):undefined}/>
   <CardTags c={c}/>
   <div className="stamp l">{t('fe.px.deck.stampLike')}</div><div className="stamp n">{t('fe.px.deck.stampPass')}</div>
   <div className="pc-info"><PersonName name={name} age={c.ages.join(' · ')}><NameBadges p={c}/></PersonName>
    {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}
    <FollowCounts id={c.id} rel={rel}/>
    <div className="pc-hint"><ChevronDown/>{t('fe.px.card.hint')}</div>
   </div>
  </div>
  <div className="pc-body pc-full">
   {pre?<><PersonBio p={pre.profile}/><div className="mt12"><CompatSummary profileId={c.id} pre={pre.compat}/></div><ProfileBody p={pre.profile} pre={pre} onOpen={setView}/></>
    :<><Skel kind="card" rows={2}/><Skel kind="post" rows={1}/></>}
   <div className="pc-foot"><FollowButton profileId={c.id} name={name} on={!!rel?.iFollow} disabled={!rel} onChange={on=>setRel(x=>x&&{...x,iFollow:on,followers:Math.max(0,x.followers+(on?1:-1))})}/><Btn kind="soft" onClick={()=>navigate('/n/people/'+c.id)}>{t('fe.px.deck.full')}</Btn></div>
  </div>
  {view!==null&&<PhotoViewer srcs={list.map(x=>x.full)} index={view} onClose={()=>setView(null)}/>}
 </article>;
}


/** D01 — Discover is off for this profile: no candidates, two honest ways in (browse hidden / browse and be seen). */
const photoIdsRes=z.object({ok:z.literal(true),profile:z.object({photos:z.array(z.object({id:z.string()}).passthrough())}).passthrough()});
function DatingOff({onChanged,toast}:{onChanged:()=>void,toast:PxToast}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [busy,setBusy]=useState<''|'hidden'|'visible'>('');
 const couple=acting?.kind==='couple';
 // Owner 28.10.2026: «Показываться» without any photo asks for one first (DiscoverPhotoAsk), then switches on.
 const [askPhoto,setAskPhoto]=useState<string[]|null>(null);
 const set=async(value:'hidden'|'visible',checked=false)=>{if(busy)return;
  if(value==='visible'&&!checked&&acting&&acting.avatar==null){
   setBusy(value);
   const ids=await call('profile.get',{profileId:acting.id},photoIdsRes).then(r=>r.profile.photos.map(x=>x.id)).catch(()=>null);
   setBusy('');
   if(ids&&!ids.length){setAskPhoto(ids);return;}
  }
  setBusy(value);
  try{const r=await call('profile.setVisibility',{opId:newOpId(),setting:'discoverMode',value},ok);
   if(r.pending){toast(t('fe.px.off.wait'));return;}
   const hasPhoto=acting?.avatar!=null;toast(value==='hidden'?t('fe.px.off.peekDone'):hasPhoto?t('fe.px.off.onDone'):t('fe.px.off.onNoPhoto'));onChanged();}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 return <Empty top big={!couple} title={t(couple?'fe.px.off.titleUs':'fe.px.off.title')} text={t(couple?'fe.px.off.textUs':'fe.px.off.text')}
  art={couple?<span className="ico l"><Heart/></span>:<div className="pair-art" aria-hidden="true"><span className="pa-o pa-o1"/><span className="pa-o pa-o2"/><span className="pa-ring"/><span className="pa-heart"><HeartF/></span><i className="pa-d d1"/><i className="pa-d d2"/><i className="pa-d d3"/></div>}
  after={<><div className="dmode">
   <button type="button" className={'dm'+(busy==='hidden'?' busy':'')} onClick={()=>set('hidden')} disabled={!!busy}><span className="ico v"><EyeOff/></span><span className="tx"><b>{t('fe.px.off.peek')}</b></span><ChevronRight/></button>
   <button type="button" className={'dm'+(busy==='visible'?' busy':'')} onClick={()=>set('visible')} disabled={!!busy}><span className="ico l"><Heart/></span><span className="tx"><b>{t('fe.px.off.on')}</b>{couple&&<small>{t('fe.px.off.onUsSub')}</small>}</span><ChevronRight/></button>
  </div>
  {couple?<Btn kind="text" auto className="mt12" onClick={()=>navigate('/n/me?layer=vis')}>{t('fe.px.off.allVis')}</Btn>
   :<Card list className="mt16">
    <Row icon={Check} tone="g" title={t('fe.px.off.stays')} sub={t('fe.px.off.staysSub')}/>
    <Row icon={MessageCircle} title={t('fe.px.off.chat')} sub={t('fe.px.off.chatSub')}/>
   </Card>}
   {askPhoto&&<DiscoverPhotoAsk existing={askPhoto} couple={couple} onCancel={()=>setAskPhoto(null)} onAdded={async()=>{setAskPhoto(null);await set('visible',true);}}/>}</>}/>;
}

/** D11 — dating switched off by the team (deck `closed`): a teaser, nothing about candidates, and «Сообщить о
 * запуске» (dating.notify; a notification comes when it opens). */
function DatingSoon({toast}:{toast:PxToast}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [on,setOn]=useState<boolean|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{call('dating.status',{},datingStatusRes,{asAccount:true}).then(r=>setOn(r.notify)).catch(()=>setOn(false));},[call]);
 const flip=async()=>{if(busy||on===null)return;setBusy(true);
  try{const r=await call('dating.notify',{opId:newOpId(),on:!on},notifyRes,{asAccount:true});setOn(r.notify);toast(t(r.notify?'fe.w7.soon.on':'fe.w7.soon.off'));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 return <Soon badge={t('fe.w7.soon.badge')} title={t('fe.w7.soon.title')} text={t('fe.w7.soon.text')}
  points={[[Sparkles,t('fe.w7.soon.p1')],[KeyRound,t('fe.w7.soon.p2')],[MessageCircle,t('fe.w7.soon.p3')]]}>
  <Btn kind={on?'soft':'primary'} icon={on?Check:Bell} busy={busy||on===null} disabled={busy||on===null} pressed={!!on} onClick={()=>void flip()}>{t(on?'fe.w7.soon.notifyOn':'fe.w7.soon.notify')}</Btn>
  <Btn kind="text" onClick={()=>navigate('/n/me/interests')}>{t('fe.w7.soon.interests')}</Btn>
 </Soon>;
}

/** D10 — nobody left: the radar, why (filters or simply everyone seen), and where to go next. */
function DeckEmpty({byFilter,filterOn,openFilter,likesN,toLikes}:{byFilter:number|null,filterOn:number,openFilter:()=>void,likesN:number,toLikes:()=>void}){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const byF=!!byFilter&&byFilter>0;
 // Owner 28.10.2026: compact — a small radar, a short title and one line, «Симпатии» / «Недавние» side by side, and
 // where else to go as one list in one icon tone.
 return <Empty top title={byF?t('fe.px.empty.byF'):t('fe.px.empty.titleShort')} art={<Radar small src={acting?.avatar} seed={acting?.id??'me'}/>}
  text={byF?fill(t('fe.px.empty.byFText'),{n:byFilter!>=100?'100+':byFilter!}):filterOn?t('fe.px.empty.withF'):t('fe.px.empty.textShort')}
  after={<Card list>
   <Row icon={CalendarDays} tone="v" title={t('fe.w7.toEvents.near')} onClick={()=>navigate('/n/communities?sub=events')}/>
   <Row icon={Users} tone="v" title={t('fe.px.empty.comm')} onClick={()=>navigate('/n/communities')}/>
   <Row icon={Sparkles} tone="v" title={t('fe.px.empty.int')} onClick={()=>navigate('/n/me/interests')}/>
  </Card>}>
   {filterOn>0&&<Btn onClick={openFilter}>{t('fe.px.empty.change')}</Btn>}
   <Actions>
    <Btn kind="soft" icon={Heart} onClick={toLikes}>{t('fe.px.empty.likes')}{likesN?` · ${likesN}`:''}</Btn>
    <Btn kind="soft" icon={History} onClick={()=>navigate('/n/people/history')}>{t('fe.px.empty.recent')}</Btn>
   </Actions>
 </Empty>;
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
 // «Отменить» after ✕: the dismissal is the last Discover decision, so one undo brings the like back (V21 likePass).
 const undoDismiss=async()=>{try{await call('discover.undo',{opId:newOpId()},undone);load();}
  catch(e){if(e instanceof FeError&&e.code==='premium_required')openPaywall('undo');else toast(pxError(e,t),true);}};
 const dismiss=async(c:Card)=>{if(busy)return;setBusy(c.id);
  try{await call('like.dismiss',{opId:newOpId(),profileId:c.id},ok);setInc(l=>{const n=l?.filter(x=>x.profile.id!==c.id)??null;onCount(n?.length??0);return n;});
   toast(fill(t('fe.px.lk.removed'),{name:cname(c)}),false,{label:t('fe.mx.undo'),fn:()=>void undoDismiss()});}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 // «Отменить» after taking a like back sends it again from where it came (never 'discover': like.send refuses it).
 const resend=async(c:Card,source:string|null|undefined)=>{
  try{await call('like.send',{opId:newOpId(),profileId:c.id,source:source==='profile'?'profile':'likes'},likeRes);load();}catch(e){toast(pxError(e,t),true);}};
 const back=async(c:Card)=>{if(busy)return;setBusy(c.id);
  try{const r=await call('like.send',{opId:newOpId(),profileId:c.id,source:'likes'},likeRes);setInc(l=>{const n=l?.filter(x=>x.profile.id!==c.id)??null;onCount(n?.length??0);return n;});
   if(r.state==='matched')setMatch({card:c,...(r.conversationId?{conversationId:r.conversationId}:{})});else toast(fill(t(us?'fe.px.lkd.sentUs':'fe.px.lkd.sent'),{name:cname(c)}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const unlike=async(c:Card,source?:string|null)=>{if(busy)return;setBusy(c.id);
  try{await call('like.withdraw',{opId:newOpId(),profileId:c.id},ok);setOut(l=>l?.filter(x=>x.profile.id!==c.id)??null);
   toast(t(us?'fe.px.lkd.withdrawnUs':'fe.px.lkd.withdrawn'),false,{label:t('fe.mx.undo'),fn:()=>void resend(c,source)});}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const seg=<CSeg value={k} onChange={setK} options={[{id:'in',label:t(us?'fe.px.lk.inUs':'fe.px.lk.in'),n:inc?.length??0},{id:'out',label:t(us?'fe.px.lk.outUs':'fe.px.lk.out')}]}/>;
 let body:ReactNode;
 if(error)body=<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 else if(!inc||!out)body=k==='in'?<div className="likes">{[0,1,2,3].map(i=><div key={i} className="lk"><i className="sk sk-media"/></div>)}</div>:<Skel kind="list"/>;
 else if(k==='out')body=out.length?<Card list>{out.map(l=>{const c=l.profile;
  return <Row key={c.id} av={<Av name={cname(c)} seed={c.id} src={c.avatar?.src?.thumb}/>} title={<>{cname(c)}<NameBadges p={c}/></>}
   sub={[t(l.source==='profile'?'fe.px.lk.fromProfile':l.source==='likes'?'fe.px.lk.fromLikes':'fe.px.lk.fromDiscover'),l.at?when(l.at,locale):null,us&&l.initiator?'@'+l.initiator:null].filter(Boolean).join(' · ')}
   onClick={()=>navigate('/n/people/'+c.id)}
   end={<><Pill tone="wait">{t('fe.px.lk.pendingPill')}</Pill><IconBtn icon={X} kind="ghost" size="sm" label={t(us?'fe.px.lk.unlikeUs':'fe.px.lk.unlike')} disabled={busy===c.id} onClick={()=>unlike(c,l.source)}/></>}/>;})}</Card>
  :<Empty icon={Heart} title={t('fe.px.lk.outEmpty')} text={t(us?'fe.px.lk.outEmptyTextUs':'fe.px.lk.outEmptyText')}><Btn kind="soft" onClick={toDiscover}>{t('fe.px.lk.toDiscover')}</Btn></Empty>;
 else body=inc.length?<div className="likes">{inc.map(l=>{const c=l.profile;const src=photo(c);const age=c.ages.length?', '+c.ages.join(' · '):'';
  return <LikeTile key={c.id} src={src} seed={c.id} label={cname(c)} onOpen={()=>navigate('/n/people/'+c.id)}
   name={<><b>{cname(c)}{age}</b>{c.kind==='couple'&&<Pill className="lk-pair">{t('fe.px.lk.couple')}</Pill>}</>}>
   <button type="button" className="lkx" aria-label={t('fe.px.lk.pass')} disabled={busy===c.id} onClick={()=>dismiss(c)}><X/></button>
   <button type="button" className="lkb" aria-label={t(us?'fe.px.lk.backUs':'fe.px.lk.back')} disabled={busy===c.id} onClick={()=>back(c)}><HeartF/></button>
  </LikeTile>;})}</div>
  :<Empty icon={Heart} title={t('fe.px.lk.inEmpty')} text={t(us?'fe.px.lk.inEmptyUs':'fe.px.lk.inEmptyText')}><Btn kind="soft" onClick={()=>navigate('/n/me')}>{t(us?'fe.px.lk.improveUs':'fe.px.lk.improve')}</Btn></Empty>;
 return <>
  <View>{seg}{body}</View>
  {toastNode}
  {match&&<MatchOverlay other={{id:match.card.id,name:cname(match.card),src:photo(match.card)}} conversationId={match.conversationId} onClose={()=>setMatch(null)}/>}
 </>;
}

/* ---------- P01 another person's profile ---------- */
export function PersonScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t}=useI18n();
 // «Полный профиль» from a Discover card: the profile that card already read paints the page at once.
 const [p,setP]=useState<PersonProfile|null>(()=>acting?cardRead(acting.id,id)?.profile??null:null);const [error,setError]=useState<unknown>(null);
 const [menu,setMenu]=useState<MenuStep>(null);const [blocked,setBlocked]=useState(false);const [toastNode,toast]=useToast();
 // Another person starts from the skeleton; reading the same one again (after «Разблокировать») keeps the page.
 const [was,setWas]=useState(id);if(was!==id){setWas(id);setP(null);}
 const load=useCallback(()=>{setError(null);call('profile.get',{profileId:id},personProfileRes).then(r=>setP(r.profile)).catch(e=>{setP(null);setError(e);});},[call,id]);
 useEffect(()=>{setBlocked(false);setMenu(null);load();},[load]);
 // After «Разблокировать» the profile is loaded again.
 const setBlock=useCallback((b:boolean)=>{setBlocked(b);if(!b)load();},[load]);
 const name=personName(p);
 if(p&&!blocked)return <>
  <ProfilePage p={p} onMore={()=>setMenu('menu')} toast={toast}
   menu={(rel,reload)=><PersonMenu profileId={id} name={name} handle={p.kind==='person'?p.handle:null} step={menu} setStep={setMenu} blocked={blocked} setBlocked={setBlock} toast={toast} rel={rel} onRel={reload}/>}/>
  {toastNode}
 </>;
 return <>
  <Bar title={blocked?t('fe.px.bl.stateTitle'):error?t('fe.px.unavailable'):''} back>
   {blocked&&<IconBtn icon={Ellipsis} kind="ghost" aria-haspopup="dialog" label={t('fe.px.menu.more')} onClick={()=>setMenu('menu')}/>}
  </Bar>
  {blocked?<View><Empty icon={Ban} title={t('fe.px.bl.stateTitle')} text={t('fe.px.bl.stateText')}><Btn kind="soft" onClick={()=>setMenu('menu')}>{t('fe.px.menu.unblock')}</Btn></Empty></View>
   :error?<View><Empty icon={Lock} title={t('fe.px.unavailable')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty></View>
   :<div className="view nodock top0 profile-page"><div className="wrap"><div className="hero"><Skel kind="fill" rows={1}/></div><Skel kind="card" rows={2}/></div></div>}
  {blocked&&<PersonMenu profileId={id} name={name} step={menu} setStep={setMenu} blocked setBlocked={setBlock} toast={toast}/>}
  {toastNode}
 </>;
}

