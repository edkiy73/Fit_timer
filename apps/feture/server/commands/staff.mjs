// @ts-check
import { staffCommands } from '../../contracts/staff.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';

/** S4 steps 1–2: staff roles, journal, media review (docs/server/S4-MODERATION.md).
 * Staff are ordinary accounts with a role; a staff member never decides about their own profiles or couple.
 * Every decision and every look at user media is written to the append-only journal.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const REVIEWERS = ['owner', 'lead', 'moderator', 'verifier'];
/** Media tokens name a profile as the viewer: staff view as their person profile. @param {{person_profile_id: string | null, id: string}} account */
const staffProfile = account => account.person_profile_id ?? account.id;
const PUBLIC_ONLY = new Set(['avatar', 'community', 'event']);

/** @param {Q} q @param {string} accountId @param {string[]} roles @returns {Promise<string[]>} the staff member's roles */
export async function requireStaff(q, accountId, roles) {
  const rows = await q.query(`select role from feture.staff_role where account_id = $1 and revoked_at is null`, [accountId]);
  const mine = rows.map(r => /** @type {string} */ (r.role));
  if (!mine.some(r => roles.includes(r))) fail(403, 'forbidden');
  return mine;
}

/** @param {Q} q @param {string} staff @param {string} action @param {string} targetType @param {string | null} targetId @param {Record<string, unknown>} [detail] */
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
    return { roles: rows.map(r => r.role) };
  },

  async 'staff.grant'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner']);
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
    return { changed: changed.length > 0 };
  },

  async 'staff.mediaQueue'(q, { account, input, cfg }) {
    await requireStaff(q, account.id, REVIEWERS);
    const rows = await q.query(
      `select m.id, m.purpose, m.kind, m.explicitness, m.reject_reason reason, m.created_at, m.copies_at, m.width, m.height
       from feture.media_asset m
       where m.state = 'needs_review' and m.purpose <> 'verification'   -- selfies are decided in the age-check queue
         and not exists (select 1 from feture.profile_member pm where pm.profile_id = m.owner_profile_id and pm.account_id = $1)
       order by m.created_at limit $2`, [account.id, input.limit]);
    // The queue shows blurred previews; the full picture opens through staff.mediaView, which is journalled.
    const blur = cfg.media.delivery && rows.some(r => r.copies_at)
      ? await cfg.media.delivery.urls(rows.filter(r => r.copies_at).map(r => ({ assetId: r.id, variant: /** @type {const} */ ('blur'), viewerProfileId: staffProfile(account), ttlSeconds: 300 })))
      : [];
    let i = 0;
    return {
      items: rows.map(r => ({
        id: r.id, purpose: r.purpose, kind: r.kind, authorLabel: r.explicitness, reason: r.reason, createdAt: r.created_at, w: r.width, h: r.height,
        blur: r.copies_at ? blur[i++] : null,
      })),
    };
  },

  async 'staff.mediaView'(q, { account, input, cfg }) {
    await requireStaff(q, account.id, REVIEWERS);
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
    const variants = /** @type {const} */ (['card', 'full']);
    const urls = await cfg.media.delivery.urls(variants.map(variant => ({ assetId: a.id, variant, viewerProfileId: staffProfile(account), ttlSeconds: 120 })));
    return { src: { card: urls[0], full: urls[1] } };
  },

  async 'staff.mediaDecide'(q, { account, input }) {
    await requireStaff(q, account.id, REVIEWERS);
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

  async 'staff.journal'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'auditor']);
    const rows = await q.query(
      `select id, staff_account_id, action, target_type, target_id, detail, created_at from feture.staff_action
       where ($1::uuid is null or target_id = $1) order by created_at desc limit $2`, [input.targetId ?? null, input.limit]);
    return { items: rows };
  },
};

/** @type {Record<string, Command>} */
export const staff = Object.fromEntries(
  Object.entries(staffCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
