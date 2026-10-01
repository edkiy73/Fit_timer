/* POST /api/billing — purchases.
   «instant»: until a payment provider is connected, the pay button grants the purchase at
   once; Admin → «Оплата» switches it off when real payments start. The test provider works
   only on the memory store (local runs, tests), never in production. */
require('../lib/product');
const { createBillingHandler, createInstantBillingAdapter, createTestBillingAdapter } = require('../../../packages/core/server/billing');
const { getSettings } = require('../../../packages/core/server/ai');

const instantEnabled = async () => {
  const settings = await getSettings();
  return !!(settings && settings.payment && settings.payment.instant);
};

module.exports = createBillingHandler({adapters:[createInstantBillingAdapter({isEnabled:instantEnabled}), createTestBillingAdapter()]});
