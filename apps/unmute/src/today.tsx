import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';

function localized(text:Record<string,string>,locale:string):string{
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export function TodayView({runtime}:{runtime:LearnerCourseRuntimeValue}){
  const {t,locale}=useI18n();
  const state=runtime.state;

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
  return <TodayView runtime={useLearnerCourseRuntime()} />;
}
