// @ts-check
import { randomInt } from 'node:crypto';
import { referralCommands } from '../../contracts/referral.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';
import { grantPeriod } from './premium.mjs';

/** Invitations and promo codes (contracts/referral.mjs). The newcomer is rewarded — and, for a personal code, the inviter —
 * once the newcomer has finished onboarding and passed the age check (`settleReferral`, called when either happens).
 * @typedef {import('../db.mjs').Q} Q */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROLES = ['owner', 'lead'];

/** @param {Q} q */
async function settings(q) {
  const [s] = await q.query('select * from feture.referral_settings where id');
  return s;
}

/** The account's own personal code, made when first asked for. @param {Q} q @param {string} accountId */
async function personalCode(q, accountId) {
  const [have] = await q.query(`select id, code from feture.referral_code where owner_account_id = $1 and kind = 'personal'`, [accountId]);
  if (have) return have;
  for (let i = 0; i < 8; i++) {
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    try {
      const [c] = await q.query(`insert into feture.referral_code (kind, code, owner_account_id) values ('personal', $1, $2) returning id, code`, [code, accountId]);
      return c;
    } catch (error) { if (!isUniqueViolation(error)) throw error; }
  }
  fail(503, 'unavailable');
}

/** Rewards a pending invitation of this account once it is earned: onboarding finished and the age check passed.
 * Called when either happens and when a code is applied. Safe to call any time: it does nothing until both are true, and once
 * only. @param {Q} q @param {string} accountId the invited account */
export async function settleReferral(q, accountId) {
  const [u] = await q.query(
    `select u.id, c.kind, c.owner_account_id inviter, c.days promo_days from feture.referral_use u join feture.referral_code c on c.id = u.code_id
     where u.invitee_account_id = $1 and u.state = 'pending' for update of u`, [accountId]);
  if (!u) return;
  const [a] = await q.query('select onboarded_at, feture.age_ok(id) ok from feture.account where id = $1', [accountId]);
  if (!a?.onboarded_at || !a.ok) return;
  const s = await settings(q);
  // A personal link counts only while the program is on; a promo code lives by its own switch and dates.
  if (u.kind === 'personal' && !s.enabled) return;
  const newcomerDays = u.kind === 'personal' ? s.reward_days : u.promo_days;
  await q.query(`update feture.referral_use set state = 'rewarded', rewarded_at = now() where id = $1`, [u.id]);
  if (newcomerDays > 0) await grantPeriod(q, accountId, 'referral', newcomerDays, { reason: u.kind === 'personal' ? 'invited' : 'promo', why: u.kind === 'personal' ? 'invited' : 'promo' });
  if (u.kind !== 'personal' || !s.inviter_days) return;
  // The inviter: up to `cap_count` rewarded invitations in the last `cap_days` days (this one included).
  const [{ n }] = await q.query(
    `select count(*)::int n from feture.referral_use x join feture.referral_code c on c.id = x.code_id
     where c.owner_account_id = $1 and x.state = 'rewarded' and x.rewarded_at > now() - make_interval(days => $2)`, [u.inviter, s.cap_days]);
  if (n > s.cap_count) return;
  const [i] = await q.query(`select person_profile_id from feture.account where id = $1 and state = 'active'`, [u.inviter]);
  if (!i) return;
  await grantPeriod(q, u.inviter, 'referral', s.inviter_days, { reason: 'invitation', notify: false });
  await enqueue(q, 'premium.referral', i.person_profile_id, { for: u.inviter, days: s.inviter_days });
}

