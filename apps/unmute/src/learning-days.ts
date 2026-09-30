import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mergeRecordMaps, type RecordMap } from '@appbase/core/document-sync.js';
import type { CourseProgressDocument, TimedFlag } from './progress';
import { appDocs, readCourseProgress } from './sync';
import { useCatalog } from './active-course';
import { DEFAULT_COURSE_ID } from './settings-data';

const QUERY_KEY = 'all-learning-days';

/** Days with practice in any course. Each course keeps its own progress document;
 *  the streak and the activity calendar belong to the learner, not to one course. */
export function mergeLearningDays(docs: Array<RecordMap<TimedFlag>>): RecordMap<TimedFlag> {
  return docs.reduce<RecordMap<TimedFlag>>((all, days) => mergeRecordMaps(all, days), {});
}

/** The active course's progress with learning days from every course. */
export function withAllLearningDays(progress: CourseProgressDocument, days: RecordMap<TimedFlag> | null): CourseProgressDocument {
  return days ? {...progress, learningDays:mergeLearningDays([days, progress.learningDays])} : progress;
}

export function useAllLearningDays(): RecordMap<TimedFlag> | null {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const ids = useMemo(() => {
    const listed = (catalog.data?.sets ?? []).map(set => set.id);
    return [...new Set([DEFAULT_COURSE_ID, ...listed])].sort();
  }, [catalog.data]);
  const query = useQuery({
    queryKey:[QUERY_KEY, ids.join(',')],
    queryFn:async () => mergeLearningDays((await Promise.all(ids.map(readCourseProgress))).map(doc => doc.learningDays)),
    staleTime:Infinity
  });
  useEffect(() => appDocs.subscribe(change => {
    if(change.keys.some(ref => ref.key.startsWith('progress:course:'))){
      void queryClient.invalidateQueries({queryKey:[QUERY_KEY]});
    }
  }), [queryClient]);
  return query.data ?? null;
}
