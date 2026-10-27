import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {BookOpen,ChevronLeft,ChevronRight,CircleCheck,Clock,History,Image as ImageIcon,Pencil,Plus,Search as SearchIcon,Users,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Chip,Chips,Empty,H,IconBtn,Note,Pill,Row,SearchInput,SectionLabel,Seg,Skel,Stack,View,plate} from './kit';
import {useFe} from './session';
import {PostCard,postSchema,type Post} from './feed';
import {InterestSheet,Jars,useInterests} from './interests';
import {Viewer} from './post-parts';
import {faceFields,NameBadges} from './faces';

/** Discovery screens with the prototype's markup: V21 F04 (an interest's page), G01 (global search), P10 (followers /
 * following) and P20 (gallery). Everything shown comes from the server; the client only narrows what the server already
 * returned to the visitor (catalog names in search) and never invents counts. */

const named={ru:z.string(),en:z.string()};
const topicShape=z.object({id:z.string(),categoryId:z.string(),...named,descRu:z.string().nullable().optional(),descEn:z.string().nullable().optional()});
const catalogRes=z.object({ok:z.literal(true),categories:z.array(z.object({id:z.string(),...named}).passthrough()),topics:z.array(topicShape)});
type Topic=z.infer<typeof topicShape>;
const postPage=z.object({ok:z.literal(true),items:z.array(postSchema),next:z.string().nullable()});
const commCard=z.object({id:z.uuid(),name:z.string(),topics:z.array(z.string()),privacy:z.string(),members:z.number(),joined:z.boolean()}).passthrough();
const commList=z.object({ok:z.literal(true),items:z.array(commCard),next:z.string().nullable()});
type Comm=z.infer<typeof commCard>;
const evRow=z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),starts_at:z.string(),state:z.string()}).passthrough();
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
 const {t,locale}=useI18n();const navigate=useNavigate();const d=new Date(e.starts_at);const lc=locale==='en'?'en':'ru';
 return <button type="button" className="evc row" onClick={()=>navigate('/n/events/'+e.id)}>
  <div className="cv"><div className="plate" style={plate(e.id)}/><div className="date"><b>{d.getDate()}</b><small>{d.toLocaleDateString(lc,{month:'short'})}</small></div></div>
  <div className="bd"><small>{e.format==='online'?t('fe.ev.online'):e.area} · {d.toLocaleTimeString(lc,{hour:'2-digit',minute:'2-digit'})}</small><b>{e.title}</b>
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
     :posts.length===0?<><Note>{t('fe.br.topic.noPosts')}</Note><Btn kind="soft" className="mt12" icon={Pencil} onClick={()=>navigate('/n/feed/new')}>{t('fe.br.topic.write',{name})}</Btn></>
     :<><PostList items={posts} setItems={f=>setPosts(list=>list?f(list):list)}/>
      {next&&<Btn kind="soft" onClick={()=>load(next)} disabled={more} busy={more}>{t('fe.feed.more')}</Btn>}</>}
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

