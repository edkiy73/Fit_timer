import { describe, expect, it } from 'vitest';
import { isActivityReviewable, isNodeUnlockedByPurchase } from './access';
import { validateCourseSet } from './schema';

const sample = validateCourseSet({
  schemaVersion: 1,
  id: 'set.a1-b1',
  revision: 1,
  slug: 'a1-b1',
  title: { ru: 'A1–B1' },
  level: { from: 'a1', to: 'b1', labels: [] },
  access: {
    mode: 'entitlement',
    entitlement: 'course.a1-b1',
    freePreview: { kind: 'first-days', days: 7, learnedContentStaysAvailable: true },
  },
  defaultRoadmapId: 'main',
  roadmaps: [{
    id: 'main',
    title: { ru: 'Основной путь' },
    nodes: [
      { id: 'd7', kind: 'lesson', title: { ru: 'День 7' }, dayIndex: 7, order: 7, prerequisites: [], activityIds: ['ex.1'], optional: false },
      { id: 'cp7', kind: 'checkpoint', title: { ru: 'Проверка' }, dayIndex: 7, order: 8, prerequisites: ['d7'], activityIds: [], optional: false },
      { id: 'd8', kind: 'lesson', title: { ru: 'День 8' }, dayIndex: 8, order: 9, prerequisites: ['cp7'], activityIds: ['ex.2'], optional: false },
    ],
  }],
  activities: [
    { id: 'ex.1', revision: 1, type: 'text-input', tags: [], revisionProgress: 'preserve', prompt: { ru: 'Переведи' }, answer: { accepted: ['hello'], nearMiss: true, caseSensitive: false } },
    { id: 'ex.2', revision: 1, type: 'text-input', tags: [], revisionProgress: 'reset', prompt: { ru: 'Переведи ещё' }, answer: { accepted: ['bye'], nearMiss: true, caseSensitive: false } },
  ],
});

describe('course set content model', () => {
  it('makes all of day 7 free without counting checkpoint nodes as another day', () => {
    const nodes = sample.roadmaps[0]!.nodes;
    expect(isNodeUnlockedByPurchase(sample, nodes[0]!, { owned: false })).toBe(true);
    expect(isNodeUnlockedByPurchase(sample, nodes[1]!, { owned: false })).toBe(true);
    expect(isNodeUnlockedByPurchase(sample, nodes[2]!, { owned: false })).toBe(false);
  });

  it('unlocks the whole set after purchase', () => {
    expect(isNodeUnlockedByPurchase(sample, sample.roadmaps[0]!.nodes[2]!, { owned: true })).toBe(true);
  });

  it('keeps learned activities reviewable independently of purchase boundary', () => {
    expect(isActivityReviewable('ex.2', { owned: false, learnedActivityIds: new Set(['ex.2']) })).toBe(true);
  });

  it('defaults text answers to progressive build-then-write mode', () => {
    const first = sample.activities.find(activity => activity.id === 'ex.1');
    expect(first?.type).toBe('text-input');
    if(first?.type === 'text-input') expect(first.responseMode).toBe('progressive');
  });

  it('accepts explicit build and write response modes', () => {
    const raw = JSON.parse(JSON.stringify(sample));
    raw.activities[0].responseMode = 'build';
    raw.activities[1].responseMode = 'write';
    const parsed = validateCourseSet(raw);
    expect(parsed.activities[0]?.type === 'text-input' && parsed.activities[0].responseMode).toBe('build');
    expect(parsed.activities[1]?.type === 'text-input' && parsed.activities[1].responseMode).toBe('write');
  });

  it('rejects dangling activity references', () => {
    const raw = JSON.parse(JSON.stringify(sample));
    raw.roadmaps[0].nodes[0].activityIds = ['missing'];
    expect(() => validateCourseSet(raw)).toThrow(/Unknown activity/);
  });
});
