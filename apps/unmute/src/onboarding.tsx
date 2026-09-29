import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import { useLearnerCourseRuntime } from './course-runtime';
import type { CourseProgressDocument } from './progress';
import { LexiconText } from './lexicon-ui';
import { trackOnboardingComplete } from './observability';

export const ONBOARDING_KEY='unmute.onboarding.v1';

function liveCount<T extends {deleted?:boolean}>(records:Record<string,T|undefined>):number{
  return Object.values(records).filter(value=>Boolean(value&&!value.deleted)).length;
}

export function hasExistingCourseProgress(progress:CourseProgressDocument):boolean{
  return (
    liveCount(progress.seen)>0||
    liveCount(progress.cards)>0||
    liveCount(progress.practice.drill)>0||
    liveCount(progress.practice.listening)>0||
    liveCount(progress.practice.speaking)>0||
    liveCount(progress.manualNodes)>0||
    liveCount(progress.learningDays)>0||
    liveCount(progress.metrics)>0
  );
}

export function onboardingStoredDone(storage:Pick<Storage,'getItem'>=localStorage):boolean{
  try{return storage.getItem(ONBOARDING_KEY)==='1';}
  catch{return false;}
}

export function markOnboardingDone(storage:Pick<Storage,'setItem'>=localStorage):void{
  try{storage.setItem(ONBOARDING_KEY,'1');}catch{}
}

export function shouldShowOnboarding(
  storedDone:boolean,
  state:LearnerCourseState|null
):boolean{
  if(storedDone||!state)return false;
  return !hasExistingCourseProgress(state.progress);
}

export function OnboardingView({
  onDone,
  onSkip
}:{
  onDone:()=>void;
  onSkip:()=>void;
}){
  const {t}=useI18n();
  const [step,setStep]=useState(0);
  const total=3;

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-top">
        <div className="onboarding-dots" aria-label={t('onboarding.progress',{current:step+1,total})}>
          {Array.from({length:total},(_,index)=>(
            <span
              className={index===step?'onboarding-dot onboarding-dot-active':'onboarding-dot'}
              key={index}
            />
          ))}
        </div>
        <button className="link-button" type="button" onClick={onSkip}>
          {t('onboarding.skip')}
        </button>
      </div>

      {step===0&&(
        <div className="onboarding-page">
          <div className="onboarding-icon" aria-hidden="true">◎</div>
          <div>
            <div className="eyebrow">{t('onboarding.firstEyebrow')}</div>
            <h2 id="onboarding-title">{t('onboarding.firstTitle')}</h2>
          </div>
          <p>{t('onboarding.firstText')}</p>
          <div className="onboarding-note">{t('onboarding.noAccount')}</div>
        </div>
      )}

      {step===1&&(
        <div className="onboarding-page">
          <div className="onboarding-icon" aria-hidden="true">Aa</div>
          <div>
            <div className="eyebrow">{t('onboarding.wordsEyebrow')}</div>
            <h2 id="onboarding-title">{t('onboarding.wordsTitle')}</h2>
          </div>
          <p>{t('onboarding.wordsText')}</p>
          <div className="onboarding-demo">
            <LexiconText text="I need to book an appointment." />
          </div>
          <small>{t('onboarding.wordsHint')}</small>
        </div>
      )}

      {step===2&&(
        <div className="onboarding-page">
          <div className="onboarding-icon" aria-hidden="true">↻</div>
          <div>
            <div className="eyebrow">{t('onboarding.practiceEyebrow')}</div>
            <h2 id="onboarding-title">{t('onboarding.practiceTitle')}</h2>
          </div>
          <p>{t('onboarding.practiceText')}</p>
          <div className="onboarding-flow">
            <span>{t('onboarding.flowSpeak')}</span>
            <b>→</b>
            <span>{t('onboarding.flowListen')}</span>
            <b>→</b>
            <span>{t('onboarding.flowReview')}</span>
          </div>
        </div>
      )}

      <div className="onboarding-actions">
        {step>0&&(
          <button className="secondary-button" type="button" onClick={()=>setStep(value=>value-1)}>
            {t('onboarding.back')}
          </button>
        )}
        {step<total-1 ? (
          <button className="primary-button" type="button" onClick={()=>setStep(value=>value+1)}>
            {t('onboarding.next')}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onDone}>
            {t('onboarding.start')}
          </button>
        )}
      </div>
    </section>
  );
}

export function OnboardingGate({children}:{children:ReactNode}){
  const runtime=useLearnerCourseRuntime();
  const navigate=useNavigate();
  const location=useLocation();
  const [done,setDone]=useState(()=>onboardingStoredDone());

  // Account/sign-in remains reachable from the app header even before onboarding.
  if(location.pathname==='/account')return <>{children}</>;

  if(runtime.status==='error')return <>{children}</>;

  if(runtime.status==='pending'){
    return (
      <section className="onboarding onboarding-loading">
        <div className="learn-state" role="status">
          <strong>{useI18n().t('today.loadingTitle')}</strong>
          <span>{useI18n().t('today.loadingText')}</span>
        </div>
      </section>
    );
  }

  if(!shouldShowOnboarding(done,runtime.state))return <>{children}</>;

  const finish=(startLesson:boolean)=>{
    markOnboardingDone();
    setDone(true);
    trackOnboardingComplete();
    const nodeId=runtime.state?.currentNode?.id;
    if(startLesson&&nodeId){
      navigate('/learn/'+encodeURIComponent(nodeId));
      return;
    }
    navigate('/');
  };

  return (
    <OnboardingView
      onDone={()=>finish(true)}
      onSkip={()=>finish(false)}
    />
  );
}
