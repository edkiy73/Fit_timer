import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Calendar,Eye,FileText,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,View,Skel} from './ui';
import {useFe} from './session';
import {useToast} from './toast';
import {when} from './feed';
import {Sheet} from './profile-extras';
import {Ask} from './settings-ui';

/** V21 «Скрытое в ленте» (`ACT.feedHidden`, FEED-011 — a sheet over Settings, also reachable as a screen) and
 * «Заблокированные» (P12) on /api/fe. */
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

/** The hidden-from-feed list of the acting profile, grouped like the prototype's sheet. */
function useHidden(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
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
 return {items,error,load,busy,key,unhide};
}

function HiddenList({h}:{h:ReturnType<typeof useHidden>}){
 const {t}=useI18n();
 const {items,error,load,busy,key,unhide}=h;
 const row=(x:Hidden)=>{
  const name=nameOf(x.target);
  const title=x.kind==='post'?(x.target?.excerpt?.trim()||t('fe.tl.h.post')):x.kind==='event'?t('fe.tl.h.event'):(name||t('fe.tl.h.unavailable'));
  const sub=x.kind==='post'?(x.target?'':t('fe.tl.h.unavailable')):x.kind==='author'?t('fe.tl.h.authorSub'):x.kind==='activity'?t('fe.tl.h.activitySub'):'';
  return <div key={key(x)} className="li">
   {(x.kind==='author'||x.kind==='activity')&&x.target?<Av name={name} seed={x.target.id} size="sm"/>:<span className="ico">{x.kind==='event'?<Calendar/>:<FileText/>}</span>}
   <span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>
   <Btn kind="soft" size="sm" onClick={()=>void unhide(x)} busy={busy===key(x)} disabled={!!busy} aria-label={t('fe.tl.h.show')+': '+title}>{t('fe.tl.h.show')}</Btn>
  </div>;
 };
 if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 if(items===null)return <Skel kind="list"/>;
 if(!items.length)return <Empty icon={Eye} title={t('fe.tl.h.empty')} text={t('fe.tl.h.emptyText')}/>;
 return <>
  {GROUPS.map(([kind,label])=>{const list=items.filter(x=>x.kind===kind);return list.length?<div key={kind}>
   <div className="sec">{t('fe.tl.h.'+label)} · {list.length}</div><div className="card list">{list.map(row)}</div>
  </div>:null;})}
  <p className="grp-n">{t('fe.tl.h.note')}</p>
 </>;
}

/** The prototype opens «Скрытое в ленте» as a sheet (`ACT.feedHidden`); the feed can open it too. */
export function HiddenFeedSheet({onClose}:{onClose:()=>void}){
 const {t}=useI18n();const {acting,state}=useFe();const h=useHidden();
 const hasCouple=state.status==='ready'&&state.boot.profiles.some(p=>p.kind==='couple'&&p.state!=='deleted');
 return <Sheet title={t('fe.tl.h.title')} onClose={onClose}>
  {hasCouple&&<p className="note" style={{margin:'0 0 8px'}}>{acting?.kind==='couple'?t('fe.tl.h.feedCouple'):t('fe.tl.h.feedMine')}</p>}
  <HiddenList h={h}/>
 </Sheet>;
}

export function HiddenFeedScreen(){
 const {t}=useI18n();const {acting}=useFe();const h=useHidden();
 return <>
  <Bar title={t('fe.tl.h.title')} back="/n/settings"/>
  <View className="nodock compact">
   {acting?.kind==='couple'&&<p className="note" style={{margin:'0 0 12px'}}>{t('fe.tl.h.couple')}</p>}
   <HiddenList h={h}/>
  </View>
 </>;
}

