// @ts-check
/** Slice D1: communities (S2-CATALOG «D. Сообщества», extract/communities-events.md). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { field, textLength } from './_text.mjs';
import { PLATE_KEYS } from './_plates.mjs';

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const fields = {
  name: field('communityName'),
  description: field('communityDescription'),
  topics: z.array(code).min(1).max(3).refine(v => new Set(v).size === v.length, { message: 'duplicates' }),
  privacy: z.enum(['open', 'closed', 'hidden']),
  joinQuestion: field('joinQuestion').nullable().optional(),
  rules: z.array(field('communityRule')).min(1).max(20)
    .refine(v => textLength(v.join('')) <= 1000, { message: 'too_long' }),
  placeId: id.nullable().optional(),
  coverAssetId: id.nullable().optional(),
  plate: z.enum(PLATE_KEYS).default('lilac'),
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
      placeId: fields.placeId, coverAssetId: fields.coverAssetId, plate: z.enum(PLATE_KEYS).optional(),
    }),
  },
  'community.get': { profile: true, write: false, input: z.strictObject({ communityId: id, invite: z.string().max(80).optional() }) },
  'community.catalog': {
    profile: true, write: false,
    // `q` (V21 gFilters): words in the name or description.
    input: z.strictObject({ topics: z.array(code).max(10).optional(), privacy: z.enum(['open', 'closed']).optional(), q: z.string().trim().min(2).max(80).optional(), cursor: z.string().max(200).optional() }),
  },
  'community.mine': { profile: true, write: false, input: z.strictObject({}) },
  'community.join': {
    profile: true, write: true, rate: { kind: 'community.join', max: 50, window: '1 day' },
    input: z.strictObject({ opId, communityId: id, rulesAccepted: z.literal(true), answer: field('joinAnswer').default(''), invite: z.string().max(80).optional() }),
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
  // 20 a page (V21 cMoreMembers); `next` continues.
  'community.members': { profile: true, write: false, input: z.strictObject({ communityId: id, cursor: z.string().max(200).optional() }) },
  // «Популярное за неделю» (V21 popularDiscs): in one community, or across the communities the viewer reads (feed
  // «Популярное»: «Обсуждают в сообществах»), optionally in one topic. Hosts can keep a discussion out (discussion.host).
  'discussions.popular': {
    profile: true, write: false,
    input: z.strictObject({ communityId: id.optional(), topic: code.optional(), limit: z.int().min(1).max(20).default(3) }),
  },
  'community.invite': { profile: true, write: true, input: z.strictObject({ opId, communityId: id, revokeAll: z.boolean().optional() }) },
  'community.discussions': { profile: true, write: false, input: z.strictObject({ communityId: id, cursor: z.string().max(200).optional() }) },
  'discussion.host': {
    profile: true, write: true,
    input: z.strictObject({ opId, postId: id, change: z.enum(['pin', 'unpin', 'excludePopular', 'includePopular', 'remove']) }),
  },
  'staff.communityQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.communityDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, communityId: id, rev: z.int().positive(), decision: z.enum(['approve', 'reject']), reason: field('reason').default('') }),
  },
};
