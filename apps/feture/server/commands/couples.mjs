// @ts-check
import { couplesCommands } from '../../contracts/couples.mjs';
import { endConversations } from './chats.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { narrowCouple } from '../approvals.mjs';
import { closeAll } from './access.mjs';

/** Slice E: couples (S1 §5). An account is in at most one couple; the couple is its own profile that starts empty.
 * Either partner stops it at once; restoring needs both within 30 days, then it is deleted (jobs.sweepExpiredCouples).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
/** @param {Acting} acting */
const coupleOnly = acting => { if (acting.kind !== 'couple') fail(422, 'rule_violation', { rule: 'not_a_couple' }); };

/** The account's current couple (active or paused), if any. @param {Q} q @param {string} accountId */
async function currentCouple(q, accountId) {
  const [r] = await q.query(
    `select p.id, p.state from feture.profile_member m join feture.profile p on p.id = m.profile_id
     where m.account_id = $1 and m.profile_kind = 'couple' and m.state = 'active' and p.state in ('active', 'paused')`, [accountId]);
  return r ?? null;
}

/** Ends the couple's own outgoing side: its pending requests to others are cancelled and access others gave it is
 * revoked (it does not come back on restore). @param {Q} q @param {string} profileId */
async function closeOutgoing(q, profileId) {
  await q.query(
    `update feture.access_request set state = 'closed', closed_reason = 'couple_stopped', decided_at = now()
     where requester_profile_id = $1 and state = 'pending'`, [profileId]);
  await q.query(`update feture.access_grant set revoked_at = now() where viewer_profile_id = $1 and revoked_at is null`, [profileId]);
}

/** Deletes a couple now: members leave, access both ways and pending changes end, and the couple's own content
 * (interests, history, private part, details, private media) is deleted (S1 §16). @param {Q} q @param {string} profileId @param {string} reason */
export async function deleteCouple(q, profileId, reason) {
  await closeAll(q, profileId, 'couple_stopped');
  await closeOutgoing(q, profileId);
  await q.query(`update feture.partner_approval set state = 'cancelled', decided_at = now() where profile_id = $1 and state = 'pending'`, [profileId]);
  for (const t of ['interest', 'interest_history', 'private_part']) await q.query(`delete from feture.${t} where profile_id = $1`, [profileId]);
  await q.query(`update feture.profile_details set bio = '', city_id = null, roles = '{}', formats = '{}', seeks = '{}' where profile_id = $1`, [profileId]);
  const media = await q.query(
    `update feture.media_asset set state = 'removed', removed_at = now() where owner_profile_id = $1 and state not in ('removed', 'blocked') returning id`, [profileId]);
  for (const m of media) {
    await enqueue(q, 'media.hide', profileId, { assetId: m.id });
    await enqueue(q, 'media.purge', profileId, { assetId: m.id });
  }
  await q.query(`delete from feture.media_attachment where target_type = 'private' and target_id = $1`, [profileId]);
  // The couple's matches and conversations end; the other side keeps the history.
  await q.query(`update feture.profile_match set ended_at = now(), ended_by_profile = $1 where ended_at is null and (profile_a = $1 or profile_b = $1)`, [profileId]);
  await q.query(`update feture.profile_like set state = 'withdrawn', updated_at = now() where state = 'active' and (from_profile_id = $1 or to_profile_id = $1)`, [profileId]);
  await endConversations(q, profileId, null, 'pair_ended');
  // Ex-partners keep nothing of the couple's conversations; the other side keeps its history.
  await q.query(`delete from feture.conversation_member where profile_id = $1`, [profileId]);
  const members = await q.query(
    `update feture.profile_member set state = 'left', left_at = now() where profile_id = $1 and state = 'active' returning account_id`, [profileId]);
  await q.query(
    `update feture.profile set state = 'deleted', restore_until = null, paused_at = null, handle = null, name = '', updated_at = now() where id = $1`, [profileId]);
  for (const m of members) await enqueue(q, 'couple.deleted', null, { profileId, for: m.account_id, reason });
}

