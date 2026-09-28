import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { loadCatalog, loadSet, type ContentRoadmapOutlineNode } from './content/client';
import type { Activity, CourseSet, RoadmapNode } from './content/schema';
import { buildRoadmapProgress } from './engine/course-progress';
import { learningCalendarFromDocument, roadmapProgressFromDocument } from './progress-actions';
import { courseProgressDoc, emptyCourseProgress, type CourseProgressDocument } from './progress';
import { appDocs, readCourseProgress } from './sync';

export type CourseNodeStatus='done'|'current'|'open'|'future'|'locked';

export interface CourseNodeView{
  outline:ContentRoadmapOutlineNode;
  actual?:RoadmapNode;
  status:CourseNodeStatus;
}

export interface CourseViewModel{
  nodes:CourseNodeView[];
  current:CourseNodeView|null;
  nextLocked:CourseNodeView|null;
  completedCount:number;
  totalRequired:number;
  streak:number;
  courseComplete:boolean;
}

export function localizedText(value:Record<string,string>|undefined,locale:string):string{
  if(!value)return '';
  const short=locale.toLowerCase().split('-')[0]||locale;
  return value[locale]||value[short]||value.ru||value.en||Object.values(value)[0]||'';
}

function live(record:{deleted?:boolean}|undefined):boolean{
  return Boolean(record&&!record.deleted);
}

export function activityDone(activity:Activity,progress:CourseProgressDocument):boolean{
  if(activity.type==='pattern-drill'){
    return activity.modes.every(mode=>{
      const state=progress.practice[mode][activity.id];
      return Boolean(state&&!state.deleted&&state.box>0);
    });
  }
  return live(progress.seen[activity.id]);
}

export function buildCourseView(
  set:CourseSet,
  outlineRoadmap:{id:string;nodes:ContentRoadmapOutlineNode[]}|undefined,
  access:'full'|'preview',
  progress:CourseProgressDocument
):CourseViewModel{
  const roadmap=set.roadmaps.find(item=>item.id===set.defaultRoadmapId);
  const outlineNodes=(outlineRoadmap?.nodes||roadmap?.nodes||[])
    .slice()
    .sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const actualById=new Map((roadmap?.nodes||[]).map(node=>[node.id,node]));
  const summary=roadmap
    ? buildRoadmapProgress(roadmap,roadmapProgressFromDocument(progress))
    : null;
  const progressById=new Map((summary?.nodes||[]).map(item=>[item.node.id,item]));
  const currentId=summary?.currentNode?.id||null;

  const nodes:CourseNodeView[]=outlineNodes.map(outline=>{
    const actual=actualById.get(outline.id);
    const item=progressById.get(outline.id);
    let status:CourseNodeStatus;
    if(!actual){
      status=access==='preview'?'locked':'future';
    }else if(item?.complete){
      status='done';
    }else if(outline.id===currentId){
      status='current';
    }else if(item?.unlocked){
      status='open';
    }else{
      status='future';
    }
    return actual?{outline,actual,status}:{outline,status};
  });

  const current=nodes.find(node=>node.status==='current')
    || nodes.find(node=>node.status==='open')
    || null;
  const nextLocked=nodes.find(node=>node.status==='locked')||null;
  const calendar=learningCalendarFromDocument(progress);
  return {
    nodes,
    current,
    nextLocked,
    completedCount:nodes.filter(node=>node.status==='done'&&!node.outline.optional).length,
    totalRequired:nodes.filter(node=>!node.outline.optional).length,
    streak:calendar.streak,
    courseComplete:access==='full'&&Boolean(summary?.courseComplete),
  };
}

function useCourseBundle(){
  const auth=useOptionalAuth();
  const queryClient=useQueryClient();
  const catalog=useQuery({
    queryKey:['unmute','content','catalog'],
    queryFn:loadCatalog,
  });
  const setId=catalog.data?.sets.find(item=>item.id==='general-foundation')?.id
    || catalog.data?.sets[0]?.id
    || '';
  const entitlementKey=auth.session
    ? auth.session.email+':'+(auth.session.owned||[]).slice().sort().join(',')
    : 'guest';
  const contentQuery=useQuery({
    queryKey:['unmute','content','set',setId,entitlementKey],
    queryFn:()=>loadSet(setId),
    enabled:Boolean(setId)&&!auth.loading,
  });
  const progress=useQuery({
    queryKey:['unmute','progress','course',setId],
    queryFn:()=>readCourseProgress(setId),
    enabled:Boolean(setId),
  });

  useEffect(()=>{
    if(!setId)return;
    const key=courseProgressDoc(setId);
    return appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key===key)){
        void queryClient.invalidateQueries({queryKey:['unmute','progress','course',setId]});
      }
    });
  },[queryClient,setId]);

  const set=contentQuery.data?.set;
  const outline=set
    ? contentQuery.data?.outline.find(item=>item.id===set.defaultRoadmapId)
    : undefined;
  const progressDoc=progress.data||emptyCourseProgress();
  const view=set&&contentQuery.data
    ? buildCourseView(set,outline,contentQuery.data.access,progressDoc)
    : null;

  return {auth,catalog,setId,content:contentQuery,progress,set,outline,progressDoc,view};
}

