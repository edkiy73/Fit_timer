// @ts-check
import { createHmac } from 'node:crypto';

/** Media on bunny.net (docs/infra/migration-plan.md): Edge Storage in Frankfurt + a private Pull Zone with Token
 * Authentication. Bunny's terms allow legal adult content, which is why it holds our media.
 *
 * - The storage password (AccessKey) never leaves the server. Edge Storage has no presigned uploads, so clients PUT to
 *   our own `/api/fe-upload` (server/media/upload-proxy.mjs), which checks a signed ticket and streams to Bunny.
 * - Viewers get CDN links signed with the Pull Zone token key (Bunny «advanced» tokens, HS256), short-lived like before.
 * - Only documented Edge Storage calls are used: PUT, GET, DELETE and directory listing. There is no HEAD, so a
 *   quarantine upload `u/<id>` is stored as the single file of a directory, `u/<id>/<base64url(mime)>`: listing that
 *   directory gives its size and type. Everything else (`o/…`, `v/…`) keeps its key as the path, so CDN links stay plain.
 * @typedef {import('./r2.mjs').Storage} Storage
 * @typedef {{url: string, method: 'PUT', headers: Record<string, string>}} UploadTarget
 * @typedef {Storage & {
 *   put: (key: string, bytes: Uint8Array, mime: string) => Promise<void>,
 *   putStream: (key: string, body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>, file: {mime: string, bytes: number}) => Promise<void>,
 *   signUrls: (keys: string[], ttlSeconds: number) => Promise<string[]>,
 * }} BunnyStorage
 */

const b64url = (/** @type {Buffer | string} */ v) => Buffer.from(v).toString('base64url');

/** Bunny token for `path` (as it appears in the URL) valid until `expires` (unix seconds), no extra parameters:
 * `HS256-` + base64url(HMAC-SHA256(key, path + expires)). Matches Bunny's published test vectors (tests/bunny.test.mjs).
 * @param {string} key @param {string} path @param {number} expires */
export function bunnyToken(key, path, expires) {
  return 'HS256-' + createHmac('sha256', key).update(path + String(expires)).digest('base64url');
}

/** Quarantine keys are the only ones clients write; they live as a one-file directory (see above). */
const isQuarantine = (/** @type {string} */ key) => key.startsWith('u/');
const enc = (/** @type {string} */ key) => key.split('/').map(encodeURIComponent).join('/');

/** @param {{zone: string, accessKey: string, host?: string, cdnOrigin: string, tokenKey: string,
 *   uploadUrl?: (key: string, file: {mime: string, bytes: number}, ttlSeconds: number) => UploadTarget,
 *   fetch?: typeof fetch, now?: () => number}} cfg @returns {BunnyStorage} */
