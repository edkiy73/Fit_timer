import {useI18n} from '@appbase/ui-react/i18n.js';
import {Globe,type LucideIcon} from 'lucide-react';
import {Bar,Empty,View} from './ui';

/** Tab roots whose slice has not landed yet: an honest «скоро» state in the V21 look. */
function Soon({tab,icon}:{tab:string,icon:LucideIcon}){
 const {t}=useI18n();
 return <><Bar title={t('fe.nav.'+tab)}/><View><Empty icon={icon} title={t('fe.soon.'+tab+'.title')} text={t('fe.soon.'+tab+'.text')}/></View></>;
}
export const CommunitiesTab=()=> <Soon tab="communities" icon={Globe}/>;
