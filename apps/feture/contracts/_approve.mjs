// @ts-check
/** «Что подтверждает партнёр» (audit item 20, В8): what each partner of a couple asks to approve before the other's
 * action as the couple applies — a list instead of one trust mode. Every point can be switched; a new couple starts
 * with `private` only. The server checks each approval kind's point (a visibility setting has its own, SETTING_POINT);
 * the app shows the same list. */
export const APPROVE_POINTS = /** @type {const} */ (['profile', 'posts', 'comments', 'likes', 'follows', 'links', 'communities', 'events', 'chats', 'private', 'discover', 'reach', 'seen']);
/** @typedef {typeof APPROVE_POINTS[number]} ApprovePoint */
/** The points a partner may switch: all of them (owner 05.11.2026: nothing is decided for the partners). */
export const SWITCHABLE = APPROVE_POINTS;
/** What a new couple's partners ask for by default: only the private part and its access (the rest is immediate). */
export const DEFAULT_SCOPE = /** @type {const} */ (['private']);
/** Each visibility setting's point (a widening of it waits when the partner asks for the point). */
export const SETTING_POINT = Object.freeze(/** @type {Record<string, ApprovePoint>} */ ({
  requestsFrom: 'private',
  discoverMode: 'discover', acceptProfileLikes: 'discover',
  messagesFrom: 'reach', linksFrom: 'reach', mentionsFrom: 'reach',
  activityVis: 'seen', showLikes: 'seen',
}));
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
  'access.grant': 'private', 'private.on': 'private',
}));
