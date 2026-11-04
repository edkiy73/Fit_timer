import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,LogOut} from 'lucide-react';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {feErrorMessage} from '../feture/fe-api';
import {Actions,Alert,Btn,Empty,Skel} from './kit';
import {useFe} from './session';
import {AppealSheet} from './appeal';
import {SupportSheet} from './support';
import {ToastProvider} from './toast';

const res=z.object({ok:z.literal(true),suspended:z.boolean(),rule:z.string().nullable().optional(),until:z.string().nullable().optional(),
 appeal:z.enum(['available','open','granted','denied','none']).optional()});

/** What a suspended account sees instead of the app (audit item 2): which rule, until when, «Обжаловать»,
 * «Написать в поддержку», «Выйти». Suspected child abuse reads as «нарушение закона», without an appeal (В1). */
export function SuspendedScreen(){
 const {call,reload}=useFe();const {t,locale}=useI18n();const auth=useOptionalAuth();
 const [s,setS]=useState<z.infer<typeof res>|null>(null);const [error,setError]=useState<unknown>(null);
 const [sheet,setSheet]=useState<''|'appeal'|'support'>('');const [notice,setNotice]=useState('');
 const load=useCallback(()=>{call('account.suspension',{},res,{asAccount:true}).then(r=>{if(!r.suspended)reload();else setS(r);}).catch(setError);},[call,reload]);
 useEffect(()=>{load();},[load]);
 const rule=s?.rule?t('fe.sus.rule.'+s.rule):'';
 const ruleText=rule&&!rule.startsWith('fe.')?rule:t('fe.sus.rule.other');
 const term=s?.until?t('fe.sus.until',{date:new Date(s.until).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'})}):t('fe.sus.forever');
 return <ToastProvider nodock>
  {error?<Empty icon={Ban} role="alert" title={t('fe.error.closedTitle')} text={feErrorMessage(error,t)}>
    <Btn kind="primary" icon={LogOut} onClick={()=>void auth.logout()}>{t('fe.uf.signinOut')}</Btn></Empty>
   :!s?<Skel kind="list"/>
   :<Empty icon={Ban} role="alert" title={t('fe.sus.title')} text={`${t('fe.sus.why',{rule:ruleText})} ${term}`}>
    {notice&&<Alert kind="ok" noIcon>{notice}</Alert>}
    {s.appeal==='open'&&<Alert kind="info">{t('fe.sus.appealOpen')}</Alert>}
    {s.appeal==='denied'&&<Alert kind="info">{t('fe.sus.appealDenied')}</Alert>}
    <Actions stack>
     {s.appeal==='available'&&<Btn onClick={()=>setSheet('appeal')}>{t('fe.cm.appeal')}</Btn>}
     <Btn kind="soft" onClick={()=>setSheet('support')}>{t('fe.ibx.toSupport')}</Btn>
     <Btn kind="ghost" icon={LogOut} onClick={()=>void auth.logout()}>{t('fe.uf.signinOut')}</Btn>
    </Actions>
   </Empty>}
  {sheet==='appeal'&&<AppealSheet targetType="account" id="" onClose={()=>setSheet('')} onDone={msg=>{setSheet('');setNotice(msg);load();}}/>}
  {sheet==='support'&&<SupportSheet onClose={()=>setSheet('')} onSent={()=>setNotice(t('fe.sus.supportSent'))}/>}
 </ToastProvider>;
}
