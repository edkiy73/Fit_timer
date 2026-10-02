#!/usr/bin/env node
import { parseLegacySource, buildCourseSet } from '../lib/legacy-import.mjs';

const LEGACY_SOURCE_SHA='011572be908d64a1e092e63a821e407d85753205';
const LEGACY_SOURCE_URL='https://raw.githubusercontent.com/edkiy73/English/'+LEGACY_SOURCE_SHA+'/index.html';

const CARD_INTERVALS=[0,1,3,7,16,35];
const PRACTICE_INTERVALS={
  drill:[0,2,6,16,35],
  speaking:[0,3,9,24,45],
  listening:[0,2,7,18,40],
};
const CARD_CAP=30;
const PRACTICE_CAPS={drill:3,speaking:2,listening:2};
const MODES=['drill','listening','speaking'];
const CARD_TYPES=new Set(['choice','text-input','translation']);

// 2-day break and 3-day break inside the 30-day window.
const BREAK_DAYS=new Set([8,9,19,20,21]);

function mulberry32(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function gradeCard(previous,correct,day){
  const box=correct?Math.min(5,(previous?.box??0)+1):0;
  return {box,due:day+(CARD_INTERVALS[box]??0)};
}
function gradePractice(mode,previous,correct,day){
  const box=correct?Math.min(4,(previous?.box??0)+1):0;
  return {box,due:day+(PRACTICE_INTERVALS[mode][box]??0)};
}

function courseModel(set,copyIndex){
  const byId=new Map(set.activities.map((activity,index)=>[activity.id,{activity,index}]));
  return {
    id:set.id+'#'+copyIndex,
    set,
    byId,
    cards:new Map(),
    practice:{drill:new Map(),listening:new Map(),speaking:new Map()},
    nextNode:0,
  };
}

function sortDue(ids,stateMap,sourceOrder,day){
  return ids
    .map(id=>({id,state:stateMap.get(id)}))
    .filter(item=>item.state&&item.state.due<=day)
    .sort((a,b)=>a.state.due-b.state.due+(0)||((sourceOrder.get(a.id)??0)-(sourceOrder.get(b.id)??0)));
}

function queueForCourse(course,day){
  const sourceOrder=new Map(course.set.activities.map((a,i)=>[a.id,i]));
  const cardIds=course.set.activities.filter(a=>CARD_TYPES.has(a.type)).map(a=>a.id);
  const cardAll=sortDue(cardIds,course.cards,sourceOrder,day);
  const cards=cardAll.slice(0,CARD_CAP).map(item=>({kind:'card',course,id:item.id}));
  let rawDue=cardAll.length;
  const items=[...cards];
  for(const mode of MODES){
    const ids=course.set.activities
      .filter(a=>a.type==='pattern-drill'&&a.modes.includes(mode))
      .map(a=>a.id);
    const all=sortDue(ids,course.practice[mode],sourceOrder,day);
    rawDue+=all.length;
    items.push(...all.slice(0,PRACTICE_CAPS[mode]).map(item=>({kind:'practice',course,id:item.id,mode})));
  }
  return {items,rawDue,waiting:rawDue-items.length};
}

function combinedQueue(courses,day){
  const queues=courses.map(course=>queueForCourse(course,day));
  return {
    items:queues.flatMap(q=>q.items),
    rawDue:queues.reduce((n,q)=>n+q.rawDue,0),
    waiting:queues.reduce((n,q)=>n+q.waiting,0),
  };
}

function answerItem(item,accuracy,rand,day){
  const correct=rand()<accuracy;
  if(item.kind==='card'){
    item.course.cards.set(item.id,gradeCard(item.course.cards.get(item.id),correct,day));
  }else{
    const map=item.course.practice[item.mode];
    map.set(item.id,gradePractice(item.mode,map.get(item.id),correct,day));
  }
  return correct;
}

function introduceNextNode(course,accuracy,rand,day){
  const node=course.set.roadmaps[0].nodes[course.nextNode];
  if(!node)return 0;
  course.nextNode++;
  let attempts=0;
  for(const id of node.activityIds){
    const activity=course.byId.get(id)?.activity;
    if(!activity)continue;
    if(CARD_TYPES.has(activity.type)){
      course.cards.set(id,gradeCard(course.cards.get(id),rand()<accuracy,day));
      attempts++;
    }else if(activity.type==='pattern-drill'){
      for(const mode of activity.modes){
        course.practice[mode].set(id,gradePractice(mode,course.practice[mode].get(id),rand()<accuracy,day));
        attempts++;
      }
    }
  }
  return attempts;
}

function percentile(values,p){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1))];
}
function avg(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}

