// @ts-check
/** Prelaunch media storage on Supabase Storage (owner decision 27.10.2026: stay on Vercel + the current
 * Supabase project until launch, move to Cloudflare later by swapping this module).
 * Bytes still never pass through the API: clients upload to a signed upload URL, viewers read variants
 * through short signed URLs. Only the queue worker reads originals to scan them and render variants.
 * @typedef {import('./r2.mjs').Storage} Storage
 * @typedef {{configured: () => boolean, request: (path: string, options?: {method?: string, headers?: Record<string, string>, body?: any, timeoutMs?: number}) => Promise<Response>}} Transport
 */

/** `file` is a video or voice note served as scanned (the `o/<id>` copy the scanner wrote); the rest are pictures. */
export const VARIANT_KEY = (/** @type {string} */ assetId, /** @type {string} */ variant) =>
  variant === 'file' ? `o/${assetId}` : `v/${assetId}/${variant}.webp`;

/** @param {Transport} transport Core `server/supabase.js` (service key, server only) @param {{bucket: string, baseUrl: string}} cfg */
export function createSupabaseStorage(transport, { bucket, baseUrl }) {
  const enc = (/** @type {string} */ key) => key.split('/').map(encodeURIComponent).join('/');
  /** @param {unknown} error */
  const missing = error => [400, 404].includes(Number(/** @type {{status?: unknown}} */ (error)?.status));
  /** @type {Storage & {put: (key: string, bytes: Uint8Array, mime: string) => Promise<void>, signUrls: (keys: string[], ttlSeconds: number) => Promise<string[]>}} */
  const storage = {
    async putUrl(key, file) {
      const res = await transport.request(`/storage/v1/object/upload/sign/${bucket}/${enc(key)}`, { method: 'POST' });
      const { url } = /** @type {{url?: string}} */ (await res.json());
      if (typeof url !== 'string' || !url.startsWith('/object/upload/sign/')) throw new Error('storage_unavailable');
      // The bucket enforces the size limit and MIME list; commit re-checks the exact size and type.
      return { url: `${baseUrl}/storage/v1${url}`, method: 'PUT', headers: { 'content-type': file.mime, 'x-upsert': 'false' } };
    },
    async head(key) {
      try {
        const res = await transport.request(`/storage/v1/object/authenticated/${bucket}/${enc(key)}`, { method: 'HEAD' });
        return { bytes: Number(res.headers.get('content-length')), mime: String(res.headers.get('content-type') || '').split(';')[0] };
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async get(key, maxBytes) {
      const res = await transport.request(`/storage/v1/object/authenticated/${bucket}/${enc(key)}`, { timeoutMs: 20000 });
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw new Error('storage_object_too_large');
      return buf;
    },
    async put(key, bytes, mime) {
      await transport.request(`/storage/v1/object/${bucket}/${enc(key)}`, {
        method: 'POST', headers: { 'content-type': mime, 'x-upsert': 'true' }, body: bytes, timeoutMs: 20000,
      });
    },
    async remove(key) {
      await transport.request(`/storage/v1/object/${bucket}`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [key] }),
      });
    },
    async signUrls(keys, ttlSeconds) {
      if (!keys.length) return [];
      const res = await transport.request(`/storage/v1/object/sign/${bucket}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: ttlSeconds, paths: keys }),
      });
      const rows = /** @type {{path?: string, signedURL?: string | null}[]} */ (await res.json());
      const byPath = new Map(rows.map(r => [r.path, r.signedURL]));
      return keys.map(k => {
        const signed = byPath.get(k);
        if (typeof signed !== 'string') throw new Error('storage_unavailable');
        return `${baseUrl}/storage/v1${signed}`;
      });
    },
  };
  return storage;
}
