import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,ChartColumn,Ellipsis,Heart,Image as ImageIcon,Lock,MessageCircle,Newspaper,Plus,SendHorizontal,Share2,Trash2,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,View} from './ui';
import {useFe} from './session';

/** Slice B (V21 F01, F05, F07) with the prototype's markup: feed tabs, composer row, posts, replies, new post.
 * Visibility and counts are the server's; the client never filters or invents them. */
const author=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string()});
const media=z.object({id:z.uuid(),kind:z.string(),w:z.number().nullable(),h:z.number().nullable(),pending:z.boolean(),blurred:z.boolean(),src:z.record(z.string(),z.string()).nullable()});
export const postSchema=z.object({id:z.uuid(),type:z.enum(['post','note']),title:z.string().nullable(),body:z.string(),author,media:z.array(media),
 topics:z.array(z.string()).optional(),likes:z.number(),liked:z.boolean(),replies:z.number(),saved:z.boolean(),publishedAt:z.string().nullable(),state:z.string().optional()});
export type Post=z.infer<typeof postSchema>;
const page=z.object({ok:z.literal(true),items:z.array(postSchema),next:z.string().nullable()});
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const reply=z.object({id:z.uuid(),parentId:z.uuid().nullable().optional(),deleted:z.boolean().optional(),hidden:z.boolean().optional(),body:z.string().optional(),author:author.nullable().optional(),mine:z.boolean().optional(),createdAt:z.string().optional()});
const replies=z.object({ok:z.literal(true),items:z.array(reply)});
const onePost=z.object({ok:z.literal(true),post:postSchema});

export function when(iso:string|null|undefined,locale:string){
 if(!iso)return '';
 const d=new Date(iso),s=(Date.now()-d.getTime())/1000;
 const rtf=new Intl.RelativeTimeFormat(locale==='en'?'en':'ru',{numeric:'auto'});
 if(s<60)return rtf.format(0,'second');if(s<3600)return rtf.format(-Math.floor(s/60),'minute');if(s<86400)return rtf.format(-Math.floor(s/3600),'hour');
 if(s<7*86400)return rtf.format(-Math.floor(s/86400),'day');
 return d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});
}
const nameOf=(a:{name?:string|null,handle?:string|null}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'?');

export function FeedTab(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [tab,setTab]=useState<'forYou'|'following'>('forYou');
 const [items,setItems]=useState<Post[]|null>(null);const [next,setNext]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);const [more,setMore]=useState(false);
 const load=useCallback((cursor?:string)=>{
  setError(null);if(!cursor)setItems(null);else setMore(true);
  call('feed.list',{tab,...(cursor?{cursor}:{})},page).then(r=>{setItems(prev=>cursor&&prev?[...prev,...r.items]:r.items);setNext(r.next);})
   .catch(setError).finally(()=>setMore(false));
 },[call,tab]);
 useEffect(()=>{load();},[load]);
 const me=nameOf(acting);
 return <>
  <Bar title={t('fe.nav.feed')}/>
  <View>
   <div className="mb12"><Seg value={tab} onChange={setTab} options={[{id:'forYou',label:t('fe.feed.tab.forYou')},{id:'following',label:t('fe.feed.tab.following')}]}/></div>
   <div className="composer">
    <button type="button" className="cmp-main" onClick={()=>navigate('/n/feed/new')}>{acting&&<Av name={me} seed={acting.id} size="sm"/>}<span>{t('fe.feed.whatsNew')}</span></button>
    <button type="button" className="ibtn add" aria-label={t('fe.create')} onClick={()=>navigate('/n/feed/new')}><Plus/></button>
   </div>
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>
    :items===null?<p className="note" role="status">{t('fe.loading')}</p>
    :items.length===0?<Empty icon={Newspaper} title={t('fe.feed.empty.'+tab)} text={t('fe.feed.emptyText.'+tab)}><Btn kind="soft" onClick={()=>navigate('/n/feed/new')}>{t('fe.feed.new')}</Btn></Empty>
    :<>{items.map(p=><PostCard key={p.id} post={p} onChange={np=>setItems(list=>list?.map(x=>x.id===np.id?np:x)??null)}/>)}
     {next&&<Btn kind="soft" onClick={()=>load(next)} disabled={more}>{more?t('fe.loading'):t('fe.feed.more')}</Btn>}
    </>}
  </View>
 </>;
}

