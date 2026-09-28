import { createSyncClient } from '@appbase/core/sync-client.js';
import { authClient } from './auth';

export const syncClient = createSyncClient({
  endpoint:'/api/sync',
  auth:authClient
});