export function BlockedScreen(){
 const {call,acting,state}=useFe();const {t,locale}=useI18n();const toast=useToast();
 const [items,setItems]=useState<Blocked[]|null>(null);const [error,setError]=useState<unknown>(null);
 // The account's other profile (person ↔ couple): its blocks say who is «blocked for both of you».
 const other=state.status==='ready'?state.boot.profiles.find(p=>p.state!=='deleted'&&p.id!==acting?.id&&(p.kind==='couple')!==(acting?.kind==='couple')):undefined;
 const [otherIds,setOtherIds]=useState<Set<string>>(new Set());
 const [ask,setAsk]=useState<Blocked|null>(null);const [busy,setBusy]=useState('');const [failure,setFailure]=useState('');
 const couple=acting?.kind==='couple';
 const load=useCallback(()=>{setError(null);call('blocks.list',{},blockedRes).then(r=>setItems(r.items)).catch(setError);
  if(other)call('blocks.list',{},blockedRes,{profileId:other.id}).then(r=>setOtherIds(new Set(r.items.map(x=>x.id)))).catch(()=>{});},[call,other?.id]);
 useEffect(()=>{load();},[load]);
 const unblock=async(b:Blocked)=>{
  if(busy)return;setBusy('u:'+b.id);setFailure('');
  try{
   await call('block.set',{opId:newOpId(),profileId:b.id,on:false},ok);
   setItems(list=>list?.filter(x=>x.id!==b.id)??null);setAsk(null);toast(t('fe.tl.b.done'),{type:'ok'});
  }catch(e){setFailure(feErrorMessage(e,t));}
  finally{setBusy('');}
 };
 const both=async(b:Blocked)=>{
  if(busy)return;setBusy('b:'+b.id);
  try{
   await call('block.set',{opId:newOpId(),profileId:b.id,on:true,alsoFor:couple?'me':'partner'},ok);
   setOtherIds(s=>new Set([...s,b.id]));toast(t('fe.tl.b.bothDone'),{type:'ok'});
  }catch(e){toast(feErrorMessage(e,t),{type:'err'});}
  finally{setBusy('');}
 };
 const closeAsk=useCallback(()=>{setAsk(null);setFailure('');},[]);
 const askName=ask?nameOf(ask)||'?':'';
 return <>
  <Bar title={t('fe.tl.b.title')} back="/n/settings"/>
  <View className="nodock compact">
   <p className="note" style={{margin:'0 0 12px'}}>{other?(couple?t('fe.tl.b.noteCouple').replace('{name}',nameOf(acting)):t('fe.tl.b.noteMine')):t('fe.tl.b.note')}</p>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list"/>
    :items.length===0?<Empty icon={Ban} title={t('fe.tl.b.empty')} text={t('fe.tl.b.emptyText')}/>
    :<div className="card list">{items.map(b=>{const name=nameOf(b)||'?';const forBoth=otherIds.has(b.id);
     return <div key={b.id} className="li">
      <Av name={name} seed={b.id}/>
      <span className="tx" style={{flex:'1 1 auto',minWidth:0}}><b>{name}</b><small>{(forBoth?t('fe.tl.b.both'):t('fe.tl.b.blocked'))+' '+when(b.created_at,locale)}</small>
       {other&&!forBoth&&<span style={{display:'block',marginTop:4}}><Btn kind="text" size="sm" auto onClick={()=>void both(b)} busy={busy==='b:'+b.id} disabled={!!busy}>{couple?t('fe.tl.b.forMe'):t('fe.tl.b.forCouple')}</Btn></span>}</span>
      <span style={{flex:'none'}}><Btn kind="soft" size="sm" onClick={()=>{setAsk(b);setFailure('');}} disabled={!!busy}>{t('fe.tl.b.unblock')}</Btn></span>
     </div>;})}</div>}
  </View>
  {ask&&<Ask icon={Ban} title={t('fe.tl.b.askTitle').replace('{name}',askName)}
   text={couple?t('fe.tl.b.askTextCouple').replace('{name}',askName).replace('{pair}',nameOf(acting)):t('fe.tl.b.askText')}
   ok={t('fe.tl.b.unblock')} busy={busy==='u:'+ask.id} error={failure} onOk={()=>void unblock(ask)} onCancel={closeAsk}/>}
 </>;
}
