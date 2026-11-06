// @ts-check
/** Slice C «Я» commands of `POST /api/fe` (docs/server/S2-CATALOG.md «C»). Shared by server and client. */
import * as z from 'zod';
import { MESSAGE_POINTS } from './_messages.mjs';
import { id, opId } from './platform.mjs';
import { field, fieldOrEmpty } from './_text.mjs';
import { ABOUT, ABOUT_FACTS } from './_about.mjs';

export { ABOUT, ABOUT_FACTS };

/** Nickname: 3–20 of [A-Za-z0-9_.], starts and ends with a letter or digit, no '..', at least one letter (V21 AUTH-001). */
export const handle = z.string().trim().min(3).max(20)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9_.]*[A-Za-z0-9])?$/)
  .refine(v => !v.includes('..') && /[A-Za-z]/.test(v), { message: 'handle_format' });
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const codes = (/** @type {number} */ max) => z.array(code).max(max).refine(v => new Set(v).size === v.length, { message: 'duplicates' });
const birthDate = z.iso.date();
const detailsVis = z.enum(['only', 'granted', 'all']);
const discoverMode = z.enum(['visible', 'hidden', 'off']);

const aboutInput = {
  height: z.int().min(ABOUT.height.min).max(ABOUT.height.max).nullable().optional(),
  smoking: z.enum(ABOUT.smoking).nullable().optional(),
  alcohol: z.enum(ABOUT.alcohol).nullable().optional(),
  kids: z.enum(ABOUT.kids).nullable().optional(),
  langs: z.array(z.enum(ABOUT.langs)).max(ABOUT.langsMax).refine(v => new Set(v).size === v.length, { message: 'duplicates' }).optional(),
  zodiac: z.enum(ABOUT.zodiac).nullable().optional(),
};

export const PROFILE_SETTINGS = /** @type {const} */ ({
  discoverMode: discoverMode,
  acceptProfileLikes: z.boolean(),
  requestsFrom: z.enum(['all', 'matches', 'none']),
  linksFrom: z.enum(['all', 'follow', 'none']),
  mentionsFrom: z.enum(['all', 'follow', 'none']),
  activityVis: z.enum(['all', 'followers', 'off']),
  showLikes: z.boolean(),
  // «Кто может написать первым» (audit item 50): who may send a message request — any of these, or «Все» alone;
  // none picked: only a mutual like opens a chat (it always does).
  messagesFrom: z.array(z.enum(MESSAGE_POINTS)).max(MESSAGE_POINTS.length)
    .refine(v => new Set(v).size === v.length, { message: 'duplicates' }).refine(v => !v.includes('all') || v.length === 1, { message: 'all_alone' }),
});

const channel = z.strictObject({ push: z.boolean(), email: z.boolean() });
export const notificationSettings = z.strictObject({
  mode: z.enum(['safe', 'normal']),
  push: z.boolean(),
  email: z.boolean(),
  // The digest of everything that is not urgent (docs/notifications.md «Email»): every morning, once a week, or never.
  digest: z.enum(['daily', 'weekly', 'off']),
  quiet: z.strictObject({
    on: z.boolean(),
    from: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
    to: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  }),
  // contracts/notifications.mjs SETTING_CATS: the category of every catalog entry (PUSH_SETTING).
  categories: z.strictObject({
    messages: channel, match: channel, likes: channel, req: channel, decide: channel, pair: channel, events: channel, replies: channel,
    follows: channel, groups: channel, news: channel,
  }),
  // V21 N02: the one-time «Не пропустить ответ?» offer was shown (never twice, on any device).
  offered: z.boolean().optional(),
});
/** K05 defaults (owner 29.10.2026): every category on, push and email; email comes as a daily digest; the lock screen
 * stays discreet («Безопасные»), quiet nights, likes grouped. An account that never saved its settings has no row and
 * follows these; one that saved keeps what it saved (20261103230000_fe_notify_delivery.sql added «Сообщения»,
 * «Решения», «Пара»). */
export const NOTIFICATION_DEFAULTS = Object.freeze({
  mode: 'safe', push: true, email: true, digest: 'daily',
  quiet: { on: true, from: '23:00', to: '08:00' },
  categories: {
    messages: { push: true, email: true }, match: { push: true, email: true }, likes: { push: true, email: true }, req: { push: true, email: true },
    decide: { push: true, email: true }, pair: { push: true, email: true }, events: { push: true, email: true }, replies: { push: true, email: true },
    follows: { push: true, email: true }, groups: { push: true, email: true }, news: { push: true, email: true },
  },
});

/** The settings in force for a stored row (or none): the defaults, with what the person saved on top; a category the
 * row predates takes its default. One reading for the screen, push and email.
 * @param {any} saved @returns {z.infer<typeof notificationSettings>} */
