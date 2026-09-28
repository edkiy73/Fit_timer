import { describe, expect, it } from 'vitest';
import type { CourseSet } from './content/schema';
import { buildCourseView, activityDone, type CourseNodeStatus } from './course';
import { emptyCourseProgress } from './progress';
import type { ContentRoadmapOutline } from './content/client';

const fullSet:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Курс'},
  level:{from:'a1',to:'b2',labels:[]},
  access:{
    mode:'entitlement',
    entitlement:'course.general-foundation',
    freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}
  },
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Путь'},
    nodes:[
      {id:'d1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,prerequisites:[],activityIds:['a1'],optional:false},
      {id:'d7',kind:'checkpoint',title:{ru:'День 7'},dayIndex:7,order:1,prerequisites:['d1'],activityIds:['a7'],optional:false},
      {id:'d8',kind:'lesson',title:{ru:'День 8'},dayIndex:8,order:2,prerequisites:['d7'],activityIds:['a8'],optional:false}
    ]
  }],
  activities:[
    {id:'a1',revision:1,type:'theory',tags:[],revisionProgress:'preserve',lexiconRefs:[],body:{ru:'one'},format:'text'},
    {id:'a7',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',lexiconRefs:[],prompt:{ru:'seven'},answer:{accepted:['seven'],nearMiss:true,caseSensitive:false}},
    {id:'a8',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',lexiconRefs:[],prompt:{ru:'eight'},answer:{accepted:['eight'],nearMiss:true,caseSensitive:false}}
  ],
  resources:[]
};

const previewSet:CourseSet={
  ...fullSet,
  roadmaps:[{
    ...fullSet.roadmaps[0]!,
    nodes:fullSet.roadmaps[0]!.nodes.filter(node=>(node.dayIndex||0)<=7)
      .map(node=>({...node,prerequisites:node.prerequisites.filter(dep=>dep!=='d8')}))
  }],
  activities:fullSet.activities.filter(activity=>activity.id!=='a8')
};

const outline:ContentRoadmapOutline={
  id:'main',
  title:{ru:'Путь'},
  nodes:fullSet.roadmaps[0]!.nodes.map(node=>({
    id:node.id,
    kind:node.kind,
    title:node.title,
    dayIndex:node.dayIndex,
    order:node.order,
    prerequisites:node.prerequisites,
    optional:node.optional
  }))
};

const statuses=(value:ReturnType<typeof buildCourseView>):Record<string,CourseNodeStatus> =>
  Object.fromEntries(value.nodes.map(node=>[node.outline.id,node.status]));

describe('course UI view model',()=>{
  it('shows the first available day and keeps post-preview roadmap nodes locked',()=>{
    const view=buildCourseView(previewSet,outline,'preview',emptyCourseProgress());
    expect(view.current?.outline.id).toBe('d1');
    expect(statuses(view)).toEqual({d1:'current',d7:'future',d8:'locked'});
    expect(view.nextLocked?.outline.id).toBe('d8');
    expect(view.totalRequired).toBe(3);
  });

  it('shows the paywall boundary after all free nodes are complete',()=>{
    const progress=emptyCourseProgress();
    progress.seen.a1={at:'2026-09-29T00:00:00Z'};
    progress.seen.a7={at:'2026-09-29T00:01:00Z'};
    const view=buildCourseView(previewSet,outline,'preview',progress);
    expect(view.current).toBeNull();
    expect(view.nextLocked?.outline.id).toBe('d8');
    expect(statuses(view)).toEqual({d1:'done',d7:'done',d8:'locked'});
    expect(view.courseComplete).toBe(false);
  });

  it('uses the same roadmap with full access instead of a separate paid path',()=>{
    const progress=emptyCourseProgress();
    progress.seen.a1={at:'2026-09-29T00:00:00Z'};
    progress.seen.a7={at:'2026-09-29T00:01:00Z'};
    const view=buildCourseView(fullSet,outline,'full',progress);
    expect(view.current?.outline.id).toBe('d8');
    expect(statuses(view)).toEqual({d1:'done',d7:'done',d8:'current'});
  });

  it('marks a pattern activity complete only after every declared mode was started',()=>{
    const pattern={
      id:'pattern.mechanics',
      revision:1,
      type:'pattern-drill' as const,
      tags:[],
      revisionProgress:'preserve' as const,
      lexiconRefs:[],
      pattern:{ru:'pattern'},
      modes:['drill','listening','speaking'] as const,
      items:[{
        id:'pattern.mechanics.item-1',
        prompt:{ru:'Фраза'},
        answer:{accepted:['phrase'],nearMiss:true,caseSensitive:false}
      }]
    };
    const progress=emptyCourseProgress();
    progress.practice.drill[pattern.id]={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    progress.practice.listening[pattern.id]={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    expect(activityDone(pattern,progress)).toBe(false);
    progress.practice.speaking[pattern.id]={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    expect(activityDone(pattern,progress)).toBe(true);
  });
});
