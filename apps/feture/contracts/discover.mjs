// @ts-check
/** Slice F: Discover, likes and matches (S2-CATALOG «F», extract/people-discover-chats.md §2.1, §3). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const codes = z.array(code).max(10).refine(v => new Set(v).size === v.length, { message: 'duplicates' }).default([]);
/** The Discover filter (V21 dfApply). `placeMode` 'nearby' (V21 dfPlaceMode «Рядом») looks within `radiusKm` of the
 * location the viewer shared (location.set) instead of a city. */
export const filterFields = z.strictObject({
  show: z.enum(['all', 'people', 'pairs']).default('all'),
  ageMin: z.int().min(18).max(99).default(18),
  ageMax: z.int().min(18).max(99).default(99),
  cityId: id.nullable().default(null),
  placeMode: z.enum(['city', 'nearby']).default('city'),
  radiusKm: z.int().min(5).max(200).default(25),
  genders: codes, orients: codes, formats: codes, seeks: codes, roles: codes, topics: codes,
}).refine(v => v.ageMin <= v.ageMax, { message: 'age_range', path: ['ageMin'] });
const source = z.enum(['discover', 'profile', 'likes']);
export const DECIDE_RATES = { like: { kind: 'discover.decide', max: 1000, window: '1 day' }, pass: { kind: 'discover.pass', max: 25000, window: '1 day' } };
/** @param {{decision: 'like' | 'pass'}} input */
const decideRate = input => DECIDE_RATES[input.decision];

export const discoverCommands = {
  'discover.filter': { profile: true, write: false, input: z.strictObject({}) },
  'discover.setFilter': { profile: true, write: true, input: z.strictObject({ opId, filter: filterFields }) },
  'discover.count': { profile: true, write: false, rate: { kind: 'discover.count', max: 3000, window: '1 day' }, input: z.strictObject({ filter: filterFields }) },
  'discover.deck': { profile: true, write: false, input: z.strictObject({ limit: z.int().min(1).max(20).default(10) }) },
  // Everything under a Discover card's photo in one read (owner 28.10.2026: the card scrolls like a native app): the
  // profile, «что общего», links, interests, the private part, posts and activity — each as its own command answers it
  // (null when that part is not for the viewer). The app asks it once per card, when the card is next in the deck.
  'discover.card': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  // Swiping at a browsing pace never meets a limit (owner 28.10.2026): a pass is cheap (25000 a day, abuse only), a like
  // reaches someone, so 1000 a day. Both are per day, never per-minute bursts (the account's 600 requests a minute stay).
  'discover.decide': {
    profile: true, write: true, rate: decideRate,
    input: z.strictObject({ opId, profileId: id, decision: z.enum(['like', 'pass']) }),
  },
  'discover.undo': { profile: true, write: true, input: z.strictObject({ opId }) },
  'discover.restore': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'discover.history': { profile: true, write: false, input: z.strictObject({ kind: z.enum(['all', 'like', 'pass']).default('all') }) },
  'like.send': {
    profile: true, write: true, rate: { kind: 'like.send', max: 600, window: '1 day' },
    input: z.strictObject({ opId, profileId: id, source: source.exclude(['discover']) }),
  },
  'like.withdraw': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'like.dismiss': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'likes.incoming': { profile: true, write: false, input: z.strictObject({}) },
  'likes.outgoing': { profile: true, write: false, input: z.strictObject({}) },
  'matches.list': { profile: true, write: false, input: z.strictObject({}) },
  // «Рядом» (V21 dfGeo): only when the person shares it; stored rounded to ~5 km, never shown to others.
  'location.set': {
    profile: true, write: true, rate: { kind: 'location.set', max: 100, window: '1 day' },
    input: z.strictObject({ opId, lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  },
  'location.clear': { profile: true, write: true, input: z.strictObject({ opId }) },
  'location.get': { profile: true, write: false, input: z.strictObject({}) },
  // Dating switched off by staff: «Сообщить о запуске» (V21 notifyDating).
  'dating.status': { profile: false, write: false, input: z.strictObject({}) },
  'dating.notify': { profile: false, write: true, input: z.strictObject({ opId, on: z.boolean() }) },
  'match.end': { profile: true, write: true, input: z.strictObject({ opId, profileId: id, revokeMyGrant: z.boolean().default(false) }) },
};
