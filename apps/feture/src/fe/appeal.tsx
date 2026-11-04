import {useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {TriangleAlert} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Sheet,Stack} from './kit';
import {useFe} from './session';
import {okRes} from './comm-kit';
import {Field as FormField,shakeFirstErr} from './create-community';
import {textError} from './kit/validate';

/** The one appeal of a staff decision (the existing `appeal.create`; a lead who did not decide it looks again): a
 * rejected or hidden community, a removed post or reply, a hidden event, a restricted profile. Opened from the
 * community page and from a moderation decision's card in the inbox. `profileId`: the profile the decision is about
 * (a couple's content is appealed as the couple). */
export function AppealSheet({targetType,id,profileId,ph,onClose,onDone}:{targetType:'post'|'reply'|'community'|'event'|'profile'|'account'|'media'|'revision',id:string,profileId?:string|null|undefined,
 /** The hint in the box, when the place has its own words. */ ph?:string|undefined,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [body,setBody]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const send=async()=>{
  const e=textError(t,'appeal',body);setErr(e??'');if(e){shakeFirstErr();return;}
  setBusy(true);setFailure('');
  // A suspension (audit item 2) is appealed from the account itself: no acting profile.
  try{if(targetType==='account')await call('appeal.suspension',{opId:newOpId(),body:body.trim()},okRes,{asAccount:true});
   else await call('appeal.create',{opId:newOpId(),targetType,targetId:id,body:body.trim()},okRes,profileId?{profileId}:undefined);onDone(t('fe.cm.appealSent'));}
  catch(x){setFailure(x instanceof FeError&&x.rule==='appeal_open'?t('fe.cm.appealOpen'):feErrorMessage(x,t));}finally{setBusy(false);}
 };
 return <Sheet title={t('fe.cm.appealTitle')} onClose={onClose} dirty={!busy&&!!body.trim()} foot={<Btn onClick={()=>void send()} busy={busy} disabled={busy}>{t('fe.cm.appealSend')}</Btn>}>
  <Stack gap={4}>
   <FormField name="appeal" label={t('fe.cm.appealLabel')} value={body} onChange={v=>{setBody(v);if(err)setErr('');}} err={err} textarea rows={5} check="appeal" ph={ph??t('fe.ibx.appealPh')}/>
   {failure&&<Alert kind="err" icon={TriangleAlert}>{failure}</Alert>}
  </Stack>
 </Sheet>;
}
