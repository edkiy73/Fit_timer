import { describe, expect, it } from 'vitest';
import type { CourseSet, RoadmapNode } from './content/schema';
import { emptyCourseProgress } from './progress';
import { stageForDay } from './course-stages';
import {
  lastWeekActivity,
  nextLandmark,
  nodeDoneCount,
  nodeMinutes,
  nodeSpeakExamples,
  nodeSpeakTask,
  nodeTopic
} from './today-model';

const base={revision:1,revisionProgress:'preserve' as const,lexiconRefs:[]};

function day(dayIndex:number,activityIds:string[],kind:RoadmapNode['kind']='lesson'):RoadmapNode{
  return {id:'day-'+dayIndex,kind,title:{ru:'День '+dayIndex},dayIndex,order:dayIndex,prerequisites:[],activityIds,optional:false};
}

const nodes=[
  day(7,['plan.day-7','theory.past','card.a','card.b']),
  day(8,['card.c']),
  day(9,['card.d','dialogue.cafe']),
  day(10,['card.e'],'review')
];

const set:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Курс'},
  level:{from:'a1',to:'b1',labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Путь'},nodes}],
  activities:[
    {...base,id:'plan.day-7',type:'theory',tags:['plan'],title:{ru:'День 7'},format:'text',body:{ru:'Расскажи вслух, что делал вчера.\n\n• Yesterday I worked.'}},
    {...base,id:'theory.past',type:'theory',tags:[],title:{ru:'Past Simple'},format:'html',body:{ru:'<p>…</p>'}},
    {...base,id:'card.a',type:'choice',tags:[],prompt:{ru:'a'},options:[{ru:'1'},{ru:'2'}],correctIndex:0},
    {...base,id:'card.b',type:'choice',tags:[],prompt:{ru:'b'},options:[{ru:'1'},{ru:'2'}],correctIndex:0},
    {...base,id:'card.c',type:'choice',tags:[],prompt:{ru:'c'},options:[{ru:'1'},{ru:'2'}],correctIndex:0},
    {...base,id:'card.d',type:'choice',tags:[],prompt:{ru:'d'},options:[{ru:'1'},{ru:'2'}],correctIndex:0},
    {...base,id:'card.e',type:'choice',tags:[],prompt:{ru:'e'},options:[{ru:'1'},{ru:'2'}],correctIndex:0},
    {...base,id:'dialogue.cafe',type:'dialogue',tags:['dialogue'],scene:{ru:'Кафе и заказ'},lines:[{id:'l1',partner:{ru:'Hi'},answer:{accepted:['hi'],nearMiss:true,caseSensitive:false}}]}
  ],
  resources:[]
} as CourseSet;

describe('Today model',()=>{
  it('reads the day topic from its theory card, not the "День N" title',()=>{
    expect(nodeTopic(set,nodes[0]!,'ru')).toBe('Past Simple');
    expect(nodeTopic(set,nodes[1]!,'ru')).toBe('День 8');
  });

  it('takes the speak-aloud task from the first paragraph of the plan note',()=>{
    expect(nodeSpeakTask(set,nodes[0]!,'ru')).toBe('Расскажи вслух, что делал вчера.');
    expect(nodeSpeakTask(set,nodes[1]!,'ru')).toBeNull();
    expect(nodeSpeakExamples(set,nodes[0]!,'ru')).toEqual(['Yesterday I worked.']);
  });

  it('estimates minutes and counts finished tasks',()=>{
    expect(nodeMinutes(set,nodes[0]!)).toBe(4);
    const progress=emptyCourseProgress();
    progress.seen['theory.past']={at:'2026-09-30T00:00:00Z'};
    progress.cards['card.a']={box:1,due:0,at:'2026-09-30T00:00:00Z'};
    expect(nodeDoneCount(progress,nodes[0]!)).toBe(2);
  });

  it('finds the next dialogue ahead of the current day',()=>{
    expect(nextLandmark(set,set.roadmaps[0]!,nodes[0]!,'ru')).toEqual({kind:'dialogue',title:'Кафе и заказ',dayIndex:9,inDays:2});
    expect(nextLandmark(set,set.roadmaps[0]!,nodes[2]!,'ru')).toEqual({kind:'review',title:'',dayIndex:10,inDays:1});
    expect(nextLandmark(set,set.roadmaps[0]!,nodes[3]!,'ru')).toBeNull();
  });

  it('marks the learning days of the last week, today last',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-30']={at:'2026-09-30T08:00:00Z'};
    progress.learningDays['2026-09-28']={at:'2026-09-28T08:00:00Z'};
    progress.learningDays['2026-09-20']={at:'2026-09-20T08:00:00Z'};
    const today=Date.UTC(2026,8,30)/86_400_000;
    expect(lastWeekActivity(progress,today)).toEqual([false,false,false,false,true,false,true]);
  });

  it('maps course days to the nine stages',()=>{
    expect(stageForDay(1)?.id).toBe('start');
    expect(stageForDay(7)?.id).toBe('yesterday');
    expect(stageForDay(35)?.id).toBe('stories');
    expect(stageForDay(40)?.id).toBe('finish');
    expect(stageForDay(41)).toBeNull();
    // Stages are the main course's route; a short course has none.
    expect(stageForDay(1,'a1-starter')).toBeNull();
  });
});
