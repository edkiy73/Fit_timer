import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { isNodeUnlockedByPurchase } from './content/access';
import type { RoadmapNode } from './content/schema';

export type CourseMapStatus=
  |'complete'
  |'current'
  |'available'
  |'prerequisite-locked'
  |'purchase-locked';

export interface CourseMapItem {
  node:RoadmapNode;
  status:CourseMapStatus;
  canOpen:boolean;
}

function localized(text:Record<string,string>,locale:string):string{
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export function buildCourseMapItems(state:LearnerCourseState):CourseMapItem[]{
  return state.roadmapProgress.nodes.map(progress=>{
    const purchaseUnlocked=isNodeUnlockedByPurchase(
      state.set,
      progress.node,
      {owned:state.access==='full'}
    );
    const canOpen=purchaseUnlocked&&progress.unlocked&&progress.node.activityIds.length>0;

    let status:CourseMapStatus;
    if(progress.complete)status='complete';
    else if(!purchaseUnlocked)status='purchase-locked';
    else if(!progress.unlocked)status='prerequisite-locked';
    else if(state.currentNode?.id===progress.node.id)status='current';
    else status='available';

    return {node:progress.node,status,canOpen};
  });
}

function statusText(status:CourseMapStatus,t:(key:string,vars?:Record<string,unknown>)=>string):string{
  if(status==='complete')return t('courseMap.statusComplete');
  if(status==='current')return t('courseMap.statusCurrent');
  if(status==='available')return t('courseMap.statusAvailable');
  if(status==='purchase-locked')return t('courseMap.statusPurchaseLocked');
  return t('courseMap.statusPrerequisiteLocked');
}

export function CourseMapView({
  runtime,
  onExit,
  onOpen
}:{
  runtime:LearnerCourseRuntimeValue;
  onExit:()=>void;
  onOpen:(nodeId:string)=>void;
}){
  const {t,locale}=useI18n();

  if(runtime.status==='pending'){
    return (
      <section className="course-map-shell">
        <div className="learn-state" role="status">
          <strong>{t('courseMap.loadingTitle')}</strong>
          <span>{t('courseMap.loadingText')}</span>
        </div>
      </section>
    );
  }

  if(runtime.status==='error'){
    return (
      <section className="course-map-shell">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
        <div className="learn-state" role="alert">
          <strong>{t('courseMap.errorTitle')}</strong>
          <button className="primary-button" type="button" onClick={()=>void runtime.refresh()}>
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  const state=runtime.state;
  if(!state)return null;
  const items=buildCourseMapItems(state);
  const previewDays=state.set.access.mode==='entitlement'
    ? state.set.access.freePreview?.days ?? 0
    : 0;

  return (
    <section className="course-map-shell" aria-labelledby="course-map-title">
      <div className="learn-header">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
        <span>{t('courseMap.progress',{
          complete:state.roadmapProgress.completedCount,
          total:state.roadmapProgress.requiredCount
        })}</span>
      </div>

      <div className="course-map-heading">
        <div>
          <div className="eyebrow">{localized(state.set.title,locale)}</div>
          <h2 id="course-map-title">{t('courseMap.title')}</h2>
        </div>
        {state.fromCache&&<span className="today-badge">{t('today.offline')}</span>}
      </div>

      {state.access==='preview'&&previewDays>0&&(
        <div className="course-map-preview" role="note">
          <strong>{t('courseMap.previewTitle',{days:previewDays})}</strong>
          <span>{t('courseMap.previewText',{day:previewDays+1})}</span>
        </div>
      )}

      <div className="course-map-list">
        {items.map(item=>{
          const day=item.node.dayIndex;
          const label=day?t('today.day',{day}):localized(item.node.title,locale);
          return (
            <article
              className={'course-map-node course-map-node-'+item.status}
              data-status={item.status}
              key={item.node.id}
              aria-current={item.status==='current'?'step':undefined}
            >
              <div className="course-map-marker" aria-hidden="true">
                {item.status==='complete'?'✓':day??'•'}
              </div>
              <div className="course-map-node-body">
                <div className="course-map-node-top">
                  <span className="course-map-day">{label}</span>
                  <span className="course-map-status">{statusText(item.status,t)}</span>
                </div>
                <strong>{localized(item.node.title,locale)}</strong>
                {item.status==='purchase-locked'&&(
                  <span className="course-map-note">{t('courseMap.purchaseHint')}</span>
                )}
                {item.status==='prerequisite-locked'&&(
                  <span className="course-map-note">{t('courseMap.prerequisiteHint')}</span>
                )}
              </div>
              {item.canOpen&&(
                <button
                  className={item.status==='current'?'primary-button course-map-open':'secondary-button course-map-open'}
                  type="button"
                  onClick={()=>onOpen(item.node.id)}
                >
                  {item.status==='complete'?t('courseMap.reopen'):t('courseMap.open')}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function CourseMapScreen(){
  const navigate=useNavigate();
  return (
    <CourseMapView
      runtime={useLearnerCourseRuntime()}
      onExit={()=>navigate('/')}
      onOpen={nodeId=>navigate('/learn/'+encodeURIComponent(nodeId))}
    />
  );
}
