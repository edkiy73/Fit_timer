import { useCallback, useEffect, useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';

/* Write-only service keys (Core server/secrets.js). The page can save or clear a key and
   shows whether it is set and where from; the value itself never comes back. */

export interface SecretState { set: boolean; source: 'env' | 'admin' | null; last4: string }
export type SecretsMap = Record<string, SecretState>;

const COPY = {
  ru: {
    set:'задан', missing:'не задан', fromEnv:'из настроек Vercel', fromAdmin:'из админки',
    placeholder:'Вставь ключ', save:'Сохранить ключ', clear:'Удалить', saving:'Сохраняю…',
    saved:'Ключ сохранён.', cleared:'Ключ удалён.', error:'Не сохранилось: ', envLocked:'Задан в Vercel — там его и меняй.'
  },
  en: {
    set:'set', missing:'not set', fromEnv:'from Vercel settings', fromAdmin:'from the admin',
    placeholder:'Paste the key', save:'Save key', clear:'Remove', saving:'Saving…',
    saved:'Key saved.', cleared:'Key removed.', error:'Not saved: ', envLocked:'Set in Vercel — change it there.'
  }
} as const;

export function useSecrets(client: AdminClient, adminKey: string){
  const [secrets, setSecrets] = useState<SecretsMap | null>(null);
  const load = useCallback(async () => {
    const result = await client.action(adminKey, 'secrets_status');
    setSecrets(result.secrets as SecretsMap);
  }, [client, adminKey]);
  useEffect(() => { void load().catch(() => setSecrets({})); }, [load]);
  const save = useCallback(async (name: string, value: string) => {
    const result = await client.action(adminKey, 'secret_set', {name, value});
    setSecrets(result.secrets as SecretsMap);
  }, [client, adminKey]);
  return {secrets, save};
}

export function SecretField({name, label, hint, state, onSave, locale = 'ru', multiline = false}: {
  name: string;
  label: string;
  hint?: string;
  state: SecretState | undefined;
  onSave(name: string, value: string): Promise<void>;
  locale?: 'ru' | 'en';
  multiline?: boolean;
}){
  const copy = COPY[locale];
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fromEnv = state?.source === 'env';
  const status = state?.set
    ? copy.set + (state.last4 ? ' · …' + state.last4 : '') + ' · ' + (fromEnv ? copy.fromEnv : copy.fromAdmin)
    : copy.missing;

  async function run(next: string, done: string){
    setBusy(true);
    setNote(copy.saving);
    try{
      await onSave(name, next);
      setValue('');
      setNote(done);
    }catch(error){
      setNote(copy.error + String((error as {code?: string})?.code || ''));
    }finally{ setBusy(false); }
  }

  return (
    <div className="ab-admin-secret" data-set={state?.set || undefined}>
      <div className="ab-admin-secret-head"><b>{label}</b><span>{status}</span></div>
      {hint && <p className="ab-admin-empty">{hint}</p>}
      {fromEnv ? <p className="ab-admin-empty">{copy.envLocked}</p> : (
        <>
          {multiline
            ? <textarea rows={4} value={value} placeholder={copy.placeholder} autoComplete="off" spellCheck={false} onChange={e => setValue(e.target.value)} />
            : <input type="password" value={value} placeholder={copy.placeholder} autoComplete="off" onChange={e => setValue(e.target.value)} />}
          <div className="ab-admin-row">
            <button type="button" disabled={busy || !value.trim()} onClick={() => void run(value, copy.saved)}>{copy.save}</button>
            {state?.set && <button type="button" className="ab-admin-secondary" disabled={busy} onClick={() => void run('', copy.cleared)}>{copy.clear}</button>}
          </div>
        </>
      )}
      {note && <p className="ab-admin-empty" role="status">{note}</p>}
    </div>
  );
}
