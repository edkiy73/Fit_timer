import type { Roadmap, RoadmapNode, NodeCompletionRequirement } from '../content/schema';
import type { PracticeSrsKind, PracticeSrsState } from './practice-srs';

export interface LearningCalendarState {
  lastDay?:string;
  activeDay?:string;
  streak:number;
}

export interface PracticeProgressState extends PracticeSrsState {
  /** Durable completion is separate from SRS strength. Old records may omit it. */
  completed?:boolean;
}

export interface RoadmapProgressState {
  seenActivityIds:ReadonlySet<string>;
  practice:Record<PracticeSrsKind,Record<string,PracticeProgressState|undefined>>;
  manualNodeIds:ReadonlySet<string>;
}

export interface RoadmapNodeProgress {
  node:RoadmapNode;
  complete:boolean;
  unlocked:boolean;
}

export interface RoadmapProgressSummary {
  nodes:RoadmapNodeProgress[];
  currentNode:RoadmapNode|null;
  currentDayIndex:number|null;
  completedCount:number;
  requiredCount:number;
  courseComplete:boolean;
}

export function dayNumberFromKey(dayKey:string):number{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if(!match) throw new Error('bad_day_key');
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const stamp=Date.UTC(year,month-1,day);
  const date=new Date(stamp);
  if(
    date.getUTCFullYear()!==year ||
    date.getUTCMonth()!==month-1 ||
    date.getUTCDate()!==day
  ) throw new Error('bad_day_key');
  return Math.floor(stamp/86400000);
}

export function recordLearningActivity(
  previous:LearningCalendarState|undefined,
  todayKey:string
):LearningCalendarState{
  const state=previous ?? {streak:0};
  dayNumberFromKey(todayKey);

  if(state.lastDay===todayKey){
    return {...state,activeDay:todayKey};
  }

  const previousDay=state.lastDay ? dayNumberFromKey(state.lastDay) : null;
  const today=dayNumberFromKey(todayKey);
  const streak=previousDay!==null && today-previousDay===1
    ? (state.streak||0)+1
    : 1;

  return {
    ...state,
    lastDay:todayKey,
    activeDay:todayKey,
    streak,
  };
}

export function learningGapDays(
  state:LearningCalendarState|undefined,
  todayKey:string
):number{
  if(!state?.activeDay)return 0;
  return Math.max(0,dayNumberFromKey(todayKey)-dayNumberFromKey(state.activeDay));
}

export function practiceProgressComplete(state:PracticeProgressState|undefined):boolean{
  if(!state)return false;
  if(state.completed!==undefined)return state.completed===true;
  // Backward compatibility: before an explicit completion marker existed, only box > 0
  // could represent a practice mode that had been accepted as completed.
  return state.box>0;
}

function practiceRequirementComplete(
  requirement:Extract<NodeCompletionRequirement,{kind:'practice-started'}>,
  progress:RoadmapProgressState
):boolean{
  return requirement.modes.every(mode=>
    practiceProgressComplete(progress.practice[mode]?.[requirement.activityId])
  );
}

export function isNodeRequirementComplete(
  requirement:NodeCompletionRequirement,
  nodeId:string,
  progress:RoadmapProgressState
):boolean{
  if(requirement.kind==='manual') return progress.manualNodeIds.has(nodeId);
  if(requirement.kind==='activity-seen'){
    return requirement.activityIds.every(id=>progress.seenActivityIds.has(id));
  }
  return practiceRequirementComplete(requirement,progress);
}

export function isRoadmapNodeComplete(
  node:RoadmapNode,
  progress:RoadmapProgressState
):boolean{
  const completion=node.completion;
  if(completion){
    return completion.requirements.every(requirement=>
      isNodeRequirementComplete(requirement,node.id,progress)
    );
  }

  // Compatibility fallback for older/custom sets that do not yet declare completion.
  return node.activityIds.length>0 &&
    node.activityIds.every(id=>progress.seenActivityIds.has(id));
}

export function buildRoadmapProgress(
  roadmap:Roadmap,
  progress:RoadmapProgressState
):RoadmapProgressSummary{
  const ordered=[...roadmap.nodes].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const byId=new Map(ordered.map(node=>[node.id,node]));
  const complete=new Map<string,boolean>();
  for(const node of ordered) complete.set(node.id,isRoadmapNodeComplete(node,progress));

  const nodes=ordered.map(node=>{
    const unlocked=node.prerequisites.every(id=>Boolean(byId.get(id))&&complete.get(id)===true);
    return {node,complete:complete.get(node.id)===true,unlocked};
  });

  const required=nodes.filter(item=>!item.node.optional);
  const courseComplete=required.every(item=>item.complete);
  let currentNode:RoadmapNode|null=null;

  if(!courseComplete){
    currentNode=nodes.find(item=>item.unlocked&&!item.complete&&!item.node.optional)?.node ?? null;
    if(!currentNode){
      // If an explicitly optional prerequisite is the only way forward, expose it
      // instead of returning a dead end.
      currentNode=nodes.find(item=>item.unlocked&&!item.complete)?.node ?? null;
    }
  }

  return {
    nodes,
    currentNode,
    currentDayIndex:currentNode?.dayIndex ?? null,
    completedCount:required.filter(item=>item.complete).length,
    requiredCount:required.length,
    courseComplete,
  };
}

export function emptyRoadmapProgress():RoadmapProgressState{
  return {
    seenActivityIds:new Set(),
    practice:{drill:{},listening:{},speaking:{}},
    manualNodeIds:new Set(),
  };
}
