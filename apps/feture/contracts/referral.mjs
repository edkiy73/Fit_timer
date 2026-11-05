// @ts-check
/** Invitations and promo codes (owner 06.11.2026; migration 20261106700000_fe_referral.sql): everyone has a personal code to
 * share, staff make promo codes for a channel or a blogger. The reward comes once the newcomer has finished getting to know the
 * app and passed the age check. */
import * as z from 'zod';
import { opId, id } from './platform.mjs';
import { field } from './_text.mjs';

/** A code as people type it: letters, digits, `-` and `_`, 3 to 24, any case (stored in capitals). */
export const CODE = z.string().trim().regex(/^[A-Za-z0-9_-]{3,24}$/);
const days = z.int().min(0).max(365);

export const referralCommands = {
  // Your code and link, what it brought, and whether you were invited yourself. Makes the personal code on first use.
  'referral.mine': { profile: false, write: true, input: z.strictObject({ opId }) },
  // «У меня есть код»: a personal code or a promo code. Once per account, soon after sign-up.
  'referral.apply': { profile: false, write: true, rate: { kind: 'referral.apply', max: 20, window: '1 day' }, input: z.strictObject({ opId, code: CODE }) },

  'staff.referralSettings': { profile: false, write: false, input: z.strictObject({}) },
  'staff.referralSettingsSet': {
    profile: false, write: true,
    input: z.strictObject({ opId, enabled: z.boolean().optional(), rewardDays: z.int().min(1).max(365).optional(), inviterDays: days.optional(),
      capCount: z.int().min(1).max(1000).optional(), capDays: z.int().min(1).max(365).optional() }).refine(v => Object.keys(v).length > 1, { message: 'empty' }),
  },
  'staff.promoList': { profile: false, write: false, input: z.strictObject({}) },
  'staff.promoCreate': {
    profile: false, write: true,
    input: z.strictObject({ opId, code: CODE, label: field('staffReason'), days, maxUses: z.int().min(1).max(1000000).optional(), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  },
  'staff.promoSet': { profile: false, write: true, input: z.strictObject({ opId, codeId: id, active: z.boolean() }) },
};
