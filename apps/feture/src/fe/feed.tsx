import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ArrowUpDown,AtSign,Bell,BellOff,Bookmark,Check,Calendar,ChartColumn,ChevronLeft,ChevronRight,Clock,Ellipsis,Eye,EyeOff,FileText,Globe,Heart,Image as ImageIcon,KeyRound,Lock,MessageCircle,Newspaper,Pencil,Plus,Search,SendHorizontal,Share,SlidersHorizontal,Sparkles,Trash2,User,Users,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {publicOrigin} from '../api-url';
import {ActingAv,ActionLine,ActivityCard,ActivityItem,Alert,Ask,Av,Bar,Btn,Card,Chip,Chips,Counter,Empty,FeedEvents,Field,FilePick,Group,H,IconBtn,Input,LikesLine,Note,QuickStart,RichArea,Row,SearchInput,SectionLabel,Seg,SelectRow,Sheet,Skel,Stack,Text,TextArea,ToggleRow,VideoBadge,View,type RichAreaHandle} from './kit';
import {useFe} from './session';
import {Uploader} from './kit/Uploader';
import {useSendPhoto,useSendVideo} from './media-upload';
import {VIDEO_TYPES} from './kit/media';
import {BellButton} from './inbox';
import {PostMenu,ReplyMenu,type Removal} from './post-menu';
import {restoreInto,useToast} from './toast';
import {MarksSheet,MediaGrid,Poll,RichText,Viewer,marksPage,mdPlain,mediaSrc,personName,plural,useTopics,type CatTopic,type MarksPage,type PollData} from './post-parts';
import {AlbumField,albumOfPost} from './gallery';
import {Jars,useInterests,type Interest} from './interests';
import {NameBadges} from './faces';
import {EventCard,eventRow} from './communities';
import {CompareSheet,asInterest} from './compare';

/** Slice B (V21 F01, F05, F07, F09) with the prototype's markup: feed tabs, composer row, topic chips and filters,
 * posts (text, media, poll, interests, marks), replies in threads, the composer and its preview.
 * Visibility and counts are the server's; the client never filters or invents them. */
const author=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string(),avatar:z.string().nullable().optional(),photoVerified:z.boolean().optional(),premium:z.boolean().optional()});
const media=z.object({id:z.uuid(),kind:z.string(),w:z.number().nullable(),h:z.number().nullable(),pending:z.boolean(),blurred:z.boolean(),src:z.record(z.string(),z.string()).nullable(),durationMs:z.number().nullable().optional()});
const tag=z.object({id:z.uuid(),handle:z.string().nullable().optional(),name:z.string().nullable().optional(),state:z.string().optional()}).passthrough();
const interest=z.object({topicId:z.string(),value:z.number().nullable().optional(),dir:z.unknown().optional()}).passthrough();
export const postSchema=z.object({id:z.uuid(),type:z.enum(['post','note']),title:z.string().nullable(),body:z.string(),author,media:z.array(media),
 topics:z.array(z.string()).optional(),likes:z.number(),liked:z.boolean(),replies:z.number(),saved:z.boolean(),publishedAt:z.string().nullable(),state:z.string().optional(),
 // The audience is sent for own posts and for posts narrower than «all».
 audience:z.string().optional(),editedAt:z.string().nullable().optional(),
 // Own posts only: what the edit screen starts from.
 rev:z.number().int().optional(),inFeed:z.boolean().optional(),returned:z.string().nullable().optional(),albumId:z.uuid().nullable().optional(),
 poll:z.object({question:z.string(),options:z.array(z.string()),myVote:z.number().nullable().optional(),results:z.array(z.number()).nullable().optional()}).nullable().optional(),
 interests:z.array(interest).nullable().optional(),tags:z.array(tag).optional(),
 // Mentions that are links (V21 unmentionMe): only these @names open a profile.
 mentions:z.array(z.object({id:z.uuid(),handle:z.string().nullable()})).optional()});
export type Post=z.infer<typeof postSchema>;
const page=z.object({ok:z.literal(true),items:z.array(postSchema),next:z.string().nullable()});
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const reply=z.object({id:z.uuid(),parentId:z.uuid().nullable().optional(),deleted:z.boolean().optional(),hidden:z.boolean().optional(),body:z.string().optional(),
 author:author.nullable().optional(),mine:z.boolean().optional(),liked:z.boolean().optional(),createdAt:z.string().optional(),editedAt:z.string().nullable().optional(),likes:z.number().optional(),rev:z.number().optional(),
 mentions:z.array(z.object({id:z.uuid(),handle:z.string().nullable()})).optional()});
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
/** F02 filters of one tab: topics to show, topics to hide, kinds of posts, and (in «Подписки») kinds of activity. */
type Filters={topics:string[],ex:string[],types:string[],kinds:string[]};
const NO_FILTERS:Filters={topics:[],ex:[],types:[],kinds:[]};
const POST_TYPES=['note','text','photo','poll','interests'] as const;
const ACT_KINDS=['posts','likes','events','communities','follows'] as const;
const filtN=(f:Filters)=>f.topics.length+f.ex.length+f.types.length+f.kinds.length;
/** What feed.list gets for a tab: «Подписки» always asks for the mixed stream (no kinds = everything); «Популярное»
 * is by the acting profile's own interests, one of them when a chip is picked. */
const feedInput=(tab:Tab,f:Filters,popTag:string)=>tab==='popular'?{tab,myInterests:true,...(popTag?{topics:[popTag]}:{})}
 :{tab,...(f.topics.length?{topics:f.topics}:{}),...(f.ex.length?{excludeTopics:f.ex}:{}),...(f.types.length?{types:f.types}:{}),...(tab==='following'?{activity:f.kinds}:{})};
const actPerson=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.string().nullable().optional()}).passthrough();
const activitySchema=z.object({kind:z.literal('activity'),id:z.string(),activity:z.enum(['likes','events','communities','follows']),actor:actPerson,count:z.number(),at:z.string(),
 items:z.array(z.object({id:z.string()}).passthrough())});
type Act=z.infer<typeof activitySchema>;
type FeedItem=Post|Act;
const isAct=(x:FeedItem):x is Act=>(x as Act).kind==='activity';
const mixedPage=z.object({ok:z.literal(true),items:z.array(z.unknown()),next:z.string().nullable()});
const feedItems=(raw:unknown[]):FeedItem[]=>raw.flatMap((x):FeedItem[]=>{const a=activitySchema.safeParse(x);if(a.success)return [a.data];const p=postSchema.safeParse(x);return p.success?[p.data]:[];});
type Gone={authorId:string,name:string,undo:()=>Promise<void>};

/* ---------- «Скоро»: upcoming events for the acting profile ---------- */

const soonRes=z.object({ok:z.literal(true),items:z.array(eventRow.extend({why:z.string()}))});
type SoonEv=z.infer<typeof soonRes>['items'][number];
/** What `event.soon` offers the acting profile, and «Скрыть» (feed_hide kind 'event') with «Вернуть» in the toast. */
function useSoon(){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();
 const [items,setItems]=useState<SoonEv[]>([]);
 const load=useCallback(()=>{call('event.soon',{},soonRes).then(r=>setItems(r.items)).catch(()=>setItems([]));},[call]);
 useEffect(()=>{setItems([]);load();},[load,acting?.id]);
 const hide=async(e:SoonEv)=>{
  const was=items;setItems(l=>l.filter(x=>x.id!==e.id));
  try{
   await call('feedHide.set',{opId:newOpId(),kind:'event',targetId:e.id,on:true},okOnly);
   toast(t(acting?.kind==='couple'?'fe.soon.hiddenUs':'fe.soon.hidden'),{type:'ok',action:{label:t('fe.tl.undo'),fn:()=>{
    call('feedHide.set',{opId:newOpId(),kind:'event',targetId:e.id,on:false},okOnly).then(()=>{setItems(was);load();},err=>toast(feErrorMessage(err,t),{type:'err'}));}}});
  }catch(err){setItems(was);toast(feErrorMessage(err,t),{type:'err'});}
 };
 return {items,hide};
}
function SoonBlock({s}:{s:ReturnType<typeof useSoon>}){
 const {t}=useI18n();const {acting}=useFe();const us=acting?.kind==='couple';
 const why=(w:string)=>{const k='fe.soon.why.'+w+(us&&(w==='mine'||w==='follow'||w==='community'||w==='interests'||w==='city')?'Us':'');const v=t(k);return v===k?undefined:v;};
 return <FeedEvents title={t('fe.soon.title')} items={s.items.map(e=>({key:e.id,tile:<EventCard e={e} row org={why(e.why)}/>,hide:t('fe.soon.hide'),
  hideLabel:t('fe.soon.hideOne',{title:e.title}),onHide:()=>void s.hide(e)}))}/>;
}

