// @ts-check
import { randomInt } from 'node:crypto';
import { GIFT_PLANS, PLANS, premiumCommands } from '../../contracts/premium.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { avatarSrc, mediaDto } from '../media/assets.mjs';
import { servedKeys } from '../media/scan.mjs';
import { journal, requireStaff, staffCheck } from './staff.mjs';

/** Slice H1: Premium and the age check (S1 §15, S3 §8, V21 A07).
 * Premium belongs to an account; acting as a couple, the couple has it when at least one partner does (Q12). Premium
 * never promotes anyone and never opens anything private. The age check has two methods:
 * - selfie: the server picks a gesture, the person sends a selfie making it, staff compare it with the approved
 *   profile photo. The selfie is seen only by staff and goes 30 days after the decision.
 * - document: the person sends a photo of an identity document, staff read the birth date and decide «18+ or not».
 *   Nothing from the document (number, name, date) is stored, only the outcome. The image is seen only by staff in the
 *   age-check queue and is deleted — storage and row — right after the decision, or when nobody decides in time.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q @typedef {import('../db.mjs').Db} Db
 * @typedef {import('../outbox.mjs').OutboxItem} OutboxItem
 */

export const GESTURES = ['thumb_up', 'peace', 'open_palm', 'three_fingers', 'ok_sign', 'hand_on_head'];
const START_MINUTES = 30;
const AGE_CHECK_YEARS = 1;
const KEEP_DAYS = 30;
// A document nobody decided goes after this many days; the person is asked to send it again.
const DOC_REVIEW_DAYS = 7;
// Outbox topic (a job, not a command — so not in contracts/): deletes a document image for good.
const DROP_DOCUMENT = 'verification.dropDocument';

/** Premium for an account, or for a profile (any active partner of a couple, Q12). @param {Q} q @param {string} accountId @param {string} [profileId] */
export async function isPremium(q, accountId, profileId) {
  const [r] = await q.query(
    `select exists (select 1 from feture.account a where a.premium_until > now() and (a.id = $1 or a.id in (
       select m.account_id from feture.profile_member m join feture.profile p on p.id = m.profile_id
       where m.profile_id = $2 and m.state = 'active' and p.kind = 'couple'))) p`, [accountId, profileId ?? null]);
  return !!r.p;
}

/** The account's Premium end, from its entitlements. @param {Q} q @param {string} accountId */
export async function recompute(q, accountId) {
  await q.query(
    `update feture.account set premium_until = (select max(ends_at) from feture.entitlement where account_id = $1 and revoked_at is null), updated_at = now() where id = $1`,
    [accountId]);
}

/* ---------- Payments (wave 8): one provider-agnostic road «payment confirmed → entitlement» ----------
 * A provider is plugged in through `cfg.billing.providers` (none today: no keys yet). Its shape:
 *   id        'yookassa' | 'appstore' | …       store  'web' | 'apple' | 'google'
 *   checkout({purchase})  → {url} (pay on the provider's page; its webhook calls fulfilPurchase)
 *                           or {paid: {storeRef}} (already confirmed, e.g. a store receipt)
 *   restore?({accountId}) → [{storeRef, plan}] purchases the provider knows for this account
 *   setRenewal?({subscription, autoRenew}) → switches auto-renewal at the provider
 * Without a provider every purchase answers 503 «payments_unavailable» before anything is written. */

/** @typedef {{id: string, store: 'web' | 'apple' | 'google',
 *   checkout: (a: {purchase: {id: string, kind: string, plan: string, days: number}}) => Promise<{url?: string, paid?: {storeRef: string}}>,
 *   restore?: (a: {accountId: string}) => Promise<{storeRef: string, plan: string}[]>,
 *   setRenewal?: (a: {subscription: {storeRef: string, plan: string}, autoRenew: boolean}) => Promise<void>}} PaymentProvider */

