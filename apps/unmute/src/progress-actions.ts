import { gradeCardSrs } from './engine/card-srs';
import { gradeSentenceResponse, type SentenceResponseKind } from './engine/sentence-progression';
import { gradePracticeSrs, type PracticeSrsKind } from './engine/practice-srs';
import type { LearningCalendarState, RoadmapProgressState } from './engine/course-progress';
import type { CourseProgressDocument, TimedFlag } from './progress';

function liveIds(records:Record<string,{deleted?:boolean}|undefined>):Set<string>{
  return new Set(Object.entries(records)
    .filter(([,value])=>Boolean(value&&!value.deleted))
    .map(([id])=>id));
}

function touchedFlag(at:string):TimedFlag{
  return {at};
}

function withLearningDay(
  doc:CourseProgressDocument,
  dayKey:string,
  at:string
):CourseProgressDocument{
  return {
    ...doc,
    learningDays:{
      ...doc.learningDays,
      [dayKey]:touchedFlag(at),
    },
  };
}

export function markActivitySeen(
  doc:CourseProgressDocument,
  activityId:string,
  dayKey:string,
  at:string
):CourseProgressDocument{
  return withLearningDay({
    ...doc,
    seen:{
      ...doc.seen,
      [activityId]:touchedFlag(at),
    },
  },dayKey,at);
}

export function gradeCourseCard(
  doc:CourseProgressDocument,
  activityId:string,
  correct:boolean,
  todayDay:number,
  dayKey:string,
  at:string,
  responseKind?:SentenceResponseKind
):CourseProgressDocument{
  const previous=doc.cards[activityId];
  const livePrevious=previous&& !previous.deleted ? previous : undefined;
  const graded=gradeCardSrs(livePrevious,correct,todayDay);
  const sentence=gradeSentenceResponse(livePrevious,responseKind,correct);
  return withLearningDay({
    ...doc,
    seen:{
      ...doc.seen,
      [activityId]:touchedFlag(at),
    },
    cards:{
      ...doc.cards,
      [activityId]:{...graded,...sentence,at},
    },
  },dayKey,at);
}

export function gradeCoursePractice(
  doc:CourseProgressDocument,
  activityId:string,
  mode:PracticeSrsKind,
  correct:boolean,
  todayDay:number,
  dayKey:string,
  at:string
):CourseProgressDocument{
  const previous=doc.practice[mode][activityId];
  const graded=gradePracticeSrs(mode,previous&& !previous.deleted ? previous : undefined,correct,todayDay);
  return withLearningDay({
    ...doc,
    practice:{
      ...doc.practice,
      [mode]:{
        ...doc.practice[mode],
        [activityId]:{...graded,at},
      },
    },
  },dayKey,at);
}

export function completeManualNode(
  doc:CourseProgressDocument,
  nodeId:string,
  dayKey:string,
  at:string
):CourseProgressDocument{
  return withLearningDay({
    ...doc,
    manualNodes:{
      ...doc.manualNodes,
      [nodeId]:touchedFlag(at),
    },
  },dayKey,at);
}

export function roadmapProgressFromDocument(doc:CourseProgressDocument):RoadmapProgressState{
  const toPractice=(records:CourseProgressDocument['practice'][PracticeSrsKind])=>
    Object.fromEntries(Object.entries(records)
      .filter(([,value])=>Boolean(value&&!value.deleted))
      .map(([id,value])=>[id,value ? {box:value.box,due:value.due} : undefined]));

  return {
    seenActivityIds:liveIds(doc.seen),
    practice:{
      drill:toPractice(doc.practice.drill),
      listening:toPractice(doc.practice.listening),
      speaking:toPractice(doc.practice.speaking),
    },
    manualNodeIds:liveIds(doc.manualNodes),
  };
}

function dayNumber(dayKey:string):number{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if(!match)return Number.NaN;
  return Math.floor(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))/86400000);
}

export function learningCalendarFromDocument(doc:CourseProgressDocument):LearningCalendarState{
  const days=Object.entries(doc.learningDays)
    .filter(([,value])=>Boolean(value&&!value.deleted))
    .map(([key])=>({key,n:dayNumber(key)}))
    .filter(item=>Number.isFinite(item.n))
    .sort((a,b)=>a.n-b.n);

  if(!days.length)return {streak:0};

  let streak=1;
  for(let i=days.length-1;i>0;i--){
    const current=days[i];
    const previous=days[i-1];
    if(!current||!previous||current.n-previous.n!==1)break;
    streak++;
  }
  const last=days[days.length-1]!;
  return {
    lastDay:last.key,
    activeDay:last.key,
    streak,
  };
}
