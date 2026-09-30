import type { LearnerCourseState } from './course-loader';
import { activitySaveClock } from './activity-progress';
import { buildCourseReviewSession } from './review-session';
import type { WordReviewRuntimeValue } from './word-review-runtime';
import { resolveWordReviewSession } from './word-review';

export interface ReviewDueCounts {
  actionableCount:number;
  waitingCount:number;
}

/** Course cards plus saved words due today — one number for Today and the Review tab badge. */
export function reviewDueCounts(
  state:LearnerCourseState|null,
  wordRuntime:WordReviewRuntimeValue|null,
  locale:string,
  todayDay=activitySaveClock().dayNumber
):ReviewDueCounts|null{
  if(!state)return null;
  const course=buildCourseReviewSession(state.set,state.progress,todayDay);
  const words=wordRuntime?.status==='ready'&&wordRuntime.words&&wordRuntime.lexicon
    ? resolveWordReviewSession(wordRuntime.words,wordRuntime.lexicon,todayDay,locale)
    : null;
  return {
    actionableCount:course.actionableCount+(words?.items.length??0),
    waitingCount:course.waitingCount+(words?.waiting??0)
  };
}
