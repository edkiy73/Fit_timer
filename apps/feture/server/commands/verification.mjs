// @ts-check
import { randomInt } from 'node:crypto';
import { verificationCommands } from '../../contracts/verification.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { mediaDto } from '../media/assets.mjs';
import { GESTURES } from './premium.mjs';
import { journal, requireStaff, staffCheck } from './staff.mjs';

/** V01 photo verification (S2-CATALOG «H» `verification.photoSubmit`, S3-MEDIA §8). The server picks a gesture, the
 * person sends a selfie making it, staff compare it with the profile photos. The result is the «Фото подтверждено»
 * badge: a yes/no on the public profile, not an age or identity check, opening nothing. The selfie is seen only by
 * staff (every look journaled), never published, and goes 30 days after the decision. Only with an approved main
 * photo; the badge holds while that photo stays on the profile (feture.photo_verified).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

let migrated = false;
/** Whether the photo-check migration is in (code may reach production before it). Only «yes» is remembered.
 * @param {Pick<Q, 'query'>} q */
export async function hasPhotoCheck(q) {
  if (!migrated) migrated = !!(await q.query(`select to_regprocedure('feture.photo_verified(uuid)') is not null ok`))[0]?.ok;
  return migrated;
}

/** The «Фото подтверждено» yes/no for each profile id (S1 §3); false before the migration. @param {Q} q @param {string[]} ids
 * @returns {Promise<Map<string, boolean>>} */
export async function photoVerifiedOf(q, ids) {
  if (!ids.length || !(await hasPhotoCheck(q))) return new Map();
  const rows = await q.query('select id, feture.photo_verified(id) ok from unnest($1::uuid[]) id', [ids]);
  return new Map(rows.map(r => [r.id, !!r.ok]));
}

const START_MINUTES = 30;
const KEEP_DAYS = 30;
const STAFF = ['owner', 'lead', 'moderator', 'verifier'];

/** The account's person profile with its approved main photo, or a refusal. @param {Q} q @param {string} accountId */
async function personWithPhoto(q, accountId) {
  const [p] = await q.query(
    `select p.id, p.avatar_asset_id from feture.account a join feture.profile p on p.id = a.person_profile_id
     join feture.media_asset m on m.id = p.avatar_asset_id and m.state = 'approved' where a.id = $1 and p.state = 'active'`, [accountId]);
  if (!p) fail(422, 'rule_violation', { rule: 'photo_required' });
  return p;
}

