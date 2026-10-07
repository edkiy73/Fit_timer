import { afterEach, describe, expect, it } from 'vitest';
import type { LearnerCourseState } from './course-loader';
import { activitySaveClock } from './activity-progress';
import { emptyCourseProgress } from './progress';
import { acknowledgePace, daysFinishedToday, paceAcknowledged, shouldSuggestPause } from './pace';

const now = new Date(2026, 9, 7, 12, 0, 0);
const today = activitySaveClock(now).dayNumber;
const yesterdayAt = new Date(2026, 9, 6, 12, 0, 0).toISOString();

function state({doneToday, doneBefore = 0, mode = 'entitlement', access = 'full', freeDays = 2}: {
  doneToday: number; doneBefore?: number; mode?: string; access?: 'full' | 'preview'; freeDays?: number;
}): LearnerCourseState {
  const progress = emptyCourseProgress();
  const nodes = Array.from({length: 8}, (_, index) => {
    const node = {id: `n${index + 1}`, dayIndex: index + 1, activityIds: [`a${index + 1}`]};
    const done = index < doneBefore + doneToday;
    if(done) progress.seen[`a${index + 1}`] = {at: index < doneBefore ? yesterdayAt : now.toISOString()};
    return {node, complete: done};
  });
  return {
    set: {id: 'course', access: {mode, freePreview: {days: freeDays}}},
    progress,
    roadmapProgress: {nodes},
    access
  } as unknown as LearnerCourseState;
}

const node = (s: LearnerCourseState, id: string) => s.roadmapProgress.nodes.find(item => item.node.id === id)!.node;

afterEach(() => localStorage.clear());

describe('pace of a bought course (decision 4)', () => {
  it('counts only the days finished today', () => {
    expect(daysFinishedToday(state({doneBefore: 2, doneToday: 3}), today)).toBe(3);
    expect(daysFinishedToday(state({doneBefore: 4, doneToday: 0}), today)).toBe(0);
  });

  it('suggests a pause before the fourth day of today', () => {
    const s = state({doneBefore: 2, doneToday: 3});
    expect(shouldSuggestPause(s, node(s, 'n6'), today)).toBe(true);
    const two = state({doneBefore: 2, doneToday: 2});
    expect(shouldSuggestPause(two, node(two, 'n5'), today)).toBe(false);
  });

  it('never limits the free days, a finished day or a course without purchase', () => {
    const free = state({doneToday: 3, freeDays: 5});
    expect(shouldSuggestPause(free, node(free, 'n4'), today)).toBe(false);
    const s = state({doneBefore: 2, doneToday: 3});
    expect(shouldSuggestPause(s, node(s, 'n3'), today)).toBe(false);
    const freeCourse = state({doneBefore: 2, doneToday: 3, mode: 'free'});
    expect(shouldSuggestPause(freeCourse, node(freeCourse, 'n6'), today)).toBe(false);
    const preview = state({doneBefore: 2, doneToday: 3, access: 'preview'});
    expect(shouldSuggestPause(preview, node(preview, 'n6'), today)).toBe(false);
  });

  it('remembers «continue anyway» for the rest of the day only', () => {
    expect(paceAcknowledged(today)).toBe(false);
    acknowledgePace(today);
    expect(paceAcknowledged(today)).toBe(true);
    expect(paceAcknowledged(today + 1)).toBe(false);
  });
});
