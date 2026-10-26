// @ts-check
import { createHash, createHmac } from 'node:crypto';

/** Minimal AWS Signature V4 for an S3-compatible store (Cloudflare R2): presigned URLs for direct
 * uploads and header-signed HEAD/DELETE from the server. No SDK: four calls do not justify one.
 * @typedef {{accessKeyId: string, secretAccessKey: string, region: string, service?: string}} Creds
 */

const hex = (/** @type {string | Buffer} */ v) => createHash('sha256').update(v).digest('hex');
const mac = (/** @type {string | Buffer} */ k, /** @type {string} */ v) => createHmac('sha256', k).update(v).digest();

/** RFC 3986 encoding as SigV4 requires (`encodeURIComponent` leaves !'()* alone). @param {string} s */
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
/** @param {string} path */
const encPath = path => path.split('/').map(enc).join('/');

/** @param {Date} d */
const amzDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** @param {Creds} c @param {string} day @param {string} toSign */
function signature(c, day, toSign) {
  const service = c.service ?? 's3';
  let key = mac('AWS4' + c.secretAccessKey, day);
  key = mac(key, c.region);
  key = mac(key, service);
  key = mac(key, 'aws4_request');
  return createHmac('sha256', key).update(toSign).digest('hex');
}

/** @param {Record<string, string>} headers lower-case names */
function canonicalHeaders(headers) {
  const names = Object.keys(headers).sort();
  return {
    text: names.map(n => n + ':' + String(headers[n]).trim().replace(/\s+/g, ' ') + '\n').join(''),
    signed: names.join(';'),
  };
}

/** Presigned URL: the signed headers (e.g. content-type, content-length) must be sent exactly as signed,
 * so the client cannot upload another type or size than the server approved.
 * @param {Creds} c
 * @param {{method: string, url: string, headers?: Record<string, string>, expiresSeconds: number, now?: Date}} req */
export function presign(c, { method, url, headers = {}, expiresSeconds, now = new Date() }) {
  const u = new URL(url);
  const date = amzDate(now), day = date.slice(0, 8);
  const scope = `${day}/${c.region}/${c.service ?? 's3'}/aws4_request`;
  const h = canonicalHeaders({ host: u.host, ...lower(headers) });
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${c.accessKeyId}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': h.signed,
  };
  const qs = Object.keys(query).sort().map(k => enc(k) + '=' + enc(/** @type {any} */ (query)[k])).join('&');
  const canonical = [method, encPath(u.pathname), qs, h.text, h.signed, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', date, scope, hex(canonical)].join('\n');
  return `${u.origin}${encPath(u.pathname)}?${qs}&X-Amz-Signature=${signature(c, day, toSign)}`;
}

/** Headers for a server-side request. Without a body (HEAD, DELETE, GET) the payload hash is that of ''.
 * A server PUT signs `UNSIGNED-PAYLOAD` (TLS protects the body; the key itself is server-chosen).
 * @param {Creds} c @param {{method: string, url: string, now?: Date, unsignedPayload?: boolean}} req @returns {Record<string, string>} */
export function signHeaders(c, { method, url, now = new Date(), unsignedPayload = false }) {
  const u = new URL(url);
  const date = amzDate(now), day = date.slice(0, 8);
  const scope = `${day}/${c.region}/${c.service ?? 's3'}/aws4_request`;
  const payload = unsignedPayload ? 'UNSIGNED-PAYLOAD' : hex('');
  const headers = { host: u.host, 'x-amz-content-sha256': payload, 'x-amz-date': date };
  const h = canonicalHeaders(headers);
  const qs = [...u.searchParams].map(([k, v]) => enc(k) + '=' + enc(v)).sort().join('&');
  const canonical = [method, encPath(u.pathname), qs, h.text, h.signed, payload].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', date, scope, hex(canonical)].join('\n');
  return {
    'x-amz-content-sha256': payload,
    'x-amz-date': date,
    authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${h.signed}, Signature=${signature(c, day, toSign)}`,
  };
}

/** @param {Record<string, string>} headers */
const lower = headers => Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
