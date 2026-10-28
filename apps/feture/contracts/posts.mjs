// @ts-check
/** Slice B: posts, replies, reactions, polls, photo marks, reports (S2-CATALOG «B», extract/feed-content.md). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { field } from './_text.mjs';

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const unique = (/** @type {z.ZodArray<any>} */ arr) => arr.refine(v => new Set(v).size === v.length, { message: 'duplicates' });

/** What a post is made of; the same shape for drafts, publishing and edits. */
export const postFields = z.strictObject({
  type: z.enum(['post', 'note']).default('post'),
  title: field('postTitle').optional(),
  body: field('postBody').default(''),
  audience: z.enum(['all', 'followers', 'granted', 'only']).default('all'),
  inFeed: z.boolean().default(true),
  topics: unique(z.array(code).max(3)).default([]),
  mediaIds: unique(z.array(id).max(6)).default([]),
  poll: z.strictObject({
    question: field('pollQuestion'),
    options: z.array(field('pollOption')).min(2).max(10)
      .refine(v => new Set(v.map(o => o.toLowerCase())).size === v.length, { message: 'duplicates' }),
  }).optional(),
  interests: unique(z.array(code).max(4)).default([]),
  albumId: id.optional(),
  tags: unique(z.array(id).max(10)).default([]),
  communityId: id.optional(),   // a discussion in a community (slice D)
}).refine(v => v.type === 'note' ? (v.title?.length ?? 0) >= 3 && v.body.length >= 20 : v.body.length <= 1000, { message: 'type_rules', path: ['body'] })
  .refine(v => v.body.length > 0 || v.mediaIds.length > 0 || !!v.poll || v.interests.length > 0, { message: 'empty_post', path: ['body'] })
  .refine(v => !v.tags.length || v.mediaIds.length > 0, { message: 'tags_need_media', path: ['tags'] })
  // An album is a gallery album: it holds posts with photos (V21 setAlbum shows the row only with media).
  .refine(v => !v.albumId || v.mediaIds.length > 0, { message: 'album_needs_media', path: ['albumId'] });

/** Kinds of posts for the feed and search filters (V21 TYPES): articles, text only, with photos, with a poll, with interests. */
export const POST_TYPES = /** @type {const} */ (['note', 'text', 'photo', 'poll', 'interests']);
/** What the «Подписки» tab shows (V21 FEED_KINDS); an empty list means everything. */
export const ACTIVITY_KINDS = /** @type {const} */ (['posts', 'likes', 'events', 'communities', 'follows']);

