import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { isNodeUnlockedByPurchase } from './content/access';
import type { CourseSet, RoadmapNode } from './content/schema';
import { LexiconText } from './lexicon-ui';
import { COURSE_STAGES, stageNameKey, type CourseStage } from './course-stages';
import { localizedText, nodeMinutes, nodeTopic } from './today-model';
import { Icon, type IconName } from './icons';
import { Sheet } from './sheet';
import { CoursePicker } from './active-course';

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

function statusKey(status:CourseMapStatus):string{
  if(status==='complete')return 'courseMap.statusComplete';
  if(status==='current')return 'courseMap.statusCurrent';
  if(status==='available')return 'courseMap.statusAvailable';
  if(status==='purchase-locked')return 'courseMap.statusPurchaseLocked';
  return 'courseMap.statusPrerequisiteLocked';
}

export type StationKind='lesson'|'review'|'dialogue'|'ai'|'finish';

/** What a day looks like on the line: transfer (review), landmark (dialogue), mic (AI talk), flag (last day). */
export function stationOf(set:CourseSet,node:RoadmapNode,isLast:boolean,locale:string):{kind:StationKind;special:string}{
  const activities=node.activityIds.map(id=>set.activities.find(activity=>activity.id===id));
  const dialogue=activities.find(activity=>activity?.type==='dialogue');
  if(dialogue?.type==='dialogue')return {kind:'dialogue',special:localizedText(dialogue.scene,locale)};
  const talk=activities.find(activity=>activity?.type==='ai-conversation');
  if(talk?.type==='ai-conversation')return {kind:'ai',special:localizedText(talk.topic,locale)};
  if(node.kind==='review')return {kind:'review',special:''};
  return {kind:isLast?'finish':'lesson',special:''};
}

const KIND_ICON:Partial<Record<StationKind,IconName>>={dialogue:'chat',ai:'mic',finish:'flag'};

interface Station extends CourseMapItem {
  kind:StationKind;
  title:string;
  label:string;
}

interface StageGroup {
  stage:CourseStage|null;
  stations:Station[];
  done:number;
}