export function PostCard({post,onChange,full=false,onReply}:{post:Post,onChange:(p:Post)=>void,full?:boolean,onReply?:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [busy,setBusy]=useState(false);
 const toggle=async(field:'liked'|'saved')=>{
  if(busy)return;setBusy(true);const on=!post[field];
  onChange(field==='liked'?{...post,liked:on,likes:post.likes+(on?1:-1)}:{...post,saved:on});
  try{
   if(field==='liked')await call('reaction.set',{opId:newOpId(),targetType:'post',targetId:post.id,on},okOnly);
   else await call('saved.set',{opId:newOpId(),kind:'post',targetId:post.id,on},okOnly);
  }catch{onChange(post);}finally{setBusy(false);}
 };
 const share=async()=>{const url=`${location.origin}/#/n/feed/post/${post.id}`;try{if(navigator.share)await navigator.share({url});else await navigator.clipboard.writeText(url);}catch{/* the person closed the sheet */}};
 const open=()=>{if(!full)navigate('/n/feed/post/'+post.id);};
 const img=post.media.find(m=>m.src&&!m.pending);
 const couple=post.author.kind==='couple'&&post.author.name.includes(' и ')?post.author.name.split(' и ',2) as [string,string]:undefined;
 return <article className="post">
  <div className="post-h">
   <button type="button" className="who" onClick={()=>navigate('/n/people/'+post.author.id)}>
    <Av name={nameOf(post.author)} seed={post.author.id} size="sm" couple={couple}/>
    <span className="tx"><b><span className="nmt">{nameOf(post.author)}</span></b><small>{when(post.publishedAt,locale)}{post.state&&post.state!=='published'?' · '+t('fe.feed.state.'+post.state):''}</small></span>
   </button>
   <button type="button" className="ibtn ghost sm" aria-label={t('fe.more')}><Ellipsis/></button>
  </div>
  <div className="body" onClick={open} role={full?undefined:'link'} tabIndex={full?undefined:0} onKeyDown={e=>{if(e.key==='Enter')open();}}>
   {post.title&&<h3 className="post-title">{post.title}</h3>}
   {post.body&&<div className="md"><p>{post.body}</p></div>}
   {img?.src&&<div className="mgrid mos" style={{aspectRatio:String(Math.min(1.8,Math.max(0.8,(img.w??4)/(img.h??5))))}}>
    <span className="mcell mf" style={{left:0,top:0,width:'100%',height:'100%'}}>
     <img className="mbg" src={img.src.card??img.src.full??img.src.blur} alt="" aria-hidden="true" draggable={false} loading="lazy"/>
     <img className="mfg" src={img.src.card??img.src.full??img.src.blur} alt="" draggable={false} loading="lazy"/>
    </span></div>}
  </div>
  <div className="post-a">
   <button type="button" className={post.liked?'on':''} aria-pressed={post.liked} aria-label={t('fe.feed.like')} onClick={()=>toggle('liked')}><Heart/><span>{post.likes}</span></button>
   <button type="button" aria-label={t('fe.feed.replies')} onClick={full?onReply:open}><MessageCircle/><span>{post.replies}</span></button>
   <button type="button" className={'sp'+(post.saved?' saved':'')} aria-pressed={post.saved} aria-label={t('fe.feed.save')} onClick={()=>toggle('saved')}><Bookmark/></button>
   <button type="button" aria-label={t('fe.feed.share')} onClick={share}><Share2/></button>
  </div>
 </article>;
}

export function PostScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [post,setPost]=useState<Post|null>(null);const [list,setList]=useState<z.infer<typeof reply>[]>([]);const [error,setError]=useState<unknown>(null);
 const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const opId=useRef(newOpId());const box=useRef<HTMLTextAreaElement>(null);
 const load=useCallback(()=>{
  setError(null);
  Promise.all([call('post.get',{postId:id},onePost),call('post.replies',{postId:id},replies)])
   .then(([p,r])=>{setPost(p.post);setList(r.items);}).catch(setError);
 },[call,id]);
 useEffect(()=>{load();},[load]);
 const send=async()=>{
  const body=text.trim();if(!body||busy)return;setBusy(true);setFailure('');
  try{await call('reply.create',{opId:opId.current,postId:id,body},okOnly);setText('');opId.current=newOpId();load();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <>
  <Bar title={t('fe.feed.post')} back="/n/feed"/>
  <View>
   {error?<Empty icon={Lock} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>navigate('/n/feed')}>{t('fe.feed.toFeed')}</Btn></Empty>
    :!post?<p className="note" role="status">{t('fe.loading')}</p>
    :<>
     <PostCard post={post} onChange={setPost} full onReply={()=>box.current?.focus()}/>
     <div className="sec" id="replies">{t('fe.feed.repliesCount').replace('{n}',String(list.filter(r=>!r.deleted).length))}</div>
     {list.length===0?<button type="button" className="note-empty" onClick={()=>box.current?.focus()}>{t('fe.feed.noReplies')}</button>
      :list.map(r=>{const hidden=r.deleted||r.hidden;return <article key={r.id} className={'cm'+(hidden?' removed':'')}>
       <div className="cm-l">{hidden?<span className="av cm-ghost" aria-hidden="true">{r.deleted?<Trash2/>:<Lock/>}</span>:<Av name={nameOf(r.author)} seed={r.author?.id??r.id} size="sm"/>}</div>
       <div className="cm-b">{hidden?<p className="note">{r.deleted?t('fe.feed.replyDeleted'):t('fe.feed.replyHidden')}</p>:<>
        <div className="cm-h"><span className="plink pnm"><span className="nmt">{nameOf(r.author)}</span></span><time>{when(r.createdAt,locale)}</time></div>
        <p className="reply-text">{r.body}</p>
       </>}</div>
      </article>;})}
     {failure&&<p className="alert err" role="alert">{failure}</p>}
    </>}
  </View>
  {post&&<div className="inputbar">
   <textarea ref={box} rows={1} maxLength={1000} value={text} onChange={e=>setText(e.target.value)} placeholder={t('fe.feed.replyPh')} aria-label={t('fe.feed.replyPh')}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/>
   <button type="button" className="ibtn send" onClick={send} disabled={busy||!text.trim()} aria-label={t('fe.feed.send')}><SendHorizontal/></button>
  </div>}
 </>;
}

const saved=z.object({ok:z.literal(true),id:z.uuid()}).passthrough();
const published=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
export function ComposeScreen(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [body,setBody]=useState('');const [audience,setAudience]=useState<'all'|'followers'|'only'>('all');const [inFeed,setInFeed]=useState(true);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const ops=useRef({draft:newOpId(),publish:newOpId()});
 const publish=async()=>{
  if(!body.trim()||busy)return;setBusy(true);setFailure('');
  try{
   const d=await call('post.saveDraft',{opId:ops.current.draft,post:{body:body.trim(),audience,inFeed}},saved);
   await call('post.publish',{opId:ops.current.publish,postId:d.id},published);
   navigate('/n/feed',{replace:true});
  }catch(e){setFailure(feErrorMessage(e,t));ops.current={draft:newOpId(),publish:newOpId()};}
  finally{setBusy(false);}
 };
 return <>
  <Bar title={t('fe.feed.new')} back="/n/feed"/>
  <View className="cta1">
   <section className="grp"><div className="card compose v14">
    <div className="cmp-ctx"><div className="cmp-aud">
     <label className="selrow solo"><span className="selv" aria-hidden="true">{t('fe.feed.aud.'+audience)}</span>
      <select value={audience} onChange={e=>setAudience(e.target.value as typeof audience)} aria-label={t('fe.feed.audience')}>
       {(['all','followers','only'] as const).map(a=><option key={a} value={a}>{t('fe.feed.aud.'+a)}</option>)}
      </select></label>
    </div></div>
    <p className="cmp-who">{acting?.kind==='couple'?t('fe.feed.asCouple'):t('fe.feed.asMe')}</p>
    <div className="field">
     <textarea className="inp" rows={6} maxLength={1000} value={body} onChange={e=>setBody(e.target.value)} placeholder={t('fe.feed.composePh')} aria-label={t('fe.feed.composePh')} autoFocus/>
     <div className="counter">{body.length} / 1000</div>
    </div>
    <div className="attach v14">
     <button type="button" disabled title={t('fe.soonShort')}><ImageIcon/><span>{t('fe.feed.media')}</span></button>
     <button type="button" disabled title={t('fe.soonShort')}><ChartColumn/><span>{t('fe.feed.poll')}</span></button>
    </div>
   </div>
   <div className="card list cmp-feed">
    <button type="button" className="li" role="switch" aria-checked={inFeed} onClick={()=>setInFeed(v=>!v)}>
     <span className="tx"><b>{t('fe.feed.inFeed')}</b><small>{inFeed?t('fe.feed.inFeedOn'):t('fe.feed.inFeedOff')}</small></span>
     <span className={'sw'+(inFeed?' on':'')} aria-hidden="true"/>
    </button>
   </div></section>
   {failure&&<p className="alert err" role="alert">{failure}</p>}
  </View>
  <div className="ctabar"><div className="wrap"><Btn onClick={publish} disabled={busy||!body.trim()}>{busy?t('fe.loading'):t('fe.feed.publish')}</Btn></div></div>
 </>;
}
