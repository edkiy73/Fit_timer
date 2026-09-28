import { loadSet } from './content/client';
import type { CourseSet, Roadmap, RoadmapNode } from './content/schema';
import { buildRoadmapProgress, type RoadmapProgressSummary } from './engine/course-progress';
import type { CourseProgressDocument } from './progress';
import { roadmapProgressFromDocument } from './progress-actions';
import { readCourseProgress } from './sync';

export interface LearnerCourseState {
  set: CourseSet;
  roadmap: Roadmap;
  progress: CourseProgressDocument;
  roadmapProgress: RoadmapProgressSummary;
  currentNode: RoadmapNode | null;
  currentDayIndex: number | null;
  access: 'full' | 'preview';
  fromCache: boolean;
}

interface LoadedSet {
  set: CourseSet;
  access: 'full' | 'preview';
  fromCache: boolean;
}

function defaultRoadmap(set:CourseSet):Roadmap{
  const roadmap=set.roadmaps.find(item=>item.id===set.defaultRoadmapId);
  if(!roadmap) throw new Error('default_roadmap_not_found');
  return roadmap;
}

export function buildLearnerCourseState(
  loaded:LoadedSet,
  progress:CourseProgressDocument
):LearnerCourseState{
  const roadmap=defaultRoadmap(loaded.set);
  const roadmapProgress=buildRoadmapProgress(
    roadmap,
    roadmapProgressFromDocument(progress)
  );

  return {
    set:loaded.set,
    roadmap,
    progress,
    roadmapProgress,
    currentNode:roadmapProgress.currentNode,
    currentDayIndex:roadmapProgress.currentDayIndex,
    access:loaded.access,
    fromCache:loaded.fromCache,
  };
}

/**
 * Loads the published set through the content client (network first, cached snapshot offline),
 * then reads the local-first progress mirror and resolves the learner's current roadmap node.
 */
export async function loadLearnerCourse(id:string):Promise<LearnerCourseState>{
  const loaded=await loadSet(id);
  // Progress is keyed by the canonical set id from the published snapshot, not by a slug/alias
  // supplied by the caller.
  const progress=await readCourseProgress(loaded.set.id);
  return buildLearnerCourseState(loaded,progress);
}
