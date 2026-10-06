import { authClient } from './auth';
import { dayNumberFromKey } from './engine/course-progress';
import { recordAnswer } from './engine/learner-stats';
import type { PracticeItemGrade, PracticeSrsKind } from './engine/practice-srs';
import type { SentenceResponseKind } from './engine/sentence-progression';
import {
  completeManualNode,
  gradeCourseCard,
  gradeCoursePractice,
  gradeCoursePracticeItem,
  markActivitySeen
} from './progress-actions';
import type { CourseProgressDocument, StatsProgressDocument } from './progress';
import {
  readCourseProgress,
  readStatsProgress,
  writeCourseProgress,
  writeStatsProgress
} from './sync';

export interface ActivitySaveClock {
  at:string;
  dayKey:string;
  dayNumber:number;
}

export function activitySaveClock(now=new Date()):ActivitySaveClock{
  const year=now.getFullYear();
  const month=String(now.getMonth()+1).padStart(2,'0');
  const day=String(now.getDate()).padStart(2,'0');
  const dayKey=`${year}-${month}-${day}`;
  return {
    at:now.toISOString(),
    dayKey,
    dayNumber:dayNumberFromKey(dayKey)
  };
}

export function buildSeenActivityProgress(
  course:CourseProgressDocument,
  activityId:string,
  clock:ActivitySaveClock
):CourseProgressDocument{
  return markActivitySeen(course,activityId,clock.dayKey,clock.at);
}

export function buildGradedActivityProgress(
  course:CourseProgressDocument,
  stats:StatsProgressDocument,
  deviceId:string,
  activityId:string,
  correct:boolean,
  clock:ActivitySaveClock,
  responseKind?:SentenceResponseKind,
  operationId?:string
):{course:CourseProgressDocument;stats:StatsProgressDocument}{
  return {
    course:gradeCourseCard(
      course,
      activityId,
      correct,
      clock.dayNumber,
      clock.dayKey,
      clock.at,
      responseKind,
      operationId
    ),
    stats:recordAnswer(stats,deviceId,activityId,correct,clock.at,operationId)
  };
}

export function buildPracticeActivityProgress(
  course:CourseProgressDocument,
  stats:StatsProgressDocument,
  deviceId:string,
  activityId:string,
  mode:PracticeSrsKind,
  correct:boolean,
  score:number|undefined,
  clock:ActivitySaveClock,
  operationId?:string,
  itemGrades?:Readonly<Record<string,PracticeItemGrade>>
):{course:CourseProgressDocument;stats:StatsProgressDocument}{
  // Practising a pattern also counts as having done that step of the day.
  // A retried operation must not refresh seen/speed timestamps or move SRS again.
  const alreadyApplied=Boolean(operationId&&course.answerOps[operationId]&&!course.answerOps[operationId]?.deleted);
  let nextCourse=alreadyApplied
    ? course
    : gradeCoursePractice(
        markActivitySeen(course,activityId,clock.dayKey,clock.at),
        activityId,
        mode,
        correct,
        clock.dayNumber,
        clock.dayKey,
        clock.at,
        operationId
      );
  if(!alreadyApplied&&itemGrades){
    for(const [itemId,grade] of Object.entries(itemGrades)){
      nextCourse=gradeCoursePracticeItem(
        nextCourse,
        activityId,
        itemId,
        mode,
        grade,
        clock.dayNumber,
        clock.dayKey,
        clock.at
      );
    }
  }
  if(!alreadyApplied&&mode==='drill'&&Number.isFinite(score)){
    nextCourse={
      ...nextCourse,
      metrics:{
        ...nextCourse.metrics,
        ['speed:'+activityId]:{
          value:Math.max(0,Math.min(100,Math.round(score!))),
          at:clock.at
        }
      }
    };
  }
  return {
    course:nextCourse,
    stats:recordAnswer(stats,deviceId,activityId,correct,clock.at,operationId)
  };
}

