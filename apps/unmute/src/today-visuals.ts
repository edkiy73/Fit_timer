import type { CourseSet, RoadmapNode } from './content/schema';
import type { CourseProgressDocument, TimedFlag } from './progress';
import type { RecordMap } from '@appbase/core/document-sync.js';
import type { DayProgress, DayProgressSectionId } from './day-progress';
import { dayActivityStepCount } from './day-progress';
import { activitySaveClock } from './activity-progress';
import { dayNumberFromKey } from './engine/course-progress';

/* Pure models behind the Today visuals: the day as a voice wave, the week as an
   equalizer and the learner's memory as a constellation. Real progress only. */

export interface WaveBar {
  section:DayProgressSectionId;
  /** 0..1 — relative bar height, shaped by the length of the phrase behind it. */
  height:number;
  state:'done'|'current'|'pending';
}

function hash(value:string):number{
  let h=2166136261;
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0)/4294967295;
}

function text(value:Record<string,string>|undefined):string{
  return value?Object.values(value)[0]??'':'';
}

/** Lengths of the phrases behind each step of a section, in lesson order. */
function sectionLengths(set:CourseSet,node:RoadmapNode,sectionId:DayProgressSectionId,activityId?:string):number[]{
  const byId=new Map(set.activities.map(activity=>[activity.id,activity] as const));
  if(sectionId==='tasks'){
    const out:number[]=[];
    for(const id of node.activityIds){
      const activity=byId.get(id);
      if(!activity||dayActivityStepCount(activity)===0)continue;
      const answer=(activity.type==='text-input'||activity.type==='translation')?activity.answer.accepted[0]??'':'';
      const prompt=('prompt' in activity)?text(activity.prompt as Record<string,string>|undefined):'';
      out.push((prompt+' '+answer).trim().length||Math.round(10+hash(id)*30));
    }
    return out;
  }
  const activity=activityId?byId.get(activityId):undefined;
  if(activity?.type==='pattern-drill')return activity.items.map(item=>(item.answer.accepted[0]??text(item.prompt)).length);
  return [];
}

/** Bars per step so a short day still reads as a dense voice line (≈40 bars). */
export function waveDensity(totalSteps:number):number{
  return totalSteps>0?Math.max(1,Math.min(4,Math.round(40/totalSteps))):1;
}

export function dayWave(set:CourseSet,node:RoadmapNode,progress:DayProgress):WaveBar[]{
  const bars:WaveBar[]=[];
  const density=waveDensity(progress.totalSteps);
  let currentTaken=false;
  for(const section of progress.sections){
    const lengths=sectionLengths(set,node,section.id,section.activityId);
    const min=Math.min(...lengths,Infinity), max=Math.max(...lengths,0);
    for(let i=0;i<section.totalSteps;i++){
      const len=lengths[i];
      const raw=len===undefined||max<=min ? hash(section.id+i) : (len-min)/(max-min);
      let state:WaveBar['state']='pending';
      if(i<section.completedSteps)state='done';
      else if(!currentTaken&&!progress.dayComplete){state='current';currentTaken=true;}
      for(let k=0;k<density;k++){
        const index=bars.length;
        // A soft envelope + per-syllable jitter so the row reads as speech, not as a bar chart.
        const envelope=.78+.22*Math.sin(index*.62);
        const syllable=density>1?.62+.38*hash(section.id+':'+i+':'+k):1;
        const height=Math.max(.22,Math.min(1,(.3+.7*raw)*envelope*syllable));
        bars.push({section:section.id,height,state});
      }
    }
  }
  return bars;
}

function liveAt(records:RecordMap<{at:string;deleted?:boolean}>|undefined):string[]{
  if(!records)return [];
  const out:string[]=[];
  for(const value of Object.values(records)){
    if(value&&!value.deleted&&typeof value.at==='string')out.push(value.at);
  }
  return out;
}

