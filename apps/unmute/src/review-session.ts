import type { Activity, CourseSet } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { PracticeSrsKind } from './engine/practice-srs';
import { selectPracticeQueue } from './engine/practice-queue';
import { selectCardReviewQueue } from './engine/review-summary';

type CardActivity=Extract<Activity,{type:'choice'|'text-input'|'translation'}>;
type PatternActivity=Extract<Activity,{type:'pattern-drill'}>;

/** `setId` is set for items from a course other than the active one. */
export type ReviewSessionItem=
  |{kind:'card';activity:CardActivity;setId?:string}
  |{kind:'practice';mode:PracticeSrsKind;activity:PatternActivity;setId?:string};

export interface CourseReviewSession {
  items:ReviewSessionItem[];
  cards:{
    due:number;
    waiting:number;
  };
  practice:{
    drill:number;
    listening:number;
    speaking:number;
    waiting:number;
  };
  actionableCount:number;
  waitingCount:number;
}

function livePractice(
  progress:CourseProgressDocument,
  mode:PracticeSrsKind,
  allowed:Set<string>
){
  return Object.fromEntries(
    Object.entries(progress.practice[mode])
      .filter(([id,state])=>allowed.has(id)&&Boolean(state&&!state.deleted))
  );
}

export function buildCourseReviewSession(
  set:CourseSet,
  progress:CourseProgressDocument,
  todayDay:number
):CourseReviewSession{
  const cards=set.activities.filter(
    (activity):activity is CardActivity=>
      activity.type==='choice'||activity.type==='text-input'||activity.type==='translation'
  );
  const patterns=set.activities.filter(
    (activity):activity is PatternActivity=>activity.type==='pattern-drill'
  );
  const byId=new Map(set.activities.map(activity=>[activity.id,activity]));

  const cardQueue=selectCardReviewQueue(
    cards.map(activity=>activity.id),
    progress.cards,
    todayDay
  );

  const allowedByMode={
    drill:new Set(patterns.filter(activity=>activity.modes.includes('drill')).map(activity=>activity.id)),
    listening:new Set(patterns.filter(activity=>activity.modes.includes('listening')).map(activity=>activity.id)),
    speaking:new Set(patterns.filter(activity=>activity.modes.includes('speaking')).map(activity=>activity.id)),
  };

  const drill=selectPracticeQueue(
    'drill',
    patterns.filter(activity=>activity.modes.includes('drill')).map(activity=>activity.id),
    livePractice(progress,'drill',allowedByMode.drill),
    todayDay
  );
  const listening=selectPracticeQueue(
    'listening',
    patterns.filter(activity=>activity.modes.includes('listening')).map(activity=>activity.id),
    livePractice(progress,'listening',allowedByMode.listening),
    todayDay
  );
  const speaking=selectPracticeQueue(
    'speaking',
    patterns.filter(activity=>activity.modes.includes('speaking')).map(activity=>activity.id),
    livePractice(progress,'speaking',allowedByMode.speaking),
    todayDay
  );

  const items:ReviewSessionItem[]=[];
  for(const id of cardQueue.dueIds){
    const activity=byId.get(id);
    if(activity&&(activity.type==='choice'||activity.type==='text-input'||activity.type==='translation')){
      items.push({kind:'card',activity});
    }
  }
  for(const [mode,queue] of [
    ['drill',drill],
    ['listening',listening],
    ['speaking',speaking],
  ] as const){
    for(const item of queue.due){
      const activity=byId.get(item.id);
      if(activity?.type==='pattern-drill')items.push({kind:'practice',mode,activity});
    }
  }

  const waiting=cardQueue.waiting+drill.waiting+listening.waiting+speaking.waiting;
  return {
    items,
    cards:{due:cardQueue.dueIds.length,waiting:cardQueue.waiting},
    practice:{
      drill:drill.due.length,
      listening:listening.due.length,
      speaking:speaking.due.length,
      waiting:drill.waiting+listening.waiting+speaking.waiting,
    },
    actionableCount:items.length,
    waitingCount:waiting,
  };
}
