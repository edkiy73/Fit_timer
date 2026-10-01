import { describe, expect, it } from 'vitest';
import { emptyCourseProgress, emptyStatsProgress, mergeCourseProgress, mergeStatsProgress } from './progress';
import { resetCourseProgress, resetStatsProgress } from './progress-reset';
import { recordAnswer, summarizeAnswerStats } from './engine/learner-stats';
import { activityDone } from './today-model';

const OLD='2026-09-20T10:00:00.000Z';
const RESET='2026-09-30T10:00:00.000Z';

describe('«Начать заново»', () => {
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

  it('zeroes answer statistics and starts counting again', () => {
    let stats=recordAnswer(emptyStatsProgress(),'dev','a1',false,OLD);
    stats=resetStatsProgress(stats,RESET);
    expect(summarizeAnswerStats(mergeStatsProgress(stats,emptyStatsProgress())).attempts).toBe(0);
    stats=recordAnswer(stats,'dev','a1',true,'2026-10-01T09:00:00.000Z');
    expect(summarizeAnswerStats(stats)).toMatchObject({attempts:1,correct:1,wrong:0});
  });
});
