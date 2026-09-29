require('../lib/product');
const { createAuthHandler } = require('../../../packages/core/server/auth-core');
const analytics = require('../lib/app-analytics');
const { unmuteAccountExtension } = require('../lib/unmute-account');
module.exports = createAuthHandler({analytics, accountExtension: unmuteAccountExtension});
