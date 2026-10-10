import {
  createBillingClient,
  type BillingContext,
  type StoreRestoreItem
} from '@appbase/core/billing.js';
import { authClient } from './auth';
import { apiUrl } from './api-url';

/* Purchases: SKUs are declared in config/product.json → products; providers are composed in
   api/billing.js. Product UI stays provider-neutral and asks Core which methods are legal. */
export const billingClient = createBillingClient({auth:authClient, endpoint:apiUrl('/api/billing')});

export const paymentMethods = (context?: BillingContext) =>
  billingClient.methods(context);

export const startCheckout = (provider: string, sku: string, context?: BillingContext) =>
  billingClient.checkout(provider, sku, context);

export const prepareNativePurchase = (provider: string, sku: string, context?: BillingContext) =>
  billingClient.purchaseContext(provider, sku, context);

export const verifyNativePurchase = (
  provider: string,
  sku: string,
  proof: Record<string, unknown>,
  context?: BillingContext
) => billingClient.verifyPurchase(provider, sku, proof, context);

export const restoreNativePurchases = (
  provider: string,
  items: StoreRestoreItem[],
  context?: BillingContext
) => billingClient.restorePurchases(provider, items, context);
