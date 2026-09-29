import { describe, expect, it } from 'vitest';
import type { CourseSet } from './content/schema';
import type { LexiconSnapshot } from './lexicon/schema';
import { emptyCourseProgress, emptyWordsProgress } from './progress';
import { dayNumberFromKey } from './engine/course-progress';
import {
  localDayKey,
  nextReminderPlan
} from './notification-delivery';

const set:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Путь'},
    nodes:[{
      id:'day-1',
      kind:'lesson',
      title:{ru:'День 1'},
      dayIndex:1,
      order:0,
      prerequisites:[],
      activityIds:['card.one'],
      optional:false
    }]
  }],
  activities:[{
    id:'card.one',
    revision:1,
    type:'text-input',
    tags:[],
    revisionProgress:'preserve',
    lexiconRefs:[],
    prompt:{ru:'Фраза'},
    answer:{accepted:['Phrase'],nearMiss:true,caseSensitive:false}
  }],
  resources:[]
};

const lexicon:LexiconSnapshot={
  schemaVersion:1,
  revision:1,
  entries:[]
};

const preferences={
  enabled:true,
  time:'19:00',
  daily:true,
  review:true,
  streak:true,
  changedAt:'2026-09-29T00:00:00Z'
};

describe('native reminder planning',()=>{
  it('plans a due-review notification at the configured local time',()=>{
    const progress=emptyCourseProgress();
    progress.cards['card.one']={
      box:1,
      due:dayNumberFromKey('2026-09-29'),
      at:'2026-09-29T08:00:00Z'
    };

    const plan=nextReminderPlan({
      now:new Date(2026,8,29,18,0,0),
      preferences,
      set,
      progress,
      words:emptyWordsProgress(),
      lexicon,
      locale:'ru',
      currentLessonAvailable:true,
      courseComplete:false
    });

    expect(plan?.intent).toMatchObject({
      kind:'review-due',
      route:'/review',
      dueCount:1
    });
    expect(plan?.at.getHours()).toBe(19);
    expect(plan?.at.getMinutes()).toBe(0);
    expect(plan&&localDayKey(plan.at)).toBe('2026-09-29');
  });

  it('moves to tomorrow when today already passed and keeps streak priority',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-29']={at:'2026-09-29T12:00:00Z'};

    const plan=nextReminderPlan({
      now:new Date(2026,8,29,20,0,0),
      preferences,
      set,
      progress,
      words:emptyWordsProgress(),
      lexicon,
      locale:'ru',
      currentLessonAvailable:true,
      courseComplete:false
    });

    expect(plan?.dayKey).toBe('2026-09-30');
    expect(plan?.intent).toMatchObject({
      kind:'streak-risk',
      route:'/',
      streak:1
    });
  });

  it('does not schedule anything while reminders are disabled',()=>{
    const plan=nextReminderPlan({
      now:new Date(2026,8,29,18,0,0),
      preferences:{...preferences,enabled:false},
      set,
      progress:emptyCourseProgress(),
      words:emptyWordsProgress(),
      lexicon,
      locale:'ru',
      currentLessonAvailable:true,
      courseComplete:false
    });
    expect(plan).toBeNull();
  });

  it('does not invent a future lesson reminder after course completion',()=>{
    const plan=nextReminderPlan({
      now:new Date(2026,8,29,18,0,0),
      preferences,
      set,
      progress:emptyCourseProgress(),
      words:emptyWordsProgress(),
      lexicon,
      locale:'ru',
      currentLessonAvailable:false,
      courseComplete:true
    });
    expect(plan).toBeNull();
  });
});