/** @type {Record<keyof typeof couplesCommands, Command['run']>} */
const run = {
  async 'couple.invite'(q, { account, input }) {
    // Limited by the handler (10 a day, failures included) so invitations cannot pester or probe who is in a couple.
    const [me] = await q.query(
      `select a.person_profile_id, p.name, p.handle from feture.account a join feture.profile p on p.id = a.person_profile_id
       where a.id = $1 and a.state = 'active' and p.state = 'active'`, [account.id]);
    if (!me) fail(422, 'rule_violation', { rule: 'registration_required' });
    const mine = await currentCouple(q, account.id);
    if (mine?.state === 'active') fail(422, 'rule_violation', { rule: 'already_in_couple' });
    if (mine?.state === 'paused') {
      // Starting a new couple while the old one waits for restoring ends the old one for good (V21 «Восстановить будет нельзя»).
      if (!input.replacePaused) fail(422, 'rule_violation', { rule: 'paused_couple_exists' });
      await deleteCouple(q, mine.id, 'replaced');
    }
    const handle = String(input.handle).replace(/^@/, '');
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(handle)) fail(400, 'invalid_input', { fields: ['handle'] });
    if (handle.toLowerCase() === String(me.handle).toLowerCase()) fail(422, 'rule_violation', { rule: 'self' });
    // Exact nickname of a person; couples cannot be invited. Not found and unavailable look the same.
    const [target] = await q.query(
      `select m.account_id, feture.blocked($2, p.id) blocked from feture.profile p join feture.profile_member m on m.profile_id = p.id and m.state = 'active'
       join feture.account a on a.id = m.account_id and a.state = 'active'
       where lower(p.handle) = lower($1) and p.kind = 'person' and p.state = 'active'`, [handle, me.person_profile_id]);
    // Blocked either way looks the same as not found.
    if (!target || target.blocked) fail(404, 'not_found');
    // After a decline the same person is not asked again for a week.
    const [{ declined }] = await q.query(
      `select exists (select 1 from feture.couple_invite where from_account = $1 and to_account = $2 and state = 'declined'
         and answered_at > now() - interval '7 days') declined`, [account.id, target.account_id]);
    if (declined) fail(422, 'rule_violation', { rule: 'invite_cooldown' });
    if (await currentCouple(q, target.account_id)) fail(422, 'rule_violation', { rule: 'partner_in_couple' });
    try {
      const [inv] = await q.query(`insert into feture.couple_invite (from_account, to_account) values ($1, $2) returning id`, [account.id, target.account_id]);
      await enqueue(q, 'couple.invited', null, { inviteId: inv.id, for: target.account_id });
      return { id: inv.id };
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'invite_pending' });
      throw error;
    }
  },

  async 'couple.invites'(q, { account }) {
    await q.query(`update feture.couple_invite set state = 'expired', answered_at = now() where state = 'pending' and expires_at < now() and (from_account = $1 or to_account = $1)`, [account.id]);
    const card = (/** @type {string} */ col) => `(select json_build_object('id', p.id, 'handle', p.handle, 'name', p.name)
      from feture.account a join feture.profile p on p.id = a.person_profile_id where a.id = i.${col} and a.state = 'active' and p.state = 'active')`;
    const outgoing = await q.query(
      `select i.id, i.state, i.created_at, i.answered_at, ${card('to_account')} profile from feture.couple_invite i
       where i.from_account = $1 order by i.created_at desc limit 5`, [account.id]);
    const incoming = await q.query(
      `select i.id, i.created_at, ${card('from_account')} profile from feture.couple_invite i
       where i.to_account = $1 and i.state = 'pending' order by i.created_at desc`, [account.id]);
    // The inviter sees a decline (CPL-013); the invitee only sees what is still waiting.
    return { outgoing, incoming };
  },

  async 'couple.inviteWithdraw'(q, { account, input }) {
    const rows = await q.query(
      `update feture.couple_invite set state = 'withdrawn', answered_at = now() where id = $1 and from_account = $2 and state = 'pending' returning to_account`,
      [input.inviteId, account.id]);
    if (!rows[0]) fail(404, 'not_found');
    return { state: 'withdrawn' };
  },

  async 'couple.inviteAnswer'(q, { account, input }) {
    const [inv] = await q.query(
      `select * from feture.couple_invite where id = $1 and to_account = $2 for update`, [input.inviteId, account.id]);
    if (!inv) fail(404, 'not_found');
    if (inv.state !== 'pending' || new Date(inv.expires_at) < new Date()) fail(409, 'conflict', { state: inv.state === 'pending' ? 'expired' : inv.state });
    if (!input.accept) {
      await q.query(`update feture.couple_invite set state = 'declined', answered_at = now() where id = $1`, [inv.id]);
      await enqueue(q, 'couple.declined', null, { inviteId: inv.id, for: inv.from_account });
      return { state: 'declined' };
    }
    // Both must still be free and active: either may have joined another couple or been suspended since.
    if (await currentCouple(q, inv.from_account) || await currentCouple(q, account.id)) fail(409, 'conflict', { rule: 'already_in_couple' });
    const [{ active }] = await q.query(
      `select count(*)::int active from feture.account a join feture.profile p on p.id = a.person_profile_id
       where a.id = any($1) and a.state = 'active' and p.state = 'active'`, [[inv.from_account, account.id]]);
    if (active !== 2) fail(409, 'conflict', { rule: 'unavailable' });
    const names = await q.query(
      `select coalesce(nullif(p.name, ''), p.handle) n from feture.account a join feture.profile p on p.id = a.person_profile_id where a.id = any($1)
       order by array_position($1, a.id)`, [[inv.from_account, account.id]]);
    const [couple] = await q.query(
      `insert into feture.profile (kind, name) values ('couple', $1) returning id`, [names.map(r => r.n).join(' и ').slice(0, 60)]);
    for (const acc of [inv.from_account, account.id]) {
      await q.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'couple', $2, now())`, [couple.id, acc]);
    }
    // A new couple starts empty, in Discover by default like everyone (AUTH-019), nobody's content copied (CPL-003).
    await q.query(`insert into feture.profile_settings (profile_id) values ($1)`, [couple.id]);
    await q.query(`insert into feture.profile_details (profile_id) values ($1)`, [couple.id]);
    await q.query(`update feture.couple_invite set state = 'accepted', answered_at = now(), couple_profile_id = $2 where id = $1`, [inv.id, couple.id]);
    // Other pending invitations of either partner are void now.
    await q.query(
      `update feture.couple_invite set state = 'withdrawn', answered_at = now() where state = 'pending' and id <> $1
       and (from_account = any($2) or to_account = any($2))`, [inv.id, [inv.from_account, account.id]]);
    for (const acc of [inv.from_account, account.id]) await enqueue(q, 'couple.created', couple.id, { for: acc });
    return { state: 'accepted', profileId: couple.id };
  },

  async 'couple.get'(q, { acting: a }) {
    const acting = need(a);
    coupleOnly(acting);
    const [p] = await q.query(`select id, name, state, paused_at, restore_until, created_at from feture.profile where id = $1`, [acting.profileId]);
    const members = await q.query(
      `select m.account_id = $2 me, m.approves_partner, pp.id profile_id, pp.handle, pp.name,
         exists (select 1 from feture.couple_restore r where r.profile_id = m.profile_id and r.account_id = m.account_id) restore_agreed
       from feture.profile_member m join feture.account a on a.id = m.account_id join feture.profile pp on pp.id = a.person_profile_id
       where m.profile_id = $1 and m.state = 'active' order by m.account_id = $2 desc`, [acting.profileId, acting.accountId]);
    return {
      couple: {
        id: p.id, name: p.name, state: p.state, since: p.created_at, pausedAt: p.paused_at, restoreUntil: p.restore_until,
        members: members.map(m => ({ me: m.me, profileId: m.profile_id, handle: m.handle, name: m.name, approvesPartner: m.approves_partner, restoreAgreed: m.restore_agreed })),
      },
    };
  },

  async 'couple.setApproval'(q, { acting: a, input }) {
    const acting = need(a);
    coupleOnly(acting);
    await q.query(`update feture.profile_member set approves_partner = $3 where profile_id = $1 and account_id = $2`, [acting.profileId, acting.accountId, input.approvesPartner]);
    await enqueue(q, 'couple.approvalChanged', acting.profileId, { for: acting.partnerAccountId, approves: input.approvesPartner });
    return { approvesPartner: input.approvesPartner };
  },

  async 'couple.stop'(q, { acting: a }) {
    const acting = need(a);
    coupleOnly(acting);
    // A safety action: immediate, by either partner; nothing pending can reopen anything afterwards.
    await narrowCouple(q, acting, 'couple_stopped');
    const closed = await closeAll(q, acting.profileId, 'couple_stopped');
    await closeOutgoing(q, acting.profileId);
    // Approval settings start over if the couple is restored (V21 dissolvePair).
    await q.query(`update feture.profile_member set approves_partner = false where profile_id = $1`, [acting.profileId]);
    await q.query(`update feture.profile_settings set discover_mode = 'off', updated_at = now() where profile_id = $1`, [acting.profileId]);
    const [p] = await q.query(
      `update feture.profile set state = 'paused', paused_at = now(), restore_until = now() + interval '30 days', updated_at = now()
       where id = $1 and state = 'active' returning restore_until`, [acting.profileId]);
    if (!p) fail(409, 'conflict', { state: 'not_active' });
    await q.query(`delete from feture.couple_restore where profile_id = $1`, [acting.profileId]);
    await enqueue(q, 'couple.stopped', acting.profileId, { for: acting.partnerAccountId });
    return { state: 'paused', restoreUntil: p.restore_until, ...closed };
  },

  async 'couple.restore'(q, { acting: a }) {
    const acting = need(a);
    coupleOnly(acting);
    const [p] = await q.query(`select state, restore_until > now() open from feture.profile where id = $1 for update`, [acting.profileId]);
    if (p.state !== 'paused' || !p.open) fail(409, 'conflict', { state: p.state });
    await q.query(`insert into feture.couple_restore (profile_id, account_id) values ($1, $2) on conflict do nothing`, [acting.profileId, acting.accountId]);
    const [{ n }] = await q.query(
      `select count(*)::int n from feture.couple_restore r join feture.profile_member m on m.profile_id = r.profile_id and m.account_id = r.account_id and m.state = 'active'
       where r.profile_id = $1`, [acting.profileId]);
    if (n < 2) {
      await enqueue(q, 'couple.restoreRequested', acting.profileId, { for: acting.partnerAccountId });
      return { state: 'paused', waitingForPartner: true };
    }
    // Restored with Discover off: being shown again is a fresh decision (V21 4524).
    await q.query(`update feture.profile set state = 'active', paused_at = null, restore_until = null, updated_at = now() where id = $1`, [acting.profileId]);
    await q.query(`delete from feture.couple_restore where profile_id = $1`, [acting.profileId]);
    await enqueue(q, 'couple.restored', acting.profileId, { for: acting.partnerAccountId });
    return { state: 'active' };
  },
};

/** @type {Record<string, Command>} */
export const couples = Object.fromEntries(
  Object.entries(couplesCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
