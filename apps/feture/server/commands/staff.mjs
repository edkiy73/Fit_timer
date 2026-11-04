// @ts-check
import { staffCommands } from '../../contracts/staff.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { checkCode, confirmEnrol, factorState, removeFactor, startEnrol } from '../second-factor.mjs';
import { passSignin } from '../signin.mjs';
import { staffFactorRequired } from '../staff-factor-switch.mjs';
import { pageInfo, plainRows, queuePageSql } from '../queue-page.mjs';
import { staffOwn } from '../sql-rules.mjs';

/** Media queue sort: the upload time, then the id (unique). */
/** The journal reads newest first, always. */
/** The person a journal entry is about: the profile itself, an account's personal profile, or the owner of the media,
 * post, reply, community or event; for a report, its author. SQL over `s` (feture.staff_action). */
const JOURNAL_PERSON = `case
  when s.target_type in ('profile', 'couple') then s.target_id
  when s.target_type = 'account' then (select x.person_profile_id from feture.account x where x.id = s.target_id)
  when s.target_type = 'media' then (select x.owner_profile_id from feture.media_asset x where x.id = s.target_id)
  when s.target_type = 'post' then (select x.owner_profile_id from feture.post x where x.id = s.target_id)
  when s.target_type = 'reply' then (select x.author_profile_id from feture.reply x where x.id = s.target_id)
  when s.target_type = 'community' then (select x.owner_profile_id from feture.community x where x.id = s.target_id)
  when s.target_type = 'event' then (select x.organizer_profile_id from feture.event x where x.id = s.target_id)
  when s.detail ->> 'author' ~ '^[0-9a-f-]{36}$' then (s.detail ->> 'author')::uuid
end`;
const JOURNAL_KEYS = [{ name: 'created_at', type: 'timestamptz', dir: 'desc' }, { name: 'id', type: 'uuid', dir: 'desc' }];
const MEDIA_KEYS = [{ name: 'created_at', type: 'timestamptz' }, { name: 'id', type: 'uuid' }];

/** S4 steps 1–2: staff roles, journal, media review (docs/server/S4-MODERATION.md).
 * Staff are ordinary accounts with a role; a staff member never decides about their own profiles or couple — except the
 * owner, who may do everything to themselves too (ownerSelf).
 * Every decision and every look at user media is written to the append-only journal.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const REVIEWERS = ['owner', 'lead', 'moderator', 'verifier'];
/** Media tokens name a profile as the viewer: staff view as their person profile. @param {{person_profile_id: string | null, id: string}} account */
const staffProfile = account => account.person_profile_id ?? account.id;
const PUBLIC_ONLY = new Set(['avatar', 'community', 'event']);

/** Staff second factor (owner 29.10.2026, docs/infra/security.md): every staff role needs an authenticator app and a
 * code in this sign-in, good for STAFF_WINDOW; dangerous actions (roles, bans, documents and selfies, resetting
 * someone's factor) want a code from the last FRESH_WINDOW. A refusal is 403 `second_factor` with `rule`:
 * `enrol` (no app yet), `verify` (no code in this sign-in or the window ran out), `fresh` (ask for a code again). */
export const STAFF_WINDOW = { hours: 12 };
export const FRESH_WINDOW = { minutes: 10 };

/** This sign-in's staff check. @param {Q} q @param {import('../accounts.mjs').AccountRow} account */
export async function staffCheck(q, account) {
  // The test-only switch is OFF (staff-factor-switch.mjs): the requirement is waived, nothing is stored or deleted.
  if (!(await staffFactorRequired(q))) return { enrolled: true, verified: true, fresh: true, until: null, freshUntil: null, waived: true };
  const [r] = await q.query(
    `select t.enabled_at is not null enrolled,
            s.started_at > now() - make_interval(hours => $3) verified,
            s.checked_at > now() - make_interval(mins => $4) fresh,
            s.started_at + make_interval(hours => $3) until, s.checked_at + make_interval(mins => $4) fresh_until
     from (select $1::uuid account_id) a
     left join feture.account_totp t on t.account_id = a.account_id
     left join feture.staff_session s on s.account_id = a.account_id and s.session_key = $2`,
    [account.id, account.session ?? '', STAFF_WINDOW.hours, FRESH_WINDOW.minutes]);
  const verified = !!account.session && !!r?.enrolled && !!r?.verified;
  return { waived: false, enrolled: !!r?.enrolled, verified, fresh: verified && !!r?.fresh, until: verified ? r.until : null, freshUntil: verified && r.fresh ? r.fresh_until : null };
}

