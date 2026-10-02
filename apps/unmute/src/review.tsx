import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { checkAnswer } from './engine/answer-check';
import type { PracticeSrsKind } from './engine/practice-srs';
import {
  activitySaveClock,
  saveGradedActivity,
  saveManualNode,
  savePracticeActivity,
  saveSeenActivity
} from './activity-progress';
import { nodeTopic } from './today-model';
import {
  buildCourseReviewSession,
  type CourseReviewSession,
  type ReviewSessionItem
} from './review-session';
import type { SpeakText, StartRecognition } from './speech-runtime';
import { speakText, startRecognition as startSpeechRecognition } from './speech-runtime';
import { ENGLISH_SPEECH_LOCALE } from './speech-locale';
import { PatternDrillView } from './pattern-drill';
import { PatternListeningView } from './pattern-listening';
import { PatternSpeakingView } from './pattern-speaking';
import { saveWordReview } from './word-progress';
import type { WordReviewRuntimeValue } from './word-review-runtime';
import { useWordReviewRuntime } from './word-review-runtime';
import { resolveWordReviewSession, type ResolvedWordReviewItem } from './word-review';
import { buildMixedDrillActivity, studiedPatternActivities, MixedDrillView } from './mixed-drill';
import { LexiconText } from './lexicon-ui';
import { AnswerExplanationView } from './answer-explanation';
import { useOtherCourseReviews, type OtherCourseReviews } from './other-course-review';
import { MyWordsView } from './my-words';
import { Icon } from './icons';
import { Loader } from './loader';
import { reviewDueCounts } from './review-count';
import { randomSeed, shuffledIndices } from './shuffle';
import { WordChips, answerWords, buildChips, chipsText } from './word-chips';

type CardActivity=Extract<Activity,{type:'choice'|'text-input'|'translation'}>;
type CombinedReviewItem=
  |ReviewSessionItem
  |{kind:'word';word:ResolvedWordReviewItem};

interface PinnedReviewSession {
  course:CourseReviewSession;
  total:number;
  waiting:number;
  unresolvedWords:number;
  wordUnavailable:boolean;
}

