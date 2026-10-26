// @ts-check
import { presign, signHeaders } from './sigv4.mjs';

/** Object storage over Cloudflare R2 (S3 API). Bytes never pass through the API function:
 * clients PUT to a presigned URL; the server only checks, reads for scanning, and deletes.
 * @typedef {{
 *   putUrl: (key: string, file: {mime: string, bytes: number}, ttlSeconds: number) => Promise<{url: string, method: 'PUT', headers: Record<string, string>}>,
 *   head: (key: string) => Promise<{bytes: number, mime: string} | null>,
 *   get: (key: string, maxBytes: number) => Promise<Uint8Array>,
 *   remove: (key: string) => Promise<void>,
 *   put?: (key: string, bytes: Uint8Array, mime: string) => Promise<void>,
 * }} Storage
 */

/** @param {{endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string}} cfg
 * endpoint: `https://<account>.eu.r2.cloudflarestorage.com` (EU jurisdiction bucket) @returns {Storage} */
export function createR2Storage(cfg) {
  const creds = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: 'auto' };
  const url = (/** @type {string} */ key) => `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}/${key}`;
  /** @param {string} method @param {string} key */
  const call = (method, key) => fetch(url(key), { method, headers: signHeaders(creds, { method, url: url(key) }) });
  return {
    async putUrl(key, file, ttlSeconds) {
      const headers = { 'content-type': file.mime, 'content-length': String(file.bytes) };
      return { url: presign(creds, { method: 'PUT', url: url(key), headers, expiresSeconds: ttlSeconds }), method: 'PUT', headers };
    },
    async head(key) {
      const res = await call('HEAD', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('storage_unavailable');
      return { bytes: Number(res.headers.get('content-length')), mime: String(res.headers.get('content-type') || '') };
    },
    async get(key, maxBytes) {
      const res = await call('GET', key);
      if (!res.ok) throw new Error('storage_unavailable');
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw new Error('storage_object_too_large');
      return buf;
    },
    async put(key, bytes, mime) {
      const headers = { ...signHeaders(creds, { method: 'PUT', url: url(key), unsignedPayload: true }), 'content-type': mime };
      const res = await fetch(url(key), { method: 'PUT', headers, body: Buffer.from(bytes) });
      if (!res.ok) throw new Error('storage_unavailable');
    },
    async remove(key) {
      const res = await call('DELETE', key);
      if (!res.ok && res.status !== 404) throw new Error('storage_unavailable');
    },
  };
}
