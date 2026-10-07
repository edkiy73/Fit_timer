import { authClient } from './auth';
import { apiUrl } from './api-url';
import product from '../config/product.json';

/* «Пригласи друга» (launch plan, decision 17): the learner's code, joining by a friend's code and
   the passed days that release the bonus. The server keeps the rules (lib/unmute-referral.js). */

export interface ReferralInfo {
  code: string;
  bonusDays: number;
  daysNeeded: number;
  invited: number;
  rewarded: number;
  referred: {rewarded: boolean} | null;
  canJoin: boolean;
}

export class ReferralError extends Error {
  constructor(readonly code: string){ super(code); }
}

const PENDING_KEY = 'unmute.referral.pending';
const SETTLED_KEY = 'unmute.referral.settled';

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const fields = await authClient.authFields();
  if(!fields) throw new ReferralError('auth_required');
  const response = await fetch(apiUrl('/api/content'), {
    method:'POST',
    headers:{'Content-Type':'application/json', 'X-Fit-Email':fields.email, 'X-Fit-Device':fields.deviceId, 'X-Fit-Token':fields.syncToken},
    body:JSON.stringify(body)
  });
  let payload: Record<string, unknown> = {};
  try{ payload = await response.json() as Record<string, unknown>; }catch{}
  if(!response.ok || payload.ok === false) throw new ReferralError(String(payload.error || 'referral_failed'));
  return payload;
}

export async function fetchReferral(): Promise<ReferralInfo> {
  return (await post({action:'referral_info'})).referral as ReferralInfo;
}

export async function claimReferral(code: string): Promise<ReferralInfo> {
  return (await post({action:'referral_claim', code})).referral as ReferralInfo;
}

/** Passed course days of the invitee; the server gives the bonus once, at the needed count. */
export async function reportReferralDays(completedDays: number): Promise<{rewarded: boolean; bonusDays?: number; referral?: ReferralInfo}> {
  const result = await post({action:'referral_progress', completedDays});
  return {rewarded: result.rewarded === true, ...(typeof result.bonusDays === 'number' ? {bonusDays: result.bonusDays} : {}), ...(result.referral ? {referral: result.referral as ReferralInfo} : {})};
}

export function cleanReferralCode(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** A friend's code from an invite link waits here until the person signs in. */
export function rememberPendingReferral(code: string): void {
  const clean = cleanReferralCode(code);
  if(clean.length !== 8) return;
  try{ localStorage.setItem(PENDING_KEY, clean); }catch{}
}

export function pendingReferral(): string {
  try{ return cleanReferralCode(localStorage.getItem(PENDING_KEY) || ''); }catch{ return ''; }
}

export function clearPendingReferral(): void {
  try{ localStorage.removeItem(PENDING_KEY); }catch{}
}

/** Nothing left to report for this account on this phone (not invited, or the bonus is given). */
export function referralSettled(): boolean {
  try{ return localStorage.getItem(SETTLED_KEY) === '1'; }catch{ return false; }
}

export function setReferralSettled(settled: boolean): void {
  try{
    if(settled) localStorage.setItem(SETTLED_KEY, '1');
    else localStorage.removeItem(SETTLED_KEY);
  }catch{}
}

/** The public address of the web app: an invite link opens it (the app's own origin is local).
 *  On the site the app lives in /app (the root is the landing page, scripts/web-layout.mjs). */
export function publicAppUrl(): string {
  const cap = (globalThis as unknown as {Capacitor?: {isNativePlatform?(): boolean}}).Capacitor;
  if(cap?.isNativePlatform?.() || typeof window === 'undefined') return String(product.defaultApiUrl).replace(/\/$/, '') + '/app/';
  return window.location.origin + window.location.pathname;
}

export function inviteLink(code: string): string {
  return publicAppUrl() + '#/invite/' + encodeURIComponent(code);
}
