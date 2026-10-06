import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecentDayCompletionForStartedNode,
  readRecentDayCompletion,
  rememberRecentDayCompletion
} from './recent-day-completion';

describe('recent completed day memory',()=>{
  beforeEach(()=>localStorage.clear());

  it('keeps the completed day for the same calendar day',()=>{
    rememberRecentDayCompletion('course','day-3',123);
    expect(readRecentDayCompletion('course',123)).toEqual({
      version:1,
      setId:'course',
      nodeId:'day-3',
      dayNumber:123
    });
  });

  it('expires on the next calendar day',()=>{
    rememberRecentDayCompletion('course','day-3',123);
    expect(readRecentDayCompletion('course',124)).toBeNull();
    expect(readRecentDayCompletion('course',123)).toBeNull();
  });

  it('clears only when a different next node is explicitly opened',()=>{
    rememberRecentDayCompletion('course','day-3',123);

    clearRecentDayCompletionForStartedNode('course','day-3',123);
    expect(readRecentDayCompletion('course',123)?.nodeId).toBe('day-3');

    clearRecentDayCompletionForStartedNode('course','day-4',123);
    expect(readRecentDayCompletion('course',123)).toBeNull();
  });
});