/** @param {import('../handler.mjs').Cfg} cfg @returns {PaymentProvider[]} */
const providersOf = cfg => (cfg?.billing?.providers ?? []).filter(p => p && typeof p.checkout === 'function');

/** Applies a confirmed payment once (a repeated confirmation changes nothing): grants the entitlement — for a gift to
 * the recipient, starting after their current Premium — and tells the recipient. Called by checkout results today and by
 * a provider webhook once one is connected. @param {Q} q @param {string} purchaseId @param {string} storeRef */
export async function fulfilPurchase(q, purchaseId, storeRef) {
  const [p] = await q.query(
    `update feture.purchase set state = 'paid', store_ref = $2, paid_at = now() where id = $1 and state = 'pending' returning *`, [purchaseId, storeRef]);
  if (!p) return null;
  const to = p.kind === 'gift' ? p.recipient_account_id : p.account_id;
  const [e] = await q.query(
    `insert into feture.entitlement (account_id, source, starts_at, ends_at, store, store_ref, granted_by)
     select $1, $2, s, s + make_interval(days => $3), $4, $5, $6
     from (select greatest(now(), coalesce((select premium_until from feture.account where id = $1), now())) s) x
     returning id, ends_at`,
    [to, p.kind === 'gift' ? 'gift' : 'purchase', p.days, p.kind === 'gift' ? null : p.store, p.kind === 'gift' ? null : storeRef, p.kind === 'gift' ? p.account_id : null]);
  await q.query('update feture.purchase set entitlement_id = $2 where id = $1', [p.id, e.id]);
  await recompute(q, to);
  if (p.kind === 'subscription') {
    await q.query(
      `insert into feture.subscription (account_id, provider, store_ref, plan, renews_at) values ($1, $2, $3, $4, $5)
       on conflict (provider, store_ref) do update set renews_at = excluded.renews_at, state = 'active', updated_at = now()`,
      [p.account_id, p.provider, storeRef, p.plan, e.ends_at]);
  } else {
    const [r] = await q.query('select person_profile_id from feture.account where id = $1', [to]);
    const [g] = p.anonymous ? [null] : await q.query('select person_profile_id from feture.account where id = $1', [p.account_id]);
    await enqueue(q, 'premium.gifted', r.person_profile_id, { for: to, days: p.days, ...(g ? { from: g.person_profile_id } : {}) });
  }
  return { id: p.id, until: e.ends_at };
}

/** Starts a purchase with the first configured provider. @param {Q} q @param {import('../handler.mjs').Cfg} cfg
 * @param {{accountId: string, kind: 'subscription' | 'gift', plan: string, days: number, recipient?: string, anonymous?: boolean}} a */
