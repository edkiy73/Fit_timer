import { describe, expect, it } from 'vitest';
import type { Roadmap } from '../content/schema';
import {
  buildRoadmapProgress,
  dayNumberFromKey,
  effectiveNodeRequirements,
  emptyRoadmapProgress,
  isRoadmapNodeComplete,
  learningGapDays,
  recordLearningActivity
} from './course-progress';

const roadmap:Roadmap={
  id:'main',
  title:{ru:'Основной путь'},
  nodes:[
    {
      id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,
      prerequisites:[],activityIds:['theory.a','card.a1','card.a2','pattern.a'],
      completion:{mode:'all',requirements:[
        {kind:'activity-seen',activityIds:['card.a1','card.a2']},
        {kind:'practice-started',activityId:'pattern.a',modes:['drill','listening','speaking']}
      ]},
      optional:false
    },
    {
      id:'day-2',kind:'review',title:{ru:'День 2'},dayIndex:2,order:1,
      prerequisites:['day-1'],activityIds:['review.day-2'],
      completion:{mode:'all',requirements:[{kind:'manual'}]},
      optional:false
    },
    {
      id:'bonus',kind:'bonus',title:{ru:'Бонус'},order:2,
      prerequisites:['day-1'],activityIds:['bonus.a'],
      completion:{mode:'all',requirements:[{kind:'activity-seen',activityIds:['bonus.a']}]},
      optional:true
    },
    {
      id:'day-3',kind:'lesson',title:{ru:'День 3'},dayIndex:3,order:3,
      prerequisites:['day-2'],activityIds:['card.c1'],
      completion:{mode:'all',requirements:[{kind:'activity-seen',activityIds:['card.c1']}]},
      optional:false
    }
  ]
};