export const postsCommands = {
  'post.saveDraft': { profile: true, write: true, input: z.strictObject({ opId, postId: id.optional(), post: postFields }) },
  'post.publish': { profile: true, write: true, rate: { kind: 'post.publish', max: 50, window: '1 day' }, input: z.strictObject({ opId, postId: id }) },
  'post.edit': { profile: true, write: true, input: z.strictObject({ opId, postId: id, rev: z.int().positive(), post: postFields }) },
  'post.delete': { profile: true, write: true, input: z.strictObject({ opId, postId: id }) },
  'post.get': { profile: true, write: false, input: z.strictObject({ postId: id }) },
  'feed.list': {
    profile: true, write: false,
    input: z.strictObject({
      tab: z.enum(['forYou', 'following', 'popular']),
      topics: z.array(code).max(10).optional(),
      // Wave 3 (V21 feedFilters/ffEx/ffType/ffKind/popTag), all optional: hide topics, keep only some kinds of posts,
      // the «Подписки» activity stream, «Популярное» by the acting profile's own interests.
      excludeTopics: z.array(code).max(20).optional(),
      types: unique(z.array(z.enum(POST_TYPES)).max(POST_TYPES.length)).optional(),
      activity: unique(z.array(z.enum(ACTIVITY_KINDS)).max(ACTIVITY_KINDS.length)).optional(),
      myInterests: z.boolean().optional(),
      q: z.string().trim().min(2).max(80).optional(),
      cursor: z.string().max(200).optional(),
      limit: z.int().min(1).max(50).default(20),
    }).refine(v => !v.activity || v.tab === 'following', { message: 'following_only', path: ['activity'] })
      .refine(v => !v.myInterests || v.tab === 'popular', { message: 'popular_only', path: ['myInterests'] }),
  },
  'profile.posts': { profile: true, write: false, input: z.strictObject({ profileId: id, cursor: z.string().max(200).optional() }) },
  'me.posts': { profile: true, write: false, input: z.strictObject({}) },
  // Saved, not yet published edits of a published post (V21 saveDraft on a live post / discardPostEdits).
  'post.saveEdits': { profile: true, write: true, input: z.strictObject({ opId, postId: id, rev: z.int().positive(), post: postFields }) },
  'post.publishEdits': { profile: true, write: true, input: z.strictObject({ opId, postId: id }) },
  'post.discardEdits': { profile: true, write: true, input: z.strictObject({ opId, postId: id }) },
  // «Нравится» (V21 likers): who liked a post or a reply the viewer may see.
  'post.likers': {
    profile: true, write: false, rate: { kind: 'post.likers', max: 2000, window: '1 day' },
    input: z.strictObject({ targetType: z.enum(['post', 'reply']).default('post'), targetId: id, cursor: z.string().max(200).optional() }),
  },
  // Who chose a poll option (V21 pollPeople): after one's own vote, or for the author.
  'poll.voters': {
    profile: true, write: false, rate: { kind: 'poll.voters', max: 2000, window: '1 day' },
    input: z.strictObject({ postId: id, option: z.int().min(0).max(9), cursor: z.string().max(200).optional() }),
  },
  // «Убрать упоминание» (V21 unmentionMe): the name stays as plain text, it is no longer a link.
  'post.unmentionMe': { profile: true, write: true, input: z.strictObject({ opId, postId: id, replyId: id.optional() }) },
  'reaction.set': {
    profile: true, write: true, rate: { kind: 'reaction.set', max: 1000, window: '1 day' },
    input: z.strictObject({ opId, targetType: z.enum(['post', 'reply']), targetId: id, on: z.boolean() }),
  },
  'poll.vote': { profile: true, write: true, input: z.strictObject({ opId, postId: id, option: z.int().min(0).max(9).nullable() }) },
  'reply.create': {
    profile: true, write: true, rate: { kind: 'reply.create', max: 300, window: '1 day' },
    input: z.strictObject({ opId, postId: id, parentId: id.optional(), body: field('reply') }),
  },
  'reply.edit': { profile: true, write: true, input: z.strictObject({ opId, replyId: id, rev: z.int().positive(), body: field('reply') }) },
  'reply.delete': { profile: true, write: true, input: z.strictObject({ opId, replyId: id }) },
  'post.replies': { profile: true, write: false, input: z.strictObject({ postId: id }) },
  'tag.answer': { profile: true, write: true, input: z.strictObject({ opId, postId: id, answer: z.enum(['ok', 'no', 'remove']) }) },
  'tag.object': { profile: true, write: true, rate: { kind: 'tag.object', max: 20, window: '1 day' }, input: z.strictObject({ opId, postId: id }) },
  'report.create': {
    profile: true, write: true, rate: { kind: 'report.create', max: 10, window: '1 day' },
    input: z.strictObject({
      opId,
      // A chat is reported as its conversation with the selected messages (Q27).
      targetType: z.enum(['profile', 'post', 'reply', 'community', 'event', 'conversation']),
      targetId: id,
      messageIds: z.array(id).min(1).max(20).transform(v => [...new Set(v)]).optional(),
      reason: z.enum(['threat', 'private', 'minor', 'spam', 'other']),
      details: field('reportDetails').default(''),
      alsoBlock: z.boolean().default(false),
    }).refine(v => (v.targetType === 'conversation') === !!v.messageIds, { message: 'messages_for_chats_only', path: ['messageIds'] }),
  },
};
