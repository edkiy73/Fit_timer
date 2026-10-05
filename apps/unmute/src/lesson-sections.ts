import type { CourseProgressDocument } from './progress';
import type { Activity, CourseSet, RoadmapNode } from './content/schema';
import type { PracticeSrsKind } from './engine/practice-srs';

export type LessonSectionId='theory'|'tasks'|PracticeSrsKind;

export interface LessonSectionState {
  id:LessonSectionId;
  labelKey:string;
  complete:boolean;
  activityId?:string;
}

const MODE_KEY:Record<PracticeSrsKind,string>={
  drill:'kind.drill',
  listening:'kind.listening',
  speaking:'kind.speaking'
};

const isSeen=(progress:CourseProgressDocument,id:string)=>{
  const seen=progress.seen[id];
  return Boolean(seen&&!seen.deleted);
};

const isPlan=(activity:Activity)=>activity.type==='theory'&&(activity.tags??[]).includes('plan');

export function lessonSectionStates(
  set:CourseSet,
  node:RoadmapNode,
  progress:CourseProgressDocument
):LessonSectionState[]{
  const activities=node.activityIds
    .map(id=>set.activities.find(activity=>activity.id===id))
    .filter((activity):activity is Activity=>Boolean(activity));

  const sections:LessonSectionState[]=[];
  const theory=activities.filter(activity=>activity.type==='theory'&&!isPlan(activity));
  if(theory.length){
    sections.push({
      id:'theory',
      labelKey:'learn.theory',
      complete:theory.every(activity=>isSeen(progress,activity.id))
    });
  }

  const tasks=activities.filter(activity=>
    activity.type==='choice'||activity.type==='text-input'||activity.type==='translation'
  );
  if(tasks.length){
    sections.push({
      id:'tasks',
      labelKey:'learn.tasks',
      complete:tasks.every(activity=>isSeen(progress,activity.id))
    });
  }

  const patterns=activities.filter(
    (activity):activity is Extract<Activity,{type:'pattern-drill'}>=>activity.type==='pattern-drill'
  );
  for(const mode of ['drill','listening','speaking'] as PracticeSrsKind[]){
    const pattern=patterns.find(activity=>activity.modes.includes(mode));
    if(!pattern)continue;
    const record=progress.practice[mode]?.[pattern.id];
    sections.push({
      id:mode,
      labelKey:MODE_KEY[mode],
      complete:Boolean(record&&!record.deleted&&record.box>0),
      activityId:pattern.id
    });
  }

  return sections;
}
