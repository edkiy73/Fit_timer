import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { countDays } from './plural';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import type { WordReviewRuntimeValue } from './word-review-runtime';
import { useWordReviewRuntime } from './word-review-runtime';
import { reviewDueCounts } from './review-count';
import { LexiconText } from './lexicon-ui';
import { activitySaveClock } from './activity-progress';
import { currentLearningStreak } from './progress-screen';
import { stageForDay, stageNameKey } from './course-stages';
import { Icon } from './icons';
import { Sheet } from './sheet';
import { speakText } from './speech-runtime';
import type { RecordMap } from '@appbase/core/document-sync.js';
import type { TimedFlag } from './progress';
import { useAllLearningDays, withAllLearningDays } from './learning-days';
import { useOtherCourseReviews, type OtherCourseReview } from './other-course-review';
import { UpdateBanner } from './app-update';
import type { CourseSet, RoadmapNode } from './content/schema';
import {
  lastWeekActivity,
  localizedText,
  nextLandmark,
  nodeDoneCount,
  nodeMinutes,
  nodeSpeakExamples,
  nodeSpeakTask,
  nodeTopic
} from './today-model';

const DAY_MS = 86_400_000;

/** Bento tile; `--i` staggers the entrance (switched off under reduced motion). */
function Tile({className, index, children, label}:{className:string; index:number; children:ReactNode; label?:string}){
  return (
    <article className={'tile ' + className} style={{'--i':index} as CSSProperties} aria-label={label}>
      {children}
    </article>
  );
}

function Skeleton(){
  const {t} = useI18n();
  return (
    <div className="bento" role="status">
      <span className="sr-only">{t('today.loadingTitle')}</span>
      <div className="tile tile-hero skeleton" aria-hidden="true" />
      <div className="tile skeleton" aria-hidden="true" />
      <div className="tile skeleton" aria-hidden="true" />
      <div className="tile tile-wide tile-short skeleton" aria-hidden="true" />
    </div>
  );
}

/** The day's phrase pattern that can be practised out loud, if any. */
function speakPatternId(set:CourseSet,node:RoadmapNode):string|null{
  const byId=new Map(set.activities.map(activity=>[activity.id,activity]));
  for(const id of node.activityIds){
    const activity=byId.get(id);
    if(activity?.type==='pattern-drill'&&activity.modes.includes('speaking'))return activity.id;
  }
  return null;
}