/** @type {Record<keyof typeof verificationCommands, Command['run']>} */
const run = {
  async 'verification.photoStart'(q, { account }) {
    const p = await personWithPhoto(q, account.id);
    await q.query(`update feture.photo_check set state = 'expired' where profile_id = $1 and state = 'started' and created_at < now() - make_interval(mins => $2)`, [p.id, START_MINUTES]);
    const [open] = await q.query(`select id, gesture, state from feture.photo_check where profile_id = $1 and state in ('started', 'submitted')`, [p.id]);
    if (open) return { id: open.id, gesture: open.gesture, state: open.state };
    try {
      const [c] = await q.query(`insert into feture.photo_check (profile_id, account_id, gesture) values ($1, $2, $3) returning id, gesture`, [p.id, account.id, GESTURES[randomInt(GESTURES.length)]]);
      return { id: c.id, gesture: c.gesture, state: 'started' };
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'check_open' });
      throw error;
    }
  },

  async 'verification.photoSubmit'(q, { account, input }) {
    const [c] = await q.query(
      `select c.*, c.created_at < now() - make_interval(mins => $3) late from feture.photo_check c where c.id = $1 and c.account_id = $2 for update`, [input.checkId, account.id, START_MINUTES]);
    if (!c) fail(404, 'not_found');
    if (c.state !== 'started' || c.late) fail(409, 'conflict', { state: c.late ? 'expired' : c.state });
    // The main photo staff will compare with, as it is now.
    const p = await personWithPhoto(q, account.id);
    if (p.id !== c.profile_id) fail(409, 'conflict', { state: 'expired' });
    // A fresh selfie of this person, never used by another check (age or photo).
    const [m] = await q.query(
      `select 1 from feture.media_asset m
       where m.id = $1 and m.owner_profile_id = $2 and m.purpose = 'verification' and m.state in ('uploaded', 'scanning', 'needs_review', 'approved')
         and m.created_at >= $3
         and not exists (select 1 from feture.photo_check x where x.asset_id = m.id)
         and not exists (select 1 from feture.age_check x where x.asset_id = m.id)`, [input.assetId, c.profile_id, c.created_at]);
    if (!m) fail(400, 'invalid_input', { fields: ['assetId'] });
    await q.query(`update feture.photo_check set state = 'submitted', asset_id = $2, photo_asset_id = $3, submitted_at = now() where id = $1`, [c.id, input.assetId, p.avatar_asset_id]);
    await enqueue(q, 'moderation.photoCheck', null, { checkId: c.id });
    return { state: 'submitted' };
  },

  async 'verification.photoStatus'(q, { account }) {
    const [a] = await q.query('select person_profile_id from feture.account where id = $1', [account.id]);
    const profileId = a?.person_profile_id ?? null;
    const [v] = profileId ? await q.query('select feture.photo_verified($1) ok', [profileId]) : [{ ok: false }];
    const [c] = profileId ? await q.query(`select id, state, reason, gesture, decided_at from feture.photo_check where profile_id = $1 order by created_at desc limit 1`, [profileId]) : [];
    const verified = !!v?.ok;
    // none → pending → approved | rejected (V21 photoCheck); an approval whose photo left the profile counts as none.
    const state = verified ? 'approved' : !c ? 'none' : c.state === 'submitted' ? 'pending' : c.state === 'rejected' ? 'rejected' : 'none';
    return {
      verified, state, reason: c?.state === 'rejected' ? c.reason : null, decidedAt: verified || c?.state === 'rejected' ? c?.decided_at ?? null : null,
      lapsed: !verified && c?.state === 'approved',
      check: c ? { id: c.id, state: c.state, gesture: c.state === 'started' ? c.gesture : null } : null,
    };
  },

  async 'staff.photoCheckQueue'(q, { account, input, cfg }) {
    await requireStaff(q, account, STAFF);
    // Selfies open only with a code from the last 10 minutes (as in staff.ageCheckQueue): otherwise `locked`.
    const locked = !(await staffCheck(q, account)).fresh;
    const rows = await q.query(
      `select c.id, c.gesture, c.submitted_at, c.asset_id, c.photo_asset_id, p.id profile_id, p.handle
       from feture.photo_check c join feture.profile p on p.id = c.profile_id
       where c.state = 'submitted' and c.account_id <> $1 order by c.submitted_at limit $2`, [account.id, input.limit]);
    const ctx = { viewerProfileId: account.person_profile_id ?? account.id, place: /** @type {const} */ ('own'), showExplicit: true, staff: true };
    const items = [];
    for (const r of rows) {
      const [selfie] = await q.query('select * from feture.media_asset where id = $1', [r.asset_id]);
      // The compared main photo first, then the profile's other photos.
      const photos = await q.query(
        `select m.* from feture.media_asset m where m.id = $2
         union all
         select m.* from (select a.asset_id, a.position from feture.media_attachment a where a.target_type = 'avatar' and a.target_id = $1 and a.asset_id is distinct from $2 order by a.position limit 5) x
         join feture.media_asset m on m.id = x.asset_id`, [r.profile_id, r.photo_asset_id]);
      // Every look at a selfie is journaled (S4 §3).
      if (!locked) await journal(q, account.id, 'photo.view', 'profile', r.profile_id, { checkId: r.id });
      const dtos = [];
      for (const ph of locked ? [] : photos) {
        const d = await mediaDto(cfg.media, ph, ctx).catch(() => null);
        if (d) dtos.push(d);
      }
      items.push({
        id: r.id, gesture: r.gesture, submittedAt: r.submitted_at, profile: { id: r.profile_id, handle: r.handle },
        selfie: selfie && !locked ? await mediaDto(cfg.media, selfie, ctx).catch(() => null) : null,
        photo: dtos[0] ?? null, photos: dtos,
      });
    }
    return { items, locked };
  },

  async 'staff.photoCheckDecide'(q, { account, input }) {
    await requireStaff(q, account, STAFF);
    const [c] = await q.query('select * from feture.photo_check where id = $1 for update', [input.checkId]);
    if (!c) fail(404, 'not_found');
    if (c.account_id === account.id) fail(403, 'forbidden');
    if (c.state !== 'submitted') fail(409, 'conflict', { state: c.state });
    if (input.approve) {
      // Never approved without the selfie in front of staff, nor against a photo that is no longer approved.
      const [s] = await q.query(`select 1 from feture.media_asset where id = $1 and state in ('needs_review', 'approved') and copies_at is not null`, [c.asset_id]);
      if (!s) fail(409, 'conflict', { rule: 'selfie_missing' });
      const [ph] = await q.query(`select 1 from feture.media_asset where id = $1 and state = 'approved'`, [c.photo_asset_id]);
      if (!ph) fail(409, 'conflict', { rule: 'photo_required' });
    }
    const state = input.approve ? 'approved' : 'rejected';
    await q.query(`update feture.photo_check set state = $2, reason = $3, decided_by = $4, decided_at = now() where id = $1`,
      [c.id, state, input.approve ? null : input.reason, account.id]);
    await enqueue(q, 'verification.photoDecided', c.profile_id, { state, reason: input.approve ? null : input.reason });
    if (c.asset_id) await enqueue(q, 'verification.expire', c.profile_id, { assetId: c.asset_id }, { delaySeconds: KEEP_DAYS * 86400 });
    await journal(q, account.id, input.approve ? 'photo.approve' : 'photo.reject', 'profile', c.profile_id, { checkId: c.id, reason: input.approve ? null : input.reason });
    return { state };
  },
};

/** @type {Record<string, Command>} */
export const verification = Object.fromEntries(
  Object.entries(verificationCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
