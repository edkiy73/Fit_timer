import { createSyncClient } from '@appbase/core/sync-client.js';
import { createDocumentSync, startAutoSync, type AutoSync, type DocumentSync } from '@appbase/core/document-sync.js';
import { createStorage } from '@appbase/core/storage.js';
import { authClient } from './auth';
import { apiUrl } from './api-url';

/* Local-first data: documents are written on the device first and sync to the account
   after sign-in. Every synced key must be registered in lib/app-sync-schema.js; data that
   must sync without a subscription is an account document with free:true. */

export const SETTINGS_DOC = 'settings';

export const syncClient = createSyncClient({endpoint:apiUrl('/api/sync'), auth:authClient});

const settingsStorage=createStorage({dbName:'feture/kv',storeName:'kv'});
export const appDocs: DocumentSync = createDocumentSync({
  client: syncClient,
  owner: async () => (await authClient.getSession())?.email || null,
  storage: settingsStorage,
  storageKey: 'settings.mirror',
  accepts: ref=>ref.key===SETTINGS_DOC&&ref.profileId==='__account__',
  // The domain interest map never enters Core document sync.
  merge: ({local}) => local
});

let auto: AutoSync | null = null;

/** Called once by main.tsx: sync after changes, on reconnect and when the app is shown again. */
export function startAppSync(): void {
  if(auto) return;
  auto = startAutoSync(appDocs);
  // Discard the pre-launch prototype mirror, including its former private interest document.
  void settingsStorage.delete('sync.mirror').then(()=>auto?.now());
}

/** After sign-in: merge local data into the account right away. */
export function syncNow(): void {
  void auto?.now();
}
