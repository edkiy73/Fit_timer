import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Eye,EyeOff,Gavel,History,UserX,Ban} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Ask,Btn,Card,Empty,Field,Note,RadioList,Row,Sheet,Skel,Stack,TextArea} from './kit';
import {textError} from './kit/validate';
import {useFe} from './session';
import {useFail,useToast} from './toast';
import {Measures} from './staff';
import {useModRoles,type ModTarget} from './mod-row';

/** The moderator's second sheet (owner 06.11.2026): every action says what it does and on whom, then a sheet with the
 * reason, the note and what follows. Removing a thing is new (`staff.takedown`); restricting and blocking are the staff
 * area's own measures sheet (`Measures`), watching and the history are `staff.watch` and `staff.history`. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const watchRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string()}).passthrough())});
const historyRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.union([z.string(),z.number()]),action:z.string(),rule:z.string().nullable(),note:z.string().nullable(),created_at:z.string(),
 staff_handle:z.string().nullable(),staff_name:z.string().nullable()}).passthrough())});
const RULES=['minors','threats','private_material','spam','illegal','community_rules'] as const;

const who=(o:{name?:string|null|undefined,handle?:string|null|undefined}|null)=>o?(o.name||(o.handle?'@'+o.handle:'?')):'?';
const roleOf=(k:ModTarget['kind'])=>k==='community'?'owner':k==='event'?'organizer':k==='profile'?'none':'author';
const fixSpaces=(s:string)=>s.replace(/\s+/g,' ').trim();

type View='menu'|'remove'|'restrict'|'suspend'|'watch'|'history';
export default function ModActions({target,onClose,onDone}:{target:ModTarget,onClose:()=>void,onDone:(what:'removed'|'measure'|'watch')=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const roles=useModRoles();
 const [view,setView]=useState<View>('menu');
 const [watched,setWatched]=useState<boolean|null>(null);
 const mod=roles.some(r=>r==='owner'||r==='lead'||r==='moderator');
 const person=target.owner;const name=who(person);const role=t('fe.mod.role.'+roleOf(target.kind));const cap=t('fe.mod.cap.'+roleOf(target.kind));
 const title=target.title??'';
 const thing=target.kind==='community'||target.kind==='event'?{name:title}:{who:name};
 const loadWatched=useCallback(()=>{if(!mod||!person)return;call('staff.watchList',{},watchRes,{asAccount:true,fresh:true}).then(r=>setWatched(r.items.some(x=>x.id===person.id))).catch(()=>setWatched(null));},[call,mod,person]);
 useEffect(()=>{loadWatched();},[loadWatched]);
 const act=(k:'restrict'|'suspend'|'watch'|'unwatch')=>fixSpaces(t('fe.mod.'+k,{role,who:name}));
 const removeTitle=t('fe.mod.remove.'+target.kind,{...thing,who:name});

 if(view==='remove'&&target.kind!=='profile')return <RemoveSheet target={target} label={removeTitle} cap={cap} onBack={()=>setView('menu')} onDone={()=>{toast(t('fe.mod.removed'),{type:'ok'});onDone('removed');}}/>;
 if((view==='restrict'||view==='suspend')&&person)return <Measures profileId={person.id} name={name} startKind={view} onClose={()=>setView('menu')} onApplied={()=>{toast(t('fe.mod.measureDone'),{type:'ok'});onDone('measure');}}/>;
 if(view==='watch'&&person)return <WatchSheet who={name} profileId={person.id} on={!watched} onBack={()=>setView('menu')} onDone={on=>{toast(t(on?'fe.mod.watched':'fe.mod.unwatched'),{type:'ok'});onDone('watch');}}/>;
 if(view==='history')return <HistorySheet target={target} label={t('fe.mod.sub.'+target.kind,{...thing,who:name})} onBack={()=>setView('menu')}/>;
 return <Sheet title={t('fe.mod.title')} sub={t('fe.mod.sub.'+target.kind,{...thing,who:name})} onClose={onClose}>
  <Card list>
   {mod&&target.kind!=='profile'&&<Row noChev icon={EyeOff} danger title={removeTitle} sub={t('fe.mod.remove.sub',{cap})} onClick={()=>setView('remove')}/>}
   {mod&&person&&<Row noChev icon={UserX} title={act('restrict')} onClick={()=>setView('restrict')}/>}
   {mod&&person&&<Row noChev icon={Ban} danger title={act('suspend')} onClick={()=>setView('suspend')}/>}
   {mod&&person&&watched!==null&&<Row noChev icon={watched?EyeOff:Eye} title={act(watched?'unwatch':'watch')} onClick={()=>setView('watch')}/>}
   <Row noChev icon={History} title={t('fe.mod.history.of.'+target.kind,{...thing,who:name})} onClick={()=>setView('history')}/>
  </Card>
 </Sheet>;
}

/** Removing the thing: the rule, a note, then one more question that says what follows. */
function RemoveSheet({target,label,cap,onBack,onDone}:{target:ModTarget,label:string,cap:string,onBack:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const setFailure=useFail();
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);const [busy,setBusy]=useState(false);
 const noteErr=textError(t,'staffNote',note);
 const info=t('fe.mod.remove.info',{what:t('fe.mod.what.'+target.kind),cap});
 const run=async()=>{setBusy(true);setFailure('');
  try{await call('staff.takedown',{opId:newOpId(),targetType:target.kind,targetId:target.id,rule,note:note.trim()},ok,{asAccount:true});onDone();}
  catch(e){setAsk(false);setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <>
  <Sheet title={label} onClose={onBack} dirty={!!rule||!!note.trim()}
   foot={<Btn kind="danger" icon={Gavel} disabled={!rule||!!noteErr} onClick={()=>setAsk(true)}>{label}</Btn>}>
   <Stack gap={4}>
    <Field label={t('fe.mod.rule')}><RadioList label={t('fe.mod.rule')} value={rule||null} onChange={v=>setRule(v)} options={RULES.map(id=>[id,t('fe.staff.rule.'+id)] as const)}/></Field>
    <Field label={t('fe.mod.note')} error={note.trim()?noteErr:undefined}><TextArea rows={3} value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></Field>
    <Note>{info}</Note>
   </Stack>
  </Sheet>
  {ask&&<Ask icon={EyeOff} danger title={label} text={info} ok={t('fe.mod.remove.ok')} busy={busy} onOk={()=>void run()} onCancel={()=>setAsk(false)}/>}
 </>;
}

/** The internal «watch» mark of a person (staff.watch): on with a note, or off. */
function WatchSheet({who:name,profileId,on,onBack,onDone}:{who:string,profileId:string,on:boolean,onBack:()=>void,onDone:(on:boolean)=>void}){
 const {call}=useFe();const {t}=useI18n();const setFailure=useFail();
 const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 const go=async()=>{setBusy(true);setFailure('');
  try{await call('staff.watch',{opId:newOpId(),profileId,on,note:on?note.trim():''},ok,{asAccount:true});onDone(on);}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet title={t('fe.mod.watch.title',{who:name})} onClose={onBack}
  foot={<Btn busy={busy} icon={on?Eye:EyeOff} onClick={()=>void go()}>{t(on?'fe.mod.watch.ok':'fe.mod.unwatch',{role:'',who:name}).replace(/\s+/g,' ').trim()}</Btn>}>
  <Stack gap={4}>
   {on&&<Field label={t('fe.mod.watch.note')}><TextArea rows={2} value={note} maxLength={300} onChange={e=>setNote(e.target.value)}/></Field>}
   {on&&<Note>{t('fe.mod.watch.info',{who:name})}</Note>}
  </Stack>
 </Sheet>;
}

/** What staff decided about this thing (and, for a person, about what they published), newest first. */
function HistorySheet({target,label,onBack}:{target:ModTarget,label:string,onBack:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [items,setItems]=useState<z.infer<typeof historyRes>['items']|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{call('staff.history',{targetType:target.kind,targetId:target.id},historyRes,{asAccount:true,fresh:true}).then(r=>setItems(r.items)).catch(setError);},[call,target.kind,target.id]);
 const word=(k:string,v:string)=>{const x=t(k+v);return x.startsWith('fe.')?v:x;};
 const date=(s:string)=>new Date(s).toLocaleString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
 return <Sheet title={t('fe.mod.history')} sub={label} onClose={onBack}>
  {error?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!items?<Skel kind="list" rows={3}/>
   :!items.length?<Empty compact icon={History} title={t('fe.mod.history.none')}/>
   :<Card list>{items.map(x=><Row key={String(x.id)} noChev title={word('fe.staff.journal.action.',x.action)}
     sub={[x.rule?word('fe.staff.rule.',x.rule):'',x.note||'',x.staff_name||(x.staff_handle?'@'+x.staff_handle:''),date(x.created_at)].filter(Boolean).join(' · ')}/>)}</Card>}
 </Sheet>;
}
