import {useCallback,useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,Clock,LockOpen,MessageCircle,Newspaper,Pencil,Plus,TriangleAlert,Users,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Empty,Group,IconBtn,Note,Row,Skel,Stack,View} from './kit';
import {useFe} from './session';
import {PostCard,SavedEditSheet,postSchema,savedEdit,when,type Post,type SavedEdit} from './feed';
import {EventRow,type Ev} from './browse';
import {mdPlain} from './post-parts';
import {useToast} from './toast';
import {PairEntry} from './pair';
import {faceFields,NameBadges} from './faces';

/** V21 X01 «Моё» (`meMineLayer()`): only lists — posts (drafts on the second line), events, followers, saved and what
 * others shared with me; each row opens its own screen (F10, E10, P10, G04, P07) with the counts from the server. */
const posts=z.object({ok:z.literal(true),items:z.array(postSchema)});
const ev=z.object({id:z.uuid(),title:z.string(),format:z.string(),starts_at:z.string(),state:z.string()}).passthrough();
const evs=z.object({ok:z.literal(true),going:z.array(ev),interested:z.array(ev),organizing:z.array(ev),applications:z.array(ev)}).passthrough();
const saved=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string(),created_at:z.string()}))});
const followers=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const who=z.object({id:z.uuid(),kind:z.string().optional(),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).nullable();
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
 const row=(icon:typeof Users,title:string,to:string,val:string|null,sub?:string)=><Row icon={icon} title={title} sub={sub||undefined} val={val} onClick={()=>navigate(to)}/>;
 return <>
  {typeof notice==='string'&&notice&&<Alert kind="ok" noIcon className="mb12">{notice}</Alert>}
  {!cp&&<PairEntry/>}
  {!c?<Skel kind="list" rows={5}/>:<Group><Card list>
   {row(Newspaper,cp?t('fe.mx.mine.postsUs'):t('fe.mx.mine.posts'),'/n/me/posts',String(c.posts),c.drafts?t('fe.mx.mine.drafts',{n:c.drafts}):'')}
   {row(Calendar,cp?t('fe.mx.mine.eventsUs'):t('fe.mx.mine.events'),'/n/me/events',String(c.events))}
   {row(Users,t('fe.mx.mine.follows'),'/n/me/follows?tab=followers',`${c.followers} · ${c.following}`)}
   {row(Bookmark,t('fe.mx.mine.saved'),'/n/me/saved',String(c.saved),cp?t('fe.mx.mine.savedSubUs'):'')}
   {row(LockOpen,cp?t('fe.mx.mine.sharedUs'):t('fe.mx.mine.shared'),'/n/me/shared',String(c.withMe),c.out?t(cp?'fe.mx.mine.outUs':'fe.mx.mine.out',{n:c.out}):t(cp?'fe.mx.mine.sharedSubUs':'fe.mx.mine.sharedSub'))}
  </Card></Group>}
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
  {a.items.length>0&&<Group title={<>{t('fe.mx.mine.sharedOpen')} · {a.items.length}</>}><Card list>
   {a.items.map((g,i)=><Row key={i} onClick={()=>g.profile&&navigate('/n/people/'+g.profile.id)} av={<Av name={nameOf(g.profile)} seed={g.profile?.id??String(i)} size="sm" src={g.profile?.avatar}/>}
    title={<>{nameOf(g.profile)}<NameBadges p={g.profile}/></>} sub={<>{g.scopes.map(s=>t('fe.priv.scope.'+s)).join(', ')} · {date(g.until)}</>}/>)}</Card></Group>}
  {pending.length>0&&<Group title={<>{t('fe.mx.mine.sharedPending')} · {pending.length}</>}><Card list>
   {pending.map(r=><Row key={r.id} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)} av={<Av name={nameOf(r.profile)} seed={r.profile?.id??r.id} size="sm" src={r.profile?.avatar}/>}
    title={<>{nameOf(r.profile)}<NameBadges p={r.profile}/></>} sub={<>{r.scopes.map(s=>t('fe.priv.scope.'+s)).join(', ')} · {t('fe.mx.mine.awaiting')}</>}/>)}</Card></Group>}
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
 return <>{groups.filter(([,l])=>l.length).map(([k,l])=><Group key={k} title={t('fe.mine.ev.'+k)}><Card list>
  {l.map(e=><Row key={e.id} noChev onClick={()=>navigate('/n/events/'+e.id)} title={e.title}
   sub={new Date(e.starts_at).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+(e.state!=='published'?' · '+t('fe.mine.state.'+e.state):'')}/>)}</Card></Group>)}</>;
}

function Saved(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>call('saved.list',{},saved),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="post"/>;
 if(!data.items.length)return <Empty icon={Bookmark} title={t('fe.mine.noSaved')} text={t('fe.mine.noSavedText')}/>;
 return <Card list>{data.items.map(s=><Row key={s.kind+s.target_id} icon={Bookmark} noChev onClick={()=>navigate(s.kind==='event'?'/n/events/'+s.target_id:'/n/feed/post/'+s.target_id)}
  title={t('fe.mine.savedKind.'+s.kind)} sub={new Date(s.created_at).toLocaleDateString()}/>)}</Card>;
}

// F10 / G04 (screens behind «Мои публикации» and «Сохранённое»).
const postsRev=z.object({ok:z.literal(true),items:z.array(postSchema),revisions:z.array(z.object({id:z.uuid(),post_id:z.uuid(),created_at:z.string()}).passthrough()).optional(),
 pendingEdits:z.array(savedEdit).optional()});
const savedRes=saved;
const onePost=z.object({ok:z.literal(true),post:postSchema});
const oneEvent=z.object({ok:z.literal(true),event:z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),startsAt:z.string(),state:z.string()}).passthrough()});

