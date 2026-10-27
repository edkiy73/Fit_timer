import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Clock,Heart,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Btn,Layer} from './ui';
import {useFe} from './session';

/** V21 Q03 «Профиль пары» on the Me tab (prototype meProfileLayer/meVisLayer with owner 'couple'): the members,
 * the banner of a change waiting for the partner (`decide.approvals`) and its sheet with what changes —
 * «Одобрить / Вернуть на доработку» for the partner, «Отменить изменения» for the one who proposed it.
 * The couple's profile itself is edited with the same profile commands; a widening change returns `pending`. */
const member=z.object({me:z.boolean(),profileId:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough();
const coupleRes=z.object({ok:z.literal(true),couple:z.object({id:z.uuid(),members:z.array(member)}).passthrough()});
const approval=z.object({id:z.uuid(),kind:z.string(),change:z.record(z.string(),z.unknown()).nullable(),summary:z.array(z.unknown()).nullable(),mine:z.boolean(),createdAt:z.string(),expiresAt:z.string()});
const approvalsRes=z.object({ok:z.literal(true),items:z.array(approval)});
const decided=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
type Member=z.infer<typeof member>;
type Approval=z.infer<typeof approval>;
/** What the sheet compares against: the couple's current public basics. */
export type CoupleBase={name:string|null,bio:string,photos:{id:string}[]};

const KINDS=['profile.update','profile.photos','profile.setVisibility','interests.set'];
const FIELDS=['name','bio','handle','cityId','showAge','detailsVis','photos','discoverMode','acceptProfileLikes','requestsFrom','linksFrom','mentionsFrom','activityVis','showLikes'];
const VALUES=['visible','hidden','all','matches','follow','followers','none'];
const nameOf=(m:Member|undefined)=>m?(m.name||(m.handle?'@'+m.handle:'?')):'?';

/** The couple's members, from `couple.get`. */
function useCoupleMembers(){
 const {call,acting}=useFe();const [members,setMembers]=useState<Member[]|null>(null);
 useEffect(()=>{
  if(acting?.kind!=='couple')return;
  const ctl=new AbortController();
  call('couple.get',{},coupleRes,{signal:ctl.signal}).then(r=>setMembers(r.couple.members)).catch(()=>{});
  return ()=>ctl.abort();
 },[call,acting]);
 return members;
}

/** «Участники» — both partners. */
export function CoupleMembers(){
 const {t}=useI18n();const members=useCoupleMembers();
 if(!members?.length)return null;
 return <section className="grp"><div className="grp-t"><span>{t('fe.cw.members')}</span></div><div className="card list">
  {members.map(m=><div key={m.profileId} className="li static"><Av name={nameOf(m)} seed={m.profileId} size="sm"/><span className="tx"><b>{nameOf(m)}</b>{m.handle&&m.name?<small>@{m.handle}</small>:null}</span></div>)}
 </div></section>;
}

/** Banners of the couple's pending changes; `tick` changes after every own write so a new `pending` shows at once. */
export function CouplePending({base,tick,onDecided}:{base:CoupleBase,tick:number,onDecided:(msg:string)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const members=useCoupleMembers();
 const [items,setItems]=useState<Approval[]>([]);const [open,setOpen]=useState<Approval|null>(null);
 const load=useCallback(()=>{
  if(acting?.kind!=='couple')return;
  call('decide.approvals',{},approvalsRes).then(r=>setItems(r.items)).catch(()=>{});
 },[call,acting]);
 useEffect(()=>{load();},[load,tick]);
 if(acting?.kind!=='couple'||!items.length)return null;
 const other=nameOf(members?.find(m=>!m.me));
 return <>
  {items.map(a=><button key={a.id} type="button" className={'alert me18-ban'+(a.mine?'':' warn')} onClick={()=>setOpen(a)}>
   <Clock/><span><b>{a.mine?t('fe.cw.mineTitle',{name:other}):t('fe.cw.theirsTitle',{name:other})}</b>{kindTitle(a,t)} · {a.mine?t('fe.cw.mineSub'):t('fe.cw.theirsSub')}</span>
  </button>)}
  {open&&<ApprovalSheet a={open} base={base} partner={other} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);load();onDecided(msg);}}/>}
 </>;
}

const kindTitle=(a:Approval,t:(k:string)=>string)=>t('fe.cw.kind.'+(KINDS.includes(a.kind)?a.kind:'other'));

