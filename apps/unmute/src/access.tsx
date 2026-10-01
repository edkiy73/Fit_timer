import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import { countDays } from './plural';
import type { AuthSession } from '@appbase/core/auth.js';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { resolveCourseEntitlement } from './entitlements';
import { trackPaywallShown, trackPurchaseCompleted, trackPurchaseStarted } from './observability';
import { coursePrice, coursePriceWithPlus, plusCourseDiscount, plusPrices, plusYearSaving } from './pricing';
import { billingClient } from './billing';
import { authClient } from './auth';
import { localizedText } from './today-model';
import { Sheet } from './sheet';
import { Loader } from './loader';
import { Icon } from './icons';

/* «Открыть весь курс» / UnMute Plus: choose what to buy, see what it gives, pay.
   The server decides the price and what a SKU opens; checkout goes through Core billing.
   Until a payment provider is connected, the «instant» provider grants the purchase at
   once (Admin → «Способы оплаты»); a provider that answers with a payment page is opened instead. */

export type Plan = 'course' | 'plus.month' | 'plus.year';
export type AccessFocus = 'course' | 'plus';
export interface PurchaseDone { plan: Plan; until?: string | null }

const PRODUCT_NAME = 'UnMute: English for Expats';

export function AccessOfferView({
  runtime,
  session,
  authLoading,
  focus = 'course',
  canBuy = true,
  buying = null,
  buyError = null,
  done = null,
  refreshing = false,
  refreshError = false,
  onBuy,
  onRestore,
  onCourse,
  onContinue
}:{
  runtime: LearnerCourseRuntimeValue;
  session: AuthSession | null;
  authLoading: boolean;
  focus?: AccessFocus;
  /** null while the available providers are loading. */
  canBuy?: boolean | null;
  buying?: Plan | null;
  buyError?: string | null;
  done?: PurchaseDone | null;
  refreshing?: boolean;
  refreshError?: boolean;
  onBuy: (plan: Plan) => void;
  onRestore: () => void;
  onCourse: () => void;
  onContinue: () => void;
}){
  const {t, locale} = useI18n();
  const state = runtime.state;
  const coursePreview = state?.access === 'preview';
  const offerCourse = coursePreview && focus === 'course';
  const [plan, setPlan] = useState<Plan>(offerCourse ? 'course' : 'plus.year');
  // Only a loaded course that is already open drops the course plan (not a reload in between).
  const courseOpen = state?.access === 'full';
  useEffect(() => { if(courseOpen && plan === 'course') setPlan('plus.year'); }, [courseOpen, plan]);

  const back = <button className="learn-back" type="button" onClick={onCourse}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>;

  if(runtime.status === 'pending' || authLoading){
    return <section className="access-shell"><Loader title={t('access.loading')} /></section>;
  }
  if(runtime.status === 'error' || !state){
    return (
      <section className="access-shell">
        {back}
        <div className="learn-state" role="alert">
          <strong>{t('access.errorTitle')}</strong>
          <button className="primary-button" type="button" onClick={onRestore}>{t('today.retry')}</button>
        </div>
      </section>
    );
  }

  const courseTitle = localizedText(state.set.title, locale);
  const dateFormat = new Intl.DateTimeFormat(locale, {day:'numeric', month:'long', year:'numeric'});

  if(done){
    const plus = done.plan !== 'course';
    return (
      <section className="access-shell" aria-labelledby="access-title">
        <article className="access-done">
          <span className="access-done-mark" aria-hidden="true"><Icon name="check" size={34} /></span>
          <h2 id="access-title">{t(plus ? 'access.donePlusTitle' : 'access.doneCourseTitle')}</h2>
          <p>{plus
            ? (done.until ? t('access.donePlusUntil', {date:dateFormat.format(new Date(done.until))}) : t('access.donePlusText'))
            : t('access.doneCourseText', {course:courseTitle})}</p>
          <button className="primary-button" type="button" onClick={onContinue}>{t('access.continue')}</button>
        </article>
      </section>
    );
  }

  const entitlement = resolveCourseEntitlement(state.set, session);
  const subUntil = (session?.sub as {until?: string} | null | undefined)?.until ?? null;
  const premiumUntil = session?.premium && subUntil ? subUntil : null;

  // The course is already open (and the learner came for the course, not for Plus).
  if(!coursePreview && focus === 'course'){
    return (
      <section className="access-shell" aria-labelledby="access-title">
        {back}
        <article className="access-active">
          <h2 id="access-title">{t('access.activeTitle')}</h2>
          <p>{entitlement.reason === 'owned' ? t('access.activeOwned') : t('access.activeGeneric')}</p>
          <button className="primary-button" type="button" onClick={onCourse}>{t('access.openCourse')}</button>
        </article>
      </section>
    );
  }
  // Access is confirmed but the full course has not arrived on this device yet.
  if(coursePreview && entitlement.full){
    return (
      <section className="access-shell" aria-labelledby="access-title">
        {back}
        <article className="access-active">
          <h2 id="access-title">{t('access.contentPendingTitle')}</h2>
          <p>{t('access.contentPendingText')}</p>
          {refreshError && <p className="access-error" role="alert">{t('access.refreshError')}</p>}
          <button className="primary-button" type="button" disabled={refreshing} onClick={onRestore}>
            {refreshing ? t('access.refreshing') : t('today.retry')}
          </button>
        </article>
      </section>
    );
  }

  const discount = plusCourseDiscount();
  const fullPrice = coursePrice(state.set.access, locale);
  const plusCoursePrice = coursePriceWithPlus(state.set.access, locale);
  const coursePay = session?.premium && plusCoursePrice ? plusCoursePrice : fullPrice;
  const plus = plusPrices(locale);
  const saving = plusYearSaving(locale);
  const totalDays = state.roadmapProgress.requiredCount;

  const plans: Array<{id: Plan; title: string; price: string | null; note: string; was?: string | null; badge?: string}> = [];
  if(offerCourse){
    plans.push({
      id:'course', title:t('access.courseTitle'), price:coursePay,
      was:coursePay !== fullPrice ? fullPrice : null,
      note:session?.premium && discount ? t('access.courseNotePlus', {discount}) : t('access.courseNote')
    });
  }
  // Plus already active: on the course screen it only lowers the course price, never sold twice.
  if(plus && !(offerCourse && session?.premium)){
    plans.push({id:'plus.month', title:t('access.plusMonthTitle'), price:t('access.perMonth', {price:plus.monthly}), note:t('access.plusMonthNote')});
    plans.push({
      id:'plus.year', title:t('access.plusYearTitle'), price:t('access.perYear', {price:plus.yearly}), note:t('access.plusYearNote'),
      ...(saving ? {badge:t('access.saving', {percent:saving})} : {})
    });
  }
  const selected = plans.find(item => item.id === plan) ?? plans[0];
  const benefits = selected?.id === 'course'
    ? [t('access.benefitDays', {days:countDays(t, locale, totalDays)}), t('access.benefitForever'), t('access.benefitReview'), t('access.benefitNoSub')]
    : [t('access.benefitAi'), ...(discount ? [t('access.benefitDiscount', {discount})] : []), t('access.benefitAllCourses'), t('access.benefitCancel')];
  const payPrice = selected?.id === 'course' ? coursePay : selected?.id === 'plus.month' ? plus?.monthly : plus?.yearly;

  return (
    <section className="access-shell" aria-labelledby="access-title">
      {back}
      <header className="access-heading">
        <div className="eyebrow">{offerCourse ? courseTitle : 'UnMute Plus'}</div>
        <h2 id="access-title">{t(offerCourse ? 'access.title' : 'access.plusHeading')}</h2>
        <p>{offerCourse
          ? t('access.lead', {total:countDays(t, locale, totalDays)})
          : t('access.plusLead')}</p>
      </header>

      {premiumUntil && !offerCourse ? (
        <article className="access-active">
          <h3>{t('access.plusActiveTitle')}</h3>
          <p>{t('access.plusActiveUntil', {date:dateFormat.format(new Date(premiumUntil))})}</p>
        </article>
      ) : null}

      <div className="access-plans" role="radiogroup" aria-label={t('access.choose')}>
        {plans.map(item => (
          <label key={item.id} className={'access-plan pressable' + (item.id === selected?.id ? ' is-on' : '')}>
            <input type="radio" name="access-plan" value={item.id} checked={item.id === selected?.id} onChange={() => setPlan(item.id)} />
            <span className="access-plan-radio" aria-hidden="true" />
            <span className="access-plan-text">
              <b>{item.title}{item.badge && <em className="access-plan-badge">{item.badge}</em>}</b>
              <small>{item.note}</small>
            </span>
            <span className="access-plan-price">
              {item.was && <s>{item.was}</s>}
              <strong>{item.price}</strong>
            </span>
          </label>
        ))}
      </div>

      <ul className="access-benefits">
        {benefits.map(line => <li key={line}><Icon name="check" size={18} />{line}</li>)}
      </ul>

      {buyError && <p className="access-error" role="alert">{buyError}</p>}
      {refreshError && <p className="access-error" role="alert">{t('access.refreshError')}</p>}

      <div className="access-pay">
        <button className="primary-button" type="button" disabled={!selected || canBuy !== true || buying !== null}
          onClick={() => selected && onBuy(selected.id)}>
          {buying ? t('access.paying') : payPrice ? t('access.pay', {price:payPrice}) : t('access.payNoPrice')}
        </button>
        <p className="access-fineprint">
          {canBuy === false ? t('access.unavailable') : t('access.fineprint')}
        </p>
        <button className="link-button" type="button" disabled={refreshing} onClick={onRestore}>
          {refreshing ? t('access.refreshing') : t('access.restore')}
        </button>
      </div>
    </section>
  );
}

