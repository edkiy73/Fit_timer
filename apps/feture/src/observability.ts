import { apiUrl } from './api-url';
import { createClient } from '@appbase/core/observability.js';
import { untrackedFetch } from '@appbase/core/busy-buttons.js';
import { authClient } from './auth';
import {safeFetureDiagnostic} from '../lib/feture/diagnostic-policy.js';

declare const __APP_BUILD_ID__: string;

const client = createClient({
  post: async body => {
    try{
      const response = await untrackedFetch(apiUrl('/api/auth'), {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body.action==='client_error'?safeFetureDiagnostic(body):body)
      });
      return response.ok;
    }catch(_){
      return false;
    }
  },
  deviceId: () => authClient.getOrCreateDeviceId(),
  context: () => ({
    platform:'web',
    locale:'ru',
    build:__APP_BUILD_ID__,
    premium:false
  })
});

export function installGlobalDiagnostics(): () => void {
  const onError = (event: ErrorEvent) => {
    void client.capture('error', event.error || new Error(event.message || 'window_error'));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    void client.capture('rejection', event.reason, 'unhandled_rejection');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

export function captureFatal(error: Error): void {
  void client.capture('error', error, 'react_render_error');
}
