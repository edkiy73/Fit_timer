// @ts-check
/** S4 step 3: report, dispute and sanction commands for staff (docs/server/S4-MODERATION.md §2–4).
 * (`action` is the command name in the request body, so decisions are called `decision`.) */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { field } from './_text.mjs';

export const moderationCommands = {
  'staff.reportQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.reportDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      targetType: z.enum(['profile', 'post', 'reply', 'community', 'event', 'conversation']),
      targetId: id,
      reportedProfileId: id.optional(),   // a chat: which side's reports this decides
      decision: z.enum(['keep', 'remove']),
      // Statement of reasons for the author (DSA art. 17): which rule.
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules']).optional(),
      note: field('staffNote').default(''),
    }).refine(v => v.decision === 'keep' || !!v.rule, { message: 'remove needs a rule', path: ['rule'] })
      .refine(v => !['profile', 'conversation'].includes(v.targetType) || v.decision === 'keep', { message: 'people are sanctioned through staff.sanction or staff.restrict', path: ['decision'] }),
  },
  'staff.disputeQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.disputeDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, postId: id, restore: z.boolean(), note: field('staffNote').default('') }),
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
      note: field('staffNote').default(''),
    }),
  },
  'staff.restrict': {
    profile: false, write: true,
    input: z.strictObject({
      opId, profileId: id, on: z.boolean(),
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules', 'appeal_granted']),
      note: field('staffNote').default(''),
    }),
  },
  'staff.placeQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.placeDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, placeId: id, decision: z.enum(['approve', 'reject']), nameRu: field('placeName').optional(), nameEn: field('placeName').optional() }),
  },
  'appeal.create': {
    profile: true, write: true, rate: { kind: 'appeal.create', max: 5, window: '1 day' },
    input: z.strictObject({ opId, targetType: z.enum(['post', 'reply', 'community', 'event', 'profile']), targetId: id, body: field('appeal') }),
  },
  'staff.appealQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.appealDecide': { profile: false, write: true, input: z.strictObject({ opId, appealId: id, grant: z.boolean(), note: field('staffNote').default('') }) },
};
