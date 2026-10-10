require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');

module.exports = createAdminHandler({analyticsStats});
