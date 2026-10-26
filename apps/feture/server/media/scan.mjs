// @ts-check
import { createHash } from 'node:crypto';
import { enqueue } from '../outbox.mjs';
import { LIMITS, ORIGINAL_KEY } from './assets.mjs';
import { VARIANT_KEY } from './supabase-storage.mjs';
import { VARIANTS } from './render.mjs';

/** Media check pipeline for the `media.scan` outbox topic (S3 §4–5).
 * Order: CSAM hash match (on any bytes, before anything else) → real file type → served copies (`o/<id>` and
 * pre-rendered variants, written from exactly the bytes that were checked) → explicitness classifier → decision.
 * `csam_checked_at` is set only when a scanner answered; until then the upload is never purged (jobs.mjs).
 * Without a CSAM scanner nothing is auto-approved: everything waits for staff; copies then exist only for
 * the author and staff, never for other users.
 * @typedef {import('../db.mjs').Db} Db
 * @typedef {{name: string, check: (bytes: Uint8Array, mime: string) => Promise<{result: 'pass' | 'match' | 'error', ref?: string}>}} Scanner
 * @typedef {{name: string, classify: (bytes: Uint8Array, mime: string) => Promise<{label: 'safe' | 'explicit' | 'uncertain', score?: number}>}} Classifier
 * @typedef {import('./r2.mjs').Storage & {put: (key: string, bytes: Uint8Array, mime: string) => Promise<void>}} ScanStorage
 * @typedef {{storage: ScanStorage, scanner: Scanner | null, classifier: Classifier | null,
 *   renderer?: import('./render.mjs').Renderer | null}} ScanDeps
 *   renderer: the prelaunch storage keeps pre-rendered variants; the Cloudflare media domain renders on the fly.
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

/** Every served key of an asset. @param {string} id */
export const servedKeys = id => [ORIGINAL_KEY(id), ...VARIANTS.map(v => VARIANT_KEY(id, v.name))];

/**
 * @param {Db} db @param {ScanDeps} deps @param {string} assetId
 * @returns {Promise<string>} the resulting state, or 'skipped'
 * Throws `state_changed` when the asset changed under the scan (e.g. removed meanwhile): the outbox retries,
 * and the next run sees the new state.
 */
