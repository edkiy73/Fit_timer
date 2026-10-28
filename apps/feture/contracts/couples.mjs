// @ts-check
/** Slice E: couple commands of `POST /api/fe` (S2-CATALOG «E. Пары»). Invitations belong to accounts (no acting
 * profile); everything done as the couple needs `X-Fe-Profile` of the couple. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

/** 32 random bytes, base64url. */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const couplesCommands = {
  'couple.invite': {
    profile: false, write: true, rate: { kind: 'couple.invite', max: 20, window: '1 day' },
    input: z.strictObject({ opId, handle: z.string().trim().max(40), replacePaused: z.boolean().optional() }),
  },
  'couple.invites': { profile: false, write: false, input: z.strictObject({}) },
  'couple.inviteWithdraw': { profile: false, write: true, input: z.strictObject({ opId, inviteId: id }) },
  'couple.inviteAnswer': { profile: false, write: true, input: z.strictObject({ opId, inviteId: id, accept: z.boolean() }) },
  'couple.get': { profile: true, write: false, allowPaused: true, input: z.strictObject({}) },
  'couple.setApproval': { profile: true, write: true, input: z.strictObject({ opId, approvesPartner: z.boolean() }) },
  'couple.stop': { profile: true, write: true, input: z.strictObject({ opId, confirm: z.literal(true) }) },
  'couple.restore': { profile: true, write: true, allowPaused: true, input: z.strictObject({ opId }) },
  // V21 pairShareLink: a single-use link for a partner who has no account yet (no email is sent; the person shares it).
  'couple.linkCreate': {
    profile: false, write: true, rate: { kind: 'couple.link', max: 20, window: '1 day' }, input: z.strictObject({ opId }),
  },
  'couple.linkRevoke': { profile: false, write: true, input: z.strictObject({ opId, linkId: id }) },
  // Who invites, before accepting; counted so links cannot be guessed.
  'couple.linkPeek': {
    profile: false, write: false, rate: { kind: 'couple.link_peek', max: 60, window: '1 day' }, input: z.strictObject({ token }),
  },
  'couple.linkAccept': {
    profile: false, write: true, rate: { kind: 'couple.link_accept', max: 20, window: '1 day' }, input: z.strictObject({ opId, token }),
  },
  // V21 Q09 right after the couple forms: my own approval mode and who may request access, in one call.
  'couple.setup': {
    profile: true, write: true,
    input: z.strictObject({ opId, mode: z.enum(['trust', 'approve']), requestsFrom: z.enum(['all', 'matches', 'none']) }),
  },
};
