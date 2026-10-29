import {evParts,evWhere,usePlaces} from './event-time';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Newspaper,BookOpen,ChevronLeft,ChevronRight,CircleCheck,Ellipsis,History,Pencil,Plus,Search as SearchIcon,SlidersHorizontal,User,UserMinus,Users,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActingAv,Alert,Av,Bar,Btn,Card,Chip,Chips,ChoiceChips,Empty,H,IconBtn,LoadMore,Note,Pill,Row,SearchInput,SectionLabel,Seg,Sheet,Skel,Stack,View,plate,Who,nickShown} from './kit';
import {useFe,useKeyChange} from './session';
import {PostCard,postSchema,type Post} from './feed';
import {InterestSheet,Jars,useInterests} from './interests';
import {faceFields,NameBadges} from './faces';
import {useToast} from './toast';
import {FollowButton} from './follow';
import {topicMatches} from './topic-search';

/** Discovery screens with the prototype's markup: V21 F04 (an interest's page), G01 (global search), P10 (followers /
 * following) and P20 (gallery). Everything shown comes from the server; the client only narrows what the server already
 * returned to the visitor (catalog names in search) and never invents counts. */

const named={ru:z.string(),en:z.string()};
const topicShape=z.object({id:z.string(),categoryId:z.string(),...named,descRu:z.string().nullable().optional(),descEn:z.string().nullable().optional()});
const catalogRes=z.object({ok:z.literal(true),categories:z.array(z.object({id:z.string(),...named}).passthrough()),topics:z.array(topicShape)});
type Topic=z.infer<typeof topicShape>;
const postPage=z.object({ok:z.literal(true),items:z.array(z.lazy(()=>postSchema)),next:z.string().nullable()});
const commCard=z.object({id:z.uuid(),name:z.string(),topics:z.array(z.string()),privacy:z.string(),members:z.number(),joined:z.boolean()}).passthrough();
const commList=z.object({ok:z.literal(true),items:z.array(commCard),next:z.string().nullable()});
type Comm=z.infer<typeof commCard>;
const evRow=z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),place_id:z.string().nullable().optional(),tz:z.string().nullable().optional(),starts_at:z.string(),state:z.string()}).passthrough();
const evList=z.object({ok:z.literal(true),items:z.array(evRow),next:z.string().nullable()});
export type Ev=z.infer<typeof evRow>;
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
const personCard=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),ages:z.array(z.number()),
 city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable()}).passthrough();
const peopleRes=z.object({ok:z.literal(true),items:z.array(personCard)});
type Person=z.infer<typeof personCard>;
const follower=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).passthrough();
const followersRes=z.object({ok:z.literal(true),items:z.array(follower)});
type Follower=z.infer<typeof follower>;
const profileRes=z.object({ok:z.literal(true),profile:z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean().optional(),
 photos:z.array(media)}).passthrough()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const restoreRes=z.object({ok:z.literal(true),restored:z.boolean()}).passthrough();

/** The server returns at most this many followers per list (profile.followers). */
const FOLLOW_PAGE=50;

const nameOf=(a:{name?:string|null,handle?:string|null}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'?');
const mediaSrc=(m:z.infer<typeof media>|null|undefined,size:'card'|'full'='card')=>m?.src?(size==='full'?m.src.full??m.src.card:m.src.card??m.src.full)??m.src.thumb??null:null;
const countLabel=(n:number)=>n>=FOLLOW_PAGE?FOLLOW_PAGE+'+':String(n);

function useCatalog(){
 const {call}=useFe();
 const [data,setData]=useState<z.infer<typeof catalogRes>|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(setData).catch(setError);},[call]);
 return {data,error};
}

/** `commCard()` — a community card in a list (as in the catalogue). */
function CommunityCard({c,tname}:{c:Comm,tname:(id:string)=>string}){
 const {t}=useI18n();const navigate=useNavigate();
 return <button type="button" className="cmc" onClick={()=>navigate('/n/communities/'+c.id)}>
  <div className="cv"><div className="plate" style={plate(c.id)}/></div>
  <div className="tx"><b>{c.name}</b><small>{c.topics.map(tname).map(x=>'#'+x).join(' ')}</small>
   <div className="meta"><span>{t('fe.br.members',{n:c.members})}</span>{c.privacy!=='open'&&<><span>·</span><span>{t('fe.br.closed')}</span></>}
    {c.joined&&<Pill tone="ok" icon={CircleCheck}>{t('fe.br.member')}</Pill>}</div>
  </div>
 </button>;
}

