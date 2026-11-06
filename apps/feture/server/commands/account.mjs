// @ts-check
import { accountCommands } from '../../contracts/account.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { closeAppeals, closeDisputes, closeReports } from '../reports.mjs';
import { closePending } from '../approvals.mjs';
import { deleteCouple } from './couples.mjs';
import { cancelSubscriptions } from './premium.mjs';
import { closeOwned } from './communities.mjs';
import { endConversations } from './chats.mjs';
import { checkCode, confirmEnrol, factorState, newRecoveryCodes, removeFactor, startEnrol } from '../second-factor.mjs';
import { keepOnlyThisSignin, passSignin } from '../signin.mjs';
import { ANY_STAFF, journal, openStaffSession, refused } from './staff.mjs';
import { hmac } from '../hash.mjs';

/** Account deletion and data export (S1 §16).
 * Deleting: every couple of the account is deleted (the partner stays with a text archive), the person profile and its
 * content go out of sight at once, files are purged, likes, matches and conversations end (messages already sent stay
 * with their recipients), the login link goes so the same login starts afresh. The account row stays as an empty
 * stub for the references and the retention rules (S9); the old nickname is held 30 days so nobody can pose as its
 * owner. Export: everything the person put in, as data, for them alone.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const HOLD_DAYS = 30;

/** Ends the person profile's ties and hides its content. @param {Q} q @param {string} pp person profile @param {string} accountId */
async function clearPerson(q, pp, accountId) {
  // Access both ways and requests.
  await q.query(`update feture.access_grant set revoked_at = now() where (owner_profile_id = $1 or viewer_profile_id = $1) and revoked_at is null`, [pp]);
  await q.query(`update feture.access_request set state = 'closed', closed_reason = 'revoked', decided_at = now() where (owner_profile_id = $1 or requester_profile_id = $1) and state = 'pending'`, [pp]);
  for (const t of ['interest', 'private_part', 'discover_decision', 'discover_filter', 'saved_item', 'feed_hide', 'profile_location']) {
    await q.query(`delete from feture.${t} where profile_id = $1`, [pp]);
  }
  await q.query(`update feture.profile_details set bio = '', city_id = null, genders = '{}', orients = '{}', roles = '{}', formats = '{}', seeks = '{}', status = null,
    height = null, smoking = null, alcohol = null, kids = null, langs = '{}', zodiac = null where profile_id = $1`, [pp]);
  await q.query(`update feture.profile_settings set discover_mode = 'off', updated_at = now() where profile_id = $1`, [pp]);
  // Social graph.
  await q.query(`delete from feture.follow where follower_profile_id = $1 or target_profile_id = $1`, [pp]);
  await q.query(`delete from feture.follow_removed where follower_profile_id = $1 or target_profile_id = $1`, [pp]);
  await q.query(`delete from feture.block where blocker_profile_id = $1`, [pp]);
  await q.query(`delete from feture.profile_link where a_profile_id = $1 or b_profile_id = $1`, [pp]);
  // Dating and chats: nothing comes back; the other side keeps its history of the conversation.
  const likes = await q.query(
    `update feture.profile_like set state = 'withdrawn', updated_at = now() where state in ('active', 'dismissed', 'matched') and (from_profile_id = $1 or to_profile_id = $1)
     returning state, from_profile_id, to_profile_id`, [pp]);
  for (const l of likes) if (l.from_profile_id === pp) await enqueue(q, 'like.withdrawn', l.to_profile_id, { from: pp });
  await q.query(`update feture.profile_match set ended_at = now(), ended_by_profile = $1 where ended_at is null and (profile_a = $1 or profile_b = $1)`, [pp]);
  await endConversations(q, pp, null, 'account_deleted');
  // Content: posts out of sight (purged by retention), replies emptied, drafts gone.
  await q.query(`update feture.post set state = 'archived', updated_at = now() where owner_profile_id = $1 and state in ('draft', 'review', 'published')`, [pp]);
  await q.query(`update feture.reply set state = 'deleted', body = '' where author_profile_id = $1 and state = 'published'`, [pp]);
  await q.query(`delete from feture.event_draft where owner_profile_id = $1`, [pp]);
  // Communities and events: memberships end; owned ones close; organised events are cancelled.
  await q.query(`update feture.community_member set state = 'left', role = 'member' where profile_id = $1 and state = 'active'`, [pp]);
  await q.query(`update feture.community_request set state = 'withdrawn', decided_at = now(), rev = rev + 1 where profile_id = $1 and state = 'pending'`, [pp]);
  await closeOwned(q, pp, [accountId]);
  await q.query(`delete from feture.event_rsvp where profile_id = $1`, [pp]);
  await q.query(`update feture.event_application set state = 'withdrawn', decided_at = now(), rev = rev + 1 where profile_id = $1 and state in ('pending', 'approved')`, [pp]);
  // Files: out of sight now, bytes purged by the queue (never before a CSAM check, never evidence).
  const media = await q.query(`update feture.media_asset set state = 'removed', removed_at = now() where owner_profile_id = $1 and state not in ('removed', 'blocked') returning id`, [pp]);
  for (const m of media) {
    await enqueue(q, 'media.hide', pp, { assetId: m.id });
    await enqueue(q, 'media.purge', pp, { assetId: m.id });
  }
}

