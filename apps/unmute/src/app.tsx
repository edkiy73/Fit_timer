import { useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useLocation, type RouteObject } from 'react-router';
import { AuthProvider, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { I18nProvider, useI18n } from '@appbase/ui-react/i18n.js';
import { authClient } from './auth';
import { appDocs, syncNow } from './sync';
import { patchSettings, readSettings } from './settings';
import { dictionaries, i18nConfig, LOCALE_KEY } from './i18n';
import { LearnerCourseProvider } from './course-runtime';
import { useActiveCourseId } from './active-course';
import { TodayScreen } from './today';
import { NodeRunnerScreen } from './learn';
import { ReviewScreen } from './review';
import { CourseMapScreen } from './course-map';
import { LexiconProvider } from './lexicon-ui';
import { ProgressScreen } from './progress-screen';
import { MyWordsScreen } from './my-words';
import { OnboardingGate } from './onboarding';
import { AccessScreen } from './access';
import { NotificationDelivery, NotificationRouteListener } from './notification-delivery';
import { TabBar } from './tab-bar';
import { MeScreen } from './me-screen';

const PRODUCT_NAME = 'UnMute: English for Expats';

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
      try{
        const doc=await readSettings();
        if(live&&doc.locale){
          saved.current=doc.locale;
          setPreference(doc.locale);
        }
      }catch{}
      loaded.current=true;
    };
    void apply();
    const stop = appDocs.subscribe(change => { if(change.source === 'remote') void apply(); });
    return () => { live = false; stop(); };
  }, [setPreference]);

  useEffect(() => {
    if(!loaded.current || saved.current === preference) return;
    saved.current = preference;
    void patchSettings({locale:preference});
  }, [preference]);

  // Sign-in on this device (or a restored session): merge local data with the account now.
  useEffect(() => { if(email) syncNow(); }, [email]);
  return null;
}

/** Several courses can be published; the learner's choice lives in the synced settings. */
function ActiveCourse({children}: {children: ReactNode}){
  const setId = useActiveCourseId();
  return <LearnerCourseProvider setId={setId}>{children}</LearnerCourseProvider>;
}

function Root(){
  return (
    <Localized>
      <AuthProvider client={authClient}>
        <SettingsSync />
        <LexiconProvider>
          <ActiveCourse>
            <Outlet />
          </ActiveCourse>
        </LexiconProvider>
      </AuthProvider>
    </Localized>
  );
}

/** A new tab or screen opens from its top (a screen may then scroll itself, e.g. to «Ты здесь»). */
function ScrollToTop(){
  const {pathname} = useLocation();
  useEffect(() => { window.scrollTo?.(0, 0); }, [pathname]);
  return null;
}

// No global header: every screen owns its title; the bottom bar is the navigation.
// Onboarding replaces the whole shell, bar included.
function Shell(){
  return (
    <main className="app">
      <ScrollToTop />
      <NotificationRouteListener />
      <NotificationDelivery />
      <OnboardingGate>
        <div className="app-screen"><Outlet /></div>
        <TabBar />
      </OnboardingGate>
    </main>
  );
}

function Home(){
  return <TodayScreen />;
}

export const routes: RouteObject[] = [
  {
    path:'/',
    element:<Root />,
    children:[{
      element:<Shell />,
      children:[
        {index:true, element:<Home />},
        {path:'learn/:nodeId', element:<NodeRunnerScreen />},
        {path:'review', element:<ReviewScreen />},
        {path:'course', element:<CourseMapScreen />},
        {path:'progress', element:<ProgressScreen />},
        {path:'words', element:<MyWordsScreen />},
        {path:'access', element:<AccessScreen />},
        {path:'account', element:<MeScreen />}
      ]
    }]
  },
  {
    path:'/admin',
    lazy:async () => {
      const {AdminScreen} = await import('./admin-screen');
      return {Component:() => <Localized><AdminScreen productName={PRODUCT_NAME} /></Localized>};
    }
  }
];
