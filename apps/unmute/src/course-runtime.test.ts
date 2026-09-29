import { describe, expect, it } from 'vitest';
import { emptyCourseProgress } from './progress';
import { learnedActivityIdsFromProgress } from './course-runtime';

describe('learned activity retention',()=>{
  it('keeps only live activity ids that can matter to future review',()=>{
    const progress=emptyCourseProgress();
    progress.seen['theory.one']={at:'2026-09-29T00:00:00Z'};
    progress.cards['card.one']={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    progress.cards['card.deleted']={box:1,due:1,at:'2026-09-29T00:00:00Z',deleted:true};
    progress.practice.drill['pattern.one']={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    progress.practice.listening['pattern.one']={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    progress.practice.speaking['pattern.two']={box:1,due:1,at:'2026-09-29T00:00:00Z'};

    expect(learnedActivityIdsFromProgress(progress)).toEqual([
      'card.one',
      'pattern.one',
      'pattern.two',
      'theory.one'
    ]);
  });
});
