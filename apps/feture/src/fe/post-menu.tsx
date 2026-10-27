import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,EyeOff,Flag,Pencil,Trash2,UserX,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn,Layer} from './ui';
import {useFe} from './session';
import type {Post} from './feed';

/** V21 `ACT.postMenu` with the prototype's markup (`div.layer > div.scrim.on + div.sheet.on`): own post — edit / delete;
 * someone else's — hide the post, hide the author, report, block. Confirmations stay inside the sheet. */
const okOnly=z.object({ok:z.literal(true)}).passthrough();
const deleted=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
const REASONS=['threat','private','minor','spam','other'] as const;
type Reason=typeof REASONS[number];
type View='menu'|'delete'|'block'|'report';
/** What the list should drop: one post, or every post of an author. `undo` (hiding only) reverses it on the server;
 * the list then puts the posts back — FeedTab shows it as the «Вернуть» action of the toast. */
export type Removal={postId?:string,authorId?:string,notice:string,undo?:()=>Promise<void>};

const nameOf=(a:{name?:string|null,handle?:string|null})=>a.name||(a.handle?'@'+a.handle:'?');

function Row({icon:Icon,title,sub,danger,onClick,disabled}:{icon:LucideIcon,title:string,sub?:string,danger?:boolean,onClick:()=>void,disabled?:boolean}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick} disabled={disabled}>
  <span className="ico"><Icon/></span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>
 </button>;
}

