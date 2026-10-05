import type { CourseSet, RoadmapNode } from './content/schema';
import type { PracticeSrsKind } from './engine/practice-srs';
import type { ActivePracticeProgress } from './day-progress';

interface StoredLessonRun {
  version?:number;
  setId?:string;
  nodeId?:string;
  runId?:string;
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

function lessonRunId(setId:string,nodeId:string):string|null{
  const value=readJson('unmute.lesson-run:'+setId+':'+nodeId) as StoredLessonRun|null;
  if(!value||value.version!==1||value.setId!==setId||value.nodeId!==nodeId)return null;
  return typeof value.runId==='string'&&value.runId?value.runId:null;
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

/** Same-device unfinished practice only. Durable cross-device progress still comes from CourseProgress. */
export function readActivePracticeProgress(
  set:CourseSet,
  node:RoadmapNode
):ActivePracticeProgress[]{
  if(typeof localStorage==='undefined')return [];
  const runId=lessonRunId(set.id,node.id);
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
