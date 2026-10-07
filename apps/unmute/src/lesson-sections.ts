import type { CourseProgressDocument } from './progress';
import {
  isPracticeCompletionRequirement,
  type Activity,
  type CourseSet,
  type RoadmapNode
} from './content/schema';
import type { PracticeSrsKind } from './engine/practice-srs';
import { practiceProgressComplete } from './engine/course-progress';

/** Conversation steps (a scripted dialogue, a talk with AI) are sections of their own (audit T11). */
export type ConversationSectionId='dialogue'|'ai';
export type LessonSectionId='theory'|'tasks'|PracticeSrsKind|ConversationSectionId;

export const CONVERSATION_SECTION_TYPE:Record<ConversationSectionId,'dialogue'|'ai-conversation'>={
  dialogue:'dialogue',
  ai:'ai-conversation'
};

export function isConversationSection(value:unknown):value is ConversationSectionId{
  return value==='dialogue'||value==='ai';
}

export interface LessonSectionState {
  id:LessonSectionId;
  labelKey:string;
  complete:boolean;
  required:boolean;
  /** True only when this section currently prevents the next required node from unlocking. */
  blocking:boolean;
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

function seenRequirementState(
  node:RoadmapNode,
  activityIds:string[],
  progress:CourseProgressDocument
):{required:boolean;blocking:boolean}{
  const requiredIds=node.completion
    ? node.completion.requirements.flatMap(requirement=>
        requirement.kind==='activity-seen'
          ? requirement.activityIds.filter(id=>activityIds.includes(id))
          : []
      )
    : activityIds.filter(id=>node.activityIds.includes(id));
  const unique=[...new Set(requiredIds)];
  return {
    required:unique.length>0,
    blocking:unique.some(id=>!isSeen(progress,id))
  };
}

function practiceRequirementState(
  node:RoadmapNode,
  activity:Extract<Activity,{type:'pattern-drill'}>,
  mode:PracticeSrsKind,
  progress:CourseProgressDocument
):{required:boolean;blocking:boolean}{
  const record=progress.practice[mode]?.[activity.id];
  const complete=Boolean(record&&!record.deleted&&practiceProgressComplete(record));
  if(node.completion){
    const required=node.completion.requirements.some(requirement=>
      isPracticeCompletionRequirement(requirement)&&
      requirement.activityId===activity.id&&
      requirement.modes.includes(mode)
    );
    return {required,blocking:required&&!complete};
  }

  // Legacy fallback completion only requires the activity to become seen.
  // Any practice mode marks the pattern activity seen, so present one entry mode as the
  // actionable blocker instead of falsely claiming that every mode is mandatory.
  const entryMode=activity.modes[0];
  const required=node.activityIds.includes(activity.id)&&mode===entryMode;
  return {required,blocking:required&&!isSeen(progress,activity.id)};
}

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
    const requirement=seenRequirementState(node,theory.map(activity=>activity.id),progress);
    sections.push({
      id:'theory',
      labelKey:'learn.theory',
      complete:theory.every(activity=>isSeen(progress,activity.id)),
      required:requirement.required,
      blocking:requirement.blocking
    });
  }

  const tasks=activities.filter(activity=>
    activity.type==='choice'||activity.type==='text-input'||activity.type==='translation'
  );
  if(tasks.length){
    const requirement=seenRequirementState(node,tasks.map(activity=>activity.id),progress);
    sections.push({
      id:'tasks',
      labelKey:'learn.tasks',
      complete:tasks.every(activity=>isSeen(progress,activity.id)),
      required:requirement.required,
      blocking:requirement.blocking
    });
  }

  const patterns=activities.filter(
    (activity):activity is Extract<Activity,{type:'pattern-drill'}>=>activity.type==='pattern-drill'
  );
  for(const mode of ['drill','listening','speaking'] as PracticeSrsKind[]){
    const pattern=patterns.find(activity=>activity.modes.includes(mode));
    if(!pattern)continue;
    const record=progress.practice[mode]?.[pattern.id];
    const requirement=practiceRequirementState(node,pattern,mode,progress);
    sections.push({
      id:mode,
      labelKey:MODE_KEY[mode],
      complete:Boolean(record&&!record.deleted&&practiceProgressComplete(record)),
      required:requirement.required,
      blocking:requirement.blocking,
      activityId:pattern.id
    });
  }

  for(const id of ['dialogue','ai'] as ConversationSectionId[]){
    const steps=activities.filter(activity=>activity.type===CONVERSATION_SECTION_TYPE[id]);
    if(!steps.length)continue;
    const requirement=seenRequirementState(node,steps.map(activity=>activity.id),progress);
    sections.push({
      id,
      labelKey:id==='dialogue'?'kind.dialogue':'kind.ai',
      complete:steps.every(activity=>isSeen(progress,activity.id)),
      required:requirement.required,
      blocking:requirement.blocking,
      activityId:steps[0]!.id
    });
  }

  return sections;
}
