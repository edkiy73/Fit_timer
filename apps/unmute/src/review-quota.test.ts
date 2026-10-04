import { beforeEach, describe, expect, it } from 'vitest';
import {
  REVIEW_DAILY_TARGET,
  REVIEW_EXTRA_STEP,
  completeReviewQuotaItem,
  extendReviewQuota,
  readReviewDayQuota,
  remainingReviewQuota,
  takeGlobalReviewQuota
} from './review-quota';

describe('daily Review quota',()=>{
  beforeEach(()=>localStorage.clear());

  it('starts at 20 and remembers completed items for the day',()=>{
    expect(REVIEW_DAILY_TARGET).toBe(20);
    expect(remainingReviewQuota(123)).toBe(20);
    completeReviewQuotaItem(123,7);
    expect(readReviewDayQuota(123)).toMatchObject({day:123,limit:20,completed:7});
    expect(remainingReviewQuota(123)).toBe(13);
  });

  it('adds voluntary blocks of ten without changing another day',()=>{
    expect(REVIEW_EXTRA_STEP).toBe(10);
    extendReviewQuota(123);
    expect(readReviewDayQuota(123).limit).toBe(30);
    expect(readReviewDayQuota(124).limit).toBe(20);
  });

  it('mixes multiple sources instead of exhausting the active course first',()=>{
    expect(takeGlobalReviewQuota(
      [['a1','a2','a3'],['b1','b2'],['w1','w2']],
      5
    )).toEqual({
      items:['a1','b1','w1','a2','b2'],
      overflow:2
    });
  });
});
