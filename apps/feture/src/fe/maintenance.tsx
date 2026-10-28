import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {Power,RefreshCw,Wrench} from 'lucide-react';
import {FeError,feErrorMessage,feRequest,newOpId,MAINTENANCE_EVENT} from '../feture/fe-api';
import {Alert,Ask,Btn,Card,Field,Group,Input,Maintenance,Note,Row,Stack} from './kit';
import {useFe} from './session';
import {softMax,textError} from './kit/validate';

/** MAINT (wave 8): while staff keep the app in maintenance, every command of everyone else answers «maintenance».
 * The gate shows the «Скоро вернёмся» screen instead of the app and asks `platform.maintenance` every 30 s (and on
 * «Проверить ещё раз»); once it is over the session reloads. Staff are let through by the server. */

const statusRes=z.object({ok:z.literal(true),active:z.boolean(),message:z.string().nullable()});
const POLL=30000;

export function MaintenanceGate({children}:{children:ReactNode}){
 const auth=useOptionalAuth();const {state,reload}=useFe();
 const [on,setOn]=useState<{message:string|null}|null>(null);
 // A command anywhere answered «maintenance» (fe-api announces it), or the session itself could not start.
 useEffect(()=>{const h=(e:Event)=>setOn({message:((e as CustomEvent).detail as {message?:string|null}|undefined)?.message??null});
  window.addEventListener(MAINTENANCE_EVENT,h);return ()=>window.removeEventListener(MAINTENANCE_EVENT,h);},[]);
 const bootBlocked=state.status==='error'&&state.error instanceof FeError&&state.error.code==='maintenance';
 const shown=on??(bootBlocked?{message:null}:null);
 const check=useCallback(async()=>{
  if(!auth.session)return true;
  try{const r=await feRequest(auth.session,'platform.maintenance',{},statusRes);
   if(!r.active){setOn(null);reload();return false;}
   setOn({message:r.message});return true;}
  catch{return true;}
 },[auth.session,reload]);
 useEffect(()=>{if(!shown)return;void check();const id=setInterval(()=>void check(),POLL);return ()=>clearInterval(id);},[!!shown,check]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!shown)return <>{children}</>;
 return <div className="stage maintenance"><div className="root"><main className="main"><MaintenanceView message={shown.message} onRetry={check}/></main></div></div>;
}

function MaintenanceView({message,onRetry}:{message:string|null,onRetry:()=>Promise<boolean>}){
 const {t}=useI18n();const [busy,setBusy]=useState(false);const [still,setStill]=useState(false);
 return <Maintenance title={t('fe.w8.maint.title')} text={t('fe.w8.maint.text')} message={message} note={t('fe.w8.maint.note')}>
  {still&&<Note>{t('fe.w8.maint.still')}</Note>}
  <Btn kind="soft" auto icon={RefreshCw} busy={busy} onClick={async()=>{setBusy(true);setStill(false);setStill(await onRetry());setBusy(false);}}>{t('fe.w8.maint.retry')}</Btn>
 </Maintenance>;
}

/** Staff: the maintenance switch with a message (owner / lead). */
export function StaffMaintenance(){
 const {call}=useFe();const {t}=useI18n();
 const [st,setSt]=useState<{active:boolean,message:string|null}|null>(null);const [msg,setMsg]=useState('');
 const [ask,setAsk]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{call('platform.maintenance',{},statusRes,{asAccount:true,fresh:true}).then(r=>{setSt(r);setMsg(r.message??'');}).catch(e=>setError(feErrorMessage(e,t)));},[call,t]);
 const msgErr=textError(t,'maintenance',msg);
 const set=async(active:boolean)=>{if(active&&msgErr){setError(msgErr);setAsk(false);return;}setBusy(true);setError('');
  try{const r=await call('staff.maintenanceSet',{opId:newOpId(),active,...(active&&msg.trim()?{message:msg.trim()}:{})},statusRes,{asAccount:true});
   setSt(r);setAsk(false);}
  catch(e){setError(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Group title={t('fe.w8.staff.maintTitle')} foot={t('fe.w8.staff.maintNote')}>
  <Stack gap={3}>
   {st&&<Card list><Row noChev icon={Wrench} tone={st.active?'l':'g'} title={st.active?t('fe.w8.staff.maintIsOn'):t('fe.w8.staff.maintIsOff')} sub={st.active&&st.message?st.message:undefined}/></Card>}
   {st&&!st.active&&<Field id="fe-maint-msg" label={t('fe.w8.staff.maintMessage')} error={msg.trim()?msgErr:undefined}>
    <Input id="fe-maint-msg" value={msg} maxLength={softMax('maintenance')} invalid={!!msg.trim()&&!!msgErr} onChange={e=>setMsg(e.target.value)}/>
   </Field>}
   {error&&<Alert kind="err">{error}</Alert>}
   {st&&(st.active?<Btn kind="soft" icon={Power} busy={busy} onClick={()=>void set(false)}>{t('fe.w8.staff.maintOff')}</Btn>
    :<Btn kind="danger" icon={Power} onClick={()=>setAsk(true)}>{t('fe.w8.staff.maintOn')}</Btn>)}
  </Stack>
  {ask&&<Ask title={t('fe.w8.staff.maintTitle')} text={t('fe.w8.staff.maintAsk')} ok={t('fe.w8.staff.maintOn')} danger busy={busy} onOk={()=>void set(true)} onCancel={()=>setAsk(false)}/>}
 </Group>;
}
