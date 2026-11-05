import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Gift,Ticket,UserPlus} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,Alert,Bar,Btn,Card,Empty,Field,Group,Input,KeyValues,Note,Row,Sheet,Skel,Stack,View} from './kit';
import {useToast} from './toast';
import {useFe} from './session';
import {useCopyLink} from './share';
import {dropRefCode,rememberRefLink} from './referral-link';

/** Invitations and promo codes (owner 06.11.2026): your link, what it brought, and «У меня есть код». The reward comes to the
 * newcomer (and, for a personal link, to you) when the newcomer has finished getting to know the app and passed the age check. */
const mineRes=z.object({ok:z.literal(true),enabled:z.boolean(),code:z.string(),rewardDays:z.number(),inviterDays:z.number(),capCount:z.number(),capDays:z.number(),
 invited:z.number(),rewarded:z.number(),used:z.object({state:z.enum(['pending','rewarded']),kind:z.enum(['personal','promo'])}).nullable()});
const applyRes=z.object({ok:z.literal(true),state:z.enum(['pending','rewarded']),kind:z.enum(['personal','promo']),days:z.number()});

/** Applies a code and says what came of it: a toast for the answer, an error text for a refusal. */
export function useApplyCode(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 return useCallback(async(code:string):Promise<boolean>=>{
  try{const r=await call('referral.apply',{opId:newOpId(),code:code.trim()},applyRes,{asAccount:true});
   toast(r.state==='rewarded'?t(r.days>0?'fe.inv.rewarded':'fe.inv.counted',{days:String(r.days)}):t('fe.inv.pending'),{type:'ok'});return true;}
  catch(e){toast(e instanceof FeError&&e.code==='not_found'?t('fe.inv.noCode'):e instanceof FeError&&e.rule==='already_invited'?t('fe.inv.already'):e instanceof FeError&&e.rule==='not_new'?t('fe.inv.notNew')
   :e instanceof FeError&&e.rule==='own_code'?t('fe.inv.own'):feErrorMessage(e,t),{type:'err'});return false;}
 },[call,t,toast]);
}

/** «У меня есть код»: a code typed by hand (a promo code from an ad, or a friend's code). */
export function CodeSheet({onClose,onDone}:{onClose:()=>void,onDone?:()=>void}){
 const {t}=useI18n();const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const apply=useApplyCode();
 const ok=/^[A-Za-z0-9_-]{3,24}$/.test(code.trim());
 return <Sheet title={t('fe.inv.codeTitle')} onClose={onClose} dirty={!!code}
  foot={<Btn busy={busy} disabled={!ok} onClick={()=>{setBusy(true);void apply(code).then(done=>{setBusy(false);if(done){onClose();onDone?.();}});}}>{t('fe.inv.apply')}</Btn>}>
  <Stack gap={2}>
   <Field id="fe-ref-code" label={t('fe.inv.codeLabel')} hint={t('fe.inv.codeHint')}>
    <Input id="fe-ref-code" value={code} autoCapitalize="characters" spellCheck={false} maxLength={24} onChange={e=>setCode(e.target.value)}/>
   </Field>
  </Stack>
 </Sheet>;
}

/** `/n/me/invite` — your link, copy it, what it brought. */
export function InviteScreen(){
 const {t}=useI18n();const {call}=useFe();const copy=useCopyLink();
 const [r,setR]=useState<z.infer<typeof mineRes>|null>(null);const [error,setError]=useState<unknown>(null);const [sheet,setSheet]=useState(false);
 const load=useCallback(()=>{setError(null);call('referral.mine',{opId:newOpId()},mineRes,{asAccount:true,fresh:true}).then(setR).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 return <>
  <Bar title={t('fe.inv.title')} back/>
  <View className="nodock">
   {error?<Empty icon={UserPlus} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!r?<Skel kind="list"/>:<>
    {r.enabled?<>
     <Alert kind="ok" icon={Gift}><b>{t('fe.inv.lead')}</b>{t('fe.inv.leadText',{you:String(r.inviterDays),friend:String(r.rewardDays)})}</Alert>
     <Group title={t('fe.inv.yourLink')}>
      <Stack gap={3}>
       <Card list><Row icon={UserPlus} title={'app.kinhaze.com/#/n/join/'+r.code} sub={t('fe.inv.copyTap')} noChev onClick={()=>void copy('/n/join/'+r.code,t('fe.inv.copied'))}/></Card>
       <Actions><Btn onClick={()=>void copy('/n/join/'+r.code,t('fe.inv.copied'))}>{t('fe.inv.copy')}</Btn></Actions>
      </Stack>
     </Group>
     <Group title={t('fe.inv.stats')}><KeyValues rows={[[t('fe.inv.came'),String(r.invited)],[t('fe.inv.done'),String(r.rewarded)]]}/></Group>
     <Note>{t('fe.inv.how',{n:String(r.capCount),days:String(r.capDays)})}</Note>
    </>:<Empty icon={UserPlus} title={t('fe.inv.off')} text={t('fe.inv.offText')}/>}
    {!r.used&&<Card list><Row icon={Ticket} title={t('fe.inv.haveCode')} sub={t('fe.inv.haveCodeSub')} onClick={()=>setSheet(true)}/></Card>}
   </>}
  </View>
  {sheet&&<CodeSheet onClose={()=>setSheet(false)} onDone={load}/>}
 </>;
}

/** `/n/join/<code>`: an invitation link opened by someone who is signed in. Tries the code at once, then goes to Premium. */
export function JoinScreen(){
 const {code=''}=useParams();const navigate=useNavigate();const apply=useApplyCode();const ran=useRef(false);
 useEffect(()=>{if(ran.current)return;ran.current=true;rememberRefLink('#/n/join/'+code);
  void apply(code).then(()=>{dropRefCode();navigate('/n/premium',{replace:true});});
 },[code,apply,navigate]);
 return <View className="nodock"><Skel kind="list"/></View>;
}
