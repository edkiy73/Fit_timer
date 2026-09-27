'use strict';
const { createSyncRegistry } = require('../../../packages/core/server/sync-registry');

const ACCOUNT_PROFILE = '__account__';

module.exports = {
  ACCOUNT_PROFILE,
  registry: createSyncRegistry([
    {scope:'account', key:'notificationPrefs', free:true},
    {scope:'profile', prefix:'task:', free:true, allowDeleted:true}
  ])
};
