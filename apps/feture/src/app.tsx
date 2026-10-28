import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useNavigate, useLocation, type RouteObject, Navigate } from 'react-router';
import { AuthProvider, SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { I18nProvider, LanguagePicker, sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import product from '../config/product.json';
import { authClient } from './auth';
import {sandboxActive,endSandbox} from './feture/design/sandbox-session';
import {sandboxTarget} from './feture/design/sandbox-route';
import { adminClient } from './admin';
import { appDocs, SETTINGS_DOC, syncNow } from './sync';
import { dictionaries, i18nConfig, LOCALE_KEY } from './i18n';
import { NotFoundScreen, RouteErrorScreen } from './route-fallback';
import { sameSession } from './feture/interest-api';
import { InterestLifecycle, interestQueue } from './feture/use-interest-map';
import { FeRoot } from './fe/shell';
import { FeedTab } from './fe/feed';
import { page, screen } from './lazy-screens';
// Every /n screen but the feed (the first one) is its own chunk: the first screen ships less script, and the rest is
// fetched in the background once it shows (lazy-screens.ts → prefetchScreens), so a tap later never waits for it.
const communities=()=>import('./fe/communities'),inbox=()=>import('./fe/inbox'),pair=()=>import('./fe/pair'),settings=()=>import('./fe/settings'),
 settingsLists=()=>import('./fe/settings-lists'),accountExtra=()=>import('./fe/account-extra'),chats=()=>import('./fe/chats'),people=()=>import('./fe/people'),
 profileExtras=()=>import('./fe/profile-extras'),meTab=()=>import('./fe/me'),meEdit=()=>import('./fe/me-edit'),mine=()=>import('./fe/mine'),access=()=>import('./fe/access'),
 links=()=>import('./fe/links'),browse=()=>import('./fe/browse'),interests=()=>import('./fe/interests'),staff=()=>import('./fe/staff'),ageCheck=()=>import('./fe/age-check'),
 photoCheck=()=>import('./fe/photo-check'),feed=()=>import('./fe/feed'),createCommunity=()=>import('./fe/create-community'),createEvent=()=>import('./fe/create-event'),host=()=>import('./fe/host');
const CommunitiesTab=screen(communities,'CommunitiesTab'),CommunityScreen=screen(communities,'CommunityScreen'),EventScreen=screen(communities,'EventScreen');
const ChatsTab=screen(chats,'ChatsTab'),ChatScreen=screen(chats,'ChatScreen'),PeopleTab=screen(people,'PeopleTab'),PersonScreen=screen(people,'PersonScreen');
const MeTab=screen(meTab,'MeTab'),MeEditScreen=screen(meEdit,'MeEditScreen'),MinePartScreen=screen(mine,'MinePartScreen'),MyPostsScreen=screen(mine,'MyPostsScreen'),SavedScreen=screen(mine,'SavedScreen');
const InboxScreen=screen(inbox,'InboxScreen'),PairScreen=screen(pair,'PairScreen');
const SettingsScreen=screen(settings,'SettingsScreen'),NotificationSettingsScreen=screen(settings,'NotificationSettingsScreen'),DataScreen=screen(settings,'DataScreen');
const HiddenFeedScreen=screen(settingsLists,'HiddenFeedScreen'),BlockedScreen=screen(settingsLists,'BlockedScreen');
const PremiumScreen=screen(accountExtra,'PremiumScreen'),SecurityScreen=screen(accountExtra,'SecurityScreen'),HelpScreen=screen(accountExtra,'HelpScreen');
const CompatScreen=screen(profileExtras,'CompatScreen'),HistoryScreen=screen(profileExtras,'HistoryScreen'),MePreviewScreen=screen(profileExtras,'MePreviewScreen');
const AccessScreen=screen(access,'AccessScreen'),LinksScreen=screen(links,'LinksScreen'),LinkEditScreen=screen(links,'LinkEditScreen');
const FollowsScreen=screen(browse,'FollowsScreen'),GalleryScreen=screen(browse,'GalleryScreen'),SearchScreen=screen(browse,'SearchScreen'),TopicScreen=screen(browse,'TopicScreen');
const InterestsScreen=screen(interests,'InterestsScreen'),StaffScreen=screen(staff,'StaffScreen');
const AgeCheckScreen=screen(ageCheck,'AgeCheckScreen'),PhotoCheckScreen=screen(photoCheck,'PhotoCheckScreen');
const PostScreen=screen(feed,'PostScreen'),ComposeScreen=screen(feed,'ComposeScreen'),EditPostScreen=screen(feed,'EditPostScreen');
const CreateCommunityScreen=screen(createCommunity,'CreateCommunityScreen'),EditCommunityScreen=screen(createCommunity,'EditCommunityScreen');
const CreateEventScreen=screen(createEvent,'CreateEventScreen'),EditEventScreen=screen(createEvent,'EditEventScreen');
const CommunityManageScreen=screen(host,'CommunityManageScreen'),CommunityRequestsScreen=screen(host,'CommunityRequestsScreen'),CommunityMembersScreen=screen(host,'CommunityMembersScreen'),
 EventManageScreen=screen(host,'EventManageScreen'),EventApplicationsScreen=screen(host,'EventApplicationsScreen'),EventAttendeesScreen=screen(host,'EventAttendeesScreen'),EventApplyScreen=screen(host,'EventApplyScreen');
const ProductDesign = lazy(async()=>({default:(await import('./feture/design/product-design')).ProductDesign}));
import { ProductLayout } from './feture/primary-navigation';
import { DatingPresentationProvider } from './feture/dating-presentation';
import { NativeNavigation } from './feture/native-navigation';
import { AppLinks } from './fe/app-links';
import { isExperiencePath } from './feture/navigation';
import { ThemePicker } from './feture/components/ThemePicker';
import { safeSignInReturnTo } from './feture/sign-in-return';
import { Icon, type IconName } from './feture/components/Icon';
import type {AdminSection} from '@appbase/ui-react/admin.js';
const AdminPanel=page(()=>import('@appbase/ui-react/admin.js'),'AdminPanel');
const FetureCatalog=page(()=>import('./catalog'),'FetureCatalog');
const FetureExperience=page(()=>import('./feture/experience'),'FetureExperience');
const FirstStepsPage=page(()=>import('./feture/first-steps'),'FirstStepsPage');
const VerificationPage=page(()=>import('./feture/verification-page'),'VerificationPage');
const DocumentsPage=page(()=>import('./feture/documents-page'),'DocumentsPage');
const DocumentsAdmin=page(()=>import('./feture/documents-admin'),'DocumentsAdmin');
const ProfilePage=page(()=>import('./feture/profile-page'),'ProfilePage');
const accessPage=()=>import('./feture/access-page');const AccessPage=page(accessPage,'AccessPage'),PeerProfilePage=page(accessPage,'PeerProfilePage');
const JournalPage=page(()=>import('./feture/journal-page'),'JournalPage');
const ModerationPage=page(()=>import('./feture/moderation-page'),'ModerationPage');
const QuestionnairesPage=page(()=>import('./feture/questionnaire-page'),'QuestionnairesPage');
const QuestionnairesAdmin=page(()=>import('./feture/questionnaire-admin'),'QuestionnairesAdmin');
const CatalogAdmin=page(()=>import('./feture/catalog-admin'),'CatalogAdmin');
const ModerationAdmin=page(()=>import('./feture/moderation-admin'),'ModerationAdmin');
const OperatorsAdmin=page(()=>import('./feture/operators-admin'),'OperatorsAdmin');
const MetricsAdmin=page(()=>import('./feture/metrics-admin'),'MetricsAdmin');
const UpdateAdmin=page(()=>import('./feture/update-admin'),'UpdateAdmin');
const QaAdultAdmin=page(()=>import('./feture/qa-adult-admin'),'QaAdultAdmin');
const OperatorPage=page(()=>import('./feture/operator-page'),'OperatorPage');
const shareLinks=()=>import('./feture/share-links-page');const ShareLinksPage=page(shareLinks,'ShareLinksPage'),SharedCardPage=page(shareLinks,'SharedCardPage');
const ComparisonPage=page(()=>import('./feture/comparison-page'),'ComparisonPage');
const productAdminSections:readonly AdminSection[]=[
  // Keep IDs stable: AppBase persists the last selected tab in sessionStorage.
  {id:'feture-moderation',label:'Модерация публикаций',group:'Проверка и доступ',render:context=><ModerationAdmin {...context}/>},
  {id:'feture-qa-adult',label:'Временный доступ 18+',group:'Проверка и доступ',render:context=><QaAdultAdmin {...context}/>},
  {id:'feture-operators',label:'Роли операторов',group:'Проверка и доступ',render:context=><OperatorsAdmin {...context}/>},
  {id:'feture-catalog',label:'Темы каталога',group:'Редактура',render:context=><CatalogAdmin {...context}/>},
  {id:'feture-tests',label:'Опросники',group:'Редактура',render:context=><QuestionnairesAdmin {...context}/>},
  {id:'feture-documents',label:'Документы и согласия',group:'Редактура',render:context=><DocumentsAdmin {...context}/>},
  {id:'feture-metrics',label:'Активность FetUre',group:'Наблюдение',render:context=><MetricsAdmin {...context}/>},
  {id:'feture-app-update',label:'Обновление приложения',group:'Приложение',render:context=><UpdateAdmin {...context}/>}
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

function SandboxAuthFence(){
 const auth=useOptionalAuth();
 useEffect(()=>{if(auth.session)endSandbox();},[auth.session]);
 return null;
}

/** Background work of the current screens (settings sync, the interest queue on /api/domain). The V21 screens on
 * /n use /api/fe only; running these there sent hundreds of failing legacy requests and slowed every screen. */
function LegacyBackground(){
  const {pathname}=useLocation();
  if(pathname==='/n'||pathname.startsWith('/n/'))return null;
  return <><SettingsSync /><SandboxAuthFence /><InterestLifecycle /></>;
}

function Root(){
  return (
    <Localized>
      <AuthProvider client={authClient}>
        <LegacyBackground />
        <NativeNavigation />
        <AppLinks />
        <DatingPresentationProvider><ProductLayout><Outlet /></ProductLayout></DatingPresentationProvider>
      </AuthProvider>
    </Localized>
  );
}

/** While the code of an earlier page (outside /n) or the admin loads. */
function PageLoading(){
  const {t}=useI18n();
  return <div className="ft-welcome-loading" role="status">{t('account.appLoading')}</div>;
}

function Shell(){
  const auth=useOptionalAuth(); const {t}=useI18n(); const location=useLocation();
  if(!auth.loading&&!auth.session&&sandboxActive()){
   const destination=sandboxTarget(location.pathname);
   if(destination)return <Navigate to={destination} replace/>;
  }
  if(isExperiencePath(location.pathname)||location.pathname==='/start'||location.pathname.startsWith('/design/')) return <Suspense fallback={<PageLoading/>}><Outlet /></Suspense>;
  const study=location.pathname==='/tests'||location.pathname.startsWith('/tests/');
  return <main className={study?'app ft-study-shell':(location.pathname==='/account'||location.pathname==='/profile')?'app ft-account-shell':'app'}><header className="app-header">
    <div><div className="eyebrow">{t('app.eyebrow')}</div><h1>{PRODUCT_NAME}</h1></div>
    {!auth.loading && <Link className="link-button" to="/account">{auth.session?t('nav.account'):t('nav.signIn')}</Link>}
  </header><Suspense fallback={<PageLoading/>}><Outlet /></Suspense></main>;
}

function Home(){
  const location=useLocation();
  // The V21 screens on /api/fe are the app now: signed out, /n shows their welcome slides (FeGate → SignedOut).
  if(location.pathname==='/')return <Navigate to="/n/feed" replace/>;
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
 const sandbox=sandboxActive()&&!auth.session;
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
          <div className="ft-account-footer"><button className="ft-account-signout" type="button" disabled={signingOut} onClick={()=>void signOut()}><Icon name="back" size={17}/>{signingOut?t('account.signingOut'):t('account.signOut')}</button>{signOutError&&<p role="alert">{signOutError}</p>}</div>
        </> : <div className="ft-account-guest">
          <section className="ft-account-hero" aria-labelledby="ft-guest-title"><span className="ft-account-hero-orbit" aria-hidden="true"/><span className="ft-account-hero-kicker">{t('account.guestKicker')}</span><h2 id="ft-guest-title">{t('account.guestTitle')}</h2><p>{t('account.guestDescription')}</p><Link className="ft-account-secondary" to="/explore">{t('account.guestExplore')} <Icon name="arrow" size={18}/></Link></section>
          {sandbox&&<section className="ft-account-panel ft-account-signin"><h2>{locale.startsWith('en')?'Temporary account':'Временный аккаунт'}</h2><p>{locale.startsWith('en')?'This account has no saved data. Exiting destroys all changes.':'В этом аккаунте нет сохранённых данных. При выходе все изменения исчезнут.'}</p><Link className="ft-account-primary" to="/design/F01">{locale.startsWith('en')?'Back to app':'Вернуться в приложение'}</Link><button className="ft-account-signout" type="button" onClick={()=>{endSandbox();navigate('/design/A01',{replace:true});}}>{locale.startsWith('en')?'Exit and reset':'Выйти и очистить'}</button></section>}
          {!sandbox&&<section className="ft-account-panel ft-account-signin" aria-labelledby="ft-signin-title"><h2 id="ft-signin-title">{t('account.signInTitle')}</h2><p>{t('account.signInDescription')}</p><SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={()=>{const next=safeSignInReturnTo(location.state);navigate(next==='/'?'/design/F01':next,{replace:true});}}/></section>}
          <details className="ft-account-panel ft-account-preferences ft-account-guest-settings"><summary>{t('account.settingsSummary')} <Icon name="arrow" size={18}/></summary><div className="ft-account-preference-grid"><ThemePicker/><div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')}/></div></div><Link className="ft-account-legal" to="/documents">{t('account.documentsTitle')}</Link></details>
        </div>}
      </div>
    </div>
  </div>;
}

function Admin(){
  const {locale} = useI18n();
  return <Suspense fallback={<PageLoading/>}><AdminPanel client={adminClient} locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} extraSections={productAdminSections} hiddenCoreTabs={hiddenFetureCoreTabs} /></Suspense>;
}

export const routes: RouteObject[] = [
  {
    path:'/',
    element:<Root />,
    errorElement:<Localized><RouteErrorScreen /></Localized>,
    children:[{
      // V21 screens on /api/fe, moved slice by slice (V21-INTEGRATION-GUIDE §4); the current ones stay until then.
      path:'n', element:<FeRoot />,
      children:[
        {index:true, element:<Navigate to="/n/feed" replace/>},
        {path:'feed', element:<FeedTab />},
        {path:'feed/new', element:<ComposeScreen />},
        {path:'feed/post/:id', element:<PostScreen />},
        {path:'feed/post/:id/edit', element:<EditPostScreen />},
        {path:'people', element:<PeopleTab />},
        {path:'people/history', element:<HistoryScreen />},
        {path:'people/:id', element:<PersonScreen />},
        {path:'people/:id/compat', element:<CompatScreen />},
        {path:'people/:id/link', element:<LinkEditScreen />},
        {path:'people/:id/follows', element:<FollowsScreen />},
        {path:'people/:id/gallery', element:<GalleryScreen />},
        {path:'topics/:id', element:<TopicScreen />},
        {path:'search', element:<SearchScreen />},
        {path:'communities', element:<CommunitiesTab />},
        {path:'communities/new', element:<CreateCommunityScreen />},
        {path:'communities/:id', element:<CommunityScreen />},
        {path:'communities/:id/manage', element:<CommunityManageScreen />},
        {path:'communities/:id/edit', element:<EditCommunityScreen />},
        {path:'communities/:id/requests', element:<CommunityRequestsScreen />},
        {path:'communities/:id/members', element:<CommunityMembersScreen />},
        {path:'events/new', element:<CreateEventScreen />},
        {path:'events/:id', element:<EventScreen />},
        {path:'events/:id/manage', element:<EventManageScreen />},
        {path:'events/:id/edit', element:<EditEventScreen />},
        {path:'events/:id/applications', element:<EventApplicationsScreen />},
        {path:'events/:id/attendees', element:<EventAttendeesScreen />},
        {path:'events/:id/apply', element:<EventApplyScreen />},
        {path:'inbox', element:<InboxScreen />},
        {path:'settings', element:<SettingsScreen />},
        {path:'settings/notifications', element:<NotificationSettingsScreen />},
        {path:'settings/data', element:<DataScreen />},
        {path:'settings/hidden', element:<HiddenFeedScreen />},
        {path:'settings/blocked', element:<BlockedScreen />},
        {path:'settings/security', element:<SecurityScreen />},
        {path:'premium', element:<PremiumScreen />},
        {path:'help', element:<HelpScreen />},
        {path:'settings/age', element:<AgeCheckScreen />},
        {path:'settings/photo-check', element:<PhotoCheckScreen />},
        {path:'chats', element:<ChatsTab />},
        {path:'chats/:id', element:<ChatScreen />},
        {path:'me', element:<MeTab />},
        {path:'me/preview', element:<MePreviewScreen />},
        {path:'me/links', element:<LinksScreen />},
        {path:'me/edit', element:<MeEditScreen />},
        {path:'me/events', element:<MinePartScreen part="events" />},
        {path:'me/communities', element:<MinePartScreen part="communities" />},
        {path:'me/shared', element:<AccessScreen mine />},
        {path:'me/access', element:<AccessScreen />},
        {path:'me/follows', element:<FollowsScreen />},
        {path:'me/posts', element:<MyPostsScreen />},
        {path:'me/saved', element:<SavedScreen />},
        {path:'me/pair', element:<PairScreen />},
        {path:'me/interests', element:<InterestsScreen />},
        {path:'staff', element:<StaffScreen />},
        {path:'*', element:<Navigate to="/n/feed" replace/>}
      ]
    },{
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
