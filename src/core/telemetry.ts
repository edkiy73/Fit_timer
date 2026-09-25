namespace AppBaseTelemetry {
  export type DiagnosticKind = 'error' | 'rejection';

  export interface AnalyticsInput {
    event: string;
    properties?: Readonly<Record<string, unknown>>;
  }

  export interface DiagnosticInput {
    kind: DiagnosticKind;
    name: string;
    message: string;
    stack: string;
    context?: Readonly<Record<string, unknown>>;
  }

  export interface TelemetryTransport {
    sendAnalytics(input: AnalyticsInput): Promise<boolean>;
    sendDiagnostic(input: DiagnosticInput): Promise<boolean>;
  }

  export interface TelemetryClient {
    track(event: string, properties?: Readonly<Record<string, unknown>>): Promise<boolean>;
    capture(kind: DiagnosticKind, error: unknown, fallbackMessage?: string,
      context?: Readonly<Record<string, unknown>>): Promise<boolean>;
  }

  export function createTelemetry(transport: TelemetryTransport): TelemetryClient {
    let diagnosticBusy = false;

    return {
      async track(event, properties){
        const name = String(event || '').trim();
        if(!name) return false;
        try{
          return !!(await transport.sendAnalytics({event:name, properties}));
        }catch(_){
          return false;
        }
      },

      async capture(kind, error, fallbackMessage, context){
        if(diagnosticBusy) return false;
        diagnosticBusy = true;
        try{
          const source = error && typeof error === 'object'
            ? error as {name?:unknown; message?:unknown; stack?:unknown}
            : null;
          const input: DiagnosticInput = {
            kind: kind === 'rejection' ? 'rejection' : 'error',
            name: String(source?.name || 'Error').slice(0, 80),
            message: String(source?.message || fallbackMessage || 'unknown').slice(0, 700),
            stack: String(source?.stack || '').slice(0, 4000),
            context
          };
          return !!(await transport.sendDiagnostic(input));
        }catch(_){
          return false;
        }finally{
          diagnosticBusy = false;
        }
      }
    };
  }
}
