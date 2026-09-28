import { z } from 'zod';
import { createProfileDraft } from '@appbase/core/identity.js';
import { createRegistry } from '@appbase/core/sync.js';

export const TITLE_MAX = 120;

// Runtime schema at the storage boundary: anything read back from disk is untrusted.
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(TITLE_MAX),
  done: z.boolean()
});

export type Task = z.infer<typeof TaskSchema>;

export type TaskFilter = 'all' | 'active' | 'done';

export const taskDocuments = createRegistry([
  {scope:'profile', prefix:'task:', free:true, allowDeleted:true}
]);

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
