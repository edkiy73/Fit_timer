require('../lib/product');
const { createAdminHandler } = require('../../server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');

module.exports = createAdminHandler({analyticsStats});
