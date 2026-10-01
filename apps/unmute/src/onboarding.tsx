import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
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
import { Icon, type IconName } from './icons';
import { chooseCourse, CourseOptionList, useActiveCourseId, useCatalog } from './active-course';
import { Loader } from './loader';
import type { ContentCatalogSet } from './content/client';

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
  busy=false,
  error=false,
  courses=[],
  courseId='',
  onCourse
}:{
  onDone:()=>void;
  busy?:boolean;
  /** Saving the choice failed: onboarding stays open so the person can try again. */
  error?:boolean;
  /** Published courses; the choice is shown only when there is more than one. */
  courses?:ContentCatalogSet[];
  courseId?:string;
  onCourse?:(id:string)=>void;
}){
  const {t}=useI18n();

  const points:{icon:IconName;title:string;text:string}[]=[
    {icon:'mic',title:t('onboarding.speakTitle'),text:t('onboarding.speakText')},
    {icon:'chat',title:t('onboarding.wordsTitle'),text:t('onboarding.wordsText')},
    {icon:'review',title:t('onboarding.reviewTitle'),text:t('onboarding.reviewText')}
  ];

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-glow" aria-hidden="true" />
      {/* "Turning the voice on": a quiet sound wave, frozen under reduced motion. */}
      <div className="voice-wave" aria-hidden="true">
        {Array.from({length:9},(_,bar)=><span key={bar} style={{'--bar':bar} as CSSProperties} />)}
      </div>
      <div className="onboarding-body">
        <div className="screen-kicker">{t('onboarding.eyebrow')}</div>
        <h2 id="onboarding-title">{t('onboarding.title')}</h2>
        <p className="onboarding-lead">{t('onboarding.lead')}</p>

        <ul className="onboarding-points">
          {points.map((point,index)=>(
            <li key={point.icon} style={{'--i':index+1} as CSSProperties}>
              <span className="onboarding-icon" aria-hidden="true"><Icon name={point.icon} size={22} /></span>
              <div>
                <strong>{point.title}</strong>
                <p>{point.text}</p>
              </div>
            </li>
          ))}
        </ul>

        {courses.length>1&&onCourse&&(
          <div className="onboarding-courses">
            <h3 id="onboarding-courses-title">{t('onboarding.courseTitle')}</h3>
            <p className="tile-text">{t('onboarding.courseHint')}</p>
            <CourseOptionList sets={courses} currentId={courseId} busy={busy} onPick={onCourse} />
          </div>
        )}
      </div>

      <div className="onboarding-actions">
        <button
          className="primary-button onboarding-start"
          type="button"
          disabled={busy}
          onClick={onDone}
        >
          {busy?t('onboarding.starting'):t('onboarding.start')}
        </button>
        {error&&<p className="access-error" role="alert">{t('onboarding.saveError')}</p>}
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
  const [saveError,setSaveError]=useState(false);
  const catalog=useCatalog();
  const activeCourseId=useActiveCourseId();
  const [pickedCourseId,setPickedCourseId]=useState<string|null>(null);
  const courseId=pickedCourseId??activeCourseId;

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

  if(runtime.status==='pending'||settingsQuery.isPending||catalog.isPending){
    return (
      <section className="onboarding onboarding-loading">
        <Loader title={t('onboarding.loading')} />
      </section>
    );
  }

  const finish=async()=>{
    if(busy)return;
    setBusy(true);
    setSaveError(false);

    // Another course was picked: its day 1 opens from «Сегодня» once that course loads.
    const switching=Boolean(pickedCourseId&&pickedCourseId!==activeCourseId);
    const nodeId=switching?null:runtime.state?.currentNode?.id??null;
    try{
      if(switching&&pickedCourseId)await chooseCourse(pickedCourseId);
      await patchSettings({onboardingDoneAt:new Date().toISOString()});
      await queryClient.invalidateQueries({queryKey:SETTINGS_QUERY_KEY,exact:true});
      void trackOnboardingComplete();
    }catch{
      // Not saved: keep onboarding open instead of pretending the choice was made.
      setBusy(false);
      setSaveError(true);
      return;
    }
    markOnboardingDone();
    setLocalDone(true);

    if(nodeId){
      navigate('/learn/'+encodeURIComponent(nodeId));
    }else{
      navigate('/');
    }
  };

  return (
    <OnboardingView
      busy={busy}
      error={saveError}
      onDone={()=>void finish()}
      courses={catalog.data?.sets??[]}
      courseId={courseId}
      onCourse={setPickedCourseId}
    />
  );
}
