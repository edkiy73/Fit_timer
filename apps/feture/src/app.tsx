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
const productAdminSections:readonly AdminSection[]=[{id:'feture-operators',label:'Операторы QA',group:'FetUre',render:context=><OperatorsAdmin {...context}/>},{id:'feture-metrics',label:'Активность FetUre',group:'FetUre',render:context=><MetricsAdmin {...context}/> },{id:'feture-catalog',label:'Каталог FetUre',group:'FetUre',render:context=><CatalogAdmin {...context}/>},{id:'feture-tests',label:'Опросники FetUre',group:'FetUre',render:context=><QuestionnairesAdmin {...context}/>},{id:'feture-documents',label:'Документы FetUre',group:'FetUre',render:context=><DocumentsAdmin {...context}/>},{id:'feture-moderation',label:'Модерация FetUre',group:'FetUre',render:context=><ModerationAdmin {...context}/>},{id:'feture-qa-adult',label:'QA-доступ 18+',group:'FetUre',render:context=><QaAdultAdmin {...context}/>}];

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
  return <main className="app"><header className="app-header">
    <div><div className="eyebrow">{t('app.eyebrow')}</div><h1>{PRODUCT_NAME}</h1></div>
    {!auth.loading && <Link className="link-button" to="/account">{auth.session?t('nav.account'):t('nav.signIn')}</Link>}
  </header><Outlet /></main>;
}

function Home(){
  return <FetureExperience />;
}

function Account(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  // Server logout must succeed before clearing account-bound local records.
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
      await appDocs.clear(); // Settings only; private map has its own owner-scoped cleanup.
      navigate('/');
    } catch {
      if(!loggedOut)await interestQueue.finishLogout(fence,false).catch(()=>{});
      setSignOutError(locale === 'en' ? 'Could not sign out. Check your connection and try again.' : 'Не удалось выйти. Проверь соединение и попробуй ещё раз.');
    } finally {setSigningOut(false);}
  };
  if(auth.loading) return <section className="card" role="status">{t('account.loading')}</section>;
  return (
    <section className="card">
      <p><Link to="/">{t('nav.back')}</Link></p>
      {auth.session ? (
        <>
          <h2>{t('account.title')}</h2>
          <p>{auth.session.email}{auth.session.handle ? ' · ' + auth.session.handle : ''}</p>
          <p className="muted">{t('account.synced')}</p>
          <p><Link to="/verification">{t('verification.title')}</Link></p>
          <p><Link to="/profile">Мой профиль</Link></p>
          <p><Link to="/journal">Личный дневник и история</Link></p>
          <p><Link to="/share-links">Мои ссылки на темы</Link></p>
          <p><Link to="/comparisons">Сравнения по согласию</Link></p>
          <p><Link to="/access">Видимость и доступ</Link></p>
          <p><Link to="/safety">Безопасность и обращения</Link></p>
          <p><Link to="/operator">Рабочий экран QA</Link></p>
          <button className="link-button" type="button" disabled={signingOut} onClick={() => void signOut()}>{t('account.signOut')}</button>
          {signOutError && <p role="alert">{signOutError}</p>}
        </>
      ) : (
        <>
          <p className="muted">{t('account.localHint')}</p>
          <SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={() => navigate('/')} />
        </>
      )}
      <ThemePicker />
      <p><Link to="/documents">Правила и согласия</Link></p>
      <div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')} /></div>
    </section>
  );
}

function Admin(){
  const {locale} = useI18n();
  return <AdminPanel client={adminClient} locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} extraSections={productAdminSections} hiddenCoreTabs={['overview','errors']} />;
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
