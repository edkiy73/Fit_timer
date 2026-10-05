import type { CourseSet, RoadmapNode } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { PracticeSrsKind } from './engine/practice-srs';
import {
  dayActivityStepCount,
  type ActiveDayProgress,
  type ActivePracticeProgress,
  type ActiveTaskProgress
} from './day-progress';

interface StoredLessonRun {
  version?:number;
  setId?:string;
  nodeId?:string;
  runId?:string;
  stepIds?:unknown;
  firstPassResults?:unknown;
}

interface StoredPracticeRun {
  version?:number;
  activityRevision?:number;
  itemIds?:unknown;
  pos?:unknown;
}

function readJson(key:string):unknown{
  try{
    const raw=localStorage.getItem(key);
    return raw?JSON.parse(raw):null;
  }catch{
    return null;
  }
}

function readLessonRun(setId:string,nodeId:string):StoredLessonRun|null{
  const value=readJson('unmute.lesson-run:'+setId+':'+nodeId) as StoredLessonRun|null;
  if(!value||value.version!==1||value.setId!==setId||value.nodeId!==nodeId)return null;
  return value;
}

function derivePracticeProgress(
  itemIds:string[],
  pos:number,
  baseIds:ReadonlySet<string>,
  base:number
):Pick<ActivePracticeProgress,'resolvedSteps'|'attemptedSteps'|'pendingCorrections'>{
  const safePos=Math.max(0,Math.min(itemIds.length,Math.floor(pos)));
  if(safePos<base){
    const failedIds=new Set(itemIds.slice(base).filter(id=>baseIds.has(id)));
    const attempted=safePos;
    return {
      resolvedSteps:Math.max(0,attempted-failedIds.size),
      attemptedSteps:attempted,
      pendingCorrections:failedIds.size
    };
  }
  const pendingIds=new Set(itemIds.slice(safePos).filter(id=>baseIds.has(id)));
  return {
    resolvedSteps:Math.max(0,base-pendingIds.size),
    attemptedSteps:base,
    pendingCorrections:pendingIds.size
  };
}

function requiredTaskIds(set:CourseSet,node:RoadmapNode):Set<string>{
  const byId=new Map(set.activities.map(activity=>[activity.id,activity] as const));
  const ids=node.completion?.requirements.flatMap(requirement=>
    requirement.kind==='activity-seen'?requirement.activityIds:[]
  ) ?? node.activityIds;
  return new Set(ids.filter(id=>dayActivityStepCount(byId.get(id))>0));
}

function readActiveTasks(
  set:CourseSet,
  node:RoadmapNode,
  progress:CourseProgressDocument,
  run:StoredLessonRun
):ActiveTaskProgress|undefined{
  if(!Array.isArray(run.stepIds)||!run.firstPassResults||typeof run.firstPassResults!=='object')return undefined;
  const stepIds=run.stepIds.filter((id):id is string=>typeof id==='string');
  const required=requiredTaskIds(set,node);
  const attempted=new Set<string>();
  const pending=new Set<string>();
  for(const [rawIndex,value] of Object.entries(run.firstPassResults as Record<string,unknown>)){
    if(value!==true&&value!==false)continue;
    const index=Number(rawIndex);
    if(!Number.isInteger(index)||index<0||index>=stepIds.length)continue;
    const id=stepIds[index];
    if(!id||!required.has(id))continue;
    attempted.add(id);
    const seen=progress.seen[id];
    if(value===false&&(!seen||seen.deleted))pending.add(id);
  }
  if(!attempted.size&&!pending.size)return undefined;
  return {attemptedSteps:attempted.size,pendingCorrections:pending.size};
}

function readPractice(
  set:CourseSet,
  node:RoadmapNode,
  runId:string|null
):ActivePracticeProgress[]{
  if(!runId)return [];
  const byId=new Map(set.activities.map(activity=>[activity.id,activity] as const));
  const result:ActivePracticeProgress[]=[];
  const modes:PracticeSrsKind[]=['drill','listening','speaking'];

  for(const activityId of node.activityIds){
    const activity=byId.get(activityId);
    if(activity?.type!=='pattern-drill')continue;
    const baseIds=new Set(activity.items.map(item=>item.id));
    const base=activity.items.length;
    const root='unmute.pattern-run:'+set.id+':'+node.id+':'+runId+':'+activity.id;

    for(const mode of modes){
      if(!activity.modes.includes(mode))continue;
      const raw=readJson(root+':'+mode) as StoredPracticeRun|null;
      if(!raw||raw.version!==1||raw.activityRevision!==activity.revision)continue;
      if(!Array.isArray(raw.itemIds)||typeof raw.pos!=='number')continue;
      const itemIds=raw.itemIds.filter((id):id is string=>typeof id==='string');
      if(itemIds.length<base)continue;
      const derived=derivePracticeProgress(itemIds,raw.pos,baseIds,base);
      result.push({activityId:activity.id,mode,...derived});
    }
  }

  return result;
}

/** Same-device unfinished state only. Durable cross-device progress still comes from CourseProgress. */
export function readActiveDayProgress(
  set:CourseSet,
  node:RoadmapNode,
  progress:CourseProgressDocument
):ActiveDayProgress{
  if(typeof localStorage==='undefined')return {};
  const run=readLessonRun(set.id,node.id);
  if(!run)return {};
  const runId=typeof run.runId==='string'&&run.runId?run.runId:null;
  const tasks=readActiveTasks(set,node,progress,run);
  const practice=readPractice(set,node,runId);
  return {
    ...(tasks?{tasks}:{}),
    ...(practice.length?{practice}:{})
  };
}

/** Backward-compatible helper for callers/tests that only need phrase progress. */
export function readActivePracticeProgress(
  set:CourseSet,
  node:RoadmapNode
):ActivePracticeProgress[]{
  if(typeof localStorage==='undefined')return [];
  const run=readLessonRun(set.id,node.id);
  const runId=run&&typeof run.runId==='string'&&run.runId?run.runId:null;
  return readPractice(set,node,runId);
}
