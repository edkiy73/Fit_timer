require('../lib/product');
const { createAuthHandler } = require('../../../packages/core/server/auth-core');
const analytics = require('../lib/app-analytics');
module.exports = createAuthHandler({analytics});
