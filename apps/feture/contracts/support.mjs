// @ts-check
/** Wave 8: «Написать в поддержку» (S01) with staff replies in the staff screen, and the maintenance switch (MAINT). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

/** A message to or from support: at least five characters (V21 supportSend), at most 2000. */
const body = text(2000).refine(v => v.length >= 5, { message: 'too_short' });
export const SUPPORT_TOPICS = /** @type {const} */ (['account', 'safety', 'premium', 'bug', 'other']);

export const supportCommands = {
  'support.create': {
    profile: false, write: true, rate: { kind: 'support.create', max: 5, window: '1 day' },
    input: z.strictObject({ opId, topic: z.enum(SUPPORT_TOPICS).default('other'), body }),
  },
  'support.mine': { profile: false, write: false, input: z.strictObject({}) },
  'support.reply': {
    profile: false, write: true, rate: { kind: 'support.reply', max: 30, window: '1 day' },
    input: z.strictObject({ opId, ticketId: id, body }),
  },
  'staff.supportQueue': {
    profile: false, write: false,
    input: z.strictObject({ limit: z.int().min(1).max(50).default(20), state: z.enum(['open', 'answered', 'closed']).default('open') }),
  },
  'staff.supportReply': {
    profile: false, write: true,
    input: z.strictObject({ opId, ticketId: id, body: body.optional(), close: z.boolean().default(false) })
      .refine(v => !!v.body || v.close, { message: 'body_required', path: ['body'] }),
  },
  // Readable while maintenance is on (the client polls it from the maintenance screen).
  'platform.maintenance': { profile: false, write: false, input: z.strictObject({}) },
  'staff.maintenanceSet': {
    profile: false, write: true,
    input: z.strictObject({ opId, active: z.boolean(), message: text(300).optional() }),
  },
};
