import { beforeEach, describe, expect, it } from 'vitest';
import {
  REVIEW_DAILY_BASE,
  REVIEW_DAILY_EXTRA,
  addReviewExtra,
  capReviewCount,
  readReviewBudget,
  recordReviewCompletion,
  remainingReviewQuota
} from './review-daily-budget';

describe('daily Review quota',()=>{
  beforeEach(()=>localStorage.clear());

  it('starts every study day with a global quota of 20',()=>{
    expect(readReviewBudget(10)).toEqual({day:10,limit:REVIEW_DAILY_BASE,completed:0});
    expect(capReviewCount(57,10)).toBe(20);
  });

  it('persists completed review items for the same day',()=>{
    recordReviewCompletion(10,7);
    expect(remainingReviewQuota(10)).toBe(13);
    expect(capReviewCount(57,10)).toBe(13);
    expect(remainingReviewQuota(11)).toBe(20);
  });

  it('adds an optional ten without changing another day',()=>{
    recordReviewCompletion(10,20);
    expect(remainingReviewQuota(10)).toBe(0);
    const expanded=addReviewExtra(10);
    expect(expanded.limit).toBe(REVIEW_DAILY_BASE+REVIEW_DAILY_EXTRA);
    expect(remainingReviewQuota(10)).toBe(10);
    expect(remainingReviewQuota(11)).toBe(20);
  });

  it('never exposes more items than are actually due',()=>{
    expect(capReviewCount(6,10)).toBe(6);
  });
});
