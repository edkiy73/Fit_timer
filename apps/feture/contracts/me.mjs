// @ts-check
/** Slice C «Я» commands of `POST /api/fe` (docs/server/S2-CATALOG.md «C»). Shared by server and client. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { field } from './_text.mjs';
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

const aboutVisValue = z.enum(['only', 'granted', 'all']);
const aboutInput = {
  height: z.int().min(ABOUT.height.min).max(ABOUT.height.max).nullable().optional(),
  smoking: z.enum(ABOUT.smoking).nullable().optional(),
  alcohol: z.enum(ABOUT.alcohol).nullable().optional(),
  kids: z.enum(ABOUT.kids).nullable().optional(),
  langs: z.array(z.enum(ABOUT.langs)).max(ABOUT.langsMax).refine(v => new Set(v).size === v.length, { message: 'duplicates' }).optional(),
  zodiac: z.enum(ABOUT.zodiac).nullable().optional(),
  aboutVis: z.strictObject(Object.fromEntries(ABOUT_FACTS.map(k => [k, aboutVisValue.optional()]))).optional(),
};

export const PROFILE_SETTINGS = /** @type {const} */ ({
  discoverMode: discoverMode,
  acceptProfileLikes: z.boolean(),
  requestsFrom: z.enum(['all', 'matches', 'none']),
  linksFrom: z.enum(['all', 'follow', 'none']),
  mentionsFrom: z.enum(['all', 'follow', 'none']),
  activityVis: z.enum(['all', 'followers', 'off']),
  showLikes: z.boolean(),
  // «Кто может мне писать» (owner 29.10.2026): message requests from everyone / followers and people of my communities
  // and events / nobody (then only a mutual like opens a chat).
  messagesFrom: z.enum(['all', 'known', 'none']),
});

const channel = z.strictObject({ push: z.boolean(), email: z.boolean() });
export const notificationSettings = z.strictObject({
  mode: z.enum(['safe', 'normal']),
  push: z.boolean(),
  email: z.boolean(),
  digest: z.enum(['instant', 'daily', 'weekly']),
  quiet: z.strictObject({
    on: z.boolean(),
    from: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
    to: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  }),
  categories: z.strictObject({
    match: channel, likes: channel, req: channel, events: channel, replies: channel, follows: channel, groups: channel, news: channel,
  }),
  // V21 N02: the one-time «Не пропустить ответ?» offer was shown (never twice, on any device).
  offered: z.boolean().optional(),
});
/** K05 defaults (owner 29.10.2026): every category on, push and email; email comes as a daily digest; the lock screen
 * stays discreet («Безопасные»), quiet nights, likes grouped. An account that never saved its settings has no row and
 * follows these; one that saved keeps what it saved (20261029150000_fe_notification_defaults.sql moves untouched
 * category sets to the new defaults). */
export const NOTIFICATION_DEFAULTS = Object.freeze({
  mode: 'safe', push: true, email: true, digest: 'daily',
  quiet: { on: true, from: '23:00', to: '08:00' },
  categories: {
    match: { push: true, email: true }, likes: { push: true, email: true }, req: { push: true, email: true },
    events: { push: true, email: true }, replies: { push: true, email: true }, follows: { push: true, email: true },
    groups: { push: true, email: true }, news: { push: true, email: true },
  },
});

export const meCommands = {
  'catalog.get': { profile: false, write: false, input: z.strictObject({}) },
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
    }),
  },
  'profile.get': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'profile.update': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      rev: z.int().positive(),
      handle: handle.optional(),
      name: field('profileName').optional(),
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
  'place.submit': {
    profile: false, write: true, rate: { kind: 'place.submit', max: 10, window: '1 day' },
    input: z.strictObject({ opId, country: z.string().regex(/^[A-Z]{2}$/), name: field('placeName') }),
  },
  'interests.list': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'interests.set': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      topicId: code,
      value: z.int().min(1).max(10).optional(),
      mark: z.enum(['discuss', 'hard']).optional(),
      dir: z.array(z.enum(['give', 'get', 'watch'])).max(3).optional(),
      vis: z.enum(['public', 'granted', 'only']),
    }).refine(v => (v.value === undefined) !== (v.mark === undefined), { message: 'value_or_mark', path: ['value'] })
      .refine(v => v.mark === undefined || !v.dir?.length, { message: 'dir_with_mark', path: ['dir'] }),
  },
  'interests.remove': { profile: true, write: true, input: z.strictObject({ opId, topicId: code }) },
};
