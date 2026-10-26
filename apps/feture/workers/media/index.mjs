// Cloudflare Worker for the media domain (docs/server/S3-MEDIA.md §6).
// GET /v/<assetId>/<variant>?t=<token>: checks the API-issued token, reads the original from R2 and
// returns a resized, metadata-free variant through the Images binding. Never serves the original.
// Deploy: see wrangler.toml.example. Secrets: MEDIA_TOKEN_SECRET (same value as FETURE_MEDIA_TOKEN_SECRET).
import { verifyMediaToken } from '../../server/media/token.mjs';

const PATH = /^\/v\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(thumb|card|full|blur)$/;
/** @type {Readonly<Record<'thumb' | 'card' | 'full' | 'blur', {width: number, blur?: number}>>} */
export const VARIANT = Object.freeze({
  thumb: { width: 240 },
  card: { width: 720 },
  full: { width: 1600 },
  blur: { width: 360, blur: 60 },
});

/** @param {number} status */
const deny = status => new Response(null, { status, headers: { 'cache-control': 'no-store' } });

/**
 * @param {Request} request
 * @param {{MEDIA_TOKEN_SECRET: string, ORIGINALS: {get: (key: string) => Promise<{body: ReadableStream} | null>},
 *   IMAGES: {input: (s: ReadableStream) => any}}} env
 */
export async function handleMedia(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405);
  const url = new URL(request.url);
  const m = PATH.exec(url.pathname);
  if (!m) return deny(404);
  const [, assetId, variant] = m;
  const claims = await verifyMediaToken(env.MEDIA_TOKEN_SECRET, url.searchParams.get('t') ?? '', { assetId, variant });
  if (!claims) return deny(403);
  const object = await env.ORIGINALS.get(`o/${assetId}`);
  if (!object) return deny(404);
  const v = VARIANT[/** @type {keyof typeof VARIANT} */ (variant)];
  const out = await env.IMAGES.input(object.body)
    .transform({ width: v.width, fit: 'scale-down', ...(v.blur ? { blur: v.blur } : {}) })
    .output({ format: 'image/webp', quality: 82 });
  const response = out.response();
  const maxAge = Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': 'image/webp',
      // Private to this viewer and never longer than the token lives.
      'cache-control': `private, max-age=${maxAge}`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-site',
    },
  });
}

export default { fetch: handleMedia };
