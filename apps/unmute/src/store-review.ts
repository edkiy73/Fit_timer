/* Store rating (launch plan, decision 17): after the third course day the app asks Google Play for
   its system rating sheet — once per device. Play decides whether it actually shows. The web and
   the direct APK have no store sheet: nothing happens there. */

export const STORE_REVIEW_AFTER_DAYS = 3;
const ASKED_KEY = 'unmute.store-review.v1';

export interface StoreReviewPlugin {
  requestReview?(): Promise<{requested?: boolean}>;
}

function nativePlugin(): StoreReviewPlugin | null {
  const cap = (globalThis as unknown as {Capacitor?: {isNativePlatform?(): boolean; getPlatform?(): string; Plugins?: {UnMuteUpdate?: StoreReviewPlugin}}}).Capacitor;
  if(!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return null;
  return cap.Plugins?.UnMuteUpdate ?? null;
}

function asked(): boolean {
  try{ return localStorage.getItem(ASKED_KEY) === '1'; }catch{ return true; }
}

/** Ask for a rating when `completedDays` course days are done; true when the store was asked. */
export async function maybeAskStoreReview(completedDays: number, plugin: StoreReviewPlugin | null = nativePlugin()): Promise<boolean> {
  if(completedDays < STORE_REVIEW_AFTER_DAYS || asked() || !plugin?.requestReview) return false;
  try{ localStorage.setItem(ASKED_KEY, '1'); }catch{ return false; }
  try{
    const result = await plugin.requestReview();
    return result?.requested === true;
  }catch{
    return false;
  }
}
