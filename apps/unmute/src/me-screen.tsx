import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import product from '../config/product.json';
import { appDocs } from './sync';
import { useLearnerCourseRuntime } from './course-runtime';
import { currentLearningStreak } from './progress-screen';
import { activitySaveClock } from './activity-progress';
import { Icon } from './icons';
import { useAllLearningDays, withAllLearningDays } from './learning-days';

const PRODUCT_NAME = 'UnMute: English for Expats';
// Handle step at first sign-in: config/product.json → auth.askHandle.
const ASK_HANDLE = product.auth?.askHandle !== false;
export function MeScreen(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const runtime = useLearnerCourseRuntime();
  const requestedReturn = new URLSearchParams(location.search).get('return') || '';
  const returnTo = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '/';
  const todayDay = activitySaveClock().dayNumber;

  const state = runtime.state;
  const learningDays = useAllLearningDays();
  const allDays = useMemo(() => state ? withAllLearningDays(state.progress, learningDays) : null, [state, learningDays]);

  // Local data stays on the device; the next sign-in merges it into that account.
  const signOut = async () => {
    await auth.logout();
    await appDocs.detach();
    navigate('/');
  };
  if(auth.loading) return null;

  const email = auth.session?.email || '';
  const progressLine = state && allDays
    ? t('me.progressLine', {
        streak:currentLearningStreak(allDays, todayDay),
        done:state.roadmapProgress.completedCount,
        total:state.roadmapProgress.requiredCount
      })
    : '';
  return (
    <section className="me" aria-labelledby="me-title">
      <header className="me-head">
        <span className="avatar" aria-hidden="true">{email ? email.charAt(0).toUpperCase() : <Icon name="me" size={26} />}</span>
        <div className="me-head-text">
          <h2 id="me-title">{t('me.title')}</h2>
          <span>{email ? email + (auth.session?.handle ? ' · ' + auth.session.handle : '') : t('me.guest')}</span>
        </div>
      </header>

      <div className="me-rows">
        <Link className="me-row pressable" to="/progress">
          <Icon name="progress" />
          <span className="me-row-text"><b>{t('me.progress')}</b>{progressLine && <small>{progressLine}</small>}</span>
          <Icon name="chevron" size={20} className="me-row-chevron" />
        </Link>
        <Link className="me-row pressable" to="/settings">
          <Icon name="settings" />
          <span className="me-row-text"><b>{t('me.settings')}</b><small>{t('me.settingsLine')}</small></span>
          <Icon name="chevron" size={20} className="me-row-chevron" />
        </Link>
      </div>

      {auth.session ? (
        <section className="settings" id="me-account" aria-labelledby="account-title">
          <h3 id="account-title" className="section-title">{t('account.title')}</h3>
          <div className="tile settings-card">
            <p className="tile-text">{t('account.synced')}</p>
            <button className="secondary-button" type="button" onClick={() => void signOut()}>{t('account.signOut')}</button>
          </div>
        </section>
      ) : (
        // The form has its own heading and hint; «Я» already says why to sign in.
        <div className="tile settings-card" id="me-account">
          <SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={() => navigate(returnTo)} />
        </div>
      )}
    </section>
  );
}
