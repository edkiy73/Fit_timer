import { describe, expect, it } from 'vitest';
import { emptyCourseProgress, emptyStatsProgress, practiceItemKey } from './progress';
import {
  activitySaveClock,
  buildDialogueActivityProgress,
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

  it('marks a finished dialogue seen and stores its legacy score metric',()=>{
    const clock={
      at:'2026-09-29T03:00:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const next=buildDialogueActivityProgress(
      emptyCourseProgress(),
      'dialogue.d1',
      74.6,
      clock
    );

    expect(next.seen['dialogue.d1']).toEqual({at:clock.at});
    expect(next.learningDays[clock.dayKey]).toEqual({at:clock.at});
    expect(next.metrics['dialogue-score:dialogue.d1']).toEqual({
      value:75,
      at:clock.at
    });
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
      due:20727,
      completed:true
    });
    expect(next.course.metrics['speed:pattern.one']).toMatchObject({
      value:75,
      at:clock.at
    });
    // Practising the phrases counts as doing that step: a day made only of seen steps
    // (the A1 course) is then complete and the next day opens.
    expect(next.course.seen['pattern.one']).toBeTruthy();
    expect(next.stats.buckets['device-one|pattern.one']).toMatchObject({
      attempts:1,
      correct:1,
      wrong:0
    });
  });

  it('can complete a practice mode while keeping weak SRS',()=>{
    const clock={
      at:'2026-09-29T01:20:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const next=buildPracticeActivityProgress(
      emptyCourseProgress(),emptyStatsProgress(),'device-one','pattern.weak','drill',false,50,clock
    );

    expect(next.course.practice.drill['pattern.weak']).toMatchObject({
      box:0,
      due:20725,
      completed:true
    });
  });

  it('stores phrase-level SRS from first pass and keeps manual speech neutral',()=>{
    const clock={
      at:'2026-09-29T01:20:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const next=buildPracticeActivityProgress(
      emptyCourseProgress(),
      emptyStatsProgress(),
      'device-one',
      'pattern.items',
      'drill',
      false,
      50,
      clock,
      'run|pattern.items|drill',
      {
        'phrase.fast':'strong',
        'phrase.slow':'weak',
        'phrase.manual':'neutral'
      }
    );

    expect(next.course.practice.drill['pattern.items']).toMatchObject({
      completed:true,
      itemized:true
    });
    expect(next.course.practiceItems.drill[practiceItemKey('pattern.items','phrase.fast')]).toMatchObject({
      box:1,
      due:20728
    });
    expect(next.course.practiceItems.drill[practiceItemKey('pattern.items','phrase.slow')]).toMatchObject({
      box:0,
      due:20726
    });
    expect(next.course.practiceItems.drill[practiceItemKey('pattern.items','phrase.manual')]).toBeUndefined();
  });

  it('retries a partially saved card operation without grading SRS twice',()=>{
    const clock={
      at:'2026-09-29T01:15:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const operationId='run-one|card.one|0|card';
    const first=buildGradedActivityProgress(
      emptyCourseProgress(),
      emptyStatsProgress(),
      'device-one',
      'card.one',
      true,
      clock,
      undefined,
      operationId
    );
    expect(first.course.cards['card.one']).toMatchObject({box:2,due:20728});
    expect(first.course.answerOps[operationId]).toBeTruthy();

    // Simulate: course write succeeded, stats write failed.
    const retry=buildGradedActivityProgress(
      first.course,
      emptyStatsProgress(),
      'device-one',
      'card.one',
      true,
      clock,
      undefined,
      operationId
    );
    expect(retry.course.cards['card.one']).toMatchObject({box:2,due:20728});
    expect(retry.stats.buckets['device-one|card.one']).toMatchObject({attempts:1,correct:1,wrong:0});

    const duplicate=buildGradedActivityProgress(
      retry.course,
      retry.stats,
      'device-one',
      'card.one',
      true,
      clock,
      undefined,
      operationId
    );
    expect(duplicate.course.cards['card.one']).toMatchObject({box:2,due:20728});
    expect(duplicate.stats.buckets['device-one|card.one']).toMatchObject({attempts:1,correct:1,wrong:0});
  });

  it('keeps a retried practice operation fully idempotent',()=>{
    const clock={
      at:'2026-09-29T01:20:00.000Z',
      dayKey:'2026-09-29',
      dayNumber:20725
    };
    const operationId='run-one|pattern.one|1|practice:drill';
    const grades={'phrase.one':'strong' as const};
    const first=buildPracticeActivityProgress(
      emptyCourseProgress(),emptyStatsProgress(),'device-one','pattern.one','drill',true,75,clock,operationId,grades
    );
    const retry=buildPracticeActivityProgress(
      first.course,emptyStatsProgress(),'device-one','pattern.one','drill',true,75,
      {...clock,at:'2026-09-29T01:21:00.000Z'},operationId,grades
    );
    expect(retry.course.practice.drill['pattern.one']).toMatchObject({box:1,due:20727});
    expect(retry.course.metrics['speed:pattern.one']?.at).toBe(clock.at);
    expect(retry.course.practiceItems.drill[practiceItemKey('pattern.one','phrase.one')]).toMatchObject({
      box:1,
      due:20728,
      at:clock.at
    });
    expect(retry.stats.buckets['device-one|pattern.one']).toMatchObject({attempts:1,correct:1,wrong:0});
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
    expect(next.course.cards['card.one']).toMatchObject({box:2,due:20728});
    expect(next.stats.buckets['device-one|card.one']).toMatchObject({
      attempts:1,
      correct:1,
      wrong:0
    });
  });
});
