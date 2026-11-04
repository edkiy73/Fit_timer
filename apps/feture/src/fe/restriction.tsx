import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ShieldAlert} from 'lucide-react';
import {Actions,Alert,Btn} from './kit';
import {useFe} from './session';
import {RESTRICT_SCOPES} from '../../contracts/_restrict.mjs';

/** The notice on «Лента» and «Я» while the person is restricted (audit item 6): what is limited, until when, and
 * «Подробнее» → the decision and the appeal (the inbox). Nothing when there is no restriction. */
export function RestrictionNotice(){
 const {state}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const r=state.status==='ready'?state.boot.restriction??null:null;
 if(!r)return null;
 const points=(r.scope??[...RESTRICT_SCOPES]).map(x=>t('fe.rst.pt.'+x)).join(', ');
 const until=r.until?t('fe.rst.until',{date:new Date(r.until).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'})}):t('fe.rst.untilLifted');
 return <Alert kind="warn" icon={ShieldAlert} action={<Actions><Btn kind="soft" size="sm" fit onClick={()=>navigate('/n/inbox?tab=all')}>{t('fe.rst.more')}</Btn></Actions>}>
  <b>{t('fe.rst.title')} {until}</b> {t('fe.rst.limits',{list:points})}
 </Alert>;
}
