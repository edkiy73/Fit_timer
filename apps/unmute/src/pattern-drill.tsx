import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';

type PatternDrillActivity=Extract<Activity,{type:'pattern-drill'}>;

export interface PatternDrillViewProps {
  activity:PatternDrillActivity;
  setId:string;
  onDone:()=>void;
  savePractice:(
    setId:string,
    activityId:string,
    mode:'drill',
    correct:boolean,
    score:number
  )=>Promise<void>;
  variant?:'practice'|'mixed';
}

function localized(text:Record<string,string>,locale:string):string{
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export function drillReadMs(prompt:string):number{
  const words=prompt.split(/\s+/).filter(Boolean).length;
  return Math.min(3200,Math.max(1200,600+320*words));
}

export function drillSayMs(answer:string):number{
  const words=answer.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(6500,Math.max(2200,1400+550*words));
}

export function drillScore(fast:number,total:number):number{
  return total>0?Math.round(Math.max(0,fast)/total*100):0;
}

export function drillPassed(fast:number,total:number):boolean{
  return total>0&&fast/total>=0.7;
}

export function PatternDrillView({
  activity,
  setId,
  onDone,
  savePractice,
  variant='practice'
}:PatternDrillViewProps){
  const {t,locale}=useI18n();
  // The drill has a fixed number of phrases; a missed one is replayed once at the end
  // («Повтор: 1 из 2») instead of growing the count.
  const base=activity.items.length;
  const [items,setItems]=useState(()=>activity.items.slice());
  const [pos,setPos]=useState(0);
  const [fast,setFast]=useState(0);
  const [slow,setSlow]=useState(0);
  const [phase,setPhase]=useState<'ask'|'show'>('ask');
  const [lastFast,setLastFast]=useState<boolean|null>(null);
  // «Не получилось»: the answer is shown and the phrase simply comes back — nothing to compare.
  const [gaveUp,setGaveUp]=useState(false);
  const [stage,setStage]=useState<'reading'|'speaking'>('reading');
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(variant==='mixed');
  const [saveError,setSaveError]=useState(false);
  const deadlineRef=useRef(0);
  const item=items[pos] ?? null;
  const done=pos>=items.length;
  const score=drillScore(fast,base);
  const passed=drillPassed(fast,base);
  const replaying=pos>=base;

  useEffect(()=>{
    if(!item||phase!=='ask')return;
    const readMs=drillReadMs(localized(item.prompt,locale));
    const sayMs=drillSayMs(item.answer.accepted[0]||'');
    const graceMs=600;
    const started=Date.now();
    deadlineRef.current=started+readMs+sayMs+graceMs;
    setStage('reading');
    const speakTimer=window.setTimeout(()=>setStage('speaking'),readMs);
    const revealTimer=window.setTimeout(()=>{
      setLastFast(false);
      setPhase('show');
    },readMs+sayMs+graceMs);
    return ()=>{
      window.clearTimeout(speakTimer);
      window.clearTimeout(revealTimer);
    };
  },[item?.id,locale,phase]);

  useEffect(()=>{
    if(variant==='mixed'||!done||saved||saving||saveError)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'drill',passed,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,passed,savePractice,saved,saving,score,setId,variant]);

  const reveal=(wasFast:boolean,failed=false)=>{
    if(phase!=='ask')return;
    setLastFast(wasFast);
    setGaveUp(failed);
    setPhase('show');
  };

  const said=()=>{
    reveal(Date.now()<=deadlineRef.current);
  };

  const nextItem=(same:boolean)=>{
    if(!item)return;
    let nextItems=items;
    let nextFast=fast;
    let nextSlow=slow;
    // Only the first round counts toward the result; replays are for practice.
    if(pos<base){
      if(same&&lastFast)nextFast++;
      else nextSlow++;
      if(!same)nextItems=[...items,item];
    }
    setItems(nextItems);
    setFast(nextFast);
    setSlow(nextSlow);
    setPos(current=>current+1);
    setLastFast(null);
    setGaveUp(false);
    setPhase('ask');
  };

  const reset=()=>{
    setItems(activity.items.slice());
    setPos(0);
    setFast(0);
    setSlow(0);
    setLastFast(null);
    setPhase('ask');
    setStage('reading');
    setSaved(variant==='mixed');
    setSaving(false);
    setSaveError(false);
  };

  const retrySave=()=>{
    if(saving)return;
    setSaveError(false);
    setSaving(true);
    void savePractice(setId,activity.id,'drill',passed,score)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  };

  if(done){
    return (
      <article className="learn-card drill-card">
        <ExerciseKind kind="drill" />
        <div className="eyebrow">{variant==='mixed'?t('mixed.eyebrow'):t('drill.mode')}</div>
        <h3>{variant==='mixed'?t('mixed.title'):<LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} />}</h3>
        <div className="drill-result">
          <strong>{t('drill.score',{fast,total:base})}</strong>
          <span>
            {variant==='mixed'
              ? (passed?t('mixed.passed'):t('mixed.retryHint'))
              : (passed?t('drill.passed'):t('drill.retryHint'))}
          </span>
        </div>
        {saveError&&(
          <div className="learn-feedback learn-feedback-wrong" role="alert">
            <strong>{t('drill.saveError')}</strong>
            <button className="secondary-button" type="button" onClick={retrySave}>
              {t('today.retry')}
            </button>
          </div>
        )}
        {variant==='mixed' ? (
          <>
            <button className="primary-button" type="button" onClick={reset}>
              {t('drill.again')}
            </button>
            <button className="secondary-button" type="button" onClick={onDone}>
              {t('mixed.backReview')}
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
        {saving&&<span className="learn-hint" role="status">{t('drill.saving')}</span>}
      </article>
    );
  }

  if(!item)return null;
  const prompt=localized(item.prompt,locale);
  const accepted=item.answer.accepted[0] || '';
  const explanation=item.explanation?localized(item.explanation,locale):'';

  return (
    <article className="learn-card drill-card">
        <ExerciseKind kind="drill" />
      <div className="drill-meta">
        <span>{variant==='mixed'?t('mixed.title'):<LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} />}</span>
        <span>{replaying
          ? t('drill.replayPosition',{current:pos-base+1,total:items.length-base})
          : t('drill.position',{current:pos+1,total:base})}</span>
      </div>
      <h3><LexiconText text={prompt} refs={activity.lexiconRefs} /></h3>

      {phase==='ask' ? (
        <>
          <div className="drill-timer" data-stage={stage} aria-label={t('drill.timer')}>
            <span />
          </div>
          <p className="learn-hint">
            {stage==='reading'?t('drill.reading'):t('drill.speaking')}
          </p>
          <button className="primary-button" type="button" onClick={said}>
            {t('drill.said')}
          </button>
          <button className="secondary-button" type="button" onClick={()=>reveal(false,true)}>
            {t('drill.couldNot')}
          </button>
        </>
      ) : (
        <>
          {gaveUp ? (
            <div className="learn-feedback learn-feedback-neutral">
              <strong>{t('drill.gaveUp')}</strong>
              <span>{t(replaying?'drill.gaveUpHintLast':'drill.gaveUpHint')}</span>
            </div>
          ) : (
            <div className={lastFast?'learn-feedback learn-feedback-ok':'learn-feedback learn-feedback-neutral'}>
              <strong>{lastFast?t('drill.fast'):t('drill.slow')}</strong>
              <span>{t('drill.compare')}</span>
            </div>
          )}
          <div className="drill-target"><LexiconText text={accepted} refs={activity.lexiconRefs} /></div>
          {explanation&&(
            <p className="drill-explanation"><LexiconText text={explanation} refs={activity.lexiconRefs} /></p>
          )}
          {gaveUp ? (
            <button className="primary-button" type="button" onClick={()=>nextItem(false)}>
              {t('learn.next')}
            </button>
          ) : (
            <>
              <div className="drill-compare-actions">
                <button className="primary-button" type="button" onClick={()=>nextItem(true)}>
                  {t('drill.same')}
                </button>
                <button className="secondary-button" type="button" onClick={()=>nextItem(false)}>
                  {t('drill.wrong')}
                </button>
              </div>
              {!lastFast&&(
                <button className="learn-back" type="button" onClick={()=>setLastFast(true)}>
                  {t('drill.wasFast')}
                </button>
              )}
            </>
          )}
        </>
      )}

      <div className="learn-hint">
        {t('drill.sessionStats',{fast,slow})}
      </div>
    </article>
  );
}