export function FeedTab(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const location=useLocation();const toast=useToast();
 const {name:tname,topics:catalog,cats}=useTopics();const {items:jars}=useInterests();
 const [tab,setTab]=useState<Tab>('forYou');
 // Filters per tab (F02). Right after sign-up the feed opens on the topics chosen at step 2 (V21 AUTH-018); «Показать всё» clears them.
 const arrived=location.state as {topics?:unknown,welcome?:unknown,hello?:unknown,warn?:unknown}|null;
 const [filters,setFilters]=useState<Record<Tab,Filters>>(()=>({forYou:{...NO_FILTERS,topics:Array.isArray(arrived?.topics)?arrived.topics.filter((x):x is string=>typeof x==='string'):[]},following:NO_FILTERS,popular:NO_FILTERS}));
 const f=filters[tab];const sel=f.topics;
 const [popTag,setPopTag]=useState('');
 const [welcome,setWelcome]=useState(arrived?.welcome===true);
 useEffect(()=>{const hello=arrived?.hello;if(typeof hello!=='string')return;
  const had=Array.isArray(arrived?.topics)&&arrived.topics.length>0;
  toast(hello,{type:arrived?.warn?'warn':'ok',...(had?{action:{label:t('fe.onb2.showAll'),fn:()=>setFilters(x=>({...x,forYou:NO_FILTERS}))}}:{})});
  navigate('.',{replace:true,state:null}); // a reload or «Назад» doesn't greet again
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 // A post screen that lost its post (deleted, hidden, blocked) comes back with `state.notice`.
 const [notice,setNotice]=useState(()=>{const n=(location.state as {notice?:unknown}|null)?.notice;return typeof n==='string'?n:'';});
 const [items,setItems]=useState<FeedItem[]|null>(null);const [next,setNext]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);const [more,setMore]=useState(false);
 const [hidden,setHidden]=useState(0);const [sheet,setSheet]=useState<'create'|'filters'|'popInfo'|null>(null);
 const [gone,setGone]=useState<Record<string,Gone>>({});const [actMenu,setActMenu]=useState<Act|null>(null);
 // Quick topics come from the posts this tab really shows (most frequent first) and stay put while filtering.
 const [quick,setQuick]=useState<Record<Tab,string[]>>({forYou:[],following:[],popular:[]});
 // Only the latest request may fill the list: a slow answer for the tab or filter left behind never overwrites the current one.
 const req=useRef(0);
 const input=useMemo(()=>feedInput(tab,f,popTag),[tab,f,popTag]);
 const load=useCallback((cursor?:string)=>{
  const n=++req.current;
  setError(null);if(!cursor){setItems(null);setGone({});}else setMore(true);
  call('feed.list',{...input,...(cursor?{cursor}:{})},mixedPage).then(r=>{
   if(n!==req.current)return;const got=feedItems(r.items);
   setItems(prev=>cursor&&prev?[...prev,...got]:got);setNext(r.next);
   if(!filtN(f)&&!cursor&&tab!=='popular'){const fq:Record<string,number>={};got.forEach(p=>{if(!isAct(p))(p.topics??[]).forEach(x=>{fq[x]=(fq[x]??0)+1;});});
    setQuick(q=>({...q,[tab]:Object.keys(fq).sort((a,b)=>fq[b]!-fq[a]!).slice(0,7)}));}
  }).catch(e=>{if(n===req.current)setError(e);}).finally(()=>{if(n===req.current)setMore(false);});
 },[call,input,f,tab]);
 useEffect(()=>{load();},[load]);
 const loadHidden=useCallback(()=>{call('feedHide.list',{},hiddenList).then(r=>setHidden(r.items.filter(x=>x.kind==='post'||x.kind==='author').length)).catch(()=>{});},[call]);
 useEffect(()=>{loadHidden();},[loadHidden]);
 const soon=useSoon();
 const setF=(next:Filters)=>setFilters(x=>({...x,[tab]:next}));
 const toggleTopic=(id:string)=>setF({...f,topics:sel.includes(id)?sel.filter(x=>x!==id):[...sel,id]});
 const me=nameOf(acting);
 const typeName=(k:string)=>t('fe.w3.type.'+k),kindName=(k:string)=>t('fe.w3.kind.'+k);
 // Active filters as chips with ✕ (V21 rmFilter); without filters — the quick topics of this tab.
 const rm=(k:keyof Filters,v:string)=>setF({...f,[k]:f[k].filter(x=>x!==v)});
 const chips=filtN(f)?[...f.kinds.map(x=><Chip key={'k'+x} filter on label={t('fe.w3.ff.remove',{name:kindName(x)})} onClick={()=>rm('kinds',x)}>{kindName(x)} <X/></Chip>),
   ...f.topics.map(x=><Chip key={'t'+x} filter on label={t('fe.w3.ff.remove',{name:'#'+tname(x)})} onClick={()=>rm('topics',x)}>#{tname(x)} <X/></Chip>),
   ...f.ex.map(x=><Chip key={'e'+x} filter on label={t('fe.w3.ff.remove',{name:t('fe.w3.ff.without',{name:tname(x)})})} onClick={()=>rm('ex',x)}>{t('fe.w3.ff.without',{name:tname(x)})} <X/></Chip>),
   ...f.types.map(x=><Chip key={'y'+x} filter on label={t('fe.w3.ff.remove',{name:typeName(x)})} onClick={()=>rm('types',x)}>{typeName(x)} <X/></Chip>)]
  :quick[tab].map(x=><Chip key={x} filter on={false} onClick={()=>toggleTopic(x)}>#{tname(x)}</Chip>);
 const replace=(np:Post)=>setItems(list=>list?.map(x=>!isAct(x)&&x.id===np.id?np:x)??null);
 const refetch=(id:string)=>{call('post.get',{postId:id},onePost).then(r=>replace(r.post)).catch(()=>{});};
 const posts=(items??[]).filter((x):x is Post=>!isAct(x));
 // Removing posts of an author (or one post) with «Вернуть» in the toast.
 const removeWith=(r:Removal)=>{
  const before=items??[];const goneIds=new Set(posts.filter(x=>x.id===r.postId||x.author.id===r.authorId).map(x=>x.id));
  setItems(list=>list?.filter(x=>isAct(x)||!goneIds.has(x.id))??null);setNotice('');loadHidden();
  const undo=r.undo;
  toast(r.notice,{type:'ok',action:undo?{label:t('fe.tl.undo'),fn:()=>{undo().then(()=>{setItems(list=>restoreInto(before,list,goneIds));loadHidden();toast(t('fe.tl.restored'),{type:'ok'});},e=>toast(feErrorMessage(e,t),{type:'err'}));}}:null});
 };
 const muteAuthor=async(g:Gone)=>{
  try{await call('feedHide.set',{opId:newOpId(),kind:'author',targetId:g.authorId,on:true},okOnly);
   removeWith({authorId:g.authorId,notice:t('fe.pm.done.authorHiddenName',{name:g.name}),undo:async()=>{await call('feedHide.set',{opId:newOpId(),kind:'author',targetId:g.authorId,on:false},okOnly);}});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}
 };
 const restore=(id:string,g:Gone)=>{g.undo().then(()=>{setGone(x=>{const {[id]:_,...rest}=x;return rest;});loadHidden();},e=>toast(feErrorMessage(e,t),{type:'err'}));};
 // «Популярное» is picked by the acting profile's interests (never its hard limits).
 const myTopics=(jars??[]).filter(j=>j.value!=null&&j.mark!=='hard').map(j=>j.topicId);
 let body:ReactNode;
 if(tab==='popular'&&jars!==null&&!myTopics.length)body=<Empty icon={Sparkles} title={t('fe.w3.pop.noInterests')} text={t('fe.w3.pop.noInterestsText')}><Btn onClick={()=>navigate('/n/me/interests')}>{t('fe.w3.pop.addInterests')}</Btn></Empty>;
 else if(error&&!items)body=<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>;
 else if(items===null)body=<Skel kind="post"/>;
 else if(!items.length)body=filtN(f)?<Empty icon={SlidersHorizontal} title={t('fe.fd.nothing')} text={tab==='following'?t('fe.fd.nothingFollowing'):t('fe.fd.nothingText')}><Btn kind="soft" onClick={()=>setF(NO_FILTERS)}>{t('fe.fd.resetFilters')}</Btn></Empty>
  :tab==='popular'?<Empty icon={Sparkles} title={t('fe.w3.pop.empty')} text={t('fe.w3.pop.emptyText')}/>
  :hidden?<Empty icon={EyeOff} title={t('fe.fd.allHidden')} text={t('fe.fd.allHiddenText')}><Btn kind="soft" onClick={()=>navigate('/n/settings/hidden')}>{t('fe.fd.showHidden')}</Btn></Empty>
  :tab==='following'?<Empty icon={Users} title={t('fe.fd.noFollows')} text={t('fe.fd.noFollowsText')}><Btn onClick={()=>navigate('/n/search?scope=people')}>{t('fe.fd.findPeople')}</Btn></Empty>
  :<Empty icon={Newspaper} title={t('fe.fd.noPosts')} text={t('fe.fd.noPostsText')}><Btn onClick={()=>navigate('/n/search?scope=people')}>{t('fe.fd.findPeople')}</Btn></Empty>;
 else body=<>
  <div className="posts">{items.flatMap((p,i)=>[isAct(p)?<ActivityCardOf key={p.id} a={p} onMenu={()=>setActMenu(p)}/>
   :gone[p.id]?<Alert key={p.id} kind="info" icon={EyeOff} className="mb12" action={<Stack row gap={2}><Btn size="sm" kind="soft" fit onClick={()=>restore(p.id,gone[p.id]!)}>{t('fe.tl.undo')}</Btn>
     <Btn size="sm" kind="text" fit onClick={()=>muteAuthor(gone[p.id]!)}>{t('fe.w3.hide.author',{name:gone[p.id]!.name})}</Btn></Stack>}>{t('fe.w3.hide.row')}</Alert>
   :<PostCard key={p.id} post={p} onChange={replace} onExpired={()=>refetch(p.id)}
   onRemove={r=>{
    // «Скрыть публикацию» leaves a row in its place (V21 FEED-011) until the feed reloads.
    if(r.hidden&&r.postId&&r.undo){const g={authorId:r.hidden.authorId,name:r.hidden.authorName,undo:r.undo};setGone(x=>({...x,[r.postId!]:g}));setNotice('');loadHidden();return;}
    removeWith(r);
   }}/>,
   // «Скоро» (V21 feedEvLess) sits after the third item of «Для тебя» (or after the last one of a short feed).
   ...(tab==='forYou'&&i===Math.min(2,items.length-1)?[<SoonBlock key="soon" s={soon}/>]:[])])}</div>
  {next&&<Btn kind="soft" className="mt12" onClick={()=>load(next)} busy={more} disabled={more}>{t('fe.feed.more')}</Btn>}
  {hidden>0&&<button type="button" className="linkbtn feed-hid" onClick={()=>navigate('/n/settings/hidden')}><EyeOff/>{t('fe.fd.hiddenN',{n:hidden})}</button>}
 </>;
 return <>
  <Bar title={t('fe.nav.feed')}><IconBtn icon={Search} label={t('fe.br.search')} onClick={()=>navigate('/n/search?scope=posts')}/><BellButton/></Bar>
  <View>
   <div className="mb12"><Seg value={tab} onChange={v=>{setNotice('');setTab(v);}} options={[{id:'forYou',label:t('fe.feed.tab.forYou')},{id:'following',label:t('fe.feed.tab.following')},{id:'popular',label:t('fe.fd.tab.popular')}]}/></div>
   {notice&&<Alert kind="ok" className="mb12">{notice}</Alert>}
   {welcome&&!acting?.avatar&&<Card className="mb12"><Stack gap={3}>
    <H level={4}>{t('fe.fd.welcome.title')}</H><Text size="sm" tone="mute">{t('fe.fd.welcome.text')}</Text>
    <Stack row gap={2}><Btn size="sm" fit onClick={()=>navigate('/n/me/edit?only=media')}>{t('fe.fd.welcome.go')}</Btn>
     <Btn kind="soft" size="sm" fit onClick={()=>setWelcome(false)}>{t('fe.fd.welcome.hide')}</Btn></Stack>
   </Stack></Card>}
   <div className="composer">
    <button type="button" className="cmp-main" onClick={()=>navigate('/n/feed/new')}>{acting&&<ActingAv p={acting}/>}<span>{t(acting?.kind==='couple'?'fe.feed.whatsNewUs':'fe.feed.whatsNew')}</span></button>
    <IconBtn icon={ImageIcon} kind="ghost" size="sm" label={t('fe.fd.photoOrVideo')} onClick={()=>navigate('/n/feed/new?x=media')}/>
    <IconBtn icon={ChartColumn} kind="ghost" size="sm" label={t('fe.feed.poll')} onClick={()=>navigate('/n/feed/new?x=poll')}/>
    <IconBtn icon={Plus} kind="add" label={t('fe.create')} onClick={()=>setSheet('create')}/>
   </div>
   {tab==='popular'?(myTopics.length>0&&<>
     <ActionLine text={t('fe.w3.pop.head')}><Btn kind="text" auto onClick={()=>setSheet('popInfo')}>{t('fe.w3.pop.how')}</Btn></ActionLine>
     <Chips scroll className="mb12" label={t('fe.w3.pop.chips')}><Chip filter on={!popTag} onClick={()=>setPopTag('')}>{t('fe.w3.pop.all')}</Chip>
      {myTopics.map(x=><Chip key={x} filter on={popTag===x} onClick={()=>setPopTag(popTag===x?'':x)}>#{tname(x)}</Chip>)}</Chips>
     <PopularDiscussions topic={popTag}/></>)
    :(chips.length>0||catalog.length>0)&&<div className="filterline"><Chips scroll>{chips}</Chips>
     <Chip filter on={filtN(f)>0} icon={SlidersHorizontal} label={t('fe.fd.filters')} popup onClick={()=>setSheet('filters')}>{t('fe.fd.filters')}{filtN(f)>0&&<em className="badge-abs">{filtN(f)}</em>}</Chip>
    </div>}
   {body}
  </View>
  {sheet==='create'&&<CreateSheet onClose={()=>setSheet(null)}/>}
  {sheet==='popInfo'&&<PopInfoSheet onClose={()=>setSheet(null)}/>}
  {sheet==='filters'&&<FeedFilterSheet tab={tab} topics={catalog} cats={cats} popular={quick[tab]} value={f} locale={locale} onClose={()=>setSheet(null)}
   onApply={v=>{setF(v);setSheet(null);toast(t('fe.fd.applied'),{type:'ok'});}}/>}
  {actMenu&&<Sheet title={nameOf(actMenu.actor)} onClose={()=>setActMenu(null)}><Card list>
   <Row noChev icon={User} title={t('fe.w3.act.profile')} onClick={()=>{const id=actMenu.actor.id;setActMenu(null);navigate('/n/people/'+id);}}/>
   <Row noChev icon={BellOff} title={t('fe.w3.act.mute')} sub={t('fe.w3.act.muteSub')} onClick={async()=>{
    const who=actMenu.actor;setActMenu(null);
    try{await call('activity.mute',{opId:newOpId(),profileId:who.id,on:true},okOnly);
     const before=items;setItems(list=>list?.filter(x=>!isAct(x)||x.actor.id!==who.id)??null);
     toast(t('fe.w3.act.muted',{name:nameOf(who)}),{type:'ok',action:{label:t('fe.tl.undo'),fn:()=>{call('activity.mute',{opId:newOpId(),profileId:who.id,on:false},okOnly)
      .then(()=>{setItems(before);toast(t('fe.tl.restored'),{type:'ok'});},e=>toast(feErrorMessage(e,t),{type:'err'}));}}});}
    catch(e){toast(feErrorMessage(e,t),{type:'err'});}}}/>
  </Card></Sheet>}
 </>;
}

/** One «Подписки» activity card (V21 actCard): «Mia: нравится 3 публикации», the things, ⋯. */
function ActivityCardOf({a,onMenu}:{a:Act,onMenu:()=>void}){
 const {t,locale}=useI18n();const navigate=useNavigate();
 const who=nameOf(a.actor);const n=a.count;
 const text=a.activity==='likes'?t('fe.w3.act.likes',{name:who,n:plural(n,['публикация','публикации','публикаций'],['post','posts'],locale)})
  :a.activity==='events'?t('fe.w3.act.events',{name:who,n:plural(n,['событие','события','событий'],['event','events'],locale)})
  :a.activity==='communities'?t('fe.w3.act.communities',{name:who,n:plural(n,['сообщество','сообщества','сообществ'],['community','communities'],locale)})
  :t('fe.w3.act.follows',{name:who,n:plural(n,['человек','человека','человек'],['person','people'],locale)});
 const s=(v:unknown)=>typeof v==='string'?v:'';
 const items=a.items.map(x=>{
  if(a.activity==='likes'){const au=x.author as {name?:string|null,handle?:string|null}|undefined;
   return <ActivityItem key={x.id} icon={Heart} title={s(x.title)||mdPlain(s(x.excerpt)).slice(0,80)||t('fe.feed.post')} sub={nameOf(au)} onClick={()=>navigate('/n/feed/post/'+x.id)}/>;}
  if(a.activity==='events')return <ActivityItem key={x.id} icon={Calendar} title={s(x.title)} sub={x.startsAt?new Date(s(x.startsAt)).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):undefined} onClick={()=>navigate('/n/events/'+x.id)}/>;
  if(a.activity==='communities')return <ActivityItem key={x.id} icon={Users} title={s(x.name)} onClick={()=>navigate('/n/communities/'+x.id)}/>;
  const p={name:s(x.name)||null,handle:s(x.handle)||null};
  return <ActivityItem key={x.id} av={<Av name={nameOf(p)} seed={x.id} src={s(x.avatar)||null} size="sm"/>} title={nameOf(p)} sub={p.handle?'@'+p.handle:undefined} onClick={()=>navigate('/n/people/'+x.id)}/>;
 });
 return <ActivityCard actor={{id:a.actor.id,name:who,avatar:a.actor.avatar??null}} text={text} time={when(a.at,locale)} menuLabel={t('fe.more')} onMenu={onMenu}
  onActor={()=>navigate('/n/people/'+a.actor.id)} items={items} more={t('fe.w3.act.more',{n:items.length})} less={t('fe.fd.collapse')}/>;
}

/** «Обсуждают в сообществах» (V21 popularFeed → popularDiscs): the three most discussed community threads of the week
 * the viewer may read (in the picked interest), by the same score as the feed; a host's «Не показывать в Популярном»
 * keeps a thread out on the server. Nothing to show — no block. */
const popDiscs=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),title:z.string().nullable(),excerpt:z.string(),replies:z.number(),
 community:z.object({id:z.uuid(),name:z.string()})}).passthrough())});
