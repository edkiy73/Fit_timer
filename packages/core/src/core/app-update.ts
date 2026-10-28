/* In-app Android updates, shared by the React apps (the oldest app keeps its own copy in its mobile bridge).
   The server publishes the latest version per channel (`update.android.{direct,store}`); the phone compares it with
   its own build:
   - direct: the APK from GitHub downloads inside the app and opens the Android installer;
   - store: the button opens the Google Play (or other store) page.
   Below minimumCode the app shows a screen that cannot be skipped. Framework-neutral: the UI lives in each app. */

export interface UpdateChannel {
  latestCode?: number;
  minimumCode?: number;
  latestName?: string;
  url?: string;
  messageRu?: string;
  messageEn?: string;
}

export interface UpdateChannels {
  direct?: UpdateChannel;
  store?: UpdateChannel;
}

export interface UpdateOffer {
  level: 'optional' | 'required';
  channel: 'direct' | 'store';
  versionCode: number;
  versionName: string;
  url: string;
  message: string;
}

/** The native side of an app's update plugin (each app names its own, with these methods). */
export interface UpdatePlugin {
  getDistribution(): Promise<{channel: 'direct' | 'store'; versionCode: number; versionName: string}>;
  openExternal(options: {url: string}): Promise<void>;
  downloadUpdate(options: {url: string; expectedVersionCode: number}): Promise<{status: string; error?: string}>;
  getUpdateState(): Promise<{status: string; progress?: number; running?: boolean; error?: string}>;
  installUpdate(options: {expectedVersionCode: number}): Promise<{status: string; error?: string}>;
  cancelUpdate(): Promise<void>;
}

/** The app's update plugin on Android, or null on the website / iOS. */
export function androidUpdatePlugin(name: string): UpdatePlugin | null {
  const cap = (globalThis as unknown as {Capacitor?: {isNativePlatform?(): boolean; getPlatform?(): string; Plugins?: Record<string, unknown>}}).Capacitor;
  if(!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return null;
  return (cap.Plugins?.[name] as UpdatePlugin | undefined) ?? null;
}

/** What to offer for this build, or null when it is current. Pure: tested without a phone. */
export function decideUpdate(
  channels: UpdateChannels | undefined,
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
