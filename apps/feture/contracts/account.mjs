// @ts-check
/** Account deletion and data export (S1 §16, GDPR art. 15/17/20; stores require deletion in the app). */
import * as z from 'zod';
import { opId } from './platform.mjs';

export const accountCommands = {
  'account.export': { profile: false, write: false, rate: { kind: 'account.export', max: 5, window: '1 day' }, input: z.strictObject({}) },
  // Confirmed with the nickname, as V21 asks.
  'account.delete': { profile: false, write: true, input: z.strictObject({ opId, confirmHandle: z.string().trim().min(3).max(20) }) },
};
