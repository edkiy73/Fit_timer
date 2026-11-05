// @ts-check
/** Slice H1: Premium entitlements and the age check — by a selfie with a gesture or by an identity document (A07,
 * S2-CATALOG «H»). Store purchases and gifts come with a payment provider. */
import * as z from 'zod';
import { id, opId, queuePaging } from './platform.mjs';
import { field } from './_text.mjs';

const reason = z.string().regex(/^[a-z_]{2,32}$/);
/** How the age is proven: a selfie with a server-chosen gesture (compared with the profile photo) or a photo of an
 * identity document (staff read the birth date; nothing from it is stored). Older clients send no method: selfie. */
export const AGE_METHODS = /** @type {const} */ (['selfie', 'document']);
/** Plans (wave 8): a subscription renews; a gift is a fixed term with no renewal. Prices are shown by the client and
 * charged by the payment provider; the server only knows the terms. */
export const PLANS = /** @type {const} */ ({ month: 30, year: 365 });
export const GIFT_PLANS = /** @type {const} */ ({ m1: 30, m3: 90, m12: 365 });
/** The ONE place prices live: what the screens show and what the provider is asked to charge. In cents of PRICE_CURRENCY.
 * A gift to a couple costs PAIR_FACTOR times (both partners get the full term). Changing a price is changing this. */
export const PRICE_CURRENCY = 'EUR';
export const PRICES = /** @type {const} */ ({ month: 1199, year: 7999, m1: 1199, m3: 2999, m12: 7999 });
export const PAIR_FACTOR = 2;
const nick = z.string().trim().min(3).max(20);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A price in cents of PRICE_CURRENCY: 1.00 to 10 000.00. */
const price = z.int().min(100).max(1000000);
export const premiumCommands = {
  'premium.status': { profile: true, write: false, input: z.strictObject({}) },
  // What became of a purchase (the person came back from the provider's page): pending, paid, failed, canceled or refunded.
  'premium.purchaseStatus': { profile: false, write: false, input: z.strictObject({ purchaseId: id }) },
  'premium.purchase': { profile: false, write: true, rate: { kind: 'premium.purchase', max: 40, window: '1 day' }, input: z.strictObject({ opId, plan: z.enum(['month', 'year']) }) },
  'premium.restore': { profile: false, write: true, rate: { kind: 'premium.restore', max: 50, window: '1 day' }, input: z.strictObject({ opId }) },
  'premium.setRenewal': { profile: false, write: true, input: z.strictObject({ opId, autoRenew: z.boolean() }) },
  // Exact nickname only (a gift never goes to «roughly» someone); limited, since it tells whether a nick exists.
  'premium.giftCheck': { profile: false, write: false, rate: { kind: 'premium.gift_check', max: 200, window: '1 hour' }, input: z.strictObject({ handle: nick }) },
  'premium.gift': {
    profile: false, write: true, rate: { kind: 'premium.gift', max: 40, window: '1 day' },
    input: z.strictObject({ opId, handle: nick, plan: z.enum(['m1', 'm3', 'm12']), anonymous: z.boolean().default(false) }),
  },
  'staff.premiumGrant': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().min(3).max(20), days: z.int().min(1).max(400), reason: field('staffReason') }),
  },
  // The prices (owner 06.11.2026: set in the staff area, not in code). A purchase keeps the price it was made at.
  'staff.premiumPrices': { profile: false, write: false, input: z.strictObject({}) },
  'staff.premiumPricesSet': {
    profile: false, write: true,
    input: z.strictObject({ opId, prices: z.strictObject({ month: price.optional(), year: price.optional(), m1: price.optional(), m3: price.optional(), m12: price.optional() })
      .refine(v => Object.keys(v).length > 0, { message: 'empty' }) }),
  },
  // Premium in bulk (owner 06.11.2026): to everyone, or to everyone who registered before a day; a count first, then the grant.
  'staff.premiumGrantAllCount': { profile: false, write: false, input: z.strictObject({ audience: z.enum(['all', 'before']), before: day.optional() }) },
  'staff.premiumGrantAll': {
    profile: false, write: true,
    input: z.strictObject({ opId, audience: z.enum(['all', 'before']), before: day.optional(), days: z.int().min(1).max(400), reason: field('staffReason') })
      .refine(v => v.audience === 'all' || !!v.before, { message: 'before_required', path: ['before'] }),
  },
  // «Premium новым аккаунтам»: on with a number of days, or off (null).
  'staff.premiumPromo': { profile: false, write: false, input: z.strictObject({}) },
  'staff.premiumPromoSet': { profile: false, write: true, input: z.strictObject({ opId, welcomeDays: z.int().min(1).max(365).nullable() }) },
  // A person's or couple's Premium as staff see it: every period with its source, so nobody pastes a number to revoke it.
  'staff.premiumList': { profile: false, write: false, input: z.strictObject({ handle: z.string().trim().min(3).max(20) }) },
  // `confirmPaid`: a period someone paid for or was gifted is revoked only on purpose (the refund itself is done at the provider).
  'staff.premiumRevoke': { profile: false, write: true, input: z.strictObject({ opId, entitlementId: id, reason: field('staffReason'), confirmPaid: z.boolean().optional() }) },
  'verification.ageStart': { profile: false, write: true, rate: { kind: 'verification.age', max: 10, window: '1 day' }, input: z.strictObject({ opId, method: z.enum(AGE_METHODS).default('selfie') }) },
  'verification.ageSubmit': { profile: false, write: true, input: z.strictObject({ opId, checkId: id, assetId: id }) },
  'verification.ageStatus': { profile: false, write: false, input: z.strictObject({}) },
  'staff.ageCheckQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  // Opening a document or a selfie is its own step (audit 30.10, item 12): fresh code, one journal line per look.
  'staff.ageCheckOpen': { profile: false, write: true, ledger: false, input: z.strictObject({ checkId: id }) },
  'staff.ageCheckDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, checkId: id, approve: z.boolean(), reason: reason.optional() })
      .refine(v => v.approve || !!v.reason, { message: 'reason_required', path: ['reason'] }),
  },
};