const ERRORS: Record<string, string> = {
  provider_disabled:'access.errorUnavailable',
  unknown_provider:'access.errorUnavailable',
  bad_sync_token:'access.errorSession',
  not_authenticated:'access.errorSession'
};

export function AccessScreen(){
  const runtime = useLearnerCourseRuntime();
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {t, locale} = useI18n();
  const trackedPlaceRef = useRef('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [buying, setBuying] = useState<Plan | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [done, setDone] = useState<PurchaseDone | null>(null);
  // A guest picks a plan first; the sheet signs them in and the purchase continues.
  const [pendingPlan, setPendingPlan] = useState<Plan | 'restore' | null>(null);

  const rawPlace = new URLSearchParams(location.search).get('from') || 'other';
  const place = rawPlace === 'course' || rawPlace === 'today' || rawPlace === 'talk' || rawPlace === 'answer' ? rawPlace : 'other';
  const focus: AccessFocus = place === 'talk' || place === 'answer' ? 'plus' : 'course';

  const providers = useQuery({queryKey:['billing-providers'], queryFn:() => billingClient.providers(), staleTime:60_000, retry:1});
  const provider = providers.data?.[0] ?? null;
  const canBuy = providers.isPending ? null : Boolean(provider);

  useEffect(() => {
    if(runtime.status !== 'ready' || !runtime.state) return;
    const isPaywall = place === 'talk' || runtime.state.access === 'preview';
    if(!isPaywall || trackedPlaceRef.current === place) return;
    trackedPlaceRef.current = place;
    trackPaywallShown(place === 'answer' ? 'talk' : place);
  }, [place, runtime.status, runtime.state?.access]);

  const restore = async () => {
    if(!auth.session){ setPendingPlan('restore'); return; }
    if(refreshing) return;
    setRefreshing(true);
    setRefreshError(false);
    try{
      await auth.refresh();
      await runtime.refresh();
    }catch{
      setRefreshError(true);
    }finally{
      setRefreshing(false);
    }
  };

  const buy = async (plan: Plan) => {
    if(!auth.session){ setPendingPlan(plan); return; }
    if(!provider || !runtime.state || buying) return;
    setBuying(plan);
    setBuyError(null);
    try{
      const sku = plan === 'course' ? runtime.state.set.access.mode === 'entitlement' ? runtime.state.set.access.entitlement : '' : plan;
      if(!sku) throw Object.assign(new Error('unknown_sku'), {code:'unknown_sku'});
      trackPurchaseStarted(sku);
      const result = await billingClient.checkout(provider, sku);
      if(result.url){ window.location.assign(result.url); return; }
      trackPurchaseCompleted(sku);
      await auth.refresh();
      await runtime.refresh();
      const fresh = await authClient.getSession();
      setDone({plan, until:plan === 'course' ? null : ((fresh?.sub as {until?: string} | null | undefined)?.until ?? null)});
    }catch(error){
      const code = String((error as {code?: string})?.code || (error as Error)?.message || '');
      setBuyError(t(ERRORS[code] ?? 'access.errorGeneric'));
    }finally{
      setBuying(null);
    }
  };

  // After signing in from the sheet, continue what the learner pressed — once the course
  // (reloaded for the new account) and the payment provider are ready.
  useEffect(() => {
    if(!auth.session || !pendingPlan || !runtime.state || (pendingPlan !== 'restore' && !provider)) return;
    const next = pendingPlan;
    setPendingPlan(null);
    if(next === 'restore') void restore();
    else void buy(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session, runtime.state, provider]);

  return (
    <>
      <AccessOfferView
        runtime={runtime}
        session={auth.session}
        authLoading={auth.loading}
        focus={focus}
        canBuy={canBuy}
        buying={buying ?? (auth.session && pendingPlan && pendingPlan !== 'restore' ? pendingPlan : null)}
        buyError={buyError}
        done={done}
        refreshing={refreshing}
        refreshError={refreshError}
        onBuy={plan => void buy(plan)}
        onRestore={() => void restore()}
        onCourse={() => { if(focus === 'plus') navigate(-1); else navigate('/course'); }}
        onContinue={() => { if(done?.plan !== 'course' && focus === 'plus') navigate(-1); else navigate('/'); }}
      />
      <Sheet open={pendingPlan !== null && !auth.session} onClose={() => setPendingPlan(null)} labelledBy="access-signin-title" closeLabel={t('access.signInClose')}>
        <div className="access-signin" id="access-signin-title">
          <SignInForm locale={sharedUiLocale(locale)} productName={PRODUCT_NAME} askHandle={false} variant="inline"
            title={t('access.signInTitle')} lead={t('access.signInText')} onSignedIn={() => undefined} />
        </div>
      </Sheet>
    </>
  );
}
