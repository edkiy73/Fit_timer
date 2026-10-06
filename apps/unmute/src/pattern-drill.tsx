import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';
import { AnswerFeedbackSheet } from './answer-feedback-sheet';
import type { PracticeItemGrade } from './engine/practice-srs';
import { readPracticeRunState, writePracticeRunState } from './practice-run-state';

type PatternDrillActivity=Extract<Activity,{type:'pattern-drill'}>;

interface DrillRunSession {
  version:1;
  activityRevision:number;
  itemIds:string[];
  pos:number;
  fast:number;
  slow:number;
  phase:'ask'|'show';
  lastFast:boolean|null;
  saved:boolean;
  saveError:boolean;
  firstPassGrades?:Record<string,PracticeItemGrade>;
}

function restoredDrillSession(activity:PatternDrillActivity,key:string|undefined){
  const saved=readPracticeRunState<DrillRunSession>(key);
  if(!saved||saved.version!==1||saved.activityRevision!==activity.revision)return null;
  const byId=new Map(activity.items.map(item=>[item.id,item] as const));
  const items=saved.itemIds.map(id=>byId.get(id)).filter((item):item is PatternDrillActivity['items'][number]=>Boolean(item));
  if(items.length!==saved.itemIds.length||saved.pos<0||saved.pos>items.length)return null;
  return {...saved,items};
}

