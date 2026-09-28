import { createBillingClient } from '@appbase/core/billing.js';
import { authClient } from './auth';

/* Purchases: SKUs are declared in config/product.json → products; providers are added in
   api/billing.js. What a SKU unlocks is checked with hasEntitlement(session, sku). */
export const billingClient = createBillingClient({auth:authClient, endpoint:'/api/billing'});
