import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { AuthSession } from '@appbase/core/auth.js';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { resolveCourseEntitlement } from './entitlements';
import { trackPaywallShown } from './observability';

export function AccessOfferView({
  runtime,
  session,
  authLoading,
  refreshing=false,
  refreshError=false,
  onRefresh,
  onAccount,
  onCourse
}:{
  runtime:LearnerCourseRuntimeValue;
  session:AuthSession|null;
  authLoading:boolean;
  refreshing?:boolean;
  refreshError?:boolean;
  onRefresh:()=>void;
  onAccount:()=>void;
  onCourse:()=>void;
}){
  const {t}=useI18n();

  if(runtime.status==='pending'||authLoading){
    return (
      <section className="access-shell">
        <div className="learn-state" role="status">
          <strong>{t('access.loading')}</strong>
        </div>
      </section>
    );
  }

  if(runtime.status==='error'){
    return (
      <section className="access-shell">
        <button className="learn-back" type="button" onClick={onCourse}>{t('nav.back')}</button>
        <div className="learn-state" role="alert">
          <strong>{t('access.errorTitle')}</strong>
          <button className="primary-button" type="button" onClick={onRefresh}>
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  const state=runtime.state;
  if(!state)return null;
  const entitlement=resolveCourseEntitlement(state.set,session);
  const full=state.access==='full';

  if(full){
    const detail=entitlement.reason==='owned'
      ? t('access.activeOwned')
      : entitlement.reason==='plus'
        ? t('access.activePlus')
        : t('access.activeGeneric');
    return (
      <section className="access-shell" aria-labelledby="access-title">
        <button className="learn-back" type="button" onClick={onCourse}>{t('nav.back')}</button>
        <article className="access-active">
          <div className="eyebrow">{t('access.eyebrow')}</div>
          <h2 id="access-title">{t('access.activeTitle')}</h2>
          <p>{detail}</p>
          <button className="primary-button" type="button" onClick={onCourse}>
            {t('access.openCourse')}
          </button>
        </article>
      </section>
    );
  }

  if(entitlement.full){
    return (
      <section className="access-shell" aria-labelledby="access-title">
        <button className="learn-back" type="button" onClick={onCourse}>{t('nav.back')}</button>
        <article className="access-active">
          <div className="eyebrow">{t('access.eyebrow')}</div>
          <h2 id="access-title">{t('access.contentPendingTitle')}</h2>
          <p>{t('access.contentPendingText')}</p>
          {refreshError&&<p className="access-error" role="alert">{t('access.refreshError')}</p>}
          <button className="primary-button" type="button" disabled={refreshing} onClick={onRefresh}>
            {refreshing?t('access.refreshing'):t('today.retry')}
          </button>
        </article>
      </section>
    );
  }

  return (
    <section className="access-shell" aria-labelledby="access-title">
      <button className="learn-back" type="button" onClick={onCourse}>{t('nav.back')}</button>
      <div className="access-heading">
        <div className="eyebrow">{t('access.eyebrow')}</div>
        <h2 id="access-title">{t('access.title')}</h2>
        <p>{t('access.lead')}</p>
      </div>

      <div className="access-options">
        <article className="access-option">
          <span className="access-tag">{t('access.foreverTag')}</span>
          <h3>{t('access.foreverTitle')}</h3>
          <p>{t('access.foreverText')}</p>
        </article>
        <article className="access-option">
          <span className="access-tag">{t('access.plusTag')}</span>
          <h3>{t('access.plusTitle')}</h3>
          <p>{t('access.plusText')}</p>
        </article>
      </div>

      <div className="access-note" role="note">
        <strong>{t('access.notForgettingTitle')}</strong>
        <span>{t('access.notForgettingText')}</span>
      </div>

      <div className="access-dev-note">
        {t('access.checkoutLater')}
      </div>

      {refreshError&&<p className="access-error" role="alert">{t('access.refreshError')}</p>}

      <div className="access-actions">
        {session ? (
          <button className="primary-button" type="button" disabled={refreshing} onClick={onRefresh}>
            {refreshing?t('access.refreshing'):t('access.refresh')}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onAccount}>
            {t('access.signIn')}
          </button>
        )}
        <button className="secondary-button" type="button" onClick={onCourse}>
          {t('access.backCourse')}
        </button>
      </div>
    </section>
  );
}

export function AccessScreen(){
  const runtime=useLearnerCourseRuntime();
  const auth=useOptionalAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const trackedPlaceRef=useRef('');
  const [refreshing,setRefreshing]=useState(false);
  const [refreshError,setRefreshError]=useState(false);

  useEffect(()=>{
    if(runtime.status!=='ready'||!runtime.state)return;
    const rawPlace=new URLSearchParams(location.search).get('from')||'other';
    const place=rawPlace==='course'||rawPlace==='today'||rawPlace==='talk'?rawPlace:'other';
    const isPaywall=place==='talk'||runtime.state.access==='preview';
    if(!isPaywall||trackedPlaceRef.current===place)return;
    trackedPlaceRef.current=place;
    trackPaywallShown(place);
  },[location.search,runtime.status,runtime.state?.access]);

  const refresh=async()=>{
    if(refreshing)return;
    setRefreshing(true);
    setRefreshError(false);
    try{
      if(auth.session)await auth.refresh();
      await runtime.refresh();
    }catch{
      setRefreshError(true);
    }finally{
      setRefreshing(false);
    }
  };

  return (
    <AccessOfferView
      runtime={runtime}
      session={auth.session}
      authLoading={auth.loading}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={()=>void refresh()}
      onAccount={()=>navigate('/account?return=%2Faccess')}
      onCourse={()=>navigate('/course')}
    />
  );
}
