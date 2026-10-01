import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { AuthClient, AuthSession, AuthResponseError } from '@appbase/core/auth.js';
import './auth.css';

/* Shared account UI for AppBase React apps.

   Two ways to use it:
   - AuthGate: the whole app requires an account (sign-in screen until a session exists);
   - AuthProvider + useOptionalAuth + SignInForm: the app works without an account and
     offers sign-in where the product wants it (local-first apps).
   AuthGate is built on the same provider, so both modes share one session state. */

type Locale = 'ru' | 'en';

export interface AuthProviderProps {
  client: AuthClient;
  children: ReactNode;
}

export interface SignInFormProps {
  locale?: Locale;
  productName?: string;
  /** Ask for a handle when the account has none yet. Default true; a product may turn it off
   *  and let the person set a handle later through claimHandle(). */
  askHandle?: boolean;
  /** Visual variant: 'card' for a standalone screen, 'inline' inside a product screen. */
  variant?: 'card' | 'inline';
  /** Heading and first line for a sign-in asked for a reason (e.g. «Войди, чтобы покупка
   *  осталась с тобой»); the product kicker is then left out. */
  title?: string;
  lead?: string;
  onSignedIn?: (session: AuthSession) => void;
}

export interface AuthGateProps extends Omit<SignInFormProps, 'variant' | 'onSignedIn'> {
  client: AuthClient;
  children: ReactNode;
}

export interface OptionalAuthContextValue {
  client: AuthClient;
  /** null while signed out; the app keeps working locally. */
  session: AuthSession | null;
  loading: boolean;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
  /** Set or change the handle later (e.g. when the product skipped it at sign-in). */
  claimHandle(handle: string): Promise<void>;
  /** Re-read Premium and owned SKUs from the server (after a purchase, on app start). */
  refresh(): Promise<void>;
  /** Used by SignInForm; products normally do not call it. */
  acceptSession(session: AuthSession): void;
}

export interface AuthContextValue {
  session: AuthSession;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
  claimHandle(handle: string): Promise<void>;
  refresh(): Promise<void>;
}

const OptionalAuthContext = createContext<OptionalAuthContextValue | null>(null);

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
    generic:'Не получилось выполнить запрос. Попробуй ещё раз.',
    mailFailed:'Письмо с кодом не отправилось. Если код дал администратор — нажми «У меня есть код».',
    haveCode:'У меня есть код',
    enterCode:'Введи код для'
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
    generic:'The request failed. Try again.',
    mailFailed:'The code email could not be sent. If an administrator gave you a code, tap “I have a code”.',
    haveCode:'I have a code',
    enterCode:'Enter the code for'
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
  if(code === 'mail_failed' || code === 'no_mail') return copy.mailFailed;
  return copy.generic;
}

const HANDLE = /^@[\wа-яё.\-]{2,29}$/i;

function normalizeHandle(value: string): string {
  const body = value.trim().replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '').slice(0, 29);
  return body ? '@' + body : '';
}

export function AuthProvider({client, children}: AuthProviderProps){
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    client.restoreSession().then(value => {
      if(!live) return;
      setSession(value);
      // Rights may have changed on another device or in Admin: refresh in the background.
      // Offline or a failed request keeps the stored session.
      if(value) client.status().then(() => client.getSession()).then(next => {
        if(live && next) setSession(next);
      }).catch(() => undefined);
    }).finally(() => {
      if(live) setLoading(false);
    });
    return () => { live = false; };
  }, [client]);

  const value = useMemo<OptionalAuthContextValue>(() => ({
    client,
    session,
    loading,
    logout: async () => {
      await client.logout();
      setSession(null);
    },
    deleteAccount: async () => {
      await client.forget('all');
      setSession(null);
    },
    claimHandle: async (handle: string) => {
      await client.claimHandle({handle: normalizeHandle(handle)});
      setSession(await client.getSession());
    },
    refresh: async () => {
      await client.status();
      setSession(await client.getSession());
    },
    acceptSession: next => setSession(next)
  }), [client, session, loading]);

  return <OptionalAuthContext.Provider value={value}>{children}</OptionalAuthContext.Provider>;
}

/** Session state that may be signed out. Use in local-first apps. */
export function useOptionalAuth(): OptionalAuthContextValue {
  const value = useContext(OptionalAuthContext);
  if(!value) throw new Error('useOptionalAuth must be used inside AuthProvider or AuthGate');
  return value;
}

