// @ts-check
/** Account deletion and data export (S1 §16, GDPR art. 15/17/20; stores require deletion in the app). */
import * as z from 'zod';
import { opId } from './platform.mjs';

export const accountCommands = {
  'account.export': { profile: false, write: false, rate: { kind: 'account.export', max: 10, window: '1 day' }, input: z.strictObject({}) },
  // «Мои устройства»: last use and rough place per signed-in device (the list itself is Core's `sessions`).
  'account.devices': { profile: false, write: false, input: z.strictObject({}) },
  // Confirmed with the nickname, as V21 asks.
  'account.delete': { profile: false, write: true, input: z.strictObject({ opId, confirmHandle: z.string().trim().min(3).max(20) }) },
};
