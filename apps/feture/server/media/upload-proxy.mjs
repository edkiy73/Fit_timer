// @ts-check
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable, Transform } from 'node:stream';

/** `PUT /api/fe-upload?k&m&b&e&s` — the upload address the API hands out instead of a presigned storage URL
 * (server/media/bunny.mjs: Edge Storage has none, and its password must never reach a client).
 * The ticket is an HMAC over key, type, exact size and expiry, so it acts exactly like a presigned PUT: only that key,
 * only that type, only that many bytes, only until it expires. Only quarantine keys (`u/<uuid>` and its poster) are
 * ever signed; nothing reads them but the scanner. The body is streamed to storage, never buffered. */

const KEY_RE = /^u\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.poster)?$/;
const MIME_RE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/;
/** The largest file the API ever allows (a 100 MB clip) plus headroom; the ticket carries the exact size anyway. */
export const UPLOAD_MAX_BYTES = 110 * 1024 * 1024;

/** @param {string} secret @param {{key: string, mime: string, bytes: number, expires: number}} t */
function sign(secret, t) {
  return createHmac('sha256', secret).update(`fe-upload:v1\n${t.key}\n${t.mime}\n${t.bytes}\n${t.expires}`).digest('base64url');
}

/** Upload URLs for `createBunnyStorage({uploadUrl})`. @param {string} secret @param {string} apiOrigin e.g. https://api.example.com
 * @param {() => number} [now] */
export function uploadUrlFor(secret, apiOrigin, now = Date.now) {
  if (!secret || secret.length < 32) throw new Error('upload_secret_missing');
  const origin = apiOrigin.replace(/\/$/, '');
  return (/** @type {string} */ key, /** @type {{mime: string, bytes: number}} */ file, /** @type {number} */ ttlSeconds) => {
    if (!KEY_RE.test(key) || !MIME_RE.test(file.mime) || !(file.bytes > 0 && file.bytes <= UPLOAD_MAX_BYTES)) throw new Error('storage_unavailable');
    const expires = Math.floor(now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
    const q = new URLSearchParams({ k: key, m: file.mime, b: String(file.bytes), e: String(expires) });
    q.set('s', sign(secret, { key, mime: file.mime, bytes: file.bytes, expires }));
    return { url: `${origin}/api/fe-upload?${q}`, method: /** @type {'PUT'} */ ('PUT'), headers: { 'content-type': file.mime } };
  };
}

/** Fails the stream as soon as more bytes arrive than the ticket allows. @param {number} limit */
function capped(limit) {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, done) {
      seen += chunk.length;
      if (seen > limit) return done(Object.assign(new Error('too_large'), { status: 413 }));
      done(null, chunk);
    },
    flush(done) { done(seen === limit ? null : Object.assign(new Error('short_body'), { status: 400 })); },
  });
}

/** @param {{secret: string, storage: {putStream: (key: string, body: AsyncIterable<Uint8Array>, file: {mime: string, bytes: number}) => Promise<void>},
 *   now?: () => number, log?: (code: string) => void}} deps */
export function createUploadHandler({ secret, storage, now = Date.now, log = () => {} }) {
  /** @param {import('node:http').ServerResponse} res @param {number} status @param {string} [error] */
  const send = (res, status, error) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(error ? { ok: false, error } : { ok: true }));
  };
  return async (/** @type {import('node:http').IncomingMessage} */ req, /** @type {import('node:http').ServerResponse} */ res) => {
    // The ticket is the authority (like a presigned URL), so any origin may use it: the web app, the Android WebView.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== 'PUT') return send(res, 405, 'method');
    const q = new URL(String(req.url || '/'), 'http://x').searchParams;
    const t = { key: q.get('k') ?? '', mime: q.get('m') ?? '', bytes: Number(q.get('b')), expires: Number(q.get('e')) };
    const given = Buffer.from(q.get('s') ?? '');
    const expected = Buffer.from(KEY_RE.test(t.key) && MIME_RE.test(t.mime) && Number.isSafeInteger(t.bytes) && Number.isSafeInteger(t.expires) ? sign(secret, t) : '');
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) return send(res, 403, 'ticket');
    if (t.expires * 1000 < now()) return send(res, 403, 'expired');
    if (!(t.bytes > 0 && t.bytes <= UPLOAD_MAX_BYTES)) return send(res, 413, 'too_large');
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== t.mime) return send(res, 415, 'type');
    const declared = req.headers['content-length'];
    if (declared === undefined) return send(res, 411, 'length_required');
    if (Number(declared) !== t.bytes) return send(res, 400, 'size');
    // A body longer or shorter than the ticket fails the stream; storage then sees an aborted upload, and the
    // reason is the cap's, not the storage's.
    /** @type {any} */ let bodyError = null;
    const cap = capped(t.bytes).on('error', e => { bodyError = e; });
    try {
      await storage.putStream(t.key, Readable.from(req.pipe(cap)), { mime: t.mime, bytes: t.bytes });
      if (bodyError) throw bodyError;
      return send(res, 200);
    } catch (error) {
      const status = Number((bodyError ?? /** @type {any} */ (error))?.status);
      if (status === 413 || status === 400) return send(res, status, status === 413 ? 'too_large' : 'size');
      log('feture_upload_failed');
      return send(res, 502, 'storage_unavailable');
    }
  };
}
