import { describe, expect, it } from 'vitest';
import { emptyStatsProgress } from '../progress';
import { recordAnswer, summarizeAnswerStats, weakActivities } from './learner-stats';

describe('learner answer stats',()=>{
  it('records per-device counters and computes accuracy',()=>{
    let doc=emptyStatsProgress();
    doc=recordAnswer(doc,'phone','card.a',false,'2026-09-28T10:00:00Z');
    doc=recordAnswer(doc,'phone','card.a',true,'2026-09-28T10:01:00Z');
    doc=recordAnswer(doc,'tablet','card.b',true,'2026-09-28T10:02:00Z');

    expect(summarizeAnswerStats(doc)).toEqual({attempts:3,correct:2,wrong:1,accuracy:67});
  });

  it('matches legacy weak-spot threshold and ordering',()=>{
    let doc=emptyStatsProgress();
    doc=recordAnswer(doc,'phone','card.a',false,'2026-09-28T10:00:00Z');
    doc=recordAnswer(doc,'phone','card.a',true,'2026-09-28T10:01:00Z');
    doc=recordAnswer(doc,'phone','card.b',false,'2026-09-28T10:02:00Z');
    doc=recordAnswer(doc,'phone','card.b',false,'2026-09-28T10:03:00Z');
    doc=recordAnswer(doc,'phone','card.c',false,'2026-09-28T10:04:00Z');

    expect(weakActivities(doc).map(item=>item.activityId)).toEqual(['card.b','card.a']);
  });
});
