import {useCallback,useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActingAv,Av,Btn,NoteDecision,PersonLine} from './kit';
import {useFe,useLive} from './session';
import {useToast} from './toast';

/** «Нужно решить» → the relationship status (owner 04.11.2026): a person in a couple whose «Данные» say «не в
 * отношениях» or nothing gets one card in the list of decisions, like an invitation — «Поменять» sets «в отношениях»,
 * «Оставить» keeps it as it is (`profile.statusKeep`, on every device). The server counts it as one of the account's
 * decisions (server/commands/inbox.mjs, kind `status`), so «Я», the dock, the bell and «Действовать как» agree. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const prof=z.object({ok:z.literal(true),profile:z.object({id:z.string(),rev:z.number().optional(),statusKept:z.boolean().optional(),details:z.record(z.string(),z.unknown())}).passthrough()});
const coupleRes=z.object({ok:z.literal(true),couple:z.object({members:z.array(z.object({me:z.boolean(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough())}).passthrough()});
const listeners=new Set<()=>void>();

export function useStatusTodo(){
 const {state,call}=useFe();
 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const person=profiles.find(p=>p.kind==='person');const couple=profiles.find(p=>p.kind==='couple');
 const [p,setP]=useState<z.infer<typeof prof>['profile']|null>(null);const [partner,setPartner]=useState('');
 const load=useCallback(()=>{
  if(!person||!couple)return;
  call('profile.get',{profileId:person.id},prof,{profileId:person.id}).then(r=>setP(r.profile)).catch(()=>{});
  call('couple.get',{},coupleRes,{profileId:couple.id}).then(r=>{const o=r.couple.members.find(m=>!m.me);setPartner(o?(o.name||(o.handle?'@'+o.handle:'')):'');}).catch(()=>{});
 },[call,person?.id,couple?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{load();listeners.add(load);return ()=>{listeners.delete(load);};},[load]);
 useLive(['profile','couple'],load);
 const status=p&&typeof p.details.status==='string'?p.details.status:null;
 const show=!!person&&!!couple&&!!p&&!p.statusKept&&(!status||status==='single');
 return {show,status,partner,person,couple,p};
}
const changed=()=>{for(const f of listeners)f();};
/** Calls `f` when this card is answered on this device (the counters read again). */
export function onStatusAnswered(f:()=>void){listeners.add(f);return ()=>{listeners.delete(f);};}

export function StatusDecision(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const navigate=useNavigate();
 const s=useStatusTodo();const [busy,setBusy]=useState('');
 if(!s.show||!s.p||!s.person||!s.couple)return null;
 const {p,person,couple,status}=s;const name=s.partner||t('fe.mx.stat.partner');
 const fix=async()=>{setBusy('y');
  try{await call('profile.update',{opId:newOpId(),rev:p.rev,status:'partnered'},ok,{profileId:person.id});changed();
   toast(t('fe.w7.stat.done'),{type:'ok',action:{label:t('fe.mx.undo'),fn:()=>void(async()=>{
    try{const cur=await call('profile.get',{profileId:person.id},prof,{profileId:person.id});await call('profile.update',{opId:newOpId(),rev:cur.profile.rev,status},ok,{profileId:person.id});changed();toast(t('fe.w7.stat.undone'),{type:'ok'});}
    catch(e){toast(feErrorMessage(e,t),{type:'err'});}})()}});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy('');}};
 const keep=async()=>{setBusy('n');
  try{await call('profile.statusKeep',{opId:newOpId()},ok,{asAccount:true});changed();}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy('');}};
 return <NoteDecision id="item-status" openLabel={t('fe.mx.stat.rowTitle')} onOpen={()=>navigate('/n/me/edit?only=details')}
  person={<PersonLine av={<ActingAv p={couple} size=""/>} name={t('fe.mx.stat.rowTitle')} sub={couple.name||undefined}/>}
  action={t(status?'fe.mx.stat.single':'fe.mx.stat.none',{name})}
  actions={<><Btn size="md" busy={busy==='y'} disabled={!!busy} onClick={()=>void fix()}>{t('fe.mx.stat.fix')}</Btn>
   <Btn size="md" kind="soft" busy={busy==='n'} disabled={!!busy} onClick={()=>void keep()}>{t('fe.mx.stat.keep')}</Btn></>}/>;
}