/** Signed-in session. Use inside AuthGate, or inside AuthProvider where a session is guaranteed. */
export function useAuth(): AuthContextValue {
  const value = useContext(OptionalAuthContext);
  if(!value || !value.session) throw new Error('useAuth must be used inside AuthGate');
  const {session, logout, deleteAccount, claimHandle, refresh} = value;
  return {session, logout, deleteAccount, claimHandle, refresh};
}

export function SignInForm({locale = 'ru', productName, askHandle = true, variant = 'card', title, lead, onSignedIn}: SignInFormProps){
  const auth = useOptionalAuth();
  const client = auth.client;
  const copy = COPY[locale];
  const [step, setStep] = useState<'email' | 'code' | 'handle'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');
  const [sent, setSent] = useState(false);

  function finish(session: AuthSession){
    auth.acceptSession(session);
    onSignedIn?.(session);
  }

  async function sendCode(event?: FormEvent){
    event?.preventDefault();
    setError('');
    setBusy(true);
    try{
      const result = await client.sendCode(email, locale);
      setEmail(String(email || '').trim().toLowerCase());
      setDevCode(typeof result.devCode === 'string' ? result.devCode : '');
      if(typeof result.devCode === 'string') setCode(result.devCode);
      setSent(true);
      setStep('code');
    }catch(e){
      setError(errorText(e, locale));
    }finally{
      setBusy(false);
    }
  }

  // A one-time code issued in the Admin (mail not configured or not delivered)
  // is verified exactly like an email code; only the sending step is skipped.
  function useExistingCode(){
    setError('');
    setEmail(String(email || '').trim().toLowerCase());
    setSent(false);
    setStep('code');
  }

  async function verify(event: FormEvent){
    event.preventDefault();
    setError('');
    setBusy(true);
    try{
      const result = await client.verifyCode({email, code, locale});
      if(askHandle && (result.needsHandle || !result.handle)){
        setStep('handle');
        setHandle(result.handle || '@');
      }else{
        finish(result);
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
    if(!HANDLE.test(normalized)){
      setError(copy.badHandle);
      return;
    }
    setError('');
    setBusy(true);
    try{
      await client.claimHandle({handle: normalized});
      const next = await client.getSession();
      if(next) finish(next);
    }catch(e){
      setError(errorText(e, locale));
    }finally{
      setBusy(false);
    }
  }

  return (
    <section className={'ab-auth-card' + (variant === 'inline' ? ' ab-auth-card--inline' : '')} aria-labelledby="ab-auth-title">
      {!title && <div className="ab-auth-kicker">{productName || copy.account}</div>}
      <h1 id="ab-auth-title">{title || copy.account}</h1>

      {step === 'email' && (
        <form onSubmit={sendCode}>
          <p className="ab-auth-lead">{lead || copy.intro}</p>
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
          <button className="ab-auth-secondary" type="button" disabled={busy || !email.trim()} onClick={useExistingCode}>{copy.haveCode}</button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify}>
          <p className="ab-auth-lead">{sent ? copy.sent : copy.enterCode} <b>{email}</b>.</p>
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
  );
}

function Gate({locale = 'ru', productName, askHandle, children}: Omit<AuthGateProps, 'client'>){
  const auth = useOptionalAuth();
  const copy = COPY[locale];
  if(auth.loading){
    return <div className="ab-auth-shell"><div className="ab-auth-card"><p className="ab-auth-loading">{copy.loading}</p></div></div>;
  }
  if(auth.session) return <>{children}</>;
  const formProps: SignInFormProps = {locale};
  if(productName !== undefined) formProps.productName = productName;
  if(askHandle !== undefined) formProps.askHandle = askHandle;
  return <main className="ab-auth-shell"><SignInForm {...formProps} /></main>;
}

/** The whole subtree requires an account. Reuses an outer AuthProvider for the same client. */
export function AuthGate({client, children, ...rest}: AuthGateProps){
  const outer = useContext(OptionalAuthContext);
  const gate = <Gate {...rest}>{children}</Gate>;
  if(outer && outer.client === client) return gate;
  return <AuthProvider client={client}>{gate}</AuthProvider>;
}
