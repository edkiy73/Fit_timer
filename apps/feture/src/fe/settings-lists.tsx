import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Calendar,Eye,FileText,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,View} from './ui';
import {useFe} from './session';
import {useToast} from './toast';
import {when} from './feed';

/** V21 «Скрытое в ленте» (`ACT.feedHidden`, FEED-011) and «Заблокированные» (P12) as settings screens on /api/fe. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const who=z.object({id:z.string(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()});
const hiddenItem=z.object({kind:z.enum(['post','author','activity','event']),target_id:z.string(),created_at:z.string(),
 target:z.object({id:z.string(),handle:z.string().nullable().optional(),name:z.string().nullable().optional(),excerpt:z.string().nullable().optional()}).nullable()});
type Hidden=z.infer<typeof hiddenItem>;
const hiddenRes=z.object({ok:z.literal(true),items:z.array(hiddenItem)}).passthrough();
const blockedItem=who.extend({created_at:z.string(),kind:z.string()});
type Blocked=z.infer<typeof blockedItem>;
const blockedRes=z.object({ok:z.literal(true),items:z.array(blockedItem)}).passthrough();

const nameOf=(a:{name?:string|null|undefined,handle?:string|null|undefined}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'');
const GROUPS=[['post','posts'],['author','authors'],['activity','activity'],['event','events']] as const;

export function HiddenFeedScreen(){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();
 const [items,setItems]=useState<Hidden[]|null>(null);const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState('');
 const load=useCallback(()=>{setError(null);call('feedHide.list',{},hiddenRes).then(r=>setItems(r.items)).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const key=(h:Hidden)=>h.kind+':'+h.target_id;
 const unhide=async(h:Hidden)=>{
  if(busy)return;setBusy(key(h));
  try{
   await call('feedHide.set',{opId:newOpId(),kind:h.kind,targetId:h.target_id,on:false},ok);
   setItems(list=>list?.filter(x=>key(x)!==key(h))??null);
   const name=nameOf(h.target);
   toast(h.kind==='post'?t('fe.tl.h.postBack'):h.kind==='event'?t('fe.tl.h.eventBack'):name?t('fe.tl.h.authorBack').replace('{name}',name):t('fe.tl.restored'),{type:'ok'});
  }catch(e){toast(feErrorMessage(e,t),{type:'err'});}
  finally{setBusy('');}
 };
 const row=(h:Hidden)=>{
  const name=nameOf(h.target);
  const title=h.kind==='post'?(h.target?.excerpt?.trim()||t('fe.tl.h.post')):h.kind==='event'?t('fe.tl.h.event'):(name||t('fe.tl.h.unavailable'));
  const sub=h.kind==='post'?(h.target?'':t('fe.tl.h.unavailable')):h.kind==='author'?t('fe.tl.h.authorSub'):h.kind==='activity'?t('fe.tl.h.activitySub'):'';
  return <div key={key(h)} className="li">
   {(h.kind==='author'||h.kind==='activity')&&h.target?<Av name={name} seed={h.target.id} size="sm"/>:<span className="ico">{h.kind==='event'?<Calendar/>:<FileText/>}</span>}
   <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>
   <Btn kind="soft" size="sm" onClick={()=>void unhide(h)} disabled={!!busy} aria-label={t('fe.tl.undo')+': '+title}>{t('fe.tl.undo')}</Btn>
  </div>;
 };
 return <>
  <Bar title={t('fe.tl.h.title')} back="/n/settings"/>
  <View className="nodock compact">
   {acting?.kind==='couple'&&<p className="note" style={{margin:'0 0 12px'}}>{t('fe.tl.h.couple')}</p>}
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<p className="note" role="status">{t('fe.loading')}</p>
    :items.length===0?<Empty icon={Eye} title={t('fe.tl.h.empty')} text={t('fe.tl.h.emptyText')}/>
    :<>
     {GROUPS.map(([kind,label])=>{const list=items.filter(h=>h.kind===kind);return list.length?<div key={kind}>
      <div className="sec">{t('fe.tl.h.'+label)} · {list.length}</div><div className="card list">{list.map(row)}</div>
     </div>:null;})}
     <p className="grp-n">{t('fe.tl.h.note')}</p>
    </>}
  </View>
 </>;
}

export function BlockedScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const toast=useToast();
 const [items,setItems]=useState<Blocked[]|null>(null);const [error,setError]=useState<unknown>(null);
 const [ask,setAsk]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const couple=acting?.kind==='couple';
 const load=useCallback(()=>{setError(null);call('blocks.list',{},blockedRes).then(r=>setItems(r.items)).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const unblock=async(b:Blocked)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{
   await call('block.set',{opId:newOpId(),profileId:b.id,on:false},ok);
   setItems(list=>list?.filter(x=>x.id!==b.id)??null);setAsk(null);toast(t('fe.tl.b.done'),{type:'ok'});
  }catch(e){setFailure(feErrorMessage(e,t));}
  finally{setBusy(false);}
 };
 return <>
  <Bar title={t('fe.tl.b.title')} back="/n/settings"/>
  <View className="nodock compact">
   <p className="note" style={{margin:'0 0 12px'}}>{couple?t('fe.tl.b.noteCouple').replace('{name}',nameOf(acting)):t('fe.tl.b.note')}</p>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<p className="note" role="status">{t('fe.loading')}</p>
    :items.length===0?<Empty icon={Ban} title={t('fe.tl.b.empty')} text={t('fe.tl.b.emptyText')}/>
    :<div className="card list">{items.map(b=>{const name=nameOf(b)||'?';return ask===b.id
     ?<div key={b.id} className="li" role="group" aria-label={t('fe.tl.b.askTitle').replace('{name}',name)} style={{flexWrap:'wrap'}}>
      <Av name={name} seed={b.id} size="sm"/>
      <span className="tx"><b>{t('fe.tl.b.askTitle').replace('{name}',name)}</b><small>{couple?t('fe.tl.b.askTextCouple').replace('{name}',name).replace('{pair}',nameOf(acting)):t('fe.tl.b.askText')}</small></span>
      {failure&&<div className="alert err" role="alert" style={{flexBasis:'100%'}}><span>{failure}</span></div>}
      <div className="btns" style={{flexBasis:'100%'}}>
       <Btn kind="danger" size="sm" onClick={()=>void unblock(b)} disabled={busy} autoFocus>{t('fe.tl.b.unblock')}</Btn>
       <Btn kind="text" size="sm" onClick={()=>{setAsk(null);setFailure('');}} disabled={busy}>{t('fe.cancel')}</Btn>
      </div>
     </div>
     :<div key={b.id} className="li">
      <Av name={name} seed={b.id} size="sm"/>
      <span className="tx"><b>{name}</b><small>{t('fe.tl.b.since').replace('{when}',when(b.created_at,locale))}</small></span>
      <Btn kind="soft" size="sm" onClick={()=>{setAsk(b.id);setFailure('');}} disabled={busy}>{t('fe.tl.b.unblock')}</Btn>
     </div>;})}</div>}
  </View>
 </>;
}
