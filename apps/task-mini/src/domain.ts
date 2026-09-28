import { z } from 'zod';
import { createProfileDraft } from '@appbase/core/identity.js';
import { createRegistry } from '@appbase/core/sync.js';
import { mergeRecordMaps, type RecordMap } from '@appbase/core/document-sync.js';

export const TITLE_MAX = 120;

// Runtime schema at the storage boundary: anything read back from disk is untrusted.
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(TITLE_MAX),
  done: z.boolean()
});

export type Task = z.infer<typeof TaskSchema>;

export type TaskFilter = 'all' | 'active' | 'done';

/* Synced form: one account document with every task as a record. `at` is the time of the
   record's last change, removed tasks stay as tombstones, so two devices merge per task. */
export const TASKS_DOC = 'tasks';

const TaskRecordSchema = z.union([
  TaskSchema.extend({at: z.string(), created: z.string(), deleted: z.literal(false).optional()}),
  z.object({at: z.string(), deleted: z.literal(true)})
]);
type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type TaskRecords = RecordMap<TaskRecord>;

// Free account document: syncing tasks does not need a subscription (see lib/app-sync-schema.js).
export const taskDocuments = createRegistry([
  {scope:'account', key:TASKS_DOC, free:true}
]);

export function parseTaskRecords(raw: string | null): TaskRecords {
  if(!raw) return {};
  let parsed: unknown;
  try{ parsed = JSON.parse(raw); }catch{ return {}; }
  const items = parsed && typeof parsed === 'object' ? (parsed as {items?: unknown}).items : null;
  if(!items || typeof items !== 'object') return {};
  const out: TaskRecords = {};
  for(const [id, value] of Object.entries(items)){
    const result = TaskRecordSchema.safeParse(value);
    if(result.success && (result.data.deleted || result.data.id === id)) out[id] = result.data;
  }
  return out;
}

export function serializeTaskRecords(records: TaskRecords): string {
  return JSON.stringify({v:1, items:records});
}

/** Visible tasks, newest first. */
export function tasksFromRecords(records: TaskRecords): Task[] {
  return Object.values(records)
    .flatMap(record => record.deleted ? [] : [record])
    .sort((a, b) => b.created.localeCompare(a.created))
    .map(({id, title, done}) => ({id, title, done}));
}

/** Next records after the UI replaced the list: changed tasks get a new time, missing ones a tombstone. */
export function recordsFromTasks(previous: TaskRecords, tasks: readonly Task[], now = new Date().toISOString()): TaskRecords {
  const next: TaskRecords = {};
  for(const [id, record] of Object.entries(previous)) if(record.deleted) next[id] = record;
  const seen = new Set<string>();
  tasks.forEach((task, index) => {
    const valid = TaskSchema.safeParse(task);
    if(!valid.success || seen.has(valid.data.id)) return;
    seen.add(valid.data.id);
    const prev = previous[valid.data.id];
    const same = prev && !prev.deleted && prev.title === valid.data.title && prev.done === valid.data.done;
    next[valid.data.id] = same ? prev : {
      ...valid.data,
      at: now,
      // New tasks are added at the top: keep list order stable for tasks created in one batch.
      created: prev && !prev.deleted ? prev.created : new Date(Date.parse(now) - index).toISOString()
    };
  });
  for(const [id, record] of Object.entries(previous)){
    if(!record.deleted && !seen.has(id)) next[id] = {at: now, deleted: true};
  }
  return next;
}

export function mergeTaskDocuments(local: string | null, remote: string | null): string {
  return serializeTaskRecords(mergeRecordMaps(parseTaskRecords(local), parseTaskRecords(remote)));
}

export function createTask(title: string, id: string = crypto.randomUUID()): Task {
  return TaskSchema.parse({id, title, done:false});
}

export function filterTasks(tasks: readonly Task[], filter: TaskFilter): Task[] {
  if(filter === 'active') return tasks.filter(task => !task.done);
  if(filter === 'done') return tasks.filter(task => task.done);
  return [...tasks];
}

export function createDefaultProfile(){
  return createProfileDraft('My tasks');
}
