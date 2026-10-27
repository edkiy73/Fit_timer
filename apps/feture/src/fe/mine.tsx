import {useCallback,useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,ChevronRight,LockOpen,Newspaper,Users,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Skel,View} from './ui';
import {useFe} from './session';
import {PostCard,postSchema,type Post} from './feed';
import {useToast} from './toast';
import {PairEntry} from './pair';

/** V21 X01 «Моё» (`meMineLayer()`): only lists — posts (drafts on the second line), events, followers, saved and what
 * others shared with me; each row opens its own screen (F10, E10, P10, G04, P07) with the counts from the server. */
const posts=z.object({ok:z.literal(true),items:z.array(postSchema)});
const ev=z.object({id:z.uuid(),title:z.string(),format:z.string(),starts_at:z.string(),state:z.string()}).passthrough();
const evs=z.object({ok:z.literal(true),going:z.array(ev),interested:z.array(ev),organizing:z.array(ev),applications:z.array(ev)}).passthrough();
const saved=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string(),created_at:z.string()}))});
const followers=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const who=z.object({id:z.uuid(),kind:z.string().optional(),handle:z.string().nullable(),name:z.string().nullable()}).nullable();
const withMe=z.object({ok:z.literal(true),items:z.array(z.object({scopes:z.array(z.string()),until:z.string().nullable(),profile:who}).passthrough())});
const outReqs=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),scopes:z.array(z.string()),state:z.string(),created_at:z.string(),profile:who}).passthrough())});
const nameOf=(p:z.infer<typeof who>)=>p?(p.name||(p.handle?'@'+p.handle:'?')):'—';

type Counts={posts:number,drafts:number,events:number,followers:number,following:number,saved:number,withMe:number,out:number};
export function MineLayer(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const location=useLocation();
 const [c,setC]=useState<Counts|null>(null);
 const notice=(location.state as {notice?:unknown}|null)?.notice;
 // Old links `?layer=mine&part=…` (after creating an event or a post) open the matching list screen.
 useEffect(()=>{const part=new URLSearchParams(location.search).get('part');if(part==='events'||part==='posts'||part==='saved')navigate('/n/me/'+part,{replace:true,state:location.state});},[location.search,location.state,navigate]);
 useEffect(()=>{if(!acting)return;const n=<T,>(p:Promise<T>,f:(r:T)=>number)=>p.then(f).catch(()=>0);
  Promise.all([call('me.posts',{},posts).then(r=>r.items).catch(()=>[] as Post[]),
   n(call('event.mine',{},evs),r=>new Set([...r.going,...r.interested,...r.organizing,...r.applications].map(e=>e.id)).size),
   n(call('profile.followers',{profileId:acting.id},followers),r=>r.items.length),n(call('profile.followers',{profileId:acting.id,following:true},followers),r=>r.items.length),
   n(call('saved.list',{},saved),r=>r.items.length),n(call('access.lists',{tab:'withme'},withMe),r=>r.items.length),
   n(call('access.lists',{tab:'out'},outReqs),r=>r.items.filter(x=>x.state==='pending').length)])
   .then(([p,events,fo,fi,sv,wm,out])=>setC({posts:p.filter(x=>x.state==='published').length,drafts:p.filter(x=>x.state==='draft').length,events,followers:fo,following:fi,saved:sv,withMe:wm,out}));
 },[call,acting]);
 if(!acting)return null;
 const cp=acting.kind==='couple';
 const row=(icon:typeof Users,title:string,to:string,val:string|null,sub?:string)=>{const Icon=icon;
  return <button type="button" className="li" onClick={()=>navigate(to)}><span className="ico"><Icon/></span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>{val!=null&&<span className="val">{val}</span>}<ChevronRight/></button>;};
 return <>
  {typeof notice==='string'&&notice&&<div className="alert ok mb12" role="status"><span>{notice}</span></div>}
  {!cp&&<PairEntry/>}
  {!c?<Skel kind="list" rows={5}/>:<section className="grp"><div className="card list">
   {row(Newspaper,cp?t('fe.mx.mine.postsUs'):t('fe.mx.mine.posts'),'/n/me/posts',String(c.posts),c.drafts?t('fe.mx.mine.drafts',{n:c.drafts}):'')}
   {row(Calendar,cp?t('fe.mx.mine.eventsUs'):t('fe.mx.mine.events'),'/n/me/events',String(c.events))}
   {row(Users,t('fe.mx.mine.follows'),'/n/me/follows?tab=followers',`${c.followers} · ${c.following}`)}
   {row(Bookmark,t('fe.mx.mine.saved'),'/n/me/saved',String(c.saved),cp?t('fe.mx.mine.savedSubUs'):'')}
   {row(LockOpen,cp?t('fe.mx.mine.sharedUs'):t('fe.mx.mine.shared'),'/n/me/shared',String(c.withMe),c.out?t(cp?'fe.mx.mine.outUs':'fe.mx.mine.out',{n:c.out}):t(cp?'fe.mx.mine.sharedSubUs':'fe.mx.mine.sharedSub'))}
  </div></section>}
 </>;
}