function simulate(set,{copies,accuracy,breaks,seed}){
  const courses=Array.from({length:copies},(_,i)=>courseModel(set,i+1));
  const rand=mulberry32(seed);
  const days=[];
  for(let day=1;day<=30;day++){
    const skipped=breaks&&BREAK_DAYS.has(day);
    const morning=combinedQueue(courses,day);
    let reviewAttempts=0;
    let reviewCorrect=0;
    if(!skipped){
      for(const item of morning.items){
        const correct=answerItem(item,accuracy,rand,day);
        reviewAttempts++;
        if(correct)reviewCorrect++;
        // Current UI returns a wrong item once at the end of the same session.
        if(!correct){
          const retryCorrect=answerItem(item,accuracy,rand,day);
          reviewAttempts++;
          if(retryCorrect)reviewCorrect++;
        }
      }
    }
    let lessonAttempts=0;
    if(!skipped){
      for(const course of courses)lessonAttempts+=introduceNextNode(course,accuracy,rand,day);
    }
    const evening=combinedQueue(courses,day);
    days.push({
      day,skipped,
      offered:morning.items.length,
      rawDue:morning.rawDue,
      waiting:morning.waiting,
      reviewAttempts,
      lessonAttempts,
      endRawDue:evening.rawDue,
      endWaiting:evening.waiting
    });
  }
  const active=days.filter(d=>!d.skipped);
  return {
    copies,accuracy,breaks,
    summary:{
      avgOffered:+avg(active.map(d=>d.offered)).toFixed(1),
      p95Offered:percentile(active.map(d=>d.offered),0.95),
      maxOffered:Math.max(...active.map(d=>d.offered)),
      maxRawDue:Math.max(...days.map(d=>d.rawDue)),
      maxWaiting:Math.max(...days.map(d=>d.waiting)),
      avgReviewAttempts:+avg(active.map(d=>d.reviewAttempts)).toFixed(1),
      maxReviewAttempts:Math.max(...active.map(d=>d.reviewAttempts)),
      maxEndDebt:Math.max(...days.map(d=>d.endRawDue)),
    },
    days
  };
}

const response=await fetch(LEGACY_SOURCE_URL);
if(!response.ok)throw new Error('legacy_source_http_'+response.status);
const model=parseLegacySource(await response.text());
const course=buildCourseSet(model);

const scenarios=[];
for(const copies of [1,3]){
  for(const accuracy of [0.6,0.8,0.95]){
    for(const breaks of [false,true]){
      scenarios.push(simulate(course,{
        copies,accuracy,breaks,
        seed:20261003+copies*1000+Math.round(accuracy*100)+(breaks?500:0)
      }));
    }
  }
}

const output={
  generatedAt:new Date().toISOString(),
  assumptions:{
    horizonDays:30,
    course:'general-foundation',
    multiCourse:'3 courses = 3 independent copies of the real 40-day general-foundation course, to isolate scaling',
    studyPace:'one roadmap day per active course on every non-skipped calendar day',
    breaks:'days 8-9 and 19-21 are skipped in break scenarios',
    reviewOrder:'morning review first, then the new lesson; wrong review items return once at the end',
    currentCaps:{cardsPerCourse:CARD_CAP,practicePerCourse:PRACTICE_CAPS},
    words:'word-review is excluded: 3.1 measures course cards + pattern practice only'
  },
  scenarios
};

console.log(JSON.stringify(output,null,2));
console.error('\nSUMMARY');
for(const s of scenarios){
  console.error([
    s.copies+' course'+(s.copies===1?'':'s'),
    Math.round(s.accuracy*100)+'%',
    s.breaks?'2+3 day breaks':'no breaks',
    'avg offered '+s.summary.avgOffered,
    'p95 '+s.summary.p95Offered,
    'max offered '+s.summary.maxOffered,
    'max raw '+s.summary.maxRawDue,
    'max waiting '+s.summary.maxWaiting,
    'max attempts '+s.summary.maxReviewAttempts
  ].join(' | '));
  console.error('  offered/day: '+s.days.map(day=>day.skipped?'·':day.offered).join(','));
}
