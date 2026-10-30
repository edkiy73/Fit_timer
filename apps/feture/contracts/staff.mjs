// @ts-check
/** S4 staff commands of `POST /api/fe` (docs/server/S4-MODERATION.md). Roles are checked on the server only. */
import * as z from 'zod';
import { id, opId, queuePaging } from './platform.mjs';

/** Six digits from the authenticator app, or a recovery code (xxxxx-xxxxx); spaces are dropped. */
export const factorCode =z.string().max(40).transform(v => v.replace(/\s/g, '')).pipe(z.string().regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/));

export const staffCommands = {
  'staff.me': { profile: false, write: false, input: z.strictObject({}) },
  // Second factor (server/second-factor.mjs). Never in the replay ledger (`ledger: false`): the secret and the recovery
  // codes must not be stored with the result. Wrong codes are answered 200 {verified: false, reason, left, lockedUntil}
  // so the counted failure commits; the rate below only bounds the calls.
  'staff.totpStart': { profile: false, write: true, ledger: false, input: z.strictObject({}), rate: { kind: 'factor.start', max: 20, window: '1 hour' } },
  'staff.totpConfirm': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  'staff.totpVerify': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  'staff.totpReset': { profile: false, write: true, input: z.strictObject({ opId, handle: z.string().trim().min(1).max(40) }) },
  'staff.grant': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().max(40), role: z.enum(['lead', 'moderator', 'verifier', 'auditor', 'support']), grant: z.boolean() }),
  },
  'staff.mediaQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.mediaView': { profile: false, write: true, ledger: false, input: z.strictObject({ assetId: id }) },
  'staff.mediaDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      assetId: id,
      decision: z.enum(['approve', 'reject']),
      explicit: z.boolean().optional(),
      reason: z.enum(['csam_suspected', 'minor', 'not_a_person', 'violence', 'private_material', 'spam', 'invalid', 'other']).optional(),
    }).refine(v => v.decision === 'reject' ? !!v.reason : v.explicit !== undefined, { message: 'approve needs a label, reject needs a reason' }),
  },
  // Dating on/off for everyone (owner/lead); switching on tells those who asked «Сообщить о запуске».
  'staff.datingSwitch': { profile: false, write: true, input: z.strictObject({ opId, on: z.boolean() }) },
  'staff.journal': {
    profile: false, write: false,
    input: z.strictObject({
      targetId: id.optional(), staffAccountId: id.optional(), what: z.string().regex(/^[a-z]+(\.[a-zA-Z]+)+$/).max(60).optional(),
      limit: z.int().min(1).max(100).default(50), after: z.string().max(400).optional(),
    }),
  },
};

/** The size of every queue the signed-in staff member may open, and of the support requests waiting (server/commands/staff-counts.mjs). */
export const staffCountsCommands = {
  'staff.counts': { profile: false, write: false, input: z.strictObject({}) },
};
