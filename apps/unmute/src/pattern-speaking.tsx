import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type {
  MicrophoneAccess,
  RequestMicrophone,
  SpeakText,
  StartRecognition,
  WebRecognitionError,
  WebRecognitionHandle
} from './speech-web';
import { requestMicrophone as requestSpeechMicrophone, startRecognition as startSpeechRecognition } from './speech-runtime';
import { looseSpeechMatch } from './speech-match';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';
import { ENGLISH_SPEECH_LOCALE } from './speech-locale';
import { AnswerFeedbackSheet } from './answer-feedback-sheet';
import type { PracticeItemGrade } from './engine/practice-srs';
import { readPracticeRunState, writePracticeRunState } from './practice-run-state';

type PatternDrillActivity=Extract<Activity,{type:'pattern-drill'}>;
type SpeakingVerification='recognition'|'manual'|'revealed';

interface SpeakingRunSession {
  version:1;
  activityRevision:number;
  itemIds:string[];
  pos:number;
  hits:number;
  phase:'ask'|'show';
  heard:string;
  correct:boolean|null;
  verification?:SpeakingVerification;
  saved:boolean;
  saveError:boolean;
  firstPassGrades?:Record<string,PracticeItemGrade>;
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
    score:number,
    itemGrades?:Readonly<Record<string,PracticeItemGrade>>
  )=>Promise<void>;
  speak:SpeakText;
  startRecognition:StartRecognition;
  /** Asked when «Говорение» opens; the real recognizer asks the phone by default. */
  requestMicrophone?:RequestMicrophone;
  random?:()=>number;
  onProgress?:(current:number,total:number)=>void;
  active?:boolean;
  sessionKey?:string;
  /** «Повтор»: one phrase is one question — no correction round, no summary; done goes straight on. */
  single?:boolean;
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

/** One answer for a whole session made of several speaking views (a review of single phrases). */
export function onceMicrophone(request:RequestMicrophone):RequestMicrophone{
  let answer:Promise<MicrophoneAccess>|null=null;
  return ()=>(answer??=request());
}

