import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { apiUrl } from './api-url';
import { Icon } from './icons';

/* In-app updates on Android. The server (admin → «Обновление приложения») publishes the
   latest version per channel in /api/config → update.android.{direct,store}:
   - direct: the APK from GitHub downloads inside the app and opens the Android installer;
   - store: the button opens the Google Play (or other store) page.
   Below minimumCode the app shows a screen that cannot be skipped. */

export interface UpdateChannel {
  latestCode?: number;
  minimumCode?: number;
  latestName?: string;
  url?: string;
  messageRu?: string;
  messageEn?: string;
}

export interface UpdateOffer {
  level: 'optional' | 'required';
  channel: 'direct' | 'store';
  versionCode: number;
  versionName: string;
  url: string;
  message: string;
}

type DownloadStatus = 'idle' | 'downloading' | 'ready' | 'installing' | 'permission' | 'error';

interface UpdatePlugin {
  getDistribution(): Promise<{channel: 'direct' | 'store'; versionCode: number; versionName: string}>;
  openExternal(options: {url: string}): Promise<void>;
  downloadUpdate(options: {url: string; expectedVersionCode: number}): Promise<{status: string; error?: string}>;
  getUpdateState(): Promise<{status: string; progress?: number; running?: boolean; error?: string}>;
  installUpdate(options: {expectedVersionCode: number}): Promise<{status: string; error?: string}>;
  cancelUpdate(): Promise<void>;
}

