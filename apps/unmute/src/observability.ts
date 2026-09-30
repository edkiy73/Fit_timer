import { createClient } from '@appbase/core/observability.js';
import { authClient } from './auth';
import { apiUrl } from './api-url';

declare const __APP_BUILD_ID__: string;

const client = createClient({
  post: async body => {
    try{
      const response = await fetch(apiUrl('/api/auth'), {
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
    locale:'ru',
    build:__APP_BUILD_ID__,
    premium:false
  })
});

export async function trackInstallOnce(): Promise<void> {
  const key = 'unmute.analytics.install';
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


export function trackOnboardingComplete():void{
  void client.track('onboarding_done');
}


export type PaywallPlace='course'|'today'|'talk'|'other';

export function paywallEventName(place:string):string{
  return 'paywall_shown.'+(
    place==='course'||place==='today'||place==='talk'
      ? place
      : 'other'
  );
}

export function purchaseEventName(
  phase:'purchase_started'|'purchase_completed',
  sku:string
):string{
  return phase+'.'+(
    sku==='course.general-foundation'
      ? 'course.general-foundation'
      : 'other'
  );
}

export function trackLessonCompleted():void{
  void client.track('lesson_completed');
}

export function trackDayCompleted():void{
  void client.track('day_completed');
}

export function trackPaywallShown(place:string):void{
  void client.track(paywallEventName(place));
}

export function trackTalkStarted():void{
  void client.track('talk_started');
}

export function trackPurchaseStarted(sku:string):void{
  void client.track(purchaseEventName('purchase_started',sku));
}

export function trackPurchaseCompleted(sku:string):void{
  void client.track(purchaseEventName('purchase_completed',sku));
}
