import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';
import { AnswerFeedbackSheet } from './answer-feedback-sheet';

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
  onProgress?:(current:number,total:number)=>void;
}

function localized(text:Record<string,string>,locale:string):string{
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

export function drillReadMs(prompt:string):number{
  const words=prompt.split(/\s+/).filter(Boolean).length;
  return Math.min(3200,Math.max(1200,600+320*words));
}

export const DRILL_GRACE_MS=600;

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
  variant='practice',
  onProgress
}:PatternDrillViewProps){
  const {t,locale}=useI18n();
  // The admin controls the phrase count. A missed phrase is replayed once at the end
  // without growing the base count.
  const base=activity.items.length;
  const [items,setItems]=useState(()=>activity.items.slice());
  const [pos,setPos]=useState(0);
  const [fast,setFast]=useState(0);
  const [slow,setSlow]=useState(0);
  const [phase,setPhase]=useState<'ask'|'show'>('ask');
  const [lastFast,setLastFast]=useState<boolean|null>(null);
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

  useEffect(()=>{ onProgress?.(Math.min(pos+1,base),base); },[base,onProgress,pos]);

  useEffect(()=>{
    if(!item||phase!=='ask')return;
    const readMs=drillReadMs(localized(item.prompt,locale));
    const sayMs=drillSayMs(item.answer.accepted[0]||'');
    const graceMs=DRILL_GRACE_MS;
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

  const reveal=()=>{
    if(phase!=='ask')return;
    setLastFast(Date.now()<=deadlineRef.current);
    setPhase('show');
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
          <div className="learn-feedback learn-feedback-wrong learn-save-error" role="alert">
            <strong>{t('drill.saveError')}</strong>
            <span>{t('learn.saveErrorHint')}</span>
            <button className="secondary-button" type="button" onClick={retrySave}>
              {t('learn.retrySave')}
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
            <span style={{animationDuration:`${drillSayMs(accepted)+DRILL_GRACE_MS}ms`}} />
          </div>
          <p className="learn-hint">
            {stage==='reading'
              ? t('drill.reading')
              : t('drill.speaking',{seconds:Math.ceil((drillSayMs(accepted)+DRILL_GRACE_MS)/1000)})}
          </p>
          <div className="runner-action">
            <button className="primary-button" type="button" onClick={reveal}>
              {t('drill.showAnswer')}
            </button>
          </div>
        </>
      ) : (
        <AnswerFeedbackSheet
          tone={lastFast?'correct':'near'}
          title={lastFast?t('drill.fast'):t('drill.slow')}
          subtitle={<span>{t('drill.compare')}</span>}
          actions={
            <>
              <button className="secondary-button" type="button" onClick={()=>nextItem(false)}>
                {t('drill.wrong')}
              </button>
              <button className="primary-button learn-feedback-next" type="button" onClick={()=>nextItem(true)}>
                {t('drill.same')}
              </button>
            </>
          }
        >
          <div className="drill-target"><LexiconText text={accepted} refs={activity.lexiconRefs} /></div>
          {explanation&&(
            <p className="drill-explanation"><LexiconText text={explanation} refs={activity.lexiconRefs} /></p>
          )}
        </AnswerFeedbackSheet>
      )}

    </article>
  );
}
