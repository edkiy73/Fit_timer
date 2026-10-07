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
import { Sheet } from './sheet';
import { localizedText } from './today-model';
import { TermsContent } from './legal-page';
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
    hasLiveRecord(progress.practiceItems.drill)||
    hasLiveRecord(progress.practiceItems.listening)||
    hasLiveRecord(progress.practiceItems.speaking)||
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
  onCourse,
  onSignIn,
  onBrowse
}:{
  onDone:()=>void;
  /** «Войти в аккаунт»: someone who already learns on another phone. */
  onSignIn?:()=>void;
  /** «Посмотреть приложение»: open Today without starting a lesson. */
  onBrowse?:()=>void;
  busy?:boolean;
  /** Saving the choice failed: onboarding stays open so the person can try again. */
  error?:boolean;
  /** Published courses; the choice is shown only when there is more than one. */
  courses?:ContentCatalogSet[];
  courseId?:string;
  onCourse?:(id:string)=>void;
}){
  const {t,locale}=useI18n();
  const picked=courses.find(set=>set.id===courseId);
  // Nothing preselected (no default course in Admin) → the start button waits for a choice.
  const needsChoice=courses.length>1&&!picked;
  // Onboarding replaces the whole shell, so the terms open in a sheet, not on their own route.
  const [termsOpen,setTermsOpen]=useState(false);

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

        {courses.length>1&&onCourse&&(
          <div className="onboarding-courses">
            <h3 id="onboarding-courses-title">{t('onboarding.courseTitle')}</h3>
            <p className="tile-text">{t('onboarding.courseHint')}</p>
            <CourseOptionList sets={courses} currentId={courseId} busy={busy} onPick={onCourse} />
          </div>
        )}

        <div className="onboarding-how">
          <h3>{t('onboarding.howTitle')}</h3>
          <ul className="onboarding-points">
            {points.map((point,index)=>(
              <li key={point.icon} style={{'--i':index+1} as CSSProperties}>
                <span className="onboarding-icon" aria-hidden="true"><Icon name={point.icon} size={20} /></span>
                <div>
                  <strong>{point.title}</strong>
                  <p>{point.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="onboarding-actions">
        <button
          className="primary-button onboarding-start"
          type="button"
          disabled={busy||needsChoice}
          onClick={onDone}
        >
          {busy
            ? t('onboarding.starting')
            : needsChoice
              ? t('onboarding.pickFirst')
              : picked&&courses.length>1
                ? t('onboarding.startCourse',{course:localizedText(picked.title,locale)})
                : t('onboarding.start')}
        </button>
        {error&&<p className="access-error" role="alert">{t('onboarding.saveError')}</p>}
      </div>
      {/* Only «Начать» stays pinned; the other ways in sit below, so the course list stays visible. */}
      <div className="onboarding-secondary">
        {onSignIn&&<button className="secondary-button" type="button" disabled={busy} onClick={onSignIn}>{t('onboarding.signIn')}</button>}
        {onBrowse&&<button className="link-button" type="button" disabled={busy} onClick={onBrowse}>{t('onboarding.browse')}</button>}
        <p className="onboarding-account-note">
          {t('onboarding.accountLater')}{' '}
          {t('onboarding.termsLead')}{' '}
          <button className="onboarding-terms-link" type="button" onClick={()=>setTermsOpen(true)}>{t('onboarding.termsLink')}</button>
        </p>
      </div>
      <Sheet open={termsOpen} onClose={()=>setTermsOpen(false)} labelledBy="onboarding-terms" closeLabel={t('access.signInClose')}>
        <div id="onboarding-terms" className="legal-page"><TermsContent /></div>
      </Sheet>
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
  // Preselected: the course chosen in Admin (or the only one); otherwise the learner picks.
  const sets=catalog.data?.sets??[];
  const adminDefault=catalog.data?.defaultSetId&&sets.some(set=>set.id===catalog.data?.defaultSetId)?catalog.data.defaultSetId:'';
  const presetId=adminDefault||(sets.length===1?sets[0]!.id:'');
  const courseId=pickedCourseId??presetId;
  // After «Начать» with another course: open its day 1 once that course has loaded (audit T10).
  const [openFirstDayOf,setOpenFirstDayOf]=useState<string|null>(null);
  useEffect(()=>{
    if(!openFirstDayOf||runtime.status!=='ready'||runtime.state?.set.id!==openFirstDayOf)return;
    const nodeId=runtime.state.currentNode?.id;
    setOpenFirstDayOf(null);
    navigate(nodeId?'/learn/'+encodeURIComponent(nodeId):'/');
  },[openFirstDayOf,runtime.status,runtime.state,navigate]);

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

  const finish=async(startLesson=true)=>{
    if(busy)return;
    setBusy(true);
    setSaveError(false);

    // Another course than the loaded one: save it, then open its day 1 once it loads.
    const switching=Boolean(courseId&&courseId!==activeCourseId);
    const nodeId=switching?null:runtime.state?.currentNode?.id??null;
    try{
      if(switching)await chooseCourse(courseId);
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

    if(!startLesson){ navigate('/'); return; }
    if(switching){ setOpenFirstDayOf(courseId); return; }
    navigate(nodeId?'/learn/'+encodeURIComponent(nodeId):'/');
  };

  return (
    <OnboardingView
      busy={busy}
      error={saveError}
      onDone={()=>void finish()}
      courses={sets}
      courseId={courseId}
      onCourse={setPickedCourseId}
      onSignIn={()=>navigate('/account?return='+encodeURIComponent('/'))}
      onBrowse={()=>void finish(false)}
    />
  );
}
