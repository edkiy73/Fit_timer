// @ts-check
import { dsaCommands, noticeInput } from '../../contracts/dsa.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';

/** S4 steps 5–6 (S4-MODERATION §6–7). Anyone, with or without an account, can send a notice about illegal content
 * (DSA art. 16): where it is, why, and an address to be answered at (not needed for child abuse). Staff look at it,
 * act with the usual tools and record the outcome; the sender gets an answer by email with the outcome and, for a
 * removal, the rule (art. 16(5)). Notices of child abuse go first. The transparency figures (art. 15) are counts and
 * times only, never people.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q @typedef {import('../db.mjs').Db} Db
 * @typedef {import('../outbox.mjs').OutboxItem} OutboxItem
 * @typedef {(mail: {to: string, subject: string, text: string}) => Promise<unknown>} Mailer
 */

const PRIORITY = `case reason when 'csam' then 0 when 'minors' then 1 when 'threats' then 2 when 'private_material' then 3 else 5 end`;
const REPLY = {
  ru: {
    subject: 'Ваше уведомление о контенте — FetUre',
    removed: (/** @type {string} */ rule) => `Спасибо за уведомление. Мы проверили материал и удалили его по правилу «${rule}».`,
    kept: () => 'Спасибо за уведомление. Мы проверили материал и не нашли нарушения закона или наших правил, поэтому он остаётся.',
    not_actionable: () => 'Спасибо за уведомление. По указанной ссылке мы не смогли найти материал или понять, о чём речь. Если нужно, пришлите уведомление ещё раз с подробностями.',
    footer: 'Если вы не согласны с решением, ответьте на это письмо — уведомление рассмотрит другой сотрудник.',
  },
  en: {
    subject: 'Your notice about content — FetUre',
    removed: (/** @type {string} */ rule) => `Thank you for your notice. We reviewed the material and removed it under the rule "${rule}".`,
    kept: () => 'Thank you for your notice. We reviewed the material and found no breach of the law or our rules, so it stays.',
    not_actionable: () => 'Thank you for your notice. We could not find the material at the link given or understand the concern. If needed, please send a new notice with more detail.',
    footer: 'If you disagree with the decision, reply to this email and another member of staff will look at the notice.',
  },
};

/** Takes a notice from the public form. Answers the same way whatever happens next, so the form tells nothing about
 * the content or the people involved. @param {Db} db @param {unknown} body @returns {Promise<{status: number, body: object}>} */
export async function takeNotice(db, body) {
  const parsed = noticeInput.safeParse(body);
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid_input', fields: [...new Set(parsed.error.issues.map(i => i.path.join('.')))] } };
  const n = parsed.data;
  await db.tx(async q => {
    const [row] = await q.query(
      `insert into feture.dsa_notice (target_url, reason, explanation, sender_name, sender_email, locale) values ($1, $2, $3, $4, $5, $6) returning id`,
      [n.targetUrl, n.reason, n.explanation, n.senderName ?? null, n.senderEmail ?? null, n.locale]);
    await enqueue(q, 'moderation.notice', null, { noticeId: row.id, reason: n.reason });
  });
  return { status: 200, body: { ok: true, received: true } };
}

/** Answers the sender once the outcome is recorded (and only once). @param {Db} db @param {Mailer | null} mailer */
export function noticeHandlers(db, mailer) {
  return {
    'notice.decided': async (/** @type {OutboxItem} */ item) => {
      const [n] = await db.query(
        `select id, sender_email, locale, outcome, rule, replied_at from feture.dsa_notice where id = $1`, [/** @type {any} */ (item.payload).noticeId]);
      if (!n || !n.sender_email || n.replied_at || !n.outcome) return;
      if (!mailer) throw new Error('mail_unavailable'); // retried later; parked after 10 attempts
      const t = REPLY[/** @type {'ru' | 'en'} */ (n.locale)] ?? REPLY.en;
      const line = n.outcome === 'removed' ? t.removed(n.rule ?? '') : n.outcome === 'kept' ? t.kept() : t.not_actionable();
      await mailer({ to: n.sender_email, subject: t.subject, text: `${line}\n\n${t.footer}` });
      await db.query('update feture.dsa_notice set replied_at = now() where id = $1 and replied_at is null', [n.id]);
    },
  };
}

/** Addresses of senders go a year after the decision. @param {Db} db */
export async function sweepNotices(db) {
  if (!(await db.query(`select to_regclass('feture.dsa_notice') is not null ok`))[0].ok) return 0;
  return (await db.query(
    `update feture.dsa_notice set sender_email = null, sender_name = null where state = 'decided' and decided_at < now() - interval '1 year' and sender_email is not null returning 1`)).length;
}

/** @type {Record<keyof typeof dsaCommands, Command['run']>} */
const run = {
  async 'staff.noticeQueue'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'moderator']);
    // The sender's address stays out of the queue; staff act on the content, the answer goes by itself.
    const items = await q.query(
      `select id, target_url, reason, explanation, created_at, sender_email is not null answerable
       from feture.dsa_notice where state = 'open' order by ${PRIORITY}, created_at limit $1`, [input.limit]);
    return { items };
  },

  async 'staff.noticeDecide'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'moderator']);
    const rows = await q.query(
      `update feture.dsa_notice set state = 'decided', outcome = $2, rule = $3, decided_by = $4, decided_at = now()
       where id = $1 and state = 'open' returning id`, [input.noticeId, input.outcome, input.rule ?? null, account.id]);
    if (!rows[0]) fail(409, 'conflict');
    await enqueue(q, 'notice.decided', null, { noticeId: input.noticeId });
    await journal(q, account.id, 'notice.' + input.outcome, 'notice', input.noticeId, { rule: input.rule ?? null, note: input.note });
    return { outcome: input.outcome };
  },

  async 'staff.transparency'(q, { account, input }) {
    // For the transparency report: numbers and median times only (art. 15).
    await requireStaff(q, account.id, ['owner', 'lead', 'auditor']);
    const range = [input.from, input.to];
    const by = (/** @type {string} */ sql) => q.query(sql, range);
    return {
      period: { from: input.from, to: input.to },
      reports: await by(
        `select reason, count(*)::int received, count(*) filter (where resolution = 'removed')::int removed, count(*) filter (where resolution = 'kept')::int kept,
           percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at) / 3600) filter (where resolved_at is not null) median_hours
         from feture.report where created_at >= $1::date and created_at < $2::date + 1 group by reason order by reason`),
      notices: await by(
        `select reason, count(*)::int received, count(*) filter (where outcome = 'removed')::int removed, count(*) filter (where outcome = 'kept')::int kept,
           count(*) filter (where outcome = 'not_actionable')::int not_actionable,
           percentile_cont(0.5) within group (order by extract(epoch from decided_at - created_at) / 3600) filter (where decided_at is not null) median_hours
         from feture.dsa_notice where created_at >= $1::date and created_at < $2::date + 1 group by reason order by reason`),
      decisions: await by(
        `select action, count(*)::int n from feture.staff_action
         where created_at >= $1::date and created_at < $2::date + 1 and action not in ('media.view', 'age.view') group by action order by action`),
      appeals: await by(
        `select target_type, count(*)::int received, count(*) filter (where state = 'granted')::int granted, count(*) filter (where state = 'denied')::int denied
         from feture.appeal where created_at >= $1::date and created_at < $2::date + 1 group by target_type order by target_type`),
    };
  },
};

/** @type {Record<string, Command>} */
export const dsa = Object.fromEntries(
  Object.entries(dsaCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