export async function scanAsset(db, deps, assetId) {
  // Lease: one scan per asset at a time (outbox claims expire sooner than a slow scan may take).
  // Removed or rejected uploads that no scanner has seen yet are checked too (CSAM only, nothing published).
  const eligible = `(state in ('uploaded', 'scanning') or (state in ('removed', 'rejected') and csam_checked_at is null and bytes is not null))`;
  const [asset] = await db.query(
    `update feture.media_asset set scan_token = gen_random_uuid(), scan_lock_until = now() + interval '10 minutes',
       state = case when state = 'uploaded' then 'scanning' else state end
     where id = $1 and ${eligible} and (scan_lock_until is null or scan_lock_until < now())
     returning id, state, scan_token::text, owner_profile_id, purpose, kind, mime, storage_key, explicitness`,
    [assetId]);
  if (!asset) {
    const [busy] = await db.query(`select 1 from feture.media_asset where id = $1 and ${eligible}`, [assetId]);
    if (busy) throw new Error('scan_busy');
    return 'skipped'; // decided already, or never uploaded
  }
  const terminal = asset.state === 'removed' || asset.state === 'rejected' ? asset.state : null;
  const bytes = await deps.storage.get(asset.storage_key, LIMITS[/** @type {'image' | 'video'} */ (asset.kind)].maxBytes);
  const sha = createHash('sha256').update(bytes).digest();
  /** @type {{provider: string, kind: string, result: string, score?: number, ref?: string}[]} */
  const log = [];
  /** @type {string[]} */
  const written = [];
  /** @type {{width: number, height: number} | null} */
  let size = null;
  const publish = async () => {
    await deps.storage.put(ORIGINAL_KEY(asset.id), bytes, asset.mime);
    written.push(ORIGINAL_KEY(asset.id));
    if (!deps.renderer || asset.kind !== 'image') return true;
    let out;
    try { out = await deps.renderer.render(bytes); } catch { return false; } // valid signature, undecodable body
    for (const v of out.variants) {
      await deps.storage.put(VARIANT_KEY(asset.id, v.name), v.bytes, 'image/webp');
      written.push(VARIANT_KEY(asset.id, v.name));
    }
    size = { width: out.width, height: out.height };
    return true;
  };
  // The CSAM check runs first and on whatever bytes arrived: a wrong declared type must not skip it.
  /** @type {'pass' | 'match' | 'error' | null} */
  let csam = null;
  if (deps.scanner) {
    const r = await deps.scanner.check(bytes, asset.mime);
    csam = r.result;
    log.push({ provider: deps.scanner.name, kind: 'csam', result: r.result, ref: r.ref });
  }
  const real = sniff(bytes);
  const typeOk = sameType(asset.mime, real);
  log.push({ provider: 'sniff', kind: 'file', result: typeOk ? 'pass' : 'error' });
  /** @type {{state: string, reason?: string, explicit?: boolean}} */
  let decision;
  if (csam === 'match') decision = { state: 'blocked', reason: 'csam_match' };
  else if (terminal) decision = { state: terminal, reason: csam === 'pass' ? undefined : csam ? 'scanner_error' : 'scanner_not_configured' };
  else if (!typeOk) decision = { state: 'rejected', reason: 'invalid_file' };
  else if (csam === 'error') decision = { state: 'needs_review', reason: 'scanner_error' };
  else if (!(await publish())) decision = { state: 'rejected', reason: 'invalid_file' };
  else if (!csam) decision = { state: 'needs_review', reason: 'scanner_not_configured' };
  else decision = await classify(deps, asset, bytes, log);
  const keepCopies = ['approved', 'needs_review'].includes(decision.state) && written.length > 0;
  const committed = await db.tx(async q => {
    const rows = await q.query(
      `update feture.media_asset set state = $2, reject_reason = case when $11 in ('removed', 'rejected') and $2 <> 'blocked' then reject_reason else $3 end, scanned_at = now(), sha256 = $5,
         csam_checked_at = case when $9 then now() else csam_checked_at end,
         copies_at = case when $10 then now() else copies_at end,
         scan_token = null, scan_lock_until = null,
         approved_at = case when $2 = 'approved' then now() end,
         explicitness = case when $4::boolean is null then explicitness when $4 then 'explicit' else 'safe' end,
         explicitness_source = case when $4::boolean is null then explicitness_source
           when explicitness_source = 'author' and explicitness = 'explicit' then 'author' else 'classifier' end,
         width = coalesce($6, width), height = coalesce($7, height)
       where id = $1 and scan_token = $8::uuid and state = $11 returning id`,
      [asset.id, decision.state, decision.reason ?? null, decision.explicit ?? null, sha,
        /** @type {any} */ (size)?.width ?? null, /** @type {any} */ (size)?.height ?? null, asset.scan_token,
        csam === 'pass' || csam === 'match', keepCopies, terminal ?? 'scanning']);
    if (!rows[0]) return false;
    for (const s of log) {
      await q.query(
        'insert into feture.media_scan (asset_id, provider, check_kind, result, score, provider_ref) values ($1, $2, $3, $4, $5, $6)',
        [asset.id, s.provider, s.kind, s.result, s.score ?? null, s.ref ?? null]);
    }
    if (decision.state === 'blocked') await enqueue(q, 'safety.csamMatch', asset.owner_profile_id, { assetId: asset.id });
    if (decision.state === 'needs_review') await enqueue(q, 'moderation.mediaReview', asset.owner_profile_id, { assetId: asset.id, reason: decision.reason });
    if (decision.state === 'approved') await enqueue(q, 'media.approved', asset.owner_profile_id, { assetId: asset.id });
    if (decision.state === 'rejected' && !terminal) await enqueue(q, 'media.purge', asset.owner_profile_id, { assetId: asset.id });
    return true;
  });
  // Served copies only survive for approved / staff-review assets whose state did not change under us.
  if (!committed || !keepCopies) {
    for (const key of written) await deps.storage.remove(key);
  }
  if (!committed) throw new Error('state_changed');
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
