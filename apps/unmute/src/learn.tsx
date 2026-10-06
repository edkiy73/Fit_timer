import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { isPracticeCompletionRequirement, type Activity, type RoadmapNode } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { useLearnerCourseRuntime } from './course-runtime';
import { checkAnswer } from './engine/answer-check';
import { nearMiss } from './engine/answer-near-miss';
import type { PracticeItemGrade, PracticeSrsKind } from './engine/practice-srs';
import { saveDialogueActivity, saveGradedActivity, saveManualNode, savePracticeActivity, saveSeenActivity } from './activity-progress';
import type { SpeakText, StartRecognition } from './speech-runtime';
import { speakText, startRecognition as startSpeechRecognition } from './speech-runtime';
import { PatternPracticeView } from './pattern-practice';
import { DialogueView } from './dialogue';
import { LexiconText } from './lexicon-ui';
import { isNodeUnlockedByPurchase } from './content/access';
import { AIConversationView } from './ai-conversation';
import { AnswerExplanationView } from './answer-explanation';
import { AnswerFeedbackSheet } from './answer-feedback-sheet';
import { trackDayCompleted, trackLessonCompleted } from './observability';
import { Icon } from './icons';
import { Sheet } from './sheet';
import { FirstLessonNotificationOffer } from './first-lesson-notification-offer';
import { clearPausedLessonRun, markLessonRunPaused, notifyLessonRunChanged } from './lesson-run-reminder';
import { Loader } from './loader';
import { stageForDay, stageNameKey } from './course-stages';
import { TheoryContent } from './theory-content';
import { ExerciseKind } from './exercise-kind';
import { WordChips, answerWords, buildChips, chipsText } from './word-chips';
import { AnswerModeTransition } from './answer-mode-transition';
import { isNodeRequirementComplete, practiceProgressComplete } from './engine/course-progress';
import { roadmapProgressFromDocument } from './progress-actions';
import { buildCourseReviewSession } from './review-session';
import { activitySaveClock } from './activity-progress';
import { randomSeed, shuffledIndices } from './shuffle';
import { sentenceResponseStage, type SentenceResponseKind } from './engine/sentence-progression';
import { MOTION, prefersReducedMotion, withViewTransition } from './motion';
import { SYSTEM_BACK_EVENT } from './native-back';
import { lessonSectionStates, type LessonSectionId } from './lesson-sections';
import { clearPracticeRunStatePrefix } from './practice-run-state';

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

/** Resume from the earliest requirement that is still genuinely incomplete.
 * A pattern may already be "seen" while one of its required practice modes is not passed. */
export function firstIncompleteRequirementIndex(
  node:RoadmapNode,
  activities:Activity[],
  progress:CourseProgressDocument
):number{
  const missing=missingForNode(node,progress);
  const missingIds=new Set([
    ...missing.unseen,
    ...missing.practice.map(item=>item.activityId)
  ]);
  const requiredIndex=activities.findIndex(activity=>missingIds.has(activity.id));
  return requiredIndex>=0 ? requiredIndex : firstPendingActivityIndex(activities,progress);
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
  saveGraded:(setId:string,activityId:string,correct:boolean,responseKind?:SentenceResponseKind,operationId?:string)=>Promise<void>;
  savePractice:(
    setId:string,
    activityId:string,
    mode:PracticeSrsKind,
    correct:boolean,
    score?:number,
    operationId?:string,
    itemGrades?:Readonly<Record<string,PracticeItemGrade>>
  )=>Promise<void>;
  saveDialogue?:(setId:string,activityId:string,score:number)=>Promise<void>;
  saveManual?:(setId:string,nodeId:string)=>Promise<void>;
  speak?:SpeakText;
  startRecognition?:StartRecognition;
  /** Open this step first (e.g. «Скажи вслух» → the day's phrases, speaking mode). */
  startActivityId?:string;
  /** Open a concrete lesson section from Route. */
  startSection?:Extract<LessonSectionId,'theory'|'tasks'>;
  startMode?:PracticeSrsKind;
  /** Explicit return to an already-running lesson (e.g. after Plus purchase). */
  resumeSavedRun?:boolean;
  /** Replay only the regular answer tasks without changing review/progression. */
  replayTasksOnly?:boolean;
  /** Start an unfinished day visually from the beginning without erasing canonical progress. */
  startFromBeginning?:boolean;
}

const isPlan=(activity:Activity)=>activity.type==='theory'&&(activity.tags??[]).includes('plan');
const isSeen=(progress:CourseProgressDocument,id:string)=>{
  const seen=progress.seen[id];
  return Boolean(seen&&!seen.deleted);
};
// Wrong answers stay unresolved and keep returning until the learner passes them.
const range=(from:number,to:number)=>Array.from({length:Math.max(0,to-from)},(_,i)=>from+i);
const MODE_KEY:Record<PracticeSrsKind,string>={drill:'kind.drill',listening:'kind.listening',speaking:'kind.speaking'};
const LESSON_RUN_VERSION=1;
export type LessonRunMode='first'|'resume'|'replay';

interface PracticeRunQuality{
  activityId:string;
  mode:PracticeSrsKind;
  correct:number;
  total:number;
}
type PracticeQualityMap=Record<string,PracticeRunQuality>;

interface TaskSectionSnapshot{
  order:number[];
  firstPass:number;
  pos:number;
  selected:number|null;
  answer:string;
  typing:boolean;
  picked:string[];
  result:boolean|null;
  nearResult:boolean;
  score:{correct:number;total:number};
  firstPassResults:Record<number,boolean>;
  shuffleSeed:string;
  runId:string;
  runMode:LessonRunMode;
}

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
  nearResult?:boolean;
  score:{correct:number;total:number};
  firstPassResults:Record<number,boolean>;
  /** Exact regular-task state kept while practice/theory is open. */
  taskSection?:TaskSectionSnapshot;
  /** First-pass quality of completed practice modes in this run. */
  practiceQuality?:PracticeQualityMap;
  shuffleSeed?:string;
  practiceMode?:PracticeSrsKind;
  /** Stable id used to make answer writes idempotent across retries/resume. */
  runId?:string;
  /** Explicit run mode. Old snapshots may only have replay=true. */
  mode?:LessonRunMode;
  /** Legacy field kept readable for backward compatibility with old snapshots. */
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
  try{
    localStorage.setItem(lessonRunKey(snapshot.setId,snapshot.nodeId),JSON.stringify(snapshot));
    notifyLessonRunChanged();
  }catch{}
}
function clearLessonRun(setId:string,nodeId:string):void{
  try{
    localStorage.removeItem(lessonRunKey(setId,nodeId));
    clearPracticeRunStatePrefix('unmute.pattern-run:'+setId+':'+nodeId+':');
    notifyLessonRunChanged();
  }catch{}
}