function PopularDiscussions({topic}:{topic:string}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [items,setItems]=useState<z.infer<typeof popDiscs>['items']>([]);
 useEffect(()=>{let live=true;call('discussions.popular',{limit:3,...(topic?{topic}:{})},popDiscs).then(r=>{if(live)setItems(r.items);}).catch(()=>{if(live)setItems([]);});return ()=>{live=false;};},[call,topic]);
 if(!items.length)return null;
 return <Group title={t('fe.lo.pop.discs')}><Card list>{items.map(d=><Row key={d.id} icon={MessageCircle} title={d.title||mdPlain(d.excerpt).slice(0,80)}
  sub={d.community.name+' · '+plural(d.replies,['ответ','ответа','ответов'],['reply','replies'],locale)} onClick={()=>navigate('/n/feed/post/'+d.id)}/>)}</Card></Group>;
}

/** «Как подбираем» (V21 popInfo): the rules «Популярное» really follows on the server. */
function PopInfoSheet({onClose}:{onClose:()=>void}){
 const {t}=useI18n();
 const rows:[LucideIcon,string,string][]=[[Sparkles,t('fe.w3.pop.r1'),t('fe.w3.pop.r1s')],[MessageCircle,t('fe.w3.pop.r2'),t('fe.w3.pop.r2s')],[Lock,t('fe.w3.pop.r3'),t('fe.w3.pop.r3s')],[Users,t('fe.lo.pop.r5'),t('fe.lo.pop.r5s')],[Heart,t('fe.w3.pop.r4'),t('fe.w3.pop.r4s')]];
 return <Sheet title={t('fe.w3.pop.howTitle')} onClose={onClose}><Card list>{rows.map(([I,ti,s])=><Row key={ti} icon={I} title={ti} sub={s}/>)}</Card></Sheet>;
}

/** `ACT.create` — what to create: a post, an article or an event; or straight to photos, a poll, my interests. */
export function CreateSheet({onClose}:{onClose:()=>void}){
 const {t}=useI18n();const navigate=useNavigate();
 const rows:[LucideIcon,string,string,string,string][]=[[Pencil,'l',t('fe.fd.cr.post'),t('fe.fd.cr.postSub'),'/n/feed/new'],[FileText,'v',t('fe.fd.cr.note'),t('fe.fd.cr.noteSub'),'/n/feed/new?x=note'],[Calendar,'g',t('fe.fd.cr.event'),t('fe.fd.cr.eventSub'),'/n/events/new']];
 const go=(to:string)=>()=>{onClose();navigate(to);};
 return <Sheet title={t('fe.create')} onClose={onClose}>
  <Card list>{rows.map(([I,tone,b,s,to])=><Row key={to} icon={I} tone={tone} title={b} sub={s} onClick={go(to)}/>)}</Card>
  <QuickStart title={t('fe.w3.cr.quick')} items={[[ImageIcon,t('fe.w3.cr.media'),go('/n/feed/new?x=media')],[ChartColumn,t('fe.feed.poll'),go('/n/feed/new?x=poll')],[Sparkles,t('fe.fd.myInterests'),go('/n/feed/new?x=interests')]]}/>
 </Sheet>;
}

/** F02 — the feed's filters (V21 feedFilters): what «Подписки» shows, topics to show and to hide, what is in the post.
 * The button says how many the server would show («Показать N»); with none it is the inactive «Нет подходящих». */
function FeedFilterSheet({tab,topics,cats,popular,value,locale,onClose,onApply}:{tab:Tab,topics:CatTopic[],cats:{id:string,ru:string,en:string}[],popular:string[],value:Filters,locale:string,onClose:()=>void,onApply:(v:Filters)=>void}){
 const {call}=useFe();const {t}=useI18n();const [d,setD]=useState(value);const [sub,setSub]=useState<'topics'|'ex'|null>(null);const [q,setQ]=useState('');
 const [count,setCount]=useState<{n:number,more:boolean}|null>(null);
 useEffect(()=>{setCount(null);const id=setTimeout(()=>{call('feed.list',{...feedInput(tab,d,''),limit:50},mixedPage).then(r=>setCount({n:r.items.length,more:!!r.next})).catch(()=>setCount({n:-1,more:false}));},250);return ()=>clearTimeout(id);},[call,tab,d]);
 const nm=(x:CatTopic)=>locale==='en'?x.en:x.ru;
 // A topic is either shown or hidden, never both.
 const flip=(k:'topics'|'ex',id:string)=>setD(v=>{const on=v[k].includes(id);const other=k==='topics'?'ex':'topics';return {...v,[k]:on?v[k].filter(x=>x!==id):[...v[k],id],[other]:v[other].filter(x=>x!==id)};});
 const flipList=(k:'types'|'kinds',id:string)=>setD(v=>({...v,[k]:v[k].includes(id)?v[k].filter(x=>x!==id):[...v[k],id]}));
 const pop=(k:'topics'|'ex')=>[...new Set([...d[k],...popular,...topics.slice(0,6).map(x=>x.id)])].slice(0,Math.max(8,d[k].length)).map(id=>topics.find(x=>x.id===id)).filter((x):x is CatTopic=>!!x);
 const sec=(title:string,sum:string,clear:(()=>void)|null,chips:ReactNode)=><section className="fin"><div className="fin-t"><b>{title}</b><span>{sum}</span>{clear&&<button type="button" className="fclr" onClick={clear}>{t('fe.fd.clear')}</button>}</div><Chips>{chips}</Chips></section>;
 const topicSec=(k:'topics'|'ex')=>sec(k==='topics'?t('fe.fd.showTopics'):t('fe.w3.ff.hideTopics'),d[k].length?t('fe.w3.ff.picked',{n:d[k].length}):k==='topics'?t('fe.fd.pickAny'):t('fe.w3.ff.hideNone'),
  d[k].length?()=>setD(v=>({...v,[k]:[]})):null,<>{pop(k).map(x=><Chip key={x.id} on={d[k].includes(x.id)} onClick={()=>flip(k,x.id)}>{nm(x)}</Chip>)}<Chip more icon={Search} onClick={()=>setSub(k)}>{t('fe.br.seeAll')} · {topics.length}</Chip></>);
 const low=q.trim().toLowerCase();
 const n=count?.n??null;
 const label=n===null?t('fe.fd.applyFilters'):n<0?t('fe.fd.applyFilters'):n===0?t('fe.w3.ff.none'):count!.more?t('fe.w3.ff.showMore',{n:50}):tab==='following'?t('fe.w3.ff.showN',{n}):t('fe.w3.ff.showPosts',{n:plural(n,['публикацию','публикации','публикаций'],['post','posts'],locale)});
 if(sub)return <Sheet full title={sub==='topics'?t('fe.fd.showTopics'):t('fe.w3.ff.hideTopics')} onClose={onClose}
  lead={<IconBtn icon={ChevronLeft} kind="ghost" size="sm" label={t('fe.fd.backToFilters')} onClick={()=>{setSub(null);setQ('');}}/>}
  search={<SearchInput value={q} onChange={e=>setQ(e.target.value)} label={t('fe.fd.findOption')}/>}
  foot={<Btn onClick={()=>{setSub(null);setQ('');}}>{t('fe.fd.done')}</Btn>}>
  {cats.map(c=>{const list=topics.filter(x=>x.categoryId===c.id&&(!low||nm(x).toLowerCase().includes(low)));if(!list.length)return null;
   return <section key={c.id} className="fsec"><SectionLabel>{locale==='en'?c.en:c.ru}</SectionLabel><Chips>{list.map(x=><Chip key={x.id} on={d[sub].includes(x.id)} onClick={()=>flip(sub,x.id)}>{nm(x)}</Chip>)}</Chips></section>;})}
  {low&&!topics.some(x=>nm(x).toLowerCase().includes(low))&&<Note className="sh-empty">{t('fe.br.nothing')}</Note>}
 </Sheet>;
 return <Sheet full title={t('fe.fd.feedFilters')} onClose={onClose} head={<Btn kind="text" auto onClick={()=>setD(NO_FILTERS)}>{t('fe.fd.reset')}</Btn>}
  foot={<Btn onClick={()=>onApply(d)} disabled={n===0} busy={count===null}>{label}</Btn>}>
  {tab==='following'&&sec(t('fe.w3.ff.kinds'),d.kinds.length?d.kinds.map(k=>t('fe.w3.kind.'+k)).join(', '):t('fe.w3.ff.everything'),d.kinds.length?()=>setD(v=>({...v,kinds:[]})):null,
   ACT_KINDS.map(k=><Chip key={k} on={d.kinds.includes(k)} onClick={()=>flipList('kinds',k)}>{t('fe.w3.kind.'+k)}</Chip>))}
  {topicSec('topics')}
  {topicSec('ex')}
  {sec(t('fe.w3.ff.types'),d.types.length?d.types.map(k=>t('fe.w3.type.'+k)).join(', '):t('fe.w3.ff.anyType'),d.types.length?()=>setD(v=>({...v,types:[]})):null,
   POST_TYPES.map(k=><Chip key={k} on={d.types.includes(k)} onClick={()=>flipList('types',k)}>{t('fe.w3.type.'+k)}</Chip>))}
  {tab==='following'&&(d.topics.length>0||d.ex.length>0||d.types.length>0)&&<Note>{t('fe.w3.ff.postsOnly')}</Note>}
 </Sheet>;
}

export function useEsc(fn:()=>void){
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();fn();}};document.addEventListener('keydown',k);return ()=>document.removeEventListener('keydown',k);},[fn]);
}

