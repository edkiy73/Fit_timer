// @ts-check
/** Slice D1: communities (S2-CATALOG «D. Сообщества», extract/communities-events.md). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { line, text } from './me.mjs';

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const fields = {
  name: line(50).refine(v => v.length >= 3, { message: 'too_short' }),
  description: text(500).refine(v => v.length >= 20, { message: 'too_short' }),
  topics: z.array(code).min(1).max(3).refine(v => new Set(v).size === v.length, { message: 'duplicates' }),
  privacy: z.enum(['open', 'closed', 'hidden']),
  joinQuestion: text(120).nullable().optional(),
  rules: z.array(text(300).refine(v => v.length > 0, { message: 'empty' })).min(1).max(20)
    .refine(v => v.join('').length <= 1000, { message: 'too_long' }),
  placeId: id.nullable().optional(),
  coverAssetId: id.nullable().optional(),
  plate: z.enum(['lilac', 'rose', 'sea', 'amber', 'moss', 'coal']).default('lilac'),
};

export const communitiesCommands = {
  'community.create': {
    profile: true, write: true, rate: { kind: 'community.create', max: 5, window: '1 day' },
    input: z.strictObject({ opId, ...fields }).refine(v => v.privacy !== 'open' || !v.joinQuestion, { message: 'question_only_when_closed', path: ['joinQuestion'] }),
  },
  'community.update': {
    profile: true, write: true,
    input: z.strictObject({
      opId, communityId: id, rev: z.int().positive(),
      name: fields.name.optional(), description: fields.description.optional(), topics: fields.topics.optional(),
      privacy: fields.privacy.optional(), joinQuestion: fields.joinQuestion, rules: fields.rules.optional(),
      placeId: fields.placeId, coverAssetId: fields.coverAssetId, plate: z.enum(['lilac', 'rose', 'sea', 'amber', 'moss', 'coal']).optional(),
    }),
  },
  'community.get': { profile: true, write: false, input: z.strictObject({ communityId: id, invite: z.string().max(80).optional() }) },
  'community.catalog': {
    profile: true, write: false,
    input: z.strictObject({ topics: z.array(code).max(10).optional(), privacy: z.enum(['open', 'closed']).optional(), cursor: z.string().max(200).optional() }),
  },
  'community.mine': { profile: true, write: false, input: z.strictObject({}) },
  'community.join': {
    profile: true, write: true, rate: { kind: 'community.join', max: 50, window: '1 day' },
    input: z.strictObject({ opId, communityId: id, rulesAccepted: z.literal(true), answer: text(300).default(''), invite: z.string().max(80).optional() }),
  },
  'community.requestWithdraw': { profile: true, write: true, input: z.strictObject({ opId, requestId: id }) },
  'community.requests': { profile: true, write: false, input: z.strictObject({ communityId: id, tab: z.enum(['pending', 'history']).default('pending') }) },
  'community.requestDecide': { profile: true, write: true, input: z.strictObject({ opId, requestId: id, rev: z.int().positive(), approve: z.boolean() }) },
  'community.leave': { profile: true, write: true, input: z.strictObject({ opId, communityId: id }) },
  'community.member': {
    profile: true, write: true,
    input: z.strictObject({ opId, communityId: id, profileId: id, change: z.enum(['host', 'unhost', 'readOnly', 'canWrite', 'remove']) }),
  },
  'community.self': {
    profile: true, write: true,
    input: z.strictObject({ opId, communityId: id, listed: z.boolean().optional(), muted: z.boolean().optional() }),
  },
  'community.members': { profile: true, write: false, input: z.strictObject({ communityId: id }) },
  'community.invite': { profile: true, write: true, input: z.strictObject({ opId, communityId: id, revokeAll: z.boolean().optional() }) },
  'community.discussions': { profile: true, write: false, input: z.strictObject({ communityId: id, cursor: z.string().max(200).optional() }) },
  'discussion.host': {
    profile: true, write: true,
    input: z.strictObject({ opId, postId: id, change: z.enum(['pin', 'unpin', 'excludePopular', 'includePopular', 'remove']) }),
  },
  'staff.communityQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.communityDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, communityId: id, decision: z.enum(['approve', 'reject']), reason: text(300).default('') }),
  },
};
