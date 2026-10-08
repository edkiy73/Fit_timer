require('../lib/product');
const { createBillingHandler, createDefaultBillingAdapters } = require('../../../packages/core/server/billing');

module.exports = createBillingHandler({adapters:createDefaultBillingAdapters()});
