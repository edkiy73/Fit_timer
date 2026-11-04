// @ts-check
/** SQL pieces of product rules that several commands share (feed and communities, posts and people lists), kept in
 * one place so the same rule never drifts between two copies. Each returns an SQL expression; the arguments are SQL
 * names or `$n` parameters, never values typed by a person. */
import { qaProfile } from './profiles.mjs';

/** e2e persona content (owner 28.10.2026): a profile of a persona account (feture.account.qa) is hidden from every
 * viewer who is not one. The database applies it everywhere through feture.blocked() → feture.qa_hidden()
 * (20261028240000_fe_qa_hidden.sql); this copy is for the few places that turn a block into a visible stub (a reply
 * shown as «скрыто») or a count, where persona content must vanish instead.
 * @param {string} owner profile id expression @param {string} viewer the viewer's profile id (`$n`) */
export const qaHidden = (owner, viewer) => `(${qaProfile(owner)} and not ${qaProfile(viewer)})`;

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
export const acceptsMention = (target, author) => `(${target}.kind in ('person', 'couple') and ${target}.state = 'active' and ${target}.id <> ${author}
  and not feture.blocked(${author}, ${target}.id)
  and coalesce((select s.mentions_from = 'all' or (s.mentions_from = 'follow' and exists (select 1 from feture.follow f where f.follower_profile_id = ${target}.id and f.target_profile_id = ${author}))
                from feture.profile_settings s where s.profile_id = ${target}.id), false))`;

/** Whether a cancelled event still concerns the viewer (owner, 28.10.2026): the organizer, and people who had a relation
 * to it — «Интересно» / «Иду», an application (waiting, approved, or closed by the cancel) or saved it. «Не иду» is no
 * relation. Such people keep seeing it with «Отменено» and the reason in the catalogue, «Скоро» and «Мои события» until
 * its original start; everyone else never sees it in lists (a direct link still opens the cancelled page). A couple's
 * relation is the couple profile's own. The same people are notified of the cancel (notify.mjs).
 * @param {string} e event alias @param {string} viewer the viewer's profile id (`$n`) */
export const cancelledFor = (e, viewer) => `(${e}.organizer_profile_id = ${viewer}
  or exists (select 1 from feture.event_rsvp r where r.event_id = ${e}.id and r.profile_id = ${viewer} and r.status in ('interested', 'going'))
  or exists (select 1 from feture.event_application x where x.event_id = ${e}.id and x.profile_id = ${viewer} and x.state in ('pending', 'approved', 'closed'))
  or exists (select 1 from feture.saved_item s where s.kind = 'event' and s.target_id = ${e}.id::text and s.profile_id = ${viewer}
             and not exists (select 1 from feture.event_rsvp r where r.event_id = ${e}.id and r.profile_id = ${viewer} and r.status = 'not_going')))`;

/** An event as lists show it: published and not over yet, or cancelled, still before its original start, for the people
 * it concerns (`cancelledFor`). Callers add `feture.event_visible`. @param {string} e event alias @param {string} viewer (`$n`) */
export const listedEvent = (e, viewer) => `(${e}.state = 'published' and ${e}.ends_at > now()
  or ${e}.state = 'cancelled' and ${e}.starts_at > now() and ${cancelledFor(e, viewer)})`;

/** Message requests (owner 29.10.2026): a conversation `c` is, for the member row `cm`, a request someone else sent
 * that is not answered yet (waiting, hidden or reported). Such a row is not a chat of the recipient: it lives in
 * «Запросы» while waiting and is gone once hidden or reported; it never counts as unread or as a new match.
 * @param {string} c conversation alias @param {string} cm conversation_member alias */
export const incomingRequest = (c, cm) => `(${c}.origin = 'request' and ${c}.request_state <> 'accepted' and ${cm}.profile_id is distinct from ${c}.request_from)`;

/** `person` (a person profile id) is a partner of `account`: both in one couple, active or paused (audit 04.11.2026
 * item 42 — a partner is never blocked; a stopped couple is ended in its settings instead).
 * @param {string} person profile id expression @param {string} account the acting account id (`$n`) */
export const partnerOf = (person, account) => `exists (select 1 from feture.account pa
  join feture.profile_member pm on pm.account_id = pa.id and pm.profile_kind = 'couple' and pm.state = 'active'
  join feture.profile pc on pc.id = pm.profile_id and pc.state in ('active', 'paused', 'suspended')
  join feture.profile_member mm on mm.profile_id = pc.id and mm.account_id = ${account} and mm.state = 'active'
  where pa.person_profile_id = ${person} and pa.id <> ${account})`;

/** «Своё» for staff (audit 04.11.2026 item 7): a profile the staff `account` acts as (its own, its couple) or a partner's
 * personal profile — staff never review, decide or count it. The owner's exception stays where it is: pass NULL as the
 * account and nothing is «своё».
 * @param {string} profile profile id expression @param {string} account the staff account id (`$n`, may be NULL) */
export const staffOwn = (profile, account) => `(exists (select 1 from feture.profile_member so where so.profile_id = ${profile} and so.account_id = ${account})
  or ${partnerOf(profile, account)})`;

/** The same for an account-level item (an age or photo check): the staff account itself or a partner's account.
 * @param {string} other account id expression @param {string} account the staff account id (`$n`, may be NULL) */
export const staffOwnAccount = (other, account) => `(${other} = ${account} or exists (select 1 from feture.profile_member sx
  join feture.profile sc on sc.id = sx.profile_id and sc.kind = 'couple' and sc.state in ('active', 'paused', 'suspended')
  join feture.profile_member sy on sy.profile_id = sx.profile_id and sy.account_id = ${account} and sy.state = 'active'
  where sx.account_id = ${other} and sx.state = 'active'))`;
