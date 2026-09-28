import { createStorage, type StorageCore } from '@appbase/core/storage.js';
import { createSyncClient } from '@appbase/core/sync-client.js';
import { createDocumentSync, type DocumentSync } from '@appbase/core/document-sync.js';
import {
  TaskSchema, TASKS_DOC, mergeTaskDocuments, parseTaskRecords, recordsFromTasks,
  serializeTaskRecords, taskDocuments, tasksFromRecords, type Task
} from '../domain';
import { taskAuth } from '../auth';

// Key of the first Task Mini builds (plain local list); read once and moved into the synced document.
const LEGACY_TASKS_KEY = 'tasks';
const MIRROR_KEY = 'sync.mirror';

let storage: StorageCore | null = null;
function store(): StorageCore {
  storage ??= createStorage({dbName:'taskmini/kv', storeName:'kv'});
  return storage;
}

let docs: DocumentSync | null = null;
/** Local-first task document: works signed out, syncs through Core when signed in. */
export function taskDocs(): DocumentSync {
  docs ??= createDocumentSync({
    client: createSyncClient({auth: taskAuth}),
    owner: async () => (await taskAuth.getSession())?.email || null,
    storage: store(),
    storageKey: MIRROR_KEY,
    accepts: ref => taskDocuments.accepts('account', ref.key),
    merge: ({local, remote}) => mergeTaskDocuments(local, remote)
  });
  return docs;
}

let migrated: Promise<void> | null = null;
function migrateLegacy(): Promise<void> {
  migrated ??= (async () => {
    const legacy = await store().get(LEGACY_TASKS_KEY);
    if(!legacy) return;
    if(!(await taskDocs().read(TASKS_DOC))){
      let parsed: unknown = [];
      try{ parsed = JSON.parse(legacy); }catch{}
      const tasks = Array.isArray(parsed) ? parsed.flatMap(item => {
        const result = TaskSchema.safeParse(item);
        return result.success ? [result.data] : [];
      }) : [];
      await taskDocs().write(TASKS_DOC, serializeTaskRecords(recordsFromTasks({}, tasks)));
    }
    await store().delete(LEGACY_TASKS_KEY);
  })();
  return migrated;
}

/** Reads tasks; malformed storage or invalid items are dropped instead of crashing the app. */
export async function loadTasks(): Promise<Task[]> {
  await migrateLegacy();
  return tasksFromRecords(parseTaskRecords(await taskDocs().read(TASKS_DOC)));
}

export async function saveTasks(tasks: readonly Task[]): Promise<void> {
  await migrateLegacy();
  const previous = parseTaskRecords(await taskDocs().read(TASKS_DOC));
  // Core falls back from IndexedDB to localStorage; a rejected write surfaces as an error here.
  await taskDocs().write(TASKS_DOC, serializeTaskRecords(recordsFromTasks(previous, tasks)));
}
