// @ts-check
/** Media-domain tokens (S3 §6). WebCrypto only, so this exact file runs in the API (issue)
 * and in the Cloudflare Worker on the media domain (verify).
 *
 * Format: `v1.<payload>.<sig>`, payload = base64url(`assetId|variant|viewerProfileId|expSeconds|nonce`),
 * sig = base64url(HMAC-SHA256(secret, payload)). The Worker also checks that assetId and variant
 * match the URL path, so a token for a thumbnail never opens the full image.
 */

export const VARIANTS = /** @type {const} */ (['thumb', 'card', 'full', 'blur', 'video']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const enc = new TextEncoder();

/** @param {Uint8Array} bytes */
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** @param {string} s */
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** @param {string} secret */
async function key(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('media_token_secret_missing');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * @param {string} secret
 * @param {{assetId: string, variant: typeof VARIANTS[number], viewerProfileId: string, ttlSeconds: number, nonce?: string, now?: number}} t
 */
export async function issueMediaToken(secret, { assetId, variant, viewerProfileId, ttlSeconds, nonce = '', now = Date.now() }) {
  if (!UUID.test(assetId) || !UUID.test(viewerProfileId) || !VARIANTS.includes(variant)) throw new Error('media_token_input');
  if (!(ttlSeconds > 0 && ttlSeconds <= 3600) || !/^[A-Za-z0-9_-]{0,32}$/.test(nonce)) throw new Error('media_token_input');
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const payload = b64url(enc.encode([assetId, variant, viewerProfileId, exp, nonce].join('|')));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload)));
  return `v1.${payload}.${b64url(sig)}`;
}

/** Returns the claims or null. Never throws on bad input (the Worker answers 403 to null).
 * @param {string} secret @param {string} token @param {{assetId: string, variant: string, now?: number}} expect */
export async function verifyMediaToken(secret, token, { assetId, variant, now = Date.now() }) {
  try {
    const [v, payload, sig] = String(token).split('.');
    if (v !== 'v1' || !payload || !sig || payload.length > 400) return null;
    const ok = await crypto.subtle.verify('HMAC', await key(secret), unb64url(sig), enc.encode(payload));
    if (!ok) return null;
    const [a, vr, viewer, exp, nonce] = new TextDecoder().decode(unb64url(payload)).split('|');
    if (a !== assetId || vr !== variant || !(Number(exp) * 1000 > now)) return null;
    return { assetId: a, variant: vr, viewerProfileId: viewer, exp: Number(exp), nonce };
  } catch {
    return null;
  }
}
