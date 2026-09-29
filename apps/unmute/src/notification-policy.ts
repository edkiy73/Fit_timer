import type { CourseProgressDocument } from './progress';
import type { NotificationSettings } from './settings-data';
import { dayNumberFromKey } from './engine/course-progress';

export type LearnerNotificationKind=
  |'review-due'
  |'streak-risk'
  |'daily-lesson';

export interface LearnerNotificationIntent {
  kind:LearnerNotificationKind;
  route:'/'|'/review';
  dueCount?:number;
  streak?:number;
}

export interface NotificationPolicyInput {
  progress:CourseProgressDocument;
  todayKey:string;
  dueCount:number;
  currentLessonAvailable:boolean;
  courseComplete:boolean;
  preferences?:NotificationSettings;
}

export interface LearningDayStatus {
  studiedToday:boolean;
  lastLearningDay:number|null;
  streak:number;
}

function liveLearningDays(progress:CourseProgressDocument):number[]{
  return Object.entries(progress.learningDays)
    .filter(([,record])=>Boolean(record&&!record.deleted))
    .map(([dayKey])=>{
      try{return dayNumberFromKey(dayKey);}
      catch{return null;}
    })
    .filter((day):day is number=>day!==null)
    .sort((a,b)=>a-b);
}

export function learningDayStatus(
  progress:CourseProgressDocument,
  todayKey:string
):LearningDayStatus{
  const today=dayNumberFromKey(todayKey);
  const days=liveLearningDays(progress);
  if(!days.length){
    return {studiedToday:false,lastLearningDay:null,streak:0};
  }

  const last=days[days.length-1]!;
  const studiedToday=last===today;
  if(today-last>1){
    return {studiedToday,lastLearningDay:last,streak:0};
  }

  let streak=1;
  for(let index=days.length-1;index>0;index--){
    if(days[index]!-days[index-1]!!==1)break;
    streak++;
  }
  return {studiedToday,lastLearningDay:last,streak};
}

/**
 * Chooses at most one reminder for a learner.
 *
 * Priority intentionally avoids notification spam:
 * 1. due review already gives the learner a concrete next action;
 * 2. if nothing is due, protect an active streak;
 * 3. otherwise remind about the next lesson.
 *
 * Exact delivery time/permissions/transport belong to Phase 8b.
 */
export function chooseLearnerNotification(
  input:NotificationPolicyInput
):LearnerNotificationIntent|null{
  const dueCount=Math.max(0,Math.floor(input.dueCount||0));
  const day=learningDayStatus(input.progress,input.todayKey);
  const preferences=input.preferences;
  if(preferences&&!preferences.enabled)return null;
  const reviewEnabled=preferences?.review!==false;
  const streakEnabled=preferences?.streak!==false;
  const dailyEnabled=preferences?.daily!==false;

  if(reviewEnabled&&dueCount>0){
    return {
      kind:'review-due',
      route:'/review',
      dueCount
    };
  }

  if(day.studiedToday){
    return null;
  }

  const today=dayNumberFromKey(input.todayKey);
  const streakAtRisk=
    day.streak>0&&
    day.lastLearningDay!==null&&
    today-day.lastLearningDay===1;

  if(streakEnabled&&streakAtRisk&&!input.courseComplete){
    return {
      kind:'streak-risk',
      route:'/',
      streak:day.streak
    };
  }

  if(dailyEnabled&&input.currentLessonAvailable&&!input.courseComplete){
    return {
      kind:'daily-lesson',
      route:'/'
    };
  }

  return null;
}
