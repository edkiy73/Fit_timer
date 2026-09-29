import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
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
import { dayNumberFromKey } from './engine/course-progress';
import {
  chooseLearnerNotification,
  type LearnerNotificationIntent
} from './notification-policy';
import {
  notificationTransport,
  subscribeNotificationRoute
} from './notification-native';

const REMINDER_MIN_ID=884000;
const REMINDER_MAX_ID=884009;
const REMINDER_ID=884001;
const LOOKAHEAD_DAYS=7;

export interface ReminderPlan {
  at:Date;
  dayKey:string;
  intent:LearnerNotificationIntent;
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
}

export function localDayKey(date:Date):string{
  return [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('-');
}

function reminderTime(day:Date,time:string):Date{
  const [hourRaw,minuteRaw]=time.split(':');
  const hour=Number(hourRaw);
  const minute=Number(minuteRaw);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Number.isInteger(hour)?hour:19,
    Number.isInteger(minute)?minute:0,
    0,
    0
  );
}

function dueCountForDay(input:ReminderPlanInput,dayKey:string):number{
  const day=dayNumberFromKey(dayKey);
  const course=buildCourseReviewSession(input.set,input.progress,day);
  const words=resolveWordReviewSession(
    input.words,
    input.lexicon,
    day,
    input.locale
  );
  return course.actionableCount+words.items.length;
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
      preferences:input.preferences
    });
    if(intent)return {at,dayKey,intent};
  }
  return null;
}

function notificationPayload(
  plan:ReminderPlan,
  t:(key:string,vars?:Readonly<Record<string,string|number>>)=>string
):Record<string,unknown>{
  const title=plan.intent.kind==='review-due'
    ? t('notifications.systemReviewTitle')
    : plan.intent.kind==='streak-risk'
      ? t('notifications.systemStreakTitle')
      : t('notifications.systemDailyTitle');
  const body=plan.intent.kind==='review-due'
    ? t('notifications.systemReviewBody',{count:plan.intent.dueCount??0})
    : plan.intent.kind==='streak-risk'
      ? t('notifications.systemStreakBody',{streak:plan.intent.streak??0})
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

  useEffect(()=>{
    const timer=window.setInterval(()=>setClock(Date.now()),60_000);
    return ()=>window.clearInterval(timer);
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
      courseComplete:state.roadmapProgress.courseComplete
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

      const notifications=plan?[notificationPayload(plan,t)]:[];
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
    runtime.status,
    wordRuntime.status,
    t
  ]);

  return null;
}