export function PatternSpeakingView({
  activity,
  setId,
  onDone,
  savePractice,
  speak,
  startRecognition,
  requestMicrophone,
  random=Math.random,
  onProgress,
  active=true,
  sessionKey,
  single=false
}:PatternSpeakingViewProps){
  const {t,locale}=useI18n();
  const base=activity.items.length;
  const restored=restoredSpeakingSession(activity,sessionKey);
  const [items,setItems]=useState(()=>restored?.items??pickSpeakingItems(activity,random));
  const [pos,setPos]=useState(()=>restored?.pos??0);
  const [hits,setHits]=useState(()=>restored?.hits??0);
  const [phase,setPhase]=useState<'ask'|'show'>(()=>restored?.phase??'ask');
  const [heard,setHeard]=useState(()=>restored?.heard??'');
  const [correct,setCorrect]=useState<boolean|null>(()=>restored?.correct??null);
  const [verification,setVerification]=useState<SpeakingVerification>(()=>restored?.verification??'recognition');
  const [listening,setListening]=useState(false);
  const [recognitionError,setRecognitionError]=useState<WebRecognitionError|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(()=>Boolean(restored?.saved));
  const [saveError,setSaveError]=useState(()=>Boolean(restored?.saveError));
  const [firstPassGrades,setFirstPassGrades]=useState<Record<string,PracticeItemGrade>>(
    ()=>restored?.firstPassGrades??{}
  );
  const handleRef=useRef<WebRecognitionHandle|null>(null);
  const receivedRef=useRef(false);
  // Decision 13: ask for the microphone on every entry; without it the phrases are checked by hand,
  // with one note instead of an error on every phrase. A refusal is not remembered.
  const askMicrophone=requestMicrophone ?? (startRecognition===startSpeechRecognition?requestSpeechMicrophone:null);
  const [microphone,setMicrophone]=useState<'checking'|'on'|'denied'|'unsupported'>(askMicrophone?'checking':'on');
  const askedRef=useRef(false);
  const manualMode=microphone==='denied'||microphone==='unsupported';

  const checkMicrophone=()=>{
    if(!askMicrophone)return;
    setMicrophone('checking');
    void askMicrophone()
      .then(access=>setMicrophone(access==='granted'?'on':access))
      .catch(()=>setMicrophone('on'));
  };

  useEffect(()=>{
    if(!active||askedRef.current)return;
    askedRef.current=true;
    checkMicrophone();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active]);

  const item=items[pos] ?? null;
  const target=item?.answer.accepted[0] || '';
  const done=pos>=items.length;
  const score=speakingScore(hits,base);
  const strongFirstPass=base>0&&hits===base;
  const correcting=pos>=base;
  const correctionRemaining=correcting
    ? new Set(items.slice(pos).map(entry=>entry.id)).size
    : 0;

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
      verification,
      saved,
      saveError,
      firstPassGrades
    } satisfies SpeakingRunSession);
  },[activity.revision,correct,firstPassGrades,heard,hits,items,phase,pos,saveError,saved,sessionKey,verification]);

  useEffect(()=>{ if(active)onProgress?.(Math.min(pos+1,base),base); },[active,base,onProgress,pos]);

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
    void savePractice(setId,activity.id,'speaking',strongFirstPass,score,firstPassGrades)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,firstPassGrades,saveError,savePractice,saved,saving,score,setId,strongFirstPass]);

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
    setVerification('recognition');
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
        setVerification('recognition');
        if(pos<base&&ok)setHits(value=>value+1);
        setPhase('show');
      },
      onError:error=>{
        handleRef.current=null;
        setListening(false);
        // No microphone after all: switch to checking by hand for the rest of the session.
        if(error==='permission'||error==='unsupported'){
          setMicrophone(error==='permission'?'denied':'unsupported');
          setRecognitionError(null);
          return;
        }
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
    setVerification('revealed');
    setPhase('show');
  };

  const beginManualCompare=()=>{
    stopCurrent();
    receivedRef.current=true;
    setRecognitionError(null);
    setHeard('');
    setCorrect(null);
    setVerification('manual');
    setPhase('show');
  };

  const advanceAttempt=(resolved:boolean)=>{
    stopCurrent();
    if(item&&pos<base){
      const grade:PracticeItemGrade=resolved
        ? (verification==='recognition'&&correct===true?'strong':'neutral')
        : 'weak';
      setFirstPassGrades(current=>({...current,[item.id]:grade}));
    }
    if(!resolved&&item&&!single)setItems(current=>[...current,item]);
    setPos(value=>value+1);
    setPhase('ask');
    setHeard('');
    setCorrect(null);
    setVerification('recognition');
    setRecognitionError(null);
    receivedRef.current=false;
  };

  // «Повтор»: once the one phrase is saved, go straight to the next review item.
  useEffect(()=>{ if(single&&done&&saved)onDone(); },[single,done,saved]);

  const retrySave=()=>{
    if(saving)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'speaking',strongFirstPass,score,firstPassGrades)
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

  if(done&&single&&!saveError)return <p className="learn-hint" role="status">{t('drill.saving')}</p>;
  if(done){
    return (
      <article className="learn-card speaking-card">
        <ExerciseKind kind="speaking" />
        <div className="eyebrow">{t('speaking.mode')}</div>
        <h3><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></h3>
        <div className="drill-result">
          {/* Phrases checked by hand are said, not failed: do not report «0 recognised» for them. */}
          <strong>{Object.values(firstPassGrades).some(grade=>grade==='neutral')
            ? t('speaking.scoreManual',{correct:hits,total:base,manual:Object.values(firstPassGrades).filter(grade=>grade==='neutral').length})
            : t('speaking.score',{correct:hits,total:base})}</strong>
          <span>{strongFirstPass?t('speaking.passed'):t('speaking.completed')}</span>
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
        <button className="primary-button" type="button" disabled={!saved} onClick={onDone}>
          {t('learn.next')}
        </button>
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
        {!single&&<span>{correcting
          ? t('drill.correctionRemaining',{count:correctionRemaining})
          : t('speaking.position',{current:pos+1,total:base})}</span>}
      </div>
      <h3><LexiconText text={prompt} refs={activity.lexiconRefs} /></h3>

      {phase==='ask' ? (manualMode ? (
        <>
          <p className="learn-hint">{t('speaking.manualPrompt')}</p>
          <div className="learn-feedback learn-feedback-neutral" role="status">
            <span>{t(microphone==='denied'?'speaking.manualNoPermission':'speaking.manualUnsupported')}</span>
            {microphone==='denied'&&(
              <button className="link-button" type="button" onClick={checkMicrophone}>
                {t('speaking.askMicrophone')}
              </button>
            )}
          </div>
          <div className="runner-action">
            <button className="primary-button" type="button" onClick={beginManualCompare}>
              {t('speaking.manualCheck')}
            </button>
          </div>
          <button className="link-button" type="button" onClick={showAnswer}>
            {t('speaking.showAnswer')}
          </button>
        </>
      ) : (
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
              disabled={microphone==='checking'}
              onClick={beginRecognition}
            >
              {listening?t('speaking.listening'):t('speaking.start')}
            </button>
          </div>
          {recognitionError&&(
            <button className="secondary-button" type="button" onClick={beginManualCompare}>
              {t('speaking.manualCheck')}
            </button>
          )}
          <button className="link-button" type="button" onClick={showAnswer}>
            {t('speaking.showAnswer')}
          </button>
        </>
      )
      ) : active&&(
        <AnswerFeedbackSheet
          tone={verification==='manual'?'near':correct?'correct':'wrong'}
          title={
            verification==='manual'
              ? t('speaking.manualCompare')
              : verification==='revealed'
                ? t('speaking.gaveUp')
                : correct?t('speaking.match'):t('speaking.noMatch')
          }
          subtitle={
            <span>{
              verification==='manual'
                ? t('speaking.manualCompareHint')
                : verification==='revealed'
                  ? t('speaking.gaveUpHint')
                  : correct?t('speaking.matchHint'):t('speaking.noMatchHint')
            }</span>
          }
          actions={
            verification==='manual' ? (
              <>
                <button className="secondary-button" type="button" onClick={()=>advanceAttempt(false)}>
                  {t('drill.wrong')}
                </button>
                <button className="primary-button learn-feedback-next" type="button" onClick={()=>advanceAttempt(true)}>
                  {t('drill.same')}
                </button>
              </>
            ) : (
              <>
                {verification==='recognition'&&!correct&&(
                  <button className="secondary-button" type="button" onClick={()=>advanceAttempt(true)}>
                    {t('speaking.acceptAnyway')}
                  </button>
                )}
                <button
                  className="primary-button learn-feedback-next"
                  type="button"
                  onClick={()=>advanceAttempt(verification==='recognition'&&correct===true)}
                >
                  {t('learn.next')}
                </button>
              </>
            )
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