export function notificationSettingsOf(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const digest = ['daily', 'weekly', 'off'].includes(s.digest) ? s.digest : NOTIFICATION_DEFAULTS.digest;
  return /** @type {any} */ ({ ...NOTIFICATION_DEFAULTS, ...s, digest,
    quiet: { ...NOTIFICATION_DEFAULTS.quiet, ...(s.quiet ?? {}) },
    categories: Object.fromEntries(Object.entries(NOTIFICATION_DEFAULTS.categories).map(([k, v]) => [k, { ...v, ...(s.categories?.[k] ?? {}) }])) });
}

export const meCommands = {
  'catalog.get': { profile: false, write: false, input: z.strictObject({}) },
  // The city catalog is searched on the server, never sent whole (owner 06.11.2026). An empty search lists the popular
  // cities (or, with a country, its biggest ones).
  'place.search': {
    profile: false, write: false, rate: { kind: 'place.search', max: 600, window: '10 minutes' },
    input: z.strictObject({ q: z.string().trim().max(60).default(''), country: z.string().regex(/^[A-Z]{2}$/).optional(), limit: z.int().min(1).max(60).default(40) }),
  },
  'place.get': { profile: false, write: false, input: z.strictObject({ ids: z.array(id).min(1).max(100) }) },
  'place.nearest': { profile: false, write: false, input: z.strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }) },
  'nick.check': { profile: false, write: false, rate: { kind: 'nick.check', max: 100, window: '10 minutes' }, input: z.strictObject({ handle: z.string().max(40) }) },
  // No idempotency ledger: registration is idempotent by nature, and an under-18 answer must leave no trace.
  'account.create': {
    profile: false, write: true, ledger: false,
    input: z.strictObject({
      opId,
      handle,
      birthDate,
      locale: z.enum(['ru', 'en']),
      documents: z.array(z.strictObject({ id, contentHash: z.string().regex(/^[a-f0-9]{64}$/) })).max(20),
      newsOptIn: z.boolean(),
      // «Как тебя называть» (optional, any name; empty — the nick is shown).
      name: field('profileName').optional(),
    }),
  },
  'onboarding.complete': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      detailsVis,
      genders: codes(5), orients: codes(5), roles: codes(5), formats: codes(5), seeks: codes(9),
      status: code.nullable(),
      discover: z.enum(['visible', 'off']).default('off'),
      // The city picked (or found by the phone's position, which never leaves the phone) on the sign-up step.
      cityId: id.nullable().default(null),
    }),
  },
  'profile.get': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'profile.update': {
    profile: true, write: true, rate: { kind: 'profile.update', max: 300, window: '1 day' },
    input: z.strictObject({
      opId,
      rev: z.int().positive(),
      handle: handle.optional(),
      // Empty clears the chosen name: the nick (a couple: the partners' names) is shown instead.
      name: fieldOrEmpty('profileName').optional(),
      bio: field('bio').optional(),
      cityId: id.nullable().optional(),
      showAge: z.boolean().optional(),
      detailsVis: detailsVis.optional(),
      genders: codes(5).optional(), orients: codes(5).optional(), roles: codes(5).optional(),
      formats: codes(5).optional(), seeks: codes(9).optional(),
      status: code.nullable().optional(),
      ...aboutInput,
    }),
  },
  'profile.settings': { profile: true, write: false, input: z.strictObject({}) },
  'profile.setVisibility': {
    profile: true, write: true,
    input: z.discriminatedUnion('setting', /** @type {any} */ (Object.entries(PROFILE_SETTINGS).map(([k, v]) =>
      z.strictObject({ opId, setting: z.literal(k), value: v })))),
  },
  'settings.get': { profile: false, write: false, input: z.strictObject({}) },
  'settings.update': {
    profile: false, write: true,
    input: z.strictObject({
      opId,
      locale: z.enum(['system', 'ru', 'en']).optional(),
      chatBlur: z.boolean().optional(),
      newsOptIn: z.boolean().optional(),
    }),
  },
  'notifications.settings.get': { profile: false, write: false, input: z.strictObject({}) },
  'notifications.settings.update': { profile: false, write: true, input: z.strictObject({ opId, settings: notificationSettings }) },
  // «Нужно решить» → the relationship status: «Оставить» as it is (the card goes, on every device).
  'profile.statusKeep': { profile: false, write: true, input: z.strictObject({ opId }) },
  'interests.list': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'interests.set': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      topicId: code,
      value: z.int().min(1).max(10).optional(),
      mark: z.enum(['discuss', 'hard']).optional(),
      dir: z.array(z.enum(['give', 'get', 'watch'])).max(3).optional(),
      // Ignored: every interest is public (owner 05.11.2026); kept for clients that still send it.
      vis: z.enum(['public', 'granted', 'only']).optional(),
    }).refine(v => (v.value === undefined) !== (v.mark === undefined), { message: 'value_or_mark', path: ['value'] })
      .refine(v => v.mark === undefined || !v.dir?.length, { message: 'dir_with_mark', path: ['dir'] }),
  },
  'interests.remove': { profile: true, write: true, input: z.strictObject({ opId, topicId: code }) },
};
