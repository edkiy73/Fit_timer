import { createSyncClient } from '@appbase/core/sync-client.js';
import { createDocumentSync, startAutoSync, type AutoSync, type DocumentSync } from '@appbase/core/document-sync.js';
import { createStorage } from '@appbase/core/storage.js';
import { authClient } from './auth';

/* Local-first data: documents are written on the device first and sync to the account
   after sign-in. Every synced key must be registered in lib/app-sync-schema.js; data that
   must sync without a subscription is an account document with free:true. */

export const SETTINGS_DOC = 'settings';

export const syncClient = createSyncClient({endpoint:'/api/sync', auth:authClient});

export const appDocs: DocumentSync = createDocumentSync({
  client: syncClient,
  owner: async () => (await authClient.getSession())?.email || null,
  storage: createStorage({dbName:'unmute/kv', storeName:'kv'}),
  storageKey: 'sync.mirror',
  // Settings are small: the newer whole document wins. Collections use mergeRecordMaps().
  merge: ({local}) => local
});

let auto: AutoSync | null = null;

/** Called once by main.tsx: sync after changes, on reconnect and when the app is shown again. */
export function startAppSync(): void {
  if(auto) return;
  auto = startAutoSync(appDocs);
  void auto.now();
}

/** After sign-in: merge local data into the account right away. */
export function syncNow(): void {
  void auto?.now();
}