interface CompletionCandidate{
  version:1;
  setId:string;
  nodeId:string;
  runId:string;
  mode:LessonRunMode;
}
const completionCandidateKey=(setId:string,nodeId:string)=>'unmute.lesson-completion:'+setId+':'+nodeId;
function readCompletionCandidate(setId:string,nodeId:string):CompletionCandidate|null{
  try{
    const raw=localStorage.getItem(completionCandidateKey(setId,nodeId));
    if(!raw)return null;
    const parsed=JSON.parse(raw) as CompletionCandidate;
    if(parsed?.version!==1||parsed.setId!==setId||parsed.nodeId!==nodeId||!parsed.runId)return null;
    if(parsed.mode!=='first'&&parsed.mode!=='resume'&&parsed.mode!=='replay')return null;
    return parsed;
  }catch{return null;}
}
function writeCompletionCandidate(candidate:CompletionCandidate):void{
  try{localStorage.setItem(completionCandidateKey(candidate.setId,candidate.nodeId),JSON.stringify(candidate));}catch{}
}
function clearCompletionCandidate(setId:string,nodeId:string):void{
  try{localStorage.removeItem(completionCandidateKey(setId,nodeId));}catch{}
}

function remapLessonRun(snapshot:LessonRunSnapshot,steps:Activity[]):LessonRunSnapshot|null{
  const currentIndex=new Map(steps.map((step,index)=>[step.id,index] as const));
  const remapResults=(results:Record<number,boolean>):Record<number,boolean>=>{
    const next:Record<number,boolean>={};
    for(const [rawIndex,value] of Object.entries(results)){
      const oldIndex=Number(rawIndex);
      const id=snapshot.stepIds[oldIndex];
      if(!id)continue;
      const newIndex=currentIndex.get(id);
      if(newIndex!==undefined)next[newIndex]=value;
    }
    return next;
  };
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

  let taskSection:TaskSectionSnapshot|undefined;
  if(snapshot.taskSection){
    const taskIds=snapshot.taskSection.order
      .map(index=>snapshot.stepIds[index])
      .filter((id):id is string=>Boolean(id));
    const taskOrder:number[]=[];
    let taskPos=0;
    let taskFirstPass=0;
    for(let i=0;i<taskIds.length;i++){
      const index=currentIndex.get(taskIds[i]!);
      if(index===undefined)continue;
      if(i<snapshot.taskSection.pos)taskPos++;
      if(i<snapshot.taskSection.firstPass)taskFirstPass++;
      taskOrder.push(index);
    }
    if(taskOrder.length){
      taskSection={
        ...snapshot.taskSection,
        order:taskOrder,
        pos:Math.min(taskPos,taskOrder.length-1),
        firstPass:Math.min(taskFirstPass,taskOrder.length),
        firstPassResults:remapResults(snapshot.taskSection.firstPassResults)
      };
    }
  }

  const snapshotWithoutTaskSection={...snapshot};
  delete snapshotWithoutTaskSection.taskSection;
  return {
    ...snapshotWithoutTaskSection,
    stepIds:steps.map(step=>step.id),
    order:mappedOrder,
    pos:mappedPos,
    firstPass:mappedFirstPass,
    firstPassResults:remapResults(snapshot.firstPassResults),
    ...(taskSection?{taskSection}:{})
  };
}


/** What still keeps the day from counting: practice not passed yet, steps not done. */
export function missingForNode(node:RoadmapNode,progress:CourseProgressDocument){
  const state=roadmapProgressFromDocument(progress);
  const practice:{activityId:string;mode:PracticeSrsKind}[]=[];
  const unseen:string[]=[];
  for(const requirement of node.completion?.requirements??[]){
    if(isNodeRequirementComplete(requirement,node.id,state))continue;
    if(isPracticeCompletionRequirement(requirement)){
      for(const mode of requirement.modes){
        const record=state.practice[mode]?.[requirement.activityId];
        if(!record||!practiceProgressComplete(record))practice.push({activityId:requirement.activityId,mode});
      }
    }else if(requirement.kind==='activity-seen'){
      unseen.push(...requirement.activityIds.filter(id=>!state.seenActivityIds.has(id)));
    }
  }
  return {practice,unseen};
}

export interface MissingRequirementTarget {
  index:number;
  mode?:PracticeSrsKind;
}

export interface LessonSummaryQualityRow{
  id:'tasks'|PracticeSrsKind;
  correct:number;
  total:number;
}

export function buildLessonSummaryQuality(
  steps:Activity[],
  taskResults:Record<number,boolean>,
  practiceQuality:PracticeQualityMap
):{rows:LessonSummaryQualityRow[];corrected:number;complete:boolean}{
  const rows:LessonSummaryQualityRow[]=[];
  let expectedSections=0;
  const taskIndices=steps
    .map((item,index)=>({item,index}))
    .filter(({item})=>item.type==='choice'||item.type==='text-input'||item.type==='translation')
    .map(({index})=>index);
  if(taskIndices.length){
    expectedSections++;
    if(taskIndices.every(index=>taskResults[index]!==undefined)){
      rows.push({
        id:'tasks',
        correct:taskIndices.filter(index=>taskResults[index]===true).length,
        total:taskIndices.length
      });
    }
  }
  for(const mode of ['drill','listening','speaking'] as PracticeSrsKind[]){
    const expectedTotal=steps.reduce((sum,item)=>
      item.type==='pattern-drill'&&item.modes.includes(mode)?sum+item.items.length:sum
    ,0);
    if(!expectedTotal)continue;
    expectedSections++;
    const values=Object.values(practiceQuality).filter(item=>item.mode===mode);
    const total=values.reduce((sum,item)=>sum+item.total,0);
    if(total!==expectedTotal)continue;
    rows.push({
      id:mode,
      correct:values.reduce((sum,item)=>sum+item.correct,0),
      total
    });
  }
  return {
    rows,
    corrected:rows.reduce((sum,row)=>sum+Math.max(0,row.total-row.correct),0),
    complete:rows.length===expectedSections
  };
}