function Ring({value,total,tone}:{value:number;total:number;tone:'success'|'accent'|'locked'}){
  const size=44;
  const stroke=4;
  const radius=(size-stroke)/2;
  const length=2*Math.PI*radius;
  const part=total?value/total:0;
  return (
    <span className={'ring ring-'+tone} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={stroke} />
        {value>0&&<circle className="ring-value" cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${length*part} ${length}`} />}
      </svg>
      <span>{value}/{total}</span>
    </span>
  );
}

export function CourseMapView({
  runtime,
  onOpen,
  onUnlock
}:{
  runtime:LearnerCourseRuntimeValue;
  /** `fromSheet`: the station sheet is open; navigate with replace so Back skips it. */
  onOpen:(nodeId:string,fromSheet?:boolean)=>void;
  onUnlock:(nodeId:string,fromSheet?:boolean)=>void;
}){
  const {t,locale}=useI18n();
  const state=runtime.state;

  const groups=useMemo<StageGroup[]>(()=>{
    if(!state)return [];
    const items=buildCourseMapItems(state);
    const lastId=items[items.length-1]?.node.id;
    const stations:Station[]=items.map(item=>{
      const {kind,special}=stationOf(state.set,item.node,item.node.id===lastId,locale);
      const topic=nodeTopic(state.set,item.node,locale);
      const title=kind==='dialogue'
        ? t('courseMap.stationDialogue',{title:special})
        : kind==='ai'
          ? t('courseMap.stationTalk',{title:special})
          : kind==='review'
            ? t('courseMap.stationReview')
            : topic;
      const day=item.node.dayIndex;
      const label=day?t('today.day',{day}):localizedText(item.node.title,locale);
      return {...item,kind,title,label};
    });
    const result:StageGroup[]=COURSE_STAGES.map(stage=>({stage,stations:[],done:0}));
    const rest:StageGroup={stage:null,stations:[],done:0};
    for(const station of stations){
      const day=station.node.dayIndex??0;
      const group=result.find(item=>item.stage&&day>=item.stage.fromDay&&day<=item.stage.toDay)??rest;
      group.stations.push(station);
      if(station.status==='complete')group.done++;
    }
    return [...result,rest].filter(group=>group.stations.length>0);
  },[state,locale,t]);

  const currentGroup=groups.find(group=>group.stations.some(station=>station.status==='current'))
    ?? groups.find(group=>group.done<group.stations.length)
    ?? groups[groups.length-1];
  const groupId=(group:StageGroup)=>group.stage?.id??'more';
  const currentId=currentGroup?groupId(currentGroup):null;
  const [open,setOpen]=useState<Set<string>>(()=>new Set());
  const [selected,setSelected]=useState<Station|null>(null);
  const sections=useRef(new Map<string,HTMLElement>());
  const currentRef=useRef<HTMLLIElement|null>(null);
  const placed=useRef(false);

  // Open the map where the learner is: expand that stage once the course is known, then
  // scroll the "you are here" station into view (only the first time).
  useEffect(()=>{
    if(!currentId||placed.current)return;
    setOpen(previous=>new Set(previous).add(currentId));
  },[currentId]);
  useEffect(()=>{
    if(placed.current||!currentId||!open.has(currentId))return;
    placed.current=true;
    currentRef.current?.scrollIntoView?.({block:'center'});
  },[currentId,open]);

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

  if(runtime.status==='error'||!state){
    return (
      <section className="course-map-shell">
        <div className="learn-state" role="alert">
          <strong>{t('courseMap.errorTitle')}</strong>
          <button className="primary-button" type="button" onClick={()=>void runtime.refresh()}>
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  const firstLocked=groups.flatMap(group=>group.stations).find(station=>station.status==='purchase-locked')?.node.id??null;
  const previewDays=state.set.access.mode==='entitlement'
    ? state.set.access.freePreview?.days ?? 0
    : 0;
  const stageName=(group:StageGroup)=>group.stage?t(stageNameKey(group.stage)):t('courseMap.moreStage');
  const toggle=(id:string)=>setOpen(previous=>{
    const next=new Set(previous);
    if(next.has(id))next.delete(id);
    else next.add(id);
    return next;
  });
  const jump=(group:StageGroup)=>{
    const id=groupId(group);
    setOpen(previous=>new Set(previous).add(id));
    requestAnimationFrame(()=>sections.current.get(id)?.scrollIntoView?.({behavior:'smooth',block:'start'}));
  };

  return (
    <section className="course-map-shell" aria-labelledby="course-map-title">
      <header className="screen-head">
        <div className="screen-kicker">
          {currentGroup?.stage
            ? t('courseMap.kicker',{stage:currentGroup.stage.number,stages:COURSE_STAGES.length,complete:state.roadmapProgress.completedCount,total:state.roadmapProgress.requiredCount})
            : t('courseMap.progress',{complete:state.roadmapProgress.completedCount,total:state.roadmapProgress.requiredCount})}
        </div>
        <div className="screen-title-row">
          <h2 id="course-map-title">{t('courseMap.title')}</h2>
          {state.fromCache&&<span className="today-badge">{t('today.offline')}</span>}
        </div>
        <CoursePicker currentId={state.set.id} />
      </header>

      {groups.length>1&&(
        <nav className="stage-chips" aria-label={t('courseMap.stages')}>
          {groups.map(group=>{
            const complete=group.done===group.stations.length;
            const current=group===currentGroup;
            return (
              <button
                key={groupId(group)}
                className={'stage-chip pressable'+(current?' is-current':'')}
                type="button"
                aria-current={current?'step':undefined}
                onClick={()=>jump(group)}
              >
                {complete?<Icon name="check" size={14} />:group.stage&&<span className="stage-chip-number">{group.stage.number}</span>}
                {stageName(group)}
              </button>
            );
          })}
        </nav>
      )}

      {state.access==='preview'&&previewDays>0&&(
        <div className="course-map-preview" role="note">
          <strong>{t('courseMap.previewTitle',{days:previewDays})}</strong>
          <span>{t('courseMap.previewText',{day:previewDays+1})}</span>
        </div>
      )}

      <div className="stages">
        {groups.map(group=>{
          const id=groupId(group);
          const expanded=open.has(id);
          const total=group.stations.length;
          const locked=group.stations.every(station=>station.status==='purchase-locked');
          const tone=group.done===total?'success':locked?'locked':'accent';
          const first=group.stations[0]?.node.dayIndex;
          const last=group.stations[total-1]?.node.dayIndex;
          // Locked days arrive without content, so their title is just "День N": list real topics only.
          const topics=group.stations
            .filter(station=>(station.kind==='lesson'||station.kind==='finish')&&station.title!==station.label)
            .map(station=>station.title);
          return (
            <section
              key={id}
              className={'stage'+(expanded?' is-open':'')}
              ref={element=>{ if(element)sections.current.set(id,element); }}
              aria-labelledby={'stage-'+id}
            >
              <button className="stage-head pressable" type="button" aria-expanded={expanded} onClick={()=>toggle(id)}>
                <Ring value={group.done} total={total} tone={tone} />
                <span className="stage-head-text">
                  <span className="stage-name" id={'stage-'+id}>{group.stage?group.stage.number+' · ':''}{stageName(group)}</span>
                  <span className="stage-sub">
                    {first&&last?t('courseMap.days',{from:first,to:last}):''}
                    {topics.length?' · '+topics.slice(0,3).join(', ')+(topics.length>3?'…':''):''}
                  </span>
                </span>
                <Icon name="chevron" size={18} className="stage-chevron" />
              </button>

              {expanded&&(
                <ol className="line" aria-label={t('courseMap.stageDays',{stage:stageName(group)})}>
                  {group.stations.map((station,index)=>{
                    const isLast=index===total-1;
                    const next=group.stations[index+1];
                    const solid=station.status==='complete'&&(next?next.status==='complete'||next.status==='current':true);
                    return (
                      <Fragment key={station.node.id}>
                      {station.node.id===firstLocked&&(
                        <li className="turnstile">
                          <span className="turnstile-icon" aria-hidden="true"><Icon name="lock" size={18} /></span>
                          <span className="turnstile-text">{t('courseMap.turnstile')}</span>
                          <button className="secondary-button turnstile-action" type="button" onClick={()=>onUnlock(station.node.id)}>
                            {t('courseMap.unlock')}
                          </button>
                        </li>
                      )}
                      <li
                        ref={station.status==='current'?currentRef:undefined}
                        className={'station station-'+station.kind+' is-'+station.status+(solid?' rail-solid':'')+(isLast?' is-last':'')}
                        style={{'--i':index} as CSSProperties}
                        aria-current={station.status==='current'?'step':undefined}
                      >
                        <span className="station-marker" aria-hidden="true">
                          {station.status==='complete'&&station.kind==='lesson'
                            ? <Icon name="check" size={14} />
                            : station.status==='purchase-locked'
                              ? <Icon name="lock" size={14} />
                              : KIND_ICON[station.kind]?<Icon name={KIND_ICON[station.kind]!} size={18} />:null}
                        </span>
                        <button
                          className="station-body"
                          type="button"
                          onClick={()=>setSelected(station)}
                          aria-label={[station.label,station.title===station.label?'':station.title,t(statusKey(station.status))].filter(Boolean).join(', ')}
                        >
                          <span className="station-day">
                            {station.label}
                            {station.status==='current'&&<span className="here-pill">{t('courseMap.here')}</span>}
                          </span>
                          {station.title!==station.label&&<span className="station-title"><LexiconText text={station.title} /></span>}
                          {station.status==='available'&&<span className="station-status">{t(statusKey(station.status))}</span>}
                        </button>
                        {station.status==='current'&&station.canOpen&&(
                          <button className="primary-button station-go" type="button" onClick={()=>onOpen(station.node.id)}>
                            <Icon name="play" size={16} />
                            {t('courseMap.open')}
                          </button>
                        )}
                      </li>
                      </Fragment>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <Sheet
        open={Boolean(selected)}
        onClose={()=>setSelected(null)}
        labelledBy="station-sheet-title"
        closeLabel={t('dictionary.close')}
      >
        {selected&&(
          <div className="station-sheet">
            <div className="screen-kicker">
              {selected.label}
              {selected.status==='complete'||selected.status==='current'||selected.status==='available'?' · '+t(statusKey(selected.status)):''}
            </div>
            <h3 id="station-sheet-title"><LexiconText text={selected.title} /></h3>
            {selected.node.activityIds.length>0&&(
              <p className="tile-meta">{t('courseMap.sheetMeta',{count:selected.node.activityIds.length,minutes:nodeMinutes(state.set,selected.node)})}</p>
            )}
            {selected.status==='prerequisite-locked'&&<p className="tile-text">{t('courseMap.prerequisiteHint')}</p>}
            {selected.status==='purchase-locked'&&<p className="tile-text">{t('courseMap.purchaseHint')}</p>}
            {selected.canOpen&&(
              <button className="primary-button" type="button" onClick={()=>onOpen(selected.node.id,true)}>
                {selected.status==='complete'?t('courseMap.reopen'):t('courseMap.open')}
              </button>
            )}
            {selected.status==='purchase-locked'&&(
              <button className="primary-button" type="button" onClick={()=>onUnlock(selected.node.id,true)}>
                {t('courseMap.unlock')}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}

export function CourseMapScreen(){
  const navigate=useNavigate();
  return (
    <CourseMapView
      runtime={useLearnerCourseRuntime()}
      onOpen={(nodeId,fromSheet)=>navigate('/learn/'+encodeURIComponent(nodeId),{replace:Boolean(fromSheet)})}
      onUnlock={(nodeId,fromSheet)=>navigate('/access?from=course&node='+encodeURIComponent(nodeId),{replace:Boolean(fromSheet)})}
    />
  );
}
