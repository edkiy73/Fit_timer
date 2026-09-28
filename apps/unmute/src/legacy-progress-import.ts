import type { CourseSet } from './content/schema';
import type { LexiconSnapshot, Lexeme } from './lexicon/schema';
import {
  emptyCourseProgress,
  emptyStatsProgress,
  emptyWordsProgress,
  statsBucketKey,
  wordProgressKey,
  type CourseProgressDocument,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';

export const LEGACY_PROGRESS_STORAGE_KEY='eng-trainer-v2';
export const LEGACY_IMPORT_AT='2000-01-01T00:00:00.000Z';

type LegacySrs={box?:unknown;due?:unknown};
type LegacyError={t?:unknown;w?:unknown};
type LegacyWord={ru?:unknown;box?:unknown;due?:unknown};

export interface LegacyProgressState{
  srs?:Record<string,LegacySrs>;
  pat?:Record<string,LegacySrs>;
  voc?:Record<string,LegacySrs>;
  lis?:Record<string,LegacySrs>;
  err?:Record<string,LegacyError>;
  words?:Record<string,LegacyWord>;
  dia?:Record<string,unknown>;
  ai?:Record<string,unknown>;
  rest?:Record<string,unknown>;
  speed?:Record<string,unknown>;
  day?:unknown;
  act?:unknown;
  streak?:unknown;
  total?:unknown;
  right?:unknown;
}

export interface LegacyProgressImportIssue{
  kind:'card'|'practice'|'word'|'dialogue'|'ai'|'rest';
  legacyKey:string;
  reason:string;
}

export interface LegacyProgressImportResult{
  course:CourseProgressDocument;
  stats:StatsProgressDocument;
  words:WordsProgressDocument;
  report:{
    cards:number;
    practice:number;
    statsActivities:number;
    words:number;
    dialogues:number;
    aiTalks:number;
    reviewDays:number;
    speedMetrics:number;
    syntheticLearningDays:number;
    legacyTotal:number;
    legacyRight:number;
    importedAttempts:number;
    importedCorrect:number;
    dueDayShift:number;
    unresolved:LegacyProgressImportIssue[];
  };
}

const objectRecord=(value:unknown):Record<string,unknown> =>
  value&&typeof value==='object'&&!Array.isArray(value) ? value as Record<string,unknown> : {};

const finiteInt=(value:unknown,fallback=0):number=>{
  const n=Number(value);
  return Number.isFinite(n)?Math.trunc(n):fallback;
};

const bounded=(value:unknown,min:number,max:number):number=>
  Math.max(min,Math.min(max,finiteInt(value,min)));

const dayKey=(value:unknown):string|null=>{
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const [y,m,d]=text.split('-').map(Number);
  const stamp=Date.UTC(y!,m!-1,d!);
  const date=new Date(stamp);
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m!-1&&date.getUTCDate()===d ? text : null;
};

export function canonicalDayNumber(key:string):number{
  const valid=dayKey(key);
  if(!valid)throw new Error('bad_day_key');
  const [y,m,d]=valid.split('-').map(Number);
  return Math.floor(Date.UTC(y!,m!-1,d!)/86400000);
}

/** Legacy used local-midnight milliseconds. On positive UTC offsets that is one day lower. */
export function legacyDueDayShiftForKey(
  key:string,
  localMidnightMs=(value:string)=>new Date(value+'T00:00:00').getTime()
):number{
  const valid=dayKey(key);
  if(!valid)return 0;
  const legacy=Math.floor(localMidnightMs(valid)/86400000);
  return canonicalDayNumber(valid)-legacy;
}

function parseLegacy(raw:unknown):LegacyProgressState{
  let value=raw;
  if(typeof raw==='string'){
    try{value=JSON.parse(raw);}catch{throw new Error('bad_legacy_progress_json');}
  }
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('bad_legacy_progress');
  const record=value as Record<string,unknown>;
  const state=record.state&&typeof record.state==='object'&&!Array.isArray(record.state)
    ? record.state
    : record;
  return state as LegacyProgressState;
}

function cardActivityId(legacyKey:string,courseIds:Set<string>):string|null{
  const match=/^([^#]+)#(\d+)$/.exec(legacyKey);
  if(!match)return null;
  const index=Number(match[2]);
  if(!Number.isInteger(index)||index<0)return null;
  const id='ex.'+match[1]+'.'+String(index+1).padStart(3,'0');
  return courseIds.has(id)?id:null;
}

function patternActivityId(lessonId:string,courseIds:Set<string>):string|null{
  const id='pattern.'+lessonId;
  return courseIds.has(id)?id:null;
}

function normalizeSurface(value:string):string{
  return value.toLowerCase().replace(/[\u2019\u02bc]/g,"'").replace(/\s+/g,' ').trim();
}

function normalizeRu(value:string):string{
  return value.toLowerCase().replace(/[ё]/g,'е').replace(/\s+/g,' ').trim();
}

function legacyTranslations(value:unknown):string[]{
  return String(value||'')
    .split(/[;|]/)
    .map(item=>normalizeRu(item))
    .filter(Boolean);
}

function resolveLegacyWord(
  surface:string,
  oldRu:unknown,
  lexicon:LexiconSnapshot
):{lexeme:Lexeme;senseId:string}|null{
  const key=normalizeSurface(surface);
  const candidates=lexicon.entries.filter(entry=>
    !entry.deprecated&&(entry.forms||[]).some(form=>normalizeSurface(form.text)===key)
  );
  if(!candidates.length)return null;

  const old=legacyTranslations(oldRu);
  const matches:{lexeme:Lexeme;senseId:string}[]=[];
  for(const lexeme of candidates){
    for(const sense of lexeme.senses){
      const translated=(sense.translations.ru||[]).map(normalizeRu);
      if(old.length&&translated.some(value=>old.includes(value))) matches.push({lexeme,senseId:sense.id});
    }
  }

  const unique=new Map(matches.map(item=>[item.lexeme.id+'|'+item.senseId,item]));
  if(unique.size===1)return [...unique.values()][0]!;
  if(candidates.length===1&&candidates[0]!.senses.length===1){
    return {lexeme:candidates[0]!,senseId:candidates[0]!.senses[0]!.id};
  }
  return null;
}

function syntheticLearningDays(
  state:LegacyProgressState
):string[]{
  const explicit=dayKey(state.act)||dayKey(state.day);
  const streak=Math.max(0,finiteInt(state.streak,0));
  if(!explicit||!streak)return explicit?[explicit]:[];
  const last=canonicalDayNumber(explicit);
  const out:string[]=[];
  for(let offset=streak-1;offset>=0;offset--){
    const date=new Date((last-offset)*86400000);
    out.push(
      date.getUTCFullYear()+'-'+
      String(date.getUTCMonth()+1).padStart(2,'0')+'-'+
      String(date.getUTCDate()).padStart(2,'0')
    );
  }
  return out;
}

export function importLegacyProgress(
  raw:unknown,
  courseSet:CourseSet,
  lexicon:LexiconSnapshot,
  options:{dueDayShift?:number;importAt?:string;deviceId?:string}={}
):LegacyProgressImportResult{
  const state=parseLegacy(raw);
  const at=options.importAt||LEGACY_IMPORT_AT;
  const deviceId=options.deviceId||'legacy-import';
  const course=emptyCourseProgress();
  const stats=emptyStatsProgress();
  const words=emptyWordsProgress();
  const unresolved:LegacyProgressImportIssue[]=[];
  const activityIds=new Set(courseSet.activities.map(activity=>activity.id));
  const shift=finiteInt(options.dueDayShift,0);

  let cardCount=0;
  const srs=objectRecord(state.srs);
  for(const [legacyKey,rawState] of Object.entries(srs)){
    const activityId=cardActivityId(legacyKey,activityIds);
    if(!activityId){
      unresolved.push({kind:'card',legacyKey,reason:'activity_not_found'});
      continue;
    }
    const value=objectRecord(rawState);
    course.cards[activityId]={
      box:bounded(value.box,0,5),
      due:finiteInt(value.due,0)+shift,
      at
    };
    course.seen[activityId]={at};
    cardCount++;
  }

  const practiceStores:Array<[keyof LegacyProgressState,'drill'|'listening'|'speaking']>=[
    ['pat','drill'],
    ['lis','listening'],
    ['voc','speaking']
  ];
  let practiceCount=0;
  for(const [legacyStore,mode] of practiceStores){
    for(const [lessonId,rawState] of Object.entries(objectRecord(state[legacyStore]))){
      const activityId=patternActivityId(lessonId,activityIds);
      if(!activityId){
        unresolved.push({kind:'practice',legacyKey:String(legacyStore)+':'+lessonId,reason:'activity_not_found'});
        continue;
      }
      const value=objectRecord(rawState);
      course.practice[mode][activityId]={
        box:bounded(value.box,0,4),
        due:finiteInt(value.due,0)+shift,
        at
      };
      practiceCount++;
    }
  }

  let importedAttempts=0,importedCorrect=0,statsActivities=0;
  for(const [legacyKey,rawError] of Object.entries(objectRecord(state.err))){
    const activityId=cardActivityId(legacyKey,activityIds);
    if(!activityId){
      unresolved.push({kind:'card',legacyKey:'err:'+legacyKey,reason:'stats_activity_not_found'});
      continue;
    }
    const value=objectRecord(rawError);
    const attempts=Math.max(0,finiteInt(value.t,0));
    const wrong=Math.max(0,Math.min(attempts,finiteInt(value.w,0)));
    const correct=attempts-wrong;
    if(!attempts)continue;
    stats.buckets[statsBucketKey(deviceId,activityId)]={
      deviceId,
      activityId,
      attempts,
      correct,
      wrong,
      at
    };
    importedAttempts+=attempts;
    importedCorrect+=correct;
    statsActivities++;
  }

  let wordCount=0;
  for(const [surface,rawWord] of Object.entries(objectRecord(state.words))){
    const value=objectRecord(rawWord);
    const resolved=resolveLegacyWord(surface,value.ru,lexicon);
    if(!resolved){
      unresolved.push({kind:'word',legacyKey:surface,reason:'lexeme_or_sense_ambiguous'});
      continue;
    }
    const key=wordProgressKey(resolved.lexeme.id,resolved.senseId);
    words.items[key]={
      lexemeId:resolved.lexeme.id,
      senseId:resolved.senseId,
      box:bounded(value.box,0,4),
      due:finiteInt(value.due,0)+shift,
      at
    };
    wordCount++;
  }

  let reviewDays=0;
  for(const [index,value] of Object.entries(objectRecord(state.rest))){
    if(!value)continue;
    const n=Number(index);
    if(!Number.isInteger(n)||n<0||n>=40){
      unresolved.push({kind:'rest',legacyKey:index,reason:'bad_day_index'});
      continue;
    }
    const nodeId='day-'+(n+1);
    course.manualNodes[nodeId]={at};
    const date=dayKey(value);
    if(date)course.learningDays[date]={at:date+'T12:00:00.000Z'};
    reviewDays++;
  }

  let dialogues=0;
  for(const [id,rawValue] of Object.entries(objectRecord(state.dia))){
    if(!rawValue)continue;
    const activityId='dialogue.'+id;
    if(!activityIds.has(activityId)){
      unresolved.push({kind:'dialogue',legacyKey:id,reason:'activity_not_found'});
      continue;
    }
    course.seen[activityId]={at};
    const value=objectRecord(rawValue);
    const score=Number(value.score);
    if(Number.isFinite(score))course.metrics['dialogue-score:'+activityId]={value:score,at};
    dialogues++;
  }

  let aiTalks=0;
  for(const [id,rawValue] of Object.entries(objectRecord(state.ai))){
    if(!rawValue)continue;
    const activityId='ai.'+id;
    if(!activityIds.has(activityId)){
      unresolved.push({kind:'ai',legacyKey:id,reason:'activity_not_found'});
      continue;
    }
    course.seen[activityId]={at};
    const value=objectRecord(rawValue);
    const date=dayKey(value.date);
    if(date)course.learningDays[date]={at:date+'T12:00:00.000Z'};
    aiTalks++;
  }

  let speedMetrics=0;
  for(const [lessonId,rawSpeed] of Object.entries(objectRecord(state.speed))){
    const activityId=patternActivityId(lessonId,activityIds);
    const value=Number(rawSpeed);
    if(!activityId||!Number.isFinite(value))continue;
    course.metrics['speed:'+activityId]={value:Math.max(0,Math.min(100,Math.round(value))),at};
    speedMetrics++;
  }

  const synthetic=syntheticLearningDays(state);
  for(const date of synthetic){
    if(!course.learningDays[date])course.learningDays[date]={at:date+'T12:00:00.000Z'};
  }

  return {
    course,
    stats,
    words,
    report:{
      cards:cardCount,
      practice:practiceCount,
      statsActivities,
      words:wordCount,
      dialogues,
      aiTalks,
      reviewDays,
      speedMetrics,
      syntheticLearningDays:synthetic.length,
      legacyTotal:Math.max(0,finiteInt(state.total,0)),
      legacyRight:Math.max(0,finiteInt(state.right,0)),
      importedAttempts,
      importedCorrect,
      dueDayShift:shift,
      unresolved
    }
  };
}