/** F02 — topic filters (`filterSheet`): popular chips, «Все · N» opens every topic by category with a search. */
/** The feed's topic filter; with `max` it is the post's topic picker (up to `max`, «Готово», no «Сбросить»). */
export function FilterSheet({title,topics,cats,popular,value,onClose,onApply,max}:{title:string,topics:CatTopic[],cats:{id:string,ru:string,en:string}[],popular:string[],value:string[],onClose:()=>void,onApply:(v:string[])=>void,max?:number}){
 const {t,locale}=useI18n();const toast=useToast();const [d,setD]=useState(value);const [all,setAll]=useState(false);const [q,setQ]=useState('');
 const nm=(x:CatTopic)=>locale==='en'?x.en:x.ru;
 const toggle=(id:string)=>{if(max&&!d.includes(id)&&d.length>=max){toast(t('fe.fd.max3'),{type:'warn'});return;}setD(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);};
 const chip=(x:CatTopic)=><Chip key={x.id} on={d.includes(x.id)} onClick={()=>toggle(x.id)}>{nm(x)}</Chip>;
 const pop=[...new Set([...d,...popular,...topics.slice(0,6).map(x=>x.id)])].slice(0,Math.max(8,d.length)).map(id=>topics.find(x=>x.id===id)).filter((x):x is CatTopic=>!!x);
 const low=q.trim().toLowerCase();
 return <Sheet full title={all?t('fe.fd.showTopics'):title} onClose={onClose}
  lead={all?<IconBtn icon={ChevronLeft} kind="ghost" size="sm" label={t('fe.fd.backToFilters')} onClick={()=>{setAll(false);setQ('');}}/>:undefined}
  head={!all&&!max?<Btn kind="text" auto onClick={()=>setD([])}>{t('fe.fd.reset')}</Btn>:undefined}
  search={all?<SearchInput value={q} onChange={e=>setQ(e.target.value)} label={t('fe.fd.findOption')}/>:undefined}
  foot={all?<Btn onClick={()=>{setAll(false);setQ('');}}>{t('fe.fd.done')}</Btn>:<Btn onClick={()=>onApply(d)}>{max?t('fe.fd.done'):t('fe.fd.applyFilters')}</Btn>}>
    {all?<>{cats.map(c=>{const list=topics.filter(x=>x.categoryId===c.id&&(!low||nm(x).toLowerCase().includes(low)));if(!list.length)return null;
      return <section key={c.id} className="fsec"><SectionLabel>{locale==='en'?c.en:c.ru}</SectionLabel><Chips>{list.map(chip)}</Chips></section>;})}
     {low&&!topics.some(x=>nm(x).toLowerCase().includes(low))&&<Note className="sh-empty">{t('fe.br.nothing')}</Note>}</>
    :<section className="fin"><div className="fin-t"><b>{max?t('fe.fd.topicsUpTo3'):t('fe.fd.showTopics')}</b><span>{max?t('fe.fd.topicsPicked',{n:d.length,max}):t('fe.fd.pickAny')}</span>{d.length>0&&<button type="button" className="fclr" onClick={()=>setD([])}>{t('fe.fd.clear')}</button>}</div>
     <Chips>{pop.map(chip)}<Chip more icon={Search} onClick={()=>setAll(true)}>{t('fe.br.seeAll')} · {topics.length}</Chip></Chips>
    </section>}
 </Sheet>;
}

/* ---------- postCard() ---------- */

const AUD_ICON:Record<string,LucideIcon>={followers:Users,granted:KeyRound,only:EyeOff};
export function PostCard({post,onChange,onRemove,onExpired,full=false,onReply,preview=false}:{post:Post,onChange:(p:Post)=>void,onRemove:(r:Removal)=>void,onExpired?:(()=>void)|undefined,full?:boolean,onReply?:()=>void,preview?:boolean}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();const {name:tname,ready:tready}=useTopics();
 const [busy,setBusy]=useState(false);
 const [menu,setMenu]=useState(false);const more=useRef<HTMLButtonElement>(null);const [review,setReview]=useState(false);
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
 const share=async()=>{const url=`${publicOrigin()}/#/n/feed/post/${post.id}`;try{await navigator.clipboard.writeText(url);toast(t('fe.fd.linkCopied'),{type:'ok'});}catch{toast(url,{type:'info'});}};
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
   <button type="button" className="who" disabled={preview} onClick={()=>navigate(mine||post.author.id===acting?.id?'/n/me':'/n/people/'+post.author.id)}>
    <Av name={nameOf(post.author)} seed={post.author.id} size="sm" couple={coupleOf(post.author)} src={post.author.avatar}/>
    <span className="tx"><b><span className="nmt">{nameOf(post.author)}</span><NameBadges p={post.author}/></b><small>{preview?t('fe.fd.justNow'):when(post.publishedAt,locale)}
     {AudI&&<> · <span className="aud"><AudI/>{t('fe.fd.aud.'+post.audience)}</span></>}
     {mine&&post.inFeed===false&&<> · <span className="aud"><EyeOff/>{t('fe.fd.notInFeed')}</span></>}
     {post.state&&post.state!=='published'?' · '+t('fe.feed.state.'+post.state):''}{post.editedAt&&!preview?' · '+t('fe.fd.edited'):''}</small></span>
   </button>
   {!preview&&<IconBtn icon={Ellipsis} kind="ghost" size="sm" label={t('fe.more')} aria-haspopup="dialog" aria-expanded={menu} onClick={e=>{more.current=e.currentTarget;setMenu(true);}}/>}
  </div>
  {me&&me.state==='pending'&&!mine&&<div className="consent-note"><Users/><span><b>{t('fe.fd.tag.marksYou',{name:nameOf(post.author)})}</b>{t('fe.fd.tag.marksYouText')}</span>
   <div className="row g8"><Btn size="sm" disabled={busy} onClick={()=>answer('ok')}>{t('fe.fd.tag.confirm')}</Btn><Btn size="sm" kind="soft" disabled={busy} onClick={()=>answer('no')}>{t('fe.fd.tag.decline')}</Btn>
    <Btn size="sm" kind="text" fit onClick={()=>setReview(true)}>{t('fe.w3.tag.more')}</Btn></div></div>}
  {me&&me.state==='no'&&!mine&&<div className="consent-note bad"><EyeOff/><span><b>{t('fe.fd.tag.youDeclined')}</b>{t('fe.fd.tag.youDeclinedText')}</span>
   <div className="row g8"><Btn size="sm" kind="soft" disabled={busy} onClick={()=>answer('ok')}>{t('fe.fd.tag.changeMind')}</Btn></div></div>}
  {mine&&!preview&&(waiting.length>0||declined.length>0)&&<div className={'consent-note'+(declined.length?' bad':'')}>{declined.length?<EyeOff/>:<Clock/>}
   <span><b>{declined.length?t('fe.fd.tag.declinedBy',{names:declined.join(', ')}):t('fe.fd.tag.waiting',{names:waiting.join(', ')})}</b>{declined.length?t('fe.fd.tag.declinedText'):t('fe.fd.tag.waitingText')}</span>
   {declined.length>0&&<div className="row g8"><Btn size="sm" kind="soft" onClick={()=>navigate('/n/feed/post/'+post.id+'/edit')}>{t('fe.fd.tag.replace')}</Btn></div>}</div>}
  <div className="body" onClick={open} role={full||preview?undefined:'link'} tabIndex={full||preview?undefined:0} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget)open();}}>
   {post.type==='note'?<div className={'note-card'+(full?' full':'')}><span className="note-k"><FileText/>{t('fe.fd.article')} · {t('fe.fd.minRead',{n:words})}</span><H level={3} className="note-t">{post.title}</H>
     {full?<RichText text={post.body} mentions={post.mentions??[]}/>:<><p className="note-x">{mdPlain(post.body).slice(0,220)}{post.body.length>220?'…':''}</p><span className="note-more">{t('fe.fd.readMore')} <ChevronRight/></span></>}</div>
    :<>{post.title&&<H level={4} as="h3" className="post-title">{post.title}</H>}{post.body&&<RichText text={post.body} mentions={post.mentions??[]}/>}</>}
   <MediaGrid media={post.media} onExpired={onExpired}/>
   {post.poll&&<Poll postId={post.id} poll={post.poll as PollData} preview={preview} mine={mine} onChange={np=>onChange({...post,poll:np})}/>}
   {post.interests&&post.interests.length>0&&<PostInterests list={post.interests} preview={preview} author={post.author}/>}
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
  {review&&me&&<TagReviewSheet post={post} busy={busy} onClose={()=>setReview(false)} onAnswer={a=>{setReview(false);void answer(a);}}/>}
 </article>;
}

/** V21 tagReview — «Отметка на фото»: the photos, who will see the post with the name on it, how consent works, «Против» / «Разрешить». */
function TagReviewSheet({post,busy,onClose,onAnswer}:{post:Post,busy:boolean,onClose:()=>void,onAnswer:(a:'ok'|'no')=>void}){
 const {t}=useI18n();const {acting}=useFe();
 const others=(post.tags??[]).filter(x=>x.id!==acting?.id&&x.state!=='ok').length;
 const aud=t('fe.w3.tag.aud.'+(post.audience??'all'));
 return <Sheet title={t('fe.w3.tag.title')} sub={t('fe.w3.tag.sub',{name:nameOf(post.author)})} onClose={onClose}
  foot={<Stack row gap={2}><Btn kind="soft" disabled={busy} onClick={()=>onAnswer('no')}>{t('fe.w3.tag.no')}</Btn><Btn disabled={busy} onClick={()=>onAnswer('ok')}>{t('fe.w3.tag.yes')}</Btn></Stack>}>
  <Stack gap={3}>
   <MediaGrid media={post.media}/>
   {(post.title||post.body)&&<Text size="sm" tone="mute">{mdPlain(post.title||post.body).slice(0,160)}</Text>}
   <Card><Stack gap={2}><Text size="sm">{t('fe.w3.tag.who')} <b>{aud}</b>.{others>0?' '+t('fe.w3.tag.others'):''}</Text>
    <Note as="ul"><li>{t('fe.w3.tag.r1')}</li><li>{t('fe.w3.tag.r2')}</li><li>{t('fe.w3.tag.r3')}</li></Note></Stack></Card>
  </Stack>
 </Sheet>;
}

/** The «Мои интересы» card of a post: a snapshot of the author's public interests. Someone else's jar opens the
 * comparison (what it is, their answer, yours); your own opens the topic. */
