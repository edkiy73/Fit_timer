import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type {
  SpeakText,
  StartRecognition,
  WebRecognitionError,
  WebRecognitionHandle
} from './speech-web';
import { looseSpeechMatch } from './speech-match';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';
import { ENGLISH_SPEECH_LOCALE } from './speech-locale';
import { AnswerFeedbackSheet } from './answer-feedback-sheet';
import { readPracticeRunState, writePracticeRunState } from './practice-run-state';

type PatternDrillActivity=Extract<Activity,{type:'pattern-drill'}>;

interface SpeakingRunSession {
  version:1;
  activityRevision:number;
  itemIds:string[];
  pos:number;
  hits:number;
  phase:'ask'|'show';
  heard:string;
  correct:boolean|null;
  saved:boolean;
  saveError:boolean;
}

function restoredSpeakingSession(activity:PatternDrillActivity,key:string|undefined){
  const saved=readPracticeRunState<SpeakingRunSession>(key);
  if(!saved||saved.version!==1||saved.activityRevision!==activity.revision)return null;
  const byId=new Map(activity.items.map(item=>[item.id,item] as const));
  const items=saved.itemIds.map(id=>byId.get(id)).filter((item):item is PatternDrillActivity['items'][number]=>Boolean(item));
  if(items.length!==saved.itemIds.length||saved.pos<0||saved.pos>items.length)return null;
  return {...saved,items};
}

export interface PatternSpeakingViewProps {
  activity:PatternDrillActivity;
  setId:string;
  onDone:()=>void;
  savePractice:(
    setId:string,
    activityId:string,
    mode:'speaking',
    correct:boolean,
    score:number
  )=>Promise<void>;
  speak:SpeakText;
  startRecognition:StartRecognition;
  random?:()=>number;
  onProgress?:(current:number,total:number)=>void;
  active?:boolean;
  sessionKey?:string;
}

