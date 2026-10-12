import {Link,useLocation} from 'react-router';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon,type IconName} from './components/Icon';
import './primary-navigation.css';

export type PrimaryTab='home'|'world'|'explore'|'community'|'account';
export const PRIMARY_TABS:readonly {id:PrimaryTab;title:string;icon:IconName;to:string}[]=[
 {id:'home',title:'Главная',icon:'spark',to:'/'},
 {id:'world',title:'Мой мир',icon:'world',to:'/world'},
 {id:'explore',title:'Исследовать',icon:'compass',to:'/explore'},
 {id:'community',title:'Сообщество',icon:'users',to:'/community'},
 {id:'account',title:'Я',icon:'user',to:'/account'}
];
export function ProductBottomDock(){
 const {pathname}=useLocation();
 const auth=useOptionalAuth();
 const {t}=useI18n();
 const known=pathname==='/'||pathname==='/world'||pathname==='/explore'||pathname.startsWith('/explore/')||pathname==='/community'||pathname==='/account';
 if(!known||auth.loading||(pathname==='/'&&!auth.session))return null;
 const selected=pathname.startsWith('/explore')?'explore':pathname==='/world'?'world':pathname==='/community'?'community':pathname==='/account'?'account':'home';
 return <nav className={'ft-product-dock'+(pathname==='/account'?' ft-product-dock-account':'')} aria-label={t('nav.primaryAria')}>{PRIMARY_TABS.map(tab=><Link key={tab.id} to={tab.to} className={selected===tab.id?'active':''} aria-current={selected===tab.id?'page':undefined}><Icon name={tab.icon} size={21}/><span>{t('nav.primary.'+tab.id)}</span></Link>)}</nav>;
}