function PostInterests({list,preview,author}:{list:z.infer<typeof interest>[],preview:boolean,author:Post['author']}){
 const {t}=useI18n();const navigate=useNavigate();const {topics}=useTopics();const {acting}=useFe();const [open,setOpen]=useState<string|null>(null);
 const own=author.id===acting?.id;
 const shown=open?list.find(j=>j.topicId===open):undefined;
 return <>{open&&<CompareSheet topicId={open} name={nameOf(author)} theirs={shown?asInterest(shown):undefined} onClose={()=>setOpen(null)}/>} <div className="testcard" style={{'--n':Math.min(4,list.length)} as React.CSSProperties} aria-label={t('fe.fd.myInterests')}>
  <b className="attachment-title">{t('fe.fd.myInterests')}</b>
  <Jars list={list.map(j=>({...j,vis:'public'}) as unknown as Interest)} topics={topics as never} onOpen={id=>{if(preview)return;if(own)navigate('/n/topics/'+id);else setOpen(id);}}/>
 </div></>;
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
 // Replies that did not go out stay under the list with «Повторить» (V21 retryComment); the same opId keeps a retry single.
 const [failed,setFailed]=useState<{opId:string,body:string,parentId?:string|undefined}[]>([]);
 // Top-level replies come in pages (V21 thPage): «Показать ещё N из M».
 const [limit,setLimit]=useState(REPLY_PAGE);
 const [likers,setLikers]=useState<MarksPage|null>(null);const [likersOpen,setLikersOpen]=useState(false);const [noteSub,setNoteSub]=useState(false);
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
  }catch(e){
   if(editing){toast(t('fe.fd.replyFailed')+' '+feErrorMessage(e,t),{type:'err'});opId.current=newOpId();}
   else{setFailed(l=>[...l,{opId:opId.current,body,parentId:target?.id}]);setText('');setTarget(null);opId.current=newOpId();requestAnimationFrame(()=>grow(box.current));toast(t('fe.w3.retry.toast'),{type:'err'});}
  }finally{setBusy(false);}
 };
 const retry=async(f:{opId:string,body:string,parentId?:string|undefined})=>{
  if(busy)return;setBusy(true);
  try{await call('reply.create',{opId:f.opId,postId:id,body:f.body,...(f.parentId?{parentId:f.parentId}:{})},okOnly);
   setFailed(l=>l.filter(x=>x.opId!==f.opId));setPost(p=>p&&{...p,replies:p.replies+1});await loadReplies();toast(t('fe.w3.retry.sent'),{type:'ok'});}
  catch(e){toast(t('fe.fd.replyFailed')+' '+feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 // «Нравится: …» (V21 likesLine): the first page of who liked it; people who keep likes private are only counted.
 const likes=post?.likes??0;
 useEffect(()=>{if(!likes){setLikers(null);return;}call('post.likers',{targetId:id},marksPage).then(setLikers).catch(()=>setLikers(null));},[call,id,likes]);
 const likesLine=()=>{if(!post||!likers||!post.likes)return null;const shown=likers.items.slice(0,3);const rest=Math.max(0,likers.total-shown.length);
  const names=shown.map(p=>p.id===acting?.id?t('fe.w3.likes.you'):personName(p)).join(', ');
  return <LikesLine people={shown.map(p=>({id:p.id,name:personName(p),avatar:p.avatar??null}))} onClick={()=>setLikersOpen(true)}
   text={names?t('fe.w3.likes.line',{names})+(rest?t('fe.w3.likes.more',{n:rest}):''):t('fe.w3.likes.count',{n:likers.total})}/>;};
 // «Следить за статьями» under someone's article (V21 noteSub): the real state comes from profile.get (`noteSub`).
 const noteAuthor=post?.type==='note'&&post.rev==null&&post.author.kind==='person'&&post.author.id!==acting?.id?post.author.id:null;
 useEffect(()=>{if(!noteAuthor)return;let live=true;
  call('profile.get',{profileId:noteAuthor},noteSubRes).then(r=>{if(live)setNoteSub(!!r.profile.noteSub);}).catch(()=>{});return ()=>{live=false;};},[call,noteAuthor]);
 const subNotes=async()=>{if(!post)return;const on=!noteSub;
  try{await call('noteSub.set',{opId:newOpId(),profileId:post.author.id,on},okOnly);setNoteSub(on);toast(on?t('fe.w3.noteSub.on',{name:nameOf(post.author)}):t('fe.w3.noteSub.off'),{type:on?'ok':'info'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}};
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
     {typeof notice==='string'&&notice&&<Alert kind="ok" className="mb12">{notice}</Alert>}
     <PostCard post={post} onChange={setPost} full onReply={focusBox} onExpired={()=>{call('post.get',{postId:id},onePost).then(r=>setPost(r.post)).catch(()=>{});}} onRemove={r=>{
      navigate('/n/feed',{replace:true});const undo=r.undo;
      toast(r.notice,{type:'ok',action:undo?{label:t('fe.tl.undo'),fn:()=>{undo().then(()=>navigate('/n/feed/post/'+id),e=>toast(feErrorMessage(e,t),{type:'err'}));}}:null});
     }}/>
     {likesLine()}
     {noteAuthor&&<ActionLine text={noteSub?t('fe.w3.noteSub.yes'):t('fe.w3.noteSub.text')}>
      <Btn size="sm" fit kind={noteSub?'soft':'primary'} pressed={noteSub} icon={noteSub?Check:Bell} onClick={subNotes}>{noteSub?t('fe.w3.noteSub.following'):t('fe.w3.noteSub.follow')}</Btn></ActionLine>}
     <SectionLabel id="replies">{plural(post.replies,['ответ','ответа','ответов'],['reply','replies'],locale)}</SectionLabel>
     {list.some(r=>!r.deleted)?<ReplyTree list={list} sort={sort} setSort={s=>{setSort(s);setLimit(REPLY_PAGE);}} open={open} setOpen={setOpen} liked={liked} delta={delta}
       onLike={likeReply} onReply={r=>{setEditing(null);setTarget(r);focusBox();}} onMore={setMenu} limit={limit} onPage={()=>setLimit(n=>n+REPLY_PAGE)}/>
      :!failed.length&&<button type="button" className="note-empty" onClick={focusBox}>{t('fe.feed.noReplies')}</button>}
     {failed.map(f=><Alert key={f.opId} kind="err" role="status" className="mt8" action={<Stack row gap={2}>
      <Btn size="sm" fit busy={busy} disabled={busy} onClick={()=>retry(f)}>{t('fe.w3.retry.again')}</Btn>
      <Btn size="sm" kind="text" fit onClick={()=>{setFailed(l=>l.filter(x=>x.opId!==f.opId));setText(f.body);focusBox();}}>{t('fe.w3.retry.edit')}</Btn></Stack>}>
      <b>{t('fe.w3.retry.notSent')}</b> {f.body.length>140?f.body.slice(0,140)+'…':f.body}</Alert>)}
    </>}
  </View>
  {post&&<div className="inputbar">
   {target&&<div className="reply-target"><span>{t('fe.fd.replyTo')} <b>{nameOf(target.author)}</b></span><IconBtn icon={X} size="sm" label={t('fe.fd.cancelReply')} onClick={()=>setTarget(null)}/></div>}
   {editing&&<div className="reply-target"><span>{t('fe.fd.editingReply')}</span><IconBtn icon={X} size="sm" label={t('fe.pm.cancel')} onClick={()=>{setEditing(null);setText('');}}/></div>}
   {acting&&<ActingAv p={acting} size="xs"/>}
   <TextArea bare ref={box} rows={1} maxLength={1000} value={text} onChange={e=>{setText(e.target.value);grow(e.target);}} placeholder={couple?t('fe.fd.replyPhCouple'):t('fe.fd.replyPh')} aria-label={couple?t('fe.fd.replyAsCouple'):t('fe.fd.reply')}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/>
   <IconBtn icon={SendHorizontal} kind="send" className={busy?'busy':undefined} onClick={send} disabled={busy||!text.trim()} label={couple?t('fe.fd.sendUs'):t('fe.feed.send')}/>
  </div>}
  {likersOpen&&<MarksSheet title={t('fe.w3.likers.title')} empty={t('fe.w3.likers.none')} first={likers} onClose={()=>setLikersOpen(false)}
   load={cursor=>call('post.likers',{targetId:id,...(cursor?{cursor}:{})},marksPage)}/>}
  {menu&&post&&<ReplyMenu reply={menu} postId={id} onClose={()=>setMenu(null)} onEdit={r=>{setMenu(null);setTarget(null);setEditing(r);setText(r.body??'');requestAnimationFrame(()=>{grow(box.current);focusBox();});}}
   onDone={msg=>{setMenu(null);if(msg)toast(msg,{type:'ok'});loadReplies();call('post.get',{postId:id},onePost).then(r=>setPost(r.post)).catch(()=>{});}}/>}
 </>;
}

const rootOf=(list:Reply[],id:string)=>{const by=new Map(list.map(r=>[r.id,r]));let c=by.get(id);const seen=new Set<string>();
 while(c?.parentId&&by.has(c.parentId)&&!seen.has(c.id)){seen.add(c.id);c=by.get(c.parentId);}return c?.id;};

/** Replies like Threads / X: a top-level reply with a thread line; every answer inside the branch hangs one step in,
 * deeper answers say whom they answer. A long branch shows two answers and «Ещё N ответов». */
const REPLY_PAGE=20;
function ReplyTree({list,sort,setSort,open,setOpen,liked,delta,onLike,onReply,onMore,limit,onPage}:{list:Reply[],sort:'top'|'new',setSort:(s:'top'|'new')=>void,open:string[],setOpen:(f:(o:string[])=>string[])=>void,
 liked:Set<string>,delta:Record<string,number>,onLike:(r:Reply)=>void,onReply:(r:Reply)=>void,onMore:(r:Reply)=>void,limit:number,onPage:()=>void}){
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
   <div className="cm-b">{hidden?<Note>{c.deleted?t('fe.feed.replyDeleted'):t('fe.fd.replyBlocked')}</Note>:<>
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
   <SelectRow solo label={t('fe.fd.sortAria')} value={sort} onChange={setSort} options={[['top',t('fe.fd.sortTop')],['new',t('fe.fd.sortNew')]] as const}/></div>}
  {ordered.slice(0,limit).map(root=>{const all=flat(root);const isOpen=open.includes(root.id)||all.length<=3;const shown=isOpen?all:all.slice(0,2);const rest=all.length-shown.length;
   return <div key={root.id} className={'th'+(all.length?' has-kids':'')}>{one(root,root,false)}
    {all.length>0&&<div className="cm-kids">{shown.map(c=>one(c,root,true))}
     {rest>0&&<button type="button" className="cm-more" onClick={()=>setOpen(o=>[...new Set([...o,root.id])])}>
      <span className="cm-avs">{[...new Map(all.slice(2).filter(c=>c.author).map(c=>[c.author!.id,c.author!])).values()].slice(0,3).map(a=><Av key={a.id} name={nameOf(a)} seed={a.id} size="xs" src={a.avatar}/>)}</span>
      {t('fe.fd.moreReplies',{n:plural(rest,['ответ','ответа','ответов'],['reply','replies'],locale)})}</button>}
     {isOpen&&all.length>3&&<button type="button" className="cm-more less" onClick={()=>setOpen(o=>o.filter(x=>x!==root.id))}>{t('fe.fd.collapse')}</button>}
    </div>}
   </div>;})}
  {ordered.length>limit&&<Btn kind="soft" className="mt8" onClick={onPage}>{t('fe.w3.replies.more',{n:Math.min(REPLY_PAGE,ordered.length-limit),m:ordered.length-limit})}</Btn>}
 </>;
}

/* ---------- F07: the composer (new / draft / edit) and F09: preview ---------- */

const saved=z.object({ok:z.literal(true),id:z.uuid()}).passthrough();
const published=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
const uploadIntent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const edited=z.object({ok:z.literal(true),state:z.string().optional(),rev:z.number().optional(),review:z.boolean().optional(),pending:z.unknown().optional()}).passthrough();
const noteSubRes=z.object({ok:z.literal(true),profile:z.object({noteSub:z.boolean().optional()}).passthrough()});
const followRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable()}).passthrough())});
type Audience='all'|'followers'|'granted'|'only';
const POLL_MAX=10,MEDIA_MAX=6,NOTE_MAX=10000;

/** V21 F07 in edit mode: the composer over an own post; the server decides whether the edit is live, goes to review or waits for the partner. */
export function EditPostScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [params]=useSearchParams();
 // `?saved=1` continues the saved edits of a published post (from «Мои публикации → Сохранённые правки»).
 const fromSaved=params.get('saved')==='1';
 const [post,setPost]=useState<Post|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{setError(null);
  Promise.all([call('post.get',{postId:id},onePost),fromSaved?call('me.posts',{},savedEditsRes):Promise.resolve(null)]).then(([r,m])=>{
   const e=m?.pendingEdits.find(x=>x.postId===id);setPost(e?withSavedEdits(r.post,e):r.post);}).catch(setError);
 },[call,id,fromSaved]);
 if(error||(post&&post.rev==null))return <><Bar title={t('fe.fd.editPost')} back small/><View>
  <Empty icon={Lock} title={t('fe.feed.unavailable')} {...(error?{text:feErrorMessage(error,t)}:{})}><Btn kind="soft" onClick={()=>navigate('/n/feed')}>{t('fe.feed.toFeed')}</Btn></Empty></View></>;
 if(!post)return <><Bar title={t('fe.fd.editPost')} back small/><View><Skel kind="card" rows={2}/></View></>;
 return <ComposeScreen edit={post} fromSaved={fromSaved}/>;
}

/** Saved edits of a published post (me.posts → pendingEdits): the post fields as saved, and their pictures. */
export const savedEdit=z.object({postId:z.uuid(),baseRev:z.number(),savedAt:z.string(),post:z.object({type:z.enum(['post','note']).optional(),title:z.string().optional(),body:z.string().optional(),
 audience:z.string().optional(),inFeed:z.boolean().optional(),topics:z.array(z.string()).optional(),mediaIds:z.array(z.string()).optional(),
 poll:z.object({question:z.string(),options:z.array(z.string())}).optional(),interests:z.array(z.string()).optional(),tags:z.array(z.string()).optional()}).passthrough(),media:z.array(media)});
export type SavedEdit=z.infer<typeof savedEdit>;
export const savedEditsRes=z.object({ok:z.literal(true),pendingEdits:z.array(savedEdit).default([])}).passthrough();
const withSavedEdits=(p:Post,e:SavedEdit):Post=>({...p,type:e.post.type??p.type,title:e.post.title??null,body:e.post.body??'',audience:e.post.audience??p.audience,inFeed:e.post.inFeed??p.inFeed,
 topics:e.post.topics??[],media:e.media,poll:e.post.poll?{question:e.post.poll.question,options:e.post.poll.options,myVote:null,results:null}:null,
 interests:(e.post.interests??[]).map(topicId=>({topicId})),tags:(e.post.tags??[]).map(id=>p.tags?.find(x=>x.id===id)??{id}),rev:e.baseRev});

