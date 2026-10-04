import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { countDays } from './plural';
import type { CourseSet } from './content/schema';
import type { LexiconSnapshot } from './lexicon/schema';
import type { CourseProgressDocument, WordsProgressDocument } from './progress';
import type { NotificationSettings } from './settings-data';
import { DEFAULT_NOTIFICATION_SETTINGS } from './settings-data';
import { appDocs } from './sync';
import { readSettings } from './settings';
import { useLearnerCourseRuntime } from './course-runtime';
import { useWordReviewRuntime } from './word-review-runtime';
import { buildCourseReviewSession } from './review-session';
import { resolveWordReviewSession } from './word-review';
import { useOtherCourseReviews, type OtherCourseReview } from './other-course-review';
import { capReviewCount } from './review-daily-budget';
import { nodeTopic } from './today-model';
import { dayNumberFromKey } from './engine/course-progress';
import {
  chooseLearnerNotification,
  type LearnerNotificationIntent
} from './notification-policy';
import {
  notificationTransport,
  subscribeNotificationRoute
} from './notification-native';
import {
  LESSON_RUN_CHANGED_EVENT,
  latestPausedLessonRun,
  unfinishedReminderTime
} from './lesson-run-reminder';

const REMINDER_MIN_ID=884000;
const REMINDER_MAX_ID=884009;
const REMINDER_ID=884001;
const UNFINISHED_REMINDER_ID=884002;
const LOOKAHEAD_DAYS=7;

export interface ReminderPlan {
  at:Date;
  dayKey:string;
  intent:LearnerNotificationIntent;
}

export interface UnfinishedReminderPlan {
  at:Date;
  dayKey:string;
  nodeId:string;
  remaining:number;
}

export interface ReminderPlanInput {
  now:Date;
  preferences:NotificationSettings;
  set:CourseSet;
  progress:CourseProgressDocument;
  words:WordsProgressDocument;
  lexicon:LexiconSnapshot;
  locale:string;
  currentLessonAvailable:boolean;
  courseComplete:boolean;
  currentLessonDayIndex?:number;
  currentLessonTopic?:string;
  otherCourses?:OtherCourseReview[];
}

export function localDayKey(date:Date):string{
  return [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('-');
}

export function reminderTime(day:Date,time:string):Date{
  const [hourRaw,minuteRaw]=time.split(':');
  const hour=Number(hourRaw);
  const minute=Number(minuteRaw);
  const safeHour=Number.isInteger(hour)?hour:19;
  const safeMinute=Number.isInteger(minute)?minute:0;
  if(safeHour<9){
    return new Date(day.getFullYear(),day.getMonth(),day.getDate(),9,0,0,0);
  }
  if(safeHour>=22){
    return new Date(day.getFullYear(),day.getMonth(),day.getDate()+1,9,0,0,0);
  }
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    safeHour,
    safeMinute,
    0,
    0
  );
}

function dueCountForDay(input:ReminderPlanInput,dayKey:string):number{
  const day=dayNumberFromKey(dayKey);
  const course=buildCourseReviewSession(input.set,input.progress,day);
  const others=(input.otherCourses??[]).map(other=>buildCourseReviewSession(other.set,other.progress,day));
  const words=resolveWordReviewSession(
    input.words,
    input.lexicon,
    day,
    input.locale
  );
  const raw=
    course.actionableCount+
    others.reduce((sum,other)=>sum+other.actionableCount,0)+
    words.items.length;
  return capReviewCount(raw,day);
}

export function nextUnfinishedReminderPlan(now:Date):UnfinishedReminderPlan|null{
  const paused=latestPausedLessonRun();
  if(!paused)return null;
  const at=unfinishedReminderTime(paused.pausedAt);
  if(!at||at.getTime()<=now.getTime())return null;
  return {
    at,
    dayKey:localDayKey(at),
    nodeId:paused.nodeId,
    remaining:paused.remaining
  };
}

export function nextReminderPlan(input:ReminderPlanInput):ReminderPlan|null{
  if(!input.preferences.enabled)return null;

  for(let offset=0;offset<=LOOKAHEAD_DAYS;offset++){
    const day=new Date(
      input.now.getFullYear(),
      input.now.getMonth(),
      input.now.getDate()+offset,
      12,0,0,0
    );
    const at=reminderTime(day,input.preferences.time);
    if(at.getTime()<=input.now.getTime())continue;

    const dayKey=localDayKey(at);
    const intent=chooseLearnerNotification({
      progress:input.progress,
      todayKey:dayKey,
      dueCount:dueCountForDay(input,dayKey),
      currentLessonAvailable:input.currentLessonAvailable,
      courseComplete:input.courseComplete,
      ...(input.currentLessonDayIndex?{currentLessonDayIndex:input.currentLessonDayIndex}:{}),
      ...(input.currentLessonTopic?{currentLessonTopic:input.currentLessonTopic}:{}),
      preferences:input.preferences
    });
    if(intent)return {at,dayKey,intent};
  }
  return null;
}

function unfinishedNotificationPayload(
  plan:UnfinishedReminderPlan,
  t:(key:string,vars?:Readonly<Record<string,string|number>>)=>string
):Record<string,unknown>{
  return {
    id:UNFINISHED_REMINDER_ID,
    title:t('notifications.systemUnfinishedTitle'),
    body:t('notifications.systemUnfinishedBody',{count:plan.remaining}),
    schedule:{at:plan.at},
    extra:{
      route:'/learn/'+encodeURIComponent(plan.nodeId)+'?resume=1',
      kind:'unfinished-lesson'
    }
  };
}