export function buildPracticeItemProgress(
  course:CourseProgressDocument,
  activityId:string,
  itemId:string,
  mode:PracticeSrsKind,
  grade:PracticeItemGrade,
  clock:ActivitySaveClock,
  operationId?:string
):CourseProgressDocument{
  return gradeCoursePracticeItem(
    course,
    activityId,
    itemId,
    mode,
    grade,
    clock.dayNumber,
    clock.dayKey,
    clock.at,
    operationId
  );
}

export function buildDialogueActivityProgress(
  course:CourseProgressDocument,
  activityId:string,
  score:number,
  clock:ActivitySaveClock
):CourseProgressDocument{
  const seen=markActivitySeen(course,activityId,clock.dayKey,clock.at);
  return {
    ...seen,
    metrics:{
      ...seen.metrics,
      ['dialogue-score:'+activityId]:{
        value:Math.max(0,Math.min(100,Math.round(score))),
        at:clock.at
      }
    }
  };
}

export async function savePracticeItemActivity(
  setId:string,
  activityId:string,
  itemId:string,
  mode:PracticeSrsKind,
  grade:PracticeItemGrade,
  operationId?:string,
  now=new Date()
):Promise<void>{
  const course=await readCourseProgress(setId);
  await writeCourseProgress(
    setId,
    buildPracticeItemProgress(
      course,
      activityId,
      itemId,
      mode,
      grade,
      activitySaveClock(now),
      operationId
    )
  );
}

export async function saveDialogueActivity(
  setId:string,
  activityId:string,
  score:number,
  now=new Date()
):Promise<void>{
  const course=await readCourseProgress(setId);
  await writeCourseProgress(
    setId,
    buildDialogueActivityProgress(course,activityId,score,activitySaveClock(now))
  );
}

export async function savePracticeActivity(
  setId:string,
  activityId:string,
  mode:PracticeSrsKind,
  correct:boolean,
  score?:number,
  operationId?:string,
  now=new Date(),
  itemGrades?:Readonly<Record<string,PracticeItemGrade>>
):Promise<void>{
  const [course,stats,deviceId]=await Promise.all([
    readCourseProgress(setId),
    readStatsProgress(setId),
    authClient.getOrCreateDeviceId()
  ]);
  const next=buildPracticeActivityProgress(
    course,
    stats,
    deviceId,
    activityId,
    mode,
    correct,
    score,
    activitySaveClock(now),
    operationId,
    itemGrades
  );
  await writeCourseProgress(setId,next.course);
  await writeStatsProgress(setId,next.stats);
}

export async function saveSeenActivity(
  setId:string,
  activityId:string,
  now=new Date()
):Promise<void>{
  const course=await readCourseProgress(setId);
  await writeCourseProgress(
    setId,
    buildSeenActivityProgress(course,activityId,activitySaveClock(now))
  );
}

/** A review day counts once its review is done (completion «manual» in the course). */
export async function saveManualNode(
  setId:string,
  nodeId:string,
  now=new Date()
):Promise<void>{
  const clock=activitySaveClock(now);
  const course=await readCourseProgress(setId);
  await writeCourseProgress(setId,completeManualNode(course,nodeId,clock.dayKey,clock.at));
}

export async function saveGradedActivity(
  setId:string,
  activityId:string,
  correct:boolean,
  responseKind?:SentenceResponseKind,
  operationId?:string,
  now=new Date()
):Promise<void>{
  const [course,stats,deviceId]=await Promise.all([
    readCourseProgress(setId),
    readStatsProgress(setId),
    authClient.getOrCreateDeviceId()
  ]);
  const next=buildGradedActivityProgress(
    course,
    stats,
    deviceId,
    activityId,
    correct,
    activitySaveClock(now),
    responseKind,
    operationId
  );

  // Course progress is the learner-critical write. Stats are written second so an
  // analytics failure can never prevent the answer itself from being saved locally.
  await writeCourseProgress(setId,next.course);
  await writeStatsProgress(setId,next.stats);
}
