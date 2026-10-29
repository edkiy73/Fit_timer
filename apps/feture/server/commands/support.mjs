// @ts-check
import { helpInput, supportCommands } from '../../contracts/support.mjs';
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

/** Takes a message from the public help form (a person who cannot sign in). Stores it and queues a mail to the support
 * address; answers the same way whatever happens next. @param {import('../db.mjs').Db} db @param {unknown} body
 * @returns {Promise<{status: number, body: object}>} */
export async function takeHelp(db, body) {
  const parsed = helpInput.safeParse(body);
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid_input', fields: [...new Set(parsed.error.issues.map(i => i.path.join('.')))] } };
  const m = parsed.data;
  await db.tx(async q => {
    const [row] = await q.query(`insert into feture.support_public (body, contact, locale) values ($1, $2, $3) returning id::text`, [m.body, m.contact ?? null, m.locale]);
    await enqueue(q, 'support.public', null, { helpId: row.id });
  });
  return { status: 200, body: { ok: true, received: true } };
}

/** Mails each public help message once to the support address (claimed before sending, released if sending fails).
 * Without working mail there is no handler: messages wait in the queue. @param {import('../db.mjs').Db} db
 * @param {((mail: {to: string, subject: string, text: string}) => Promise<unknown>) | null} mailer @param {string} to
 * @returns {Record<string, (item: import('../outbox.mjs').OutboxItem) => Promise<void>>} */
export function helpHandlers(db, mailer, to) {
  if (!mailer) return {};
  return {
    'support.public': async (/** @type {import('../outbox.mjs').OutboxItem} */ item) => {
      const id = /** @type {any} */ (item.payload).helpId;
      const [m] = await db.query(`update feture.support_public set mailed_at = now() where id = $1 and mailed_at is null returning body, contact, locale`, [id]);
      if (!m) return;
      try {
        await Promise.race([mailer({ to, subject: 'FetUre: помощь со входом', text: `${m.body}\n\n— Как ответить: ${m.contact ?? 'не указано'}\n— Язык: ${m.locale}` }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('mail_timeout')), 15_000))]);
      } catch (error) {
        await db.query('update feture.support_public set mailed_at = null where id = $1', [id]);
        throw error;
      }
    },
  };
}

/** Public help messages are deleted after 90 days. @param {import('../db.mjs').Db} db */
export async function sweepPublicHelp(db) {
  if (!(await db.query(`select to_regclass('feture.support_public') is not null ok`))[0].ok) return 0;
  return (await db.query(`delete from feture.support_public where created_at < now() - interval '90 days' returning 1`)).length;
}
