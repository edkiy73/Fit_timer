namespace AppBaseObservability {
  export type Platform = 'web' | 'android' | 'ios';

  export interface RuntimeContext {
    platform: Platform;
    locale: string;
    build?: string;
    premium?: boolean;
  }

  export interface AnalyticsEnvelope {
    action: 'analytics';
    event: string;
    deviceId: string;
    platform: Platform;
    locale: string;
    premium: boolean;
  }

  export interface DiagnosticEnvelope {
    action: 'client_error';
    kind: 'error' | 'rejection';
    name: string;
    message: string;
    stack: string;
    build: string;
    platform: Platform;
    locale: string;
  }

  export interface ClientOptions {
    post(body: AnalyticsEnvelope | DiagnosticEnvelope): Promise<boolean>;
    deviceId(): Promise<string>;
    context(): RuntimeContext;
  }

  export interface ObservabilityClient {
    track(event: string): Promise<boolean>;
    capture(kind: 'error' | 'rejection', error: unknown, fallbackMessage?: string): Promise<boolean>;
    diagnosticPayload(kind: 'error' | 'rejection', error: unknown, fallbackMessage?: string): DiagnosticEnvelope;
  }

  export function createClient(options: ClientOptions): ObservabilityClient {
    let reporting = false;

    const diagnosticPayload = (
      kind: 'error' | 'rejection',
      error: unknown,
      fallbackMessage?: string
    ): DiagnosticEnvelope => {
      const e = error && typeof error === 'object'
        ? error as {name?: unknown; message?: unknown; stack?: unknown}
        : null;
      const ctx = options.context();
      return {
        action:'client_error',
        kind:kind === 'rejection' ? 'rejection' : 'error',
        name:String((e && e.name) || 'Error').slice(0,80),
        message:String((e && e.message) || fallbackMessage || 'unknown').slice(0,700),
        stack:String((e && e.stack) || '').slice(0,4000),
        build:String(ctx.build || '').slice(0,80),
        platform:ctx.platform,
        locale:String(ctx.locale || '').slice(0,20)
      };
    };

    return {
      async track(event: string): Promise<boolean> {
        const name = String(event || '').trim();
        if(!name) return false;
        try {
          const ctx = options.context();
          return await options.post({
            action:'analytics',
            event:name,
            deviceId:await options.deviceId(),
            platform:ctx.platform,
            locale:String(ctx.locale || '').slice(0,20),
            premium:!!ctx.premium
          });
        } catch (_) {
          return false;
        }
      },

      diagnosticPayload,

      async capture(kind, error, fallbackMessage): Promise<boolean> {
        if(reporting) return false;
        reporting = true;
        try {
          return await options.post(diagnosticPayload(kind, error, fallbackMessage));
        } catch (_) {
          return false;
        } finally {
          reporting = false;
        }
      }
    };
  }
}
