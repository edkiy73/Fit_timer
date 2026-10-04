import { describe, expect, it } from 'vitest';
import type { LearnerCourseState } from './course-loader';
import { roadmapRewardNode, type CourseMapRewardSnapshot } from './course-map';

function state({
  completedCount,
  currentNodeId,
  completedIds
}:{
  completedCount:number;
  currentNodeId:string|null;
  completedIds:string[];
}):LearnerCourseState{
  const nodes=['day-1','day-2','day-3'].map((id,index)=>({
    node:{
      id,
      kind:'lesson' as const,
      title:{ru:'День '+(index+1)},
      dayIndex:index+1,
      order:index,
      prerequisites:[],
      activityIds:['a'+index],
      optional:false
    },
    complete:completedIds.includes(id),
    unlocked:true
  }));
  return {
    set:{id:'course'} as LearnerCourseState['set'],
    roadmapProgress:{
      nodes,
      completedCount,
      requiredCount:3,
      courseComplete:completedCount===3,
      currentNode:currentNodeId?nodes.find(item=>item.node.id===currentNodeId)?.node??null:null
    },
    currentNode:currentNodeId?nodes.find(item=>item.node.id===currentNodeId)?.node??null:null
  } as unknown as LearnerCourseState;
}

describe('roadmap reward motion target',()=>{
  it('rewards the newly opened current day after progress increases',()=>{
    const previous:CourseMapRewardSnapshot={completedCount:1,currentNodeId:'day-2'};
    expect(roadmapRewardNode(previous,state({
      completedCount:2,
      currentNodeId:'day-3',
      completedIds:['day-1','day-2']
    }))).toBe('day-3');
  });

  it('rewards the last completed station when the course finishes',()=>{
    const previous:CourseMapRewardSnapshot={completedCount:2,currentNodeId:'day-3'};
    expect(roadmapRewardNode(previous,state({
      completedCount:3,
      currentNodeId:null,
      completedIds:['day-1','day-2','day-3']
    }))).toBe('day-3');
  });

  it('does not reward when progress did not increase',()=>{
    const previous:CourseMapRewardSnapshot={completedCount:2,currentNodeId:'day-3'};
    expect(roadmapRewardNode(previous,state({
      completedCount:2,
      currentNodeId:'day-3',
      completedIds:['day-1','day-2']
    }))).toBeNull();
  });
});