/** `ACT.pairReview` sheet: what would change, then the decision. */
function ApprovalSheet({a,base,partner,onClose,onDone}:{a:Approval,base:CoupleBase,partner:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const sheet=useRef<HTMLDivElement>(null);const op=useRef(newOpId());
 useEffect(()=>{sheet.current?.focus({preventScroll:true});},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[onClose]);
 const run=async(action:'approve'|'return'|'cancel')=>{
  if(busy)return;setBusy(true);setFailure('');
  try{
   const r=action==='cancel'?await call('decide.cancel',{opId:op.current,approvalId:a.id},decided)
    :await call('decide.approval',{opId:op.current,approvalId:a.id,choice:action},decided);
   const state=r.state??(action==='cancel'?'cancelled':action==='approve'?'approved':'returned');
   onDone(t('fe.cw.done.'+(['approved','returned','cancelled','expired'].includes(state)?state:'cancelled')));
  }catch(e){setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 const title=t('fe.cw.sheetTitle');
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div ref={sheet} className="sheet on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h"><div className="sh-ht"><h2>{title}</h2><p>{kindTitle(a,t)}</p></div>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.cw.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">
    <p className="lead">{a.mine?t('fe.cw.leadMine'):t('fe.cw.leadTheirs',{name:partner})}</p>
    <Diff a={a} base={base}/>
    {failure&&<div className="alert err mt12" role="alert"><span>{failure}</span></div>}
   </div>
   <div className="sh-f">{a.mine
    ?<Btn kind="soft" disabled={busy} onClick={()=>run('cancel')}>{t('fe.cw.cancel')}</Btn>
    :<><Btn disabled={busy} onClick={()=>run('approve')}>{t('fe.cw.approve')}</Btn><Btn kind="soft" className="mt8" disabled={busy} onClick={()=>run('return')}>{t('fe.cw.return')}</Btn></>}
   </div>
  </div>
 </Layer>;
}

/** `proposalDiff()` — field by field, the old value struck through where the screen knows it. */
function Diff({a,base}:{a:Approval,base:CoupleBase}){
 const {t}=useI18n();const c=a.change??{};
 const label=(f:string)=>t('fe.cw.field.'+(FIELDS.includes(f)?f:'other'));
 const word=(v:unknown):string=>{
  if(v===null||v===undefined||v==='')return t('fe.cw.empty');
  if(typeof v==='boolean')return v?t('fe.cw.on'):t('fe.cw.off');
  if(Array.isArray(v))return v.map(word).join(', ');
  if(typeof v==='string'&&VALUES.includes(v))return t('fe.cw.val.'+v);
  if(typeof v==='string'&&['only','granted'].includes(v))return t('fe.reg.vis.'+v);
  return String(v).slice(0,300);
 };
 const rows:{k:string,label:string,was?:string,now:string}[]=[];
 if(a.kind==='profile.update'){
  for(const [k,v] of Object.entries(c)){if(k==='rev')continue;
   const was=k==='name'?base.name??'':k==='bio'?base.bio:undefined;
   rows.push({k,label:label(k),now:word(v),...(was!==undefined&&was!==v?{was:was||t('fe.cw.empty')}:{})});}
 }else if(a.kind==='profile.photos'){
  const ids=Array.isArray(c.assetIds)?c.assetIds:[];const adds=Array.isArray(c.adds)?c.adds:[];
  rows.push({k:'photos',label:label('photos'),was:String(base.photos.length),now:t('fe.cw.photosNow',{n:ids.length})+' · '+t('fe.cw.photosAdd',{n:adds.length})});
 }else if(a.kind==='profile.setVisibility'&&typeof c.setting==='string'){
  rows.push({k:c.setting,label:label(c.setting),now:word(c.value)});
 }else for(const s of a.summary??[])if(typeof s==='string')rows.push({k:s,label:label(s),now:word(c[s])});
 if(!rows.length)return <p className="note">{t('fe.cw.noDiff')}</p>;
 return <dl className="diff">{rows.map(r=><div key={r.k}><dt>{r.label}</dt><dd>{r.was!==undefined&&<div className="was">{r.was}</div>}<div className="now">{r.now}</div></dd></div>)}</dl>;
}

/** The «Пара» group of the visibility layer: partner approval and unlinking live on the pair screen (Q01/Q06). */
export function CoupleVisGroup(){
 const {t}=useI18n();const navigate=useNavigate();
 return <section className="grp"><div className="grp-t"><span>{t('fe.cw.pair')}</span></div><div className="card list">
  <button type="button" className="li" onClick={()=>navigate('/n/me/pair')}><span className="ico v"><Heart/></span><span className="tx"><b>{t('fe.cw.pairSettings')}</b><small>{t('fe.cw.pairSettingsSub')}</small></span></button>
 </div><p className="grp-n">{t('fe.cw.visFoot')}</p></section>;
}
