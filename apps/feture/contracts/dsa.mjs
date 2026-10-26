// @ts-check
/** S4 steps 5–6: notices of illegal content without an account (DSA art. 16) and transparency figures (art. 15). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

/** The public form (no account): `POST /api/fe?notice=1`. */
export const noticeInput = z.strictObject({
  targetUrl: z.string().trim().min(8).max(500).regex(/^https:\/\/\S+$/),
  reason: z.enum(['csam', 'minors', 'threats', 'private_material', 'illegal', 'ip', 'other']),
  explanation: text(2000).refine(v => v.length >= 20, { message: 'too_short' }),
  senderName: z.string().trim().max(120).optional(),
  senderEmail: z.string().trim().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/).optional(),
  locale: z.enum(['ru', 'en']).default('en'),
  goodFaith: z.literal(true),
}).refine(v => v.reason === 'csam' || !!v.senderEmail, { message: 'email_required', path: ['senderEmail'] });

const day = z.iso.date();
export const dsaCommands = {
  'staff.noticeQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.noticeDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId, noticeId: id, outcome: z.enum(['removed', 'kept', 'not_actionable']),
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules', 'ip']).optional(),
      note: text(500).default(''),
    }).refine(v => v.outcome !== 'removed' || !!v.rule, { message: 'rule_required', path: ['rule'] }),
  },
  'staff.transparency': { profile: false, write: false, input: z.strictObject({ from: day, to: day }) },
};
