import { describe, expect, it } from 'vitest';
import { emptyCourseProgress } from './progress';
import { chooseLearnerNotification, learningDayStatus } from './notification-policy';

describe('UnMute notification policy',()=>{
  it('prefers one due-review reminder over streak and lesson reminders',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-28']={at:'2026-09-28T10:00:00Z'};

    expect(chooseLearnerNotification({
      progress,
      todayKey:'2026-09-29',
      dueCount:6,
      currentLessonAvailable:true,
      courseComplete:false
    })).toEqual({
      kind:'review-due',
      route:'/review',
      dueCount:6
    });
  });

  it('warns about a live streak only when yesterday was the last learning day',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-26']={at:'2026-09-26T10:00:00Z'};
    progress.learningDays['2026-09-27']={at:'2026-09-27T10:00:00Z'};
    progress.learningDays['2026-09-28']={at:'2026-09-28T10:00:00Z'};

    expect(learningDayStatus(progress,'2026-09-29')).toMatchObject({
      studiedToday:false,
      streak:3
    });
    expect(chooseLearnerNotification({
      progress,
      todayKey:'2026-09-29',
      dueCount:0,
      currentLessonAvailable:true,
      courseComplete:false
    })).toEqual({
      kind:'streak-risk',
      route:'/',
      streak:3
    });
  });

  it('uses the ordinary daily lesson reminder when there is no active streak',()=>{
    const progress=emptyCourseProgress();

    expect(chooseLearnerNotification({
      progress,
      todayKey:'2026-09-29',
      dueCount:0,
      currentLessonAvailable:true,
      courseComplete:false
    })).toEqual({
      kind:'daily-lesson',
      route:'/'
    });
  });

  it('does not remind again after learning activity has already been recorded today',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-29']={at:'2026-09-29T08:00:00Z'};

    expect(chooseLearnerNotification({
      progress,
      todayKey:'2026-09-29',
      dueCount:0,
      currentLessonAvailable:true,
      courseComplete:false
    })).toBeNull();
  });

  it('still surfaces due reviews after the learner studied today',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-29']={at:'2026-09-29T08:00:00Z'};

    expect(chooseLearnerNotification({
      progress,
      todayKey:'2026-09-29',
      dueCount:2,
      currentLessonAvailable:true,
      courseComplete:false
    })).toMatchObject({kind:'review-due',dueCount:2});
  });

  it('does not invent a lesson reminder for a completed course',()=>{
    const progress=emptyCourseProgress();

    expect(chooseLearnerNotification({
      progress,
      todayKey:'2026-09-29',
      dueCount:0,
      currentLessonAvailable:false,
      courseComplete:true
    })).toBeNull();
  });

  it('ignores tombstoned learning days when calculating the streak',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-28']={
      at:'2026-09-28T08:00:00Z',
      deleted:true
    };

    expect(learningDayStatus(progress,'2026-09-29')).toEqual({
      studiedToday:false,
      lastLearningDay:null,
      streak:0
    });
  });

  it('respects the master switch and per-kind switches',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-28']={at:'2026-09-28T10:00:00Z'};

    const base={
      progress,
      todayKey:'2026-09-29',
      dueCount:4,
      currentLessonAvailable:true,
      courseComplete:false
    };

    expect(chooseLearnerNotification({
      ...base,
      preferences:{
        enabled:false,
        time:'19:00',
        daily:true,
        review:true,
        streak:true,
        changedAt:'2026-09-29T10:00:00Z'
      }
    })).toBeNull();

    expect(chooseLearnerNotification({
      ...base,
      preferences:{
        enabled:true,
        time:'19:00',
        daily:true,
        review:false,
        streak:true,
        changedAt:'2026-09-29T10:00:00Z'
      }
    })).toMatchObject({kind:'streak-risk'});
  });
});
