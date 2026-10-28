// @ts-check
/** Slice G2: notifications, «Нужно решить», counters, push devices (S2-CATALOG «G»). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

export const inboxCommands = {
  'notifications.list': { profile: false, write: false, input: z.strictObject({ cursor: z.string().max(200).optional() }) },
  'notifications.read': { profile: false, write: true, ledger: false, input: z.strictObject({ id }) },
  'notifications.readAll': { profile: false, write: true, ledger: false, input: z.strictObject({}) },
  'decide.list': { profile: false, write: false, input: z.strictObject({}) },
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