type MediaDraft={id:string,preview:string,kind?:string|undefined,durationMs?:number|null|undefined};
type Person={id:string,name:string};
/** `mentionable`: the server says whether a mention by the acting profile reaches the person (their «Кто может
 * упоминать»); false — the name stays text and nobody is notified. */
type Mention={id:string,handle:string,name:string,avatar:string|null,mentionable?:boolean|undefined};
const mentionRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.unknown().optional(),mentionable:z.boolean().optional()}).passthrough())});
const thumbOf=(a:unknown):string|null=>{const src=(a as {src?:Record<string,string>|null}|null)?.src;return src?(src.thumb??src.card??null):null;};

/** A fresh form every time «Новая публикация» is opened (the same route again kept the old mode and text). */
export function ComposeScreen({edit,fromSaved}:{edit?:Post,fromSaved?:boolean}={}){const {key}=useLocation();return <ComposeForm key={edit?.id??key} edit={edit} fromSaved={!!fromSaved}/>;}
function ComposeForm({edit,fromSaved=false}:{edit?:Post|undefined,fromSaved?:boolean}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [params]=useSearchParams();const toast=useToast();
 const communityId=edit?null:params.get('community');const x=params.get('x');
 const {topics:catalog,cats,name:tname}=useTopics();const {items:myJars,topics:jarTopics}=useInterests();
 const draft=edit?.state==='draft';const live=!!edit&&!draft;
 const [note,setNote]=useState(edit?edit.type==='note':x==='note');
 const [title,setTitle]=useState(edit?.title??'');
 const [body,setBody]=useState(edit?.body??'');
 const [audience,setAudience]=useState<Audience>(()=>(['all','followers','granted','only'] as const).includes(edit?.audience as Audience)?edit!.audience as Audience:'all');
 const [inFeed,setInFeed]=useState(edit?.inFeed??true);
 const [media,setMedia]=useState<MediaDraft[]>(()=>edit?edit.media.map(m=>({id:m.id,preview:mediaSrc(m)??'',kind:m.kind,durationMs:m.durationMs})):[]);
 const [poll,setPoll]=useState<{question:string,options:string[]}|null>(()=>edit?.poll?{question:edit.poll.question,options:[...edit.poll.options]}:x==='poll'?{question:'',options:['','']}:null);
 const [interests,setInterests]=useState<string[]|null>(()=>edit?.interests?.length?edit.interests.map(i=>i.topicId):null);
 const [topics,setTopics]=useState<string[]>(edit?.topics??[]);
 const [people,setPeople]=useState<Person[]>(()=>(edit?.tags??[]).map(x=>({id:x.id,name:nameOf(x)})));
 // Wave 5 setAlbum: the gallery album of a post with photos (from the post, or the gallery's «+ Добавить»).
 const [album,setAlbum]=useState<string|null>(()=>edit?edit.albumId??null:params.get('album'));
 useEffect(()=>{if(edit&&edit.albumId===undefined&&acting)albumOfPost(call,acting.id,edit.id).then(v=>{if(v)setAlbum(v);}).catch(()=>{});},[edit,acting,call]);
 const [postId,setPostId]=useState<string|undefined>(draft?edit?.id:undefined);
 const [busy,setBusy]=useState<''|'publish'|'draft'>('');const [failure,setFailure]=useState('');const [errs,setErrs]=useState<Record<string,string>>({});
 const [uploading,setUploading]=useState(false);const file=useRef<HTMLInputElement>(null);const text=useRef<RichAreaHandle>(null);
 const [sheet,setSheet]=useState<'topics'|'people'|'mention'|null>(null);const [preview,setPreview]=useState(false);const [viewer,setViewer]=useState<number|null>(null);
 const ops=useRef({draft:newOpId(),publish:newOpId(),edit:newOpId()});
 const couple=acting?.kind==='couple';
 // What an attach button adds (a poll, interests, photos) appears below the text: bring it into view, or the tap
 // looks like it did nothing on a phone.
 const pollRef=useRef<HTMLElement>(null);const intRef=useRef<HTMLElement>(null);const mediaRef=useRef<HTMLDivElement>(null);
 const reveal=(el:HTMLElement|null)=>requestAnimationFrame(()=>el?.scrollIntoView({block:'nearest',behavior:'smooth'}));
 const hasPoll=!!poll,hasInts=interests!==null,nMedia=media.length;
 const first=useRef(true);
 useEffect(()=>{if(first.current)return;if(hasPoll)reveal(pollRef.current);},[hasPoll]);
 useEffect(()=>{if(first.current)return;if(hasInts)reveal(intRef.current);},[hasInts]);
 useEffect(()=>{if(first.current)return;if(nMedia)reveal(mediaRef.current);},[nMedia]);
 useEffect(()=>{first.current=false;},[]);
 useEffect(()=>{if(x==='media'&&!edit)setTimeout(()=>file.current?.click(),250);},[x,edit]);
 // Interests a post may carry: the author's own public ones with a level, never limits (server rule).
 const eligible=(myJars??[]).filter(j=>j.vis==='public'&&j.value!=null&&!j.mark&&catalog.find(c=>c.id===j.topicId)?.categoryId!=='limits');
 // Picked photos go through the kit uploader: format 4:5 / 1:1 / as is, crop, compression without metadata, progress.
 const [picked,setPicked]=useState<File[]|null>(null);const sendPhoto=useSendPhoto('post');const sendVideo=useSendVideo('post');
 const addMedia=(files:FileList)=>{setFailure('');setPicked([...files]);};
 const max=note?NOTE_MAX:1000;
 const fields=()=>({type:note?'note' as const:'post' as const,...(note&&title.trim()?{title:title.trim()}:{}),body:body.trim(),audience,inFeed,topics,mediaIds:media.map(m=>m.id),
  ...(poll?{poll:{question:poll.question.trim(),options:poll.options.map(o=>o.trim())}}:{}),interests:interests??[],tags:audience==='all'&&media.length?people.map(p=>p.id):[],...(communityId?{communityId}:{}),
  ...(album&&media.length&&!communityId&&(audience==='all'||audience==='followers')?{albumId:album}:{})});
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
 const done=(state:string|undefined,unheard:string[]=[])=>{
  const msg0=state==='review'?t('fe.fd.sentReview'):state==='pending_partner'?t('fe.fd.sentPartner'):!inFeed?t('fe.fd.publishedProfile'):t('fe.fd.published');
  const msg=unheard.length?msg0+' '+t('fe.w3.mention.unheard',{names:unheard.map(h=>'@'+h).join(', ')}):msg0;
  toast(msg,{type:unheard.length?'warn':'ok',action:{label:t('fe.fd.myPosts'),fn:()=>navigate('/n/me/posts')}});
  navigate(communityId?'/n/communities/'+communityId:state==='review'||state==='pending_partner'?'/n/me/posts':'/n/feed',{replace:true});
 };
 const publish=async()=>{
  if(busy||uploading||!validate())return;setBusy('publish');setFailure('');
  try{
   if(live){
    const r=await call('post.edit',{opId:ops.current.edit,postId:edit!.id,rev:edit!.rev!,post:fields()},edited);
    if(fromSaved)await call('post.discardEdits',{opId:newOpId(),postId:edit!.id},okOnly).catch(()=>{});
    const notice=r.pending!=null?t('fe.pm.ed.pending'):r.review?t('fe.pm.ed.review'):t('fe.pm.ed.saved');
    navigate('/n/feed/post/'+edit!.id,{replace:true,state:{notice}});return;
   }
   // V21 publishNow: people who limit mentions stay plain text and get no notification — say so. The server tells
   // whether each person takes a mention (`mentionable` in the picker and people lists); a nickname typed by hand is
   // looked up the same way before publishing.
   const asked=[...new Set([...body.matchAll(/(?:^|[\s(])@([a-z0-9_.]{2,30})/gi)].map(m=>m[1]!.toLowerCase()))].filter(h=>h!==acting?.handle?.toLowerCase());
   await Promise.all(asked.filter(h=>!known.current.has(h)).slice(0,5).map(h=>call('people.search',{q:h},mentionRes).then(r=>{
    const p=r.items.find(x=>x.handle?.toLowerCase()===h);if(p)known.current.set(h,p.kind==='person'&&p.mentionable!==false);}).catch(()=>{})));
   const unheard=asked.filter(h=>known.current.get(h)===false);
   const d=await call('post.saveDraft',{opId:ops.current.draft,...(postId?{postId}:{}),post:fields()},saved);setPostId(d.id);
   const r=await call('post.publish',{opId:ops.current.publish,postId:d.id},published);
   done(r.state,unheard);
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
 // V21 saveDraft on a live post: the changes are kept as «Сохранённые правки»; the published post stays as it is.
 const saveEdits=async():Promise<boolean>=>{
  if(busy||uploading||!live||!validate())return false;setBusy('draft');setFailure('');
  try{await call('post.saveEdits',{opId:ops.current.draft,postId:edit!.id,rev:edit!.rev!,post:fields()},okOnly);ops.current.draft=newOpId();clean.current=snap;
   toast(t('fe.w3.edits.saved'),{type:'ok',action:{label:t('fe.fd.open'),fn:()=>navigate('/n/me/posts')}});return true;}
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
 const barTitle=communityId?t(couple?'fe.cm.topicCouple':'fe.comm.newTopic'):draft?(note?t('fe.fd.noteDraft'):t('fe.fd.draft')):edit?(note?t('fe.fd.editNote'):t('fe.fd.editPost')):note?t('fe.fd.newNote'):t('fe.feed.new');
 const audSelect=(solo:boolean,icon?:LucideIcon)=><SelectRow solo={solo} {...(icon?{icon}:{})} label={t('fe.feed.audience')} value={audience} options={AUDS.map(a=>[a[0],a[2]] as const)}
  onChange={v=>{setAudience(v);if(v!=='all'&&people.length)toast(t('fe.fd.tagsNeedAll'),{type:'info'});}}/>;
 const err=(k:string)=>errs[k]?<div className="ferr">{errs[k]}</div>:null;
 // «Мои интересы» tapped before the profile's interests arrived waits for them instead of saying there are none.
 // The create sheet's «Мои интересы» (x=interests) opens the editor with them already attached.
 const [wantInts,setWantInts]=useState(x==='interests'&&!edit);
 const attachInterests=()=>{
  if(myJars===null){setWantInts(true);return;}setWantInts(false);
  if(!eligible.length){toast(t('fe.fd.noPublicInterests'),{type:'info',action:{label:t('fe.fd.open'),fn:()=>navigate('/n/me')}});return;}
  setInterests(eligible.slice(0,4).map(j=>j.topicId));};
 useEffect(()=>{if(wantInts&&myJars!==null&&catalog.length)attachInterests();});
 // A refusal (a limit, a server rule) is written under the form: bring it into view, never leave the tap silent.
 const failRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(failure)requestAnimationFrame(()=>failRef.current?.scrollIntoView({block:'center',behavior:'smooth'}));},[failure]);
 // V21 `mentionSuggest`: typing «@» (or the «Упомянуть» button) offers people — those the author follows, and from
 // two letters on, nickname search — and a pick writes «@nick ».
 const [sug,setSug]=useState<{start:number,end:number,q:string}|null>(null);
 const [folks,setFolks]=useState<Mention[]|null>(null);const [found,setFound]=useState<Mention[]>([]);
 const caret=(el:HTMLTextAreaElement)=>{
  const at=el.selectionStart??0;const m=el.value.slice(0,at).match(/(^|[\s(])@([a-z0-9_.]{0,30})$/i);
  if(!m||el.selectionStart!==el.selectionEnd){setSug(null);return;}
  setSug({start:at-m[2]!.length-1,end:at,q:m[2]!.toLowerCase()});
  if(folks===null&&acting){setFolks([]);call('profile.followers',{profileId:acting.id,following:true},mentionRes)
   .then(r=>setFolks(r.items.filter(p=>p.kind==='person'&&p.handle).map(p=>({id:p.id,handle:p.handle!,name:nameOf(p),avatar:null,mentionable:p.mentionable})))).catch(()=>{});}
 };
 useEffect(()=>{
  if(!sug||sug.q.length<2){setFound([]);return;}
  const id=setTimeout(()=>{call('people.search',{q:sug.q},mentionRes).then(r=>setFound(r.items.filter(p=>p.kind==='person'&&p.handle).map(p=>({id:p.id,handle:p.handle!,name:nameOf(p),avatar:thumbOf(p.avatar),mentionable:p.mentionable})))).catch(()=>setFound([]));},250);
  return ()=>clearTimeout(id);
 },[sug?.q,call]);
 const sugList=sug?[...new Map([...(folks??[]),...found].map(p=>[p.id,p])).values()]
  .filter(p=>!sug.q||p.handle.toLowerCase().startsWith(sug.q)||p.name.toLowerCase().startsWith(sug.q)).slice(0,5):[];
 // What the server said about each picked nickname (handle → takes a mention from the acting profile).
 const known=useRef(new Map<string,boolean>());
 const remember=(handle:string,mentionable:boolean|undefined)=>{if(mentionable===undefined)return;known.current.set(handle.toLowerCase(),mentionable);
  if(!mentionable)toast(t('fe.lo.mention.silentToast',{handle}),{type:'info'});};
 const pickMention=(p:Mention)=>{if(!sug)return;remember(p.handle,p.mentionable);const add='@'+p.handle+' ';const next=body.slice(0,sug.start)+add+body.slice(sug.end);setBody(next);setSug(null);
  const pos=sug.start+add.length;requestAnimationFrame(()=>{const el=text.current?.el;el?.focus();el?.setSelectionRange(pos,pos);});};
 // «Упомянуть» (V21 mentionPick): the sheet with people; a pick writes «@nick » where the caret was.
 const mentionAt=useRef<number|null>(null);
 const openMention=()=>{mentionAt.current=text.current?.el?.selectionStart??body.length;setSheet('mention');};
 const insertMention=(handle:string,mentionable?:boolean)=>{remember(handle,mentionable);const s=Math.min(mentionAt.current??body.length,body.length);const pre=body.slice(0,s);const add=(pre&&!/\s$/.test(pre)?' ':'')+'@'+handle+' ';
  setBody(pre+add+body.slice(s));setSheet(null);requestAnimationFrame(()=>{const el=text.current?.el;if(!el)return;el.focus();const p=s+add.length;el.setSelectionRange(p,p);});};

 if(preview){
  const fake:Post={id:edit?.id??'00000000-0000-7000-8000-000000000000',type:note?'note':'post',title:note?title.trim():null,body:body.trim(),author:{id:acting?.id??'',kind:acting?.kind??'person',handle:acting?.handle??null,name:acting?.name??nameOf(acting),avatar:acting?.avatar??null},
   media:media.map(m=>({id:m.id,kind:m.kind??'image',w:null,h:null,pending:false,blurred:false,src:{card:m.preview,full:m.preview},durationMs:m.durationMs??null})),topics,likes:0,liked:false,replies:0,saved:false,publishedAt:null,
   ...(audience!=='all'?{audience}:{}),poll:poll?{question:poll.question,options:poll.options,myVote:null,results:null}:null,interests:interests?.map(id=>{const j=eligible.find(e=>e.topicId===id);return {topicId:id,value:j?.value??null,dir:j?.dir};})??null,tags:[]};
  const steps=[people.length&&audience==='all'&&hasMedia?t('fe.fd.next.marks',{names:people.map(p=>p.name).join(', ')}):'',hasMedia?t('fe.fd.next.review'):'',hasMedia||people.length?(live?t('fe.fd.next.oldVersion'):t('fe.fd.next.onlyYou')):''].filter(Boolean);
  return <>
   <header className="bar"><IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={()=>setPreview(false)}/><H level={1} className="sm" tabIndex={-1}>{t('fe.fd.preview')}</H></header>
   <View className="nodock cta1">
    <Card className="preview-post k-preview-post"><PostCard post={fake} onChange={()=>{}} onRemove={()=>{}} full preview/></Card>
    {!communityId&&<Card list className="mt16">{audSelect(false,Eye)}</Card>}
    {steps.length>0&&<Card className="mt16 next-steps"><b>{t('fe.fd.next.title')}</b><ul>{steps.map(s=><li key={s}>{s}</li>)}</ul></Card>}
    {failure&&<Alert kind="err" className="mt12">{failure}</Alert>}
   </View>
   <div className="ctabar"><div className="wrap"><div className="row g8">
    <Btn kind="soft" fit onClick={()=>setPreview(false)}>{t('fe.fd.change')}</Btn>
    <Btn onClick={publish} disabled={!!busy||uploading} busy={busy==='publish'}>{cta}</Btn>
   </div></div></div>
  </>;
 }

 return <>
  <header className="bar"><IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={leave}/><H level={1} className="sm" tabIndex={-1}>{barTitle}</H>
   {!communityId&&!live&&<Btn kind="text" auto busy={busy==='draft'} disabled={!!busy} onClick={saveDraft}>{t('fe.fd.toDraft')}</Btn>}
   {!communityId&&live&&<Btn kind="text" auto busy={busy==='draft'} disabled={!!busy} onClick={()=>void saveEdits()}>{t('fe.w3.edits.save')}</Btn>}</header>
  <View className="nodock cta1">
   {note&&<div className="note-mode"><Chip on icon={FileText}>{t('fe.fd.article')}</Chip>
    <Btn kind="text" auto onClick={()=>{if(body.length>1000){toast(t('fe.fd.noteTooLong'),{type:'warn'});return;}setNote(false);}}>{t('fe.fd.makeRegular')}</Btn></div>}
   <Group><Card className="compose v14">
    {!communityId&&<div className="cmp-ctx"><div className="cmp-aud"><AudIcon/>{audSelect(true)}</div></div>}
    {who&&<p className="cmp-who">{who}</p>}
    {note&&<Field id="ntitle" label={t('fe.fd.title')} error={errs.title}><Input id="ntitle" invalid={!!errs.title} value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder={t('fe.fd.titlePh')}/></Field>}
    <Field error={errs.body}>
     <div className="mention-box k-anchor">
     <RichArea ref={text} invalid={!!errs.body} rows={note?10:6} maxLength={max} value={body} onValue={(v,el)=>{setBody(v);caret(el);}} autoFocus={!x}
      onKeyUp={e=>{if(e.key==='Escape')setSug(null);else if(e.key.startsWith('Arrow'))caret(e.currentTarget);}} onClick={e=>caret(e.currentTarget)} onBlur={()=>setTimeout(()=>setSug(null),200)}
      placeholder={note?(couple?t('fe.fd.notePhUs'):t('fe.fd.notePh')):poll?(couple?t('fe.fd.pollPhUs'):t('fe.fd.pollPh')):couple?t('fe.fd.composePhUs'):t('fe.fd.composePh')} aria-label={t('fe.fd.text')}/>
     {sug&&sugList.length>0&&<div className="mention-sug" role="listbox" aria-label={t('fe.fd.whoMention')}>{sugList.map(p=><button key={p.id} type="button" role="option" aria-selected={false}
      onMouseDown={e=>e.preventDefault()} onClick={()=>pickMention(p)}><Av name={p.name} seed={p.id} src={p.avatar} size="xs"/><span><b>{p.name}</b> <small>@{p.handle}{p.mentionable===false?' · '+t('fe.lo.mention.silent'):''}</small></span></button>)}</div>}
     </div>
     <Counter n={body.length} max={max}/>
    </Field>
    {hasMedia&&<div className="cmp-media" ref={mediaRef}><Group title={t('fe.fd.mediaN',{n:media.length,max:MEDIA_MAX})} foot={audience==='granted'?t('fe.fd.mediaGranted'):t('fe.fd.mediaFoot')}>
     <Card><div className="edit-ph">{media.map((m,i)=><div key={m.id}><img src={m.preview} alt=""/>{m.kind==='video'&&<VideoBadge durationMs={m.durationMs}/>}
      <button type="button" className="rm" aria-label={t('fe.fd.remove')} onClick={()=>setMedia(l=>l.filter(y=>y.id!==m.id))}><X/></button>
      <button type="button" className="vw" aria-label={t('fe.fd.view')} onClick={()=>setViewer(i)}/></div>)}
      {media.length<MEDIA_MAX&&<button type="button" aria-label={t('fe.fd.addMedia')} disabled={uploading} onClick={()=>file.current?.click()}><Plus/></button>}</div>
      {audience==='all'&&<Card list className="mt8"><Row icon={Users} tone="v" title={t('fe.fd.peopleInPhoto')} onClick={()=>setSheet('people')}
       sub={people.length?people.map(p=>p.name+(edit?.tags?.find(x=>x.id===p.id)?.state==='no'?` (${t('fe.fd.declinedShort')})`:edit?.tags?.find(x=>x.id===p.id)?.state==='ok'?'':` (${t('fe.fd.waitingShort')})`)).join(', '):t('fe.fd.peopleInPhotoSub')}/></Card>}
     </Card>
     </Group></div>}
    <FilePick ref={file} accept={'image/*,'+VIDEO_TYPES.join(',')} multiple onFiles={addMedia}/>
    <div className="attach v14">
     {!hasMedia&&<button type="button" disabled={uploading} onClick={()=>file.current?.click()}><ImageIcon/><span>{t('fe.feed.media')}</span></button>}
     {!poll&&<button type="button" onClick={()=>setPoll({question:'',options:['','']})}><ChartColumn/><span>{t('fe.feed.poll')}</span></button>}
     {!communityId&&!note&&<button type="button" onClick={()=>setNote(true)}><FileText/><span>{t('fe.fd.article')}</span></button>}
     <button type="button" onClick={openMention}><AtSign/><span>{t('fe.fd.mention')}</span></button>
     {interests===null&&!communityId&&<button type="button" title={t('fe.fd.myInterestsHint')} className={wantInts?'busy':undefined} aria-busy={wantInts||undefined} onClick={attachInterests}><Sparkles/><span>{t('fe.fd.myInterests')}</span></button>}
    </div>
   </Card>
   {!communityId&&!(audience==='granted'&&!inFeed)&&<Card list className="cmp-feed">
    <ToggleRow title={t('fe.feed.inFeed')} sub={inFeed?t('fe.feed.inFeedOn'):hasMedia?t('fe.fd.onlyProfileGallery'):t('fe.fd.onlyProfile')} on={inFeed} onClick={()=>setInFeed(v=>!v)}/>
   </Card>}
   {!communityId&&hasMedia&&(audience==='all'||audience==='followers')&&<AlbumField value={album} onChange={setAlbum} audience={audience} onNarrow={()=>setAudience('followers')}/>}
   {err('media')}
   </Group>
   {poll&&<section className="grp" ref={pollRef}><div className="grp-t"><span>{t('fe.fd.pollN',{n:poll.options.length,max:POLL_MAX})}</span><button type="button" onClick={()=>setPoll(null)}>{t('fe.fd.remove')}</button></div>
    <Card>
     <Field id="pollQ" label={t('fe.fd.question')} error={errs.pollQ}><Input id="pollQ" invalid={!!errs.pollQ} value={poll.question} maxLength={200} placeholder={t('fe.fd.questionPh')} onChange={e=>setPoll({...poll,question:e.target.value})}/></Field>
     {poll.options.map((o,i)=><div key={i} className={'field pollopt'+(errs['o'+i]?' err':'')}><div className="inwrap"><span className="n">{i+1}</span>
      <Input invalid={!!errs['o'+i]} value={o} maxLength={80} placeholder={t('fe.fd.option',{n:i+1})} aria-label={t('fe.fd.option',{n:i+1})} onChange={e=>setPoll({...poll,options:poll.options.map((v,k)=>k===i?e.target.value:v)})}/>
      {poll.options.length>2&&<IconBtn icon={X} kind="ghost" size="sm" label={t('fe.fd.removeOption')} onClick={()=>setPoll({...poll,options:poll.options.filter((_,k)=>k!==i)})}/>}</div></div>)}
     {poll.options.length<POLL_MAX&&<Btn kind="text" auto icon={Plus} onClick={()=>setPoll({...poll,options:[...poll.options,'']})}>{t('fe.fd.addOption')}</Btn>}
     {err('opts')}
    </Card>
    <p className="grp-n">{t('fe.fd.pollFoot')}{edit?.poll?' '+t('fe.fd.pollReset'):''}</p></section>}
   {interests!==null&&<section className="grp cmp-ints" ref={intRef}><div className="grp-t"><span>{t('fe.fd.interests')}</span><button type="button" onClick={()=>setInterests(null)}>{t('fe.fd.remove')}</button></div>
    <Card>
     {interests.length>0&&<div className="testcard"><Jars list={eligible.filter(j=>interests.includes(j.topicId))} topics={jarTopics} onOpen={()=>{}}/></div>}
     <Chips className="mt12">{eligible.map(j=>{const on=interests.includes(j.topicId);return <Chip key={j.topicId} on={on}
      onClick={()=>{if(!on&&interests.length>=4){toast(t('fe.fd.max4'),{type:'warn'});return;}setInterests(on?interests.filter(v=>v!==j.topicId):[...interests,j.topicId]);}}>{tname(j.topicId)}</Chip>;})}</Chips>
     {err('interests')}
    </Card>
    <p className="grp-n">{t('fe.fd.interestsFoot')}</p></section>}
   <Group title={t('fe.fd.topicsUpTo3')} foot={couple?t('fe.fd.topicsFootUs'):t('fe.fd.topicsFoot')}>
    <Chips>{[...new Set([...topics,...catalog.slice(0,4).map(c=>c.id)])].map(id=>{const on=topics.includes(id);return <Chip key={id} on={on}
     onClick={()=>{if(!on&&topics.length>=3){toast(t('fe.fd.max3'),{type:'warn'});return;}setTopics(on?topics.filter(v=>v!==id):[...topics,id]);}}>{tname(id)}</Chip>;})}
     {catalog.length>0&&<Chip more icon={Search} onClick={()=>setSheet('topics')}>{t('fe.br.seeAll')} · {catalog.length}</Chip>}</Chips>
   </Group>
   {failure&&<Alert kind="err" noIcon ref={failRef}>{failure}</Alert>}
  </View>
  <div className="ctabar"><div className="wrap"><div className="row g8">
   <Btn kind="soft" className="prevbtn" icon={Eye} fit aria-label={t('fe.fd.preview')} onClick={()=>{if(validate())setPreview(true);}}><span>{t('fe.fd.howSeen')}</span></Btn>
   <Btn onClick={publish} disabled={!!busy||uploading} busy={busy==='publish'}>{cta}</Btn>
  </div></div></div>
  {sheet==='topics'&&<FilterSheet title={t('fe.fd.topicsTitle')} max={3} topics={catalog} cats={cats} popular={topics} value={topics} onClose={()=>setSheet(null)}
   onApply={v=>{if(v.length>3){toast(t('fe.fd.max3'),{type:'warn'});return;}setTopics(v);setSheet(null);}}/>}
  {sheet==='mention'&&<MentionSheet onClose={()=>setSheet(null)} onPick={insertMention}/>}
  {sheet==='people'&&<PeopleSheet value={people} onClose={()=>setSheet(null)} onApply={v=>{setPeople(v);setSheet(null);}} locked={(edit?.tags??[]).filter(x=>x.state==='no').map(x=>x.id)}/>}
  {picked&&<Uploader files={picked} aspects={['4:5','1:1','orig']} max={MEDIA_MAX-media.length} send={sendPhoto} sendVideo={sendVideo} onClose={()=>setPicked(null)}
   onDone={got=>{setPicked(null);setMedia(m=>[...m,...got.map(g=>({id:g.id,preview:g.url,kind:g.kind,durationMs:g.durationMs}))]);setErrs(e=>{const {media:_m,...rest}=e;return rest;});}}/>}
  {viewer!==null&&<Viewer srcs={media.map(m=>m.preview)} index={viewer} onClose={()=>setViewer(null)}/>}
  {ask&&<LeaveAsk live={live} busy={!!busy} onCancel={()=>setAsk(false)} onDiscard={()=>{setAsk(false);back();}}
   onSave={async()=>{const ok=live?await saveEdits():await saveDraft();setAsk(false);if(ok)back();}}/>}
 </>;
}

function LeaveAsk({live,busy,onSave,onDiscard,onCancel}:{live:boolean,busy:boolean,onSave:()=>void,onDiscard:()=>void,onCancel:()=>void}){
 const {t}=useI18n();
 return <Ask icon={Pencil} tone="v" title={live?t('fe.fd.leave.editTitle'):t('fe.fd.leave.draftTitle')} text={live?t('fe.fd.leave.editText'):t('fe.fd.leave.draftText')}
  ok={live?t('fe.w3.edits.save'):t('fe.fd.leave.saveDraft')} busy={busy} onOk={onSave} onCancel={onCancel} cancel={t('fe.pm.cancel')}
  alt={{label:t('fe.fd.leave.discard'),onClick:onDiscard,danger:true}}/>;
}


/** `ACT.tagPeople` — mark people in the photos: the profiles the author follows; a person who declined stays marked
 * while the photos are the same. */
function PeopleSheet({value,locked,onClose,onApply}:{value:Person[],locked:string[],onClose:()=>void,onApply:(v:Person[])=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const [list,setList]=useState<Person[]|null>(null);const [sel,setSel]=useState(value);const [q,setQ]=useState('');
 useEffect(()=>{if(!acting)return;call('profile.followers',{profileId:acting.id,following:true},followRes)
  .then(r=>setList(r.items.filter(p=>p.kind==='person').map(p=>({id:p.id,name:nameOf(p)})))).catch(()=>setList([]));},[call,acting]);
 const low=q.trim().toLowerCase();const all=[...new Map([...value,...(list??[])].map(p=>[p.id,p])).values()].filter(p=>!low||p.name.toLowerCase().includes(low));
 return <Sheet full title={t('fe.fd.peopleInPhoto')} onClose={onClose} search={<SearchInput value={q} onChange={e=>setQ(e.target.value)} label={t('fe.fd.findPerson')}/>}
  foot={<Btn onClick={()=>onApply(sel)}>{sel.length?t('fe.w3.tag.doneN',{n:sel.length}):t('fe.fd.done')}</Btn>}>
   {list===null?<Skel kind="list"/>:!all.length?<Note>{t('fe.fd.noFollowingToMark')}</Note>
    :<Card list>{all.map(p=>{const on=sel.some(s=>s.id===p.id);const lock=locked.includes(p.id);
     return <Row key={p.id} pressed={on} noChev onClick={()=>{
      // V21 tagToggle: a person who declined stays marked while the photos are the same; ten people at most.
      if(lock){toast(t('fe.w3.tag.locked'),{type:'info'});return;}
      if(!on&&sel.length>=10){toast(t('fe.w3.tag.max'),{type:'warn'});return;}
      setSel(s=>on?s.filter(x=>x.id!==p.id):[...s,p]);}}
      av={<Av name={p.name} seed={p.id} size="sm"/>} title={p.name} sub={lock?t('fe.fd.lockedMark'):undefined} val={<span className={'ck'+(on?' on':'')}>{on&&<Check/>}</span>}/>;})}</Card>}
    <p className="grp-n">{t('fe.fd.marksFoot')}</p>
 </Sheet>;
}

/** V21 mentionPick — «Упомянуть»: people the author knows (follows or is followed by) and, from two letters, everyone
 * by name or nickname. Only people can be mentioned: a couple or a profile without a nickname says why. Someone who does
 * not take mentions from the author (server `mentionable`) is marked «без уведомления»: the name stays text. */
function MentionSheet({onClose,onPick}:{onClose:()=>void,onPick:(handle:string,mentionable?:boolean)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();
 const [near,setNear]=useState<Mention[]|null>(null);const [found,setFound]=useState<(Mention&{kind:string})[]>([]);const [q,setQ]=useState('');
 const folk=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.unknown().optional()}).passthrough())});
 useEffect(()=>{if(!acting)return;
  Promise.all([call('profile.followers',{profileId:acting.id,following:true},folk),call('profile.followers',{profileId:acting.id},folk)]).then(([a,b])=>
   setNear([...new Map([...a.items,...b.items].map(p=>[p.id,{id:p.id,handle:p.handle??'',name:nameOf(p),avatar:typeof p.avatar==='string'?p.avatar:thumbOf(p.avatar),kind:p.kind,mentionable:typeof p.mentionable==='boolean'?p.mentionable:undefined}])).values()] as (Mention&{kind:string})[])).catch(()=>setNear([]));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting]);
 const low=q.trim().toLowerCase().replace(/^@/,'');
 useEffect(()=>{if(low.length<2){setFound([]);return;}const id=setTimeout(()=>{call('people.search',{q:low},mentionRes).then(r=>setFound(r.items.map(p=>({id:p.id,handle:p.handle??'',name:nameOf(p),avatar:thumbOf(p.avatar),kind:p.kind,mentionable:p.mentionable})))).catch(()=>setFound([]));},250);
  return ()=>clearTimeout(id);},[low,call]);
 const match=(p:Mention)=>!low||p.handle.toLowerCase().startsWith(low)||p.name.toLowerCase().includes(low);
 const mine=(near??[]).filter(match) as (Mention&{kind:string})[];const known=new Set(mine.map(p=>p.id));const rest=found.filter(p=>!known.has(p.id));
 const issue=(p:Mention&{kind:string})=>p.kind==='couple'?t('fe.w3.mention.couple'):!p.handle?t('fe.w3.mention.noNick'):'';
 const row=(p:Mention&{kind:string})=>{const why=issue(p);return <Row key={p.id} noChev av={<Av name={p.name} seed={p.id} src={p.avatar} size="sm"/>} title={p.name}
  sub={why||'@'+p.handle+(p.mentionable===false?' · '+t('fe.lo.mention.silent'):'')}
  onClick={()=>{if(why){toast(why,{type:'info'});return;}onPick(p.handle,p.mentionable);}}/>;};
 return <Sheet full title={t('fe.fd.mention')} sub={t('fe.w3.mention.sub')} onClose={onClose} search={<SearchInput value={q} onChange={e=>setQ(e.target.value)} label={t('fe.w3.mention.find')}/>}>
  {near===null?<Skel kind="list"/>:<>
   {mine.length>0&&<Group title={t('fe.w3.mention.known')}><Card list>{mine.map(row)}</Card></Group>}
   {rest.length>0&&<Group title={t('fe.w3.mention.all')}><Card list>{rest.map(row)}</Card></Group>}
   {!mine.length&&!rest.length&&<Note className="sh-empty">{low.length<2?t('fe.w3.mention.type'):t('fe.br.nothing')}</Note>}</>}
 </Sheet>;
}

