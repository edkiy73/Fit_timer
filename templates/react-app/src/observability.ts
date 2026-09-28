import { createClient } from '@appbase/core/observability.js';
import { authClient } from './auth';

declare const __APP_BUILD_ID__: string;

const client = createClient({
  post: async body => {
    try{
      const response = await fetch('/api/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      return response.ok;
    }catch(_){
      return false;
    }
  },
  deviceId: () => authClient.getOrCreateDeviceId(),
  context: () => ({
    platform:'web',
    locale:'__APP_LOCALE__',
    build:__APP_BUILD_ID__,
    premium:false
  })
});

export async function trackInstallOnce(): Promise<void> {
  const key = '__APP_SLUG__.analytics.install';
  try{
    if(localStorage.getItem(key)) return;
    if(await client.track('install')) localStorage.setItem(key, '1');
  }catch(_){}
}

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
