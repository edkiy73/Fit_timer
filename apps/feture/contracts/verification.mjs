// @ts-check
/** V01 photo verification: a selfie with a server-chosen gesture, compared by staff with the profile photos
 * (S2-CATALOG «H» `verification.photoSubmit`, S3-MEDIA §8). The badge is a yes/no on the public profile. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

const reason = z.string().regex(/^[a-z_]{2,32}$/);
export const verificationCommands = {
  'verification.photoStart': { profile: false, write: true, rate: { kind: 'verification.photo', max: 10, window: '1 day' }, input: z.strictObject({ opId }) },
  'verification.photoSubmit': { profile: false, write: true, input: z.strictObject({ opId, checkId: id, assetId: id }) },
  'verification.photoStatus': { profile: false, write: false, input: z.strictObject({}) },
  'staff.photoCheckQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.photoCheckDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, checkId: id, approve: z.boolean(), reason: reason.optional() })
      .refine(v => v.approve || !!v.reason, { message: 'reason_required', path: ['reason'] }),
  },
};
