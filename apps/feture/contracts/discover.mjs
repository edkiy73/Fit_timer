// @ts-check
/** Slice F: Discover, likes and matches (S2-CATALOG «F», extract/people-discover-chats.md §2.1, §3). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const codes = z.array(code).max(10).refine(v => new Set(v).size === v.length, { message: 'duplicates' }).default([]);
/** The Discover filter (V21 dfApply); «рядом» needs a location and comes later. */
export const filterFields = z.strictObject({
  show: z.enum(['all', 'people', 'pairs']).default('all'),
  ageMin: z.int().min(18).max(99).default(18),
  ageMax: z.int().min(18).max(99).default(99),
  cityId: id.nullable().default(null),
  genders: codes, orients: codes, formats: codes, seeks: codes, roles: codes, topics: codes,
}).refine(v => v.ageMin <= v.ageMax, { message: 'age_range', path: ['ageMin'] });
const source = z.enum(['discover', 'profile', 'likes']);

export const discoverCommands = {
  'discover.filter': { profile: true, write: false, input: z.strictObject({}) },
  'discover.setFilter': { profile: true, write: true, input: z.strictObject({ opId, filter: filterFields }) },
  'discover.count': { profile: true, write: false, rate: { kind: 'discover.count', max: 300, window: '1 day' }, input: z.strictObject({ filter: filterFields }) },
  'discover.deck': { profile: true, write: false, input: z.strictObject({ limit: z.int().min(1).max(20).default(10) }) },
  'discover.decide': {
    profile: true, write: true, rate: { kind: 'discover.decide', max: 1000, window: '1 day' },
    input: z.strictObject({ opId, profileId: id, decision: z.enum(['like', 'pass']) }),
  },
  'discover.undo': { profile: true, write: true, input: z.strictObject({ opId }) },
  'discover.restore': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'discover.history': { profile: true, write: false, input: z.strictObject({ kind: z.enum(['all', 'like', 'pass']).default('all') }) },
  'like.send': {
    profile: true, write: true, rate: { kind: 'like.send', max: 300, window: '1 day' },
    input: z.strictObject({ opId, profileId: id, source: source.exclude(['discover']) }),
  },
  'like.withdraw': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'like.dismiss': { profile: true, write: true, input: z.strictObject({ opId, profileId: id }) },
  'likes.incoming': { profile: true, write: false, input: z.strictObject({}) },
  'likes.outgoing': { profile: true, write: false, input: z.strictObject({}) },
  'matches.list': { profile: true, write: false, input: z.strictObject({}) },
  'match.end': { profile: true, write: true, input: z.strictObject({ opId, profileId: id, revokeMyGrant: z.boolean().default(false) }) },
};