function plugin(): UpdatePlugin | null {
  const cap = (globalThis as unknown as {Capacitor?: {isNativePlatform?(): boolean; getPlatform?(): string; Plugins?: {UnMuteUpdate?: UpdatePlugin}}}).Capacitor;
  if(!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return null;
  return cap.Plugins?.UnMuteUpdate ?? null;
}

/** What to offer for this build, or null when it is current. Pure: tested without a phone. */
export function decideUpdate(
  channels: {direct?: UpdateChannel; store?: UpdateChannel} | undefined,
  channel: 'direct' | 'store',
  currentCode: number,
  locale: string
): UpdateOffer | null {
  const state = channels?.[channel];
  const latest = Math.max(0, Math.round(Number(state?.latestCode) || 0));
  const url = String(state?.url || '');
  const safeUrl = channel === 'store' ? /^(https:\/\/|market:\/\/)/i : /^https:\/\//i;
  if(!latest || latest <= currentCode || !safeUrl.test(url)) return null;
  const minimum = Math.min(latest, Math.max(0, Math.round(Number(state?.minimumCode) || 0)));
  const message = String((locale.startsWith('ru') ? state?.messageRu : state?.messageEn) || '').trim();
  return {
    level: minimum > currentCode ? 'required' : 'optional',
    channel,
    versionCode: latest,
    versionName: String(state?.latestName || ''),
    url,
    message
  };
}

const DISMISS_KEY = 'unmute.update.dismissed';

export function useAppUpdate(){
  const {locale} = useI18n();
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState(-1);
  const [dismissed, setDismissed] = useState(() => {
    try{ return Number(localStorage.getItem(DISMISS_KEY)) || 0; }catch{ return 0; }
  });
  const poll = useRef<number | null>(null);

  const stopPolling = () => {
    if(poll.current !== null){ window.clearInterval(poll.current); poll.current = null; }
  };

  const install = useCallback(async (target: UpdateOffer) => {
    const native = plugin();
    if(!native) return;
    setStatus('installing');
    const result = await native.installUpdate({expectedVersionCode:target.versionCode}).catch(() => ({status:'error'}));
    if(result.status === 'permission_required') setStatus('permission');
    else if(result.status === 'installer_opened') setStatus('ready');
    else setStatus('error');
  }, []);

  const watch = useCallback((target: UpdateOffer) => {
    const native = plugin();
    if(!native) return;
    stopPolling();
    poll.current = window.setInterval(() => {
      void native.getUpdateState().then(state => {
        if(state.status === 'downloading'){
          setStatus('downloading');
          setProgress(typeof state.progress === 'number' ? state.progress : -1);
        }else if(state.status === 'ready'){
          stopPolling();
          void install(target);
        }else if(state.status === 'error'){
          stopPolling();
          setStatus('error');
        }else if(state.status === 'cancelled' || state.status === 'idle'){
          stopPolling();
          setStatus('idle');
        }
      }).catch(() => undefined);
    }, 1000);
  }, [install]);

  useEffect(() => {
    const native = plugin();
    if(!native) return;
    let live = true;
    void (async () => {
      try{
        const [build, response] = await Promise.all([native.getDistribution(), fetch(apiUrl('/api/config'))]);
        const config = await response.json() as {update?: {android?: {direct?: UpdateChannel; store?: UpdateChannel}}};
        const next = decideUpdate(config.update?.android, build.channel, Number(build.versionCode) || 0, locale);
        if(!live) return;
        setOffer(next);
        if(next?.channel === 'direct'){
          // A download started earlier keeps running in the background: pick it up.
          const state = await native.getUpdateState().catch(() => null);
          if(state?.status === 'downloading'){ setStatus('downloading'); watch(next); }
          else if(state?.status === 'ready') setStatus('ready');
        }
      }catch{}
    })();
    return () => { live = false; stopPolling(); };
  }, [locale, watch]);

  const start = async () => {
    const native = plugin();
    if(!native || !offer) return;
    if(offer.channel === 'store'){
      await native.openExternal({url:offer.url}).catch(() => undefined);
      return;
    }
    if(status === 'ready' || status === 'permission'){ await install(offer); return; }
    setStatus('downloading');
    setProgress(-1);
    const result = await native.downloadUpdate({url:offer.url, expectedVersionCode:offer.versionCode}).catch(() => ({status:'error'}));
    if(result.status === 'error'){ setStatus('error'); return; }
    if(result.status === 'installer_opened'){ setStatus('ready'); return; }
    if(result.status === 'permission_required'){ setStatus('permission'); return; }
    watch(offer);
  };

  const cancel = async () => {
    stopPolling();
    await plugin()?.cancelUpdate().catch(() => undefined);
    setStatus('idle');
    setProgress(-1);
  };

  const dismiss = () => {
    if(!offer) return;
    setDismissed(offer.versionCode);
    try{ localStorage.setItem(DISMISS_KEY, String(offer.versionCode)); }catch{}
  };

  const visible = Boolean(offer && (offer.level === 'required' || dismissed !== offer.versionCode));
  return {offer: visible ? offer : null, status, progress, start, cancel, dismiss};
}

type UpdateState = ReturnType<typeof useAppUpdate>;

function actionLabel(t: (key: string, params?: Record<string, string | number>) => string, state: UpdateState): string {
  if(state.offer?.channel === 'store') return t('update.openStore');
  if(state.status === 'downloading') return state.progress >= 0 ? t('update.downloadingPercent', {progress:state.progress}) : t('update.downloading');
  if(state.status === 'installing') return t('update.installing');
  if(state.status === 'permission') return t('update.installAfterPermission');
  if(state.status === 'ready') return t('update.install');
  if(state.status === 'error') return t('update.retry');
  return t('update.update');
}

function UpdateBody({state}: {state: UpdateState}){
  const {t} = useI18n();
  const offer = state.offer!;
  const busy = state.status === 'downloading' || state.status === 'installing';
  return (
    <>
      <p className="tile-text">
        {offer.message || (offer.channel === 'store' ? t('update.storeText') : t('update.directText'))}
      </p>
      {state.status === 'permission' && <p className="tile-text" role="status">{t('update.permissionHint')}</p>}
      {state.status === 'error' && <p className="tile-text" role="alert">{t('update.error')}</p>}
      <button className="primary-button" type="button" disabled={busy} onClick={() => void state.start()}>
        {actionLabel(t, state)}
      </button>
      {state.status === 'downloading' && (
        <button className="secondary-button" type="button" onClick={() => void state.cancel()}>{t('update.cancel')}</button>
      )}
    </>
  );
}

const UpdateContext = createContext<UpdateState | null>(null);

/** One update check for the whole app; the required-update screen covers everything. */
export function AppUpdateProvider({children}: {children: ReactNode}){
  const state = useAppUpdate();
  return (
    <UpdateContext.Provider value={state}>
      {children}
      <UpdateGate state={state} />
    </UpdateContext.Provider>
  );
}

/** Quiet card at the top of «Сегодня». */
export function UpdateBanner(){
  const {t} = useI18n();
  const state = useContext(UpdateContext);
  if(!state || !state.offer || state.offer.level === 'required') return null;
  return (
    <section className="tile update-banner" aria-labelledby="update-banner-title">
      <div className="update-banner-head">
        <span className="update-banner-icon" aria-hidden="true"><Icon name="review" size={20} /></span>
        <h3 id="update-banner-title">
          {state.offer.versionName ? t('update.titleVersion', {version:state.offer.versionName}) : t('update.title')}
        </h3>
        <button className="update-banner-close" type="button" aria-label={t('update.later')} onClick={state.dismiss}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <UpdateBody state={state} />
    </section>
  );
}

/** Below the minimum version the app cannot be used until it is updated. */
export function UpdateGate({state}: {state: UpdateState}){
  const {t} = useI18n();
  if(!state.offer || state.offer.level !== 'required') return null;
  return (
    <section className="update-gate" role="dialog" aria-modal="true" aria-labelledby="update-gate-title">
      <div className="update-gate-card">
        <h2 id="update-gate-title">{t('update.requiredTitle')}</h2>
        <UpdateBody state={state} />
      </div>
    </section>
  );
}
