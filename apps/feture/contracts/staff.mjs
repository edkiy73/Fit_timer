// @ts-check
/** S4 staff commands of `POST /api/fe` (docs/server/S4-MODERATION.md). Roles are checked on the server only. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

export const staffCommands = {
  'staff.me': { profile: false, write: false, input: z.strictObject({}) },
  'staff.grant': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().max(40), role: z.enum(['lead', 'moderator', 'verifier', 'auditor', 'support']), grant: z.boolean() }),
  },
  'staff.mediaQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
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
    input: z.strictObject({ targetId: id.optional(), limit: z.int().min(1).max(100).default(50) }),
  },
};
