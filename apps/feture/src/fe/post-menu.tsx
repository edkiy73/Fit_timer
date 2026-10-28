import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Ban,BellOff,Check,EyeOff,Flag,Images,Link as LinkIcon,Pencil,Trash2,User,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {publicOrigin} from '../api-url';
import {Alert,Ask as KitAsk,Btn,Card,RadioList,Row,Sheet,TextArea,ToggleRow} from './kit';
import {useFe} from './session';
import {useToast} from './toast';
import type {Post,Reply} from './feed';
import {PostAlbumSheet,inGallery} from './gallery';

/** V21 `ACT.postMenu` / `ACT.rMore` with the prototype's markup (`div.layer > div.scrim.on + div.sheet.on`).
 * Own post — edit / copy link / delete; someone else's — answers about a photo mark, hide the post, mute the author,
 * copy link, report. A reply — edit / delete own; profile / report / block for someone else's.
 * Confirmations replace the sheet with the prototype's `ask()` dialog in the same layer. */
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const deleted=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
const REASONS=['threat','private','minor','spam','other'] as const;
type Reason=typeof REASONS[number];
/** What the list should drop: one post, or every post of an author. `undo` (hiding only) reverses it on the server;
 * the list then puts the posts back — FeedTab shows it as the «Вернуть» action of the toast. */
export type Removal={postId?:string,authorId?:string,notice:string,undo?:()=>Promise<void>,
 /** «Скрыть публикацию»: the feed leaves a row in its place (V21 FEED-011) with «Вернуть» and «Не показывать автора». */ hidden?:{authorId:string,authorName:string}};

const nameOf=(a:{name?:string|null,handle?:string|null}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'?');

function useOps(){
 const ops=useRef<Record<string,string>>({});
 return {op:(k:string)=>ops.current[k]??=newOpId(),drop:(k:string)=>{delete ops.current[k];}};
}
function useEscape(fn:()=>void){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;e.preventDefault();fn();};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[fn]);
}

/** The prototype's `ask()` for a destructive step; a failure shows inside it. */
function Ask({icon,title,text,ok,busy,failure,onOk,onCancel}:{icon:LucideIcon,title:string,text?:string,ok:string,busy:boolean,failure:string,onOk:()=>void,onCancel:()=>void}){
 const {t}=useI18n();
 return <KitAsk icon={icon} tone="l" title={title} text={text} ok={ok} cancel={t('fe.pm.cancel')} danger busy={busy} error={failure||undefined} onOk={onOk} onCancel={onCancel}/>;
}

/** The report sheet (`ACT.report`): a reason, optional details and «also block». */
export function ReportSheet({targetType,targetId,onClose,onDone}:{targetType:'post'|'reply',targetId:string,onClose:()=>void,onDone:(alsoBlock:boolean)=>void}){
 const {call}=useFe();const {t}=useI18n();const {op,drop}=useOps();
 const [reason,setReason]=useState<Reason|null>(null);const [details,setDetails]=useState('');const [alsoBlock,setAlsoBlock]=useState(false);const [shake,setShake]=useState(false);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 useEscape(onClose);
 const send=async()=>{
  if(!reason){setFailure(t('fe.pm.rp.chooseReason'));setShake(true);setTimeout(()=>setShake(false),500);return;}
  if(busy)return;setBusy(true);setFailure('');
  try{await call('report.create',{opId:op('report'),targetType,targetId,reason,details:details.trim().slice(0,500),alsoBlock},okOnly);onDone(alsoBlock);}
  catch(e){setFailure(feErrorMessage(e,t));drop('report');}finally{setBusy(false);}
 };
 return <Sheet title={t('fe.pm.rp.title')} onClose={onClose} foot={<Btn kind="danger" onClick={send} disabled={busy} busy={busy}>{t('fe.pm.rp.send')}</Btn>}>
  <div className={shake?'shake':undefined}>
   <RadioList label={t('fe.pm.rp.reason')} value={reason} options={REASONS.map(k=>[k,t('fe.pm.rp.'+k)] as const)} onChange={k=>{setReason(k);setFailure('');}}/>
  </div>
  <label className="field mt16"><span>{t('fe.pm.rp.details')}<i>{t('fe.pm.rp.optional')}</i></span>
   <TextArea rows={3} maxLength={500} value={details} onChange={e=>setDetails(e.target.value)}/></label>
  <Card list><ToggleRow title={t('fe.pm.rp.alsoBlock')} sub={t('fe.pm.rp.alsoBlockSub')} on={alsoBlock} onClick={()=>setAlsoBlock(v=>!v)}/></Card>
  {failure&&<Alert kind="err" className="mt12">{failure}</Alert>}
 </Sheet>;
}

