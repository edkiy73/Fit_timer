import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPausedLessonRun,
  latestPausedLessonRun,
  markLessonRunPaused,
  unfinishedReminderTime
} from './lesson-run-reminder';

describe('unfinished lesson reminder',()=>{
  beforeEach(()=>localStorage.clear());

  it('marks an existing lesson run as paused and exposes remaining work',()=>{
    localStorage.setItem('unmute.lesson-run:general-foundation:day-2',JSON.stringify({
      version:1,
      setId:'general-foundation',
      nodeId:'day-2',
      order:[0,1,2,3,4],
      pos:2,
      result:null
    }));

    expect(markLessonRunPaused(
      'general-foundation',
      'day-2',
      '2026-10-03T10:00:00.000Z'
    )).toBe(true);

    const paused=latestPausedLessonRun();
    expect(paused?.nodeId).toBe('day-2');
    expect(paused?.remaining).toBe(3);
    expect(paused?.pausedAt.toISOString()).toBe('2026-10-03T10:00:00.000Z');
  });

  it('does not count an already answered current card as remaining',()=>{
    localStorage.setItem('unmute.lesson-run:general-foundation:day-2',JSON.stringify({
      version:1,
      setId:'general-foundation',
      nodeId:'day-2',
      order:[0,1,2,3],
      pos:2,
      result:true,
      pausedAt:'2026-10-03T10:00:00.000Z'
    }));
    expect(latestPausedLessonRun()?.remaining).toBe(1);
  });

  it('schedules about three hours later, respects 09:00 start and never goes after 21:00',()=>{
    expect(unfinishedReminderTime(new Date(2026,9,3,4,30))?.getHours()).toBe(9);
    expect(unfinishedReminderTime(new Date(2026,9,3,16,30))?.getHours()).toBe(19);
    expect(unfinishedReminderTime(new Date(2026,9,3,18,0))?.getHours()).toBe(21);
    expect(unfinishedReminderTime(new Date(2026,9,3,18,1))).toBeNull();
  });

  it('clears the paused marker when the learner resumes',()=>{
    localStorage.setItem('unmute.lesson-run:general-foundation:day-2',JSON.stringify({
      version:1,
      setId:'general-foundation',
      nodeId:'day-2',
      order:[0,1],
      pos:0,
      result:null,
      pausedAt:'2026-10-03T10:00:00.000Z'
    }));
    clearPausedLessonRun('general-foundation','day-2');
    expect(latestPausedLessonRun()).toBeNull();
  });
});
