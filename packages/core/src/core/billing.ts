import type { AuthClient } from './auth.js';

/* Client side of Core billing: which payment providers this build can use and how to start
   a purchase. The server decides everything that matters (price, SKU, access); after a
   purchase the app re-reads rights with auth.status() / AuthProvider.refresh(). */

export interface CheckoutResult {
  /** Provider page to open (web checkout). */
  url?: string;
  /** The provider confirmed at once (store purchase verified, test provider). */
  granted: boolean;
  owned: string[];
  premium: boolean;
}

export interface BillingClientOptions {
  auth: Pick<AuthClient, 'authFields'>;
  endpoint?: string;
  fetch?: typeof fetch;
}

export interface BillingClient {
  providers(): Promise<string[]>;
  checkout(provider: string, sku: string): Promise<CheckoutResult>;
}

export interface BillingError extends Error {
  status?: number;
  code?: string;
}

export function createBillingClient(options: BillingClientOptions): BillingClient {
  const endpoint = options.endpoint || '/api/billing';
  // globalThis.fetch is looked up per request, so a wrapper installed later (busy buttons) applies.
  const fetchImpl = options.fetch || (typeof globalThis.fetch === 'function'
    ? (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)
    : undefined);

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if(typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
    const response = await fetchImpl(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    let payload: Record<string, unknown> = {};
    try{
      const parsed = await response.json();
      if(parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
    }catch(_){}
    if(!response.ok || payload.ok === false){
      const error = new Error(String(payload.error || 'billing_failed')) as BillingError;
      error.status = response.status;
      error.code = String(payload.error || 'billing_failed');
      throw error;
    }
    return payload;
  }

  return {
    async providers(){
      const result = await post({action:'providers'});
      return Array.isArray(result.providers) ? result.providers.map(String) : [];
    },

    async checkout(provider, sku){
      const auth = await options.auth.authFields();
      if(!auth) throw new Error('not_authenticated');
      const result = await post({
        action:'checkout',
        provider,
        sku,
        email:auth.email,
        deviceId:auth.deviceId,
        syncToken:auth.syncToken
      });
      const out: CheckoutResult = {
        granted:!!result.granted,
        owned:Array.isArray(result.owned) ? result.owned.map(String) : [],
        premium:!!result.premium
      };
      if(typeof result.url === 'string' && result.url) out.url = result.url;
      return out;
    }
  };
}
