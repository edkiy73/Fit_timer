import { useCallback, useEffect } from 'react';
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
import { Icon } from './icons';

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

function MetricCard({value,label}:{value:string;label:string}){
  return (
    <article className="progress-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

/** One line of a section: what on the left, how much on the right — long labels wrap, nothing stretches. */
function StatRow({label,value,detail}:{label:string;value:string;detail?:string}){
  return (
    <li className="stat-row">
      <span>{label}{detail&&<small>{detail}</small>}</span>
      <strong>{value}</strong>
    </li>
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
  selectedCourseId?:string;
  onCourseChange?:(id:string)=>void;
}){
  const {t}=useI18n();
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

  return (
    <section className="progress-shell" aria-labelledby="progress-title">
      {embedded
        ? <h3 id="progress-title" className="section-title">{t('progress.title')}</h3>
        : <>
            <div className="learn-header">{back}</div>
            <h2 id="progress-title">{t('progress.title')}</h2>
          </>}

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
          <article className="progress-section progress-general">
            <div className="progress-section-head">
              <h3>{t('progress.generalTitle')}</h3>
            </div>
            <div className="progress-overview">
              <MetricCard value={String(summary.learningDays)} label={t('progress.learningDays')} />
              <MetricCard value={String(summary.streak)} label={t('progress.streak')} />
              <MetricCard value={String(summary.words)} label={t('progress.words')} />
            </div>
            <ActivityCalendar
              learningDays={runtime.state?withAllLearningDays(runtime.state.progress,learningDays).learningDays:null}
              todayDay={todayDay}
            />
          </article>

          <article className="progress-section progress-course-section">
            <div className="progress-section-head progress-course-head">
              <h3>{t('progress.courseTitle')}</h3>
              {courses.length>1&&onCourseChange&&(
                <label className="progress-course-picker">
                  <span className="sr-only">{t('progress.courseLabel')}</span>
                  <select value={selectedCourseId} onChange={event=>onCourseChange(event.target.value)}>
                    {courses.map(course=><option key={course.id} value={course.id}>{course.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="progress-overview">
              <MetricCard value={summary.completedDays+'/'+summary.requiredDays} label={t('progress.courseDays')} />
              <MetricCard value={String(summary.activeCards)} label={t('progress.cards')} />
              <MetricCard value={String(summary.dueNow)} label={t('progress.dueNow')} />
            </div>
            <div className="progress-practice-row">
              <span>{t('progress.drill')}: <strong>{summary.drill}</strong></span>
              <span>{t('progress.listening')}: <strong>{summary.listening}</strong></span>
              <span>{t('progress.speaking')}: <strong>{summary.speaking}</strong></span>
            </div>
          </article>

          <article className="progress-section">
            <div className="progress-section-head">
              <h3>{t('progress.answersTitle')}</h3>
              {summary.answers.attempts>0&&<strong>{t('progress.accuracy',{percent:summary.answers.accuracy})}</strong>}
            </div>
            {summary.answers.attempts>0 ? (
              <div className="progress-mini-grid">
                <MetricCard value={String(summary.answers.attempts)} label={t('progress.attempts')} />
                <MetricCard value={String(summary.answers.correct)} label={t('progress.correct')} />
                <MetricCard value={String(summary.answers.wrong)} label={t('progress.wrong')} />
              </div>
            ) : (
              <p className="progress-muted">{t('progress.answersEmpty')}</p>
            )}
          </article>

          {(summary.speedSamples>0||summary.dialogueSamples>0)&&(
            <article className="progress-section">
              <div className="progress-section-head">
                <h3>{t('progress.performanceTitle')}</h3>
              </div>
              <ul className="stat-list">
                {summary.speedAverage!==null&&(
                  <StatRow label={t('progress.speedLatest')} detail={t('progress.samples',{count:summary.speedSamples})} value={summary.speedAverage+'%'} />
                )}
                {summary.dialogueAverage!==null&&(
                  <StatRow label={t('progress.dialogueLatest')} detail={t('progress.samples',{count:summary.dialogueSamples})} value={summary.dialogueAverage+'%'} />
                )}
              </ul>
              <p className="progress-muted">{t('progress.latestNote')}</p>
            </article>
          )}
        </>
      )}
    </section>
  );
}
