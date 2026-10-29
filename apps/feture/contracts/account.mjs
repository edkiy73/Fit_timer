// @ts-check
/** Account deletion and data export (S1 §16, GDPR art. 15/17/20; stores require deletion in the app). */
import * as z from 'zod';
import { opId } from './platform.mjs';
import { factorCode } from './staff.mjs';

export const accountCommands = {
  'account.export': { profile: false, write: false, rate: { kind: 'account.export', max: 10, window: '1 day' }, input: z.strictObject({}) },
  // «Мои устройства»: last use and rough place per signed-in device (the list itself is Core's `sessions`).
  'account.devices': { profile: false, write: false, input: z.strictObject({}) },
  // Optional second factor (owner 29.10.2026, server/second-factor.mjs + signin.mjs): «Вход и безопасность» → «Код из
  // приложения». Never in the replay ledger (`ledger: false`): the secret and recovery codes are never stored with a
  // result. Wrong codes answer 200 {verified: false, reason, left, lockedUntil} so the counted failure commits.
  'account.factor': { profile: false, write: false, input: z.strictObject({}) },
  'account.factorStart': { profile: false, write: true, ledger: false, input: z.strictObject({}), rate: { kind: 'factor.start', max: 20, window: '1 hour' } },
  'account.factorConfirm': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  // Turning it off and new recovery codes ask for a current code (or a recovery code).
  'account.factorOff': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  'account.factorCodes': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  // The sign-in second step: the only command a sign-in that has not passed it may call (signin.mjs SIGNIN_OPEN).
  'account.factorSignIn': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  // Confirmed with the nickname, as V21 asks.
  'account.delete': { profile: false, write: true, input: z.strictObject({ opId, confirmHandle: z.string().trim().min(3).max(20) }) },
};
