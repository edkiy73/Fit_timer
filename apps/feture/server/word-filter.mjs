// @ts-check
/** The word filter (moderation plan stage 5, owner 05.11.2026): a text with a listed word is not held back; it goes to
 * the report queue as an automatic report («Автофильтр»), once per open item.
 * @typedef {import('./db.mjs').Q} Q */

/** Files an automatic report when `text` has a listed word (whole words, any case). Quiet when the filter is empty or
 * not there yet. @param {Q} q @param {string} targetType @param {string} targetId @param {string | null | undefined} text
 * @param {string | null} [_owner] whose text it is (kept for the callers' clarity) */
export async function checkWords(q, targetType, targetId, text, _owner = null) {
  if (!text || !text.trim()) return [];
  const [{ ok }] = await q.query(`select to_regclass('feture.word_filter') is not null ok`);
  if (!ok) return [];
  const hits = (await q.query(`select word from feture.word_filter where lower($1) ~ ('\\m' || word || '\\M') order by word limit 10`, [text])).map(r => r.word);
  if (!hits.length) return [];
  await q.query(
    // In the same queue card as people's reports on it (reported_profile_id names a side for chats only).
    `insert into feture.report (target_type, target_id, reason, details, auto)
     select $1, $2, 'other', $3, 'words'
     where not exists (select 1 from feture.report where target_type = $1 and target_id = $2 and state = 'open' and auto = 'words')`,
    [targetType, targetId, ('Автофильтр: ' + hits.join(', ')).slice(0, 500)]);
  return hits;
}
