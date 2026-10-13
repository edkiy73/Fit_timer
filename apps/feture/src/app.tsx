import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useNavigate, useLocation, type RouteObject, Navigate } from 'react-router';
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
const ProductDesign = lazy(async()=>({default:(await import('./feture/design/product-design')).ProductDesign}));
import { WelcomePage } from './feture/welcome';
import { FirstStepsPage } from './feture/first-steps';
import { ProductLayout } from './feture/primary-navigation';
import { DatingPresentationProvider } from './feture/dating-presentation';
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
        <DatingPresentationProvider><ProductLayout><Outlet /></ProductLayout></DatingPresentationProvider>
      </AuthProvider>
    </Localized>
  );
}

function Shell(){
  const auth=useOptionalAuth(); const {t}=useI18n(); const location=useLocation();
  if(isExperiencePath(location.pathname)||location.pathname==='/start'||location.pathname.startsWith('/design/')) return <Outlet />;
  const study=location.pathname==='/tests'||location.pathname.startsWith('/tests/');
  return <main className={study?'app ft-study-shell':(location.pathname==='/account'||location.pathname==='/profile')?'app ft-account-shell':'app'}><header className="app-header">
    <div><div className="eyebrow">{t('app.eyebrow')}</div><h1>{PRODUCT_NAME}</h1></div>
    {!auth.loading && <Link className="link-button" to="/account">{auth.session?t('nav.account'):t('nav.signIn')}</Link>}
  </header><Outlet /></main>;
}