/** Roles only, no factor: enrolment and the check itself. @param {Q} q @param {string} accountId @param {string[]} roles */
async function staffRoles(q, accountId, roles) {
  const rows = await q.query(`select role from feture.staff_role where account_id = $1 and revoked_at is null`, [accountId]);
  const mine = rows.map(r => /** @type {string} */ (r.role));
  if (!mine.some(r => roles.includes(r))) fail(403, 'forbidden');
  return mine;
}
export const ANY_STAFF = ['owner', 'lead', 'moderator', 'verifier', 'support', 'auditor'];

/** The owner may do every staff action, to others and to themselves (owner 04.11.2026): Premium, age and photo checks,
 * media review, roles, the second factor. Every action stays journaled. Other roles never act on their own profiles,
 * couple, checks or Premium. @param {string[]} roles the caller's roles, as requireStaff returns them */
export const ownerSelf = roles => roles.includes('owner');

/** A staff command: one of `roles`, and the second factor in this sign-in (`fresh`: a code within FRESH_WINDOW).
 * @param {Q} q @param {import('../accounts.mjs').AccountRow} account @param {string[]} roles @param {{fresh?: boolean}} [opts]
 * @returns {Promise<string[]>} the staff member's roles */
export async function requireStaff(q, account, roles, { fresh = false } = {}) {
  const mine = await staffRoles(q, account.id, roles);
  const c = await staffCheck(q, account);
  if (c.waived) return mine;
  if (!c.enrolled) fail(403, 'second_factor', { rule: 'enrol' });
  if (!c.verified) fail(403, 'second_factor', { rule: 'verify' });
  if (fresh && !c.fresh) fail(403, 'second_factor', { rule: 'fresh' });
  return mine;
}

/** A code was right: open (or extend the check of) this sign-in's staff window. A window that ran out starts anew.
 * @param {Q} q @param {import('../accounts.mjs').AccountRow} account */
export async function openStaffSession(q, account) {
  if (!account.session) fail(401, 'auth_required');
  await q.query(
    `insert into feture.staff_session (account_id, session_key) values ($1, $2)
     on conflict (account_id, session_key) do update set checked_at = now(),
       started_at = case when feture.staff_session.started_at > now() - make_interval(hours => $3) then feture.staff_session.started_at else now() end`,
    [account.id, account.session, STAFF_WINDOW.hours]);
  // Old windows of this account are of no use to anyone.
  await q.query(`delete from feture.staff_session where account_id = $1 and started_at < now() - make_interval(hours => $2)`, [account.id, STAFF_WINDOW.hours]);
  return staffCheck(q, account);
}

/** @param {import('../second-factor.mjs').CheckResult} r */
export const refused = r => r.ok ? {} : { verified: false, reason: r.reason, left: r.left, lockedUntil: r.lockedUntil };


/** @param {Q} q @param {string | null} staff null: the worker (a timed measure ran out) @param {string} action @param {string} targetType @param {string | null} targetId @param {Record<string, unknown>} [detail] */
export async function journal(q, staff, action, targetType, targetId, detail = {}) {
  await q.query(`insert into feture.staff_action (staff_account_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5)`,
    [staff, action, targetType, targetId, JSON.stringify(detail)]);
}

/** A post photo, profile photo or private-part file needs a look only while it is still used: a post (not archived
 * or removed) or the profile. Removed by its author (post deleted, photo taken off the profile) it leaves the queue and
 * can no longer be decided, so nobody is told about a file that is gone. (`m` is the media_asset row.) */
