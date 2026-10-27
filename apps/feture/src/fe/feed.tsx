import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon} from '../feture/components/Icon';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActionButton,Avatar,ScreenHeader,StateCard} from './components';
import {useFe} from './session';

/** Slice B (V21 F01, F05, F07): feed tabs, post cards, like, replies, composer. Visibility is the server's
 * (post_visible); the client never filters or invents counts. */
const author=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string()});
const media=z.object({id:z.uuid(),kind:z.string(),w:z.number().nullable(),h:z.number().nullable(),pending:z.boolean(),blurred:z.boolean(),src:z.record(z.string(),z.string()).nullable()});
export const postSchema=z.object({id:z.uuid(),type:z.enum(['post','note']),title:z.string().nullable(),body:z.string(),author,media:z.array(media),
 likes:z.number(),liked:z.boolean(),replies:z.number(),saved:z.boolean(),publishedAt:z.string().nullable(),state:z.string().optional()});
export type Post=z.infer<typeof postSchema>;
const page=z.object({ok:z.literal(true),items:z.array(postSchema),next:z.string().nullable()});
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const reply=z.object({id:z.uuid(),parentId:z.uuid().nullable().optional(),deleted:z.boolean().optional(),hidden:z.boolean().optional(),body:z.string().optional(),author:author.nullable().optional(),mine:z.boolean().optional(),createdAt:z.string().optional()});
const replies=z.object({ok:z.literal(true),items:z.array(reply)});
const onePost=z.object({ok:z.literal(true),post:postSchema});

function when(iso:string|null,locale:string){
 if(!iso)return '';
 const d=new Date(iso),s=(Date.now()-d.getTime())/1000;
 const rtf=new Intl.RelativeTimeFormat(locale==='en'?'en':'ru',{numeric:'auto'});
 if(s<60)return rtf.format(0,'second');if(s<3600)return rtf.format(-Math.floor(s/60),'minute');if(s<86400)return rtf.format(-Math.floor(s/3600),'hour');
 if(s<7*86400)return rtf.format(-Math.floor(s/86400),'day');
 return d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});
}

export function FeedTab(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [tab,setTab]=useState<'forYou'|'following'>('forYou');
 const [items,setItems]=useState<Post[]|null>(null);const [next,setNext]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);const [more,setMore]=useState(false);
 const load=useCallback((cursor?:string)=>{
  setError(null);if(!cursor)setItems(null);else setMore(true);
  call('feed.list',{tab,...(cursor?{cursor}:{})},page).then(r=>{setItems(prev=>cursor&&prev?[...prev,...r.items]:r.items);setNext(r.next);})
   .catch(setError).finally(()=>setMore(false));
 },[call,tab]);
 useEffect(()=>{load();},[load]);
 return <>
  <ScreenHeader title={t('fe.nav.feed')} action={<button type="button" className="fe-ibtn fe-ibtn-add" aria-label={t('fe.feed.new')} onClick={()=>navigate('/n/feed/new')}><Icon name="plus" size={22}/></button>}/>
  <div className="fe-body">
   <div className="fe-seg" role="tablist">{(['forYou','following'] as const).map(k=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{t('fe.feed.tab.'+k)}</button>)}</div>
   {error&&!items?<StateCard icon="close" role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)} action={<ActionButton variant="soft" onClick={()=>load()}>{t('fe.retry')}</ActionButton>}/>
    :items===null?<p className="fe-mute" role="status">{t('fe.loading')}</p>
    :items.length===0?<StateCard icon="feed" title={t('fe.feed.empty.'+tab)} text={t('fe.feed.emptyText.'+tab)} action={<ActionButton variant="soft" onClick={()=>navigate('/n/feed/new')}>{t('fe.feed.new')}</ActionButton>}/>
    :<div className="fe-list">{items.map(p=><PostCard key={p.id} post={p} onChange={np=>setItems(list=>list?.map(x=>x.id===np.id?np:x)??null)}/>)}
     {next&&<ActionButton variant="soft" onClick={()=>load(next)} disabled={more}>{more?t('fe.loading'):t('fe.feed.more')}</ActionButton>}
    </div>}
  </div>
 </>;
}

export function PostCard({post,onChange,full=false}:{post:Post,onChange:(p:Post)=>void,full?:boolean}){
 const {call}=useFe();const {t,locale}=useI18n();const [busy,setBusy]=useState(false);
 const like=async()=>{
  if(busy)return;setBusy(true);const on=!post.liked;
  onChange({...post,liked:on,likes:post.likes+(on?1:-1)});
  try{await call('reaction.set',{opId:newOpId(),targetType:'post',targetId:post.id,on},okOnly);}
  catch{onChange(post);}finally{setBusy(false);}
 };
 const img=post.media.find(m=>m.src&&!m.pending);
 const body=<>
  {post.title&&<h3 className="fe-post-title">{post.title}</h3>}
  {post.body&&<p className={'fe-post-body'+(full?'':' clamp')}>{post.body}</p>}
  {img?.src&&<img className="fe-post-img" src={img.src.card??img.src.full??img.src.blur} alt="" loading="lazy" width={img.w??undefined} height={img.h??undefined}/>}
 </>;
 return <article className="fe-post">
  <header className="fe-post-head">
   <Avatar name={post.author.name||post.author.handle||'?'} size="m" couple={post.author.kind==='couple'}/>
   <div><b>{post.author.name||'@'+post.author.handle}</b><span className="fe-mute">{post.author.handle?'@'+post.author.handle+' · ':''}{when(post.publishedAt,locale)}</span></div>
   {post.state&&post.state!=='published'&&<span className="fe-pill">{t('fe.feed.state.'+post.state)}</span>}
  </header>
  {full?body:<Link to={'/n/feed/post/'+post.id} className="fe-post-link">{body}</Link>}
  <footer className="fe-post-foot">
   <button type="button" className={'fe-react'+(post.liked?' on':'')} aria-pressed={post.liked} onClick={like} aria-label={t('fe.feed.like')}><Icon name="heart" size={20}/><span>{post.likes||''}</span></button>
   <Link className="fe-react" to={'/n/feed/post/'+post.id} aria-label={t('fe.feed.replies')}><Icon name="message" size={20}/><span>{post.replies||''}</span></Link>
  </footer>
 </article>;
}

