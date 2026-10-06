import type { Activity, CourseSet } from './content/schema';
import { practiceItemKey, type CourseProgressDocument } from './progress';
import type { PracticeSrsKind } from './engine/practice-srs';
import { selectPracticeQueue } from './engine/practice-queue';
import { selectCardReviewQueue } from './engine/review-summary';

type CardActivity=Extract<Activity,{type:'choice'|'text-input'|'translation'}>;
type PatternActivity=Extract<Activity,{type:'pattern-drill'}>;

/** `setId` is set for items from a course other than the active one. */
export type ReviewSessionItem=
  |{kind:'card';activity:CardActivity;setId?:string}
  |{kind:'practice';mode:PracticeSrsKind;activity:PatternActivity;itemId?:string;setId?:string};

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

interface DuePracticeEntry {
  due:number;
  order:number;
  item:Extract<ReviewSessionItem,{kind:'practice'}>;
}

function duePracticeEntries(
  mode:PracticeSrsKind,
  patterns:PatternActivity[],
  progress:CourseProgressDocument,
  todayDay:number
):{items:Extract<ReviewSessionItem,{kind:'practice'}>[];waiting:number}{
  const legacyPatterns=patterns.filter(activity=>{
    const state=progress.practice[mode][activity.id];
    return !state?.itemized;
  });
  const allowed=new Set(legacyPatterns.map(activity=>activity.id));
  const legacy=selectPracticeQueue(
    mode,
    legacyPatterns.map(activity=>activity.id),
    livePractice(progress,mode,allowed),
    todayDay
  );
  const byId=new Map(patterns.map(activity=>[activity.id,activity] as const));
  const order=new Map<string,number>();
  let position=0;
  for(const activity of patterns){
    for(const item of activity.items)order.set(practiceItemKey(activity.id,item.id),position++);
  }

  const entries:DuePracticeEntry[]=[];
  for(const legacyItem of legacy.due){
    const activity=byId.get(legacyItem.id);
    if(activity){
      entries.push({
        due:legacyItem.state.due,
        order:order.get(practiceItemKey(activity.id,activity.items[0]?.id??''))??position++,
        item:{kind:'practice',mode,activity}
      });
    }
  }

  for(const activity of patterns){
    const modeState=progress.practice[mode][activity.id];
    if(!modeState?.itemized)continue;
    for(const phrase of activity.items){
      const key=practiceItemKey(activity.id,phrase.id);
      const state=progress.practiceItems[mode][key];
      if(!state||state.deleted||state.due>todayDay)continue;
      entries.push({
        due:state.due,
        order:order.get(key)??position++,
        item:{kind:'practice',mode,activity,itemId:phrase.id}
      });
    }
  }

  entries.sort((a,b)=>a.due-b.due||a.order-b.order);
  return {
    items:entries.map(entry=>entry.item),
    waiting:legacy.waiting
  };
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

  const drillEntries=duePracticeEntries(
    'drill',
    patterns.filter(activity=>activity.modes.includes('drill')),
    progress,
    todayDay
  );
  const listeningEntries=duePracticeEntries(
    'listening',
    patterns.filter(activity=>activity.modes.includes('listening')),
    progress,
    todayDay
  );
  const speakingEntries=duePracticeEntries(
    'speaking',
    patterns.filter(activity=>activity.modes.includes('speaking')),
    progress,
    todayDay
  );

  const items:ReviewSessionItem[]=[];
  for(const id of cardQueue.dueIds){
    const activity=byId.get(id);
    if(activity&&(activity.type==='choice'||activity.type==='text-input'||activity.type==='translation')){
      items.push({kind:'card',activity});
    }
  }
  items.push(...drillEntries.items,...listeningEntries.items,...speakingEntries.items);

  const waiting=cardQueue.waiting+drillEntries.waiting+listeningEntries.waiting+speakingEntries.waiting;
  return {
    items,
    cards:{due:cardQueue.dueIds.length,waiting:cardQueue.waiting},
    practice:{
      drill:drillEntries.items.length,
      listening:listeningEntries.items.length,
      speaking:speakingEntries.items.length,
      waiting:drillEntries.waiting+listeningEntries.waiting+speakingEntries.waiting,
    },
    actionableCount:items.length,
    waitingCount:waiting,
  };
}
