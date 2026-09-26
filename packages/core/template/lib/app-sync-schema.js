'use strict';
/* Product sync documents. Register each document key/prefix the product syncs. */
const { createSyncRegistry } = require('../../server/sync-registry');

const ACCOUNT_PROFILE = '__account__';

module.exports = {
  ACCOUNT_PROFILE,
  registry: createSyncRegistry([
    // Notification opt-out must work without a subscription.
    {scope:'account', key:'notificationPrefs', free:true}
  ])
};