async function startPurchase(q, cfg, a) {
  const [provider] = providersOf(cfg);
  if (!provider) fail(503, 'payments_unavailable');
  const [p] = await q.query(
    `insert into feture.purchase (account_id, kind, plan, days, recipient_account_id, anonymous, provider, store)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, kind, plan, days`,
    [a.accountId, a.kind, a.plan, a.days, a.recipient ?? null, !!a.anonymous, provider.id, provider.store]);
  const out = await provider.checkout({ purchase: p });
  if (out?.paid?.storeRef) {
    const done = await fulfilPurchase(q, p.id, String(out.paid.storeRef).slice(0, 200));
    return { purchaseId: p.id, state: 'paid', until: done?.until ?? null };
  }
  if (typeof out?.url === 'string' && /^https:\/\//.test(out.url)) return { purchaseId: p.id, state: 'pending', url: out.url };
  fail(503, 'payments_unavailable');
}

/** A person profile to gift Premium to, by exact nickname, as the giver may see it. @param {Q} q @param {any} account @param {string} handle */
async function giftTarget(q, account, handle) {
  const [r] = await q.query(
    `select a.id account_id, p.id, p.handle, p.name, p.avatar_asset_id, coalesce(a.premium_until > now(), false) premium
     from feture.profile p join feture.account a on a.person_profile_id = p.id
     where lower(p.handle) = lower($1) and p.state = 'active' and a.state = 'active'
       and ($2::uuid is null or a.id = $3 or not feture.blocked($2, p.id))`, [handle, account.person_profile_id ?? null, account.id]);
  if (!r) fail(404, 'not_found');
  if (r.account_id === account.id) fail(422, 'rule_violation', { rule: 'gift_self' });
  return r;
}

/** The selfie of a decided check goes for good 30 days after the decision (S3 §8); a document goes at once.
 * @param {Db} db @param {{scan?: {storage: import('../media/r2.mjs').Storage} | null}} [deps] */
export function verificationHandlers(db, deps = {}) {
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
    // An identity document is deleted for good: the upload, every served copy, then the row (its scan log goes with it).
    // Only a file blocked as CSAM stays (evidence, S4 §5) — it is already hidden from everyone.
    [DROP_DOCUMENT]: async (/** @type {OutboxItem} */ item) => {
      const assetId = String(/** @type {any} */ (item.payload).assetId);
      const [row] = await db.query(`select state, storage_key, purpose from feture.media_asset where id = $1`, [assetId]);
      if (!row || row.purpose !== 'verification' || row.state === 'blocked') return;
      const storage = deps.scan?.storage;
      if (!storage) throw new Error('media_unavailable'); // the outbox retries until storage is there
      for (const key of [row.storage_key, ...servedKeys(assetId)]) await storage.remove(key);
      await db.query(`delete from feture.media_asset where id = $1 and purpose = 'verification' and state <> 'blocked'`, [assetId]);
    },
  };
}

/** Hides a document image from everyone at once (staff included) and queues its deletion.
 * @param {Q} q @param {string} assetId @param {string} profileId */
async function dropDocument(q, assetId, profileId) {
  await q.query(`update feture.media_asset set state = 'removed', removed_at = now() where id = $1 and state not in ('removed', 'blocked')`, [assetId]);
  await enqueue(q, DROP_DOCUMENT, profileId, { assetId });
}

/** Selfies that never made it into a submitted check go after six hours; started checks expire after 30 minutes.
 * @param {Db} db */
export async function sweepSelfies(db) {
  if (!(await db.query(`select to_regclass('feture.age_check') is not null ok`))[0].ok) return 0;
  await db.query(`update feture.age_check set state = 'expired' where state = 'started' and created_at < now() - make_interval(mins => $1)`, [START_MINUTES]);
  // The photo check (V01) keeps its selfies the same way; skipped until its migration is in.
  const photo = (await db.query(`select to_regclass('feture.photo_check') is not null ok`))[0].ok;
  if (photo) await db.query(`update feture.photo_check set state = 'expired' where state = 'started' and created_at < now() - make_interval(mins => $1)`, [START_MINUTES]);
  return db.tx(async q => {
    // Documents nobody decided in time: the check expires and the image is deleted (the person is asked again).
    const late = await q.query(
      `update feture.age_check c set state = 'expired' from feture.account a
       where a.id = c.account_id and c.method = 'document' and c.state = 'submitted' and c.submitted_at < now() - make_interval(days => $1)
       returning c.asset_id, a.person_profile_id`, [DOC_REVIEW_DAYS]);
    for (const r of late) if (r.asset_id) await dropDocument(q, r.asset_id, r.person_profile_id);
    // Uploads made during a document check that never got into it are deleted too, not just hidden.
    const loose = await q.query(
      `select m.id, m.owner_profile_id from feture.media_asset m
       where m.purpose = 'verification' and m.state not in ('removed', 'blocked') and m.created_at < now() - interval '6 hours'
         and not exists (select 1 from feture.age_check c where c.asset_id = m.id)
         and exists (select 1 from feture.age_check c where c.account_id = m.uploaded_by and c.method = 'document'
                       and c.created_at <= m.created_at and c.created_at > m.created_at - make_interval(mins => $1))
       limit 200`, [START_MINUTES]);
    for (const r of loose) await dropDocument(q, r.id, r.owner_profile_id);
    const rows = await q.query(
      `update feture.media_asset m set state = 'removed', removed_at = now()
       where m.id in (select id from feture.media_asset where purpose = 'verification' and state not in ('removed', 'blocked') and created_at < now() - interval '6 hours'
                        and not exists (select 1 from feture.age_check c where c.asset_id = media_asset.id and c.state in ('submitted', 'approved', 'rejected'))
                        ${photo ? `and not exists (select 1 from feture.photo_check c where c.asset_id = media_asset.id and c.state in ('submitted', 'approved', 'rejected'))` : ''}
                      limit 200)
       returning m.id, m.owner_profile_id`);
    for (const r of rows) {
      await enqueue(q, 'media.hide', r.owner_profile_id, { assetId: r.id });
      await enqueue(q, 'media.purge', r.owner_profile_id, { assetId: r.id });
    }
    return rows.length;
  });
}