function localized(text:Record<string,string>,locale:string):string{
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

function shuffle<T>(values:T[],random:()=>number):T[]{
  const copy=values.slice();
  for(let i=copy.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [copy[i],copy[j]]=[copy[j]!,copy[i]!];
  }
  return copy;
}

export function pickSpeakingItems(
  activity:PatternDrillActivity,
  random:()=>number=Math.random
):PatternDrillActivity['items']{
  return shuffle(activity.items,random);
}

export function speakingScore(correct:number,total:number):number{
  return total>0?Math.round(Math.max(0,correct)/total*100):0;
}

export function speakingPassed(correct:number,total:number):boolean{
  return total>0&&correct/total>=0.7;
}

export function PatternSpeakingView({
  activity,
  setId,
  onDone,
  savePractice,
  speak,
  startRecognition,
  random=Math.random,
  onProgress,
  active=true,
  sessionKey
}:PatternSpeakingViewProps){
  const {t,locale}=useI18n();
  const restored=restoredSpeakingSession(activity,sessionKey);
  const [items,setItems]=useState(()=>restored?.items??pickSpeakingItems(activity,random));
  const [pos,setPos]=useState(()=>restored?.pos??0);
  const [hits,setHits]=useState(()=>restored?.hits??0);
  const [phase,setPhase]=useState<'ask'|'show'>(()=>restored?.phase??'ask');
  const [heard,setHeard]=useState(()=>restored?.heard??'');
  const [correct,setCorrect]=useState<boolean|null>(()=>restored?.correct??null);
  const [listening,setListening]=useState(false);
  const [recognitionError,setRecognitionError]=useState<WebRecognitionError|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(()=>Boolean(restored?.saved));
  const [saveError,setSaveError]=useState(()=>Boolean(restored?.saveError));
  const handleRef=useRef<WebRecognitionHandle|null>(null);
  const receivedRef=useRef(false);

  const item=items[pos] ?? null;
  const target=item?.answer.accepted[0] || '';
  const done=pos>=items.length;
  const score=speakingScore(hits,items.length);
  const passed=speakingPassed(hits,items.length);

  useEffect(()=>{
    writePracticeRunState(sessionKey,{
      version:1,
      activityRevision:activity.revision,
      itemIds:items.map(item=>item.id),
      pos,
      hits,
      phase,
      heard,
      correct,
      saved,
      saveError
    } satisfies SpeakingRunSession);
  },[activity.revision,correct,heard,hits,items,phase,pos,saveError,saved,sessionKey]);

  useEffect(()=>{ if(active)onProgress?.(Math.min(pos+1,items.length),items.length); },[active,items.length,onProgress,pos]);

  useEffect(()=>{
    if(!active){
      handleRef.current?.abort();
      handleRef.current=null;
      setListening(false);
    }
  },[active]);

  useEffect(()=>{
    return ()=>{
      handleRef.current?.abort();
      handleRef.current=null;
    };
  },[]);

  useEffect(()=>{
    if(!active||phase!=='show'||!target)return;
    void speak(target,ENGLISH_SPEECH_LOCALE);
  },[active,phase,target,speak]);

  useEffect(()=>{
    if(!done||saved||saving||saveError)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'speaking',passed,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,passed,saveError,savePractice,saved,saving,score,setId]);

  const stopCurrent=()=>{
    handleRef.current?.abort();
    handleRef.current=null;
    setListening(false);
  };

  const beginRecognition=()=>{
    if(!item||phase!=='ask')return;
    if(listening){
      handleRef.current?.stop();
      return;
    }

    receivedRef.current=false;
    setRecognitionError(null);
    setListening(true);

    const handle=startRecognition({
      onResult:alternatives=>{
        receivedRef.current=true;
        const best=alternatives.find(value=>looseSpeechMatch(value,target)) || alternatives[0] || '';
        const ok=alternatives.some(value=>looseSpeechMatch(value,target));
        handleRef.current=null;
        setListening(false);
        setHeard(best);
        setCorrect(ok);
        if(ok)setHits(value=>value+1);
        setPhase('show');
      },
      onError:error=>{
        handleRef.current=null;
        setListening(false);
        if(error!=='aborted')setRecognitionError(error);
      },
      onEnd:()=>{
        handleRef.current=null;
        setListening(false);
        if(!receivedRef.current)setRecognitionError(current=>current||'no-speech');
      }
    },ENGLISH_SPEECH_LOCALE);

    handleRef.current=handle;
    if(!handle)setListening(false);
  };

  const showAnswer=()=>{
    stopCurrent();
    receivedRef.current=true;
    setRecognitionError(null);
    setHeard('');
    setCorrect(false);
    setPhase('show');
  };

  const acceptManually=()=>{
    if(correct===true)return;
    setCorrect(true);
    setHits(value=>value+1);
  };

  const next=()=>{
    stopCurrent();
    setPos(value=>value+1);
    setPhase('ask');
    setHeard('');
    setCorrect(null);
    setRecognitionError(null);
    receivedRef.current=false;
  };

  const reset=()=>{
    stopCurrent();
    setItems(pickSpeakingItems(activity,random));
    setPos(0);
    setHits(0);
    setPhase('ask');
    setHeard('');
    setCorrect(null);
    setRecognitionError(null);
    setSaving(false);
    setSaved(false);
    setSaveError(false);
    receivedRef.current=false;
  };

  const retrySave=()=>{
    if(saving)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'speaking',passed,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  };

  const errorText=(error:WebRecognitionError):string=>{
    if(error==='unsupported')return t('speaking.unsupported');
    if(error==='permission')return t('speaking.permission');
    if(error==='no-speech')return t('speaking.noSpeech');
    if(error==='network')return t('speaking.network');
    return t('speaking.recognitionError');
  };

  if(done){
    return (
      <article className="learn-card speaking-card">
        <ExerciseKind kind="speaking" />
        <div className="eyebrow">{t('speaking.mode')}</div>
        <h3><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></h3>
        <div className="drill-result">
          <strong>{t('speaking.score',{correct:hits,total:items.length})}</strong>
          <span>{passed?t('speaking.passed'):t('speaking.retryHint')}</span>
        </div>
        {saveError&&(
          <div className="learn-feedback learn-feedback-wrong learn-save-error" role="alert">
            <strong>{t('speaking.saveError')}</strong>
            <span>{t('learn.saveErrorHint')}</span>
            <button className="secondary-button" type="button" onClick={retrySave}>
              {t('learn.retrySave')}
            </button>
          </div>
        )}
        <button className="primary-button" type="button" disabled={!saved} onClick={passed?onDone:reset}>
          {passed?t('learn.next'):t('drill.again')}
        </button>
        {passed&&(
          <button className="secondary-button" type="button" disabled={!saved} onClick={reset}>
            {t('drill.again')}
          </button>
        )}
        {!passed&&(
          <button className="secondary-button" type="button" disabled={!saved} onClick={onDone}>
            {t('drill.continueAnyway')}
          </button>
        )}
        {saving&&<span className="learn-hint" role="status">{t('drill.saving')}</span>}
      </article>
    );
  }

  if(!item)return null;
  const prompt=localized(item.prompt,locale);

  return (
    <article className="learn-card speaking-card">
        <ExerciseKind kind="speaking" />
      <div className="drill-meta">
        <span><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></span>
        <span>{t('speaking.position',{current:pos+1,total:items.length})}</span>
      </div>
      <h3><LexiconText text={prompt} refs={activity.lexiconRefs} /></h3>

      {phase==='ask' ? (
        <>
          <p className="learn-hint">{t('speaking.prompt')}</p>
          {recognitionError&&(
            <div className="learn-feedback learn-feedback-wrong" role="status">
              <span>{errorText(recognitionError)}</span>
            </div>
          )}
          <div className="runner-action">
            <button
              className={listening?'primary-button speaking-mic speaking-mic-on':'primary-button speaking-mic'}
              type="button"
              onClick={beginRecognition}
            >
              {listening?t('speaking.listening'):t('speaking.start')}
            </button>
          </div>
          <button className="link-button" type="button" onClick={showAnswer}>
            {t('speaking.showAnswer')}
          </button>
        </>
      ) : (
        <AnswerFeedbackSheet
          tone={correct?'correct':'wrong'}
          title={correct?t('speaking.match'):t('speaking.noMatch')}
          subtitle={<span>{correct?t('speaking.matchHint'):t('speaking.noMatchHint')}</span>}
          actions={
            <>
              {!correct&&(
                <button className="secondary-button" type="button" onClick={acceptManually}>
                  {t('speaking.acceptAnyway')}
                </button>
              )}
              <button className="primary-button learn-feedback-next" type="button" onClick={next}>
                {pos+1<items.length?t('learn.next'):t('learn.finish')}
              </button>
            </>
          }
        >
          <div className="drill-target"><LexiconText text={target} refs={activity.lexiconRefs} /></div>
          {item?.explanation&&(
            <p className="drill-explanation"><LexiconText text={localized(item.explanation,locale)} refs={activity.lexiconRefs} /></p>
          )}
          {heard&&<div className="learn-hint">{t('speaking.heard',{heard})}</div>}
          <button className="link-button" type="button" onClick={()=>void speak(target,ENGLISH_SPEECH_LOCALE)}>
            {t('speaking.playReference')}
          </button>
        </AnswerFeedbackSheet>
      )}

    </article>
  );
}
