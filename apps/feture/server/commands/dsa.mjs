// @ts-check
import { dsaCommands, noticeInput } from '../../contracts/dsa.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';
import { pageInfo, plainRows, queuePageSql } from '../queue-page.mjs';

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

/** Sort keys: severity (lower first), then the notice's creation time and id. */
const NOTICE_KEYS = [{ name: 'prio', type: 'int', dir: 'asc' }, { name: 'created_at', type: 'timestamptz' }, { name: 'id', type: 'uuid', dir: 'asc' }];
const RULES = {
  ru: { minors: 'защита несовершеннолетних', threats: 'угрозы и шантаж', private_material: 'чужие приватные материалы', spam: 'спам', illegal: 'незаконный контент', community_rules: 'правила сообщества', ip: 'нарушение авторских прав' },
  en: { minors: 'protection of minors', threats: 'threats and blackmail', private_material: "other people's private material", spam: 'spam', illegal: 'illegal content', community_rules: 'community rules', ip: 'copyright infringement' },
};
const REPLY = {
  ru: {
    subject: 'Ваше уведомление о контенте — FetUre',
    removed: (/** @type {string} */ rule) => `Спасибо за уведомление. Мы проверили материал и удалили его: ${rule}.`,
    kept: () => 'Спасибо за уведомление. Мы проверили материал и не нашли нарушения закона или наших правил, поэтому он остаётся.',
    not_actionable: () => 'Спасибо за уведомление. По указанной ссылке мы не смогли найти материал или понять, о чём речь.',
    footer: 'Если вы не согласны с решением или можете добавить подробности, отправьте новое уведомление через ту же форму — его рассмотрит другой сотрудник. Вы также можете обратиться в компетентный орган или суд своей страны.',
  },
  en: {
    subject: 'Your notice about content — FetUre',
    removed: (/** @type {string} */ rule) => `Thank you for your notice. We reviewed the material and removed it: ${rule}.`,
    kept: () => 'Thank you for your notice. We reviewed the material and found no breach of the law or our rules, so it stays.',
    not_actionable: () => 'Thank you for your notice. We could not find the material at the link given or understand the concern.',
    footer: 'If you disagree with the decision or can add detail, send a new notice through the same form and another member of staff will look at it. You may also turn to the competent authority or a court in your country.',
  },
};
const SEND_TIMEOUT_MS = 15_000;

/** Takes a notice from the public form. Answers the same way whatever happens next, so the form tells nothing about
 * the content or the people involved. @param {Db} db @param {unknown} body @returns {Promise<{status: number, body: object}>} */
export async function takeNotice(db, body) {
  const parsed = noticeInput.safeParse(body);
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid_input', fields: [...new Set(parsed.error.issues.map(i => i.path.join('.')))] } };
  const n = parsed.data;
  // The staff queue reads the table itself; nothing is queued for public traffic.
  await db.query(
    `insert into feture.dsa_notice (target_url, reason, explanation, sender_name, sender_email, locale) values ($1, $2, $3, $4, $5, $6)`,
    [new URL(n.targetUrl).href, n.reason, n.explanation, n.senderName ?? null, n.senderEmail?.toLowerCase() ?? null, n.locale]);
  return { status: 200, body: { ok: true, received: true } };
}

/** Answers the sender once the outcome is recorded, and only once: the reply is claimed before it is sent (a retried or
 * re-claimed item finds it taken) and released only when sending failed. Without working mail there is no handler, so
 * decided items wait in the queue until mail is set up instead of being given up.
 * @param {Db} db @param {Mailer | null} mailer @returns {Record<string, (item: OutboxItem) => Promise<void>>} */
export function noticeHandlers(db, mailer) {
  if (!mailer) return {};
  return {
    'notice.decided': async (/** @type {OutboxItem} */ item) => {
      const id = /** @type {any} */ (item.payload).noticeId;
      const [n] = await db.query(
        `update feture.dsa_notice set replied_at = now() where id = $1 and replied_at is null and outcome is not null and sender_email is not null
         returning sender_email, locale, outcome, rule`, [id]);
      if (!n) return;
      const lang = /** @type {'ru' | 'en'} */ (n.locale === 'ru' ? 'ru' : 'en');
      const t = REPLY[lang];
      const rule = RULES[lang][/** @type {keyof typeof RULES['en']} */ (n.rule)] ?? RULES[lang].illegal;
      const body = n.outcome === 'removed' ? t.removed(rule) : n.outcome === 'kept' ? t.kept() : t.not_actionable();
      try {
        await Promise.race([mailer({ to: n.sender_email, subject: t.subject, text: `${body}\n\n${t.footer}` }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('mail_timeout')), SEND_TIMEOUT_MS))]);
      } catch (error) {
        await db.query('update feture.dsa_notice set replied_at = null where id = $1', [id]);
        throw error;
      }
    },
  };
}

/** Addresses of senders go a year after the decision. @param {Db} db */
export async function sweepNotices(db) {
  if (!(await db.query(`select to_regclass('feture.dsa_notice') is not null ok`))[0].ok) return 0;
  const cleared = await db.query(
    `update feture.dsa_notice set sender_email = null, sender_name = null where state = 'decided' and decided_at < now() - interval '1 year' and (sender_email is not null or sender_name is not null) returning 1`);
  // Notices themselves (their text may name people) go after two years; the transparency figures are made by then.
  await db.query(`delete from feture.dsa_notice where created_at < now() - interval '2 years'`);
  return cleared.length;
}

/** @type {Record<keyof typeof dsaCommands, Command['run']>} */
const run = {
  async 'staff.noticeQueue'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead', 'moderator']);
    // The sender's address stays out of the queue; staff act on the content, the answer goes by itself.
    // Severity first (CSAM above the rest), then the reader's date order.
    const { sql, params } = queuePageSql(input, NOTICE_KEYS,
      `select id, target_url, reason, explanation, created_at, sender_email is not null answerable, (${PRIORITY})::int prio
       from feture.dsa_notice where state = 'open'`, []);
    const rows = await q.query(sql, params);
    return { items: plainRows(rows), ...pageInfo(rows, NOTICE_KEYS, input.limit) };
  },

  async 'staff.noticeDecide'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead', 'moderator']);
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
    await requireStaff(q, account, ['owner', 'lead', 'auditor']);
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
         where created_at >= $1::date and created_at < $2::date + 1
           and action ~ '^(report|media|revision|sanction|restrict|community|event|notice|appeal|dispute)[.]' and action not like '%.view'
         group by action order by action`),
      appeals: await by(
        `select target_type, count(*)::int received, count(*) filter (where state = 'granted')::int granted, count(*) filter (where state = 'denied')::int denied
         from feture.appeal where created_at >= $1::date and created_at < $2::date + 1 group by target_type order by target_type`),
    };
  },
};

/** @type {Record<string, Command>} */
export const dsa = Object.fromEntries(
  Object.entries(dsaCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