export function PostMenu({post,onClose,onRemove}:{post:Post,onClose:()=>void,onRemove:(r:Removal)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const mine=post.rev!=null;const couple=acting?.kind==='couple';const name=nameOf(post.author);
 const [view,setView]=useState<View>('menu');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [reason,setReason]=useState<Reason|null>(null);const [details,setDetails]=useState('');const [alsoBlock,setAlsoBlock]=useState(false);const [shake,setShake]=useState(false);
 const sheet=useRef<HTMLDivElement>(null);const ops=useRef<Record<string,string>>({});
 const op=(k:string)=>ops.current[k]??=newOpId();
 useEffect(()=>{sheet.current?.focus({preventScroll:true});},[view]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;e.preventDefault();onClose();};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[onClose]);
 const go=(v:View)=>{setFailure('');setView(v);};
 const run=async(key:string,fn:(opId:string)=>Promise<Removal|void>)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{const r=await fn(op(key));if(r)onRemove(r);}
  catch(e){setFailure(feErrorMessage(e,t));delete ops.current[key];}
  finally{setBusy(false);}
 };
 const hide=(kind:'post'|'author')=>run('hide.'+kind,async opId=>{
  const targetId=kind==='post'?post.id:post.author.id;
  await call('feedHide.set',{opId,kind,targetId,on:true},okOnly);
  const undo=async()=>{await call('feedHide.set',{opId:newOpId(),kind,targetId,on:false},okOnly);};
  return kind==='post'?{postId:post.id,notice:t('fe.pm.done.hidden'),undo}:{authorId:post.author.id,notice:t('fe.pm.done.authorHidden'),undo};
 });
 const del=()=>run('delete',async opId=>{
  const r=await call('post.delete',{opId,postId:post.id},deleted);
  return {postId:post.id,notice:r.state==='archived'?t('fe.pm.done.archived'):t('fe.pm.done.deleted')};
 });
 const block=()=>run('block',async opId=>{
  await call('block.set',{opId,profileId:post.author.id,on:true},okOnly);
  return {authorId:post.author.id,notice:t('fe.pm.done.blocked')};
 });
 const report=()=>{
  if(!reason){setFailure(t('fe.pm.rp.chooseReason'));setShake(true);setTimeout(()=>setShake(false),500);return;}
  void run('report',async opId=>{
   await call('report.create',{opId,targetType:'post',targetId:post.id,reason,details:details.trim().slice(0,500),alsoBlock},okOnly);
   // The server hides a reported post from the reporter's feed; with «also block» the whole author goes.
   return alsoBlock?{authorId:post.author.id,notice:t('fe.pm.done.reported')}:{postId:post.id,notice:t('fe.pm.done.reported')};
  });
 };

 const title=view==='report'?t('fe.pm.rp.title'):t('fe.pm.title');
 const head=<div className="sh-h"><div className="sh-ht"><h2>{title}</h2></div>
  <button type="button" className="ibtn ghost sm" aria-label={t('fe.pm.close')} onClick={onClose}><X/></button></div>;
 const err=failure&&<div className="alert err mt12" role="alert"><span>{failure}</span></div>;
 const confirm=(Icon:LucideIcon,h:string,text:string,ok:string,act:()=>void)=><Layer>
  <div className="scrim on" onClick={()=>go('menu')}/>
  <div ref={sheet} className="dialog on" role="alertdialog" aria-modal="true" aria-label={h} tabIndex={-1}>
   <div className="ico l"><Icon/></div><h2>{h}</h2><p>{text}</p>{err&&<div className="mb12">{err}</div>}
   <div className="btns"><Btn kind="danger" onClick={act} disabled={busy}>{ok}</Btn><Btn kind="soft" onClick={()=>go('menu')} disabled={busy}>{t('fe.pm.cancel')}</Btn></div>
  </div>
 </Layer>;

 // A confirmation replaces the sheet with the prototype's `ask()` dialog in the same layer.
 if(view==='delete')return confirm(Trash2,couple?t('fe.pm.delTitleCouple'):t('fe.pm.delTitle'),couple?t('fe.pm.delTextCouple'):t('fe.pm.delText'),couple?t('fe.pm.hideOk'):t('fe.pm.delete'),del);
 if(view==='block')return confirm(Ban,t('fe.pm.blockTitle').replace('{name}',name),couple?t('fe.pm.blockTextCouple'):t('fe.pm.blockText'),t('fe.pm.block'),block);
 let content;
 if(view==='report')content=<>
  <div className="sh-b">
   <div role="radiogroup" aria-label={t('fe.pm.rp.reason')} className={shake?'shake':undefined}>
    {REASONS.map(k=><button key={k} type="button" className={'radio'+(reason===k?' on':'')} role="radio" aria-checked={reason===k} onClick={()=>{setReason(k);setFailure('');}}><i/><span className="tx">{t('fe.pm.rp.'+k)}</span></button>)}
   </div>
   <label className="field mt16"><span>{t('fe.pm.rp.details')}<i>{t('fe.pm.rp.optional')}</i></span>
    <textarea className="inp" rows={3} maxLength={500} value={details} onChange={e=>setDetails(e.target.value)}/></label>
   <div className="card list">
    <button type="button" className="li" role="switch" aria-checked={alsoBlock} onClick={()=>setAlsoBlock(v=>!v)}>
     <span className="tx"><b>{t('fe.pm.rp.alsoBlock')}</b><small>{t('fe.pm.rp.alsoBlockSub')}</small></span><span className={'sw'+(alsoBlock?' on':'')} aria-hidden="true"/>
    </button>
   </div>
   {err}
  </div>
  <div className="sh-f"><Btn kind="danger" onClick={report} disabled={busy}>{t('fe.pm.rp.send')}</Btn></div>
 </>;
 else content=<div className="sh-b"><div className="card list">
  {mine?<>
   <Row icon={Pencil} title={t('fe.pm.edit')} onClick={()=>{onClose();navigate('/n/feed/post/'+post.id+'/edit');}}/>
   <Row icon={Trash2} title={t('fe.pm.delete')} danger onClick={()=>go('delete')}/>
  </>:<>
   <Row icon={EyeOff} title={t('fe.pm.hidePost')} sub={t('fe.pm.hidePostSub')} onClick={()=>hide('post')} disabled={busy}/>
   <Row icon={UserX} title={t('fe.pm.hideAuthor')} sub={t('fe.pm.hideAuthorSub').replace('{name}',name)} onClick={()=>hide('author')} disabled={busy}/>
   <Row icon={Flag} title={t('fe.pm.report')} danger onClick={()=>go('report')}/>
   <Row icon={Ban} title={t('fe.pm.block')} sub={t('fe.pm.blockSub')} danger onClick={()=>go('block')}/>
  </>}
 </div>{err}</div>;

 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div ref={sheet} className="sheet on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>{head}{content}
  </div>
 </Layer>;
}
