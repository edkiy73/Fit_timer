import { describe, expect, it } from 'vitest';
import {
  emptyCourseProgress,
  emptyStatsProgress,
  emptyWordsProgress,
  mergeCourseProgress,
  mergeStatsProgress,
  mergeWordsProgress,
  parseCourseProgress,
  statsBucketKey,
  wordProgressKey
} from './progress';

describe('UnMute progress document merge',()=>{
  it('merges independent course records from two devices',()=>{
    const local=emptyCourseProgress();
    local.cards.a={box:2,due:10,at:'2026-09-28T10:00:00Z'};
    local.practice.drill.p={box:1,due:12,at:'2026-09-28T10:00:00Z'};

    const remote=emptyCourseProgress();
    remote.cards.b={box:1,due:11,at:'2026-09-28T11:00:00Z'};
    remote.practice.speaking.p={box:1,due:13,at:'2026-09-28T11:00:00Z'};

    const merged=mergeCourseProgress(local,remote);
    expect(merged.cards.a?.box).toBe(2);
    expect(merged.cards.b?.box).toBe(1);
    expect(merged.practice.drill.p?.box).toBe(1);
    expect(merged.practice.speaking.p?.box).toBe(1);
  });

  it('uses the newer per-record change instead of replacing the whole document',()=>{
    const local=emptyCourseProgress();
    local.cards.a={box:2,due:10,at:'2026-09-28T12:00:00Z'};
    const remote=emptyCourseProgress();
    remote.cards.a={box:4,due:30,at:'2026-09-28T11:00:00Z'};

    expect(mergeCourseProgress(local,remote).cards.a?.box).toBe(2);
  });

  it('keeps stats from different device buckets',()=>{
    const local=emptyStatsProgress();
    local.buckets[statsBucketKey('phone','card.a')]={
      deviceId:'phone',activityId:'card.a',attempts:3,correct:2,wrong:1,at:'2026-09-28T10:00:00Z'
    };
    const remote=emptyStatsProgress();
    remote.buckets[statsBucketKey('tablet','card.a')]={
      deviceId:'tablet',activityId:'card.a',attempts:4,correct:4,wrong:0,at:'2026-09-28T11:00:00Z'
    };

    expect(Object.keys(mergeStatsProgress(local,remote).buckets)).toHaveLength(2);
  });

  it('lets a word deletion tombstone win on equal timestamp',()=>{
    const key=wordProgressKey('lex.work','verb');
    const local=emptyWordsProgress();
    local.items[key]={
      lexemeId:'lex.work',senseId:'verb',box:2,due:10,at:'2026-09-28T10:00:00Z',deleted:true
    };
    const remote=emptyWordsProgress();
    remote.items[key]={
      lexemeId:'lex.work',senseId:'verb',box:3,due:20,at:'2026-09-28T10:00:00Z'
    };

    expect(mergeWordsProgress(local,remote).items[key]?.deleted).toBe(true);
  });

  it('sanitizes malformed course documents instead of crashing sync',()=>{
    expect(parseCourseProgress('not json')).toEqual(emptyCourseProgress());
    expect(parseCourseProgress('{"schemaVersion":9}')).toEqual(emptyCourseProgress());
  });
});