/* ---------- F10 «Мои публикации» ---------- */

export function MyPostsScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const couple=acting?.kind==='couple';
 const {data,setData,error,load}=useLoad(useCallback(()=>call('me.posts',{},postsRev),[call]));
 const [edits,setEdits]=useState<SavedEdit|null>(null);
 const replace=(np:Post)=>setData(d=>d?{...d,items:d.items.map(x=>x.id===np.id?np:x)}:d);
 const card=(p:Post)=><PostCard key={p.id} post={p} onChange={replace} onExpired={()=>{call('post.get',{postId:p.id},onePost).then(r=>replace(r.post)).catch(()=>{});}}
  onRemove={r=>{setData(d=>d?{...d,items:d.items.filter(x=>x.id!==r.postId)}:d);toast(r.notice,{type:'ok'});}}/>;
 const row=(p:Post,icon:typeof Pencil,sub:string)=><Row key={p.id} icon={icon} title={mdPlain(p.title||p.body).slice(0,60)||t('fe.fd.mine.noText')} sub={sub} onClick={()=>navigate('/n/feed/post/'+p.id+'/edit')}/>;
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
    {returned.length>0&&<Group title={t('fe.fd.mine.returned',{n:returned.length})}><Card list>{returned.map(p=>row(p,TriangleAlert,t('fe.fd.mine.returnedSub')))}</Card></Group>}
    {drafts.length>0&&<Group title={t('fe.fd.mine.drafts',{n:drafts.length})}><Card list>{drafts.map(p=>row(p,Pencil,t('fe.fd.mine.editedAt',{when:when(p.editedAt??p.publishedAt,locale)||'—'})))}</Card></Group>}
    {(data.pendingEdits??[]).length>0&&<Group title={t('fe.w3.edits.group',{n:data.pendingEdits!.length})}><Card list>{data.pendingEdits!.map(e=><Row key={e.postId} icon={Pencil}
     title={mdPlain(e.post.title||e.post.body||'').slice(0,60)||t('fe.fd.mine.noText')} sub={t('fe.w3.edits.sub',{when:when(e.savedAt,locale)})} onClick={()=>setEdits(e)}/>)}</Card></Group>}
    {revs.length>0&&<Group title={t('fe.fd.mine.revisions',{n:revs.length})}><Card list>{revs.map(p=><Row key={p.id} icon={Clock} title={mdPlain(p.title||p.body).slice(0,60)||t('fe.fd.mine.noText')} sub={t('fe.fd.mine.revisionsSub')}
     onClick={()=>navigate('/n/feed/post/'+p.id)}/>)}</Card></Group>}
    {review.length>0&&<Group title={t('fe.fd.mine.review',{n:review.length})}><div className="posts">{review.map(card)}</div></Group>}
    {pub.length>0&&<Group title={t('fe.fd.mine.published',{n:pub.length})}><div className="posts">{pub.map(card)}</div></Group>}
   </>;
 }
 return <>
  <Bar title={couple?t('fe.fd.mine.titleUs'):t('fe.fd.mine.title')} back small><IconBtn icon={Plus} label={t('fe.create')} onClick={()=>navigate('/n/feed/new')}/></Bar>
  <View className="nodock">{body}</View>
  {edits&&<SavedEditSheet e={edits} onClose={()=>setEdits(null)} onDone={msg=>{setEdits(null);toast(msg,{type:'ok'});load();}}/>}
 </>;
}

/* ---------- G04 «Сохранённое» ---------- */

type SavedItem={kind:string,id:string};
export function SavedScreen(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
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
  // Unsaved here: the post leaves the list; the card's own toast offers «Вернуть», which saves it again and brings it back.
  if(!np.saved){setList(l=>l&&{...l,posts:l.posts.filter(x=>x.id!==np.id)});return;}
  if(!list?.posts.some(x=>x.id===np.id)){load();return;}
  setList(l=>l&&{...l,posts:l.posts.map(x=>x.id===np.id?np:x)});
 };
 let body;
 if(error)body=<Failed error={error} retry={load}/>;
 else if(!list)body=<Skel kind="post" rows={2}/>;
 else if(!list.posts.length&&!list.events.length&&!list.discussions.length)body=<Empty icon={Bookmark} title={t('fe.fd.sv.empty')} text={t('fe.fd.sv.emptyText')}/>;
 else body=<>
  {list.events.length>0&&<Group title={t('fe.fd.sv.events',{n:list.events.length})}><Stack gap={2}>{list.events.map(e=><div key={e.id}><EventRow e={e}/></div>)}</Stack></Group>}
  {list.posts.length>0&&<Group title={t('fe.fd.sv.posts',{n:list.posts.length})}><div className="posts">{list.posts.map(p=><PostCard key={p.id} post={p} onChange={replace}
   onRemove={r=>setList(l=>l&&{...l,posts:l.posts.filter(x=>x.id!==r.postId&&x.author.id!==r.authorId)})}/>)}</div></Group>}
  {list.discussions.length>0&&<Group title={t('fe.fd.sv.discussions',{n:list.discussions.length})}><Card list>
   {list.discussions.map(d=><Row key={d.id} icon={MessageCircle} title={d.title||mdPlain(d.body).slice(0,60)} onClick={()=>navigate('/n/feed/post/'+d.id)}/>)}</Card></Group>}
  {list.gone>0&&<Note className="mt12">{t('fe.fd.sv.gone',{n:list.gone})}</Note>}
 </>;
 return <>
  <Bar title={t('fe.fd.sv.title')} back small/>
  <View className="nodock">{body}</View>
 </>;
}
