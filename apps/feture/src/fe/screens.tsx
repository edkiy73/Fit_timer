import {useI18n} from '@appbase/ui-react/i18n.js';
import {ScreenHeader,StateCard} from './components';
import type {IconName} from '../feture/components/Icon';

/** Tab roots. Each slice (B…H) replaces its «скоро» card with the real screen. */
function Soon({tab,icon}:{tab:string,icon:IconName}){
 const {t}=useI18n();
 return <>
  <ScreenHeader title={t('fe.nav.'+tab)}/>
  <div className="fe-body"><StateCard icon={icon} title={t('fe.soon.'+tab+'.title')} text={t('fe.soon.'+tab+'.text')}/></div>
 </>;
}
export const CommunitiesTab=()=> <Soon tab="communities" icon="world"/>;
export const ChatsTab=()=> <Soon tab="chats" icon="message"/>;