const IN_USE = `(m.purpose not in ('post', 'avatar', 'private') or exists (
  select 1 from feture.media_attachment ua left join feture.post up on ua.target_type = 'post' and up.id = ua.target_id
  where ua.asset_id = m.id and (ua.target_type <> 'post' or up.state not in ('archived', 'removed'))))`;

/** @param {Q} q @param {string} accountId @param {string} assetId @param {{lock?: boolean, self?: boolean}} [opts] self: may be one's own (the owner) */
async function reviewable(q, accountId, assetId, { lock = false, self = false } = {}) {
  const [a] = await q.query(
    `select m.*, ${staffOwn('m.owner_profile_id', '$2::uuid')} own,
       ${IN_USE} in_use
     from feture.media_asset m where m.id = $1 ${lock ? 'for update of m' : ''}`, [assetId, accountId]);
  if (!a) fail(404, 'not_found');
  if (a.own && !self) fail(403, 'forbidden'); // never about one's own profiles or couple (the owner may)
  return a;
}

/** @type {Record<keyof typeof staffCommands, Command['run']>} */
const run = {
  async 'staff.me'(q, { account }) {
    const rows = await q.query(`select role from feture.staff_role where account_id = $1 and revoked_at is null order by role`, [account.id]);
    if (!rows.length) return { roles: [] };
    const [c, f] = [await staffCheck(q, account), await factorState(q, account.id)];
    return { roles: rows.map(r => r.role), factor: { ...c, lockedUntil: f.lockedUntil, recoveryLeft: f.recoveryLeft } };
  },

  // Enrolment: a new secret for the authenticator app (QR + the key typed by hand), then the first code.
  async 'staff.totpStart'(q, { account, cfg }) {
    await staffRoles(q, account.id, ANY_STAFF);
    const [p] = await q.query('select handle from feture.profile where id = $1', [account.person_profile_id]);
    return await startEnrol(q, account.id, cfg.pepper ?? '', p?.handle ? '@' + p.handle : 'staff');
  },

  async 'staff.totpConfirm'(q, { account, input, cfg }) {
    await staffRoles(q, account.id, ANY_STAFF);
    const { result, codes } = await confirmEnrol(q, account.id, cfg.pepper ?? '', input.code);
    if (!result.ok) return refused(result);
    await journal(q, account.id, 'staff.factorOn', 'account', account.id);
    await passSignin(q, account); // the factor is on now: this sign-in already passed its second step
    // Shown once: the server keeps only their hashes (this command is never stored in the replay ledger).
    return { ...(await openStaffSession(q, account)), verified: true, codes };
  },

  async 'staff.totpVerify'(q, { account, input, cfg }) {
    await staffRoles(q, account.id, ANY_STAFF);
    const r = await checkCode(q, account.id, cfg.pepper ?? '', input.code);
    if (!r.ok) {
      if (r.lockedNow) await journal(q, account.id, 'staff.factorLocked', 'account', account.id);
      return refused(r);
    }
    if (r.recovery) await journal(q, account.id, 'staff.recoveryUsed', 'account', account.id);
    await passSignin(q, account); // the same code is this sign-in's second step
    const f = await factorState(q, account.id);
    return { ...(await openStaffSession(q, account)), verified: true, recovery: r.recovery, recoveryLeft: f.recoveryLeft };
  },

  // Lost phone: an owner or lead removes someone's factor; they enrol again at their next visit. Leads cannot reset
  // the owner; nobody but the owner resets their own (it needs a fresh code anyway).
  async 'staff.totpReset'(q, { account, input }) {
    const roles = await requireStaff(q, account, ['owner', 'lead'], { fresh: true });
    const [t] = await q.query(
      `select a.id from feture.profile p join feture.account a on a.person_profile_id = p.id
       where lower(p.handle) = lower($1) and p.kind = 'person'`, [String(input.handle).replace(/^@/, '')]);
    if (!t) fail(404, 'not_found');
    if (t.id === account.id && !ownerSelf(roles)) fail(422, 'rule_violation', { rule: 'self' });
    if (!roles.includes('owner')) {
      const [o] = await q.query(`select 1 from feture.staff_role where account_id = $1 and role = 'owner' and revoked_at is null`, [t.id]);
      if (o) fail(403, 'forbidden');
    }
    const removed = await removeFactor(q, t.id);
    await q.query('delete from feture.staff_session where account_id = $1', [t.id]);
    await journal(q, account.id, 'staff.factorReset', 'account', t.id, { removed });
    return { reset: removed };
  },

  async 'staff.topics'(q, { account }) {
    await requireStaff(q, account, ['owner', 'lead']);
    const [categories, topics] = await Promise.all([
      q.query('select id, ru, en, hidden from feture.topic_category order by position'),
      q.query(`select t.id, t.category_id "categoryId", t.ru, t.en, t.desc_ru "descRu", t.desc_en "descEn", t.hidden,
         (select count(*)::int from feture.interest i where i.topic_id = t.id) used
       from feture.topic t order by t.position`),
    ]);
    return { categories, topics };
  },

  async 'staff.topicSave'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead']);
    const [c] = await q.query('select 1 from feture.topic_category where id = $1', [input.categoryId]);
    if (!c) fail(400, 'invalid_input', { fields: ['categoryId'] });
    const desc = (/** @type {string | null} */ v) => v && v.trim() ? v.trim() : null;
    if (input.create) {
      const [taken] = await q.query('select 1 from feture.topic where id = $1', [input.id]);
      if (taken) fail(409, 'conflict', { rule: 'topic_exists' });
      await q.query(
        `insert into feture.topic (id, category_id, ru, en, desc_ru, desc_en, hidden, position)
         values ($1, $2, $3, $4, $5, $6, $7, coalesce((select max(position) + 1 from feture.topic where category_id = $2), 0))`,
        [input.id, input.categoryId, input.ru, input.en, desc(input.descRu), desc(input.descEn), input.hidden]);
    } else {
      const rows = await q.query(
        `update feture.topic set category_id = $2, ru = $3, en = $4, desc_ru = $5, desc_en = $6, hidden = $7 where id = $1 returning id`,
        [input.id, input.categoryId, input.ru, input.en, desc(input.descRu), desc(input.descEn), input.hidden]);
      if (!rows[0]) fail(404, 'not_found');
    }
    await journal(q, account.id, input.create ? 'topic.create' : 'topic.save', 'topic', null, { topic: input.id, hidden: input.hidden });
    return { id: input.id };
  },

  async 'staff.team'(q, { account }) {
    await requireStaff(q, account, ['owner']);
    const rows = await q.query(
      `select a.id account_id, p.id profile_id, p.handle, p.name, array_agg(r.role order by r.role) roles
       from feture.staff_role r join feture.account a on a.id = r.account_id left join feture.profile p on p.id = a.person_profile_id
       where r.revoked_at is null group by a.id, p.id, p.handle, p.name order by p.name nulls last, p.handle`);
    return { items: rows.map(r => ({ accountId: r.account_id, profileId: r.profile_id, handle: r.handle, name: r.name, roles: r.roles })) };
  },

  async 'staff.grant'(q, { account, input }) {
    await requireStaff(q, account, ['owner'], { fresh: true });
    // Only the owner gives roles, to others and to themselves (the owner role itself is never given here).
    const [t] = await q.query(
      `select a.id from feture.profile p join feture.account a on a.person_profile_id = p.id
       where lower(p.handle) = lower($1) and p.kind = 'person' and a.state = 'active' and p.state = 'active'`,
      [String(input.handle).replace(/^@/, '')]);
    if (!t) fail(404, 'not_found');
    const changed = input.grant
      ? await q.query(`insert into feture.staff_role (account_id, role, granted_by) values ($1, $2, $3) on conflict do nothing returning 1`, [t.id, input.role, account.id])
      : await q.query(`update feture.staff_role set revoked_at = now() where account_id = $1 and role = $2 and revoked_at is null returning 1`, [t.id, input.role]);
    if (changed.length) {
      await journal(q, account.id, input.grant ? 'staff.grant' : 'staff.revoke', 'account', t.id, { role: input.role });
      await enqueue(q, 'staff.role', null, { for: t.id, role: input.role, grant: input.grant });
    }
    // A revoked role ends the person's staff windows at once: with another role left they verify again.
    if (!input.grant) await q.query('delete from feture.staff_session where account_id = $1', [t.id]);
    return { changed: changed.length > 0 };
  },

  async 'staff.mediaQueue'(q, { account, input, cfg }) {
    const roles = await requireStaff(q, account, REVIEWERS);
    const { sql, params } = queuePageSql(input, MEDIA_KEYS,
      `select m.id, m.purpose, m.kind, m.explicitness, m.reject_reason reason, m.created_at, m.copies_at, m.width, m.height,
              o.id owner_id, o.kind owner_kind, o.handle owner_handle, o.name owner_name
       from feture.media_asset m left join feture.profile o on o.id = m.owner_profile_id
       where m.state = 'needs_review' and m.purpose <> 'verification'   -- selfies are decided in the age-check queue
         and ${IN_USE}
         and not ${staffOwn('m.owner_profile_id', '$1::uuid')}`,
      [ownerSelf(roles) ? null : account.id]); // the owner's queue includes their own media
    const rows = await q.query(sql, params);
    const page = pageInfo(rows, MEDIA_KEYS, input.limit);
    // The queue shows blurred previews; the full picture opens through staff.mediaView, which is journalled.
    const covered = (/** @type {any} */ r) => r.copies_at && r.kind !== 'audio'; // sound has no picture to blur
    const blur = cfg.media.delivery && rows.some(covered)
      ? await cfg.media.delivery.urls(rows.filter(covered).map(r => ({ assetId: r.id, variant: /** @type {const} */ ('blur'), viewerProfileId: staffProfile(account), ttlSeconds: 300 })))
      : [];
    const blurOf = new Map();
    let i = 0;
    for (const r of rows) if (covered(r)) blurOf.set(r.id, blur[i++]);
    // One card per upload (owner 05.11.2026): the files of one post come together, in the post's order — its other files
    // waiting for review are added even when this page did not reach them; a file not in a post is a card of its own.
    const items = [];
    const seen = new Set();
    for (const r of rows) {
      // Where the file is used, so a moderator judges it in context: the post's text, the community or event it is the
      // cover of; a chat file names no conversation (private).
      const [at] = await q.query(`select target_type, target_id from feture.media_attachment where asset_id = $1 order by created_at limit 1`, [r.id]);
      const group = at?.target_type === 'post' ? 'post:' + at.target_id : r.id;
      if (seen.has(group)) continue;
      seen.add(group);
      const used = !at ? null
        : at.target_type === 'post' ? (await q.query(`select left(coalesce(title || ': ', '') || body, 300) text from feture.post where id = $1`, [at.target_id]))[0]?.text
        : at.target_type === 'community' ? (await q.query(`select name text from feture.community where id = $1`, [at.target_id]))[0]?.text
        : at.target_type === 'event' ? (await q.query(`select title text from feture.event where id = $1`, [at.target_id]))[0]?.text : null;
      const siblings = at?.target_type === 'post' ? await q.query(
        `select m.id, m.kind, m.width, m.height, m.copies_at from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
         where a.target_type = 'post' and a.target_id = $1 and m.state = 'needs_review' and m.purpose <> 'verification' order by a.position`, [at.target_id]) : [r];
      const missing = siblings.filter(x => covered(x) && !blurOf.has(x.id));
      if (missing.length && cfg.media.delivery) {
        const more = await cfg.media.delivery.urls(missing.map(x => ({ assetId: x.id, variant: /** @type {const} */ ('blur'), viewerProfileId: staffProfile(account), ttlSeconds: 300 })));
        missing.forEach((x, k) => blurOf.set(x.id, more[k]));
      }
      items.push({
        id: r.id, group, purpose: r.purpose, kind: r.kind, authorLabel: r.explicitness, reason: r.reason, createdAt: r.created_at, w: r.width, h: r.height,
        blur: blurOf.get(r.id) ?? null, usedIn: used ?? null,
        assets: siblings.map(x => ({ id: x.id, kind: x.kind, w: x.width, h: x.height, blur: blurOf.get(x.id) ?? null })),
        // Whose file it is, so a measure («Принять меры») can be taken against them from the card.
        owner: r.owner_id ? { id: r.owner_id, kind: r.owner_kind, handle: r.owner_handle, name: r.owner_name } : null,
      });
    }
    return { items, ...page };
  },

  async 'staff.mediaView'(q, { account, input, cfg }) {
    const roles = await requireStaff(q, account, REVIEWERS);
    const a = await reviewable(q, account.id, input.assetId, { self: ownerSelf(roles) });
    // Age/photo-check selfies and identity documents open only in their own check queue, never by id from here.
    if (a.purpose === 'verification') fail(404, 'not_found');
    // Staff see content only for what is waiting for them (S4 §3): media on review, media of a post under open
    // reports or a dispute, or of chat messages picked as evidence in an open report; never blocked material or
    // private media at large.
    const [{ inCase }] = await q.query(
      `select exists (select 1 from feture.media_attachment ma join feture.post p on p.id = ma.target_id
         where ma.target_type = 'post' and ma.asset_id = $1
           and (p.disputed_at is not null or exists (select 1 from feture.photo_dispute d where d.post_id = p.id and d.state = 'open')
                or exists (select 1 from feture.report r where r.target_type = 'post' and r.target_id = p.id and r.state = 'open')))
       -- A chat message the reporter chose as evidence, while that report is open: only those, never the rest of the chat.
       or exists (select 1 from feture.message m join feture.report r on r.target_type = 'conversation' and r.target_id = m.conversation_id
         and r.state = 'open' and m.id = any(r.message_ids) where m.media_asset_id = $1) "inCase"`, [a.id]);
    if (a.state === 'blocked' || (a.state !== 'needs_review' && !inCase)) fail(409, 'conflict', { state: a.state });
    await journal(q, account.id, 'media.view', 'media', a.id);
    if (!a.copies_at || !cfg.media.delivery) return { src: null };
    // A clip: its poster frame plus the clip itself (`file`, long enough to play a minute through); sound: the file only.
    /** @type {import('../media/delivery.mjs').Variant[]} */
    const variants = a.kind === 'audio' ? ['file'] : a.kind === 'video' ? ['card', 'full', 'file'] : ['card', 'full'];
    const urls = await cfg.media.delivery.urls(variants.map(variant => ({ assetId: a.id, variant, viewerProfileId: staffProfile(account), ttlSeconds: variant === 'file' ? 300 : 120 })));
    return { src: Object.fromEntries(variants.map((v, i) => [v, urls[i]])) };
  },

  async 'staff.mediaDecide'(q, { account, input }) {
    const roles = await requireStaff(q, account, REVIEWERS);
    const a = await reviewable(q, account.id, input.assetId, { lock: true, self: ownerSelf(roles) });
    // Suspected CSAM can be escalated from any outcome (a later look, a report); everything else decides waiting media only.
    const escalate = input.decision === 'reject' && input.reason === 'csam_suspected';
    if (a.state === 'blocked' || (!escalate && a.state !== 'needs_review') || (escalate && !['needs_review', 'approved', 'rejected', 'removed'].includes(a.state))) {
      fail(409, 'conflict', { state: a.state });
    }
    if (!escalate && !a.in_use) fail(409, 'conflict', { rule: 'gone' }); // its author removed it meanwhile
    if (input.decision === 'approve') {
      if (input.explicit && PUBLIC_ONLY.has(a.purpose)) fail(422, 'rule_violation', { rule: 'explicit_not_allowed' });
      if (!a.copies_at) fail(422, 'rule_violation', { rule: 'no_copies' }); // nothing to show yet; it must be re-scanned
      await q.query(
        `update feture.media_asset set state = 'approved', approved_at = now(), explicitness = $2, explicitness_source = 'staff', reject_reason = null
         where id = $1`, [a.id, input.explicit ? 'explicit' : 'safe']);
      await enqueue(q, 'media.approved', a.owner_profile_id, { assetId: a.id });
    } else if (input.reason === 'csam_suspected') {
      // Suspected CSAM without a scanner match: blocked like a match and escalated (S4 §5); evidence is kept.
      await q.query(`update feture.media_asset set state = 'blocked', reject_reason = 'csam_suspected' where id = $1`, [a.id]);
      await enqueue(q, 'media.hide', a.owner_profile_id, { assetId: a.id, force: true });
      await enqueue(q, 'safety.csamMatch', a.owner_profile_id, { assetId: a.id, source: 'staff', by: account.id });
    } else {
      await q.query(`update feture.media_asset set state = 'rejected', reject_reason = $2 where id = $1`, [a.id, input.reason]);
      await enqueue(q, 'media.hide', a.owner_profile_id, { assetId: a.id });
      await enqueue(q, 'media.purge', a.owner_profile_id, { assetId: a.id }, { delaySeconds: 30 * 24 * 3600 }); // kept 30 days for an appeal (longer while one is open: jobs.mjs)
    }
    await journal(q, account.id, 'media.' + input.decision, 'media', a.id, { explicit: input.explicit ?? null, reason: input.reason ?? null });
    // The owner learns the outcome (audit 30.10) — except a suspected CSAM case, which nobody is tipped off about.
    if (!escalate && a.purpose !== 'verification') {
      await enqueue(q, 'media.decided', a.owner_profile_id, {
        assetId: a.id, purpose: a.purpose, kind: a.kind, state: input.decision === 'approve' ? 'approved' : 'rejected',
        ...(input.decision === 'approve' ? {} : { reason: input.reason, targetType: 'media', targetId: a.id }), // appealable (audit item 9)
      });
    }
    return { state: input.decision === 'approve' ? 'approved' : input.reason === 'csam_suspected' ? 'blocked' : 'rejected' };
  },

  async 'staff.datingSwitch'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead']);
    const [s] = await q.query(`select is_on from feture.platform_switch where key = 'dating' for update`);
    if (s?.is_on === input.on) return { on: input.on, notified: 0 };
    await q.query(
      `insert into feture.platform_switch (key, is_on, changed_by, changed_at) values ('dating', $1, $2, now())
       on conflict (key) do update set is_on = $1, changed_by = $2, changed_at = now()`, [input.on, account.id]);
    await journal(q, account.id, input.on ? 'dating.on' : 'dating.off', 'platform', null);
    if (!input.on) return { on: false, notified: 0 };
    // «Сообщить о запуске»: one notice per account that asked, then the wish is used up.
    const wishes = await q.query(`delete from feture.launch_wish where feature = 'dating' returning account_id`);
    for (const w of wishes) await enqueue(q, 'dating.launched', null, { for: w.account_id });
    return { on: true, notified: wishes.length };
  },

  async 'staff.journal'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead', 'auditor']);
    const { sql, params } = queuePageSql(input, JOURNAL_KEYS,
      `select * from (
         select s.id, s.staff_account_id, p.name as staff_name, p.handle as staff_handle, s.action, s.target_type, s.target_id, s.detail, s.created_at,
           ${JOURNAL_PERSON} person_id
         from feture.staff_action s
         left join feture.account a on a.id = s.staff_account_id left join feture.profile p on p.id = a.person_profile_id
         where ($1::uuid is null or s.target_id = $1) and ($2::uuid is null or s.staff_account_id = $2) and ($3::text is null or s.action = $3)) j
       where $4::uuid is null or j.person_id = $4`,
      [input.targetId ?? null, input.staffAccountId ?? null, input.what ?? null, input.personId ?? null]);
    const rows = await q.query(sql, params);
    // Whom each entry is about, by name (owner 05.11.2026: «кого заблокировали» is the first thing staff look for).
    const ids = [...new Set(rows.map(r => r.person_id).filter(Boolean))];
    const people = ids.length ? await q.query(`select id, kind, handle, name from feture.profile where id = any($1::uuid[])`, [ids]) : [];
    return { items: plainRows(rows).map(({ person_id, ...r }) => ({ ...r, person: people.find(x => x.id === person_id) ?? null })), ...pageInfo(rows, JOURNAL_KEYS, input.limit) };
  },
};

/** @type {Record<string, Command>} */
export const staff = Object.fromEntries(
  Object.entries(staffCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
