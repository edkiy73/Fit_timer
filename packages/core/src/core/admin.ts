export interface AdminClientOptions {
  endpoint?: string;
  healthEndpoint?: string;
  fetch?: typeof fetch;
}

export interface AdminHealth {
  ok: boolean;
  status: 'ok' | 'warning' | 'error' | string;
  checkedAt?: string;
  deployment?: string;
  probes?: Array<Record<string, unknown>>;
  storage?: Record<string, unknown>;
  services?: Record<string, unknown>;
  warnings?: string[];
}

export interface AdminClient {
  health(): Promise<AdminHealth>;
  action<T extends Record<string, unknown> = Record<string, unknown>>(
    adminKey: string,
    action: string,
    body?: Record<string, unknown>
  ): Promise<T>;
}

export interface AdminError extends Error {
  status?: number;
  code?: string;
  detail?: string;
}

export function createAdminClient(options: AdminClientOptions = {}): AdminClient {
  const endpoint = options.endpoint || '/api/admin';
  const healthEndpoint = options.healthEndpoint || '/api/health';
  const fetchImpl = options.fetch || globalThis.fetch;

  async function json(response: Response): Promise<Record<string, unknown>> {
    let payload: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if(parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
    } catch (_) {}
    if(!response.ok || payload.ok === false){
      const error = new Error(String(payload.error || payload.code || 'admin_request_failed')) as AdminError;
      error.status = response.status;
      error.code = String(payload.error || payload.code || 'admin_request_failed');
      if(typeof payload.detail === 'string') error.detail = payload.detail;
      throw error;
    }
    return payload;
  }

  return {
    async health() {
      if(typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
      const response = await fetchImpl(healthEndpoint, {headers:{Accept:'application/json'}});
      try {
        const payload = await response.json();
        if(payload && typeof payload === 'object') return payload as AdminHealth;
      } catch (_) {}
      throw new Error('health_request_failed');
    },

    async action<T extends Record<string, unknown> = Record<string, unknown>>(adminKey: string, action: string, body: Record<string, unknown> = {}) {
      if(typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
      const key = String(adminKey || '').trim();
      if(!key) throw new Error('admin_key_required');
      const response = await fetchImpl(endpoint, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Admin-Key':encodeURIComponent(key)
        },
        body:JSON.stringify({...body, action})
      });
      return await json(response) as T;
    }
  };
}
