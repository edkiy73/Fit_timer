require('../lib/product');
const { createBillingHandler, createTestBillingAdapter } = require('../../../packages/core/server/billing');

// Real providers are added here (phase 6); the test provider works only on the memory store.
module.exports = createBillingHandler({adapters:[createTestBillingAdapter()]});
