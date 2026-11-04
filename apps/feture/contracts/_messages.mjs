// @ts-check
/** «Кто может написать первым» (audit item 50): my followers, people I follow, mutual follows, a community in common,
 * an event in common; or everyone («all», alone). Nothing picked: only a mutual like opens a chat (it always does).
 * The server checks it (chats.mjs chatRequestBlocker); the app shows the same list. */
export const MESSAGE_POINTS = /** @type {const} */ (['followers', 'following', 'mutual', 'community', 'event', 'all']);
/** What a new profile starts with: one follow is not enough, a context in common is. */
export const MESSAGES_DEFAULT = /** @type {const} */ (['mutual', 'community', 'event']);
