import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import product from '../config/product.json';
import { useLearnerCourseRuntime } from './course-runtime';
import { ProgressView, useProgressCourseRuntime, useProgressDetails } from './progress-screen';
import { activitySaveClock } from './activity-progress';
import { Icon } from './icons';
import { Sheet } from './sheet';
import { useAllLearningDays } from './learning-days';
import { useCatalog } from './active-course';
import { localizedText } from './today-model';
import { ScreenHeader } from './screen-header';

const PRODUCT_NAME = 'UnMute: English for Expats';
// Handle step at first sign-in: config/product.json → auth.askHandle.
const ASK_HANDLE = product.auth?.askHandle !== false;

// Manual statistics course lives only for the current app session.
// A fresh app launch starts from the active course again.
let profileStatsCourseOverride:string|null=null;

/* «Я»: who you are, your results and the way to settings. Signing in is one button that opens
   the code form in a sheet; signing out and deleting the account live in «Настройки». */
export function MeScreen(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const runtime = useLearnerCourseRuntime();
  const catalog = useCatalog();
  const activeCourseId = runtime.state?.set.id || '';
  const availableCourseIds = new Set((catalog.data?.sets ?? []).map(set=>set.id));
  const rememberedCourseId = profileStatsCourseOverride && availableCourseIds.has(profileStatsCourseOverride)
    ? profileStatsCourseOverride
    : '';
  const [statsCourseId,setStatsCourseIdState] = useState(rememberedCourseId);
  const selectedCourseId = statsCourseId || activeCourseId;
  const setStatsCourseId=(id:string)=>{
    profileStatsCourseOverride=id;
    setStatsCourseIdState(id);
  };
  const statsRuntime = useProgressCourseRuntime(selectedCourseId);
  const details = useProgressDetails(selectedCourseId);
  const learningDays = useAllLearningDays();
  const courseOptions = (catalog.data?.sets ?? []).map(set=>({id:set.id,label:localizedText(set.title,locale)}));
  const requestedReturn = new URLSearchParams(location.search).get('return') || '';
  const returnTo = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '';
  // Arriving with ?return= (a lesson asked to sign in) opens the form straight away.
  const [signInOpen, setSignInOpen] = useState(Boolean(returnTo));

  if(auth.loading){
    return (
      <section className="me me-profile profile-loading" aria-busy="true">
        <header className="screen-head" aria-hidden="true">
          <span className="skeleton skeleton-line skeleton-kicker" />
          <span className="skeleton skeleton-line skeleton-title" />
        </header>
        <div className="progress-shell" aria-hidden="true">
          <article className="card progress-dashboard profile-skeleton-card">
            <span className="skeleton skeleton-line skeleton-section-title" />
            <div className="progress-general-metrics">
              <span className="skeleton skeleton-metric" />
              <span className="skeleton skeleton-metric" />
            </div>
            <span className="skeleton skeleton-calendar" />
          </article>
          <article className="card progress-dashboard profile-skeleton-card">
            <span className="skeleton skeleton-line skeleton-section-title" />
            <span className="skeleton skeleton-course-hero" />
            <span className="skeleton skeleton-course-detail" />
          </article>
        </div>
      </section>
    );
  }
  const email = auth.session?.email || '';

  return (
    <section className="me me-profile" aria-labelledby="me-title">
      <ScreenHeader
        kicker={email ? email + (auth.session?.handle ? ' · ' + auth.session.handle : '') : t('me.guestName')}
        title={t('me.title')}
        titleId="me-title"
        action={<Link className="me-settings pressable" to="/settings" aria-label={t('me.settings')}><Icon name="settings" size={22} /></Link>}
      />

      {!auth.session && (
        <div className="tile me-signin">
          <p className="tile-text">{t('me.guest')}</p>
          <button className="primary-button" type="button" onClick={() => setSignInOpen(true)}>{t('me.signIn')}</button>
        </div>
      )}

      <ProgressView
        embedded
        runtime={statsRuntime}
        details={details}
        learningDays={learningDays}
        todayDay={activitySaveClock().dayNumber}
        onExit={() => navigate('/')}
        courses={courseOptions}
        courseSets={catalog.data?.sets ?? []}
        selectedCourseId={selectedCourseId}
        onCourseChange={setStatsCourseId}
      />

      <Sheet open={signInOpen && !auth.session} onClose={() => setSignInOpen(false)} labelledBy="me-signin-title" closeLabel={t('access.signInClose')}>
        <div className="access-signin" id="me-signin-title">
          <SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline"
            title={t('me.signInTitle')} lead={t('me.signInText')}
            onSignedIn={() => { setSignInOpen(false); if(returnTo) navigate(returnTo); }} />
        </div>
      </Sheet>
    </section>
  );
}
