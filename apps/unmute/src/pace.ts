import type { LearnerCourseState } from './course-loader';
import type { RoadmapNode } from './content/schema';
import { activitySaveClock } from './activity-progress';

/* Pace of a bought course (launch plan, decision 4): after three course days finished in one
   calendar day, opening a fourth suggests stopping for today. The free days have no limit. */

export const PACE_DAYS_PER_DAY = 3;

function dayOf(at: string | undefined): number | null {
  if(!at) return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : activitySaveClock(date).dayNumber;
}

/** The moment a finished day was finished: its latest saved step (theory, task, practice, manual mark). */
function finishedOn(state: LearnerCourseState, node: RoadmapNode): number | null {
  const {progress} = state;
  let latest: string | undefined;
  const take = (at: string | undefined) => { if(at && (!latest || at > latest)) latest = at; };
  for(const id of node.activityIds){
    const seen = progress.seen[id];
    if(seen && !seen.deleted) take(seen.at);
    for(const mode of ['drill', 'listening', 'speaking'] as const){
      const record = progress.practice[mode][id];
      if(record && !record.deleted) take(record.at);
    }
  }
  const manual = progress.manualNodes[node.id];
  if(manual && !manual.deleted) take(manual.at);
  return dayOf(latest);
}

/** Course days finished today. */
export function daysFinishedToday(state: LearnerCourseState, todayDay = activitySaveClock().dayNumber): number {
  return state.roadmapProgress.nodes
    .filter(item => item.complete && !item.node.optional && item.node.dayIndex !== undefined)
    .filter(item => finishedOn(state, item.node) === todayDay)
    .length;
}

/** Show the «enough for today» window before opening `node`? */
export function shouldSuggestPause(state: LearnerCourseState, node: RoadmapNode, todayDay = activitySaveClock().dayNumber): boolean {
  if(state.set.access.mode !== 'entitlement' || state.access !== 'full') return false;
  const freeDays = state.set.access.freePreview?.days ?? 0;
  if(node.dayIndex === undefined || node.dayIndex <= freeDays) return false;
  const item = state.roadmapProgress.nodes.find(entry => entry.node.id === node.id);
  if(!item || item.complete) return false;
  return daysFinishedToday(state, todayDay) >= PACE_DAYS_PER_DAY;
}

const ACK_PREFIX = 'unmute.pace-ack:';

/** «Всё равно продолжить» is remembered for the rest of the calendar day. */
export function paceAcknowledged(todayDay = activitySaveClock().dayNumber): boolean {
  try{ return globalThis.localStorage?.getItem(ACK_PREFIX + todayDay) === '1'; }catch{ return false; }
}

export function acknowledgePace(todayDay = activitySaveClock().dayNumber): void {
  try{ globalThis.localStorage?.setItem(ACK_PREFIX + todayDay, '1'); }catch{}
}
