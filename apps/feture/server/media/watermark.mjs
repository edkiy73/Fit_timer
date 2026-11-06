// @ts-check
import { issueMediaToken, verifyMediaToken } from './token.mjs';
import { VARIANT_KEY } from './supabase-storage.mjs';
import { grantedScopes } from '../access.mjs';

/** The viewer's own handle burned into the private part's pictures (security audit 06.11.2026, B: the watermark used to be a layer drawn
 * over the picture in the app — a screenshot cropped it away and a leak could not be traced). A person who opens someone's private
 * pictures gets a link to OUR server instead of the CDN; the server checks the grant again at that moment, fetches the picture,
 * writes the viewer's handle across it and sends it — nothing of this is stored. The link is the media token (token.mjs) bound to
 * the asset, the variant and the viewing profile, and carries the viewing account in its nonce (32 hex characters).
 * @typedef {import('../db.mjs').Db} Db */

const TTL_SECONDS = 120;
const MARKED = new Set(['thumb', 'card', 'full']);

/** Links for the pictures of one asset. @param {{secret: string, origin: string}} cfg @param {{assetId: string, variants: string[], viewerProfileId: string, accountId: string}} a */
export async function markedUrls(cfg, { assetId, variants, viewerProfileId, accountId }) {
  const nonce = accountId.replace(/-/g, '');
  return Promise.all(variants.map(async v => {
    const t = await issueMediaToken(cfg.secret, { assetId, variant: /** @type {any} */ (v), viewerProfileId, ttlSeconds: TTL_SECONDS, nonce });
    return `${cfg.origin}/api/fe?media=1&a=${assetId}&v=${v}&t=${encodeURIComponent(t)}`;
  }));
}

/** Writes `text` across the picture: tiled, slanted, white with a dark edge so it reads on any picture and cannot be cropped out.
 * @param {Uint8Array} bytes @param {string} text @returns {Promise<Buffer>} */
export async function stamp(bytes, text) {
  const sharp = (await import('sharp')).default;
  const input = Buffer.from(bytes);
  const { width = 0, height = 0 } = await sharp(input).metadata();
  const size = Math.max(14, Math.round(Math.min(width, height) / 14));
  const step = size * 7, rows = Math.ceil((height + width) / step) + 2, cols = Math.ceil((width + height) / (size * 6)) + 2;
  const esc = text.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);
  let tiles = '';
  for (let r = -1; r < rows; r++) for (let c = -1; c < cols; c++) {
    const x = c * size * 6 + (r % 2 ? size * 3 : 0), y = r * step * 0.55;
    tiles += `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#fff" fill-opacity="0.30" stroke="#000" stroke-opacity="0.22" stroke-width="${Math.max(1, size / 14)}" paint-order="stroke">${esc}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g transform="rotate(-28 ${width / 2} ${height / 2})">${tiles}</g></svg>`;
  return sharp(input).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 82 }).toBuffer();
}

/** `GET /api/fe?media=1&a=<asset>&v=<variant>&t=<token>`. @param {{db: Db | null, secret: string, storage: {get: (key: string, maxBytes: number) => Promise<Uint8Array>} | null}} deps
 * @param {{query?: Record<string, string>}} req @param {{statusCode: number, setHeader: (k: string, v: string) => void, end: (b?: any) => void}} res */
export async function serveMarked({ db, secret, storage }, req, res) {
  const fail = (/** @type {number} */ status) => { res.statusCode = status; res.setHeader('Cache-Control', 'no-store'); res.end(); };
  if (!db || !storage || !secret) return fail(503);
  const { a: assetId = '', v: variant = '', t: token = '' } = req.query ?? {};
  if (!MARKED.has(variant)) return fail(400);
  const claims = await verifyMediaToken(secret, token, { assetId, variant });
  if (!claims || !/^[0-9a-f]{32}$/.test(claims.nonce)) return fail(403);
  try {
    // The grant is checked again now: whoever lost access since the link was made gets nothing (the link alone is not enough).
    const [row] = await db.query(
      `select m.kind, a.target_id owner, acc.id account_id, p.handle
       from feture.media_asset m
       join feture.media_attachment a on a.asset_id = m.id and a.target_type = 'private'
       join feture.account acc on replace(acc.id::text, '-', '') = $2
       join feture.profile p on p.id = acc.person_profile_id
       where m.id = $1 and m.state = 'approved' and m.purpose = 'private' and m.explicitness is not null`, [assetId, claims.nonce]);
    if (!row?.handle) return fail(404);
    const scopes = await grantedScopes(db, row.owner, /** @type {any} */ ({ profileId: claims.viewerProfileId, accountId: row.account_id }));
    if (!scopes.includes(row.kind === 'video' ? 'video' : 'photos')) return fail(403);
    const bytes = await storage.get(VARIANT_KEY(assetId, variant), 20 * 1024 * 1024);
    const out = await stamp(bytes, '@' + row.handle);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(out);
  } catch { fail(502); }
}
