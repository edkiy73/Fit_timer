// @ts-check
/** What a restriction can limit (audit item 6), one word per point; the server checks each with feture.restricted_in.
 * Leaving, cancelling, withdrawing are never limited. */
export const RESTRICT_SCOPES = /** @type {const} */ (['search', 'discover', 'likes', 'follows', 'access', 'messages', 'links', 'communities', 'events', 'posts', 'comments', 'reactions', 'uploads']);
const SOFT = /** @type {const} */ (['discover', 'likes', 'messages', 'access', 'links']);
/** Presets in the staff area: «Мягкое» = no new contacts; «Стандартное» = what a restriction did before (also search,
 * follows, communities, events); «Строгое» = everything, posts and comments included. */
/** @typedef {typeof RESTRICT_SCOPES[number]} RestrictScope */
export const RESTRICT_PRESETS = Object.freeze({
  soft: [...SOFT],
  standard: [...SOFT, 'search', 'follows', 'communities', 'events'],
  strict: [...RESTRICT_SCOPES],
});
