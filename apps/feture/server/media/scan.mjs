// @ts-check
import { enqueue } from '../outbox.mjs';
import { LIMITS } from './assets.mjs';

/** Media check pipeline for the `media.scan` outbox topic (S3 §4–5).
 * Order: real file type → CSAM hash match → explicitness classifier → decision.
 * Without a configured CSAM scanner nothing is auto-approved: everything waits for staff.
 * @typedef {import('../db.mjs').Db} Db
 * @typedef {{name: string, check: (bytes: Uint8Array, mime: string) => Promise<{result: 'pass' | 'match' | 'error', ref?: string}>}} Scanner
 * @typedef {{name: string, classify: (bytes: Uint8Array, mime: string) => Promise<{label: 'safe' | 'explicit' | 'uncertain', score?: number}>}} Classifier
 * @typedef {{storage: import('./r2.mjs').Storage, scanner: Scanner | null, classifier: Classifier | null}} ScanDeps
 */

const PUBLIC_ONLY = new Set(['avatar', 'community', 'event']);

/** Real type by signature; the declared MIME is only a claim. @param {Uint8Array} b @returns {string | null} */
export function sniff(b) {
  const at = (/** @type {number} */ i, /** @type {number[]} */ sig) => sig.every((v, k) => b[i + k] === v);
  const ascii = (/** @type {number} */ i, /** @type {string} */ s) => at(i, [...s].map(c => c.charCodeAt(0)));
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (['heic', 'heix', 'mif1', 'msf1', 'heif'].includes(brand)) return 'image/heic';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

/** @param {string} declared @param {string | null} real */
const sameType = (declared, real) =>
  real === declared || (real === 'image/heic' && declared === 'image/heif') || (real === 'video/mp4' && declared === 'video/quicktime');

/** @param {Db} db @param {ScanDeps} deps @param {string} assetId */
export async function scanAsset(db, deps, assetId) {
  const [asset] = await db.query(
    `update feture.media_asset set state = 'scanning' where id = $1 and state in ('uploaded', 'scanning')
     returning id, owner_profile_id, purpose, kind, mime, storage_key, explicitness, explicitness_source`,
    [assetId]);
  if (!asset) return 'skipped'; // removed or already decided
  const bytes = await deps.storage.get(asset.storage_key, LIMITS[/** @type {'image' | 'video'} */ (asset.kind)].maxBytes);
  /** @type {{provider: string, kind: string, result: string, score?: number, ref?: string}[]} */
  const log = [];
  const real = sniff(bytes);
  log.push({ provider: 'sniff', kind: 'file', result: sameType(asset.mime, real) ? 'pass' : 'error' });
  /** @type {{state: string, reason?: string, explicit?: boolean}} */
  let decision;
  if (!sameType(asset.mime, real)) decision = { state: 'rejected', reason: 'invalid_file' };
  else if (!deps.scanner) decision = { state: 'needs_review', reason: 'scanner_not_configured' };
  else {
    const csam = await deps.scanner.check(bytes, asset.mime);
    log.push({ provider: deps.scanner.name, kind: 'csam', result: csam.result, ref: csam.ref });
    if (csam.result === 'match') decision = { state: 'blocked', reason: 'csam_match' };
    else if (csam.result !== 'pass') decision = { state: 'needs_review', reason: 'scanner_error' };
    else decision = await classify(deps, asset, bytes, log);
  }
  await db.tx(async q => {
    for (const s of log) {
      await q.query(
        'insert into feture.media_scan (asset_id, provider, check_kind, result, score, provider_ref) values ($1, $2, $3, $4, $5, $6)',
        [asset.id, s.provider, s.kind, s.result, s.score ?? null, s.ref ?? null]);
    }
    await q.query(
      `update feture.media_asset set state = $2, reject_reason = $3, scanned_at = now(),
         approved_at = case when $2 = 'approved' then now() end,
         explicitness = case when $4::boolean is null then explicitness when $4 then 'explicit' else 'safe' end,
         explicitness_source = case when $4::boolean is null then explicitness_source
           when explicitness_source = 'author' and explicitness = 'explicit' then 'author' else 'classifier' end
       where id = $1 and state = 'scanning'`,
      [asset.id, decision.state, decision.reason ?? null, decision.explicit ?? null]);
    if (decision.state === 'blocked') await enqueue(q, 'safety.csamMatch', asset.owner_profile_id, { assetId: asset.id });
    if (decision.state === 'needs_review') await enqueue(q, 'moderation.mediaReview', asset.owner_profile_id, { assetId: asset.id, reason: decision.reason });
    if (decision.state === 'approved') await enqueue(q, 'media.approved', asset.owner_profile_id, { assetId: asset.id });
  });
  return decision.state;
}

/** @param {ScanDeps} deps @param {any} asset @param {Uint8Array} bytes @param {any[]} log */
async function classify(deps, asset, bytes, log) {
  if (asset.purpose === 'verification') return { state: 'needs_review', reason: 'verification' };
  if (!deps.classifier) return { state: 'needs_review', reason: 'classifier_not_configured' };
  const c = await deps.classifier.classify(bytes, asset.mime);
  log.push({ provider: deps.classifier.name, kind: 'explicitness', result: c.label, score: c.score });
  if (c.label === 'uncertain') return { state: 'needs_review', reason: 'classifier_uncertain' };
  // The author may mark media explicit; the classifier can raise the label but never lower the author's.
  const explicit = c.label === 'explicit' || asset.explicitness === 'explicit';
  if (explicit && PUBLIC_ONLY.has(asset.purpose)) return { state: 'rejected', reason: 'explicit_not_allowed', explicit };
  return { state: 'approved', explicit };
}
