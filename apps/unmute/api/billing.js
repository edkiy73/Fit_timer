/* POST /api/billing — provider-neutral AppBase purchases.
   «instant» stays as the temporary no-money path until Admin switches it off.
   Stripe / YooKassa are composed by Core and become available only when configured. */
require('../lib/product');
const { createBillingHandler, createDefaultBillingAdapters } = require('../../../packages/core/server/billing');
const { getSettings } = require('../../../packages/core/server/ai');

const instantEnabled = async () => {
  const settings = await getSettings();
  return !!(settings && settings.payment && settings.payment.instant);
};

module.exports = createBillingHandler({
  adapters:createDefaultBillingAdapters({instantEnabled})
});
