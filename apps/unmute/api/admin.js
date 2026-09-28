require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const { createContentAdminHandler } = require('../lib/content-admin');

module.exports = createAdminHandler({analyticsStats, handlers:[createContentAdminHandler()]});
