/* POST /api/billing — provider-neutral AppBase purchases. Real provider keys live in
   Admin → «Способы оплаты»; the local test provider only exists on the memory store. */
require('../lib/product');
const { createBillingHandler, createDefaultBillingAdapters } = require('../../../packages/core/server/billing');

module.exports = createBillingHandler({adapters:createDefaultBillingAdapters()});
