/* «Выйти» on a shared phone (launch plan, decision 20): the account's progress stays on the
   server and comes back at the next sign-in; this phone starts clean for the next person.
   Device preferences (theme, language, dismissed update) stay. */

/** Personal keys outside the synced documents: unfinished lessons, review session, trial, onboarding. */
export const PERSONAL_PREFIXES = [
  'unmute.lesson-run:', 'unmute.pattern-run:', 'unmute.lesson-completion:', 'unmute.review-budget:',
  'unmute.review-seed:', 'unmute.recent-day-completion:', 'unmute.course-map-reward:', 'unmute.aiTrial.'
];
export const PERSONAL_KEYS = ['unmute.onboarding.v1'];

export function clearPersonalLocalState(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | null = safeLocalStorage()): number {
  if(!storage) return 0;
  const doomed: string[] = [];
  for(let i = 0; i < storage.length; i++){
    const key = storage.key(i);
    if(key && (PERSONAL_KEYS.includes(key) || PERSONAL_PREFIXES.some(prefix => key.startsWith(prefix)))) doomed.push(key);
  }
  for(const key of doomed){ try{ storage.removeItem(key); }catch{} }
  return doomed.length;
}

function safeLocalStorage(): Storage | null {
  try{ return globalThis.localStorage ?? null; }catch{ return null; }
}

/** Restarts the app on Today after sign-out, so nothing of the previous account stays in memory. */
export const appRestart = {
  reload(): void {
    // The running app can still write a key between the clean-up and the reload (an effect
    // re-marking onboarding, a lesson saving its place): the next start finishes the job.
    try{ globalThis.localStorage?.setItem(PENDING_KEY, '1'); }catch{}
    window.location.hash = '#/';
    window.location.reload();
  }
};

const PENDING_KEY = 'unmute.sign-out.pending';

/** Call once at startup, before the app renders. */
export function finishPendingSignOut(storage: Pick<Storage, 'length' | 'key' | 'removeItem' | 'getItem'> | null = safeLocalStorage()): boolean {
  if(!storage) return false;
  let pending = false;
  try{ pending = storage.getItem(PENDING_KEY) === '1'; }catch{}
  if(!pending) return false;
  clearPersonalLocalState(storage);
  try{ storage.removeItem(PENDING_KEY); }catch{}
  return true;
}

export interface SignOutSteps {
  /** Sends unsent progress; resolves true when nothing is left unsent. */
  flush: () => Promise<boolean>;
  unregisterPush: () => Promise<void>;
  logout: () => Promise<void>;
  clearDocuments: () => Promise<void>;
  clearContentCache: () => Promise<void>;
  clearLocal?: () => void;
}

/** First call without `force`: returns 'unsent' if progress could not be saved — never wipe it silently. */
export async function signOutAndClear(steps: SignOutSteps, {force = false} = {}): Promise<'done' | 'unsent'> {
  const saved = await steps.flush().catch(() => false);
  if(!saved && !force) return 'unsent';
  await steps.unregisterPush().catch(() => undefined);
  await steps.logout();
  await steps.clearDocuments();
  await steps.clearContentCache().catch(() => undefined);
  (steps.clearLocal ?? (() => { clearPersonalLocalState(); }))();
  return 'done';
}
