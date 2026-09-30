import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { LanguagePicker, sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import product from '../config/product.json';
import { appDocs } from './sync';
import { useLearnerCourseRuntime } from './course-runtime';
import { useSavedWords, savedWordStatus } from './saved-words';
import { currentLearningStreak } from './progress-screen';
import { activitySaveClock } from './activity-progress';
import { dayNumberFromKey } from './engine/course-progress';
import type { CourseProgressDocument } from './progress';
import { NotificationSettingsPanel } from './notification-settings';
import { readThemePreference, setThemePreference, type ThemePreference } from './theme';
import { Icon } from './icons';
import { CoursePicker } from './active-course';
import { useAllLearningDays, withAllLearningDays } from './learning-days';

const PRODUCT_NAME = 'UnMute: English for Expats';
// Handle step at first sign-in: config/product.json → auth.askHandle.
const ASK_HANDLE = product.auth?.askHandle !== false;
const DAY_MS = 86_400_000;
export const ACTIVITY_WEEKS = 12;

/** Monday-first calendar of the last `weeks` weeks ending with the current one:
 *  columns are weeks, rows are weekdays; days after today are marked `future`. */
export function activityCalendar(progress: CourseProgressDocument, todayDay: number, weeks = ACTIVITY_WEEKS){
  const days = new Set<number>();
  for(const [key, value] of Object.entries(progress.learningDays)){
    if(!value || value.deleted) continue;
    try{ days.add(dayNumberFromKey(key)); }catch{}
  }
  const weekday = (day: number) => (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
  const start = todayDay - weekday(todayDay) - 7 * (weeks - 1);
  const cells = Array.from({length:weeks * 7}, (_, index) => {
    const day = start + index;
    return {day, active:days.has(day), future:day > todayDay};
  });
  return {cells, active:cells.filter(cell => cell.active).length};
}

function Ring({value, total}: {value: number; total: number}){
  const size = 64, stroke = 6, radius = (size - stroke) / 2, length = 2 * Math.PI * radius;
  return (
    <span className="ring ring-lg ring-accent" aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        {value > 0 && <circle className="ring-value" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${length * (total ? value / total : 0)} ${length}`} />}
      </svg>
      <span>{value}/{total}</span>
    </span>
  );
}

function ThemePicker(){
  const {t} = useI18n();
  const [value, setValue] = useState<ThemePreference>(() => readThemePreference());
  const options: {id: ThemePreference; label: string}[] = [
    {id:'system', label:t('me.themeSystem')},
    {id:'light', label:t('me.themeLight')},
    {id:'dark', label:t('me.themeDark')}
  ];
  return (
    <fieldset className="theme-field">
      <legend className="settings-label">{t('me.theme')}</legend>
      <div className="segmented">
      {options.map(option => (
        <label key={option.id} className={'segment pressable' + (value === option.id ? ' is-on' : '')}>
          <input
            type="radio"
            name="unmute-theme"
            value={option.id}
            checked={value === option.id}
            onChange={() => { setValue(option.id); setThemePreference(option.id); }}
          />
          {option.label}
        </label>
      ))}
      </div>
    </fieldset>
  );
}

export function MeScreen(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const runtime = useLearnerCourseRuntime();
  const saved = useSavedWords();
  const requestedReturn = new URLSearchParams(location.search).get('return') || '';
  const returnTo = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '/';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const todayDay = activitySaveClock().dayNumber;
  const weekdayFormat = new Intl.DateTimeFormat(locale, {weekday:'short', timeZone:'UTC'});
  // 2024-01-01 was a Monday: Mon..Sun labels for the heatmap rows.
  const weekdayLabels = Array.from({length:7}, (_, index) => weekdayFormat.format(new Date(Date.UTC(2024, 0, 1 + index))));

  // Coming here to sign in (e.g. from a lesson): the form is the point, show it first.
  useEffect(() => {
    if(requestedReturn && !auth.session) document.getElementById('me-account')?.scrollIntoView?.({block:'start'});
  }, [requestedReturn, auth.session]);

  const state = runtime.state;
  const learningDays = useAllLearningDays();
  const allDays = useMemo(() => state ? withAllLearningDays(state.progress, learningDays) : null, [state, learningDays]);
  const calendar = useMemo(() => allDays ? activityCalendar(allDays, todayDay) : null, [allDays, todayDay]);
  const wordRecords = saved.words ? Object.values(saved.words.items).filter(item => item && !item.deleted) : [];
  const learnedWords = wordRecords.filter(item => savedWordStatus(item!.box || 0) === 'learned').length;

  // Local data stays on the device; the next sign-in merges it into that account.
  const signOut = async () => {
    await auth.logout();
    await appDocs.detach();
    navigate('/');
  };
  // Server data is removed; the device keeps its local copy (never wiped silently).
  const deleteAccount = async () => {
    setDeleteError(false);
    try{
      await auth.deleteAccount();
      await appDocs.detach();
      navigate('/');
    }catch{
      setDeleteError(true);
    }
  };
  if(auth.loading) return null;

  const email = auth.session?.email || '';
  return (
    <section className="me" aria-labelledby="me-title">
      <header className="me-head">
        <span className="avatar" aria-hidden="true">{email ? email.charAt(0).toUpperCase() : <Icon name="me" size={26} />}</span>
        <div className="me-head-text">
          <h2 id="me-title">{t('me.title')}</h2>
          <span>{email ? email + (auth.session?.handle ? ' · ' + auth.session.handle : '') : t('me.guest')}</span>
        </div>
      </header>

      {state && (
        <div className="bento me-stats">
          <article className="tile tile-wide me-course" style={{'--i':0} as CSSProperties}>
            <Ring value={state.roadmapProgress.completedCount} total={state.roadmapProgress.requiredCount} />
            <div>
              <div className="tile-title">{t('me.courseDays')}</div>
              <span className="tile-caption">{t('me.courseDaysHint')}</span>
            </div>
          </article>
          <article className="tile" style={{'--i':1} as CSSProperties}>
            <div className="tile-kicker tone-streak"><Icon name="flame" size={18} />{t('today.streak')}</div>
            <strong className="tile-number">{t('today.streakDays', {count:currentLearningStreak(allDays ?? state.progress, todayDay)})}</strong>
            <span className="tile-caption">{t('me.learningDays', {count:calendar?.active ?? 0})}</span>
          </article>
          <article className="tile" style={{'--i':2} as CSSProperties}>
            <div className="tile-kicker tone-listen"><Icon name="review" size={18} />{t('words.title')}</div>
            <strong className="tile-number">{wordRecords.length}</strong>
            <span className="tile-caption">{t('me.wordsLearned', {count:learnedWords})}</span>
          </article>
          {calendar && (
            <article className="tile tile-wide me-activity" style={{'--i':3} as CSSProperties}>
              <div className="tile-top">
                <div className="tile-title">{t('me.activity')}</div>
                <span className="tile-caption">{t('me.activityWeeks', {count:ACTIVITY_WEEKS})}</span>
              </div>
              <p className="tile-text">{t('me.activityHint', {count:calendar.active, weeks:ACTIVITY_WEEKS})}</p>
              <div className="heatmap-wrap">
                <div className="heat-days" aria-hidden="true">
                  {weekdayLabels.map((label, index) => <span key={index}>{index % 2 === 0 ? label : ''}</span>)}
                </div>
                <div className="heatmap" role="img" aria-label={t('me.activityLabel', {count:calendar.active, weeks:ACTIVITY_WEEKS})}>
                  {calendar.cells.map(cell => (
                    <span key={cell.day} className={'heat' + (cell.active ? ' is-on' : '') + (cell.future ? ' is-future' : '') + (cell.day === todayDay ? ' is-today' : '')} />
                  ))}
                </div>
              </div>
              <div className="heat-legend" aria-hidden="true">
                <span><i className="heat is-on" />{t('me.legendActive')}</span>
                <span><i className="heat" />{t('me.legendEmpty')}</span>
                <span><i className="heat is-today" />{t('me.legendToday')}</span>
              </div>
            </article>
          )}
        </div>
      )}

      <Link className="me-row pressable" to="/progress">
        <Icon name="progress" />
        <span>{t('me.progress')}</span>
        <Icon name="chevron" size={20} className="me-row-chevron" />
      </Link>

      <section className="settings" aria-labelledby="settings-title">
        <h3 id="settings-title" className="section-title">{t('me.settings')}</h3>
        {state && (
          <div className="tile settings-card settings-course">
            <div className="settings-label">{t('courses.current')}</div>
            <CoursePicker currentId={state.set.id} />
          </div>
        )}
        <div className="tile settings-card">
          <ThemePicker />
          <div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')} /></div>
        </div>
        <div className="tile settings-card">
          <NotificationSettingsPanel />
        </div>
      </section>

      <section className="settings" id="me-account" aria-labelledby="account-title">
        <h3 id="account-title" className="section-title">{t('account.title')}</h3>
        <div className="tile settings-card">
          {auth.session ? (
            <>
              <p className="tile-text">{t('account.synced')}</p>
              <button className="secondary-button" type="button" onClick={() => void signOut()}>{t('account.signOut')}</button>
              {confirmDelete ? (
                <div className="account-delete" role="alertdialog" aria-label={t('account.delete')}>
                  <p>{t('account.deleteConfirm')}</p>
                  <div className="account-delete-actions">
                    <button className="secondary-button danger" type="button" onClick={() => void deleteAccount()}>{t('account.deleteYes')}</button>
                    <button className="link-button" type="button" onClick={() => setConfirmDelete(false)}>{t('account.deleteCancel')}</button>
                  </div>
                  {deleteError && <p className="muted" role="alert">{t('account.deleteFailed')}</p>}
                </div>
              ) : (
                <button className="link-button danger-link" type="button" onClick={() => setConfirmDelete(true)}>{t('account.delete')}</button>
              )}
            </>
          ) : (
            <>
              <p className="tile-text">{t('account.localHint')}</p>
              <SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={ASK_HANDLE} variant="inline" onSignedIn={() => navigate(returnTo)} />
            </>
          )}
        </div>
      </section>

      <p className="account-legal">
        <a href="./privacy.html" target="_blank" rel="noreferrer">{t('account.privacy')}</a>
        <a href="./delete-account.html" target="_blank" rel="noreferrer">{t('account.deletionInfo')}</a>
      </p>
    </section>
  );
}
