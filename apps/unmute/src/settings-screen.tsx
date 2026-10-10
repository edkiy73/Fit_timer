import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { LanguagePicker, useI18n } from '@appbase/ui-react/i18n.js';
import { useQueryClient } from '@tanstack/react-query';
import { appDocs } from './sync';
import { NotificationSettingsPanel } from './notification-settings';
import { readThemePreference, setThemePreference, type ThemePreference } from './theme';
import { useActiveCourseId, useCatalog } from './active-course';
import { DEFAULT_COURSE_ID } from './settings-data';
import { resetAllStatistics, restartCourseProgress } from './progress-reset';
import { Icon } from './icons';
import { unregisterRemotePush } from './remote-push';
import { appRestart, signOutAndClear } from './sign-out';
import { clearContentCache } from './content/client';

/* «Я» → «Настройки»: appearance, reminders, «Начать заново», account deletion and the
   legal pages. Kept off «Я» itself, which was one long screen of everything. */

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

/** Statistics reset and course restart are deliberately separate product actions. */
function ResetLearningData(){
  const {t} = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const activeCourseId = useActiveCourseId();
  const [confirm, setConfirm] = useState<'stats'|'course'|null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'stats'|'course'|null>(null);

  const allKnownIds = () => [
    DEFAULT_COURSE_ID,
    ...(catalog.data?.sets ?? []).map(set => set.id)
  ];

  const resetStats = async () => {
    setBusy(true);
    setFailed(null);
    try{
      await resetAllStatistics(allKnownIds());
      await queryClient.invalidateQueries();
      setConfirm(null);
    }catch{
      setFailed('stats');
    }finally{
      setBusy(false);
    }
  };

  const restartCourse = async () => {
    if(!activeCourseId)return;
    setBusy(true);
    setFailed(null);
    try{
      await restartCourseProgress(activeCourseId);
      await queryClient.invalidateQueries();
      navigate('/', {replace:true});
    }catch{
      setFailed('course');
    }finally{
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tile settings-card settings-card-reset">
        <div className="settings-label">{t('reset.statsTitle')}</div>
        <p className="tile-text">{t('reset.statsText')}</p>
        {confirm==='stats' ? (
          <div className="account-delete" role="alertdialog" aria-label={t('reset.statsTitle')}>
            <p>{t('reset.statsConfirm')}</p>
            <div className="account-delete-actions">
              <button className="secondary-button danger" type="button" disabled={busy||catalog.isPending} onClick={() => void resetStats()}>{t('reset.statsYes')}</button>
              <button className="link-button" type="button" disabled={busy} onClick={() => setConfirm(null)}>{t('account.deleteCancel')}</button>
            </div>
            {failed==='stats'&&<p className="muted" role="alert">{t('reset.failed')}</p>}
          </div>
        ) : (
          <button className="secondary-button" type="button" disabled={busy} onClick={() => {setFailed(null);setConfirm('stats');}}>
            {t('reset.statsStart')}
          </button>
        )}
      </div>

      <div className="tile settings-card settings-card-reset">
        <div className="settings-label">{t('reset.courseTitle')}</div>
        <p className="tile-text">{t('reset.courseText')}</p>
        {confirm==='course' ? (
          <div className="account-delete" role="alertdialog" aria-label={t('reset.courseTitle')}>
            <p>{t('reset.courseConfirm')}</p>
            <div className="account-delete-actions">
              <button className="secondary-button danger" type="button" disabled={busy||catalog.isPending||!activeCourseId} onClick={() => void restartCourse()}>{t('reset.courseYes')}</button>
              <button className="link-button" type="button" disabled={busy} onClick={() => setConfirm(null)}>{t('account.deleteCancel')}</button>
            </div>
            {failed==='course'&&<p className="muted" role="alert">{t('reset.failed')}</p>}
          </div>
        ) : (
          <button className="secondary-button danger" type="button" disabled={busy||!activeCourseId} onClick={() => {setFailed(null);setConfirm('course');}}>
            {t('reset.courseStart')}
          </button>
        )}
      </div>
    </>
  );
}

export function SettingsScreen(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [unsent, setUnsent] = useState(false);
  // The account's progress stays on the server; the phone starts clean for the next person
  // (decision 20). Unsent progress is never wiped silently: the learner decides.
  const signOut = async (force = false) => {
    if(signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try{
      const result = await signOutAndClear({
        flush: async () => { await appDocs.sync(); return !(await appDocs.pending()); },
        unregisterPush: async () => { await unregisterRemotePush(); },
        logout: () => auth.logout(),
        clearDocuments: () => appDocs.clear(),
        clearContentCache
      }, {force});
      if(result === 'unsent'){ setUnsent(true); return; }
      appRestart.reload();
    }catch{
      setSignOutError(true);
    }finally{
      setSigningOut(false);
    }
  };

  // Server data is removed; the device keeps its local copy (never wiped silently).
  const deleteAccount = async () => {
    setDeleteError(false);
    try{
      await unregisterRemotePush();
      await auth.deleteAccount();
      await appDocs.detach();
      navigate('/');
    }catch{
      setDeleteError(true);
    }
  };

  return (
    <section className="me settings-screen" aria-labelledby="settings-title">
      <button className="learn-back" type="button" onClick={() => navigate(-1)}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
      <header className="screen-head"><h2 id="settings-title">{t('me.settings')}</h2></header>

      <div className="tile settings-card settings-card-preferences">
        <ThemePicker />
        <div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')} /></div>
      </div>
      <div className="tile settings-card settings-card-notifications">
        <NotificationSettingsPanel />
      </div>
      <ResetLearningData />

      {auth.session && (
        <div className="tile settings-card settings-card-account">
          <div className="settings-label">{t('account.title')}</div>
          <p className="tile-text">{auth.session.email}</p>
          <p className="tile-text">{t('account.signOutHint')}</p>
          {unsent ? (
            <div className="account-delete" role="alertdialog" aria-label={t('account.signOut')}>
              <p>{t('account.signOutUnsent')}</p>
              <div className="account-delete-actions">
                <button className="secondary-button" type="button" disabled={signingOut} onClick={() => { setUnsent(false); void signOut(); }}>{t('account.signOutRetry')}</button>
                <button className="link-button danger-link" type="button" disabled={signingOut} onClick={() => void signOut(true)}>{t('account.signOutAnyway')}</button>
              </div>
            </div>
          ) : confirmSignOut ? (
            <div className="account-delete" role="alertdialog" aria-label={t('account.signOut')}>
              <p>{t('account.signOutConfirm')}</p>
              <div className="account-delete-actions">
                <button className="secondary-button" type="button" disabled={signingOut} onClick={() => { setConfirmSignOut(false); void signOut(); }}>
                  {signingOut ? t('account.signingOut') : t('account.signOutYes')}
                </button>
                <button className="link-button" type="button" disabled={signingOut} onClick={() => setConfirmSignOut(false)}>{t('account.deleteCancel')}</button>
              </div>
            </div>
          ) : (
            <button className="secondary-button" type="button" disabled={signingOut} onClick={() => setConfirmSignOut(true)}>
              {signingOut ? t('account.signingOut') : t('account.signOut')}
            </button>
          )}
          {signOutError && <p role="alert">{locale === 'en' ? 'Could not sign out. Check your connection and try again.' : 'Не удалось выйти. Проверь соединение и попробуй ещё раз.'}</p>}
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
        </div>
      )}

      <p className="account-legal">
        <Link to="/legal/terms">{t('account.terms')}</Link>
        <Link to="/legal/privacy">{t('account.privacy')}</Link>
        <Link to="/legal/delete-account">{t('account.deletionInfo')}</Link>
      </p>
    </section>
  );
}