describe('course progress and streak',()=>{
  it('uses timezone-independent YYYY-MM-DD day numbers',()=>{
    expect(dayNumberFromKey('2026-09-28')+1).toBe(dayNumberFromKey('2026-09-29'));
    expect(()=>dayNumberFromKey('2026-02-30')).toThrow('bad_day_key');
  });

  it('matches legacy streak semantics on activity days',()=>{
    let state=recordLearningActivity(undefined,'2026-09-28');
    expect(state).toMatchObject({lastDay:'2026-09-28',activeDay:'2026-09-28',streak:1});

    state=recordLearningActivity(state,'2026-09-28');
    expect(state.streak).toBe(1);

    state=recordLearningActivity(state,'2026-09-29');
    expect(state.streak).toBe(2);

    state=recordLearningActivity(state,'2026-10-01');
    expect(state.streak).toBe(1);
    expect(learningGapDays(state,'2026-10-01')).toBe(0);
    expect(learningGapDays(state,'2026-10-03')).toBe(2);
  });

  it('does not count theory as lesson completion and requires all three practice modes',()=>{
    const progress=emptyRoadmapProgress();
    progress.seenActivityIds=new Set(['theory.a','card.a1','card.a2']);
    progress.practice.drill['pattern.a']={box:1,due:0};
    progress.practice.listening['pattern.a']={box:1,due:0};

    expect(isRoadmapNodeComplete(roadmap.nodes[0]!,progress)).toBe(false);

    progress.practice.speaking['pattern.a']={box:1,due:0};
    expect(isRoadmapNodeComplete(roadmap.nodes[0]!,progress)).toBe(true);
  });

  it('treats explicit practice completion independently from a weak SRS box',()=>{
    const progress=emptyRoadmapProgress();
    progress.seenActivityIds=new Set(['card.a1','card.a2']);
    progress.practice.drill['pattern.a']={box:0,due:0,completed:true};
    progress.practice.listening['pattern.a']={box:0,due:0,completed:true};
    progress.practice.speaking['pattern.a']={box:0,due:0,completed:true};

    expect(isRoadmapNodeComplete(roadmap.nodes[0]!,progress)).toBe(true);

    progress.practice.speaking['pattern.a']={box:0,due:0};
    expect(isRoadmapNodeComplete(roadmap.nodes[0]!,progress)).toBe(false);
  });

  it('uses the new practice-completed requirement with the same durable semantics',()=>{
    const currentNode={
      ...roadmap.nodes[0]!,
      completion:{
        mode:'all' as const,
        requirements:[
          {kind:'activity-seen' as const,activityIds:['card.a1','card.a2']},
          {kind:'practice-completed' as const,activityId:'pattern.a',modes:['drill' as const,'listening' as const,'speaking' as const]}
        ]
      }
    };
    const progress=emptyRoadmapProgress();
    progress.seenActivityIds=new Set(['card.a1','card.a2']);
    progress.practice.drill['pattern.a']={box:0,due:0,completed:true};
    progress.practice.listening['pattern.a']={box:0,due:0,completed:true};
    progress.practice.speaking['pattern.a']={box:0,due:0,completed:true};

    expect(isRoadmapNodeComplete(currentNode,progress)).toBe(true);

    progress.practice.speaking['pattern.a']={box:0,due:0,completed:false};
    expect(isRoadmapNodeComplete(currentNode,progress)).toBe(false);
  });

  it('moves current day through lesson, manual review day and next lesson',()=>{
    const progress=emptyRoadmapProgress();

    let summary=buildRoadmapProgress(roadmap,progress);
    expect(summary.currentNode?.id).toBe('day-1');
    expect(summary.currentDayIndex).toBe(1);

    progress.seenActivityIds=new Set(['card.a1','card.a2']);
    progress.practice.drill['pattern.a']={box:1,due:0};
    progress.practice.listening['pattern.a']={box:1,due:0};
    progress.practice.speaking['pattern.a']={box:1,due:0};

    summary=buildRoadmapProgress(roadmap,progress);
    expect(summary.currentNode?.id).toBe('day-2');
    expect(summary.nodes.find(item=>item.node.id==='day-3')?.unlocked).toBe(false);

    progress.manualNodeIds=new Set(['day-2']);
    summary=buildRoadmapProgress(roadmap,progress);
    expect(summary.currentNode?.id).toBe('day-3');
    expect(summary.currentDayIndex).toBe(3);
  });

  it('does not let an unfinished optional bonus block course completion',()=>{
    const progress=emptyRoadmapProgress();
    progress.seenActivityIds=new Set(['card.a1','card.a2','card.c1']);
    progress.practice.drill['pattern.a']={box:1,due:0};
    progress.practice.listening['pattern.a']={box:1,due:0};
    progress.practice.speaking['pattern.a']={box:1,due:0};
    progress.manualNodeIds=new Set(['day-2']);

    const summary=buildRoadmapProgress(roadmap,progress);
    expect(summary.courseComplete).toBe(true);
    expect(summary.currentNode).toBeNull();
    expect(summary.completedCount).toBe(3);
    expect(summary.requiredCount).toBe(3);
  });
});

describe('days without an explicit completion contract',()=>{
  const node={id:'a1-day-1',kind:'lesson' as const,title:{ru:'День 1'},dayIndex:1,order:0,prerequisites:[],
    activityIds:['plan','theory','ex.1','ex.2','pattern'],optional:false};
  const activities=[
    {id:'plan',type:'theory'},{id:'theory',type:'theory'},
    {id:'ex.1',type:'choice'},{id:'ex.2',type:'text-input'},
    {id:'pattern',type:'pattern-drill',modes:['drill','listening','speaking']}
  ] as unknown as Parameters<typeof effectiveNodeRequirements>[1];

  it('derive the day counter rule: tasks seen and every phrase training passed',()=>{
    expect(effectiveNodeRequirements(node,activities)).toEqual([
      {kind:'activity-seen',activityIds:['ex.1','ex.2']},
      {kind:'practice-completed',activityId:'pattern',modes:['drill','listening','speaking']}
    ]);
  });

  it('do not complete the day after one training just because the pattern was seen',()=>{
    const progress={...emptyRoadmapProgress(),seenActivityIds:new Set(['plan','theory','ex.1','ex.2','pattern'])};
    progress.practice.drill.pattern={box:1,due:2,completed:true};
    expect(isRoadmapNodeComplete(node,progress,activities)).toBe(false);
    progress.practice.listening.pattern={box:1,due:2,completed:true};
    progress.practice.speaking.pattern={box:1,due:2,completed:true};
    expect(isRoadmapNodeComplete(node,progress,activities)).toBe(true);
    // Without the activities the historical rule stays (all activities seen).
    expect(isRoadmapNodeComplete(node,emptyRoadmapProgress())).toBe(false);
  });
});
