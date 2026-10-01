import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ActivityCalendar } from './activity-calendar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { activitySaveClock } from './activity-progress';
import { loadLearnerCourse } from './course-loader';
import { dayNumberFromKey } from './engine/course-progress';
import { summarizeAnswerStats, type AnswerStatsSummary } from './engine/learner-stats';
import {
  WORD_PROGRESS_DOC,
  courseProgressDoc,
  statsProgressDoc,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';
import { appDocs, readStatsProgress, readWordsProgress } from './sync';
import type { RecordMap } from '@appbase/core/document-sync.js';
import type { TimedFlag } from './progress';
import { withAllLearningDays } from './learning-days';
import { Loader } from './loader';
import { Icon, type IconName } from './icons';
import { Sheet } from './sheet';
import { CourseOptionList } from './active-course';
import type { ContentCatalogSet } from './content/client';

const STATS_QUERY_KEY='progress-screen-stats';
const COURSE_QUERY_KEY='progress-screen-course';
const WORDS_QUERY_KEY='progress-screen-words';

export interface ProgressDetailsRuntime {
  stats:StatsProgressDocument|null;
  words:WordsProgressDocument|null;
  status:'pending'|'ready'|'error';
  error:unknown;
  refresh:()=>Promise<void>;
}

export interface ProgressSummary {
  completedDays:number;
  requiredDays:number;
  learningDays:number;
  streak:number;
  activeCards:number;
  drill:number;
  listening:number;
  speaking:number;
  words:number;
  activeReviews:number;
  dueNow:number;
  answers:AnswerStatsSummary;
  speedAverage:number|null;
  speedSamples:number;
  dialogueAverage:number|null;
  dialogueSamples:number;
  hasActivity:boolean;
}

function liveValues<T extends {deleted?:boolean}>(records:Record<string,T|undefined>):T[]{
  return Object.values(records).filter((value):value is T=>Boolean(value&&!value.deleted));
}

function metricAverage(
  metrics:LearnerCourseState['progress']['metrics'],
  prefix:string
):{average:number|null;samples:number}{
  const values=Object.entries(metrics)
    .filter(([key,value])=>key.startsWith(prefix)&&Boolean(value&&!value.deleted))
    .map(([,value])=>value!.value)
    .filter(Number.isFinite);
  if(!values.length)return {average:null,samples:0};
  return {
    average:Math.round(values.reduce((sum,value)=>sum+value,0)/values.length),
    samples:values.length
  };
}

export function currentLearningStreak(
  state:LearnerCourseState['progress'],
  todayDay:number
):number{
  const days=Object.entries(state.learningDays)
    .filter(([,value])=>Boolean(value&&!value.deleted))
    .map(([key])=>{
      try{return dayNumberFromKey(key);}catch{return null;}
    })
    .filter((value):value is number=>value!==null)
    .sort((a,b)=>a-b);

  if(!days.length)return 0;
  const last=days[days.length-1]!;
  if(todayDay-last>1)return 0;

  let streak=1;
  for(let index=days.length-1;index>0;index--){
    const current=days[index]!;
    const previous=days[index-1]!;
    if(current-previous!==1)break;
    streak++;
  }
  return streak;
}

export function buildProgressSummary(
  state:LearnerCourseState,
  stats:StatsProgressDocument,
  words:WordsProgressDocument,
  todayDay:number,
  learningDays:RecordMap<TimedFlag>|null=null
):ProgressSummary{
  const progress=state.progress;
  const allDays=withAllLearningDays(progress,learningDays);
  const cards=liveValues(progress.cards);
  const drill=liveValues(progress.practice.drill);
  const listening=liveValues(progress.practice.listening);
  const speaking=liveValues(progress.practice.speaking);
  const wordItems=liveValues(words.items);
  const learningDayCount=liveValues(allDays.learningDays).length;
  const answers=summarizeAnswerStats(stats);
  const dueNow=[
    ...cards,
    ...drill,
    ...listening,
    ...speaking
  ].filter(item=>Number.isFinite(item.due)&&item.due<=todayDay).length;
  const speed=metricAverage(progress.metrics,'speed:');
  const dialogue=metricAverage(progress.metrics,'dialogue-score:');
  const activeReviews=cards.length+drill.length+listening.length+speaking.length;
  const seen=liveValues(progress.seen).length;

  return {
    completedDays:state.roadmapProgress.completedCount,
    requiredDays:state.roadmapProgress.requiredCount,
    learningDays:learningDayCount,
    streak:currentLearningStreak(allDays,todayDay),
    activeCards:cards.length,
    drill:drill.length,
    listening:listening.length,
    speaking:speaking.length,
    words:wordItems.length,
    activeReviews,
    dueNow,
    answers,
    speedAverage:speed.average,
    speedSamples:speed.samples,
    dialogueAverage:dialogue.average,
    dialogueSamples:dialogue.samples,
    hasActivity:
      learningDayCount>0||
      seen>0||
      activeReviews>0||
      answers.attempts>0||
      speed.samples>0||
      dialogue.samples>0||
      state.roadmapProgress.completedCount>0
  };
}

export function useProgressCourseRuntime(setId:string):LearnerCourseRuntimeValue{
  const queryClient=useQueryClient();
  const query=useQuery({
    queryKey:[COURSE_QUERY_KEY,setId],
    queryFn:()=>loadLearnerCourse(setId),
    enabled:setId.length>0,
    staleTime:Infinity
  });
  useEffect(()=>{
    if(!setId)return;
    const key=courseProgressDoc(setId);
    return appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key===key)){
        void queryClient.invalidateQueries({queryKey:[COURSE_QUERY_KEY,setId],exact:true});
      }
    });
  },[queryClient,setId]);
  const refresh=useCallback(async()=>{
    await queryClient.invalidateQueries({queryKey:[COURSE_QUERY_KEY,setId],exact:true});
  },[queryClient,setId]);
  return {
    state:query.data??null,
    status:query.isError?'error':query.data?'ready':'pending',
    error:query.error??null,
    refresh
  };
}

