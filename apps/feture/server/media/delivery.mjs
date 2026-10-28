// @ts-check
import { issueMediaToken } from './token.mjs';
import { VARIANT_KEY } from './supabase-storage.mjs';

/** How a viewer gets a variant URL (S3 §6). Swappable without touching tables or the API:
 * - `signedStorageDelivery`: prelaunch, Supabase signed URLs of pre-rendered variants. Not bound to the viewer —
 *   anyone holding the URL can open it until it expires, so TTLs stay short.
 * - `tokenDelivery`: the Cloudflare media domain; tokens bound to asset + variant + viewer.
 * @typedef {'thumb' | 'card' | 'full' | 'blur' | 'file'} Variant  file: a video or voice note as scanned (o/<id>)
 * @typedef {{assetId: string, variant: Variant, viewerProfileId: string, ttlSeconds: number}} UrlRequest
 * @typedef {{urls: (items: UrlRequest[]) => Promise<string[]>}} Delivery
 */

/** @param {{signUrls: (keys: string[], ttlSeconds: number) => Promise<string[]>}} storage @returns {Delivery} */
export function signedStorageDelivery(storage) {
  // Requests that arrive together (a feed page builds all its posts at once) are coalesced: one storage call per TTL
  // per tick instead of one per picture. Keys are de-duplicated; batches stay under the API's size.
  /** @type {Map<number, {key: string, resolve: (u: string) => void, reject: (e: unknown) => void}[]>} */
  let queue = new Map();
  let scheduled = false;
  // A link signed for a normal picture is handed out again while at least half its life is left: the same picture keeps
  // the same address across requests and screens, so the browser shows it from its cache instead of loading it again
  // (a new signature is a new address). Short-lived links (one-time photos, TTL < 300 s) are always fresh.
  /** @type {Map<string, {url: string, until: number}>} */
  const reuse = new Map();
  const REUSE_MIN_TTL = 300;
  const flush = async () => {
    const batch = queue; queue = new Map(); scheduled = false;
    for (const [ttl, waiting] of batch) {
      const keys = [...new Set(waiting.map(w => w.key))];
      try {
        const signed = new Map();
        const at = Date.now();
        for (let i = 0; i < keys.length; i += 200) {
          const part = keys.slice(i, i + 200);
          const urls = await storage.signUrls(part, ttl);
          part.forEach((k, n) => signed.set(k, urls[n]));
        }
        if (ttl >= REUSE_MIN_TTL) {
          if (reuse.size > 20000) reuse.clear();
          for (const [k, url] of signed) if (typeof url === 'string') reuse.set(ttl + ':' + k, { url, until: at + ttl * 1000 });
        }
        for (const w of waiting) w.resolve(signed.get(w.key));
      } catch (e) { for (const w of waiting) w.reject(e); }
    }
  };
  return {
    urls(items) {
      return Promise.all(items.map(it => new Promise((resolve, reject) => {
        const key = VARIANT_KEY(it.assetId, it.variant);
        if (it.ttlSeconds >= REUSE_MIN_TTL) {
          const hit = reuse.get(it.ttlSeconds + ':' + key);
          if (hit && hit.until - Date.now() > it.ttlSeconds * 500) return resolve(hit.url);
        }
        const list = queue.get(it.ttlSeconds) ?? [];
        list.push({ key, resolve, reject });
        queue.set(it.ttlSeconds, list);
        if (!scheduled) { scheduled = true; setTimeout(flush, 0); }
      })));
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
