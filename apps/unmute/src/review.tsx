import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { checkAnswer } from './engine/answer-check';
import type { PracticeSrsKind } from './engine/practice-srs';
import {
  activitySaveClock,
  saveGradedActivity,
  savePracticeActivity
} from './activity-progress';
import {
  buildCourseReviewSession,
  type CourseReviewSession,
  type ReviewSessionItem
} from './review-session';
import type { SpeakText, StartRecognition } from './speech-web';
import { speakWebText, startWebRecognition } from './speech-web';
import { PatternDrillView } from './pattern-drill';
import { PatternListeningView } from './pattern-listening';
import { PatternSpeakingView } from './pattern-speaking';
import { saveWordReview } from './word-progress';
import type { WordReviewRuntimeValue } from './word-review-runtime';
import { useWordReviewRuntime } from './word-review-runtime';
import { resolveWordReviewSession, type ResolvedWordReviewItem } from './word-review';
import { buildMixedDrillActivity, studiedPatternActivities, MixedDrillView } from './mixed-drill';
import { LexiconText } from './lexicon-ui';

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
  speak?:SpeakText;
  startRecognition?:StartRecognition;
}

export function ReviewView({
  runtime,
  onExit,
  todayDay=activitySaveClock().dayNumber,
  saveGraded,
  savePractice,
  wordRuntime=null,
  saveWord=saveWordReview,
  speak=speakWebText,
  startRecognition=startWebRecognition
}:ReviewViewProps){
  const {t,locale}=useI18n();
  const state=runtime.state;
  const [session,setSession]=useState<PinnedReviewSession|null>(null);
  const [queue,setQueue]=useState<CombinedReviewItem[]>([]);
  const [index,setIndex]=useState(0);
  const [completed,setCompleted]=useState(0);
  const [selected,setSelected]=useState<number|null>(null);
  const [answer,setAnswer]=useState('');
  const [result,setResult]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [wordShown,setWordShown]=useState(false);
  const [wordSaveError,setWordSaveError]=useState(false);
  const [mixedActivity,setMixedActivity]=useState<Extract<Activity,{type:'pattern-drill'}>|null>(null);

  useEffect(()=>{
    if(runtime.status!=='ready'||!state||session)return;
    if(wordRuntime?.status==='pending')return;

    const course=buildCourseReviewSession(state.set,state.progress,todayDay);
    const words=wordRuntime?.status==='ready'&&wordRuntime.words&&wordRuntime.lexicon
      ? resolveWordReviewSession(wordRuntime.words,wordRuntime.lexicon,todayDay,locale)
      : null;
    const wordItems=(words?.items??[]).map(word=>({kind:'word' as const,word}));
    setSession({
      course,
      total:course.actionableCount+wordItems.length,
      waiting:course.waitingCount+(words?.waiting??0),
      unresolvedWords:words?.unresolved??0,
      wordUnavailable:Boolean(wordRuntime&&wordRuntime.status==='error'),
    });
    setQueue([...course.items,...wordItems]);
  },[runtime.status,state?.set.id,session,todayDay,wordRuntime?.status,wordRuntime?.words,wordRuntime?.lexicon,locale]);

  useEffect(()=>{
    setSelected(null);
    setAnswer('');
    setResult(null);
    setBusy(false);
    setWordShown(false);
    setWordSaveError(false);
  },[index]);

  const item=queue[index] ?? null;
  const total=session?.total ?? 0;
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
        <div className="learn-state" role="status">
          <strong>{t('review.loadingTitle')}</strong>
          <span>{t('review.loadingText')}</span>
        </div>
      </section>
    );
  }

  if(runtime.status==='error'){
    return (
      <section className="review-shell">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
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
        <button className="learn-back" type="button" onClick={()=>setMixedActivity(null)}>{t('nav.back')}</button>
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
    <article className="review-mixed-offer">
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
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
        <div className="eyebrow">{t('review.eyebrow')}</div>
        <h2 id="review-title">{t('review.title')}</h2>
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
              <button className="secondary-button" type="button" onClick={onExit}>
                {t('review.backToday')}
              </button>
            </div>
            {mixedOffer}
          </>
        ) : (
          <>
            <div className="learn-state">
              <strong>{t('review.emptyTitle')}</strong>
              <span>{t('review.emptyText')}</span>
              <button className="secondary-button" type="button" onClick={onExit}>
                {t('review.backToday')}
              </button>
            </div>
            {mixedOffer}
          </>
        )}
      </section>
    );
  }

  if(!item){
    return (
      <section className="review-shell" aria-labelledby="review-title">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
        <div className="eyebrow">{t('review.eyebrow')}</div>
        <h2 id="review-title">{t('review.doneTitle')}</h2>
        <div className="learn-state">
          <strong>{t('review.doneCount',{count:completed})}</strong>
          <span>
            {session.waiting>0
              ? t('review.waiting',{count:session.waiting})
              : t('review.doneText')}
          </span>
          <button className="primary-button" type="button" onClick={onExit}>
            {t('review.backToday')}
          </button>
        </div>
        {mixedOffer}
      </section>
    );
  }

  const setId=state.set.id;
  const position=t('review.position',{
    current:Math.min(completed+1,total),
    total
  });

  const completePractice=()=>{
    setCompleted(value=>Math.min(total,value+1));
    setIndex(value=>value+1);
  };

  const finishCard=async(correct:boolean)=>{
    if(item.kind!=='card'||busy||result!==null)return;
    setBusy(true);
    try{
      await saveGraded(setId,item.activity.id,correct);
      setResult(correct);
    }finally{
      setBusy(false);
    }
  };

  const checkChoice=()=>{
    if(item.kind!=='card'||item.activity.type!=='choice'||selected===null)return;
    void finishCard(selected===item.activity.correctIndex);
  };

  const checkText=()=>{
    if(item.kind!=='card'||(item.activity.type!=='text-input'&&item.activity.type!=='translation'))return;
    const value=answer.trim();
    if(!value)return;
    const answerSpec=item.activity.answer;
    const correct=answerSpec.caseSensitive
      ? answerSpec.accepted.some(candidate=>candidate.trim()===value)
      : checkAnswer(value,answerSpec.accepted);
    void finishCard(correct);
  };

  const advanceCard=()=>{
    if(item.kind!=='card'||result===null)return;
    if(result){
      setCompleted(value=>Math.min(total,value+1));
    }else{
      setQueue(current=>[...current,item]);
    }
    setIndex(value=>value+1);
  };

  const revealWord=()=>{
    if(item?.kind!=='word')return;
    setWordShown(true);
    void speak(item.word.lemma,'en-US');
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
    const accepted=activity.type==='choice'
      ? localized(activity.options[activity.correctIndex],locale)
      : activity.answer.accepted[0];
    return (
      <div className={result?'learn-feedback learn-feedback-ok':'learn-feedback learn-feedback-wrong'} role="status">
        <strong>{result?t('learn.correct'):t('learn.incorrect')}</strong>
        {!result&&accepted&&(
          <span><LexiconText text={t('learn.accepted',{answer:accepted})} refs={activity.lexiconRefs} /></span>
        )}
        <button className="primary-button" type="button" onClick={advanceCard}>
          {result?t('learn.next'):t('review.retryLater')}
        </button>
      </div>
    );
  };

  return (
    <section className="review-shell" aria-labelledby="review-title">
      <div className="learn-header">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
        <span>{position}</span>
      </div>
      <div>
        <div className="eyebrow">{t('review.eyebrow')}</div>
        <h2 id="review-title">{t('review.title')}</h2>
      </div>
      <progress
        className="today-progress"
        max={Math.max(1,total)}
        value={completed}
        aria-label={t('review.progress')}
      />

      {item.kind==='card'&&item.activity.type==='choice'&&(
        <article className="learn-card review-card">
          <div className="review-kind">{t('review.card')}</div>
          <h3><LexiconText text={localized(item.activity.prompt,locale)} refs={item.activity.lexiconRefs} /></h3>
          {item.activity.hint&&(
            <p className="learn-hint"><LexiconText text={localized(item.activity.hint,locale)} refs={item.activity.lexiconRefs} /></p>
          )}
          <fieldset className="learn-options" disabled={busy||result!==null}>
            <legend className="sr-only">{t('learn.chooseAnswer')}</legend>
            {item.activity.options.map((option,optionIndex)=>(
              <label className="learn-option" key={optionIndex}>
                <input
                  type="radio"
                  name={'review-'+item.activity.id+'-'+index}
                  checked={selected===optionIndex}
                  onChange={()=>setSelected(optionIndex)}
                />
                <span><LexiconText text={localized(option,locale)} refs={item.activity.lexiconRefs} /></span>
              </label>
            ))}
          </fieldset>
          {result===null&&(
            <button className="primary-button" type="button" disabled={selected===null||busy} onClick={checkChoice}>
              {t('learn.check')}
            </button>
          )}
          {cardFeedback(item.activity)}
        </article>
      )}

      {item.kind==='card'&&(item.activity.type==='text-input'||item.activity.type==='translation')&&(
        <article className="learn-card review-card">
          <div className="review-kind">{t('review.card')}</div>
          <h3><LexiconText text={localized(item.activity.prompt,locale)} refs={item.activity.lexiconRefs} /></h3>
          {item.activity.type==='text-input'&&item.activity.source&&(
            <p className="learn-source"><LexiconText text={localized(item.activity.source,locale)} refs={item.activity.lexiconRefs} /></p>
          )}
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
          {result===null&&(
            <button className="primary-button" type="button" disabled={!answer.trim()||busy} onClick={checkText}>
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
              <button className="secondary-button" type="button" onClick={()=>void speak(item.word.lemma,'en-US')}>
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
          key={'review-drill-'+item.activity.id}
          activity={item.activity}
          setId={setId}
          savePractice={savePractice}
          onDone={completePractice}
        />
      )}

      {item.kind==='practice'&&item.mode==='listening'&&(
        <PatternListeningView
          key={'review-listening-'+item.activity.id}
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
          key={'review-speaking-'+item.activity.id}
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
  return (
    <ReviewView
      runtime={useLearnerCourseRuntime()}
      wordRuntime={useWordReviewRuntime()}
      onExit={()=>navigate('/')}
      saveGraded={saveGradedActivity}
      savePractice={savePracticeActivity}
      saveWord={saveWordReview}
    />
  );
}