/** First unresolved required activity in the lesson's actual order. */
export function firstMissingRequirementTarget(
  node:RoadmapNode,
  steps:Activity[],
  progress:CourseProgressDocument
):MissingRequirementTarget|null{
  const missing=missingForNode(node,progress);
  const candidates:{index:number;sequence:number;mode?:PracticeSrsKind}[]=[];
  let sequence=0;
  for(const id of missing.unseen){
    const index=steps.findIndex(item=>item.id===id);
    if(index>=0)candidates.push({index,sequence:sequence++});
  }
  for(const item of missing.practice){
    const index=steps.findIndex(step=>step.id===item.activityId);
    if(index>=0)candidates.push({index,sequence:sequence++,mode:item.mode});
  }
  candidates.sort((a,b)=>a.index-b.index||a.sequence-b.sequence);
  const target=candidates[0];
  if(!target)return null;
  return target.mode===undefined
    ? {index:target.index}
    : {index:target.index,mode:target.mode};
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
  startSection,
  startMode,
  resumeSavedRun=false,
  replayTasksOnly=false,
  startFromBeginning=false
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
  const answerInputRef=useRef<HTMLInputElement>(null);
  const [picked,setPicked]=useState<string[]>([]);
  const [result,setResult]=useState<boolean|null>(null);
  const [nearResult,setNearResult]=useState(false);
  const [busy,setBusy]=useState(false);
  const [answerSaveError,setAnswerSaveError]=useState(false);
  const [theoryOpen,setTheoryOpen]=useState(false);
  const [score,setScore]=useState({correct:0,total:0});
  const [firstPassResults,setFirstPassResults]=useState<Record<number,boolean>>({});
  const [practiceQuality,setPracticeQuality]=useState<PracticeQualityMap>({});
  const [exitOpen,setExitOpen]=useState(false);
  const [finished,setFinished]=useState(false);
  const [checking,setChecking]=useState(false);
  const [practiceMode,setPracticeMode]=useState<PracticeSrsKind|undefined>(startMode);
  const [practiceProgress,setPracticeProgress]=useState<{current:number;total:number}|null>(null);
  const reportPracticeProgress=useCallback((current:number,total:number)=>{
    setPracticeProgress(previous=>previous?.current===current&&previous.total===total?previous:{current,total});
  },[]);
  const [practiceActivityIndex,setPracticeActivityIndex]=useState<number|null>(null);
  const [shuffleSeed,setShuffleSeed]=useState(()=>randomSeed());
  const [runHydrated,setRunHydrated]=useState(false);
  const [runId,setRunId]=useState(()=>randomSeed());
  const [runMode,setRunMode]=useState<LessonRunMode>('first');
  const replay=runMode==='replay';
  const completionTrackedRef=useRef(false);
  // The step a restored run lands on: its saved answer/feedback must survive the first render
  // of that step (the reset below would otherwise wipe it once the restored order arrives).
  const restoringRunRef=useRef<string|null>(null);
  const taskSectionRef=useRef<TaskSectionSnapshot|null>(null);
  const closeExitSheet=()=>setExitOpen(false);

  const leaveFromExitSheet=()=>{
    if(state&&node)markLessonRunPaused(state.set.id,node.id);
    setExitOpen(false);
    onExit();
  };

  useEffect(()=>{
    const onSystemBack=(event:Event)=>{
      event.preventDefault();
      if(finished){
        onExit();
        return;
      }
      if(exitOpen){
        setExitOpen(false);
        return;
      }
      setExitOpen(true);
    };
    window.addEventListener(SYSTEM_BACK_EVENT,onSystemBack);
    return ()=>window.removeEventListener(SYSTEM_BACK_EVENT,onSystemBack);
  },[exitOpen,finished,onExit]);

  useEffect(()=>{
    // Completed nodes opened later are not new completions. A persisted completion candidate
    // is the proof that this particular run still needs its completion event delivered.
    completionTrackedRef.current=false;
  },[node?.id]);

  const begin=(startIndex:number,newRun=true)=>{
    setOrder(range(startIndex,steps.length));
    setFirstPass(steps.length-startIndex);
    setPos(0);
    setSelected(null);
    setAnswer('');
    setTyping(false);
    setPicked([]);
    setResult(null);
    setNearResult(false);
    setAnswerSaveError(false);
    setScore({correct:0,total:0});
    setFirstPassResults({});
    setShuffleSeed(randomSeed());
    if(newRun){
      taskSectionRef.current=null;
      setPracticeQuality({});
      setRunId(randomSeed());
    }
    setExitOpen(false);
    setFinished(false);
  };

  const stepSignature=steps.map(item=>item.id).join('|');
  useEffect(()=>{
    if(!state||!node)return;
    setRunHydrated(false);
    if(replayTasksOnly){
      const regular=steps
        .map((item,index)=>({item,index}))
        .filter(({item})=>item.type==='choice'||item.type==='text-input'||item.type==='translation')
        .map(({index})=>index);
      const replayOrder=regular.length?regular:range(0,steps.length);
      begin(0);
      setOrder(replayOrder);
      setFirstPass(replayOrder.length);
      setIntro(false);
      setRunMode('replay');
      setRunHydrated(true);
      return;
    }

    if(startFromBeginning&&!nodeProgress?.complete){
      const saved=readLessonRun(state.set.id,node.id);
      const restored=saved?remapLessonRun(saved,steps):null;
      const regular=steps
        .map((item,index)=>({item,index}))
        .filter(({item})=>item.type==='choice'||item.type==='text-input'||item.type==='translation')
        .map(({index})=>index);
      const firstIndex=regular[0]??0;
      begin(firstIndex);
      if(regular.length){
        setOrder(regular);
        setFirstPass(regular.length);
      }
      setIntro(theoryCards.length>0);
      setPracticeMode(undefined);
      setRunId(restored?.runId??randomSeed());
      setRunMode(restored?'resume':'first');
      setScore(restored?.taskSection?.score??restored?.score??{correct:0,total:0});
      setFirstPassResults(restored?.taskSection?.firstPassResults??restored?.firstPassResults??{});
      taskSectionRef.current=restored?.taskSection??null;
      setPracticeQuality(restored?.practiceQuality??{});
      setRunHydrated(true);
      return;
    }
    const requested=startActivityId?steps.findIndex(item=>item.id===startActivityId):-1;
    const forcedTheory=startSection==='theory';
    const forcedTasks=startSection==='tasks';
    const forcedPractice=startMode
      ? steps.findIndex(item=>item.type==='pattern-drill'&&item.modes.includes(startMode))
      : -1;
    const saved=requested<0&&!forcedTheory&&!forcedTasks&&forcedPractice<0
      ? readLessonRun(state.set.id,node.id)
      : null;
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
      setNearResult(restored.nearResult??false);
      setScore(restored.score);
      setFirstPassResults(restored.firstPassResults);
      setShuffleSeed(restored.shuffleSeed??randomSeed());
      setRunId(restored.runId??randomSeed());
      taskSectionRef.current=restored.taskSection??null;
      setPracticeQuality(restored.practiceQuality??{});
      setPracticeMode(restored.practiceMode);
      setRunMode(
        restored.mode==='replay'||restored.replay
          ? 'replay'
          : 'resume'
      );
      clearPausedLessonRun(state.set.id,node.id);
      setFinished(false);
    }else{
      // Never destroy an unfinished run merely because refreshed course content is temporarily
      // different (e.g. after auth/Plus purchase). Only a completed node invalidates it.
      if(saved&&nodeProgress?.complete)clearLessonRun(state.set.id,node.id);
      const taskIndices=steps
        .map((item,index)=>({item,index}))
        .filter(({item})=>item.type==='choice'||item.type==='text-input'||item.type==='translation')
        .map(({index})=>index);
      const firstTask=forcedTasks
        ? (taskIndices.find(index=>!isSeen(state.progress,steps[index]!.id))??taskIndices[0]??-1)
        : -1;
      const missingTarget=requested<0&&forcedPractice<0&&firstTask<0
        ? firstMissingRequirementTarget(node,steps,state.progress)
        : null;
      const startIndex=requested>=0
        ? requested
        : forcedPractice>=0
          ? forcedPractice
          : firstTask>=0
            ? firstTask
            : (missingTarget?.index??firstIncompleteRequirementIndex(node,steps,state.progress));
      begin(startIndex);
      const startActivity=steps[startIndex];
      const startsInTasks=Boolean(
        startActivity&&(
          startActivity.type==='choice'||
          startActivity.type==='text-input'||
          startActivity.type==='translation'
        )
      );
      if((forcedTasks&&firstTask>=0)||startsInTasks){
        const taskStart=forcedTasks&&firstTask>=0?firstTask:startIndex;
        const taskOrder=taskIndices.filter(index=>index>=taskStart);
        setOrder(taskOrder.length?taskOrder:[taskStart]);
        setFirstPass(taskOrder.length||1);
      }else if(startActivity?.type==='pattern-drill'){
        // Practice is its own required section. Regular-task corrections must be cleared first.
        setOrder([startIndex]);
        setFirstPass(1);
      }
      setIntro(forcedTheory||(!forcedTasks&&forcedPractice<0&&requested<0&&theoryCards.some(card=>!isSeen(state.progress,card.id))));
      setPracticeMode(startMode??missingTarget?.mode);
      // A completed day opened again is a replay. Otherwise continuing any existing
      // progress without a saved snapshot is an explicit resume, not a fresh first run.
      const hasExistingProgress=activities.some(item=>isSeen(state.progress,item.id))
        || steps.some(step=>Object.values(state.progress.practice).some(records=>{
          const record=records[step.id];
          return Boolean(record&&!record.deleted);
        }));
      setRunMode(
        Boolean(nodeProgress?.complete)&&requested<0
          ? 'replay'
          : hasExistingProgress
            ? 'resume'
            : 'first'
      );
    }
    setRunHydrated(true);
    // Old progress may still miss the day's plan card: it is part of the day, mark it quietly.
    for(const plan of activities.filter(isPlan)){
      if(!isSeen(state.progress,plan.id))void saveSeen(state.set.id,plan.id).catch(()=>undefined);
    }
  },[node?.id,state?.set.id,startActivityId,startSection,startMode,stepSignature,resumeSavedRun,replayTasksOnly,startFromBeginning]);

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
      nearResult,
      score,
      firstPassResults,
      ...(taskSectionRef.current?{taskSection:taskSectionRef.current}:{}),
      ...(Object.keys(practiceQuality).length?{practiceQuality}:{}),
      shuffleSeed,
      runId,
      mode:runMode,
      ...(practiceMode?{practiceMode}:{}),
      ...(replay?{replay:true}:{})
    });
  },[runHydrated,state?.set.id,node?.id,stepSignature,order,firstPass,pos,intro,selected,answer,typing,picked,result,nearResult,score,firstPassResults,practiceQuality,shuffleSeed,runId,runMode,practiceMode,finished,replay]);

  const stepIndex=order[pos];
  const activity=stepIndex===undefined?null:steps[stepIndex]??null;

  useEffect(()=>{
    if(activity?.type==='pattern-drill'&&stepIndex!==undefined)setPracticeActivityIndex(stepIndex);
  },[activity?.id,stepIndex]);

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
    setNearResult(false);
    setAnswerSaveError(false);
    setBusy(false);
  },[activity?.id,pos]);

  // Count completion from a durable candidate. It is written before refresh, so an app
  // kill between the final answer and the refreshed roadmap cannot lose the event.
  const nodeComplete=Boolean(nodeProgress?.complete);
  useEffect(()=>{
    if(!runHydrated||!finished||checking||nodeComplete||!state||!node)return;
    const target=firstMissingRequirementTarget(node,steps,state.progress);
    if(!target)return;

    // A manually opened section may finish while another required section is still pending.
    // Do not show the dead-end «day not counted» summary: continue the same canonical run.
    // Preserve the completed Tasks section before its top-level runner state is repurposed.
    if(activity&&(activity.type==='choice'||activity.type==='text-input'||activity.type==='translation')){
      taskSectionRef.current={
        order:[...order],
        firstPass,
        pos,
        selected,
        answer,
        typing,
        picked:[...picked],
        result,
        nearResult,
        score:{...score},
        firstPassResults:{...firstPassResults},
        shuffleSeed,
        runId,
        runMode
      };
    }
    clearCompletionCandidate(state.set.id,node.id);
    setFinished(false);
    begin(target.index,false);
    setIntro(false);
    if(target.mode){
      setOrder([target.index]);
      setFirstPass(1);
      setPracticeMode(target.mode);
    }else{
      setPracticeMode(undefined);
    }
  },[checking,finished,node?.id,nodeComplete,runHydrated,state?.progress,stepSignature]);

  useEffect(()=>{
    if(!runHydrated||!state||!node)return;
    const candidate=readCompletionCandidate(state.set.id,node.id);
    if(candidate&&nodeComplete&&!completionTrackedRef.current){
      completionTrackedRef.current=true;
      if(node.kind==='lesson')trackLessonCompleted(candidate.runId,candidate.mode);
      if(node.dayIndex)trackDayCompleted(candidate.runId,candidate.mode);
      clearCompletionCandidate(state.set.id,node.id);
      clearLessonRun(state.set.id,node.id);
      if(candidate.mode!=='replay')onNodeCompleted(node);
      return;
    }
    // A stale candidate from a run that did not actually satisfy the node is discarded
    // on the next normal hydration. During finish/checking we keep it until refresh resolves.
    if(candidate&&!nodeComplete&&!checking&&!finished){
      clearCompletionCandidate(state.set.id,node.id);
    }
    if(finished&&!nodeComplete&&!checking){
      clearLessonRun(state.set.id,node.id);
    }
  },[runHydrated,state?.set.id,node?.id,nodeComplete,checking,finished]);

  const finish=async()=>{
    if(state&&node){
      writeCompletionCandidate({
        version:1,
        setId:state.set.id,
        nodeId:node.id,
        runId,
        mode:runMode
      });
    }
    setChecking(true);
    try{ await runtime.refresh(); }catch{ /* candidate stays durable for the next launch */ }
    setChecking(false);
    setFinished(true);
  };

  const advance=()=>{
    withViewTransition(()=>{
      if(pos+1<order.length){
        setPos(current=>current+1);
        return;
      }
      if(node)void finish();
      else onExit();
    });
  };

  // A wrong answer comes back at the end of the section until it is actually resolved.
  const retryLater=()=>{
    if(stepIndex===undefined)return;
    setOrder(current=>current.slice(pos+1).includes(stepIndex)?current:[...current,stepIndex]);
  };
  const countAnswer=(correct:boolean,record:boolean)=>{
    if(!record||pos>=firstPass)return;
    const answeredStep=order[pos];
    if(answeredStep===undefined)return;
    setFirstPassResults(current=>{
      if(current[answeredStep]!==undefined)return current;
      setScore(scoreCurrent=>({
        correct:scoreCurrent.correct+(correct?1:0),
        total:scoreCurrent.total+1
      }));
      return {...current,[answeredStep]:correct};
    });
  };

  const exitSheet=(
    <Sheet open={exitOpen} onClose={closeExitSheet} labelledBy="lesson-exit-title" closeLabel={t('learn.exitStay')} historyEntry={false} className="lesson-exit-sheet">
      <div className="confirm-sheet confirm-sheet-compact">
        <h3 id="lesson-exit-title">{t('learn.exitTitle')}</h3>
        <p className="tile-text">{t('learn.exitText')}</p>
        <button className="primary-button" type="button" onClick={closeExitSheet}>{t('learn.exitStay')}</button>
        <button
          className="secondary-button"
          type="button"
          onClick={leaveFromExitSheet}
        >{t('learn.exitSave')}</button>
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

  const pendingRequiredTarget=finished&&state&&node&&!nodeComplete
    ? firstMissingRequirementTarget(node,steps,state.progress)
    : null;
  if(pendingRequiredTarget){
    // The effect above immediately reopens this target. Avoid flashing an incomplete-day summary.
    return <section className="learn-shell"><Loader title={t('learn.continuingRequired')} /></section>;
  }

  if(finished&&node&&state){
    const missing=missingForNode(node,state.progress);
    const summaryTaskResults=taskSectionRef.current?.firstPassResults??firstPassResults;
    const summaryQuality=buildLessonSummaryQuality(steps,summaryTaskResults,practiceQuality);
    const qualityLabelKey:Record<LessonSummaryQualityRow['id'],string>={
      tasks:'learn.summaryTasks',
      drill:'learn.summaryDrill',
      listening:'learn.summaryListening',
      speaking:'learn.summarySpeaking'
    };
    const qualityValueKey:Record<LessonSummaryQualityRow['id'],string>={
      tasks:'learn.summaryTasksValue',
      drill:'learn.summaryDrillValue',
      listening:'learn.summaryListeningValue',
      speaking:'learn.summarySpeakingValue'
    };
    const completedLessons=state.roadmapProgress.nodes.filter(item=>item.node.kind==='lesson'&&item.complete).length;
    const offerReminder=node.kind==='lesson'&&nodeComplete&&runMode==='first'&&completedLessons===1;
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
        <FirstLessonNotificationOffer eligible={offerReminder} />
        <div className={'learn-summary'+(nodeComplete?' completion-summary':'')}>
          <span className={'learn-summary-icon'+(nodeComplete?'':' is-pending')} aria-hidden="true"><Icon name={nodeComplete?'check':'review'} size={32} /></span>
          <div className="screen-kicker">{t(nodeComplete?'learn.summaryKicker':'learn.notCountedKicker')}</div>
          <h2 id="learn-summary-title"><LexiconText text={localized(node.title,locale)} /></h2>
          {nodeComplete&&summaryQuality.rows.length>0&&(
            <div className="learn-summary-quality" aria-label={t(replay?'learn.replayQualityTitle':'learn.summaryQualityTitle')}>
              <strong className="learn-summary-quality-title">{t(replay?'learn.replayQualityTitle':'learn.summaryQualityTitle')}</strong>
              {summaryQuality.rows.map(row=>(
                <div className="learn-summary-quality-row" key={row.id}>
                  <span>{t(qualityLabelKey[row.id])}</span>
                  <strong>{t(qualityValueKey[row.id],{correct:row.correct,total:row.total})}</strong>
                </div>
              ))}
              {summaryQuality.complete&&summaryQuality.corrected>0&&(
                <span className="learn-summary-corrected">{t('learn.summaryCorrected',{count:summaryQuality.corrected})}</span>
              )}
            </div>
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

  const regularTaskIndices=steps
    .map((item,index)=>({item,index}))
    .filter(({item})=>item.type==='choice'||item.type==='text-input'||item.type==='translation')
    .map(({index})=>index);
  const patternEntries=steps
    .map((item,index)=>({item,index}))
    .filter((entry):entry is {item:Extract<Activity,{type:'pattern-drill'}>;index:number}=>entry.item.type==='pattern-drill');
  const availablePracticeModes=(['drill','listening','speaking'] as PracticeSrsKind[])
    .filter(mode=>patternEntries.some(({item})=>item.modes.includes(mode)));
  const visiblePatternIndex=activity?.type==='pattern-drill'&&stepIndex!==undefined
    ? stepIndex
    : practiceActivityIndex;
  const persistentPatternEntry=visiblePatternIndex===null
    ? null
    : patternEntries.find(entry=>entry.index===visiblePatternIndex)??null;

  const captureTaskSection=()=>{
    if(!activity||!(activity.type==='choice'||activity.type==='text-input'||activity.type==='translation'))return;
    taskSectionRef.current={
      order:[...order],
      firstPass,
      pos,
      selected,
      answer,
      typing,
      picked:[...picked],
      result,
      nearResult,
      score:{...score},
      firstPassResults:{...firstPassResults},
      shuffleSeed,
      runId,
      runMode
    };
  };

  const restoreTaskSection=()=>{
    const saved=taskSectionRef.current;
    if(!saved)return false;
    setOrder(saved.order);
    setFirstPass(saved.firstPass);
    setPos(saved.pos);
    setSelected(saved.selected);
    setAnswer(saved.answer);
    setTyping(saved.typing);
    setPicked(saved.picked);
    setResult(saved.result);
    setNearResult(saved.nearResult);
    setScore(saved.score);
    setFirstPassResults(saved.firstPassResults);
    setShuffleSeed(saved.shuffleSeed);
    setRunId(saved.runId);
    setRunMode(saved.runMode);
    setIntro(false);
    setPracticeMode(undefined);
    setBusy(false);
    setAnswerSaveError(false);
    return true;
  };

  const openTasks=()=>{
    if(!regularTaskIndices.length)return;
    withViewTransition(()=>{
      if(restoreTaskSection())return;
      const firstIncomplete=regularTaskIndices.find(index=>!isSeen(state.progress,steps[index]!.id));
      const start=firstIncomplete??regularTaskIndices[0]!;
      const taskOrder=regularTaskIndices.filter(index=>index>=start);
      begin(start,false);
      setOrder(taskOrder.length?taskOrder:[start]);
      setFirstPass(taskOrder.length||1);
      setIntro(false);
      setPracticeMode(undefined);
    });
  };

  const openPractice=(mode:PracticeSrsKind)=>{
    const target=patternEntries.find(({item})=>item.modes.includes(mode));
    if(!target)return;
    captureTaskSection();
    setPracticeActivityIndex(target.index);
    withViewTransition(()=>{
      begin(target.index,false);
      setOrder([target.index]);
      setFirstPass(1);
      setIntro(false);
      setPracticeMode(mode);
    });
  };

  const setId=state.set.id;
  const stage=stageForDay(node.dayIndex,state.set.id);
  const sectionStates=lessonSectionStates(state.set,node,state.progress);
  const sectionComplete=(id:LessonSectionId)=>sectionStates.find(section=>section.id===id)?.complete===true;
  const navChip=(id:LessonSectionId,label:string,active:boolean,onClick:()=>void)=>(
    <button
      key={id}
      className={'chip-button pressable'+(active?' is-active':'')+(sectionComplete(id)?' is-complete':'')}
      type="button"
      aria-current={active?'page':undefined}
      onClick={onClick}
    >
      {sectionComplete(id)&&<Icon name="check" size={13} />}
      {label}
    </button>
  );
  const lessonNav=(
    <nav className="lesson-section-nav" aria-label={t('learn.sectionNav')}>
      {theoryCards.length>0&&navChip(
        'theory',
        t('learn.theory'),
        intro||theoryOpen,
        ()=>{ if(!intro)setTheoryOpen(true); }
      )}
      {regularTaskIndices.length>0&&navChip(
        'tasks',
        t('learn.tasks'),
        !intro&&Boolean(activity&&(activity.type==='choice'||activity.type==='text-input'||activity.type==='translation')),
        openTasks
      )}
      {availablePracticeModes.map(mode=>navChip(
        mode,
        t(MODE_KEY[mode]),
        !intro&&activity?.type==='pattern-drill'&&practiceMode===mode,
        ()=>openPractice(mode)
      ))}
    </nav>
  );
  const header=(
    <div className="runner-heading">
      <div className="runner-heading-text">
        {stage&&<div className="screen-kicker">{t(stageNameKey(stage))}</div>}
        <h2 id="learn-title"><LexiconText text={localized(node.title,locale)} /></h2>
      </div>
      {lessonNav}
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
        <div className="runner-top runner-top-intro">
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
  const retryRemaining=retrying?new Set(order.slice(pos)).size:0;
  // The counter names the lesson's first pass. Correction uses its own remaining-error count.
  const shown=retrying?firstPass:pos+1;
  const position=t('learn.position',{current:shown,total:firstPass});
  // Only the first answer of a first run moves review intervals and stats: a replayed day and
  // «Работа над ошибками» are practice, so a mistake plus its fix never reads as a right answer.
  const regularAnswerActivity=
    activity.type==='choice'||activity.type==='text-input'||activity.type==='translation';
  const priorCard=regularAnswerActivity?state.progress.cards[activity.id]:undefined;
  const alreadyGraded=Boolean(priorCard&&!priorCard.deleted);
  const alreadySeen=isSeen(state.progress,activity.id);
  const recordsAnswers=!replay&&!retrying&&(!regularAnswerActivity||(!alreadyGraded&&!alreadySeen));
  const answerOperationId=(kind:string)=>runId+'|'+activity.id+'|'+pos+'|'+kind;
  const gradeAnswer=(correct:boolean,responseKind?:SentenceResponseKind)=>{
    if(!recordsAnswers){
      // Replayed/completed work never rewrites first-pass SRS. A previously failed unresolved
      // task may still be resolved here once the learner finally answers correctly.
      if(!replay&&regularAnswerActivity&&correct&&!alreadySeen)return saveSeen(setId,activity.id);
      return Promise.resolve();
    }
    const operationId=answerOperationId('card');
    return responseKind
      ? saveGraded(setId,activity.id,correct,responseKind,operationId)
      : saveGraded(setId,activity.id,correct,undefined,operationId);
  };
  const practiceSave=async(
    setIdArg:string,
    activityId:string,
    mode:PracticeSrsKind,
    correct:boolean,
    practiceScore?:number,
    itemGrades?:Readonly<Record<string,PracticeItemGrade>>
  )=>{
    const pattern=state.set.activities.find(item=>item.id===activityId);
    const total=pattern?.type==='pattern-drill'?pattern.items.length:0;
    const rememberQuality=()=>{
      if(!total||typeof practiceScore!=='number')return;
      const key=activityId+'|'+mode;
      setPracticeQuality(current=>current[key]
        ? current
        : {
            ...current,
            [key]:{
              activityId,
              mode,
              correct:Math.max(0,Math.min(total,Math.round(practiceScore*total/100))),
              total
            }
          });
    };
    if(!recordsAnswers){
      rememberQuality();
      return;
    }
    await savePractice(
      setIdArg,
      activityId,
      mode,
      correct,
      practiceScore,
      runId+'|'+activityId+'|'+pos+'|practice:'+mode,
      itemGrades
    );
    rememberQuality();
  };
  const dialogueSave:typeof saveDialogue=(...args)=>recordsAnswers?saveDialogue(...args):Promise.resolve();

  const handleChoice=async(choice:number|null=selected)=>{
    if(activity.type!=='choice'||choice===null||busy||result!==null)return;
    setBusy(true);
    setAnswerSaveError(false);
    try{
      const correct=choice===activity.correctIndex;
      await gradeAnswer(correct);
      countAnswer(correct,recordsAnswers);
      if(!correct)retryLater();
      setResult(correct);
    }catch(_){
      setAnswerSaveError(true);
    }finally{
      setBusy(false);
    }
  };

  const textAnswer=(activity.type==='text-input'||activity.type==='translation')?activity.answer.accepted[0]??'':'';
  // Course content controls the learning ladder explicitly:
  // build → recognition/order, progressive → build until learned then recall by typing, write → recall only.
  const cardState=(activity.type==='text-input'||activity.type==='translation')?state.progress.cards[activity.id]:undefined;
  const responseMode=(activity.type==='text-input'||activity.type==='translation')?(activity.responseMode??'progressive'):'write';
  const adaptiveStage=sentenceResponseStage(cardState);
  const canBuild=Boolean(answerWords(textAnswer));
  // Keep the UI mode of the current attempt stable after grading. Saving a correct
  // chip answer may immediately advance the stored stage to "write", but the learner
  // should still see the chips they just submitted until tapping Next.
  const keepSubmittedBuilder=result!==null&&picked.length>0&&!typing;
  const shouldBuild=canBuild&&!typing&&(
    responseMode==='build' || (responseMode==='progressive'&&(adaptiveStage==='build'||keepSubmittedBuilder))
  );
  const chips=(activity.type==='text-input'||activity.type==='translation')&&shouldBuild
    ? buildChips(shuffleSeed+'|'+activity.id+'|'+pos,textAnswer,steps.flatMap(item=>(item.type==='text-input'||item.type==='translation')&&item.id!==activity.id?[item.answer.accepted[0]??'']:[]))
    : null;
  const input=chips?chipsText(chips,picked):answer.trim();

  const handleText=async()=>{
    if((activity.type!=='text-input'&&activity.type!=='translation')||busy||result!==null)return;
    if(!input)return;
    setBusy(true);
    setAnswerSaveError(false);
    try{
      const exactCorrect=activity.answer.caseSensitive
        ? activity.answer.accepted.some(candidate=>candidate.trim()===input)
        : checkAnswer(input,activity.answer.accepted);
      const typo=!exactCorrect
        && !chips
        && !activity.answer.caseSensitive
        && activity.answer.nearMiss!==false
        && nearMiss(input,activity.answer.accepted);
      const correct=exactCorrect||typo;
      // Near miss is accepted for the lesson, but it must not create or advance SRS debt.
      if(typo){
        await saveSeen(setId,activity.id);
      }else{
        await gradeAnswer(correct,chips?'build':'write');
      }
      countAnswer(correct);
      if(!correct)retryLater();
      setNearResult(typo);
      setResult(correct);
    }catch(_){
      setAnswerSaveError(true);
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
      <AnswerFeedbackSheet
        tone={nearResult?'near':result?'correct':'wrong'}
        title={nearResult?t('learn.nearMiss'):result?t('learn.correct'):t('learn.incorrect')}
        headClassName={willReturn?'has-subtitle':''}
        subtitle={
          <>
            {nearResult&&<p className="learn-hint learn-feedback-return">{t('learn.nearMissHint')}</p>}
            {willReturn&&<p className="learn-hint learn-feedback-return">{t('learn.willReturn')}</p>}
          </>
        }
        actions={
          <>
            {!result&&!nearResult&&learnerAnswer&&acceptedAnswers.length>0&&(
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
          </>
        }
      >
        {(nearResult||!result)&&accepted&&(
          <span><LexiconText text={t('learn.accepted',{answer:accepted})} refs={activity.lexiconRefs} /></span>
        )}
        {explanation&&(
          <p><LexiconText text={localized(explanation,locale)} refs={activity.lexiconRefs} /></p>
        )}
      </AnswerFeedbackSheet>
    );
  };

  const patternHeaderProgress=activity.type==='pattern-drill'
    ? (practiceProgress??{current:0,total:activity.items.length})
    : null;
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
        {patternHeaderProgress ? (
          <>
            <div className="runner-progress runner-progress-segmented" role="progressbar" aria-label={t('learn.activityProgress')} aria-valuemin={0} aria-valuemax={patternHeaderProgress.total} aria-valuenow={patternHeaderProgress.current}>
              {Array.from({length:patternHeaderProgress.total},(_,index)=>(
                <span
                  key={index}
                  className={'runner-progress-step '+(index<patternHeaderProgress.current-1?'is-correct':index===patternHeaderProgress.current-1?'is-current':'is-pending')}
                  aria-hidden="true"
                />
              ))}
            </div>
            <span className="runner-count">{patternHeaderProgress.current}/{patternHeaderProgress.total}</span>
          </>
        ) : (
          <>
            <RunnerProgress order={order} total={firstPass} pos={pos} results={firstPassResults} label={t('learn.activityProgress')} />
            <span className="runner-count" aria-label={position}>
              {retrying?retryRemaining:shown+'/'+firstPass}
            </span>
          </>
        )}
      </div>
      {exitSheet}

      {header}
      {retrying&&<p className="runner-retry" role="status">{t('learn.retryPhase',{count:retryRemaining})}</p>}
      {answerSaveError&&(
        <div className="learn-feedback learn-feedback-wrong learn-save-error" role="alert">
          <strong>{t('learn.saveError')}</strong>
          <span>{t('learn.saveErrorHint')}</span>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={()=>activity.type==='choice'?void handleChoice():void handleText()}
          >
            {t('learn.retrySave')}
          </button>
        </div>
      )}

      {/* The day's theory stays one tap away without moving the lesson back. */}
      <Sheet open={theoryOpen} onClose={()=>setTheoryOpen(false)} labelledBy="theory-sheet-title" closeLabel={t('learn.theoryClose')}>
        <div className="theory-sheet">
          <h3 id="theory-sheet-title">{t('learn.theory')}</h3>
          {theoryBody}
        </div>
      </Sheet>

      <div className="runner-activity">
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
          <AnswerModeTransition mode={chips?'chips':'write'}>
            {chips ? (
              <WordChips chips={chips} picked={picked} disabled={busy||result!==null} onChange={setPicked} />
            ) : (
              <label className="learn-answer">
                <span>{t('learn.answerLabel')}</span>
                <input
                  ref={answerInputRef}
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
          </AnswerModeTransition>
          {result===null&&responseMode==='progressive'&&canBuild&&adaptiveStage==='build'&&(
            <button
              className="link-toggle"
              type="button"
              onClick={()=>{
                if(chips){
                  setPicked([]);
                  setAnswer('');
                  setTyping(true);
                  window.setTimeout(()=>answerInputRef.current?.focus(),MOTION.base+20);
                }else{
                  answerInputRef.current?.blur();
                  setAnswer('');
                  setPicked([]);
                  setTyping(false);
                }
              }}
            >
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

      {persistentPatternEntry&&(
        <div hidden={activity.type!=='pattern-drill'}>
          <PatternPracticeView
            key={persistentPatternEntry.item.id}
            activity={persistentPatternEntry.item}
            courseActivities={state.set.activities}
            progress={state.progress}
            setId={setId}
            savePractice={practiceSave}
            speak={speak}
            {...(practiceMode?{initialMode:practiceMode}:{})}
            showModeNav={false}
            active={activity.type==='pattern-drill'}
            startFromBeginning={startFromBeginning}
            sessionKey={'unmute.pattern-run:'+setId+':'+node.id+':'+runId+':'+persistentPatternEntry.item.id}
            onModeChange={setPracticeMode}
            onProgress={reportPracticeProgress}
            onDone={()=>{
              setPracticeMode(undefined);
              void saveSeen(setId,persistentPatternEntry.item.id).catch(()=>undefined).then(()=>advance());
            }}
          />
        </div>
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
      </div>
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
  const section=search.get('section');
  const startSection=section==='theory'||section==='tasks'?section:undefined;
  const startActivityId=search.get('activity')||undefined;
  const resumeSavedRun=search.get('resume')==='1';
  const replayTasksOnly=search.get('tasks')==='1';
  const startFromBeginning=search.get('start')==='1';
  const leaveLesson=()=>navigate('/',{replace:true});

  return (
    <NodeRunnerView
      runtime={runtime}
      nodeId={String(params.nodeId||'')}
      {...(startActivityId?{startActivityId}:{})}
      {...(startSection?{startSection}:{})}
      {...(startMode?{startMode}:{})}
      {...(resumeSavedRun?{resumeSavedRun:true}:{})}
      {...(replayTasksOnly?{replayTasksOnly:true}:{})}
      {...(startFromBeginning?{startFromBeginning:true}:{})}
      onExit={leaveLesson}
      onSignIn={()=>navigate('/account?return='+encodeURIComponent('/learn/'+String(params.nodeId||'')))}
      onAccess={()=>navigate('/access?from=answer&return='+encodeURIComponent('/learn/'+String(params.nodeId||'')+'?resume=1'))}
      onReviewDay={nodeId=>navigate('/review?day='+encodeURIComponent(nodeId))}
      saveSeen={saveSeenActivity}
      saveGraded={saveGradedActivity}
      savePractice={savePracticeActivity}
    />
  );
}
