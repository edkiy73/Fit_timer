import { describe, expect, it, vi } from 'vitest';

vi.mock('./sync',()=>({appDocs:{subscribe:()=>()=>{}},readCourseProgress:vi.fn()}));
vi.mock('./content/client',()=>({loadSet:vi.fn()}));
vi.mock('./active-course',()=>({useCatalog:()=>({data:null,isPending:false})}));

import type { CourseSet } from './content/schema';
import type { LearnerCourseState } from './course-loader';
import { emptyCourseProgress } from './progress';
import { hasReviewProgress } from './other-course-review';
import { reviewDueCounts } from './review-count';

function set(id:string,cardId:string):CourseSet{
  return {schemaVersion:1,id,revision:1,slug:id,title:{ru:id},level:{labels:[]},access:{mode:'free'},defaultRoadmapId:'main',
    roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[]}],
    activities:[{id:cardId,revision:1,type:'text-input',tags:[],revisionProgress:'preserve',lexiconRefs:[],prompt:{ru:'?'},answer:{accepted:['a'],nearMiss:true,caseSensitive:false}}],
    resources:[]} as CourseSet;
}

describe('review across courses',()=>{
  it('counts due items of other studied courses on Today and the tab badge',()=>{
    const active=emptyCourseProgress();
    const other=emptyCourseProgress();
    other.cards['a1.card']={box:1,due:9,at:'2026-09-28T00:00:00Z'};
    const state={set:set('general-foundation','card.one'),progress:active} as unknown as LearnerCourseState;
    expect(reviewDueCounts(state,null,'ru',10)?.actionableCount).toBe(0);
    expect(reviewDueCounts(state,null,'ru',10,[{set:set('a1-starter','a1.card'),progress:other}])?.actionableCount).toBe(1);
  });

  it('only loads courses the learner has actually practised',()=>{
    const fresh=emptyCourseProgress();
    expect(hasReviewProgress(fresh)).toBe(false);
    fresh.practice.drill['p']={box:1,due:1,at:'2026-09-28T00:00:00Z'};
    expect(hasReviewProgress(fresh)).toBe(true);
    const removed=emptyCourseProgress();
    removed.cards['c']={box:1,due:1,at:'2026-09-28T00:00:00Z',deleted:true};
    expect(hasReviewProgress(removed)).toBe(false);
  });
});
