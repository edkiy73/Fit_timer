/* POST /api/billing — purchases. Add real provider adapters here; the test provider works
   only on the memory store (local runs, tests), never in production. */
require('../lib/product');
const { createBillingHandler, createTestBillingAdapter } = require('../../../packages/core/server/billing');

module.exports = createBillingHandler({adapters:[createTestBillingAdapter()]});