export function useProgressDetails(setId:string):ProgressDetailsRuntime{
  const queryClient=useQueryClient();
  const statsQuery=useQuery({
    queryKey:[STATS_QUERY_KEY,setId],
    queryFn:()=>readStatsProgress(setId),
    enabled:setId.length>0,
    staleTime:Infinity
  });
  const wordsQuery=useQuery({
    queryKey:[WORDS_QUERY_KEY],
    queryFn:readWordsProgress,
    staleTime:Infinity
  });

  useEffect(()=>{
    if(!setId)return;
    const statsKey=statsProgressDoc(setId);
    return appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key===statsKey)){
        void queryClient.invalidateQueries({queryKey:[STATS_QUERY_KEY,setId],exact:true});
      }
      if(change.keys.some(ref=>ref.key===WORD_PROGRESS_DOC)){
        void queryClient.invalidateQueries({queryKey:[WORDS_QUERY_KEY],exact:true});
      }
    });
  },[queryClient,setId]);

  const refresh=useCallback(async()=>{
    await Promise.all([
      queryClient.invalidateQueries({queryKey:[STATS_QUERY_KEY,setId],exact:true}),
      queryClient.invalidateQueries({queryKey:[WORDS_QUERY_KEY],exact:true})
    ]);
  },[queryClient,setId]);

  const error=statsQuery.error??wordsQuery.error??null;
  const status:ProgressDetailsRuntime['status']=error
    ? 'error'
    : statsQuery.data&&wordsQuery.data
      ? 'ready'
      : 'pending';

  return {
    stats:statsQuery.data??null,
    words:wordsQuery.data??null,
    status,
    error,
    refresh
  };
}