function Home(){
  const auth=useOptionalAuth();
  const {t}=useI18n();
  const location=useLocation();
  if(location.pathname==='/'&&auth.loading)return <main className="ft-welcome-loading" role="status">{t('account.appLoading')}</main>;
  if(location.pathname==='/'&&!auth.session)return <WelcomePage/>;
  if(location.pathname==='/')return <Navigate to="/world" replace/>;
  return <FetureExperience/>;
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
    if(!sameSession(await authClient.getSession(),auth.session)){setSignOutError(t('account.sessionChanged'));return;}
    if(signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    const fence=await interestQueue.prepareLogout(auth.session).catch(()=>undefined);
    if(fence===undefined){setSignOutError(t('account.saveStopFailed'));setSigningOut(false);return;}
    let loggedOut=false;
    try {
      if((fence?.pending||await appDocs.pending())&&!window.confirm(t('account.unsyncedConfirm'))){await interestQueue.finishLogout(fence,false);return;}
      if(fence&&!sameSession(await authClient.getSession(),fence.session))throw new Error('account_changed');
      await auth.logout();loggedOut=true;
      await interestQueue.finishLogout(fence,true);
      await appDocs.clear();
      navigate('/');
    } catch {
      if(!loggedOut)await interestQueue.finishLogout(fence,false).catch(()=>{});
      setSignOutError(t('account.signOutFailed'));
    } finally {setSigningOut(false);}
  };
  const handle=auth.session?.handle?.trim();
  const displayName=handle||t('account.fallbackName');
  return <div className="ft-account-page">
    <div className="ft-account-mobile-top"><Link to="/" className="ft-account-wordmark">Fet<span>Ure.</span></Link><Link to="/" className="ft-account-back"><Icon name="back" size={17}/> {t('account.myWorld')}</Link></div>
    <div className="ft-account-layout">
      <div className="ft-account-content">
        <div className="ft-account-heading"><div><span className="ft-account-eyebrow">{t('account.headingKicker')}</span><h1 id="ft-account-title">{t('account.heading')}</h1></div><Link to="/" className="ft-account-desktop-back"><Icon name="back" size={18}/> {t('account.myWorld')}</Link></div>
        {auth.loading ? <section role="status" className="ft-account-panel ft-account-loading">{t('account.loadingDetails')}</section> : auth.session ? <>
          <section className="ft-account-hero" aria-labelledby="ft-account-hero-title">
            <span className="ft-account-hero-orbit" aria-hidden="true"/>
            <div className="ft-account-hero-identity"><span className="ft-account-avatar" aria-hidden="true">{(handle||'F').slice(0,1).toLocaleUpperCase()}</span><div><span className="ft-account-hero-kicker">{t('account.heroKicker')}</span><h2 id="ft-account-hero-title">{displayName}</h2><p className="ft-account-email">{auth.session.email}</p></div></div>
            <p>{t('account.heroDescription')}</p>
            <Link className="ft-account-primary" to="/design/F01">{locale.startsWith('en')?'Open the app':'Открыть приложение'} <Icon name="spark" size={19}/></Link>
            <Link className="ft-account-primary" to="/profile">{t('account.myProfile')} <Icon name="arrow" size={19}/></Link>
          </section>
          <div className="ft-account-sections">
            <section className="ft-account-panel" aria-labelledby="ft-account-world-title"><div className="ft-account-section-title"><span className="ft-account-section-mark violet"><Icon name="spark" size={20}/></span><div><h2 id="ft-account-world-title">{t('account.worldTitle')}</h2><p>{t('account.worldDescription')}</p></div></div>
              <div className="ft-account-destinations">
                <AccountDestinationLink to="/journal" icon="book" title={t('account.destination.journal.title')} description={t('account.destination.journal.description')}/>
                <AccountDestinationLink to="/share-links" icon="eye" title={t('account.destination.links.title')} description={t('account.destination.links.description')}/>
                <AccountDestinationLink to="/comparisons" icon="users" title={t('account.destination.comparisons.title')} description={t('account.destination.comparisons.description')}/>
              </div>
            </section>
            <section className="ft-account-panel" aria-labelledby="ft-account-control-title"><div className="ft-account-section-title"><span className="ft-account-section-mark rose"><Icon name="shield" size={20}/></span><div><h2 id="ft-account-control-title">{t('account.controlTitle')}</h2><p>{t('account.controlDescription')}</p></div></div>
              <div className="ft-account-destinations">
                <AccountDestinationLink to="/access" icon="lock" title={t('account.destination.access.title')} description={t('account.destination.access.description')}/>
                <AccountDestinationLink to="/verification" icon="check" title={t('account.destination.verification.title')} description={t('account.destination.verification.description')}/>
                <AccountDestinationLink to="/safety" icon="shield" title={t('account.destination.safety.title')} description={t('account.destination.safety.description')}/>
                <AccountDestinationLink to="/documents" icon="book" title={t('account.destination.documents.title')} description={t('account.destination.documents.description')}/>
              </div>
            </section>
          </div>
          <section className="ft-account-panel ft-account-preferences" aria-labelledby="ft-account-preferences-title"><h2 id="ft-account-preferences-title">{t('account.settingsTitle')}</h2><div className="ft-account-preference-grid"><ThemePicker/><div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')}/></div></div></section>
          <div className="ft-account-footer"><Link to="/account/delete" className="ft-account-delete-link">{locale.startsWith('en')?'Delete my FetUre data':'Удалить мои данные FetUre'}</Link><button className="ft-account-signout" type="button" disabled={signingOut} onClick={()=>void signOut()}><Icon name="back" size={17}/>{signingOut?t('account.signingOut'):t('account.signOut')}</button>{signOutError&&<p role="alert">{signOutError}</p>}</div>
        </> : <div className="ft-account-guest">
          <section className="ft-account-hero" aria-labelledby="ft-guest-title"><span className="ft-account-hero-orbit" aria-hidden="true"/><span className="ft-account-hero-kicker">{t('account.guestKicker')}</span><h2 id="ft-guest-title">{t('account.guestTitle')}</h2><p>{t('account.guestDescription')}</p><Link className="ft-account-secondary" to="/explore">{t('account.guestExplore')} <Icon name="arrow" size={18}/></Link></section>
          <section className="ft-account-panel ft-account-signin" aria-labelledby="ft-signin-title"><h2 id="ft-signin-title">{t('account.signInTitle')}</h2><p>{t('account.signInDescription')}</p><SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={()=>{const next=safeSignInReturnTo(location.state);navigate(next==='/'?'/design/F01':next,{replace:true});}}/></section>
          <details className="ft-account-panel ft-account-preferences ft-account-guest-settings"><summary>{t('account.settingsSummary')} <Icon name="arrow" size={18}/></summary><div className="ft-account-preference-grid"><ThemePicker/><div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')}/></div></div><Link className="ft-account-legal" to="/documents">{t('account.documentsTitle')}</Link></details>
        </div>}
      </div>
    </div>
  </div>;
}


