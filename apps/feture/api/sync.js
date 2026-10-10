require('../lib/product');
const { createSyncHandler } = require('../../../packages/core/server/sync-core');
const { ACCOUNT_PROFILE, registry } = require('../lib/app-sync-schema');
module.exports = createSyncHandler({registry, accountProfile:ACCOUNT_PROFILE});
