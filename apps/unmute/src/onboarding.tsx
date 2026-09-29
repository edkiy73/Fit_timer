import {
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { CourseProgressDocument } from './progress';
import { useLearnerCourseRuntime } from './course-runtime';
import { appDocs, SETTINGS_DOC } from './sync';
import { patchSettings, readSettings } from './settings';
import { trackOnboardingComplete } from './observability';

export const ONBOARDING_KEY='unmute.onboarding.v1';
const SETTINGS_QUERY_KEY=['unmute-settings'] as const;

function hasLiveRecord<T extends {deleted?:boolean}>(
  records:Record<string,T|undefined>
):boolean{
  return Object.values(records).some(value=>Boolean(value&&!value.deleted));
}

export function hasExistingCourseProgress(progress:CourseProgressDocument):boolean{
  return (
    hasLiveRecord(progress.seen)||
    hasLiveRecord(progress.cards)||
    hasLiveRecord(progress.practice.drill)||
    hasLiveRecord(progress.practice.listening)||
    hasLiveRecord(progress.practice.speaking)||
    hasLiveRecord(progress.manualNodes)||
    hasLiveRecord(progress.learningDays)||
    hasLiveRecord(progress.metrics)
  );
}

export function onboardingStoredDone(storage:Pick<Storage,'getItem'>=localStorage):boolean{
  try{return storage.getItem(ONBOARDING_KEY)==='1';}
  catch{return false;}
}

export function markOnboardingDone(storage:Pick<Storage,'setItem'>=localStorage):void{
  try{storage.setItem(ONBOARDING_KEY,'1');}catch{}
}

export function OnboardingView({
  onDone,
  busy=false
}:{
  onDone:()=>void;
  busy?:boolean;
}){
  const {t}=useI18n();

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <div className="eyebrow">{t('onboarding.eyebrow')}</div>
        <h2 id="onboarding-title">{t('onboarding.title')}</h2>
        <p className="onboarding-lead">{t('onboarding.lead')}</p>

        <div className="onboarding-points">
          <article>
            <span className="onboarding-number" aria-hidden="true">1</span>
            <div>
              <strong>{t('onboarding.speakTitle')}</strong>
              <p>{t('onboarding.speakText')}</p>
            </div>
          </article>
          <article>
            <span className="onboarding-number" aria-hidden="true">2</span>
            <div>
              <strong>{t('onboarding.wordsTitle')}</strong>
              <p>{t('onboarding.wordsText')}</p>
            </div>
          </article>
          <article>
            <span className="onboarding-number" aria-hidden="true">3</span>
            <div>
              <strong>{t('onboarding.reviewTitle')}</strong>
              <p>{t('onboarding.reviewText')}</p>
            </div>
          </article>
        </div>

        <button
          className="primary-button onboarding-start"
          type="button"
          disabled={busy}
          onClick={onDone}
        >
          {busy?t('onboarding.starting'):t('onboarding.start')}
        </button>
        <p className="onboarding-account-note">{t('onboarding.accountLater')}</p>
      </div>
    </section>
  );
}

export function OnboardingGate({children}:{children:ReactNode}){
  const runtime=useLearnerCourseRuntime();
  const navigate=useNavigate();
  const location=useLocation();
  const queryClient=useQueryClient();
  const {t}=useI18n();
  const [localDone,setLocalDone]=useState(()=>onboardingStoredDone());
  const [busy,setBusy]=useState(false);

  const settingsQuery=useQuery({
    queryKey:SETTINGS_QUERY_KEY,
    queryFn:readSettings,
    staleTime:Infinity
  });

  useEffect(()=>{
    return appDocs.subscribe(change=>{
      if(!change.keys.some(ref=>ref.key===SETTINGS_DOC))return;
      void queryClient.invalidateQueries({
        queryKey:SETTINGS_QUERY_KEY,
        exact:true
      });
    });
  },[queryClient]);

  const progressExists=useMemo(
    ()=>runtime.state?hasExistingCourseProgress(runtime.state.progress):false,
    [runtime.state]
  );
  const syncedDone=Boolean(settingsQuery.data?.onboardingDoneAt);
  const done=localDone||syncedDone||progressExists;

  useEffect(()=>{
    if(!syncedDone)return;
    markOnboardingDone();
    setLocalDone(true);
  },[syncedDone]);

  useEffect(()=>{
    if(runtime.status!=='ready'||!progressExists||syncedDone)return;
    markOnboardingDone();
    setLocalDone(true);
    void patchSettings({onboardingDoneAt:new Date().toISOString()})
      .then(()=>queryClient.invalidateQueries({
        queryKey:SETTINGS_QUERY_KEY,
        exact:true
      }))
      .catch(()=>{});
  },[progressExists,queryClient,runtime.status,syncedDone]);

  // Signing in is always reachable from the header; onboarding never blocks account recovery.
  if(location.pathname==='/account')return <>{children}</>;

  if(done)return <>{children}</>;

  if(runtime.status==='error'||settingsQuery.isError)return <>{children}</>;

  if(runtime.status==='pending'||settingsQuery.isPending){
    return (
      <section className="onboarding onboarding-loading">
        <div className="learn-state" role="status">
          <strong>{t('onboarding.loading')}</strong>
        </div>
      </section>
    );
  }

  const finish=async()=>{
    if(busy)return;
    setBusy(true);
    markOnboardingDone();
    setLocalDone(true);

    const nodeId=runtime.state?.currentNode?.id??null;
    try{
      await patchSettings({onboardingDoneAt:new Date().toISOString()});
      void trackOnboardingComplete();
    }catch{}

    if(nodeId){
      navigate('/learn/'+encodeURIComponent(nodeId));
    }else{
      navigate('/');
    }
  };

  return <OnboardingView busy={busy} onDone={()=>void finish()} />;
}
