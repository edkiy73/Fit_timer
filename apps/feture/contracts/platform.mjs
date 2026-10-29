// @ts-check
/** Platform commands of `POST /api/fe` (docs/server/S2-API.md §9). Shared by the server and the React client:
 * the client builds requests with these schemas, the server rejects anything they reject.
 * Inputs never carry an owner, role, age, email or account id; the acting profile comes from `X-Fe-Profile`. */
import * as z from 'zod';
import { field } from './_text.mjs';

export const id = z.uuid();
/** Client operation id: one per user intent, reused on retry. */
export const opId = z.uuid();
/** Paging and sort of every staff queue: `after` is the cursor the server sent as `tail` / `next`; `order` is the
 * reader's choice (`old` first or `new` first). */
export const queuePaging = {
  limit: z.int().min(1).max(50).default(20),
  after: z.string().max(400).optional(),
  order: z.enum(['old', 'new']).default('old'),
};

const media = {
  purpose: z.enum(['post', 'avatar', 'private', 'chat', 'gallery', 'community', 'event', 'verification', 'voice']),
  kind: z.enum(['image', 'video', 'audio']),
};

/** action → {input, profile: whether X-Fe-Profile is required, write: whether the profile must be writable} */
export const platformCommands = {
  'session.bootstrap': { profile: false, write: false, input: z.strictObject({}) },
  'profile.mine': { profile: false, write: false, input: z.strictObject({}) },
  'media.uploadIntent': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      purpose: media.purpose,
      kind: media.kind,
      mime: z.string().max(40),
      bytes: z.int().positive(),
      explicit: z.boolean().optional(),
      viewRule: z.enum(['normal', 'once', 'timer']).optional(),
      viewSeconds: z.int().min(1).max(60).optional(),
      // Video and voice: the length the device measured (limits in server/media/assets.mjs); a video also brings the
      // poster frame the device cut from it; a voice message a coarse waveform for its bubble.
      durationMs: z.int().positive().max(600000).optional(),
      poster: z.strictObject({ mime: z.enum(['image/jpeg', 'image/webp']), bytes: z.int().positive() }).optional(),
      peaks: z.array(z.int().min(0).max(31)).max(64).optional(),
    }).refine(v => (v.viewRule === 'timer') === (v.viewSeconds !== undefined), { message: 'viewSeconds only with timer', path: ['viewSeconds'] })
      .refine(v => (v.kind === 'image') === (v.durationMs === undefined), { message: 'durationMs only for video and audio', path: ['durationMs'] })
      .refine(v => (v.kind === 'video') === (v.poster !== undefined), { message: 'poster only and always for video', path: ['poster'] })
      .refine(v => v.kind === 'audio' || v.peaks === undefined, { message: 'peaks only for audio', path: ['peaks'] }),
  },
  'media.commit': { profile: true, write: true, input: z.strictObject({ assetId: id }) },
  'media.remove': { profile: true, write: true, input: z.strictObject({ opId, assetId: id }) },
  'decide.approvals': { profile: true, write: false, input: z.strictObject({}) },
  'decide.approval': {
    profile: true, write: true,
    // «Вернуть на доработку» may carry a note (≤300, V21 returnSend); approving never does.
    input: z.strictObject({
      opId, approvalId: id, choice: z.enum(['approve', 'return']),
      comment: field('returnNote').optional(),
    }).refine(v => v.choice === 'return' || v.comment === undefined, { message: 'comment_only_when_returning', path: ['comment'] }),
  },
  'decide.cancel': { profile: true, write: true, input: z.strictObject({ opId, approvalId: id }) },
};

/** @typedef {keyof typeof platformCommands} PlatformAction */
