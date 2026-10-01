import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { checkAnswer } from './engine/answer-check';
import { looseSpeechMatch } from './speech-match';
import type {
  SpeakText,
  StartRecognition,
  WebRecognitionError,
  WebRecognitionHandle
} from './speech-web';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';

type DialogueActivity=Extract<Activity,{type:'dialogue'}>;
type DialogueLine=DialogueActivity['lines'][number];

export interface DialogueViewProps {
  activity:DialogueActivity;
  setId:string;
  onDone:()=>void;
  saveDialogue:(setId:string,activityId:string,score:number)=>Promise<void>;
  speak:SpeakText;
  startRecognition:StartRecognition;
}

function localized(text:Record<string,string>|undefined,locale:string):string{
  if(!text)return '';
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export function dialogueAnswerMatches(input:string,line:DialogueLine):boolean{
  const value=input.trim();
  if(!value)return false;
  if(line.answer.caseSensitive){
    if(line.answer.accepted.some(candidate=>candidate.trim()===value))return true;
  }else if(checkAnswer(value,line.answer.accepted)){
    return true;
  }
  const reference=line.displayAnswer || line.answer.accepted[0] || '';
  return reference ? looseSpeechMatch(value,reference) : false;
}

export function dialogueScore(correct:number,total:number):number{
  return total>0?Math.round(Math.max(0,correct)/total*100):0;
}

export function dialoguePassed(correct:number,total:number):boolean{
  return total>0&&correct/total>=0.7;
}

export function DialogueView({
  activity,
  setId,
  onDone,
  saveDialogue,
  speak,
  startRecognition
}:DialogueViewProps){
  const {t,locale}=useI18n();
  const [pos,setPos]=useState(0);
  const [hits,setHits]=useState(0);
  const [phase,setPhase]=useState<'ask'|'show'>('ask');
  const [answer,setAnswer]=useState('');
  const [lastAnswer,setLastAnswer]=useState('');
  const [correct,setCorrect]=useState<boolean|null>(null);
  const [listening,setListening]=useState(false);
  const [recognitionError,setRecognitionError]=useState<WebRecognitionError|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [saveError,setSaveError]=useState(false);
  const recognitionRef=useRef<WebRecognitionHandle|null>(null);
  const receivedRef=useRef(false);

  const line=activity.lines[pos] ?? null;
  const done=pos>=activity.lines.length;
  const score=dialogueScore(hits,activity.lines.length);
  const passed=dialoguePassed(hits,activity.lines.length);

  const stopRecognition=()=>{
    recognitionRef.current?.abort();
    recognitionRef.current=null;
    setListening(false);
  };

  useEffect(()=>{
    return ()=>recognitionRef.current?.abort();
  },[]);

  useEffect(()=>{
    if(!line)return;
    if(phase==='ask'){
      const partner=localized(line.partner,locale);
      if(partner)void speak(partner,'en-US');
      return;
    }
    const reference=line.displayAnswer || line.answer.accepted[0] || '';
    if(reference)void speak(reference,'en-US');
  },[line?.id,phase,locale,speak]);

  useEffect(()=>{
    if(!done||saved||saving||saveError)return;
    setSaving(true);
    setSaveError(false);
    void saveDialogue(setId,activity.id,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,saveDialogue,saveError,saved,saving,score,setId]);

  const finishAnswer=(value:string,ok:boolean)=>{
    stopRecognition();
    setLastAnswer(value);
    setCorrect(ok);
    if(ok)setHits(current=>current+1);
    setPhase('show');
  };

  const checkTyped=()=>{
    const value=answer.trim();
    if(!line||!value||phase!=='ask')return;
    finishAnswer(value,dialogueAnswerMatches(value,line));
  };

  const startVoice=()=>{
    if(!line||phase!=='ask')return;
    if(listening){
      recognitionRef.current?.stop();
      return;
    }

    receivedRef.current=false;
    setRecognitionError(null);
    setListening(true);

    const handle=startRecognition({
      onResult:alternatives=>{
        receivedRef.current=true;
        const best=alternatives.find(value=>dialogueAnswerMatches(value,line))
          || alternatives[0]
          || '';
        finishAnswer(best,alternatives.some(value=>dialogueAnswerMatches(value,line)));
      },
      onError:error=>{
        recognitionRef.current=null;
        setListening(false);
        if(error!=='aborted')setRecognitionError(error);
      },
      onEnd:()=>{
        recognitionRef.current=null;
        setListening(false);
        if(!receivedRef.current)setRecognitionError(current=>current||'no-speech');
      }
    },'en-US');

    recognitionRef.current=handle;
    if(!handle)setListening(false);
  };

  const next=()=>{
    stopRecognition();
    setPos(current=>current+1);
    setPhase('ask');
    setAnswer('');
    setLastAnswer('');
    setCorrect(null);
    setRecognitionError(null);
    receivedRef.current=false;
  };

  const reset=()=>{
    stopRecognition();
    setPos(0);
    setHits(0);
    setPhase('ask');
    setAnswer('');
    setLastAnswer('');
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
    void saveDialogue(setId,activity.id,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  };

  const errorText=(error:WebRecognitionError):string=>{
    if(error==='unsupported')return t('dialogue.voiceUnsupported');
    if(error==='permission')return t('speaking.permission');
    if(error==='no-speech')return t('speaking.noSpeech');
    if(error==='network')return t('speaking.network');
    return t('speaking.recognitionError');
  };

  if(done){
    return (
      <article className="learn-card dialogue-card">
        <ExerciseKind kind="dialogue" />
        <div className="eyebrow">{t('dialogue.mode')}</div>
        <h3><LexiconText text={localized(activity.scene,locale)} refs={activity.lexiconRefs} /></h3>
        <div className="drill-result">
          <strong>{t('dialogue.score',{correct:hits,total:activity.lines.length})}</strong>
          <span>{passed?t('dialogue.passed'):t('dialogue.retryHint')}</span>
        </div>
        {saveError&&(
          <div className="learn-feedback learn-feedback-wrong" role="alert">
            <strong>{t('dialogue.saveError')}</strong>
            <button className="secondary-button" type="button" onClick={retrySave}>
              {t('today.retry')}
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

  if(!line)return null;

  const partner=localized(line.partner,locale);
  const task=localized(line.task,locale);
  const reference=line.displayAnswer || line.answer.accepted[0] || '';

  return (
    <article className="learn-card dialogue-card">
        <ExerciseKind kind="dialogue" />
      <div className="drill-meta">
        <span>{t('dialogue.mode')}</span>
        <span>{t('dialogue.position',{current:pos+1,total:activity.lines.length})}</span>
      </div>

      <div className="dialogue-bubble">
        <strong><LexiconText text={partner} refs={activity.lexiconRefs} /></strong>
        <button className="learn-back" type="button" onClick={()=>void speak(partner,'en-US')}>
          {t('dialogue.playPartner')}
        </button>
      </div>

      {task&&<p className="dialogue-task"><LexiconText text={t('dialogue.task',{task})} refs={activity.lexiconRefs} /></p>}

      {phase==='ask' ? (
        <>
          <label className="learn-answer">
            <span>{t('dialogue.answerLabel')}</span>
            <input
              value={answer}
              onChange={event=>setAnswer(event.target.value)}
              onKeyDown={event=>{
                if(event.key==='Enter'){
                  event.preventDefault();
                  checkTyped();
                }
              }}
              disabled={listening}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>
          <button className="primary-button" type="button" disabled={!answer.trim()||listening} onClick={checkTyped}>
            {t('learn.check')}
          </button>
          <button
            className={listening?'secondary-button speaking-mic speaking-mic-on':'secondary-button speaking-mic'}
            type="button"
            onClick={startVoice}
          >
            {listening?t('speaking.listening'):t('dialogue.answerVoice')}
          </button>
          {recognitionError&&(
            <div className="learn-feedback learn-feedback-wrong" role="status">
              <span>{errorText(recognitionError)}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className={correct?'learn-feedback learn-feedback-ok':'learn-feedback learn-feedback-wrong'} role="status">
            <strong>{correct?t('dialogue.correct'):t('dialogue.incorrect')}</strong>
            {lastAnswer&&<span>{t('dialogue.yourAnswer',{answer:lastAnswer})}</span>}
          </div>
          <div className="drill-target"><LexiconText text={reference} refs={activity.lexiconRefs} /></div>
          <button className="secondary-button" type="button" onClick={()=>void speak(reference,'en-US')}>
            {t('speaking.playReference')}
          </button>
          <button className="primary-button" type="button" onClick={next}>
            {pos+1<activity.lines.length?t('learn.next'):t('learn.finish')}
          </button>
        </>
      )}

      <div className="learn-hint">{t('dialogue.sessionStats',{correct:hits,total:activity.lines.length})}</div>
    </article>
  );
}