/** The login's key for a carried sanction: like the under-18 marker, without the login's generation (a re-created login
 * keeps it). @param {string} pepper @param {string} coreAccountHash */
export const sanctionKey = (pepper, coreAccountHash) => hmac(pepper, 'feture-sanction:v1:' + coreAccountHash);

/** Remembers a sanction in force for the login before its account is deleted (audit item 28). @param {Q} q
 * @param {string} pepper @param {string} coreAccountHash @param {string} accountId @param {string} pp person profile */
export async function carrySanction(q, pepper, coreAccountHash, accountId, pp) {
  const [s] = await q.query(
    `select a.state, a.suspension_rule, p.suspended_until, p.restricted_at, p.restricted_until, p.restriction_rule, p.restriction_scope
     from feture.account a join feture.profile p on p.id = a.person_profile_id where a.id = $1`, [accountId]);
  const suspended = s.state === 'suspended';
  const restricted = !!s.restricted_at && (!s.restricted_until || new Date(s.restricted_until) > new Date());
  if (!suspended && !restricted) return;
  await q.query(
    `insert into feture.sanction_carry (key_hmac, kind, rule, until, scope) values ($1, $2, $3, $4, $5)
     on conflict (key_hmac) do update set kind = excluded.kind, rule = excluded.rule, until = excluded.until, scope = excluded.scope, created_at = now()`,
    [sanctionKey(pepper, coreAccountHash), suspended ? 'suspend' : 'restrict', suspended ? s.suspension_rule : s.restriction_rule,
      suspended ? s.suspended_until : s.restricted_until, suspended ? null : s.restriction_scope]);
  await journal(q, null, 'sanction.carried', 'profile', pp, { kind: suspended ? 'suspend' : 'restrict' });
}

/** @param {Q} q @param {string} accountId */
const isStaff = async (q, accountId) => (await q.query(`select 1 from feture.staff_role where account_id = $1 and role = any($2) and revoked_at is null limit 1`, [accountId, ANY_STAFF])).length > 0;

