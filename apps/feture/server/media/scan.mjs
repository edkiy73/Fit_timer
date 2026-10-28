// @ts-check
import { createHash } from 'node:crypto';
import { enqueue } from '../outbox.mjs';
import { LIMITS, ORIGINAL_KEY, POSTER_UPLOAD_KEY } from './assets.mjs';
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
    if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
    return 'video/mp4';
  }
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'; // EBML (WebM / Matroska); sound-only files too
  if (ascii(0, 'OggS')) return 'audio/ogg';
  return null;
}

/** The container decides, not the label: a sound-only MP4 / WebM often carries the video brand.
 * @param {string} declared @param {string | null} real */
const sameType = (declared, real) =>
  real === declared || (real === 'image/heic' && declared === 'image/heif') || (real === 'video/mp4' && declared === 'video/quicktime')
  || (real === 'video/webm' && declared === 'audio/webm') || (real === 'video/mp4' && declared === 'audio/mp4');

/** Every served key of an asset. @param {string} id */
export const servedKeys = id => [ORIGINAL_KEY(id), ...VARIANTS.map(v => VARIANT_KEY(id, v.name))];

/** @param {Uint8Array} b @param {string} s @param {number} [from] @param {number} [to] */
const find = (b, s, from = 0, to = b.length) => {
  const i = Buffer.from(b.buffer, b.byteOffset, Math.min(to, b.length)).indexOf(s, from, 'latin1');
  return i;
};

/** Length of an MP4 / QuickTime clip from its movie header (`mvhd`), or null when there is none to read.
 * @param {Uint8Array} b @returns {number | null} */
export function mp4DurationMs(b) {
  const i = find(b, 'mvhd');
  if (i < 0 || i + 36 > b.length) return null;
  const dv = new DataView(b.buffer, b.byteOffset);
  const v1 = b[i + 4] === 1;
  const scale = dv.getUint32(i + (v1 ? 24 : 16));
  const units = v1 ? Number(dv.getBigUint64(i + 28)) : dv.getUint32(i + 20);
  if (!scale || units === 0xffffffff) return null;
  return Math.round(units / scale * 1000);
}

/** A voice message is sound only: no video track in the container (a picture stream there would dodge the image
 * checks). Errs on the side of «has video». @param {Uint8Array} b @param {string | null} real */
