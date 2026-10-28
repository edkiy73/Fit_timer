// @ts-check
import { supportCommands } from '../../contracts/support.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';

/** Wave 8: support tickets (S01 «Написать в поддержку») and the maintenance switch (MAINT).
 * A ticket belongs to the account; only its author and support staff read it. Staff replies reach the person as an
 * inbox item (no email). Staff see the author's handle only — never the email or other private data.
 * Maintenance: owner/lead switch it on with a message; the handler then refuses every command of non-staff with 503
 * «maintenance» except `platform.maintenance` (server/maintenance.mjs).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const SUPPORT_ROLES = ['owner', 'lead', 'moderator', 'support'];
const OPEN_TICKETS = 10;

/** Messages of the given tickets, oldest first. Staff authors are not named to the person. @param {Q} q @param {string[]} ids */
async function threads(q, ids) {
  if (!ids.length) return {};
  const rows = await q.query(
    `select ticket_id, id, from_staff, body, created_at from feture.support_message where ticket_id = any($1) order by created_at, id`, [ids]);
  /** @type {Record<string, {id: string, fromStaff: boolean, body: string, at: string}[]>} */
  const out = {};
  for (const r of rows) (out[r.ticket_id] ??= []).push({ id: r.id, fromStaff: r.from_staff, body: r.body, at: r.created_at });
  return out;
}

/** @param {any} t @param {Record<string, any[]>} msgs */
const ticketDto = (t, msgs) => ({ id: t.id, topic: t.topic, state: t.state, createdAt: t.created_at, updatedAt: t.updated_at, messages: msgs[t.id] ?? [] });

/** @type {Record<keyof typeof supportCommands, Command['run']>} */
const run = {
  async 'support.create'(q, { account, input }) {
    const [{ n }] = await q.query(`select count(*)::int n from feture.support_ticket where account_id = $1 and state <> 'closed'`, [account.id]);
    if (n >= OPEN_TICKETS) fail(422, 'rule_violation', { rule: 'too_many_tickets' });
    const [t] = await q.query(`insert into feture.support_ticket (account_id, topic) values ($1, $2) returning *`, [account.id, input.topic]);
    await q.query(`insert into feture.support_message (ticket_id, body) values ($1, $2)`, [t.id, input.body]);
    return { ticket: ticketDto(t, await threads(q, [t.id])) };
  },

  async 'support.mine'(q, { account }) {
    const rows = await q.query(`select * from feture.support_ticket where account_id = $1 order by updated_at desc limit 50`, [account.id]);
    const msgs = await threads(q, rows.map(r => r.id));
    return { tickets: rows.map(r => ticketDto(r, msgs)) };
  },

  async 'support.reply'(q, { account, input }) {
    const [t] = await q.query(`select * from feture.support_ticket where id = $1 and account_id = $2 for update`, [input.ticketId, account.id]);
    if (!t) fail(404, 'not_found');
    if (t.state === 'closed') fail(409, 'conflict', { state: 'closed' });
    await q.query(`insert into feture.support_message (ticket_id, body) values ($1, $2)`, [t.id, input.body]);
    const [u] = await q.query(`update feture.support_ticket set state = 'open', updated_at = now() where id = $1 returning *`, [t.id]);
    return { ticket: ticketDto(u, await threads(q, [t.id])) };
  },

  async 'staff.supportQueue'(q, { account, input }) {
    await requireStaff(q, account, SUPPORT_ROLES);
    const rows = await q.query(
      `select t.*, p.handle from feture.support_ticket t join feture.account a on a.id = t.account_id
       left join feture.profile p on p.id = a.person_profile_id
       where t.state = $1 and t.account_id <> $2 order by t.updated_at ${input.state === 'open' ? 'asc' : 'desc'} limit $3`,
      [input.state, account.id, input.limit]);
    const msgs = await threads(q, rows.map(r => r.id));
    return { items: rows.map(r => ({ ...ticketDto(r, msgs), handle: r.handle ?? null })) };
  },

  async 'staff.supportReply'(q, { account, input }) {
    await requireStaff(q, account, SUPPORT_ROLES);
    const [t] = await q.query(`select t.*, a.person_profile_id from feture.support_ticket t join feture.account a on a.id = t.account_id where t.id = $1 for update of t`, [input.ticketId]);
    if (!t) fail(404, 'not_found');
    if (t.account_id === account.id) fail(403, 'forbidden'); // never one's own ticket
    if (t.state === 'closed') fail(409, 'conflict', { state: 'closed' });
    if (input.body) await q.query(`insert into feture.support_message (ticket_id, from_staff, staff_account_id, body) values ($1, true, $2, $3)`, [t.id, account.id, input.body]);
    const state = input.close ? 'closed' : 'answered';
    await q.query(`update feture.support_ticket set state = $2, updated_at = now() where id = $1`, [t.id, state]);
    if (input.body) await enqueue(q, 'support.replied', t.person_profile_id, { for: t.account_id, ticketId: t.id, state });
    await journal(q, account.id, input.close ? 'support.close' : 'support.reply', 'support_ticket', t.id, { replied: !!input.body });
    return { state };
  },

  async 'platform.maintenance'(q) {
    const [m] = await q.query(`select active, message, updated_at from feture.maintenance limit 1`);
    return { active: !!m?.active, message: m?.active ? m.message ?? null : null };
  },

  async 'staff.maintenanceSet'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead']);
    await q.query(`update feture.maintenance set active = $1, message = $2, updated_by = $3, updated_at = now()`,
      [input.active, input.active ? input.message || null : null, account.id]);
    await journal(q, account.id, input.active ? 'maintenance.on' : 'maintenance.off', 'platform', null, { message: input.message ?? null });
    return { active: input.active, message: input.active ? input.message || null : null };
  },
};

/** @type {Record<string, Command>} */
export const support = Object.fromEntries(
  Object.entries(supportCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
