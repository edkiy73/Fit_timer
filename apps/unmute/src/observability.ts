import { createClient } from '@appbase/core/observability.js';
import { untrackedFetch } from '@appbase/core/busy-buttons.js';
import { authClient } from './auth';
import { apiUrl } from './api-url';

declare const __APP_BUILD_ID__: string;

const client = createClient({
  post: async body => {
    try{
      const response = await untrackedFetch(apiUrl('/api/auth'), {
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

export type CompletionRunMode='first'|'resume'|'replay';
export type CompletionKind='lesson'|'day';

interface PendingAnalyticsEvent {
  id:string;
  event:string;
}

const ANALYTICS_OUTBOX_KEY='unmute.analytics.outbox.v1';

function readAnalyticsOutbox():PendingAnalyticsEvent[]{
  try{
    const raw=localStorage.getItem(ANALYTICS_OUTBOX_KEY);
    const parsed=raw?JSON.parse(raw):[];
    if(!Array.isArray(parsed))return [];
    return parsed.filter(item=>
      item&&typeof item.id==='string'&&item.id&&typeof item.event==='string'&&item.event
    ).slice(-100);
  }catch{return [];}
}

function writeAnalyticsOutbox(items:PendingAnalyticsEvent[]):void{
  try{
    if(items.length)localStorage.setItem(ANALYTICS_OUTBOX_KEY,JSON.stringify(items.slice(-100)));
    else localStorage.removeItem(ANALYTICS_OUTBOX_KEY);
  }catch{}
}

export function completionEventName(kind:CompletionKind,mode:CompletionRunMode):string{
  return kind+'_completed.'+mode;
}

/** Retry pending analytics after reload/reconnect. Server-side eventId makes retries exactly-once. */
export async function flushAnalyticsOutbox():Promise<void>{
  const items=readAnalyticsOutbox();
  if(!items.length)return;
  const remaining:PendingAnalyticsEvent[]=[];
  for(const item of items){
    if(!(await client.track(item.event,item.id)))remaining.push(item);
  }
  writeAnalyticsOutbox(remaining);
}

/** Persist before network I/O so closing the app cannot lose a completion event. */
export function trackCompletionOnce(kind:CompletionKind,runId:string,mode:CompletionRunMode):void{
  const stableRunId=String(runId||'').trim().slice(0,120);
  if(!stableRunId)return;
  const id='completion:'+kind+':'+stableRunId;
  const event=completionEventName(kind,mode);
  const items=readAnalyticsOutbox();
  if(!items.some(item=>item.id===id)){
    items.push({id,event});
    writeAnalyticsOutbox(items);
  }
  void flushAnalyticsOutbox();
}

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
  return phase+'.'+(sku.startsWith('course.') ? 'course' : sku.startsWith('plus.') ? 'plus' : 'other');
}

export function trackLessonCompleted(runId:string,mode:CompletionRunMode):void{
  trackCompletionOnce('lesson',runId,mode);
}

export function trackDayCompleted(runId:string,mode:CompletionRunMode):void{
  trackCompletionOnce('day',runId,mode);
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
