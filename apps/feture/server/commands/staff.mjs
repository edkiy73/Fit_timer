// @ts-check
import { staffCommands } from '../../contracts/staff.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { checkCode, confirmEnrol, factorState, removeFactor, startEnrol } from '../second-factor.mjs';
import { passSignin } from '../signin.mjs';
import { staffFactorRequired } from '../staff-factor-switch.mjs';
import { pageInfo, plainRows, queuePageSql } from '../queue-page.mjs';

/** Media queue sort: the upload time, then the id (unique). */
/** The journal reads newest first, always. */
const JOURNAL_KEYS = [{ name: 'created_at', type: 'timestamptz', dir: 'desc' }, { name: 'id', type: 'uuid', dir: 'desc' }];
const MEDIA_KEYS = [{ name: 'created_at', type: 'timestamptz' }, { name: 'id', type: 'uuid' }];

/** S4 steps 1–2: staff roles, journal, media review (docs/server/S4-MODERATION.md).
 * Staff are ordinary accounts with a role; a staff member never decides about their own profiles or couple.
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

/** @param {Q} q @param {string} accountId @param {string} assetId @param {{lock?: boolean}} [opts] */
async function reviewable(q, accountId, assetId, { lock = false } = {}) {
  const [a] = await q.query(
    `select m.*, exists (select 1 from feture.profile_member pm where pm.profile_id = m.owner_profile_id and pm.account_id = $2) own
     from feture.media_asset m where m.id = $1 ${lock ? 'for update of m' : ''}`, [assetId, accountId]);
  if (!a) fail(404, 'not_found');
  if (a.own) fail(403, 'forbidden'); // never about one's own profiles or couple
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
  // the owner; nobody resets their own (that would bypass the factor).
  async 'staff.totpReset'(q, { account, input }) {
    const roles = await requireStaff(q, account, ['owner', 'lead'], { fresh: true });
    const [t] = await q.query(
      `select a.id from feture.profile p join feture.account a on a.person_profile_id = p.id
       where lower(p.handle) = lower($1) and p.kind = 'person'`, [String(input.handle).replace(/^@/, '')]);
    if (!t) fail(404, 'not_found');
    if (t.id === account.id) fail(422, 'rule_violation', { rule: 'self' });
    if (!roles.includes('owner')) {
      const [o] = await q.query(`select 1 from feture.staff_role where account_id = $1 and role = 'owner' and revoked_at is null`, [t.id]);
      if (o) fail(403, 'forbidden');
    }
    const removed = await removeFactor(q, t.id);
    await q.query('delete from feture.staff_session where account_id = $1', [t.id]);
    await journal(q, account.id, 'staff.factorReset', 'account', t.id, { removed });
    return { reset: removed };
  },

  async 'staff.grant'(q, { account, input }) {
    await requireStaff(q, account, ['owner'], { fresh: true });
    const [t] = await q.query(
      `select a.id from feture.profile p join feture.account a on a.person_profile_id = p.id
       where lower(p.handle) = lower($1) and p.kind = 'person' and a.state = 'active' and p.state = 'active'`,
      [String(input.handle).replace(/^@/, '')]);
    if (!t) fail(404, 'not_found');
    if (t.id === account.id) fail(422, 'rule_violation', { rule: 'self' });
    const changed = input.grant
      ? await q.query(`insert into feture.staff_role (account_id, role, granted_by) values ($1, $2, $3) on conflict do nothing returning 1`, [t.id, input.role, account.id])
      : await q.query(`update feture.staff_role set revoked_at = now() where account_id = $1 and role = $2 and revoked_at is null returning 1`, [t.id, input.role]);
    if (changed.length) await journal(q, account.id, input.grant ? 'staff.grant' : 'staff.revoke', 'account', t.id, { role: input.role });
    // A revoked role ends the person's staff windows at once: with another role left they verify again.
    if (!input.grant) await q.query('delete from feture.staff_session where account_id = $1', [t.id]);
    return { changed: changed.length > 0 };
  },

  async 'staff.mediaQueue'(q, { account, input, cfg }) {
    await requireStaff(q, account, REVIEWERS);
    const { sql, params } = queuePageSql(input, MEDIA_KEYS,
      `select m.id, m.purpose, m.kind, m.explicitness, m.reject_reason reason, m.created_at, m.copies_at, m.width, m.height
       from feture.media_asset m
       where m.state = 'needs_review' and m.purpose <> 'verification'   -- selfies are decided in the age-check queue
         and not exists (select 1 from feture.profile_member pm where pm.profile_id = m.owner_profile_id and pm.account_id = $1)`, [account.id]);
    const rows = await q.query(sql, params);
    const page = pageInfo(rows, MEDIA_KEYS, input.limit);
    // The queue shows blurred previews; the full picture opens through staff.mediaView, which is journalled.
    const covered = (/** @type {any} */ r) => r.copies_at && r.kind !== 'audio'; // sound has no picture to blur
    const blur = cfg.media.delivery && rows.some(covered)
      ? await cfg.media.delivery.urls(rows.filter(covered).map(r => ({ assetId: r.id, variant: /** @type {const} */ ('blur'), viewerProfileId: staffProfile(account), ttlSeconds: 300 })))
      : [];
    let i = 0;
    return {
      items: rows.map(r => ({
        id: r.id, purpose: r.purpose, kind: r.kind, authorLabel: r.explicitness, reason: r.reason, createdAt: r.created_at, w: r.width, h: r.height,
        blur: covered(r) ? blur[i++] : null,
      })),
      ...page,
    };
  },

  async 'staff.mediaView'(q, { account, input, cfg }) {
    await requireStaff(q, account, REVIEWERS);
    const a = await reviewable(q, account.id, input.assetId);
    // Age/photo-check selfies and identity documents open only in their own check queue, never by id from here.
    if (a.purpose === 'verification') fail(404, 'not_found');
    // Staff see content only for what is waiting for them (S4 §3): media on review, or media of a post under open
    // reports or a dispute; never blocked material or private media at large.
    const [{ inCase }] = await q.query(
      `select exists (select 1 from feture.media_attachment ma join feture.post p on p.id = ma.target_id
         where ma.target_type = 'post' and ma.asset_id = $1
           and (p.disputed_at is not null or exists (select 1 from feture.report r where r.target_type = 'post' and r.target_id = p.id and r.state = 'open'))) "inCase"`, [a.id]);
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
    await requireStaff(q, account, REVIEWERS);
    const a = await reviewable(q, account.id, input.assetId, { lock: true });
    // Suspected CSAM can be escalated from any outcome (a later look, a report); everything else decides waiting media only.
    const escalate = input.decision === 'reject' && input.reason === 'csam_suspected';
    if (a.state === 'blocked' || (!escalate && a.state !== 'needs_review') || (escalate && !['needs_review', 'approved', 'rejected', 'removed'].includes(a.state))) {
      fail(409, 'conflict', { state: a.state });
    }
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
      await enqueue(q, 'safety.csamMatch', a.owner_profile_id, { assetId: a.id, source: 'staff' });
    } else {
      await q.query(`update feture.media_asset set state = 'rejected', reject_reason = $2 where id = $1`, [a.id, input.reason]);
      await enqueue(q, 'media.hide', a.owner_profile_id, { assetId: a.id });
      await enqueue(q, 'media.purge', a.owner_profile_id, { assetId: a.id }, { delaySeconds: 30 * 24 * 3600 }); // kept 30 days for an appeal
    }
    await journal(q, account.id, 'media.' + input.decision, 'media', a.id, { explicit: input.explicit ?? null, reason: input.reason ?? null });
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
      `select s.id, s.staff_account_id, p.name as staff_name, p.handle as staff_handle, s.action, s.target_type, s.target_id, s.detail, s.created_at
       from feture.staff_action s
       left join feture.account a on a.id = s.staff_account_id left join feture.profile p on p.id = a.person_profile_id
       where ($1::uuid is null or s.target_id = $1) and ($2::uuid is null or s.staff_account_id = $2) and ($3::text is null or s.action = $3)`,
      [input.targetId ?? null, input.staffAccountId ?? null, input.what ?? null]);
    const rows = await q.query(sql, params);
    return { items: plainRows(rows), ...pageInfo(rows, JOURNAL_KEYS, input.limit) };
  },
};

/** @type {Record<string, Command>} */
export const staff = Object.fromEntries(
  Object.entries(staffCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
