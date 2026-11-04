// @ts-check
/** S4 staff commands of `POST /api/fe` (docs/server/S4-MODERATION.md). Roles are checked on the server only. */
import * as z from 'zod';
import { id, opId, queuePaging } from './platform.mjs';

/** Six digits from the authenticator app, or a recovery code (xxxxx-xxxxx); spaces are dropped. */
export const factorCode =z.string().max(40).transform(v => v.replace(/\s/g, '')).pipe(z.string().regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/));

/** The legal documents (public.feture_document_*): their keys as the database checks them. */
export const DOCUMENT_KEYS = /** @type {const} */ (['terms', 'privacy', 'community', 'adult-content', 'complaints', 'age', 'retention', 'cookies', 'copyright']);

export const staffCommands = {
  'staff.me': { profile: false, write: false, input: z.strictObject({}) },
  // Second factor (server/second-factor.mjs). Never in the replay ledger (`ledger: false`): the secret and the recovery
  // codes must not be stored with the result. Wrong codes are answered 200 {verified: false, reason, left, lockedUntil}
  // so the counted failure commits; the rate below only bounds the calls.
  'staff.totpStart': { profile: false, write: true, ledger: false, input: z.strictObject({}), rate: { kind: 'factor.start', max: 20, window: '1 hour' } },
  'staff.totpConfirm': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  'staff.totpVerify': { profile: false, write: true, ledger: false, input: z.strictObject({ code: factorCode }), rate: { kind: 'factor.check', max: 60, window: '1 hour' } },
  'staff.totpReset': { profile: false, write: true, input: z.strictObject({ opId, handle: z.string().trim().min(1).max(40) }) },
  // «Документы» (owner 05.11.2026): legal documents — a draft is saved, a reviewed version is published (fresh code).
  'staff.documents': { profile: false, write: false, input: z.strictObject({}) },
  'staff.documentSave': {
    profile: false, write: true,
    input: z.strictObject({
      opId, key: z.enum(DOCUMENT_KEYS), locale: z.enum(['ru', 'en']), expectedRevision: z.int().min(0),
      title: z.string().trim().min(1).max(160), requiresAccept: z.boolean(),
      blocks: z.array(z.discriminatedUnion('type', [
        z.strictObject({ type: z.literal('heading'), text: z.string().min(1).max(4000) }),
        z.strictObject({ type: z.literal('paragraph'), text: z.string().min(1).max(4000) }),
        z.strictObject({ type: z.literal('list'), items: z.array(z.string().min(1).max(1200)).min(1).max(30) }),
      ])).min(1).max(200),
    }),
  },
  'staff.documentPublish': {
    profile: false, write: true,
    input: z.strictObject({ opId, key: z.enum(DOCUMENT_KEYS), locale: z.enum(['ru', 'en']), revision: z.int().positive(), reviewed: z.literal(true) }),
  },
  // The word filter (owner 05.11.2026): words that send a text to the report queue.
  'staff.words': { profile: false, write: false, input: z.strictObject({}) },
  'staff.wordSet': {
    profile: false, write: true,
    input: z.strictObject({ opId, word: z.string().trim().toLowerCase().min(2).max(60).regex(/^[\p{L}\p{N} -]+$/u), on: z.boolean() }),
  },
  // «Темы» (owner 05.11.2026): the interests catalog, edited in the staff area instead of migrations.
  'staff.topics': { profile: false, write: false, input: z.strictObject({}) },
  'staff.topicSave': {
    profile: false, write: true,
    input: z.strictObject({
      opId, id: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/), create: z.boolean().default(false),
      categoryId: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
      ru: z.string().trim().min(1).max(40), en: z.string().trim().min(1).max(40),
      descRu: z.string().trim().max(300).nullable().default(null), descEn: z.string().trim().max(300).nullable().default(null),
      hidden: z.boolean(),
    }),
  },
  // «Сотрудники» (owner 05.11.2026): who has which role; only the owner reads it.
  'staff.team': { profile: false, write: false, input: z.strictObject({}) },
  'staff.grant': {
    profile: false, write: true,
    input: z.strictObject({ opId, handle: z.string().trim().max(40), role: z.enum(['lead', 'moderator', 'verifier', 'auditor', 'support']), grant: z.boolean() }),
  },
  'staff.mediaQueue': { profile: false, write: false, input: z.strictObject({ ...queuePaging }) },
  'staff.mediaView': { profile: false, write: true, ledger: false, input: z.strictObject({ assetId: id }) },
  'staff.mediaDecide': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      assetId: id,
      decision: z.enum(['approve', 'reject']),
      explicit: z.boolean().optional(),
      reason: z.enum(['csam_suspected', 'minor', 'not_a_person', 'violence', 'private_material', 'spam', 'invalid', 'other']).optional(),
    }).refine(v => v.decision === 'reject' ? !!v.reason : v.explicit !== undefined, { message: 'approve needs a label, reject needs a reason' }),
  },
  // Dating on/off for everyone (owner/lead); switching on tells those who asked «Сообщить о запуске».
  'staff.datingSwitch': { profile: false, write: true, input: z.strictObject({ opId, on: z.boolean() }) },
  'staff.journal': {
    profile: false, write: false,
    input: z.strictObject({
      targetId: id.optional(), staffAccountId: id.optional(),
      // Everything about one person (owner 05.11.2026): entries whose object is theirs.
      personId: id.optional(), what: z.string().regex(/^[a-z]+(\.[a-zA-Z]+)+$/).max(60).optional(),
      limit: z.int().min(1).max(100).default(50), after: z.string().max(400).optional(),
    }),
  },
};

/** The size of every queue the signed-in staff member may open, and of the support requests waiting (server/commands/staff-counts.mjs). */
export const staffCountsCommands = {
  'staff.counts': { profile: false, write: false, input: z.strictObject({}) },
};
