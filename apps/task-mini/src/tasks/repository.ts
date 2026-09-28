import { createStorage, type StorageCore } from '@appbase/core/storage.js';
import { TaskSchema, type Task } from '../domain';

// Same database and key as the first Task Mini build, so existing local tasks survive.
const TASKS_KEY = 'tasks';

let storage: StorageCore | null = null;
function store(): StorageCore {
  storage ??= createStorage({dbName:'taskmini/kv', storeName:'kv'});
  return storage;
}

/** Reads tasks; malformed storage or invalid items are dropped instead of crashing the app. */
export async function loadTasks(): Promise<Task[]> {
  const raw = await store().get(TASKS_KEY);
  if(!raw) return [];
  let parsed: unknown;
  try{ parsed = JSON.parse(raw); }catch{ return []; }
  if(!Array.isArray(parsed)) return [];
  return parsed.flatMap(item => {
    const result = TaskSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

export async function saveTasks(tasks: readonly Task[]): Promise<void> {
  // Core falls back from IndexedDB to localStorage; false means neither accepted the write.
  if(!await store().set(TASKS_KEY, JSON.stringify(tasks))) throw new Error('task_mini_save_failed');
}
