import type { AuthClient } from './auth.js';

/* Client side of Core billing: which payment providers this build can use and how to start
   a purchase. The server decides everything that matters (price, SKU, access); after a
   purchase the app re-reads rights with auth.status() / AuthProvider.refresh(). */

export interface BillingEntitlement {
  key: string;
  kind: 'subscription' | 'owned';
  active: boolean;
  provider: string;
  source: string;
  since: string;
  expiresAt: string;
  autoRenew: boolean;
}

export interface CheckoutResult {
  /** Provider page to open (web checkout). */
  url?: string;
  /** The provider confirmed at once (store purchase verified, test provider). */
  granted: boolean;
  /** Compatibility fields for existing products. */
  owned: string[];
  premium: boolean;
  /** Canonical provider-neutral access records for new product code. */
  entitlements: BillingEntitlement[];
}

export interface BillingContext {
  platform?: 'web' | 'android' | 'ios' | 'unknown';
  distribution?: 'web' | 'google_play' | 'app_store' | 'direct' | 'unknown';
  /** ISO 3166-1 alpha-2 country code when known. */
  country?: string;
  /** Store-specific storefront/region identifier when available. */
  storefront?: string;
}

export interface BillingMethod {
  id: string;
  kind: 'store' | 'external' | 'direct' | 'test';
  external: boolean;
}

export interface StorePurchaseContext {
  provider: string;
  sku: string;
  productId?: string;
  appAccountToken?: string;
  obfuscatedAccountId?: string;
  [key: string]: unknown;
}

export interface BillingClientOptions {
  auth: Pick<AuthClient, 'authFields'>;
  endpoint?: string;
  fetch?: typeof fetch;
  /** Default platform/store context. Products may supply a build-channel resolver once. */
  context?: BillingContext | (() => BillingContext | Promise<BillingContext>);
}

export interface RenewalResult {
  /** The provider manages renewal on its own page (a store's subscription settings). */
  url?: string;
  /** Renewal of the active subscription after the change. */
  autoRenew: boolean;
}

export interface BillingClient {
  /** Legacy list of provider ids. Prefer methods() for new product UI. */
  providers(context?: BillingContext): Promise<string[]>;
  /** Allowed and configured payment methods for this platform/store context. */
  methods(context?: BillingContext): Promise<BillingMethod[]>;
  checkout(provider: string, sku: string, context?: BillingContext): Promise<CheckoutResult>;
  /** Data the native store SDK needs before opening its purchase sheet. */
  purchaseContext(provider: string, sku: string, context?: BillingContext): Promise<StorePurchaseContext>;
  /** Verify a native store purchase on the server before granting access. */
  verifyPurchase(provider: string, sku: string, proof: Record<string, unknown>, context?: BillingContext): Promise<CheckoutResult>;
  /** Re-check server-side provider references and refresh canonical access. */
  reconcile(): Promise<CheckoutResult & {checked: number; changed: number}>;
  /** Turn automatic renewal of the active subscription on or off; the paid period stays. */
  setRenewal(autoRenew: boolean): Promise<RenewalResult>;
}

export interface BillingError extends Error {
  status?: number;
  code?: string;
}

function runtimeBillingContext(): BillingContext {
  const cap = (globalThis as unknown as {Capacitor?: {getPlatform?: () => string}}).Capacitor;
  const raw = typeof cap?.getPlatform === 'function' ? String(cap.getPlatform()) : '';
  const platform: BillingContext['platform'] = raw === 'android' || raw === 'ios' ? raw : 'web';
  return platform === 'web'
    ? {platform:'web', distribution:'web'}
    : {platform, distribution:'unknown'};
}

