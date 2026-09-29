import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { activitySaveClock } from './activity-progress';
import { buildCourseReviewSession } from './review-session';
import type { WordReviewRuntimeValue } from './word-review-runtime';
import { useWordReviewRuntime } from './word-review-runtime';
import { resolveWordReviewSession } from './word-review';

function localized(text:Record<string,string>,locale:string):string{
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export function TodayView({runtime,wordRuntime=null,onStart,onReview}:{runtime:LearnerCourseRuntimeValue;wordRuntime?:WordReviewRuntimeValue|null;onStart:(nodeId:string)=>void;onReview:()=>void}){
  const {t,locale}=useI18n();
  const state=runtime.state;
  const todayDay=activitySaveClock().dayNumber;
  const courseReview=state
    ? buildCourseReviewSession(state.set,state.progress,todayDay)
    : null;
  const wordReview=wordRuntime?.status==='ready'&&wordRuntime.words&&wordRuntime.lexicon
    ? resolveWordReviewSession(wordRuntime.words,wordRuntime.lexicon,todayDay,locale)
    : null;
  const review=courseReview
    ? {
        actionableCount:courseReview.actionableCount+(wordReview?.items.length??0),
        waitingCount:courseReview.waitingCount+(wordReview?.waiting??0)
      }
    : null;
  const currentNode=state?.currentNode;
  const nodeStarted=Boolean(state&&currentNode&&currentNode.activityIds.some(id=>{
    const seen=state.progress.seen[id];
    if(seen&&!seen.deleted)return true;
    return (['drill','listening','speaking'] as const).some(mode=>{
      const item=state.progress.practice[mode][id];
      return Boolean(item&&!item.deleted);
    });
  }));

  return (
    <section className="today" aria-labelledby="today-title">
      <div className="today-heading">
        <div>
          <div className="eyebrow">{t('today.eyebrow')}</div>
          <h2 id="today-title">{t('today.title')}</h2>
        </div>
        {state?.fromCache && <span className="today-badge">{t('today.offline')}</span>}
      </div>

      {runtime.status==='pending' && (
        <div className="today-state" role="status">
          <strong>{t('today.loadingTitle')}</strong>
          <span>{t('today.loadingText')}</span>
        </div>
      )}

      {runtime.status==='error' && (
        <div className="today-state today-state-error" role="alert">
          <strong>{t('today.errorTitle')}</strong>
          <span>{t('today.errorText')}</span>
          <button className="primary-button" type="button" onClick={()=>void runtime.refresh()}>
            {t('today.retry')}
          </button>
        </div>
      )}

      {runtime.status==='ready' && review && review.actionableCount>0 && (
        <article className="today-review">
          <div>
            <div className="today-kicker">{t('review.eyebrow')}</div>
            <strong>{t('today.reviewDue',{count:review.actionableCount})}</strong>
            {review.waitingCount>0&&(
              <span>{t('today.reviewWaiting',{count:review.waitingCount})}</span>
            )}
          </div>
          <button className="primary-button" type="button" onClick={onReview}>
            {t('today.reviewStart')}
          </button>
        </article>
      )}

      {runtime.status==='ready' && state?.roadmapProgress.courseComplete && (
        <div className="today-state today-complete">
          <div className="today-kicker">{localized(state.set.title,locale)}</div>
          <h3>{t('today.completeTitle')}</h3>
          <p>{t('today.completeText')}</p>
          <div className="today-progress-label">
            <span>{t('today.courseProgress')}</span>
            <strong>{state.roadmapProgress.completedCount}/{state.roadmapProgress.requiredCount}</strong>
          </div>
          <progress
            className="today-progress"
            max={Math.max(1,state.roadmapProgress.requiredCount)}
            value={state.roadmapProgress.completedCount}
            aria-label={t('today.courseProgress')}
          />
        </div>
      )}

      {runtime.status==='ready' && state && !state.roadmapProgress.courseComplete && state.currentNode && (
        <article className="today-card">
          <div className="today-card-top">
            <div>
              <div className="today-kicker">{localized(state.set.title,locale)}</div>
              <div className="today-day">
                {state.currentDayIndex
                  ? t('today.day',{day:state.currentDayIndex})
                  : t('today.nextStep')}
              </div>
            </div>
            <span className="today-count">
              {t('today.activities',{count:state.currentNode.activityIds.length})}
            </span>
          </div>

          <h3>{localized(state.currentNode.title,locale)}</h3>

          <div className="today-progress-label">
            <span>{t('today.courseProgress')}</span>
            <strong>{state.roadmapProgress.completedCount}/{state.roadmapProgress.requiredCount}</strong>
          </div>
          <progress
            className="today-progress"
            max={Math.max(1,state.roadmapProgress.requiredCount)}
            value={state.roadmapProgress.completedCount}
            aria-label={t('today.courseProgress')}
          />
          <button
            className="primary-button today-start"
            type="button"
            onClick={()=>onStart(state.currentNode!.id)}
          >
            {nodeStarted?t('today.continue'):t('today.start')}
          </button>
        </article>
      )}

      {runtime.status==='ready' && state && !state.roadmapProgress.courseComplete && !state.currentNode && (
        <div className="today-state" role="status">
          <strong>{t('today.blockedTitle')}</strong>
          <span>{t('today.blockedText')}</span>
        </div>
      )}
    </section>
  );
}

export function TodayScreen(){
  const navigate=useNavigate();
  return (
    <TodayView
      runtime={useLearnerCourseRuntime()}
      wordRuntime={useWordReviewRuntime()}
      onStart={nodeId=>navigate('/learn/'+encodeURIComponent(nodeId))}
      onReview={()=>navigate('/review')}
    />
  );
}
