// @ts-check
/** Slice C2: private part and access commands of `POST /api/fe` (S2-CATALOG «C. Приватная часть и доступы»). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

const scopeList = z.array(z.enum(['info', 'photos', 'video'])).max(3)
  .refine(v => new Set(v).size === v.length, { message: 'duplicates' });
const scopes = scopeList.refine(v => v.length > 0, { message: 'empty' });

export const accessCommands = {
  'private.get': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'private.setOn': { profile: true, write: true, input: z.strictObject({ opId, on: z.boolean(), confirm: z.boolean().optional() }) },
  'private.setText': { profile: true, write: true, input: z.strictObject({ opId, text: text(1000) }) },
  'private.setMedia': { profile: true, write: true, input: z.strictObject({ opId, assetIds: z.array(id).max(18) }) },
  'access.request': { profile: true, write: true, input: z.strictObject({ opId, profileId: id, scopes }) },
  'access.cancel': { profile: true, write: true, input: z.strictObject({ opId, requestId: id }) },
  'access.grant': {
    profile: true, write: true,
    input: z.strictObject({ opId, requestId: id, scopes, term: z.enum(['none', '1d', '7d', '30d']) }),
  },
  'access.decline': { profile: true, write: true, input: z.strictObject({ opId, requestId: id }) },
  // Only within the short window after a decline, before the requester can learn about it (LIMITS.declineUndoSeconds).
  'access.undoDecline': { profile: true, write: true, input: z.strictObject({ opId, requestId: id }) },
  // An empty selection revokes the access.
  'access.narrow': { profile: true, write: true, input: z.strictObject({ opId, profileId: id, scopes: scopeList }) },
  'access.revoke': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'access.revokeAll': { profile: true, write: true, input: z.strictObject({ opId, confirm: z.boolean().optional() }) },
  // P07 «Доступы»: byme «Открыто мной», withme «Мне открыли», out «Мои запросы» (filter «Ждут ответа»); incoming feeds
  // «Я → Приватное». Keyset-paged.
  'access.lists': {
    profile: true, write: false,
    input: z.strictObject({ tab: z.enum(['out', 'withme', 'byme', 'incoming']), filter: z.enum(['pending']).optional(), cursor: z.string().max(200).optional() }),
  },
  // «Осталось N из M» for the request sheet: the account's rolling 24 h budget.
  'access.quota': { profile: true, write: false, input: z.strictObject({}) },
};
