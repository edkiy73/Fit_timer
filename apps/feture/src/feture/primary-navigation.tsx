import type {CSSProperties, ReactNode} from 'react';
import {Link,useLocation} from 'react-router';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon,type IconName} from './components/Icon';
import {useDatingPresentation} from './dating-presentation';
import './primary-navigation.css';

export type PrimaryTab='world'|'explore'|'community'|'account'|'dating';
export const PRIMARY_TABS:readonly {id:PrimaryTab;title:string;icon:IconName;to:string}[]=[
 {id:'world',title:'Мой мир',icon:'world',to:'/world'},
 {id:'explore',title:'Исследовать',icon:'compass',to:'/explore'},
 {id:'community',title:'Сообщество',icon:'users',to:'/community'},
 {id:'account',title:'Я',icon:'user',to:'/account'}
];
export function usePrimaryTabs(){
 const {enabled}=useDatingPresentation();
 const {t}=useI18n();
 return [...PRIMARY_TABS,...(enabled?[{id:'dating' as const,title:'Знакомства',icon:'heart' as const,to:'/dating'}]:[])].map(tab=>({...tab,title:t('nav.primary.'+tab.id),shortTitle:t('nav.compact.'+tab.id)}));
}
function selectedTab(path:string):PrimaryTab|null{
 if(path.startsWith('/explore'))return 'explore';
 if(path==='/dating')return 'dating';
 if(path==='/community')return 'community';
 if(path==='/'||path==='/world'||path==='/journal'||path.startsWith('/tests'))return 'world';
 return 'account';
}
/** One consumer navigation for account, discovery, personal tools and dating. */
export function ProductLayout({children}:{children:ReactNode}){
 const {pathname}=useLocation();
 const auth=useOptionalAuth();
 const {t}=useI18n();
 const tabs=usePrimaryTabs();
 const standalone=pathname==='/n'||pathname.startsWith('/n/')||pathname.startsWith('/design/')||pathname==='/design'||pathname==='/start'||pathname.startsWith('/operator')||pathname.startsWith('/admin')||pathname.startsWith('/share/')||(pathname==='/'&&!auth.session);
 const selected=selectedTab(pathname);
 return <div className={`ft-product-layout${standalone?' ft-product-standalone':''}${pathname==='/dating'?' ft-product-dating':''}`}>
  {!standalone&&<aside className="ft-product-rail">
   <Link className="ft-product-wordmark" to="/world" aria-label="FetUre — Мой мир">Fet<span>Ure</span><i>.</i></Link>
   <p>{t('welcome.kicker')}</p>
   <nav aria-label="Разделы FetUre">{tabs.map(tab=><Link key={tab.id} to={tab.to} className={selected===tab.id?'active':''} aria-current={selected===tab.id?'page':undefined}><Icon name={tab.icon} size={22}/><span>{tab.title}</span></Link>)}</nav>
   <div className="ft-product-rail-foot"><span>Твой темп. Твои правила.</span><Link to="/account"><Icon name="settings" size={18}/>{t('nav.primary.account')}</Link></div>
  </aside>}
  <div className="ft-product-outlet">{children}</div>
  {!standalone&&<nav className="ft-product-dock" aria-label={t('nav.primaryAria')} style={{'--ft-tab-count':tabs.length} as CSSProperties}>{tabs.map(tab=><Link key={tab.id} to={tab.to} className={selected===tab.id?'active':''} aria-current={selected===tab.id?'page':undefined} aria-label={tab.title}><Icon name={tab.icon} size={23}/><span>{tab.shortTitle}</span></Link>)}</nav>}
 </div>;
}