function localized(text:Record<string,string>|undefined,locale:string):string{
  if(!text)return '';
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export interface ReviewViewProps {
  runtime:LearnerCourseRuntimeValue;
  onExit:()=>void;
  todayDay?:number;
  saveGraded:(setId:string,activityId:string,correct:boolean)=>Promise<void>;
  savePractice:(
    setId:string,
    activityId:string,
    mode:PracticeSrsKind,
    correct:boolean,
    score?:number
  )=>Promise<void>;
  wordRuntime?:WordReviewRuntimeValue|null;
  saveWord?:(lexemeId:string,senseId:string,correct:boolean)=>Promise<void>;
  onSignIn?:()=>void;
  onAccess?:()=>void;
  speak?:SpeakText;
  startRecognition?:StartRecognition;
  /** Due items from other studied courses (switching courses keeps them in review). */
  otherCourses?:OtherCourseReviews;
  /** Opened from a course review day: finishing the review counts that day. */
  completeDayId?:string;
  saveManual?:(setId:string,nodeId:string)=>Promise<void>;
  saveSeen?:(setId:string,activityId:string)=>Promise<void>;
}

const NO_OTHER_COURSES:OtherCourseReviews={status:'ready',courses:[]};

export function ReviewView({
  runtime,
  onExit,
  todayDay=activitySaveClock().dayNumber,
  saveGraded,
  savePractice,
  wordRuntime=null,
  saveWord=saveWordReview,
  onSignIn=()=>{},
  onAccess=()=>{},
  speak=speakText,
  startRecognition=startSpeechRecognition,
  otherCourses=NO_OTHER_COURSES,
  completeDayId,
  saveManual=saveManualNode,
  saveSeen=saveSeenActivity
}:ReviewViewProps){
  const {t,locale}=useI18n();
  const state=runtime.state;
  const [session,setSession]=useState<PinnedReviewSession|null>(null);
  const [queue,setQueue]=useState<CombinedReviewItem[]>([]);
  const [index,setIndex]=useState(0);
  const [completed,setCompleted]=useState(0);
  const [selected,setSelected]=useState<number|null>(null);
  const [shuffleSeed]=useState(()=>randomSeed());
  const [answer,setAnswer]=useState('');
  const [picked,setPicked]=useState<string[]>([]);
  const [result,setResult]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [wordShown,setWordShown]=useState(false);
  const [wordSaveError,setWordSaveError]=useState(false);
  const [mixedActivity,setMixedActivity]=useState<Extract<Activity,{type:'pattern-drill'}>|null>(null);
  const [started,setStarted]=useState(false);
  const [dayCounted,setDayCounted]=useState(false);

  useEffect(()=>{
    if(runtime.status!=='ready'||!state||session)return;
    if(wordRuntime?.status==='pending')return;
    if(otherCourses.status==='pending')return;

    const course=buildCourseReviewSession(state.set,state.progress,todayDay);
    const others=otherCourses.courses.map(other=>{
      const built=buildCourseReviewSession(other.set,other.progress,todayDay);
      return {...built,items:built.items.map(entry=>({...entry,setId:other.set.id}))};
    });
    const otherItems=others.flatMap(other=>other.items);
    const words=wordRuntime?.status==='ready'&&wordRuntime.words&&wordRuntime.lexicon
      ? resolveWordReviewSession(wordRuntime.words,wordRuntime.lexicon,todayDay,locale)
      : null;
    const wordItems=(words?.items??[]).map(word=>({kind:'word' as const,word}));
    setSession({
      course,
      total:course.actionableCount+otherItems.length+wordItems.length,
      waiting:course.waitingCount+others.reduce((sum,other)=>sum+other.waitingCount,0)+(words?.waiting??0),
      unresolvedWords:words?.unresolved??0,
      wordUnavailable:Boolean(wordRuntime&&wordRuntime.status==='error'),
    });
    setQueue([...course.items,...otherItems,...wordItems]);
  },[runtime.status,state?.set.id,session,todayDay,wordRuntime?.status,wordRuntime?.words,wordRuntime?.lexicon,locale,otherCourses]);

  useEffect(()=>{
    setSelected(null);
    setAnswer('');
    setPicked([]);
    setResult(null);
    setBusy(false);
    setWordShown(false);
    setWordSaveError(false);
  },[index]);

  const item=queue[index] ?? null;
  const total=session?.total ?? 0;

  const reviewChips=useMemo(()=>{
    if(item?.kind!=='card'||(item.activity.type!=='text-input'&&item.activity.type!=='translation'))return null;
    // Review is already recall for progressive cards. Only explicitly introductory "build" cards
    // keep the word bank when they become due.
    if((item.activity.responseMode??'progressive')!=='build')return null;
    const target=item.activity.answer.accepted[0]??'';
    if(!answerWords(target))return null;
    const itemSet=item.setId
      ? otherCourses.courses.find(other=>other.set.id===item.setId)?.set
      : state?.set;
    const otherAnswers=itemSet?.activities.flatMap(activity=>
      (activity.type==='text-input'||activity.type==='translation')&&activity.id!==item.activity.id
        ? [activity.answer.accepted[0]??'']
        : []
    )??[];
    return buildChips(shuffleSeed+'|review|'+item.activity.id+'|'+index,target,otherAnswers);
  },[item,index,otherCourses,state?.set,shuffleSeed]);

  // A review day counts once its review is through (or nothing was due).
  const reviewDayNode=completeDayId&&state?state.roadmap.nodes.find(node=>node.id===completeDayId)??null:null;
  const dayFinished=Boolean(reviewDayNode&&session&&(total===0||(started&&!item)));
  useEffect(()=>{
    if(!dayFinished||dayCounted||!state||!reviewDayNode)return;
    setDayCounted(true);
    const reviewActivity=reviewDayNode.activityIds.find(id=>state.set.activities.find(activity=>activity.id===id)?.type==='review');
    void (async()=>{
      if(reviewActivity)await saveSeen(state.set.id,reviewActivity);
      await saveManual(state.set.id,reviewDayNode.id);
      await runtime.refresh();
    })().catch(()=>setDayCounted(false));
  },[dayFinished,dayCounted,state?.set.id,reviewDayNode?.id]);

  // A running review is a focused run, like a lesson: the bottom bar hides (styles.css).
  const running=started&&item!==null;
  useEffect(()=>{
    if(!running||typeof document==='undefined')return;
    document.documentElement.dataset.focusRun='review';
    return ()=>{delete document.documentElement.dataset.focusRun;};
  },[running]);

  // Items answered wrong come back at once; the done screen offers them instead of «all clear».
  const restart=()=>{
    setSession(null);
    setQueue([]);
    setIndex(0);
    setCompleted(0);
    setStarted(true);
  };
  const mixedPatterns=state?studiedPatternActivities(state.set.activities,state.progress):[];
  const mixedAvailable=mixedPatterns.length>=3;

  const distractors=useMemo(
    ()=>state?.set.activities.flatMap(activity=>
      activity.type==='pattern-drill'
        ? activity.items.map(patternItem=>patternItem.prompt)
        : []
    ) ?? [],
    [state?.set.id]
  );

  if(runtime.status==='pending'||wordRuntime?.status==='pending'||(runtime.status==='ready'&&!session)){
    return (
      <section className="review-shell">
        <Loader title={t('review.loadingTitle')} />
      </section>
    );
  }

  if(runtime.status==='error'){
    return (
      <section className="review-shell">
        <button className="learn-back" type="button" onClick={onExit}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
        <div className="learn-state" role="alert">
          <strong>{t('review.errorTitle')}</strong>
          <button className="primary-button" type="button" onClick={()=>void runtime.refresh()}>
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  if(!state||!session)return null;

  if(mixedActivity){
    return (
      <section className="review-shell" aria-labelledby="review-title">
        <button className="learn-back" type="button" onClick={()=>setMixedActivity(null)}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
        <div>
          <div className="eyebrow">{t('review.eyebrow')}</div>
          <h2 id="review-title">{t('mixed.title')}</h2>
        </div>
        <MixedDrillView
          activity={mixedActivity}
          onDone={()=>setMixedActivity(null)}
        />
      </section>
    );
  }

  const startMixed=()=>{
    const mixed=buildMixedDrillActivity(state.set.activities,state.progress);
    if(mixed)setMixedActivity(mixed);
  };

  const mixedOffer=mixedAvailable ? (
    <article className="review-mixed-offer tile tile-wide">
      <div>
        <strong>{t('mixed.title')}</strong>
        <span>{t('mixed.description')}</span>
      </div>
      <button className="secondary-button" type="button" onClick={startMixed}>
        {t('mixed.start',{count:mixedPatterns.length})}
      </button>
    </article>
  ) : null;

  if(total===0){
    return (
      <section className="review-shell" aria-labelledby="review-title">
        <header className="screen-head">
          <div className="screen-kicker">{t('review.eyebrow')}</div>
          <h2 id="review-title">{t('review.title')}</h2>
        </header>
        {session.wordUnavailable ? (
          <>
            <div className="learn-state" role="alert">
              <strong>{t('review.wordsLoadTitle')}</strong>
              <span>{t('review.wordsLoadError')}</span>
              {wordRuntime&&(
                <button className="primary-button" type="button" onClick={()=>void wordRuntime.refresh()}>
                  {t('today.retry')}
                </button>
              )}
            </div>
            {mixedOffer}
          </>
        ) : (
          <>
            <div className="tile review-empty">
              <span className="review-ring is-clear" aria-hidden="true"><Icon name="check" size={28} /></span>
              <strong>{t('review.emptyTitle')}</strong>
              <span className="tile-text">{t('review.emptyText')}</span>
              {(otherCourses.failed??0)>0&&<span className="tile-text" role="status">{t('review.otherCourseFailed')}</span>}
            </div>
            {mixedOffer}
            <MyWordsView wordRuntime={wordRuntime} />
          </>
        )}
      </section>
    );
  }

  const kindCount=(match:(entry:CombinedReviewItem)=>boolean)=>queue.filter(match).length;
  const breakdown=[
    {key:'card',label:t('progress.cards'),count:kindCount(entry=>entry.kind==='card')},
    {key:'drill',label:t('progress.drill'),count:kindCount(entry=>entry.kind==='practice'&&entry.mode==='drill')},
    {key:'listening',label:t('progress.listening'),count:kindCount(entry=>entry.kind==='practice'&&entry.mode==='listening')},
    {key:'speaking',label:t('progress.speaking'),count:kindCount(entry=>entry.kind==='practice'&&entry.mode==='speaking')},
    {key:'word',label:t('progress.words'),count:kindCount(entry=>entry.kind==='word')}
  ].filter(row=>row.count>0);
  const topics=[...new Set(queue.flatMap(entry=>{
    if(entry.kind==='word')return [];
    const set=entry.setId?otherCourses.courses.find(other=>other.set.id===entry.setId)?.set:state.set;
    const node=set?.roadmaps.flatMap(roadmap=>roadmap.nodes).find(candidate=>candidate.activityIds.includes(entry.activity.id));
    return set&&node?[nodeTopic(set,node,locale)]:[];
  }))].slice(0,5);

  if(completeDayId&&dayFinished){
    return (
      <section className="review-shell" aria-labelledby="review-title">
        <div className="learn-summary">
          <span className="learn-summary-icon" aria-hidden="true"><Icon name="check" size={32} /></span>
          <div className="screen-kicker">{t('learn.summaryKicker')}</div>
          <h2 id="review-title">{t('learn.reviewDayTitle')}</h2>
          <p className="learn-hint">{dayCounted?t('review.dayCounted'):t('learn.checking')}</p>
        </div>
        <div className="runner-action">
          <button className="primary-button" type="button" onClick={onExit}>{t('learn.summaryDone')}</button>
        </div>
      </section>
    );
  }

  if(!started&&item){
    return (
      <section className="review-shell" aria-labelledby="review-title">
        <header className="screen-head">
          <div className="screen-kicker">{t('review.eyebrow')}</div>
          <h2 id="review-title">{t('review.title')}</h2>
        </header>
        <div className="bento">
          <article className="tile tile-hero review-hero">
            <span className="review-ring" aria-hidden="true"><strong>{total}</strong></span>
            <div className="review-hero-text">
              <strong>{t('review.dueTitle',{count:total})}</strong>
              {session.waiting>0&&<span className="tile-text">{t('review.waiting',{count:session.waiting})}</span>}
            </div>
            {/* What exactly comes now: kinds with counts and the topics they are from. */}
            <ul className="stat-list review-breakdown">
              {breakdown.map(row=><li key={row.key} className="stat-row"><span>{row.label}</span><strong>{row.count}</strong></li>)}
            </ul>
            {topics.length>0&&<p className="tile-text review-topics">{t('review.topics',{topics:topics.join(', ')})}</p>}
            <button className="primary-button review-start" type="button" onClick={()=>setStarted(true)}>
              <Icon name="play" size={18} />
              {t('today.reviewStart')}
            </button>
          </article>
          {mixedOffer}
        </div>
        <MyWordsView wordRuntime={wordRuntime} />
      </section>
    );
  }

  if(!item){
    const left=reviewDueCounts(state,wordRuntime,locale,todayDay,otherCourses.courses)?.actionableCount ?? 0;
    return (
      <section className="review-shell" aria-labelledby="review-title">
        <header className="screen-head">
          <div className="screen-kicker">{t('review.eyebrow')}</div>
          <h2 id="review-title">{t('review.doneTitle')}</h2>
        </header>
        <div className="learn-state">
          <strong>{t('review.doneCount',{count:completed})}</strong>
          <span>
            {left>0
              ? t('review.moreDue',{count:left})
              : session.waiting>0
                ? t('review.waiting',{count:session.waiting})
                : t('review.doneText')}
          </span>
          {(otherCourses.failed??0)>0&&<span role="status">{t('review.otherCourseFailed')}</span>}
          {left>0&&(
            <button className="primary-button" type="button" onClick={restart}>
              {t('review.again',{count:left})}
            </button>
          )}
          <button className={left>0?'secondary-button':'primary-button'} type="button" onClick={onExit}>
            {t('review.backToday')}
          </button>
        </div>
        {mixedOffer}
      </section>
    );
  }

  // Items from another course are saved to that course's progress.
  const setId=(item.kind!=='word'&&item.setId)||state.set.id;
  const position=t('review.position',{
    current:Math.min(completed+1,total),
    total
  });

  const completePractice=()=>{
    setCompleted(value=>Math.min(total,value+1));
    setIndex(value=>value+1);
  };

  const returnedCard=queue.indexOf(item)<index;
  const finishCard=async(correct:boolean)=>{
    if(item.kind!=='card'||busy||result!==null)return;
    setBusy(true);
    try{
      // A card that came back after a mistake is practice: its first answer already set the interval.
      if(!returnedCard)await saveGraded(setId,item.activity.id,correct);
      setResult(correct);
    }finally{
      setBusy(false);
    }
  };

  const checkChoice=(choice:number)=>{
    if(item.kind!=='card'||item.activity.type!=='choice')return;
    void finishCard(choice===item.activity.correctIndex);
  };

  const checkText=()=>{
    if(item.kind!=='card'||(item.activity.type!=='text-input'&&item.activity.type!=='translation'))return;
    const value=reviewChips?chipsText(reviewChips,picked):answer.trim();
    if(!value)return;
    const answerSpec=item.activity.answer;
    const correct=answerSpec.caseSensitive
      ? answerSpec.accepted.some(candidate=>candidate.trim()===value)
      : checkAnswer(value,answerSpec.accepted);
    void finishCard(correct);
  };

  const advanceCard=()=>{
    if(item.kind!=='card'||result===null)return;
    // A wrong card comes back once at the end of the session, like in a lesson; never in a loop.
    if(result||returnedCard){
      setCompleted(value=>Math.min(total,value+1));
    }else{
      setQueue(current=>[...current,item]);
    }
    setIndex(value=>value+1);
  };

  const revealWord=()=>{
    if(item?.kind!=='word')return;
    setWordShown(true);
    void speak(item.word.lemma,ENGLISH_SPEECH_LOCALE);
  };

  const gradeWord=async(correct:boolean)=>{
    if(item?.kind!=='word'||busy)return;
    setBusy(true);
    setWordSaveError(false);
    try{
      await saveWord(item.word.record.lexemeId,item.word.record.senseId,correct);
      setCompleted(value=>Math.min(total,value+1));
      setIndex(value=>value+1);
    }catch(_){
      setWordSaveError(true);
    }finally{
      setBusy(false);
    }
  };

  const cardFeedback=(activity:CardActivity)=>{
    if(result===null)return null;
    const acceptedAnswers=activity.type==='choice'
      ? [localized(activity.options[activity.correctIndex],locale)]
      : activity.answer.accepted;
    const accepted=acceptedAnswers[0];
    const learnerAnswer=activity.type==='choice'
      ? (selected===null?'':localized(activity.options[selected],locale))
      : (reviewChips?chipsText(reviewChips,picked):answer.trim());
    const courseExplanation=localized(activity.explanation,locale);
    return (
      <div className={'learn-feedback is-sheet '+(result?'learn-feedback-ok':'learn-feedback-wrong')} role="status">
        <div className="learn-feedback-head">
          <span className="learn-feedback-icon" aria-hidden="true"><Icon name={result?'check':'review'} size={22} /></span>
          <strong>{result?t('learn.correct'):t('learn.incorrect')}</strong>
        </div>
        {!result&&accepted&&(
          <span><LexiconText text={t('learn.accepted',{answer:accepted})} refs={activity.lexiconRefs} /></span>
        )}
        {courseExplanation&&(
          <p><LexiconText text={courseExplanation} refs={activity.lexiconRefs} /></p>
        )}
        <div className="learn-feedback-actions">
          {!result&&learnerAnswer&&acceptedAnswers.length>0&&(
            <AnswerExplanationView
              compact
              question={localized(activity.prompt,locale)}
              learnerAnswer={learnerAnswer}
              acceptedAnswers={acceptedAnswers}
              courseExplanation={courseExplanation}
              refs={activity.lexiconRefs}
              onSignIn={onSignIn}
              onAccess={onAccess}
            />
          )}
          <button className="primary-button learn-feedback-next" type="button" onClick={advanceCard}>
            {result||returnedCard?t('learn.next'):t('review.retryLater')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="review-shell runner" aria-labelledby="review-title">
      <div className="runner-top">
        <button className="runner-close pressable" type="button" onClick={()=>setStarted(false)} aria-label={t('review.close')}>
          <Icon name="close" size={20} />
        </button>
        <div className="runner-progress" role="progressbar" aria-label={t('review.progress')} aria-valuemin={0} aria-valuemax={Math.max(1,total)} aria-valuenow={completed}>
          <span className="runner-bar" style={{transform:`scaleX(${total?completed/total:0})`}} />
        </div>
        <span className="runner-count">{position}</span>
      </div>
      <h2 id="review-title" className="sr-only">{t('review.title')}</h2>

      {item.kind==='card'&&item.activity.type==='choice'&&(()=>{
        const activity=item.activity;
        return (
        <article className="learn-card review-card">
          <div className="review-kind">{t('review.card')}</div>
          <h3><LexiconText text={localized(activity.prompt,locale)} refs={activity.lexiconRefs} /></h3>
          {activity.hint&&(
            <p className="learn-hint"><LexiconText text={localized(activity.hint,locale)} refs={activity.lexiconRefs} /></p>
          )}
          <fieldset className="learn-options" disabled={busy||result!==null}>
            <legend className="sr-only">{t('learn.chooseAnswer')}</legend>
            {shuffledIndices(activity.options.length,shuffleSeed+'|review|'+activity.id+'|'+index).map(optionIndex=>{
              const option=activity.options[optionIndex]!;
              return (
                <label className={'learn-option'+(selected===optionIndex&&result===null?' is-selected':'')} key={optionIndex}>
                  <input
                    type="radio"
                    name={'review-'+activity.id+'-'+index}
                    checked={selected===optionIndex}
                    onChange={()=>setSelected(optionIndex)}
                    onClick={()=>{
                      if(selected===optionIndex&&result===null)checkChoice(optionIndex);
                    }}
                  />
                  <span><LexiconText text={localized(option,locale)} refs={activity.lexiconRefs} interactive={result!==null} /></span>
                  {selected===optionIndex&&result===null&&<span className="learn-option-confirm">{t('learn.tapAgain')}</span>}
                </label>
              );
            })}
          </fieldset>
          {cardFeedback(activity)}
        </article>
        );
      })()}

      {item.kind==='card'&&(item.activity.type==='text-input'||item.activity.type==='translation')&&(
        <article className="learn-card review-card">
          <div className="review-kind">{t('review.card')}</div>
          <h3><LexiconText text={localized(item.activity.prompt,locale)} refs={item.activity.lexiconRefs} /></h3>
          {item.activity.type==='text-input'&&item.activity.source&&(
            <p className="learn-source"><LexiconText text={localized(item.activity.source,locale)} refs={item.activity.lexiconRefs} /></p>
          )}
          {reviewChips ? (
            <WordChips chips={reviewChips} picked={picked} disabled={busy||result!==null} onChange={setPicked} />
          ) : (
            <label className="learn-answer">
              <span>{t('learn.answerLabel')}</span>
              <input
                value={answer}
                disabled={busy||result!==null}
                onChange={event=>setAnswer(event.target.value)}
                onKeyDown={event=>{
                  if(event.key==='Enter'){
                    event.preventDefault();
                    checkText();
                  }
                }}
                autoComplete="off"
              />
            </label>
          )}
          {result===null&&(
            <button className="primary-button" type="button"
              disabled={!(reviewChips?chipsText(reviewChips,picked):answer.trim())||busy} onClick={checkText}>
              {t('learn.check')}
            </button>
          )}
          {cardFeedback(item.activity)}
        </article>
      )}

      {session.wordUnavailable&&(
        <div className="learn-feedback learn-feedback-wrong review-word-warning" role="status">
          <span>{t('review.wordsLoadError')}</span>
          {wordRuntime&&(
            <button className="secondary-button" type="button" onClick={()=>void wordRuntime.refresh()}>
              {t('today.retry')}
            </button>
          )}
        </div>
      )}

      {session.unresolvedWords>0&&(
        <div className="learn-hint">
          {t('review.wordsUnresolved',{count:session.unresolvedWords})}
        </div>
      )}

      {item.kind==='word'&&(
        <article className="learn-card review-card word-review-card">
          <div className="review-kind">{t('review.word')}</div>
          <h3>{item.word.translations.join(' · ')}</h3>
          {!wordShown ? (
            <button className="primary-button" type="button" onClick={revealWord}>
              {t('review.showWord')}
            </button>
          ) : (
            <>
              <div className="drill-target"><LexiconText text={item.word.lemma} /></div>
              <button className="secondary-button" type="button" onClick={()=>void speak(item.word.lemma,ENGLISH_SPEECH_LOCALE)}>
                {t('speaking.playReference')}
              </button>
              {wordSaveError&&(
                <div className="learn-feedback learn-feedback-wrong" role="alert">
                  <span>{t('review.wordSaveError')}</span>
                </div>
              )}
              <button className="primary-button" type="button" disabled={busy} onClick={()=>void gradeWord(true)}>
                {t('review.wordKnew')}
              </button>
              <button className="secondary-button" type="button" disabled={busy} onClick={()=>void gradeWord(false)}>
                {t('review.wordForgot')}
              </button>
            </>
          )}
        </article>
      )}

      {item.kind==='practice'&&item.mode==='drill'&&(
        <PatternDrillView
          key={'review-drill-'+setId+'-'+item.activity.id}
          activity={item.activity}
          setId={setId}
          savePractice={savePractice}
          onDone={completePractice}
        />
      )}

      {item.kind==='practice'&&item.mode==='listening'&&(
        <PatternListeningView
          key={'review-listening-'+setId+'-'+item.activity.id}
          activity={item.activity}
          setId={setId}
          distractors={distractors}
          savePractice={savePractice}
          speak={speak}
          onDone={completePractice}
        />
      )}

      {item.kind==='practice'&&item.mode==='speaking'&&(
        <PatternSpeakingView
          key={'review-speaking-'+setId+'-'+item.activity.id}
          activity={item.activity}
          setId={setId}
          savePractice={savePractice}
          speak={speak}
          startRecognition={startRecognition}
          onDone={completePractice}
        />
      )}
    </section>
  );
}

export function ReviewScreen(){
  const navigate=useNavigate();
  const [search]=useSearchParams();
  const day=search.get('day')||undefined;
  const runtime=useLearnerCourseRuntime();
  const otherCourses=useOtherCourseReviews(runtime.state?.set.id??'');
  return (
    <ReviewView
      runtime={runtime}
      wordRuntime={useWordReviewRuntime()}
      onExit={()=>navigate('/')}
      onSignIn={()=>navigate('/account?return='+encodeURIComponent('/review'))}
      onAccess={()=>navigate('/access?from=answer')}
      saveGraded={saveGradedActivity}
      savePractice={savePracticeActivity}
      saveWord={saveWordReview}
      otherCourses={otherCourses}
      {...(day?{completeDayId:day}:{})}
    />
  );
}
