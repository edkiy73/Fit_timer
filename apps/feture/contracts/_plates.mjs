// @ts-check
/** The named cover plates (prototype PL) a community, an event or an article shows instead of a photo. Shared by the
 * server (which sends a plate key where there is no picture) and the app (which paints it: kit `namedPlate`). */

export const PLATE_KEYS = /** @type {const} */ (['lilac', 'rose', 'sea', 'amber', 'moss', 'coal']);

/** An article without photos still has a cover (owner, 28.10.2026): a plate picked from its id, so the same article
 * always gets the same one, with no column to store. @param {string} id @returns {typeof PLATE_KEYS[number]} */
export function articlePlate(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PLATE_KEYS[h % PLATE_KEYS.length];
}
