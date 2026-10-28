// @ts-check
/** SQL pieces of product rules that several commands share (feed and communities, posts and people lists), kept in
 * one place so the same rule never drifts between two copies. Each returns an SQL expression; the arguments are SQL
 * names or `$n` parameters, never values typed by a person. */

/** «Популярное» (owner, 28.10.2026 — «как лучше для продукта»): discussed beats loud. People who replied weigh most,
 * then replies, likes a little: 3 × distinct repliers + 1 × replies + 0.5 × likes. The author's own replies and like
 * do not count, nor replies and likes of people blocked either way with the viewer. A gentle decay halves the score every four
 * days, so a lively post of yesterday passes a quiet one of today but a week-old one fades. Callers keep the 7-day
 * window and their visibility rules (feture.post_visible, hidden, hard limits, a host's «не в Популярном»).
 * @param {string} p post alias @param {string} viewer the viewer's profile id (`$n`) */
export const popularScore = (p, viewer) => `(
  (select 3 * count(distinct r.author_profile_id) + count(*) from feture.reply r
    where r.post_id = ${p}.id and r.state = 'published' and r.author_profile_id <> ${p}.owner_profile_id and not feture.blocked(${viewer}, r.author_profile_id))
  + 0.5 * (select count(*) from feture.reaction x where x.target_type = 'post' and x.target_id = ${p}.id and x.profile_id <> ${p}.owner_profile_id
      and not feture.blocked(${viewer}, x.profile_id))
) * power(0.5, extract(epoch from now() - ${p}.published_at) / 345600.0)`;

/** Whether `target` (a profile) takes mentions from `author` («Кто может упоминать»): people only, active, not the
 * author, not blocked either way, and their setting allows it — everyone, or only people they follow.
 * Used where the mention is written (only these become links and notify) and in the lists the mention picker shows.
 * @param {string} target profile alias with `kind`, `state`, `id` @param {string} author the author's profile id (`$n`) */
export const acceptsMention = (target, author) => `(${target}.kind = 'person' and ${target}.state = 'active' and ${target}.id <> ${author}
  and not feture.blocked(${author}, ${target}.id)
  and coalesce((select s.mentions_from = 'all' or (s.mentions_from = 'follow' and exists (select 1 from feture.follow f where f.follower_profile_id = ${target}.id and f.target_profile_id = ${author}))
                from feture.profile_settings s where s.profile_id = ${target}.id), false))`;