export function PostMenu({post,onClose,onChange,onRemove}:{post:Post,onClose:()=>void,onChange?:(p:Post)=>void,onRemove:(r:Removal)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();const {op,drop}=useOps();
 const mine=post.rev!=null;const couple=acting?.kind==='couple';const name=nameOf(post.author);
 const [view,setView]=useState<'menu'|'delete'|'report'|'album'|'object'>('menu');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 useEscape(onClose);
 const go=(v:typeof view)=>{setFailure('');setView(v);};
 const run=async(key:string,fn:(opId:string)=>Promise<Removal|void>)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{const r=await fn(op(key));if(r)onRemove(r);}
  catch(e){setFailure(feErrorMessage(e,t));drop(key);}
  finally{setBusy(false);}
 };
 const hide=(kind:'post'|'author')=>run('hide.'+kind,async opId=>{
  const targetId=kind==='post'?post.id:post.author.id;
  await call('feedHide.set',{opId,kind,targetId,on:true},okOnly);
  const undo=async()=>{await call('feedHide.set',{opId:newOpId(),kind,targetId,on:false},okOnly);};
  return kind==='post'?{postId:post.id,notice:t('fe.pm.done.hidden'),undo,hidden:{authorId:post.author.id,authorName:name}}:{authorId:post.author.id,notice:t('fe.pm.done.authorHiddenName',{name}),undo};
 });
 const del=()=>run('delete',async opId=>{
  const r=await call('post.delete',{opId,postId:post.id},deleted);
  return {postId:post.id,notice:r.state==='archived'?t('fe.pm.done.archived'):t('fe.pm.done.deleted')};
 });
 const copy=async()=>{onClose();const url=`${publicOrigin()}/#/n/feed/post/${post.id}`;try{await navigator.clipboard.writeText(url);toast(t('fe.fd.linkCopied'),{type:'ok'});}catch{toast(url,{type:'info'});}};
 // A photo mark of the acting profile on someone else's post.
 const me=post.tags?.find(x=>x.id===acting?.id);const hasMedia=post.media.length>0;
 const answer=(a:'ok'|'no'|'remove')=>run('tag.'+a,async opId=>{
  await call('tag.answer',{opId,postId:post.id,answer:a},okOnly);
  const tags=a==='remove'?(post.tags??[]).filter(x=>x.id!==me?.id):(post.tags??[]).map(x=>x.id===me?.id?{...x,state:a}:x);
  onChange?.({...post,tags});onClose();toast(a==='ok'?t('fe.fd.tag.confirmed'):a==='no'?t('fe.fd.tag.declined'):t('fe.pm.tag.removed'),{type:'ok'});
 });
 const object=()=>run('tag.object',async opId=>{
  await call('tag.object',{opId,postId:post.id},okOnly);
  return {postId:post.id,notice:t('fe.w3.object.done')};
 });
 // «Убрать упоминание меня» (V21 unmentionMe): only when the server lists the acting profile as a linked mention.
 const mentioned=!mine&&!!acting&&(post.mentions??[]).some(m=>m.id===acting.id);
 const unmention=()=>run('unmention',async opId=>{
  await call('post.unmentionMe',{opId,postId:post.id},okOnly);
  onChange?.({...post,mentions:(post.mentions??[]).filter(m=>m.id!==acting?.id)});onClose();toast(t('fe.w3.unmention.done'),{type:'ok'});
 });

 if(view==='delete')return <Ask icon={Trash2} title={couple?t('fe.pm.delTitleCouple'):t('fe.pm.delTitle')} text={couple?t('fe.pm.delTextCouple'):t('fe.pm.delText')} ok={couple?t('fe.pm.hideOk'):t('fe.pm.delete')}
  busy={busy} failure={failure} onOk={del} onCancel={()=>go('menu')}/>;
 // «Это я — против» asks first (V21 tagObject): the post hides for everyone at once.
 if(view==='object')return <Ask icon={EyeOff} title={t('fe.w3.object.title')} text={t('fe.w3.object.text')} ok={t('fe.w3.object.ok')} busy={busy} failure={failure} onOk={object} onCancel={()=>go('menu')}/>;
 if(view==='report')return <ReportSheet targetType="post" targetId={post.id} onClose={onClose}
  onDone={alsoBlock=>onRemove(alsoBlock?{authorId:post.author.id,notice:t('fe.pm.done.reported')}:{postId:post.id,notice:t('fe.pm.done.reported')})}/>;
 if(view==='album')return <PostAlbumSheet post={post} onClose={onClose} onChange={onChange}/>;
 const published=!post.state||post.state==='published';
 return <Sheet title={t('fe.pm.title')} onClose={onClose}>
  <Card list>
   {mine?<>
    <Row noChev icon={Pencil} title={t('fe.pm.editFull')} onClick={()=>{onClose();navigate('/n/feed/post/'+post.id+'/edit');}}/>
    {inGallery(post)&&<Row noChev icon={Images} title={t('fe.gal.postAlbum')} sub={t('fe.gal.postAlbumMenuSub')} onClick={()=>go('album')}/>}
    {published&&<Row noChev icon={LinkIcon} title={t('fe.pm.copyLink')} onClick={copy}/>}
    <Row noChev icon={Trash2} title={t('fe.pm.delete')} danger onClick={()=>go('delete')}/>
   </>:<>
    {me?.state==='pending'&&<>
     <Row noChev icon={Check} title={t('fe.pm.tag.confirm')} onClick={()=>answer('ok')} disabled={busy}/>
     <Row noChev icon={EyeOff} title={t('fe.pm.tag.decline')} sub={t('fe.pm.tag.declineSub')} danger onClick={()=>answer('no')} disabled={busy}/>
    </>}
    {me?.state==='ok'&&<>
     <Row noChev icon={X} title={t('fe.pm.tag.remove')} sub={t('fe.pm.tag.removeSub')} onClick={()=>answer('remove')} disabled={busy}/>
     <Row noChev icon={EyeOff} title={t('fe.pm.tag.object')} sub={t('fe.pm.tag.objectSub')} danger onClick={()=>go('object')} disabled={busy}/>
    </>}
    {mentioned&&<Row noChev icon={AtSign} title={t('fe.w3.unmention')} sub={t('fe.w3.unmentionSub')} onClick={unmention} disabled={busy}/>}
    {!me&&hasMedia&&<Row noChev icon={EyeOff} title={t('fe.pm.tag.thatsMe')} sub={t('fe.pm.tag.thatsMeSub')} onClick={()=>go('object')} disabled={busy}/>}
    <Row noChev icon={EyeOff} title={t('fe.pm.hidePost')} sub={t('fe.pm.hidePostSub')} onClick={()=>hide('post')} disabled={busy}/>
    <Row noChev icon={BellOff} title={t('fe.pm.mute',{name})} sub={t('fe.pm.muteSub')} onClick={()=>hide('author')} disabled={busy}/>
    <Row noChev icon={LinkIcon} title={t('fe.pm.copyLink')} onClick={copy}/>
    <Row noChev icon={Flag} title={t('fe.pm.report')} danger onClick={()=>go('report')}/>
   </>}
  </Card>
  {failure&&<Alert kind="err" className="mt12">{failure}</Alert>}
 </Sheet>;
}

