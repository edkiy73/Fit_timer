// @ts-check
import { robokassa } from './robokassa.mjs';

/** The payment providers that have their keys in the environment. Add a provider: write its adapter beside robokassa.mjs
 * (the shape is `PaymentProvider` in server/commands/premium.mjs) and list it here. @param {Record<string, string | undefined>} env */
export function providersFromEnv(env) {
  return [robokassa(env)].filter(/** @returns {p is NonNullable<ReturnType<typeof robokassa>>} */ p => !!p);
}
