// @ts-check
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';

/** @typedef {import('../db.mjs').Q} Q @typedef {import('../profiles.mjs').Acting} Acting
 * @typedef {import('./r2.mjs').Storage} Storage
 * @typedef {{storage: Storage | null, delivery: import('./delivery.mjs').Delivery | null}} MediaConfig
 * @typedef {'public' | 'private' | 'chat' | 'own'} Place where the media is shown; decides explicit handling
 */

export const LIMITS = Object.freeze({
  // HEIC is converted to JPEG on the device: the prelaunch variant renderer (sharp) cannot decode it.
  image: { maxBytes: 20 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp'] },
  video: { maxBytes: 500 * 1024 * 1024, mime: ['video/mp4', 'video/quicktime'] },
  perDay: 200,
  uploadTtlSeconds: 15 * 60,
  removeGraceSeconds: 24 * 3600,
});
// Purposes whose media every viewer may see; explicit is never approved for them (DB check too).
const PUBLIC_ONLY = new Set(['avatar', 'community', 'event']);
const TTL = { normal: 600, once: 60 };

/** Clients only ever get an upload URL for `u/<id>` (quarantine). Nothing reads it but the scanner.
 * Viewers get `o/<id>` and `v/<id>/*`, written by the server from the bytes it scanned, so replacing the
 * upload after approval changes nothing anyone sees. */
export const UPLOAD_KEY = (/** @type {string} */ id) => `u/${id}`;
export const ORIGINAL_KEY = (/** @type {string} */ id) => `o/${id}`;

/** S3 §5 step 1: a presigned direct upload. Video needs the Stream host, not wired in stage 0.
 * @param {Q} q @param {Acting} acting @param {MediaConfig} cfg
 * @param {{purpose: string, kind: 'image' | 'video', mime: string, bytes: number, explicit?: boolean,
 *   viewRule?: 'normal' | 'once' | 'timer', viewSeconds?: number}} input */
export async function uploadIntent(q, acting, cfg, input) {
  if (!cfg.storage) fail(503, 'unavailable');
  if (input.kind === 'video') fail(422, 'rule_violation', { rule: 'video_not_available' });
  const lim = LIMITS[input.kind];
  if (!lim.mime.includes(input.mime)) fail(422, 'rule_violation', { rule: 'media_type' });
  if (input.bytes > lim.maxBytes) fail(413, 'too_large');
  const viewRule = input.viewRule ?? 'normal';
  if (viewRule !== 'normal' && input.purpose !== 'chat') fail(422, 'rule_violation', { rule: 'view_rule_chat_only' });
  if (input.explicit && PUBLIC_ONLY.has(input.purpose)) fail(422, 'rule_violation', { rule: 'explicit_not_allowed' });
  // Serialise this account's uploads so parallel intents cannot all pass the daily count.
  await q.query(`select pg_advisory_xact_lock(hashtext('feture-media-quota:' || $1))`, [acting.accountId]);
  const [{ n }] = await q.query(
    `select count(*)::int n from feture.media_asset where uploaded_by = $1 and created_at > now() - interval '1 day'`,
    [acting.accountId]);
  if (n >= LIMITS.perDay) fail(429, 'rate_limited');
  const [{ id }] = await q.query('select feture.uuid_v7() id');
  const storageKey = UPLOAD_KEY(id);
  const [row] = await q.query(
    `insert into feture.media_asset (id, owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes,
       explicitness, explicitness_source, view_rule, view_seconds)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning upload_expires_at`,
    [id, acting.profileId, acting.accountId, input.kind, input.purpose, storageKey, input.mime, input.bytes,
      input.explicit ? 'explicit' : 'unknown', input.explicit ? 'author' : null,
      viewRule, viewRule === 'timer' ? input.viewSeconds ?? null : null]);
  return {
    assetId: /** @type {string} */ (id),
    upload: await cfg.storage.putUrl(storageKey, { mime: input.mime, bytes: input.bytes }, LIMITS.uploadTtlSeconds),
    expiresAt: row.upload_expires_at,
  };
}

/** S3 §5 step 3. Storage is checked before the transaction; the state change is conditional,
 * so a repeated commit is harmless. @param {Q} q @param {Acting} acting @param {MediaConfig} cfg @param {string} assetId */
export async function commitUpload(q, acting, cfg, assetId) {
  if (!cfg.storage) fail(503, 'unavailable');
  const asset = await ownAsset(q, acting, assetId);
  if (asset.state !== 'pending_upload') return { state: asset.state };
  if (asset.upload_expired) fail(409, 'conflict', { state: 'expired' });
  const stored = await cfg.storage.head(asset.storage_key);
  if (!stored) fail(409, 'conflict', { state: 'not_uploaded' });
  if (stored.bytes !== Number(asset.declared_bytes) || stored.mime !== asset.mime) fail(422, 'rule_violation', { rule: 'upload_mismatch' });
  const rows = await q.query(
    `update feture.media_asset set state = 'uploaded', bytes = $2 where id = $1 and state = 'pending_upload' returning state`,
    [asset.id, stored.bytes]);
  if (rows[0]) await enqueue(q, 'media.scan', acting.profileId, { assetId: asset.id });
  return { state: rows[0]?.state ?? 'uploaded' };
}

/** Author removes media: hidden at once (served copies deleted by `media.hide`), the upload purged
 * after the grace window. Removing cannot dodge the CSAM check: an uploaded-but-unscanned file is
 * still scanned (scan.mjs) and the purge waits for it; blocked files stay as evidence (S4).
 * @param {Q} q @param {Acting} acting @param {string} assetId */
export async function removeAsset(q, acting, assetId) {
  const asset = await ownAsset(q, acting, assetId, { lock: true });
  if (asset.state === 'removed') return { state: 'removed' };
  if (asset.state === 'blocked') fail(404, 'not_found');
  const rows = await q.query(
    `update feture.media_asset set state = 'removed', removed_at = now()
     where id = $1 and state not in ('blocked', 'removed') returning id`,
    [asset.id]);
  if (!rows[0]) fail(404, 'not_found');
  await enqueue(q, 'media.hide', acting.profileId, { assetId: asset.id });
  await enqueue(q, 'media.purge', acting.profileId, { assetId: asset.id }, { delaySeconds: LIMITS.removeGraceSeconds });
  return { state: 'removed' };
}

/** @param {Q} q @param {Acting} acting @param {string} assetId @param {{lock?: boolean}} [opts] */
async function ownAsset(q, acting, assetId, { lock = false } = {}) {
  const [row] = await q.query(
    `select id, state, storage_key, mime, declared_bytes, upload_expires_at <= now() upload_expired
     from feture.media_asset where id = $1 and owner_profile_id = $2 ${lock ? 'for update' : ''}`,
    [assetId, acting.profileId]);
  if (!row) fail(404, 'not_found');
  return row;
}

/**
 * Builds the media part of a DTO for one viewer (S3 §6). Returns null when the viewer may not see it.
 * Domains decide *whether* the viewer may see the place (post, chat, private part); this decides *how*.
 * @param {MediaConfig} cfg
 * @param {{id: string, owner_profile_id: string, kind: string, purpose: string, state: string, explicitness: string,
 *   width: number | null, height: number | null, view_rule: string, copies_at?: unknown}} asset
 * @param {{viewerProfileId: string, place: Place, showExplicit: boolean, staff?: boolean}} ctx
 *   showExplicit: the viewer turned explicit content on — on the website, as Apple 1.2 requires —
 *   and has not asked to blur it (chatBlur). The same answer applies in the apps once set.
 */
export async function mediaDto(cfg, asset, ctx) {
  const own = asset.owner_profile_id === ctx.viewerProfileId;
  const visible = asset.state === 'approved' || ((own || ctx.staff) && ['uploaded', 'scanning', 'needs_review'].includes(asset.state));
  if (!visible) return null;
  // Identity-check selfies are never shown to other users (S3 §8).
  if (asset.purpose === 'verification' && !own && !ctx.staff) return null;
  // Anything not positively labelled safe is treated as explicit.
  const explicit = asset.explicitness !== 'safe';
  if (explicit && ctx.place === 'public' && !own) return null; // never in public places (Apple 1.1.4 / 1.2)
  // View-once/timer media always start covered; explicit starts covered unless the viewer turned it on.
  const blurred = !own && !ctx.staff && (asset.view_rule !== 'normal' || (explicit && !ctx.showExplicit));
  // Until the served copies exist (upload still being checked) there is nothing to link to.
  if (!asset.copies_at) {
    return { id: asset.id, kind: asset.kind, w: asset.width, h: asset.height, pending: true, explicit, blurred, viewRule: asset.view_rule, src: null };
  }
  if (!cfg.delivery) fail(503, 'unavailable');
  const ttl = asset.view_rule === 'normal' ? TTL.normal : TTL.once;
  /** @type {import('./delivery.mjs').Variant[]} */
  const variants = blurred ? ['blur'] : ['thumb', 'card', 'full'];
  const urls = await cfg.delivery.urls(variants.map(variant => ({ assetId: asset.id, variant, viewerProfileId: ctx.viewerProfileId, ttlSeconds: ttl })));
  return {
    id: asset.id,
    kind: asset.kind,
    w: asset.width,
    h: asset.height,
    pending: asset.state !== 'approved',
    explicit,
    blurred,
    viewRule: asset.view_rule,
    src: Object.fromEntries(variants.map((v, i) => [v, urls[i]])),
  };
}