function MetricCard({
  value,
  label,
  icon,
  tone='accent'
}:{
  value:string;
  label:string;
  icon:IconName;
  tone?:'accent'|'success'|'listen';
}){
  return (
    <div className={'progress-metric is-'+tone}>
      <span className="progress-metric-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ProgressView({
  runtime,
  details,
  todayDay,
  onExit,
  learningDays=null,
  embedded=false,
  courses=[],
  courseSets=[],
  selectedCourseId='',
  onCourseChange
}:{
  runtime:LearnerCourseRuntimeValue;
  details:ProgressDetailsRuntime;
  todayDay:number;
  onExit:()=>void;
  learningDays?:RecordMap<TimedFlag>|null;
  /** Inside Profile: no back button or page title, the screen already has them. */
  embedded?:boolean;
  courses?:Array<{id:string;label:string}>;
  courseSets?:ContentCatalogSet[];
  selectedCourseId?:string;
  onCourseChange?:(id:string)=>void;
}){
  const {t}=useI18n();
  const [courseSheetOpen,setCourseSheetOpen]=useState(false);
  const back=embedded?null:<button className="learn-back" type="button" onClick={onExit}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>;

  if(runtime.status==='error'||details.status==='error'){
    return (
      <section className="progress-shell">
        {back}
        <div className="learn-state" role="alert">
          <strong>{t('progress.errorTitle')}</strong>
          <button
            className="primary-button"
            type="button"
            onClick={()=>void Promise.all([runtime.refresh(),details.refresh()])}
          >
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  if(runtime.status==='pending'||details.status==='pending'){
    return (
      <section className="progress-shell">
        <Loader title={t('progress.loadingTitle')} className={embedded?'is-compact':''} />
      </section>
    );
  }

  if(!runtime.state||!details.stats||!details.words)return null;
  const summary=buildProgressSummary(runtime.state,details.stats,details.words,todayDay,learningDays);

  const coursePercent=summary.requiredDays>0
    ? Math.min(100,Math.round((summary.completedDays/summary.requiredDays)*100))
    : 0;
  const selectedCourse=courses.find(course=>course.id===selectedCourseId)?.label??runtime.state.set.id;
  const currentStage=runtime.state.currentDayIndex!==null
    ? t('progress.currentDay',{current:runtime.state.currentDayIndex,total:summary.requiredDays})
    : t('progress.courseComplete');

  return (
    <section className="progress-shell" aria-label={t('progress.title')}>
      {!summary.hasActivity ? (
        <div className="learn-state progress-empty">
          <strong>{t('progress.emptyTitle')}</strong>
          <span>{t('progress.emptyText')}</span>
          <button className="primary-button" type="button" onClick={onExit}>
            {t('progress.backToday')}
          </button>
        </div>
      ) : (
        <>
          <article className="progress-dashboard progress-general">
            <div className="progress-dashboard-head">
              <div>
                <h3>{t('progress.generalTitle')}</h3>
                <p>{t('progress.generalLead')}</p>
              </div>
            </div>

            <div className="progress-general-metrics">
              <MetricCard value={String(summary.learningDays)} label={t('progress.learningDays')} icon="book" tone="accent" />
              <MetricCard value={String(summary.streak)} label={t('progress.streak')} icon="flame" tone="success" />
            </div>

            <ActivityCalendar
              learningDays={runtime.state?withAllLearningDays(runtime.state.progress,learningDays).learningDays:null}
              todayDay={todayDay}
            />
          </article>

          <article className="progress-dashboard progress-course-dashboard">
            <div className="progress-dashboard-head progress-course-head">
              <div>
                <h3>{t('progress.courseTitle')}</h3>
              </div>
              {courses.length>1&&onCourseChange ? (
                <button
                  className="progress-course-picker pressable"
                  type="button"
                  onClick={()=>setCourseSheetOpen(true)}
                  aria-haspopup="dialog"
                >
                  <span>{selectedCourse}</span>
                  <Icon name="chevron" size={16} />
                </button>
              ) : (
                <p className="progress-course-name">{selectedCourse}</p>
              )}
            </div>

            <div className="progress-course-hero">
              <div
                className="progress-course-ring"
                style={{'--course-progress':coursePercent+'%'} as CSSProperties}
                role="img"
                aria-label={t('progress.coursePercent',{percent:coursePercent})}
              >
                <div>
                  <strong>{coursePercent}%</strong>
                  <span>{t('progress.courseProgress')}</span>
                </div>
              </div>

              <div className="progress-course-now">
                <span className="progress-eyebrow">{t('progress.currentStage')}</span>
                <strong>{currentStage}</strong>
                <div className="progress-course-track" aria-hidden="true">
                  <span style={{width:coursePercent+'%'}} />
                </div>
                <small>{t('progress.courseDaysValue',{done:summary.completedDays,total:summary.requiredDays})}</small>
              </div>
            </div>

            <div className="progress-course-kpis">
              <div>
                <span className="progress-kpi-icon is-review"><Icon name="review" size={18} /></span>
                <strong>{summary.dueNow}</strong>
                <span>{t('progress.dueNow')}</span>
              </div>
              <div>
                <span className="progress-kpi-icon is-card"><Icon name="book" size={18} /></span>
                <strong>{summary.activeCards}</strong>
                <span>{t('progress.cardsShort')}</span>
              </div>
              <div>
                <span className="progress-kpi-icon is-listen"><Icon name="speaker" size={18} /></span>
                <strong>{summary.listening}</strong>
                <span>{t('progress.listeningShort')}</span>
              </div>
              <div>
                <span className="progress-kpi-icon is-speak"><Icon name="mic" size={18} /></span>
                <strong>{summary.speaking}</strong>
                <span>{t('progress.speakingShort')}</span>
              </div>
            </div>

            <div className="progress-course-detail">
              <div className="progress-course-detail-head">
                <span>{t('progress.answersTitle')}</span>
                {summary.answers.attempts>0&&<strong>{t('progress.accuracy',{percent:summary.answers.accuracy})}</strong>}
              </div>
              {summary.answers.attempts>0 ? (
                <>
                  <div className="progress-answer-bar" aria-hidden="true">
                    <span style={{width:summary.answers.accuracy+'%'}} />
                  </div>
                  <div className="progress-answer-meta">
                    <span>{t('progress.correct')}: <strong>{summary.answers.correct}</strong></span>
                    <span>{t('progress.wrong')}: <strong>{summary.answers.wrong}</strong></span>
                    <span>{t('progress.attempts')}: <strong>{summary.answers.attempts}</strong></span>
                  </div>
                </>
              ) : <p className="progress-muted">{t('progress.answersEmpty')}</p>}
            </div>

            {(summary.drill>0||summary.speedAverage!==null||summary.dialogueAverage!==null)&&(
              <div className="progress-practice-panel">
                <div className="progress-practice-title">
                  <Icon name="progress" size={18}/>
                  <strong>{t('progress.practiceTitle')}</strong>
                </div>
                {summary.drill>0&&(
                  <div className="progress-practice-row">
                    <span>{t('progress.drill')}</span>
                    <strong>{summary.speedAverage!==null
                      ? t('progress.practiceSpeedValue',{count:summary.drill,percent:summary.speedAverage})
                      : t('progress.practiceCount',{count:summary.drill})}</strong>
                  </div>
                )}
                {summary.dialogueAverage!==null&&(
                  <div className="progress-practice-row">
                    <span>{t('progress.dialogueShort')}</span>
                    <strong>{t('progress.practiceDialogueValue',{count:summary.dialogueSamples,percent:summary.dialogueAverage})}</strong>
                  </div>
                )}
              </div>
            )}

            {courses.length>1&&onCourseChange&&(
              <Sheet
                open={courseSheetOpen}
                onClose={()=>setCourseSheetOpen(false)}
                labelledBy="progress-course-sheet-title"
                closeLabel={t('courses.close')}
              >
                <div className="courses-sheet">
                  <h3 id="progress-course-sheet-title">{t('progress.courseLabel')}</h3>
                  <CourseOptionList
                    sets={courseSets}
                    currentId={selectedCourseId}
                    onPick={id=>{
                      onCourseChange(id);
                      setCourseSheetOpen(false);
                    }}
                  />
                </div>
              </Sheet>
            )}
          </article>
        </>
      )}
    </section>
  );
}
