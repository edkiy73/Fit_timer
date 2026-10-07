import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { countDays } from './plural';
import { useLearnerCourseRuntime } from './course-runtime';
import {
  claimReferral,
  cleanReferralCode,
  clearPendingReferral,
  fetchReferral,
  inviteLink,
  pendingReferral,
  referralSettled,
  rememberPendingReferral,
  reportReferralDays,
  setReferralSettled,
  ReferralError,
  type ReferralInfo
} from './referral';

/* «Пригласи друга» in the profile (launch plan, decision 17): the learner's link and code, how many
   friends came and got the bonus, and a field for a friend's code (for an app installed from the
   store, where the link did not carry the code). */

export const REFERRAL_KEY = 'unmute-referral';

function completedDaysOf(runtime: ReturnType<typeof useLearnerCourseRuntime>): number {
  return runtime.state?.roadmapProgress.nodes.filter(item => item.complete && item.node.dayIndex !== undefined).length ?? 0;
}

function errorKey(error: unknown): string {
  const code = error instanceof ReferralError ? error.code : '';
  if(code === 'code_not_found' || code === 'bad_code') return 'invite.errorNotFound';
  if(code === 'own_code') return 'invite.errorOwn';
  if(code === 'account_not_new') return 'invite.errorOld';
  if(code === 'already_invited' || code === 'mutual_invite') return 'invite.errorAlready';
  return 'invite.errorGeneric';
}

export function InviteFriendView({
  info,
  onShare,
  onJoin
}:{
  info: ReferralInfo;
  onShare: () => Promise<'shared' | 'copied' | 'failed'>;
  onJoin: (code: string) => Promise<void>;
}){
  const {t, locale} = useI18n();
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const days = countDays(t, locale, info.daysNeeded);
  const bonus = countDays(t, locale, info.bonusDays);

  const share = async () => {
    const result = await onShare();
    setShareState(result === 'shared' ? 'idle' : result);
  };
  const join = async () => {
    setJoining(true);
    setJoinError('');
    try{ await onJoin(cleanReferralCode(code)); setCode(''); }
    catch(error){ setJoinError(t(errorKey(error))); }
    finally{ setJoining(false); }
  };

  return (
    <section className="profile-account" aria-labelledby="profile-invite-title">
      <h3 id="profile-invite-title">{t('invite.title')}</h3>
      <div className="tile invite-friend">
        <p className="tile-text">{t('invite.text', {days, bonus})}</p>
        <div className="invite-friend-code">
          <span>{t('invite.code')}</span>
          <strong>{info.code}</strong>
        </div>
        <button className="primary-button" type="button" onClick={() => void share()}>{t('invite.share')}</button>
        {shareState === 'copied' && <span className="tile-text" role="status">{t('invite.copied')}</span>}
        {shareState === 'failed' && <span className="tile-text" role="alert">{t('invite.copyFailed', {link: inviteLink(info.code)})}</span>}
        {info.invited > 0 && <span className="tile-text">{t('invite.stats', {invited: info.invited, rewarded: info.rewarded})}</span>}
        {info.referred && (
          <span className="tile-text">{info.referred.rewarded ? t('invite.joinedDone') : t('invite.joined', {days})}</span>
        )}
        {!info.referred && info.canJoin && (
          <details className="invite-friend-join">
            <summary>{t('invite.haveCode')}</summary>
            <div className="invite-friend-join-row">
              <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
                aria-label={t('invite.codeLabel')} placeholder={t('invite.codePlaceholder')} maxLength={12}
                value={code} onChange={event => setCode(event.target.value)} />
              <button className="secondary-button" type="button" disabled={joining || cleanReferralCode(code).length !== 8} onClick={() => void join()}>
                {t('invite.apply')}
              </button>
            </div>
            {joinError && <span className="tile-text" role="alert">{joinError}</span>}
          </details>
        )}
      </div>
    </section>
  );
}

async function shareInvite(info: ReferralInfo, text: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteLink(info.code);
  const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & {share?: (data: ShareData) => Promise<void>};
  if(nav?.share){
    try{ await nav.share({text, url}); return 'shared'; }
    catch(error){ if((error as {name?: string})?.name === 'AbortError') return 'shared'; }
  }
  try{ await nav?.clipboard?.writeText(text + ' ' + url); return 'copied'; }catch{ return 'failed'; }
}

/** The profile block for a signed-in learner. */
export function InviteFriend(){
  const {t, locale} = useI18n();
  const queryClient = useQueryClient();
  const runtime = useLearnerCourseRuntime();
  const auth = useOptionalAuth();
  const query = useQuery({queryKey:[REFERRAL_KEY], queryFn:fetchReferral, staleTime:60_000, retry:1});
  if(!query.data) return null;
  const info = query.data;
  const onJoin = async (code: string) => {
    const next = await claimReferral(code);
    setReferralSettled(false);
    queryClient.setQueryData([REFERRAL_KEY], next);
    // Days passed before joining count too.
    const result = await reportReferralDays(completedDaysOf(runtime)).catch(() => null);
    if(result?.referral) queryClient.setQueryData([REFERRAL_KEY], result.referral);
    if(result?.rewarded) await auth.refresh();
  };
  return <InviteFriendView info={info} onJoin={onJoin}
    onShare={() => shareInvite(info, t('invite.shareText', {days: countDays(t, locale, info.daysNeeded)}))} />;
}

/** `#/invite/<code>`: remember the friend's code and open the app. */
export function InviteRoute(){
  const {code = ''} = useParams();
  rememberPendingReferral(code);
  return <Navigate to="/" replace />;
}

/** Joins by a remembered invite code after sign-in, and reports passed days so the bonus comes. */
export function ReferralSync(){
  const auth = useOptionalAuth();
  const runtime = useLearnerCourseRuntime();
  const queryClient = useQueryClient();
  const signedIn = Boolean(auth.session);
  const completedDays = completedDaysOf(runtime);
  const claiming = useRef(false);
  const reported = useRef(0);

  useEffect(() => {
    const code = pendingReferral();
    if(!signedIn || !code || claiming.current) return;
    claiming.current = true;
    void claimReferral(code)
      .then(info => { setReferralSettled(false); queryClient.setQueryData([REFERRAL_KEY], info); clearPendingReferral(); })
      // A definite answer (own code, already invited, old account) clears it; a network failure retries later.
      .catch(error => { if(error instanceof ReferralError && error.code !== 'referral_failed' && error.code !== 'auth_required') clearPendingReferral(); })
      .finally(() => { claiming.current = false; });
  }, [signedIn, queryClient]);

  useEffect(() => {
    if(!signedIn || completedDays < 3 || reported.current >= completedDays || referralSettled()) return;
    reported.current = completedDays;
    void reportReferralDays(completedDays)
      .then(async result => {
        if(result.referral) queryClient.setQueryData([REFERRAL_KEY], result.referral);
        // Not invited, or the bonus already given: nothing more to report from this phone.
        if(result.referral && (!result.referral.referred || result.referral.referred.rewarded)) setReferralSettled(true);
        if(result.rewarded) await auth.refresh();
      })
      .catch(() => { reported.current = 0; });
  }, [signedIn, completedDays, queryClient]);

  return null;
}
