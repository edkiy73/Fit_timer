// @ts-check
/** S4 step 3: report, dispute and sanction commands for staff (docs/server/S4-MODERATION.md §2–4).
 * (`action` is the command name in the request body, so decisions are called `decision`.) */
import * as z from 'zod';
import { id, opId, queuePaging } from './platform.mjs';
import { field } from './_text.mjs';

import { RESTRICT_PRESETS, RESTRICT_SCOPES } from './_restrict.mjs';

export { RESTRICT_PRESETS, RESTRICT_SCOPES };

export const moderationCommands = {
  'staff.reportQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.reportDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      targetType: z.enum(['profile', 'post', 'reply', 'community', 'event', 'conversation', 'announcement']),
      targetId: id,
      reportedProfileId: id.optional(),   // a chat: which side's reports this decides
      decision: z.enum(['keep', 'remove']),
      // Statement of reasons for the author (DSA art. 17): which rule.
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules']).optional(),
      note: field('staffNote').default(''),
    }).refine(v => v.decision === 'keep' || !!v.rule, { message: 'remove needs a rule', path: ['rule'] })
      .refine(v => !['profile', 'conversation'].includes(v.targetType) || v.decision === 'keep', { message: 'people are sanctioned through staff.sanction or staff.restrict', path: ['decision'] }),
  },
  'staff.disputeQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.disputeDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, postId: id, restore: z.boolean(), note: field('staffNote').default('') }),
  },
  // An account that reached the claim restriction was looked at by staff (it leaves the «на проверке» list).
  'staff.disputeClaimantReviewed': { profile: false, write: true, input: z.strictObject({ opId, profileId: id }) },
  'staff.revisionQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
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
      // A timed measure ends on its own after this many days; none = until staff lift it.
      days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)]).optional(),
    }),
  },
  'staff.restrict': {
    profile: false, write: true,
    input: z.strictObject({
      opId, profileId: id, on: z.boolean(),
      // What it limits; none given = «Стандартное».
      scope: z.array(z.enum(RESTRICT_SCOPES)).min(1).max(RESTRICT_SCOPES.length).transform(v => [...new Set(v)]).optional(),
      rule: z.enum(['minors', 'threats', 'private_material', 'spam', 'illegal', 'community_rules', 'appeal_granted']),
      note: field('staffNote').default(''),
      // A timed measure ends on its own after this many days; none = until staff lift it.
      days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)]).optional(),
    }),
  },
  // «Меры» in the staff area: what is in force for a profile found by @nick, so it can be lifted.
  // A person in the staff area («Люди», owner 05.11.2026): by @nick (search) or by id (a link from a card or the journal).
  'staff.profileMeasures': {
    profile: false, write: false,
    input: z.strictObject({ handle: z.string().trim().min(1).max(40).optional(), profileId: id.optional() }).refine(v => !!v.handle !== !!v.profileId, { message: 'handle_or_id' }),
  },
  // «Под наблюдением» (owner 05.11.2026): a staff mark with a note; the list of marked people.
  'staff.watch': { profile: false, write: true, input: z.strictObject({ opId, profileId: id, on: z.boolean(), note: z.string().trim().max(300).default('') }) },
  'staff.watchList': { profile: false, write: false, input: z.strictObject({}) },
  // «Взять в работу»: the item open on this moderator's screen; others see who has it.
  'staff.claim': { profile: false, write: true, input: z.strictObject({ opId, item: z.string().min(3).max(200), on: z.boolean() }) },
  'staff.placeQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.placeDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, placeId: id, decision: z.enum(['approve', 'reject']), nameRu: field('placeName').optional(), nameEn: field('placeName').optional() }),
  },
  'appeal.create': {
    profile: true, write: true, rate: { kind: 'appeal.create', max: 10, window: '1 day' },
    input: z.strictObject({ opId, targetType: z.enum(['post', 'reply', 'community', 'event', 'profile', 'media', 'revision']), targetId: id, body: field('appeal') }),
  },
  // A suspended account (audit item 2): its decision — rule, until when, may it be appealed — and the appeal itself.
  'account.suspension': { profile: false, write: false, input: z.strictObject({}) },
  'appeal.suspension': {
    profile: false, write: true, rate: { kind: 'appeal.create', max: 10, window: '1 day' },
    input: z.strictObject({ opId, body: field('appeal') }),
  },
  'staff.appealQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.appealDecide': { profile: false, write: true, input: z.strictObject({ opId, appealId: id, grant: z.boolean(), note: field('staffNote').default('') }) },
};