/** The gesture matters only for a selfie. @param {{id: string, gesture: string, state: string, method: string}} c */
const startDto = c => ({ id: c.id, method: c.method, gesture: c.method === 'selfie' ? c.gesture : null, state: c.state });

/** @type {Record<keyof typeof premiumCommands, Command['run']>} */
const run = {
  async 'premium.status'(q, { acting, account, cfg }) {
    const [a] = await q.query('select premium_until from feture.account where id = $1', [account.id]);
    const own = !!a.premium_until && new Date(a.premium_until).getTime() > Date.now();
    const premium = own || await isPremium(q, account.id, acting?.profileId);
    // Where the current Premium comes from (the entitlement that lasts longest), and the store subscription if any.
    const [src] = own ? await q.query(
      `select source from feture.entitlement where account_id = $1 and revoked_at is null and ends_at > now() order by ends_at desc limit 1`, [account.id]) : [null];
    const [sub] = await q.query(
      `select plan, auto_renew, renews_at from feture.subscription where account_id = $1 and state = 'active' order by renews_at desc nulls last limit 1`, [account.id]);
    const gifts = await q.query(
      `select pu.days, pu.anonymous, pu.paid_at, p.handle from feture.purchase pu join feture.account r on r.id = pu.recipient_account_id
       left join feture.profile p on p.id = r.person_profile_id where pu.account_id = $1 and pu.kind = 'gift' and pu.state = 'paid' order by pu.paid_at desc limit 20`, [account.id]);
    return {
      premium, until: own ? a.premium_until : null, viaPartner: premium && !own, source: src?.source ?? null,
      subscription: sub ? { plan: sub.plan, autoRenew: sub.auto_renew, renewsAt: sub.renews_at } : null,
      payments: providersOf(cfg).length > 0, plans: PLANS, giftPlans: GIFT_PLANS,
      giftsSent: gifts.map(g => ({ handle: g.handle ?? null, days: g.days, anonymous: g.anonymous, at: g.paid_at })),
    };
  },

  async 'premium.purchase'(q, { account, input, cfg }) {
    return startPurchase(q, cfg, { accountId: account.id, kind: 'subscription', plan: input.plan, days: PLANS[/** @type {keyof typeof PLANS} */ (input.plan)] });
  },

  async 'premium.restore'(q, { account, cfg }) {
    // Asks every provider which purchases it knows for this account and applies the ones not applied yet.
    let restored = 0;
    for (const provider of providersOf(cfg)) {
      if (typeof provider.restore !== 'function') continue;
      for (const r of await provider.restore({ accountId: account.id })) {
        const storeRef = String(r.storeRef ?? '').slice(0, 200);
        const days = PLANS[/** @type {keyof typeof PLANS} */ (r.plan)];
        if (!storeRef || !days) continue;
        if ((await q.query('select 1 from feture.purchase where provider = $1 and store_ref = $2', [provider.id, storeRef])).length) continue;
        const [p] = await q.query(
          `insert into feture.purchase (account_id, kind, plan, days, provider, store) values ($1, 'subscription', $2, $3, $4, $5) returning id`,
          [account.id, r.plan, days, provider.id, provider.store]);
        if (await fulfilPurchase(q, p.id, storeRef)) restored++;
      }
    }
    const [a] = await q.query('select premium_until from feture.account where id = $1', [account.id]);
    return { restored, providers: providersOf(cfg).length, premium: !!a.premium_until && new Date(a.premium_until).getTime() > Date.now(), until: a.premium_until };
  },

  async 'premium.setRenewal'(q, { account, input, cfg }) {
    const [s] = await q.query(`select * from feture.subscription where account_id = $1 and state = 'active' order by renews_at desc nulls last limit 1 for update`, [account.id]);
    if (!s) fail(404, 'not_found');
    const provider = providersOf(cfg).find(p => p.id === s.provider);
    if (!provider || typeof provider.setRenewal !== 'function') fail(503, 'payments_unavailable');
    if (s.auto_renew !== input.autoRenew) await provider.setRenewal({ subscription: { storeRef: s.store_ref, plan: s.plan }, autoRenew: input.autoRenew });
    await q.query('update feture.subscription set auto_renew = $2, updated_at = now() where id = $1', [s.id, input.autoRenew]);
    return { autoRenew: input.autoRenew, renewsAt: s.renews_at };
  },

  async 'premium.giftCheck'(q, { account, input, cfg }) {
    const r = await giftTarget(q, account, input.handle);
    // `queued`: they already have Premium, so the gift starts after their current period (nothing is lost).
    return { recipient: { id: r.id, handle: r.handle, name: r.name, avatar: await avatarSrc(q, cfg.media, r.avatar_asset_id, account.person_profile_id ?? r.id) }, queued: r.premium };
  },

  async 'premium.gift'(q, { account, input, cfg }) {
    const r = await giftTarget(q, account, input.handle);
    return startPurchase(q, cfg, { accountId: account.id, kind: 'gift', plan: input.plan, days: GIFT_PLANS[/** @type {keyof typeof GIFT_PLANS} */ (input.plan)], recipient: r.account_id, anonymous: input.anonymous });
  },

  async 'staff.premiumGrant'(q, { account, input }) {
    // For trying the app on ourselves before payments exist; every grant is journaled.
    await requireStaff(q, account, ['owner', 'lead']);
    const [t] = await q.query(`select a.id from feture.account a join feture.profile p on p.id = a.person_profile_id where lower(p.handle) = lower($1) and a.state = 'active'`, [input.handle]);
    if (!t) fail(404, 'not_found');
    if (t.id === account.id) fail(403, 'forbidden'); // never to oneself
    const [e] = await q.query(
      `insert into feture.entitlement (account_id, source, starts_at, ends_at, granted_by, reason)
       select $1, 'staff', now(), greatest(now(), coalesce((select premium_until from feture.account where id = $1), now())) + make_interval(days => $2), $3, $4
       returning id, ends_at`, [t.id, input.days, account.id, input.reason]);
    await recompute(q, t.id);
    await journal(q, account.id, 'premium.grant', 'account', t.id, { days: input.days, reason: input.reason, entitlementId: e.id });
    return { id: e.id, until: e.ends_at };
  },

  async 'staff.premiumRevoke'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead']);
    const rows = await q.query(`update feture.entitlement set revoked_at = now() where id = $1 and revoked_at is null returning account_id`, [input.entitlementId]);
    if (!rows[0]) fail(404, 'not_found');
    await recompute(q, rows[0].account_id);
    await journal(q, account.id, 'premium.revoke', 'account', rows[0].account_id, { reason: input.reason, entitlementId: input.entitlementId });
    return { revoked: true };
  },

  async 'verification.ageStart'(q, { account, input }) {
    const method = input.method ?? 'selfie';
    // A selfie is compared with an approved profile photo; a document needs none.
    if (method === 'selfie') {
      const [p] = await q.query(
        `select p.id from feture.account a join feture.profile p on p.id = a.person_profile_id
         join feture.media_asset m on m.id = p.avatar_asset_id and m.state = 'approved' where a.id = $1`, [account.id]);
      if (!p) fail(422, 'rule_violation', { rule: 'photo_required' });
    }
    await q.query(`update feture.age_check set state = 'expired' where account_id = $1 and state = 'started' and created_at < now() - make_interval(mins => $2)`, [account.id, START_MINUTES]);
    const [open] = await q.query(`select id, gesture, state, method from feture.age_check where account_id = $1 and state in ('started', 'submitted') for update`, [account.id]);
    if (open) {
      // Nothing sent yet: the person may switch the method of the open check.
      if (open.state === 'started' && open.method !== method) {
        await q.query('update feture.age_check set method = $2 where id = $1', [open.id, method]);
        open.method = method;
      }
      return startDto(open);
    }
    try {
      const [c] = await q.query(`insert into feture.age_check (account_id, gesture, method) values ($1, $2, $3) returning id, gesture, state, method`,
        [account.id, GESTURES[randomInt(GESTURES.length)], method]);
      return startDto(c);
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'check_open' }); // a parallel start won; ask again
      throw error;
    }
  },

  async 'verification.ageSubmit'(q, { account, input }) {
    const [c] = await q.query(
      `select c.*, c.created_at < now() - make_interval(mins => $3) late from feture.age_check c where c.id = $1 and c.account_id = $2 for update`, [input.checkId, account.id, START_MINUTES]);
    if (!c) fail(404, 'not_found');
    if (c.state !== 'started' || c.late) fail(409, 'conflict', { state: c.late ? 'expired' : c.state });
    const [m] = await q.query(
      `select 1 from feture.media_asset m join feture.account a on a.person_profile_id = m.owner_profile_id
       where m.id = $1 and a.id = $2 and m.purpose = 'verification' and m.state in ('uploaded', 'scanning', 'needs_review', 'approved')
         and m.created_at >= $3 and not exists (select 1 from feture.age_check x where x.asset_id = m.id)`, [input.assetId, account.id, c.created_at]);
    // Nor a selfie already sent for the photo check (V01).
    if (m && (await q.query(`select to_regclass('feture.photo_check') is not null ok`))[0].ok
      && (await q.query('select 1 from feture.photo_check where asset_id = $1', [input.assetId])).length) fail(400, 'invalid_input', { fields: ['assetId'] });
    if (!m) fail(400, 'invalid_input', { fields: ['assetId'] });
    await q.query(`update feture.age_check set state = 'submitted', asset_id = $2, submitted_at = now() where id = $1`, [c.id, input.assetId]);
    await enqueue(q, 'moderation.ageCheck', null, { checkId: c.id });
    return { state: 'submitted' };
  },

  async 'verification.ageStatus'(q, { account }) {
    const [a] = await q.query('select age_verified_until from feture.account where id = $1', [account.id]);
    const [c] = await q.query(`select id, state, reason, gesture, method from feture.age_check where account_id = $1 order by created_at desc limit 1`, [account.id]);
    return {
      verified: !!a.age_verified_until && new Date(a.age_verified_until).getTime() > Date.now(), until: a.age_verified_until,
      check: c ? { id: c.id, method: c.method, state: c.state, reason: c.reason, gesture: c.state === 'started' && c.method === 'selfie' ? c.gesture : null } : null,
    };
  },

  async 'staff.ageCheckQueue'(q, { account, input, cfg }) {
    await requireStaff(q, account, ['owner', 'lead', 'moderator', 'verifier']);
    // Documents and selfies open only with a code from the last 10 minutes; without one the queue still lists who is
    // waiting (`locked`, no pictures, nothing journalled) and the screen asks for the code.
    const locked = !(await staffCheck(q, account)).fresh;
    const rows = await q.query(
      `select c.id, c.method, c.gesture, c.submitted_at, c.asset_id, p.id profile_id, p.handle, p.avatar_asset_id avatar_id
       from feture.age_check c join feture.account a on a.id = c.account_id join feture.profile p on p.id = a.person_profile_id
       where c.state = 'submitted' and c.account_id <> $1 order by c.submitted_at limit $2`, [account.id, input.limit]);
    const items = [];
    for (const r of rows) {
      const doc = r.method === 'document';
      const [shot] = r.asset_id ? await q.query(`select * from feture.media_asset where id = $1 and purpose = 'verification'`, [r.asset_id]) : [null];
      // A document is read on its own (the birth date): no profile photo next to it.
      const [avatar] = !doc && r.avatar_id ? await q.query('select * from feture.media_asset where id = $1', [r.avatar_id]) : [null];
      const ctx = { viewerProfileId: account.person_profile_id ?? account.id, place: /** @type {const} */ ('own'), showExplicit: true, staff: true };
      // Every look at a selfie or a document is journaled (S4 §3).
      if (!locked) await journal(q, account.id, 'age.view', 'account', null, { checkId: r.id, method: r.method });
      const image = shot && !locked ? await mediaDto(cfg.media, shot, ctx).catch(() => null) : null;
      items.push({
        id: r.id, method: r.method, gesture: doc ? null : r.gesture, submittedAt: r.submitted_at, profile: { id: r.profile_id, handle: r.handle },
        selfie: doc ? null : image, document: doc ? image : null,
        photo: avatar && !locked ? await mediaDto(cfg.media, avatar, ctx).catch(() => null) : null,
      });
    }
    return { items, locked };
  },

  async 'staff.ageCheckDecide'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead', 'moderator', 'verifier']);
    const [c] = await q.query('select * from feture.age_check where id = $1 for update', [input.checkId]);
    if (!c) fail(404, 'not_found');
    if (c.account_id === account.id) fail(403, 'forbidden');
    if (c.state !== 'submitted') fail(409, 'conflict', { state: c.state });
    const doc = c.method === 'document';
    if (input.approve) {
      // Never approved without the selfie (or the document: staff read the birth date on it) in front of staff.
      const [s] = await q.query(`select 1 from feture.media_asset where id = $1 and state in ('needs_review', 'approved') and copies_at is not null`, [c.asset_id]);
      if (!s) fail(409, 'conflict', { rule: doc ? 'document_missing' : 'selfie_missing' });
    }
    await q.query(`update feture.age_check set state = $2, reason = $3, decided_by = $4, decided_at = now() where id = $1`,
      [c.id, input.approve ? 'approved' : 'rejected', input.approve ? null : input.reason, account.id]);
    if (input.approve) {
      await q.query(`update feture.account set age_verified_until = now() + make_interval(years => $2), updated_at = now() where id = $1`, [c.account_id, AGE_CHECK_YEARS]);
    }
    const [p] = await q.query('select person_profile_id from feture.account where id = $1', [c.account_id]);
    await enqueue(q, 'verification.decided', p.person_profile_id, { state: input.approve ? 'approved' : 'rejected', reason: input.reason ?? null });
    // A document goes right after the decision, either way; a selfie 30 days later.
    if (c.asset_id && doc) await dropDocument(q, c.asset_id, p.person_profile_id);
    else if (c.asset_id) await enqueue(q, 'verification.expire', p.person_profile_id, { assetId: c.asset_id }, { delaySeconds: KEEP_DAYS * 86400 });
    await journal(q, account.id, input.approve ? 'age.approve' : 'age.reject', 'account', c.account_id, { checkId: c.id, method: c.method, reason: input.reason ?? null });
    return { state: input.approve ? 'approved' : 'rejected' };
  },
};

/** @type {Record<string, Command>} */
export const premium = Object.fromEntries(
  Object.entries(premiumCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
