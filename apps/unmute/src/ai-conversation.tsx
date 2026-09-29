import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { LexiconText } from './lexicon-ui';
import type {
  SpeakText,
  StartRecognition,
  WebRecognitionError,
  WebRecognitionHandle
} from './speech-runtime';
import { speakText, startRecognition as startSpeechRecognition } from './speech-runtime';
import {
  clearTalkTrialContext,
  getTalkTrialContext,
  requestTalkReply,
  requestTalkReview,
  type TalkMessage,
  type TalkReply,
  type TalkReview,
  type TalkTrialUsage
} from './ai-talk';
import { trackTalkStarted } from './observability';

type AIActivity=Extract<Activity,{type:'ai-conversation'}>;

function localized(text:Record<string,string>,locale:string):string{
  return text[locale]||text.ru||text.en||Object.values(text)[0]||'';
}

function errorKey(code:string):string{
  if(code==='auth_required')return 'aiTalk.authRequired';
  if(code==='premium_required')return 'aiTalk.plusRequired';
  if(code==='trial_used')return 'aiTalk.trialUsed';
  if(code==='trial_limit')return 'aiTalk.trialLimit';
  if(code==='ai_limit')return 'aiTalk.limit';
  if(code==='ai_timeout')return 'aiTalk.timeout';
  if(code==='ai_bad_response')return 'aiTalk.badResponse';
  return 'aiTalk.failed';
}

