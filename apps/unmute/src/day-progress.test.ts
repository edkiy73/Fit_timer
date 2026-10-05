import { describe, expect, it } from 'vitest';
import type { Activity, CourseSet, RoadmapNode } from './content/schema';
import { emptyCourseProgress } from './progress';
import { getDayProgress } from './day-progress';

const cards:Activity[]=Array.from({length:19},(_,index)=>({
  id:'card.'+(index+1),
  revision:1,
  type:'choice' as const,
  tags:[],
  revisionProgress:'preserve' as const,
  lexiconRefs:[],
  prompt:{ru:'Вопрос '+(index+1)},
  options:[{ru:'A'},{ru:'B'}],
  correctIndex:0
}));

const pattern:Extract<Activity,{type:'pattern-drill'}>={
  id:'pattern.day-3',
  revision:1,
  type:'pattern-drill',
  tags:[],
  revisionProgress:'preserve',
  lexiconRefs:[],
  pattern:{ru:'Привычки'},
  modes:['drill','listening','speaking'],
  items:Array.from({length:8},(_,index)=>({
    id:'phrase.'+(index+1),
    prompt:{ru:'Фраза '+(index+1)},
    answer:{accepted:['Phrase '+(index+1)],nearMiss:true,caseSensitive:false}
  }))
};

const node:RoadmapNode={
  id:'day-3',
  kind:'lesson',
  title:{ru:'День 3'},
  dayIndex:3,
  order:2,
  prerequisites:[],
  activityIds:[...cards.map(card=>card.id),pattern.id],
  completion:{
    mode:'all',
    requirements:[
      {kind:'activity-seen',activityIds:cards.map(card=>card.id)},
      {kind:'practice-started',activityId:pattern.id,modes:['drill','listening','speaking']}
    ]
  },
  optional:false
};

const set:CourseSet={
  schemaVersion:1,
  id:'test-course',
  revision:1,
  slug:'test-course',
  title:{ru:'Курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
  activities:[...cards,pattern],
  resources:[]
};

describe('canonical day progress',()=>{
  it('counts real required units instead of activity ids',()=>{
    const progress=emptyCourseProgress();
    const initial=getDayProgress(set,node,progress);

    expect(initial.totalSteps).toBe(43);
    expect(initial.completedSteps).toBe(0);
    expect(initial.dayComplete).toBe(false);

    for(const card of cards)progress.seen[card.id]={at:'2026-10-06T00:00:00Z'};
    const tasksDone=getDayProgress(set,node,progress);
    expect(tasksDone.completedSteps).toBe(19);
    expect(tasksDone.sections.map(section=>[section.id,section.totalSteps])).toEqual([
      ['tasks',19],
      ['drill',8],
      ['listening',8],
      ['speaking',8]
    ]);

    const drillPartial=getDayProgress(set,node,progress,{practice:[{
      activityId:pattern.id,
      mode:'drill',
      resolvedSteps:3,
      attemptedSteps:4,
      pendingCorrections:1
    }]});
    expect(drillPartial.completedSteps).toBe(22);
    expect(drillPartial.attemptedSteps).toBe(23);
    expect(drillPartial.pendingCorrections).toBe(1);
    expect(drillPartial.sections.find(section=>section.id==='drill')?.status).toBe('correcting');
  });

  it('lets weak SRS coexist with completed required practice',()=>{
    const progress=emptyCourseProgress();
    for(const card of cards)progress.seen[card.id]={at:'2026-10-06T00:00:00Z'};

    progress.practice.drill[pattern.id]={box:0,due:0,completed:true,at:'2026-10-06T00:01:00Z'};
    expect(getDayProgress(set,node,progress).completedSteps).toBe(27);

    progress.practice.listening[pattern.id]={box:0,due:0,completed:true,at:'2026-10-06T00:02:00Z'};
    expect(getDayProgress(set,node,progress).completedSteps).toBe(35);

    progress.practice.speaking[pattern.id]={box:0,due:0,completed:true,at:'2026-10-06T00:03:00Z'};
    const complete=getDayProgress(set,node,progress);
    expect(complete.completedSteps).toBe(43);
    expect(complete.dayComplete).toBe(true);
    expect(complete.status).toBe('complete');
    expect(complete.nextRequiredSection).toBeNull();
  });

  it('never treats attempted-but-wrong units as completed',()=>{
    const progress=emptyCourseProgress();
    const state=getDayProgress(set,node,progress,{practice:[
      {activityId:pattern.id,mode:'drill',resolvedSteps:0,attemptedSteps:8,pendingCorrections:8},
      {activityId:pattern.id,mode:'listening',resolvedSteps:0,attemptedSteps:8,pendingCorrections:8},
      {activityId:pattern.id,mode:'speaking',resolvedSteps:0,attemptedSteps:8,pendingCorrections:8}
    ]});

    expect(state.totalSteps).toBe(43);
    expect(state.completedSteps).toBe(0);
    expect(state.attemptedSteps).toBe(24);
    expect(state.pendingCorrections).toBe(24);
    expect(state.dayComplete).toBe(false);
  });

  it('keeps an all-wrong regular task run in progress at 0 completed',()=>{
    const progress=emptyCourseProgress();
    const state=getDayProgress(set,node,progress,{
      tasks:{attemptedSteps:19,pendingCorrections:19}
    });

    expect(state.completedSteps).toBe(0);
    expect(state.attemptedSteps).toBe(19);
    expect(state.pendingCorrections).toBe(19);
    expect(state.status).toBe('in_progress');
    expect(state.sections.find(section=>section.id==='tasks')?.status).toBe('correcting');
  });

  it('stays incomplete when only speed is missing',()=>{
    const progress=emptyCourseProgress();
    for(const card of cards)progress.seen[card.id]={at:'2026-10-06T00:00:00Z'};
    progress.practice.listening[pattern.id]={box:1,due:2,completed:true,at:'2026-10-06T00:02:00Z'};
    progress.practice.speaking[pattern.id]={box:1,due:3,completed:true,at:'2026-10-06T00:03:00Z'};

    const state=getDayProgress(set,node,progress);
    expect(state.completedSteps).toBe(35);
    expect(state.totalSteps).toBe(43);
    expect(state.dayComplete).toBe(false);
    expect(state.nextRequiredSection?.id).toBe('drill');
  });
});
