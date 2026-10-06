import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCourseProgress, emptyStatsProgress, mergeCourseProgress, mergeStatsProgress } from './progress';
import {
  clearCourseLocalRuns,
  progressSetIdsFromRefs,
  resetCourseProgress,
  resetCourseStatistics,
  resetStatsProgress
} from './progress-reset';
import { recordAnswer, summarizeAnswerStats } from './engine/learner-stats';
import { activityDone } from './today-model';

const OLD='2026-09-20T10:00:00.000Z';
const RESET='2026-09-30T10:00:00.000Z';

describe('progress reset contracts', () => {
  beforeEach(()=>localStorage.clear());
  it('wins over the older copy on the account, so old progress does not come back', () => {
    const studied=emptyCourseProgress();
    studied.seen['a1']={at:OLD};
    studied.cards['a1']={box:2,due:12,at:OLD};
    studied.learningDays['2026-09-20']={at:OLD};
    const reset=resetCourseProgress(studied,RESET);
    const merged=mergeCourseProgress(reset,studied);
    expect(activityDone(merged,'a1')).toBe(false);
    expect(merged.learningDays['2026-09-20']?.deleted).toBe(true);
    // Learning after the reset counts again.
    merged.seen['a1']={at:'2026-10-01T09:00:00.000Z'};
    expect(activityDone(mergeCourseProgress(merged,reset),'a1')).toBe(true);
  });

  it('resets reporting statistics without closing or reopening course days', () => {
    const studied=emptyCourseProgress();
    studied.seen['a1']={at:OLD};
    studied.cards['a1']={box:2,due:12,at:OLD};
    studied.practice.drill['pattern.a']={box:1,due:20,completed:true,at:OLD};
    studied.learningDays['2026-09-20']={at:OLD};
    studied.metrics['speed:pattern.a']={value:55,at:OLD};

    const next=resetCourseStatistics(studied,RESET);

    expect(activityDone(next,'a1')).toBe(true);
    expect(next.cards['a1']).toMatchObject({box:2,due:12});
    expect(next.practice.drill['pattern.a']).toMatchObject({box:1,due:20,completed:true});
    expect(next.learningDays['2026-09-20']?.deleted).not.toBe(true);
    expect(next.metrics['speed:pattern.a']?.deleted).toBe(true);
  });

  it('clears only the restarted course local lesson/correction snapshots', () => {
    localStorage.setItem('unmute.lesson-run:course-a:day-2','{}');
    localStorage.setItem('unmute.pattern-run:course-a:day-2:run:p:drill','{}');
    localStorage.setItem('unmute.lesson-completion:course-a:day-2','{}');
    localStorage.setItem('unmute.lesson-run:course-b:day-1','{}');
    localStorage.setItem('unmute.review-budget:10','{}');

    clearCourseLocalRuns('course-a');

    expect(localStorage.getItem('unmute.lesson-run:course-a:day-2')).toBeNull();
    expect(localStorage.getItem('unmute.pattern-run:course-a:day-2:run:p:drill')).toBeNull();
    expect(localStorage.getItem('unmute.lesson-completion:course-a:day-2')).toBeNull();
    expect(localStorage.getItem('unmute.lesson-run:course-b:day-1')).toBe('{}');
    expect(localStorage.getItem('unmute.review-budget:10')).toBe('{}');
  });

  it('discovers retired course ids from synced progress documents', () => {
    expect(progressSetIdsFromRefs([
      {key:'settings'},
      {key:'progress:course:current-course'},
      {key:'progress:stats:retired-course'},
      {key:'progress:course:retired-course'},
      {key:'progress:words'}
    ])).toEqual(['current-course','retired-course']);
  });

  it('zeroes answer statistics and starts counting again', () => {
    let stats=recordAnswer(emptyStatsProgress(),'dev','a1',false,OLD);
    stats=resetStatsProgress(stats,RESET);
    expect(summarizeAnswerStats(mergeStatsProgress(stats,emptyStatsProgress())).attempts).toBe(0);
    stats=recordAnswer(stats,'dev','a1',true,'2026-10-01T09:00:00.000Z');
    expect(summarizeAnswerStats(stats)).toMatchObject({attempts:1,correct:1,wrong:0});
  });
});
