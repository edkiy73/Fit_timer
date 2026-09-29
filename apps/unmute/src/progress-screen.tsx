import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { activitySaveClock } from './activity-progress';
import { dayNumberFromKey } from './engine/course-progress';
import { summarizeAnswerStats, type AnswerStatsSummary } from './engine/learner-stats';
import {
  WORD_PROGRESS_DOC,
  statsProgressDoc,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';
import { appDocs, readStatsProgress, readWordsProgress } from './sync';

const STATS_QUERY_KEY='progress-screen-stats';
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
  todayDay:number
):ProgressSummary{
  const progress=state.progress;
  const cards=liveValues(progress.cards);
  const drill=liveValues(progress.practice.drill);
  const listening=liveValues(progress.practice.listening);
  const speaking=liveValues(progress.practice.speaking);
  const wordItems=liveValues(words.items);
  const learningDays=liveValues(progress.learningDays).length;
  const answers=summarizeAnswerStats(stats);
  const dueNow=[
    ...cards,
    ...drill,
    ...listening,
    ...speaking,
    ...wordItems
  ].filter(item=>Number.isFinite(item.due)&&item.due<=todayDay).length;
  const speed=metricAverage(progress.metrics,'speed:');
  const dialogue=metricAverage(progress.metrics,'dialogue-score:');
  const activeReviews=cards.length+drill.length+listening.length+speaking.length+wordItems.length;
  const seen=liveValues(progress.seen).length;

  return {
    completedDays:state.roadmapProgress.completedCount,
    requiredDays:state.roadmapProgress.requiredCount,
    learningDays,
    streak:currentLearningStreak(progress,todayDay),
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
      learningDays>0||
      seen>0||
      activeReviews>0||
      answers.attempts>0||
      speed.samples>0||
      dialogue.samples>0||
      state.roadmapProgress.completedCount>0
  };
}

function useProgressDetails(setId:string):ProgressDetailsRuntime{
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

function MetricCard({value,label,detail}:{value:string;label:string;detail?:string}){
  return (
    <article className="progress-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {detail&&<small>{detail}</small>}
    </article>
  );
}

export function ProgressView({
  runtime,
  details,
  todayDay,
  onExit
}:{
  runtime:LearnerCourseRuntimeValue;
  details:ProgressDetailsRuntime;
  todayDay:number;
  onExit:()=>void;
}){
  const {t}=useI18n();

  if(runtime.status==='pending'||details.status==='pending'){
    return (
      <section className="progress-shell">
        <div className="learn-state" role="status">
          <strong>{t('progress.loadingTitle')}</strong>
          <span>{t('progress.loadingText')}</span>
        </div>
      </section>
    );
  }

  if(runtime.status==='error'||details.status==='error'){
    return (
      <section className="progress-shell">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
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

  if(!runtime.state||!details.stats||!details.words)return null;
  const summary=buildProgressSummary(runtime.state,details.stats,details.words,todayDay);

  return (
    <section className="progress-shell" aria-labelledby="progress-title">
      <div className="learn-header">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
      </div>
      <div>
        <div className="eyebrow">{t('progress.eyebrow')}</div>
        <h2 id="progress-title">{t('progress.title')}</h2>
      </div>

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
          <div className="progress-overview">
            <MetricCard
              value={summary.completedDays+'/'+summary.requiredDays}
              label={t('progress.courseDays')}
            />
            <MetricCard
              value={String(summary.learningDays)}
              label={t('progress.learningDays')}
            />
            <MetricCard
              value={String(summary.streak)}
              label={t('progress.streak')}
              detail={summary.streak>0?t('progress.streakHint'):t('progress.streakPaused')}
            />
          </div>

          <article className="progress-section">
            <div className="progress-section-head">
              <div>
                <div className="eyebrow">{t('progress.courseEyebrow')}</div>
                <h3>{t('progress.courseTitle')}</h3>
              </div>
              <strong>{summary.completedDays}/{summary.requiredDays}</strong>
            </div>
            <progress
              className="today-progress"
              max={Math.max(1,summary.requiredDays)}
              value={summary.completedDays}
              aria-label={t('progress.courseTitle')}
            />
          </article>

          <article className="progress-section">
            <div className="progress-section-head">
              <div>
                <div className="eyebrow">{t('progress.reviewEyebrow')}</div>
                <h3>{t('progress.reviewTitle')}</h3>
              </div>
              <strong>{summary.activeReviews}</strong>
            </div>
            {summary.activeReviews>0 ? (
              <>
                <div className="progress-mini-grid">
                  <MetricCard value={String(summary.dueNow)} label={t('progress.dueNow')} />
                  <MetricCard value={String(summary.activeCards)} label={t('progress.cards')} />
                  <MetricCard value={String(summary.words)} label={t('progress.words')} />
                </div>
                <div className="progress-practice-row">
                  <span>{t('progress.drill')}: <strong>{summary.drill}</strong></span>
                  <span>{t('progress.listening')}: <strong>{summary.listening}</strong></span>
                  <span>{t('progress.speaking')}: <strong>{summary.speaking}</strong></span>
                </div>
              </>
            ) : (
              <p className="progress-muted">{t('progress.reviewEmpty')}</p>
            )}
          </article>

          <article className="progress-section">
            <div className="progress-section-head">
              <div>
                <div className="eyebrow">{t('progress.answersEyebrow')}</div>
                <h3>{t('progress.answersTitle')}</h3>
              </div>
              {summary.answers.attempts>0&&<strong>{summary.answers.accuracy}%</strong>}
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
                <div>
                  <div className="eyebrow">{t('progress.performanceEyebrow')}</div>
                  <h3>{t('progress.performanceTitle')}</h3>
                </div>
              </div>
              <div className="progress-mini-grid">
                {summary.speedAverage!==null&&(
                  <MetricCard
                    value={summary.speedAverage+'%'}
                    label={t('progress.speedLatest')}
                    detail={t('progress.samples',{count:summary.speedSamples})}
                  />
                )}
                {summary.dialogueAverage!==null&&(
                  <MetricCard
                    value={summary.dialogueAverage+'%'}
                    label={t('progress.dialogueLatest')}
                    detail={t('progress.samples',{count:summary.dialogueSamples})}
                  />
                )}
              </div>
              <p className="progress-muted">{t('progress.latestNote')}</p>
            </article>
          )}
        </>
      )}
    </section>
  );
}

export function ProgressScreen(){
  const runtime=useLearnerCourseRuntime();
  const details=useProgressDetails(runtime.state?.set.id??'');
  const navigate=useNavigate();
  return (
    <ProgressView
      runtime={runtime}
      details={details}
      todayDay={activitySaveClock().dayNumber}
      onExit={()=>navigate('/')}
    />
  );
}