/** `ACT.rMore` — the «⋯» of a reply. */
export function ReplyMenu({reply,postId,onClose,onEdit,onDone}:{reply:Reply,postId:string,onClose:()=>void,onEdit:(r:Reply)=>void,onDone:(notice:string)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const {op,drop}=useOps();
 const [view,setView]=useState<'menu'|'delete'|'block'|'report'>('menu');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 useEscape(onClose);
 const name=nameOf(reply.author);const couple=acting?.kind==='couple';
 const run=async(key:string,fn:(opId:string)=>Promise<string>)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{onDone(await fn(op(key)));}catch(e){setFailure(feErrorMessage(e,t));drop(key);}finally{setBusy(false);}
 };
 if(view==='delete')return <Ask icon={Trash2} title={t('fe.pm.r.delTitle')} ok={t('fe.pm.delete')} busy={busy} failure={failure} onCancel={()=>setView('menu')}
  onOk={()=>run('delete',async opId=>{await call('reply.delete',{opId,replyId:reply.id},okOnly);return t('fe.feed.replyDeleted');})}/>;
 if(view==='block'&&reply.author)return <Ask icon={Ban} title={t('fe.pm.blockTitle',{name})} text={couple?t('fe.pm.blockTextCouple'):t('fe.pm.blockText')} ok={t('fe.pm.block')} busy={busy} failure={failure} onCancel={()=>setView('menu')}
  onOk={()=>run('block',async opId=>{await call('block.set',{opId,profileId:reply.author!.id,on:true},okOnly);return t('fe.pm.done.blocked');})}/>;
 if(view==='report')return <ReportSheet targetType="reply" targetId={reply.id} onClose={onClose} onDone={()=>onDone(t('fe.pm.done.reported'))}/>;
 return <Sheet title={t('fe.pm.r.title')} onClose={onClose}>
  <Card list>
   {reply.mine?<>
    <Row noChev icon={Pencil} title={t('fe.pm.edit')} onClick={()=>onEdit(reply)}/>
    <Row noChev icon={Trash2} title={t('fe.pm.r.delete')} danger onClick={()=>setView('delete')}/>
   </>:<>
    {reply.author&&<Row noChev icon={User} title={t('fe.pm.r.profile',{name})} onClick={()=>{onClose();navigate('/n/people/'+reply.author!.id);}}/>}
    {!!acting&&(reply.mentions??[]).some(m=>m.id===acting.id)&&<Row noChev icon={AtSign} title={t('fe.w3.unmention')} sub={t('fe.w3.unmentionSub')} disabled={busy}
     onClick={()=>run('unmention',async opId=>{await call('post.unmentionMe',{opId,postId,replyId:reply.id},okOnly);return t('fe.w3.unmention.done');})}/>}
    <Row noChev icon={Flag} title={t('fe.pm.report')} danger onClick={()=>setView('report')}/>
    {reply.author&&<Row noChev icon={Ban} title={t('fe.pm.r.block',{name})} sub={t('fe.pm.r.blockSub')} danger onClick={()=>setView('block')}/>}
   </>}
  </Card>
  {failure&&<Alert kind="err" className="mt12">{failure}</Alert>}
 </Sheet>;
}
