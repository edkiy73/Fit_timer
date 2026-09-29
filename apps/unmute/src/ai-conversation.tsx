import { useMemo, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { LexiconText } from './lexicon-ui';
import { requestTalkReply, type TalkMessage } from './ai-talk';

type AIActivity=Extract<Activity,{type:'ai-conversation'}>;

function localized(text:Record<string,string>,locale:string):string{
  return text[locale]||text.ru||text.en||Object.values(text)[0]||'';
}

function randomConversationId():string{
  try{
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID().replace(/-/g,'');
  }catch{}
  return 'talk_'+Date.now().toString(36)+Math.random().toString(36).slice(2,14);
}

function errorKey(code:string):string{
  if(code==='auth_required')return 'aiTalk.authRequired';
  if(code==='premium_required')return 'aiTalk.trialEnded';
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
  requestReply=requestTalkReply
}:{
  activity:AIActivity;
  setId:string;
  saveSeen:(setId:string,activityId:string)=>Promise<void>;
  onDone:()=>void;
  onSignIn:()=>void;
  requestReply?:typeof requestTalkReply;
}){
  const {t,locale}=useI18n();
  const conversationId=useMemo(()=>randomConversationId(),[activity.id]);
  const [messages,setMessages]=useState<TalkMessage[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [started,setStarted]=useState(false);
  const [error,setError]=useState('');
  const [correction,setCorrection]=useState('');
  const [note,setNote]=useState('');
  const [premium,setPremium]=useState<boolean|null>(null);

  const ask=async(message:string)=>{
    if(busy)return;
    setBusy(true);
    setError('');
    setCorrection('');
    setNote('');
    try{
      const nextHistory=message==='[START_CONVERSATION]'
        ? messages
        : [...messages,{role:'user' as const,text:message}];
      if(message!=='[START_CONVERSATION]')setMessages(nextHistory);
      const reply=await requestReply({
        conversationId,
        topic:localized(activity.topic,locale),
        promptTemplate:activity.promptTemplate,
        focus:activity.focus,
        history:messages,
        message,
        locale:locale==='en'?'en':'ru'
      });
      setPremium(reply.premium);
      setMessages(current=>[
        ...current,
        {role:'assistant',text:reply.reply}
      ]);
      setCorrection(reply.correction||'');
      setNote(reply.note||'');
      setStarted(true);
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

  return (
    <article className="learn-card ai-talk-card">
      <div className="ai-talk-head">
        <div>
          <div className="eyebrow">{t('aiTalk.eyebrow')}</div>
          <h3><LexiconText text={localized(activity.topic,locale)} refs={activity.lexiconRefs} /></h3>
        </div>
        {premium===false&&<span className="today-badge">{t('aiTalk.trial')}</span>}
        {premium===true&&<span className="today-badge">{t('aiTalk.plus')}</span>}
      </div>

      {!started&&messages.length===0&&!error&&(
        <div className="ai-talk-intro">
          <p>{t('aiTalk.intro')}</p>
          <button className="primary-button" type="button" disabled={busy} onClick={()=>void ask('[START_CONVERSATION]')}>
            {busy?t('aiTalk.starting'):t('aiTalk.start')}
          </button>
        </div>
      )}

      {messages.length>0&&(
        <div className="ai-talk-thread" aria-live="polite">
          {messages.map((message,index)=>(
            <div className={'ai-talk-message ai-talk-'+message.role} key={index}>
              <small>{message.role==='user'?t('aiTalk.you'):t('aiTalk.partner')}</small>
              <div><LexiconText text={message.text} refs={activity.lexiconRefs} /></div>
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

      {error&&(
        <div className="learn-feedback learn-feedback-wrong" role="alert">
          <strong>{t(errorKey(error))}</strong>
          {error==='auth_required'&&(
            <button className="secondary-button" type="button" onClick={onSignIn}>
              {t('aiTalk.signIn')}
            </button>
          )}
          {error!=='auth_required'&&error!=='premium_required'&&(
            <button className="secondary-button" type="button" onClick={()=>setError('')}>
              {t('today.retry')}
            </button>
          )}
        </div>
      )}

      {started&&!error&&(
        <form className="ai-talk-compose" onSubmit={event=>{
          event.preventDefault();
          const message=input.trim();
          if(message)void ask(message);
        }}>
          <label className="learn-answer">
            <span>{t('aiTalk.answer')}</span>
            <input
              value={input}
              disabled={busy}
              onChange={event=>setInput(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy||!input.trim()}>
            {busy?t('aiTalk.thinking'):t('aiTalk.send')}
          </button>
        </form>
      )}

      {started&&(
        <button className="secondary-button" type="button" disabled={busy} onClick={()=>void finish()}>
          {t('aiTalk.finish')}
        </button>
      )}
    </article>
  );
}