export function SearchScreen(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [params,setParams]=useSearchParams();
 const scope:Scope=(SCOPES as readonly string[]).includes(params.get('scope')??'')?params.get('scope') as Scope:'all';
 const [q,setQ]=useState(()=>params.get('q')??'');const [recent,setRecent]=useState(readRecent);
 const {data:catalog}=useCatalog();const topics=useMemo(()=>catalog?.topics??[],[catalog]);
 const tname=useCallback((x:string)=>{const v=topics.find(o=>o.id===x);return v?(locale==='en'?v.en:v.ru):x;},[topics,locale]);
 const [res,setRes]=useState<Results|null>(null);const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{input.current?.focus({preventScroll:true});},[]);
 const term=q.trim();
 useEffect(()=>{
  setError(null);if(term.length<2){setRes(null);setBusy(false);return;}
  const ctl=new AbortController();const low=term.toLowerCase();setBusy(true);
  const timer=setTimeout(()=>{
   const want=(k:Scope)=>scope==='all'||scope===k;
   // Interests are found in the catalog; communities by the interests that match, plus names in the catalogue's first page.
   const matched=topics.filter(x=>x.ru.toLowerCase().includes(low)||x.en.toLowerCase().includes(low)||x.id.includes(low));
   const ids=matched.slice(0,10).map(x=>x.id);const opts={signal:ctl.signal};
   const none=Promise.resolve(null);
   Promise.allSettled([
    want('people')?call('people.search',{q:term},peopleRes,opts).then(r=>r.items):none,
    // Posts: words in the title or text, then those under the matching interests.
    want('posts')?Promise.all([call('feed.list',{tab:'forYou',q:term,limit:20},postPage,opts),ids.length?call('feed.list',{tab:'forYou',topics:ids,limit:20},postPage,opts):Promise.resolve({items:[] as Post[]})])
     .then(([a,b])=>{const seen=new Set<string>();return [...a.items,...b.items].filter(x=>!seen.has(x.id)&&!!seen.add(x.id));}):none,
    want('communities')?Promise.all([call('community.catalog',{},commList,opts),ids.length?call('community.catalog',{topics:ids},commList,opts):Promise.resolve({items:[] as Comm[]})])
     .then(([a,b])=>{const seen=new Set<string>();return [...a.items.filter(c=>c.name.toLowerCase().includes(low)),...b.items].filter(c=>!seen.has(c.id)&&!!seen.add(c.id));}):none,
    want('events')?call('event.catalog',{},evList,opts).then(r=>r.items.filter(e=>e.title.toLowerCase().includes(low))):none,
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
 },[term,scope,topics,call]);
 const setScope=(s:Scope)=>{commit();setParams(p=>{const n=new URLSearchParams(p);n.set('scope',s);return n;},{replace:true});};
 const commit=()=>{if(term.length<2||recent.includes(term))return;const list=[term,...recent].slice(0,6);setRecent(list);writeRecent(list);};
 const use=(v:string)=>{setQ(v);input.current?.focus({preventScroll:true});};
 const names:Record<Exclude<Scope,'all'>,string>={people:t('fe.br.people'),posts:t('fe.br.posts'),communities:t('fe.br.communities'),events:t('fe.br.events'),topics:t('fe.br.topics')};
 const order:Exclude<Scope,'all'>[]=scope==='all'?['people','communities','events','topics','posts']:[scope];
 const LIMIT=3;
 const render=(k:Exclude<Scope,'all'>,list:unknown[])=>{
  if(k==='people')return <Card list>{(list as Person[]).map(p=><Row key={p.id} onClick={()=>{commit();navigate('/n/people/'+p.id);}}
   av={<Av name={nameOf(p)} seed={p.id} src={mediaSrc(p.avatar)}/>} title={nameOf(p)+(p.ages.length?', '+p.ages.join(' · '):'')}
   sub={[p.handle?'@'+p.handle:null,p.city?(locale==='en'?p.city.en:p.city.ru):null].filter(Boolean).join(' · ')}/>)}</Card>;
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
   {term.length<2?<>
    {recent.length>0&&<><div className="res-h">{t('fe.br.recent')}<button type="button" onClick={()=>{setRecent([]);writeRecent([]);}}>{t('fe.br.clear')}</button></div>
     <Card list>{recent.map(x=><div key={x} className="recent"><History/><button type="button" className="tx" style={{textAlign:'left'}} onClick={()=>use(x)}>{x}</button>
      <IconBtn icon={X} kind="ghost" size="sm" label={t('fe.br.remove')} onClick={()=>{const l=recent.filter(v=>v!==x);setRecent(l);writeRecent(l);}}/></div>)}</Card></>}
    {topics.length>0&&<><div className="res-h">{t('fe.br.popular')}</div>
     <Chips>{topics.slice(0,5).map(x=><Chip key={x.id} onClick={()=>use(locale==='en'?x.en:x.ru)}>#{locale==='en'?x.en:x.ru}</Chip>)}</Chips></>}
    {scope==='people'&&<Alert kind="info" className="mt16">{t('fe.br.peopleHint')}</Alert>}
    {(scope==='posts'||scope==='communities'||scope==='events')&&<Alert kind="info" className="mt16">{t('fe.br.catalogHint')}</Alert>}
   </>
   :error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}/>
   :!res||busy&&!sections.length?<Skel kind="list"/>
   :sections.length?<>{sections}</>
   :<Empty icon={SearchIcon} title={t('fe.br.nothing')} text={t('fe.br.nothingText')}/>}
  </View>
 </>;
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
 useEffect(()=>{setLists(null);load();},[load]);
 // Whom the acting profile follows, for the buttons on each row.
 useEffect(()=>{if(!acting)return;call('profile.followers',{profileId:acting.id,following:true},followersRes).then(r=>setMyFollows(new Set(r.items.map(x=>x.id)))).catch(()=>{});},[call,acting]);
 useEffect(()=>{if(mine||!id){setWho('');return;}call('profile.get',{profileId:id},profileRes).then(r=>setWho(nameOf(r.profile))).catch(()=>{});},[call,id,mine]);
 const own=new Set(state.status==='ready'?state.boot.profiles.map(p=>p.id):[]);const asUs=acting?.kind==='couple';
 const toggle=async(k:Follower)=>{
  if(busy)return;const on=!myFollows.has(k.id);setBusy(k.id);setFailure('');
  try{await call('follow.set',{opId:newOpId(),profileId:k.id,on},ok);setMyFollows(s=>{const n=new Set(s);if(on)n.add(k.id);else n.delete(k.id);return n;});if(mine)load();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy('');}
 };
 const list=lists?.[tab]??null;
 const title=(tab==='following'?t('fe.br.following'):t('fe.br.followers'))+(who?' · '+who:'');
 return <>
  <Bar title={title} back/>
  <View>
   <Seg value={tab} onChange={v=>setParams({tab:v},{replace:true})} options={[
    {id:'followers',label:t('fe.br.followers')+(lists?' · '+countLabel(lists.followers.length):'')},
    {id:'following',label:t('fe.br.following')+(lists?' · '+countLabel(lists.following.length):'')}]}/>
   {failure&&<Alert kind="err" className="mt12">{failure}</Alert>}
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :list===null?<Skel kind="list"/>
    :!list.length?<Empty icon={Users} title={tab==='following'?t('fe.br.noFollowing'):t('fe.br.noFollowers')}/>
    :<Card list className="mt12">{list.map(k=>{const self=own.has(k.id);const fol=myFollows.has(k.id);
     return <div key={k.id} className="li frow">
      <button type="button" className="frow-go" onClick={()=>navigate(self?'/n/me':'/n/people/'+k.id)}>
       <Av name={nameOf(k)} seed={k.id} src={k.avatar}/><span className="tx"><b><span className="fnm">{nameOf(k)}</span><NameBadges p={k}/></b><small>{k.handle?'@'+k.handle:''}</small></span>
      </button>
      {self?<Note>{k.id===acting?.id?(asUs?t('fe.br.youUs'):t('fe.br.you')):k.kind==='person'?t('fe.br.yourOwn'):t('fe.br.yourCouple')}</Note>
       :<Btn size="sm" kind={fol?'soft':'primary'} aria-pressed={fol} disabled={busy===k.id} onClick={()=>toggle(k)}>
        {fol?(asUs?t('fe.br.unfollowUs'):t('fe.br.unfollow')):(asUs?t('fe.br.followUs'):mine&&tab==='followers'?t('fe.br.followBack'):t('fe.br.follow'))}</Btn>}
     </div>;})}</Card>}
   {lists&&list&&list.length>=FOLLOW_PAGE&&<Note className="mt12">{t('fe.br.firstN',{n:FOLLOW_PAGE})}</Note>}
  </View>
 </>;
}

/** Links to P10 and P20 from a profile: followers, following and the gallery. */
export function ProfileLinks({profileId,photos,self=false}:{profileId:string,photos?:number,self?:boolean}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [n,setN]=useState<{followers:number,following:number}|null>(null);
 useEffect(()=>{
  setN(null);
  Promise.all([call('profile.followers',{profileId},followersRes),call('profile.followers',{profileId,following:true},followersRes)])
   .then(([a,b])=>setN({followers:a.items.length,following:b.items.length})).catch(()=>{});
 },[call,profileId]);
 const base=self?'/n/me/follows':`/n/people/${profileId}/follows`;
 return <Card list className="mt12">
  <Row icon={Users} tone="v" title={t('fe.br.followers')+(n?' · '+countLabel(n.followers):'')} onClick={()=>navigate(base+'?tab=followers')}/>
  <Row icon={Users} tone="v" title={t('fe.br.following')+(n?' · '+countLabel(n.following):'')} onClick={()=>navigate(base+'?tab=following')}/>
  <Row icon={ImageIcon} tone="g" title={t('fe.br.gallery')+(photos!=null?' · '+photos:'')} onClick={()=>navigate(`/n/people/${profileId}/gallery`)}/>
 </Card>;
}

/* ---------- V21 P20: gallery ---------- */

/** The server has no albums yet: the gallery is the profile photos the viewer may see (own pending ones marked). */
export function GalleryScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();
 const [p,setP]=useState<z.infer<typeof profileRes>['profile']|null>(null);const [error,setError]=useState<unknown>(null);const [open,setOpen]=useState<number|null>(null);
 const load=useCallback(()=>{setError(null);call('profile.get',{profileId:id},profileRes).then(r=>setP(r.profile)).catch(setError);},[call,id]);
 useEffect(()=>{setP(null);load();},[load]);
 const list=(p?.photos??[]).filter(m=>mediaSrc(m));
 const opener=useRef<HTMLElement|null>(null);
 const close=useCallback(()=>{setOpen(null);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));},[]);
 return <>
  <Bar title={t('fe.br.gallery')+(p?' · '+nameOf(p):'')} back/>
  <View>
   {error?<Empty icon={X} role="alert" title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p?<Skel kind="list"/>
    :!list.length?<Empty icon={ImageIcon} title={t('fe.br.galleryEmpty')}/>
    :<div className="ggrid">{list.map((m,i)=><button key={i} type="button" className="gtile" aria-label={t('fe.br.photoN',{n:i+1,total:list.length})}
     onClick={e=>{opener.current=e.currentTarget;setOpen(i);}}>
     <img src={mediaSrc(m)!} alt="" loading="lazy" draggable={false}/>
     {m.pending&&<span className="gt-w" title={t('fe.br.inReview')}><Clock/></span>}
    </button>)}</div>}
  </View>
  {open!==null&&<Viewer srcs={list.map(m=>mediaSrc(m,'full')!)} index={open} onClose={close}/>}
 </>;
}
