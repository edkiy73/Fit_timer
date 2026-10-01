// The 40-day course read as one move abroad: nine stages ("districts" on the route map).
// Boundaries follow the course's own review days (6, 10, 15, 19, 23, 27, 31, 35) — see
// docs/unmute-design-plan.md §4.2. Days outside the table simply have no stage.
// The 12-day A1 course has three stages of four days. A course without a table shows «Все дни».
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

export const A1_STAGES: readonly CourseStage[] = [
  {id:'a1-first', number:1, fromDay:1, toDay:4},
  {id:'a1-me', number:2, fromDay:5, toDay:8},
  {id:'a1-out', number:3, fromDay:9, toDay:12}
];

const STAGES_BY_COURSE: Record<string, readonly CourseStage[]> = {
  [DEFAULT_COURSE_ID]: COURSE_STAGES,
  'a1-starter': A1_STAGES
};

export function courseStages(setId: string = DEFAULT_COURSE_ID): readonly CourseStage[] {
  return STAGES_BY_COURSE[setId] ?? [];
}

export function stageForDay(day: number | null | undefined, setId: string = DEFAULT_COURSE_ID): CourseStage | null {
  if(!day) return null;
  return courseStages(setId).find(stage => day >= stage.fromDay && day <= stage.toDay) ?? null;
}

/** i18n key of a stage name, e.g. `stage.yesterday`. */
export const stageNameKey = (stage: CourseStage) => 'stage.' + stage.id;
