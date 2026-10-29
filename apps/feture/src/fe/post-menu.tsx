import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Ban,BellOff,Check,EyeOff,Flag,Images,Link as LinkIcon,Pencil,Trash2,User,UserCheck,UserPlus,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,Alert,Ask as KitAsk,Btn,Card,Field,Row,Sheet,TextArea} from './kit';
import {useChecks} from './kit/validate';
import {useFe} from './session';
import {ReportSheet} from './report';
import {useToast} from './toast';
import type {Post,Reply} from './feed';
import {PostAlbumSheet,inGallery} from './gallery';
import {useCopyLink} from './share';
import {useFollow} from './follow';

/** V21 `ACT.postMenu` / `ACT.rMore` with the prototype's markup (`div.layer > div.scrim.on + div.sheet.on`).
 * Own post — edit / copy link / delete; someone else's — answers about a photo mark, hide the post, mute the author,
 * copy link, report. A reply — edit / delete own; profile / report / block for someone else's.
 * Confirmations replace the sheet with the prototype's `ask()` dialog in the same layer. */
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const objected=z.object({ok:z.literal(true),hidden:z.boolean()}).passthrough();
const explained=z.object({ok:z.literal(true),note:z.string().nullable()}).passthrough();
const deleted=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
/** What the list should drop: one post, or every post of an author. `undo` (hiding only) reverses it on the server;
 * the list then puts the posts back — FeedTab shows it as the «Вернуть» action of the toast. */
export type Removal={postId?:string,authorId?:string,notice:string,undo?:()=>Promise<void>,
 /** «Скрыть публикацию»: the feed leaves a row in its place (V21 FEED-011) with «Вернуть» and «Не показывать автора». */ hidden?:{authorId:string,authorName:string}};

const nameOf=(a:{name?:string|null,handle?:string|null}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'?');
const idList=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string()}).passthrough())});

/** Whether the acting profile follows `id`: the post brings it (`author.iFollow`), so the row shows with the menu at
 * once; only a post without it (null while it loads) asks for the «following» list, or `id`'s followers. */
function useFollows(id:string|null,known:boolean|undefined){
 const {call,acting}=useFe();const [on,setOn]=useState<boolean|null>(known??null);
 useEffect(()=>{if(!id||!acting||known!==undefined)return;let live=true;
  Promise.all([call('profile.followers',{profileId:acting.id,following:true},idList).catch(()=>null),call('profile.followers',{profileId:id},idList).catch(()=>null)])
   .then(([mine,theirs])=>{if(live)setOn(!!mine?.items.some(x=>x.id===id)||!!theirs?.items.some(x=>x.id===acting.id));});
  return ()=>{live=false;};},[call,acting,id,known]);
 return [on,setOn] as const;
}

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

