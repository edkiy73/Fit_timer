// @ts-check
/** Slice B social graph commands of `POST /api/fe` (S2-CATALOG «B», «F. block.set»). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

export const socialCommands = {
  'block.set': {
    profile: true, write: true,
    input: z.strictObject({ opId, profileId: id, on: z.boolean(), alsoFor: z.enum(['partner', 'me']).optional() }),
  },
  'blocks.list': { profile: true, write: false, input: z.strictObject({}) },
  'follow.set': { profile: true, write: true, rate: { kind: 'follow.set', max: 1000, window: '1 day' }, input: z.strictObject({ opId, profileId: id, on: z.boolean() }) },
  // «Удалить из подписчиков» (V21 flwRemove21): the removed person is not told; «Вернуть» within 10 minutes.
  'follower.remove': { profile: true, write: true, rate: { kind: 'follower.remove', max: 1000, window: '1 day' }, input: z.strictObject({ opId, profileId: id }) },
  'follower.restore': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'feedHide.set': {
    profile: true, write: true,
    input: z.strictObject({ opId, kind: z.enum(['post', 'author', 'activity', 'event']), targetId: id, on: z.boolean() }),
  },
  // «Не показывать активность» (V21): the person's likes, events, communities and follows leave my «Подписки».
  'activity.mute': { profile: true, write: true, input: z.strictObject({ opId, profileId: id, on: z.boolean() }) },
  'feedHide.list': { profile: true, write: false, input: z.strictObject({}) },
  'saved.set': {
    profile: true, write: true,
    input: z.strictObject({ opId, kind: z.enum(['post', 'event', 'topic', 'discussion']), targetId: z.string().max(64), on: z.boolean() }),
  },
  'saved.list': { profile: true, write: false, input: z.strictObject({ kind: z.enum(['post', 'event', 'topic', 'discussion']).optional() }) },
  'profile.followers': { profile: true, write: false, input: z.strictObject({ profileId: id, following: z.boolean().default(false), cursor: z.string().max(200).optional() }) },
};
