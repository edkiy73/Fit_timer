import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity, RoadmapNode } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { checkAnswer } from './engine/answer-check';
import type { PracticeSrsKind } from './engine/practice-srs';
import { saveDialogueActivity, saveGradedActivity, saveManualNode, savePracticeActivity, saveSeenActivity } from './activity-progress';
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
import { Sheet } from './sheet';
import { Loader } from './loader';
import { stageForDay, stageNameKey } from './course-stages';
import { TheoryContent } from './theory-content';
import { ExerciseKind } from './exercise-kind';
import { WordChips, answerWords, buildChips, chipsText } from './word-chips';
import { isNodeRequirementComplete } from './engine/course-progress';
import { roadmapProgressFromDocument } from './progress-actions';
import { buildCourseReviewSession } from './review-session';
import { activitySaveClock } from './activity-progress';
import { randomSeed, shuffledIndices } from './shuffle';

function localized(text:Record<string,string>|undefined,locale:string):string{
  if(!text)return '';
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
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

/** One segment per first-pass task: correct / wrong / current / not reached yet.
 * Mistakes replayed at the end do not add extra segments. */
function RunnerProgress({
  order,
  total,
  pos,
  results,
  label
}:{
  order:number[];
  total:number;
  pos:number;
  results:Record<number,boolean>;
  label:string;
}){
  const steps=order.slice(0,total);
  const answered=steps.filter(step=>results[step]!==undefined).length;
  return (
    <div className="runner-progress runner-progress-segmented" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(1,total)} aria-valuenow={answered}>
      {steps.map((step,index)=>{
        const state=results[step]===true
          ? 'correct'
          : results[step]===false
            ? 'wrong'
            : index===pos&&pos<total
              ? 'current'
              : 'pending';
        return <span key={step} className={'runner-progress-step is-'+state} aria-hidden="true" />;
      })}
    </div>
  );
}

export interface NodeRunnerViewProps {
  runtime:LearnerCourseRuntimeValue;
  nodeId:string;
  onExit:()=>void;
  onSignIn?:()=>void;
  onAccess?:()=>void;
  /** A review day: run the regular review; it completes the day when finished. */
  onReviewDay?:(nodeId:string)=>void;
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
  saveManual?:(setId:string,nodeId:string)=>Promise<void>;
  speak?:SpeakText;
  startRecognition?:StartRecognition;
  /** Open this step first (e.g. «Скажи вслух» → the day's phrases, speaking mode). */
  startActivityId?:string;
  startMode?:PracticeSrsKind;
  /** Explicit return to an already-running lesson (e.g. after Plus purchase). */
  resumeSavedRun?:boolean;
}

const isPlan=(activity:Activity)=>activity.type==='theory'&&(activity.tags??[]).includes('plan');
const isSeen=(progress:CourseProgressDocument,id:string)=>{
  const seen=progress.seen[id];
  return Boolean(seen&&!seen.deleted);
};
// A wrong answer is replayed once at the end of the lesson («Работа над ошибками»).
const MAX_RETURNS=1;
const range=(from:number,to:number)=>Array.from({length:Math.max(0,to-from)},(_,i)=>from+i);
const MODE_KEY:Record<PracticeSrsKind,string>={drill:'kind.drill',listening:'kind.listening',speaking:'kind.speaking'};
const LESSON_RUN_VERSION=1;
interface LessonRunSnapshot{
  version:1;
  setId:string;
  nodeId:string;
  stepIds:string[];
  order:number[];
  firstPass:number;
  pos:number;
  intro:boolean;
  selected:number|null;
  answer:string;
  typing:boolean;
  picked:string[];
  result:boolean|null;
  score:{correct:number;total:number};
  firstPassResults:Record<number,boolean>;
  shuffleSeed?:string;
  practiceMode?:PracticeSrsKind;
  /** Replay of a completed day: practice only, review intervals and answer stats stay as they were. */
  replay?:boolean;
}
const lessonRunKey=(setId:string,nodeId:string)=>'unmute.lesson-run:'+setId+':'+nodeId;
function readLessonRun(setId:string,nodeId:string):LessonRunSnapshot|null{
  try{
    const raw=localStorage.getItem(lessonRunKey(setId,nodeId));
    if(!raw)return null;
    const parsed=JSON.parse(raw) as LessonRunSnapshot;
    if(parsed?.version!==LESSON_RUN_VERSION||parsed.setId!==setId||parsed.nodeId!==nodeId)return null;
    return parsed;
  }catch{return null;}
}
function writeLessonRun(snapshot:LessonRunSnapshot):void{
  try{localStorage.setItem(lessonRunKey(snapshot.setId,snapshot.nodeId),JSON.stringify(snapshot));}catch{}
}
function clearLessonRun(setId:string,nodeId:string):void{
  try{localStorage.removeItem(lessonRunKey(setId,nodeId));}catch{}
}

