/* POST /api/sync — document sync for the product registry. */
require('../lib/product');
const { createSyncHandler } = require('../../server/sync-core');
const { ACCOUNT_PROFILE, registry } = require('../lib/app-sync-schema');

module.exports = createSyncHandler({registry, accountProfile: ACCOUNT_PROFILE});