/** @type {Record<keyof typeof referralCommands, import('../handler.mjs').Command['run']>} */
const run = {
  async 'referral.mine'(q, { account }) {
    const s = await settings(q);
    const code = await personalCode(q, account.id);
    const [stats] = await q.query(
      `select count(*)::int invited, count(*) filter (where state = 'rewarded')::int rewarded from feture.referral_use where code_id = $1`, [code.id]);
    const [mineUse] = await q.query(
      `select u.state, c.kind from feture.referral_use u join feture.referral_code c on c.id = u.code_id where u.invitee_account_id = $1`, [account.id]);
    return { enabled: s.enabled, code: code.code, rewardDays: s.reward_days, inviterDays: s.inviter_days, capCount: s.cap_count, capDays: s.cap_days,
      invited: stats.invited, rewarded: stats.rewarded, used: mineUse ? { state: mineUse.state, kind: mineUse.kind } : null };
  },

  async 'referral.apply'(q, { account, input }) {
    const code = input.code.toUpperCase();
    const [c] = await q.query(`select * from feture.referral_code where code = $1 and active`, [code]);
    // The same answer for «no such code», an expired or used-up one: nothing tells which codes exist.
    if (!c || (c.expires_at && new Date(c.expires_at).getTime() < Date.now())) fail(404, 'not_found');
    if (c.owner_account_id === account.id) fail(422, 'rule_violation', { rule: 'own_code' });
    const s = await settings(q);
    if (c.kind === 'personal' && !s.enabled) fail(404, 'not_found');
    if ((await q.query('select 1 from feture.referral_use where invitee_account_id = $1', [account.id])).length) fail(409, 'conflict', { rule: 'already_invited' });
    // For newcomers only: an account a week old or less (so an old account cannot collect a code afterwards).
    const [a] = await q.query(`select created_at > now() - interval '7 days' fresh from feture.account where id = $1`, [account.id]);
    if (!a.fresh) fail(422, 'rule_violation', { rule: 'not_new' });
    if (c.max_uses) {
      const [{ n }] = await q.query('select count(*)::int n from feture.referral_use where code_id = $1', [c.id]);
      if (n >= c.max_uses) fail(404, 'not_found');
    }
    try { await q.query('insert into feture.referral_use (code_id, invitee_account_id) values ($1, $2)', [c.id, account.id]); }
    catch (error) { if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'already_invited' }); throw error; }
    await settleReferral(q, account.id); // an account that is already done is rewarded at once
    const [now] = await q.query('select state from feture.referral_use where invitee_account_id = $1', [account.id]);
    return { state: now.state, kind: c.kind, days: c.kind === 'personal' ? s.reward_days : c.days };
  },

  async 'staff.referralSettings'(q, { account }) {
    await requireStaff(q, account, ROLES);
    const s = await settings(q);
    return { enabled: s.enabled, rewardDays: s.reward_days, inviterDays: s.inviter_days, capCount: s.cap_count, capDays: s.cap_days };
  },

  async 'staff.referralSettingsSet'(q, { account, input }) {
    await requireStaff(q, account, ROLES);
    const map = { enabled: 'enabled', rewardDays: 'reward_days', inviterDays: 'inviter_days', capCount: 'cap_count', capDays: 'cap_days' };
    for (const [k, col] of Object.entries(map)) if (k in input) await q.query(`update feture.referral_settings set ${col} = $1, updated_by = $2, updated_at = now() where id`, [/** @type {any} */ (input)[k], account.id]);
    const { opId: _o, ...changed } = /** @type {any} */ (input);
    await journal(q, account.id, 'referral.settings', 'premium', account.id, changed);
    const s = await settings(q);
    return { enabled: s.enabled, rewardDays: s.reward_days, inviterDays: s.inviter_days, capCount: s.cap_count, capDays: s.cap_days };
  },

  async 'staff.promoList'(q, { account }) {
    await requireStaff(q, account, ROLES);
    const items = await q.query(
      `select c.id, c.code, c.label, c.days, c.max_uses, c.expires_at, c.active, c.created_at,
              count(u.id)::int used, count(u.id) filter (where u.state = 'rewarded')::int rewarded
       from feture.referral_code c left join feture.referral_use u on u.code_id = c.id where c.kind = 'promo' group by c.id order by c.created_at desc limit 200`);
    const [p] = await q.query(
      `select count(*)::int invited, count(*) filter (where u.state = 'rewarded')::int rewarded from feture.referral_use u join feture.referral_code c on c.id = u.code_id where c.kind = 'personal'`);
    return { items: items.map(c => ({ id: c.id, code: c.code, label: c.label, days: c.days, maxUses: c.max_uses, expiresAt: c.expires_at, active: c.active, used: c.used, rewarded: c.rewarded })),
      personal: { invited: p.invited, rewarded: p.rewarded } };
  },

  async 'staff.promoCreate'(q, { account, input }) {
    await requireStaff(q, account, ROLES);
    const code = input.code.toUpperCase();
    try {
      const [c] = await q.query(
        `insert into feture.referral_code (kind, code, label, days, max_uses, expires_at, created_by) values ('promo', $1, $2, $3, $4, $5::date + 1, $6) returning id`,
        [code, input.label, input.days, input.maxUses ?? null, input.expiresAt ?? null, account.id]);
      await journal(q, account.id, 'promo.create', 'premium', account.id, { code, label: input.label, days: input.days, maxUses: input.maxUses ?? null, expiresAt: input.expiresAt ?? null });
      return { id: c.id, code };
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'code_taken' });
      throw error;
    }
  },

  async 'staff.promoSet'(q, { account, input }) {
    await requireStaff(q, account, ROLES);
    const [c] = await q.query(`update feture.referral_code set active = $2 where id = $1 and kind = 'promo' returning code`, [input.codeId, input.active]);
    if (!c) fail(404, 'not_found');
    await journal(q, account.id, 'promo.set', 'premium', account.id, { code: c.code, active: input.active });
    return { active: input.active };
  },
};

export const referral = Object.fromEntries(
  Object.entries(referralCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
