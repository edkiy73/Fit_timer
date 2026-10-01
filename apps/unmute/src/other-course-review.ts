import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CourseSet } from './content/schema';
import { loadSet } from './content/client';
import type { CourseProgressDocument } from './progress';
import { appDocs, readCourseProgress } from './sync';
import { useCatalog } from './active-course';
import { DEFAULT_COURSE_ID } from './settings-data';

export interface OtherCourseReview {
  set:CourseSet;
  progress:CourseProgressDocument;
}

export interface OtherCourseReviews {
  status:'pending'|'ready';
  courses:OtherCourseReview[];
  /** Studied courses that could not load now: their reviews are missing, not done. */
  failed?:number;
}

const QUERY_KEY='other-course-reviews';

const live=(records:Record<string,{deleted?:boolean}|undefined>)=>
  Object.values(records).some(record=>Boolean(record&&!record.deleted));

/** Something to review in this course: graded cards or practised patterns. */
export function hasReviewProgress(progress:CourseProgressDocument):boolean{
  return live(progress.cards)||live(progress.practice.drill)||live(progress.practice.listening)||live(progress.practice.speaking);
}

/** Courses other than the active one that the learner has studied: switching courses must
 *  not drop what is already due for review. A course that cannot load is skipped and counted. */
export function useOtherCourseReviews(activeSetId:string):OtherCourseReviews{
  const queryClient=useQueryClient();
  const catalog=useCatalog();
  const ids=[...new Set([DEFAULT_COURSE_ID,...(catalog.data?.sets??[]).map(set=>set.id)])]
    .filter(id=>id&&id!==activeSetId)
    .sort();
  const query=useQuery({
    queryKey:[QUERY_KEY,activeSetId,ids.join(',')],
    enabled:Boolean(activeSetId)&&!catalog.isPending,
    staleTime:Infinity,
    queryFn:async()=>{
      const courses:OtherCourseReview[]=[];
      let failed=0;
      for(const id of ids){
        try{
          const progress=await readCourseProgress(id);
          if(!hasReviewProgress(progress))continue;
          const {set}=await loadSet(id);
          courses.push({set,progress});
        }catch{
          failed++;
        }
      }
      return {courses,failed};
    }
  });
  useEffect(()=>appDocs.subscribe(change=>{
    if(change.keys.some(ref=>ref.key.startsWith('progress:course:'))){
      void queryClient.invalidateQueries({queryKey:[QUERY_KEY]});
    }
  }),[queryClient]);
  if(!activeSetId)return {status:'pending',courses:[]};
  if(catalog.isPending||query.isPending)return {status:'pending',courses:[]};
  return {status:'ready',courses:query.data?.courses??[],failed:query.data?.failed??0};
}
