import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { LanguagePicker, useI18n } from '@appbase/ui-react/i18n.js';
import { useQueryClient } from '@tanstack/react-query';
import { appDocs } from './sync';
import { NotificationSettingsPanel } from './notification-settings';
import { readThemePreference, setThemePreference, type ThemePreference } from './theme';
import { useCatalog } from './active-course';
import { DEFAULT_COURSE_ID } from './settings-data';
import { resetAllProgress } from './progress-reset';
import { Icon } from './icons';

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

/** Full reset of learning on this device and, when signed in, in the account. */
function ResetProgress(){
  const {t} = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const reset = async () => {
    setBusy(true);
    setFailed(false);
    try{
      const ids = [DEFAULT_COURSE_ID, ...(catalog.data?.sets ?? []).map(set => set.id)];
      await resetAllProgress(ids);
      await queryClient.invalidateQueries();
      navigate('/', {replace:true});
    }catch{
      setFailed(true);
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="tile settings-card">
      <div className="settings-label">{t('reset.title')}</div>
      <p className="tile-text">{t('reset.text')}</p>
      {confirm ? (
        <div className="account-delete" role="alertdialog" aria-label={t('reset.title')}>
          <p>{t('reset.confirm')}</p>
          <div className="account-delete-actions">
            <button className="secondary-button danger" type="button" disabled={busy || catalog.isPending} onClick={() => void reset()}>{t('reset.yes')}</button>
            <button className="link-button" type="button" disabled={busy} onClick={() => setConfirm(false)}>{t('account.deleteCancel')}</button>
          </div>
          {failed && <p className="muted" role="alert">{t('reset.failed')}</p>}
        </div>
      ) : (
        <button className="secondary-button" type="button" onClick={() => setConfirm(true)}>{t('reset.start')}</button>
      )}
    </div>
  );
}

export function SettingsScreen(){
  const auth = useOptionalAuth();
  const {t} = useI18n();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

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

  return (
    <section className="me settings-screen" aria-labelledby="settings-title">
      <button className="learn-back" type="button" onClick={() => navigate(-1)}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
      <header className="screen-head"><h2 id="settings-title">{t('me.settings')}</h2></header>

      <div className="tile settings-card">
        <ThemePicker />
        <div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')} /></div>
      </div>
      <div className="tile settings-card">
        <NotificationSettingsPanel />
      </div>
      <ResetProgress />

      {auth.session && (
        <div className="tile settings-card">
          <div className="settings-label">{t('account.title')}</div>
          <p className="tile-text">{auth.session.email}</p>
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
        </div>
      )}

      <p className="account-legal">
        <Link to="/legal/privacy">{t('account.privacy')}</Link>
        <Link to="/legal/delete-account">{t('account.deletionInfo')}</Link>
      </p>
    </section>
  );
}