/** `eventCard(id,{row:1})` — an event as a row. */
export function EventRow({e}:{e:Ev}){
 const {t,locale}=useI18n();const navigate=useNavigate();const pt=evParts(e,locale);const places=usePlaces();
 return <button type="button" className="evc row" onClick={()=>navigate('/n/events/'+e.id)}>
  <div className="cv"><div className="plate" style={plate(e.id)}/><div className="date"><b>{pt.day}</b><small>{pt.month}</small></div></div>
  <div className="bd"><small>{evWhere(e,places,locale,t('fe.ev.online'),t('fe.ev.offline'))} · {pt.time} · {pt.zone}</small><b>{e.title}</b>
   {e.state==='cancelled'&&<Pill tone="bad">{t('fe.ev.cancelled')}</Pill>}</div>
 </button>;
}

/** A list of posts that keeps likes / saves / removals in place. */
function PostList({items,setItems}:{items:Post[],setItems:(f:(list:Post[])=>Post[])=>void}){
 return <div className="posts">{items.map(p=><PostCard key={p.id} post={p} onChange={np=>setItems(list=>list.map(x=>x.id===np.id?np:x))}
  onRemove={r=>setItems(list=>list.filter(x=>x.id!==r.postId&&x.author.id!==r.authorId))}/>)}</div>;
}

/* ---------- V21 F04: an interest's page ---------- */

export function TopicScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const {items:mine,cats,topics,load:reloadMine}=useInterests();
 const tp=topics.find(x=>x.id===id);const name=tp?(locale==='en'?tp.en:tp.ru):id;const desc=tp?(locale==='en'?tp.descEn:tp.descRu):null;
 const tname=useCallback((x:string)=>{const v=topics.find(o=>o.id===x);return v?(locale==='en'?v.en:v.ru):x;},[topics,locale]);
 const [posts,setPosts]=useState<Post[]|null>(null);const [next,setNext]=useState<string|null>(null);const [more,setMore]=useState(false);
 const [comms,setComms]=useState<Comm[]>([]);const [error,setError]=useState<unknown>(null);
 const [sheet,setSheet]=useState(false);const [notice,setNotice]=useState('');const opener=useRef<HTMLButtonElement>(null);
 const load=useCallback((cursor?:string)=>{
  setError(null);if(!cursor)setPosts(null);else setMore(true);
  call('feed.list',{tab:'forYou',topics:[id],...(cursor?{cursor}:{})},postPage).then(r=>{setPosts(prev=>cursor&&prev?[...prev,...r.items]:r.items);setNext(r.next);})
   .catch(setError).finally(()=>setMore(false));
 },[call,id]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>{call('community.catalog',{topics:[id]},commList).then(r=>setComms(r.items)).catch(()=>setComms([]));},[call,id]);
 const current=mine?.find(j=>j.topicId===id);const couple=acting?.kind==='couple';
 const close=useCallback(()=>{setSheet(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));},[]);
 const unknown=topics.length>0&&!tp;
 return <>
  <Bar title={'#'+name} back>
   <IconBtn icon={SearchIcon} label={t('fe.br.search')} onClick={()=>navigate('/n/search?'+new URLSearchParams({scope:'posts',q:name}))}/>
  </Bar>
  <View>
   {unknown?<Empty icon={BookOpen} title={t('fe.br.topic.unknown')} text={t('fe.br.topic.unknownText')}/>:<>
    <div className="interest-summary"><p>{desc||t('fe.br.topic.desc')}</p>
     {current&&<SectionLabel>{couple?t('fe.br.topic.ours'):t('fe.br.topic.mine')}</SectionLabel>}
     {mine===null?null:current?<Jars list={[current]} topics={topics} onOpen={()=>setSheet(true)}/>
      :tp&&<Btn kind="soft" icon={Plus} onClick={e=>{opener.current=e.currentTarget;setSheet(true);}}>{couple?t('fe.br.topic.addCouple'):t('fe.br.topic.add')}</Btn>}
    </div>
    {notice&&<Alert kind="ok" className="mb12">{notice}</Alert>}
    {comms.length>0&&<><SectionLabel>{t('fe.br.communities')}</SectionLabel>{comms.map(c=><CommunityCard key={c.id} c={c} tname={tname}/>)}</>}
    <SectionLabel>{t('fe.br.posts')}</SectionLabel>
    {error&&!posts?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>
     :posts===null?<Skel kind="list"/>
     :posts.length===0?<Empty compact icon={Newspaper} title={t('fe.br.topic.noPosts')}><Btn kind="soft" icon={Pencil} onClick={()=>navigate('/n/feed/new')}>{t('fe.br.topic.write',{name})}</Btn></Empty>
     :<><PostList items={posts} setItems={f=>setPosts(list=>list?f(list):list)}/>
      <LoadMore more={!!next} busy={more} error={error} onMore={()=>{if(next)load(next);}}/></>}
   </>}
  </View>
  {sheet&&tp&&<InterestSheet topicId={id} topics={topics} cats={cats} current={current} onClose={close} onDone={msg=>{close();setNotice(msg);reloadMine();}}/>}
 </>;
}

