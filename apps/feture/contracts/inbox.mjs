// @ts-check
/** Slice G2: notifications, «Нужно решить», counters, push devices (S2-CATALOG «G»). Stage 5 (docs/notifications.md):
 * the full history paged by a cursor and narrowed by the catalog's filter, one row by ID (a moderation decision's card),
 * one «Нужно решить» item by ID with its revision (a decision never depends on a list page). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { DECIDE_KINDS, FILTERS } from './notifications.mjs';

export const inboxCommands = {
  'notifications.list': { profile: false, write: false, input: z.strictObject({ cursor: z.string().max(200).optional(), filter: z.enum(FILTERS).optional() }) },
  'notifications.get': { profile: false, write: false, input: z.strictObject({ id }) },
  // One row, or the rows of a summary card («Алиса и ещё 3 …») at once.
  'notifications.read': { profile: false, write: true, ledger: false, input: z.strictObject({ id: id.optional(), ids: z.array(id).min(1).max(100).optional() }).refine(v => !!v.id !== !!v.ids, { message: 'id_or_ids' }) },
  'notifications.readAll': { profile: false, write: true, ledger: false, input: z.strictObject({}) },
  'decide.list': { profile: false, write: false, input: z.strictObject({}) },
  'decide.get': { profile: false, write: false, input: z.strictObject({ kind: z.enum(DECIDE_KINDS), id }) },
  'inbox.counts': { profile: false, write: false, input: z.strictObject({}) },
  'push.register': {
    profile: false, write: true, rate: { kind: 'push.register', max: 100, window: '1 day' },
    input: z.strictObject({
      opId, platform: z.enum(['ios', 'android', 'web']), token: z.string().min(8).max(4096),
      // Optional: a re-register without it keeps the zone already known.
      tz: z.string().max(64).refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, { message: 'unknown_zone' }).optional(),
    }),
  },
  'push.unregister': { profile: false, write: true, input: z.strictObject({ opId, token: z.string().min(8).max(4096) }) },
};
