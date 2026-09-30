import { describe, expect, it, vi } from 'vitest';

vi.mock('./sync',()=>({appDocs:{subscribe:()=>()=>{}},readCourseProgress:vi.fn()}));
vi.mock('./active-course',()=>({useCatalog:()=>({data:null})}));

import { emptyCourseProgress } from './progress';
import { currentLearningStreak } from './progress-screen';
import { lastWeekActivity } from './today-model';
import { mergeLearningDays, withAllLearningDays } from './learning-days';

const today=Date.UTC(2026,8,30)/86_400_000;

describe('learning days across courses',()=>{
  it('keeps the streak when the learner switches courses',()=>{
    const a1=emptyCourseProgress();
    a1.learningDays['2026-09-28']={at:'2026-09-28T08:00:00Z'};
    a1.learningDays['2026-09-29']={at:'2026-09-29T08:00:00Z'};
    const general=emptyCourseProgress();
    general.learningDays['2026-09-30']={at:'2026-09-30T08:00:00Z'};

    // Only the active course: the streak restarts at 1.
    expect(currentLearningStreak(general,today)).toBe(1);

    const all=mergeLearningDays([a1.learningDays,general.learningDays]);
    const merged=withAllLearningDays(general,all);
    expect(currentLearningStreak(merged,today)).toBe(3);
    expect(lastWeekActivity(merged,today)).toEqual([false,false,false,false,true,true,true]);
    // The course's own progress is not changed.
    expect(Object.keys(general.learningDays)).toEqual(['2026-09-30']);
  });

  it('ignores deleted days and works before other courses have loaded',()=>{
    const course=emptyCourseProgress();
    course.learningDays['2026-09-30']={at:'2026-09-30T08:00:00Z'};
    const other={'2026-09-29':{at:'2026-09-29T08:00:00Z',deleted:true}};
    expect(currentLearningStreak(withAllLearningDays(course,other),today)).toBe(1);
    expect(withAllLearningDays(course,null)).toBe(course);
  });
});
