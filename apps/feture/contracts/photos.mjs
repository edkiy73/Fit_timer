// @ts-check
/** Profile photos (S1 §4 «фото профиля», S3 §8): an ordered list of up to six public photos, at most one video and
 * never first; the avatar is the first approved photo. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

export const photosCommands = {
  'profile.photosSet': {
    profile: true, write: true, rate: { kind: 'profile.photos', max: 100, window: '1 day' },
    input: z.strictObject({ opId, assetIds: z.array(id).max(6).refine(v => new Set(v).size === v.length, { message: 'duplicates' }) }),
  },
};
