// @ts-check
import { issueMediaToken } from './token.mjs';
import { VARIANT_KEY } from './supabase-storage.mjs';

/** How a viewer gets a variant URL (S3 §6). Swappable without touching tables or the API:
 * - `signedStorageDelivery`: prelaunch, Supabase signed URLs of pre-rendered variants. Not bound to the viewer —
 *   anyone holding the URL can open it until it expires, so TTLs stay short.
 * - `tokenDelivery`: the Cloudflare media domain; tokens bound to asset + variant + viewer.
 * @typedef {'thumb' | 'card' | 'full' | 'blur'} Variant
 * @typedef {{assetId: string, variant: Variant, viewerProfileId: string, ttlSeconds: number}} UrlRequest
 * @typedef {{urls: (items: UrlRequest[]) => Promise<string[]>}} Delivery
 */

/** @param {{signUrls: (keys: string[], ttlSeconds: number) => Promise<string[]>}} storage @returns {Delivery} */
export function signedStorageDelivery(storage) {
  return {
    async urls(items) {
      // One batch call per TTL (normal media vs view-once), in request order.
      const out = new Array(items.length);
      for (const ttl of new Set(items.map(i => i.ttlSeconds))) {
        const idx = items.map((it, k) => [it, k]).filter(([it]) => /** @type {UrlRequest} */ (it).ttlSeconds === ttl);
        const urls = await storage.signUrls(idx.map(([it]) => VARIANT_KEY(/** @type {UrlRequest} */ (it).assetId, /** @type {UrlRequest} */ (it).variant)), ttl);
        idx.forEach(([, k], n) => { out[/** @type {number} */ (k)] = urls[n]; });
      }
      return out;
    },
  };
}

/** @param {string} secret @param {string} origin e.g. https://media.example @returns {Delivery} */
export function tokenDelivery(secret, origin) {
  return {
    urls: items => Promise.all(items.map(async it =>
      `${origin}/v/${it.assetId}/${it.variant}?t=${await issueMediaToken(secret, it)}`)),
  };
}
