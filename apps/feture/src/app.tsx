import { useEffect, useRef, type ReactNode } from 'react';
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
import { FetureExperience } from './feture/experience';
import { NativeNavigation } from './feture/native-navigation';
import { isExperiencePath } from './feture/navigation';
import { ThemePicker } from './feture/components/ThemePicker';

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
  // Clear private local records on sign-out; server revocation is pending A01.
  const signOut = async () => {
    if(await appDocs.pending() && !window.confirm('Есть данные, не перенесённые в аккаунт. При выходе локальные записи будут удалены. Продолжить?')) return;
    await auth.logout();
    await appDocs.clear(); // Privacy: never carry this device's sensitive interests into another account.
    navigate('/');
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
          <button className="link-button" type="button" onClick={() => void signOut()}>{t('account.signOut')}</button>
        </>
      ) : (
        <>
          <p className="muted">{t('account.localHint')}</p>
          <SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={() => navigate('/')} />
        </>
      )}
      <ThemePicker />
      <div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')} /></div>
    </section>
  );
}

function Admin(){
  const {locale} = useI18n();
  return <AdminPanel client={adminClient} locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} />;
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