// Only FetUre domain data may be removed here. Core identity is shared across products.
// The irreversible server transaction must be enabled only after Issue #1074 is accepted.
function DeleteFetureAccount(){
  const auth=useOptionalAuth();const {locale}=useI18n();const en=locale.startsWith('en');
  const [step,setStep]=useState<1|2>(1),[typed,setTyped]=useState(''),[understood,setUnderstood]=useState(false),[feedback,setFeedback]=useState(false);
  if(auth.loading)return <main className="ft-account-page" role="status">{en?'Checking account…':'Проверяем аккаунт…'}</main>;
  if(!auth.session)return <Navigate to="/account" replace/>;
  const email=auth.session.email;
  const matched=typed.trim().toLowerCase()===email.toLowerCase();
  return <main className="ft-account-page ft-delete-page">
    <div className="ft-account-layout"><div className="ft-account-content">
      <div className="ft-account-heading"><div><span className="ft-account-eyebrow">{en?'Data and privacy':'Данные и приватность'}</span>
        <h1>{en?'Delete FetUre profile':'Удаление профиля FetUre'}</h1></div><Link to="/account" className="ft-account-desktop-back"><Icon name="back" size={17}/>{en?'Account':'Аккаунт'}</Link></div>
      <section className="ft-account-panel ft-delete-explainer">
        <p>{en?'This action only concerns FetUre. Your AppBase email sign-in and data in FitTimer or UnMute must not be affected.':'Речь только о FetUre. Общий вход AppBase по email и данные FitTimer или UnMute затрагиваться не должны.'}</p>
        <h2>{en?'What removal includes':'Что потребуется удалить'}</h2>
        <ul>
          <li>{en?'Public and private profile, jars, tests, journal, photos and access grants':'Открытый и закрытый профиль, баночки, опросы, дневник, фотографии и выданные доступы'}</li>
          <li>{en?'Posts, replies, reactions, bookmarks and shared links':'Публикации, ответы, реакции, закладки и ссылки доступа'}</li>
          <li>{en?'Participation in communities, chats and events':'Участие в сообществах, чатах и событиях'}</li>
          <li>{en?'Your events must be cancelled with notice to attendees. Some discussions may become unavailable.':'Созданные события должны быть отменены с уведомлением участников. Некоторые обсуждения могут стать недоступны.'}</li>
        </ul>
        <p className="ft-delete-caution">{en?'Deletion is permanent. Any external ticket payments or third-party copies are handled separately.':'Удаление необратимо. Внешние оплаты билетов и копии материалов у третьих лиц обрабатываются отдельно.'}</p>
      </section>
      <section className="ft-account-panel ft-delete-confirm">
        <div className="ft-delete-stage">{en?'Step':'Шаг'} {step} / 2</div>
        {step===1?<><h2>{en?'Understand the consequences':'Последствия удаления'}</h2><p>{en?'Your own content will disappear from FetUre. Other people’s independent publications must remain.':'Твои материалы исчезнут из FetUre. Независимые публикации других участников должны сохраниться.'}</p><button className="ft-delete-next" onClick={()=>setStep(2)}>{en?'Continue to confirmation':'Перейти к подтверждению'}</button></>:
        <><h2>{en?'Confirm account':'Подтверди аккаунт'}</h2><p>{en?'Enter the signed-in email exactly to confirm which FetUre profile you want removed:':'Введи email текущего аккаунта, чтобы подтвердить, чей профиль FetUre нужно удалить:'}</p>
          <p className="ft-delete-email">{email}</p>
          <label className="ft-delete-input">{en?'Email confirmation':'Подтверждение email'}<input type="email" autoComplete="off" value={typed} onChange={e=>{setTyped(e.target.value);setFeedback(false);}} placeholder={email}/></label>
          <label className="ft-delete-check"><input type="checkbox" checked={understood} onChange={e=>{setUnderstood(e.target.checked);setFeedback(false);}}/>{en?'I understand that this cannot be undone.':'Я понимаю, что вернуть удалённые данные будет нельзя.'}</label>
          <button className="ft-delete-final" disabled={!matched||!understood} type="button" onClick={()=>setFeedback(true)}>{en?'Request permanent removal':'Подтвердить удаление'}</button>
          <button className="ft-delete-secondary" type="button" onClick={()=>{setStep(1);setFeedback(false);}}>{en?'Back':'Назад'}</button>
          {feedback&&<p role="alert" className="ft-delete-caution">{en?'Deletion is not yet connected to a safe server transaction. No data has been deleted. Your account is unchanged.':'Безопасная серверная процедура удаления ещё не подключена. Ничего не удалено, аккаунт не изменён.'}</p>}
        </>}
      </section><Link className="ft-account-legal" to="/account">{en?'Cancel and keep my account':'Отмена — оставить аккаунт'}</Link>
    </div></div>
  </main>;
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
        {path:'design', element:<Navigate to="/design/F01" replace/>},
        {path:'design/:screenId', element:<Suspense fallback={<main className="fd-loading" role="status">FetUre…</main>}><ProductDesign /></Suspense>},
        {path:'world', element:<Home />},
        {path:'start', element:<FirstStepsPage />},
        {path:'explore/:categoryId?', element:<Home />},
        {path:'community', element:<Home />},
        {path:'dating', element:<Home />},
        {path:'account', element:<Account />},
        {path:'account/delete', element:<DeleteFetureAccount />},
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
