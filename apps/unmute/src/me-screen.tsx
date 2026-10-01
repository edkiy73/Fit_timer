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

const PRODUCT_NAME = 'UnMute: English for Expats';
// Handle step at first sign-in: config/product.json → auth.askHandle.
const ASK_HANDLE = product.auth?.askHandle !== false;

/* «Я»: who you are, your results and the way to settings. Signing in is one button that opens
   the code form in a sheet; signing out and deleting the account live in «Настройки». */
export function MeScreen(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const runtime = useLearnerCourseRuntime();
  const catalog = useCatalog();
  const [statsCourseId,setStatsCourseId] = useState('');
  const selectedCourseId = statsCourseId || runtime.state?.set.id || '';
  const statsRuntime = useProgressCourseRuntime(selectedCourseId);
  const details = useProgressDetails(selectedCourseId);
  const learningDays = useAllLearningDays();
  const courseOptions = (catalog.data?.sets ?? []).map(set=>({id:set.id,label:localizedText(set.title,locale)}));
  const requestedReturn = new URLSearchParams(location.search).get('return') || '';
  const returnTo = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '';
  // Arriving with ?return= (a lesson asked to sign in) opens the form straight away.
  const [signInOpen, setSignInOpen] = useState(Boolean(returnTo));

  if(auth.loading) return null;
  const email = auth.session?.email || '';

  return (
    <section className="me me-profile" aria-labelledby="me-title">
      <header className="screen-head">
        <div className="screen-kicker">{email ? email + (auth.session?.handle ? ' · ' + auth.session.handle : '') : t('me.guestName')}</div>
        <div className="screen-title-row">
          <h2 id="me-title">{t('me.title')}</h2>
          <Link className="me-settings pressable" to="/settings" aria-label={t('me.settings')}><Icon name="settings" size={22} /></Link>
        </div>
      </header>

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