export function audioOnly(b, real) {
  if (real === 'audio/ogg') return find(b, '\x80theora') < 0;
  if (real === 'video/webm') {
    // TrackType (0x83) = 1 (video) inside Tracks, which comes before the first Cluster (0x1F43B675).
    const cluster = find(b, '\x1f\x43\xb6\x75');
    return find(b, '\x83\x81\x01', 0, cluster < 0 ? b.length : cluster) < 0;
  }
  if (real === 'video/mp4' || real === 'audio/mp4') {
    for (let i = find(b, 'hdlr'); i >= 0; i = find(b, 'hdlr', i + 4)) {
      if (String.fromCharCode(...b.slice(i + 12, i + 16)) === 'vide') return false;
    }
    return true;
  }
  return false;
}

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
     returning id, state, scan_token::text, owner_profile_id, purpose, kind, mime, storage_key, explicitness, poster_mime`,
    [assetId]);
  if (!asset) {
    const [busy] = await db.query(`select 1 from feture.media_asset where id = $1 and ${eligible}`, [assetId]);
    if (busy) throw new Error('scan_busy');
    return 'skipped'; // decided already, or never uploaded
  }
  const terminal = asset.state === 'removed' || asset.state === 'rejected' ? asset.state : null;
  const bytes = await deps.storage.get(asset.storage_key, LIMITS[/** @type {'image' | 'video' | 'audio'} */ (asset.kind)].maxBytes);
  // A video's poster frame was uploaded next to it; it is checked like any picture and becomes the picture variants.
  const poster = asset.poster_mime ? await deps.storage.get(POSTER_UPLOAD_KEY(asset.id), LIMITS.poster.maxBytes).catch(() => null) : null;
  const sha = createHash('sha256').update(bytes).digest();
  /** @type {{provider: string, kind: string, result: string, score?: number, ref?: string}[]} */
  const log = [];
  /** @type {string[]} */
  const written = [];
  /** @type {{width: number, height: number} | null} */
  let size = null;
  const picture = asset.kind === 'image' ? bytes : asset.kind === 'video' ? poster : null;
  const publish = async () => {
    await deps.storage.put(ORIGINAL_KEY(asset.id), bytes, asset.mime);
    written.push(ORIGINAL_KEY(asset.id));
    if (!deps.renderer || !picture) return true;
    let out;
    try { out = await deps.renderer.render(picture); } catch { return false; } // valid signature, undecodable body
    for (const v of out.variants) {
      await deps.storage.put(VARIANT_KEY(asset.id, v.name), v.bytes, 'image/webp');
      written.push(VARIANT_KEY(asset.id, v.name));
    }
    size = { width: out.width, height: out.height };
    return true;
  };
  const real = sniff(bytes);
  // A voice message whose container holds sound only has no picture for an image hash scanner to check; anything
  // else (a video track in a «voice» file) is refused below and never published.
  const soundOnly = asset.kind === 'audio' && sameType(asset.mime, real) && audioOnly(bytes, real);
  // The CSAM check runs first and on whatever bytes arrived (and on a video's poster): a wrong declared type must not
  // skip it.
  /** @type {'pass' | 'match' | 'error' | null} */
  let csam = null;
  if (deps.scanner && !soundOnly) {
    const results = [];
    for (const [b, mime] of /** @type {[Uint8Array, string][]} */ ([[bytes, asset.mime], ...(poster ? [[poster, asset.poster_mime]] : [])])) {
      const r = await deps.scanner.check(b, mime);
      log.push({ provider: deps.scanner.name, kind: 'csam', result: r.result, ref: r.ref });
      results.push(r.result);
    }
    csam = results.includes('match') ? 'match' : results.includes('error') ? 'error' : 'pass';
  }
  const typeOk = sameType(asset.mime, real) && (asset.kind !== 'video' || (!!poster && sniff(poster) === asset.poster_mime));
  log.push({ provider: 'sniff', kind: 'file', result: typeOk ? 'pass' : 'error' });
  // A clip's real length, read from its MP4 header when there is one (WebM is capped by its size).
  const lengthMs = asset.kind === 'video' && (real === 'video/mp4' || real === 'video/quicktime') ? mp4DurationMs(bytes) : null;
  const tooLong = lengthMs !== null && lengthMs > LIMITS.video.maxMs + 2000;
  /** @type {{state: string, reason?: string, explicit?: boolean}} */
  let decision;
  if (csam === 'match') decision = { state: 'blocked', reason: 'csam_match' };
  else if (terminal) decision = { state: terminal, reason: csam === 'pass' || soundOnly ? undefined : csam ? 'scanner_error' : 'scanner_not_configured' };
  else if (!typeOk || (asset.kind === 'audio' && !soundOnly)) decision = { state: 'rejected', reason: 'invalid_file' };
  else if (tooLong) decision = { state: 'rejected', reason: 'too_long' };
  else if (csam === 'error') decision = { state: 'needs_review', reason: 'scanner_error' };
  else if (!(await publish())) decision = { state: 'rejected', reason: 'invalid_file' };
  // Sound only, in a chat between matched people: nothing for an image check to decide (the label is conservative).
  else if (soundOnly) decision = { state: 'approved', explicit: true };
  else if (!csam) decision = { state: 'needs_review', reason: 'scanner_not_configured' };
  // No classifier judges moving pictures: every clip goes to staff, like any media in a public place without one.
  else if (asset.kind === 'video') decision = { state: 'needs_review', reason: 'video' };
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
         width = coalesce($6, width), height = coalesce($7, height), duration_ms = coalesce($12, duration_ms)
       where id = $1 and scan_token = $8::uuid and state = $11 returning id`,
      [asset.id, decision.state, decision.reason ?? null, decision.explicit ?? null, sha,
        /** @type {any} */ (size)?.width ?? null, /** @type {any} */ (size)?.height ?? null, asset.scan_token,
        csam === 'pass' || csam === 'match' || soundOnly, keepCopies, terminal ?? 'scanning', lengthMs || null]);
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
