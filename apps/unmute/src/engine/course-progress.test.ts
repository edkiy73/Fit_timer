import { describe, expect, it } from 'vitest';
import type { Roadmap } from '../content/schema';
import {
  buildRoadmapProgress,
  dayNumberFromKey,
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
