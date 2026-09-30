import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity, RoadmapNode } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { checkAnswer } from './engine/answer-check';
import type { PracticeSrsKind } from './engine/practice-srs';
import { saveDialogueActivity, saveGradedActivity, savePracticeActivity, saveSeenActivity } from './activity-progress';
import type { SpeakText, StartRecognition } from './speech-runtime';
import { speakText, startRecognition as startSpeechRecognition } from './speech-runtime';
import { PatternPracticeView } from './pattern-practice';
import { DialogueView } from './dialogue';
import { LexiconText } from './lexicon-ui';
import { isNodeUnlockedByPurchase } from './content/access';
import { AIConversationView } from './ai-conversation';
import { AnswerExplanationView } from './answer-explanation';
import { trackDayCompleted, trackLessonCompleted } from './observability';
import { Icon } from './icons';
import { stageForDay, stageNameKey } from './course-stages';

function localized(text:Record<string,string>|undefined,locale:string):string{
  if(!text)return '';
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

function plainTheory(activity:Extract<Activity,{type:'theory'}>,locale:string):string{
  const body=localized(activity.body,locale);
  if(activity.format!=='html')return body;
  if(typeof DOMParser==='undefined')return body.replace(/<[^>]+>/g,' ');
  const source=body
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(p|li|h[1-6]|blockquote)>/gi,'\n');
  const doc=new DOMParser().parseFromString(source,'text/html');
  return (doc.body.textContent||'')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

export function activitiesForNode(
  activities:Activity[],
  node:RoadmapNode
):Activity[]{
  const byId=new Map(activities.map(activity=>[activity.id,activity]));
  return node.activityIds
    .map(id=>byId.get(id))
    .filter((activity):activity is Activity=>Boolean(activity));
}

export function firstPendingActivityIndex(
  activities:Activity[],
  progress:CourseProgressDocument
):number{
  const index=activities.findIndex(activity=>{
    const seen=progress.seen[activity.id];
    return !seen || seen.deleted;
  });
  return index<0?0:index;
}

/** Segmented progress for short lessons; a plain bar when there are too many steps to draw. */
function RunnerProgress({current,total,label}:{current:number;total:number;label:string}){
  const segments=total<=30;
  return (
    <div className="runner-progress" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={Math.max(1,total)} aria-valuenow={current+1}>
      {segments
        ? Array.from({length:total},(_,step)=>(
            <span key={step} className={step<current?'is-done':step===current?'is-current':''} />
          ))
        : <span className="runner-bar" style={{transform:`scaleX(${total?(current+1)/total:0})`}} />}
    </div>
  );
}

export interface NodeRunnerViewProps {
  runtime:LearnerCourseRuntimeValue;
  nodeId:string;
  onExit:()=>void;
  onSignIn?:()=>void;
  onAccess?:()=>void;
  onNodeCompleted?:(node:RoadmapNode)=>void;
  saveSeen:(setId:string,activityId:string)=>Promise<void>;
  saveGraded:(setId:string,activityId:string,correct:boolean)=>Promise<void>;
  savePractice:(
    setId:string,
    activityId:string,
    mode:PracticeSrsKind,
    correct:boolean,
    score?:number
  )=>Promise<void>;
  saveDialogue?:(setId:string,activityId:string,score:number)=>Promise<void>;
  speak?:SpeakText;
  startRecognition?:StartRecognition;
}

export function NodeRunnerView({
  runtime,
  nodeId,
  onExit,
  onSignIn=()=>{},
  onAccess=()=>{},
  onNodeCompleted=()=>{},
  saveSeen,
  saveGraded,
  savePractice,
  saveDialogue=saveDialogueActivity,
  speak=speakText,
  startRecognition=startSpeechRecognition
}:NodeRunnerViewProps){
  const {t,locale}=useI18n();
  const state=runtime.state;
  const node=state?.roadmap.nodes.find(item=>item.id===nodeId) ?? null;
  const nodeProgress=state?.roadmapProgress.nodes.find(item=>item.node.id===nodeId) ?? null;
  const purchaseUnlocked=Boolean(state&&node&&isNodeUnlockedByPurchase(
    state.set,
    node,
    {owned:state.access==='full'}
  ));
  const activities=useMemo(
    ()=>state&&node?activitiesForNode(state.set.activities,node):[],
    [node,state]
  );

  const [index,setIndex]=useState(0);
  const [selected,setSelected]=useState<number|null>(null);
  const [answer,setAnswer]=useState('');
  const [result,setResult]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const completionTrackedRef=useRef(false);

  useEffect(()=>{
    completionTrackedRef.current=Boolean(nodeProgress?.complete);
  },[node?.id]);

  useEffect(()=>{
    if(!state||!node)return;
    setIndex(firstPendingActivityIndex(activities,state.progress));
  },[node?.id]);

  const activity=activities[index] ?? null;

  useEffect(()=>{
    setSelected(null);
    setAnswer('');
    setResult(null);
    setBusy(false);
  },[activity?.id]);

  const advance=(completed=true)=>{
    if(index+1<activities.length){
      setIndex(current=>current+1);
      return;
    }
    if(completed&&node&&!completionTrackedRef.current){
      completionTrackedRef.current=true;
      onNodeCompleted(node);
    }
    onExit();
  };

  if(runtime.status==='pending'){
    return (
      <section className="learn-shell">
        <div className="learn-state" role="status">
          <strong>{t('learn.loadingTitle')}</strong>
          <span>{t('learn.loadingText')}</span>
        </div>
      </section>
    );
  }

  if(runtime.status==='error'){
    return (
      <section className="learn-shell">
        <div className="learn-state" role="alert">
          <strong>{t('learn.errorTitle')}</strong>
          <button className="primary-button" type="button" onClick={()=>void runtime.refresh()}>
            {t('today.retry')}
          </button>
        </div>
      </section>
    );
  }

  if(!state||!node||!nodeProgress?.unlocked||!purchaseUnlocked||!activity){
    return (
      <section className="learn-shell">
        <button className="learn-back" type="button" onClick={onExit}>{t('nav.back')}</button>
        <div className="learn-state" role="status">
          <strong>{t('learn.unavailableTitle')}</strong>
          <span>{t('learn.unavailableText')}</span>
        </div>
      </section>
    );
  }

  const setId=state.set.id;
  const position=t('learn.position',{current:index+1,total:activities.length});
  const stage=stageForDay(node.dayIndex);

  const handleTheory=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      await saveSeen(setId,activity.id);
      advance();
    }finally{
      setBusy(false);
    }
  };

  const handleChoice=async()=>{
    if(activity.type!=='choice'||selected===null||busy||result!==null)return;
    setBusy(true);
    try{
      const correct=selected===activity.correctIndex;
      await saveGraded(setId,activity.id,correct);
      setResult(correct);
    }finally{
      setBusy(false);
    }
  };

  const handleText=async()=>{
    if((activity.type!=='text-input'&&activity.type!=='translation')||busy||result!==null)return;
    const input=answer.trim();
    if(!input)return;
    setBusy(true);
    try{
      const correct=activity.answer.caseSensitive
        ? activity.answer.accepted.some(candidate=>candidate.trim()===input)
        : checkAnswer(input,activity.answer.accepted);
      await saveGraded(setId,activity.id,correct);
      setResult(correct);
    }finally{
      setBusy(false);
    }
  };

  const feedback=({
    question,
    accepted,
    acceptedAnswers=[],
    learnerAnswer='',
    explanation
  }:{
    question:string;
    accepted?:string|undefined;
    acceptedAnswers?:string[]|undefined;
    learnerAnswer?:string|undefined;
    explanation?:Record<string,string>|undefined;
  })=>result===null?null:(
    <div className={result?'learn-feedback learn-feedback-ok':'learn-feedback learn-feedback-wrong'} role="status">
      <div className="learn-feedback-head">
        <span className="learn-feedback-icon" aria-hidden="true"><Icon name={result?'check':'review'} size={22} /></span>
        <strong>{result?t('learn.correct'):t('learn.incorrect')}</strong>
      </div>
      {!result&&accepted&&(
        <span><LexiconText text={t('learn.accepted',{answer:accepted})} refs={activity.lexiconRefs} /></span>
      )}
      {explanation&&(
        <p><LexiconText text={localized(explanation,locale)} refs={activity.lexiconRefs} /></p>
      )}
      {!result&&learnerAnswer&&acceptedAnswers.length>0&&(
        <AnswerExplanationView
          question={question}
          learnerAnswer={learnerAnswer}
          acceptedAnswers={acceptedAnswers}
          courseExplanation={localized(explanation,locale)}
          refs={activity.lexiconRefs}
          onSignIn={onSignIn}
          onAccess={onAccess}
        />
      )}
      <button className="primary-button learn-feedback-next" type="button" onClick={()=>advance()}>
        {index+1<activities.length?t('learn.next'):t('learn.finish')}
      </button>
    </div>
  );

  return (
    <section className="learn-shell runner" aria-labelledby="learn-title">
      <div className="runner-top">
        <button className="runner-close pressable" type="button" onClick={onExit} aria-label={t('learn.close')}>
          <Icon name="close" size={20} />
        </button>
        <RunnerProgress current={index} total={activities.length} label={t('learn.activityProgress')} />
        <span className="runner-count" aria-label={position}>{index+1}/{activities.length}</span>
      </div>

      <div className="runner-heading">
        {stage&&<div className="screen-kicker">{t(stageNameKey(stage))}</div>}
        <h2 id="learn-title"><LexiconText text={localized(node.title,locale)} /></h2>
      </div>

      {activity.type==='theory'&&(
        <article className="learn-card">
          {activity.title&&localized(activity.title,locale)!==localized(node.title,locale)&&<h3><LexiconText text={localized(activity.title,locale)} refs={activity.lexiconRefs} /></h3>}
          <div className="learn-theory"><LexiconText text={plainTheory(activity,locale)} refs={activity.lexiconRefs} /></div>
          <div className="runner-action">
            <button className="primary-button" type="button" disabled={busy} onClick={()=>void handleTheory()}>
              {t('learn.continue')}
            </button>
          </div>
        </article>
      )}

      {activity.type==='choice'&&(
        <article className="learn-card">
          <h3><LexiconText text={localized(activity.prompt,locale)} refs={activity.lexiconRefs} /></h3>
          {activity.hint&&<p className="learn-hint"><LexiconText text={localized(activity.hint,locale)} refs={activity.lexiconRefs} /></p>}
          <fieldset className="learn-options" disabled={busy||result!==null}>
            <legend className="sr-only">{t('learn.chooseAnswer')}</legend>
            {activity.options.map((option,optionIndex)=>(
              <label
                className={'learn-option pressable'+(result!==null&&optionIndex===activity.correctIndex?' is-correct':'')+(result===false&&optionIndex===selected?' is-wrong':'')}
                key={optionIndex}
              >
                <input
                  type="radio"
                  name={activity.id}
                  checked={selected===optionIndex}
                  onChange={()=>setSelected(optionIndex)}
                />
                <span><LexiconText text={localized(option,locale)} refs={activity.lexiconRefs} /></span>
                {result!==null&&optionIndex===activity.correctIndex&&<Icon name="check" size={20} className="learn-option-mark" />}
              </label>
            ))}
          </fieldset>
          {result===null&&(
            <div className="runner-action">
              <button
                className="primary-button"
                type="button"
                disabled={selected===null||busy}
                onClick={()=>void handleChoice()}
              >
                {t('learn.check')}
              </button>
            </div>
          )}
          {feedback({
            question:localized(activity.prompt,locale),
            accepted:localized(activity.options[activity.correctIndex],locale),
            acceptedAnswers:[localized(activity.options[activity.correctIndex],locale)],
            learnerAnswer:selected===null?'':localized(activity.options[selected],locale),
            explanation:activity.explanation
          })}
        </article>
      )}

      {(activity.type==='text-input'||activity.type==='translation')&&(
        <article className="learn-card">
          <h3><LexiconText text={localized(activity.prompt,locale)} refs={activity.lexiconRefs} /></h3>
          {activity.type==='text-input'&&activity.source&&(
            <p className="learn-source"><LexiconText text={localized(activity.source,locale)} refs={activity.lexiconRefs} /></p>
          )}
          <label className="learn-answer">
            <span>{t('learn.answerLabel')}</span>
            <input
              value={answer}
              disabled={busy||result!==null}
              onChange={event=>setAnswer(event.target.value)}
              onKeyDown={event=>{
                if(event.key==='Enter'){
                  event.preventDefault();
                  void handleText();
                }
              }}
              autoComplete="off"
            />
          </label>
          {result===null&&(
            <div className="runner-action">
              <button
                className="primary-button"
                type="button"
                disabled={!answer.trim()||busy}
                onClick={()=>void handleText()}
              >
                {t('learn.check')}
              </button>
            </div>
          )}
          {feedback({
            question:localized(activity.prompt,locale),
            accepted:activity.answer.accepted[0],
            acceptedAnswers:activity.answer.accepted,
            learnerAnswer:answer.trim(),
            explanation:activity.explanation
          })}
        </article>
      )}

      {activity.type==='pattern-drill'&&(
        <PatternPracticeView
          key={activity.id}
          activity={activity}
          courseActivities={state.set.activities}
          progress={state.progress}
          setId={setId}
          savePractice={savePractice}
          speak={speak}
          onDone={advance}
        />
      )}

      {activity.type==='dialogue'&&(
        <DialogueView
          key={activity.id}
          activity={activity}
          setId={setId}
          saveDialogue={saveDialogue}
          speak={speak}
          startRecognition={startRecognition}
          onDone={advance}
        />
      )}

      {activity.type==='ai-conversation'&&(
        <AIConversationView
          key={activity.id}
          activity={activity}
          setId={setId}
          saveSeen={saveSeen}
          onDone={advance}
          onSignIn={onSignIn}
          onAccess={onAccess}
          speak={speak}
          startRecognition={startRecognition}
        />
      )}

      {!['theory','choice','text-input','translation','pattern-drill','dialogue','ai-conversation'].includes(activity.type)&&(
        <article className="learn-card">
          <h3><LexiconText text={activity.title?localized(activity.title,locale):t('learn.unsupportedTitle')} refs={activity.lexiconRefs} /></h3>
          <p className="learn-hint">{t('learn.unsupportedText')}</p>
          <button className="secondary-button" type="button" onClick={()=>advance(false)}>
            {index+1<activities.length?t('learn.skipForNow'):t('learn.backToday')}
          </button>
        </article>
      )}
    </section>
  );
}

export function NodeRunnerScreen(){
  const runtime=useLearnerCourseRuntime();
  const navigate=useNavigate();
  const params=useParams();
  return (
    <NodeRunnerView
      runtime={runtime}
      nodeId={String(params.nodeId||'')}
      onExit={()=>navigate('/')}
      onSignIn={()=>navigate('/account?return='+encodeURIComponent('/learn/'+String(params.nodeId||'')))}
      onAccess={()=>navigate('/access?from=talk')}
      onNodeCompleted={node=>{
        if(node.kind==='lesson')trackLessonCompleted();
        if(node.dayIndex)trackDayCompleted();
      }}
      saveSeen={saveSeenActivity}
      saveGraded={saveGradedActivity}
      savePractice={savePracticeActivity}
    />
  );
}
