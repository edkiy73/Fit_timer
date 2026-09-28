import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSet } from './content/client';
import type { CourseSet } from './content/schema';
import { emptyCourseProgress } from './progress';
import { readCourseProgress } from './sync';
import { buildLearnerCourseState, loadLearnerCourse } from './course-loader';

vi.mock('./content/client',()=>({loadSet:vi.fn()}));
vi.mock('./sync',()=>({readCourseProgress:vi.fn()}));

const course:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:7,
  slug:'general-foundation',
  title:{ru:'Основной курс'},
  level:{from:'a1',to:'b1',labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Основной путь'},
    nodes:[
      {
        id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,
        prerequisites:[],activityIds:['card.one'],optional:false
      },
      {
        id:'day-2',kind:'lesson',title:{ru:'День 2'},dayIndex:2,order:1,
        prerequisites:['day-1'],activityIds:['card.two'],optional:false
      }
    ]
  }],
  activities:[
    {
      id:'card.one',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'Один'},answer:{accepted:['one'],nearMiss:true,caseSensitive:false}
    },
    {
      id:'card.two',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'Два'},answer:{accepted:['two'],nearMiss:true,caseSensitive:false}
    }
  ],
  resources:[]
};

describe('learner course loader',()=>{
  beforeEach(()=>vi.clearAllMocks());

  it('combines a published set with local progress and resolves the first current node',()=>{
    const state=buildLearnerCourseState(
      {set:course,access:'preview',fromCache:true},
      emptyCourseProgress()
    );

    expect(state.roadmap.id).toBe('main');
    expect(state.currentNode?.id).toBe('day-1');
    expect(state.currentDayIndex).toBe(1);
    expect(state.access).toBe('preview');
    expect(state.fromCache).toBe(true);
  });

  it('continues from the saved learner progress',()=>{
    const progress=emptyCourseProgress();
    progress.seen['card.one']={at:'2026-09-29T00:00:00.000Z'};

    const state=buildLearnerCourseState(
      {set:course,access:'full',fromCache:false},
      progress
    );

    expect(state.roadmapProgress.nodes.find(item=>item.node.id==='day-1')?.complete).toBe(true);
    expect(state.currentNode?.id).toBe('day-2');
    expect(state.currentDayIndex).toBe(2);
  });

  it('reads progress by the canonical id returned by the published set',async()=>{
    vi.mocked(loadSet).mockResolvedValue({set:course,access:'full',fromCache:false});
    vi.mocked(readCourseProgress).mockResolvedValue(emptyCourseProgress());

    const state=await loadLearnerCourse('GENERAL-FOUNDATION');

    expect(loadSet).toHaveBeenCalledWith('GENERAL-FOUNDATION');
    expect(readCourseProgress).toHaveBeenCalledWith('general-foundation');
    expect(state.currentNode?.id).toBe('day-1');
  });
});
