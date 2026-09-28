import type { CourseSet, RoadmapNode } from './schema';

export interface LearnerSetAccess {
  owned: boolean;
  /** IDs the learner has already started/learned; these stay available for review. */
  learnedActivityIds?: ReadonlySet<string>;
}

export function isNodeUnlockedByPurchase(set: CourseSet, node: RoadmapNode, access: LearnerSetAccess): boolean {
  if (set.access.mode === 'free' || access.owned) return true;
  const preview = set.access.freePreview;
  return Boolean(preview && node.dayIndex !== undefined && node.dayIndex <= preview.days);
}

export function isActivityReviewable(activityId: string, access: LearnerSetAccess): boolean {
  return access.learnedActivityIds?.has(activityId) ?? false;
}
