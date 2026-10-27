import {useCallback,useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,ChevronRight,Clock,Globe,MessageCircle,Newspaper,Pencil,Plus,TriangleAlert,Users,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Bar,Btn,Empty,View,plate,Skel} from './ui';
import {useFe} from './session';
import {PostCard,postSchema,when,type Post} from './feed';
import {EventRow,type Ev} from './browse';
import {mdPlain} from './post-parts';
import {useToast} from './toast';

/** V21 X01 «Моё» (rows into F10, events, followers, G04), F10 «Мои публикации» and G04 «Сохранённое».
 * Drafts and «in review» are shown only here; everything comes from the server. */
const posts=z.object({ok:z.literal(true),items:z.array(postSchema),revisions:z.array(z.object({id:z.uuid(),post_id:z.uuid(),created_at:z.string()}).passthrough()).optional()});
const comm=z.object({id:z.uuid(),name:z.string(),state:z.string(),privacy:z.string(),role:z.string()});
const comms=z.object({ok:z.literal(true),hosting:z.array(comm),member:z.array(comm),requests:z.array(z.object({id:z.uuid(),community_id:z.uuid(),name:z.string()}))});
const ev=z.object({id:z.uuid(),title:z.string(),format:z.string(),starts_at:z.string(),state:z.string()}).passthrough();
const evs=z.object({ok:z.literal(true),going:z.array(ev),interested:z.array(ev),organizing:z.array(ev),applications:z.array(ev)}).passthrough();
const savedRes=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string(),created_at:z.string()}))});
const followRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid()}).passthrough())});
const onePost=z.object({ok:z.literal(true),post:postSchema});
const oneEvent=z.object({ok:z.literal(true),event:z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),startsAt:z.string(),state:z.string()}).passthrough()});
const okOnly=z.object({ok:z.literal(true)}).passthrough();

function useLoad<T>(fn:()=>Promise<T>){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);fn().then(setData).catch(setError);},[fn]);
 useEffect(()=>{load();},[load]);
 return {data,setData,error,load};
}
function Failed({error,retry}:{error:unknown,retry:()=>void}){const {t}=useI18n();return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={retry}>{t('fe.retry')}</Btn></Empty>;}

/* ---------- X01 «Моё» ---------- */

