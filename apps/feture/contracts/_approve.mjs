// @ts-check
/** «Что подтверждает партнёр» (audit item 20, В8): what each partner of a couple asks to approve before the other's
 * action as the couple applies — a list instead of one trust mode. `private` (the private part, access, visibility and
 * Discover) always waits and is shown switched on, not switchable. The server checks each approval kind's point;
 * the app shows the same list. */
export const APPROVE_POINTS = /** @type {const} */ (['profile', 'posts', 'comments', 'likes', 'follows', 'links', 'communities', 'events', 'chats', 'private']);
/** @typedef {typeof APPROVE_POINTS[number]} ApprovePoint */
/** The points a partner may switch (everything but `private`). */
export const SWITCHABLE = /** @type {const} */ (['profile', 'posts', 'comments', 'likes', 'follows', 'links', 'communities', 'events', 'chats']);
/** What the old «approve the partner» mode covered, for couples that had it on. */
export const OLD_MODE = /** @type {const} */ (['profile', 'posts', 'links', 'communities', 'events', 'chats']);
/** Each approval kind's point. */
export const KIND_POINT = Object.freeze(/** @type {Record<string, ApprovePoint>} */ ({
  'profile.update': 'profile', 'profile.photos': 'profile', 'interests.set': 'profile', 'location.set': 'profile',
  'post.publish': 'posts', 'post.edit': 'posts',
  'reply.create': 'comments',
  'like.send': 'likes',
  'follow.set': 'follows',
  'link.propose': 'links', 'link.accept': 'links', 'link.visibility': 'links', 'link.change': 'links', 'link.changeAnswer': 'links',
  'community.create': 'communities', 'community.join': 'communities', 'community.update': 'communities',
  'event.submit': 'events', 'event.update': 'events', 'event.rsvp': 'events', 'event.apply': 'events',
  'chat.request': 'chats',
  'access.grant': 'private', 'private.on': 'private', 'profile.setVisibility': 'private',
}));
