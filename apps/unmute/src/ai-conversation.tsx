import { useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { LexiconText } from './lexicon-ui';
import {
  requestTalkReply,
  type TalkMessage,
  type TalkReply
} from './ai-talk';

type AIActivity=Extract<Activity,{type:'ai-conversation'}>;

function localized(text:Record<string,string>,locale:string):string{
  return text[locale]||text.ru||text.en||Object.values(text)[0]||'';
}

function errorKey(code:string):string{
  if(code==='auth_required')return 'aiTalk.authRequired';
  if(code==='premium_required')return 'aiTalk.plusRequired';
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
  requestReply=requestTalkReply
}:{
  activity:AIActivity;
  setId:string;
  saveSeen:(setId:string,activityId:string)=>Promise<void>;
  onDone:()=>void;
  onSignIn:()=>void;
  onAccess:()=>void;
  requestReply?:typeof requestTalkReply;
}){
  const {t,locale}=useI18n();
  const [messages,setMessages]=useState<TalkMessage[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [started,setStarted]=useState(false);
  const [error,setError]=useState('');
  const [correction,setCorrection]=useState('');
  const [note,setNote]=useState('');
  const [usage,setUsage]=useState<TalkReply['usage']>();

  const applyReply=(reply:TalkReply)=>{
    setCorrection(reply.correction||'');
    setNote(reply.note||'');
    setUsage(reply.usage);
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
        start:true
      });
      setMessages([{role:'partner',text:reply.reply}]);
      applyReply(reply);
      setStarted(true);
    }catch(err:any){
      setError(String(err?.code||'ai_failed'));
    }finally{
      setBusy(false);
    }
  };

  const send=async(message:string)=>{
    if(busy||!message.trim())return;
    const learnerText=message.trim();
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
        locale:locale==='en'?'en':'ru'
      });
      setMessages(current=>[
        ...current,
        {role:'learner',text:learnerText},
        {role:'partner',text:reply.reply}
      ]);
      applyReply(reply);
      setInput('');
    }catch(err:any){
      setError(String(err?.code||'ai_failed'));
    }finally{
      setBusy(false);
    }
  };

  const finish=async()=>{
    if(!started||busy)return;
    setBusy(true);
    try{
      await saveSeen(setId,activity.id);
      onDone();
    }finally{
      setBusy(false);
    }
  };

  const accessError=error==='auth_required'||error==='premium_required';

  return (
    <article className="learn-card ai-talk-card">
      <div className="ai-talk-head">
        <div>
          <div className="eyebrow">{t('aiTalk.eyebrow')}</div>
          <h3>
            <LexiconText
              text={localized(activity.topic,locale)}
              refs={activity.lexiconRefs}
            />
          </h3>
        </div>
        <span className="today-badge">{t('aiTalk.plus')}</span>
      </div>

      {!started&&messages.length===0&&!error&&(
        <div className="ai-talk-intro">
          <p>{t('aiTalk.intro')}</p>
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

      {messages.length>0&&(
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

      {correction&&(
        <div className="learn-feedback learn-feedback-wrong">
          <strong>{t('aiTalk.correction')}</strong>
          <LexiconText text={correction} refs={activity.lexiconRefs} />
        </div>
      )}

      {note&&(
        <div className="learn-hint">
          <strong>{t('aiTalk.note')}</strong>{' '}
          <LexiconText text={note} refs={activity.lexiconRefs} />
        </div>
      )}

      {usage&&usage.limit>0&&(
        <div className="ai-talk-usage">
          {t('aiTalk.usage',{used:usage.used,limit:usage.limit})}
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
          {error==='premium_required'&&(
            <button className="secondary-button" type="button" onClick={onAccess}>
              {t('aiTalk.openPlus')}
            </button>
          )}
          {!accessError&&(
            <button className="secondary-button" type="button" onClick={()=>setError('')}>
              {t('today.retry')}
            </button>
          )}
        </div>
      )}

      {started&&!accessError&&(
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
              disabled={busy}
              onChange={event=>setInput(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={busy||!input.trim()}
          >
            {busy?t('aiTalk.thinking'):t('aiTalk.send')}
          </button>
        </form>
      )}

      {started&&(
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={()=>void finish()}
        >
          {t('aiTalk.finish')}
        </button>
      )}
    </article>
  );
}