/** Seven values (oldest first, today last): 0 = no practice, otherwise 0.28..1 by how much was done. */
export function weekLevels(
  progress:CourseProgressDocument,
  learningDays:RecordMap<TimedFlag>,
  todayDay:number
):number[]{
  const counts=new Map<number,number>();
  const stamps=[
    ...liveAt(progress.seen),
    ...liveAt(progress.cards),
    ...liveAt(progress.practiceItems.drill),
    ...liveAt(progress.practiceItems.listening),
    ...liveAt(progress.practiceItems.speaking)
  ];
  for(const at of stamps){
    const date=new Date(at);
    if(Number.isNaN(date.getTime()))continue;
    const day=activitySaveClock(date).dayNumber;
    if(day>todayDay-7&&day<=todayDay)counts.set(day,(counts.get(day)??0)+1);
  }
  const active=new Set<number>();
  for(const [key,value] of Object.entries(learningDays)){
    if(!value||value.deleted)continue;
    try{active.add(dayNumberFromKey(key));}catch{}
  }
  const raw=Array.from({length:7},(_,index)=>{
    const day=todayDay-6+index;
    const count=counts.get(day)??0;
    return count>0?count:(active.has(day)?1:0);
  });
  const max=Math.max(1,...raw);
  return raw.map(value=>value===0?0:.28+.72*Math.sqrt(value/max));
}

export type MemoryRing='fresh'|'growing'|'strong';

export interface MemoryDot {
  key:string;
  ring:MemoryRing;
  /** Position in a 120×120 box, centre at 60,60. */
  x:number;
  y:number;
  due:boolean;
}

export interface MemoryModel {
  total:number;
  strong:number;
  growing:number;
  fresh:number;
  due:number;
  dots:MemoryDot[];
}

const RING_RADIUS:Record<MemoryRing,[number,number]>={fresh:[5,23],growing:[29,38],strong:[45,55]};
const MAX_DOTS=96;

/** Everything the learner has met, by how firmly it sits in memory: fresh in the core, strong on the outer orbit. */
export function memoryModel(progress:CourseProgressDocument,todayDay:number):MemoryModel{
  const entries:{key:string;ring:MemoryRing;due:boolean}[]=[];
  for(const [key,card] of Object.entries(progress.cards)){
    if(!card||card.deleted)continue;
    entries.push({key:'c:'+key,ring:card.box>=3?'strong':card.box===2?'growing':'fresh',due:card.due<=todayDay});
  }
  for(const mode of ['drill','listening','speaking'] as const){
    for(const [key,item] of Object.entries(progress.practiceItems[mode])){
      if(!item||item.deleted)continue;
      entries.push({key:mode+':'+key,ring:item.box>=3?'strong':item.box===2?'growing':'fresh',due:item.due<=todayDay});
    }
  }
  const count=(ring:MemoryRing)=>entries.filter(entry=>entry.ring===ring).length;
  const model:MemoryModel={
    total:entries.length,
    strong:count('strong'),
    growing:count('growing'),
    fresh:count('fresh'),
    due:entries.filter(entry=>entry.due).length,
    dots:[]
  };
  // Keep the picture readable: sample evenly when there are more entries than dots.
  const step=Math.max(1,entries.length/MAX_DOTS);
  const picked=entries.length<=MAX_DOTS?entries:Array.from({length:MAX_DOTS},(_,i)=>entries[Math.floor(i*step)]!);
  const perRing:Record<MemoryRing,number>={fresh:0,growing:0,strong:0};
  const golden=Math.PI*(3-Math.sqrt(5));
  const ringTotal:Record<MemoryRing,number>={fresh:0,growing:0,strong:0};
  for(const entry of picked)ringTotal[entry.ring]++;
  for(const entry of picked){
    const n=perRing[entry.ring]++;
    const [inner,outer]=RING_RADIUS[entry.ring];
    // Sunflower spread inside each ring: even coverage without overlaps, stable per item.
    const r=inner+(outer-inner)*Math.sqrt((n+.5)/ringTotal[entry.ring]);
    const angle=n*golden+hash(entry.key+'a')*.6;
    model.dots.push({key:entry.key,ring:entry.ring,due:entry.due,x:60+r*Math.cos(angle),y:60+r*Math.sin(angle)});
  }
  return model;
}

export type DayPart='morning'|'day'|'evening'|'night';

export function dayPart(now=new Date()):DayPart{
  const hour=now.getHours();
  if(hour>=5&&hour<11)return 'morning';
  if(hour>=11&&hour<17)return 'day';
  if(hour>=17&&hour<22)return 'evening';
  return 'night';
}