export function TodayView({
  runtime,
  wordRuntime=null,
  onStart,
  onSpeak=(nodeId:string)=>onStart(nodeId),
  onReview,
  onMap,
  onAccess,
  todayDay=activitySaveClock().dayNumber,
  learningDays=null,
  otherCourses=[]
}:{
  runtime:LearnerCourseRuntimeValue;
  wordRuntime?:WordReviewRuntimeValue|null;
  onStart:(nodeId:string)=>void;
  /** «Скажи вслух»: the day's phrases in speaking mode, or the day itself when it has none. */
  onSpeak?:(nodeId:string,patternId:string|null)=>void;
  onReview:()=>void;
  onMap:()=>void;
  onAccess:()=>void;
  todayDay?:number;
  /** Days with practice in every course (the streak is the learner's, not the course's). */
  learningDays?:RecordMap<TimedFlag>|null;
  /** Studied courses other than the active one: their due items count toward review. */
  otherCourses?:OtherCourseReview[];
}){
  const {t,locale}=useI18n();
  const [speakOpen,setSpeakOpen]=useState(false);
  const state=runtime.state;
  const review=reviewDueCounts(state,wordRuntime,locale,todayDay,otherCourses);
  const dateLabel=new Intl.DateTimeFormat(locale,{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})
    .format(new Date(todayDay*DAY_MS));
  const weekdayLabel=new Intl.DateTimeFormat(locale,{weekday:'narrow',timeZone:'UTC'});

  const heading=(
    <header className="screen-head">
      <div className="screen-kicker">{dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1)}</div>
      <div className="screen-title-row">
        <h2 id="today-title">{t('today.title')}</h2>
        {state?.fromCache && <span className="today-badge">{t('today.offline')}</span>}
      </div>
    </header>
  );

  if(runtime.status==='pending'){
    return <section className="today" aria-labelledby="today-title">{heading}<Skeleton /></section>;
  }

  if(runtime.status==='error'||!state){
    return (
      <section className="today" aria-labelledby="today-title">
        {heading}
        <div className="tile today-state" role="alert">
          <strong>{t('today.errorTitle')}</strong>
          <span>{t('today.errorText')}</span>
          <button className="primary-button" type="button" onClick={()=>void runtime.refresh()}>
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  const node=state.currentNode;
  const complete=state.roadmapProgress.courseComplete;
  const allDays=withAllLearningDays(state.progress,learningDays);
  const streak=currentLearningStreak(allDays,todayDay);
  const week=lastWeekActivity(allDays,todayDay);
  const hasReview=Boolean(review&&review.actionableCount>0);
  const courseProgress=(
    <span className="today-course" aria-label={t('today.courseProgress')}>
      {state.roadmapProgress.completedCount}/{state.roadmapProgress.requiredCount}
    </span>
  );
  let index=0;

  let hero:ReactNode;
  if(complete){
    hero=(
      <Tile className="tile-hero" index={index++}>
        <div className="tile-top">
          <span className="chip"><LexiconText text={localizedText(state.set.title,locale)} /></span>
          {courseProgress}
        </div>
        <h3>{t('today.completeTitle')}</h3>
        <p className="tile-text">{t('today.completeText')}</p>
      </Tile>
    );
  }else if(node){
    const done=nodeDoneCount(state.progress,node);
    const total=node.activityIds.length;
    const stage=stageForDay(node.dayIndex,state.set.id);
    hero=(
      <Tile className="tile-hero" index={index++}>
        <div className="tile-top">
          <span className="chip">
            <span>{node.dayIndex?t('today.day',{day:node.dayIndex}):t('today.nextStep')}</span>
            {stage&&<span className="chip-soft">{t(stageNameKey(stage))}</span>}
          </span>
          {courseProgress}
        </div>
        <h3><LexiconText text={nodeTopic(state.set,node,locale)} /></h3>
        <div
          className="today-meter"
          role="progressbar"
          aria-label={t('today.dayProgress')}
          aria-valuemin={0}
          aria-valuemax={Math.max(1,total)}
          aria-valuenow={done}
        >
          <span style={{'--p':total?done/total:0} as CSSProperties} />
        </div>
        <p className="tile-meta">
          {t('today.dayMeta',{done,total,minutes:nodeMinutes(state.set,node)})}
        </p>
        <button className="primary-button today-start" type="button" onClick={()=>onStart(node.id)}>
          <Icon name="play" size={18} />
          {done>0?t('today.continue'):t('today.start')}
        </button>
      </Tile>
    );
  }else{
    const preview=state.access==='preview'&&Boolean(state.roadmapProgress.currentNode);
    hero=(
      <Tile className="tile-hero" index={index++}>
        <div className="tile-top">
          <span className="chip"><Icon name="lock" size={16} />{t('today.locked')}</span>
          {courseProgress}
        </div>
        <h3>{preview?t('today.previewCompleteTitle'):t('today.blockedTitle')}</h3>
        <p className="tile-text">{preview?t('today.previewCompleteText'):t('today.blockedText')}</p>
        <div className="today-state-actions">
          {preview&&(
            <button className="primary-button" type="button" onClick={onAccess}>{t('today.openAccess')}</button>
          )}
          <button className="secondary-button" type="button" onClick={onMap}>{t('today.courseMap')}</button>
        </div>
      </Tile>
    );
  }

  const speakTask=node&&!complete?nodeSpeakTask(state.set,node,locale):null;
  const speakExamples=node&&speakTask?nodeSpeakExamples(state.set,node,locale):[];
  const landmark=node&&!complete?nextLandmark(state.set,state.roadmap,node,locale):null;

  return (
    <section className="today" aria-labelledby="today-title">
      {heading}
      <UpdateBanner />
      <div className="bento">
        {hero}

        <Tile className="tile-streak" index={index++}>
          <div className="tile-kicker tone-streak"><Icon name="flame" size={18} />{t('today.streak')}</div>
          <strong className="tile-number">{t('today.streakDays',{count:streak})}</strong>
          {!streak&&<span className="tile-caption">{t('today.streakStart')}</span>}
          <div className="week" aria-label={t('today.week',{count:week.filter(Boolean).length})}>
            {week.map((active,day)=>(
              <span key={day} className={'week-day'+(active?' is-active':'')} aria-hidden="true">
                <span className="week-dot" />
                {weekdayLabel.format(new Date((todayDay-6+day)*DAY_MS))}
              </span>
            ))}
          </div>
        </Tile>

        {/* Always shown and as short as «Серия»: the whole tile starts the review when
            something is due, so there is no extra button stretching the row. */}
        {hasReview&&review ? (
          <button className="tile tile-review is-due pressable" style={{'--i':index++} as CSSProperties} type="button" onClick={onReview}
            aria-label={t('today.reviewStart')+': '+review.actionableCount}>
            <span className="tile-kicker tone-listen"><Icon name="review" size={18} />{t('nav.review')}</span>
            <strong className="tile-number">{review.actionableCount}</strong>
            <span className="tile-caption">{t('today.reviewCaption')}</span>
            <span className="tile-link">{t('today.reviewStart')} →</span>
            {review.waitingCount>0&&<span className="sr-only">{t('today.reviewWaiting',{count:review.waitingCount})}</span>}
          </button>
        ) : (
          <Tile className="tile-review" index={index++}>
            <div className="tile-kicker tone-listen"><Icon name="review" size={18} />{t('nav.review')}</div>
            <strong className="tile-number">0</strong>
            <span className="tile-caption">{t('today.reviewEmpty')}</span>
          </Tile>
        )}

        {speakTask&&node&&(
          <button className="tile tile-wide tile-speak pressable" style={{'--i':index++} as CSSProperties} type="button" onClick={()=>setSpeakOpen(true)}>
            <span className="mic-soft" aria-hidden="true"><Icon name="mic" /></span>
            <span className="tile-speak-body">
              <span className="tile-title">{t('today.speakTitle')}</span>
              <span className="tile-text">{speakTask}</span>
              <span className="tile-link">{t('today.speakOpen')}</span>
            </span>
          </button>
        )}

        {landmark&&(
          <button className="tile tile-wide tile-landmark pressable" style={{'--i':index++} as CSSProperties} type="button" onClick={onMap}>
            <span className={'landmark-icon landmark-'+landmark.kind} aria-hidden="true">
              <Icon name={landmark.kind==='dialogue'?'chat':landmark.kind==='ai'?'mic':'review'} size={20} />
            </span>
            <span className="landmark-body">
              <span className="tile-title">
                {landmark.kind==='review'
                  ? t('today.landmarkReview')
                  : t(landmark.kind==='dialogue'?'today.landmarkDialogue':'today.landmarkTalk',{title:landmark.title})}
              </span>
              <span className="tile-caption">{t('today.landmarkWhen',{day:landmark.dayIndex,days:countDays(t,locale,landmark.inDays)})}</span>
            </span>
            <Icon name="chevron" size={20} className="landmark-chevron" />
          </button>
        )}
      </div>

      {speakTask&&node&&(
        <Sheet open={speakOpen} onClose={()=>setSpeakOpen(false)} labelledBy="speak-sheet-title" closeLabel={t('learn.theoryClose')}>
          <div className="speak-sheet">
            <div className="screen-kicker">{t('today.speakKicker')}</div>
            <h3 id="speak-sheet-title">{t('today.speakTitle')}</h3>
            <p className="speak-task"><LexiconText text={speakTask} /></p>
            <p className="tile-text">{t('today.speakHow')}</p>
            {speakExamples.length>0&&(
              <ul className="speak-examples" aria-label={t('today.speakExamples')}>
                {speakExamples.map(example=>(
                  <li key={example}>
                    <button className="speak-play pressable" type="button" aria-label={t('today.speakListen',{text:example})} onClick={()=>void speakText(example,'en-US')}>
                      <Icon name="speaker" size={18} />
                    </button>
                    <span lang="en"><LexiconText text={example} /></span>
                  </li>
                ))}
              </ul>
            )}
            <button className="primary-button" type="button" onClick={()=>{ setSpeakOpen(false); onSpeak(node.id,speakPatternId(state.set,node)); }}>
              {t('today.speakStart')}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

export function TodayScreen(){
  const navigate=useNavigate();
  const runtime=useLearnerCourseRuntime();
  const otherCourses=useOtherCourseReviews(runtime.state?.set.id??'');
  return (
    <TodayView
      runtime={runtime}
      otherCourses={otherCourses.courses}
      wordRuntime={useWordReviewRuntime()}
      learningDays={useAllLearningDays()}
      onStart={nodeId=>navigate('/learn/'+encodeURIComponent(nodeId))}
      onSpeak={(nodeId,patternId)=>navigate('/learn/'+encodeURIComponent(nodeId)+(patternId?'?activity='+encodeURIComponent(patternId)+'&mode=speaking':''))}
      onReview={()=>navigate('/review')}
      onMap={()=>navigate('/course')}
      onAccess={()=>navigate('/access?from=today')}
    />
  );
}
