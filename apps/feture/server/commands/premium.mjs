// @ts-check
import { randomInt } from 'node:crypto';
import { premiumCommands } from '../../contracts/premium.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { mediaDto } from '../media/assets.mjs';
import { journal, requireStaff } from './staff.mjs';

/** Slice H1: Premium and the age check by selfie (S1 §15, S3 §8).
 * Premium belongs to an account; acting as a couple, the couple has it when at least one partner does (Q12). Premium
 * never promotes anyone and never opens anything private. The age check: the server picks a gesture, the person sends a
 * selfie making it, staff compare it with the approved profile photo. The selfie is seen only by staff and goes 30 days
 * after the decision.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q @typedef {import('../db.mjs').Db} Db
 * @typedef {import('../outbox.mjs').OutboxItem} OutboxItem
 */

const GESTURES = ['thumb_up', 'peace', 'open_palm', 'three_fingers', 'ok_sign', 'hand_on_head'];
const START_MINUTES = 30;
const AGE_CHECK_YEARS = 1;
const KEEP_DAYS = 30;

/** Premium for an account, or for a profile (any active partner of a couple, Q12). @param {Q} q @param {string} accountId @param {string} [profileId] */
export async function isPremium(q, accountId, profileId) {
  const [r] = await q.query(
    `select exists (select 1 from feture.account a where a.premium_until > now() and (a.id = $1 or a.id in (
       select m.account_id from feture.profile_member m join feture.profile p on p.id = m.profile_id
       where m.profile_id = $2 and m.state = 'active' and p.kind = 'couple'))) p`, [accountId, profileId ?? null]);
  return !!r.p;
}

/** The account's Premium end, from its entitlements. @param {Q} q @param {string} accountId */
async function recompute(q, accountId) {
  await q.query(
    `update feture.account set premium_until = (select max(ends_at) from feture.entitlement where account_id = $1 and revoked_at is null), updated_at = now() where id = $1`,
    [accountId]);
}

/** The selfie of a decided check goes for good 30 days after the decision (S3 §8). @param {Db} db */
export function verificationHandlers(db) {
  return {
    'verification.expire': async (/** @type {OutboxItem} */ item) => {
      const assetId = String(/** @type {any} */ (item.payload).assetId);
      await db.tx(async q => {
        const rows = await q.query(`update feture.media_asset set state = 'removed', removed_at = now() where id = $1 and purpose = 'verification' and state not in ('removed', 'blocked') returning owner_profile_id`, [assetId]);
        if (rows[0]) {
          await enqueue(q, 'media.hide', rows[0].owner_profile_id, { assetId });
          await enqueue(q, 'media.purge', rows[0].owner_profile_id, { assetId });
        }
      });
    },
  };
}

