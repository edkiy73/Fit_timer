// @ts-check
/** S4 step 3: report, dispute and sanction commands for staff (docs/server/S4-MODERATION.md §2–4).
 * (`action` is the command name in the request body, so decisions are called `decision`.) */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

export const moderationCommands = {
  'staff.reportQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.reportDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      targetType: z.enum(['profile', 'post', 'reply']),
      targetId: id,
      decision: z.enum(['keep', 'remove']),
      // Statement of reasons for the author (DSA art. 17): which rule.
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules']).optional(),
      note: text(500).default(''),
    }).refine(v => v.decision === 'keep' || !!v.rule, { message: 'remove needs a rule', path: ['rule'] }),
  },
  'staff.disputeQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.disputeDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, postId: id, restore: z.boolean(), note: text(500).default('') }),
  },
  'staff.revisionQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.revisionDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId, revisionId: id, decision: z.enum(['approve', 'reject']),
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules']).optional(),
    }).refine(v => v.decision === 'approve' || !!v.rule, { message: 'reject needs a rule', path: ['rule'] }),
  },
  'staff.sanction': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      profileId: id,
      decision: z.enum(['suspend', 'lift']),
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules', 'appeal_granted']),
      note: text(500).default(''),
    }),
  },
};
