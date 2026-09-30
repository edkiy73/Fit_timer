import type { Activity, CourseSet, Roadmap, RoadmapNode } from './content/schema';
import type { CourseProgressDocument } from './progress';
import { dayNumberFromKey } from './engine/course-progress';

type Localized = Record<string, string>;

export function localizedText(text: Localized | undefined, locale: string): string {
  if(!text) return '';
  return text[locale] || text.ru || text.en || Object.values(text)[0] || '';
}

function activitiesOf(set: CourseSet, node: RoadmapNode): Activity[] {
  const byId = new Map(set.activities.map(activity => [activity.id, activity]));
  return node.activityIds.map(id => byId.get(id)).filter((activity): activity is Activity => Boolean(activity));
}

const isPlanNote = (activity: Activity) => activity.type === 'theory' && activity.tags.includes('plan');

/** Topic of a day: its first theory card that is not the day's plan note ("Past Simple").
 *  Imported days are all titled "День N", so the node title is only the fallback. */
export function nodeTopic(set: CourseSet, node: RoadmapNode, locale: string): string {
  const theory = activitiesOf(set, node).find(activity => activity.type === 'theory' && !isPlanNote(activity));
  const topic = theory?.type === 'theory' ? localizedText(theory.title, locale) : '';
  return topic || localizedText(node.title, locale);
}

/** The day's speak-aloud task: the first paragraph of its plan note. */
export function nodeSpeakTask(set: CourseSet, node: RoadmapNode, locale: string): string | null {
  const note = activitiesOf(set, node).find(isPlanNote);
  if(note?.type !== 'theory') return null;
  const first = localizedText(note.body, locale).split(/\n\s*\n/)[0]?.trim() ?? '';
  return first || null;
}

// Rough timing when a card has no estimatedMinutes: reading theory is slower than a card.
const DEFAULT_MINUTES: Partial<Record<Activity['type'], number>> = {
  theory: 1.5,
  'pattern-drill': 2,
  dialogue: 3,
  'ai-conversation': 5,
  review: 3
};

export function nodeMinutes(set: CourseSet, node: RoadmapNode): number {
  const total = activitiesOf(set, node)
    .reduce((sum, activity) => sum + (activity.estimatedMinutes ?? DEFAULT_MINUTES[activity.type] ?? 0.5), 0);
  return Math.max(1, Math.round(total));
}

export function activityDone(progress: CourseProgressDocument, id: string): boolean {
  const seen = progress.seen[id];
  if(seen && !seen.deleted) return true;
  const card = progress.cards[id];
  if(card && !card.deleted) return true;
  return (['drill', 'listening', 'speaking'] as const).some(mode => {
    const item = progress.practice[mode][id];
    return Boolean(item && !item.deleted);
  });
}

export function nodeDoneCount(progress: CourseProgressDocument, node: RoadmapNode): number {
  return node.activityIds.filter(id => activityDone(progress, id)).length;
}

export interface Landmark {
  kind: 'dialogue' | 'ai' | 'review';
  title: string;
  dayIndex: number;
  inDays: number;
}

/** The next special stop after the current day: a dialogue scene, an AI talk or a review day. */
export function nextLandmark(set: CourseSet, roadmap: Roadmap, current: RoadmapNode, locale: string): Landmark | null {
  const from = current.dayIndex;
  if(!from) return null;
  const ahead = roadmap.nodes
    .filter(node => (node.dayIndex ?? 0) > from)
    .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
  for(const node of ahead){
    const dayIndex = node.dayIndex!;
    const activities = activitiesOf(set, node);
    const dialogue = activities.find(activity => activity.type === 'dialogue');
    if(dialogue?.type === 'dialogue') return {kind:'dialogue', title:localizedText(dialogue.scene, locale), dayIndex, inDays:dayIndex - from};
    const talk = activities.find(activity => activity.type === 'ai-conversation');
    if(talk?.type === 'ai-conversation') return {kind:'ai', title:localizedText(talk.topic, locale), dayIndex, inDays:dayIndex - from};
    if(node.kind === 'review') return {kind:'review', title:'', dayIndex, inDays:dayIndex - from};
  }
  return null;
}

/** Which of the last seven calendar days (oldest first, today last) had any learning. */
export function lastWeekActivity(progress: CourseProgressDocument, todayDay: number): boolean[] {
  const days = new Set<number>();
  for(const [key, value] of Object.entries(progress.learningDays)){
    if(!value || value.deleted) continue;
    try{ days.add(dayNumberFromKey(key)); }catch{}
  }
  return Array.from({length:7}, (_, index) => days.has(todayDay - 6 + index));
}
