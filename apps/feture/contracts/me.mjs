// @ts-check
/** Slice C «Я» commands of `POST /api/fe` (docs/server/S2-CATALOG.md «C»). Shared by server and client. */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

/** Nickname: 3–20 of [A-Za-z0-9_.], starts and ends with a letter or digit, no '..', at least one letter (V21 AUTH-001). */
export const handle = z.string().trim().min(3).max(20)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9_.]*[A-Za-z0-9])?$/)
  .refine(v => !v.includes('..') && /[A-Za-z]/.test(v), { message: 'handle_format' });
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const codes = (/** @type {number} */ max) => z.array(code).max(max).refine(v => new Set(v).size === v.length, { message: 'duplicates' });
/** Plain text from people: NFC, no control or bidi-override characters (input-safety checklist). */
export const text = (/** @type {number} */ max) => z.string().max(max * 2).transform(v => v.normalize('NFC').trim())
  .refine(v => v.length <= max, { message: 'too_long' })
  .refine(v => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩​-‏﻿]/.test(v), { message: 'bad_characters' });
/** Single-line text for names: also no line breaks, tabs or invisible/blank-looking characters, and not blank. */
export const line = (/** @type {number} */ max) => text(max)
  .refine(v => !/[\t\n\r\u00AD\u034F\u061C\u115F\u1160\u180E\u2028\u2029\u2060-\u2064\u2800\u3164\uFE00-\uFE0F\uFFA0\u{E0000}-\u{E007F}]/u.test(v), { message: 'bad_characters' })
  .refine(v => v.replace(/\s/g, '').length > 0, { message: 'blank' });
const birthDate = z.iso.date();
const detailsVis = z.enum(['only', 'granted', 'all']);
const discoverMode = z.enum(['visible', 'hidden', 'off']);

export const PROFILE_SETTINGS = /** @type {const} */ ({
  discoverMode: discoverMode,
  acceptProfileLikes: z.boolean(),
  requestsFrom: z.enum(['all', 'matches', 'none']),
  linksFrom: z.enum(['all', 'follow', 'none']),
  mentionsFrom: z.enum(['all', 'follow', 'none']),
  activityVis: z.enum(['all', 'followers', 'off']),
  showLikes: z.boolean(),
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
});
/** V21 K05 defaults: discreet lock-screen text, quiet nights, likes grouped. */
export const NOTIFICATION_DEFAULTS = Object.freeze({
  mode: 'safe', push: true, email: true, digest: 'daily',
  quiet: { on: true, from: '23:00', to: '08:00' },
  categories: {
    match: { push: true, email: true }, likes: { push: true, email: false }, req: { push: true, email: true },
    events: { push: true, email: true }, replies: { push: true, email: false }, follows: { push: true, email: false },
    groups: { push: false, email: false }, news: { push: false, email: true },
  },
});

export const meCommands = {
  'catalog.get': { profile: false, write: false, input: z.strictObject({}) },
  'nick.check': { profile: false, write: false, rate: { kind: 'nick.check', max: 30, window: '10 minutes' }, input: z.strictObject({ handle: z.string().max(40) }) },
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
      discover: z.enum(['visible', 'off']),
    }),
  },
  'profile.get': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'profile.update': {
    profile: true, write: true,
    input: z.strictObject({
      opId,
      rev: z.int().positive(),
      handle: handle.optional(),
      name: line(60).optional(),
      bio: text(500).optional(),
      cityId: id.nullable().optional(),
      showAge: z.boolean().optional(),
      detailsVis: detailsVis.optional(),
      genders: codes(5).optional(), orients: codes(5).optional(), roles: codes(5).optional(),
      formats: codes(5).optional(), seeks: codes(9).optional(),
      status: code.nullable().optional(),
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
    profile: false, write: true, rate: { kind: 'place.submit', max: 5, window: '1 day' },
    input: z.strictObject({ opId, country: z.string().regex(/^[A-Z]{2}$/), name: line(80).refine(v => v.length >= 2, { message: 'too_short' }) }),
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
  'interests.history': {
    profile: true, write: false,
    input: z.strictObject({ limit: z.int().min(1).max(50).default(30), cursor: z.string().max(200).optional() }),
  },
};
