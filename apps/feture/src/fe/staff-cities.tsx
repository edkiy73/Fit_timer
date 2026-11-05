import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {RefreshCw} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Form,Group,Note,RadioList,Skel} from './kit';
import {useFe,useSeen} from './session';
import {useFail,useToast} from './toast';

/** Staff «Города» (owner 06.11.2026): the smallest city the city picker offers. People already living in a smaller city
 * keep it, and the curated cities stay; a high limit gathers people in the big cities, a low one scatters them. */
const stateRes=z.object({ok:z.literal(true),minPop:z.number(),total:z.number(),steps:z.array(z.object({minPop:z.number(),cities:z.number()}))});
const setRes=z.object({ok:z.literal(true),minPop:z.number()});

export function StaffCities(){
 const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();const setError=useFail();
 const [st,setSt]=useSeen<z.infer<typeof stateRes>|null>('StaffCities.st',()=>null);
 const [pick,setPick]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [loadError,setLoadError]=useState('');
 const load=useCallback(()=>{setLoadError('');call('staff.placeLimit',{},stateRes,{fresh:true}).then(r=>{setSt(r);setPick(String(r.minPop));}).catch(e=>setLoadError(feErrorMessage(e,t)));},[call,t]);
 useEffect(()=>{load();},[load]);
 const nf=new Intl.NumberFormat(locale==='en'?'en':'ru');
 const save=async()=>{if(!pick||busy)return;setBusy(true);setError('');
  try{const r=await call('staff.placeLimitSet',{opId:newOpId(),minPop:Number(pick)},setRes);toast(t('fe.staff.cities.saved'),{type:'ok'});setSt(s=>s?{...s,minPop:r.minPop}:s);}
  catch(e){setError(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Group title={t('fe.staff.cities.title')} foot={t('fe.staff.cities.note')}>
  {loadError?<Alert kind="err" action={<Btn kind="soft" size="sm" auto icon={RefreshCw} onClick={load}>{t('fe.retry')}</Btn>}>{loadError}</Alert>
   :!st?<Skel kind="list" rows={3}/>
   :<Form>
    <Note>{t('fe.staff.cities.now',{n:nf.format(st.minPop),total:nf.format(st.total)})}</Note>
    <RadioList label={t('fe.staff.cities.title')} value={pick} onChange={setPick}
     options={st.steps.map(s=>[String(s.minPop),t('fe.staff.cities.step',{n:nf.format(s.minPop)}),t('fe.staff.cities.count',{n:nf.format(s.cities)})] as const)}/>
    <Btn busy={busy} disabled={!pick||pick===String(st.minPop)} onClick={()=>void save()}>{t('fe.staff.cities.save')}</Btn>
   </Form>}
 </Group>;
}