export function createBunnyStorage(cfg) {
  const f = cfg.fetch ?? fetch;
  const now = cfg.now ?? Date.now;
  const base = `https://${(cfg.host || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/$/, '')}/${encodeURIComponent(cfg.zone)}`;
  const cdn = cfg.cdnOrigin.replace(/\/$/, '');
  const auth = { AccessKey: cfg.accessKey };

  /** @param {string} path @param {RequestInit & {timeoutMs?: number}} [init] */
  async function call(path, init = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 15000);
    try {
      return await f(`${base}/${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) }, signal: ctl.signal });
    } catch {
      throw new Error('storage_unavailable');
    } finally { clearTimeout(timer); }
  }

  /** The one file inside a quarantine directory, or null. @param {string} key */
  async function quarantineFile(key) {
    const res = await call(`${enc(key)}/`, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('storage_unavailable');
    const list = /** @type {{ObjectName?: string, Length?: number, IsDirectory?: boolean}[]} */ (await res.json());
    const file = Array.isArray(list) ? list.find(o => o && !o.IsDirectory && typeof o.ObjectName === 'string') : null;
    if (!file) return null;
    let mime = '';
    try { mime = Buffer.from(String(file.ObjectName), 'base64url').toString('utf8'); } catch { /* not ours */ }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime)) return null;
    return { name: String(file.ObjectName), bytes: Number(file.Length), mime };
  }

  /** Physical path of a key when writing. @param {string} key @param {string} mime */
  const writePath = (key, mime) => isQuarantine(key) ? `${enc(key)}/${b64url(mime)}` : enc(key);

  /** @param {Response} res @param {number} maxBytes */
  async function readCapped(res, maxBytes) {
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error('storage_object_too_large');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('storage_object_too_large');
    return buf;
  }

  /** @type {BunnyStorage} */
  const storage = {
    async putUrl(key, file, ttlSeconds) {
      if (!isQuarantine(key) || !cfg.uploadUrl) throw new Error('storage_unavailable');
      return cfg.uploadUrl(key, file, ttlSeconds);
    },
    async head(key) {
      if (isQuarantine(key)) {
        const file = await quarantineFile(key);
        return file ? { bytes: file.bytes, mime: file.mime } : null;
      }
      const slash = key.lastIndexOf('/');
      const res = await call(`${enc(key.slice(0, slash + 1))}`, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('storage_unavailable');
      const list = /** @type {{ObjectName?: string, Length?: number, IsDirectory?: boolean}[]} */ (await res.json());
      const hit = Array.isArray(list) ? list.find(o => o && !o.IsDirectory && o.ObjectName === key.slice(slash + 1)) : null;
      return hit ? { bytes: Number(hit.Length), mime: '' } : null;
    },
    async get(key, maxBytes) {
      let path = enc(key);
      if (isQuarantine(key)) {
        const file = await quarantineFile(key);
        if (!file) throw new Error('storage_unavailable');
        path = `${enc(key)}/${file.name}`;
      }
      const res = await call(path, { timeoutMs: 90000 });
      if (!res.ok) throw new Error('storage_unavailable');
      return readCapped(res, maxBytes);
    },
    async put(key, bytes, mime) {
      const res = await call(writePath(key, mime), {
        method: 'PUT', headers: { 'Content-Type': mime, 'Content-Length': String(bytes.byteLength) }, body: Buffer.from(bytes), timeoutMs: 90000,
      });
      if (!res.ok) throw new Error('storage_unavailable');
    },
    async putStream(key, body, file) {
      // A repeated upload of the same quarantine key must not leave two files in its directory.
      if (isQuarantine(key)) await storage.remove(key);
      const res = await call(writePath(key, file.mime), {
        method: 'PUT', headers: { 'Content-Type': file.mime, 'Content-Length': String(file.bytes) },
        body: /** @type {any} */ (body), timeoutMs: 600000, ...(/** @type {any} */ ({ duplex: 'half' })),
      });
      if (!res.ok) throw new Error('storage_unavailable');
    },
    async remove(key) {
      const res = await call(isQuarantine(key) ? `${enc(key)}/` : enc(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error('storage_unavailable');
    },
    async signUrls(keys, ttlSeconds) {
      const expires = Math.floor(now() / 1000) + Math.max(1, Math.floor(ttlSeconds));
      return keys.map(key => {
        if (isQuarantine(key)) throw new Error('storage_unavailable'); // quarantine is never served
        const path = '/' + enc(key);
        return `${cdn}${path}?token=${bunnyToken(cfg.tokenKey, path, expires)}&expires=${expires}`;
      });
    },
  };
  return storage;
}

/** Storage from the environment, or null when Bunny is not configured. @param {Record<string, string | undefined>} env
 * @param {((key: string, file: {mime: string, bytes: number}, ttlSeconds: number) => UploadTarget) | undefined} uploadUrl */
export function bunnyFromEnv(env, uploadUrl) {
  if (!env.BUNNY_STORAGE_ZONE || !env.BUNNY_STORAGE_KEY || !env.BUNNY_CDN_ORIGIN || !env.BUNNY_TOKEN_KEY) return null;
  return createBunnyStorage({
    zone: env.BUNNY_STORAGE_ZONE, accessKey: env.BUNNY_STORAGE_KEY, host: env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com',
    cdnOrigin: env.BUNNY_CDN_ORIGIN, tokenKey: env.BUNNY_TOKEN_KEY, uploadUrl,
  });
}
