import { describe, expect, it } from 'vitest';
import { emptyCourseProgress } from './progress';
import type { CourseSet, RoadmapNode } from './content/schema';
import { lessonSectionStates } from './lesson-sections';

const node:RoadmapNode={
  id:'day-3',
  kind:'lesson',
  title:{ru:'День 3'},
  dayIndex:3,
  order:2,
  prerequisites:[],
  activityIds:['theory','choice','pattern'],
  optional:false
};

const set:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
  activities:[
    {
      id:'theory',revision:1,type:'theory',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],body:{ru:'Теория'},format:'text'
    },
    {
      id:'choice',revision:1,type:'choice',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'Вопрос'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
    },
    {
      id:'pattern',revision:1,type:'pattern-drill',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],pattern:{ru:'Паттерн'},modes:['drill','listening','speaking'],
      items:[{id:'p1',prompt:{ru:'Я здесь'},answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}}]
    }
  ],
  resources:[]
};

describe('lesson section states',()=>{
  it('shows exactly what is done and what still blocks the day',()=>{
    const progress=emptyCourseProgress();
    progress.seen.theory={at:'2026-10-05T10:00:00Z'};
    progress.seen.choice={at:'2026-10-05T10:01:00Z'};
    progress.practice.drill.pattern={box:1,due:2,at:'2026-10-05T10:02:00Z'};
    progress.practice.listening.pattern={box:0,due:1,at:'2026-10-05T10:03:00Z'};

    expect(lessonSectionStates(set,node,progress).map(section=>[section.id,section.complete])).toEqual([
      ['theory',true],
      ['tasks',true],
      ['drill',true],
      ['listening',false],
      ['speaking',false]
    ]);
  });
});
