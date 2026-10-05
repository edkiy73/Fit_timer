import { beforeEach, describe, expect, it } from 'vitest';
import type { Activity, CourseSet, RoadmapNode } from './content/schema';
import { readActiveDayProgress, readActivePracticeProgress } from './day-progress-local';
import { emptyCourseProgress } from './progress';

const pattern:Extract<Activity,{type:'pattern-drill'}>={
  id:'pattern.day',
  revision:2,
  type:'pattern-drill',
  tags:[],
  revisionProgress:'preserve',
  lexiconRefs:[],
  pattern:{ru:'Паттерн'},
  modes:['drill','listening','speaking'],
  items:Array.from({length:8},(_,index)=>({
    id:'p'+(index+1),
    prompt:{ru:'Фраза '+(index+1)},
    answer:{accepted:['Phrase '+(index+1)],nearMiss:true,caseSensitive:false}
  }))
};

const node:RoadmapNode={
  id:'day-3',kind:'lesson',title:{ru:'День 3'},dayIndex:3,order:2,
  prerequisites:[],activityIds:[pattern.id],optional:false
};

const set:CourseSet={
  schemaVersion:1,id:'course',revision:1,slug:'course',title:{ru:'Курс'},
  level:{labels:[]},access:{mode:'free'},defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
  activities:[pattern],resources:[]
};

describe('same-device active day progress',()=>{
  beforeEach(()=>localStorage.clear());

  it('derives resolved and pending phrases from the persisted correction queue',()=>{
    localStorage.setItem('unmute.lesson-run:course:day-3',JSON.stringify({
      version:1,setId:'course',nodeId:'day-3',runId:'run-1'
    }));
    const base=pattern.items.map(item=>item.id);

    localStorage.setItem(
      'unmute.pattern-run:course:day-3:run-1:pattern.day:drill',
      JSON.stringify({
        version:1,activityRevision:2,
        itemIds:[...base,'p2'],
        pos:4
      })
    );

    expect(readActivePracticeProgress(set,node)).toContainEqual({
      activityId:'pattern.day',
      mode:'drill',
      resolvedSteps:3,
      attemptedSteps:4,
      pendingCorrections:1
    });

    localStorage.setItem(
      'unmute.pattern-run:course:day-3:run-1:pattern.day:drill',
      JSON.stringify({
        version:1,activityRevision:2,
        itemIds:[...base,'p2','p4'],
        pos:9
      })
    );

    expect(readActivePracticeProgress(set,node)).toContainEqual({
      activityId:'pattern.day',
      mode:'drill',
      resolvedSteps:7,
      attemptedSteps:8,
      pendingCorrections:1
    });
  });

  it('recovers attempted and unresolved regular tasks from the lesson snapshot',()=>{
    const task={
      id:'card.one',revision:1,type:'choice' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],prompt:{ru:'Вопрос'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
    };
    const taskNode:RoadmapNode={
      ...node,
      activityIds:[task.id,pattern.id],
      completion:{mode:'all',requirements:[
        {kind:'activity-seen',activityIds:[task.id]},
        {kind:'practice-started',activityId:pattern.id,modes:['drill','listening','speaking']}
      ]}
    };
    const taskSet:CourseSet={...set,roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[taskNode]}],activities:[task,pattern]};
    const progress=emptyCourseProgress();

    localStorage.setItem('unmute.lesson-run:course:day-3',JSON.stringify({
      version:1,setId:'course',nodeId:'day-3',runId:'run-1',
      stepIds:['card.one','pattern.day'],
      firstPassResults:{0:false}
    }));

    expect(readActiveDayProgress(taskSet,taskNode,progress).tasks).toEqual({
      attemptedSteps:1,
      pendingCorrections:1
    });

    progress.seen['card.one']={at:'2026-10-06T00:00:00Z'};
    expect(readActiveDayProgress(taskSet,taskNode,progress).tasks).toEqual({
      attemptedSteps:1,
      pendingCorrections:0
    });
  });

  it('ignores stale practice revisions and unrelated lesson runs',()=>{
    localStorage.setItem('unmute.lesson-run:course:day-3',JSON.stringify({
      version:1,setId:'course',nodeId:'day-3',runId:'run-1'
    }));
    localStorage.setItem(
      'unmute.pattern-run:course:day-3:run-1:pattern.day:listening',
      JSON.stringify({version:1,activityRevision:1,itemIds:pattern.items.map(item=>item.id),pos:8})
    );

    expect(readActivePracticeProgress(set,node)).toEqual([]);
  });
});