export function AIConversationView({
  activity,
  setId,
  saveSeen,
  onDone,
  onSignIn,
  onAccess,
  requestReply=requestTalkReply,
  requestReview=requestTalkReview,
  onStarted=trackTalkStarted,
  speak=speakText,
  startRecognition=startSpeechRecognition
}:{
  activity:AIActivity;
  setId:string;
  saveSeen:(setId:string,activityId:string)=>Promise<void>;
  onDone:()=>void;
  onSignIn:()=>void;
  onAccess:()=>void;
  requestReply?:typeof requestTalkReply;
  requestReview?:typeof requestTalkReview;
  onStarted?:()=>void;
  speak?:SpeakText;
  startRecognition?:StartRecognition;
}){
  const {t,locale}=useI18n();
  const [trialContext]=useState(()=>getTalkTrialContext(activity.id));
  const [messages,setMessages]=useState<TalkMessage[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [started,setStarted]=useState(false);
  const [error,setError]=useState('');
  const [correction,setCorrection]=useState('');
  const [note,setNote]=useState('');
  const [usage,setUsage]=useState<TalkReply['usage']>();
  const [trialUsage,setTrialUsage]=useState<TalkTrialUsage|null>(null);
  const [review,setReview]=useState<TalkReview|null>(null);
  const [reviewRequested,setReviewRequested]=useState(false);
  const [listening,setListening]=useState(false);
  const [recognitionError,setRecognitionError]=useState<WebRecognitionError|null>(null);
  const recognitionRef=useRef<WebRecognitionHandle|null>(null);
  const recognitionReceivedRef=useRef(false);

  useEffect(()=>{
    return ()=>{
      recognitionRef.current?.abort();
      recognitionRef.current=null;
    };
  },[]);

  const applyReply=(reply:TalkReply)=>{
    setCorrection(reply.correction||'');
    setNote(reply.note||'');
    setUsage(reply.usage);
    setTrialUsage(reply.trial??null);
  };

  const stopRecognition=()=>{
    recognitionRef.current?.abort();
    recognitionRef.current=null;
    setListening(false);
  };

  const start=async()=>{
    if(busy)return;
    setBusy(true);
    setError('');
    try{
      const reply=await requestReply({
        topic:localized(activity.topic,locale),
        promptTemplate:activity.promptTemplate,
        focus:activity.focus,
        history:[],
        learnerText:'',
        locale:locale==='en'?'en':'ru',
        start:true,
        trial:trialContext
      });
      setMessages([{role:'partner',text:reply.reply}]);
      applyReply(reply);
      setStarted(true);
      onStarted();
      void speak(reply.reply,'en-US');
    }catch(err:any){
      setError(String(err?.code||'ai_failed'));
    }finally{
      setBusy(false);
    }
  };

  const send=async(message:string)=>{
    if(busy||reviewRequested||!message.trim())return;
    const learnerText=message.trim();
    stopRecognition();
    setBusy(true);
    setError('');
    setCorrection('');
    setNote('');
    try{
      const reply=await requestReply({
        topic:localized(activity.topic,locale),
        promptTemplate:activity.promptTemplate,
        focus:activity.focus,
        history:messages,
        learnerText,
        locale:locale==='en'?'en':'ru',
        trial:trialContext
      });
      setMessages(current=>[
        ...current,
        {role:'learner',text:learnerText},
        {role:'partner',text:reply.reply}
      ]);
      applyReply(reply);
      setInput('');
      void speak(reply.reply,'en-US');
    }catch(err:any){
      setError(String(err?.code||'ai_failed'));
    }finally{
      setBusy(false);
    }
  };

  const voiceErrorText=(value:WebRecognitionError):string=>{
    if(value==='unsupported')return t('aiTalk.voiceUnsupported');
    if(value==='permission')return t('aiTalk.voicePermission');
    if(value==='no-speech')return t('aiTalk.voiceNoSpeech');
    if(value==='network')return t('aiTalk.voiceNetwork');
    return t('aiTalk.voiceError');
  };

  const beginRecognition=()=>{
    if(!started||busy||reviewRequested)return;
    if(listening){
      recognitionRef.current?.stop();
      return;
    }

    recognitionReceivedRef.current=false;
    setRecognitionError(null);
    setListening(true);

    const handle=startRecognition({
      onResult:alternatives=>{
        recognitionReceivedRef.current=true;
        const text=alternatives[0]?.trim()||'';
        recognitionRef.current=null;
        setListening(false);
        if(!text){
          setRecognitionError('no-speech');
          return;
        }
        setInput(text);
        void send(text);
      },
      onError:value=>{
        recognitionRef.current=null;
        setListening(false);
        if(value!=='aborted')setRecognitionError(value);
      },
      onEnd:()=>{
        recognitionRef.current=null;
        setListening(false);
        if(!recognitionReceivedRef.current){
          setRecognitionError(current=>current||'no-speech');
        }
      }
    },'en-US');

    if(recognitionReceivedRef.current){
      handle?.abort();
      recognitionRef.current=null;
    }else{
      recognitionRef.current=handle;
    }
    if(!handle)setListening(false);
  };

  const complete=async()=>{
    if(busy)return;
    stopRecognition();
    setBusy(true);
    try{
      await saveSeen(setId,activity.id);
      clearTalkTrialContext(activity.id);
      onDone();
    }finally{
      setBusy(false);
    }
  };

  const reviewConversation=async()=>{
    if(!started||busy)return;
    stopRecognition();
    const hasLearnerTurn=messages.some(message=>message.role==='learner');
    if(!hasLearnerTurn){
      await complete();
      return;
    }

    setReviewRequested(true);
    setBusy(true);
    setError('');
    try{
      const result=await requestReview({
        topic:localized(activity.topic,locale),
        promptTemplate:activity.promptTemplate,
        focus:activity.focus,
        history:messages,
        locale:locale==='en'?'en':'ru',
        trial:trialContext
      });
      setReview(result);
      if(result.usage)setUsage(result.usage);
      setTrialUsage(result.trial??trialUsage);
    }catch(err:any){
      setError(String(err?.code||'ai_failed'));
    }finally{
      setBusy(false);
    }
  };

  const accessError=
    error==='auth_required'||
    error==='premium_required'||
    error==='trial_used'||
    error==='trial_limit';
  const reviewError=reviewRequested&&!review&&Boolean(error);

  return (
    <article className="learn-card ai-talk-card">
      <div className="ai-talk-head">
        <div>
          <div className="eyebrow">{review?t('aiTalk.reviewEyebrow'):t('aiTalk.eyebrow')}</div>
          <h3>
            <LexiconText
              text={localized(activity.topic,locale)}
              refs={activity.lexiconRefs}
            />
          </h3>
        </div>
        <span className="today-badge">
          {started?(trialUsage?t('aiTalk.trial'):t('aiTalk.plus')):t('aiTalk.ai')}
        </span>
      </div>

      {!started&&messages.length===0&&!error&&(
        <div className="ai-talk-intro">
          <p>{t('aiTalk.intro')}</p>
          <p className="learn-hint">{t('aiTalk.trialIntro')}</p>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={()=>void start()}
          >
            {busy?t('aiTalk.starting'):t('aiTalk.start')}
          </button>
        </div>
      )}

      {messages.length>0&&!review&&(
        <div className="ai-talk-thread" aria-live="polite">
          {messages.map((message,index)=>(
            <div
              className={'ai-talk-message ai-talk-'+message.role}
              key={index}
            >
              <small>
                {message.role==='learner'?t('aiTalk.you'):t('aiTalk.partner')}
              </small>
              <div>
                <LexiconText
                  text={message.text}
                  refs={activity.lexiconRefs}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!reviewRequested&&correction&&(
        <div className="learn-feedback learn-feedback-wrong">
          <strong>{t('aiTalk.correction')}</strong>
          <LexiconText text={correction} refs={activity.lexiconRefs} />
        </div>
      )}

      {!reviewRequested&&note&&(
        <div className="learn-hint">
          <strong>{t('aiTalk.note')}</strong>{' '}
          <LexiconText text={note} refs={activity.lexiconRefs} />
        </div>
      )}

      {review&&(
        <section className="ai-talk-review" aria-labelledby="ai-talk-review-title">
          <div>
            <div className="eyebrow">{t('aiTalk.reviewEyebrow')}</div>
            <h4 id="ai-talk-review-title">{t('aiTalk.reviewTitle')}</h4>
          </div>

          <div className="ai-talk-review-block">
            <strong>{t('aiTalk.reviewStrengths')}</strong>
            <ul>
              {review.strengths.map((strength,index)=>(
                <li key={index}>
                  <LexiconText text={strength} refs={activity.lexiconRefs} />
                </li>
              ))}
            </ul>
          </div>

          <div className="ai-talk-review-block">
            <strong>{t('aiTalk.reviewCorrections')}</strong>
            {review.corrections.length ? (
              <div className="ai-talk-review-corrections">
                {review.corrections.map((item,index)=>(
                  <article key={index}>
                    {item.original&&(
                      <div>
                        <small>{t('aiTalk.reviewOriginal')}</small>
                        <LexiconText text={item.original} refs={activity.lexiconRefs} />
                      </div>
                    )}
                    <div>
                      <small>{t('aiTalk.reviewBetter')}</small>
                      <LexiconText text={item.better} refs={activity.lexiconRefs} />
                    </div>
                    {item.why&&(
                      <p>
                        <LexiconText text={item.why} refs={activity.lexiconRefs} />
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="learn-hint">{t('aiTalk.reviewNoCorrections')}</p>
            )}
          </div>

          <div className="ai-talk-review-focus">
            <strong>{t('aiTalk.reviewFocus')}</strong>
            <LexiconText text={review.focus} refs={activity.lexiconRefs} />
          </div>
        </section>
      )}

      {trialUsage ? (
        <div className="ai-talk-usage">
          {t('aiTalk.trialUsage',{remaining:trialUsage.remaining})}
        </div>
      ) : usage&&usage.limit>0 ? (
        <div className="ai-talk-usage">
          {t('aiTalk.usage',{used:usage.used,limit:usage.limit})}
        </div>
      ) : null}

      {reviewRequested&&busy&&!review&&!error&&(
        <div className="learn-hint ai-talk-reviewing" role="status">
          {t('aiTalk.reviewing')}
        </div>
      )}

      {error&&(
        <div className="learn-feedback learn-feedback-wrong ai-talk-error" role="alert">
          <strong>{t(errorKey(error))}</strong>
          {error==='auth_required'&&(
            <button className="secondary-button" type="button" onClick={onSignIn}>
              {t('aiTalk.signIn')}
            </button>
          )}
          {(error==='premium_required'||error==='trial_used'||error==='trial_limit')&&(
            <button className="secondary-button" type="button" onClick={onAccess}>
              {t('aiTalk.openPlus')}
            </button>
          )}
          {!accessError&&!reviewError&&(
            <button className="secondary-button" type="button" onClick={()=>setError('')}>
              {t('today.retry')}
            </button>
          )}
          {reviewError&&!accessError&&(
            <button className="secondary-button" type="button" disabled={busy} onClick={()=>void reviewConversation()}>
              {t('aiTalk.retryReview')}
            </button>
          )}
          {reviewError&&(
            <button className="secondary-button" type="button" disabled={busy} onClick={()=>void complete()}>
              {t('aiTalk.finishWithoutReview')}
            </button>
          )}
        </div>
      )}

      {started&&!reviewRequested&&!accessError&&(
        <>
          <form
            className="ai-talk-compose"
            onSubmit={event=>{
              event.preventDefault();
              void send(input);
            }}
          >
            <label className="learn-answer">
              <span>{t('aiTalk.answer')}</span>
              <input
                value={input}
                disabled={busy||listening}
                onChange={event=>setInput(event.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={busy||listening||!input.trim()}
            >
              {busy?t('aiTalk.thinking'):t('aiTalk.send')}
            </button>
          </form>
          <div className="ai-talk-voice-actions">
            <button
              className={listening?'secondary-button ai-talk-mic ai-talk-mic-on':'secondary-button ai-talk-mic'}
              type="button"
              disabled={busy}
              onClick={beginRecognition}
            >
              {listening?t('aiTalk.voiceListening'):t('aiTalk.voiceStart')}
            </button>
            {messages.some(message=>message.role==='partner')&&(
              <button
                className="secondary-button"
                type="button"
                disabled={busy||listening}
                onClick={()=>{
                  const latest=[...messages].reverse().find(message=>message.role==='partner');
                  if(latest)void speak(latest.text,'en-US');
                }}
              >
                {t('aiTalk.playPartner')}
              </button>
            )}
          </div>
          {recognitionError&&(
            <div className="learn-hint ai-talk-voice-error" role="status">
              {voiceErrorText(recognitionError)}
            </div>
          )}
        </>
      )}

      {started&&!reviewRequested&&(
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={()=>void reviewConversation()}
        >
          {messages.some(message=>message.role==='learner')
            ? (busy?t('aiTalk.reviewing'):t('aiTalk.finish'))
            : t('aiTalk.finish')}
        </button>
      )}

      {review&&(
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={()=>void complete()}
        >
          {busy?t('aiTalk.finishing'):t('aiTalk.reviewDone')}
        </button>
      )}
    </article>
  );
}
