import { createClient } from '@appbase/core/observability.js';
import { untrackedFetch } from '@appbase/core/busy-buttons.js';
import { taskAuth } from './auth';

declare const __APP_BUILD_ID__: string;

const client = createClient({
  post: async body => {
    try{
      const response = await untrackedFetch('/api/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      return response.ok;
    }catch(_){
      return false;
    }
  },
  deviceId: () => taskAuth.getOrCreateDeviceId(),
  context: () => ({
    platform:'web',
    locale:(typeof navigator !== 'undefined' ? navigator.language : 'ru').slice(0,2).toLowerCase(),
    build:__APP_BUILD_ID__,
    premium:false
  })
});

export async function trackInstallOnce(): Promise<void> {
  const key = 'task-mini.analytics.install';
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