/** The screens behind the «Моё» rows: F10 posts, E10 events, G04 saved, P07 «Мне открыли». */
export function MinePartScreen({part}:{part:'posts'|'events'|'saved'|'shared'}){
 const {acting}=useFe();const {t}=useI18n();const cp=acting?.kind==='couple';
 const title=part==='posts'?(cp?t('fe.mx.mine.postsUs'):t('fe.mx.mine.posts')):part==='events'?(cp?t('fe.mx.mine.eventsUs'):t('fe.mx.mine.events')):part==='saved'?t('fe.mx.mine.saved'):(cp?t('fe.mx.mine.sharedUs'):t('fe.mx.mine.shared'));
 return <>
  <Bar title={title} back/>
  <View className="nodock">{part==='posts'?<MyPosts/>:part==='events'?<MyEvents/>:part==='saved'?<Saved/>:<Shared/>}</View>
 </>;
}

function Shared(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>Promise.all([call('access.lists',{tab:'withme'},withMe),call('access.lists',{tab:'out'},outReqs)]),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="list"/>;
 const [a,b]=data;const pending=b.items.filter(x=>x.state==='pending');
 const date=(u:string|null)=>u?t('fe.priv.until').replace('{date}',new Date(u).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'})):t('fe.priv.noTerm');
 if(!a.items.length&&!pending.length)return <Empty icon={LockOpen} title={t('fe.mx.mine.sharedEmpty')} text={t('fe.mx.mine.sharedEmptyText')}/>;
 return <>
  {a.items.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.mx.mine.sharedOpen')} · {a.items.length}</span></div><div className="card list">
   {a.items.map((g,i)=><button key={i} type="button" className="li" onClick={()=>g.profile&&navigate('/n/people/'+g.profile.id)}><Av name={nameOf(g.profile)} seed={g.profile?.id??String(i)} size="sm"/>
    <span className="tx"><b>{nameOf(g.profile)}</b><small>{g.scopes.map(s=>t('fe.priv.scope.'+s)).join(', ')} · {date(g.until)}</small></span><ChevronRight/></button>)}</div></section>}
  {pending.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.mx.mine.sharedPending')} · {pending.length}</span></div><div className="card list">
   {pending.map(r=><button key={r.id} type="button" className="li" onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}><Av name={nameOf(r.profile)} seed={r.profile?.id??r.id} size="sm"/>
    <span className="tx"><b>{nameOf(r.profile)}</b><small>{r.scopes.map(s=>t('fe.priv.scope.'+s)).join(', ')} · {t('fe.mx.mine.awaiting')}</small></span><ChevronRight/></button>)}</div></section>}
 </>;
}

function useLoad<T>(fn:()=>Promise<T>){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);fn().then(setData).catch(setError);},[fn]);
 useEffect(()=>{load();},[load]);
 return {data,setData,error,load};
}
function Failed({error,retry}:{error:unknown,retry:()=>void}){const {t}=useI18n();return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={retry}>{t('fe.retry')}</Btn></Empty>;}

function MyPosts(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const {data,setData,error,load}=useLoad(useCallback(()=>call('me.posts',{},posts),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="post"/>;
 if(!data.items.length)return <Empty icon={Newspaper} title={t('fe.mine.noPosts')} text={t('fe.mine.noPostsText')}><Btn kind="soft" onClick={()=>navigate('/n/feed/new')}>{t('fe.feed.new')}</Btn></Empty>;
 return <>{data.items.map(p=><PostCard key={p.id} post={p} onChange={(np:Post)=>setData(d=>d?{...d,items:d.items.map(x=>x.id===np.id?np:x)}:d)}
  onRemove={r=>{setData(d=>d?{...d,items:d.items.filter(x=>x.id!==r.postId)}:d);toast(r.notice,{type:'ok'});}}/>)}</>;
}

function MyEvents(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>call('event.mine',{},evs),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="post"/>;
 const groups:[string,z.infer<typeof ev>[]][]=[['going',data.going],['applications',data.applications],['interested',data.interested],['organizing',data.organizing]];
 if(groups.every(([,l])=>!l.length))return <Empty icon={Calendar} title={t('fe.mine.noEvents')} text={t('fe.mine.noEventsText')}/>;
 return <>{groups.filter(([,l])=>l.length).map(([k,l])=><section key={k} className="grp"><div className="grp-t"><span>{t('fe.mine.ev.'+k)}</span></div><div className="card list">
  {l.map(e=><button key={e.id} type="button" className="li" onClick={()=>navigate('/n/events/'+e.id)}>
   <span className="tx"><b>{e.title}</b><small>{new Date(e.starts_at).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}{e.state!=='published'?' · '+t('fe.mine.state.'+e.state):''}</small></span>
  </button>)}</div></section>)}</>;
}

function Saved(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>call('saved.list',{},saved),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="post"/>;
 if(!data.items.length)return <Empty icon={Bookmark} title={t('fe.mine.noSaved')} text={t('fe.mine.noSavedText')}/>;
 return <div className="card list">{data.items.map(s=><button key={s.kind+s.target_id} type="button" className="li" onClick={()=>navigate(s.kind==='event'?'/n/events/'+s.target_id:'/n/feed/post/'+s.target_id)}>
  <span className="ico"><Bookmark/></span><span className="tx"><b>{t('fe.mine.savedKind.'+s.kind)}</b><small>{new Date(s.created_at).toLocaleDateString()}</small></span>
 </button>)}</div>;
}
