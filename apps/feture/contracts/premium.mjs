// @ts-check
/** Slice H1: Premium entitlements and the age check by selfie (S2-CATALOG «H»). Store purchases and gifts come with a
 * payment provider. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

const reason = z.string().regex(/^[a-z_]{2,32}$/);
export const premiumCommands = {
  'premium.status': { profile: true, write: false, input: z.strictObject({}) },
  'staff.premiumGrant': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().min(3).max(20), days: z.int().min(1).max(400), reason: text(300).refine(v => v.length >= 3, { message: 'too_short' }) }),
  },
  'staff.premiumRevoke': { profile: false, write: true, input: z.strictObject({ opId, entitlementId: id, reason: text(300).refine(v => v.length >= 3, { message: 'too_short' }) }) },
  'verification.ageStart': { profile: false, write: true, rate: { kind: 'verification.age', max: 5, window: '1 day' }, input: z.strictObject({ opId }) },
  'verification.ageSubmit': { profile: false, write: true, input: z.strictObject({ opId, checkId: id, assetId: id }) },
  'verification.ageStatus': { profile: false, write: false, input: z.strictObject({}) },
  'staff.ageCheckQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.ageCheckDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, checkId: id, approve: z.boolean(), reason: reason.optional() })
      .refine(v => v.approve || !!v.reason, { message: 'reason_required', path: ['reason'] }),
  },
};
