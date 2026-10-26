// @ts-check
/** Slice C2: private part and access commands of `POST /api/fe` (S2-CATALOG «C. Приватная часть и доступы»). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

const scopes = z.array(z.enum(['info', 'photos', 'video'])).min(1).max(3)
  .refine(v => new Set(v).size === v.length, { message: 'duplicates' });

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
  'access.narrow': {
    profile: true, write: true,
    input: z.strictObject({ opId, profileId: id, scopes: z.array(z.enum(['info', 'photos', 'video'])).max(3) }),
  },
  'access.revoke': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'access.revokeAll': { profile: true, write: true, input: z.strictObject({ opId, confirm: z.boolean().optional() }) },
  'access.lists': { profile: true, write: false, input: z.strictObject({ tab: z.enum(['out', 'withme', 'byme', 'incoming']) }) },
};