export interface PatternDrillViewProps {
  activity:PatternDrillActivity;
  setId:string;
  onDone:()=>void;
  savePractice:(
    setId:string,
    activityId:string,
    mode:'drill',
    correct:boolean,
    score:number,
    itemGrades?:Readonly<Record<string,PracticeItemGrade>>
  )=>Promise<void>;
  variant?:'practice'|'mixed';
  onProgress?:(current:number,total:number)=>void;
  active?:boolean;
  sessionKey?:string;
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

export function drillCommitOnTime(commitAt:number,nominalDeadline:number):boolean{
  return commitAt<=nominalDeadline+DRILL_GRACE_MS;
}

export function drillAttemptResolved(same:boolean,onTime:boolean):boolean{
  return same&&onTime;
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
  onProgress,
  active=true,
  sessionKey
}:PatternDrillViewProps){
  const {t,locale}=useI18n();
  // The admin controls the phrase count. Failed/slow phrases return in correction
  // until each one is both correct and on time; retries never grow the base count.
  const base=activity.items.length;
  const restored=variant==='mixed'?null:restoredDrillSession(activity,sessionKey);
  const [items,setItems]=useState(()=>restored?.items??activity.items.slice());
  const [pos,setPos]=useState(()=>restored?.pos??0);
  const [fast,setFast]=useState(()=>restored?.fast??0);
  const [slow,setSlow]=useState(()=>restored?.slow??0);
  const [phase,setPhase]=useState<'ask'|'show'>(()=>restored?.phase??'ask');
  const [lastFast,setLastFast]=useState<boolean|null>(()=>restored?.lastFast??null);
  const [stage,setStage]=useState<'reading'|'speaking'>('reading');
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(()=>variant==='mixed'||Boolean(restored?.saved));
  const [saveError,setSaveError]=useState(()=>Boolean(restored?.saveError));
  const [firstPassGrades,setFirstPassGrades]=useState<Record<string,PracticeItemGrade>>(
    ()=>restored?.firstPassGrades??{}
  );
  const deadlineRef=useRef(0);
  const activationRef=useRef<number|null>(null);
  const item=items[pos] ?? null;
  const done=pos>=items.length;
  const score=drillScore(fast,base);
  const passed=drillPassed(fast,base);
  const strongFirstPass=base>0&&fast===base;
  const replaying=pos>=base;
  const correctionRemaining=replaying
    ? new Set(items.slice(pos).map(entry=>entry.id)).size
    : 0;

  useEffect(()=>{
    if(variant==='mixed')return;
    writePracticeRunState(sessionKey,{
      version:1,
      activityRevision:activity.revision,
      itemIds:items.map(item=>item.id),
      pos,
      fast,
      slow,
      phase,
      lastFast,
      saved,
      saveError,
      firstPassGrades
    } satisfies DrillRunSession);
  },[activity.revision,fast,firstPassGrades,items,lastFast,phase,pos,saveError,saved,sessionKey,slow,variant]);

  useEffect(()=>{ if(active)onProgress?.(Math.min(pos+1,base),base); },[active,base,onProgress,pos]);

  useEffect(()=>{
    if(!active||!item||phase!=='ask')return;
    const readMs=drillReadMs(localized(item.prompt,locale));
    const sayMs=drillSayMs(item.answer.accepted[0]||'');
    const started=Date.now();
    // Nominal learning deadline excludes the hidden reaction/tap grace.
    deadlineRef.current=started+readMs+sayMs;
    activationRef.current=null;
    setStage('reading');
    const speakTimer=window.setTimeout(()=>setStage('speaking'),readMs);
    const revealTimer=window.setTimeout(()=>{
      activationRef.current=null;
      setLastFast(false);
      setPhase('show');
    },readMs+sayMs+DRILL_GRACE_MS);
    return ()=>{
      window.clearTimeout(speakTimer);
      window.clearTimeout(revealTimer);
    };
  },[active,item?.id,locale,phase]);

  useEffect(()=>{
    if(variant==='mixed'||!done||saved||saving||saveError)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'drill',strongFirstPass,score,firstPassGrades)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,firstPassGrades,savePractice,saved,saving,score,setId,strongFirstPass,variant]);

  const captureActivation=()=>{
    if(phase!=='ask'||activationRef.current!==null)return;
    activationRef.current=Date.now();
  };

  const reveal=()=>{
    if(phase!=='ask')return;
    const commitAt=activationRef.current??Date.now();
    activationRef.current=null;
    setLastFast(drillCommitOnTime(commitAt,deadlineRef.current));
    setPhase('show');
  };

  const nextItem=(same:boolean)=>{
    if(!item)return;
    let nextItems=items;
    let nextFast=fast;
    let nextSlow=slow;
    const resolved=drillAttemptResolved(same,lastFast===true);
    // Only the first round defines quality/SRS. Correction attempts only resolve the unit.
    if(pos<base){
      if(resolved)nextFast++;
      else nextSlow++;
      setFirstPassGrades(current=>({
        ...current,
        [item.id]:resolved?'strong':'weak'
      }));
    }
    // A slow-but-correct phrase is still unresolved for this mode, exactly like a mismatch.
    // During correction it keeps returning until it is both correct and on time.
    if(!resolved)nextItems=[...items,item];
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
    setFirstPassGrades({});
  };

  const retrySave=()=>{
    if(saving)return;
    setSaveError(false);
    setSaving(true);
    void savePractice(setId,activity.id,'drill',strongFirstPass,score,firstPassGrades)
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
              : t('drill.passed')}
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
            <button className="primary-button" type="button" disabled={!saved} onClick={onDone}>
              {t('learn.next')}
            </button>
            <button className="secondary-button" type="button" disabled={!saved} onClick={reset}>
              {t('drill.again')}
            </button>
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
          ? t('drill.correctionRemaining',{count:correctionRemaining})
          : t('drill.position',{current:pos+1,total:base})}</span>
      </div>
      <h3><LexiconText text={prompt} refs={activity.lexiconRefs} /></h3>

      {phase==='ask' ? (
        <>
          <div className="drill-timer" data-stage={stage} aria-label={t('drill.timer')}>
            <span style={{animationDuration:`${drillSayMs(accepted)}ms`}} />
          </div>
          <p className="learn-hint">
            {stage==='reading'
              ? t('drill.reading')
              : t('drill.speaking',{seconds:Math.ceil(drillSayMs(accepted)/1000)})}
          </p>
          <div className="runner-action">
            <button
              className="primary-button"
              type="button"
              onPointerDown={captureActivation}
              onKeyDown={event=>{
                if(event.key==='Enter'||event.key===' ')captureActivation();
              }}
              onClick={reveal}
            >
              {t('drill.said')}
            </button>
          </div>
        </>
      ) : active&&(
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
