// @ts-check
/** Slice H1: Premium entitlements and the age check — by a selfie with a gesture or by an identity document (A07,
 * S2-CATALOG «H»). Store purchases and gifts come with a payment provider. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

const reason = z.string().regex(/^[a-z_]{2,32}$/);
/** How the age is proven: a selfie with a server-chosen gesture (compared with the profile photo) or a photo of an
 * identity document (staff read the birth date; nothing from it is stored). Older clients send no method: selfie. */
export const AGE_METHODS = /** @type {const} */ (['selfie', 'document']);
/** Plans (wave 8): a subscription renews; a gift is a fixed term with no renewal. Prices are shown by the client and
 * charged by the payment provider; the server only knows the terms. */
export const PLANS = /** @type {const} */ ({ month: 30, year: 365 });
export const GIFT_PLANS = /** @type {const} */ ({ m1: 30, m3: 90, m12: 365 });
const nick = z.string().trim().min(3).max(20);
export const premiumCommands = {
  'premium.status': { profile: true, write: false, input: z.strictObject({}) },
  'premium.purchase': { profile: false, write: true, rate: { kind: 'premium.purchase', max: 20, window: '1 day' }, input: z.strictObject({ opId, plan: z.enum(['month', 'year']) }) },
  'premium.restore': { profile: false, write: true, rate: { kind: 'premium.restore', max: 10, window: '1 day' }, input: z.strictObject({ opId }) },
  'premium.setRenewal': { profile: false, write: true, input: z.strictObject({ opId, autoRenew: z.boolean() }) },
  // Exact nickname only (a gift never goes to «roughly» someone); limited, since it tells whether a nick exists.
  'premium.giftCheck': { profile: false, write: false, rate: { kind: 'premium.gift_check', max: 60, window: '1 hour' }, input: z.strictObject({ handle: nick }) },
  'premium.gift': {
    profile: false, write: true, rate: { kind: 'premium.gift', max: 20, window: '1 day' },
    input: z.strictObject({ opId, handle: nick, plan: z.enum(['m1', 'm3', 'm12']), anonymous: z.boolean().default(false) }),
  },
  'staff.premiumGrant': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().min(3).max(20), days: z.int().min(1).max(400), reason: text(300).refine(v => v.length >= 3, { message: 'too_short' }) }),
  },
  'staff.premiumRevoke': { profile: false, write: true, input: z.strictObject({ opId, entitlementId: id, reason: text(300).refine(v => v.length >= 3, { message: 'too_short' }) }) },
  'verification.ageStart': { profile: false, write: true, rate: { kind: 'verification.age', max: 5, window: '1 day' }, input: z.strictObject({ opId, method: z.enum(AGE_METHODS).default('selfie') }) },
  'verification.ageSubmit': { profile: false, write: true, input: z.strictObject({ opId, checkId: id, assetId: id }) },
  'verification.ageStatus': { profile: false, write: false, input: z.strictObject({}) },
  'staff.ageCheckQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.ageCheckDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, checkId: id, approve: z.boolean(), reason: reason.optional() })
      .refine(v => v.approve || !!v.reason, { message: 'reason_required', path: ['reason'] }),
  },
};
