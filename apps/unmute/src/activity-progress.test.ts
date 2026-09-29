import { describe, expect, it } from 'vitest';
import { emptyCourseProgress, emptyStatsProgress } from './progress';
import {
  activitySaveClock,
  buildGradedActivityProgress,
  buildPracticeActivityProgress,
  buildSeenActivityProgress
} from './activity-progress';

describe('activity progress writes',()=>{
  it('marks theory/seen content and the local learning day',()=>{
    const clock=activitySaveClock(new Date(2026,8,29,9,15,0));
    const next=buildSeenActivityProgress(
      emptyCourseProgress(),
      'theory.one',
      clock
    );

    expect(next.seen['theory.one']?.at).toBe(clock.at);
    expect(next.learningDays[clock.dayKey]).toBeTruthy();
  });

  it('grades drill practice with legacy SRS timing and stores speed',()=>{
    const clock={
      at:'2026-09-29T01:20:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const next=buildPracticeActivityProgress(
      emptyCourseProgress(),
      emptyStatsProgress(),
      'device-one',
      'pattern.one',
      'drill',
      true,
      75,
      clock
    );

    expect(next.course.practice.drill['pattern.one']).toMatchObject({
      box:1,
      due:20727
    });
    expect(next.course.metrics['speed:pattern.one']).toMatchObject({
      value:75,
      at:clock.at
    });
    expect(next.stats.buckets['device-one|pattern.one']).toMatchObject({
      attempts:1,
      correct:1,
      wrong:0
    });
  });

  it('grades a card and records a per-device answer bucket together',()=>{
    const clock={
      at:'2026-09-29T01:15:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const next=buildGradedActivityProgress(
      emptyCourseProgress(),
      emptyStatsProgress(),
      'device-one',
      'card.one',
      true,
      clock
    );

    expect(next.course.seen['card.one']).toBeTruthy();
    expect(next.course.cards['card.one']).toMatchObject({box:1,due:20726});
    expect(next.stats.buckets['device-one|card.one']).toMatchObject({
      attempts:1,
      correct:1,
      wrong:0
    });
  });
});
