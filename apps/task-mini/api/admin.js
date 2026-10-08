require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const { handleTaskAdmin } = require('../lib/task-admin');
module.exports = createAdminHandler({analyticsStats, handlers:[handleTaskAdmin]});
