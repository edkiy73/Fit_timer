import type { AuthClient } from './auth.js';

export interface SyncDocumentInput {
  profileId: string;
  key: string;
  value?: string | null;
  rev?: number;
  at?: string;
  schema?: number;
  deleted?: boolean;
}

export interface SyncProfileInput {
  user: {
    id: string;
    name?: string;
    theme?: 'system' | 'light' | 'dark';
    locale?: 'system' | 'ru' | 'en';
    [key: string]: unknown;
  };
  at?: string;
  deleted?: boolean;
}

export interface SyncDocument extends SyncDocumentInput {
  deviceId?: string;
}

export interface SyncProfile {
  user: SyncProfileInput['user'];
  userAt?: string;
  deleted?: boolean;
  docs: SyncDocument[];
}

export interface SyncPullResult {
  profiles: SyncProfile[];
  accountDocs: SyncDocument[];
}

export interface SyncClientOptions {
  auth: Pick<AuthClient, 'authFields'>;
  endpoint?: string;
  fetch?: typeof fetch;
}

export interface SyncClient {
  pull(): Promise<SyncPullResult>;
  push(input: {profiles?: SyncProfileInput[]; docs?: SyncDocumentInput[]}): Promise<void>;
}

export interface SyncClientError extends Error {
  status?: number;
  code?: string;
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  const endpoint = options.endpoint || '/api/sync';
  const fetchImpl = options.fetch || globalThis.fetch;

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if(typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
    const auth = await options.auth.authFields();
    if(!auth) throw new Error('not_authenticated');

    const response = await fetchImpl(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        ...body,
        email:auth.email,
        deviceId:auth.deviceId,
        token:auth.syncToken
      })
    });

    let payload: Record<string, unknown> = {};
    try{
      const parsed = await response.json();
      if(parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
    }catch(_){}

    if(!response.ok || payload.ok === false){
      const error = new Error(String(payload.error || payload.code || 'sync_failed')) as SyncClientError;
      error.status = response.status;
      error.code = String(payload.error || payload.code || 'sync_failed');
      throw error;
    }
    return payload;
  }

  return {
    async pull(){
      const result = await post({action:'pull'});
      return {
        profiles:Array.isArray(result.profiles) ? result.profiles as unknown as SyncProfile[] : [],
        accountDocs:Array.isArray(result.accountDocs) ? result.accountDocs as unknown as SyncDocument[] : []
      };
    },

    async push(input){
      await post({
        action:'push',
        profiles:Array.isArray(input.profiles) ? input.profiles : [],
        docs:Array.isArray(input.docs) ? input.docs : []
      });
    }
  };
}
