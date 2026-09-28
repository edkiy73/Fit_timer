'use strict';
const { createSyncRegistry } = require('../../../packages/core/server/sync-registry');

const ACCOUNT_PROFILE = '__account__';

/* Task Mini syncs one account document with all tasks (see src/domain.ts). It is free:
   the account and syncing personal data do not need a subscription. Profile-scope
   documents always require Premium on the server, so free product data lives in the
   account scope. */
module.exports = {
  ACCOUNT_PROFILE,
  registry: createSyncRegistry([
    {scope:'account', key:'notificationPrefs', free:true},
    {scope:'account', key:'tasks', free:true}
  ])
};
