// @ts-check
/** Slice E: couple commands of `POST /api/fe` (S2-CATALOG «E. Пары»). Invitations belong to accounts (no acting
 * profile); everything done as the couple needs `X-Fe-Profile` of the couple. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

export const couplesCommands = {
  'couple.invite': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().max(40), replacePaused: z.boolean().optional() }),
  },
  'couple.invites': { profile: false, write: false, input: z.strictObject({}) },
  'couple.inviteWithdraw': { profile: false, write: true, input: z.strictObject({ opId, inviteId: id }) },
  'couple.inviteAnswer': { profile: false, write: true, input: z.strictObject({ opId, inviteId: id, accept: z.boolean() }) },
  'couple.get': { profile: true, write: false, allowPaused: true, input: z.strictObject({}) },
  'couple.setApproval': { profile: true, write: true, input: z.strictObject({ opId, approvesPartner: z.boolean() }) },
  'couple.stop': { profile: true, write: true, input: z.strictObject({ opId, confirm: z.literal(true) }) },
  'couple.restore': { profile: true, write: true, allowPaused: true, input: z.strictObject({ opId }) },
};
