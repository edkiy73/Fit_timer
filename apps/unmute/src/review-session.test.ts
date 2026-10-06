import { describe, expect, it } from 'vitest';
import type { CourseSet } from './content/schema';
import { emptyCourseProgress } from './progress';
import { buildCourseReviewSession } from './review-session';

const set:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Путь'},
    nodes:[{
      id:'day-1',
      kind:'lesson',
      title:{ru:'День 1'},
      dayIndex:1,
      order:0,
      prerequisites:[],
      activityIds:['card.a','card.b','pattern.a'],
      optional:false
    }]
  }],
  activities:[
    {
      id:'card.a',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'A'},answer:{accepted:['a'],nearMiss:true,caseSensitive:false}
    },
    {
      id:'card.b',revision:1,type:'translation',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],direction:'to-target',prompt:{ru:'B'},
      answer:{accepted:['b'],nearMiss:true,caseSensitive:false}
    },
    {
      id:'pattern.a',revision:1,type:'pattern-drill',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],pattern:{ru:'Pattern'},modes:['drill','listening','speaking'],
      items:[
        {
          id:'pattern.a.item-1',prompt:{ru:'Фраза 1'},
          answer:{accepted:['Phrase one'],nearMiss:true,caseSensitive:false}
        },
        {
          id:'pattern.a.item-2',prompt:{ru:'Фраза 2'},
          answer:{accepted:['Phrase two'],nearMiss:true,caseSensitive:false}
        }
      ]
    }
  ],
  resources:[]
};

describe('course review session',()=>{
  it('combines due cards with capped practice modes in review order',()=>{
    const progress=emptyCourseProgress();
    progress.cards['card.a']={box:2,due:5,at:'2026-09-29T00:00:00Z'};
    progress.cards['card.b']={box:1,due:4,at:'2026-09-29T00:00:00Z'};
    progress.practice.drill['pattern.a']={box:1,due:3,at:'2026-09-29T00:00:00Z'};
    progress.practice.listening['pattern.a']={box:1,due:3,at:'2026-09-29T00:00:00Z'};
    progress.practice.speaking['pattern.a']={box:1,due:3,at:'2026-09-29T00:00:00Z'};

    const session=buildCourseReviewSession(set,progress,5);

    expect(session.items.map(item=>item.kind==='card'
      ? item.activity.id
      : item.mode+':'+item.activity.id
    )).toEqual([
      'card.b',
      'card.a',
      'drill:pattern.a',
      'listening:pattern.a',
      'speaking:pattern.a'
    ]);
    expect(session.actionableCount).toBe(5);
    expect(session.waitingCount).toBe(0);
  });

  it('queues only the concrete due phrase for an itemized practice mode',()=>{
    const progress=emptyCourseProgress();
    progress.practice.drill['pattern.a']={
      box:0,
      due:5,
      completed:true,
      itemized:true,
      at:'2026-09-29T00:00:00Z'
    };
    progress.practiceItems.drill['pattern.a::pattern.a.item-1']={
      box:0,
      due:5,
      at:'2026-09-29T00:01:00Z'
    };
    progress.practiceItems.drill['pattern.a::pattern.a.item-2']={
      box:1,
      due:9,
      at:'2026-09-29T00:02:00Z'
    };

    const session=buildCourseReviewSession(set,progress,5);
    const practice=session.items.filter(item=>item.kind==='practice');

    expect(practice).toHaveLength(1);
    expect(practice[0]).toMatchObject({
      kind:'practice',
      mode:'drill',
      itemId:'pattern.a.item-1'
    });
    expect(session.practice.drill).toBe(1);
    expect(session.actionableCount).toBe(1);
  });

  it('keeps legacy whole-pattern review until that mode is migrated',()=>{
    const progress=emptyCourseProgress();
    progress.practice.drill['pattern.a']={
      box:1,
      due:3,
      completed:true,
      at:'2026-09-29T00:00:00Z'
    };

    const session=buildCourseReviewSession(set,progress,5);
    const item=session.items.find(entry=>entry.kind==='practice');

    expect(item).toMatchObject({
      kind:'practice',
      mode:'drill'
    });
    expect(item&&item.kind==='practice'?item.itemId:undefined).toBeUndefined();
  });

  it('ignores deleted and future review states',()=>{
    const progress=emptyCourseProgress();
    progress.cards['card.a']={box:2,due:1,at:'2026-09-29T00:00:00Z',deleted:true};
    progress.cards['card.b']={box:2,due:99,at:'2026-09-29T00:00:00Z'};
    progress.practice.drill['pattern.a']={box:1,due:1,at:'2026-09-29T00:00:00Z',deleted:true};

    const session=buildCourseReviewSession(set,progress,5);

    expect(session.items).toHaveLength(0);
    expect(session.actionableCount).toBe(0);
  });
});
