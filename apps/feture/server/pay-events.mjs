// @ts-check
/** The payment provider's webhook, served at /api/fe?pay-events=<provider id> (api/fe.mjs). The provider adapter checks its
 * own signature and names what happened (server/commands/premium.mjs PaymentProvider.webhook); this turns those events into
 * Premium. Every event is safe to receive twice: a payment already applied changes nothing.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q */
import { PLANS } from '../contracts/premium.mjs';
import { fulfilPurchase, notifyRefunded, notifyRenewalFailed, recompute } from './commands/premium.mjs';
import { enqueue } from './outbox.mjs';
import { journal } from './commands/staff.mjs';

/** @param {Q} q @param {import('./commands/premium.mjs').PaymentProvider} provider @param {any} ev */
export async function applyPayEvent(q, provider, ev) {
  const recurring = provider.recurring !== false;
  switch (ev?.type) {
    case 'paid':
      // Only a purchase of this provider's own, and only while it waits (a closed one is not granted silently).
      {
        const [p] = await q.query('select state from feture.purchase where id = $1 and provider = $2', [ev.purchaseId, provider.id]);
        if (!p) return;
        await fulfilPurchase(q, ev.purchaseId, String(ev.storeRef).slice(0, 200), { recurring });
        // Money arrived for a checkout that was already closed (failed or timed out): nothing is granted silently, but a person paid
        // and got nothing — the journal shows it for staff to settle by hand (security audit 06.11.2026).
        if (p.state === 'failed' || p.state === 'canceled') await journal(q, null, 'payment.late', 'purchase', ev.purchaseId, { provider: provider.id, was: p.state });
      }
      return;
    case 'failed':
      await q.query(`update feture.purchase set state = 'failed' where id = $1 and provider = $2 and state = 'pending'`, [ev.purchaseId, provider.id]);
      return;
    case 'renewed': {
      // A subscription's next paid period: a purchase of its own, queued after the current term.
      const [s] = await q.query(`select account_id, plan from feture.subscription where provider = $1 and store_ref = $2 and state = 'active'`, [provider.id, ev.subscriptionRef]);
      const days = s ? PLANS[/** @type {keyof typeof PLANS} */ (s.plan)] : 0;
      if (!s || !days || !ev.paymentRef) return;
      if ((await q.query('select 1 from feture.purchase where provider = $1 and store_ref = $2', [provider.id, ev.paymentRef])).length) return;
      const [p] = await q.query(
        `insert into feture.purchase (account_id, kind, plan, days, provider, store) values ($1, 'subscription', $2, $3, $4, $5) returning id`,
        [s.account_id, s.plan, days, provider.id, provider.store]);
      await fulfilPurchase(q, p.id, String(ev.paymentRef).slice(0, 200), { subscriptionRef: ev.subscriptionRef, recurring });
      return;
    }
    case 'renewalFailed': {
      const [s] = await q.query(`select account_id from feture.subscription where provider = $1 and store_ref = $2`, [provider.id, ev.subscriptionRef]);
      if (s) await notifyRenewalFailed(q, s.account_id);
      return;
    }
    case 'subscriptionEnded':
      await q.query(`update feture.subscription set state = $3, auto_renew = false, updated_at = now() where provider = $1 and store_ref = $2`,
        [provider.id, ev.subscriptionRef, ev.state === 'canceled' ? 'canceled' : 'expired']);
      return;
    case 'refunded': {
      // The money went back: the purchase's periods go (a gift to a couple made two), and the payer is told.
      const [p] = await q.query(`update feture.purchase set state = 'refunded' where provider = $1 and store_ref = $2 and state = 'paid' returning id, account_id`, [provider.id, ev.storeRef]);
      if (!p) return;
      const taken = await q.query(`update feture.entitlement set revoked_at = now() where purchase_id = $1 and revoked_at is null returning account_id`, [p.id]);
      for (const { account_id: id } of taken) {
        await recompute(q, id);
        const [a] = await q.query('select person_profile_id, premium_until from feture.account where id = $1', [id]);
        if (!a.premium_until || new Date(a.premium_until).getTime() <= Date.now()) await enqueue(q, 'premium.revoked', a.person_profile_id, { for: id });
      }
      await notifyRefunded(q, p.account_id);
      return;
    }
    default:
  }
}

/** One webhook call. @param {Db} db @param {import('./handler.mjs').Cfg} cfg @param {string} providerId
 * @param {{headers: Record<string, any>, rawBody: string | null, query: URLSearchParams}} req @returns {Promise<{status: number, body: string}>} */
export async function takePayEvents(db, cfg, providerId, req) {
  const provider = (cfg?.billing?.providers ?? []).find(p => p?.id === providerId);
  if (!provider || typeof provider.webhook !== 'function') return { status: 404, body: '' };
  if (req.rawBody === null) return { status: 400, body: '' };
  /** @type {Awaited<ReturnType<NonNullable<typeof provider.webhook>>>} */
  let out;
  try { out = await provider.webhook({ headers: req.headers, rawBody: req.rawBody, query: req.query }); } catch { return { status: 400, body: '' }; }
  for (const ev of out.events ?? []) await db.tx(q => applyPayEvent(q, provider, ev));
  return { status: out.reply?.status ?? 200, body: out.reply?.body ?? 'OK' };
}