/* ---------- V21 G01: global search ---------- */

const SCOPES=['all','people','posts','communities','events','topics'] as const;
type Scope=typeof SCOPES[number];
const RECENT_KEY='feture.fe.searchRecent';
const readRecent=():string[]=>{try{const v=JSON.parse(localStorage.getItem(RECENT_KEY)??'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,6):[];}catch{return [];}};
const writeRecent=(list:string[])=>{try{localStorage.setItem(RECENT_KEY,JSON.stringify(list));}catch{/* this device only */}};
type Results={people:Person[],posts:Post[],communities:Comm[],events:Ev[],topics:Topic[]};
/** V21 gFilters: what the server can narrow a search by, per kind of result. */
type SearchFilters={posts:{types:string[],topics:string[]},events:{format:'all'|'offline'|'online',when:'any'|'week'|'weekend'|'month',price:'any'|'free'|'paid'},communities:{privacy:'any'|'open'|'closed'}};
const NO_SF:SearchFilters={posts:{types:[],topics:[]},events:{format:'all',when:'any',price:'any'},communities:{privacy:'any'}};
const sfCount=(f:SearchFilters,k:'posts'|'events'|'communities')=>k==='posts'?f.posts.types.length+f.posts.topics.length
 :k==='events'?Number(f.events.format!=='all')+Number(f.events.when!=='any')+Number(f.events.price!=='any'):Number(f.communities.privacy!=='any');
const POST_TYPES=['note','text','photo','poll','interests'] as const;

export function SearchScreen(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [params,setParams]=useSearchParams();
 const scope:Scope=(SCOPES as readonly string[]).includes(params.get('scope')??'')?params.get('scope') as Scope:'all';
 const [q,setQ]=useState(()=>params.get('q')??'');const [recent,setRecent]=useState(readRecent);
 const {data:catalog}=useCatalog();const topics=useMemo(()=>catalog?.topics??[],[catalog]);
 const tname=useCallback((x:string)=>{const v=topics.find(o=>o.id===x);return v?(locale==='en'?v.en:v.ru):x;},[topics,locale]);
 const [res,setRes]=useState<Results|null>(null);const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{input.current?.focus({preventScroll:true});},[]);
 const [sf,setSf]=useState<SearchFilters>(NO_SF);const [fOpen,setFOpen]=useState(false);
 const fk=scope==='posts'||scope==='events'||scope==='communities'?scope:null;const nF=fk?sfCount(sf,fk):0;
 const term=q.trim();
 useEffect(()=>{
  setError(null);if(term.length<2){setRes(null);setBusy(false);return;}
  const ctl=new AbortController();const low=term.toLowerCase();setBusy(true);
  const timer=setTimeout(()=>{
   const want=(k:Scope)=>scope==='all'||scope===k;
   // Interests are found in the catalog; communities by the interests that match, plus names in the catalogue's first page.
   const matched=topics.filter(x=>topicMatches(x,low));
   const ids=matched.slice(0,10).map(x=>x.id);const opts={signal:ctl.signal};
   const none=Promise.resolve(null);
   Promise.allSettled([
    want('people')?call('people.search',{q:term},peopleRes,opts).then(r=>r.items):none,
    // Posts: words in the title or text, then those under the matching interests.
    // Filters apply in their own tab only (V21 gFilters); without them, matching interests add their posts and communities.
    want('posts')?(()=>{const pf=scope==='posts'?sf.posts:NO_SF.posts;const narrow={...(pf.types.length?{types:pf.types}:{}),...(pf.topics.length?{topics:pf.topics}:{})};const plain=!pf.types.length&&!pf.topics.length;
     return Promise.all([call('feed.list',{tab:'forYou',q:term,limit:20,...narrow},postPage,opts),plain&&ids.length?call('feed.list',{tab:'forYou',topics:ids,limit:20},postPage,opts):Promise.resolve({items:[] as Post[]})])
     .then(([a,b])=>{const seen=new Set<string>();return [...a.items,...b.items].filter(x=>!seen.has(x.id)&&!!seen.add(x.id));});})():none,
    want('communities')?(()=>{const privacy=scope==='communities'&&sf.communities.privacy!=='any'?{privacy:sf.communities.privacy}:{};
     return Promise.all([call('community.catalog',{q:term,...privacy},commList,opts),ids.length&&!('privacy' in privacy)?call('community.catalog',{topics:ids},commList,opts):Promise.resolve({items:[] as Comm[]})])
     .then(([a,b])=>{const seen=new Set<string>();return [...a.items,...b.items].filter(c=>!seen.has(c.id)&&!!seen.add(c.id));});})():none,
    want('events')?call('event.catalog',{q:term,...(scope==='events'?sf.events:{})},evList,opts).then(r=>r.items):none,
   ]).then(out=>{
    if(ctl.signal.aborted)return;
    const val=<T,>(r:PromiseSettledResult<T[]|null>)=>r.status==='fulfilled'?r.value??[]:[];
    const failed=out.find(r=>r.status==='rejected');
    if(failed&&out.every(r=>r.status==='rejected'||r.value===null))setError((failed as PromiseRejectedResult).reason);
    setRes({people:val(out[0]),posts:val(out[1]),communities:val(out[2]),events:val(out[3]),topics:want('topics')?matched:[]});
    setBusy(false);
   });
  },300);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[term,scope,topics,call,sf]);
 const setScope=(s:Scope)=>{commit();setParams(p=>{const n=new URLSearchParams(p);n.set('scope',s);return n;},{replace:true});};
 const commit=()=>{if(term.length<2||recent.includes(term))return;const list=[term,...recent].slice(0,6);setRecent(list);writeRecent(list);};
 const use=(v:string)=>{setQ(v);input.current?.focus({preventScroll:true});};
 const names:Record<Exclude<Scope,'all'>,string>={people:t('fe.br.people'),posts:t('fe.br.posts'),communities:t('fe.br.communities'),events:t('fe.br.events'),topics:t('fe.br.topics')};
 const order:Exclude<Scope,'all'>[]=scope==='all'?['people','communities','events','topics','posts']:[scope];
 const LIMIT=3;
 const render=(k:Exclude<Scope,'all'>,list:unknown[])=>{
  if(k==='people')return <Card list>{(list as Person[]).map(p=><Row key={p.id} onClick={()=>{commit();navigate('/n/people/'+p.id);}}
   av={<ActingAv size="" p={{id:p.id,kind:p.kind,name:nameOf(p),avatar:mediaSrc(p.avatar)}}/>}
   // A couple: its two names already say who; both ages go to the line under it («34 и 31»), never «, 34 · 31» in the title.
   title={<Who name={nameOf(p)} nick={p.handle} age={p.kind==='person'?p.ages[0]:undefined}/>}
   sub={[p.kind==='couple'&&p.ages.length?p.ages.join(t('fe.br.and')):null,p.city?(locale==='en'?p.city.en:p.city.ru):null].filter(Boolean).join(' · ')||undefined}/>)}</Card>;
  if(k==='posts')return <PostList items={list as Post[]} setItems={f=>setRes(r=>r&&{...r,posts:f(r.posts)})}/>;
  if(k==='communities')return <>{(list as Comm[]).map(c=><CommunityCard key={c.id} c={c} tname={tname}/>)}</>;
  if(k==='events')return <Stack gap={2}>{(list as Ev[]).map(e=><EventRow key={e.id} e={e}/>)}</Stack>;
  const cat=(id:string)=>{const c=catalog?.categories.find(x=>x.id===id);return c?(locale==='en'?c.en:c.ru):'';};
  return <Card list>{(list as Topic[]).map(x=><button key={x.id} type="button" className="topic-row" onClick={()=>{commit();navigate('/n/topics/'+x.id);}}>
   <span className="ico v"><BookOpen/></span><span className="tx"><b>{locale==='en'?x.en:x.ru}</b><small>{cat(x.categoryId)}</small></span><ChevronRight/>
  </button>)}</Card>;
 };
 const sections=res?order.map(k=>{const list=res[k] as unknown[];if(!list.length)return null;const shown=scope==='all'?list.slice(0,LIMIT):list;
  return <div key={k}><div className="res-h">{names[k]} · {list.length}{scope==='all'&&list.length>LIMIT&&<button type="button" onClick={()=>setScope(k)}>{t('fe.br.seeAll')}</button>}</div>{render(k,shown)}</div>;}).filter(Boolean):[];
 return <>
  <H level={1} className="sr-only" tabIndex={-1}>{t('fe.br.search')}</H>
  <div className="sbar">
   <IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={()=>navigate(-1)}/>
   <SearchInput ref={input} value={q} label={t('fe.br.searchPh')}
    autoCapitalize="off" spellCheck={false} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commit();}}/>
  </div>
  <View>
   <Seg value={scope} onChange={setScope} label={t('fe.br.search')} options={SCOPES.map(k=>({id:k,label:k==='all'?t('fe.br.all'):names[k]}))}/>
   {fk&&<Chips><Chip filter on={nF>0} icon={SlidersHorizontal} popup badge={nF||undefined} label={t('fe.w3.sf.open')} onClick={()=>setFOpen(true)}>{t('fe.fd.filters')}</Chip></Chips>}
   {term.length<2?<>
    {recent.length>0&&<><div className="res-h">{t('fe.br.recent')}<button type="button" onClick={()=>{setRecent([]);writeRecent([]);}}>{t('fe.br.clear')}</button></div>
     <Card list>{recent.map(x=><div key={x} className="recent"><History/><button type="button" className="tx" onClick={()=>use(x)}>{x}</button>
      <IconBtn icon={X} kind="ghost" size="sm" label={t('fe.br.remove')} onClick={()=>{const l=recent.filter(v=>v!==x);setRecent(l);writeRecent(l);}}/></div>)}</Card></>}
    {topics.length>0&&<><div className="res-h">{t('fe.br.popular')}</div>
     <Chips>{topics.slice(0,5).map(x=><Chip key={x.id} onClick={()=>use(locale==='en'?x.en:x.ru)}>#{locale==='en'?x.en:x.ru}</Chip>)}</Chips></>}
    {scope==='people'&&<Alert kind="info">{t('fe.br.peopleHint')}</Alert>}
    {(scope==='posts'||scope==='communities'||scope==='events')&&<Alert kind="info">{t('fe.br.catalogHint')}</Alert>}
   </>
   :error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}/>
   :!res||busy&&!sections.length?<Skel kind="list"/>
   :sections.length?<>{sections}</>
   :nF>0?<Empty icon={SlidersHorizontal} title={t('fe.br.nothing')} text={t('fe.w3.sf.nothingText')}><Btn kind="soft" onClick={()=>setSf(NO_SF)}>{t('fe.fd.resetFilters')}</Btn></Empty>
   :<Empty icon={SearchIcon} title={t('fe.br.nothing')} text={t('fe.br.nothingText')}/>}
  </View>
  {fOpen&&fk&&<SearchFilterSheet kind={fk} value={sf} topics={topics} onClose={()=>setFOpen(false)} onApply={v=>{setSf(v);setFOpen(false);}}/>}
 </>;
}

/** V21 gFilters — the search filters of one kind of result: kinds of posts and interests; an event's format, dates and
 * price; whether a community is open. The server applies them. */
function SearchFilterSheet({kind,value,topics,onClose,onApply}:{kind:'posts'|'events'|'communities',value:SearchFilters,topics:Topic[],onClose:()=>void,onApply:(v:SearchFilters)=>void}){
 const {t,locale}=useI18n();const [d,setD]=useState(value);
 const flip=(k:'types'|'topics',id:string)=>setD(v=>({...v,posts:{...v.posts,[k]:v.posts[k].includes(id)?v.posts[k].filter(x=>x!==id):[...v.posts[k],id].slice(0,10)}}));
 const shownTopics=[...new Set([...d.posts.topics,...topics.slice(0,10).map(x=>x.id)])].map(id=>topics.find(x=>x.id===id)).filter((x):x is Topic=>!!x);
 return <Sheet title={t('fe.w3.sf.title.'+kind)} onClose={onClose} head={<Btn kind="text" auto onClick={()=>setD({...d,[kind]:NO_SF[kind]})}>{t('fe.fd.reset')}</Btn>}
  foot={<Btn onClick={()=>onApply(d)}>{t('fe.fd.applyFilters')}</Btn>}>
  {kind==='posts'&&<>
   <SectionLabel>{t('fe.w3.ff.types')}</SectionLabel><Chips>{POST_TYPES.map(k=><Chip key={k} on={d.posts.types.includes(k)} onClick={()=>flip('types',k)}>{t('fe.w3.type.'+k)}</Chip>)}</Chips>
   <SectionLabel>{t('fe.fd.showTopics')}</SectionLabel><Chips>{shownTopics.map(x=><Chip key={x.id} on={d.posts.topics.includes(x.id)} onClick={()=>flip('topics',x.id)}>{locale==='en'?x.en:x.ru}</Chip>)}</Chips>
  </>}
  {kind==='events'&&<>
   <SectionLabel>{t('fe.w3.sf.format')}</SectionLabel><ChoiceChips label={t('fe.w3.sf.format')} value={d.events.format} onChange={v=>setD({...d,events:{...d.events,format:v}})}
    options={[['all',t('fe.w3.sf.any')],['offline',t('fe.w3.sf.offline')],['online',t('fe.w3.sf.online')]] as const}/>
   <SectionLabel>{t('fe.w3.sf.when')}</SectionLabel><ChoiceChips label={t('fe.w3.sf.when')} value={d.events.when} onChange={v=>setD({...d,events:{...d.events,when:v}})}
    options={[['any',t('fe.w3.sf.anyTime')],['week',t('fe.w3.sf.week')],['weekend',t('fe.w3.sf.weekend')],['month',t('fe.w3.sf.month')]] as const}/>
   <SectionLabel>{t('fe.w3.sf.price')}</SectionLabel><ChoiceChips label={t('fe.w3.sf.price')} value={d.events.price} onChange={v=>setD({...d,events:{...d.events,price:v}})}
    options={[['any',t('fe.w3.sf.any')],['free',t('fe.w3.sf.free')],['paid',t('fe.w3.sf.paid')]] as const}/>
  </>}
  {kind==='communities'&&<><SectionLabel>{t('fe.w3.sf.join')}</SectionLabel><ChoiceChips label={t('fe.w3.sf.join')} value={d.communities.privacy} onChange={v=>setD({...d,communities:{privacy:v}})}
   options={[['any',t('fe.w3.sf.any')],['open',t('fe.w3.sf.open2')],['closed',t('fe.w3.sf.closed')]] as const}/></>}
 </Sheet>;
}

/* ---------- V21 P10: followers / following ---------- */

/** P10 for another profile (`/n/people/:id/follows`) and for the acting one (`/n/me/follows`). */
export function FollowsScreen(){
 const {id:param}=useParams();const {call,acting,state}=useFe();const {t}=useI18n();const navigate=useNavigate();const [params,setParams]=useSearchParams();
 const id=param??acting?.id??'';const mine=!!acting&&id===acting.id;
 const tab:'followers'|'following'=params.get('tab')==='following'?'following':'followers';
 const [lists,setLists]=useState<{followers:Follower[],following:Follower[]}|null>(null);const [error,setError]=useState<unknown>(null);
 const [who,setWho]=useState('');const [myFollows,setMyFollows]=useState<Set<string>>(new Set());const [busy,setBusy]=useState('');const [failure,setFailure]=useState('');
 const load=useCallback(()=>{
  if(!id)return;setError(null);
  Promise.all([call('profile.followers',{profileId:id},followersRes),call('profile.followers',{profileId:id,following:true},followersRes)])
   .then(([a,b])=>setLists({followers:a.items,following:b.items})).catch(setError);
 },[call,id]);
 useKeyChange(id,()=>setLists(null));
 useEffect(()=>{load();},[load]);
 // Whom the acting profile follows, for the buttons on each row.
 useEffect(()=>{if(!acting)return;call('profile.followers',{profileId:acting.id,following:true},followersRes).then(r=>setMyFollows(new Set(r.items.map(x=>x.id)))).catch(()=>{});},[call,acting]);
 useEffect(()=>{if(mine||!id){setWho('');return;}call('profile.get',{profileId:id},profileRes).then(r=>setWho(nameOf(r.profile))).catch(()=>{});},[call,id,mine]);
 const own=new Set(state.status==='ready'?state.boot.profiles.map(p=>p.id):[]);const asUs=acting?.kind==='couple';
 const toast=useToast();const [menu,setMenu]=useState<Follower|null>(null);
 // «Убрать из подписчиков» (V21 flwRemove21): the person is not told; «Вернуть» works for ten minutes.
 const removeFollower=async(k:Follower)=>{setMenu(null);setBusy(k.id);setFailure('');
  try{await call('follower.remove',{opId:newOpId(),profileId:k.id},ok);setLists(l=>l&&{...l,followers:l.followers.filter(x=>x.id!==k.id)});
   toast(t(asUs?'fe.w7.flw.removedUs':'fe.w7.flw.removed').replace('{name}',nameOf(k)),{type:'ok',action:{label:t('fe.tl.undo'),fn:()=>void(async()=>{
    try{const r=await call('follower.restore',{opId:newOpId(),profileId:k.id},restoreRes);toast(t(r.restored?'fe.w7.flw.restored':'fe.w7.flw.notRestored'),{type:r.restored?'ok':'warn'});load();}
    catch(e){toast(feErrorMessage(e,t),{type:'err'});}})()}});}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy('');}};
 const list=lists?.[tab]??null;
 const title=(tab==='following'?t('fe.br.following'):t('fe.br.followers'))+(who?' · '+who:'');
 return <>
  <Bar title={title} back/>
  <View refresh={load}>
   <Seg value={tab} onChange={v=>setParams({tab:v},{replace:true})} options={[
    {id:'followers',label:t('fe.br.followers')+(lists?' · '+countLabel(lists.followers.length):'')},
    {id:'following',label:t('fe.br.following')+(lists?' · '+countLabel(lists.following.length):'')}]}/>
   {failure&&<Alert kind="err">{failure}</Alert>}
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :list===null?<Skel kind="list"/>
    :!list.length?<Empty icon={Users} title={tab==='following'?t('fe.br.noFollowing'):t('fe.br.noFollowers')}/>
    :<Card list>{list.map(k=>{const self=own.has(k.id);const fol=myFollows.has(k.id);
     return <Row key={k.id} className="frow" onClick={()=>navigate(self?'/n/me':'/n/people/'+k.id)} av={<Av name={nameOf(k)} seed={k.id} src={k.avatar}/>}
      title={<Who name={nameOf(k)} nick={k.handle}><NameBadges p={k}/></Who>}
      end={self?<Note>{k.id===acting?.id?(asUs?t('fe.br.youUs'):t('fe.br.you')):k.kind==='person'?t('fe.br.yourOwn'):t('fe.br.yourCouple')}</Note>
       :<><FollowButton size="sm" profileId={k.id} name={nameOf(k)} on={fol} back={mine&&tab==='followers'} disabled={busy===k.id}
         onChange={on=>{setMyFollows(s=>{const n=new Set(s);if(on)n.add(k.id);else n.delete(k.id);return n;});if(mine)load();}}/>
        {mine&&tab==='followers'&&<IconBtn icon={Ellipsis} kind="ghost" size="sm" aria-haspopup="dialog" label={t('fe.w7.flw.menu').replace('{name}',nameOf(k))} disabled={busy===k.id} onClick={()=>setMenu(k)}/>}</>}/>;})}</Card>}
   {lists&&list&&list.length>=FOLLOW_PAGE&&<Note>{t('fe.br.firstN',{n:FOLLOW_PAGE})}</Note>}
  </View>
  {menu&&<Sheet title={nameOf(menu)} sub={nickShown(menu.handle,menu.name)??undefined} onClose={()=>setMenu(null)}><Card list>
   <Row icon={User} title={t('fe.w7.flw.profile')} onClick={()=>{const k=menu;setMenu(null);navigate('/n/people/'+k.id);}}/>
   <Row icon={UserMinus} danger title={t('fe.w7.flw.remove')} sub={t('fe.w7.flw.removeSub')} onClick={()=>void removeFollower(menu)}/>
  </Card></Sheet>}
 </>;
}

/* ---------- V21 P20: gallery — src/fe/gallery.tsx ---------- */
export {GalleryScreen} from './gallery';