function remapLessonRun(snapshot:LessonRunSnapshot,steps:Activity[]):LessonRunSnapshot|null{
  const currentIndex=new Map(steps.map((step,index)=>[step.id,index] as const));
  const orderedIds=snapshot.order.map(index=>snapshot.stepIds[index]).filter((id):id is string=>Boolean(id));
  const mappedOrder:number[]=[];
  let mappedPos=0;
  let mappedFirstPass=0;
  for(let i=0;i<orderedIds.length;i++){
    const index=currentIndex.get(orderedIds[i]!);
    if(index===undefined)continue;
    if(i<snapshot.pos)mappedPos++;
    if(i<snapshot.firstPass)mappedFirstPass++;
    mappedOrder.push(index);
  }
  if(mappedOrder.length===0)return null;
  mappedPos=Math.min(mappedPos,mappedOrder.length-1);
  mappedFirstPass=Math.min(mappedFirstPass,mappedOrder.length);
  return {
    ...snapshot,
    stepIds:steps.map(step=>step.id),
    order:mappedOrder,
    pos:mappedPos,
    firstPass:mappedFirstPass
  };
}


/** What still keeps the day from counting: practice not passed yet, steps not done. */
export function missingForNode(node:RoadmapNode,progress:CourseProgressDocument){
  const state=roadmapProgressFromDocument(progress);
  const practice:{activityId:string;mode:PracticeSrsKind}[]=[];
  const unseen:string[]=[];
  for(const requirement of node.completion?.requirements??[]){
    if(isNodeRequirementComplete(requirement,node.id,state))continue;
    if(requirement.kind==='practice-started'){
      for(const mode of requirement.modes){
        const record=state.practice[mode]?.[requirement.activityId];
        if(!record||record.box<=0)practice.push({activityId:requirement.activityId,mode});
      }
    }else if(requirement.kind==='activity-seen'){
      unseen.push(...requirement.activityIds.filter(id=>!state.seenActivityIds.has(id)));
    }
  }
  return {practice,unseen};
}

