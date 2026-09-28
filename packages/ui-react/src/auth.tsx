import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { AuthClient, AuthSession, AuthResponseError } from '@appbase/core/auth.js';
import './auth.css';

export interface AuthGateProps {
  client: AuthClient;
  locale?: 'ru' | 'en';
  productName?: string;
  children: ReactNode;
}

export interface AuthContextValue {
  session: AuthSession;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const COPY = {
  ru: {
    account:'Аккаунт',
    intro:'Войди по почте. Пароль не нужен — пришлём одноразовый код.',
    email:'Email',
    code:'Код из письма',
    handle:'Ник',
    send:'Прислать код',
    sending:'Отправляю…',
    verify:'Войти',
    checking:'Проверяю…',
    resend:'Отправить код ещё раз',
    sent:'Код отправлен на',
    chooseHandle:'Придумай ник для аккаунта.',
    handleHint:'От 2 до 29 символов после @: буквы, цифры, точка, дефис.',
    create:'Создать аккаунт',
    saving:'Сохраняю…',
    logout:'Выйти',
    loading:'Проверяю вход…',
    badEmail:'Проверь адрес почты.',
    badCode:'Код не подошёл. Проверь цифры и попробуй ещё раз.',
    expired:'Срок действия кода истёк. Запроси новый.',
    handleTaken:'Этот ник уже занят.',
    badHandle:'Ник должен начинаться с @ и содержать 2–29 допустимых символов.',
    generic:'Не получилось выполнить запрос. Попробуй ещё раз.'
  },
  en: {
    account:'Account',
    intro:'Sign in with email. No password — we will send a one-time code.',
    email:'Email',
    code:'Email code',
    handle:'Handle',
    send:'Send code',
    sending:'Sending…',
    verify:'Sign in',
    checking:'Checking…',
    resend:'Send another code',
    sent:'Code sent to',
    chooseHandle:'Choose a handle for your account.',
    handleHint:'2–29 characters after @: letters, numbers, dot, hyphen.',
    create:'Create account',
    saving:'Saving…',
    logout:'Sign out',
    loading:'Checking sign-in…',
    badEmail:'Check the email address.',
    badCode:'That code did not work. Check it and try again.',
    expired:'The code expired. Request a new one.',
    handleTaken:'That handle is already taken.',
    badHandle:'Handle must start with @ and contain 2–29 allowed characters.',
    generic:'The request failed. Try again.'
  }
} as const;

function errorText(error: unknown, locale: 'ru' | 'en'): string {
  const copy = COPY[locale];
  const code = String((error as AuthResponseError | undefined)?.code || (error as Error | undefined)?.message || '');
  if(code === 'bad_email') return copy.badEmail;
  if(code === 'bad_code') return copy.badCode;
  if(code === 'expired_code' || code === 'code_expired') return copy.expired;
  if(code === 'handle_taken') return copy.handleTaken;
  if(code === 'bad_handle') return copy.badHandle;
  return copy.generic;
}

function normalizeHandle(value: string): string {
  const body = value.trim().replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '').slice(0, 29);
  return body ? '@' + body : '';
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if(!value) throw new Error('useAuth must be used inside AuthGate');
  return value;
}

export function AuthGate({client, locale = 'ru', productName, children}: AuthGateProps){
  const copy = COPY[locale];
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'email' | 'code' | 'handle'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    let live = true;
    client.restoreSession().then(value => {
      if(live) setSession(value);
    }).finally(() => {
      if(live) setLoading(false);
    });
    return () => { live = false; };
  }, [client]);

  const context = useMemo<AuthContextValue | null>(() => session ? {
    session,
    logout: async () => {
      await client.logout();
      setSession(null);
      setStep('email');
      setCode('');
      setHandle('');
      setError('');
    }
  } : null, [client, session]);

  async function sendCode(event?: FormEvent){
    event?.preventDefault();
    setError('');
    setBusy(true);
    try{
      const result = await client.sendCode(email, locale);
      setEmail(String(email || '').trim().toLowerCase());
      setDevCode(typeof result.devCode === 'string' ? result.devCode : '');
      if(typeof result.devCode === 'string') setCode(result.devCode);
      setStep('code');
    }catch(e){
      setError(errorText(e, locale));
    }finally{
      setBusy(false);
    }
  }

  async function verify(event: FormEvent){
    event.preventDefault();
    setError('');
    setBusy(true);
    try{
      const result = await client.verifyCode({email, code, locale});
      if(result.needsHandle || !result.handle){
        setStep('handle');
        setHandle(result.handle || '@');
      }else{
        setSession(result);
      }
    }catch(e){
      setError(errorText(e, locale));
      if((e as AuthResponseError | undefined)?.code === 'bad_code') setCode('');
    }finally{
      setBusy(false);
    }
  }

  async function saveHandle(event: FormEvent){
    event.preventDefault();
    const normalized = normalizeHandle(handle);
    if(!/^@[\wа-яё.\-]{2,29}$/i.test(normalized)){
      setError(copy.badHandle);
      return;
    }
    setError('');
    setBusy(true);
    try{
      await client.claimHandle({handle: normalized});
      const next = await client.getSession();
      if(next) setSession(next);
    }catch(e){
      setError(errorText(e, locale));
    }finally{
      setBusy(false);
    }
  }

  if(loading){
    return <div className="ab-auth-shell"><div className="ab-auth-card"><p className="ab-auth-loading">{copy.loading}</p></div></div>;
  }

  if(context){
    return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
  }

  return (
    <main className="ab-auth-shell">
      <section className="ab-auth-card" aria-labelledby="ab-auth-title">
        <div className="ab-auth-kicker">{productName || copy.account}</div>
        <h1 id="ab-auth-title">{copy.account}</h1>

        {step === 'email' && (
          <form onSubmit={sendCode}>
            <p className="ab-auth-lead">{copy.intro}</p>
            <label className="ab-auth-field">
              <span>{copy.email}</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </label>
            {error && <p className="ab-auth-error" role="alert">{error}</p>}
            <button className="ab-auth-primary" type="submit" disabled={busy}>{busy ? copy.sending : copy.send}</button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verify}>
            <p className="ab-auth-lead">{copy.sent} <b>{email}</b>.</p>
            <label className="ab-auth-field">
              <span>{copy.code}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 12))}
                autoFocus
              />
            </label>
            {devCode && <p className="ab-auth-dev">DEV: {devCode}</p>}
            {error && <p className="ab-auth-error" role="alert">{error}</p>}
            <button className="ab-auth-primary" type="submit" disabled={busy || !code}>{busy ? copy.checking : copy.verify}</button>
            <button className="ab-auth-secondary" type="button" disabled={busy} onClick={() => void sendCode()}>{copy.resend}</button>
          </form>
        )}

        {step === 'handle' && (
          <form onSubmit={saveHandle}>
            <p className="ab-auth-lead">{copy.chooseHandle}</p>
            <label className="ab-auth-field">
              <span>{copy.handle}</span>
              <input
                type="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={handle}
                onChange={e => setHandle(e.target.value)}
                autoFocus
              />
            </label>
            <p className="ab-auth-hint">{copy.handleHint}</p>
            {error && <p className="ab-auth-error" role="alert">{error}</p>}
            <button className="ab-auth-primary" type="submit" disabled={busy}>{busy ? copy.saving : copy.create}</button>
          </form>
        )}
      </section>
    </main>
  );
}
