// @ts-check
import { createECDH, createCipheriv, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto';

/** Web Push sender (RFC 8030 delivery, RFC 8292 VAPID, RFC 8291 aes128gcm payload encryption) on node:crypto only —
 * no vendor account: the VAPID key pair is ours (FE_VAPID_PUBLIC_KEY / FE_VAPID_PRIVATE_KEY / FE_VAPID_SUBJECT).
 * The browser's push service (Google, Mozilla, Apple, Microsoft) only relays an encrypted blob it cannot read.
 * Native senders (APNs / FCM) live elsewhere and are routed next to this one by `pushTransport` (push.mjs).
 * @typedef {{endpoint: string, p256dh: string, auth: string}} WebSubscription
 * @typedef {{title: string, body: string, data: Record<string, string>}} PushMessage
 * @typedef {(url: string, init: {method: string, headers: Record<string, string>, body: Uint8Array, signal?: AbortSignal}) => Promise<{status: number}>} Fetch
 */

/** Push services a subscription may point at. Anything else is refused: the server never posts to an address a client
 * chose (no request forgery towards internal hosts). */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** @param {string} s */
const unb64 = s => Buffer.from(s.replace(/=+$/, ''), 'base64url');

/** @param {string} endpoint */
export function pushHostAllowed(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS.includes(h) || PUSH_HOST_SUFFIXES.some(s => h.endsWith(s) && h.length > s.length);
}

/** A browser PushSubscription as JSON (`JSON.stringify(sub)`), checked: a known push service over https, a P-256
 * public key and a 16-byte auth secret. null when it is anything else.
 * @param {string} token @returns {WebSubscription | null} */
export function webSubscription(token) {
  let v;
  try { v = JSON.parse(token); } catch { return null; }
  const endpoint = v?.endpoint, p256dh = v?.keys?.p256dh, auth = v?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !pushHostAllowed(endpoint)) return null;
  if (typeof p256dh !== 'string' || !B64URL.test(p256dh) || typeof auth !== 'string' || !B64URL.test(auth)) return null;
  const key = unb64(p256dh), secret = unb64(auth);
  if (key.length !== 65 || key[0] !== 4 || secret.length !== 16) return null;
  return { endpoint, p256dh: key.toString('base64url'), auth: secret.toString('base64url') };
}

/** The one stored form of a subscription, so the same browser always hashes to the same device row.
 * @param {WebSubscription} s */
export const canonicalToken = s => JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });

/** @param {Buffer} key @param {Buffer} data */
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** RFC 8291 §3.4 + RFC 8188: one aes128gcm record (payloads here are far below 4 KB).
 * @param {Buffer} plaintext @param {Buffer} uaPublic @param {Buffer} authSecret
 * @param {{ecdh?: import('node:crypto').ECDH, salt?: Buffer}} [fixed] fixed keys for tests only */
export function encrypt(plaintext, uaPublic, authSecret, fixed = {}) {
  const ecdh = fixed.ecdh ?? createECDH('prime256v1');
  if (!fixed.ecdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed.salt ?? randomBytes(16);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** RFC 8292 VAPID header value for one push service origin. @param {{publicKey: string, privateKey: import('node:crypto').KeyObject, subject: string}} k @param {string} endpoint */
export function vapidAuth(k, endpoint) {
  const enc = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: k.subject })}`;
  const sig = sign('sha256', Buffer.from(unsigned), { key: k.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${unsigned}.${sig}, k=${k.publicKey}`;
}

/** @param {{publicKey: string, privateKey: string, subject: string}} keys */
function vapidKeys(keys) {
  const pub = unb64(keys.publicKey), d = unb64(keys.privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32 || !/^(mailto:|https:)/.test(keys.subject)) return null;
  try {
    const privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: d.toString('base64url'), x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
    return { publicKey: pub.toString('base64url'), privateKey, subject: keys.subject };
  } catch { return null; }
}

/** The only fields that leave the server: a neutral title and line and an in-app address. Never names or message text
 * (push.mjs builds them from fixed strings). @param {PushMessage} m */
export function webPayload(m) {
  const url = typeof m.data?.url === 'string' && /^\/#\/n\/[a-z/]*$/.test(m.data.url) ? m.data.url : '/#/n/inbox';
  return { title: m.title, body: m.body, url };
}

/** A sender for one subscription token, or null when the keys are unusable.
 * @param {{publicKey: string, privateKey: string, subject: string, fetch?: Fetch, ttl?: number}} opts */
export function createWebPush(opts) {
  const k = vapidKeys(opts);
  if (!k) return null;
  const doFetch = opts.fetch ?? /** @type {Fetch} */ (/** @type {unknown} */ (globalThis.fetch));
  return {
    publicKey: k.publicKey,
    /** @param {string} token @param {PushMessage} message */
    async send(token, message) {
      const s = webSubscription(token);
      if (!s) throw Object.assign(new Error('webpush_bad_subscription'), { invalidToken: true, gone: true });
      const body = encrypt(Buffer.from(JSON.stringify(webPayload(message))), unb64(s.p256dh), unb64(s.auth));
      const res = await doFetch(s.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidAuth(k, s.endpoint), TTL: String(opts.ttl ?? 12 * 3600), Urgency: 'normal',
          'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 200 && res.status < 300) return;
      // 404 / 410: the browser unsubscribed or the subscription expired — gone for good (RFC 8030 §7.3).
      if (res.status === 404 || res.status === 410) throw Object.assign(new Error('webpush_gone'), { invalidToken: true, gone: true, status: res.status });
      throw Object.assign(new Error('webpush_failed'), { status: res.status });
    },
  };
}

let warned = false;
/** The sender from the environment; without all three keys it is off (null) and says so once per instance.
 * @param {Record<string, string | undefined>} env @param {(code: string) => void} [warn] @param {Fetch} [fetch] */
export function webPushFromEnv(env, warn = code => console.warn('feture_fe_webpush', code), fetch) {
  const publicKey = String(env.FE_VAPID_PUBLIC_KEY ?? '').trim(), privateKey = String(env.FE_VAPID_PRIVATE_KEY ?? '').trim();
  const subject = String(env.FE_VAPID_SUBJECT ?? '').trim();
  const sender = publicKey && privateKey && subject ? createWebPush({ publicKey, privateKey, subject, ...(fetch ? { fetch } : {}) }) : null;
  if (!sender && !warned) {
    warned = true;
    warn(publicKey || privateKey || subject ? 'invalid_keys' : 'off_no_keys');
  }
  return sender;
}
