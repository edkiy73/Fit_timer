import {useCallback,useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,Globe,Newspaper,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Btn,Empty,Seg,plate,Skel} from './ui';
import {useFe} from './session';
import {PostCard,postSchema,type Post} from './feed';
import {useToast} from './toast';

/** V21 X01 «Моё»: own posts (drafts and «in review» shown only here), communities, events, saved items. */
const posts=z.object({ok:z.literal(true),items:z.array(postSchema)});
const comm=z.object({id:z.uuid(),name:z.string(),state:z.string(),privacy:z.string(),role:z.string()});
const comms=z.object({ok:z.literal(true),hosting:z.array(comm),member:z.array(comm),requests:z.array(z.object({id:z.uuid(),community_id:z.uuid(),name:z.string()}))});
const ev=z.object({id:z.uuid(),title:z.string(),format:z.string(),starts_at:z.string(),state:z.string()}).passthrough();
const evs=z.object({ok:z.literal(true),going:z.array(ev),interested:z.array(ev),organizing:z.array(ev),applications:z.array(ev)}).passthrough();
const saved=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string(),created_at:z.string()}))});

type Part='posts'|'communities'|'events'|'saved';
const PARTS:Part[]=['posts','communities','events','saved'];
export function MineLayer(){
 const {t}=useI18n();const location=useLocation();
 // `?part=` opens a section directly; a create screen passes what happened as `state.notice`.
 const [part,setPart]=useState<Part>(()=>{const p=new URLSearchParams(location.search).get('part');return PARTS.includes(p as Part)?p as Part:'posts';});
 const notice=(location.state as {notice?:unknown}|null)?.notice;
 return <>
  {typeof notice==='string'&&notice&&<div className="alert ok mb12" role="status"><span>{notice}</span></div>}
  <div className="mb12"><Seg value={part} onChange={setPart} options={(['posts','communities','events','saved'] as const).map(id=>({id,label:t('fe.mine.'+id)}))}/></div>
  {part==='posts'?<MyPosts/>:part==='communities'?<MyCommunities/>:part==='events'?<MyEvents/>:<Saved/>}
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

function MyCommunities(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {data,error,load}=useLoad(useCallback(()=>call('community.mine',{},comms),[call]));
 if(error)return <Failed error={error} retry={load}/>;
 if(!data)return <Skel kind="post"/>;
 const all=[...data.hosting,...data.member];
 if(!all.length&&!data.requests.length)return <Empty icon={Globe} title={t('fe.mine.noComms')} text={t('fe.mine.noCommsText')}><Btn kind="soft" onClick={()=>navigate('/n/communities')}>{t('fe.mine.toCatalog')}</Btn></Empty>;
 return <div className="card list">
  {all.map(c=><button key={c.id} type="button" className="li" onClick={()=>navigate('/n/communities/'+c.id)}>
   <span className="av sm" style={{position:'relative'}}><div className="plate" style={plate(c.id)}/></span>
   <span className="tx"><b>{c.name}</b><small>{t('fe.mine.role.'+c.role)}{c.state!=='published'?' · '+t('fe.mine.state.'+c.state):''}</small></span>
  </button>)}
  {data.requests.map(r=><button key={r.id} type="button" className="li" onClick={()=>navigate('/n/communities/'+r.community_id)}>
   <span className="av sm" style={{position:'relative'}}><div className="plate" style={plate(r.community_id)}/></span><span className="tx"><b>{r.name}</b><small>{t('fe.comm.requested')}</small></span>
  </button>)}
 </div>;
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