export function createBillingClient(options: BillingClientOptions): BillingClient {
  const endpoint = options.endpoint || '/api/billing';
  // globalThis.fetch is looked up per request, so a wrapper installed later (busy buttons) applies.
  const fetchImpl = options.fetch || (typeof globalThis.fetch === 'function'
    ? (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)
    : undefined);

  async function resolveContext(explicit?: BillingContext): Promise<BillingContext> {
    if(explicit) return explicit;
    if(typeof options.context === 'function') return (await options.context()) || runtimeBillingContext();
    return options.context || runtimeBillingContext();
  }

  function checkoutResult(result: Record<string, unknown>): CheckoutResult {
    const entitlements: BillingEntitlement[] = Array.isArray(result.entitlements) ? result.entitlements.flatMap(value => {
      if(!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      const kind = String(item.kind || '');
      if(kind !== 'subscription' && kind !== 'owned') return [];
      const key = String(item.key || '');
      if(!key) return [];
      return [{
        key,
        kind,
        active:!!item.active,
        provider:String(item.provider || ''),
        source:String(item.source || ''),
        since:String(item.since || ''),
        expiresAt:String(item.expiresAt || ''),
        autoRenew:!!item.autoRenew
      }];
    }) : [];
    const out: CheckoutResult = {
      granted:!!result.granted,
      owned:Array.isArray(result.owned) ? result.owned.map(String) : [],
      premium:!!result.premium,
      entitlements
    };
    if(typeof result.url === 'string' && result.url) out.url = result.url;
    return out;
  }

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
    async providers(context){
      const resolved = await resolveContext(context);
      const result = await post({action:'providers', context:resolved});
      return Array.isArray(result.providers) ? result.providers.map(String) : [];
    },

    async methods(context){
      const resolved = await resolveContext(context);
      const result = await post({action:'methods', context:resolved});
      return Array.isArray(result.methods) ? result.methods.flatMap(value => {
        if(!value || typeof value !== 'object') return [];
        const method = value as Record<string, unknown>;
        const id = String(method.id || '');
        const kind = String(method.kind || '');
        if(!id || !['store','external','direct','test'].includes(kind)) return [];
        return [{id, kind:kind as BillingMethod['kind'], external:!!method.external}];
      }) : [];
    },

    async checkout(provider, sku, context){
      const auth = await options.auth.authFields();
      if(!auth) throw new Error('not_authenticated');
      const result = await post({
        action:'checkout',
        provider,
        sku,
        email:auth.email,
        deviceId:auth.deviceId,
        syncToken:auth.syncToken,
        context:await resolveContext(context)
      });
      return checkoutResult(result);
    },

    async purchaseContext(provider, sku, context){
      const auth = await options.auth.authFields();
      if(!auth) throw new Error('not_authenticated');
      const result = await post({
        action:'purchase_context',
        provider,
        sku,
        email:auth.email,
        deviceId:auth.deviceId,
        syncToken:auth.syncToken,
        context:await resolveContext(context)
      });
      return result as StorePurchaseContext;
    },

    async verifyPurchase(provider, sku, proof, context){
      const auth = await options.auth.authFields();
      if(!auth) throw new Error('not_authenticated');
      const result = await post({
        action:'verify_purchase',
        provider,
        sku,
        proof,
        email:auth.email,
        deviceId:auth.deviceId,
        syncToken:auth.syncToken,
        context:await resolveContext(context)
      });
      return checkoutResult(result);
    },

    async reconcile(){
      const auth = await options.auth.authFields();
      if(!auth) throw new Error('not_authenticated');
      const result = await post({
        action:'reconcile',
        email:auth.email,
        deviceId:auth.deviceId,
        syncToken:auth.syncToken
      });
      return {
        ...checkoutResult(result),
        checked:Number(result.checked) || 0,
        changed:Number(result.changed) || 0
      };
    },

    async setRenewal(autoRenew){
      const auth = await options.auth.authFields();
      if(!auth) throw new Error('not_authenticated');
      const result = await post({action:'renewal', autoRenew, email:auth.email, deviceId:auth.deviceId, syncToken:auth.syncToken});
      return {...(result.url ? {url:String(result.url)} : {}), autoRenew:!!result.autoRenew};
    }
  };
}
