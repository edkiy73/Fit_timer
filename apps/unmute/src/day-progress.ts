import type { Activity, CourseSet, RoadmapNode } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { PracticeSrsKind } from './engine/practice-srs';
import { practiceProgressComplete } from './engine/course-progress';

export type DayProgressSectionId='tasks'|PracticeSrsKind|'manual';

export interface ActivePracticeProgress {
  activityId:string;
  mode:PracticeSrsKind;
  resolvedSteps:number;
  attemptedSteps?:number;
  pendingCorrections?:number;
}

export interface ActiveTaskProgress {
  attemptedSteps:number;
  pendingCorrections:number;
}

export interface ActiveDayProgress {
  practice?:readonly ActivePracticeProgress[];
  tasks?:ActiveTaskProgress;
}

export interface DayProgressSection {
  id:DayProgressSectionId;
  activityId?:string;
  required:boolean;
  totalSteps:number;
  completedSteps:number;
  attemptedSteps:number;
  pendingCorrections:number;
  status:'not_started'|'in_progress'|'correcting'|'complete';
}

export interface DayProgress {
  status:'not_started'|'in_progress'|'complete';
  totalSteps:number;
  completedSteps:number;
  attemptedSteps:number;
  pendingCorrections:number;
  sections:DayProgressSection[];
  nextRequiredSection:DayProgressSection|null;
  dayComplete:boolean;
}

function isLive(value:{deleted?:boolean}|undefined):boolean{
  return Boolean(value&&!value.deleted);
}

export function dayActivityStepCount(activity:Activity|undefined):number{
  if(!activity)return 0;
  if(activity.type==='theory'||activity.type==='pattern-drill'||activity.type==='review')return 0;
  return 1;
}

function sectionStatus(
  completed:number,
  total:number,
  pendingCorrections:number,
  attempted:number
):DayProgressSection['status']{
  if(total>0&&completed>=total)return 'complete';
  if(pendingCorrections>0)return 'correcting';
  if(attempted>0||completed>0)return 'in_progress';
  return 'not_started';
}

function clamped(value:number,total:number):number{
  if(!Number.isFinite(value))return 0;
  return Math.max(0,Math.min(total,Math.floor(value)));
}

function taskSection(
  ids:string[],
  byId:Map<string,Activity>,
  progress:CourseProgressDocument,
  active:ActiveTaskProgress|undefined
):DayProgressSection|null{
  let total=0;
  let completed=0;
  for(const id of ids){
    const activity=byId.get(id);
    const count=dayActivityStepCount(activity);
    if(!count)continue;
    total+=count;
    if(isLive(progress.seen[id]))completed+=count;
  }
  if(!total)return null;
  const attempted=Math.max(completed,clamped(active?.attemptedSteps??0,total));
  const pending=Math.max(0,Math.min(total-completed,Math.floor(active?.pendingCorrections??0)));
  return {
    id:'tasks',
    required:true,
    totalSteps:total,
    completedSteps:completed,
    attemptedSteps:attempted,
    pendingCorrections:pending,
    status:sectionStatus(completed,total,pending,attempted)
  };
}

function practiceSection(
  activity:Extract<Activity,{type:'pattern-drill'}>,
  mode:PracticeSrsKind,
  progress:CourseProgressDocument,
  active:ActivePracticeProgress|undefined
):DayProgressSection{
  const total=activity.items.length;
  const record=progress.practice[mode][activity.id];
  const durableComplete=Boolean(record&&!record.deleted&&practiceProgressComplete(record));
  const activeResolved=active?clamped(active.resolvedSteps,total):0;
  const completed=durableComplete?total:activeResolved;
  const attempted=durableComplete
    ? total
    : Math.max(completed,active?clamped(active.attemptedSteps??active.resolvedSteps,total):0);
  const pending=durableComplete?0:Math.max(0,Math.floor(active?.pendingCorrections??0));
  return {
    id:mode,
    activityId:activity.id,
    required:true,
    totalSteps:total,
    completedSteps:completed,
    attemptedSteps:attempted,
    pendingCorrections:pending,
    status:sectionStatus(completed,total,pending,attempted)
  };
}

function manualSection(node:RoadmapNode,progress:CourseProgressDocument):DayProgressSection{
  const complete=isLive(progress.manualNodes[node.id]);
  return {
    id:'manual',
    required:true,
    totalSteps:1,
    completedSteps:complete?1:0,
    attemptedSteps:complete?1:0,
    pendingCorrections:0,
    status:complete?'complete':'not_started'
  };
}

function requirementSections(
  set:CourseSet,
  node:RoadmapNode,
  progress:CourseProgressDocument,
  active:ActiveDayProgress
):DayProgressSection[]{
  const byId=new Map(set.activities.map(activity=>[activity.id,activity] as const));
  const sections:DayProgressSection[]=[];
  const requirements=node.completion?.requirements;

  if(requirements?.length){
    const taskIds:string[]=[];
    for(const requirement of requirements){
      if(requirement.kind==='activity-seen'){
        taskIds.push(...requirement.activityIds);
        continue;
      }
      if(requirement.kind==='manual'){
        sections.push(manualSection(node,progress));
        continue;
      }
      const activity=byId.get(requirement.activityId);
      if(activity?.type!=='pattern-drill')continue;
      for(const mode of requirement.modes){
        const active=active.practice?.find(item=>item.activityId===activity.id&&item.mode===mode);
        sections.push(practiceSection(activity,mode,progress,active));
      }
    }
    const tasks=taskSection([...new Set(taskIds)],byId,progress,active.tasks);
    if(tasks)sections.unshift(tasks);
    return sections;
  }

  // Compatibility fallback for old/custom content without an explicit completion contract.
  const taskIds:string[]=[];
  for(const id of node.activityIds){
    const activity=byId.get(id);
    if(!activity)continue;
    if(activity.type==='pattern-drill'){
      for(const mode of activity.modes){
        const active=active.practice?.find(item=>item.activityId===activity.id&&item.mode===mode);
        sections.push(practiceSection(activity,mode,progress,active));
      }
    }else if(activity.type==='review'){
      sections.push(manualSection(node,progress));
    }else{
      taskIds.push(id);
    }
  }
  const tasks=taskSection(taskIds,byId,progress,active.tasks);
  if(tasks)sections.unshift(tasks);
  return sections;
}

export function getDayProgress(
  set:CourseSet,
  node:RoadmapNode,
  progress:CourseProgressDocument,
  active:ActiveDayProgress={}
):DayProgress{
  const sections=requirementSections(set,node,progress,active);
  const totalSteps=sections.reduce((sum,section)=>sum+section.totalSteps,0);
  const completedSteps=sections.reduce((sum,section)=>sum+section.completedSteps,0);
  const attemptedSteps=sections.reduce((sum,section)=>sum+section.attemptedSteps,0);
  const pendingCorrections=sections.reduce((sum,section)=>sum+section.pendingCorrections,0);
  const dayComplete=totalSteps>0&&completedSteps===totalSteps;
  const status:DayProgress['status']=dayComplete
    ? 'complete'
    : (completedSteps>0||attemptedSteps>0||pendingCorrections>0?'in_progress':'not_started');
  return {
    status,
    totalSteps,
    completedSteps,
    attemptedSteps,
    pendingCorrections,
    sections,
    nextRequiredSection:sections.find(section=>section.status!=='complete')??null,
    dayComplete
  };
}
