// @ts-check
/** Wave 5 «Галерея и альбомы» (V21 galAlbum*, galSel*, postAlbum*, setAlbum): a profile's gallery is the photos of its
 * own published posts (for everyone or followers); albums group those posts. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { field } from './_text.mjs';

const title = field('albumTitle');
const visibility = z.enum(['all', 'followers']);
const unique = (/** @type {z.ZodArray<any>} */ arr) => arr.refine(v => new Set(v).size === v.length, { message: 'duplicates' });

/** Albums per profile. */
export const MAX_ALBUMS = 50;

export const galleryCommands = {
  'album.list': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'album.create': { profile: true, write: true, rate: { kind: 'album.create', max: 500, window: '1 day' }, input: z.strictObject({ opId, title }) },
  'album.rename': { profile: true, write: true, input: z.strictObject({ opId, albumId: id, title }) },
  'album.delete': { profile: true, write: true, input: z.strictObject({ opId, albumId: id }) },
  'album.update': {
    profile: true, write: true,
    input: z.strictObject({
      opId, albumId: id,
      visibility: visibility.optional(),
      sort: z.enum(['new', 'old']).optional(),
      coverPostId: id.nullable().optional(),   // null: back to the newest post
      confirm: z.boolean().default(false),     // «Публикации альбома тоже станут видны только подписчикам»
    }).refine(v => v.visibility !== undefined || v.sort !== undefined || v.coverPostId !== undefined, { message: 'nothing_to_change' }),
  },
  'album.move': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      albumId: id.optional(), direction: z.enum(['left', 'right']).optional(),
      order: unique(z.array(id).min(1).max(MAX_ALBUMS)).optional(),
    }).refine(v => v.order ? v.albumId === undefined && v.direction === undefined : v.albumId !== undefined && v.direction !== undefined, { message: 'one_way' }),
  },
  'post.setAlbum': { profile: true, write: true, input: z.strictObject({ opId, postId: id, albumId: id.nullable(), confirm: z.boolean().default(false) }) },
  'gallery.list': { profile: true, write: false, input: z.strictObject({ profileId: id, albumId: id.optional(), cursor: z.string().max(200).optional() }) },
  'gallery.bulk': {
    profile: true, write: true, rate: { kind: 'gallery.bulk', max: 1500, window: '1 day' },
    input: z.strictObject({
      opId,
      postIds: unique(z.array(id).min(1).max(50)),
      change: z.enum(['album', 'audience', 'delete', 'profile']),   // `action` is the command name
      albumId: id.nullable().optional(),
      audience: visibility.optional(),
      confirm: z.boolean().default(false),
    }).refine(v => (v.change === 'album') === (v.albumId !== undefined), { message: 'album_for_album', path: ['albumId'] })
      .refine(v => (v.change === 'audience') === (v.audience !== undefined), { message: 'audience_for_audience', path: ['audience'] }),
  },
};
