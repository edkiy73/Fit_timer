// The 40-day course read as one move abroad: nine stages ("districts" on the route map).
// Boundaries follow the course's own review days (6, 10, 15, 19, 23, 27, 31, 35) — see
// docs/unmute-design-plan.md §4.2. Days outside the table simply have no stage.
// Stages belong to the main course only; shorter courses (A1…) show their days without them.
import { DEFAULT_COURSE_ID } from './settings-data';

export interface CourseStage {
  id: string;
  number: number;
  fromDay: number;
  toDay: number;
}

export const COURSE_STAGES: readonly CourseStage[] = [
  {id:'start', number:1, fromDay:1, toDay:6},
  {id:'yesterday', number:2, fromDay:7, toDay:10},
  {id:'plans', number:3, fromDay:11, toDay:15},
  {id:'polite', number:4, fromDay:16, toDay:19},
  {id:'fluency', number:5, fromDay:20, toDay:23},
  {id:'daily', number:6, fromDay:24, toDay:27},
  {id:'home', number:7, fromDay:28, toDay:31},
  {id:'stories', number:8, fromDay:32, toDay:35},
  {id:'finish', number:9, fromDay:36, toDay:40}
];

export function courseStages(setId: string = DEFAULT_COURSE_ID): readonly CourseStage[] {
  return setId === DEFAULT_COURSE_ID ? COURSE_STAGES : [];
}

export function stageForDay(day: number | null | undefined, setId: string = DEFAULT_COURSE_ID): CourseStage | null {
  if(!day) return null;
  return courseStages(setId).find(stage => day >= stage.fromDay && day <= stage.toDay) ?? null;
}

/** i18n key of a stage name, e.g. `stage.yesterday`. */
export const stageNameKey = (stage: CourseStage) => 'stage.' + stage.id;