function CourseState({children}:{children:(bundle:ReturnType<typeof useCourseBundle>)=>ReactNode}){
  const bundle=useCourseBundle();
  const {t}=useI18n();
  if(bundle.catalog.isLoading||bundle.content.isLoading||bundle.progress.isLoading){
    return <section className="course-state"><div className="course-spinner" aria-hidden="true" /><p>{t('course.loading')}</p></section>;
  }
  if(bundle.catalog.isError||bundle.content.isError||bundle.progress.isError){
    return <section className="course-state course-state-error"><h2>{t('course.errorTitle')}</h2><p>{t('course.errorText')}</p></section>;
  }
  if(!bundle.setId||!bundle.set||!bundle.content.data||!bundle.view){
    return <section className="course-state"><h2>{t('course.emptyTitle')}</h2><p>{t('course.emptyText')}</p></section>;
  }
  return <>{children(bundle)}</>;
}

function ProgressLine({value,max}:{value:number;max:number}){
  const pct=max?Math.max(0,Math.min(100,Math.round(value/max*100))):0;
  return <div className="course-progress" aria-label={value+' / '+max}><span style={{width:pct+'%'}} /></div>;
}

export function Today(){
  const {t,locale}=useI18n();
  return <CourseState>{bundle=>{
    const {set,view,content:contentQuery}=bundle;
    if(!set||!view||!contentQuery.data)return null;
    const current=view.current;
    const locked=!current&&!view.courseComplete?view.nextLocked:null;
    return (
      <div className="course-page">
        <section className="course-hero">
          <div className="course-hero-top">
            <div>
              <div className="eyebrow">{localizedText(set.title,locale)}</div>
              <h2>{t('today.title')}</h2>
            </div>
            <div className="streak-pill" title={t('today.streak')}>
              <span aria-hidden="true">◆</span>{view.streak}
            </div>
          </div>
          <ProgressLine value={view.completedCount} max={view.totalRequired} />
          <div className="course-progress-copy">{t('today.progress')} {view.completedCount}/{view.totalRequired}</div>
          {contentQuery.data.fromCache&&<div className="offline-pill">{t('course.cached')}</div>}
        </section>

        {current&&(
          <section className="today-card">
            <div className="day-badge">{current.outline.dayIndex?t('course.day')+' '+current.outline.dayIndex:t('course.next')}</div>
            <h3>{localizedText(current.outline.title,locale)}</h3>
            <p>{current.outline.kind==='review'?t('today.reviewDay'):t('today.continueText')}</p>
            <Link className="primary-action" to={'/day/'+encodeURIComponent(current.outline.id)}>{t('today.continue')}</Link>
          </section>
        )}

        {locked&&(
          <section className="today-card locked-card">
            <div className="lock-icon" aria-hidden="true">◇</div>
            <div className="day-badge">{locked.outline.dayIndex?t('course.day')+' '+locked.outline.dayIndex:t('course.next')}</div>
            <h3>{t('today.previewComplete')}</h3>
            <p>{t('today.previewText')}</p>
            <Link className="secondary-action" to="/map">{t('today.openMap')}</Link>
          </section>
        )}

        {view.courseComplete&&(
          <section className="today-card">
            <div className="day-badge">{t('today.completeBadge')}</div>
            <h3>{t('today.courseComplete')}</h3>
            <p>{t('today.courseCompleteText')}</p>
            <Link className="secondary-action" to="/map">{t('today.openMap')}</Link>
          </section>
        )}

        <Link className="course-map-link" to="/map">
          <span><strong>{t('map.title')}</strong><small>{t('map.subtitle')}</small></span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }}</CourseState>;
}

export function CourseMap(){
  const {t,locale}=useI18n();
  return <CourseState>{bundle=>{
    const {set,view}=bundle;
    if(!set||!view)return null;
    return (
      <div className="course-page">
        <section className="page-heading">
          <div className="eyebrow">{localizedText(set.title,locale)}</div>
          <h2>{t('map.title')}</h2>
          <p>{t('map.subtitle')}</p>
          <ProgressLine value={view.completedCount} max={view.totalRequired} />
        </section>
        <div className="roadmap" role="list">
          {view.nodes.map(node=>{
            const label=node.outline.dayIndex?t('course.day')+' '+node.outline.dayIndex:localizedText(node.outline.title,locale);
            const body=(
              <>
                <span className={'roadmap-marker status-'+node.status} aria-hidden="true">
                  {node.status==='done'?'✓':node.status==='locked'?'◇':node.outline.dayIndex||'•'}
                </span>
                <span className="roadmap-copy">
                  <small>{label}</small>
                  <strong>{localizedText(node.outline.title,locale)}</strong>
                  <em>{t('map.status.'+node.status)}</em>
                </span>
              </>
            );
            return node.status==='locked'
              ? <div className="roadmap-node roadmap-node-locked" role="listitem" key={node.outline.id}>{body}</div>
              : <Link className={'roadmap-node roadmap-node-'+node.status} role="listitem" key={node.outline.id} to={'/day/'+encodeURIComponent(node.outline.id)}>{body}</Link>;
          })}
        </div>
      </div>
    );
  }}</CourseState>;
}

function activityLabel(activity:Activity,t:(key:string)=>string):string{
  const key:Record<Activity['type'],string>={
    theory:'activity.theory',
    choice:'activity.exercise',
    'text-input':'activity.exercise',
    translation:'activity.translation',
    speaking:'activity.speaking',
    'pattern-drill':'activity.practice',
    dialogue:'activity.dialogue',
    listening:'activity.listening',
    review:'activity.review',
    'ai-conversation':'activity.ai',
  };
  return t(key[activity.type]);
}

function activityTitle(activity:Activity,locale:string,t:(key:string)=>string):string{
  if(activity.title)return localizedText(activity.title,locale);
  if(activity.type==='choice'||activity.type==='text-input'||activity.type==='translation'||activity.type==='speaking'){
    return localizedText(activity.prompt,locale);
  }
  if(activity.type==='pattern-drill')return localizedText(activity.pattern,locale);
  if(activity.type==='dialogue')return localizedText(activity.scene,locale);
  if(activity.type==='ai-conversation')return localizedText(activity.topic,locale);
  return activityLabel(activity,t);
}

export function CourseDay(){
  const {nodeId=''}=useParams();
  const {t,locale}=useI18n();
  return <CourseState>{bundle=>{
    const {set,view,progressDoc}=bundle;
    if(!set||!view)return null;
    const nodeView=view.nodes.find(node=>node.outline.id===nodeId);
    if(!nodeView)return <section className="course-state"><h2>{t('day.notFound')}</h2><Link to="/map">{t('nav.map')}</Link></section>;
    if(nodeView.status==='locked'||!nodeView.actual){
      return (
        <div className="course-page">
          <Link className="back-link" to="/map">{t('nav.back')}</Link>
          <section className="today-card locked-card">
            <div className="lock-icon" aria-hidden="true">◇</div>
            <div className="day-badge">{nodeView.outline.dayIndex?t('course.day')+' '+nodeView.outline.dayIndex:''}</div>
            <h2>{t('day.locked')}</h2>
            <p>{t('day.lockedText')}</p>
          </section>
        </div>
      );
    }
    const activities=nodeView.actual.activityIds
      .map(id=>set.activities.find(activity=>activity.id===id))
      .filter((activity):activity is Activity=>Boolean(activity));
    return (
      <div className="course-page">
        <Link className="back-link" to="/map">{t('nav.back')}</Link>
        <section className="page-heading">
          <div className="day-badge">{nodeView.outline.dayIndex?t('course.day')+' '+nodeView.outline.dayIndex:t('course.section')}</div>
          <h2>{localizedText(nodeView.outline.title,locale)}</h2>
          <p>{nodeView.outline.kind==='review'?t('today.reviewDay'):t('day.subtitle')}</p>
        </section>
        <div className="activity-list">
          {activities.map((activity,index)=>{
            const done=activityDone(activity,progressDoc);
            return (
              <div className={'activity-row'+(done?' is-done':'')} key={activity.id}>
                <span className="activity-index">{done?'✓':index+1}</span>
                <span className="activity-copy">
                  <small>{activityLabel(activity,t)}</small>
                  <strong>{activityTitle(activity,locale,t)}</strong>
                </span>
              </div>
            );
          })}
        </div>
        {!activities.length&&<section className="course-state"><p>{t('day.noActivities')}</p></section>}
        <p className="foundation-note">{t('day.foundationNote')}</p>
      </div>
    );
  }}</CourseState>;
}