export function PostScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();
 const [post,setPost]=useState<Post|null>(null);const [list,setList]=useState<z.infer<typeof reply>[]>([]);const [error,setError]=useState<unknown>(null);
 const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const opId=useRef(newOpId());
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
  <ScreenHeader title={t('fe.feed.post')} back="/n/feed"/>
  <div className="fe-body">
   {error?<StateCard icon="lock" title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)} action={<ActionButton variant="soft" onClick={load}>{t('fe.retry')}</ActionButton>}/>
    :!post?<p className="fe-mute" role="status">{t('fe.loading')}</p>
    :<>
     <PostCard post={post} onChange={setPost} full/>
     <section className="fe-section" aria-label={t('fe.feed.replies')}>
      <h3>{t('fe.feed.replies')}{list.length?' · '+list.length:''}</h3>
      {list.length===0&&<p className="fe-mute">{t('fe.feed.noReplies')}</p>}
      {list.map(r=><div key={r.id} className="fe-reply">
       {r.deleted?<p className="fe-mute">{t('fe.feed.replyDeleted')}</p>:r.hidden?<p className="fe-mute">{t('fe.feed.replyHidden')}</p>:<>
        <Avatar name={r.author?.name||r.author?.handle||'?'} size="s"/>
        <div><b>{r.author?.name||'@'+(r.author?.handle??'')}</b> <span className="fe-mute">{when(r.createdAt??null,locale)}</span><p>{r.body}</p></div>
       </>}
      </div>)}
     </section>
     <div className="fe-composer">
      <textarea className="fe-inp" rows={2} maxLength={1000} value={text} onChange={e=>setText(e.target.value)} placeholder={t('fe.feed.replyPh')} aria-label={t('fe.feed.replyPh')}/>
      <ActionButton size="md" onClick={send} disabled={busy||!text.trim()}>{t('fe.feed.send')}</ActionButton>
     </div>
     {failure&&<p className="fe-alert" role="alert">{failure}</p>}
    </>}
  </div>
 </>;
}

const saved=z.object({ok:z.literal(true),id:z.uuid()}).passthrough();
const published=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
export function ComposeScreen(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [body,setBody]=useState('');const [audience,setAudience]=useState<'all'|'followers'|'only'>('all');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const ops=useRef({draft:newOpId(),publish:newOpId()});
 const publish=async()=>{
  if(!body.trim()||busy)return;setBusy(true);setFailure('');
  try{
   const d=await call('post.saveDraft',{opId:ops.current.draft,post:{body:body.trim(),audience}},saved);
   const p=await call('post.publish',{opId:ops.current.publish,postId:d.id},published);
   navigate('/n/feed',{replace:true,state:{toast:p.state==='review'?'review':'published'}});
  }catch(e){setFailure(feErrorMessage(e,t));ops.current={draft:newOpId(),publish:newOpId()};}
  finally{setBusy(false);}
 };
 return <>
  <ScreenHeader title={t('fe.feed.new')} back="/n/feed"/>
  <div className="fe-body">
   {acting&&<div className="fe-post-head"><Avatar name={acting.name||acting.handle||'?'} size="m" couple={acting.kind==='couple'}/><div><b>{acting.name||'@'+acting.handle}</b><span className="fe-mute">{acting.kind==='couple'?t('fe.feed.asCouple'):t('fe.feed.asMe')}</span></div></div>}
   <textarea className="fe-inp fe-compose" rows={6} maxLength={1000} value={body} onChange={e=>setBody(e.target.value)} placeholder={t('fe.feed.composePh')} aria-label={t('fe.feed.composePh')} autoFocus/>
   <p className="fe-fhint">{body.length}/1000</p>
   <section className="fe-section"><h3>{t('fe.feed.audience')}</h3>
    <div className="fe-chips">{(['all','followers','only'] as const).map(a=><button key={a} type="button" className={'fe-chip'+(audience===a?' on':'')} aria-pressed={audience===a} onClick={()=>setAudience(a)}>{t('fe.feed.aud.'+a)}</button>)}</div>
   </section>
   {failure&&<p className="fe-alert" role="alert">{failure}</p>}
   <div className="fe-cta"><ActionButton onClick={publish} disabled={busy||!body.trim()}>{busy?t('fe.loading'):t('fe.feed.publish')}</ActionButton></div>
  </div>
 </>;
}
