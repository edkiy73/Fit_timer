import type { RecordMap } from '@appbase/core/document-sync.js';
import {
  type CourseProgressDocument,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';
import { appDocs } from './sync';
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

