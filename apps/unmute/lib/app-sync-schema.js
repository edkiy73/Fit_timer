'use strict';
const { createSyncRegistry } = require('../../../packages/core/server/sync-registry');

const ACCOUNT_PROFILE = '__account__';

module.exports = {
  ACCOUNT_PROFILE,
  registry: createSyncRegistry([
    {scope:'account', key:'settings', free:true},
    {scope:'account', prefix:'progress:course:', free:true},
    {scope:'account', prefix:'progress:stats:', free:true},
    {scope:'account', key:'progress:words', free:true}
  ])
};
