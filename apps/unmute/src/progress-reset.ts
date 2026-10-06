import type { RecordMap } from '@appbase/core/document-sync.js';
import {
  type CourseProgressDocument,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';
import { appDocs } from './sync';
import { notifyLessonRunChanged } from './lesson-run-reminder';
import {
  readCourseProgress,
  readStatsProgress,
  readWordsProgress,
  syncNow,
  writeCourseProgress,
  writeStatsProgress,
  writeWordsProgress
} from './sync';

/* «Начать заново»: every learning record — seen tasks, cards, phrase practice, learning
   days, results, answer statistics and saved words — becomes a tombstone with the reset
   time. Sync merges by record time, so the account and other devices take the reset
   instead of bringing the old progress back. Settings (course, theme, reminders) stay. */

type Timed = {at:string;deleted?:boolean};

export function tombstones<T extends Timed>(map:RecordMap<T>,at:string):RecordMap<T>{
  const out:RecordMap<T>={};
  for(const [key,value] of Object.entries(map)){
    if(!value)continue;
    out[key]=value.deleted&&value.at>=at ? value : {...value,deleted:true,at};
  }
  return out;
}

export function resetCourseProgress(doc:CourseProgressDocument,at:string):CourseProgressDocument{
  return {
    schemaVersion:1,
    seen:tombstones(doc.seen,at),
    answerOps:tombstones(doc.answerOps,at),
    cards:tombstones(doc.cards,at),
    practice:{
      drill:tombstones(doc.practice.drill,at),
      listening:tombstones(doc.practice.listening,at),
      speaking:tombstones(doc.practice.speaking,at),
    },
    practiceItems:{
      drill:tombstones(doc.practiceItems.drill,at),
      listening:tombstones(doc.practiceItems.listening,at),
      speaking:tombstones(doc.practiceItems.speaking,at),
    },
    manualNodes:tombstones(doc.manualNodes,at),
    learningDays:tombstones(doc.learningDays,at),
    metrics:tombstones(doc.metrics,at),
  };
}

export function resetStatsProgress(doc:StatsProgressDocument,at:string):StatsProgressDocument{
  return {
    schemaVersion:1,
    buckets:tombstones(doc.buckets,at),
    answerOps:tombstones(doc.answerOps,at)
  };
}


/** Clears reporting aggregates only. Learning route, SRS and streak history stay intact. */
export function resetCourseStatistics(doc:CourseProgressDocument,at:string):CourseProgressDocument{
  return {
    ...doc,
    metrics:tombstones(doc.metrics,at)
  };
}

export interface ResetStorage {
  readonly length:number;
  key(index:number):string|null;
  removeItem(key:string):void;
}

/** Active local lesson state is not canonical progress and must not survive a course restart. */
export function clearCourseLocalRuns(
  setId:string,
  storage:ResetStorage=localStorage
):void{
  const prefixes=[
    'unmute.lesson-run:'+setId+':',
    'unmute.pattern-run:'+setId+':',
    'unmute.lesson-completion:'+setId+':'
  ];
  try{
    const keys:string[]=[];
    for(let index=0;index<storage.length;index++){
      const key=storage.key(index);
      if(key&&prefixes.some(prefix=>key.startsWith(prefix)))keys.push(key);
    }
    for(const key of keys)storage.removeItem(key);
    notifyLessonRunChanged();
  }catch{}
}

export function resetWordsProgress(doc:WordsProgressDocument,at:string):WordsProgressDocument{
  return {schemaVersion:1,items:tombstones(doc.items,at)};
}

export function progressSetIdsFromRefs(
  refs:ReadonlyArray<{key:string}>
):string[]{
  const ids=new Set<string>();
  for(const ref of refs){
    const key=String(ref.key||'');
    if(key.startsWith('progress:course:'))ids.add(key.slice('progress:course:'.length));
    if(key.startsWith('progress:stats:'))ids.add(key.slice('progress:stats:'.length));
  }
  return [...ids].filter(Boolean);
}

/** Clears answer/quality statistics for every known course without touching route, SRS or streak. */
export async function resetAllStatistics(setIds:readonly string[],now:Date=new Date()):Promise<void>{
  await syncNow().catch(()=>undefined);
  const historical=progressSetIdsFromRefs(await appDocs.refs());
  const allSetIds=[...new Set([...setIds,...historical])];
  const at=now.toISOString();
  for(const setId of allSetIds){
    await writeCourseProgress(setId,resetCourseStatistics(await readCourseProgress(setId),at));
    await writeStatsProgress(setId,resetStatsProgress(await readStatsProgress(setId),at));
  }
  await syncNow().catch(()=>undefined);
}

/** Starts one selected course from zero. Global saved words and entitlements are intentionally untouched. */
export async function restartCourseProgress(
  setId:string,
  now:Date=new Date(),
  storage:ResetStorage=localStorage
):Promise<void>{
  await syncNow().catch(()=>undefined);
  const at=now.toISOString();
  await writeCourseProgress(setId,resetCourseProgress(await readCourseProgress(setId),at));
  await writeStatsProgress(setId,resetStatsProgress(await readStatsProgress(setId),at));
  clearCourseLocalRuns(setId,storage);
  await syncNow().catch(()=>undefined);
}

/** Resets catalog courses plus every historical progress document already known to sync.
 * Pull first when possible so a retired course that only exists on the account is included. */
export async function resetAllProgress(setIds:readonly string[],now:Date=new Date()):Promise<void>{
  await syncNow().catch(()=>undefined);
  const historical=progressSetIdsFromRefs(await appDocs.refs());
  const allSetIds=[...new Set([...setIds,...historical])];
  const at=now.toISOString();
  for(const setId of allSetIds){
    await writeCourseProgress(setId,resetCourseProgress(await readCourseProgress(setId),at));
    await writeStatsProgress(setId,resetStatsProgress(await readStatsProgress(setId),at));
  }
  await writeWordsProgress(resetWordsProgress(await readWordsProgress(),at));
  await syncNow().catch(()=>undefined);
}

