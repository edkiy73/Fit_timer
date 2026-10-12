import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useNavigate, useLocation, type RouteObject } from 'react-router';
import { AuthProvider, SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { AdminPanel } from '@appbase/ui-react/admin.js';
import { I18nProvider, LanguagePicker, sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import product from '../config/product.json';
import { authClient } from './auth';
import { adminClient } from './admin';
import { appDocs, SETTINGS_DOC, syncNow } from './sync';
import { dictionaries, i18nConfig, LOCALE_KEY } from './i18n';
import { NotFoundScreen, RouteErrorScreen } from './route-fallback';
import { FetureCatalog } from './catalog';
import { sameSession } from './feture/interest-api';
import { InterestLifecycle, interestQueue } from './feture/use-interest-map';
import { FetureExperience } from './feture/experience';
import { NativeNavigation } from './feture/native-navigation';
import { isExperiencePath } from './feture/navigation';
import { VerificationPage } from './feture/verification-page';
import { ThemePicker } from './feture/components/ThemePicker';
import { safeSignInReturnTo } from './feture/sign-in-return';
import { Icon, type IconName } from './feture/components/Icon';
import {DocumentsPage} from './feture/documents-page';
import {DocumentsAdmin} from './feture/documents-admin';
import {ProfilePage} from './feture/profile-page';
import {AccessPage,PeerProfilePage} from './feture/access-page';
import {JournalPage} from './feture/journal-page';
import {ModerationPage} from './feture/moderation-page';
import {QuestionnairesPage} from './feture/questionnaire-page';
import {QuestionnairesAdmin} from './feture/questionnaire-admin';
import {CatalogAdmin} from './feture/catalog-admin';
import {ModerationAdmin} from './feture/moderation-admin';
import {OperatorsAdmin} from './feture/operators-admin';
import {MetricsAdmin} from './feture/metrics-admin';
import {QaAdultAdmin} from './feture/qa-adult-admin';
import {OperatorPage} from './feture/operator-page';
import {ShareLinksPage,SharedCardPage} from './feture/share-links-page';
import {ComparisonPage} from './feture/comparison-page';
import type {AdminSection} from '@appbase/ui-react/admin.js';
const productAdminSections:readonly AdminSection[]=[
  // Keep IDs stable: AppBase persists the last selected tab in sessionStorage.
  {id:'feture-moderation',label:'Модерация публикаций',group:'Проверка и доступ',render:context=><ModerationAdmin {...context}/>},
  {id:'feture-qa-adult',label:'Временный доступ 18+',group:'Проверка и доступ',render:context=><QaAdultAdmin {...context}/>},
  {id:'feture-operators',label:'Роли операторов',group:'Проверка и доступ',render:context=><OperatorsAdmin {...context}/>},
  {id:'feture-catalog',label:'Темы каталога',group:'Редактура',render:context=><CatalogAdmin {...context}/>},
  {id:'feture-tests',label:'Опросники',group:'Редактура',render:context=><QuestionnairesAdmin {...context}/>},
  {id:'feture-documents',label:'Документы и согласия',group:'Редактура',render:context=><DocumentsAdmin {...context}/>},
  {id:'feture-metrics',label:'Активность FetUre',group:'Наблюдение',render:context=><MetricsAdmin {...context}/>}
];

const hiddenFetureCoreTabs = ['overview','errors'] as const;
const PRODUCT_NAME = 'FetUre';
// Handle step at first sign-in: config/product.json → auth.askHandle.
const ASK_HANDLE = product.auth?.askHandle !== false;

function Localized({children}: {children: ReactNode}){
  return <I18nProvider dictionaries={dictionaries} config={i18nConfig} storageKey={LOCALE_KEY}>{children}</I18nProvider>;
}

/* Example of a synced account document: the language choice follows the account to other
   devices (lib/app-sync-schema.js registers "settings" as free). */
function SettingsSync(){
  const {preference, setPreference} = useI18n();
  const auth = useOptionalAuth();
  const email = auth.session?.email;
  const loaded = useRef(false);
  const saved = useRef('');

  useEffect(() => {
    let live = true;
    const apply = async () => {
      const raw = await appDocs.read(SETTINGS_DOC);
      try{
        const doc = raw ? JSON.parse(raw) as {locale?: string} : null;
        if(live && doc?.locale){
          saved.current = doc.locale;
          setPreference(doc.locale);
        }
      }catch{}
      loaded.current = true;
    };
    void apply();
    const stop = appDocs.subscribe(change => { if(change.source === 'remote') void apply(); });
    return () => { live = false; stop(); };
  }, [setPreference]);

  useEffect(() => {
    if(!loaded.current || saved.current === preference) return;
    saved.current = preference;
    void appDocs.write(SETTINGS_DOC, JSON.stringify({locale: preference}));
  }, [preference]);

  // Sign-in on this device (or a restored session): merge local data with the account now.
  useEffect(() => { if(email) syncNow(); }, [email]);
  return null;
}

function Root(){
  return (
    <Localized>
      <AuthProvider client={authClient}>
        <SettingsSync />
        <InterestLifecycle />
        <NativeNavigation />
        <Outlet />
      </AuthProvider>
    </Localized>
  );
}

function Shell(){
  const auth=useOptionalAuth(); const {t}=useI18n(); const location=useLocation();
  if(isExperiencePath(location.pathname)) return <Outlet />;
  return <main className={(location.pathname==='/account'||location.pathname==='/profile')?'app ft-account-shell':'app'}><header className="app-header">
    <div><div className="eyebrow">{t('app.eyebrow')}</div><h1>{PRODUCT_NAME}</h1></div>
    {!auth.loading && <Link className="link-button" to="/account">{auth.session?t('nav.account'):t('nav.signIn')}</Link>}
  </header><Outlet /></main>;
}

function Home(){
  return <FetureExperience />;
}

type AccountDestination={to:string;title:string;description:string;icon:IconName};
function AccountDestinationLink({to,title,description,icon}:AccountDestination){
  return <Link to={to} className="ft-account-destination">
    <span className="ft-account-destination-icon"><Icon name={icon} size={20}/></span>
    <span className="ft-account-destination-copy"><strong>{title}</strong><small>{description}</small></span>
    <Icon name="arrow" size={18}/>
  </Link>;
}

function Account(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  // Keep Core logout and owner-scoped cleanup unchanged.
  const signOut = async () => {
    if(!sameSession(await authClient.getSession(),auth.session)){setSignOutError('Аккаунт изменился. Обнови экран и повтори действие.');return;}
    if(signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    const fence=await interestQueue.prepareLogout(auth.session).catch(()=>undefined);
    if(fence===undefined){setSignOutError('Не удалось остановить сохранение. Попробуй ещё раз.');setSigningOut(false);return;}
    let loggedOut=false;
    try {
      if((fence?.pending||await appDocs.pending())&&!window.confirm('Есть изменения, сохранённые только на этом устройстве. При выходе они будут удалены. Продолжить?')){await interestQueue.finishLogout(fence,false);return;}
      if(fence&&!sameSession(await authClient.getSession(),fence.session))throw new Error('account_changed');
      await auth.logout();loggedOut=true;
      await interestQueue.finishLogout(fence,true);
      await appDocs.clear();
      navigate('/');
    } catch {
      if(!loggedOut)await interestQueue.finishLogout(fence,false).catch(()=>{});
      setSignOutError(locale === 'en' ? 'Could not sign out. Check your connection and try again.' : 'Не удалось выйти. Проверь соединение и попробуй ещё раз.');
    } finally {setSigningOut(false);}
  };
  const handle=auth.session?.handle?.trim();
  const displayName=handle||'Твой аккаунт';
  return <div className="ft-account-page">
    <div className="ft-account-mobile-top"><Link to="/" className="ft-account-wordmark">Fet<span>Ure.</span></Link><Link to="/" className="ft-account-back"><Icon name="back" size={17}/> Мой мир</Link></div>
    <div className="ft-account-layout">
      <aside className="ft-account-sidebar" aria-label="Навигация аккаунта">
        <Link to="/" className="ft-account-wordmark">Fet<span>Ure.</span></Link>
        <p>Пространство, где интересно быть собой.</p>
        <nav aria-label="Основные разделы">
          <Link to="/"><Icon name="world" size={19}/> Мой мир</Link>
          <Link to="/explore"><Icon name="compass" size={19}/> Исследовать</Link>
          <Link to="/community"><Icon name="users" size={19}/> Сообщество</Link>
          <Link className="active" aria-current="page" to="/account"><Icon name="settings" size={19}/> Аккаунт</Link>
        </nav>
        <span className="ft-account-sidebar-foot">Твой путь, твои правила</span>
      </aside>
      <div className="ft-account-content">
        <div className="ft-account-heading"><div><span className="ft-account-eyebrow">Личное пространство</span><h1 id="ft-account-title">Аккаунт</h1></div><Link to="/" className="ft-account-desktop-back"><Icon name="back" size={18}/> Мой мир</Link></div>
        {auth.loading ? <section role="status" className="ft-account-panel ft-account-loading">Загружаем аккаунт…</section> : auth.session ? <>
          <section className="ft-account-hero" aria-labelledby="ft-account-hero-title">
            <span className="ft-account-hero-orbit" aria-hidden="true"/>
            <div className="ft-account-hero-identity"><span className="ft-account-avatar" aria-hidden="true">{(handle||'F').slice(0,1).toLocaleUpperCase()}</span><div><span className="ft-account-hero-kicker">Твоё пространство</span><h2 id="ft-account-hero-title">{displayName}</h2><p className="ft-account-email">{auth.session.email}</p></div></div>
            <p>Узнавай себя в своём темпе. Личные сведения по умолчанию доступны только тебе.</p>
            <Link className="ft-account-primary" to="/profile">Мой профиль <Icon name="arrow" size={19}/></Link>
          </section>
          <div className="ft-account-sections">
            <section className="ft-account-panel" aria-labelledby="ft-account-world-title"><div className="ft-account-section-title"><span className="ft-account-section-mark violet"><Icon name="spark" size={20}/></span><div><h2 id="ft-account-world-title">Твой мир</h2><p>Личное исследование и выбранные материалы</p></div></div>
              <div className="ft-account-destinations">
                <AccountDestinationLink to="/journal" icon="book" title="Личный дневник" description="Записи и история карты"/>
                <AccountDestinationLink to="/share-links" icon="eye" title="Мои ссылки" description="Темы, которыми решишь поделиться"/>
                <AccountDestinationLink to="/comparisons" icon="users" title="Сравнения" description="Только при отдельном согласии"/>
              </div>
            </section>
            <section className="ft-account-panel" aria-labelledby="ft-account-control-title"><div className="ft-account-section-title"><span className="ft-account-section-mark rose"><Icon name="shield" size={20}/></span><div><h2 id="ft-account-control-title">Контроль и безопасность</h2><p>Ты управляешь тем, что доступно другим</p></div></div>
              <div className="ft-account-destinations">
                <AccountDestinationLink to="/access" icon="lock" title="Видимость и доступ" description="Кто может увидеть выбранное"/>
                <AccountDestinationLink to="/verification" icon="check" title="Проверка возраста" description="Текущий статус и доступные действия"/>
                <AccountDestinationLink to="/safety" icon="shield" title="Безопасность" description="Обращения и блокировки"/>
                <AccountDestinationLink to="/documents" icon="book" title="Правила и согласия" description="Документы и твои решения"/>
              </div>
            </section>
          </div>
          <section className="ft-account-panel ft-account-preferences" aria-labelledby="ft-account-preferences-title"><h2 id="ft-account-preferences-title">Настройки</h2><div className="ft-account-preference-grid"><ThemePicker/><div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')}/></div></div></section>
          <div className="ft-account-footer"><button className="ft-account-signout" type="button" disabled={signingOut} onClick={()=>void signOut()}><Icon name="back" size={17}/>{signingOut?'Выходим…':t('account.signOut')}</button>{signOutError&&<p role="alert">{signOutError}</p>}</div>
        </> : <div className="ft-account-guest">
          <section className="ft-account-hero" aria-labelledby="ft-guest-title"><span className="ft-account-hero-orbit" aria-hidden="true"/><span className="ft-account-hero-kicker">Место для твоих открытий</span><h2 id="ft-guest-title">Твой мир начинается с тебя.</h2><p>Исследуй свои интересы без длинной анкеты. С аккаунтом удобно вернуться к личным заметкам.</p><Link className="ft-account-secondary" to="/explore">Сначала исследовать <Icon name="arrow" size={18}/></Link></section>
          <section className="ft-account-panel ft-account-signin" aria-labelledby="ft-signin-title"><h2 id="ft-signin-title">Войти или зарегистрироваться</h2><p>Используй свой email. Заполнить профиль можно позже.</p><SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={()=>navigate(safeSignInReturnTo(location.state),{replace:true})}/></section>
          <details className="ft-account-panel ft-account-preferences ft-account-guest-settings"><summary>Настройки <Icon name="arrow" size={18}/></summary><div className="ft-account-preference-grid"><ThemePicker/><div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')}/></div></div><Link className="ft-account-legal" to="/documents">Правила и согласия</Link></details>
        </div>}
      </div>
    </div>
  </div>;
}

function Admin(){
  const {locale} = useI18n();
  return <AdminPanel client={adminClient} locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} extraSections={productAdminSections} hiddenCoreTabs={hiddenFetureCoreTabs} />;
}

export const routes: RouteObject[] = [
  {
    path:'/',
    element:<Root />,
    errorElement:<Localized><RouteErrorScreen /></Localized>,
    children:[{
      element:<Shell />,
      children:[
        {index:true, element:<Home />},
        {path:'explore/:categoryId?', element:<Home />},
        {path:'community', element:<Home />},
        {path:'dating', element:<Home />},
        {path:'account', element:<Account />},
        {path:'operator', element:<OperatorPage />},
        {path:'verification', element:<VerificationPage />},
        {path:'documents', element:<DocumentsPage />},
        {path:'profile', element:<ProfilePage />},
        {path:'journal', element:<JournalPage />},
        {path:'share-links', element:<ShareLinksPage />},
        {path:'comparisons',element:<ComparisonPage/>},
        {path:'compare/new/:linkId',element:<ComparisonPage/>},
        {path:'compare/:comparisonId',element:<ComparisonPage/>},
        {path:'share/:linkId', element:<SharedCardPage />},
        {path:'access', element:<AccessPage />},
        {path:'people/:id', element:<PeerProfilePage />},
        {path:'tests',element:<QuestionnairesPage/>},
        {path:'tests/:attemptId',element:<QuestionnairesPage/>},
        {path:'safety', element:<ModerationPage />},
        {path:'report/:targetId', element:<ModerationPage />},
        {path:'catalog', element:<FetureCatalog />},
        {path:'*', element:<NotFoundScreen />}
      ]
    }]
  },
  {
    path:'/admin',
    element:<Localized><Admin /></Localized>
  }
];
