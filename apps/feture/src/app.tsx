import { Suspense, type ReactNode } from 'react';
import { Link, Outlet, type RouteObject, Navigate } from 'react-router';
import { AuthProvider } from '@appbase/ui-react/auth.js';
import { I18nProvider, sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import { authClient } from './auth';
import { adminClient } from './admin';
import { dictionaries, i18nConfig, LOCALE_KEY } from './i18n';
import { RouteErrorScreen } from './route-fallback';
import './feture/staff.css';
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
const ChatsTab=screen(chats,'ChatsTab'),ChatScreen=screen(chats,'ChatScreen'),RequestsScreen=screen(chats,'RequestsScreen'),PeopleTab=screen(people,'PeopleTab'),PersonScreen=screen(people,'PersonScreen');
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
import { NativeNavigation } from './feture/native-navigation';
import { AppLinks } from './fe/app-links';
import type {AdminSection} from '@appbase/ui-react/admin.js';
const AdminPanel=page(()=>import('@appbase/ui-react/admin.js'),'AdminPanel');
const QuestionnairesAdmin=page(()=>import('./feture/questionnaire-admin'),'QuestionnairesAdmin');
const DocumentsAdmin=page(()=>import('./feture/documents-admin'),'DocumentsAdmin');
const CatalogAdmin=page(()=>import('./feture/catalog-admin'),'CatalogAdmin');
const ModerationAdmin=page(()=>import('./feture/moderation-admin'),'ModerationAdmin');
const OperatorsAdmin=page(()=>import('./feture/operators-admin'),'OperatorsAdmin');
const MetricsAdmin=page(()=>import('./feture/metrics-admin'),'MetricsAdmin');
const UpdateAdmin=page(()=>import('./feture/update-admin'),'UpdateAdmin');
const QaAdultAdmin=page(()=>import('./feture/qa-adult-admin'),'QaAdultAdmin');
const OperatorPage=page(()=>import('./feture/operator-page'),'OperatorPage');
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
function Localized({children}: {children: ReactNode}){
  return <I18nProvider dictionaries={dictionaries} config={i18nConfig} storageKey={LOCALE_KEY}>{children}</I18nProvider>;
}

function Root(){
  return (
    <Localized>
      <AuthProvider client={authClient}>
        <NativeNavigation />
        <AppLinks />
        <Outlet />
      </AuthProvider>
    </Localized>
  );
}

/** While the code of the operator page or the admin loads. */
function PageLoading(){
  const {t}=useI18n();
  return <div className="ft-welcome-loading" role="status">{t('account.appLoading')}</div>;
}

/** The staff workspace (/operator): a plain card page outside the app screens. */
function Shell(){
  const {t}=useI18n();
  return <main className="app"><header className="app-header">
    <div><div className="eyebrow">{t('app.eyebrow')}</div><h1>{PRODUCT_NAME}</h1></div>
    <Link className="link-button" to="/n/feed">{t('route.home')}</Link>
  </header><Suspense fallback={<PageLoading/>}><Outlet /></Suspense></main>;
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
      // The app: V21 screens on /api/fe.
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
        {path:'chats/requests', element:<RequestsScreen />},
        {path:'chats/new/:to', element:<ChatScreen />},
        {path:'chats/:id', element:<ChatScreen />},
        {path:'me', element:<MeTab />},
        {path:'me/preview', element:<MePreviewScreen />},
        {path:'me/links', element:<LinksScreen />},
        {path:'me/edit', element:<MeEditScreen />},
        {path:'me/events', element:<MinePartScreen part="events" />},
        {path:'me/communities', element:<MinePartScreen part="communities" />},
        {path:'me/shared', element:<Navigate to="/n/me/access?tab=withme" replace/>}, // «Моё → Мне открыли»: the one «Доступы» screen
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
      children:[{path:'operator', element:<OperatorPage />}]
    },
    {index:true, element:<Navigate to="/n/feed" replace/>},
    {path:'*', element:<Navigate to="/n/feed" replace/>}]
  },
  {
    path:'/admin',
    element:<Localized><Admin /></Localized>
  }
];
