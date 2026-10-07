import { reportAiError } from './observability';
import { useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { LexiconText } from './lexicon-ui';
import {
  requestAnswerExplanation,
  type AnswerExplanation,
  type AnswerExplainInput
} from './ai-answer';

type LexiconRefs=Activity['lexiconRefs'];

function errorKey(code:string):string{
  if(code==='auth_required')return 'answerExplain.authRequired';
  if(code==='premium_required')return 'answerExplain.plusRequired';
  if(code==='free_explain_used')return 'answerExplain.freeUsed';
  if(code==='ai_limit')return 'answerExplain.limit';
  if(code==='ai_timeout')return 'answerExplain.timeout';
  if(code==='ai_bad_response')return 'answerExplain.badResponse';
  return 'answerExplain.failed';
}

export function AnswerExplanationView({
  question,
  learnerAnswer,
  acceptedAnswers,
  courseExplanation='',
  refs,
  onSignIn,
  onAccess,
  requestExplain=requestAnswerExplanation,
  compact=false
}:{
  question:string;
  learnerAnswer:string;
  acceptedAnswers:string[];
  courseExplanation?:string;
  refs?:LexiconRefs;
  onSignIn:()=>void;
  onAccess:()=>void;
  requestExplain?:typeof requestAnswerExplanation;
  compact?:boolean;
}){
  const {t,locale}=useI18n();
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<AnswerExplanation|null>(null);
  const [error,setError]=useState('');

  const run=async()=>{
    if(busy)return;
    setBusy(true);
    setError('');
    try{
      const input:AnswerExplainInput={
        question,
        learnerAnswer,
        acceptedAnswers,
        courseExplanation,
        locale:locale==='en'?'en':'ru'
      };
      setResult(await requestExplain(input));
    }catch(err:any){
      setError(String(err?.code||'ai_failed'));
      reportAiError(err);
    }finally{
      setBusy(false);
    }
  };

  if(result){
    return (
      <div className={'answer-explain-result'+(compact?' is-compact':'')} aria-live="polite">
        <div>
          <strong>{t('answerExplain.whyTitle')}</strong>
          <p>{refs
            ? <LexiconText text={result.why} refs={refs} />
            : <LexiconText text={result.why} />
          }</p>
        </div>
        <div>
          <strong>{t('answerExplain.tipTitle')}</strong>
          <p>{refs
            ? <LexiconText text={result.tip} refs={refs} />
            : <LexiconText text={result.tip} />
          }</p>
        </div>
        {/* A counter only when there is a real limit: no «0 из 0» for an unlimited or unknown one. */}
        {result.freeRemaining!==undefined&&(result.freeLimit??0)>0
          ? <small>{t('answerExplain.freeLeft',{count:result.freeRemaining,limit:result.freeLimit??0})}</small>
          : result.usage&&result.usage.limit>0&&(
            <small>{t('answerExplain.usage',{used:result.usage.used,limit:result.usage.limit})}</small>
          )}
      </div>
    );
  }

  const needsPlus=error==='premium_required'||error==='free_explain_used';
  const accessError=error==='auth_required'||needsPlus;

  return (
    <div className={'answer-explain'+(compact?' is-compact':'')+(error?' is-error':'')}>
      {!error&&(
        <button className="secondary-button" type="button" disabled={busy} onClick={()=>void run()}>
          {busy?t('answerExplain.loading'):t('answerExplain.button')}
        </button>
      )}
      {error&&(
        <div className="answer-explain-error" role="alert">
          <span>{t(errorKey(error))}</span>
          {error==='auth_required'&&(
            <button className="secondary-button" type="button" onClick={onSignIn}>
              {t('aiTalk.signIn')}
            </button>
          )}
          {needsPlus&&(
            <button className="secondary-button" type="button" onClick={onAccess}>
              {t('aiTalk.openPlus')}
            </button>
          )}
          {!accessError&&(
            <button className="secondary-button" type="button" onClick={()=>void run()}>
              {t('today.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