/** F10 «Сохранённые правки» of a published post: continue, publish, open the post, or discard them (asks first). */
export function SavedEditSheet({e,onClose,onDone}:{e:SavedEdit,onClose:()=>void,onDone:(notice:string)=>void}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [ask,setAsk]=useState(false);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const ops=useRef({pub:newOpId(),del:newOpId()});
 const publish=async()=>{if(busy)return;setBusy(true);setFailure('');
  try{const r=await call('post.publishEdits',{opId:ops.current.pub,postId:e.postId},edited);
   onDone(r.pending!=null?t('fe.pm.ed.pending'):r.review?t('fe.pm.ed.review'):t('fe.w3.edits.published'));}
  catch(err){setFailure(feErrorMessage(err,t));ops.current.pub=newOpId();}finally{setBusy(false);}};
 const discard=async()=>{if(busy)return;setBusy(true);setFailure('');
  try{await call('post.discardEdits',{opId:ops.current.del,postId:e.postId},okOnly);onDone(t('fe.w3.edits.discarded'));}
  catch(err){setFailure(feErrorMessage(err,t));ops.current.del=newOpId();}finally{setBusy(false);}};
 if(ask)return <Ask icon={Trash2} tone="l" danger title={t('fe.w3.edits.delTitle')} text={t('fe.w3.edits.delText')} ok={t('fe.w3.edits.delOk')} busy={busy} error={failure||undefined}
  onOk={discard} onCancel={()=>{setAsk(false);setFailure('');}}/>;
 return <Sheet title={t('fe.w3.edits.title')} sub={mdPlain(e.post.title||e.post.body||'').slice(0,80)} onClose={onClose}>
  <Card list>
   <Row noChev icon={SendHorizontal} title={t('fe.w3.edits.publish')} sub={t('fe.w3.edits.publishSub')} disabled={busy} onClick={publish}/>
   <Row noChev icon={Pencil} title={t('fe.w3.edits.continue')} onClick={()=>{onClose();navigate('/n/feed/post/'+e.postId+'/edit?saved=1');}}/>
   <Row noChev icon={Eye} title={t('fe.w3.edits.openPost')} onClick={()=>{onClose();navigate('/n/feed/post/'+e.postId);}}/>
   <Row noChev icon={Trash2} danger title={t('fe.w3.edits.discard')} onClick={()=>setAsk(true)}/>
  </Card>
  {failure&&<Alert kind="err" className="mt12">{failure}</Alert>}
 </Sheet>;
}
