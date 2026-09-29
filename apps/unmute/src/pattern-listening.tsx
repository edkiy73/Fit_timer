import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { SpeakText } from './speech-web';
import { LexiconText } from './lexicon-ui';

type PatternDrillActivity=Extract<Activity,{type:'pattern-drill'}>;
type LocalizedText=Record<string,string>;

export interface PatternListeningViewProps {
  activity:PatternDrillActivity;
  setId:string;
  distractors:LocalizedText[];
  onDone:()=>void;
  savePractice:(
    setId:string,
    activityId:string,
    mode:'listening',
    correct:boolean,
    score:number
  )=>Promise<void>;
  speak:SpeakText;
  random?:()=>number;
}

function localized(text:LocalizedText,locale:string):string{
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

export function pickListeningItems(
  activity:PatternDrillActivity,
  random:()=>number=Math.random
):PatternDrillActivity['items']{
  return shuffle(activity.items,random).slice(0,6);
}

export function buildListeningOptions(
  correct:LocalizedText,
  distractors:LocalizedText[],
  locale:string,
  random:()=>number=Math.random
):string[]{
  const target=localized(correct,locale);
  const unique=[...new Set(
    distractors
      .map(item=>localized(item,locale))
      .filter(value=>value&&value!==target)
  )];
  const wrong=shuffle(unique,random).slice(0,2);
  return shuffle([target,...wrong],random);
}

export function listeningScore(correct:number,total:number):number{
  return total>0?Math.round(Math.max(0,correct)/total*100):0;
}

export function listeningPassed(correct:number,total:number):boolean{
  return total>0&&correct/total>=0.7;
}

export function PatternListeningView({
  activity,
  setId,
  distractors,
  onDone,
  savePractice,
  speak,
  random=Math.random
}:PatternListeningViewProps){
  const {t,locale}=useI18n();
  const [items,setItems]=useState(()=>pickListeningItems(activity,random));
  const [pos,setPos]=useState(0);
  const [hits,setHits]=useState(0);
  const [phase,setPhase]=useState<'ask'|'show'>('ask');
  const [chosen,setChosen]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [saveError,setSaveError]=useState(false);

  const item=items[pos] ?? null;
  const done=pos>=items.length;
  const score=listeningScore(hits,items.length);
  const passed=listeningPassed(hits,items.length);

  const options=useMemo(
    ()=>item?buildListeningOptions(item.prompt,distractors,locale,random):[],
    [item?.id,locale]
  );

  const target=item?.answer.accepted[0] || '';

  useEffect(()=>{
    if(!item||phase!=='ask'||!target)return;
    void speak(target,'en-US');
  },[item?.id,phase,target,speak]);

  useEffect(()=>{
    if(!done||saved||saving||saveError)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'listening',passed,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,passed,saveError,savePractice,saved,saving,score,setId]);

  const choose=(option:string)=>{
    if(!item||phase!=='ask')return;
    setChosen(option);
    if(option===localized(item.prompt,locale))setHits(value=>value+1);
    setPhase('show');
  };

  const next=()=>{
    setPos(value=>value+1);
    setChosen(null);
    setPhase('ask');
  };

  const reset=()=>{
    setItems(pickListeningItems(activity,random));
    setPos(0);
    setHits(0);
    setPhase('ask');
    setChosen(null);
    setSaving(false);
    setSaved(false);
    setSaveError(false);
  };

  const retrySave=()=>{
    if(saving)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'listening',passed,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  };

  if(done){
    return (
      <article className="learn-card listening-card">
        <div className="eyebrow">{t('listening.mode')}</div>
        <h3><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></h3>
        <div className="drill-result">
          <strong>{t('listening.score',{correct:hits,total:items.length})}</strong>
          <span>{passed?t('listening.passed'):t('listening.retryHint')}</span>
        </div>
        {saveError&&(
          <div className="learn-feedback learn-feedback-wrong" role="alert">
            <strong>{t('listening.saveError')}</strong>
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

  if(!item)return null;
  const correctLabel=localized(item.prompt,locale);
  const isCorrect=chosen===correctLabel;

  return (
    <article className="learn-card listening-card">
      <div className="drill-meta">
        <span><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></span>
        <span>{t('listening.position',{current:pos+1,total:items.length})}</span>
      </div>
      <h3>{t('listening.prompt')}</h3>
      <button className="secondary-button listening-play" type="button" onClick={()=>void speak(target,'en-US')}>
        {t('listening.playAgain')}
      </button>

      {phase==='ask' ? (
        <div className="listening-options">
          {options.map(option=>(
            <button className="listening-option" type="button" key={option} onClick={()=>choose(option)}>
              <LexiconText text={option} refs={activity.lexiconRefs} />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={isCorrect?'learn-feedback learn-feedback-ok':'learn-feedback learn-feedback-wrong'} role="status">
            <strong>{isCorrect?t('learn.correct'):t('listening.incorrect')}</strong>
            <span>{isCorrect?t('listening.correctHint'):t('listening.incorrectHint')}</span>
          </div>
          <div className="drill-target"><LexiconText text={target} refs={activity.lexiconRefs} /></div>
          <div className="learn-hint"><LexiconText text={correctLabel} refs={activity.lexiconRefs} /></div>
          <button className="primary-button" type="button" onClick={next}>
            {pos+1<items.length?t('learn.next'):t('learn.finish')}
          </button>
        </>
      )}

      <div className="learn-hint">{t('listening.sessionStats',{correct:hits,total:items.length})}</div>
    </article>
  );
}