type Part='events'|'communities';
export function MineLayer(){
 const {call,acting}=useFe();const {t}=useI18n();const location=useLocation();const navigate=useNavigate();
 // `?part=` opens a section directly (create screens send people back here); a create screen passes what happened as `state.notice`.
 const part=(['events','communities'] as const).find(p=>p===new URLSearchParams(location.search).get('part'))??null;
 const notice=(location.state as {notice?:unknown}|null)?.notice;
 const couple=acting?.kind==='couple';
 const [n,setN]=useState<{posts:number,drafts:number,going:number,followers:number,following:number,saved:number}|null>(null);
 useEffect(()=>{if(!acting)return;let live=true;
  Promise.all([call('me.posts',{},posts),call('event.mine',{},evs),call('profile.followers',{profileId:acting.id},followRes),call('profile.followers',{profileId:acting.id,following:true},followRes),call('saved.list',{},savedRes)])
   .then(([p,e,a,b,s])=>{if(live)setN({posts:p.items.filter(x=>x.state==='published').length,drafts:p.items.filter(x=>x.state==='draft').length,going:e.going.length,followers:a.items.length,following:b.items.length,saved:s.items.length});})
   .catch(()=>{});return ()=>{live=false;};},[call,acting]);
 const val=(v:number|undefined)=><span className="val">{n?String(v):''}</span>;
 const setPart=(p:Part|null)=>navigate(p?'/n/me?layer=mine&part='+p:'/n/me?layer=mine',{replace:true});
 return <>
  {typeof notice==='string'&&notice&&<div className="alert ok mb12" role="status"><span>{notice}</span></div>}
  <section className="grp"><div className="card list">
   <button type="button" className="li" onClick={()=>navigate('/n/me/posts')}><span className="ico"><Newspaper/></span>
    <span className="tx"><b>{couple?t('fe.fd.x.postsUs'):t('fe.fd.x.posts')}</b>{n&&n.drafts>0&&<small>{t('fe.fd.x.drafts',{n:n.drafts})}</small>}</span>{val(n?.posts)}<ChevronRight/></button>
   <button type="button" className="li" aria-expanded={part==='events'} onClick={()=>setPart(part==='events'?null:'events')}><span className="ico"><Calendar/></span>
    <span className="tx"><b>{couple?t('fe.fd.x.eventsUs'):t('fe.fd.x.events')}</b></span>{val(n?.going)}<ChevronRight/></button>
   <button type="button" className="li" aria-expanded={part==='communities'} onClick={()=>setPart(part==='communities'?null:'communities')}><span className="ico"><Globe/></span>
    <span className="tx"><b>{t('fe.fd.x.comms')}</b></span><ChevronRight/></button>
   <button type="button" className="li" onClick={()=>navigate('/n/me/follows?tab=followers')}><span className="ico"><Users/></span>
    <span className="tx"><b>{t('fe.fd.x.follows')}</b></span><span className="val">{n?`${n.followers} · ${n.following}`:''}</span><ChevronRight/></button>
   <button type="button" className="li" onClick={()=>navigate('/n/me/saved')}><span className="ico"><Bookmark/></span>
    <span className="tx"><b>{t('fe.fd.x.saved')}</b>{couple&&<small>{t('fe.fd.x.savedUs')}</small>}</span>{val(n?.saved)}<ChevronRight/></button>
  </div></section>
  {part==='events'&&<MyEvents/>}
  {part==='communities'&&<MyCommunities/>}
 </>;
}

function MyCommunities(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>call('community.mine',{},comms),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="list"/>;
 const all=[...data.hosting,...data.member];
 if(!all.length&&!data.requests.length)return <Empty icon={Globe} title={t('fe.mine.noComms')} text={t('fe.mine.noCommsText')}><Btn kind="soft" onClick={()=>navigate('/n/communities')}>{t('fe.mine.toCatalog')}</Btn></Empty>;
 return <section className="grp"><div className="grp-t"><span>{t('fe.fd.x.comms')} · {all.length+data.requests.length}</span></div><div className="card list">
  {all.map(c=><button key={c.id} type="button" className="li" onClick={()=>navigate('/n/communities/'+c.id)}>
   <span className="av sm" style={{position:'relative'}}><div className="plate" style={plate(c.id)}/></span>
   <span className="tx"><b>{c.name}</b><small>{t('fe.mine.role.'+c.role)}{c.state!=='published'?' · '+t('fe.mine.state.'+c.state):''}</small></span><ChevronRight/>
  </button>)}
  {data.requests.map(r=><button key={r.id} type="button" className="li" onClick={()=>navigate('/n/communities/'+r.community_id)}>
   <span className="av sm" style={{position:'relative'}}><div className="plate" style={plate(r.community_id)}/></span><span className="tx"><b>{r.name}</b><small>{t('fe.comm.requested')}</small></span><ChevronRight/>
  </button>)}
 </div></section>;
}

function MyEvents(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>call('event.mine',{},evs),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="list"/>;
 const groups:[string,z.infer<typeof ev>[]][]=[['going',data.going],['applications',data.applications],['interested',data.interested],['organizing',data.organizing]];
 if(groups.every(([,l])=>!l.length))return <Empty icon={Calendar} title={t('fe.mine.noEvents')} text={t('fe.mine.noEventsText')}/>;
 return <>{groups.filter(([,l])=>l.length).map(([k,l])=><section key={k} className="grp"><div className="grp-t"><span>{t('fe.mine.ev.'+k)} · {l.length}</span></div><div className="card list">
  {l.map(e=><button key={e.id} type="button" className="li" onClick={()=>navigate('/n/events/'+e.id)}>
   <span className="ico"><Calendar/></span>
   <span className="tx"><b>{e.title}</b><small>{new Date(e.starts_at).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}{e.state!=='published'?' · '+t('fe.mine.state.'+e.state):''}</small></span><ChevronRight/>
  </button>)}</div></section>)}</>;
}

