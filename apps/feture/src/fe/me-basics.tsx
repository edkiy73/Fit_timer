import {useEffect,useId,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Cake} from 'lucide-react';
import {FeError,dayMonth,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Counter,Field,Input,Sheet,TextArea,ToggleRow} from './kit';
import {PlacePicker,type Place} from './kit/Place';
import {FIELD,textLength} from './kit/validate';
import {useFe} from './session';
import {useToast} from './toast';
import {NICK,nickAnswer} from './register';
import type {Profile} from './me';

/** «Основное» of «Я», edited in place (owner 04.11.2026): one small sheet per value instead of a whole editor screen.
 * The server keeps its rules (name and nick limits, a couple's change waiting for the partner). */
export type BasicKey='name'|'handle'|'bio'|'city';
const done=z.object({ok:z.literal(true)}).passthrough();
const places=z.object({ok:z.literal(true),places:z.array(z.object({id:z.string(),code:z.string().nullable().optional(),country:z.string().optional(),ru:z.string(),en:z.string()})).optional()}).passthrough();

function useSave(p:Profile,onSaved:()=>void){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const save=async(patch:Record<string,unknown>)=>{
  setBusy(true);setFailure('');
  try{const r=await call('profile.update',{opId:newOpId(),rev:p.rev,...patch},done);
   toast(r.pending?t('fe.me.pending'):t(p.kind==='couple'?'fe.me.savedUs':'fe.me.saved'),{type:'ok'});onSaved();}
  catch(e){setFailure(e instanceof FeError&&e.fields?.includes('handle')?t('fe.reg.nick.taken'):feErrorMessage(e,t));}
  finally{setBusy(false);}
 };
 return {busy,failure,setFailure,save};
}

/** «Показывать возраст» with the age itself as the hint; saved at once. */
export function BasicAge({p,onChanged}:{p:Profile,onChanged?:(()=>void)|undefined}){
 const {t}=useI18n();const on=p.showAge!==false;
 const {busy,failure,save}=useSave(p,()=>onChanged?.());
 return <><ToggleRow icon={Cake} title={t('fe.mx.ed.showAge')} sub={String(p.age)} on={on} disabled={busy} onClick={()=>void save({showAge:!on})}/>
  {failure&&<Alert kind="err" noIcon>{failure}</Alert>}</>;
}

export function BasicSheet({k,p,onClose,onSaved}:{k:BasicKey,p:Profile,onClose:()=>void,onSaved:()=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const id=useId();const cp=p.kind==='couple';
 const start=k==='name'?p.chosenName??'':k==='handle'?p.handle??'':k==='bio'?p.bio:'';
 const [v,setV]=useState(start);
 const {busy,failure,setFailure,save}=useSave(p,onSaved);
 const [list,setList]=useState<Place[]|null>(null);
 useEffect(()=>{if(k==='city')call('catalog.get',{},places,{asAccount:true}).then(r=>setList(r.places??[])).catch(()=>setList([]));},[call,k]);
 if(k==='city'){
  if(!list)return null;
  const add=async(country:string,name:string):Promise<Place>=>{
   const r=await call('place.submit',{opId:newOpId(),country,name},z.object({placeId:z.string()}),{asAccount:true});
   toast(t('fe.kit.place.added',{name}),{type:'ok'});return {id:r.placeId,country,ru:name,en:name,pending:true};};
  return <PlacePicker places={list} current={typeof p.cityId==='string'?p.cityId:p.city?.id??null} clear={t('fe.mx.ed.noCity')} add={add}
   onPick={x=>void save({cityId:x?.id??null})} onClose={onClose}/>;
 }
 const locked=k==='name'?p.nameAt:k==='handle'?p.nickAt:null;
 const submit=async()=>{
  const x=v.trim();if(x===start.trim()){onClose();return;}
  if(k==='handle'){
   if(!NICK.test(x)||/\.\./.test(x)||!/[A-Za-z]/.test(x)){setFailure(t('fe.reg.nick.format'));return;}
   const r=await call('nick.check',{handle:x},nickAnswer,{asAccount:true}).catch(()=>null);
   if(r&&!r.available){setFailure(t('fe.reg.nick.'+(r.reason==='reserved'?'reserved':'taken')));return;}
  }
  await save({[k]:x});
 };
 const title=k==='name'?(cp?t('fe.nn.nameUs'):t('fe.nn.name')):k==='handle'?(cp?t('fe.nn.nickUs'):t('fe.nn.nick')):t('fe.mx.ed.about');
 const hint=k==='name'?(p.nameAt?t('fe.nn.nameAt',{date:dayMonth(p.nameAt)}):cp?t('fe.nn.nameHintUs'):t('fe.nn.nameHint'))
  :k==='handle'?(p.nickAt?t('fe.nn.nickAt',{date:dayMonth(p.nickAt)}):p.nickFirst?t('fe.nn.nickFirst'):t('fe.nn.nickEvery')):undefined;
 return <Sheet title={title} onClose={onClose} dirty={v!==start&&!busy}
  foot={<Btn onClick={()=>void submit()} disabled={busy||!!locked} busy={busy}>{t('fe.me.save')}</Btn>}>
  {k==='bio'?<Field id={id} name="bio"><TextArea id={id} rows={5} value={v} maxLength={FIELD.bio.max} placeholder={t('fe.mx.ed.aboutPh')} aria-label={title} onChange={e=>setV(e.target.value)}/><Counter n={textLength(v)} max={FIELD.bio.max}/></Field>
   :k==='handle'?<Field id={id} name="handle" hint={hint}><div className="inwrap"><AtSign/><Input id={id} value={v} maxLength={20} autoCapitalize="off" spellCheck={false} disabled={!!locked} aria-label={title}
     onChange={e=>{setV(e.target.value.replace(/^@/,''));setFailure('');}}/></div></Field>
   :<Field id={id} name="name" hint={hint}><Input id={id} value={v} maxLength={FIELD.profileName.max} disabled={!!locked} placeholder={cp?'':p.handle??''} aria-label={title} onChange={e=>setV(e.target.value)}/></Field>}
  {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
 </Sheet>;
}
