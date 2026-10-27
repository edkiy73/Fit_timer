// @ts-check
/** Platform commands of `POST /api/fe` (docs/server/S2-API.md §9). Shared by the server and the React client:
 * the client builds requests with these schemas, the server rejects anything they reject.
 * Inputs never carry an owner, role, age, email or account id; the acting profile comes from `X-Fe-Profile`. */
import * as z from 'zod';

export const id = z.uuid();
/** Client operation id: one per user intent, reused on retry. */
export const opId = z.uuid();

const media = {
  purpose: z.enum(['post', 'avatar', 'private', 'chat', 'gallery', 'community', 'event', 'verification']),
  kind: z.enum(['image', 'video']),
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
    }).refine(v => (v.viewRule === 'timer') === (v.viewSeconds !== undefined), { message: 'viewSeconds only with timer', path: ['viewSeconds'] }),
  },
  'media.commit': { profile: true, write: true, input: z.strictObject({ assetId: id }) },
  'media.remove': { profile: true, write: true, input: z.strictObject({ opId, assetId: id }) },
  'decide.approvals': { profile: true, write: false, input: z.strictObject({}) },
  'decide.approval': {
    profile: true, write: true,
    // «Вернуть на доработку» may carry a note (≤300, V21 returnSend); approving never does. Same rules as me.mjs `text`
    // (not imported: me.mjs imports this file).
    input: z.strictObject({
      opId, approvalId: id, choice: z.enum(['approve', 'return']),
      comment: z.string().max(600).transform(v => v.normalize('NFC').trim()).refine(v => v.length <= 300, { message: 'too_long' })
        .refine(v => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/.test(v), { message: 'bad_characters' }).optional(),
    }).refine(v => v.choice === 'return' || v.comment === undefined, { message: 'comment_only_when_returning', path: ['comment'] }),
  },
  'decide.cancel': { profile: true, write: true, input: z.strictObject({ opId, approvalId: id }) },
};

/** @typedef {keyof typeof platformCommands} PlatformAction */