export function NodeRunnerView({
  runtime,
  nodeId,
  onExit,
  onSignIn=()=>{},
  onAccess=()=>{},
  onReviewDay=()=>{},
  onNodeCompleted=()=>{},
  saveSeen,
  saveGraded,
  savePractice,
  saveDialogue=saveDialogueActivity,
  saveManual=saveManualNode,
  speak=speakText,
  startRecognition=startSpeechRecognition,
  startActivityId,
  startMode,
  resumeSavedRun=false
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
  // Theory is read once before the tasks (and stays one tap away); the day's «сделай сам»
  // task lives on «Сегодня» as «Скажи вслух». Only exercises are steps.
  const theoryCards=useMemo(()=>activities.filter((item):item is Extract<Activity,{type:'theory'}>=>item.type==='theory'&&!isPlan(item)),[activities]);
  const steps=useMemo(()=>activities.filter(item=>item.type!=='theory'),[activities]);

  const [order,setOrder]=useState<number[]>([]);
  const [firstPass,setFirstPass]=useState(0);
  const [pos,setPos]=useState(0);
  const [intro,setIntro]=useState(false);
  const [selected,setSelected]=useState<number|null>(null);
  const [answer,setAnswer]=useState('');
  const [typing,setTyping]=useState(false);
  const [picked,setPicked]=useState<string[]>([]);
  const [result,setResult]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [theoryOpen,setTheoryOpen]=useState(false);
  const [score,setScore]=useState({correct:0,total:0});
  const [firstPassResults,setFirstPassResults]=useState<Record<number,boolean>>({});
  const [exitOpen,setExitOpen]=useState(false);
  const [finished,setFinished]=useState(false);
  const [checking,setChecking]=useState(false);
  const [practiceMode,setPracticeMode]=useState<PracticeSrsKind|undefined>(startMode);
  const [shuffleSeed,setShuffleSeed]=useState(()=>randomSeed());
  const [runHydrated,setRunHydrated]=useState(false);
  const [replay,setReplay]=useState(false);
  const completionTrackedRef=useRef(false);
  // The step a restored run lands on: its saved answer/feedback must survive the first render
  // of that step (the reset below would otherwise wipe it once the restored order arrives).
  const restoringRunRef=useRef<string|null>(null);

  useEffect(()=>{
    completionTrackedRef.current=Boolean(nodeProgress?.complete);
  },[node?.id]);

  const begin=(startIndex:number)=>{
    setOrder(range(startIndex,steps.length));
    setFirstPass(steps.length-startIndex);
    setPos(0);
    setSelected(null);
    setAnswer('');
    setTyping(false);
    setPicked([]);
    setResult(null);
    setScore({correct:0,total:0});
    setFirstPassResults({});
    setShuffleSeed(randomSeed());
    setExitOpen(false);
    setFinished(false);
  };

  const stepSignature=steps.map(item=>item.id).join('|');
  useEffect(()=>{
    if(!state||!node)return;
    setRunHydrated(false);
    const requested=startActivityId?steps.findIndex(item=>item.id===startActivityId):-1;
    const saved=requested<0?readLessonRun(state.set.id,node.id):null;
    const restored=saved&&(resumeSavedRun||!nodeProgress?.complete)?remapLessonRun(saved,steps):null;
    const validSaved=Boolean(
      restored&&
      restored.order.length>0&&
      restored.firstPass>=0&&restored.firstPass<=restored.order.length&&
      restored.pos>=0&&restored.pos<restored.order.length
    );
    if(restored&&validSaved){
      restoringRunRef.current=String(steps[restored.order[restored.pos]!]?.id??'')+'|'+restored.pos;
      setOrder(restored.order);
      setFirstPass(restored.firstPass);
      setPos(restored.pos);
      setIntro(restored.intro);
      setSelected(restored.selected);
      setAnswer(restored.answer);
      setTyping(restored.typing);
      setPicked(restored.picked);
      setResult(restored.result);
      setScore(restored.score);
      setFirstPassResults(restored.firstPassResults);
      setShuffleSeed(restored.shuffleSeed??randomSeed());
      setPracticeMode(restored.practiceMode);
      setReplay(Boolean(restored.replay));
      setFinished(false);
    }else{
      // Never destroy an unfinished run merely because refreshed course content is temporarily
      // different (e.g. after auth/Plus purchase). Only a completed node invalidates it.
      if(saved&&nodeProgress?.complete)clearLessonRun(state.set.id,node.id);
      begin(requested>=0?requested:firstPendingActivityIndex(steps,state.progress));
      setIntro(requested<0&&theoryCards.some(card=>!isSeen(state.progress,card.id)));
      setPracticeMode(startMode);
      // A completed day opened again is a replay; a step opened on purpose («Скажи вслух») still counts.
      setReplay(Boolean(nodeProgress?.complete)&&requested<0);
    }
    setRunHydrated(true);
    // Old progress may still miss the day's plan card: it is part of the day, mark it quietly.
    for(const plan of activities.filter(isPlan)){
      if(!isSeen(state.progress,plan.id))void saveSeen(state.set.id,plan.id).catch(()=>undefined);
    }
  },[node?.id,state?.set.id,startActivityId,stepSignature,resumeSavedRun]);

  useEffect(()=>{
    if(!runHydrated||!state||!node||finished||order.length===0)return;
    writeLessonRun({
      version:LESSON_RUN_VERSION,
      setId:state.set.id,
      nodeId:node.id,
      stepIds:steps.map(item=>item.id),
      order,
      firstPass,
      pos,
      intro,
      selected,
      answer,
      typing,
      picked,
      result,
      score,
      firstPassResults,
      shuffleSeed,
      ...(practiceMode?{practiceMode}:{}),
      ...(replay?{replay}:{})
    });
  },[runHydrated,state?.set.id,node?.id,stepSignature,order,firstPass,pos,intro,selected,answer,typing,picked,result,score,firstPassResults,shuffleSeed,practiceMode,finished,replay]);

  const stepIndex=order[pos];
  const activity=stepIndex===undefined?null:steps[stepIndex]??null;

  useEffect(()=>{
    if(restoringRunRef.current!==null){
      // Mount render (no step yet): keep waiting for the restored step.
      if(!activity)return;
      const restoredStep=restoringRunRef.current===activity.id+'|'+pos;
      restoringRunRef.current=null;
      if(restoredStep){ setBusy(false); return; }
    }
    setSelected(null);
    setAnswer('');
    setPicked([]);
    setTyping(false);
    setResult(null);
    setBusy(false);
  },[activity?.id,pos]);

  // Count the day the moment it really counts, not when the last screen is reached.
  const nodeComplete=Boolean(nodeProgress?.complete);
  useEffect(()=>{
    if(finished&&nodeComplete&&node&&!completionTrackedRef.current){
      completionTrackedRef.current=true;
      onNodeCompleted(node);
    }
  },[finished,nodeComplete,node?.id]);

  const finish=async()=>{
    if(state&&node)clearLessonRun(state.set.id,node.id);
    setChecking(true);
    try{ await runtime.refresh(); }catch{ /* the summary still shows what is known */ }
    setChecking(false);
    setFinished(true);
  };

  const advance=()=>{
    if(pos+1<order.length){
      setPos(current=>current+1);
      return;
    }
    if(node)void finish();
    else onExit();
  };

  // A wrong answer comes back at the end of the lesson — at most twice, so nobody gets stuck.
  const retryLater=()=>{
    if(stepIndex===undefined)return;
    setOrder(current=>{
      if(current.slice(pos+1).includes(stepIndex))return current;
      const returns=current.filter(item=>item===stepIndex).length-1;
      return returns>=MAX_RETURNS?current:[...current,stepIndex];
    });
  };
  const countAnswer=(correct:boolean)=>{
    if(pos>=firstPass)return;
    setScore(current=>({correct:current.correct+(correct?1:0),total:current.total+1}));
    const answeredStep=order[pos];
    if(answeredStep!==undefined)setFirstPassResults(current=>({...current,[answeredStep]:correct}));
  };

  const exitWithoutSaving=()=>{
    if(state&&node)clearLessonRun(state.set.id,node.id);
    setExitOpen(false);
    onExit();
  };
  const exitSheet=(
    <Sheet open={exitOpen} onClose={()=>setExitOpen(false)} labelledBy="lesson-exit-title" closeLabel={t('learn.exitStay')}>
      <div className="confirm-sheet">
        <h3 id="lesson-exit-title">{t('learn.exitTitle')}</h3>
        <p className="tile-text">{t('learn.exitText')}</p>
        <button className="primary-button" type="button" onClick={()=>setExitOpen(false)}>{t('learn.exitStay')}</button>
        <button className="secondary-button" type="button" onClick={onExit} aria-describedby="lesson-exit-save-hint">{t('learn.exitSave')}</button>
        <p className="tile-text" id="lesson-exit-save-hint">{t('learn.exitSaveHint')}</p>
        <button className="link-button danger-link" type="button" onClick={exitWithoutSaving} aria-describedby="lesson-exit-discard-hint">{t('learn.exitDiscard')}</button>
        <p className="tile-text" id="lesson-exit-discard-hint">{t('learn.exitDiscardHint')}</p>
      </div>
    </Sheet>
  );

  if(runtime.status==='pending'){
    return (
      <section className="learn-shell">
        <Loader title={t('learn.loadingTitle')} />
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

  if(checking){
    return <section className="learn-shell"><Loader title={t('learn.checking')} /></section>;
  }

  if(finished&&node&&state){
    const missing=missingForNode(node,state.progress);
    const plan=activities.find(isPlan);
    const firstPractice=missing.practice[0];
    const firstUnseen=missing.unseen.map(id=>steps.findIndex(item=>item.id===id)).find(index=>index>=0);
    const redo=()=>{
      if(firstPractice){
        const index=steps.findIndex(item=>item.id===firstPractice.activityId);
        setPracticeMode(firstPractice.mode);
        begin(index>=0?index:0);
        setOrder(index>=0?[index]:range(0,steps.length));
        return;
      }
      begin(firstUnseen??0);
    };
    return (
      <section className="learn-shell runner" aria-labelledby="learn-summary-title">
        <div className="learn-summary">
          <span className={'learn-summary-icon'+(nodeComplete?'':' is-pending')} aria-hidden="true"><Icon name={nodeComplete?'check':'review'} size={32} /></span>
          <div className="screen-kicker">{t(nodeComplete?'learn.summaryKicker':'learn.notCountedKicker')}</div>
          <h2 id="learn-summary-title"><LexiconText text={localized(node.title,locale)} /></h2>
          {score.total>0&&(
            <p className="learn-summary-score">{t(replay?'learn.replayScore':'learn.summaryScore',{correct:score.correct,total:score.total})}</p>
          )}
          {nodeComplete
            ? <p className="learn-hint">{t(replay?'learn.replayNext':'learn.summaryNext')}</p>
            : <div className="learn-missing">
                <p className="learn-hint">{t('learn.notCountedText')}</p>
                {missing.practice.length>0&&(
                  <ul>{missing.practice.map(item=><li key={item.activityId+item.mode}>{t(MODE_KEY[item.mode])}</li>)}</ul>
                )}
                {missing.practice.length===0&&missing.unseen.length>0&&<p className="learn-hint">{t('learn.notCountedSteps',{count:missing.unseen.length})}</p>}
              </div>}
          {nodeComplete&&plan&&plan.type==='theory'&&(
            <article className="learn-task">
              <div className="screen-kicker">{t('learn.taskKicker')}</div>
              <TheoryContent activity={plan} locale={locale} />
            </article>
          )}
        </div>
        <div className="runner-action runner-action-stack">
          {!nodeComplete&&(missing.practice.length>0||missing.unseen.length>0)&&(
            <button className="primary-button" type="button" onClick={redo}>{t('learn.redo')}</button>
          )}
          <button className={nodeComplete?'primary-button':'secondary-button'} type="button" onClick={onExit}>{t('learn.summaryDone')}</button>
        </div>
      </section>
    );
  }

  if(!state||!node||!nodeProgress?.unlocked||!purchaseUnlocked||(!activity&&!intro)){
    return (
      <section className="learn-shell">
        <button className="learn-back" type="button" onClick={onExit}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
        <div className="learn-state" role="status">
          <strong>{t('learn.unavailableTitle')}</strong>
          <span>{t('learn.unavailableText')}</span>
        </div>
      </section>
    );
  }

  const setId=state.set.id;
  const stage=stageForDay(node.dayIndex,state.set.id);
  const header=(
    <div className="runner-heading">
      <div className="runner-heading-text">
        {stage&&<div className="screen-kicker">{t(stageNameKey(stage))}</div>}
        <h2 id="learn-title"><LexiconText text={localized(node.title,locale)} /></h2>
      </div>
      {theoryCards.length>0&&!intro&&(
        <button className="chip-button pressable" type="button" onClick={()=>setTheoryOpen(true)}>
          <Icon name="book" size={18} />
          {t('learn.theory')}
        </button>
      )}
    </div>
  );

  const theoryBody=theoryCards.map(card=>(
    <section key={card.id} className="theory-sheet-card">
      {card.title&&localized(card.title,locale)!==localized(node.title,locale)&&<h3 className="theory-title"><LexiconText text={localized(card.title,locale)} refs={card.lexiconRefs} /></h3>}
      <TheoryContent activity={card} locale={locale} />
    </section>
  ));

  // Theory first: a page to read, then «К заданиям». It is not a step of the lesson.
  if(intro){
    const toTasks=async()=>{
      if(busy)return;
      setBusy(true);
      try{
        await Promise.all(theoryCards.filter(card=>!isSeen(state.progress,card.id)).map(card=>saveSeen(setId,card.id)));
      }finally{
        setBusy(false);
      }
      setIntro(false);
      if(steps.length===0)void finish();
    };
    return (
      <section className="learn-shell runner" aria-labelledby="learn-title">
        <div className="runner-top">
          <button className="runner-close pressable" type="button" onClick={()=>setExitOpen(true)} aria-label={t('learn.close')}>
            <Icon name="close" size={20} />
          </button>
          <span className="runner-intro-label">{t('learn.introLabel',{count:steps.length})}</span>
        </div>
        {exitSheet}
        {header}
        <article className="learn-card theory-page">
          <div className="exercise-kind kind-review"><span className="exercise-kind-icon" aria-hidden="true"><Icon name="book" size={16} /></span>{t('learn.introKicker')}</div>
          {theoryBody}
        </article>
        <div className="runner-action">
          <button className="primary-button" type="button" disabled={busy} onClick={()=>void toTasks()}>
            {steps.length?t('learn.toTasks'):t('learn.finish')}
          </button>
        </div>
      </section>
    );
  }

  if(!activity)return null;
  const retrying=pos>=firstPass;
  // The counter names the lesson's tasks; the replayed mistakes are counted separately.
  const shown=retrying?firstPass:pos+1;
  const position=t('learn.position',{current:shown,total:firstPass});
  // Only the first answer of a first run moves review intervals and stats: a replayed day and
  // «Работа над ошибками» are practice, so a mistake plus its fix never reads as a right answer.
  const recordsAnswers=!replay&&!retrying;
  const gradeAnswer=(correct:boolean)=>recordsAnswers?saveGraded(setId,activity.id,correct):Promise.resolve();
  const practiceSave:NodeRunnerViewProps['savePractice']=(...args)=>recordsAnswers?savePractice(...args):Promise.resolve();
  const dialogueSave:typeof saveDialogue=(...args)=>recordsAnswers?saveDialogue(...args):Promise.resolve();

  const handleChoice=async(choice:number|null=selected)=>{
    if(activity.type!=='choice'||choice===null||busy||result!==null)return;
    setBusy(true);
    try{
      const correct=choice===activity.correctIndex;
      await gradeAnswer(correct);
      countAnswer(correct);
      if(!correct)retryLater();
      setResult(correct);
    }finally{
      setBusy(false);
    }
  };

  const textAnswer=(activity.type==='text-input'||activity.type==='translation')?activity.answer.accepted[0]??'':'';
  // New phrases are built from word chips; ones answered before are typed (recall, not recognition).
  const cardKnown=Boolean(state.progress.cards[activity.id]&&!state.progress.cards[activity.id]?.deleted);
  const chips=(activity.type==='text-input'||activity.type==='translation')&&!cardKnown&&!typing&&answerWords(textAnswer)
    ? buildChips(shuffleSeed+'|'+activity.id+'|'+pos,textAnswer,steps.flatMap(item=>(item.type==='text-input'||item.type==='translation')&&item.id!==activity.id?[item.answer.accepted[0]??'']:[]))
    : null;
  const input=chips?chipsText(chips,picked):answer.trim();

  const handleText=async()=>{
    if((activity.type!=='text-input'&&activity.type!=='translation')||busy||result!==null)return;
    if(!input)return;
    setBusy(true);
    try{
      const correct=activity.answer.caseSensitive
        ? activity.answer.accepted.some(candidate=>candidate.trim()===input)
        : checkAnswer(input,activity.answer.accepted);
      await gradeAnswer(correct);
      countAnswer(correct);
      if(!correct)retryLater();
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
  })=>{
    if(result===null)return null;
    const willReturn=!result&&stepIndex!==undefined&&order.slice(pos+1).includes(stepIndex);
    return (
    <div className={'learn-feedback is-sheet '+(result?'learn-feedback-ok':'learn-feedback-wrong')} role="status">
      <div className={'learn-feedback-head'+(willReturn?' has-subtitle':'')}>
        <span className="learn-feedback-icon" aria-hidden="true"><Icon name={result?'check':'close'} size={22} /></span>
        <div className="learn-feedback-head-copy">
          <strong>{result?t('learn.correct'):t('learn.incorrect')}</strong>
          {willReturn&&<p className="learn-hint learn-feedback-return">{t('learn.willReturn')}</p>}
        </div>
      </div>
      {!result&&accepted&&(
        <span><LexiconText text={t('learn.accepted',{answer:accepted})} refs={activity.lexiconRefs} /></span>
      )}
      {explanation&&(
        <p><LexiconText text={localized(explanation,locale)} refs={activity.lexiconRefs} /></p>
      )}
      <div className="learn-feedback-actions">
        {!result&&learnerAnswer&&acceptedAnswers.length>0&&(
          <AnswerExplanationView
            compact
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
          {pos+1<order.length?t('learn.next'):t('learn.finish')}
        </button>
      </div>
    </div>
    );
  };

  const dueReview=activity.type==='review'?buildCourseReviewSession(state.set,state.progress,activitySaveClock().dayNumber).actionableCount:0;
  const completeReviewDay=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      await saveSeen(setId,activity.id);
      await saveManual(setId,node.id);
    }finally{
      setBusy(false);
    }
    advance();
  };

  return (
    <section className="learn-shell runner" aria-labelledby="learn-title">
      <div className="runner-top">
        <button className="runner-close pressable" type="button" onClick={()=>setExitOpen(true)} aria-label={t('learn.close')}>
          <Icon name="close" size={20} />
        </button>
        <RunnerProgress order={order} total={firstPass} pos={pos} results={firstPassResults} label={t('learn.activityProgress')} />
        <span className="runner-count" aria-label={position}>{shown}/{firstPass}</span>
      </div>
      {exitSheet}

      {header}
      {retrying&&<p className="runner-retry" role="status">{t('learn.retryPhase',{current:pos-firstPass+1,total:order.length-firstPass})}</p>}

      {/* The day's theory stays one tap away without moving the lesson back. */}
      <Sheet open={theoryOpen} onClose={()=>setTheoryOpen(false)} labelledBy="theory-sheet-title" closeLabel={t('learn.theoryClose')}>
        <div className="theory-sheet">
          <h3 id="theory-sheet-title">{t('learn.theory')}</h3>
          {theoryBody}
        </div>
      </Sheet>

      {activity.type==='choice'&&(
        <article className="learn-card">
          <ExerciseKind kind="choice" />
          <h3><LexiconText text={localized(activity.prompt,locale)} refs={activity.lexiconRefs} /></h3>
          {activity.hint&&<p className="learn-hint"><LexiconText text={localized(activity.hint,locale)} refs={activity.lexiconRefs} /></p>}
          <fieldset className="learn-options" disabled={busy||result!==null}>
            <legend className="sr-only">{t('learn.chooseAnswer')}</legend>
            {shuffledIndices(activity.options.length,shuffleSeed+'|choice|'+activity.id+'|'+pos).map(optionIndex=>{
              const option=activity.options[optionIndex]!;
              return (
                <label
                  className={'learn-option pressable'+(selected===optionIndex&&result===null?' is-selected':'')+(result!==null&&optionIndex===activity.correctIndex?' is-correct':'')+(result===false&&optionIndex===selected?' is-wrong':'')}
                  key={optionIndex}
                >
                  <input
                    type="radio"
                    name={activity.id+'-'+pos}
                    checked={selected===optionIndex}
                    onChange={()=>setSelected(optionIndex)}
                    onClick={()=>{
                      if(selected===optionIndex&&result===null)void handleChoice(optionIndex);
                    }}
                  />
                  <span><LexiconText text={localized(option,locale)} refs={activity.lexiconRefs} interactive={result!==null} /></span>
                  {selected===optionIndex&&result===null&&<span className="learn-option-confirm">{t('learn.tapAgain')}</span>}
                  {result!==null&&optionIndex===activity.correctIndex&&<Icon name="check" size={20} className="learn-option-mark" />}
                </label>
              );
            })}
          </fieldset>
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
          <ExerciseKind kind={chips?'chips':'write'} />
          <h3><LexiconText text={localized(activity.prompt,locale)} refs={activity.lexiconRefs} /></h3>
          {activity.type==='text-input'&&activity.source&&(
            <p className="learn-source"><LexiconText text={localized(activity.source,locale)} refs={activity.lexiconRefs} /></p>
          )}
          {chips ? (
            <WordChips chips={chips} picked={picked} disabled={busy||result!==null} onChange={setPicked} />
          ) : (
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
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
          )}
          {result===null&&answerWords(textAnswer)&&!cardKnown&&(
            <button className="link-toggle" type="button" onClick={()=>{ setTyping(value=>!value); setPicked([]); setAnswer(''); }}>
              {chips?t('chips.typeInstead'):t('chips.buildInstead')}
            </button>
          )}
          {result===null&&(
            <div className="runner-action">
              <button
                className="primary-button"
                type="button"
                disabled={!input||busy}
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
            learnerAnswer:input,
            explanation:activity.explanation
          })}
        </article>
      )}

      {activity.type==='pattern-drill'&&(
        <PatternPracticeView
          key={activity.id+'-'+pos+'-'+(practiceMode??'')}
          activity={activity}
          courseActivities={state.set.activities}
          progress={state.progress}
          setId={setId}
          savePractice={practiceSave}
          speak={speak}
          {...(practiceMode?{initialMode:practiceMode}:{})}
          onDone={()=>{ setPracticeMode(undefined); void saveSeen(setId,activity.id).catch(()=>undefined).then(()=>advance()); }}
        />
      )}

      {activity.type==='dialogue'&&(
        <DialogueView
          key={activity.id}
          activity={activity}
          setId={setId}
          saveDialogue={dialogueSave}
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

      {activity.type==='review'&&(
        <article className="learn-card">
          <ExerciseKind kind="review" />
          <h3>{t('learn.reviewDayTitle')}</h3>
          <p className="learn-hint">{dueReview>0?t('learn.reviewDayText',{count:dueReview}):t('learn.reviewDayClear')}</p>
          <div className="runner-action">
            {dueReview>0
              ? <button className="primary-button" type="button" onClick={()=>onReviewDay(node.id)}>{t('today.reviewStart')}</button>
              : <button className="primary-button" type="button" disabled={busy} onClick={()=>void completeReviewDay()}>{t('learn.reviewDayDone')}</button>}
          </div>
        </article>
      )}

      {!['choice','text-input','translation','pattern-drill','dialogue','ai-conversation','review'].includes(activity.type)&&(
        <article className="learn-card">
          <h3><LexiconText text={activity.title?localized(activity.title,locale):t('learn.unsupportedTitle')} refs={activity.lexiconRefs} /></h3>
          <p className="learn-hint">{t('learn.unsupportedText')}</p>
          <button className="secondary-button" type="button" onClick={()=>advance()}>
            {t('learn.next')}
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
  const [search]=useSearchParams();
  const mode=search.get('mode');
  const startMode=mode==='drill'||mode==='listening'||mode==='speaking'?mode:undefined;
  const startActivityId=search.get('activity')||undefined;
  const resumeSavedRun=search.get('resume')==='1';
  return (
    <NodeRunnerView
      runtime={runtime}
      nodeId={String(params.nodeId||'')}
      {...(startActivityId?{startActivityId}:{})}
      {...(startMode?{startMode}:{})}
      {...(resumeSavedRun?{resumeSavedRun:true}:{})}
      onExit={()=>navigate('/')}
      onSignIn={()=>navigate('/account?return='+encodeURIComponent('/learn/'+String(params.nodeId||'')))}
      onAccess={()=>navigate('/access?from=answer&return='+encodeURIComponent('/learn/'+String(params.nodeId||'')+'?resume=1'))}
      onReviewDay={nodeId=>navigate('/review?day='+encodeURIComponent(nodeId))}
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