/** @type {Record<keyof typeof premiumCommands, Command['run']>} */
const run = {
  async 'premium.status'(q, { acting, account }) {
    const [a] = await q.query('select premium_until from feture.account where id = $1', [account.id]);
    const own = !!a.premium_until && new Date(a.premium_until).getTime() > Date.now();
    const premium = own || await isPremium(q, account.id, acting?.profileId);
    return { premium, until: own ? a.premium_until : null, viaPartner: premium && !own };
  },

  async 'staff.premiumGrant'(q, { account, input }) {
    // For trying the app on ourselves before payments exist; every grant is journaled.
    await requireStaff(q, account.id, ['owner', 'lead']);
    const [t] = await q.query(`select a.id from feture.account a join feture.profile p on p.id = a.person_profile_id where lower(p.handle) = lower($1) and a.state = 'active'`, [input.handle]);
    if (!t) fail(404, 'not_found');
    const [e] = await q.query(
      `insert into feture.entitlement (account_id, source, starts_at, ends_at, granted_by, reason)
       select $1, 'staff', now(), greatest(now(), coalesce((select premium_until from feture.account where id = $1), now())) + make_interval(days => $2), $3, $4
       returning id, ends_at`, [t.id, input.days, account.id, input.reason]);
    await recompute(q, t.id);
    await journal(q, account.id, 'premium.grant', 'account', t.id, { days: input.days, reason: input.reason, entitlementId: e.id });
    return { id: e.id, until: e.ends_at };
  },

  async 'staff.premiumRevoke'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead']);
    const rows = await q.query(`update feture.entitlement set revoked_at = now() where id = $1 and revoked_at is null returning account_id`, [input.entitlementId]);
    if (!rows[0]) fail(404, 'not_found');
    await recompute(q, rows[0].account_id);
    await journal(q, account.id, 'premium.revoke', 'account', rows[0].account_id, { reason: input.reason, entitlementId: input.entitlementId });
    return { revoked: true };
  },

  async 'verification.ageStart'(q, { account }) {
    // Only with an approved profile photo to compare against.
    const [p] = await q.query(
      `select p.id from feture.account a join feture.profile p on p.id = a.person_profile_id
       join feture.media_asset m on m.id = p.avatar_asset_id and m.state = 'approved' where a.id = $1`, [account.id]);
    if (!p) fail(422, 'rule_violation', { rule: 'photo_required' });
    await q.query(`update feture.age_check set state = 'expired' where account_id = $1 and state = 'started' and created_at < now() - make_interval(mins => $2)`, [account.id, START_MINUTES]);
    const [open] = await q.query(`select id, gesture, state from feture.age_check where account_id = $1 and state in ('started', 'submitted')`, [account.id]);
    if (open) return { id: open.id, gesture: open.gesture, state: open.state };
    const [c] = await q.query(`insert into feture.age_check (account_id, gesture) values ($1, $2) returning id, gesture`, [account.id, GESTURES[randomInt(GESTURES.length)]]);
    return { id: c.id, gesture: c.gesture, state: 'started' };
  },

  async 'verification.ageSubmit'(q, { account, input }) {
    const [c] = await q.query(
      `select c.*, c.created_at < now() - make_interval(mins => $3) late from feture.age_check c where c.id = $1 and c.account_id = $2 for update`, [input.checkId, account.id, START_MINUTES]);
    if (!c) fail(404, 'not_found');
    if (c.state !== 'started' || c.late) fail(409, 'conflict', { state: c.late ? 'expired' : c.state });
    const [m] = await q.query(
      `select 1 from feture.media_asset m join feture.account a on a.person_profile_id = m.owner_profile_id
       where m.id = $1 and a.id = $2 and m.purpose = 'verification' and m.state in ('uploaded', 'scanning', 'needs_review', 'approved')`, [input.assetId, account.id]);
    if (!m) fail(400, 'invalid_input', { fields: ['assetId'] });
    await q.query(`update feture.age_check set state = 'submitted', asset_id = $2, submitted_at = now() where id = $1`, [c.id, input.assetId]);
    await enqueue(q, 'moderation.ageCheck', null, { checkId: c.id });
    return { state: 'submitted' };
  },

  async 'verification.ageStatus'(q, { account }) {
    const [a] = await q.query('select age_verified_until from feture.account where id = $1', [account.id]);
    const [c] = await q.query(`select id, state, reason, gesture from feture.age_check where account_id = $1 order by created_at desc limit 1`, [account.id]);
    return {
      verified: !!a.age_verified_until && new Date(a.age_verified_until).getTime() > Date.now(), until: a.age_verified_until,
      check: c ? { id: c.id, state: c.state, reason: c.reason, gesture: c.state === 'started' ? c.gesture : null } : null,
    };
  },

  async 'staff.ageCheckQueue'(q, { account, input, cfg }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'moderator']);
    const rows = await q.query(
      `select c.id, c.gesture, c.submitted_at, c.asset_id, p.id profile_id, p.handle, p.avatar_asset_id avatar_id
       from feture.age_check c join feture.account a on a.id = c.account_id join feture.profile p on p.id = a.person_profile_id
       where c.state = 'submitted' and c.account_id <> $1 order by c.submitted_at limit $2`, [account.id, input.limit]);
    const items = [];
    for (const r of rows) {
      const [selfie] = await q.query('select * from feture.media_asset where id = $1', [r.asset_id]);
      const [avatar] = r.avatar_id ? await q.query('select * from feture.media_asset where id = $1', [r.avatar_id]) : [null];
      const ctx = { viewerProfileId: account.id, place: /** @type {const} */ ('own'), showExplicit: true, staff: true };
      items.push({
        id: r.id, gesture: r.gesture, submittedAt: r.submitted_at, profile: { id: r.profile_id, handle: r.handle },
        selfie: selfie ? await mediaDto(cfg.media, selfie, ctx).catch(() => null) : null,
        photo: avatar ? await mediaDto(cfg.media, avatar, ctx).catch(() => null) : null,
      });
    }
    return { items };
  },

  async 'staff.ageCheckDecide'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'moderator']);
    const [c] = await q.query('select * from feture.age_check where id = $1 for update', [input.checkId]);
    if (!c) fail(404, 'not_found');
    if (c.account_id === account.id) fail(403, 'forbidden');
    if (c.state !== 'submitted') fail(409, 'conflict', { state: c.state });
    await q.query(`update feture.age_check set state = $2, reason = $3, decided_by = $4, decided_at = now() where id = $1`,
      [c.id, input.approve ? 'approved' : 'rejected', input.approve ? null : input.reason, account.id]);
    if (input.approve) {
      await q.query(`update feture.account set age_verified_until = now() + make_interval(years => $2), updated_at = now() where id = $1`, [c.account_id, AGE_CHECK_YEARS]);
    }
    const [p] = await q.query('select person_profile_id from feture.account where id = $1', [c.account_id]);
    await enqueue(q, 'verification.decided', p.person_profile_id, { state: input.approve ? 'approved' : 'rejected', reason: input.reason ?? null });
    if (c.asset_id) await enqueue(q, 'verification.expire', p.person_profile_id, { assetId: c.asset_id }, { delaySeconds: KEEP_DAYS * 86400 });
    await journal(q, account.id, input.approve ? 'age.approve' : 'age.reject', 'account', c.account_id, { checkId: c.id, reason: input.reason ?? null });
    return { state: input.approve ? 'approved' : 'rejected' };
  },
};

/** @type {Record<string, Command>} */
export const premium = Object.fromEntries(
  Object.entries(premiumCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
