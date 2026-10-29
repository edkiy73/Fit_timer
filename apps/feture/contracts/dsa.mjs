// @ts-check
/** S4 steps 5–6: notices of illegal content without an account (DSA art. 16) and transparency figures (art. 15). */
import * as z from 'zod';
import { id, opId, queuePaging } from './platform.mjs';
import { field } from './_text.mjs';

/** The public form (no account): `POST /api/fe?notice=1`. */
export const noticeInput = z.strictObject({
  // Printable ASCII only (no look-alike or direction-changing characters), a real https URL.
  targetUrl: z.string().trim().min(8).max(500).regex(/^[\x21-\x7e]+$/)
    .refine(v => { try { return new URL(v).protocol === 'https:'; } catch { return false; } }, { message: 'https_only' }),
  reason: z.enum(['csam', 'minors', 'threats', 'private_material', 'illegal', 'ip', 'other']),
  explanation: field('dsaExplanation'),
  // Name and address as art. 16(2)(c) asks; the address is used only to answer.
  senderName: field('dsaName').optional(),
  senderEmail: z.string().trim().max(254).regex(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/).optional(),
  locale: z.enum(['ru', 'en']).default('en'),
  goodFaith: z.literal(true),
}).refine(v => v.reason === 'csam' || !!v.senderEmail, { message: 'email_required', path: ['senderEmail'] });

const day = z.iso.date().refine(v => v >= '2020-01-01' && v <= '2100-12-31', { message: 'out_of_range' });
export const dsaCommands = {
  'staff.noticeQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.noticeDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId, noticeId: id, outcome: z.enum(['removed', 'kept', 'not_actionable']),
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules', 'ip']).optional(),
      note: field('staffNote').default(''),
    }).refine(v => v.outcome !== 'removed' || !!v.rule, { message: 'rule_required', path: ['rule'] }),
  },
  // At least four weeks, so the figures never describe a single day's decisions about a few people.
  'staff.transparency': {
    profile: false, write: false,
    input: z.strictObject({ from: day, to: day }).refine(v => (Date.parse(v.to) - Date.parse(v.from)) / 864e5 >= 27, { message: 'period_too_short', path: ['to'] }),
  },
};
