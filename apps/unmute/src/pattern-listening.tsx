import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { AnswerFeedbackSheet } from './answer-feedback-sheet';
import type { Activity } from './content/schema';
import type { SpeakText } from './speech-web';
import { ExerciseKind } from './exercise-kind';
import { LexiconText } from './lexicon-ui';
import { ENGLISH_SPEECH_LOCALE } from './speech-locale';
import type { PracticeItemGrade } from './engine/practice-srs';
import { readPracticeRunState, writePracticeRunState } from './practice-run-state';

type PatternDrillActivity=Extract<Activity,{type:'pattern-drill'}>;
type LocalizedText=Record<string,string>;

interface ListeningRunSession {
  version:1;
  activityRevision:number;
  itemIds:string[];
  pos:number;
  hits:number;
  phase:'ask'|'show';
  chosen:string|null;
  saved:boolean;
  saveError:boolean;
  firstPassGrades?:Record<string,PracticeItemGrade>;
}

function restoredListeningSession(activity:PatternDrillActivity,key:string|undefined){
  const saved=readPracticeRunState<ListeningRunSession>(key);
  if(!saved||saved.version!==1||saved.activityRevision!==activity.revision)return null;
  const byId=new Map(activity.items.map(item=>[item.id,item] as const));
  const items=saved.itemIds.map(id=>byId.get(id)).filter((item):item is PatternDrillActivity['items'][number]=>Boolean(item));
  if(items.length!==saved.itemIds.length||saved.pos<0||saved.pos>items.length)return null;
  return {...saved,items};
}

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
    score:number,
    itemGrades?:Readonly<Record<string,PracticeItemGrade>>
  )=>Promise<void>;
  speak:SpeakText;
  random?:()=>number;
  onProgress?:(current:number,total:number)=>void;
  active?:boolean;
  sessionKey?:string;
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
  return shuffle(activity.items,random);
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
  random=Math.random,
  onProgress,
  active=true,
  sessionKey
}:PatternListeningViewProps){
  const {t,locale}=useI18n();
  const base=activity.items.length;
  const restored=restoredListeningSession(activity,sessionKey);
  const [items,setItems]=useState(()=>restored?.items??pickListeningItems(activity,random));
  const [pos,setPos]=useState(()=>restored?.pos??0);
  const [hits,setHits]=useState(()=>restored?.hits??0);
  const [phase,setPhase]=useState<'ask'|'show'>(()=>restored?.phase??'ask');
  const [chosen,setChosen]=useState<string|null>(()=>restored?.chosen??null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(()=>Boolean(restored?.saved));
  const [saveError,setSaveError]=useState(()=>Boolean(restored?.saveError));
  const [firstPassGrades,setFirstPassGrades]=useState<Record<string,PracticeItemGrade>>(
    ()=>restored?.firstPassGrades??{}
  );

  const item=items[pos] ?? null;
  const done=pos>=items.length;
  const score=listeningScore(hits,base);
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
      chosen,
      saved,
      saveError,
      firstPassGrades
    } satisfies ListeningRunSession);
  },[activity.revision,chosen,firstPassGrades,hits,items,phase,pos,saveError,saved,sessionKey]);

  useEffect(()=>{ if(active)onProgress?.(Math.min(pos+1,base),base); },[active,base,onProgress,pos]);

  const options=useMemo(
    ()=>item?buildListeningOptions(item.prompt,distractors,locale,random):[],
    [item?.id,locale]
  );

  const target=item?.answer.accepted[0] || '';

  useEffect(()=>{
    if(!active||!item||phase!=='ask'||!target)return;
    void speak(target,ENGLISH_SPEECH_LOCALE);
  },[active,item?.id,phase,target,speak]);

  useEffect(()=>{
    if(!done||saved||saving||saveError)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'listening',strongFirstPass,score,firstPassGrades)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  },[activity.id,done,firstPassGrades,saveError,savePractice,saved,saving,score,setId,strongFirstPass]);

  const choose=(option:string)=>{
    if(!item||phase!=='ask')return;
    if(chosen!==option){
      setChosen(option);
      return;
    }
    const correct=option===localized(item.prompt,locale);
    if(pos<base){
      if(correct)setHits(value=>value+1);
      setFirstPassGrades(current=>({
        ...current,
        [item.id]:correct?'strong':'weak'
      }));
    }
    if(!correct)setItems(current=>[...current,item]);
    setPhase('show');
  };

  const next=()=>{
    setPos(value=>value+1);
    setChosen(null);
    setPhase('ask');
  };

  const retrySave=()=>{
    if(saving)return;
    setSaving(true);
    setSaveError(false);
    void savePractice(setId,activity.id,'listening',strongFirstPass,score,firstPassGrades)
      .then(()=>setSaved(true))
      .catch(()=>setSaveError(true))
      .finally(()=>setSaving(false));
  };

  if(done){
    return (
      <article className="learn-card listening-card">
        <ExerciseKind kind="listening" />
        <div className="eyebrow">{t('listening.mode')}</div>
        <h3><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></h3>
        <div className="drill-result">
          <strong>{t('listening.score',{correct:hits,total:base})}</strong>
          <span>{strongFirstPass?t('listening.passed'):t('listening.corrected')}</span>
        </div>
        {saveError&&(
          <div className="learn-feedback learn-feedback-wrong learn-save-error" role="alert">
            <strong>{t('listening.saveError')}</strong>
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
  const correctLabel=localized(item.prompt,locale);
  const isCorrect=chosen===correctLabel;

  return (
    <article className="learn-card listening-card">
        <ExerciseKind kind="listening" />
      <div className="drill-meta">
        <span><LexiconText text={localized(activity.pattern,locale)} refs={activity.lexiconRefs} /></span>
        <span>{correcting
          ? t('drill.correctionRemaining',{count:correctionRemaining})
          : t('listening.position',{current:pos+1,total:base})}</span>
      </div>
      <h3>{t('listening.prompt')}</h3>
      <button className="link-button listening-play" type="button" onClick={()=>void speak(target,ENGLISH_SPEECH_LOCALE)}>
        {t('listening.playAgain')}
      </button>

      {phase==='ask' ? (
        <div className="listening-options">
          {options.map(option=>(
            <button
              className={'listening-option'+(chosen===option?' is-selected':'')}
              type="button"
              key={option}
              aria-pressed={chosen===option}
              onClick={()=>choose(option)}
            >
              <LexiconText text={option} refs={activity.lexiconRefs} interactive={false} />
              {chosen===option&&<span className="listening-option-confirm">{t('learn.tapAgain')}</span>}
            </button>
          ))}
        </div>
      ) : active&&(
        <AnswerFeedbackSheet
          tone={isCorrect?'correct':'wrong'}
          title={isCorrect?t('learn.correct'):t('listening.incorrect')}
          actions={
            <button className="primary-button learn-feedback-next" type="button" onClick={next}>
              {t('learn.next')}
            </button>
          }
        >
          <div className="drill-target"><LexiconText text={target} refs={activity.lexiconRefs} /></div>
          <div className="learn-hint"><LexiconText text={correctLabel} refs={activity.lexiconRefs} /></div>
          {item?.explanation&&(
            <p className="drill-explanation"><LexiconText text={localized(item.explanation,locale)} refs={activity.lexiconRefs} /></p>
          )}
        </AnswerFeedbackSheet>
      )}

    </article>
  );
}