/** @type {Record<keyof typeof accountCommands, Command['run']>} */
const run = {
  async 'account.delete'(q, { account, input, cfg, coreAccountHash }) {
    const [a] = await q.query(
      `select a.id, a.person_profile_id, p.handle from feture.account a left join feture.profile p on p.id = a.person_profile_id where a.id = $1 for update of a`, [account.id]);
    if (!a.person_profile_id || (a.handle ?? '').toLowerCase() !== input.confirmHandle.toLowerCase()) fail(400, 'invalid_input', { fields: ['confirmHandle'] });
    // Deleting is always possible, under a sanction too (audit item 28): the sanction in force is remembered for this
    // login (sanction_carry, keyed like the under-18 marker) and a new account of it gets it until the same end.
    await carrySanction(q, String(cfg.pepper), coreAccountHash, a.id, a.person_profile_id);
    // A subscription is ended at its provider first: nothing is deleted if that fails, so nobody is charged after leaving.
    await cancelSubscriptions(q, cfg, a.id);
    // Out of reach first: a like, an invitation answer or a request racing this deletion waits for it and then fails.
    await q.query(`update feture.profile set state = 'deleted', updated_at = now() where id = $1`, [a.person_profile_id]);
    await q.query(`update feture.couple_invite set state = 'withdrawn', answered_at = now() where (from_account = $1 or to_account = $1) and state = 'pending'`, [a.id]);
    // Couples next (also one created by an invitation accepted a moment ago): the partner keeps their own profile.
    const couples = await q.query(
      `select p.id from feture.profile_member m join feture.profile p on p.id = m.profile_id
       where m.account_id = $1 and m.state = 'active' and p.kind = 'couple' and p.state in ('active', 'paused', 'suspended')`, [a.id]);
    for (const c of couples) await deleteCouple(q, c.id, 'member_deleted'); // its communities and events go with it (couples.mjs)
    await closePending(q, `a.requested_by = $1`, [a.id], 'cancelled', { silent: true });
    // Every open report about the person closes as «unavailable» — profile, posts, replies, chats (audit items 22, 28);
    // its appeals close and disputes on its posts too (24, 25). The evidence stays until then; blocked files never go.
    const pp = a.person_profile_id;
    await closeReports(q, 'profile', [pp], 'unavailable');
    await closeReports(q, 'post', (await q.query(`select id from feture.post where owner_profile_id = $1`, [pp])).map(r => r.id), 'unavailable');
    await closeReports(q, 'reply', (await q.query(`select id from feture.reply where author_profile_id = $1`, [pp])).map(r => r.id), 'unavailable');
    for (const c of await q.query(`select distinct target_id from feture.report where target_type = 'conversation' and reported_profile_id = $1 and state = 'open'`, [pp])) {
      await closeReports(q, 'conversation', [c.target_id], 'unavailable', pp);
    }
    await closeAppeals(q, [a.person_profile_id]);
    await closeDisputes(q, (await q.query(`select id from feture.post where owner_profile_id = $1`, [a.person_profile_id])).map(r => r.id));
    // Age and photo checks nobody will finish: out of the staff queues (and their counts) now.
    for (const t of ['age_check', 'photo_check']) await q.query(`update feture.${t} set state = 'expired' where account_id = $1 and state in ('started', 'submitted')`, [a.id]);
    await clearPerson(q, a.person_profile_id, a.id);
    // The account itself: no way back in, nothing personal left on it.
    await q.query(`delete from feture.conversation_member where account_id = $1`, [a.id]);
    for (const t of ['notification', 'push_device', 'notification_settings']) await q.query(`delete from feture.${t} where ${t === 'notification' ? 'recipient_account_id' : 'account_id'} = $1`, [a.id]);
    await q.query(`update feture.staff_role set revoked_at = now() where account_id = $1 and revoked_at is null`, [a.id]);
    await removeFactor(q, a.id);
    for (const t of ['staff_session', 'session_seen', 'account_signin', 'push_shown', 'email_address', 'email_delivery']) await q.query(`delete from feture.${t} where account_id = $1`, [a.id]);
    if (a.handle) {
      await q.query(`insert into feture.handle_hold (handle, profile_id, until) values (lower($1), $2, now() + make_interval(days => $3))
                     on conflict (handle) do update set until = excluded.until, profile_id = excluded.profile_id`, [a.handle, a.person_profile_id, HOLD_DAYS]);
    }
    await q.query(`update feture.profile set state = 'deleted', handle = null, chosen_name = '', avatar_asset_id = null, updated_at = now() where id = $1`, [a.person_profile_id]);
    await q.query(`update feture.profile_member set state = 'left', left_at = now() where account_id = $1 and state = 'active'`, [a.id]);
    await q.query(`update feture.account set state = 'deleted', birth_date = null, news_opt_in = false, updated_at = now() where id = $1`, [a.id]);
    await q.query(`update feture.couple_link set revoked_at = now() where from_account = $1 and used_at is null and revoked_at is null`, [a.id]);
    await q.query(`delete from feture.launch_wish where account_id = $1`, [a.id]);
    await q.query(`delete from feture.account_link where account_id = $1`, [a.id]);
    return { deleted: true };
  },

  // Optional second factor (owner 29.10.2026). Staff keep theirs on (it is required for them): no «off» for staff.
  async 'account.factor'(q, { account }) {
    const f = await factorState(q, account.id);
    return { enabled: f.enrolled, recoveryLeft: f.recoveryLeft, lockedUntil: f.lockedUntil, required: await isStaff(q, account.id) };
  },

  async 'account.factorStart'(q, { account, cfg }) {
    const [p] = await q.query('select handle from feture.profile where id = $1', [account.person_profile_id]);
    return await startEnrol(q, account.id, cfg.pepper ?? '', p?.handle ? '@' + p.handle : 'KINHAZE');
  },

  async 'account.factorConfirm'(q, { account, input, cfg }) {
    const { result, codes } = await confirmEnrol(q, account.id, cfg.pepper ?? '', input.code);
    if (!result.ok) return refused(result);
    // On from now: this sign-in passed; every other sign-in asks for a code at its next request.
    await keepOnlyThisSignin(q, account);
    // Shown once: the server keeps only their hashes.
    return { verified: true, codes };
  },

  async 'account.factorOff'(q, { account, input, cfg }) {
    if (await isStaff(q, account.id)) fail(409, 'conflict', { rule: 'factor_required' });
    const r = await checkCode(q, account.id, cfg.pepper ?? '', input.code);
    if (!r.ok) return refused(r);
    await removeFactor(q, account.id);
    return { verified: true, off: true };
  },

  async 'account.factorCodes'(q, { account, input, cfg }) {
    const r = await checkCode(q, account.id, cfg.pepper ?? '', input.code);
    if (!r.ok) return refused(r);
    return { verified: true, codes: await newRecoveryCodes(q, account.id, cfg.pepper ?? '') };
  },

  // The sign-in second step. A staff member's code also opens the staff window of this sign-in (one code, not two).
  async 'account.factorSignIn'(q, { account, input, cfg }) {
    const staff = await isStaff(q, account.id);
    const r = await checkCode(q, account.id, cfg.pepper ?? '', input.code);
    if (!r.ok) {
      if (staff && r.lockedNow) await journal(q, account.id, 'staff.factorLocked', 'account', account.id);
      return refused(r);
    }
    await passSignin(q, account);
    if (staff) {
      if (r.recovery) await journal(q, account.id, 'staff.recoveryUsed', 'account', account.id);
      await openStaffSession(q, account);
    }
    const f = await factorState(q, account.id);
    return { verified: true, recovery: r.recovery, recoveryLeft: f.recoveryLeft };
  },

  // «Мои устройства»: when each signed-in device last used the app and roughly where (server/devices.mjs). The list
  // of devices itself comes from Core (sessions); this only annotates it by Core's opaque session id.
  async 'account.devices'(q, { account }) {
    await q.query(`delete from feture.session_seen where account_id = $1 and seen_at < now() - interval '90 days'`, [account.id]);
    const rows = await q.query(`select session_id, seen_at, place from feture.session_seen where account_id = $1 order by seen_at desc limit 20`, [account.id]);
    return {
      items: rows.map(r => {
        const [city = '', country = ''] = String(r.place ?? '').split('|');
        return { id: r.session_id, seenAt: r.seen_at, city: city || null, country: country || null };
      }),
    };
  },

  async 'account.export'(q, { account }) {
    // The person's own data, everything they put in (GDPR art. 15/20). Other people's data appears only as nicknames.
    const one = async (/** @type {string} */ sql, /** @type {unknown[]} */ params = [account.id]) => (await q.query(sql, params))[0] ?? null;
    const many = (/** @type {string} */ sql, /** @type {unknown[]} */ params = [account.id]) => q.query(sql, params);
    const mine = `select m.profile_id from feture.profile_member m where m.account_id = $1 and m.state = 'active'`;
    return {
      export: {
        createdAt: new Date().toISOString(),
        account: await one(`select created_at, locale, birth_date, news_opt_in, chat_blur, show_explicit, onboarded_at, premium_until, age_verified_until from feture.account where id = $1`),
        consents: await many(`select document_key, locale, content_hash, accepted_at from feture.consent where account_id = $1 order by accepted_at`),
        profiles: await many(
          `select p.id, p.kind, p.handle, p.name, p.state, p.created_at, to_jsonb(d) - 'profile_id' details, to_jsonb(s) - 'profile_id' settings,
             (select coalesce(jsonb_agg(jsonb_build_object('topic', i.topic_id, 'value', i.value, 'mark', i.mark, 'dir', i.dir, 'vis', i.vis)), '[]') from feture.interest i where i.profile_id = p.id) interests,
             (select text from feture.private_part pp where pp.profile_id = p.id) private_text
           from feture.profile p left join feture.profile_details d on d.profile_id = p.id left join feture.profile_settings s on s.profile_id = p.id
           where p.id in (${mine})`),
        posts: await many(`select id, type, title, body, audience, state, created_at, published_at from feture.post where owner_profile_id in (${mine}) and created_by = $1 order by created_at limit 5000`),
        replies: await many(`select id, post_id, body, created_at from feture.reply where author_profile_id in (${mine}) and sent_by = $1 and state = 'published' order by created_at limit 5000`),
        blocks: await many(`select b.blocker_profile_id, t.handle, b.created_at from feture.block b join feture.profile t on t.id = b.blocked_profile_id where b.blocker_profile_id in (${mine})`),
        saved: await many(`select profile_id, kind, target_id, created_at from feture.saved_item where profile_id in (${mine})`),
        discoverFilter: await many(`select * from feture.discover_filter where profile_id in (${mine})`),
        discoverDecisions: await many(`select d.profile_id, t.handle, d.decision, d.decided_at from feture.discover_decision d join feture.profile t on t.id = d.target_profile_id where d.profile_id in (${mine}) and d.acted_by = $1`),
        links: await many(
          `select l.kind, l.state, o.handle, l.created_at from feture.profile_link l join feture.profile o on o.id = case when l.a_profile_id in (${mine}) then l.b_profile_id else l.a_profile_id end
           where l.a_profile_id in (${mine}) or l.b_profile_id in (${mine})`),
        notificationSettings: await one(`select settings from feture.notification_settings where account_id = $1`),
        pushDevices: await many(`select platform, tz, created_at, last_seen_at from feture.push_device where account_id = $1`),
        following: await many(`select f.follower_profile_id from_profile, t.handle, f.created_at from feture.follow f join feture.profile t on t.id = f.target_profile_id where f.follower_profile_id in (${mine})`),
        likesSent: await many(`select l.from_profile_id from_profile, t.handle, l.state, l.created_at from feture.profile_like l join feture.profile t on t.id = l.to_profile_id where l.from_profile_id in (${mine}) and l.initiator_account_id = $1`),
        matches: await many(
          `select m.created_at, m.ended_at, t.handle from feture.profile_match m join feture.profile t on t.id = case when m.profile_a in (${mine}) then m.profile_b else m.profile_a end
           where m.profile_a in (${mine}) or m.profile_b in (${mine})`),
        messagesSent: await many(`select conversation_id, seq, body, media_mode, created_at from feture.message where sender_account_id = $1 order by created_at limit 20000`),
        communities: await many(`select c.name, cm.role, cm.state, cm.joined_at from feture.community_member cm join feture.community c on c.id = cm.community_id where cm.profile_id in (${mine})`),
        eventsOrganized: await many(`select title, state, starts_at, created_at from feture.event where organizer_profile_id in (${mine}) and created_by = $1`),
        eventAnswers: await many(`select e.title, r.status, r.updated_at from feture.event_rsvp r join feture.event e on e.id = r.event_id where r.profile_id in (${mine}) and r.acted_by = $1`),
        eventApplications: await many(`select e.title, x.answers, x.note, x.state, x.created_at from feture.event_application x join feture.event e on e.id = x.event_id where x.profile_id in (${mine}) and x.acted_by = $1`),
        accessGiven: await many(`select g.owner_profile_id, v.handle viewer, g.scopes, g.until, g.revoked_at from feture.access_grant g join feture.profile v on v.id = g.viewer_profile_id where g.owner_profile_id in (${mine})`),
        media: await many(`select id, purpose, kind, state, created_at from feture.media_asset where uploaded_by = $1 order by created_at limit 5000`),
        reportsSent: await many(`select target_type, reason, state, resolution, created_at from feture.report where reporter_account = $1`),
        // Wave 8 tables (empty lists until their migration is applied).
        ...((await one(`select to_regclass('feture.support_ticket') is not null ok`, []))?.ok ? {
          support: await many(
            `select t.id, t.topic, t.state, t.created_at, (select jsonb_agg(jsonb_build_object('fromStaff', m.from_staff, 'body', m.body, 'at', m.created_at) order by m.created_at)
               from feture.support_message m where m.ticket_id = t.id) messages from feture.support_ticket t where t.account_id = $1 order by t.created_at`),
          purchases: await many(`select kind, plan, days, provider, state, anonymous, amount_cents, currency, created_at, paid_at from feture.purchase where account_id = $1 order by created_at`),
          // Premium: every period the account had (the staff's internal reason is not part of it), its subscriptions and the gifts it got.
          // Invitations: the code this account shares, how many came by it, and the code it came by itself (nobody else is named).
          referral: await one(`select (select code from feture.referral_code where owner_account_id = $1 and kind = 'personal') my_code,
              (select count(*)::int from feture.referral_use u join feture.referral_code c on c.id = u.code_id where c.owner_account_id = $1) invited,
              (select jsonb_build_object('kind', c.kind, 'state', u.state, 'at', u.created_at) from feture.referral_use u join feture.referral_code c on c.id = u.code_id where u.invitee_account_id = $1) came_by`),
          premiumPeriods: await many(`select source, starts_at, ends_at, revoked_at, created_at from feture.entitlement where account_id = $1 order by starts_at`),
          subscriptions: await many(`select provider, plan, auto_renew, renews_at, state, created_at from feture.subscription where account_id = $1 order by created_at`),
          giftsReceived: await many(`select days, paid_at, case when anonymous then null else (select handle from feture.profile where id = (select person_profile_id from feture.account where id = pu.account_id)) end from_handle
            from feture.purchase pu where kind = 'gift' and state = 'paid' and (recipient_account_id = $1 or recipient_profile_id in (${mine})) order by paid_at`),
        } : { support: [], purchases: [], premiumPeriods: [], subscriptions: [], giftsReceived: [] }),
      },
    };
  },
};

/** @type {Record<string, Command>} */
export const accounts = Object.fromEntries(
  Object.entries(accountCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