export function PostMenu({post,onClose,onChange,onRemove}:{post:Post,onClose:()=>void,onChange?:(p:Post)=>void,onRemove:(r:Removal)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();const {op,drop}=useOps();
 const mine=post.rev!=null;const couple=acting?.kind==='couple';const name=nameOf(post.author);
 // «Подписаться» right here (owner 28.10.2026), so one doesn't have to open the profile for it.
 const [follows,setFollows]=useFollows(mine||post.author.id===acting?.id?null:post.author.id,post.author.iFollow);
 // The one follow action (`useFollow`, the same as `FollowButton`): the same call, wording and «Отменить».
 const fol=useFollow({profileId:post.author.id,name,onChange:on=>{setFollows(on);onChange?.({...post,author:{...post.author,iFollow:on}});}});
 const follow=(next:boolean)=>{onClose();void fol.toggle(next);};
 const [view,setView]=useState<'menu'|'delete'|'report'|'album'|'object'>('menu');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 useEscape(onClose);
 const go=(v:typeof view)=>{setFailure('');setView(v);};
 const run=async(key:string,fn:(opId:string)=>Promise<Removal|void>)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{const r=await fn(op(key));if(r)onRemove(r);}
  catch(e){setFailure(e instanceof FeError&&e.code==='rate_limited'&&e.rule==='claim_limit'?t('fe.w3.object.limit'):feErrorMessage(e,t));drop(key);}
  finally{setBusy(false);}
 };
 const hide=(kind:'post'|'author')=>run('hide.'+kind,async opId=>{
  const targetId=kind==='post'?post.id:post.author.id;
  await call('feedHide.set',{opId,kind,targetId,on:true},okOnly);
  const undo=async()=>{await call('feedHide.set',{opId:newOpId(),kind,targetId,on:false},okOnly);};
  return kind==='post'?{postId:post.id,notice:t(couple?'fe.pm.done.hiddenUs':'fe.pm.done.hidden'),undo,hidden:{authorId:post.author.id,authorName:name}}:{authorId:post.author.id,notice:t(couple?'fe.pm.done.authorHiddenNameUs':'fe.pm.done.authorHiddenName',{name}),undo};
 });
 const del=()=>run('delete',async opId=>{
  const r=await call('post.delete',{opId,postId:post.id},deleted);
  return {postId:post.id,notice:r.state==='archived'?t('fe.pm.done.archived'):t('fe.pm.done.deleted')};
 });
 const copyLink=useCopyLink();const copy=()=>{onClose();void copyLink('/n/feed/post/'+post.id);};
 // A photo mark of the acting profile on someone else's post.
 const me=post.tags?.find(x=>x.id===acting?.id);const hasMedia=post.media.length>0;
 const answer=(a:'ok'|'no'|'remove')=>run('tag.'+a,async opId=>{
  await call('tag.answer',{opId,postId:post.id,answer:a},okOnly);
  const tags=a==='remove'?(post.tags??[]).filter(x=>x.id!==me?.id):(post.tags??[]).map(x=>x.id===me?.id?{...x,state:a}:x);
  onChange?.({...post,tags});onClose();toast(a==='ok'?t('fe.fd.tag.confirmed'):a==='no'?t('fe.fd.tag.declined'):t('fe.pm.tag.removed'),{type:'ok'});
 });
 const object=()=>run('tag.object',async opId=>{
  // Hidden at once for a marked or trusted person; otherwise it goes to moderators first (and leaves this feed).
  const r=await call('tag.object',{opId,postId:post.id},objected);
  return {postId:post.id,notice:r.hidden?t('fe.w3.object.done'):t('fe.w3.object.queued')};
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
 if(view==='report')return <ReportSheet targetType="post" targetId={post.id} block={false} onClose={onClose}
  onDone={alsoBlock=>{const notice=t(couple?'fe.ca.reported':'fe.pm.done.reported');onRemove(alsoBlock?{authorId:post.author.id,notice}:{postId:post.id,notice});}}/>;
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
    {follows!==null&&(follows
     ?<Row noChev icon={UserCheck} title={t(couple?'fe.pm.unfollowUs':'fe.pm.unfollow')} sub={name} onClick={()=>follow(false)} disabled={busy||fol.busy}/>
     :<Row noChev icon={UserPlus} title={t(couple?'fe.pm.followUs':'fe.pm.follow')} sub={name} onClick={()=>follow(true)} disabled={busy||fol.busy}/>)}
    <Row noChev icon={EyeOff} title={t('fe.pm.hidePost')} sub={t('fe.pm.hidePostSub')} onClick={()=>hide('post')} disabled={busy}/>
    <Row noChev icon={BellOff} title={t('fe.pm.mute')} sub={t('fe.pm.muteSub',{name})} onClick={()=>hide('author')} disabled={busy}/>
    <Row noChev icon={LinkIcon} title={t('fe.pm.copyLink')} onClick={copy}/>
    <Row noChev icon={Flag} title={t('fe.pm.report')} danger onClick={()=>go('report')}/>
   </>}
  </Card>
  {failure&&<Alert kind="err">{failure}</Alert>}
 </Sheet>;
}

/** The author's own post hidden by «это я на фото — против» (owner decision 28.10.2026): why, never who, and a short
 * explanation for moderators. */
export function DisputeNotice({post,onChange}:{post:Post,onChange:(p:Post)=>void}){
 const {t}=useI18n();const [open,setOpen]=useState(false);
 const note=post.dispute?.note??null;
 return <><Alert kind="warn" icon={EyeOff} action={<Actions><Btn size="sm" kind="soft" fit onClick={()=>setOpen(true)}>{note?t('fe.w3.dispute.edit'):t('fe.w3.dispute.explain')}</Btn></Actions>}>
   <b>{t('fe.w3.dispute.hidden')}</b>{note?t('fe.w3.dispute.yours',{text:note}):t('fe.w3.dispute.hiddenText')}</Alert>
  {open&&<DisputeExplainSheet post={post} onClose={()=>setOpen(false)} onDone={n=>{setOpen(false);onChange({...post,dispute:{note:n}});}}/>}</>;
}

function DisputeExplainSheet({post,onClose,onDone}:{post:Post,onClose:()=>void,onDone:(note:string|null)=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const {op,drop}=useOps();
 const [text,setText]=useState(post.dispute?.note??'');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const checks=useChecks({note:'disputeNote'},{note:text});
 useEscape(onClose);
 const send=async()=>{if(busy||!checks.submit())return;setBusy(true);setFailure('');
  try{const r=await call('post.disputeExplain',{opId:op('explain'),postId:post.id,note:text.trim()},explained);toast(t('fe.w3.dispute.sent'),{type:'ok'});onDone(r.note);}
  catch(e){if(!checks.fromServer(e))setFailure(feErrorMessage(e,t));drop('explain');}finally{setBusy(false);}};
 return <Sheet title={t('fe.w3.dispute.sheetTitle')} sub={t('fe.w3.dispute.sheetSub')} onClose={onClose} foot={<Btn onClick={send} disabled={busy||!text.trim()} busy={busy}>{t('fe.w3.dispute.send')}</Btn>}>
  <Field name="note" error={checks.error('note')}>
   <TextArea rows={4} {...checks.input('note')} value={text} aria-label={t('fe.w3.dispute.sheetTitle')} onChange={e=>setText(e.target.value)}/>
   {checks.counter('note')}
  </Field>
  {failure&&<Alert kind="err">{failure}</Alert>}
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
 if(view==='block'&&reply.author)return <Ask icon={Ban} title={t('fe.pm.blockTitle',{name})} text={couple?t('fe.pm.blockTextCouple'):t('fe.pm.blockText')} ok={t(couple?'fe.ca.block':'fe.pm.block')} busy={busy} failure={failure} onCancel={()=>setView('menu')}
  onOk={()=>run('block',async opId=>{await call('block.set',{opId,profileId:reply.author!.id,on:true},okOnly);return t(couple?'fe.ca.blocked':'fe.pm.done.blocked');})}/>;
 if(view==='report')return <ReportSheet targetType="reply" targetId={reply.id} block={false} onClose={onClose} onDone={()=>onDone(t(couple?'fe.ca.reported':'fe.pm.done.reported'))}/>;
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
  {failure&&<Alert kind="err">{failure}</Alert>}
 </Sheet>;
}