function notificationPayload(
  plan:ReminderPlan,
  t:(key:string,vars?:Readonly<Record<string,string|number>>)=>string,
  locale:string
):Record<string,unknown>{
  const title=plan.intent.kind==='review-due'
    ? t('notifications.systemReviewTitle')
    : plan.intent.kind==='streak-risk'
      ? t('notifications.systemStreakTitle')
      : plan.intent.kind==='return-break'
        ? t('notifications.systemReturnTitle')
        : t('notifications.systemDailyTitle');
  const body=plan.intent.kind==='review-due'
    ? t('notifications.systemReviewBody',{count:plan.intent.dueCount??0})
    : plan.intent.kind==='streak-risk'
      ? t('notifications.systemStreakBody',{streak:countDays(t,locale,plan.intent.streak??0)})
      : plan.intent.kind==='return-break'
        ? t(
            plan.intent.lessonDayIndex?'notifications.systemReturnBodyDay':'notifications.systemReturnBody',
            {day:plan.intent.lessonDayIndex??0}
          )
        : plan.intent.lessonDayIndex&&plan.intent.lessonTopic
          ? t('notifications.systemDailyBodyDetails',{
              day:plan.intent.lessonDayIndex,
              topic:plan.intent.lessonTopic
            })
          : t('notifications.systemDailyBody');

  return {
    id:REMINDER_ID,
    title,
    body,
    schedule:{at:plan.at},
    extra:{
      route:plan.intent.route,
      kind:plan.intent.kind
    }
  };
}

export function NotificationRouteListener(){
  const navigate=useNavigate();
  useEffect(
    ()=>subscribeNotificationRoute(route=>navigate(route)),
    [navigate]
  );
  return null;
}

export function NotificationDelivery(){
  const runtime=useLearnerCourseRuntime();
  const wordRuntime=useWordReviewRuntime();
  const {t,locale}=useI18n();
  const [preferences,setPreferences]=useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [settingsReady,setSettingsReady]=useState(false);
  const [clock,setClock]=useState(()=>Date.now());
  const [lessonRunsVersion,setLessonRunsVersion]=useState(0);

  useEffect(()=>{
    const timer=window.setInterval(()=>setClock(Date.now()),60_000);
    return ()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    const changed=()=>setLessonRunsVersion(value=>value+1);
    window.addEventListener(LESSON_RUN_CHANGED_EVENT,changed);
    return ()=>window.removeEventListener(LESSON_RUN_CHANGED_EVENT,changed);
  },[]);

  useEffect(()=>{
    let live=true;
    const load=async()=>{
      try{
        const settings=await readSettings();
        if(live)setPreferences(settings.notifications??DEFAULT_NOTIFICATION_SETTINGS);
      }finally{
        if(live)setSettingsReady(true);
      }
    };
    void load();
    const stop=appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key==='settings'))void load();
    });
    return ()=>{live=false;stop();};
  },[]);

  const state=runtime.state;
  const unfinishedPlan=useMemo(
    ()=>preferences.enabled?nextUnfinishedReminderPlan(new Date(clock)):null,
    [preferences.enabled,clock,lessonRunsVersion]
  );
  const plan=useMemo(()=>{
    if(
      !settingsReady||
      runtime.status!=='ready'||
      !state||
      wordRuntime.status!=='ready'||
      !wordRuntime.words||
      !wordRuntime.lexicon
    )return null;

    return nextReminderPlan({
      now:new Date(clock),
      preferences,
      set:state.set,
      progress:state.progress,
      words:wordRuntime.words,
      lexicon:wordRuntime.lexicon,
      locale,
      currentLessonAvailable:Boolean(state.currentNode),
      courseComplete:state.roadmapProgress.courseComplete,
      ...(state.currentNode?.dayIndex?{currentLessonDayIndex:state.currentNode.dayIndex}:{})
    });
  },[
    settingsReady,
    preferences,
    runtime.status,
    state,
    wordRuntime.status,
    wordRuntime.words,
    wordRuntime.lexicon,
    locale,
    clock
  ]);

  useEffect(()=>{
    if(!settingsReady||!notificationTransport.hasLocal())return;
    let cancelled=false;

    const sync=async()=>{
      if(!preferences.enabled){
        await notificationTransport.replaceRange(REMINDER_MIN_ID,REMINDER_MAX_ID,[]);
        return;
      }

      const granted=await notificationTransport.localPermission(false);
      if(cancelled)return;
      if(!granted){
        await notificationTransport.replaceRange(REMINDER_MIN_ID,REMINDER_MAX_ID,[]);
        return;
      }

      if(
        runtime.status!=='ready'||
        wordRuntime.status!=='ready'
      )return;

      const notifications:Record<string,unknown>[]=[];
      if(unfinishedPlan)notifications.push(unfinishedNotificationPayload(unfinishedPlan,t));
      if(plan&&(!unfinishedPlan||plan.dayKey!==unfinishedPlan.dayKey)){
        notifications.push(notificationPayload(plan,t,locale));
      }
      if(cancelled)return;
      await notificationTransport.replaceRange(
        REMINDER_MIN_ID,
        REMINDER_MAX_ID,
        notifications
      );
    };

    void sync();
    return ()=>{cancelled=true;};
  },[
    settingsReady,
    preferences.enabled,
    plan,
    unfinishedPlan,
    runtime.status,
    wordRuntime.status,
    t
  ]);

  return null;
}
