import { describe, expect, it, vi } from 'vitest';
import { createStorage } from '@appbase/core/storage.js';

describe('repository migration', () => {
  it('moves the task list of earlier builds into the synced document once', async () => {
    vi.resetModules();
    const legacy = createStorage({dbName:'taskmini/kv', storeName:'kv'});
    await legacy.set('tasks', JSON.stringify([
      {id:'1', title:'Старая задача', done:true},
      {id:2, title:null}
    ]));
    const {loadTasks, taskDocs} = await import('./tasks/repository');
    expect(await loadTasks()).toEqual([{id:'1', title:'Старая задача', done:true}]);
    expect(await legacy.get('tasks')).toBeNull();
    // Written as a local change: it goes to the account at the first sync after sign-in.
    expect(await taskDocs().pending()).toBe(true);
  });
});
