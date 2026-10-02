import { mergeRecordMaps, type RecordMap, type RecordMeta } from '@appbase/core/document-sync.js';
import type { CardSrsState } from './engine/card-srs';
import type { PracticeSrsState } from './engine/practice-srs';
import type { SentenceResponseStage } from './engine/sentence-progression';
import { mergeSettingsRaw } from './settings-data';

export const WORD_PROGRESS_DOC='progress:words';
export const courseProgressDoc=(setId:string)=>'progress:course:'+setId;
export const statsProgressDoc=(setId:string)=>'progress:stats:'+setId;

export interface TimedFlag extends RecordMeta {
  at:string;
  deleted?:boolean;
}

export interface TimedCardState extends CardSrsState, RecordMeta {
  at:string;
  deleted?:boolean;
  responseStage?:SentenceResponseStage;
  writeWrongStreak?:number;
}

export interface TimedPracticeState extends PracticeSrsState, RecordMeta {
  at:string;
  deleted?:boolean;
}

export interface TimedMetric extends RecordMeta {
  at:string;
  deleted?:boolean;
  value:number;
}

export interface CourseProgressDocument {
  schemaVersion:1;
  seen:RecordMap<TimedFlag>;
  cards:RecordMap<TimedCardState>;
  practice:{
    drill:RecordMap<TimedPracticeState>;
    listening:RecordMap<TimedPracticeState>;
    speaking:RecordMap<TimedPracticeState>;
  };
  manualNodes:RecordMap<TimedFlag>;
  learningDays:RecordMap<TimedFlag>;
  metrics:RecordMap<TimedMetric>;
}

export interface StatsBucket extends RecordMeta {
  at:string;
  deleted?:boolean;
  deviceId:string;
  activityId:string;
  attempts:number;
  correct:number;
  wrong:number;
}

export interface StatsProgressDocument {
  schemaVersion:1;
  buckets:RecordMap<StatsBucket>;
}

export interface WordProgressRecord extends RecordMeta {
  at:string;
  deleted?:boolean;
  lexemeId:string;
  senseId:string;
  box:number;
  due:number;
}

export interface WordsProgressDocument {
  schemaVersion:1;
  items:RecordMap<WordProgressRecord>;
}

const isObject=(value:unknown):value is Record<string,unknown> =>
  !!value && typeof value==='object' && !Array.isArray(value);

const asMap=<T extends RecordMeta>(value:unknown):RecordMap<T> =>
  isObject(value) ? value as RecordMap<T> : {};

export function emptyCourseProgress():CourseProgressDocument{
  return {
    schemaVersion:1,
    seen:{},
    cards:{},
    practice:{drill:{},listening:{},speaking:{}},
    manualNodes:{},
    learningDays:{},
    metrics:{},
  };
}

export function emptyStatsProgress():StatsProgressDocument{
  return {schemaVersion:1,buckets:{}};
}

export function emptyWordsProgress():WordsProgressDocument{
  return {schemaVersion:1,items:{}};
}

export function parseCourseProgress(raw:string|null):CourseProgressDocument{
  if(!raw)return emptyCourseProgress();
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!isObject(parsed)||parsed.schemaVersion!==1)return emptyCourseProgress();
    const practice=isObject(parsed.practice)?parsed.practice:{};
    return {
      schemaVersion:1,
      seen:asMap<TimedFlag>(parsed.seen),
      cards:asMap<TimedCardState>(parsed.cards),
      practice:{
        drill:asMap<TimedPracticeState>(practice.drill),
        listening:asMap<TimedPracticeState>(practice.listening),
        speaking:asMap<TimedPracticeState>(practice.speaking),
      },
      manualNodes:asMap<TimedFlag>(parsed.manualNodes),
      learningDays:asMap<TimedFlag>(parsed.learningDays),
      metrics:asMap<TimedMetric>(parsed.metrics),
    };
  }catch{
    return emptyCourseProgress();
  }
}

export function parseStatsProgress(raw:string|null):StatsProgressDocument{
  if(!raw)return emptyStatsProgress();
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!isObject(parsed)||parsed.schemaVersion!==1)return emptyStatsProgress();
    return {schemaVersion:1,buckets:asMap<StatsBucket>(parsed.buckets)};
  }catch{
    return emptyStatsProgress();
  }
}

export function parseWordsProgress(raw:string|null):WordsProgressDocument{
  if(!raw)return emptyWordsProgress();
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!isObject(parsed)||parsed.schemaVersion!==1)return emptyWordsProgress();
    return {schemaVersion:1,items:asMap<WordProgressRecord>(parsed.items)};
  }catch{
    return emptyWordsProgress();
  }
}

export function mergeCourseProgress(
  local:CourseProgressDocument,
  remote:CourseProgressDocument
):CourseProgressDocument{
  return {
    schemaVersion:1,
    seen:mergeRecordMaps(local.seen,remote.seen),
    cards:mergeRecordMaps(local.cards,remote.cards),
    practice:{
      drill:mergeRecordMaps(local.practice.drill,remote.practice.drill),
      listening:mergeRecordMaps(local.practice.listening,remote.practice.listening),
      speaking:mergeRecordMaps(local.practice.speaking,remote.practice.speaking),
    },
    manualNodes:mergeRecordMaps(local.manualNodes,remote.manualNodes),
    learningDays:mergeRecordMaps(local.learningDays,remote.learningDays),
    metrics:mergeRecordMaps(local.metrics,remote.metrics),
  };
}

export function mergeStatsProgress(
  local:StatsProgressDocument,
  remote:StatsProgressDocument
):StatsProgressDocument{
  return {schemaVersion:1,buckets:mergeRecordMaps(local.buckets,remote.buckets)};
}

export function mergeWordsProgress(
  local:WordsProgressDocument,
  remote:WordsProgressDocument
):WordsProgressDocument{
  return {schemaVersion:1,items:mergeRecordMaps(local.items,remote.items)};
}

export function mergeUnMuteDocument(
  key:string,
  local:string|null,
  remote:string|null
):string|null{
  if(key.startsWith('progress:course:')){
    return JSON.stringify(mergeCourseProgress(parseCourseProgress(local),parseCourseProgress(remote)));
  }
  if(key.startsWith('progress:stats:')){
    return JSON.stringify(mergeStatsProgress(parseStatsProgress(local),parseStatsProgress(remote)));
  }
  if(key===WORD_PROGRESS_DOC){
    return JSON.stringify(mergeWordsProgress(parseWordsProgress(local),parseWordsProgress(remote)));
  }
  if(key==='settings'){
    return mergeSettingsRaw(local,remote);
  }
  return local ?? remote;
}

export function wordProgressKey(lexemeId:string,senseId:string):string{
  return lexemeId+'|'+senseId;
}

export function statsBucketKey(deviceId:string,activityId:string):string{
  return deviceId+'|'+activityId;
}