/* ---------- F10 «Мои публикации» ---------- */

export function MyPostsScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const couple=acting?.kind==='couple';
 const {data,setData,error,load}=useLoad(useCallback(()=>call('me.posts',{},posts),[call]));
 const replace=(np:Post)=>setData(d=>d?{...d,items:d.items.map(x=>x.id===np.id?np:x)}:d);
 const card=(p:Post)=><PostCard key={p.id} post={p} onChange={replace} onExpired={()=>{call('post.get',{postId:p.id},onePost).then(r=>replace(r.post)).catch(()=>{});}}
  onRemove={r=>{setData(d=>d?{...d,items:d.items.filter(x=>x.id!==r.postId)}:d);toast(r.notice,{type:'ok'});}}/>;
 const row=(p:Post,icon:typeof Pencil,sub:string)=>{const I=icon;return <button key={p.id} type="button" className="li" onClick={()=>navigate('/n/feed/post/'+p.id+'/edit')}>
  <span className="ico"><I/></span><span className="tx"><b>{mdPlain(p.title||p.body).slice(0,60)||t('fe.fd.mine.noText')}</b><small>{sub}</small></span><ChevronRight/></button>;};
 let body;
 if(error)body=<Failed error={error} retry={load}/>;
 else if(!data)body=<Skel kind="post" rows={2}/>;
 else{
  const drafts=data.items.filter(x=>x.state==='draft'&&!x.returned),returned=data.items.filter(x=>x.state==='draft'&&x.returned);
  const review=data.items.filter(x=>x.state==='review'),pub=data.items.filter(x=>x.state==='published');
  const revIds=new Set((data.revisions??[]).map(r=>r.post_id));const revs=pub.filter(x=>revIds.has(x.id));
  body=!data.items.length?<Empty icon={Newspaper} title={couple?t('fe.fd.mine.emptyUs'):t('fe.fd.mine.empty')} text={couple?t('fe.fd.mine.emptyTextUs'):t('fe.fd.mine.emptyText')}>
    <Btn onClick={()=>navigate('/n/feed/new')}>{couple?t('fe.fd.mine.createUs'):t('fe.fd.mine.create')}</Btn></Empty>
   :<>
    {returned.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.mine.returned',{n:returned.length})}</span></div><div className="card list">{returned.map(p=>row(p,TriangleAlert,t('fe.fd.mine.returnedSub')))}</div></section>}
    {drafts.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.mine.drafts',{n:drafts.length})}</span></div><div className="card list">{drafts.map(p=>row(p,Pencil,t('fe.fd.mine.editedAt',{when:when(p.editedAt??p.publishedAt,locale)||'—'})))}</div></section>}
    {revs.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.mine.revisions',{n:revs.length})}</span></div><div className="card list">{revs.map(p=><button key={p.id} type="button" className="li" onClick={()=>navigate('/n/feed/post/'+p.id)}>
     <span className="ico"><Clock/></span><span className="tx"><b>{mdPlain(p.title||p.body).slice(0,60)||t('fe.fd.mine.noText')}</b><small>{t('fe.fd.mine.revisionsSub')}</small></span><ChevronRight/></button>)}</div></section>}
    {review.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.mine.review',{n:review.length})}</span></div><div className="posts">{review.map(card)}</div></section>}
    {pub.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.fd.mine.published',{n:pub.length})}</span></div><div className="posts">{pub.map(card)}</div></section>}
   </>;
 }
 return <>
  <Bar title={couple?t('fe.fd.mine.titleUs'):t('fe.fd.mine.title')} back small><button type="button" className="ibtn" aria-label={t('fe.create')} onClick={()=>navigate('/n/feed/new')}><Plus/></button></Bar>
  <View className="nodock">{body}</View>
 </>;
}

/* ---------- G04 «Сохранённое» ---------- */

type SavedItem={kind:string,id:string};
export function SavedScreen(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [list,setList]=useState<{posts:Post[],events:Ev[],discussions:Post[],gone:number}|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);
  call('saved.list',{},savedRes).then(async r=>{
   const items:SavedItem[]=r.items.map(x=>({kind:x.kind,id:x.target_id}));
   // Each saved thing is fetched as the viewer may see it now; what is gone (deleted, hidden, blocked) is counted, not shown.
   const got=await Promise.all(items.map(async it=>{
    try{
     if(it.kind==='event'){const e=(await call('event.get',{eventId:it.id},oneEvent)).event;return {it,ev:{id:e.id,title:e.title,kind:e.kind,format:e.format,area:e.area,starts_at:e.startsAt,state:e.state} as Ev};}
     if(it.kind==='post'||it.kind==='discussion')return {it,post:(await call('post.get',{postId:it.id},onePost)).post};
    }catch{/* no longer visible */}
    return {it};
   }));
   setList({posts:got.filter(g=>g.it.kind==='post'&&g.post).map(g=>g.post!),discussions:got.filter(g=>g.it.kind==='discussion'&&g.post).map(g=>g.post!),
    events:got.filter(g=>g.ev).map(g=>g.ev!),gone:got.filter(g=>!g.ev&&!g.post&&g.it.kind!=='topic').length});
  }).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const replace=(np:Post)=>{
  if(!np.saved){
   // Unsaved here: the post leaves the list with «Вернуть».
   setList(l=>l&&{...l,posts:l.posts.filter(x=>x.id!==np.id)});
   toast(t('fe.fd.sv.removed'),{action:{label:t('fe.tl.undo'),fn:()=>{call('saved.set',{opId:newOpId(),kind:'post',targetId:np.id,on:true},okOnly).then(load,e=>toast(feErrorMessage(e,t),{type:'err'}));}}});
   return;
  }
  setList(l=>l&&{...l,posts:l.posts.map(x=>x.id===np.id?np:x)});
 };
 let body;
 if(error)body=<Failed error={error} retry={load}/>;
 else if(!list)body=<Skel kind="post" rows={2}/>;
 else if(!list.posts.length&&!list.events.length&&!list.discussions.length)body=<Empty icon={Bookmark} title={t('fe.fd.sv.empty')} text={t('fe.fd.sv.emptyText')}/>;
 else body=<>
  {list.events.length>0&&<div className="grp"><div className="grp-t"><span>{t('fe.fd.sv.events',{n:list.events.length})}</span></div>{list.events.map((e,i)=><div key={e.id} style={i?{marginTop:8}:undefined}><EventRow e={e}/></div>)}</div>}
  {list.posts.length>0&&<div className="grp"><div className="grp-t"><span>{t('fe.fd.sv.posts',{n:list.posts.length})}</span></div><div className="posts">{list.posts.map(p=><PostCard key={p.id} post={p} onChange={replace}
   onRemove={r=>setList(l=>l&&{...l,posts:l.posts.filter(x=>x.id!==r.postId&&x.author.id!==r.authorId)})}/>)}</div></div>}
  {list.discussions.length>0&&<div className="grp"><div className="grp-t"><span>{t('fe.fd.sv.discussions',{n:list.discussions.length})}</span></div><div className="card list">
   {list.discussions.map(d=><button key={d.id} type="button" className="li" onClick={()=>navigate('/n/feed/post/'+d.id)}><span className="ico"><MessageCircle/></span>
    <span className="tx"><b>{d.title||mdPlain(d.body).slice(0,60)}</b></span><ChevronRight/></button>)}</div></div>}
  {list.gone>0&&<p className="note mt12">{t('fe.fd.sv.gone',{n:list.gone})}</p>}
 </>;
 return <>
  <Bar title={t('fe.fd.sv.title')} back small/>
  <View className="nodock">{body}</View>
 </>;
}
