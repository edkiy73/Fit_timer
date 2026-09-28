export type AuthLocale = 'ru' | 'en';

export interface AuthSession {
  email: string;
  deviceId: string;
  syncToken: string;
  handle: string;
  locale: AuthLocale;
  sub: unknown | null;
  premium: boolean;
  fresh: boolean;
}

export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface AuthResponseError extends Error {
  status?: number;
  code?: string;
  detail?: string;
  left?: number;
}

export interface AuthClientOptions {
  endpoint?: string;
  storage?: AuthStorage | null;
  sessionKey?: string;
  deviceKey?: string;
  fetch?: typeof fetch;
  createDeviceId?: () => string;
}

export interface VerifyInput {
  email: string;
  code: string;
  locale?: AuthLocale;
  platform?: string;
  handle?: string;
  extra?: Record<string, unknown>;
}

export interface ClaimHandleInput {
  handle: string;
  extra?: Record<string, unknown>;
}

export interface AuthClient {
  sendCode(email: string, locale?: AuthLocale): Promise<Record<string, unknown>>;
  verifyCode(input: VerifyInput): Promise<AuthSession & Record<string, unknown>>;
  claimHandle(input: ClaimHandleInput): Promise<Record<string, unknown>>;
  getSession(): Promise<AuthSession | null>;
  restoreSession(validate?: boolean): Promise<AuthSession | null>;
  getOrCreateDeviceId(): Promise<string>;
  status(): Promise<Record<string, unknown>>;
  setLocale(locale: AuthLocale): Promise<Record<string, unknown>>;
  forget(scope?: 'all' | string, extra?: Record<string, unknown>): Promise<Record<string, unknown>>;
  logout(): Promise<void>;
  authFields(): Promise<{email:string; deviceId:string; syncToken:string} | null>;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

export function validEmail(value: unknown): boolean {
  return EMAIL.test(normalizeEmail(value));
}

function defaultDeviceId(): string {
  try {
    if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if(globalThis.crypto?.getRandomValues){
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
}

function browserStorage(): AuthStorage | null {
  try {
    if(typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (_) {
    return null;
  }
}

function localeOf(value: unknown): AuthLocale {
  return value === 'en' ? 'en' : 'ru';
}

function premiumFrom(sub: unknown): boolean {
  if(!sub || typeof sub !== 'object') return false;
  const until = (sub as {until?: unknown}).until;
  return typeof until === 'string' && (Date.parse(until) || 0) > Date.now();
}

function toSession(raw: unknown): AuthSession | null {
  if(!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<AuthSession>;
  const email = normalizeEmail(v.email);
  const deviceId = String(v.deviceId || '').trim().slice(0, 80);
  const syncToken = String(v.syncToken || '');
  if(!validEmail(email) || !deviceId || !syncToken) return null;
  return {
    email,
    deviceId,
    syncToken,
    handle: String(v.handle || '').slice(0, 40),
    locale: localeOf(v.locale),
    sub: v.sub ?? null,
    premium: typeof v.premium === 'boolean' ? v.premium : premiumFrom(v.sub),
    fresh: !!v.fresh
  };
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const endpoint = options.endpoint || '/api/auth';
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const sessionKey = options.sessionKey || 'appbase.auth.session';
  const deviceKey = options.deviceKey || 'appbase.auth.device';
  const fetchImpl = options.fetch || globalThis.fetch;
  const createDeviceId = options.createDeviceId || defaultDeviceId;

  async function read(key: string): Promise<string | null> {
    if(!storage) return null;
    try { return await storage.getItem(key); } catch (_) { return null; }
  }

  async function write(key: string, value: string): Promise<void> {
    if(!storage) return;
    await storage.setItem(key, value);
  }

  async function remove(key: string): Promise<void> {
    if(!storage) return;
    try { await storage.removeItem(key); } catch (_) {}
  }

  async function getSession(): Promise<AuthSession | null> {
    const raw = await read(sessionKey);
    if(!raw) return null;
    try { return toSession(JSON.parse(raw)); } catch (_) { return null; }
  }

  async function saveSession(session: AuthSession): Promise<void> {
    await write(sessionKey, JSON.stringify(session));
  }

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if(typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
    const response = await fetchImpl(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    let payload: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if(parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
    } catch (_) {}
    if(!response.ok || payload.ok === false){
      const error = new Error(String(payload.error || payload.code || 'auth_failed')) as AuthResponseError;
      error.status = response.status;
      error.code = String(payload.error || payload.code || 'auth_failed');
      if(typeof payload.detail === 'string') error.detail = payload.detail;
      if(typeof payload.left === 'number') error.left = payload.left;
      throw error;
    }
    return payload;
  }

  async function getOrCreateDeviceId(): Promise<string> {
    const existing = String((await read(deviceKey)) || '').trim().slice(0, 80);
    if(existing) return existing;
    const next = String(createDeviceId() || '').trim().slice(0, 80);
    if(!next) throw new Error('device_id_failed');
    await write(deviceKey, next);
    return next;
  }

  async function authFields(): Promise<{email:string; deviceId:string; syncToken:string} | null> {
    const session = await getSession();
    if(!session) return null;
    return {email:session.email, deviceId:session.deviceId, syncToken:session.syncToken};
  }

  return {
    async sendCode(email, locale = 'ru') {
      const normalized = normalizeEmail(email);
      if(!validEmail(normalized)) throw new Error('bad_email');
      return post({action:'send', email:normalized, locale:localeOf(locale)});
    },

    async verifyCode(input) {
      const email = normalizeEmail(input.email);
      if(!validEmail(email)) throw new Error('bad_email');
      const deviceId = await getOrCreateDeviceId();
      const code = String(input.code || '').replace(/\D/g, '').slice(0, 12);
      const body: Record<string, unknown> = {
        ...(input.extra || {}),
        action:'verify',
        email,
        code,
        deviceId,
        locale:localeOf(input.locale),
        platform:String(input.platform || 'web').slice(0, 30)
      };
      if(input.handle) body.handle = input.handle;
      const result = await post(body);
      const syncToken = String(result.syncToken || '');
      if(!syncToken) throw new Error('missing_sync_token');
      const session: AuthSession = {
        email,
        deviceId,
        syncToken,
        handle:String(result.handle || '').slice(0, 40),
        locale:localeOf(result.locale ?? input.locale),
        sub:result.sub ?? null,
        premium:typeof result.premium === 'boolean' ? result.premium : premiumFrom(result.sub),
        fresh:!!result.fresh
      };
      await saveSession(session);
      return Object.assign({}, result, session);
    },

    async claimHandle(input) {
      const session = await getSession();
      if(!session) throw new Error('not_authenticated');
      const result = await post({
        ...(input.extra || {}),
        action:'set_handle',
        email:session.email,
        deviceId:session.deviceId,
        syncToken:session.syncToken,
        handle:String(input.handle || '').trim()
      });
      session.handle = String(result.handle || input.handle || '').slice(0, 40);
      await saveSession(session);
      return result;
    },

    getSession,

    async restoreSession(validate = false) {
      const session = await getSession();
      if(!session || !validate) return session;
      try {
        await this.status();
        return await getSession();
      } catch (_) {
        return null;
      }
    },

    getOrCreateDeviceId,

    async status() {
      const session = await getSession();
      if(!session) throw new Error('not_authenticated');
      const result = await post({
        action:'status',
        email:session.email,
        deviceId:session.deviceId,
        syncToken:session.syncToken
      });
      if('sub' in result) session.sub = result.sub ?? null;
      session.premium = typeof result.premium === 'boolean' ? result.premium : premiumFrom(session.sub);
      await saveSession(session);
      return result;
    },

    async setLocale(locale) {
      const session = await getSession();
      if(!session) throw new Error('not_authenticated');
      const normalized = localeOf(locale);
      const result = await post({
        action:'set_locale',
        email:session.email,
        deviceId:session.deviceId,
        syncToken:session.syncToken,
        locale:normalized
      });
      session.locale = normalized;
      await saveSession(session);
      return result;
    },

    async forget(scope = 'all', extra = {}) {
      const session = await getSession();
      if(!session) throw new Error('not_authenticated');
      const result = await post({
        ...extra,
        action:'forget',
        email:session.email,
        deviceId:session.deviceId,
        syncToken:session.syncToken,
        handle:session.handle,
        scope
      });
      if(scope === 'all') await remove(sessionKey);
      return result;
    },

    async logout() {
      await remove(sessionKey);
    },

    authFields
  };
}
