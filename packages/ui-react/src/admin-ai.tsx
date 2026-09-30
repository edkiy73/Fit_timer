import { useCallback, useEffect, useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';
import { SecretField, useSecrets } from './admin-secrets';

/* Admin → «ИИ»: which model answers first and which takes over, monthly limits per
   learner, a live check, and the provider keys (write-only, see admin-secrets.tsx). */

type Provider = 'gemini' | 'openai' | 'openrouter';
interface Route { provider: Provider; model: string }
interface AiSettings extends Record<string, unknown> {
  enabled: boolean;
  text: {primary: Route; backup: Route};
  limits: {heavy: number; light: number; image: number};
}

const PROVIDERS: Provider[] = ['gemini', 'openai', 'openrouter'];

const COPY = {
  ru: {
    loading:'Загружаю…', loadError:'Не удалось загрузить настройки.',
    enabled:'ИИ включён', primary:'Основная модель', backup:'Запасная — отвечает, если основная не смогла',
    provider:'Сервис', model:'Модель', keys:'Ключи сервисов',
    keysHint:'Нужен ключ хотя бы того сервиса, что выбран основной моделью. После сохранения нажми «Проверить, что ИИ отвечает».',
    limits:'Лимит в месяц на одного ученика', light:'Простые запросы (разбор ошибки, разговор)', heavy:'Сложные запросы', image:'Картинки',
    save:'Сохранить', saving:'Сохраняю…', saved:'Сохранено.', saveError:'Не сохранилось: ',
    test:'Проверить, что ИИ отвечает', testing:'Спрашиваю…', testOk:'Ответил', testFail:'Не ответил: '
  },
  en: {
    loading:'Loading…', loadError:'Could not load the settings.',
    enabled:'AI is on', primary:'Main model', backup:'Backup — answers when the main one fails',
    provider:'Service', model:'Model', keys:'Service keys',
    keysHint:'You need a key for at least the main model\'s service. After saving, tap «Check that the AI answers».',
    limits:'Monthly limit per learner', light:'Simple requests (mistake explanation, talk)', heavy:'Heavy requests', image:'Images',
    save:'Save', saving:'Saving…', saved:'Saved.', saveError:'Not saved: ',
    test:'Check that the AI answers', testing:'Asking…', testOk:'Answered', testFail:'No answer: '
  }
} as const;

function RouteFields({label, value, onChange, copy}: {label: string; value: Route; onChange(next: Route): void; copy: (typeof COPY)[keyof typeof COPY]}){
  return (
    <fieldset className="ab-admin-fieldset">
      <legend>{label}</legend>
      <div className="ab-admin-row">
        <label><span>{copy.provider}</span>
          <select value={value.provider} onChange={e => onChange({...value, provider:e.target.value as Provider})}>
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label><span>{copy.model}</span>
          <input value={value.model} onChange={e => onChange({...value, model:e.target.value})} />
        </label>
      </div>
    </fieldset>
  );
}

const KEY_NAMES: Record<Provider, string> = {gemini:'GEMINI_API_KEY', openai:'OPENAI_API_KEY', openrouter:'OPENROUTER_API_KEY'};
const KEY_LABELS: Record<Provider, string> = {gemini:'Google Gemini', openai:'OpenAI', openrouter:'OpenRouter'};

export function AdminAiSettings({client, adminKey, locale = 'ru'}: {
  client: AdminClient;
  adminKey: string;
  locale?: 'ru' | 'en';
}){
  const copy = COPY[locale];
  const keys = useSecrets(client, adminKey);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [note, setNote] = useState('');
  const [testNote, setTestNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await client.action(adminKey, 'settings_get');
    setSettings(result.settings as AiSettings);
  }, [client, adminKey]);

  useEffect(() => { void load().catch(() => setNote(copy.loadError)); }, [load, copy.loadError]);

  if(!settings) return <article className="ab-admin-panel"><p className="ab-admin-empty">{note || copy.loading}</p></article>;

  const update = (patch: Partial<AiSettings>) => setSettings({...settings, ...patch});

  async function save(){
    if(!settings) return;
    setBusy(true);
    setNote(copy.saving);
    try{
      const result = await client.action(adminKey, 'save_settings', {settings});
      setSettings(result.settings as AiSettings);
      setNote(copy.saved);
    }catch(error){
      setNote(copy.saveError + String((error as {code?: string})?.code || ''));
    }finally{ setBusy(false); }
  }

  async function test(){
    if(!settings) return;
    setBusy(true);
    setTestNote(copy.testing);
    try{
      const result = await client.action(adminKey, 'test_ai', {type:'text', settings});
      setTestNote(copy.testOk + ' (' + String(result.provider) + ' · ' + String(result.model) + (result.fallback ? ', запасная' : '') + '): «' + String(result.result) + '»');
    }catch(error){
      const detail = (error as {detail?: string; code?: string});
      setTestNote(copy.testFail + String(detail?.detail || detail?.code || ''));
    }finally{ setBusy(false); }
  }

  const limit = (name: 'light' | 'heavy' | 'image', label: string) => (
    <label><span>{label}</span>
      <input type="number" min={0} max={10000} value={settings.limits[name]}
        onChange={e => update({limits:{...settings.limits, [name]:Math.max(0, Number(e.target.value) || 0)}})} />
    </label>
  );

  return (
    <>
      <article className="ab-admin-panel">
        <label className="ab-admin-check">
          <input type="checkbox" checked={settings.enabled} onChange={e => update({enabled:e.target.checked})} />
          <span>{copy.enabled}</span>
        </label>
        <RouteFields label={copy.primary} value={settings.text.primary} copy={copy}
          onChange={primary => update({text:{...settings.text, primary}})} />
        <RouteFields label={copy.backup} value={settings.text.backup} copy={copy}
          onChange={backup => update({text:{...settings.text, backup}})} />
        <button type="button" className="ab-admin-secondary" disabled={busy} onClick={() => void test()}>{copy.test}</button>
        {testNote && <p className="ab-admin-empty" role="status">{testNote}</p>}
      </article>

      <article className="ab-admin-panel ab-admin-limits">
        <h2>{copy.limits}</h2>
        {limit('light', copy.light)}
        {limit('heavy', copy.heavy)}
        {limit('image', copy.image)}
      </article>

      <article className="ab-admin-panel">
        <h2>{copy.keys}</h2>
        <p className="ab-admin-empty">{copy.keysHint}</p>
        {PROVIDERS.map(p => (
          <SecretField key={p} name={KEY_NAMES[p]} label={KEY_LABELS[p]} state={keys.secrets?.[KEY_NAMES[p]]} onSave={keys.save} locale={locale} />
        ))}
      </article>

      <div className="ab-admin-savebar">
        <button type="button" disabled={busy} onClick={() => void save()}>{copy.save}</button>
        {note && <span role="status">{note}</span>}
      </div>
    </>
  );
}
