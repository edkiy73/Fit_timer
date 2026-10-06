import type { CourseSet, RoadmapNode } from './content/schema';
import type { CourseProgressDocument, TimedFlag } from './progress';
import type { RecordMap } from '@appbase/core/document-sync.js';
import type { DayProgress, DayProgressSectionId } from './day-progress';
import { dayActivityStepCount } from './day-progress';
import { activitySaveClock } from './activity-progress';
import { dayNumberFromKey } from './engine/course-progress';

/* Pure models behind the Today visuals: the day as a voice wave, the week as an
   equalizer and the course as a mosaic of days. Real progress only. */

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

export interface CourseCell {
  id:string;
  state:'done'|'current'|'ahead';
}

/** One cell per required day of the course: passed, today's, still ahead. */
export function courseCells(
  nodes:readonly {node:{id:string;optional?:boolean};complete:boolean}[],
  currentNodeId:string|null
):CourseCell[]{
  return nodes
    .filter(item=>!item.node.optional)
    .map(item=>({
      id:item.node.id,
      state:item.complete?'done':item.node.id===currentNodeId?'current':'ahead'
    }));
}

/** Columns for the mosaic: ten per row for a usual course, wider rows for very long ones. */
export function courseColumns(count:number):number{
  return count<=40?Math.min(10,Math.max(1,count)):Math.ceil(count/4);
}

export type DayPart='morning'|'day'|'evening'|'night';

export function dayPart(now=new Date()):DayPart{
  const hour=now.getHours();
  if(hour>=5&&hour<11)return 'morning';
  if(hour>=11&&hour<17)return 'day';
  if(hour>=17&&hour<22)return 'evening';
  return 'night';
}
