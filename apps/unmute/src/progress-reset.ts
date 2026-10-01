import type { RecordMap } from '@appbase/core/document-sync.js';
import {
  type CourseProgressDocument,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';
import {
  appDocs,
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
    cards:tombstones(doc.cards,at),
    practice:{
      drill:tombstones(doc.practice.drill,at),
      listening:tombstones(doc.practice.listening,at),
      speaking:tombstones(doc.practice.speaking,at),
    },
    manualNodes:tombstones(doc.manualNodes,at),
    learningDays:tombstones(doc.learningDays,at),
    metrics:tombstones(doc.metrics,at),
  };
}

export function resetStatsProgress(doc:StatsProgressDocument,at:string):StatsProgressDocument{
  return {schemaVersion:1,buckets:tombstones(doc.buckets,at)};
}

export function resetWordsProgress(doc:WordsProgressDocument,at:string):WordsProgressDocument{
  return {schemaVersion:1,items:tombstones(doc.items,at)};
}

const COURSE_DOC_PREFIXES=['progress:course:','progress:stats:'];

/** Course ids that have progress or stats stored on this device, including courses no longer published. */
export function courseIdsFromKeys(keys:readonly {key:string}[]):string[]{
  const ids=new Set<string>();
  for(const {key} of keys){
    const prefix=COURSE_DOC_PREFIXES.find(item=>key.startsWith(item));
    if(prefix&&key.length>prefix.length)ids.add(key.slice(prefix.length));
  }
  return [...ids];
}

/** Resets the given courses, every course stored on this device (also ones removed from the
 *  catalog) and saved words. */
export async function resetAllProgress(setIds:readonly string[],now:Date=new Date()):Promise<void>{
  const at=now.toISOString();
  const stored=courseIdsFromKeys(await appDocs.keys());
  for(const setId of [...new Set([...setIds,...stored])]){
    await writeCourseProgress(setId,resetCourseProgress(await readCourseProgress(setId),at));
    await writeStatsProgress(setId,resetStatsProgress(await readStatsProgress(setId),at));
  }
  await writeWordsProgress(resetWordsProgress(await readWordsProgress(),at));
  await syncNow().catch(()=>undefined);
}

