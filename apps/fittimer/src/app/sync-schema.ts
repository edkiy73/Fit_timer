import { createRegistry } from '@appbase/core/sync.js';

export const FIT_SYNC_PROFILE_DOC_KEYS = ['stats'] as const;
export const FIT_SYNC_ACCOUNT_DOC_KEYS = ['trainer', 'clients', 'notificationPrefs'] as const;

export const FIT_SYNC_REGISTRY = createRegistry([
  {scope:'profile', key:'stats'},
  {scope:'profile', key:'index'},
  {scope:'profile', prefix:'program:', allowDeleted:true},
  {scope:'account', key:'trainer'},
  {scope:'account', key:'clients'},
  {scope:'account', key:'notificationPrefs', free:true}
]);
